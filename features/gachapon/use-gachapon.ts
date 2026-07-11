import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { Buffer } from 'buffer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { DELEGATION_PROGRAM_ID } from '@magicblock-labs/ephemeral-rollups-sdk'
import {
  CoreAssetAccount,
  DEFAULT_VRF_QUEUE,
  ER_DEVNET_RPC_URL,
  GachaponAccounts,
  MachineAccount,
  PendingPullAccount,
  PROGRAM_ID,
  BUYBACK_PAYOUT_USDC_UNITS,
  DEVNET_USDC_MINT,
  PACK_PRICE_USDC,
  PACK_PRICE_USDC_UNITS,
  REWARDS,
  USDC_DECIMALS,
  VRF_PROGRAM_ID,
  buildClaimAssetInstruction,
  buildCommitGachaStateInstruction,
  buildCreateAssociatedTokenAccountInstruction,
  buildDelegateMachineInstruction,
  buildDelegatePendingPullInstruction,
  buildInitInstruction,
  buildDelegateInventoryInstruction,
  buildInitializeInventoryInstruction,
  buildInstantBuybackInstruction,
  buildPreparePaidPullInstruction,
  buildPreparePullInstruction,
  buildPullInstruction,
  buildUploadConfigInstruction,
  decodeCoreAsset,
  decodeMachine,
  decodePendingPull,
  erDevnetConnection,
  findAssociatedTokenAddress,
  findGachaponAccounts,
  findInventoryAddress,
  isSettled,
} from '@/lib/gachapon-client'

export type PullStage =
  'idle' | 'preparing' | 'signing' | 'activating' | 'requesting' | 'settling' | 'syncing' | 'revealed' | 'error'

export type InventoryItem = {
  accounts: GachaponAccounts
  pull: PendingPullAccount
  asset: CoreAssetAccount
  reward: (typeof REWARDS)[number]
  proof?: StoredPullProof
}

export type WalletMode = 'external' | 'devnet-test' | null

export type PullProof = {
  paymentSignature: string | null
  prepareSignature: string | null
  erPullSignature: string | null
  erCommitSignature: string | null
  claimSignature: string | null
}

export type StoredPullProof = PullProof & {
  asset: string
  inventory: string
  machine: string
  pendingPull: string
  pullId: string
  rewardId: number
  programId: string
  vrfProgram: string
  vrfQueue: string
  erRpc: string
  paymentMint: string
  paymentAmount: string
  paymentTreasury: string
  buybackSignature?: string | null
  buybackAmount?: string | null
  recordedAt: number
}

type PendingPullAttempt = {
  wallet: string
  machineId: string
  pullId: string
  proof: PullProof
  updatedAt: number
}

const SETTLEMENT_TIMEOUT_MS = 60_000
const BASE_COMMIT_RETRY_AFTER_MS = 45_000
const BASE_COMMIT_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 1_500
const TX_CONFIRM_TIMEOUT_MS = 18_000
const DEV_WALLET_STORAGE_KEY = 'capsule.devnet.keypair'
const PULL_PROOFS_STORAGE_KEY = 'capsule.pull.proofs'
const PENDING_PULL_STORAGE_KEY = 'capsule.pending.pull'

export function useGachapon() {
  const { account, connect, disconnect, connection, signAndSendTransaction, signTransaction } = useMobileWallet()
  const erConnection = useMemo(() => erDevnetConnection(), [])
  const [devWallet, setDevWallet] = useState<Keypair | null>(null)
  const [isDevWalletLoading, setIsDevWalletLoading] = useState(false)
  const [machine, setMachine] = useState<MachineAccount | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [stage, setStage] = useState<PullStage>('idle')
  const [activeAccounts, setActiveAccounts] = useState<GachaponAccounts | null>(null)
  const [revealedItem, setRevealedItem] = useState<InventoryItem | null>(null)
  const [lastSignature, setLastSignature] = useState<string | null>(null)
  const [proof, setProof] = useState<PullProof>({
    paymentSignature: null,
    prepareSignature: null,
    erPullSignature: null,
    erCommitSignature: null,
    claimSignature: null,
  })
  const [error, setError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [erReady, setErReady] = useState(false)
  const [isBuyingBack, setIsBuyingBack] = useState(false)
  const refreshRef = useRef<(() => Promise<void>) | null>(null)

  const publicKey = useMemo(() => {
    if (account?.address) return new PublicKey(account.address)
    return devWallet?.publicKey ?? null
  }, [account?.address, devWallet?.publicKey])
  const publicKeyBase58 = publicKey?.toBase58() ?? null
  const walletMode: WalletMode = account ? 'external' : devWallet ? 'devnet-test' : null
  const isBusy = !['idle', 'revealed', 'error'].includes(stage)

  useEffect(() => {
    let isMounted = true
    void AsyncStorage.getItem(DEV_WALLET_STORAGE_KEY)
      .then((stored) => {
        if (!stored || !isMounted) return
        setDevWallet(Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored))))
      })
      .catch(() => undefined)
    return () => {
      isMounted = false
    }
  }, [])

  const connectDevWallet = useCallback(async () => {
    setError(null)
    setIsDevWalletLoading(true)
    try {
      const stored = await AsyncStorage.getItem(DEV_WALLET_STORAGE_KEY)
      const nextWallet = stored ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored))) : Keypair.generate()
      if (!stored) {
        await AsyncStorage.setItem(DEV_WALLET_STORAGE_KEY, JSON.stringify(Array.from(nextWallet.secretKey)))
      }
      setDevWallet(nextWallet)

      const lamports = await connection.getBalance(nextWallet.publicKey, 'confirmed')
      if (lamports < 100_000_000) {
        const signature = await connection.requestAirdrop(nextWallet.publicKey, 1_000_000_000)
        await connection.confirmTransaction(signature, 'confirmed')
      }
    } catch (cause) {
      setError(toUserMessage(cause))
      setStage('error')
    } finally {
      setIsDevWalletLoading(false)
    }
  }, [connection])

  const disconnectWallet = useCallback(async () => {
    if (account) {
      await disconnect()
      return
    }
    setDevWallet(null)
    setMachine(null)
    setInventory([])
    setBalance(null)
    setErReady(false)
  }, [account, disconnect])

  const sendInstructions = useCallback(
    async (instructions: TransactionInstruction[]) => {
      if (!publicKey) throw new Error('Connect a wallet first')

      const latest = await connection.getLatestBlockhashAndContext('confirmed')
      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash: latest.value.blockhash,
        lastValidBlockHeight: latest.value.lastValidBlockHeight,
      }).add(...instructions)

      let signature: string
      if (devWallet) {
        transaction.sign(devWallet)
        signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 })
      } else {
        signature = await signAndSendTransaction(transaction, latest.context.slot)
      }
      await withTimeout(
        connection.confirmTransaction(
          {
            signature,
            blockhash: latest.value.blockhash,
            lastValidBlockHeight: latest.value.lastValidBlockHeight,
          },
          'confirmed',
        ),
        TX_CONFIRM_TIMEOUT_MS,
        'Solana confirmation is slow. Tap Open Pack again to resume; your paid pull is safe.',
      )
      setLastSignature(signature)
      return signature
    },
    [connection, devWallet, publicKey, signAndSendTransaction],
  )

  const sendErInstructions = useCallback(
    async (instructions: TransactionInstruction[]) => {
      if (!publicKey) throw new Error('Connect a wallet first')
      const latest = await erConnection.getLatestBlockhash('confirmed')
      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }).add(...instructions)
      if (devWallet) {
        transaction.sign(devWallet)
      } else {
        const signed = await signTransaction(transaction)
        transaction.signatures = signed.signatures
      }
      const signature = await erConnection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      })
      await withTimeout(
        erConnection.confirmTransaction(
          {
            signature,
            blockhash: latest.blockhash,
            lastValidBlockHeight: latest.lastValidBlockHeight,
          },
          'confirmed',
        ),
        TX_CONFIRM_TIMEOUT_MS,
        'MagicBlock confirmation is slow. Tap Open Pack again to resume; your pull is safe.',
      )
      return signature
    },
    [devWallet, erConnection, publicKey, signTransaction],
  )

  const loadInventory = useCallback(
    async (wallet: PublicKey, currentMachine: MachineAccount) => {
      const pullCount = Number(currentMachine.pullCount)
      if (pullCount === 0) {
        setInventory([])
        return []
      }

      const ids = Array.from({ length: Math.min(pullCount, 50) }, (_, index) => BigInt(pullCount - index))
      const accountSets = ids.map((pullId) => findGachaponAccounts(wallet, currentMachine.machineId, pullId))
      const addresses = accountSets.flatMap((accounts) => [accounts.pendingPull, accounts.asset])
      const infos = await connection.getMultipleAccountsInfo(addresses, 'confirmed')
      const proofMap = await readStoredProofs()
      const items: InventoryItem[] = []

      accountSets.forEach((accounts, index) => {
        const pullInfo = infos[index * 2]
        const assetInfo = infos[index * 2 + 1]
        if (!pullInfo || !assetInfo) return

        try {
          const pull = decodePendingPull(Buffer.from(pullInfo.data))
          const asset = decodeCoreAsset(Buffer.from(assetInfo.data))
          const reward = REWARDS[pull.rewardId]
          if (reward) {
            const assetAddress = accounts.asset.toString()
            items.push({ accounts, pull, asset, reward, proof: proofMap[assetAddress] })
          }
        } catch {
          // Ignore incomplete accounts while a VRF callback is still settling.
        }
      })

      setInventory(items)
      return items
    },
    [connection],
  )

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setMachine(null)
      setInventory([])
      setBalance(null)
      setErReady(false)
      return
    }

    const [lamports, baseAccounts] = await Promise.all([
      connection.getBalance(publicKey, 'confirmed'),
      Promise.resolve(findGachaponAccounts(publicKey)),
    ])
    setBalance(lamports / 1_000_000_000)
    const inventoryInfo = await connection.getAccountInfo(findInventoryAddress(publicKey), 'confirmed')
    setErReady(Boolean(inventoryInfo?.owner.equals(DELEGATION_PROGRAM_ID)))

    const [machineInfo, erMachineInfo] = await Promise.all([
      connection.getAccountInfo(baseAccounts.machine, 'confirmed'),
      erConnection.getAccountInfo(baseAccounts.machine, 'confirmed'),
    ])
    const readableMachineInfo = erMachineInfo ?? machineInfo
    if (!readableMachineInfo) {
      setMachine(null)
      setInventory([])
      return
    }

    const nextMachine = decodeMachine(Buffer.from(readableMachineInfo.data))
    setMachine(nextMachine)
    await loadInventory(publicKey, nextMachine)
  }, [connection, erConnection, loadInventory, publicKey])

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    void refresh().catch(() => undefined)
    // Refresh once when the active wallet address changes. The wallet provider
    // may return unstable helper objects, so depending on refresh can loop.
  }, [publicKeyBase58])

  useEffect(() => {
    const unsubscribeNetwork = NetInfo.addEventListener((state) => setIsOffline(state.isConnected === false))
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refreshRef.current?.().catch(() => undefined)
    })
    return () => {
      unsubscribeNetwork()
      appStateSubscription.remove()
    }
  }, [])

  const ensureMachine = useCallback(async () => {
    if (!publicKey) throw new Error('Connect a wallet first')

    setStage('preparing')
    const accounts = findGachaponAccounts(publicKey)
    let machineInfo = await connection.getAccountInfo(accounts.machine, 'confirmed')

    if (!machineInfo) {
      setStage('signing')
      await sendInstructions([
        buildInitInstruction(publicKey, accounts),
        buildUploadConfigInstruction(publicKey, accounts),
      ])
      machineInfo = await connection.getAccountInfo(accounts.machine, 'confirmed')
    }

    if (!machineInfo) throw new Error('Machine setup was not confirmed')

    if (!machineInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
      setStage('activating')
      await sendInstructions([buildDelegateMachineInstruction(publicKey, accounts)])
      machineInfo = await connection.getAccountInfo(accounts.machine, 'confirmed')
    }

    if (!machineInfo?.owner.equals(DELEGATION_PROGRAM_ID)) {
      throw new Error('MagicBlock machine delegation was not confirmed')
    }

    const startedAt = Date.now()
    let erMachineInfo = null
    while (Date.now() - startedAt < 20_000) {
      erMachineInfo = await erConnection.getAccountInfo(accounts.machine, 'confirmed')
      if (erMachineInfo) break
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }

    if (!erMachineInfo) throw new Error('MagicBlock is still activating the pack machine. Try again shortly.')

    let created = decodeMachine(Buffer.from(erMachineInfo.data))
    const hasCurrentSet = created.rewards.every((reward, index) => reward.name === REWARDS[index].name)
    if (!hasCurrentSet) {
      setStage('activating')
      await sendErInstructions([buildUploadConfigInstruction(publicKey, accounts)])
      const updatedInfo = await erConnection.getAccountInfo(accounts.machine, 'confirmed')
      if (!updatedInfo) throw new Error('VOIDDECK reward migration was not confirmed on MagicBlock')
      created = decodeMachine(Buffer.from(updatedInfo.data))
    }

    setMachine(created)
    return created
  }, [connection, erConnection, publicKey, sendErInstructions, sendInstructions])

  const ensureInventorySession = useCallback(async () => {
    if (!publicKey) throw new Error('Connect a wallet first')
    const inventory = findInventoryAddress(publicKey)
    let info = await connection.getAccountInfo(inventory, 'confirmed')

    if (!info) {
      setStage('activating')
      await sendInstructions([buildInitializeInventoryInstruction(publicKey)])
      info = await connection.getAccountInfo(inventory, 'confirmed')
    }

    if (info && !info.owner.equals(DELEGATION_PROGRAM_ID)) {
      setStage('activating')
      await sendInstructions([buildDelegateInventoryInstruction(publicKey)])
      info = await connection.getAccountInfo(inventory, 'confirmed')
    }

    if (!info?.owner.equals(DELEGATION_PROGRAM_ID)) {
      throw new Error('MagicBlock inventory delegation was not confirmed')
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt < 20_000) {
      if (await erConnection.getAccountInfo(inventory, 'confirmed')) {
        setErReady(true)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
    throw new Error('MagicBlock is still activating your inventory. Try again shortly.')
  }, [connection, erConnection, publicKey, sendInstructions])

  const executePackPayment = useCallback(
    async (accounts: GachaponAccounts) => {
      if (!publicKey) throw new Error('Connect a wallet first')

      const payerToken = findAssociatedTokenAddress(publicKey, DEVNET_USDC_MINT)
      const treasuryToken = findAssociatedTokenAddress(accounts.treasury, DEVNET_USDC_MINT)
      const payerInfo = await connection.getAccountInfo(payerToken, 'confirmed')

      if (!payerInfo) {
        throw new Error(
          `You need Devnet USDC before opening a pack. Fund ${publicKey.toBase58()} with standard Devnet USDC (${DEVNET_USDC_MINT.toBase58()}).`,
        )
      }

      const balance = await connection.getTokenAccountBalance(payerToken, 'confirmed')
      if (BigInt(balance.value.amount) < PACK_PRICE_USDC_UNITS) {
        throw new Error(
          `Not enough Devnet USDC. Pack price is ${PACK_PRICE_USDC} USDC; wallet has ${balance.value.uiAmountString ?? '0'} USDC.`,
        )
      }

      const instructions: TransactionInstruction[] = []
      const treasuryInfo = await connection.getAccountInfo(treasuryToken, 'confirmed')
      if (!treasuryInfo) {
        instructions.push(
          buildCreateAssociatedTokenAccountInstruction(publicKey, treasuryToken, accounts.treasury, DEVNET_USDC_MINT),
        )
      }

      instructions.push(buildPreparePaidPullInstruction(publicKey, accounts))

      return sendInstructions(instructions)
    },
    [connection, publicKey, sendInstructions],
  )

  const pollForErSettlement = useCallback(
    async (accounts: GachaponAccounts) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < SETTLEMENT_TIMEOUT_MS) {
        const pullInfo = await erConnection.getAccountInfo(accounts.pendingPull, 'confirmed')

        if (pullInfo) {
          const pull = decodePendingPull(Buffer.from(pullInfo.data))
          if (isSettled(pull)) {
            const reward = REWARDS[pull.rewardId]
            if (!reward) throw new Error('VRF returned an unknown reward')
            return { pull, reward }
          }
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      }
      throw new Error('The VRF callback is taking longer than expected. Your pull is safe; refresh shortly.')
    },
    [erConnection],
  )

  const pollForClaimedAsset = useCallback(
    async (accounts: GachaponAccounts, pull: PendingPullAccount) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < SETTLEMENT_TIMEOUT_MS) {
        const assetInfo = await connection.getAccountInfo(accounts.asset, 'confirmed')
        if (assetInfo) {
          const asset = decodeCoreAsset(Buffer.from(assetInfo.data))
          const reward = REWARDS[pull.rewardId]
          if (!reward) throw new Error('VRF returned an unknown reward')
          return { accounts, pull, asset, reward } satisfies InventoryItem
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      }
      throw new Error('The collectible claim is taking longer than expected. Refresh shortly.')
    },
    [connection],
  )

  const waitForBaseCommit = useCallback(
    async (accounts: GachaponAccounts, timeoutMs = BASE_COMMIT_TIMEOUT_MS) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        const pullInfo = await connection.getAccountInfo(accounts.pendingPull, 'confirmed')
        if (pullInfo) {
          const pull = decodePendingPull(Buffer.from(pullInfo.data))
          if (isSettled(pull)) return pull
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      }
      return null
    },
    [connection],
  )

  const findRecoverablePull = useCallback(
    async (currentMachine: MachineAccount) => {
      if (!publicKey) return null
      const pullCount = Number(currentMachine.pullCount)
      if (pullCount === 0) return null

      const oldest = Math.max(1, pullCount - 49)
      for (let id = pullCount; id >= oldest; id -= 1) {
        const accounts = findGachaponAccounts(publicKey, currentMachine.machineId, BigInt(id))
        const assetInfo = await connection.getAccountInfo(accounts.asset, 'confirmed')
        if (assetInfo) continue

        const erPullInfo = await erConnection.getAccountInfo(accounts.pendingPull, 'confirmed')
        if (!erPullInfo) continue

        const erPull = decodePendingPull(Buffer.from(erPullInfo.data))
        if (isSettled(erPull)) return { accounts, pull: erPull }
      }

      return null
    },
    [connection, erConnection, publicKey],
  )

  const completeSettledPull = useCallback(
    async (accounts: GachaponAccounts, settledPull: PendingPullAccount, signatures: PullProof) => {
      if (!publicKey) throw new Error('Connect a wallet first')
      setStage('syncing')
      let erCommitSignature = signatures.erCommitSignature
      let claimSignature = signatures.claimSignature
      let committedPull = await waitForBaseCommit(accounts, 2_000)

      if (!committedPull) {
        erCommitSignature = await sendErInstructions([buildCommitGachaStateInstruction(publicKey, accounts)])
        setProof((current) => ({ ...current, erCommitSignature }))
        await writePendingPullAttempt(publicKey, accounts, { ...signatures, erCommitSignature })
        committedPull = await waitForBaseCommit(accounts, BASE_COMMIT_RETRY_AFTER_MS)
      }

      if (!committedPull) {
        erCommitSignature = await sendErInstructions([buildCommitGachaStateInstruction(publicKey, accounts)])
        setProof((current) => ({ ...current, erCommitSignature }))
        await writePendingPullAttempt(publicKey, accounts, { ...signatures, erCommitSignature })
        committedPull = await waitForBaseCommit(accounts)
      }

      if (!committedPull) {
        throw new Error('MagicBlock commit is still finalizing. Tap Resume opening in a moment.')
      }

      let result: InventoryItem | null = null
      const existingAssetInfo = await connection.getAccountInfo(accounts.asset, 'confirmed')
      if (existingAssetInfo) {
        const asset = decodeCoreAsset(Buffer.from(existingAssetInfo.data))
        const reward = REWARDS[committedPull.rewardId]
        if (!reward) throw new Error('VRF returned an unknown reward')
        result = { accounts, pull: committedPull, asset, reward }
      } else {
        claimSignature = await sendInstructions([buildClaimAssetInstruction(publicKey, accounts)])
        await writePendingPullAttempt(publicKey, accounts, { ...signatures, erCommitSignature, claimSignature })
        result = await pollForClaimedAsset(accounts, committedPull)
      }

      const finalProof = {
        paymentSignature: signatures.paymentSignature,
        prepareSignature: signatures.prepareSignature,
        erPullSignature: signatures.erPullSignature,
        erCommitSignature,
        claimSignature,
      }
      setProof(finalProof)
      const storedProof = buildStoredProof(accounts, committedPull ?? settledPull, finalProof)
      await writeStoredProof(storedProof)
      await clearPendingPullAttempt()
      setRevealedItem({ ...result, proof: storedProof })
      setStage('revealed')
      await refresh()
    },
    [connection, pollForClaimedAsset, publicKey, refresh, sendErInstructions, sendInstructions, waitForBaseCommit],
  )

  const pull = useCallback(async () => {
    if (!publicKey) {
      await connect()
      return
    }
    if (isOffline) {
      setError('You are offline. Reconnect before starting a pull.')
      setStage('error')
      return
    }

    const resumeAttempt =
      activeAccounts && proof.erPullSignature && !proof.claimSignature
        ? { accounts: activeAccounts, proof }
        : await readPendingPullAttempt(publicKey)
    setError(null)
    setRevealedItem(null)
    try {
      if (resumeAttempt?.proof.erPullSignature && !resumeAttempt.proof.claimSignature) {
        const resumeAccounts = resumeAttempt.accounts
        setActiveAccounts(resumeAccounts)
        setProof(resumeAttempt.proof)
        setStage('settling')
        const pullInfo = await erConnection.getAccountInfo(resumeAccounts.pendingPull, 'confirmed')
        let settledPull = pullInfo ? decodePendingPull(Buffer.from(pullInfo.data)) : null
        if (!settledPull || !isSettled(settledPull)) {
          const settled = await pollForErSettlement(resumeAccounts)
          settledPull = settled.pull
        }
        await completeSettledPull(resumeAccounts, settledPull, resumeAttempt.proof)
        return
      }

      if (resumeAttempt?.proof.prepareSignature) {
        const resumeAccounts = resumeAttempt.accounts
        setActiveAccounts(resumeAccounts)
        setProof(resumeAttempt.proof)
        setStage('requesting')
        const erPullSignature = await sendErInstructions([
          buildPullInstruction(publicKey, resumeAccounts, Math.floor(Math.random() * 256)),
        ])
        const nextProof = { ...resumeAttempt.proof, erPullSignature }
        setProof(nextProof)
        await writePendingPullAttempt(publicKey, resumeAccounts, nextProof)
        setStage('settling')
        const settled = await pollForErSettlement(resumeAccounts)
        await completeSettledPull(resumeAccounts, settled.pull, nextProof)
        return
      }

      setProof({
        paymentSignature: null,
        prepareSignature: null,
        erPullSignature: null,
        erCommitSignature: null,
        claimSignature: null,
      })
      const currentMachine = await ensureMachine()
      await ensureInventorySession()
      const recoverable = await findRecoverablePull(currentMachine)
      if (recoverable) {
        const recoveryProof = {
          paymentSignature: null,
          prepareSignature: null,
          erPullSignature: null,
          erCommitSignature: null,
          claimSignature: null,
        }
        setActiveAccounts(recoverable.accounts)
        setProof(recoveryProof)
        await completeSettledPull(recoverable.accounts, recoverable.pull, recoveryProof)
        return
      }
      const pullId = currentMachine.pullCount + 1n
      const accounts = findGachaponAccounts(publicKey, currentMachine.machineId, pullId)
      setActiveAccounts(accounts)
      setStage('preparing')
      let preparedProof: PullProof
      const existingPendingPull = await connection.getAccountInfo(accounts.pendingPull, 'confirmed')

      if (existingPendingPull && !existingPendingPull.owner.equals(DELEGATION_PROGRAM_ID)) {
        preparedProof = {
          paymentSignature: null,
          prepareSignature: null,
          erPullSignature: null,
          erCommitSignature: null,
          claimSignature: null,
        }
      } else {
        const prepareSignature = await executePackPayment(accounts)
        preparedProof = {
          paymentSignature: prepareSignature,
          prepareSignature,
          erPullSignature: null,
          erCommitSignature: null,
          claimSignature: null,
        }
        setProof(preparedProof)
        await writePendingPullAttempt(publicKey, accounts, preparedProof)
      }

      await sendInstructions([buildDelegatePendingPullInstruction(publicKey, accounts)])
      setProof(preparedProof)
      await writePendingPullAttempt(publicKey, accounts, preparedProof)
      setStage('requesting')
      const erPullSignature = await sendErInstructions([
        buildPullInstruction(publicKey, accounts, Math.floor(Math.random() * 256)),
      ])
      const requestedProof = { ...preparedProof, erPullSignature }
      setProof(requestedProof)
      await writePendingPullAttempt(publicKey, accounts, requestedProof)
      setStage('settling')
      const settled = await pollForErSettlement(accounts)
      await completeSettledPull(accounts, settled.pull, requestedProof)
    } catch (cause) {
      const message = toUserMessage(cause)
      if (!isExpectedDelay(cause)) {
        console.warn('VOIDDECK pack opening failed', cause)
      }
      setError(message)
      setStage('error')
    }
  }, [
    activeAccounts,
    connect,
    completeSettledPull,
    erConnection,
    ensureInventorySession,
    ensureMachine,
    executePackPayment,
    findRecoverablePull,
    isOffline,
    pollForErSettlement,
    proof,
    publicKey,
    sendErInstructions,
    sendInstructions,
  ])

  const requestAirdrop = useCallback(async () => {
    if (!publicKey) return
    setError(null)
    try {
      const signature = await connection.requestAirdrop(publicKey, 1_000_000_000)
      await connection.confirmTransaction(signature, 'confirmed')
      await refresh()
    } catch (cause) {
      setError(toUserMessage(cause))
    }
  }, [connection, publicKey, refresh])

  const buyback = useCallback(
    async (item: InventoryItem) => {
      if (!publicKey) {
        await connect()
        return
      }
      if (item.proof?.buybackSignature) return

      setError(null)
      setIsBuyingBack(true)
      try {
        const signature = await sendInstructions([buildInstantBuybackInstruction(publicKey, item.accounts)])
        const amount = BUYBACK_PAYOUT_USDC_UNITS[item.pull.rewardId]?.toString() ?? '0'
        const updatedProof: StoredPullProof = {
          ...(item.proof ?? buildStoredProof(item.accounts, item.pull, proof)),
          buybackSignature: signature,
          buybackAmount: amount,
          recordedAt: Date.now(),
        }
        await writeStoredProof(updatedProof)
        setProof((current) => ({ ...current }))
        setRevealedItem((current) =>
          current?.accounts.asset.equals(item.accounts.asset) ? { ...current, proof: updatedProof } : current,
        )
        setInventory((current) =>
          current.map((entry) =>
            entry.accounts.asset.equals(item.accounts.asset) ? { ...entry, proof: updatedProof } : entry,
          ),
        )
        setLastSignature(signature)
        await refresh()
      } catch (cause) {
        setError(toUserMessage(cause))
        setStage('error')
      } finally {
        setIsBuyingBack(false)
      }
    },
    [connect, proof, publicKey, refresh, sendInstructions],
  )

  const resetReveal = useCallback(() => {
    setStage('idle')
    setRevealedItem(null)
    setError(null)
  }, [])

  return useMemo(
    () => ({
      publicKey,
      walletMode,
      connect,
      connectDevWallet,
      disconnect: disconnectWallet,
      machine,
      inventory,
      balance,
      stage,
      isBusy,
      isOffline,
      isBuyingBack,
      erReady,
      activeAccounts,
      revealedItem,
      lastSignature,
      proof,
      canResume: Boolean(activeAccounts && (proof.prepareSignature || proof.erPullSignature) && !proof.claimSignature),
      error,
      isDevWalletLoading,
      pull,
      refresh,
      requestAirdrop,
      buyback,
      resetReveal,
    }),
    [
      activeAccounts,
      balance,
      connect,
      connectDevWallet,
      disconnectWallet,
      error,
      inventory,
      isBusy,
      isBuyingBack,
      isOffline,
      erReady,
      isDevWalletLoading,
      lastSignature,
      machine,
      proof,
      publicKey,
      walletMode,
      pull,
      refresh,
      requestAirdrop,
      buyback,
      resetReveal,
      revealedItem,
      stage,
    ],
  )
}

function toUserMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (normalized.includes('user rejected') || normalized.includes('cancel')) return 'Transaction cancelled.'
  if (normalized.includes('devnet usdc')) return message
  if (normalized.includes('insufficient') || normalized.includes('0x1'))
    return 'Not enough Devnet SOL or USDC. Fund the wallet and try again.'
  if (normalized.includes('blockhash')) return 'The transaction expired. Please try again.'
  if (normalized.includes('wallet') && normalized.includes('not found'))
    return 'Install an MWA-compatible wallet to continue.'
  return message || 'Something went wrong. Please try again.'
}

function isExpectedDelay(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return (
    normalized.includes('longer than expected') ||
    normalized.includes('still finalizing') ||
    normalized.includes('callback is taking') ||
    normalized.includes('claim is taking')
  )
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function readStoredProofs(): Promise<Record<string, StoredPullProof>> {
  try {
    const raw = await AsyncStorage.getItem(PULL_PROOFS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, StoredPullProof>
  } catch {
    return {}
  }
}

async function writeStoredProof(proof: StoredPullProof) {
  const proofs = await readStoredProofs()
  proofs[proof.asset] = proof
  await AsyncStorage.setItem(PULL_PROOFS_STORAGE_KEY, JSON.stringify(proofs))
}

async function readPendingPullAttempt(wallet: PublicKey) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_PULL_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingPullAttempt
    if (parsed.wallet !== wallet.toString()) return null
    const accounts = findGachaponAccounts(wallet, BigInt(parsed.machineId), BigInt(parsed.pullId))
    return { accounts, proof: parsed.proof }
  } catch {
    return null
  }
}

async function writePendingPullAttempt(wallet: PublicKey, accounts: GachaponAccounts, proof: PullProof) {
  const attempt: PendingPullAttempt = {
    wallet: wallet.toString(),
    machineId: accounts.machineId.toString(),
    pullId: accounts.pullId.toString(),
    proof,
    updatedAt: Date.now(),
  }
  await AsyncStorage.setItem(PENDING_PULL_STORAGE_KEY, JSON.stringify(attempt))
}

async function clearPendingPullAttempt() {
  await AsyncStorage.removeItem(PENDING_PULL_STORAGE_KEY)
}

function buildStoredProof(accounts: GachaponAccounts, pull: PendingPullAccount, proof: PullProof): StoredPullProof {
  return {
    ...proof,
    asset: accounts.asset.toString(),
    inventory: findInventoryAddress(pull.player).toString(),
    machine: accounts.machine.toString(),
    pendingPull: accounts.pendingPull.toString(),
    pullId: pull.pullId.toString(),
    rewardId: pull.rewardId,
    programId: PROGRAM_ID.toString(),
    vrfProgram: VRF_PROGRAM_ID.toString(),
    vrfQueue: DEFAULT_VRF_QUEUE.toString(),
    erRpc: ER_DEVNET_RPC_URL,
    paymentMint: DEVNET_USDC_MINT.toString(),
    paymentAmount: PACK_PRICE_USDC_UNITS.toString(),
    paymentTreasury: accounts.treasury.toString(),
    recordedAt: Date.now(),
  }
}

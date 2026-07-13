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
  MegaPotAccount,
  JackpotConfigAccount,
  JackpotRoundAccount,
  JACKPOT_STATUS,
  PendingPullAccount,
  PROGRAM_ID,
  BUYBACK_PAYOUT_USDC_UNITS,
  DEFAULT_LIST_PRICE_USDC_UNITS,
  DEVNET_USDC_MINT,
  PACK_PRICE_USDC,
  PACK_PRICE_USDC_UNITS,
  MEGAPOT_CONTRIBUTION_USDC_UNITS,
  MEGAPOT_ENTRY_WEIGHTS,
  REWARDS,
  USDC_DECIMALS,
  VRF_PROGRAM_ID,
  LISTING_STATUS_ACTIVE,
  ListingAccount,
  SaleRecordAccount,
  FUSE_RECORD_DISCRIMINATOR,
  buildBuyListingInstruction,
  buildClaimAssetInstruction,
  buildCommitGachaStateInstruction,
  buildCancelListingInstruction,
  buildCreateAssociatedTokenAccountInstruction,
  buildCreateListingInstruction,
  buildDelegateMachineInstruction,
  buildDelegateMegaPotInstruction,
  buildDelegatePendingPullInstruction,
  buildInitInstruction,
  buildDelegateInventoryInstruction,
  buildInitializeInventoryInstruction,
  buildInitializeMegaPotInstruction,
  buildInstantBuybackInstruction,
  buildPreparePaidPullInstruction,
  buildPreparePullInstruction,
  buildPullInstruction,
  buildUploadConfigInstruction,
  buildFuseAssetsInstruction,
  buildEnterJackpotInstruction,
  buildCloseJackpotRoundInstruction,
  buildDelegateJackpotRoundInstruction,
  buildRequestJackpotDrawInstruction,
  buildFinalizeJackpotDrawInstruction,
  buildClaimJackpotInstruction,
  buildUnlockJackpotEntryInstruction,
  decodeCoreAsset,
  decodeListing,
  decodeMachine,
  decodeMegaPot,
  decodePendingPull,
  decodeSaleRecord,
  decodeFuseRecord,
  decodeJackpotConfig,
  decodeJackpotRound,
  erDevnetConnection,
  findAssociatedTokenAddress,
  findGachaponAccounts,
  findInventoryAddress,
  findListingAddress,
  findMegaPotAddress,
  findSaleRecordAddress,
  findFuseRecordAddress,
  findJackpotAddress,
  findJackpotRoundAddress,
  findJackpotEntryAddress,
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

export type MarketListing = {
  address: PublicKey
  listing: ListingAccount
  asset: CoreAssetAccount
  reward: (typeof REWARDS)[number]
}

export type MarketSale = {
  address: PublicKey
  sale: SaleRecordAccount
  asset: CoreAssetAccount | null
  reward: (typeof REWARDS)[number]
  signature?: string | null
}

export type MarketPurchaseReceipt = {
  asset: PublicKey
  seller: PublicKey
  buyer: PublicKey
  saleRecord: PublicKey
  signature: string
  priceUsdcUnits: bigint
  reward: (typeof REWARDS)[number]
  pullId: bigint
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
  megapot?: string
  megapotVault?: string
  megapotContribution?: string
  megapotEntryWeight?: string
  buybackSignature?: string | null
  buybackAmount?: string | null
  listingAddress?: string | null
  listingSignature?: string | null
  listingPrice?: string | null
  cancelListingSignature?: string | null
  saleSignature?: string | null
  saleRecord?: string | null
  salePrice?: string | null
  saleBuyer?: string | null
  saleSeller?: string | null
  fuseRecord?: string | null
  fuseSignature?: string | null
  fuseInputRewardId?: number | null
  fuseOutputRewardId?: number | null
  burnedAssets?: string[] | null
  fusePlayer?: string | null
  fuseTimestamp?: string | null
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

function formatUsdcUnits(units: bigint) {
  const whole = units / 1_000_000n
  const fraction = (units % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString()
}

export function useGachapon() {
  const { account, connect, disconnect, connection, signAndSendTransaction, signTransaction } = useMobileWallet()
  const erConnection = useMemo(() => erDevnetConnection(), [])
  const [devWallet, setDevWallet] = useState<Keypair | null>(null)
  const [isDevWalletLoading, setIsDevWalletLoading] = useState(false)
  const [machine, setMachine] = useState<MachineAccount | null>(null)
  const [megapot, setMegaPot] = useState<MegaPotAccount | null>(null)
  const [megapotBalance, setMegaPotBalance] = useState<number | null>(null)
  const [jackpot, setJackpot] = useState<JackpotConfigAccount | null>(null)
  const [jackpotRound, setJackpotRound] = useState<JackpotRoundAccount | null>(null)
  const [jackpotBalance, setJackpotBalance] = useState<number | null>(null)
  const [isJackpotBusy, setIsJackpotBusy] = useState(false)
  const [jackpotProof, setJackpotProof] = useState({ entry: null as string | null, close: null as string | null, draw: null as string | null, commit: null as string | null, claim: null as string | null, unlock: null as string | null })
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [marketListings, setMarketListings] = useState<MarketListing[]>([])
  const [marketSales, setMarketSales] = useState<MarketSale[]>([])
  const [lastMarketPurchase, setLastMarketPurchase] = useState<MarketPurchaseReceipt | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null)
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
  const [megapotErReady, setMegaPotErReady] = useState(false)
  const [isBuyingBack, setIsBuyingBack] = useState(false)
  const [listingAsset, setListingAsset] = useState<string | null>(null)
  const isListing = Boolean(listingAsset)
  const [isBuyingListing, setIsBuyingListing] = useState(false)
  const [fusingId, setFusingId] = useState<number | null>(null)
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
    setUsdcBalance(null)
    setErReady(false)
  }, [account, disconnect])

  const sendInstructions = useCallback(
    async (instructions: TransactionInstruction[], signers: Keypair[] = []) => {
      if (!publicKey) throw new Error('Connect a wallet first')

      const latest = await connection.getLatestBlockhashAndContext('confirmed')
      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash: latest.value.blockhash,
        lastValidBlockHeight: latest.value.lastValidBlockHeight,
      }).add(...instructions)

      let signature: string
      if (devWallet) {
        transaction.sign(devWallet, ...signers)
        signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 })
      } else {
        if (signers.length > 0) transaction.partialSign(...signers)
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
      const ids = Array.from({ length: Math.min(pullCount, 50) }, (_, index) => BigInt(pullCount - index))
      const accountSets = ids.map((pullId) => findGachaponAccounts(wallet, currentMachine.machineId, pullId))
      const addresses = accountSets.flatMap((accounts) => [accounts.pendingPull, accounts.asset])
      const infos = addresses.length ? await connection.getMultipleAccountsInfo(addresses, 'confirmed') : []
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

      for (const storedProof of Object.values(proofMap)) {
        if (items.some((item) => item.accounts.asset.toString() === storedProof.asset)) continue
        if (!storedProof.machine || !storedProof.pendingPull || !storedProof.pullId) continue

        try {
          const assetPubkey = new PublicKey(storedProof.asset)
          const pendingPullPubkey = new PublicKey(storedProof.pendingPull)
          const [assetInfo, pullInfo] = await Promise.all([
            connection.getAccountInfo(assetPubkey, 'confirmed'),
            connection.getAccountInfo(pendingPullPubkey, 'confirmed'),
          ])
          if (!assetInfo || !pullInfo) continue

          const asset = decodeCoreAsset(Buffer.from(assetInfo.data))
          if (!asset.owner.equals(wallet)) continue

          const pull = decodePendingPull(Buffer.from(pullInfo.data))
          const reward = REWARDS[pull.rewardId]
          if (!reward) continue
          items.push({
            accounts: {
              machineId: currentMachine.machineId,
              machine: new PublicKey(storedProof.machine),
              treasury: new PublicKey(storedProof.paymentTreasury),
              megapot: findMegaPotAddress(new PublicKey(storedProof.machine)),
              updateAuthority: PublicKey.default,
              callbackIdentity: PublicKey.default,
              pendingPull: pendingPullPubkey,
              asset: assetPubkey,
              pullId: pull.pullId,
            },
            pull,
            asset,
            reward,
            proof: storedProof,
          })
        } catch {
          // Ignore old or partial local market receipts.
        }
      }

      const programAccounts = await connection.getProgramAccounts(PROGRAM_ID, 'confirmed')
      for (const entry of programAccounts) {
        const data = Buffer.from(entry.account.data)
        if (data.length < 8 || !FUSE_RECORD_DISCRIMINATOR.every((byte, index) => data[index] === byte)) continue

        try {
          const record = decodeFuseRecord(data)
          if (items.some((item) => item.accounts.asset.equals(record.newAsset))) continue
          const assetInfo = await connection.getAccountInfo(record.newAsset, 'confirmed')
          if (!assetInfo) continue
          const asset = decodeCoreAsset(Buffer.from(assetInfo.data))
          if (!asset.owner.equals(wallet)) continue
          const reward = REWARDS[record.outputRewardId]
          if (!reward) continue
          const existingProof = proofMap[record.newAsset.toString()]
          const recoveredSignature = existingProof?.fuseSignature
            ? existingProof.fuseSignature
            : (await connection.getSignaturesForAddress(entry.pubkey, { limit: 1 }, 'confirmed'))[0]?.signature ?? null
          const fusionProof: StoredPullProof = existingProof ?? {
            paymentSignature: null,
            prepareSignature: null,
            erPullSignature: null,
            erCommitSignature: null,
            claimSignature: null,
            asset: record.newAsset.toString(),
            inventory: findInventoryAddress(wallet).toString(),
            machine: record.machine.toString(),
            pendingPull: entry.pubkey.toString(),
            pullId: record.fuseId.toString(),
            rewardId: record.outputRewardId,
            programId: PROGRAM_ID.toString(),
            vrfProgram: VRF_PROGRAM_ID.toString(),
            vrfQueue: DEFAULT_VRF_QUEUE.toString(),
            erRpc: ER_DEVNET_RPC_URL,
            paymentMint: DEVNET_USDC_MINT.toString(),
            paymentAmount: '0',
            paymentTreasury: PublicKey.default.toString(),
            fuseRecord: entry.pubkey.toString(),
            fuseSignature: recoveredSignature,
            fuseInputRewardId: record.inputRewardId,
            fuseOutputRewardId: record.outputRewardId,
            burnedAssets: record.burnedAssets.map((burnedAsset) => burnedAsset.toString()),
            fusePlayer: record.player.toString(),
            fuseTimestamp: record.unixTimestamp.toString(),
            recordedAt: Number(record.unixTimestamp) * 1000,
          }
          fusionProof.fuseRecord = entry.pubkey.toString()
          fusionProof.fuseSignature = recoveredSignature
          fusionProof.fuseInputRewardId = record.inputRewardId
          fusionProof.fuseOutputRewardId = record.outputRewardId
          fusionProof.burnedAssets = record.burnedAssets.map((burnedAsset) => burnedAsset.toString())
          fusionProof.fusePlayer = record.player.toString()
          fusionProof.fuseTimestamp = record.unixTimestamp.toString()
          if (
            !existingProof ||
            !existingProof.fuseSignature ||
            !existingProof.fusePlayer ||
            !existingProof.fuseTimestamp
          ) {
            await writeStoredProof(fusionProof)
          }
          const syntheticPull: PendingPullAccount = {
            machine: record.machine,
            player: wallet,
            asset: record.newAsset,
            pullId: record.fuseId,
            rewardId: record.outputRewardId,
            status: 1,
          }
          items.push({
            accounts: {
              machineId: currentMachine.machineId,
              machine: record.machine,
              treasury: PublicKey.default,
              megapot: findMegaPotAddress(record.machine),
              updateAuthority: PublicKey.default,
              callbackIdentity: PublicKey.default,
              pendingPull: entry.pubkey,
              asset: record.newAsset,
              pullId: record.fuseId,
            },
            pull: syntheticPull,
            asset,
            reward,
            proof: fusionProof,
          })
        } catch {
          // Ignore incomplete fuse records while the base transaction is confirming.
        }
      }

      setInventory(items)
      return items
    },
    [connection],
  )

  const loadMarketListings = useCallback(async () => {
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, 'confirmed')
    const listings: MarketListing[] = []
    const sales: MarketSale[] = []
    const proofMap = await readStoredProofs()

    for (const account of accounts) {
      try {
        const listing = decodeListing(Buffer.from(account.account.data))
        if (listing.status !== LISTING_STATUS_ACTIVE) continue
        const assetInfo = await connection.getAccountInfo(listing.asset, 'confirmed')
        if (!assetInfo) continue
        const asset = decodeCoreAsset(Buffer.from(assetInfo.data))
        const reward = REWARDS[listing.rewardId]
        if (!reward) continue
        listings.push({ address: account.pubkey, listing, asset, reward })
        continue
      } catch {
        // Program owns machine, pull, inventory, listing, and sale accounts.
      }

      try {
        const sale = decodeSaleRecord(Buffer.from(account.account.data))
        const reward = REWARDS[sale.rewardId]
        if (!reward) continue
        const assetInfo = await connection.getAccountInfo(sale.asset, 'confirmed')
        const asset = assetInfo ? decodeCoreAsset(Buffer.from(assetInfo.data)) : null
        sales.push({
          address: account.pubkey,
          sale,
          asset,
          reward,
          signature: proofMap[sale.asset.toString()]?.saleSignature ?? null,
        })
      } catch {
        // Ignore non-sale program accounts.
      }
    }

    listings.sort((left, right) => Number(right.listing.pullId - left.listing.pullId))
    sales.sort((left, right) => Number(right.sale.slot - left.sale.slot))
    setMarketListings(listings)
    setMarketSales(sales)
    return listings
  }, [connection])

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setMachine(null)
      setInventory([])
      void loadMarketListings().catch(() => undefined)
      setBalance(null)
      setUsdcBalance(null)
      setErReady(false)
      setMegaPot(null)
      setMegaPotBalance(null)
      setMegaPotErReady(false)
      setJackpot(null)
      setJackpotRound(null)
      setJackpotBalance(null)
      return
    }

    const [lamports, baseAccounts] = await Promise.all([
      connection.getBalance(publicKey, 'confirmed'),
      Promise.resolve(findGachaponAccounts(publicKey)),
    ])
    setBalance(lamports / 1_000_000_000)
    const payerToken = findAssociatedTokenAddress(publicKey, DEVNET_USDC_MINT)
    connection.getTokenAccountBalance(payerToken, 'confirmed')
      .then((res) => setUsdcBalance(Number(res.value.uiAmountString ?? '0')))
      .catch(() => setUsdcBalance(0))
    const jackpotAddress = findJackpotAddress()
    const jackpotInfo = await connection.getAccountInfo(jackpotAddress, 'confirmed')
    if (jackpotInfo) {
      const nextJackpot = decodeJackpotConfig(Buffer.from(jackpotInfo.data))
      setJackpot(nextJackpot)
      const roundAddress = findJackpotRoundAddress(nextJackpot.currentRound)
      const [baseRoundInfo, erRoundInfo] = await Promise.all([
        connection.getAccountInfo(roundAddress, 'confirmed'),
        erConnection.getAccountInfo(roundAddress, 'confirmed'),
      ])
      const readableRound = erRoundInfo ?? baseRoundInfo
      setJackpotRound(readableRound ? decodeJackpotRound(Buffer.from(readableRound.data)) : null)
      connection.getTokenAccountBalance(findAssociatedTokenAddress(jackpotAddress, DEVNET_USDC_MINT), 'confirmed')
        .then((result) => setJackpotBalance(Number(result.value.uiAmountString ?? '0')))
        .catch(() => setJackpotBalance(0))
    } else {
      setJackpot(null)
      setJackpotRound(null)
      setJackpotBalance(0)
    }
    const inventoryInfo = await connection.getAccountInfo(findInventoryAddress(publicKey), 'confirmed')
    setErReady(Boolean(inventoryInfo?.owner.equals(DELEGATION_PROGRAM_ID)))

    const megapotAddress = findMegaPotAddress(baseAccounts.machine)
    const megapotToken = findAssociatedTokenAddress(megapotAddress, DEVNET_USDC_MINT)
    const [baseMegaPotInfo, erMegaPotInfo] = await Promise.all([
      connection.getAccountInfo(megapotAddress, 'confirmed'),
      erConnection.getAccountInfo(megapotAddress, 'confirmed'),
    ])
    setMegaPotErReady(Boolean(baseMegaPotInfo?.owner.equals(DELEGATION_PROGRAM_ID) && erMegaPotInfo))
    const readableMegaPotInfo = erMegaPotInfo ?? baseMegaPotInfo
    setMegaPot(readableMegaPotInfo ? decodeMegaPot(Buffer.from(readableMegaPotInfo.data)) : null)
    connection.getTokenAccountBalance(megapotToken, 'confirmed')
      .then((res) => setMegaPotBalance(Number(res.value.uiAmountString ?? '0')))
      .catch(() => setMegaPotBalance(0))

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
    await Promise.all([loadInventory(publicKey, nextMachine), loadMarketListings()])
  }, [connection, erConnection, loadInventory, loadMarketListings, publicKey])

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
      if (!updatedInfo) throw new Error('Matka reward migration was not confirmed on MagicBlock')
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

  const ensureMegaPotSession = useCallback(async (currentMachine: MachineAccount) => {
    if (!publicKey) throw new Error('Connect a wallet first')
    const accounts = findGachaponAccounts(publicKey, currentMachine.machineId)
    const megapotToken = findAssociatedTokenAddress(accounts.megapot, DEVNET_USDC_MINT)
    let info = await connection.getAccountInfo(accounts.megapot, 'confirmed')

    if (!info) {
      setStage('activating')
      const closesAt = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60)
      await sendInstructions([buildInitializeMegaPotInstruction(publicKey, accounts, closesAt)])
      info = await connection.getAccountInfo(accounts.megapot, 'confirmed')
    }

    if (!(await connection.getAccountInfo(megapotToken, 'confirmed'))) {
      await sendInstructions([
        buildCreateAssociatedTokenAccountInstruction(publicKey, megapotToken, accounts.megapot, DEVNET_USDC_MINT),
      ])
    }

    if (info && !info.owner.equals(DELEGATION_PROGRAM_ID)) {
      setStage('activating')
      await sendInstructions([buildDelegateMegaPotInstruction(publicKey, accounts)])
      info = await connection.getAccountInfo(accounts.megapot, 'confirmed')
    }

    if (!info?.owner.equals(DELEGATION_PROGRAM_ID)) {
      throw new Error('MagicBlock MegaPot delegation was not confirmed')
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt < 20_000) {
      const erInfo = await erConnection.getAccountInfo(accounts.megapot, 'confirmed')
      if (erInfo) {
        const nextMegaPot = decodeMegaPot(Buffer.from(erInfo.data))
        setMegaPot(nextMegaPot)
        setMegaPotErReady(true)
        return nextMegaPot
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
    throw new Error('MagicBlock is still activating the MegaPot. Try again shortly.')
  }, [connection, erConnection, publicKey, sendInstructions])

  const executePackPayment = useCallback(
    async (accounts: GachaponAccounts) => {
      if (!publicKey) throw new Error('Connect a wallet first')

      const payerToken = findAssociatedTokenAddress(publicKey, DEVNET_USDC_MINT)
      const treasuryToken = findAssociatedTokenAddress(accounts.treasury, DEVNET_USDC_MINT)
      const jackpotAddress = findJackpotAddress()
      const jackpotToken = findAssociatedTokenAddress(jackpotAddress, DEVNET_USDC_MINT)
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
      if (!(await connection.getAccountInfo(jackpotAddress, 'confirmed'))) {
        throw new Error('The global Jackpot is not initialized yet. Refresh after the Devnet round is activated.')
      }
      if (!(await connection.getAccountInfo(jackpotToken, 'confirmed'))) {
        instructions.push(
          buildCreateAssociatedTokenAccountInstruction(publicKey, jackpotToken, jackpotAddress, DEVNET_USDC_MINT),
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
      await connectDevWallet()
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
      await ensureMegaPotSession(currentMachine)
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
        console.warn('Matka pack opening failed', cause)
      }
      setError(message)
      setStage('error')
    }
  }, [
    activeAccounts,
    connectDevWallet,
    completeSettledPull,
    erConnection,
    ensureInventorySession,
    ensureMegaPotSession,
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
        await connectDevWallet()
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
    [connectDevWallet, proof, publicKey, refresh, sendInstructions],
  )

  const listItem = useCallback(
    async (item: InventoryItem, priceUsdcUnits = DEFAULT_LIST_PRICE_USDC_UNITS) => {
      if (!publicKey) {
        await connectDevWallet()
        return
      }
      if (!item.asset.owner.equals(publicKey)) {
        setError('Only the current owner can list this card.')
        setStage('error')
        return false
      }

      setError(null)
      setListingAsset(item.accounts.asset.toString())
      try {
        const signature = await sendInstructions([buildCreateListingInstruction(publicKey, item.accounts, priceUsdcUnits)])
        const listingAddress = findListingAddress(item.accounts.asset)
        const updatedProof: StoredPullProof = {
          ...(item.proof ?? buildStoredProof(item.accounts, item.pull, proof)),
          listingAddress: listingAddress.toString(),
          listingSignature: signature,
          listingPrice: priceUsdcUnits.toString(),
          cancelListingSignature: null,
          saleSignature: null,
          recordedAt: Date.now(),
        }
        await writeStoredProof(updatedProof)
        setLastSignature(signature)
        setInventory((current) =>
          current.map((entry) =>
            entry.accounts.asset.equals(item.accounts.asset) ? { ...entry, proof: updatedProof } : entry,
          ),
        )
        await refresh()
        return true
      } catch (cause) {
        setError(toUserMessage(cause))
        setStage('error')
        return false
      } finally {
        setListingAsset(null)
      }
    },
    [connectDevWallet, proof, publicKey, refresh, sendInstructions],
  )

  const cancelListing = useCallback(
    async (item: InventoryItem) => {
      if (!publicKey) {
        await connectDevWallet()
        return
      }

      setError(null)
      setListingAsset(item.accounts.asset.toString())
      try {
        const signature = await sendInstructions([buildCancelListingInstruction(publicKey, item.accounts.asset)])
        const updatedProof: StoredPullProof = {
          ...(item.proof ?? buildStoredProof(item.accounts, item.pull, proof)),
          cancelListingSignature: signature,
          recordedAt: Date.now(),
        }
        await writeStoredProof(updatedProof)
        setLastSignature(signature)
        setInventory((current) =>
          current.map((entry) =>
            entry.accounts.asset.equals(item.accounts.asset) ? { ...entry, proof: updatedProof } : entry,
          ),
        )
        await refresh()
        return true
      } catch (cause) {
        setError(toUserMessage(cause))
        setStage('error')
        return false
      } finally {
        setListingAsset(null)
      }
    },
    [connectDevWallet, proof, publicKey, refresh, sendInstructions],
  )

  const fuseCharacters = useCallback(
    async (rewardId: number, assets: PublicKey[]) => {
      if (!publicKey) {
        await connectDevWallet()
        return
      }
      if (!machine) {
        setError('Machine is still loading. Refresh and try fuse again.')
        setStage('error')
        return
      }
      if (assets.length !== 3) {
        setError('Must provide exactly 3 identical characters to fuse')
        setStage('error')
        return
      }
      if (rewardId < 0 || rewardId >= REWARDS.length - 1) {
        setError('Legendary Cosmic Matka is already max tier and cannot be fused.')
        setStage('error')
        return
      }

      setError(null)
      setFusingId(rewardId)
      try {
        const newAssetKeypair = Keypair.generate()
        const signature = await sendInstructions(
          [
            buildFuseAssetsInstruction(
              publicKey,
              findGachaponAccounts(publicKey, machine.machineId).machine,
              assets[0],
              assets[1],
              assets[2],
              newAssetKeypair.publicKey,
              rewardId,
            ),
          ],
          [newAssetKeypair],
        )

        const fuseRecordAddress = findFuseRecordAddress(newAssetKeypair.publicKey)
        let fuseRecord = null
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const info = await connection.getAccountInfo(fuseRecordAddress, 'confirmed')
          if (info) {
            fuseRecord = decodeFuseRecord(Buffer.from(info.data))
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        if (!fuseRecord) throw new Error('Fusion confirmed, but its on-chain proof is still indexing. Refresh Vault shortly.')

        const storedProof: StoredPullProof = {
          paymentSignature: null,
          prepareSignature: null,
          erPullSignature: null,
          erCommitSignature: null,
          claimSignature: null,
          asset: newAssetKeypair.publicKey.toString(),
          inventory: findInventoryAddress(publicKey).toString(),
          machine: fuseRecord.machine.toString(),
          pendingPull: fuseRecordAddress.toString(),
          pullId: fuseRecord.fuseId.toString(),
          rewardId: fuseRecord.outputRewardId,
          programId: PROGRAM_ID.toString(),
          vrfProgram: VRF_PROGRAM_ID.toString(),
          vrfQueue: DEFAULT_VRF_QUEUE.toString(),
          erRpc: ER_DEVNET_RPC_URL,
          paymentMint: DEVNET_USDC_MINT.toString(),
          paymentAmount: '0',
          paymentTreasury: PublicKey.default.toString(),
          fuseRecord: fuseRecordAddress.toString(),
          fuseSignature: signature,
          fuseInputRewardId: fuseRecord.inputRewardId,
          fuseOutputRewardId: fuseRecord.outputRewardId,
          burnedAssets: fuseRecord.burnedAssets.map((asset) => asset.toString()),
          fusePlayer: fuseRecord.player.toString(),
          fuseTimestamp: fuseRecord.unixTimestamp.toString(),
          recordedAt: Date.now(),
        }
        await writeStoredProof(storedProof)

        await loadInventory(publicKey, machine)
        return signature
      } catch (err) {
        console.error('Failed to fuse characters', err)
        setError((err as Error).message ?? 'Failed to fuse characters.')
        setStage('error')
        throw err
      } finally {
        setFusingId(null)
      }
    },
    [publicKey, connectDevWallet, machine, sendInstructions, connection, loadInventory],
  )

  const buyListing = useCallback(
    async (marketListing: MarketListing) => {
      if (!publicKey) {
        await connectDevWallet()
        return
      }
      if (marketListing.listing.seller.equals(publicKey)) {
        setError('This listing is already yours. Use Cancel listing from the vault.')
        setStage('error')
        return
      }

      setError(null)
      setLastMarketPurchase(null)
      setIsBuyingListing(true)
      try {
        const buyerUsdc = findAssociatedTokenAddress(publicKey, DEVNET_USDC_MINT)
        const buyerInfo = await connection.getAccountInfo(buyerUsdc, 'confirmed')
        if (!buyerInfo) {
          throw new Error(
            `You need Devnet USDC to buy this card. Fund ${publicKey.toBase58()} with standard Devnet USDC (${DEVNET_USDC_MINT.toBase58()}).`,
          )
        }

        const balance = await connection.getTokenAccountBalance(buyerUsdc, 'confirmed')
        if (BigInt(balance.value.amount) < marketListing.listing.priceUsdcUnits) {
          throw new Error(`Not enough Devnet USDC. This listing costs ${formatUsdcUnits(marketListing.listing.priceUsdcUnits)} USDC.`)
        }

        const sellerUsdc = findAssociatedTokenAddress(marketListing.listing.seller, DEVNET_USDC_MINT)
        const saleNonce = BigInt(Date.now())
        const saleRecord = findSaleRecordAddress(marketListing.listing.asset, saleNonce)
        const instructions: TransactionInstruction[] = []
        if (!(await connection.getAccountInfo(sellerUsdc, 'confirmed'))) {
          instructions.push(
            buildCreateAssociatedTokenAccountInstruction(publicKey, sellerUsdc, marketListing.listing.seller, DEVNET_USDC_MINT),
          )
        }
        instructions.push(buildBuyListingInstruction(publicKey, marketListing.listing, saleNonce))

        const signature = await sendInstructions(instructions)
        const proofMap = await readStoredProofs()
        const storedProof: StoredPullProof = {
          ...(proofMap[marketListing.listing.asset.toString()] ?? {
            paymentSignature: null,
            prepareSignature: null,
            erPullSignature: null,
            erCommitSignature: null,
            claimSignature: null,
            asset: marketListing.listing.asset.toString(),
            inventory: findInventoryAddress(publicKey).toString(),
            machine: marketListing.listing.machine.toString(),
            pendingPull: marketListing.listing.pendingPull.toString(),
            pullId: marketListing.listing.pullId.toString(),
            rewardId: marketListing.listing.rewardId,
            programId: PROGRAM_ID.toString(),
            vrfProgram: VRF_PROGRAM_ID.toString(),
            vrfQueue: DEFAULT_VRF_QUEUE.toString(),
            erRpc: ER_DEVNET_RPC_URL,
            paymentMint: DEVNET_USDC_MINT.toString(),
            paymentAmount: PACK_PRICE_USDC_UNITS.toString(),
            paymentTreasury: '',
            recordedAt: Date.now(),
          }),
          listingAddress: marketListing.address.toString(),
          listingPrice: marketListing.listing.priceUsdcUnits.toString(),
          saleSignature: signature,
          saleRecord: saleRecord.toString(),
          salePrice: marketListing.listing.priceUsdcUnits.toString(),
          saleBuyer: publicKey.toString(),
          saleSeller: marketListing.listing.seller.toString(),
          recordedAt: Date.now(),
        }
        await writeStoredProof(storedProof)
        setLastSignature(signature)
        setLastMarketPurchase({
          asset: marketListing.listing.asset,
          seller: marketListing.listing.seller,
          buyer: publicKey,
          saleRecord,
          signature,
          priceUsdcUnits: marketListing.listing.priceUsdcUnits,
          reward: marketListing.reward,
          pullId: marketListing.listing.pullId,
        })
        const assetInfo = await connection.getAccountInfo(marketListing.listing.asset, 'confirmed')
        const pullInfo = await connection.getAccountInfo(marketListing.listing.pendingPull, 'confirmed')
        if (assetInfo && pullInfo) {
          const asset = decodeCoreAsset(Buffer.from(assetInfo.data))
          const pull = decodePendingPull(Buffer.from(pullInfo.data))
          const reward = REWARDS[pull.rewardId]
          if (reward && asset.owner.equals(publicKey)) {
            setInventory((current) => [
              {
                accounts: {
                  machineId: 0n,
                  machine: marketListing.listing.machine,
                  treasury: PublicKey.default,
                  megapot: findMegaPotAddress(marketListing.listing.machine),
                  updateAuthority: PublicKey.default,
                  callbackIdentity: PublicKey.default,
                  pendingPull: marketListing.listing.pendingPull,
                  asset: marketListing.listing.asset,
                  pullId: marketListing.listing.pullId,
                },
                pull,
                asset,
                reward,
                proof: storedProof,
              },
              ...current.filter((item) => !item.accounts.asset.equals(marketListing.listing.asset)),
            ])
          }
        }
        await refresh()
      } catch (cause) {
        setError(toUserMessage(cause))
        setStage('error')
      } finally {
        setIsBuyingListing(false)
      }
    },
    [connectDevWallet, connection, publicKey, refresh, sendInstructions],
  )

  const enterJackpot = useCallback(async (item: InventoryItem) => {
    if (!publicKey || !jackpotRound) throw new Error('Connect your wallet and refresh the Jackpot round.')
    if (item.pull.rewardId !== REWARDS.length - 1) throw new Error('Only a Legendary Cosmic Matka can enter the Jackpot.')
    if (jackpotRound.status !== JACKPOT_STATUS.OPEN) throw new Error('Jackpot entries are closed for this round.')
    setIsJackpotBusy(true)
    setError(null)
    try {
      const signature = await sendInstructions([
        buildEnterJackpotInstruction(publicKey, jackpotRound.roundId, item.accounts.asset, item.accounts.pendingPull),
      ])
      setJackpotProof((current) => ({ ...current, entry: signature }))
      await refresh()
      return signature
    } catch (cause) {
      setError(toUserMessage(cause))
      throw cause
    } finally {
      setIsJackpotBusy(false)
    }
  }, [jackpotRound, publicKey, refresh, sendInstructions])

  const runJackpotDraw = useCallback(async () => {
    if (!publicKey || !jackpotRound) throw new Error('Connect your wallet and refresh the Jackpot round.')
    setIsJackpotBusy(true)
    setError(null)
    try {
      let round = jackpotRound
      if (round.status === JACKPOT_STATUS.OPEN) {
        const closeSignature = await sendInstructions([buildCloseJackpotRoundInstruction(publicKey, round.roundId)])
        setJackpotProof((current) => ({ ...current, close: closeSignature }))
        const delegateSignature = await sendInstructions([buildDelegateJackpotRoundInstruction(publicKey, round.roundId)])
        setJackpotProof((current) => ({ ...current, commit: delegateSignature }))
        const roundAddress = findJackpotRoundAddress(round.roundId)
        const started = Date.now()
        while (Date.now() - started < 20_000 && !(await erConnection.getAccountInfo(roundAddress, 'confirmed'))) {
          await new Promise((resolve) => setTimeout(resolve, 750))
        }
        const erInfo = await erConnection.getAccountInfo(roundAddress, 'confirmed')
        if (!erInfo) throw new Error('MagicBlock is still activating the Jackpot round.')
        round = decodeJackpotRound(Buffer.from(erInfo.data))
      }
      if (round.status === JACKPOT_STATUS.LOCKED) {
        const drawSignature = await sendErInstructions([
          buildRequestJackpotDrawInstruction(publicKey, round.roundId, Math.floor(Math.random() * 256)),
        ])
        setJackpotProof((current) => ({ ...current, draw: drawSignature }))
      }
      const roundAddress = findJackpotRoundAddress(round.roundId)
      const drawStarted = Date.now()
      let selected: JackpotRoundAccount | null = null
      while (Date.now() - drawStarted < 60_000) {
        const info = await erConnection.getAccountInfo(roundAddress, 'confirmed')
        if (info) {
          const candidate = decodeJackpotRound(Buffer.from(info.data))
          if (candidate.status === JACKPOT_STATUS.WINNER_SELECTED) {
            selected = candidate
            break
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000))
      }
      if (!selected) throw new Error('MagicBlock VRF draw is still settling. Resume the draw shortly.')
      const commitSignature = await sendErInstructions([buildFinalizeJackpotDrawInstruction(publicKey, round.roundId)])
      setJackpotProof((current) => ({ ...current, commit: commitSignature }))
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      await refresh()
      return commitSignature
    } catch (cause) {
      setError(toUserMessage(cause))
      throw cause
    } finally {
      setIsJackpotBusy(false)
    }
  }, [erConnection, jackpotRound, publicKey, refresh, sendErInstructions, sendInstructions])

  const claimJackpot = useCallback(async () => {
    if (!publicKey || !jackpotRound) throw new Error('Connect the winning wallet first.')
    if (!jackpotRound.winner.equals(publicKey)) throw new Error('Only the selected winner can claim this Jackpot.')
    setIsJackpotBusy(true)
    try {
      const winnerUsdc = findAssociatedTokenAddress(publicKey, DEVNET_USDC_MINT)
      const instructions: TransactionInstruction[] = []
      if (!(await connection.getAccountInfo(winnerUsdc, 'confirmed'))) {
        instructions.push(buildCreateAssociatedTokenAccountInstruction(publicKey, winnerUsdc, publicKey, DEVNET_USDC_MINT))
      }
      instructions.push(buildClaimJackpotInstruction(publicKey, jackpotRound.roundId))
      const signature = await sendInstructions(instructions)
      setJackpotProof((current) => ({ ...current, claim: signature }))
      await refresh()
      return signature
    } finally {
      setIsJackpotBusy(false)
    }
  }, [connection, jackpotRound, publicKey, refresh, sendInstructions])

  const unlockJackpotEntry = useCallback(async (asset: PublicKey) => {
    if (!publicKey || !jackpotRound) throw new Error('Connect the entry owner first.')
    setIsJackpotBusy(true)
    try {
      const signature = await sendInstructions([buildUnlockJackpotEntryInstruction(publicKey, jackpotRound.roundId, asset)])
      setJackpotProof((current) => ({ ...current, unlock: signature }))
      await refresh()
      return signature
    } finally {
      setIsJackpotBusy(false)
    }
  }, [jackpotRound, publicKey, refresh, sendInstructions])

  const resetReveal = useCallback(() => {
    setStage('idle')
    setRevealedItem(null)
    setError(null)
  }, [])

  const megapotEntries = useMemo(() => {
    if (!publicKey || !megapot) return 0n
    const ownedAssets = new Set(inventory.map((item) => item.accounts.asset.toString()))
    return megapot.tickets.reduce(
      (total, ticket) => total + (ownedAssets.has(ticket.asset.toString()) ? ticket.weight : 0n),
      0n,
    )
  }, [inventory, megapot, publicKey])
  const jackpotEntries = useMemo(
    () => publicKey && jackpotRound ? jackpotRound.entries.filter((entry) => entry.player.equals(publicKey)) : [],
    [jackpotRound, publicKey],
  )

  return useMemo(
    () => ({
      publicKey,
      walletMode,
      connect,
      connectDevWallet,
      disconnect: disconnectWallet,
      machine,
      megapot,
      megapotBalance,
      megapotEntries,
      megapotEntryWeights: MEGAPOT_ENTRY_WEIGHTS,
      jackpot,
      jackpotRound,
      jackpotBalance,
      jackpotEntries,
      jackpotProof,
      isJackpotBusy,
      inventory,
      marketListings,
      marketSales,
      lastMarketPurchase,
      balance,
      usdcBalance,
      stage,
      isBusy,
      isOffline,
      isBuyingBack,
      isListing,
      listingAsset,
      isBuyingListing,
      fusingId,
      erReady,
      megapotErReady,
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
      listItem,
      cancelListing,
      buyListing,
      fuseCharacters,
      enterJackpot,
      runJackpotDraw,
      claimJackpot,
      unlockJackpotEntry,
      resetReveal,
    }),
    [
      activeAccounts,
      balance,
      usdcBalance,
      connect,
      connectDevWallet,
      disconnectWallet,
      error,
      inventory,
      marketListings,
      marketSales,
      isBusy,
      isBuyingBack,
      isListing,
      isBuyingListing,
      fusingId,
      isOffline,
      erReady,
      isDevWalletLoading,
      lastSignature,
      lastMarketPurchase,
      machine,
      megapot,
      megapotBalance,
      megapotEntries,
      megapotErReady,
      jackpot,
      jackpotRound,
      jackpotBalance,
      jackpotEntries,
      jackpotProof,
      isJackpotBusy,
      proof,
      publicKey,
      walletMode,
      pull,
      refresh,
      requestAirdrop,
      buyback,
      listItem,
      cancelListing,
      buyListing,
      fuseCharacters,
      enterJackpot,
      runJackpotDraw,
      claimJackpot,
      unlockJackpotEntry,
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
    megapot: findJackpotAddress().toString(),
    megapotVault: findAssociatedTokenAddress(findJackpotAddress(), DEVNET_USDC_MINT).toString(),
    megapotContribution: MEGAPOT_CONTRIBUTION_USDC_UNITS.toString(),
    megapotEntryWeight: (MEGAPOT_ENTRY_WEIGHTS[pull.rewardId] ?? 0n).toString(),
    recordedAt: Date.now(),
  }
}

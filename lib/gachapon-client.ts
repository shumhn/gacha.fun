import { Connection, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { Buffer } from 'buffer'
import {
  DELEGATION_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  delegationMetadataPdaFromDelegatedAccount,
  delegationRecordPdaFromDelegatedAccount,
} from '@magicblock-labs/ephemeral-rollups-sdk'

export const DEVNET_RPC_URL = 'https://rpc.magicblock.app/devnet'
export const ER_DEVNET_RPC_URL = 'https://devnet-as.magicblock.app'
export const PROGRAM_ID = new PublicKey('7oRzpny8E6JyVXkUfAxx9SE4y7VFy3s3DmKNXDSyivo6')
export const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d')
export const VRF_PROGRAM_ID = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz')
export const DEFAULT_VRF_QUEUE = new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc')
export const SLOT_HASHES = new PublicKey('SysvarS1otHashes111111111111111111111111111')
export const ASIA_ER_VALIDATOR = new PublicKey('MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57')
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
export const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')
export const USDC_DECIMALS = 6
export const PACK_PRICE_USDC = 1
export const PACK_PRICE_USDC_UNITS = 1_000_000n
export const BUYBACK_PAYOUT_USDC_UNITS = [250_000n, 750_000n, 1_800_000n, 5_000_000n] as const

export const REWARDS = [
  {
    weight: 55,
    rarity: 'Common',
    name: 'Mossbyte',
    uri: 'data:application/json;base64,eyJuYW1lIjoiTW9zc2J5dGUiLCJzeW1ib2wiOiJWT0lEIiwiZGVzY3JpcHRpb24iOiJDb21tb24gR2VuZXNpcyBTaWduYWwgY29sbGVjdGlibGUuIn0=',
  },
  {
    weight: 30,
    rarity: 'Rare',
    name: 'Neon Warden',
    uri: 'data:application/json;base64,eyJuYW1lIjoiTmVvbiBXYXJkZW4iLCJzeW1ib2wiOiJWT0lEIiwiZGVzY3JpcHRpb24iOiJSYXJlIEdlbmVzaXMgU2lnbmFsIGNvbGxlY3RpYmxlLiJ9',
  },
  {
    weight: 12,
    rarity: 'Epic',
    name: 'Hollow Seraph',
    uri: 'data:application/json;base64,eyJuYW1lIjoiSG9sbG93IFNlcmFwaCIsInN5bWJvbCI6IlZPSUQiLCJkZXNjcmlwdGlvbiI6IkVwaWMgR2VuZXNpcyBTaWduYWwgY29sbGVjdGlibGUuIn0=',
  },
  {
    weight: 3,
    rarity: 'Legendary',
    name: 'Null Titan',
    uri: 'data:application/json;base64,eyJuYW1lIjoiTnVsbCBUaXRhbiIsInN5bWJvbCI6IlZPSUQiLCJkZXNjcmlwdGlvbiI6IkxlZ2VuZGFyeSBHZW5lc2lzIFNpZ25hbCBjb2xsZWN0aWJsZS4ifQ==',
  },
] as const

export type RewardTemplate = (typeof REWARDS)[number]

export type GachaponAccounts = {
  machineId: bigint
  machine: PublicKey
  treasury: PublicKey
  updateAuthority: PublicKey
  callbackIdentity: PublicKey
  pendingPull: PublicKey
  asset: PublicKey
  pullId: bigint
}

export type MachineAccount = {
  authority: PublicKey
  machineId: bigint
  totalWeight: number
  pullCount: bigint
  rewards: Array<{
    rewardId: number
    weight: number
    mintedCount: bigint
    name: string
    uri: string
  }>
}

export type PendingPullAccount = {
  machine: PublicKey
  player: PublicKey
  asset: PublicKey
  pullId: bigint
  rewardId: number
  status: number
}

export type CoreAssetAccount = {
  owner: PublicKey
  updateAuthority: PublicKey | null
  name: string
  uri: string
  attributes: Map<string, string>
}

type Cursor = {
  offset: number
}

const MACHINE_SEED = 'machine'
const TREASURY_SEED = 'treasury'
const UPDATE_AUTHORITY_SEED = 'update_authority'
const VRF_IDENTITY_SEED = 'identity'
const PULL_SEED = 'pull'
const ASSET_SEED = 'asset'
const INVENTORY_SEED = 'inventory'

const INIT_DISCRIMINATOR = [220, 59, 207, 236, 108, 250, 47, 100]
const UPLOAD_CONFIG_DISCRIMINATOR = [89, 32, 45, 158, 27, 66, 0, 213]
const PREPARE_PULL_DISCRIMINATOR = [102, 65, 11, 37, 47, 233, 46, 176]
const PREPARE_PAID_PULL_DISCRIMINATOR = [29, 154, 7, 173, 185, 131, 13, 134]
const DELEGATE_PENDING_PULL_DISCRIMINATOR = [69, 111, 5, 1, 176, 180, 232, 193]
const PULL_DISCRIMINATOR = [78, 119, 161, 115, 9, 167, 75, 125]
const INITIALIZE_INVENTORY_DISCRIMINATOR = [75, 221, 38, 238, 9, 187, 237, 157]
const DELEGATE_INVENTORY_DISCRIMINATOR = [185, 222, 138, 162, 115, 247, 74, 17]
const DELEGATE_MACHINE_DISCRIMINATOR = [201, 113, 190, 89, 83, 131, 32, 159]
const RECORD_INVENTORY_ITEM_DISCRIMINATOR = [192, 238, 192, 106, 13, 86, 151, 68]
const COMMIT_GACHA_STATE_DISCRIMINATOR = [249, 246, 24, 84, 170, 90, 154, 33]
const CLAIM_ASSET_DISCRIMINATOR = [119, 221, 133, 37, 88, 35, 185, 12]
const INSTANT_BUYBACK_DISCRIMINATOR = [143, 250, 23, 87, 23, 138, 241, 94]

const MACHINE_DISCRIMINATOR = [25, 102, 22, 13, 58, 243, 138, 79]
const PENDING_PULL_DISCRIMINATOR = [97, 135, 113, 202, 214, 223, 118, 91]
const PULL_STATUS_SETTLED = 1
const ASSET_V1_KEY = 1
const PLUGIN_HEADER_V1_KEY = 3
const PLUGIN_REGISTRY_V1_KEY = 4
const ATTRIBUTES_PLUGIN_TYPE = 6

export function devnetConnection() {
  return new Connection(DEVNET_RPC_URL, 'confirmed')
}

export function erDevnetConnection() {
  return new Connection(ER_DEVNET_RPC_URL, 'confirmed')
}

export function explorerAddress(address: PublicKey | string) {
  return `https://explorer.solana.com/address/${address.toString()}?cluster=devnet`
}

export function explorerTx(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`
}

export function explorerErAddress(address: PublicKey | string) {
  return `https://explorer.solana.com/address/${address.toString()}?cluster=custom&customUrl=${encodeURIComponent(ER_DEVNET_RPC_URL)}`
}

export function explorerErTx(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(ER_DEVNET_RPC_URL)}`
}

export function shortKey(value: PublicKey | string) {
  const text = value.toString()
  return `${text.slice(0, 4)}...${text.slice(-4)}`
}

export function machineIdFromPublicKey(publicKey: PublicKey) {
  const bytes = publicKey.toBytes()
  let machineId = 0n

  for (let index = 0; index < 8; index += 1) {
    machineId |= BigInt(bytes[index]) << BigInt(index * 8)
  }

  return machineId
}

export function findGachaponAccounts(
  player: PublicKey,
  machineId = machineIdFromPublicKey(player),
  pullId = 1n,
): GachaponAccounts {
  const machine = findPda([stringSeed(MACHINE_SEED), player.toBuffer(), u64Le(machineId)])

  return {
    machineId,
    machine,
    treasury: findPda([stringSeed(TREASURY_SEED), machine.toBuffer()]),
    updateAuthority: findPda([stringSeed(UPDATE_AUTHORITY_SEED), machine.toBuffer()]),
    callbackIdentity: findPda([stringSeed(VRF_IDENTITY_SEED)]),
    pendingPull: findPda([stringSeed(PULL_SEED), machine.toBuffer(), player.toBuffer(), u64Le(pullId)]),
    asset: findPda([stringSeed(ASSET_SEED), machine.toBuffer(), player.toBuffer(), u64Le(pullId)]),
    pullId,
  }
}

export function findInventoryAddress(player: PublicKey) {
  return findPda([stringSeed(INVENTORY_SEED), player.toBuffer()])
}

export function findAssociatedTokenAddress(owner: PublicKey, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0]
}

export function buildCreateAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  })
}

export function buildTransferCheckedInstruction(
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint,
  decimals: number,
) {
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: concatBuffers(Buffer.from([12]), u64Le(amount), Buffer.from([decimals])),
  })
}

export function buildInitializeInventoryInstruction(player: PublicKey) {
  const inventory = findInventoryAddress(player)
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: inventory, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(INITIALIZE_INVENTORY_DISCRIMINATOR),
  })
}

export function buildDelegateInventoryInstruction(player: PublicKey) {
  const inventory = findInventoryAddress(player)
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      {
        pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(inventory, PROGRAM_ID),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: delegationRecordPdaFromDelegatedAccount(inventory), isSigner: false, isWritable: true },
      { pubkey: delegationMetadataPdaFromDelegatedAccount(inventory), isSigner: false, isWritable: true },
      { pubkey: inventory, isSigner: false, isWritable: true },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASIA_ER_VALIDATOR, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(DELEGATE_INVENTORY_DISCRIMINATOR),
  })
}

export function buildDelegateMachineInstruction(player: PublicKey, accounts: GachaponAccounts) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      {
        pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(accounts.machine, PROGRAM_ID),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: delegationRecordPdaFromDelegatedAccount(accounts.machine), isSigner: false, isWritable: true },
      { pubkey: delegationMetadataPdaFromDelegatedAccount(accounts.machine), isSigner: false, isWritable: true },
      { pubkey: accounts.machine, isSigner: false, isWritable: true },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASIA_ER_VALIDATOR, isSigner: false, isWritable: false },
    ],
    data: concatBuffers(Buffer.from(DELEGATE_MACHINE_DISCRIMINATOR), u64Le(accounts.machineId)),
  })
}

export function buildPreparePullInstruction(player: PublicKey, accounts: GachaponAccounts) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: accounts.machine, isSigner: false, isWritable: false },
      { pubkey: accounts.pendingPull, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concatBuffers(Buffer.from(PREPARE_PULL_DISCRIMINATOR), u64Le(accounts.pullId)),
  })
}

export function buildPreparePaidPullInstruction(player: PublicKey, accounts: GachaponAccounts) {
  const playerUsdc = findAssociatedTokenAddress(player, DEVNET_USDC_MINT)
  const treasuryUsdc = findAssociatedTokenAddress(accounts.treasury, DEVNET_USDC_MINT)

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: accounts.machine, isSigner: false, isWritable: false },
      { pubkey: accounts.treasury, isSigner: false, isWritable: false },
      { pubkey: accounts.pendingPull, isSigner: false, isWritable: true },
      { pubkey: DEVNET_USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: playerUsdc, isSigner: false, isWritable: true },
      { pubkey: treasuryUsdc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concatBuffers(Buffer.from(PREPARE_PAID_PULL_DISCRIMINATOR), u64Le(accounts.pullId)),
  })
}

export function buildDelegatePendingPullInstruction(player: PublicKey, accounts: GachaponAccounts) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: accounts.machine, isSigner: false, isWritable: false },
      {
        pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(accounts.pendingPull, PROGRAM_ID),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: delegationRecordPdaFromDelegatedAccount(accounts.pendingPull), isSigner: false, isWritable: true },
      { pubkey: delegationMetadataPdaFromDelegatedAccount(accounts.pendingPull), isSigner: false, isWritable: true },
      { pubkey: accounts.pendingPull, isSigner: false, isWritable: true },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASIA_ER_VALIDATOR, isSigner: false, isWritable: false },
    ],
    data: concatBuffers(Buffer.from(DELEGATE_PENDING_PULL_DISCRIMINATOR), u64Le(accounts.pullId)),
  })
}

export function buildRecordInventoryItemInstruction(player: PublicKey, asset: PublicKey, rewardId: number) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: false },
      { pubkey: findInventoryAddress(player), isSigner: false, isWritable: true },
    ],
    data: concatBuffers(Buffer.from(RECORD_INVENTORY_ITEM_DISCRIMINATOR), asset.toBuffer(), Buffer.from([rewardId])),
  })
}

export function buildInitInstruction(player: PublicKey, accounts: GachaponAccounts) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: accounts.machine, isSigner: false, isWritable: true },
      { pubkey: accounts.treasury, isSigner: false, isWritable: true },
      { pubkey: accounts.updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concatBuffers(Buffer.from(INIT_DISCRIMINATOR), u64Le(accounts.machineId)),
  })
}

export function buildUploadConfigInstruction(player: PublicKey, accounts: GachaponAccounts) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: false },
      { pubkey: accounts.machine, isSigner: false, isWritable: true },
    ],
    data: concatBuffers(Buffer.from(UPLOAD_CONFIG_DISCRIMINATOR), ...REWARDS.map(encodeRewardTemplate)),
  })
}

export function buildPullInstruction(player: PublicKey, accounts: GachaponAccounts, clientSeed: number) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: accounts.machine, isSigner: false, isWritable: true },
      { pubkey: accounts.pendingPull, isSigner: false, isWritable: true },
      { pubkey: findInventoryAddress(player), isSigner: false, isWritable: true },
      { pubkey: accounts.callbackIdentity, isSigner: false, isWritable: false },
      { pubkey: DEFAULT_VRF_QUEUE, isSigner: false, isWritable: true },
      { pubkey: VRF_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SLOT_HASHES, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concatBuffers(Buffer.from(PULL_DISCRIMINATOR), u64Le(accounts.pullId), Buffer.from([clientSeed])),
  })
}

export function buildCommitGachaStateInstruction(player: PublicKey, accounts: GachaponAccounts) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: accounts.machine, isSigner: false, isWritable: true },
      { pubkey: accounts.pendingPull, isSigner: false, isWritable: true },
      { pubkey: findInventoryAddress(player), isSigner: false, isWritable: true },
      { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(COMMIT_GACHA_STATE_DISCRIMINATOR),
  })
}

export function buildClaimAssetInstruction(player: PublicKey, accounts: GachaponAccounts) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: accounts.machine, isSigner: false, isWritable: true },
      { pubkey: accounts.pendingPull, isSigner: false, isWritable: true },
      { pubkey: accounts.asset, isSigner: false, isWritable: true },
      { pubkey: accounts.treasury, isSigner: false, isWritable: true },
      { pubkey: accounts.updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: concatBuffers(Buffer.from(CLAIM_ASSET_DISCRIMINATOR), u64Le(accounts.pullId)),
  })
}

export function buildInstantBuybackInstruction(player: PublicKey, accounts: GachaponAccounts) {
  const playerUsdc = findAssociatedTokenAddress(player, DEVNET_USDC_MINT)
  const treasuryUsdc = findAssociatedTokenAddress(accounts.treasury, DEVNET_USDC_MINT)

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: accounts.machine, isSigner: false, isWritable: false },
      { pubkey: accounts.pendingPull, isSigner: false, isWritable: false },
      { pubkey: accounts.asset, isSigner: false, isWritable: true },
      { pubkey: accounts.treasury, isSigner: false, isWritable: false },
      { pubkey: DEVNET_USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: treasuryUsdc, isSigner: false, isWritable: true },
      { pubkey: playerUsdc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: concatBuffers(Buffer.from(INSTANT_BUYBACK_DISCRIMINATOR), u64Le(accounts.pullId)),
  })
}

export function decodeMachine(data: Buffer): MachineAccount {
  assertDiscriminator(data, MACHINE_DISCRIMINATOR)
  const cursor = { offset: 8 }
  const authority = readPubkey(data, cursor)
  const machineId = readU64(data, cursor)
  readU8(data, cursor)
  readU8(data, cursor)
  readU8(data, cursor)
  const totalWeight = readU32(data, cursor)
  const pullCount = readU64(data, cursor)
  const rewards = Array.from({ length: 4 }, () => ({
    rewardId: readU8(data, cursor),
    weight: readU32(data, cursor),
    mintedCount: readU64(data, cursor),
    name: readString(data, cursor),
    uri: readString(data, cursor),
  }))

  return { authority, machineId, totalWeight, pullCount, rewards }
}

export function decodePendingPull(data: Buffer): PendingPullAccount {
  assertDiscriminator(data, PENDING_PULL_DISCRIMINATOR)
  const cursor = { offset: 8 }

  return {
    machine: readPubkey(data, cursor),
    player: readPubkey(data, cursor),
    asset: readPubkey(data, cursor),
    pullId: readU64(data, cursor),
    rewardId: readU8(data, cursor),
    status: readU8(data, cursor),
  }
}

export function decodeCoreAsset(data: Buffer): CoreAssetAccount {
  const cursor = { offset: 0 }
  if (readU8(data, cursor) !== ASSET_V1_KEY) {
    throw new Error('Account is not a Core asset')
  }

  const owner = readPubkey(data, cursor)
  const updateAuthorityVariant = readU8(data, cursor)
  let updateAuthority: PublicKey | null = null

  if (updateAuthorityVariant === 1 || updateAuthorityVariant === 2) {
    updateAuthority = readPubkey(data, cursor)
  }

  const name = readString(data, cursor)
  const uri = readString(data, cursor)
  const seqVariant = readU8(data, cursor)
  if (seqVariant === 1) {
    readU64(data, cursor)
  }

  let attributes = new Map<string, string>()
  if (cursor.offset < data.length) {
    const headerKey = readU8(data, cursor)
    if (headerKey === PLUGIN_HEADER_V1_KEY) {
      attributes = readPluginRegistry(data, Number(readU64(data, cursor)))
    }
  }

  return { owner, updateAuthority, name, uri, attributes }
}

export function isSettled(pull: PendingPullAccount) {
  return pull.status === PULL_STATUS_SETTLED
}

function findPda(seeds: Array<Buffer | Uint8Array>) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0]
}

function stringSeed(value: string) {
  return Buffer.from(value)
}

function concatBuffers(...buffers: Buffer[]) {
  const output = Buffer.alloc(buffers.reduce((size, buffer) => size + buffer.length, 0))
  let offset = 0
  for (const buffer of buffers) {
    for (let index = 0; index < buffer.length; index += 1) {
      output[offset + index] = buffer[index]
    }
    offset += buffer.length
  }
  return output
}

function encodeRewardTemplate(reward: RewardTemplate) {
  return concatBuffers(u32Le(reward.weight), encodeString(reward.name), encodeString(reward.uri))
}

function encodeString(value: string) {
  const bytes = Buffer.from(value, 'utf8')
  return concatBuffers(u32Le(bytes.length), bytes)
}

function u32Le(value: number) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value, 0)
  return buffer
}

function u64Le(value: bigint) {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64LE(value, 0)
  return buffer
}

function readU8(data: Buffer, cursor: Cursor) {
  const value = data.readUInt8(cursor.offset)
  cursor.offset += 1
  return value
}

function readU32(data: Buffer, cursor: Cursor) {
  const value = data.readUInt32LE(cursor.offset)
  cursor.offset += 4
  return value
}

function readU64(data: Buffer, cursor: Cursor) {
  const value = data.readBigUInt64LE(cursor.offset)
  cursor.offset += 8
  return value
}

function readPubkey(data: Buffer, cursor: Cursor) {
  const value = new PublicKey(data.subarray(cursor.offset, cursor.offset + 32))
  cursor.offset += 32
  return value
}

function readString(data: Buffer, cursor: Cursor) {
  const length = readU32(data, cursor)
  const value = data.toString('utf8', cursor.offset, cursor.offset + length)
  cursor.offset += length
  return value
}

function readPluginAuthority(data: Buffer, cursor: Cursor) {
  const variant = readU8(data, cursor)
  if (variant === 3) {
    readPubkey(data, cursor)
  }
}

function readPluginRegistry(data: Buffer, offset: number) {
  const cursor = { offset }
  const registryKey = readU8(data, cursor)
  if (registryKey !== PLUGIN_REGISTRY_V1_KEY) {
    return new Map<string, string>()
  }

  const registryCount = readU32(data, cursor)
  for (let index = 0; index < registryCount; index += 1) {
    const pluginType = readU8(data, cursor)
    readPluginAuthority(data, cursor)
    const pluginOffset = Number(readU64(data, cursor))

    if (pluginType === ATTRIBUTES_PLUGIN_TYPE) {
      return readAttributesPlugin(data, pluginOffset)
    }
  }

  return new Map<string, string>()
}

function readAttributesPlugin(data: Buffer, offset: number) {
  const cursor = { offset }
  const pluginVariant = readU8(data, cursor)
  if (pluginVariant !== ATTRIBUTES_PLUGIN_TYPE) {
    return new Map<string, string>()
  }

  const attributes = new Map<string, string>()
  const attributeCount = readU32(data, cursor)
  for (let index = 0; index < attributeCount; index += 1) {
    attributes.set(readString(data, cursor), readString(data, cursor))
  }

  return attributes
}

function assertDiscriminator(data: Buffer, discriminator: number[]) {
  if (data.length < discriminator.length) {
    throw new Error('Account data is too short')
  }

  for (let index = 0; index < discriminator.length; index += 1) {
    if (data[index] !== discriminator[index]) {
      throw new Error('Unexpected account discriminator')
    }
  }
}

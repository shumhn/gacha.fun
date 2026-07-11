import fs from 'node:fs'
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from '@solana/web3.js'
import {
  ASIA_ER_VALIDATOR,
  DEFAULT_VRF_QUEUE,
  MPL_CORE_PROGRAM_ID,
  PROGRAM_ID,
  SLOT_HASHES,
  VRF_PROGRAM_ID,
} from '../scripts/smoke-constants.mjs'
import {
  DELEGATION_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  delegationMetadataPdaFromDelegatedAccount,
  delegationRecordPdaFromDelegatedAccount,
} from '@magicblock-labs/ephemeral-rollups-sdk'

const BASE_RPC = 'https://rpc.magicblock.app/devnet'
const ER_RPC = 'https://devnet-as.magicblock.app'
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')
const walletPath = process.env.SOLANA_WALLET ?? '/Users/sumangiri/Desktop/Homie/keys/payroll-authority.json'
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8'))))
const base = new Connection(BASE_RPC, 'confirmed')
const er = new Connection(ER_RPC, 'confirmed')

const seeds = {
  machine: Buffer.from('machine'),
  treasury: Buffer.from('treasury'),
  updateAuthority: Buffer.from('update_authority'),
  callbackIdentity: Buffer.from('identity'),
  pull: Buffer.from('pull'),
  asset: Buffer.from('asset'),
  inventory: Buffer.from('inventory'),
}

const discriminator = {
  init: Buffer.from([220, 59, 207, 236, 108, 250, 47, 100]),
  config: Buffer.from([89, 32, 45, 158, 27, 66, 0, 213]),
  preparePull: Buffer.from([102, 65, 11, 37, 47, 233, 46, 176]),
  preparePaidPull: Buffer.from([29, 154, 7, 173, 185, 131, 13, 134]),
  delegatePendingPull: Buffer.from([69, 111, 5, 1, 176, 180, 232, 193]),
  pull: Buffer.from([78, 119, 161, 115, 9, 167, 75, 125]),
  initializeInventory: Buffer.from([75, 221, 38, 238, 9, 187, 237, 157]),
  delegateInventory: Buffer.from([185, 222, 138, 162, 115, 247, 74, 17]),
  delegateMachine: Buffer.from([201, 113, 190, 89, 83, 131, 32, 159]),
  recordInventory: Buffer.from([192, 238, 192, 106, 13, 86, 151, 68]),
  commitGachaState: Buffer.from([249, 246, 24, 84, 170, 90, 154, 33]),
  claimAsset: Buffer.from([119, 221, 133, 37, 88, 35, 185, 12]),
}

const rewards = [
  [
    55,
    'Mossbyte',
    'data:application/json;base64,eyJuYW1lIjoiTW9zc2J5dGUiLCJzeW1ib2wiOiJWT0lEIiwiZGVzY3JpcHRpb24iOiJDb21tb24gR2VuZXNpcyBTaWduYWwgY29sbGVjdGlibGUuIn0=',
  ],
  [
    30,
    'Neon Warden',
    'data:application/json;base64,eyJuYW1lIjoiTmVvbiBXYXJkZW4iLCJzeW1ib2wiOiJWT0lEIiwiZGVzY3JpcHRpb24iOiJSYXJlIEdlbmVzaXMgU2lnbmFsIGNvbGxlY3RpYmxlLiJ9',
  ],
  [
    12,
    'Hollow Seraph',
    'data:application/json;base64,eyJuYW1lIjoiSG9sbG93IFNlcmFwaCIsInN5bWJvbCI6IlZPSUQiLCJkZXNjcmlwdGlvbiI6IkVwaWMgR2VuZXNpcyBTaWduYWwgY29sbGVjdGlibGUuIn0=',
  ],
  [
    3,
    'Null Titan',
    'data:application/json;base64,eyJuYW1lIjoiTnVsbCBUaXRhbiIsInN5bWJvbCI6IlZPSUQiLCJkZXNjcmlwdGlvbiI6IkxlZ2VuZGFyeSBHZW5lc2lzIFNpZ25hbCBjb2xsZWN0aWJsZS4ifQ==',
  ],
]

function pda(parts) {
  return PublicKey.findProgramAddressSync(parts, PROGRAM_ID)[0]
}

function u32(value) {
  const data = Buffer.alloc(4)
  data.writeUInt32LE(value)
  return data
}

function u64(value) {
  const data = Buffer.alloc(8)
  data.writeBigUInt64LE(value)
  return data
}

function text(value) {
  const data = Buffer.from(value)
  return Buffer.concat([u32(data.length), data])
}

function machineIdFromKey(key) {
  return key.toBuffer().readBigUInt64LE(0)
}

function ata(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0]
}

function createAtaInstruction(payerKey, tokenAccount, owner, mint) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payerKey, isSigner: true, isWritable: true },
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  })
}

async function send(connection, instructions, skipPreflight = false) {
  const latest = await connection.getLatestBlockhash('confirmed')
  const tx = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(...instructions)
  tx.sign(payer)
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight, maxRetries: 5 })
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
  return signature
}

async function waitFor(connection, address, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const info = await connection.getAccountInfo(address, 'confirmed')
    if (info) return info
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`Timed out waiting for ${address}`)
}

async function waitForSettledPullOnBase(address, timeoutMs = 90_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const info = await base.getAccountInfo(address, 'confirmed')
    if (info && info.data.readUInt8(113) === 1) return info
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`Timed out waiting for committed settled pull ${address}`)
}

async function main() {
  const machineId = machineIdFromKey(payer.publicKey)
  const machine = pda([seeds.machine, payer.publicKey.toBuffer(), u64(machineId)])
  const treasury = pda([seeds.treasury, machine.toBuffer()])
  const updateAuthority = pda([seeds.updateAuthority, machine.toBuffer()])
  const callbackIdentity = pda([seeds.callbackIdentity])
  const inventory = pda([seeds.inventory, payer.publicKey.toBuffer()])
  let machineInfo = await base.getAccountInfo(machine)

  if (!machineInfo) {
    const init = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: machine, isSigner: false, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: updateAuthority, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([discriminator.init, u64(machineId)]),
    })
    const config = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: machine, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([
        discriminator.config,
        ...rewards.map(([weight, name, uri]) => Buffer.concat([u32(weight), text(name), text(uri)])),
      ]),
    })
    console.log('machine', await send(base, [init, config]))
    machineInfo = await waitFor(base, machine)
  }

  if (!machineInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
    const delegateMachine = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        {
          pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(machine, PROGRAM_ID),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: delegationRecordPdaFromDelegatedAccount(machine), isSigner: false, isWritable: true },
        { pubkey: delegationMetadataPdaFromDelegatedAccount(machine), isSigner: false, isWritable: true },
        { pubkey: machine, isSigner: false, isWritable: true },
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ASIA_ER_VALIDATOR, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([discriminator.delegateMachine, u64(machineId)]),
    })
    console.log('machine-delegate', await send(base, [delegateMachine]))
  }
  await waitFor(er, machine, 30_000)

  let inventoryInfo = await base.getAccountInfo(inventory)
  if (!inventoryInfo) {
    const initializeInventory = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: inventory, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: discriminator.initializeInventory,
    })
    console.log('inventory-init', await send(base, [initializeInventory]))
    inventoryInfo = await waitFor(base, inventory)
  }

  if (!inventoryInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
    const delegateInventory = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
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
      data: discriminator.delegateInventory,
    })
    console.log('inventory-delegate', await send(base, [delegateInventory]))
  }
  await waitFor(er, inventory, 30_000)

  machineInfo = (await er.getAccountInfo(machine)) ?? (await base.getAccountInfo(machine))
  const pullId = machineInfo.data.readBigUInt64LE(55) + 1n
  const pendingPull = pda([seeds.pull, machine.toBuffer(), payer.publicKey.toBuffer(), u64(pullId)])
  const asset = pda([seeds.asset, machine.toBuffer(), payer.publicKey.toBuffer(), u64(pullId)])
  const pendingBaseInfo = await base.getAccountInfo(pendingPull)
  if (!pendingBaseInfo) {
    const payerUsdc = ata(payer.publicKey, DEVNET_USDC_MINT)
    const treasuryUsdc = ata(treasury, DEVNET_USDC_MINT)
    const payerUsdcBalance = await base.getTokenAccountBalance(payerUsdc).catch(() => null)
    if (!payerUsdcBalance || BigInt(payerUsdcBalance.value.amount) < 1_000_000n) {
      throw new Error(`Smoke wallet needs at least 1 Devnet USDC in ${payerUsdc.toBase58()}`)
    }

    const prepareInstructions = []
    if (!(await base.getAccountInfo(treasuryUsdc))) {
      prepareInstructions.push(createAtaInstruction(payer.publicKey, treasuryUsdc, treasury, DEVNET_USDC_MINT))
    }

    const preparePaidPull = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: machine, isSigner: false, isWritable: false },
        { pubkey: treasury, isSigner: false, isWritable: false },
        { pubkey: pendingPull, isSigner: false, isWritable: true },
        { pubkey: DEVNET_USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: payerUsdc, isSigner: false, isWritable: true },
        { pubkey: treasuryUsdc, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([discriminator.preparePaidPull, u64(pullId)]),
    })
    prepareInstructions.push(preparePaidPull)
    console.log('paid-pull-prepare', await send(base, prepareInstructions))

    const delegatePendingPull = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: machine, isSigner: false, isWritable: false },
        {
          pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(pendingPull, PROGRAM_ID),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: delegationRecordPdaFromDelegatedAccount(pendingPull), isSigner: false, isWritable: true },
        { pubkey: delegationMetadataPdaFromDelegatedAccount(pendingPull), isSigner: false, isWritable: true },
        { pubkey: pendingPull, isSigner: false, isWritable: true },
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ASIA_ER_VALIDATOR, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([discriminator.delegatePendingPull, u64(pullId)]),
    })
    console.log('pull-delegate', await send(base, [delegatePendingPull]))
  }
  await waitFor(er, pendingPull, 30_000)

  const pull = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: machine, isSigner: false, isWritable: true },
      { pubkey: pendingPull, isSigner: false, isWritable: true },
      { pubkey: inventory, isSigner: false, isWritable: true },
      { pubkey: callbackIdentity, isSigner: false, isWritable: false },
      { pubkey: DEFAULT_VRF_QUEUE, isSigner: false, isWritable: true },
      { pubkey: VRF_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SLOT_HASHES, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator.pull, u64(pullId), Buffer.from([Math.floor(Math.random() * 256)])]),
  })
  console.log('er-vrf-request', await send(er, [pull], true))

  const pendingInfo = await waitFor(er, pendingPull, 90_000)
  const rewardId = pendingInfo.data.readUInt8(112)
  if (pendingInfo.data.readUInt8(113) !== 1) throw new Error('Pull callback did not settle')

  const commit = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: machine, isSigner: false, isWritable: true },
      { pubkey: pendingPull, isSigner: false, isWritable: true },
      { pubkey: inventory, isSigner: false, isWritable: true },
      { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
    ],
    data: discriminator.commitGachaState,
  })
  console.log('er-commit', await send(er, [commit], true))
  await waitForSettledPullOnBase(pendingPull)

  const claim = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: false, isWritable: false },
      { pubkey: machine, isSigner: false, isWritable: true },
      { pubkey: pendingPull, isSigner: false, isWritable: true },
      { pubkey: asset, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator.claimAsset, u64(pullId)]),
  })
  console.log('base-claim', await send(base, [claim]))
  const assetInfo = await waitFor(base, asset, 90_000)
  console.log(
    JSON.stringify({ program: PROGRAM_ID.toString(), asset: asset.toString(), bytes: assetInfo.data.length, rewardId }),
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

import fs from 'node:fs'
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from '@solana/web3.js'
import { MPL_CORE_PROGRAM_ID, PROGRAM_ID } from './smoke-constants.mjs'

const BASE_RPC = 'https://rpc.magicblock.app/devnet'
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')
const SELLER_KEY = process.env.SELLER_WALLET ?? '/Users/sumangiri/Desktop/Homie/keys/payroll-authority.json'
const BUYER_KEY = process.env.BUYER_WALLET ?? '/Users/sumangiri/Desktop/Homie/keys/employee.json'
const LIST_PRICE = BigInt(process.env.LIST_PRICE_USDC_UNITS ?? '100000')
const base = new Connection(BASE_RPC, 'confirmed')
const seller = readKeypair(SELLER_KEY)
const buyer = readKeypair(BUYER_KEY)

const seeds = {
  machine: Buffer.from('machine'),
  treasury: Buffer.from('treasury'),
  updateAuthority: Buffer.from('update_authority'),
  pull: Buffer.from('pull'),
  asset: Buffer.from('asset'),
  listing: Buffer.from('listing'),
  sale: Buffer.from('sale'),
}

const discriminator = {
  createListing: Buffer.from([18, 168, 45, 24, 191, 31, 117, 54]),
  buyListing: Buffer.from([115, 149, 42, 108, 44, 49, 140, 153]),
}

function readKeypair(path) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, 'utf8'))))
}

function pda(parts) {
  return PublicKey.findProgramAddressSync(parts, PROGRAM_ID)[0]
}

function u64(value) {
  const data = Buffer.alloc(8)
  data.writeBigUInt64LE(BigInt(value))
  return data
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

function transferCheckedInstruction(source, destination, owner, amount) {
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: DEVNET_USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([12]), u64(amount), Buffer.from([6])]),
  })
}

async function send(signer, instructions) {
  const latest = await base.getLatestBlockhash('confirmed')
  const tx = new Transaction({
    feePayer: signer.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(...instructions)
  tx.sign(signer)
  const signature = await base.sendRawTransaction(tx.serialize(), { maxRetries: 5 })
  await base.confirmTransaction({ signature, ...latest }, 'confirmed')
  return signature
}

async function ensureSol(keypair) {
  const balance = await base.getBalance(keypair.publicKey, 'confirmed')
  if (balance >= 100_000_000) return
  console.log(
    'buyer-sol-fund',
    await send(seller, [
      SystemProgram.transfer({
        fromPubkey: seller.publicKey,
        toPubkey: keypair.publicKey,
        lamports: 250_000_000,
      }),
    ]),
  )
}

async function ensureBuyerUsdc() {
  const sellerUsdc = ata(seller.publicKey, DEVNET_USDC_MINT)
  const buyerUsdc = ata(buyer.publicKey, DEVNET_USDC_MINT)
  const instructions = []
  if (!(await base.getAccountInfo(buyerUsdc, 'confirmed'))) {
    instructions.push(createAtaInstruction(seller.publicKey, buyerUsdc, buyer.publicKey, DEVNET_USDC_MINT))
  }

  const balance = await base.getTokenAccountBalance(buyerUsdc, 'confirmed').catch(() => null)
  if (!balance || BigInt(balance.value.amount) < LIST_PRICE) {
    instructions.push(transferCheckedInstruction(sellerUsdc, buyerUsdc, seller.publicKey, LIST_PRICE))
  }

  if (instructions.length) {
    console.log('buyer-usdc-fund', await send(seller, instructions))
  }
}

function readCoreOwner(data) {
  if (data.readUInt8(0) !== 1) throw new Error('Not a Metaplex Core asset')
  return new PublicKey(data.subarray(1, 33))
}

async function findSellerAsset() {
  const machineId = machineIdFromKey(seller.publicKey)
  const machine = pda([seeds.machine, seller.publicKey.toBuffer(), u64(machineId)])
  const machineInfo = await base.getAccountInfo(machine, 'confirmed')
  if (!machineInfo) throw new Error('Seller machine not initialized')
  const pullCount = Number(machineInfo.data.readBigUInt64LE(55))

  for (let pullId = pullCount; pullId >= 1; pullId -= 1) {
    const pendingPull = pda([seeds.pull, machine.toBuffer(), seller.publicKey.toBuffer(), u64(pullId)])
    const asset = pda([seeds.asset, machine.toBuffer(), seller.publicKey.toBuffer(), u64(pullId)])
    const listing = pda([seeds.listing, asset.toBuffer()])
    if (await base.getAccountInfo(listing, 'confirmed')) continue

    const assetInfo = await base.getAccountInfo(asset, 'confirmed')
    if (!assetInfo) continue
    const owner = readCoreOwner(Buffer.from(assetInfo.data))
    if (!owner.equals(seller.publicKey)) continue

    return { machine, pendingPull, asset, listing, pullId: BigInt(pullId) }
  }

  throw new Error('No unlisted seller-owned asset found')
}

async function main() {
  await ensureSol(buyer)
  await ensureBuyerUsdc()

  const target = await findSellerAsset()
  const createListing = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: seller.publicKey, isSigner: true, isWritable: true },
      { pubkey: target.machine, isSigner: false, isWritable: false },
      { pubkey: target.pendingPull, isSigner: false, isWritable: false },
      { pubkey: target.asset, isSigner: false, isWritable: true },
      { pubkey: target.listing, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator.createListing, u64(target.pullId), u64(LIST_PRICE)]),
  })
  const listTx = await send(seller, [createListing])
  const listedOwner = readCoreOwner(Buffer.from((await base.getAccountInfo(target.asset, 'confirmed')).data))
  if (!listedOwner.equals(target.listing)) throw new Error('Asset did not move into listing escrow')

  const buyerUsdc = ata(buyer.publicKey, DEVNET_USDC_MINT)
  const sellerUsdc = ata(seller.publicKey, DEVNET_USDC_MINT)
  const saleNonce = BigInt(Date.now())
  const saleRecord = pda([seeds.sale, target.asset.toBuffer(), u64(saleNonce)])
  const buyListing = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
      { pubkey: seller.publicKey, isSigner: false, isWritable: true },
      { pubkey: target.asset, isSigner: false, isWritable: true },
      { pubkey: target.listing, isSigner: false, isWritable: true },
      { pubkey: saleRecord, isSigner: false, isWritable: true },
      { pubkey: DEVNET_USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: buyerUsdc, isSigner: false, isWritable: true },
      { pubkey: sellerUsdc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator.buyListing, u64(saleNonce)]),
  })
  const buyTx = await send(buyer, [buyListing])
  const finalOwner = readCoreOwner(Buffer.from((await base.getAccountInfo(target.asset, 'confirmed')).data))
  if (!finalOwner.equals(buyer.publicKey)) throw new Error('Asset did not transfer to buyer')

  console.log(
    JSON.stringify({
      asset: target.asset.toString(),
      listing: target.listing.toString(),
      saleRecord: saleRecord.toString(),
      listTx,
      buyTx,
      finalOwner: finalOwner.toString(),
      priceUsdcUnits: LIST_PRICE.toString(),
    }),
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

import fs from 'node:fs'
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'

const RPC = 'https://rpc.magicblock.app/devnet'
const PROGRAM_ID = new PublicKey('7oRzpny8E6JyVXkUfAxx9SE4y7VFy3s3DmKNXDSyivo6')
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const walletPath = process.env.SOLANA_WALLET ?? '/Users/sumangiri/Desktop/Homie/keys/payroll-authority.json'
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8'))))
const connection = new Connection(RPC, 'confirmed')

const u64 = (value) => {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64LE(BigInt(value))
  return buffer
}
const i64 = (value) => {
  const buffer = Buffer.alloc(8)
  buffer.writeBigInt64LE(BigInt(value))
  return buffer
}
const jackpot = PublicKey.findProgramAddressSync([Buffer.from('jackpot')], PROGRAM_ID)[0]
const roundId = 1n
const round = PublicKey.findProgramAddressSync([Buffer.from('jackpot_round'), jackpot.toBuffer(), u64(roundId)], PROGRAM_ID)[0]
const vault = PublicKey.findProgramAddressSync([jackpot.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MINT.toBuffer()], ATA_PROGRAM_ID)[0]

const initialize = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: jackpot, isSigner: false, isWritable: true },
    { pubkey: round, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([
    Buffer.from([203, 117, 104, 67, 62, 238, 90, 170]),
    u64(roundId),
    i64(BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60)),
  ]),
})

const createVault = new TransactionInstruction({
  programId: ATA_PROGRAM_ID,
  keys: [
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: jackpot, isSigner: false, isWritable: false },
    { pubkey: USDC_MINT, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ],
  data: Buffer.alloc(0),
})

if (!(await connection.getAccountInfo(jackpot, 'confirmed'))) {
  const transaction = new Transaction().add(initialize)
  if (!(await connection.getAccountInfo(vault, 'confirmed'))) transaction.add(createVault)
  transaction.feePayer = authority.publicKey
  const latest = await connection.getLatestBlockhash('confirmed')
  transaction.recentBlockhash = latest.blockhash
  transaction.sign(authority)
  const signature = await connection.sendRawTransaction(transaction.serialize())
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
  console.log('initialize-signature', signature)
}

console.log('jackpot', jackpot.toBase58())
console.log('round', round.toBase58())
console.log('vault', vault.toBase58())

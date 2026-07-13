import assert from 'node:assert/strict'
import test from 'node:test'
import { PublicKey } from '@solana/web3.js'
import { DELEGATION_PROGRAM_ID } from '@magicblock-labs/ephemeral-rollups-sdk'
import {
  DEVNET_USDC_MINT,
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  VRF_PROGRAM_ID,
  DEFAULT_VRF_QUEUE,
  decodeJackpotConfig,
  decodeJackpotRound,
  devnetConnection,
  erDevnetConnection,
  findAssociatedTokenAddress,
  findJackpotAddress,
  findJackpotRoundAddress,
} from '../lib/gachapon-client'

const base = devnetConnection()
const er = erDevnetConnection()
const deploymentSignature = '65zBJDhNVQYXecRTmehdRDMLXufKtwXFYm185pMBs8ih3F8taBCyPEjU9dm3FAJYVaCAmGAKXPUFWb2KUuePs39R'
const initializationSignature = '4ruhHwys1e17PfSC3e4iS9tysWKiHBESWkVPA4rvKbznTWLm3azwLM2vTXEDW4YRA564yJ4qVzcXUzq3ZW2PaYwC'
const delegatedMachine = new PublicKey('GZukh2gvN96KrkGVoE2DCNLRhbAT277zgg7H91hL46Lb')
const delegatedMegaPot = new PublicKey('FpipGEAaf758cgckBvM1HyoR5p97gmz2uxrtAgkbqicJ')

test('Devnet program, VRF program, and queue exist', async () => {
  const [program, vrf, queue] = await Promise.all([
    base.getAccountInfo(PROGRAM_ID, 'confirmed'),
    base.getAccountInfo(VRF_PROGRAM_ID, 'confirmed'),
    base.getAccountInfo(DEFAULT_VRF_QUEUE, 'confirmed'),
  ])
  assert(program?.executable)
  assert(vrf?.executable)
  assert(queue)
})

test('global Jackpot config and current round decode from Devnet', async () => {
  const jackpotAddress = findJackpotAddress()
  const jackpotInfo = await base.getAccountInfo(jackpotAddress, 'confirmed')
  assert(jackpotInfo)
  assert(jackpotInfo.owner.equals(PROGRAM_ID))
  const jackpot = decodeJackpotConfig(Buffer.from(jackpotInfo.data))
  assert.equal(jackpot.currentRound, 1n)
  assert(jackpot.authority.equals(new PublicKey('6BVNKKuaHYYCmykxMD2sRFFFDaiD7Ah9KdcSmFgk1tSK')))

  const roundAddress = findJackpotRoundAddress(jackpot.currentRound)
  const roundInfo = await base.getAccountInfo(roundAddress, 'confirmed')
  assert(roundInfo)
  assert(roundInfo.owner.equals(PROGRAM_ID))
  const round = decodeJackpotRound(Buffer.from(roundInfo.data))
  assert(round.jackpot.equals(jackpotAddress))
  assert.equal(round.roundId, jackpot.currentRound)
  assert([0, 1, 2, 3, 4].includes(round.status))
})

test('global Jackpot vault is the canonical standard Devnet USDC ATA', async () => {
  const jackpot = findJackpotAddress()
  const vault = findAssociatedTokenAddress(jackpot, DEVNET_USDC_MINT)
  assert(vault.equals(new PublicKey('386nUHUS8Zkr41zcNambb2R5xztdrmfCj4kTFCr5V3ZZ')))
  const info = await base.getAccountInfo(vault, 'confirmed')
  assert(info)
  assert(info.owner.equals(TOKEN_PROGRAM_ID))
  assert(new PublicKey(info.data.subarray(0, 32)).equals(DEVNET_USDC_MINT))
  assert(new PublicKey(info.data.subarray(32, 64)).equals(jackpot))
})

test('deployment and Jackpot initialization transactions are confirmed', async () => {
  const statuses = await base.getSignatureStatuses([deploymentSignature, initializationSignature], { searchTransactionHistory: true })
  for (const status of statuses.value) {
    assert(status)
    assert.equal(status.err, null)
    assert(['confirmed', 'finalized'].includes(status.confirmationStatus ?? ''))
  }
})

test('MagicBlock machine and MegaPot are delegated and readable on ER', async () => {
  for (const address of [delegatedMachine, delegatedMegaPot]) {
    const [baseInfo, erInfo] = await Promise.all([
      base.getAccountInfo(address, 'confirmed'),
      er.getAccountInfo(address, 'confirmed'),
    ])
    assert(baseInfo)
    assert(baseInfo.owner.equals(DELEGATION_PROGRAM_ID))
    assert(erInfo)
    assert(erInfo.owner.equals(PROGRAM_ID))
    assert.equal(erInfo.data.length, baseInfo.data.length)
    assert.deepEqual(Buffer.from(erInfo.data.subarray(0, 8)), Buffer.from(baseInfo.data.subarray(0, 8)))
  }
})

test('real MagicBlock ER transaction history exists for the deployed machine', async () => {
  const signatures = await er.getSignaturesForAddress(delegatedMachine, { limit: 5 }, 'confirmed')
  assert(signatures.length > 0)
  assert(signatures.some((entry) => entry.err === null))
  const transaction = await er.getTransaction(signatures.find((entry) => entry.err === null)!.signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  })
  assert(transaction)
  assert.equal(transaction.meta?.err, null)
})

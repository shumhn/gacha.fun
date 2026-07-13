import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js'
import * as client from '../lib/gachapon-client'

const idl = JSON.parse(readFileSync(resolve('target/idl/gachapon_example.json'), 'utf8'))
const player = Keypair.generate().publicKey
const other = Keypair.generate().publicKey
const asset = Keypair.generate().publicKey
const accounts = client.findGachaponAccounts(player, 7n, 3n)
const listing: client.ListingAccount = {
  seller: other,
  asset,
  machine: accounts.machine,
  pendingPull: accounts.pendingPull,
  pullId: 3n,
  rewardId: 4,
  priceUsdcUnits: 5_000_000n,
  status: 0,
  bump: 1,
}

const builders: Record<string, () => TransactionInstruction> = {
  buy_listing: () => client.buildBuyListingInstruction(player, listing, 9n),
  cancel_listing: () => client.buildCancelListingInstruction(player, asset),
  claim_asset: () => client.buildClaimAssetInstruction(player, accounts),
  claim_jackpot: () => client.buildClaimJackpotInstruction(player, 1n),
  close_jackpot_round: () => client.buildCloseJackpotRoundInstruction(player, 1n),
  commit_gacha_state: () => client.buildCommitGachaStateInstruction(player, accounts),
  commit_inventory: () => client.buildCommitInventoryInstruction(player),
  create_listing: () => client.buildCreateListingInstruction(player, accounts, 2_000_000n),
  delegate_inventory: () => client.buildDelegateInventoryInstruction(player),
  delegate_jackpot_round: () => client.buildDelegateJackpotRoundInstruction(player, 1n),
  delegate_machine: () => client.buildDelegateMachineInstruction(player, accounts),
  delegate_megapot: () => client.buildDelegateMegaPotInstruction(player, accounts),
  delegate_pending_pull: () => client.buildDelegatePendingPullInstruction(player, accounts),
  enter_jackpot: () => client.buildEnterJackpotInstruction(player, 1n, asset, accounts.pendingPull),
  finalize_jackpot_draw: () => client.buildFinalizeJackpotDrawInstruction(player, 1n),
  fuse_assets: () => client.buildFuseAssetsInstruction(player, accounts.machine, asset, other, accounts.asset, Keypair.generate().publicKey, 0),
  init: () => client.buildInitInstruction(player, accounts),
  initialize_inventory: () => client.buildInitializeInventoryInstruction(player),
  initialize_jackpot: () => client.buildInitializeJackpotInstruction(player, 1n, 2_000_000_000n),
  initialize_megapot: () => client.buildInitializeMegaPotInstruction(player, accounts, 2_000_000_000n),
  instant_buyback: () => client.buildInstantBuybackInstruction(player, accounts),
  prepare_paid_pull: () => client.buildPreparePaidPullInstruction(player, accounts),
  prepare_pull: () => client.buildPreparePullInstruction(player, accounts),
  pull: () => client.buildPullInstruction(player, accounts, 7),
  record_inventory_item: () => client.buildRecordInventoryItemInstruction(player, asset, 2),
  request_jackpot_draw: () => client.buildRequestJackpotDrawInstruction(player, 1n, 8),
  select_inventory_item: () => client.buildSelectInventoryItemInstruction(player, asset),
  start_next_jackpot_round: () => client.buildStartNextJackpotRoundInstruction(player, 1n, 2_000_000_000n),
  undelegate_inventory: () => client.buildUndelegateInventoryInstruction(player),
  unlock_jackpot_entry: () => client.buildUnlockJackpotEntryInstruction(player, 1n, asset),
  upload_config: () => client.buildUploadConfigInstruction(player, accounts),
}

test('IDL exposes every expected program instruction exactly once', () => {
  const names = idl.instructions.map((instruction: { name: string }) => instruction.name)
  assert.equal(names.length, 34)
  assert.equal(new Set(names).size, names.length)
  assert.deepEqual(
    names.filter((name: string) => !builders[name]).sort(),
    ['consume_jackpot_draw', 'consume_pull', 'process_undelegation'],
    'only VRF/delegation callbacks may be internal-only',
  )
})

for (const instruction of idl.instructions as Array<any>) {
  test(`${instruction.name}: Anchor discriminator is canonical`, () => {
    const expected = [...createHash('sha256').update(`global:${instruction.name}`).digest().subarray(0, 8)]
    assert.deepEqual(instruction.discriminator, expected)
  })

  if (builders[instruction.name]) {
    test(`${instruction.name}: client builder matches IDL signer/writable layout`, () => {
      const built = builders[instruction.name]()
      assert(built.programId.equals(client.PROGRAM_ID))
      assert.deepEqual([...built.data.subarray(0, 8)], instruction.discriminator)
      assert(built.keys.length >= instruction.accounts.length)
      instruction.accounts.forEach((account: any, index: number) => {
        assert.equal(built.keys[index].isSigner, Boolean(account.signer), `${account.name} signer mismatch`)
        assert.equal(built.keys[index].isWritable, Boolean(account.writable), `${account.name} writable mismatch`)
      })
      assert(
        built.keys.length === instruction.accounts.length || instruction.name.startsWith('delegate_'),
        'only delegation builders may append a validator remaining account',
      )
    })
  }
}

test('economic constants are consistent', () => {
  assert.equal(client.PACK_PRICE_USDC_UNITS, 2_000_000n)
  assert.equal(client.TREASURY_PACK_PAYMENT_USDC_UNITS, 1_500_000n)
  assert.equal(client.MEGAPOT_CONTRIBUTION_USDC_UNITS, 500_000n)
  assert.equal(client.TREASURY_PACK_PAYMENT_USDC_UNITS + client.MEGAPOT_CONTRIBUTION_USDC_UNITS, client.PACK_PRICE_USDC_UNITS)
  assert.equal(client.REWARDS.length, 5)
  assert.deepEqual(client.REWARDS.map((reward) => reward.weight), [50, 30, 14, 5, 1])
})

test('global Jackpot PDAs are stable and distinct', () => {
  const jackpot = client.findJackpotAddress()
  const round = client.findJackpotRoundAddress(1n)
  const entry = client.findJackpotEntryAddress(round, asset)
  assert(jackpot.equals(new PublicKey('4U47yVPPivrHEAGtb84wKh8HMnUwopYyrwhQERKAPAPJ')))
  assert(!jackpot.equals(round))
  assert(!round.equals(entry))
})

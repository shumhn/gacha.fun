# STARWEAVER / MATKA Devnet Proof

This is the Devnet mobile gacha app we have been building: paid USDC pulls, MagicBlock Ephemeral Rollup execution, MagicBlock VRF randomness, Metaplex Core asset claims, strict fusion, a custom in-app marketplace, and the MegaPot / Jackpot account system.

The important point: this README is the proof trail. It lists the actual deployed program, base-chain transactions, MagicBlock ER transactions, accounts, and test commands used to verify the app.

## Live Devnet Accounts

| Item | Value |
| --- | --- |
| Program | `7oRzpny8E6JyVXkUfAxx9SE4y7VFy3s3DmKNXDSyivo6` |
| Base RPC | `https://rpc.magicblock.app/devnet` |
| MagicBlock ER RPC | `https://devnet-as.magicblock.app` |
| ER explorer custom URL | `https://devnet-as.magicblock.app` |
| Standard Devnet USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| MagicBlock VRF program | `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz` |
| MagicBlock VRF queue | `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc` |
| ER validator | `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` |
| Delegated machine | `GZukh2gvN96KrkGVoE2DCNLRhbAT277zgg7H91hL46Lb` |
| Delegated MegaPot state | `FpipGEAaf758cgckBvM1HyoR5p97gmz2uxrtAgkbqicJ` |
| Global Jackpot | `4U47yVPPivrHEAGtb84wKh8HMnUwopYyrwhQERKAPAPJ` |
| Jackpot round 1 | `DahbtgeL5u2SDqK583fmHMcngNnLSDoTMmnRVQp1v1QJ` |
| Jackpot USDC vault | `386nUHUS8Zkr41zcNambb2R5xztdrmfCj4kTFCr5V3ZZ` |
| CLI smoke USDC ATA | `7AzWAXJomqK6fU8LcZ2s1PJjfyzKArGiHVSrPREvCWfU` |

## What Uses MagicBlock

The app uses MagicBlock in the actual transaction path, not only in UI text.

1. Base Devnet creates and funds pull state with Devnet USDC.
2. Base Devnet delegates game accounts to MagicBlock ER.
3. MagicBlock ER executes the fast `pull` instruction.
4. `pull` calls the MagicBlock VRF program/queue for random rarity.
5. MagicBlock ER commits the settled result back to base.
6. Base Devnet claims the Metaplex Core asset.

The delegated accounts are readable on the ER endpoint, and live tests verify real ER history for the deployed machine.

## Real MagicBlock ER Transaction Proof

Open these with Solana Explorer using custom cluster URL `https://devnet-as.magicblock.app`.

| Layer | Purpose | Signature | Link |
| --- | --- | --- | --- |
| MagicBlock ER | Successful machine ER tx | `K7RUUu3x2ifVmqzGtVgSgJPUFDSwnKKwcwsSx9heBP1P9KLejDZzPmkrn5heX7QHpiGchsfGbgntnZvzUYpCALq` | [open](https://explorer.solana.com/tx/K7RUUu3x2ifVmqzGtVgSgJPUFDSwnKKwcwsSx9heBP1P9KLejDZzPmkrn5heX7QHpiGchsfGbgntnZvzUYpCALq?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| MagicBlock ER | Successful machine ER tx | `52SXXHCktYjUKPMF2LwJ3uWpr4AiCJo42tzkS5gc7AqhA1BmqWZzpoPJUBDA9eUHpNmyeKevNTMK2t6x1qXpnT3y` | [open](https://explorer.solana.com/tx/52SXXHCktYjUKPMF2LwJ3uWpr4AiCJo42tzkS5gc7AqhA1BmqWZzpoPJUBDA9eUHpNmyeKevNTMK2t6x1qXpnT3y?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| MagicBlock ER | Successful machine ER tx | `32tE8LmPC1KGu9U6griH4r26U386JKaLL2c7mF9t43MK5Bfok7DNyjcEXohMWy7hPxG7kjukLwjRLabTXNP6rjKF` | [open](https://explorer.solana.com/tx/32tE8LmPC1KGu9U6griH4r26U386JKaLL2c7mF9t43MK5Bfok7DNyjcEXohMWy7hPxG7kjukLwjRLabTXNP6rjKF?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| MagicBlock ER | Successful machine ER tx | `jkZAkkb934FRwp8Ys2bNMVMksTnnDVibU5TUcqz3dLyLrCQshkWgPGbqyY9648tJFZoxAArmWTDjkYeSeiFizLD` | [open](https://explorer.solana.com/tx/jkZAkkb934FRwp8Ys2bNMVMksTnnDVibU5TUcqz3dLyLrCQshkWgPGbqyY9648tJFZoxAArmWTDjkYeSeiFizLD?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| MagicBlock ER | Successful machine ER tx | `3BAAkhRdq1AaZyGRJtEhK2QceBcgYuTPA9wRjmsBGEexQ22vGFGa5fXC698uGcmyJpoVqtJyCLvcaxfeF32i6W7f` | [open](https://explorer.solana.com/tx/3BAAkhRdq1AaZyGRJtEhK2QceBcgYuTPA9wRjmsBGEexQ22vGFGa5fXC698uGcmyJpoVqtJyCLvcaxfeF32i6W7f?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |
| MagicBlock ER | Successful MegaPot ER tx | `4fZFrTjQBHLAvDMcw7Ae7xQ3UUkGpKeZEm2WBFEi9nxq2MPUbGMdg53zRDp5qfJu4bagyYkGgSgWPPQmaP7UyKZF` | [open](https://explorer.solana.com/tx/4fZFrTjQBHLAvDMcw7Ae7xQ3UUkGpKeZEm2WBFEi9nxq2MPUbGMdg53zRDp5qfJu4bagyYkGgSgWPPQmaP7UyKZF?cluster=custom&customUrl=https%3A%2F%2Fdevnet-as.magicblock.app) |

Recent ER query result:

```text
ER machine GZukh2gvN96KrkGVoE2DCNLRhbAT277zgg7H91hL46Lb
K7RUUu...ALq slot 475501026 err null
52SXX...T3y slot 475501016 err null
32tE8...jKF slot 475501014 err null
jkZAk...zLD slot 475127410 err null
3BAAk...W7f slot 475127397 err null

ER MegaPot FpipGEAaf758cgckBvM1HyoR5p97gmz2uxrtAgkbqicJ
4fZFr...KZF slot 477372083 err null
```

## Real Base Devnet Transaction Proof

| Purpose | Signature | Link |
| --- | --- | --- |
| Latest program deploy | `zojfuqbAAkJ4uMVEsVjpsSgu8Eejpmam5Mdq5n8FU9uwu57AHknFoLfjG95Fa7A7d4by7zo8QeuSDepFU2LMdQF` | [open](https://explorer.solana.com/tx/zojfuqbAAkJ4uMVEsVjpsSgu8Eejpmam5Mdq5n8FU9uwu57AHknFoLfjG95Fa7A7d4by7zo8QeuSDepFU2LMdQF?cluster=devnet) |
| Jackpot initialization | `4ruhHwys1e17PfSC3e4iS9tysWKiHBESWkVPA4rvKbznTWLm3azwLM2vTXEDW4YRA564yJ4qVzcXUzq3ZW2PaYwC` | [open](https://explorer.solana.com/tx/4ruhHwys1e17PfSC3e4iS9tysWKiHBESWkVPA4rvKbznTWLm3azwLM2vTXEDW4YRA564yJ4qVzcXUzq3ZW2PaYwC?cluster=devnet) |
| Marketplace list smoke | `4aQd5tmZgTiG9sQ178WhroCkEGD36545GbWtEMsq6ZBrHk1Myq7g9gVhtXqcTmEsr944cXP8EfHE7HoZmopVco7Q` | [open](https://explorer.solana.com/tx/4aQd5tmZgTiG9sQ178WhroCkEGD36545GbWtEMsq6ZBrHk1Myq7g9gVhtXqcTmEsr944cXP8EfHE7HoZmopVco7Q?cluster=devnet) |
| Marketplace buy smoke | `3ir73GEMFsZzNkhtWDEa74C2BHGRiwSjp5t4fyfv5FWveodcqae3x6QQ9KuSz25wTq4Jn4PsRv2R4QjEmuwLCYqi` | [open](https://explorer.solana.com/tx/3ir73GEMFsZzNkhtWDEa74C2BHGRiwSjp5t4fyfv5FWveodcqae3x6QQ9KuSz25wTq4Jn4PsRv2R4QjEmuwLCYqi?cluster=devnet) |
| Marketplace buyer funding | `5nDt4A4sMEgnQRMacNCU2pXM9We326zj2WpKq9NCxcFGG8sVWZLjdVTpYFJpCnG4RMibGkfvistyyQYF73LKWftL` | [open](https://explorer.solana.com/tx/5nDt4A4sMEgnQRMacNCU2pXM9We326zj2WpKq9NCxcFGG8sVWZLjdVTpYFJpCnG4RMibGkfvistyyQYF73LKWftL?cluster=devnet) |

Marketplace smoke details:

```text
asset: Hkomx99t5ta8XEzCh9iEDTJXWcvMSH5GiETqdZxTgTJn
listing: 9xvKTP4GjDP5uJ7VCEQddt4KDkKxH7Exn5bDdNhfKBio
sale record: BbSPGYHXPZ3WJ2muqdRY3rqyCaxnQRstRBXFaG92vvS4
price: 100000 USDC units = 0.1 Devnet USDC
final owner: 4ZcPcfkKuLP4gaGR3NQJapYJj4YjLYazkpt61LcSQEWg
```

## Current Game Logic

Pull price:

```text
2.000000 Devnet USDC per pull
1.500000 USDC -> treasury
0.500000 USDC -> global Jackpot vault
```

Fusion ladder:

```text
3x Common    -> 1x Uncommon
3x Uncommon  -> 1x Rare
3x Rare      -> 1x Epic
3x Epic      -> 1x Legendary
```

Marketplace:

```text
Seller lists an owned Metaplex Core card.
Buyer pays Devnet USDC.
Program transfers ownership and records sale proof.
UI can show listing tx, buy tx, seller proceeds, price, asset, and owner.
```

Jackpot / MegaPot:

```text
Paid pulls fund the global Jackpot USDC vault.
Legendary assets can enter the Jackpot round.
Jackpot draw uses MagicBlock VRF flow.
Winner can claim USDC from the canonical Jackpot USDC ATA.
```

## Program Instruction Coverage

The test suite checks every IDL instruction discriminator and every client builder account layout.

```text
buy_listing
cancel_listing
claim_asset
claim_jackpot
close_jackpot_round
commit_gacha_state
commit_inventory
consume_jackpot_draw
consume_pull
create_listing
delegate_inventory
delegate_jackpot_round
delegate_machine
delegate_megapot
delegate_pending_pull
enter_jackpot
finalize_jackpot_draw
fuse_assets
init
initialize_inventory
initialize_jackpot
initialize_megapot
instant_buyback
prepare_paid_pull
prepare_pull
process_undelegation
pull
record_inventory_item
request_jackpot_draw
select_inventory_item
start_next_jackpot_round
undelegate_inventory
unlock_jackpot_entry
upload_config
```

## Test Results

Latest full instruction + live Devnet check:

```bash
npm test
```

Result:

```text
68 instruction tests passed
6 live Devnet tests passed
74 total passed, 0 failed

Live tests confirmed:
- Devnet program exists
- MagicBlock VRF program exists
- MagicBlock VRF queue exists
- Jackpot config decodes from Devnet
- Jackpot vault is canonical Devnet USDC ATA
- deployment and Jackpot init signatures are confirmed
- delegated MagicBlock machine and MegaPot are readable on ER
- real successful MagicBlock ER transaction history exists
```

Paid pull smoke:

```bash
npm run smoke:devnet
```

Current blocker:

```text
Smoke wallet needs at least 2 Devnet USDC in 7AzWAXJomqK6fU8LcZ2s1PJjfyzKArGiHVSrPREvCWfU
Current CLI smoke wallet balance is below pull price.
```

This is not an app logic failure. The CLI smoke wallet needs at least `2.000000` Devnet USDC to run a fresh paid pull. Existing mobile and ER transactions above prove prior ER execution.

Marketplace smoke:

```bash
node scripts/market-smoke.mjs
```

Previously passed end to end with the list and buy signatures shown above. The latest rerun did not find another unlisted seller-owned asset, because the smoke fixture asset was already sold/listed.

## How To Run Mobile

Expo Go is not enough for this app. Use a development build.

```bash
npm install
npm run android:build
npm run android
```

Metro:

```bash
npm run dev
```

If the Android development build cannot connect to Metro, use the device and laptop on the same network or run with USB reverse:

```bash
adb reverse tcp:8081 tcp:8081
```

## Source Map

| Area | Files |
| --- | --- |
| Mobile UI | `features/gachapon/gachapon-screen.tsx` |
| Mobile transaction state machine | `features/gachapon/use-gachapon.ts` |
| Client builders / PDAs / decoders | `lib/gachapon-client.ts` |
| Anchor program | `programs/gachapon/src/lib.rs` |
| Live Devnet proof tests | `tests/devnet-live.test.ts` |
| Instruction coverage tests | `tests/instruction-coverage.test.ts` |
| Paid pull smoke | `scripts/devnet-smoke.mjs` |
| Marketplace smoke | `scripts/market-smoke.mjs` |

## Honest Status

Done and proven:

- Program deployed on Devnet.
- MagicBlock VRF program and queue are wired.
- MagicBlock ER delegated machine/MegaPot are readable on ER.
- Real successful MagicBlock ER transaction history exists.
- Instruction builders cover all 34 program instructions.
- Custom marketplace list/buy path has real Devnet transaction proof.
- README now includes ER and base transaction proof links.

Needs one more funded run:

- Fresh paid pull smoke from the CLI wallet needs at least `2` Devnet USDC in `7AzWAXJomqK6fU8LcZ2s1PJjfyzKArGiHVSrPREvCWfU`.
- Full Jackpot payout needs enough Legendary entries and a closed round before we can show final claim-payout proof.

This app is Devnet-only. Do not treat the Jackpot design as mainnet-ready without legal, app-store, and production security review.

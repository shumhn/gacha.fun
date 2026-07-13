# Matka

Matka is an onchain digital-asset gacha, marketplace, fusion, and jackpot game built for mobile with Solana and MagicBlock Ephemeral Rollups.

Players buy a random Matka pack with Devnet USDC, receive a wallet-owned collectible, fuse lower-tier Matkas into higher-tier ones, trade them in the in-app marketplace, and use Legendary Cosmic Matkas to enter a transparent MegaPot lottery.

## Devnet Program

```text
Program ID: 7oRzpny8E6JyVXkUfAxx9SE4y7VFy3s3DmKNXDSyivo6
Network: Solana Devnet
MagicBlock ER: https://devnet-as.magicblock.app
Devnet USDC Mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
VRF Program: Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz
VRF Queue: 5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc
```

## The Simple Pitch

Matka is like a mobile gacha game, but the important parts are onchain:

```text
Pull -> Collect -> Fuse -> Trade -> Enter MegaPot -> Win USDC
```

Traditional gacha games ask players to trust a private server. Matka makes the core economy visible:

- pack payments use Devnet USDC
- rarity comes from verifiable randomness
- assets are wallet-owned
- marketplace sales happen through the program
- jackpot funds sit in a transparent vault
- winner selection is driven by MagicBlock VRF

## Current Devnet Economy

The current Devnet build uses test values so the full loop is easy to test.

```text
Pack price: 2 USDC
Treasury/protocol: 1.5 USDC
MegaPot contribution: 0.5 USDC
Marketplace fee: 5%
Jackpot payout: 95% of the jackpot vault
```

The product target can be moved to the larger 5 USDC model:

```text
5 USDC pull
3 USDC -> protocol / creator
2 USDC -> transparent MegaPot vault
```

The logic is the same. Only the constants change.

## Matka Tiers

The Devnet build currently has a five-tier ladder:

| Tier | Matka | Current Weight |
| --- | --- | --- |
| 1-Star | Common Clay Matka | 50 |
| 2-Star | Uncommon Bronze Matka | 30 |
| 3-Star | Rare Neon Matka | 14 |
| 4-Star | Epic Plasma Matka | 5 |
| 5-Star | Legendary Cosmic Matka | 1 |

The headline product story can be presented as four main rarity classes, but the implemented Devnet game has the extra Uncommon step so fusion has a longer progression path.

## Step 1: Pull

A player connects a wallet and taps Pull.

The app charges Devnet USDC, splits the payment between the protocol treasury and the MegaPot vault, requests MagicBlock VRF, and records the result as a Matka asset owned by the player.

Why this matters:

- the player pays with a real token on Devnet
- the jackpot grows every time someone plays
- the pull has a transaction trail
- the result is not privately picked by our app

## Step 2: MagicBlock ER And VRF

Matka uses MagicBlock because mobile gacha needs to feel fast.

Normal onchain gameplay can feel slow if every action waits on base-layer confirmation. MagicBlock Ephemeral Rollups let delegated game accounts execute quickly, while final state can still commit back to Solana.

MagicBlock VRF is used for randomness:

- pack rarity selection
- MegaPot winner selection
- proof that the operator did not rewrite outcomes

In plain English:

```text
No hidden odds.
No private server deciding winners.
No admin swapping results after a pull.
```

## Step 3: Collect

After a pull, the player receives a wallet-owned Matka asset.

That Matka can be:

- held in the vault
- fused into a higher tier
- listed on the marketplace
- sold through instant buyback
- used for MegaPot entry if it is Legendary

The important point is ownership. The card is not just a database item inside our app.

## Step 4: Fuse

Fusion is how Matka controls supply.

Players burn three matching Matkas to mint one Matka from the next tier.

```text
3 Common Clay Matkas       -> 1 Uncommon Bronze Matka
3 Uncommon Bronze Matkas   -> 1 Rare Neon Matka
3 Rare Neon Matkas         -> 1 Epic Plasma Matka
3 Epic Plasma Matkas       -> 1 Legendary Cosmic Matka
```

You cannot mix tiers. The three inputs must be the same tier.

This gives low-tier pulls real value. Commons are not trash. They are ingredients for climbing toward Legendary.

## Step 5: Marketplace

Players can trade Matkas inside the app.

Example:

```text
A seller lists an Epic Plasma Matka for 50 USDC.
A buyer purchases it from the in-app marketplace.
The seller receives 47.5 USDC.
The protocol receives a 2.5 USDC marketplace fee.
```

This creates a real player economy:

- collectors can sell rare pulls
- players can buy missing fusion pieces
- Legendary Matkas can trade at a premium
- every sale has a proof trail

## Step 6: MegaPot Jackpot

The MegaPot is the endgame.

Every paid pull sends part of the payment into a transparent USDC jackpot vault. As more people play, the vault grows.

The rule is simple:

```text
Only a Legendary Cosmic Matka can enter the MegaPot lottery.
```

The draw flow:

```text
1. A player locks a Legendary Cosmic Matka into the current jackpot round.
2. The round closes.
3. MagicBlock VRF generates the random winner selection.
4. One eligible player wins the jackpot.
5. The winner can claim the USDC payout.
6. Used Legendary entries are burned or marked as used.
7. A new round starts, and players begin pulling and fusing again.
```

This is the core reason Legendary Matkas matter. They are not just rare art. They are access passes into the highest-value event in the game.

## Why The Loop Works

Matka has four connected loops:

**Pull loop**

Players pay USDC to open packs. Every pull funds the protocol and grows the MegaPot.

**Fusion loop**

Players burn lower-tier assets to climb the rarity ladder. This shrinks supply and makes progression meaningful.

**Marketplace loop**

Players trade missing pieces, speculate on rare Matkas, and buy access to the Legendary path.

**Jackpot loop**

Legendary holders lock into the MegaPot. One winner claims the prize, entries are consumed, and demand restarts for the next round.

Together, these loops make Matka more than a simple gacha. It becomes a collectible economy with progression, liquidity, and a recurring jackpot endgame.

## Proof Trail

The app exposes proof for the important parts of the game:

- payment transaction
- Devnet USDC mint
- treasury address
- MagicBlock ER endpoint
- base program
- VRF program
- VRF queue
- ER machine account
- ER inventory account
- ER pending pull account
- ER pull transaction
- ER commit transaction
- base claim transaction
- asset address
- marketplace listing and sale transactions
- seller proceeds transaction
- jackpot entry transaction
- jackpot VRF draw transaction
- jackpot claim transaction

The goal is simple: if the app says something happened, the user should be able to open the transaction or account and verify it.

## Why MagicBlock Matters

Matka needs to feel like a real mobile game.

MagicBlock gives us fast gameplay execution for delegated game state, while Solana remains the settlement and ownership layer.

Matka uses MagicBlock for:

- fast gacha execution
- delegated machine state
- delegated player inventory state
- delegated MegaPot state
- ER commits back to Solana
- VRF-backed pack and jackpot randomness

## Run The App

Expo Go is not enough for this app. Use a development build.

```bash
npm install
npm run android:build
npm run android
```

Start Metro:

```bash
npm run dev
```

For a physical Android device:

```bash
adb reverse tcp:8081 tcp:8081
```

## Test

```bash
npm test
npx tsc --noEmit
npm run lint:check
```

## Project Structure

```text
features/gachapon/       mobile game UI and state machine
lib/gachapon-client.ts   Solana instructions, PDAs, account decoders
programs/gachapon/       Anchor program
scripts/                 Devnet setup and smoke scripts
tests/                   instruction and live Devnet checks
```

## Scope

Matka is currently Devnet-only. Any real-money jackpot launch would need legal, compliance, app-store, and production security review.

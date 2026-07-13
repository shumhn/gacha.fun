# Matka

Matka is an onchain digital-asset gacha and jackpot game built for mobile.

Players open Matka packs, receive wallet-owned NFT-style collectibles, fuse lower-tier Matkas into rarer ones, trade with other players, and use Legendary Matkas to enter a growing MegaPot.

It feels like a fast mobile gacha. Under the hood, the important parts run on Solana with MagicBlock Ephemeral Rollups and MagicBlock VRF.

## The Core Idea

Traditional gacha games are closed systems. The company controls the inventory, the marketplace, the odds, and the database.

Matka turns that into an open onchain loop:

```text
Pull -> Collect -> Fuse -> Trade -> Enter MegaPot
```

Every pull creates a real asset. Every rarity roll is verifiable. Every high-tier Matka has utility beyond just looking rare.

## The Matkas

There are four main Matka tiers:

| Tier | Matka | Drop Rate |
| --- | --- | --- |
| Common | Clay Matka | 70% |
| Rare | Neon Matka | 20% |
| Epic | Plasma Matka | 9% |
| Legendary | Cosmic Matka | 1% |

The rarer the Matka, the more valuable it becomes inside the game economy.

## Step 1: Pull

A player connects their wallet and opens a random Matka pack.

Example price:

```text
5 USDC per pull
3 USDC -> protocol / creator
2 USDC -> transparent MegaPot vault
```

The jackpot grows every time someone plays. The more activity the game has, the bigger the MegaPot becomes.

**Where MagicBlock helps**

Normal onchain games can feel slow because every action waits on chain confirmation. Matka uses MagicBlock Ephemeral Rollups so the pack opening can feel instant, like a normal mobile game.

The player taps pull. The game reacts fast. The onchain state still settles back to Solana.

## Step 2: Verifiable Randomness

The rarity is chosen with MagicBlock VRF.

That means the game does not secretly decide the result from a private server. The randomness is verifiable, and the result can be checked onchain.

In simple terms:

```text
No hidden odds.
No rigged pulls.
No admin swapping results.
```

This is the trust layer for the whole game.

## Step 3: Collect

After the pull, the player receives a Matka asset in their wallet.

That asset can be:

- kept in the vault
- fused into a higher tier
- listed on the marketplace
- used for MegaPot entry if it is Legendary

The player owns the asset. It is not just a row in our app database.

## Step 4: Fuse

Fusion is how Matka controls supply and gives low-tier pulls value.

If a player has multiple low-tier Matkas, they can burn them to create a better one.

Example ladder:

```text
3 Clay Matkas   -> 1 Neon Matka
3 Neon Matkas   -> 1 Plasma Matka
3 Plasma Matkas -> 1 Cosmic Matka
```

This matters because players are constantly removing lower-tier assets from circulation. Supply shrinks as players climb toward Legendary.

Commons are not useless. They are ingredients.

## Step 5: Marketplace

Players do not need to keep pulling forever.

If someone has two Epic Matkas and needs one more to reach Legendary, they can buy it from another player in the marketplace.

Example:

```text
Seller lists an Epic Matka for 50 USDC.
Buyer purchases it from the in-app market.
Seller receives 47.5 USDC.
Protocol receives a 2.5 USDC marketplace fee.
```

This creates a real player economy:

- collectors can sell rare pulls
- grinders can buy missing pieces
- Legendary Matkas can trade at a premium
- the protocol earns from marketplace activity

## Step 6: MegaPot

The MegaPot is the endgame.

Every paid pull sends part of the payment into a transparent jackpot vault. Over time, that vault can grow into a large prize pool.

To enter the MegaPot, a player must stake or lock a Legendary Cosmic Matka.

Example weekly draw:

```text
1. Players lock Legendary Cosmic Matkas.
2. The round closes.
3. MagicBlock VRF selects a winner.
4. The winner receives the MegaPot.
5. Used Legendary Matkas are burned or marked as used.
```

This gives Legendary Matkas real utility. They are not just rare collectibles. They are tickets into the highest-value event in the game.

## Why This Loop Works

Matka has three connected economies:

**Pull economy**

Players pay to open packs. Every pull funds the protocol and grows the MegaPot.

**Fusion economy**

Players burn lower-tier assets to climb into rarer tiers. This reduces supply and gives every pull a purpose.

**Marketplace economy**

Players trade missing pieces, speculate on rare assets, and buy access to the MegaPot path.

Together, these loops make the game more than a simple slot machine. It becomes a collectible economy with progression, liquidity, and an endgame.

## Why MagicBlock Matters

Matka needs to feel fast.

If opening a pack takes several seconds and multiple wallet confirmations, the mobile experience breaks. MagicBlock Ephemeral Rollups let the game execute fast gameplay actions while still settling meaningful state to Solana.

Matka uses MagicBlock for:

- fast gacha pulls
- delegated game state
- low-friction mobile gameplay
- settlement back to Solana
- VRF-backed rarity selection

## Why VRF Matters

Randomness is the most sensitive part of any gacha or lottery game.

If the app controls randomness privately, users have to trust the operator. If randomness is verifiable, users can trust the system.

MagicBlock VRF gives Matka a public randomness source for:

- pack rarity
- jackpot winner selection
- proof that outcomes were not rewritten

## Current Devnet Build

The current app is a Devnet prototype.

Live program:

```text
7oRzpny8E6JyVXkUfAxx9SE4y7VFy3s3DmKNXDSyivo6
```

Devnet USDC mint:

```text
4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

MagicBlock ER:

```text
https://devnet-as.magicblock.app
```

The Devnet implementation may use smaller test values than the example economics above. The full product direction is the 5 USDC pull, protocol split, marketplace fee, fusion ladder, and MegaPot loop.

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

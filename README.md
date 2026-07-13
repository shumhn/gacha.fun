# Matka

Matka is a mobile onchain gacha game where every pull creates a real collectible asset, every rarity roll is verifiably random, and every card can be fused, traded, or used to enter a jackpot.

Think of it like a fast anime gacha, but with real ownership. The cards are not just pictures inside an app database. They are wallet-owned Solana assets.

## The Idea

Most gacha games are closed systems. You pay, you pull, and the game company controls the inventory, the odds, and the marketplace.

Matka turns that loop into an open Solana game:

1. Pull a Matka pack.
2. MagicBlock VRF chooses the rarity.
3. The result is minted to your wallet.
4. You can keep it, fuse it, sell it, or use it for the MegaPot.

The player gets a game that feels instant. The chain still gets a real proof trail.

## Game Loop

**Pull**

Players spend Devnet USDC to open a pack. The pull uses MagicBlock for fast execution and MagicBlock VRF for randomness.

**Collect**

Each result becomes a wallet-owned collectible card. The app shows the card, rarity, owner, and proof details.

**Fuse**

Three matching Matkas can be fused into the next tier:

```text
3 Common    -> 1 Uncommon
3 Uncommon  -> 1 Rare
3 Rare      -> 1 Epic
3 Epic      -> 1 Legendary
```

This gives low-tier pulls real utility. Commons are not dead inventory. They are fuel for the ladder.

**Trade**

Players can list cards in the in-app marketplace. Other players can buy them with Devnet USDC.

**MegaPot**

Part of every paid pull flows into a jackpot vault. Legendary Matkas are the highest-value assets because they can enter the MegaPot draw.

## Why MagicBlock

Gacha needs speed. If every pull feels like waiting for a normal chain transaction, the game dies.

MagicBlock Ephemeral Rollups let Matka keep the important parts onchain while making the play experience feel like a mobile game:

- fast pack openings
- low-friction gameplay
- delegated game state
- settlement back to Solana
- proof that the result was not manually changed

## Why MagicBlock VRF

Randomness is the heart of a gacha game. If the rarity roll is controlled by the app, players have to trust us.

Matka uses MagicBlock VRF so the rarity result can be verified onchain. That means the app cannot secretly swap a bad pull into a good one, or a good pull into a bad one, after the player opens the pack.

In plain English:

```text
No hidden odds.
No rigged pulls.
No admin changing the result.
```

## What Makes Matka Different

- Mobile-first onchain gacha
- Real wallet-owned assets
- Verifiable randomness through MagicBlock VRF
- Fast gameplay through MagicBlock ER
- Fusion ladder for long-term progression
- Built-in marketplace for player-to-player trading
- MegaPot system that gives high-tier cards extra utility

## Devnet Status

Matka is currently a Devnet app.

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

If testing on a physical Android device:

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

## Current Scope

Matka is a Devnet prototype for mobile onchain gameplay. It is not mainnet gambling software, and the MegaPot design would need legal, compliance, and app-store review before any real-money launch.

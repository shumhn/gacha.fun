# VOIDDECK

VOIDDECK is a Solana mobile creature-pack game powered by MagicBlock. Every pack opening requests verifiable randomness, mints a Metaplex Core card to the connected wallet, and records it in a delegated Ephemeral Rollup vault.

## Devnet deployment

- Program: `7oRzpny8E6JyVXkUfAxx9SE4y7VFy3s3DmKNXDSyivo6`
- Base RPC: `https://rpc.magicblock.app/devnet`
- ER router: `https://devnet-router.magicblock.app`
- Wallet: Solana Mobile Wallet Adapter
- Android package: `app.capsule.gachapon`

## Run the mobile app

MWA requires a custom Android development build. Expo Go is not supported.

```bash
npm install
npm run android:build
npm run android
```

Local Android requirements:

- JDK 17 (`JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home` on this machine)
- Android SDK 36 and Build Tools 36.0.0
- An emulator or Android device with an MWA-compatible wallet

To generate a signed APK without installing the Android SDK locally:

```bash
npx eas-cli login
npm run apk:cloud
```

See `docs/SEEKER_RELEASE.md` for physical Seeker testing, signing, versioning, privacy, and dApp Store requirements.

## Verify

```bash
npx tsc --noEmit
npm run lint:check
npm run format:check
npm run doctor
anchor build
npm run smoke:devnet
```

`smoke:devnet` performs the full flow with the configured Devnet CLI wallet: machine setup, ER inventory delegation, VRF pull, Core asset mint, and ER inventory write.

## Project layout

- `app/` Expo Router entrypoints
- `features/gachapon/` mobile product UI and transaction state machine
- `lib/gachapon-client.ts` instruction encoding, account decoding, and MagicBlock PDA helpers
- `programs/gachapon/` Anchor program with VRF and ER inventory support
- `scripts/devnet-smoke.mjs` real Devnet end-to-end verification
- `docs/ARCHITECTURE.md` transaction and account architecture
- `docs/SEEKER_RELEASE.md` Android/Seeker build and release checklist
- `docs/PRIVACY.md` Devnet privacy notice draft
- `deployment/` built program, IDL, and gitignored Devnet program identity

The app is Devnet-only. The Android project and APK build profile are prepared for Seeker testing; mainnet and dApp Store submission are intentionally outside the current scope.

The Devnet program keypair is included locally for reproducible upgrades and is ignored by Git. Do not publish or commit it.

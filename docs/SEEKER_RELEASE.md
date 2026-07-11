# Seeker Development And Release

VOIDDECK is a native Android Expo application. Seeker does not require a separate binary format: development installs and dApp Store submissions use Android APK files.

## What is already integrated

- Android package: `app.capsule.gachapon`
- Mobile Wallet Adapter through `@wallet-ui/react-native-web3js`
- External wallet signing uses Mobile Wallet Adapter; the optional built-in Devnet test wallet is local-only and must never be used with real funds
- Devnet-only Solana and MagicBlock endpoints
- Published pull odds and verifiable-randomness proof links
- Custom Android launcher and splash assets

Seed Vault is integrated through the wallet, not directly by a dApp. On Seeker, Mobile Wallet Adapter opens the user's compatible wallet, which can use Seed Vault for custody.

## Run on an Android phone or Seeker

Expo Go cannot run Mobile Wallet Adapter native modules. Use a custom Android build.

1. Enable Developer options and USB debugging on the phone.
2. Install Android Studio with Android SDK Platform 36, Build Tools, Platform Tools, and the SDK/NDK versions requested by Gradle.
3. Connect the phone and confirm it appears under `adb devices`.
4. Install an MWA-compatible wallet on the phone.
5. From the project directory, run `npm install` and then `npm run android`.
6. Open VOIDDECK, connect the wallet, switch the wallet to Devnet, fund it with test SOL, and open a pack.

For JavaScript iteration after the custom build is installed, run `npm start` and open the development build on the phone.

## Generate a test APK

The easiest path without a local Android SDK is an EAS cloud build:

```bash
npx eas-cli login
npm run apk:cloud
```

On the first build, EAS asks to create or select an Expo project and Android signing credentials. Preserve access to the Expo account and keystore.

To build on a machine with the Android SDK and NDK installed:

```bash
npm run apk:local
```

## Before dApp Store submission

- Keep `app.capsule.gachapon` unchanged after the first release.
- Increment `expo.android.versionCode` for every update and update `expo.version` as appropriate.
- Use an APK, not an AAB.
- Sign every update with the same dedicated dApp Store key. Never reuse a Google Play signing key.
- Replace the placeholder Mobile Wallet Adapter identity URI with a publisher-controlled HTTPS website.
- Publish `docs/PRIVACY.md` at a stable HTTPS URL and add real publisher support contact details.
- Prepare the final name, short and full descriptions, icon, phone screenshots, category, privacy URL, and support URL.
- Keep real-money purchases disabled until legal and policy review is complete. The current build is Devnet-only and clearly labels test SOL.
- Test wallet connect, reject, cancel, reconnect, insufficient balance, VRF timeout, background/restore, and repeated pulls on a physical Android phone or Seeker.
- Verify the signed APK with `apksigner verify --print-certs <apk>`.
- Create a Publisher Portal account, complete KYC/KYB, connect the long-term publisher wallet, upload the APK and metadata, approve the release transactions, and submit for review.

## Release ownership

Three credentials must be backed up securely and must not be committed:

1. Android dApp Store keystore and passwords
2. Solana dApp Store publisher wallet
3. Expo/EAS account and project access, if EAS is used

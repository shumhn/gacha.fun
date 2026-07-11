# VOIDDECK Architecture

## Product flow

1. Mobile Wallet Adapter connects an installed Solana wallet without exposing private keys.
2. The app creates a wallet-scoped gachapon machine and publishes four weighted rewards.
3. The machine, player inventory, and each per-pull `pending_pull` PDA are delegated to the MagicBlock Asia Devnet ER.
4. The pull instruction is sent to the ER and requests MagicBlock's ephemeral VRF queue using the deterministic callback identity PDA.
5. The verified VRF callback runs on ER, selects the reward, increments machine counters, settles `pending_pull`, and updates inventory.
6. The app commits the delegated ER state back to Solana, waits for base-layer state to reflect the settled pull, then claims the deterministic Metaplex Core asset on Solana.
7. The vault reads authoritative minted cards from Solana; ER state provides the instant game inventory and selected item state.

## Account boundaries

| Account        | Layer         | Purpose                                      |
| -------------- | ------------- | -------------------------------------------- |
| `machine`      | MagicBlock ER | Reward weights, mint counts, total pulls     |
| `pending_pull` | MagicBlock ER | VRF request and callback settlement state    |
| `asset`        | Solana        | Metaplex Core collectible owned by player    |
| `treasury`     | Solana        | Machine PDA reserved for future fees/top-ups |
| `inventory`    | MagicBlock ER | Fast per-player item index and selected item |

Metaplex Core minting remains on Solana because the Core asset program/account lives on the base layer. The game-defining pull, VRF result, machine counters, pending pull, and inventory run on delegated ER accounts, then the player pays Devnet rent to claim the durable collectible from the committed result.

## Trust model

- Reward odds are stored in the machine account before a pull.
- The result is derived only from MagicBlock VRF callback bytes.
- The callback signer is constrained to the known VRF program identity.
- Assets use deterministic PDAs tied to machine, player, and pull id.
- The collection view verifies the minted Core account and owner on Solana.
- Machine, pending pull, and inventory updates happen on ER and are committed through MagicBlock before base-layer claim.

## Mobile reliability

- The app detects offline state and pauses pull actions.
- Every transaction stage has visible progress and recovery copy.
- Returning from a wallet app refreshes balances, machine state, and inventory.
- VRF settlement polling has a timeout that preserves the pending pull for later refresh.
- Base claim waits for the MagicBlock commit to appear on Devnet before minting the Core asset.
- Wallet keys are never generated or stored by the app.

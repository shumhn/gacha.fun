use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::{invoke, invoke_signed},
    sysvar,
};
use ephemeral_rollups_sdk::{
    anchor::{commit, delegate, ephemeral},
    consts::{MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID},
    cpi::DelegateConfig,
    ephem::MagicIntentBundleBuilder,
};
use mpl_core::accounts::BaseAssetV1;
use mpl_core::instructions::{CreateV2CpiBuilder, TransferV1CpiBuilder, BurnV1CpiBuilder};
use mpl_core::types::{Attribute, Attributes, Plugin, PluginAuthority, PluginAuthorityPair};

declare_id!("7oRzpny8E6JyVXkUfAxx9SE4y7VFy3s3DmKNXDSyivo6");

pub const MACHINE_SEED: &[u8] = b"machine";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const UPDATE_AUTHORITY_SEED: &[u8] = b"update_authority";
pub const VRF_IDENTITY_SEED: &[u8] = b"identity";
pub const PULL_SEED: &[u8] = b"pull";
pub const ASSET_SEED: &[u8] = b"asset";
pub const INVENTORY_SEED: &[u8] = b"inventory";
pub const LISTING_SEED: &[u8] = b"listing";
pub const SALE_SEED: &[u8] = b"sale";
pub const REWARD_COUNT: usize = 5;
pub const MAX_INVENTORY_ITEMS: usize = 64;
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_URI_LEN: usize = 160;
pub const TREASURY_TOP_UP_LAMPORTS: u64 = 10_000_000;
pub const PACK_PRICE_USDC_UNITS: u64 = 1_000_000;
pub const USDC_DECIMALS: u8 = 6;

// Total EV roughly 81.5% RTP (1.00 USDC per pack):
// 50% * 0.25 = 0.125
// 30% * 0.50 = 0.150
// 14% * 1.00 = 0.140
//  5% * 3.00 = 0.150
//  1% * 25.00 = 0.250
pub const BUYBACK_PAYOUT_USDC_UNITS: [u64; REWARD_COUNT] = [250_000, 500_000, 1_000_000, 3_000_000, 25_000_000];
pub const MPL_CORE_ID: Pubkey = pubkey!("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
pub const TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const VRF_PROGRAM_ID: Pubkey = pubkey!("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
pub const DEFAULT_VRF_QUEUE: Pubkey = pubkey!("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
pub const VRF_PROGRAM_IDENTITY: Pubkey = pubkey!("9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw");
pub const DEVNET_USDC_MINT: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

#[ephemeral]
#[program]
pub mod gachapon_example {
    use super::*;

    pub fn init(ctx: Context<Init>, machine_id: u64) -> Result<()> {
        let machine = &mut ctx.accounts.machine;
        machine.authority = ctx.accounts.authority.key();
        machine.machine_id = machine_id;
        machine.bump = ctx.bumps.machine;
        machine.treasury_bump = ctx.bumps.treasury;
        machine.update_authority_bump = ctx.bumps.update_authority;
        machine.total_weight = 0;
        machine.pull_count = 0;
        machine.rewards = std::array::from_fn(|_| RewardTemplate::default());

        fund_treasury(
            &ctx.accounts.authority.to_account_info(),
            &ctx.accounts.treasury.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            TREASURY_TOP_UP_LAMPORTS,
        )?;

        msg!("Initialized gachapon machine {}", machine_id);
        Ok(())
    }

    pub fn upload_config(
        ctx: Context<UploadConfig>,
        rewards: [RewardTemplateInput; REWARD_COUNT],
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.machine.authority,
            GachaponError::Unauthorized
        );

        let mut total_weight = 0u32;
        let mut templates: [RewardTemplate; REWARD_COUNT] =
            std::array::from_fn(|_| RewardTemplate::default());

        for (index, reward) in rewards.iter().enumerate() {
            require!(reward.weight > 0, GachaponError::InvalidWeight);
            require!(
                reward.name.as_bytes().len() <= MAX_NAME_LEN,
                GachaponError::NameTooLong
            );
            require!(
                reward.uri.as_bytes().len() <= MAX_URI_LEN,
                GachaponError::UriTooLong
            );

            total_weight = total_weight
                .checked_add(reward.weight)
                .ok_or(GachaponError::InvalidWeight)?;

            templates[index] = RewardTemplate {
                reward_id: index as u8,
                weight: reward.weight,
                minted_count: 0,
                name: reward.name.clone(),
                uri: reward.uri.clone(),
            };
        }

        let machine = &mut ctx.accounts.machine;
        machine.rewards = templates;
        machine.total_weight = total_weight;

        msg!(
            "Uploaded gachapon config with total weight {}",
            total_weight
        );
        Ok(())
    }

    pub fn prepare_pull(ctx: Context<PreparePull>, pull_id: u64) -> Result<()> {
        initialize_pending_pull(
            &mut ctx.accounts.pending_pull,
            ctx.accounts.machine.key(),
            ctx.accounts.player.key(),
            pull_id,
            ctx.bumps.pending_pull,
        )?;
        Ok(())
    }

    pub fn prepare_paid_pull(ctx: Context<PreparePaidPull>, pull_id: u64) -> Result<()> {
        transfer_checked_usdc(
            &ctx.accounts.player_usdc.to_account_info(),
            &ctx.accounts.usdc_mint.to_account_info(),
            &ctx.accounts.treasury_usdc.to_account_info(),
            &ctx.accounts.player.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            ctx.accounts.treasury.key(),
            PACK_PRICE_USDC_UNITS,
            USDC_DECIMALS,
        )?;

        initialize_pending_pull(
            &mut ctx.accounts.pending_pull,
            ctx.accounts.machine.key(),
            ctx.accounts.player.key(),
            pull_id,
            ctx.bumps.pending_pull,
        )?;
        Ok(())
    }

    pub fn delegate_pending_pull(ctx: Context<DelegatePendingPull>, pull_id: u64) -> Result<()> {
        let machine = ctx.accounts.machine.key();
        let player = ctx.accounts.player.key();
        let pull_id_bytes = pull_id.to_le_bytes();
        ctx.accounts.delegate_pending_pull(
            &ctx.accounts.player,
            &[
                PULL_SEED,
                machine.as_ref(),
                player.as_ref(),
                pull_id_bytes.as_ref(),
            ],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|account| account.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    pub fn pull(ctx: Context<Pull>, pull_id: u64, client_seed: u8) -> Result<()> {
        require!(
            ctx.accounts.machine.total_weight > 0,
            GachaponError::ConfigNotSet
        );
        require!(
            ctx.accounts.pending_pull.status == PullStatus::Pending as u8,
            GachaponError::PullAlreadySettled
        );

        let callback_accounts = vec![
            SerializableAccountMeta {
                pubkey: ctx.accounts.player.key(),
                is_signer: false,
                is_writable: false,
            },
            SerializableAccountMeta {
                pubkey: ctx.accounts.machine.key(),
                is_signer: false,
                is_writable: true,
            },
            SerializableAccountMeta {
                pubkey: ctx.accounts.pending_pull.key(),
                is_signer: false,
                is_writable: true,
            },
            SerializableAccountMeta {
                pubkey: ctx.accounts.inventory.key(),
                is_signer: false,
                is_writable: true,
            },
            SerializableAccountMeta {
                pubkey: ctx.accounts.system_program.key(),
                is_signer: false,
                is_writable: false,
            },
        ];

        let callback_identity_seeds: &[&[u8]] =
            &[VRF_IDENTITY_SEED, &[ctx.bumps.callback_identity]];
        let signer_seeds: &[&[&[u8]]] = &[callback_identity_seeds];

        let ix = create_request_randomness_ix(RawRequestRandomnessParams {
            payer: ctx.accounts.player.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::ConsumePull::DISCRIMINATOR.to_vec(),
            caller_seed: [client_seed; 32],
            accounts_metas: Some(callback_accounts),
            callback_args: Some(pull_id.to_le_bytes().to_vec()),
            ..Default::default()
        });

        invoke_signed(
            &ix,
            &[
                ctx.accounts.player.to_account_info(),
                ctx.accounts.callback_identity.to_account_info(),
                ctx.accounts.oracle_queue.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.slot_hashes.to_account_info(),
                ctx.accounts.vrf_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        msg!(
            "Requested gachapon pull {} for player {}",
            pull_id,
            ctx.accounts.player.key()
        );
        Ok(())
    }

    pub fn consume_pull(
        ctx: Context<ConsumePull>,
        randomness: [u8; 32],
        pull_id: u64,
    ) -> Result<()> {
        settle_pull_on_er(ctx, randomness, pull_id)
    }

    pub fn initialize_inventory(ctx: Context<InitializeInventory>) -> Result<()> {
        let inventory = &mut ctx.accounts.inventory;
        inventory.player = ctx.accounts.player.key();
        inventory.bump = ctx.bumps.inventory;
        inventory.revision = 0;
        inventory.selected_asset = Pubkey::default();
        inventory.assets = Vec::new();
        inventory.reward_ids = Vec::new();
        Ok(())
    }

    pub fn delegate_inventory(ctx: Context<DelegateInventory>) -> Result<()> {
        let player = ctx.accounts.player.key();
        ctx.accounts.delegate_inventory(
            &ctx.accounts.player,
            &[INVENTORY_SEED, player.as_ref()],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|account| account.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    pub fn delegate_machine(ctx: Context<DelegateMachine>, machine_id: u64) -> Result<()> {
        let authority = ctx.accounts.authority.key();
        let machine_id_bytes = machine_id.to_le_bytes();
        ctx.accounts.delegate_machine(
            &ctx.accounts.authority,
            &[MACHINE_SEED, authority.as_ref(), machine_id_bytes.as_ref()],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|account| account.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    pub fn record_inventory_item(
        ctx: Context<UpdateInventory>,
        asset: Pubkey,
        reward_id: u8,
    ) -> Result<()> {
        require!(
            (reward_id as usize) < REWARD_COUNT,
            GachaponError::InvalidReward
        );

        let inventory = &mut ctx.accounts.inventory;
        if inventory.assets.contains(&asset) {
            return Ok(());
        }
        require!(
            inventory.assets.len() < MAX_INVENTORY_ITEMS,
            GachaponError::InventoryFull
        );
        inventory.assets.push(asset);
        inventory.reward_ids.push(reward_id);
        inventory.revision = inventory.revision.saturating_add(1);
        Ok(())
    }

    pub fn select_inventory_item(ctx: Context<UpdateInventory>, asset: Pubkey) -> Result<()> {
        require!(
            ctx.accounts.inventory.assets.contains(&asset),
            GachaponError::AssetNotInInventory
        );
        ctx.accounts.inventory.selected_asset = asset;
        ctx.accounts.inventory.revision = ctx.accounts.inventory.revision.saturating_add(1);
        Ok(())
    }

    pub fn commit_inventory(ctx: Context<CommitInventory>) -> Result<()> {
        ctx.accounts.inventory.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit(&[ctx.accounts.inventory.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }

    pub fn commit_gacha_state(ctx: Context<CommitGachaState>) -> Result<()> {
        ctx.accounts.pending_pull.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit(&[ctx.accounts.pending_pull.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }

    pub fn claim_asset(ctx: Context<ClaimAsset>, pull_id: u64) -> Result<()> {
        mint_claimed_asset(ctx, pull_id)
    }

    pub fn instant_buyback(ctx: Context<InstantBuyback>, pull_id: u64) -> Result<()> {
        let machine = deserialize_account::<Machine>(&ctx.accounts.machine)?;
        let pending_pull = deserialize_account::<PendingPull>(&ctx.accounts.pending_pull)?;

        require!(
            pending_pull.status == PullStatus::Settled as u8,
            GachaponError::PullNotSettled
        );
        require_eq!(pending_pull.pull_id, pull_id, GachaponError::InvalidPull);
        require_keys_eq!(
            pending_pull.machine,
            ctx.accounts.machine.key(),
            GachaponError::InvalidPull
        );
        require_keys_eq!(
            pending_pull.player,
            ctx.accounts.player.key(),
            GachaponError::InvalidPull
        );
        require_keys_eq!(
            pending_pull.asset,
            ctx.accounts.asset.key(),
            GachaponError::InvalidPull
        );

        let asset = BaseAssetV1::try_from(&ctx.accounts.asset.to_account_info())
            .map_err(|_| error!(GachaponError::InvalidPull))?;
        require_keys_eq!(
            asset.owner,
            ctx.accounts.player.key(),
            GachaponError::AssetNotOwnedByPlayer
        );

        let expected_treasury = Pubkey::find_program_address(
            &[TREASURY_SEED, ctx.accounts.machine.key().as_ref()],
            &ID,
        )
        .0;
        require_keys_eq!(
            expected_treasury,
            ctx.accounts.treasury.key(),
            GachaponError::InvalidPull
        );

        let reward_id = pending_pull.reward_id as usize;
        require!(reward_id < REWARD_COUNT, GachaponError::InvalidReward);
        require_eq!(
            machine.rewards[reward_id].reward_id,
            pending_pull.reward_id,
            GachaponError::InvalidReward
        );

        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .payer(&ctx.accounts.player.to_account_info())
            .authority(Some(&ctx.accounts.player.to_account_info()))
            .new_owner(&ctx.accounts.treasury.to_account_info())
            .system_program(Some(&ctx.accounts.system_program.to_account_info()))
            .invoke()?;

        let payout = BUYBACK_PAYOUT_USDC_UNITS[reward_id];
        transfer_checked_usdc_signed(
            &ctx.accounts.treasury_usdc.to_account_info(),
            &ctx.accounts.usdc_mint.to_account_info(),
            &ctx.accounts.player_usdc.to_account_info(),
            &ctx.accounts.treasury.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            ctx.accounts.player.key(),
            payout,
            USDC_DECIMALS,
            &[&[
                TREASURY_SEED,
                ctx.accounts.machine.key().as_ref(),
                &[machine.treasury_bump],
            ]],
        )?;

        msg!(
            "Instant buyback for pull {} paid {} USDC units",
            pull_id,
            payout
        );
        Ok(())
    }

    pub fn create_listing(
        ctx: Context<CreateListing>,
        pull_id: u64,
        price_usdc_units: u64,
    ) -> Result<()> {
        require!(price_usdc_units > 0, GachaponError::InvalidListingPrice);

        let pending_pull = deserialize_account::<PendingPull>(&ctx.accounts.pending_pull)?;
        require!(
            pending_pull.status == PullStatus::Settled as u8,
            GachaponError::PullNotSettled
        );
        require_eq!(pending_pull.pull_id, pull_id, GachaponError::InvalidPull);
        require_keys_eq!(
            pending_pull.machine,
            ctx.accounts.machine.key(),
            GachaponError::InvalidPull
        );
        require_keys_eq!(
            pending_pull.player,
            ctx.accounts.seller.key(),
            GachaponError::InvalidPull
        );
        require_keys_eq!(
            pending_pull.asset,
            ctx.accounts.asset.key(),
            GachaponError::InvalidPull
        );

        let asset = BaseAssetV1::try_from(&ctx.accounts.asset.to_account_info())
            .map_err(|_| error!(GachaponError::InvalidPull))?;
        require_keys_eq!(
            asset.owner,
            ctx.accounts.seller.key(),
            GachaponError::AssetNotOwnedByPlayer
        );

        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .payer(&ctx.accounts.seller.to_account_info())
            .authority(Some(&ctx.accounts.seller.to_account_info()))
            .new_owner(&ctx.accounts.listing.to_account_info())
            .system_program(Some(&ctx.accounts.system_program.to_account_info()))
            .invoke()?;

        let listing = &mut ctx.accounts.listing;
        listing.seller = ctx.accounts.seller.key();
        listing.asset = ctx.accounts.asset.key();
        listing.machine = ctx.accounts.machine.key();
        listing.pending_pull = ctx.accounts.pending_pull.key();
        listing.pull_id = pending_pull.pull_id;
        listing.reward_id = pending_pull.reward_id;
        listing.price_usdc_units = price_usdc_units;
        listing.status = ListingStatus::Active as u8;
        listing.bump = ctx.bumps.listing;

        msg!(
            "Listed asset {} from pull {} for {} USDC units",
            ctx.accounts.asset.key(),
            pull_id,
            price_usdc_units
        );
        Ok(())
    }

    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.listing.seller,
            ctx.accounts.seller.key(),
            GachaponError::Unauthorized
        );
        require!(
            ctx.accounts.listing.status == ListingStatus::Active as u8,
            GachaponError::ListingNotActive
        );

        let asset = BaseAssetV1::try_from(&ctx.accounts.asset.to_account_info())
            .map_err(|_| error!(GachaponError::InvalidPull))?;
        require_keys_eq!(
            asset.owner,
            ctx.accounts.listing.key(),
            GachaponError::AssetNotListed
        );

        let asset_key = ctx.accounts.asset.key();
        let listing_seeds: &[&[u8]] = &[
            LISTING_SEED,
            asset_key.as_ref(),
            &[ctx.accounts.listing.bump],
        ];

        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .payer(&ctx.accounts.seller.to_account_info())
            .authority(Some(&ctx.accounts.listing.to_account_info()))
            .new_owner(&ctx.accounts.seller.to_account_info())
            .system_program(Some(&ctx.accounts.system_program.to_account_info()))
            .invoke_signed(&[listing_seeds])?;

        ctx.accounts.listing.status = ListingStatus::Cancelled as u8;
        msg!("Cancelled listing for asset {}", ctx.accounts.asset.key());
        Ok(())
    }

    pub fn buy_listing(ctx: Context<BuyListing>, sale_nonce: u64) -> Result<()> {
        require!(
            ctx.accounts.listing.status == ListingStatus::Active as u8,
            GachaponError::ListingNotActive
        );
        require_keys_eq!(
            ctx.accounts.listing.seller,
            ctx.accounts.seller.key(),
            GachaponError::Unauthorized
        );
        require!(
            ctx.accounts.buyer.key() != ctx.accounts.seller.key(),
            GachaponError::CannotBuyOwnListing
        );

        let asset = BaseAssetV1::try_from(&ctx.accounts.asset.to_account_info())
            .map_err(|_| error!(GachaponError::InvalidPull))?;
        require_keys_eq!(
            asset.owner,
            ctx.accounts.listing.key(),
            GachaponError::AssetNotListed
        );

        transfer_checked_usdc(
            &ctx.accounts.buyer_usdc.to_account_info(),
            &ctx.accounts.usdc_mint.to_account_info(),
            &ctx.accounts.seller_usdc.to_account_info(),
            &ctx.accounts.buyer.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            ctx.accounts.seller.key(),
            ctx.accounts.listing.price_usdc_units,
            USDC_DECIMALS,
        )?;

        let asset_key = ctx.accounts.asset.key();
        let listing_seeds: &[&[u8]] = &[
            LISTING_SEED,
            asset_key.as_ref(),
            &[ctx.accounts.listing.bump],
        ];

        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .payer(&ctx.accounts.buyer.to_account_info())
            .authority(Some(&ctx.accounts.listing.to_account_info()))
            .new_owner(&ctx.accounts.buyer.to_account_info())
            .system_program(Some(&ctx.accounts.system_program.to_account_info()))
            .invoke_signed(&[listing_seeds])?;

        let sale = &mut ctx.accounts.sale_record;
        sale.seller = ctx.accounts.seller.key();
        sale.buyer = ctx.accounts.buyer.key();
        sale.asset = ctx.accounts.asset.key();
        sale.machine = ctx.accounts.listing.machine;
        sale.pending_pull = ctx.accounts.listing.pending_pull;
        sale.pull_id = ctx.accounts.listing.pull_id;
        sale.reward_id = ctx.accounts.listing.reward_id;
        sale.price_usdc_units = ctx.accounts.listing.price_usdc_units;
        sale.sale_nonce = sale_nonce;
        sale.slot = Clock::get()?.slot;
        sale.unix_timestamp = Clock::get()?.unix_timestamp;
        sale.bump = ctx.bumps.sale_record;

        ctx.accounts.listing.status = ListingStatus::Sold as u8;
        msg!(
            "Sold listed asset {} to {} for {} USDC units",
            ctx.accounts.asset.key(),
            ctx.accounts.buyer.key(),
            ctx.accounts.listing.price_usdc_units
        );
        Ok(())
    }

    pub fn fuse_assets(ctx: Context<FuseAssets>, reward_id: u8) -> Result<()> {
        let machine = deserialize_account::<Machine>(&ctx.accounts.machine)?;
        require!(
            (reward_id as usize) < REWARD_COUNT,
            GachaponError::InvalidReward
        );
        let reward = machine.rewards[reward_id as usize].clone();

        let a1 = BaseAssetV1::try_from(&ctx.accounts.asset1.to_account_info())
            .map_err(|_| error!(GachaponError::InvalidAsset))?;
        let a2 = BaseAssetV1::try_from(&ctx.accounts.asset2.to_account_info())
            .map_err(|_| error!(GachaponError::InvalidAsset))?;
        let a3 = BaseAssetV1::try_from(&ctx.accounts.asset3.to_account_info())
            .map_err(|_| error!(GachaponError::InvalidAsset))?;

        require_keys_eq!(a1.owner, ctx.accounts.player.key(), GachaponError::AssetNotOwnedByPlayer);
        require_keys_eq!(a2.owner, ctx.accounts.player.key(), GachaponError::AssetNotOwnedByPlayer);
        require_keys_eq!(a3.owner, ctx.accounts.player.key(), GachaponError::AssetNotOwnedByPlayer);

        require!(ctx.accounts.asset1.key() != ctx.accounts.asset2.key(), GachaponError::InvalidAsset);
        require!(ctx.accounts.asset1.key() != ctx.accounts.asset3.key(), GachaponError::InvalidAsset);
        require!(ctx.accounts.asset2.key() != ctx.accounts.asset3.key(), GachaponError::InvalidAsset);

        require!(a1.uri == reward.uri, GachaponError::InvalidAsset);
        require!(a2.uri == reward.uri, GachaponError::InvalidAsset);
        require!(a3.uri == reward.uri, GachaponError::InvalidAsset);

        BurnV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset1.to_account_info())
            .authority(Some(&ctx.accounts.player.to_account_info()))
            .payer(&ctx.accounts.player.to_account_info())
            .invoke()?;

        BurnV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset2.to_account_info())
            .authority(Some(&ctx.accounts.player.to_account_info()))
            .payer(&ctx.accounts.player.to_account_info())
            .invoke()?;

        BurnV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset3.to_account_info())
            .authority(Some(&ctx.accounts.player.to_account_info()))
            .payer(&ctx.accounts.player.to_account_info())
            .invoke()?;

        let new_name = format!("{} (Ascended)", reward.name);
        let new_uri = format!("{}-lvl2", reward.uri);

        CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.new_asset.to_account_info())
            .authority(Some(&ctx.accounts.player.to_account_info()))
            .payer(&ctx.accounts.player.to_account_info())
            .owner(Some(&ctx.accounts.player.to_account_info()))
            .system_program(&ctx.accounts.system_program.to_account_info())
            .name(new_name)
            .uri(new_uri)
            .invoke()?;

        Ok(())
    }


    pub fn undelegate_inventory(ctx: Context<CommitInventory>) -> Result<()> {
        ctx.accounts.inventory.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.inventory.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }
}

fn settle_pull_on_er(ctx: Context<ConsumePull>, randomness: [u8; 32], pull_id: u64) -> Result<()> {
    require!(
        ctx.accounts.pending_pull.status == PullStatus::Pending as u8,
        GachaponError::PullAlreadySettled
    );
    require_eq!(
        ctx.accounts.pending_pull.pull_id,
        pull_id,
        GachaponError::InvalidPull
    );
    require_keys_eq!(
        ctx.accounts.pending_pull.machine,
        ctx.accounts.machine.key(),
        GachaponError::InvalidPull
    );
    require_keys_eq!(
        ctx.accounts.pending_pull.player,
        ctx.accounts.player.key(),
        GachaponError::InvalidPull
    );
    require!(
        ctx.accounts.machine.total_weight > 0,
        GachaponError::ConfigNotSet
    );

    let reward_index = select_reward(&ctx.accounts.machine, &randomness)?;
    let reward = ctx.accounts.machine.rewards[reward_index].clone();

    let machine = &mut ctx.accounts.machine;
    machine.rewards[reward_index].minted_count =
        machine.rewards[reward_index].minted_count.saturating_add(1);
    machine.pull_count = machine.pull_count.saturating_add(1);

    let pending_pull = &mut ctx.accounts.pending_pull;
    pending_pull.reward_id = reward.reward_id;
    pending_pull.status = PullStatus::Settled as u8;

    let inventory = &mut ctx.accounts.inventory;
    let asset = ctx.accounts.pending_pull.asset;
    if !inventory.assets.contains(&asset) {
        require!(
            inventory.assets.len() < MAX_INVENTORY_ITEMS,
            GachaponError::InventoryFull
        );
        inventory.assets.push(asset);
        inventory.reward_ids.push(reward.reward_id);
        inventory.selected_asset = asset;
        inventory.revision = inventory.revision.saturating_add(1);
    }

    msg!(
        "Settled ER pull {} with reward {} ({}) into claimable asset {}",
        pull_id,
        reward.reward_id,
        reward.name,
        asset
    );

    Ok(())
}

fn mint_claimed_asset(ctx: Context<ClaimAsset>, pull_id: u64) -> Result<()> {
    let machine = deserialize_account::<Machine>(&ctx.accounts.machine)?;
    let pending_pull = deserialize_account::<PendingPull>(&ctx.accounts.pending_pull)?;

    require!(
        pending_pull.status == PullStatus::Settled as u8,
        GachaponError::PullNotSettled
    );
    require_eq!(pending_pull.pull_id, pull_id, GachaponError::InvalidPull);
    require_keys_eq!(
        pending_pull.machine,
        ctx.accounts.machine.key(),
        GachaponError::InvalidPull
    );
    require_keys_eq!(
        pending_pull.player,
        ctx.accounts.player.key(),
        GachaponError::InvalidPull
    );
    require_keys_eq!(
        pending_pull.asset,
        ctx.accounts.asset.key(),
        GachaponError::InvalidPull
    );
    let expected_treasury =
        Pubkey::find_program_address(&[TREASURY_SEED, ctx.accounts.machine.key().as_ref()], &ID).0;
    require_keys_eq!(
        expected_treasury,
        ctx.accounts.treasury.key(),
        GachaponError::InvalidPull
    );
    let expected_update_authority = Pubkey::find_program_address(
        &[UPDATE_AUTHORITY_SEED, ctx.accounts.machine.key().as_ref()],
        &ID,
    )
    .0;
    require_keys_eq!(
        expected_update_authority,
        ctx.accounts.update_authority.key(),
        GachaponError::InvalidPull
    );

    let reward_id = pending_pull.reward_id;
    require!(
        (reward_id as usize) < REWARD_COUNT,
        GachaponError::InvalidReward
    );
    let reward = machine.rewards[reward_id as usize].clone();
    require_eq!(reward.reward_id, reward_id, GachaponError::InvalidReward);

    let machine_key = ctx.accounts.machine.key();
    let player_key = ctx.accounts.player.key();
    let pull_id_bytes = pull_id.to_le_bytes();
    let asset_seeds: &[&[u8]] = &[
        ASSET_SEED,
        machine_key.as_ref(),
        player_key.as_ref(),
        pull_id_bytes.as_ref(),
        &[pending_pull.asset_bump],
    ];
    let update_authority_seeds: &[&[u8]] = &[
        UPDATE_AUTHORITY_SEED,
        machine_key.as_ref(),
        &[machine.update_authority_bump],
    ];
    let signer_seeds: &[&[&[u8]]] = &[asset_seeds, update_authority_seeds];

    let attributes = vec![
        Attribute {
            key: "machine".to_string(),
            value: machine_key.to_string(),
        },
        Attribute {
            key: "pull_id".to_string(),
            value: pull_id.to_string(),
        },
        Attribute {
            key: "reward_id".to_string(),
            value: reward.reward_id.to_string(),
        },
    ];

    CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .authority(Some(&ctx.accounts.update_authority.to_account_info()))
        .payer(&ctx.accounts.player.to_account_info())
        .owner(Some(&ctx.accounts.player.to_account_info()))
        .update_authority(Some(&ctx.accounts.update_authority.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .name(reward.name.clone())
        .uri(reward.uri.clone())
        .plugins(vec![PluginAuthorityPair {
            plugin: Plugin::Attributes(Attributes {
                attribute_list: attributes,
            }),
            authority: Some(PluginAuthority::UpdateAuthority),
        }])
        .invoke_signed(signer_seeds)?;

    msg!(
        "Claimed pull {} into asset {}",
        pull_id,
        ctx.accounts.asset.key()
    );
    Ok(())
}

fn initialize_pending_pull(
    pending_pull: &mut Account<PendingPull>,
    machine_key: Pubkey,
    player_key: Pubkey,
    pull_id: u64,
    bump: u8,
) -> Result<()> {
    let pull_id_bytes = pull_id.to_le_bytes();
    let (asset, asset_bump) = Pubkey::find_program_address(
        &[
            ASSET_SEED,
            machine_key.as_ref(),
            player_key.as_ref(),
            pull_id_bytes.as_ref(),
        ],
        &ID,
    );

    pending_pull.machine = machine_key;
    pending_pull.player = player_key;
    pending_pull.asset = asset;
    pending_pull.pull_id = pull_id;
    pending_pull.reward_id = u8::MAX;
    pending_pull.status = PullStatus::Pending as u8;
    pending_pull.bump = bump;
    pending_pull.asset_bump = asset_bump;
    Ok(())
}

fn transfer_checked_usdc<'info>(
    player_usdc: &AccountInfo<'info>,
    usdc_mint: &AccountInfo<'info>,
    treasury_usdc: &AccountInfo<'info>,
    player: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    expected_treasury: Pubkey,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    require_keys_eq!(
        usdc_mint.key(),
        DEVNET_USDC_MINT,
        GachaponError::InvalidPaymentMint
    );
    require_keys_eq!(
        token_program.key(),
        TOKEN_PROGRAM_ID,
        GachaponError::InvalidPaymentMint
    );

    let mint_data = usdc_mint.try_borrow_data()?;
    require!(
        mint_data.len() > 44 && mint_data[44] == decimals,
        GachaponError::InvalidPaymentMint
    );
    drop(mint_data);

    validate_spl_token_account(player_usdc, DEVNET_USDC_MINT, player.key())?;
    validate_spl_token_account(treasury_usdc, DEVNET_USDC_MINT, expected_treasury)?;

    let mut data = Vec::with_capacity(10);
    data.push(12);
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(decimals);

    let ix = Instruction {
        program_id: TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(player_usdc.key(), false),
            AccountMeta::new_readonly(usdc_mint.key(), false),
            AccountMeta::new(treasury_usdc.key(), false),
            AccountMeta::new_readonly(player.key(), true),
        ],
        data,
    };

    invoke(
        &ix,
        &[
            player_usdc.clone(),
            usdc_mint.clone(),
            treasury_usdc.clone(),
            player.clone(),
            token_program.clone(),
        ],
    )?;
    Ok(())
}

fn transfer_checked_usdc_signed<'info>(
    source_usdc: &AccountInfo<'info>,
    usdc_mint: &AccountInfo<'info>,
    destination_usdc: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    expected_destination_owner: Pubkey,
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    require_keys_eq!(
        usdc_mint.key(),
        DEVNET_USDC_MINT,
        GachaponError::InvalidPaymentMint
    );
    require_keys_eq!(
        token_program.key(),
        TOKEN_PROGRAM_ID,
        GachaponError::InvalidPaymentMint
    );

    let mint_data = usdc_mint.try_borrow_data()?;
    require!(
        mint_data.len() > 44 && mint_data[44] == decimals,
        GachaponError::InvalidPaymentMint
    );
    drop(mint_data);

    validate_spl_token_account(source_usdc, DEVNET_USDC_MINT, authority.key())?;
    validate_spl_token_account(
        destination_usdc,
        DEVNET_USDC_MINT,
        expected_destination_owner,
    )?;

    let mut data = Vec::with_capacity(10);
    data.push(12);
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(decimals);

    let ix = Instruction {
        program_id: TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(source_usdc.key(), false),
            AccountMeta::new_readonly(usdc_mint.key(), false),
            AccountMeta::new(destination_usdc.key(), false),
            AccountMeta::new_readonly(authority.key(), true),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            source_usdc.clone(),
            usdc_mint.clone(),
            destination_usdc.clone(),
            authority.clone(),
            token_program.clone(),
        ],
        signer_seeds,
    )?;
    Ok(())
}

fn validate_spl_token_account(
    account: &AccountInfo,
    expected_mint: Pubkey,
    expected_owner: Pubkey,
) -> Result<()> {
    require_keys_eq!(
        *account.owner,
        TOKEN_PROGRAM_ID,
        GachaponError::InvalidPaymentMint
    );
    let data = account.try_borrow_data()?;
    require!(data.len() >= 72, GachaponError::InvalidPaymentMint);
    let mint = Pubkey::new_from_array(data[0..32].try_into().unwrap());
    let owner = Pubkey::new_from_array(data[32..64].try_into().unwrap());
    require_keys_eq!(mint, expected_mint, GachaponError::InvalidPaymentMint);
    require_keys_eq!(owner, expected_owner, GachaponError::InvalidPaymentOwner);
    Ok(())
}

fn deserialize_account<T: AccountDeserialize>(account: &UncheckedAccount) -> Result<T> {
    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    T::try_deserialize(&mut data_slice).map_err(Into::into)
}

fn select_reward(machine: &Machine, randomness: &[u8; 32]) -> Result<usize> {
    let rnd = random_u32(randomness);
    let mut cursor = rnd % machine.total_weight;

    for (index, reward) in machine.rewards.iter().enumerate() {
        if cursor < reward.weight {
            return Ok(index);
        }
        cursor = cursor.saturating_sub(reward.weight);
    }

    err!(GachaponError::ConfigNotSet)
}

fn fund_treasury<'info>(
    from: &AccountInfo<'info>,
    treasury: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    lamports: u64,
) -> Result<()> {
    anchor_lang::system_program::transfer(
        CpiContext::new(
            system_program.clone(),
            anchor_lang::system_program::Transfer {
                from: from.clone(),
                to: treasury.clone(),
            },
        ),
        lamports,
    )
}

#[derive(Accounts)]
#[instruction(machine_id: u64)]
pub struct Init<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Machine::INIT_SPACE,
        seeds = [MACHINE_SEED, authority.key().as_ref(), machine_id.to_le_bytes().as_ref()],
        bump
    )]
    pub machine: Account<'info, Machine>,
    /// CHECK: System-owned PDA funded by users and used as callback payer.
    #[account(mut, seeds = [TREASURY_SEED, machine.key().as_ref()], bump)]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: PDA used as Metaplex Core update authority.
    #[account(seeds = [UPDATE_AUTHORITY_SEED, machine.key().as_ref()], bump)]
    pub update_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UploadConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority)]
    pub machine: Account<'info, Machine>,
}

#[derive(Accounts)]
#[instruction(pull_id: u64)]
pub struct PreparePull<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    /// CHECK: The ER pull validates machine contents after this PDA is delegated.
    pub machine: UncheckedAccount<'info>,
    #[account(
        init,
        payer = player,
        space = 8 + PendingPull::INIT_SPACE,
        seeds = [
            PULL_SEED,
            machine.key().as_ref(),
            player.key().as_ref(),
            pull_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub pending_pull: Account<'info, PendingPull>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pull_id: u64)]
pub struct PreparePaidPull<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    /// CHECK: The ER pull validates machine contents after this PDA is delegated.
    pub machine: UncheckedAccount<'info>,
    /// CHECK: System-owned machine treasury PDA; its token account receives pack payments.
    #[account(seeds = [TREASURY_SEED, machine.key().as_ref()], bump)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        init,
        payer = player,
        space = 8 + PendingPull::INIT_SPACE,
        seeds = [
            PULL_SEED,
            machine.key().as_ref(),
            player.key().as_ref(),
            pull_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub pending_pull: Account<'info, PendingPull>,
    /// CHECK: Validated manually as the standard Devnet USDC mint.
    #[account(address = DEVNET_USDC_MINT)]
    pub usdc_mint: UncheckedAccount<'info>,
    /// CHECK: SPL token account validated manually before transfer.
    #[account(mut)]
    pub player_usdc: UncheckedAccount<'info>,
    /// CHECK: SPL token account validated manually before transfer.
    #[account(mut)]
    pub treasury_usdc: UncheckedAccount<'info>,
    /// CHECK: Validated by address constraint.
    #[account(address = TOKEN_PROGRAM_ID)]
    pub token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(pull_id: u64)]
pub struct DelegatePendingPull<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    /// CHECK: Used as a PDA seed for the pull account.
    pub machine: UncheckedAccount<'info>,
    /// CHECK: The delegation program validates and takes control of this PDA.
    #[account(
        mut,
        del,
        seeds = [
            PULL_SEED,
            machine.key().as_ref(),
            player.key().as_ref(),
            pull_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub pending_pull: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(pull_id: u64)]
pub struct Pull<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut)]
    pub machine: Account<'info, Machine>,
    #[account(
        mut,
        seeds = [
            PULL_SEED,
            machine.key().as_ref(),
            player.key().as_ref(),
            pull_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub pending_pull: Account<'info, PendingPull>,
    #[account(
        mut,
        seeds = [INVENTORY_SEED, player.key().as_ref()],
        bump = inventory.bump,
        has_one = player
    )]
    pub inventory: Account<'info, PlayerInventory>,
    /// CHECK: PDA that authorizes this program as the VRF callback target.
    #[account(seeds = [VRF_IDENTITY_SEED], bump)]
    pub callback_identity: UncheckedAccount<'info>,
    /// CHECK: Validated by address constraint against the known VRF queue.
    #[account(mut, address = DEFAULT_VRF_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
    /// CHECK: VRF program.
    #[account(address = VRF_PROGRAM_ID)]
    pub vrf_program: UncheckedAccount<'info>,
    /// CHECK: Slot hashes sysvar required by the VRF program.
    #[account(address = sysvar::slot_hashes::ID)]
    pub slot_hashes: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(randomness: [u8; 32], pull_id: u64)]
pub struct ConsumePull<'info> {
    #[account(address = VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,
    /// CHECK: Player receives the minted Core asset.
    pub player: UncheckedAccount<'info>,
    #[account(mut)]
    pub machine: Account<'info, Machine>,
    #[account(
        mut,
        seeds = [
            PULL_SEED,
            machine.key().as_ref(),
            player.key().as_ref(),
            pull_id.to_le_bytes().as_ref()
        ],
        bump = pending_pull.bump
    )]
    pub pending_pull: Account<'info, PendingPull>,
    #[account(
        mut,
        seeds = [INVENTORY_SEED, player.key().as_ref()],
        bump = inventory.bump,
        has_one = player
    )]
    pub inventory: Account<'info, PlayerInventory>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeInventory<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + PlayerInventory::INIT_SPACE,
        seeds = [INVENTORY_SEED, player.key().as_ref()],
        bump
    )]
    pub inventory: Account<'info, PlayerInventory>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateInventory<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    /// CHECK: The delegation program validates and takes control of this PDA.
    #[account(
        mut,
        del,
        seeds = [INVENTORY_SEED, player.key().as_ref()],
        bump
    )]
    pub inventory: UncheckedAccount<'info>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(machine_id: u64)]
pub struct DelegateMachine<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: The delegation program validates and takes control of this PDA.
    #[account(
        mut,
        del,
        seeds = [MACHINE_SEED, authority.key().as_ref(), machine_id.to_le_bytes().as_ref()],
        bump
    )]
    pub machine: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UpdateInventory<'info> {
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [INVENTORY_SEED, player.key().as_ref()],
        bump = inventory.bump,
        has_one = player
    )]
    pub inventory: Account<'info, PlayerInventory>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitInventory<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [INVENTORY_SEED, payer.key().as_ref()],
        bump = inventory.bump,
        constraint = inventory.player == payer.key() @ GachaponError::Unauthorized
    )]
    pub inventory: Account<'info, PlayerInventory>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitGachaState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub machine: Account<'info, Machine>,
    #[account(mut)]
    pub pending_pull: Account<'info, PendingPull>,
    #[account(
        mut,
        seeds = [INVENTORY_SEED, payer.key().as_ref()],
        bump = inventory.bump,
        constraint = inventory.player == payer.key() @ GachaponError::Unauthorized
    )]
    pub inventory: Account<'info, PlayerInventory>,
    /// CHECK: Magic program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
    /// CHECK: Magic context.
    #[account(mut, address = MAGIC_CONTEXT_ID)]
    pub magic_context: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(pull_id: u64)]
pub struct ClaimAsset<'info> {
    /// Player receives the minted Core asset and pays its Devnet rent.
    #[account(mut)]
    pub player: Signer<'info>,
    /// CHECK: May still be owned by the delegation program; data is verified manually.
    pub machine: UncheckedAccount<'info>,
    /// CHECK: May still be owned by the delegation program; PDA/data are verified manually.
    pub pending_pull: UncheckedAccount<'info>,
    /// CHECK: Deterministic Metaplex Core asset PDA created by this claim.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: System-owned PDA funded by users and used as mint payer.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: PDA used as Metaplex Core update authority.
    pub update_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: Validated by address constraint.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(pull_id: u64)]
pub struct InstantBuyback<'info> {
    /// Player owns the Core asset and receives the buyback payout.
    #[account(mut)]
    pub player: Signer<'info>,
    /// CHECK: May still be owned by the delegation program; data is verified manually.
    pub machine: UncheckedAccount<'info>,
    /// CHECK: May still be owned by the delegation program; PDA/data are verified manually.
    pub pending_pull: UncheckedAccount<'info>,
    /// CHECK: Metaplex Core asset transferred into treasury custody during buyback.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: Treasury PDA signs the USDC payout and receives the sold asset.
    #[account(
        seeds = [TREASURY_SEED, machine.key().as_ref()],
        bump
    )]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: Validated manually as the standard Devnet USDC mint.
    #[account(address = DEVNET_USDC_MINT)]
    pub usdc_mint: UncheckedAccount<'info>,
    /// CHECK: SPL token account validated manually before payout.
    #[account(mut)]
    pub treasury_usdc: UncheckedAccount<'info>,
    /// CHECK: SPL token account validated manually before payout.
    #[account(mut)]
    pub player_usdc: UncheckedAccount<'info>,
    /// CHECK: Validated by address constraint.
    #[account(address = TOKEN_PROGRAM_ID)]
    pub token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: Validated by address constraint.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(pull_id: u64, price_usdc_units: u64)]
pub struct CreateListing<'info> {
    /// Seller owns the Core asset before listing and pays listing rent.
    #[account(mut)]
    pub seller: Signer<'info>,
    /// CHECK: PDA/data verified against the settled pull.
    pub machine: UncheckedAccount<'info>,
    /// CHECK: PDA/data verified against the settled pull.
    pub pending_pull: UncheckedAccount<'info>,
    /// CHECK: Metaplex Core asset moved into listing PDA custody.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [LISTING_SEED, asset.key().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    pub system_program: Program<'info, System>,
    /// CHECK: Validated by address constraint.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    /// Original seller receives the Core asset back.
    #[account(mut)]
    pub seller: Signer<'info>,
    /// CHECK: Metaplex Core asset held by listing PDA.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    #[account(
        mut,
        close = seller,
        seeds = [LISTING_SEED, asset.key().as_ref()],
        bump = listing.bump
    )]
    pub listing: Account<'info, Listing>,
    pub system_program: Program<'info, System>,
    /// CHECK: Validated by address constraint.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(sale_nonce: u64)]
pub struct BuyListing<'info> {
    /// Buyer pays USDC and receives the Core asset.
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Seller receives USDC. Key must match listing.seller.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    /// CHECK: Metaplex Core asset held by listing PDA.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    #[account(
        mut,
        close = seller,
        seeds = [LISTING_SEED, asset.key().as_ref()],
        bump = listing.bump
    )]
    pub listing: Account<'info, Listing>,
    #[account(
        init,
        payer = buyer,
        space = 8 + SaleRecord::INIT_SPACE,
        seeds = [SALE_SEED, asset.key().as_ref(), sale_nonce.to_le_bytes().as_ref()],
        bump
    )]
    pub sale_record: Account<'info, SaleRecord>,
    /// CHECK: Validated manually as the standard Devnet USDC mint.
    #[account(address = DEVNET_USDC_MINT)]
    pub usdc_mint: UncheckedAccount<'info>,
    /// CHECK: SPL token account validated manually before payment.
    #[account(mut)]
    pub buyer_usdc: UncheckedAccount<'info>,
    /// CHECK: SPL token account validated manually before payment.
    #[account(mut)]
    pub seller_usdc: UncheckedAccount<'info>,
    /// CHECK: Validated by address constraint.
    #[account(address = TOKEN_PROGRAM_ID)]
    pub token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: Validated by address constraint.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct FuseAssets<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    /// CHECK: Validated in instruction body.
    pub machine: UncheckedAccount<'info>,
    /// CHECK: Core asset 1
    #[account(mut)]
    pub asset1: UncheckedAccount<'info>,
    /// CHECK: Core asset 2
    #[account(mut)]
    pub asset2: UncheckedAccount<'info>,
    /// CHECK: Core asset 3
    #[account(mut)]
    pub asset3: UncheckedAccount<'info>,
    /// CHECK: New fused asset PDA
    #[account(mut)]
    pub new_asset: Signer<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: Validated by address constraint.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Machine {
    pub authority: Pubkey,
    pub machine_id: u64,
    pub bump: u8,
    pub treasury_bump: u8,
    pub update_authority_bump: u8,
    pub total_weight: u32,
    pub pull_count: u64,
    pub rewards: [RewardTemplate; REWARD_COUNT],
}

#[account]
#[derive(InitSpace)]
pub struct PendingPull {
    pub machine: Pubkey,
    pub player: Pubkey,
    pub asset: Pubkey,
    pub pull_id: u64,
    pub reward_id: u8,
    pub status: u8,
    pub bump: u8,
    pub asset_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PlayerInventory {
    pub player: Pubkey,
    pub bump: u8,
    pub revision: u64,
    pub selected_asset: Pubkey,
    #[max_len(MAX_INVENTORY_ITEMS)]
    pub assets: Vec<Pubkey>,
    #[max_len(MAX_INVENTORY_ITEMS)]
    pub reward_ids: Vec<u8>,
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub asset: Pubkey,
    pub machine: Pubkey,
    pub pending_pull: Pubkey,
    pub pull_id: u64,
    pub reward_id: u8,
    pub price_usdc_units: u64,
    pub status: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct SaleRecord {
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub asset: Pubkey,
    pub machine: Pubkey,
    pub pending_pull: Pubkey,
    pub pull_id: u64,
    pub reward_id: u8,
    pub price_usdc_units: u64,
    pub sale_nonce: u64,
    pub slot: u64,
    pub unix_timestamp: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct RewardTemplate {
    pub reward_id: u8,
    pub weight: u32,
    pub minted_count: u64,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    #[max_len(MAX_URI_LEN)]
    pub uri: String,
}

impl Default for RewardTemplate {
    fn default() -> Self {
        Self {
            reward_id: 0,
            weight: 0,
            minted_count: 0,
            name: String::new(),
            uri: String::new(),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RewardTemplateInput {
    pub weight: u32,
    pub name: String,
    pub uri: String,
}

#[repr(u8)]
pub enum PullStatus {
    Pending = 0,
    Settled = 1,
    Claimed = 2,
}

#[repr(u8)]
pub enum ListingStatus {
    Active = 0,
    Sold = 1,
    Cancelled = 2,
}

#[error_code]
pub enum GachaponError {
    #[msg("Only the machine authority may perform this action")]
    Unauthorized,
    #[msg("Reward weights must be positive and fit in u32")]
    InvalidWeight,
    #[msg("Reward name is too long")]
    NameTooLong,
    #[msg("Reward URI is too long")]
    UriTooLong,
    #[msg("Machine reward config has not been uploaded")]
    ConfigNotSet,
    #[msg("Pull is invalid")]
    InvalidPull,
    #[msg("Pull has already been settled")]
    PullAlreadySettled,
    #[msg("Pull has not been settled yet")]
    PullNotSettled,
    #[msg("Reward id is invalid")]
    InvalidReward,
    #[msg("Inventory is full")]
    InventoryFull,
    #[msg("Asset is not present in this inventory")]
    AssetNotInInventory,
    #[msg("Payment mint must be standard Devnet USDC")]
    InvalidPaymentMint,
    #[msg("Payment token account owner is invalid")]
    InvalidPaymentOwner,
    #[msg("Asset is not owned by the player")]
    AssetNotOwnedByPlayer,
    #[msg("Listing price is invalid")]
    InvalidListingPrice,
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Asset is not held by the listing")]
    AssetNotListed,
    #[msg("Buyer cannot buy their own listing")]
    CannotBuyOwnListing,
    #[msg("Invalid asset provided")]
    InvalidAsset,
}

#[derive(Default)]
pub struct RawRequestRandomnessParams {
    pub payer: Pubkey,
    pub oracle_queue: Pubkey,
    pub callback_program_id: Pubkey,
    pub callback_discriminator: Vec<u8>,
    pub accounts_metas: Option<Vec<SerializableAccountMeta>>,
    pub caller_seed: [u8; 32],
    pub callback_args: Option<Vec<u8>>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, PartialEq, Default)]
pub struct RequestRandomness {
    pub caller_seed: [u8; 32],
    pub callback_program_id: Pubkey,
    pub callback_discriminator: Vec<u8>,
    pub callback_accounts_metas: Vec<SerializableAccountMeta>,
    pub callback_args: Vec<u8>,
}

impl RequestRandomness {
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = vec![3, 0, 0, 0, 0, 0, 0, 0];
        self.serialize(&mut bytes).unwrap();
        bytes
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, PartialEq, Default, Clone)]
pub struct SerializableAccountMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}

pub fn create_request_randomness_ix(params: RawRequestRandomnessParams) -> Instruction {
    Instruction {
        program_id: VRF_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(params.payer, true),
            AccountMeta::new_readonly(
                Pubkey::find_program_address(&[VRF_IDENTITY_SEED], &params.callback_program_id).0,
                true,
            ),
            AccountMeta::new(params.oracle_queue, false),
            AccountMeta::new_readonly(anchor_lang::system_program::ID, false),
            AccountMeta::new_readonly(sysvar::slot_hashes::ID, false),
        ],
        data: RequestRandomness {
            caller_seed: params.caller_seed,
            callback_program_id: params.callback_program_id,
            callback_discriminator: params.callback_discriminator,
            callback_accounts_metas: params.accounts_metas.unwrap_or_default(),
            callback_args: params.callback_args.unwrap_or_default(),
        }
        .to_bytes(),
    }
}

pub fn random_u32(bytes: &[u8; 32]) -> u32 {
    u32::from_le_bytes([bytes[28], bytes[29], bytes[30], bytes[31]])
}

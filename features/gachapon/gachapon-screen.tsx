import { MaterialCommunityIcons, FontAwesome6 } from '@expo/vector-icons'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import { PublicKey } from '@solana/web3.js'
import Reanimated, {
  FadeInUp,
  FadeInRight,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  DEFAULT_LIST_PRICE_USDC_UNITS,
  DEFAULT_VRF_QUEUE,
  BUYBACK_PAYOUT_USDC_UNITS,
  DEVNET_USDC_MINT,
  ER_DEVNET_RPC_URL,
  PACK_PRICE_USDC,
  PACK_PRICE_USDC_UNITS,
  MEGAPOT_CONTRIBUTION_USDC_UNITS,
  TREASURY_PACK_PAYMENT_USDC_UNITS,
  JACKPOT_STATUS,
  PROGRAM_ID,
  REWARDS,
  VRF_PROGRAM_ID,
  explorerAddress,
  explorerErAddress,
  explorerErTx,
  explorerTx,
  findAssociatedTokenAddress,
  findGachaponAccounts,
  findInventoryAddress,
  findJackpotAddress,
  findJackpotRoundAddress,
  findJackpotEntryAddress,
  shortKey,
} from '@/lib/gachapon-client'
import { InventoryItem, MarketListing, MarketPurchaseReceipt, MarketSale, PullStage, useGachapon } from './use-gachapon'

type Tab = 'home' | 'packs' | 'jackpot' | 'vault' | 'market' | 'proof'
type MarketSort = 'newest' | 'low' | 'high' | 'rarity'
type RarityFilter = 'all' | 'common' | 'rare' | 'epic' | 'legendary'

const colors = {
  background: '#0B0D0C',
  surface: '#151816',
  raised: '#1D211E',
  border: '#303631',
  text: '#F4F7F2',
  muted: '#9BA49D',
  verified: '#5AE6FF',
  danger: '#FF8C82',
  common: '#8FA08C',
  rare: '#55CBE8',
  epic: '#F0B85A',
  legendary: '#F2D16B',
}

const rarityColors = [colors.common, colors.rare, colors.epic, colors.legendary, '#FF6B6B']
const rewardArt = [
  require('@/assets/images/voiddeck/anime_1star.jpg'),
  require('@/assets/images/voiddeck/anime_2star.jpg'),
  require('@/assets/images/voiddeck/anime_common.jpg'),
  require('@/assets/images/voiddeck/anime_rare.jpg'),
  require('@/assets/images/voiddeck/anime_legendary.jpg'),
] as const
const packArt = require('@/assets/images/voiddeck/gacha-machine-user.png')
const brandMark = require('@/assets/images/voiddeck/icon.png')

function formatUsdcUnits(units: bigint) {
  const whole = units / 1_000_000n
  const fraction = (units % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString()
}

function formatWalletUsdc(value: number | null) {
  if (typeof value !== 'number') return 'Loading'
  if (value === 0) return '0.00'
  const fixed = value >= 100 ? value.toFixed(1) : value.toFixed(3)
  return fixed.replace(/\.?0+$/, '')
}

function formatProofTimestamp(unixTimestamp?: string | null) {
  if (!unixTimestamp) return 'Recorded onchain'
  const milliseconds = Number(unixTimestamp) * 1000
  if (!Number.isFinite(milliseconds)) return unixTimestamp
  return new Date(milliseconds).toLocaleString()
}

const listPricePresets = [
  [500_000n, 750_000n, 1_000_000n],
  [1_250_000n, 1_750_000n, 2_500_000n],
  [3_000_000n, 4_500_000n, 6_000_000n],
  [8_000_000n, 12_000_000n, 20_000_000n],
  [25_000_000n, 35_000_000n, 50_000_000n],
] as const

function suggestedListPrice(rewardId: number) {
  return listPricePresets[rewardId]?.[1] ?? DEFAULT_LIST_PRICE_USDC_UNITS
}

function parseUsdcInput(value: string) {
  const normalized = value.trim()
  if (!/^\d+(\.\d{0,6})?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  return units > 0n ? units : null
}

export function GachaponScreen() {
  const game = useGachapon()
  const [tab, setTab] = useState<Tab>('home')
  const [refreshing, setRefreshing] = useState(false)
  const [revealDismissed, setRevealDismissed] = useState(false)
  const [revealReady, setRevealReady] = useState(false)
  const [successMessage, setSuccessMessage] = useState<{ title: string; body: string } | null>(null)

  useEffect(() => {
    if (game.stage !== 'revealed') {
      setRevealReady(false)
      return
    }

    setRevealDismissed(false)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined)
    const timer = setTimeout(() => setRevealReady(true), 900)
    return () => clearTimeout(timer)
  }, [game.revealedItem?.accounts.asset, game.stage])

  useEffect(() => {
    if (!game.lastMarketPurchase) return
    setTab('vault')
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
  }, [game.lastMarketPurchase?.signature])

  const onRefresh = async () => {
    setRefreshing(true)
    await game.refresh().catch(() => undefined)
    setRefreshing(false)
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Image source={require('@/assets/images/bg-gradient.jpg')} style={styles.bgGradient} contentFit="cover" />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open MATKA home"
          onPress={() => setTab('home')}
          style={({ pressed }) => [styles.brandButton, pressed && styles.pressed]}
        >
          <Image source={brandMark} style={styles.brandMark} contentFit="cover" />
          <View>
            <Text style={styles.wordmark}>MATKA</Text>
            <View style={styles.networkRow}>
              <View style={styles.liveDot} />
              <Text style={styles.networkText}>MAGICBLOCK DEVNET</Text>
            </View>
          </View>
        </Pressable>
        <WalletButton
          publicKey={game.publicKey?.toString() ?? null}
          walletMode={game.walletMode}
          balance={game.balance}
          usdcBalance={game.usdcBalance}
          onConnect={() => void game.connectDevWallet()}
          onDisconnect={() => void game.disconnect()}
        />
      </View>

      {game.isOffline ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <MaterialCommunityIcons name="wifi-off" size={18} color={colors.background} />
          <Text style={styles.offlineText}>Offline. Pulls are paused.</Text>
        </View>
      ) : null}

      {game.lastMarketPurchase ? (
        <View style={styles.globalReceiptWrap}>
          <MarketPurchaseSuccess receipt={game.lastMarketPurchase} compact />
        </View>
      ) : null}

      <View style={styles.content}>
        {tab === 'home' ? (
          <HomeView game={game} onEnter={() => setTab('packs')} onTabChange={(t) => setTab(t)} />
        ) : tab === 'packs' ? (
          <PullView game={game} onFund={() => void game.requestAirdrop()} />
        ) : tab === 'vault' ? (
          <CollectionView
            items={game.inventory}
            listings={game.marketListings}
            sales={game.marketSales}
            isListing={game.isListing}
            listingAsset={game.listingAsset}
            fusingId={game.fusingId}
            onList={(item, priceUsdcUnits) => {
              game.listItem(item, priceUsdcUnits).then((success) => {
                if (success) {
                  setSuccessMessage({ title: 'Listed Successfully', body: 'Your card is now live on the marketplace!' })
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
                }
              })
            }}
            onCancelListing={(item) => {
              game.cancelListing(item).then((success) => {
                if (success) {
                  setSuccessMessage({ title: 'Listing Cancelled', body: 'Your card has been delisted from the market.' })
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
                }
              })
            }}
            onFuse={(rewardId, assets) => {
              game.fuseCharacters(rewardId, assets).then((sig) => {
                if (sig) {
                  setSuccessMessage({
                    title: 'Fusion Complete',
                    body: `Three ${REWARDS[rewardId].name}s burned. One ${REWARDS[rewardId + 1].name} minted to your Vault.`,
                  })
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
                }
              }).catch(() => undefined)
            }}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        ) : tab === 'market' ? (
          <MarketView game={game} />
        ) : tab === 'jackpot' ? (
          <JackpotView game={game} />
        ) : (
          <ProofView game={game} />
        )}
      </View>

      <View style={styles.tabBar} accessibilityRole="tablist">
        <TabButton icon="home-outline" label="Home" selected={tab === 'home'} onPress={() => setTab('home')} />
        <TabButton icon="cards-outline" label="Packs" selected={tab === 'packs'} onPress={() => setTab('packs')} />
        <TabButton icon="trophy-outline" label="Pot" selected={tab === 'jackpot'} onPress={() => setTab('jackpot')} />
        <TabButton
          icon="view-grid-outline"
          label="Vault"
          badge={game.inventory.length}
          selected={tab === 'vault'}
          onPress={() => setTab('vault')}
        />
        <TabButton icon="store" label="Market" selected={tab === 'market'} onPress={() => setTab('market')} />
        <TabButton
          icon="shield-check-outline"
          label="Proof"
          selected={tab === 'proof'}
          onPress={() => setTab('proof')}
        />
      </View>

      <SuccessModal
        visible={Boolean(successMessage)}
        title={successMessage?.title ?? ''}
        body={successMessage?.body ?? ''}
        onDismiss={() => setSuccessMessage(null)}
      />

      <RevealModal
        item={game.revealedItem}
        visible={Boolean(game.stage === 'revealed' && game.revealedItem && revealReady && !revealDismissed)}
        onKeep={() => {
          game.resetReveal()
          setRevealDismissed(true)
          setTab('vault')
        }}
        onAgain={() => {
          game.resetReveal()
          setTab('packs')
        }}
        onProof={() => {
          game.resetReveal()
          setRevealDismissed(true)
          setTab('proof')
        }}
        onBuyback={(item) => void game.buyback(item)}
        isBuyingBack={game.isBuyingBack}
      />
    </SafeAreaView>
  )
}

function DynamicPack({ style }: { style: any }) {
  return (
    <View style={[style, styles.dynamicPackContainer]}>
      <Image
        source={packArt}
        style={[StyleSheet.absoluteFillObject, { transform: [{ scale: 1.15 }, { translateY: -25 }] }]}
        contentFit="cover"
      />
      <View style={[StyleSheet.absoluteFillObject, styles.dynamicPackScrim]} />
    </View>
  )
}

function GachaMachinePack({ style }: { style: any }) {
  return (
    <View style={[style, { overflow: 'hidden', backgroundColor: 'transparent' }]}>
      <Image source={packArt} style={StyleSheet.absoluteFillObject} contentFit="cover" />
    </View>
  )
}

function HomeView({ game, onEnter, onTabChange }: { game: ReturnType<typeof useGachapon>; onEnter: () => void; onTabChange?: (tab: Tab) => void }) {
  const floatAnim = useSharedValue(0)

  useEffect(() => {
    floatAnim.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    )
  }, [])

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatAnim.value }, { scale: 1.05 }],
  }))
  const megapotAddress = findJackpotAddress()

  return (
    <ScrollView 
      contentContainerStyle={{ padding: 24, paddingBottom: 64 }} 
      showsVerticalScrollIndicator={false}
    >
      {/* Background Gradient Effect Removed */}

      <Reanimated.View entering={FadeInDown.duration(600).springify()} style={{ marginTop: 20 }}>
        <Text
          style={{
            color: '#DFE0E1',
            fontSize: 32,
            fontFamily: 'ClashDisplay-Bold',
            lineHeight: 38,
          }}
        >
          Crack the <Text style={{ color: colors.verified }}>Matka</Text>.{'\n'}Win the MegaPot.
        </Text>
        
        <Text
          style={{
            color: '#DBDBDB',
            fontSize: 16,
            fontFamily: 'Manrope_500Medium',
            lineHeight: 24,
            marginTop: 16,
            marginBottom: 24,
          }}
        >
          Pull mystical Matkas, fuse them to reach Legendary tier, and stake your assets in a provably fair, high-stakes global lottery. Trade freely on the decentralized market, powered by MagicBlock Ephemeral Rollups for instant, gasless gameplay.
        </Text>

        <View style={{ gap: 16 }}>
          <Pressable
            onPress={onEnter}
            style={({ pressed }) => [
              {
                backgroundColor: '#FFFFFF',
                borderRadius: 30,
                paddingVertical: 16,
                paddingHorizontal: 40,
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={{ color: '#000000', fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 1 }}>
              ENTER GACHA
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onTabChange && onTabChange('jackpot')}
            style={({ pressed }) => [
              {
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
                borderRadius: 30,
                paddingVertical: 16,
                paddingHorizontal: 40,
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { backgroundColor: 'rgba(255,255,255,0.05)' },
            ]}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 1 }}>
              VIEW MEGAPOT
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onTabChange && onTabChange('market')}
            style={({ pressed }) => [
              {
                backgroundColor: '#FFFFFF',
                borderRadius: 30,
                paddingVertical: 16,
                paddingHorizontal: 40,
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={{ color: '#000000', fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 1 }}>
              BROWSE MARKET
            </Text>
          </Pressable>
        </View>
      </Reanimated.View>



      <View style={{ marginTop: 80, height: 300, alignItems: 'center', justifyContent: 'center' }}>
        <Reanimated.View style={floatStyle}>
          {/* Left Wing Card */}
          <View style={{ position: 'absolute', zIndex: 1, transform: [{ translateX: -85 }, { translateY: 0 }, { rotate: '-15deg' }] }}>
             <Image source={rewardArt[2]} style={{ width: 140, height: 210, borderRadius: 14 }} contentFit="cover" />
          </View>
          
          {/* Right Wing Card */}
          <View style={{ position: 'absolute', zIndex: 2, transform: [{ translateX: 85 }, { translateY: 0 }, { rotate: '15deg' }] }}>
             <Image source={rewardArt[3]} style={{ width: 140, height: 210, borderRadius: 14 }} contentFit="cover" />
          </View>
          
          {/* Center Card (Straight) */}
          <View style={{ zIndex: 3, transform: [{ translateY: 30 }, { rotate: '0deg' }, { scale: 1.15 }] }}>
             <Image source={rewardArt[4]} style={{ width: 150, height: 225, borderRadius: 14 }} contentFit="cover" />
          </View>
        </Reanimated.View>
      </View>

      {/* How it Works Section */}
      <View style={{ marginTop: 80, marginBottom: 40 }}>
        {/* Tilted Header */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            alignSelf: 'center',
            paddingVertical: 18,
            paddingHorizontal: 36,
            transform: [{ rotate: '-3deg' }, { translateY: 20 }],
            zIndex: 10,
          }}
        >
          <Text style={{ color: '#000000', fontSize: 24, fontFamily: 'ClashDisplay-Bold' }}>
            How it works
          </Text>
        </View>

        {/* Cyan Box */}
        <View
          style={{
            backgroundColor: 'rgb(51, 205, 227)',
            borderRadius: 24,
            paddingTop: 60,
            paddingBottom: 40,
            paddingHorizontal: 24,
            gap: 40,
          }}
        >
          {/* Step 1 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <View style={{ alignItems: 'center', width: 40 }}>
              <MaterialCommunityIcons name="pot" size={28} color="#000000" />
              <Text style={{ color: '#000000', fontSize: 24, fontFamily: 'ClashDisplay-Bold', marginTop: 4 }}>01</Text>
            </View>
            <Text style={{ flex: 1, color: '#121212', fontSize: 16, fontFamily: 'Manrope_500Medium', lineHeight: 24 }}>
              <Text style={{ fontFamily: 'Inter_700Bold' }}>Pay {PACK_PRICE_USDC} USDC, Pull instantly</Text>
              {'\n'}
              Each pull costs {PACK_PRICE_USDC} USDC (1.50 treasury, 0.50 MegaPot). Powered by MagicBlock Ephemeral Rollups for instant, gasless pulls. VRF decides your tier.
            </Text>
          </View>

          {/* Step 2 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <View style={{ alignItems: 'center', width: 40 }}>
              <MaterialCommunityIcons name="fire" size={28} color="#000000" />
              <Text style={{ color: '#000000', fontSize: 24, fontFamily: 'ClashDisplay-Bold', marginTop: 4 }}>02</Text>
            </View>
            <Text style={{ flex: 1, color: '#121212', fontSize: 16, fontFamily: 'Manrope_500Medium', lineHeight: 24 }}>
              <Text style={{ fontFamily: 'Inter_700Bold' }}>Fuse or Trade on Market</Text>
              {'\n'}
              Burn 3 identical Matkas to upgrade to the next tier, or list them on our decentralized peer-to-peer marketplace.
            </Text>
          </View>

          {/* Step 3 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <View style={{ alignItems: 'center', width: 40 }}>
              <MaterialCommunityIcons name="trophy" size={28} color="#000000" />
              <Text style={{ color: '#000000', fontSize: 24, fontFamily: 'ClashDisplay-Bold', marginTop: 4 }}>03</Text>
            </View>
            <Text style={{ flex: 1, color: '#121212', fontSize: 16, fontFamily: 'Manrope_500Medium', lineHeight: 24 }}>
              <Text style={{ fontFamily: 'Inter_700Bold' }}>Win the MegaPot</Text>
              {'\n'}
              Lock your Legendary Matka to enter the global VRF lottery. The winner takes 95% of the massive USDC vault!
            </Text>
          </View>
        </View>
      </View>

      {/* Footer Section */}
      <View style={{ marginTop: 80, paddingHorizontal: 24, alignItems: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 32, fontFamily: 'ClashDisplay-Bold', textAlign: 'center' }}>
          Ready to start{'\n'}collecting?
        </Text>
        <Text style={{ color: '#A1A1AA', fontSize: 16, fontFamily: 'Manrope_500Medium', textAlign: 'center', marginTop: 16, lineHeight: 24 }}>
          Connect your wallet and pull your first{'\n'}pack today.
        </Text>

        <Pressable
          onPress={onEnter}
          style={({ pressed }) => [
            {
              backgroundColor: '#33CDE3',
              borderRadius: 30,
              paddingVertical: 16,
              paddingHorizontal: 40,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 32,
              shadowColor: '#33CDE3',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.5,
              shadowRadius: 20,
              elevation: 10,
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={{ color: '#000000', fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 1 }}>
            START COLLECTING
          </Text>
        </Pressable>

        <View style={{ height: 1, width: 80, backgroundColor: '#3F3F46', marginTop: 48, marginBottom: 48 }} />

        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 48 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#3F3F46', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="twitter" size={24} color="#A1A1AA" />
          </View>
          <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#3F3F46', alignItems: 'center', justifyContent: 'center' }}>
            <FontAwesome6 name="discord" size={24} color="#A1A1AA" />
          </View>
          <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#3F3F46', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="github" size={24} color="#A1A1AA" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Image source={brandMark} style={{ width: 20, height: 20 }} contentFit="contain" />
          <Text style={{ color: '#A1A1AA', fontSize: 18, fontFamily: 'ClashDisplay-Bold', letterSpacing: 0.5 }}>
            Matka
          </Text>
        </View>

        <Text style={{ color: '#71717A', fontSize: 12, fontFamily: 'Manrope_500Medium', marginBottom: 4 }}>
          © 2026 Matka. All rights reserved.
        </Text>
        <Text style={{ color: '#71717A', fontSize: 12, fontFamily: 'Manrope_500Medium' }}>
          Built on Solana • Powered by MagicBlock
        </Text>
      </View>
    </ScrollView>
  )
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

function PullView({ game, onFund }: { game: ReturnType<typeof useGachapon>; onFund: () => void }) {
  const status = stageCopy(game.stage)
  const canPull = !game.isBusy && !game.isOffline
  const showStatus = Boolean(game.error) || !['idle', 'revealed'].includes(game.stage)

  const bigWinWeight = useMemo(() => REWARDS.filter(r => r.rarity.includes('4-Star') || r.rarity.includes('5-Star')).reduce((t, r) => t + r.weight, 0), [])
  const totalWeight = useMemo(() => REWARDS.reduce((total, reward) => total + reward.weight, 0), [])
  const bigWinChance = Math.round((bigWinWeight / totalWeight) * 100)

  return (
    <ScrollView
      contentContainerStyle={styles.pullContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.gachaMainPanel}>
        <PackReveal stage={game.stage} rewardId={game.revealedItem?.pull.rewardId ?? null} />

        <View style={styles.gachaMainCopy}>
          <Text style={styles.gachaMainTitle}>Matka Pack</Text>
          <Text style={styles.gachaMainBody}>On-chain rip with mathematically guaranteed fair randomness.</Text>

          <View style={{ marginTop: 16 }}>
            <PrimaryButton
              icon="star-four-points"
              label={`OPEN PACK · ${PACK_PRICE_USDC} USDC`}
              onPress={game.publicKey ? game.pull : onFund}
              disabled={!canPull}
            />
          </View>

          {showStatus ? (
            <View style={[styles.statusBlock, { marginTop: 14 }]} accessibilityRole={game.error ? 'alert' : 'text'}>
              <View style={styles.statusTopRow}>
                <View style={[styles.statusIcon, game.error && styles.statusIconError]}>
                  <MaterialCommunityIcons
                    name={game.error ? 'alert-outline' : 'progress-clock'}
                    size={22}
                    color={game.error ? colors.danger : colors.verified}
                  />
                </View>
                <View style={styles.statusCopy}>
                  <Text style={styles.statusTitle}>{game.error ? 'Pack opening paused' : status.title}</Text>
                  <Text style={styles.statusDetail}>{game.error ?? status.detail}</Text>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.statsThreeCol}>
            <View style={styles.statsCol}>
              <Text style={styles.statsColLabel}>PACK CONTAINS</Text>
              <Text style={styles.statsColValue}>1 CARD</Text>
            </View>
            <View style={styles.statsCol}>
              <Text style={styles.statsColLabel}>INSTANT BUYBACK</Text>
              <Text style={styles.statsColValue}>90% of value</Text>
            </View>
            <View style={styles.statsCol}>
              <Text style={styles.statsColLabel}>BIG WIN CHANCE</Text>
              <Text style={styles.statsColValue}>{bigWinChance}%</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.sidebarSection}>
        <Text style={styles.sidebarHeader}>CHOOSE A PACK</Text>
        <View style={styles.activePackCard}>
          <Image source={packArt} style={styles.activePackThumb} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={styles.activePackTitle}>Titan Pack</Text>
            <Text style={styles.activePackSub}>Unleash absolute power</Text>
          </View>
          <Text style={styles.activePackPrice}>{PACK_PRICE_USDC} USDC</Text>
        </View>
      </View>

      <View style={styles.sidebarSection}>
        <Text style={styles.sidebarHeader}>DROP RATES</Text>
        <DropRates compact />
      </View>

      <View style={styles.sidebarSection}>
        <View style={styles.recentHeaderRow}>
          <Text style={styles.sidebarHeader}>RECENT OPENINGS</Text>
          <View style={styles.liveDot} />
        </View>

        {game.inventory.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 10 }}>No recent pulls found.</Text>
        ) : (
          game.inventory.slice(0, 3).map((item, i) => {
            const pullId = item.pull.pullId.toString()
            const rarity = item.reward.rarity.toUpperCase()
            const color = rarityColors[item.pull.rewardId] || colors.common
            const userStr = game.publicKey ? `${game.publicKey.toBase58().slice(0, 4)}...${game.publicKey.toBase58().slice(-4)}` : 'You'

            return (
              <View key={i} style={styles.recentRow}>
                <Image source={rewardArt[item.pull.rewardId]} style={[styles.recentThumb, { backgroundColor: 'transparent' }]} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.recentTitle}>{item.reward.name} #{pullId}</Text>
                  <Text style={styles.recentSub}>Pulled by {userStr}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.recentRarity, { color }]}>{rarity}</Text>
                  <Text style={styles.recentPrice}>1.00 USDC</Text>
                </View>
              </View>
            )
          })
        )}
      </View>
    </ScrollView>
  )
}
function PackReveal({ stage, rewardId }: { stage: PullStage; rewardId: number | null }) {
  // Idle bob (always running)
  const bob = useRef(new Animated.Value(0)).current
  // Sheen sweep across machine
  const sheen = useRef(new Animated.Value(-1)).current
  // Indicator pulse
  const pulse = useRef(new Animated.Value(0.4)).current
  // VRF shaking
  const shake = useRef(new Animated.Value(0)).current
  const shakeY = useRef(new Animated.Value(0)).current
  // Glow intensity during VRF
  const glowIntensity = useRef(new Animated.Value(0.3)).current
  // Reveal animations
  const machineOut = useRef(new Animated.Value(0)).current
  const cardIn = useRef(new Animated.Value(0)).current
  const flashAnim = useRef(new Animated.Value(0)).current
  const [reduceMotion, setReduceMotion] = useState(false)
  const rarityColor = rewardId === null ? colors.verified : rarityColors[rewardId]

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => subscription.remove()
  }, [])

  // 1. Idle bob — always runs (like anim-idle-bob in the web version)
  useEffect(() => {
    if (reduceMotion) return
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -8, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 8, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    bobLoop.start()
    return () => bobLoop.stop()
  }, [bob, reduceMotion])

  // 2. Sheen sweep — repeating light sweep across the machine (like gacha-machine-sheen ::after)
  useEffect(() => {
    if (reduceMotion) return
    const sheenLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(3000),
        Animated.timing(sheen, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sheen, { toValue: -1, duration: 0, useNativeDriver: true }),
      ]),
    )
    sheenLoop.start()
    return () => sheenLoop.stop()
  }, [sheen, reduceMotion])

  // 3. Indicator pulse — pulsing cyan dot on the machine body
  useEffect(() => {
    if (reduceMotion) return
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    pulseLoop.start()
    return () => pulseLoop.stop()
  }, [pulse, reduceMotion])

  // 4. Stage-dependent animations
  useEffect(() => {
    shake.stopAnimation()
    shakeY.stopAnimation()
    glowIntensity.stopAnimation()

    if (stage === 'revealed' && rewardId !== null) {
      if (reduceMotion) {
        machineOut.setValue(1)
        cardIn.setValue(1)
        return
      }
      machineOut.setValue(0)
      cardIn.setValue(0)
      flashAnim.setValue(0)

      Animated.parallel([
        // Machine bumps then fades out
        Animated.timing(machineOut, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        // Flash
        Animated.sequence([
          Animated.timing(flashAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
        ]),
        // Card springs in
        Animated.sequence([
          Animated.delay(80),
          Animated.spring(cardIn, { toValue: 1, damping: 12, stiffness: 200, mass: 0.8, useNativeDriver: true }),
        ]),
      ]).start()
      return
    }

    machineOut.setValue(0)
    cardIn.setValue(0)
    flashAnim.setValue(0)

    if (reduceMotion || !['requesting', 'settling', 'syncing'].includes(stage)) {
      shake.setValue(0)
      shakeY.setValue(0)
      glowIntensity.setValue(0.3)
      return
    }

    // VRF computing — violent shake
    const shakeLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(shake, { toValue: 1, duration: 25, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -1, duration: 25, useNativeDriver: true }),
          Animated.timing(shake, { toValue: 0.5, duration: 25, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -0.5, duration: 25, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(shakeY, { toValue: -4, duration: 25, useNativeDriver: true }),
          Animated.timing(shakeY, { toValue: 4, duration: 25, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(glowIntensity, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(glowIntensity, { toValue: 0.4, duration: 150, useNativeDriver: true }),
        ]),
      ]),
    )
    shakeLoop.start()
    return () => shakeLoop.stop()
  }, [cardIn, flashAnim, glowIntensity, machineOut, reduceMotion, rewardId, shake, shakeY, stage])

  const isRevealed = stage === 'revealed' && rewardId !== null

  // Interpolations
  const shakeRotate = shake.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '4deg'] })
  const machineFade = machineOut.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.6, 0] })
  const machineScale = machineOut.interpolate({ inputRange: [0, 0.15, 1], outputRange: [1, 1.08, 0.9] })
  const cardOpacity = cardIn.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 1, 1] })
  const cardY = cardIn.interpolate({ inputRange: [0, 1], outputRange: [80, 0] })
  const cardScale = cardIn.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] })
  const sheenX = sheen.interpolate({ inputRange: [-1, 1], outputRange: [-300, 300] })
  const sheenRotate = bob.interpolate({ inputRange: [-8, 8], outputRange: ['-20deg', '-20deg'] })

  return (
    <View style={styles.gachaBoxOuter}>
      {/* ── The machine area ── */}
      <View style={styles.gachaBoxInner}>
        {/* ── Revealed card (sits in same position, machine fades, card fades in) ── */}
        <Animated.View
          style={[
            styles.gachaRevealCard,
            {
              borderColor: rarityColor,
              borderWidth: isRevealed ? 2 : 0,
              opacity: cardOpacity,
              transform: [{ translateY: cardY }, { scale: cardScale }],
              zIndex: isRevealed ? 30 : -1,
            },
          ]}
          pointerEvents={isRevealed ? 'auto' : 'none'}
        >
          {rewardId !== null ? (
            <>
              <Image source={rewardArt[rewardId]} style={styles.packImage} contentFit="cover" />
              <View style={styles.packScrim} />
              <View style={styles.packMeta}>
                <Text style={[styles.packRarity, { color: rarityColor }]}>
                  {REWARDS[rewardId].rarity.toUpperCase()}
                </Text>
                <Text style={styles.packName}>{REWARDS[rewardId].name}</Text>
              </View>
            </>
          ) : null}
        </Animated.View>

        {/* ── Machine with idle bob + shake ── */}
        <Animated.View style={{ transform: [{ translateY: bob }] }}>
          <Animated.View
            style={[
              styles.gachaMachineWrap,
              {
                opacity: machineFade,
                transform: [{ translateY: shakeY }, { rotate: shakeRotate }, { scale: machineScale }],
              },
            ]}
          >
            {/* The actual machine image */}
            <Image source={packArt} style={styles.gachaMachineImg} contentFit="cover" />
          </Animated.View>
        </Animated.View>

        {/* ── Floor reflection glow (blurred ellipse at bottom) ── */}
      </View>

      {/* ── Flash overlay ── */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FFFFFF', opacity: flashAnim, borderRadius: 20 }]}
        pointerEvents="none"
      />
    </View>
  )
}

function DropRates({ compact = false }: { compact?: boolean }) {
  const totalWeight = useMemo(() => REWARDS.reduce((total, reward) => total + reward.weight, 0), [])
  return (
    <View style={[styles.dropRates, compact && styles.dropRatesCompact]}>
      <View style={styles.dropRatesHeader}>
        <View style={styles.dropRatesTitleRow}>
          <MaterialCommunityIcons name="chart-timeline-variant" size={18} color={colors.text} />
          <Text style={styles.dropRatesTitle}>Published drop rates</Text>
        </View>
        <View style={styles.verifiedPill}>
          <MaterialCommunityIcons name="check-decagram" size={13} color={colors.verified} />
          <Text style={styles.verifiedPillText}>ONCHAIN</Text>
        </View>
      </View>
      {REWARDS.map((reward, index) => {
        const percentage = (reward.weight / totalWeight) * 100
        return (
          <View key={reward.name} style={styles.rateRow}>
            <View style={styles.rateLabelRow}>
              <Text style={[styles.rateLabel, { color: rarityColors[index] }]}>{reward.rarity.toUpperCase()}</Text>
              <Text style={styles.rateValue}>{percentage.toFixed(0)}%</Text>
            </View>
            <View style={styles.rateTrack}>
              <View style={[styles.rateFill, { width: `${percentage}%`, backgroundColor: rarityColors[index] }]} />
            </View>
          </View>
        )
      })}
    </View>
  )
}

function SuccessModal({
  visible,
  title,
  body,
  onDismiss,
}: {
  visible: boolean
  title: string
  body: string
  onDismiss: () => void
}) {
  if (!visible) return null
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.modalBackdrop}>
        <View style={styles.successSheet}>
          <View style={styles.successIconWrap}>
            <MaterialCommunityIcons name="check-decagram" size={52} color={colors.verified} />
          </View>
          <Text style={styles.successTitle}>{title}</Text>
          <Text style={styles.successBody}>{body}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onDismiss}
            style={({ pressed }) => [styles.successButton, pressed && styles.pressed]}
          >
            <Text style={styles.successButtonText}>AWESOME</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

function RevealModal({
  item,
  visible,
  onKeep,
  onAgain,
  onProof,
  onBuyback,
  isBuyingBack,
}: {
  item: InventoryItem | null
  visible: boolean
  onKeep: () => void
  onAgain: () => void
  onProof: () => void
  onBuyback: (item: InventoryItem) => void
  isBuyingBack: boolean
}) {
  if (!item) return null
  const reward = REWARDS[item.pull.rewardId]
  const color = rarityColors[item.pull.rewardId]
  const buybackAmount = formatUsdcUnits(BUYBACK_PAYOUT_USDC_UNITS[item.pull.rewardId] ?? 0n)
  const sold = Boolean(item.proof?.buybackSignature)

  return (
    <Modal visible={visible} animationType="none" statusBarTranslucent onRequestClose={onKeep}>
      <SafeAreaView style={styles.revealModal}>
        <View style={styles.revealTopBar}>
          <View style={styles.revealVerified}>
            <MaterialCommunityIcons name="check-decagram" size={16} color={colors.verified} />
            <Text style={styles.revealVerifiedText}>VRF VERIFIED</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close reveal"
            onPress={onKeep}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={styles.revealStage}>
            <View style={[styles.revealHalo, { borderColor: color }]} />
          <View style={[styles.revealCard, { borderColor: color }]}>
            <Image source={rewardArt[item.pull.rewardId]} style={styles.revealCardImage} contentFit="cover" />
            <View style={styles.revealCardScrim} />
            <View style={styles.revealCardCopy}>
              <Text style={[styles.revealCardRarity, { color }]}>{reward.rarity.toUpperCase()}</Text>
              <Text style={styles.revealCardName}>{reward.name}</Text>
              <Text style={styles.revealCardEdition}>GENESIS SIGNAL · #{item.pull.pullId.toString()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.revealReceipt}>
          <View>
            <Text style={styles.revealReceiptLabel}>{sold ? 'BUYBACK COMPLETE' : 'OWNERSHIP SECURED'}</Text>
            <Text style={styles.revealReceiptValue}>
              {sold ? `${buybackAmount} USDC paid to your wallet` : 'Metaplex Core asset minted'}
            </Text>
          </View>
          <MaterialCommunityIcons name="shield-check" size={25} color={colors.verified} />
        </View>

        {!sold ? (
          <PrimaryButton
            icon="cash-refund"
            label={isBuyingBack ? 'SELLING CARD...' : `INSTANT BUYBACK · ${buybackAmount} USDC`}
            disabled={isBuyingBack}
            onPress={() => onBuyback(item)}
          />
        ) : null}
        <View style={styles.revealActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keep card in vault"
            onPress={onKeep}
            style={({ pressed }) => [styles.revealSecondary, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="archive-arrow-down-outline" size={19} color={colors.text} />
            <Text style={styles.revealSecondaryText}>Keep</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View pack proof"
            onPress={onProof}
            style={({ pressed }) => [styles.revealSecondary, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="shield-search" size={19} color={colors.text} />
            <Text style={styles.revealSecondaryText}>View proof</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open another pack"
            onPress={onAgain}
            style={({ pressed }) => [styles.revealSecondary, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="refresh" size={19} color={colors.text} />
            <Text style={styles.revealSecondaryText}>Open again</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
    </Modal>
  )
}

function RevealSummary({ item }: { item: InventoryItem }) {
  const color = rarityColors[item.pull.rewardId]
  const reward = REWARDS[item.pull.rewardId]
  return (
    <View style={styles.revealSummary}>
      <View style={[styles.raritySwatch, { backgroundColor: color }]} />
      <View style={styles.revealText}>
        <Text style={styles.revealLabel}>COLLECTED</Text>
        <Text style={styles.revealName}>{reward.name}</Text>
      </View>
      <MaterialCommunityIcons name="cube-scan" size={26} color={color} />
    </View>
  )
}

function CollectionView({
  items,
  listings,
  sales,
  isListing,
  listingAsset,
  fusingId,
  onList,
  onCancelListing,
  onFuse,
  refreshing,
  onRefresh,
}: {
  items: InventoryItem[]
  listings: MarketListing[]
  sales: MarketSale[]
  isListing: boolean
  listingAsset: string | null
  fusingId: number | null
  onList: (item: InventoryItem, priceUsdcUnits: bigint) => void
  onCancelListing: (item: InventoryItem) => void
  onFuse: (rewardId: number, assets: PublicKey[]) => void
  refreshing: boolean
  onRefresh: () => void
}) {
  const [priceItem, setPriceItem] = useState<InventoryItem | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const parsedPrice = useMemo(() => parseUsdcInput(priceInput), [priceInput])
  const availableItems = useMemo(
    () =>
      items.filter((item) => {
        const listed = listings.some((entry) => entry.listing.asset.equals(item.accounts.asset))
        const sold = sales.some((entry) => entry.sale.asset.equals(item.accounts.asset))
        return !listed && !sold && !item.proof?.buybackSignature
      }),
    [items, listings, sales],
  )
  const availableByReward = useMemo(
    () =>
      availableItems.reduce(
        (acc, item) => {
          acc[item.pull.rewardId] = acc[item.pull.rewardId] || []
          acc[item.pull.rewardId].push(item)
          return acc
        },
        {} as Record<number, InventoryItem[]>,
      ),
    [availableItems],
  )

  const openPriceModal = (item: InventoryItem) => {
    setPriceItem(item)
    setPriceInput(formatUsdcUnits(suggestedListPrice(item.pull.rewardId)))
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.collectionContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.verified} />}
      >
        <View style={styles.sectionHeading}>
          <Text style={styles.title}>Your vault</Text>
          <Text style={styles.subtitle}>
            Wallet-owned Metaplex Core cards with full pull, market, and fuse proof trails.
          </Text>
        </View>
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="archive-outline" size={38} color={colors.muted} />
            <Text style={styles.emptyTitle}>Your vault is empty</Text>
            <Text style={styles.emptyBody}>Open a Genesis Signal pack to reveal your first character card.</Text>
          </View>
        ) : (
          <View style={styles.inventoryGrid}>
            <FuseLab
              groups={availableByReward}
              fusingId={fusingId}
              onFuse={(rewardId, group) =>
                onFuse(rewardId, [group[0].accounts.asset, group[1].accounts.asset, group[2].accounts.asset])
              }
            />
            {items.map((item) => {
              const listing = listings.find((entry) => entry.listing.asset.equals(item.accounts.asset))
              const sale = sales.find((entry) => entry.sale.asset.equals(item.accounts.asset))
              return (
                <InventoryCard
                  key={item.accounts.asset.toString()}
                  item={item}
                  listing={listing}
                  sale={sale}
                  isListing={listingAsset === item.accounts.asset.toString()}
                  onList={openPriceModal}
                  onCancelListing={onCancelListing}
                />
              )
            })}
          </View>
        )}
      </ScrollView>
      <ListPriceModal
        item={priceItem}
        value={priceInput}
        parsedPrice={parsedPrice}
        isListing={isListing}
        onChange={setPriceInput}
        onClose={() => setPriceItem(null)}
        onSelectPreset={(units) => setPriceInput(formatUsdcUnits(units))}
        onConfirm={() => {
          if (!priceItem || !parsedPrice) return
          onList(priceItem, parsedPrice)
          setPriceItem(null)
        }}
      />
    </>
  )
}

function ListPriceModal({
  item,
  value,
  parsedPrice,
  isListing,
  onChange,
  onClose,
  onSelectPreset,
  onConfirm,
}: {
  item: InventoryItem | null
  value: string
  parsedPrice: bigint | null
  isListing: boolean
  onChange: (value: string) => void
  onClose: () => void
  onSelectPreset: (units: bigint) => void
  onConfirm: () => void
}) {
  if (!item) return null
  const reward = REWARDS[item.pull.rewardId]
  const color = rarityColors[item.pull.rewardId]
  const presets = listPricePresets[item.pull.rewardId] ?? [DEFAULT_LIST_PRICE_USDC_UNITS]

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.priceSheet}>
          <View style={styles.priceSheetHeader}>
            <View>
              <Text style={styles.cardSectionLabel}>CREATE CUSTOM MARKET LISTING</Text>
              <Text style={styles.priceSheetTitle}>{reward.name}</Text>
              <Text style={[styles.itemMetaText, { color }]}>
                {reward.rarity} · Pull #{item.pull.pullId.toString()}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close list price"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <Text style={styles.priceInputLabel}>List price</Text>
          <View style={styles.priceInputWrap}>
            <TextInput
              value={value}
              onChangeText={onChange}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              style={styles.priceInput}
            />
            <Text style={styles.priceInputUnit}>USDC</Text>
          </View>

          <View style={styles.pricePresetRow}>
            {presets.map((units) => (
              <Pressable
                key={units.toString()}
                accessibilityRole="button"
                onPress={() => onSelectPreset(units)}
                style={({ pressed }) => [styles.pricePreset, pressed && styles.pressed]}
              >
                <Text style={styles.pricePresetText}>{formatUsdcUnits(units)}</Text>
              </Pressable>
            ))}
          </View>

          <PrimaryButton
            icon="storefront-outline"
            label={
              isListing
                ? 'LISTING...'
                : parsedPrice
                  ? `LIST · ${formatUsdcUnits(parsedPrice)} USDC`
                  : 'ENTER A VALID PRICE'
            }
            disabled={isListing || !parsedPrice}
            onPress={onConfirm}
          />
        </View>
      </View>
    </Modal>
  )
}

function FuseLab({
  groups,
  fusingId,
  onFuse,
}: {
  groups: Record<number, InventoryItem[]>
  fusingId: number | null
  onFuse: (rewardId: number, group: InventoryItem[]) => void
}) {
  return (
    <View style={styles.fuseLab}>
      <View style={styles.fuseLabHeader}>
        <View>
          <Text style={styles.cardSectionLabel}>CARD MECHANIC</Text>
          <Text style={styles.fuseLabTitle}>Fuse duplicates</Text>
        </View>
        <View style={styles.fuseRulePill}>
          <Text style={styles.fuseRuleText}>3 SAME = NEXT TIER</Text>
        </View>
      </View>
      <Text style={styles.fuseLabBody}>
        Burn three unlisted Matkas of the same tier to mint exactly one Matka from the next tier. Legendary is max tier.
      </Text>
      <View style={styles.fuseTrackList}>
        {REWARDS.map((reward, rewardId) => {
          const group = groups[rewardId] ?? []
          const progress = Math.min(group.length, 3)
          const maxTier = rewardId === REWARDS.length - 1
          const ready = !maxTier && group.length >= 3
          const outputReward = REWARDS[rewardId + 1]
          return (
            <View key={reward.name} style={styles.fuseTrackRow}>
              <View style={[styles.fuseTrackArt, { borderColor: rarityColors[rewardId] }]}>
                <Image source={rewardArt[rewardId]} style={styles.fuseTrackImage} contentFit="cover" />
              </View>
              <View style={styles.fuseTrackCopy}>
                <Text numberOfLines={1} style={styles.fuseTrackName}>
                  {reward.name}
                </Text>
                <Text style={styles.fuseTrackMeta}>
                  {maxTier ? 'Max tier' : ready ? `Ready · mints ${outputReward.name}` : `${progress}/3 · next ${outputReward.name}`}
                </Text>
                <View style={styles.fuseProgressTrack}>
                  <View
                    style={[
                      styles.fuseProgressFill,
                      { width: `${(progress / 3) * 100}%`, backgroundColor: rarityColors[rewardId] },
                    ]}
                  />
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={!ready || fusingId !== null}
                onPress={() => onFuse(rewardId, group)}
                style={({ pressed }) => [
                  styles.fuseMiniButton,
                  ready && styles.fuseMiniButtonReady,
                  (!ready || fusingId !== null) && styles.disabled,
                  pressed && ready && fusingId === null && styles.pressed,
                ]}
              >
                <Text style={[styles.fuseMiniButtonText, ready && styles.fuseMiniButtonTextReady]}>
                  {maxTier ? 'MAX' : fusingId === rewardId ? 'FUSING' : ready ? 'FUSE' : `${3 - progress} LEFT`}
                </Text>
              </Pressable>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function InventoryCard({
  item,
  listing,
  sale,
  isListing,
  onList,
  onCancelListing,
}: {
  item: InventoryItem
  listing?: MarketListing
  sale?: MarketSale
  isListing: boolean
  onList: (item: InventoryItem) => void
  onCancelListing: (item: InventoryItem) => void
}) {
  const [showProofs, setShowProofs] = useState(false)
  const color = rarityColors[item.pull.rewardId]
  const reward = REWARDS[item.pull.rewardId]
  const inventoryAddress = item.proof?.inventory ?? findInventoryAddress(item.pull.player)
  const sold = Boolean(item.proof?.buybackSignature)
  const marketSold = Boolean(item.proof?.saleSignature || sale)
  const listed = Boolean(listing && !item.proof?.cancelListingSignature && !item.proof?.saleSignature)
  const listPrice = listing
    ? formatUsdcUnits(listing.listing.priceUsdcUnits)
    : item.proof?.listingPrice
      ? formatUsdcUnits(BigInt(item.proof.listingPrice))
      : formatUsdcUnits(suggestedListPrice(item.pull.rewardId))
  const buybackAmount = item.proof?.buybackAmount
    ? formatUsdcUnits(BigInt(item.proof.buybackAmount))
    : formatUsdcUnits(BUYBACK_PAYOUT_USDC_UNITS[item.pull.rewardId] ?? 0n)
  return (
    <View style={styles.inventoryCard}>
      <View style={styles.inventoryTopRow}>
        <View style={[styles.itemArt, { borderColor: color }]}>
          <Image source={rewardArt[item.pull.rewardId]} style={styles.itemArtImage} contentFit="cover" />
        </View>
        <View style={styles.itemCopy}>
          <Text numberOfLines={1} style={styles.itemName}>
            {reward.name}
          </Text>
          <View style={styles.itemMeta}>
            <View style={[styles.tinySwatch, { backgroundColor: color }]} />
            <Text style={styles.itemMetaText}>
              {reward.rarity} · {item.proof?.fuseRecord ? 'Fuse' : 'Pull'} #{item.pull.pullId.toString()}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.itemOwner}>
            Owner {shortKey(item.asset.owner)}
          </Text>
          {sold ? <Text style={[styles.itemMetaText, { color: colors.verified }]}>Sold · {buybackAmount} USDC</Text> : null}
          {marketSold && !sold ? (
            <Text style={[styles.itemMetaText, { color: colors.verified }]}>
              Market sale · {formatUsdcUnits(sale?.sale.priceUsdcUnits ?? BigInt(item.proof?.salePrice ?? '0'))} USDC
            </Text>
          ) : null}
          {listed ? <Text style={[styles.itemMetaText, { color: colors.verified }]}>Listed · {listPrice} USDC</Text> : null}
        </View>
      </View>

      <Pressable
        style={styles.proofToggle}
        onPress={() => setShowProofs(!showProofs)}
      >
        <Text style={styles.proofToggleText}>
          {showProofs ? "Hide On-chain Proofs ⬆️" : "View On-chain Proofs ⬇️"}
        </Text>
      </Pressable>

      {showProofs && (
        <>
          <View style={styles.cardProofBlock}>
            <Text style={styles.cardSectionLabel}>{item.proof?.fuseRecord ? 'FUSION PROOF' : 'PACK PROOF'}</Text>
        {item.proof?.fuseRecord ? (
          <>
            <ProofMiniRow
              label="Fuse record"
              value={shortKey(item.proof.fuseRecord)}
              onPress={() => void Linking.openURL(explorerAddress(item.proof!.fuseRecord!))}
            />
            <ProofMiniRow
              label="Fuse tx"
              value={item.proof.fuseSignature ? shortKey(item.proof.fuseSignature) : 'Not stored'}
              onPress={item.proof.fuseSignature ? () => void Linking.openURL(explorerTx(item.proof!.fuseSignature!)) : undefined}
            />
            <ProofMiniRow
              label="Player"
              value={shortKey(item.proof.fusePlayer ?? item.asset.owner)}
              onPress={() => void Linking.openURL(explorerAddress(item.proof!.fusePlayer ?? item.asset.owner))}
            />
            <ProofMiniRow
              label="Base machine"
              value={shortKey(item.proof.machine)}
              onPress={() => void Linking.openURL(explorerAddress(item.proof!.machine))}
            />
            <ProofMiniRow
              label="Base program"
              value={shortKey(item.proof.programId)}
              onPress={() => void Linking.openURL(explorerAddress(item.proof!.programId))}
            />
            <ProofMiniRow
              label="Tier upgrade"
              value={`${REWARDS[item.proof.fuseInputRewardId ?? 0].rarity} → ${REWARDS[item.proof.fuseOutputRewardId ?? item.pull.rewardId].rarity}`}
            />
            {(item.proof.burnedAssets ?? []).map((burnedAsset, index) => (
              <ProofMiniRow
                key={burnedAsset}
                label={`Burned asset ${index + 1}`}
                value={shortKey(burnedAsset)}
                onPress={() => void Linking.openURL(explorerAddress(burnedAsset))}
              />
            ))}
            <ProofMiniRow
              label="Minted asset"
              value={shortKey(item.accounts.asset)}
              onPress={() => void Linking.openURL(explorerAddress(item.accounts.asset))}
            />
            <ProofMiniRow label="Onchain time" value={formatProofTimestamp(item.proof.fuseTimestamp)} />
          </>
        ) : null}
        {!item.proof?.fuseRecord ? (
          <>
            <ProofMiniRow
          label="ER endpoint"
          value={ER_DEVNET_RPC_URL.replace('https://', '')}
          onPress={() => void Linking.openURL(explorerErAddress(item.accounts.machine))}
        />
        <ProofMiniRow
          label="Payment tx"
          value={item.proof?.paymentSignature ? shortKey(item.proof.paymentSignature) : 'Not stored'}
          onPress={
            item.proof?.paymentSignature
              ? () => void Linking.openURL(explorerTx(item.proof!.paymentSignature!))
              : undefined
          }
        />
        <ProofMiniRow
          label="Prepare tx"
          value={item.proof?.prepareSignature ? shortKey(item.proof.prepareSignature) : 'Not stored'}
          onPress={
            item.proof?.prepareSignature
              ? () => void Linking.openURL(explorerTx(item.proof!.prepareSignature!))
              : undefined
          }
        />
        <ProofMiniRow
          label="Paid by"
          value={shortKey(item.pull.player)}
          onPress={() => void Linking.openURL(explorerAddress(item.pull.player))}
        />
        <ProofMiniRow label="Total paid" value={`${formatUsdcUnits(PACK_PRICE_USDC_UNITS)} USDC`} />
        <ProofMiniRow
          label="Payment mint"
          value={shortKey(item.proof?.paymentMint ?? DEVNET_USDC_MINT)}
          onPress={() => void Linking.openURL(explorerAddress(item.proof?.paymentMint ?? DEVNET_USDC_MINT))}
        />
        <ProofMiniRow
          label="Treasury allocation"
          value={`${formatUsdcUnits(TREASURY_PACK_PAYMENT_USDC_UNITS)} USDC`}
        />
        <ProofMiniRow
          label="Treasury PDA"
          value={shortKey(item.proof?.paymentTreasury ?? item.accounts.treasury)}
          onPress={() => void Linking.openURL(explorerAddress(item.proof?.paymentTreasury ?? item.accounts.treasury))}
        />
        <ProofMiniRow
          label="Treasury USDC vault"
          value={shortKey(findAssociatedTokenAddress(new PublicKey(item.proof?.paymentTreasury ?? item.accounts.treasury), DEVNET_USDC_MINT))}
          onPress={() => void Linking.openURL(explorerAddress(findAssociatedTokenAddress(new PublicKey(item.proof?.paymentTreasury ?? item.accounts.treasury), DEVNET_USDC_MINT)))}
        />
        <ProofMiniRow
          label="MegaPot allocation"
          value={`${formatUsdcUnits(BigInt(item.proof?.megapotContribution ?? MEGAPOT_CONTRIBUTION_USDC_UNITS.toString()))} USDC`}
        />
        <ProofMiniRow
          label="Global Jackpot PDA"
          value={shortKey(item.proof?.megapot ?? findJackpotAddress())}
          onPress={() => void Linking.openURL(explorerAddress(item.proof?.megapot ?? findJackpotAddress()))}
        />
        <ProofMiniRow
          label="MegaPot vault"
          value={shortKey(item.proof?.megapotVault ?? findAssociatedTokenAddress(findJackpotAddress(), DEVNET_USDC_MINT))}
          onPress={() => void Linking.openURL(explorerAddress(item.proof?.megapotVault ?? findAssociatedTokenAddress(findJackpotAddress(), DEVNET_USDC_MINT)))}
        />
        <ProofMiniRow label="Entries earned" value={item.proof?.megapotEntryWeight ?? '0'} />
        <ProofMiniRow
          label="Base program"
          value={shortKey(item.proof?.programId ?? PROGRAM_ID)}
          onPress={() => void Linking.openURL(explorerAddress(item.proof?.programId ?? PROGRAM_ID))}
        />
        <ProofMiniRow
          label="VRF program"
          value={shortKey(item.proof?.vrfProgram ?? VRF_PROGRAM_ID)}
          onPress={() => void Linking.openURL(explorerAddress(item.proof?.vrfProgram ?? VRF_PROGRAM_ID))}
        />
        <ProofMiniRow
          label="VRF queue"
          value={shortKey(item.proof?.vrfQueue ?? DEFAULT_VRF_QUEUE)}
          onPress={() => void Linking.openURL(explorerAddress(item.proof?.vrfQueue ?? DEFAULT_VRF_QUEUE))}
        />
        <ProofMiniRow
          label="ER machine"
          value={shortKey(item.proof?.machine ?? item.accounts.machine)}
          onPress={() => void Linking.openURL(explorerErAddress(item.proof?.machine ?? item.accounts.machine))}
        />
        <ProofMiniRow
          label="ER inventory"
          value={shortKey(inventoryAddress)}
          onPress={() => void Linking.openURL(explorerErAddress(inventoryAddress))}
        />
        <ProofMiniRow
          label="ER pending pull"
          value={shortKey(item.proof?.pendingPull ?? item.accounts.pendingPull)}
          onPress={() => void Linking.openURL(explorerErAddress(item.proof?.pendingPull ?? item.accounts.pendingPull))}
        />
        <ProofMiniRow
          label="ER pull tx"
          value={item.proof?.erPullSignature ? shortKey(item.proof.erPullSignature) : 'Not stored'}
          onPress={
            item.proof?.erPullSignature
              ? () => void Linking.openURL(explorerErTx(item.proof!.erPullSignature!))
              : undefined
          }
        />
        <ProofMiniRow
          label="ER commit tx"
          value={item.proof?.erCommitSignature ? shortKey(item.proof.erCommitSignature) : 'Not stored'}
          onPress={
            item.proof?.erCommitSignature
              ? () => void Linking.openURL(explorerErTx(item.proof!.erCommitSignature!))
              : undefined
          }
        />
        <ProofMiniRow
          label="Base claim tx"
          value={item.proof?.claimSignature ? shortKey(item.proof.claimSignature) : 'Not stored'}
          onPress={
            item.proof?.claimSignature ? () => void Linking.openURL(explorerTx(item.proof!.claimSignature!)) : undefined
          }
        />
          </>
        ) : null}
        <ProofMiniRow
          label="Buyback tx"
          value={item.proof?.buybackSignature ? shortKey(item.proof.buybackSignature) : 'Not sold'}
          onPress={
            item.proof?.buybackSignature
              ? () => void Linking.openURL(explorerTx(item.proof!.buybackSignature!))
              : undefined
          }
        />
        <ProofMiniRow label="Buyback payout" value={sold ? `${buybackAmount} USDC` : 'Available'} />
        <ProofMiniRow
          label="Listing PDA"
          value={item.proof?.listingAddress ? shortKey(item.proof.listingAddress) : listing ? shortKey(listing.address) : 'Not listed'}
          onPress={
            item.proof?.listingAddress
              ? () => void Linking.openURL(explorerAddress(item.proof!.listingAddress!))
              : listing
                ? () => void Linking.openURL(explorerAddress(listing.address))
                : undefined
          }
        />
        <ProofMiniRow
          label="List tx"
          value={item.proof?.listingSignature ? shortKey(item.proof.listingSignature) : 'Not listed'}
          onPress={item.proof?.listingSignature ? () => void Linking.openURL(explorerTx(item.proof!.listingSignature!)) : undefined}
        />
        <ProofMiniRow
          label="Cancel listing tx"
          value={item.proof?.cancelListingSignature ? shortKey(item.proof.cancelListingSignature) : 'Not cancelled'}
          onPress={
            item.proof?.cancelListingSignature
              ? () => void Linking.openURL(explorerTx(item.proof!.cancelListingSignature!))
              : undefined
          }
        />
        <ProofMiniRow
          label="Sale tx"
          value={item.proof?.saleSignature ? shortKey(item.proof.saleSignature) : 'Not sold on market'}
          onPress={item.proof?.saleSignature ? () => void Linking.openURL(explorerTx(item.proof!.saleSignature!)) : undefined}
        />
        <ProofMiniRow
          label="Sale record"
          value={item.proof?.saleRecord ? shortKey(item.proof.saleRecord) : sale ? shortKey(sale.address) : 'No sale record'}
          onPress={
            item.proof?.saleRecord
              ? () => void Linking.openURL(explorerAddress(item.proof!.saleRecord!))
              : sale
                ? () => void Linking.openURL(explorerAddress(sale.address))
                : undefined
          }
        />
        <ProofMiniRow
          label="Seller proceeds"
          value={
            item.proof?.salePrice
              ? `${formatUsdcUnits(BigInt(item.proof.salePrice))} USDC`
              : sale
                ? `${formatUsdcUnits(sale.sale.priceUsdcUnits)} USDC`
                : 'Not sold'
          }
        />
        <ProofMiniRow
          label="Buyer"
          value={item.proof?.saleBuyer ? shortKey(item.proof.saleBuyer) : sale ? shortKey(sale.sale.buyer) : 'No buyer'}
          onPress={
            item.proof?.saleBuyer
              ? () => void Linking.openURL(explorerAddress(item.proof!.saleBuyer!))
              : sale
                ? () => void Linking.openURL(explorerAddress(sale.sale.buyer))
                : undefined
          }
        />
        <ProofMiniRow
          label="Asset"
          value={shortKey(item.accounts.asset)}
          onPress={() => void Linking.openURL(explorerAddress(item.accounts.asset))}
        />
        </View>

        {!item.proof ? (
          <Text style={styles.proofUnavailable}>Full tx proof is captured for pulls made after this build.</Text>
        ) : null}
        </>
      )}

      <View style={styles.cardActions}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${item.asset.name} asset in Solana Explorer`}
          onPress={() => void Linking.openURL(explorerAddress(item.accounts.asset))}
          style={({ pressed }) => [styles.miniButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="cube-scan" size={16} color={colors.text} />
          <Text style={styles.miniButtonText}>Asset</Text>
        </Pressable>
        {item.proof?.claimSignature ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open claim transaction in Solana Explorer"
            onPress={() => void Linking.openURL(explorerTx(item.proof!.claimSignature!))}
            style={({ pressed }) => [styles.miniButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="open-in-new" size={16} color={colors.text} />
            <Text style={styles.miniButtonText}>Claim tx</Text>
          </Pressable>
        ) : null}
        {item.proof?.fuseSignature ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open fusion transaction in Solana Explorer"
            onPress={() => void Linking.openURL(explorerTx(item.proof!.fuseSignature!))}
            style={({ pressed }) => [styles.miniButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="merge" size={16} color={colors.text} />
            <Text style={styles.miniButtonText}>Fuse tx</Text>
          </Pressable>
        ) : null}
        {item.proof?.buybackSignature ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open buyback transaction in Solana Explorer"
            onPress={() => void Linking.openURL(explorerTx(item.proof!.buybackSignature!))}
            style={({ pressed }) => [styles.miniButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="cash-refund" size={16} color={colors.text} />
            <Text style={styles.miniButtonText}>Buyback</Text>
          </Pressable>
        ) : null}
      </View>

      {!sold && !marketSold ? (
        <View style={{ marginTop: 16 }}>
          <PrimaryButton
            icon={listed ? 'store-remove-outline' : 'storefront-outline'}
            label={
              listed
                ? isListing
                  ? 'CANCELLING...'
                  : 'CANCEL CUSTOM LISTING'
                : isListing
                  ? 'LISTING...'
                  : `LIST ON MARKET · ${listPrice} USDC`
            }
            disabled={isListing}
            onPress={() => (listed ? onCancelListing(item) : onList(item))}
          />
        </View>
      ) : null}
    </View>
  )
}

function ProofView({ game }: { game: ReturnType<typeof useGachapon> }) {
  const totalWeight = useMemo(() => REWARDS.reduce((total, reward) => total + reward.weight, 0), [])
  return (
    <ScrollView contentContainerStyle={styles.proofContent} showsVerticalScrollIndicator={false}>
      <View style={styles.sectionHeading}>
        <Text style={styles.title}>Proof, not promises.</Text>
        <Text style={styles.subtitle}>
          MagicBlock VRF chooses the rarity onchain. The callback mints the result directly to your wallet.
        </Text>
      </View>

      <View style={styles.verifiedBand}>
        <MaterialCommunityIcons name="shield-check" size={27} color={colors.background} />
        <View style={styles.verifiedCopy}>
          <Text style={styles.verifiedTitle}>Verifiable randomness</Text>
          <Text style={styles.verifiedBody}>No admin can swap the result after you pull.</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>PUBLISHED ODDS</Text>
      <View style={styles.oddsList}>
        {REWARDS.map((reward, index) => (
          <View key={reward.name} style={styles.oddsRow}>
            <View style={styles.oddsIdentity}>
              <View style={[styles.raritySwatch, { backgroundColor: rarityColors[index] }]} />
              <View>
                <Text style={styles.oddsName}>{reward.rarity}</Text>
                <Text style={styles.oddsCreature}>{reward.name}</Text>
              </View>
            </View>
            <Text style={styles.oddsValue}>{((reward.weight / totalWeight) * 100).toFixed(0)}%</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>LAST PULL</Text>
      <View style={styles.proofRows}>
        <ProofRow label="Matka program" value={shortKey(PROGRAM_ID)} />
        <ProofRow label="Pack price" value={`${PACK_PRICE_USDC} Devnet USDC`} />
        <ProofRow label="Payment mint" value={shortKey(DEVNET_USDC_MINT)} />
        <ProofRow label="MagicBlock ER RPC" value={ER_DEVNET_RPC_URL.replace('https://', '')} />
        <ProofRow label="ER inventory" value={game.erReady ? 'Delegated · ready' : 'Not activated'} />
        <ProofRow label="Global Jackpot" value={shortKey(findJackpotAddress())} />
        <ProofRow label="Jackpot balance" value={`${formatWalletUsdc(game.jackpotBalance)} USDC`} />
        <ProofRow label="Your locked entries" value={game.jackpotEntries.length.toString()} />
        <ProofRow label="Jackpot contribution" value="0.50 USDC per paid pull" />
        <ProofRow label="VRF program" value={shortKey(VRF_PROGRAM_ID)} />
        <ProofRow label="VRF queue" value={shortKey(DEFAULT_VRF_QUEUE)} />
        <ProofRow
          label="Machine PDA"
          value={game.activeAccounts ? shortKey(game.activeAccounts.machine) : 'Not started'}
        />
        <ProofRow
          label="Payment tx"
          value={game.proof.paymentSignature ? shortKey(game.proof.paymentSignature) : 'Not paid'}
        />
        <ProofRow
          label="ER pull tx"
          value={game.proof.erPullSignature ? shortKey(game.proof.erPullSignature) : 'Current session only'}
        />
        <ProofRow
          label="ER commit tx"
          value={game.proof.erCommitSignature ? shortKey(game.proof.erCommitSignature) : 'Current session only'}
        />
        <ProofRow
          label="Base claim tx"
          value={
            game.proof.claimSignature
              ? shortKey(game.proof.claimSignature)
              : game.lastSignature
                ? shortKey(game.lastSignature)
                : 'Not claimed'
          }
        />
        <ProofRow
          label="Buyback tx"
          value={
            game.revealedItem?.proof?.buybackSignature
              ? shortKey(game.revealedItem.proof.buybackSignature)
              : 'Not sold'
          }
        />
        <ProofRow
          label="Buyback payout"
          value={
            game.revealedItem?.proof?.buybackAmount
              ? `${formatUsdcUnits(BigInt(game.revealedItem.proof.buybackAmount))} USDC`
              : 'Available after reveal'
          }
        />
        <ProofRow label="Asset" value={game.revealedItem ? shortKey(game.revealedItem.accounts.asset) : 'Not minted'} />
      </View>
      {(game.proof.claimSignature ?? game.lastSignature) ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(explorerTx(game.proof.claimSignature ?? game.lastSignature!))}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="open-in-new" size={19} color={colors.text} />
          <Text style={styles.secondaryButtonText}>Open base claim tx</Text>
        </Pressable>
      ) : null}
      {game.revealedItem ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(explorerAddress(game.revealedItem!.accounts.asset))}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="cube-scan" size={19} color={colors.text} />
          <Text style={styles.secondaryButtonText}>Open asset</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

function WalletButton({
  publicKey,
  walletMode,
  balance,
  usdcBalance,
  onConnect,
  onDisconnect,
}: {
  publicKey: string | null
  walletMode: 'external' | 'devnet-test' | null
  balance: number | null
  usdcBalance: number | null
  onConnect: () => void
  onDisconnect: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={publicKey ? 'Disconnect wallet' : 'Connect wallet'}
      onPress={publicKey ? onDisconnect : onConnect}
      style={({ pressed }) => [styles.walletButton, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="wallet-outline" size={18} color={publicKey ? colors.verified : colors.text} />
      <View>
        <Text style={styles.walletKey}>
          {publicKey ? (walletMode === 'devnet-test' ? 'Test wallet' : shortKey(publicKey)) : 'Test wallet'}
        </Text>
        {publicKey ? (
          <View style={styles.walletBalances}>
            <Text style={styles.walletBalance}>{typeof balance === 'number' ? `${balance.toFixed(2)} SOL` : 'Loading SOL'}</Text>
            <Text style={[styles.walletBalance, styles.walletUsdcBalance]}>{formatWalletUsdc(usdcBalance)} USDC</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

function PrimaryButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  label: string
  disabled?: boolean
  onPress: () => void
}) {
  const pulse = useSharedValue(1)

  useEffect(() => {
    if (!disabled) {
      pulse.value = withRepeat(withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true)
    } else {
      pulse.value = 1
    }
  }, [disabled])

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value === 1 ? 1 : 0.8 + (pulse.value - 1) * 2,
    transform: [{ scale: pulse.value }],
  }))

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.disabled,
        pressed && !disabled && { transform: [{ scale: 0.96 }] },
      ]}
    >
      {!disabled && <Reanimated.View style={[StyleSheet.absoluteFillObject, styles.primaryButtonGlow, pulseStyle]} />}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: colors.verified, borderRadius: 8 },
        ]}
      />
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          paddingHorizontal: 16,
        }}
      >
        <MaterialCommunityIcons name={icon} size={21} color={colors.background} />
        <Text style={[styles.primaryButtonText, { color: colors.background }]}>{label}</Text>
      </View>
    </Pressable>
  )
}

function TabButton({
  icon,
  label,
  badge,
  selected,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  label: string
  badge?: number
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}
    >
      <View>
        <MaterialCommunityIcons name={icon} size={24} color={selected ? colors.verified : colors.muted} />
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{label}</Text>
    </Pressable>
  )
}

function ProofRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.proofRow}>
      <Text style={styles.proofLabel}>{label}</Text>
      <Text style={styles.proofValue}>{value}</Text>
    </View>
  )
}

function ProofMiniRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const content = (
    <>
      <Text numberOfLines={1} style={styles.proofMiniLabel}>
        {label}
      </Text>
      <View style={styles.proofMiniValueWrap}>
        <Text numberOfLines={1} style={[styles.proofMiniValue, onPress && styles.proofMiniLinkValue]}>
          {value}
        </Text>
        {onPress ? <MaterialCommunityIcons name="open-in-new" size={13} color={colors.verified} /> : null}
      </View>
    </>
  )

  if (!onPress) {
    return <View style={styles.proofMiniRow}>{content}</View>
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.proofMiniRow, styles.proofMiniLinkRow, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  )
}

function stageCopy(stage: PullStage) {
  switch (stage) {
    case 'preparing':
      return {
        title: 'Preparing your pack',
        detail: `Charging ${PACK_PRICE_USDC} Devnet USDC and creating your onchain pull account.`,
        action: 'Preparing',
      }
    case 'signing':
      return {
        title: 'Approve pack setup',
        detail: 'Your wallet will ask for one Devnet transaction.',
        action: 'Open wallet',
      }
    case 'activating':
      return {
        title: 'Activating instant inventory',
        detail: 'Delegating your inventory PDA to the MagicBlock rollup.',
        action: 'Activating',
      }
    case 'requesting':
      return {
        title: 'Requesting randomness',
        detail: 'MagicBlock VRF is accepting your pack opening.',
        action: 'Requesting',
      }
    case 'settling':
      return {
        title: 'Verifying the result',
        detail: 'The VRF callback is selecting and minting your creature card.',
        action: 'Verifying',
      }
    case 'syncing':
      return {
        title: 'Syncing instant inventory',
        detail: 'Recording the verified asset in your gasless ER inventory.',
        action: 'Syncing',
      }
    case 'revealed':
      return { title: 'Card secured', detail: 'The creature card is now owned by your wallet.', action: 'Secured' }
    case 'error':
      return { title: 'Opening paused', detail: 'Nothing was lost. Try the action again.', action: 'Try again' }
    default:
      return {
        title: 'A sealed signal awaits',
        detail: 'Published odds. Verifiable randomness. Onchain ownership.',
        action: 'Open pack',
      }
  }
}

function MarketPurchaseSuccess({ receipt, compact }: { receipt: MarketPurchaseReceipt; compact?: boolean }) {
  const rewardIndex = Math.max(
    0,
    REWARDS.findIndex((reward) => reward.name === receipt.reward.name),
  )
  const color = rarityColors[rewardIndex]
  return (
    <Reanimated.View
      entering={FadeInUp.duration(320).springify()}
      style={[styles.purchaseSuccessCard, compact && styles.purchaseSuccessCardCompact]}
    >
      <View style={styles.purchaseSuccessTop}>
        <View style={[styles.purchaseSuccessIcon, { borderColor: color }]}>
          <MaterialCommunityIcons name="check-bold" size={24} color={colors.background} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.purchaseSuccessTitle}>Bought successfully</Text>
          <Text numberOfLines={2} style={styles.purchaseSuccessBody}>
            {receipt.reward.name} #{receipt.pullId.toString()} is now in your Vault.
          </Text>
        </View>
      </View>
      {!compact ? (
        <View style={styles.cardProofBlock}>
          <Text style={styles.cardSectionLabel}>MARKET RECEIPT</Text>
          <ProofMiniRow label="Paid" value={`${formatUsdcUnits(receipt.priceUsdcUnits)} USDC`} />
          <ProofMiniRow label="Seller received" value={`${formatUsdcUnits(receipt.priceUsdcUnits)} USDC`} />
          <ProofMiniRow
            label="Sale tx"
            value={shortKey(receipt.signature)}
            onPress={() => void Linking.openURL(explorerTx(receipt.signature))}
          />
          <ProofMiniRow
            label="Sale record"
            value={shortKey(receipt.saleRecord)}
            onPress={() => void Linking.openURL(explorerAddress(receipt.saleRecord))}
          />
          <ProofMiniRow
            label="Asset"
            value={shortKey(receipt.asset)}
            onPress={() => void Linking.openURL(explorerAddress(receipt.asset))}
          />
        </View>
      ) : null}
    </Reanimated.View>
  )
}

function MarketCard({
  entry,
  isOwnListing,
  isBuyingListing,
  onBuy,
}: {
  entry: MarketListing
  isOwnListing: boolean
  isBuyingListing: boolean
  onBuy: (listing: MarketListing) => void
}) {
  const color = rarityColors[entry.listing.rewardId]
  const price = formatUsdcUnits(entry.listing.priceUsdcUnits)
  return (
    <View style={styles.inventoryCard}>
      <View style={styles.inventoryTopRow}>
        <View style={[styles.itemArt, { borderColor: color }]}>
          <Image source={rewardArt[entry.listing.rewardId]} style={styles.itemArtImage} contentFit="cover" />
        </View>
        <View style={styles.itemCopy}>
          <Text numberOfLines={1} style={styles.itemName}>
            {entry.reward.name}
          </Text>
          <View style={styles.itemMeta}>
            <View style={[styles.tinySwatch, { backgroundColor: color }]} />
            <Text style={styles.itemMetaText}>
              {entry.reward.rarity} · Pull #{entry.listing.pullId.toString()}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.itemOwner}>
            Seller {shortKey(entry.listing.seller)}
          </Text>
        </View>
      </View>

      <View style={styles.cardProofBlock}>
        <Text style={styles.cardSectionLabel}>LISTING PROOF</Text>
        <ProofMiniRow
          label="Listing PDA"
          value={shortKey(entry.address)}
          onPress={() => void Linking.openURL(explorerAddress(entry.address))}
        />
        <ProofMiniRow
          label="Escrow owner"
          value={shortKey(entry.asset.owner)}
          onPress={() => void Linking.openURL(explorerAddress(entry.asset.owner))}
        />
        <ProofMiniRow label="Price" value={`${price} USDC`} />
        <ProofMiniRow
          label="Asset"
          value={shortKey(entry.listing.asset)}
          onPress={() => void Linking.openURL(explorerAddress(entry.listing.asset))}
        />
      </View>

      <View style={{ marginTop: 16 }}>
        <PrimaryButton
          icon={isOwnListing ? 'store-check-outline' : 'cart-outline'}
          label={isOwnListing ? `YOUR LISTING · ${price} USDC` : isBuyingListing ? 'BUYING...' : `BUY · ${price} USDC`}
          disabled={isOwnListing || isBuyingListing}
          onPress={() => onBuy(entry)}
        />
      </View>
    </View>
  )
}

function RecentSales({ sales }: { sales: MarketSale[] }) {
  if (sales.length === 0) return null
  return (
    <View style={styles.sidebarSection}>
      <Text style={styles.sidebarHeader}>RECENT SALES</Text>
      {sales.slice(0, 8).map((entry) => (
        <View key={entry.address.toString()} style={styles.saleRow}>
          <View style={[styles.saleThumb, { borderColor: rarityColors[entry.sale.rewardId] }]}>
            <Image source={rewardArt[entry.sale.rewardId]} style={styles.saleThumbImage} contentFit="cover" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.recentTitle}>
              {entry.reward.name} #{entry.sale.pullId.toString()}
            </Text>
            <Text numberOfLines={1} style={styles.recentSub}>
              {shortKey(entry.sale.seller)} {'->'} {shortKey(entry.sale.buyer)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.recentPrice}>{formatUsdcUnits(entry.sale.priceUsdcUnits)} USDC</Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(entry.signature ? explorerTx(entry.signature) : explorerAddress(entry.address))}
              style={({ pressed }) => [styles.saleProofButton, pressed && styles.pressed]}
            >
              <Text style={styles.saleProofText}>{entry.signature ? 'Tx' : 'Record'}</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  )
}

function JackpotView({ game }: { game: ReturnType<typeof useGachapon> }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  const round = game.jackpotRound
  const remaining = round ? Math.max(0, Number(round.closesAt) - now) : 0
  const days = Math.floor(remaining / 86400)
  const hours = Math.floor((remaining % 86400) / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)
  const seconds = remaining % 60
  const countdown = `${days}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`
  const statusLabel = !round ? 'INITIALIZING' : ['OPEN', 'LOCKED', 'DRAWING', 'WINNER SELECTED', 'CLAIMED'][round.status] ?? 'UNKNOWN'
  const eligible = game.inventory.filter(
    (item) => item.pull.rewardId === REWARDS.length - 1 && Boolean(game.publicKey?.equals(item.asset.owner)),
  )
  const canDraw = Boolean(round && round.status === JACKPOT_STATUS.OPEN && remaining === 0 && round.entries.length >= 2)
  const canClaim = Boolean(round && game.publicKey?.equals(round.winner) && round.status === JACKPOT_STATUS.WINNER_SELECTED)
  const roundAddress = round ? findJackpotRoundAddress(round.roundId) : null

  return (
    <ScrollView contentContainerStyle={styles.jackpotContent} showsVerticalScrollIndicator={false}>
      <View style={styles.jackpotHero}>
        <View style={styles.jackpotHeroTop}>
          <View>
            <Text style={styles.cardSectionLabel}>GLOBAL DEVNET JACKPOT</Text>
            <Text style={styles.jackpotTitle}>{formatWalletUsdc(game.jackpotBalance)} USDC</Text>
          </View>
          <View style={styles.jackpotStatusPill}><Text style={styles.jackpotStatusText}>{statusLabel}</Text></View>
        </View>
        <Text style={styles.jackpotCountdown}>{round?.status === JACKPOT_STATUS.OPEN ? countdown : statusLabel}</Text>
        <Text style={styles.jackpotBody}>Lock a Legendary Cosmic Matka for one verifiable entry. The winner receives 95%; 5% remains for the next round.</Text>
        <View style={styles.jackpotMetricRow}>
          <View style={styles.jackpotMetricBox}><Text style={styles.jackpotMetricBig}>{round?.entries.length ?? 0}</Text><Text style={styles.jackpotMetricSmall}>TOTAL ENTRIES</Text></View>
          <View style={styles.jackpotMetricBox}><Text style={styles.jackpotMetricBig}>{game.jackpotEntries.length}</Text><Text style={styles.jackpotMetricSmall}>YOUR ENTRIES</Text></View>
          <View style={styles.jackpotMetricBox}><Text style={styles.jackpotMetricBig}>10</Text><Text style={styles.jackpotMetricSmall}>WALLET CAP</Text></View>
        </View>
      </View>

      {round?.status === JACKPOT_STATUS.OPEN ? (
        <View style={styles.jackpotSection}>
          <Text style={styles.sectionLabel}>QUALIFYING LEGENDARIES</Text>
          {eligible.length === 0 ? (
            <View style={styles.emptyState}><MaterialCommunityIcons name="trophy-broken" size={44} color={colors.border} /><Text style={styles.emptyTitle}>No unlocked Legendary Matka</Text><Text style={styles.emptyBody}>Pull one directly or fuse through the five-tier ladder.</Text></View>
          ) : eligible.map((item) => (
            <View key={item.accounts.asset.toString()} style={styles.jackpotEntryCard}>
              <Image source={rewardArt[4]} style={styles.jackpotEntryImage} contentFit="cover" />
              <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.itemName}>Legendary Cosmic Matka</Text><Text style={styles.itemOwner}>{shortKey(item.accounts.asset)}</Text></View>
              <Pressable disabled={game.isJackpotBusy || game.jackpotEntries.length >= 10} onPress={() => void game.enterJackpot(item).catch(() => undefined)} style={({ pressed }) => [styles.jackpotEntryButton, pressed && styles.pressed, (game.isJackpotBusy || game.jackpotEntries.length >= 10) && styles.disabled]}><Text style={styles.jackpotEntryButtonText}>LOCK</Text></Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {canDraw ? <PrimaryButton icon="dice-multiple-outline" label={game.isJackpotBusy ? 'DRAWING...' : 'CLOSE & RUN MAGICBLOCK VRF'} disabled={game.isJackpotBusy} onPress={() => void game.runJackpotDraw().catch(() => undefined)} /> : null}
      {canClaim ? <PrimaryButton icon="cash-check" label={`CLAIM ${formatUsdcUnits(round!.prizeUsdcUnits)} USDC`} disabled={game.isJackpotBusy} onPress={() => void game.claimJackpot().catch(() => undefined)} /> : null}

      {round && round.status >= JACKPOT_STATUS.WINNER_SELECTED ? (
        <View style={styles.jackpotWinner}>
          <MaterialCommunityIcons name="trophy-award" size={44} color="#F5C451" />
          <Text style={styles.jackpotWinnerLabel}>ROUND {round.roundId.toString()} WINNER</Text>
          <Text style={styles.jackpotWinnerKey}>{shortKey(round.winner)}</Text>
          <Text style={styles.jackpotWinnerPrize}>{formatUsdcUnits(round.prizeUsdcUnits)} USDC</Text>
        </View>
      ) : null}

      {game.jackpotEntries.length > 0 ? (
        <View style={styles.jackpotSection}>
          <Text style={styles.sectionLabel}>YOUR LOCKED ENTRIES</Text>
          {game.jackpotEntries.map((entry) => (
            <View key={entry.asset.toString()} style={styles.jackpotProofCard}>
              <ProofMiniRow label="Legendary asset" value={shortKey(entry.asset)} onPress={() => void Linking.openURL(explorerAddress(entry.asset))} />
              {roundAddress ? <ProofMiniRow label="Entry PDA" value={shortKey(findJackpotEntryAddress(roundAddress, entry.asset))} onPress={() => void Linking.openURL(explorerAddress(findJackpotEntryAddress(roundAddress, entry.asset)))} /> : null}
              {round && round.status >= JACKPOT_STATUS.WINNER_SELECTED ? <PrimaryButton icon="lock-open-outline" label="UNLOCK MATKA" disabled={game.isJackpotBusy} onPress={() => void game.unlockJackpotEntry(entry.asset).catch(() => undefined)} /> : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.jackpotProofCard}>
        <Text style={styles.sectionLabel}>ONCHAIN PROOF</Text>
        <ProofMiniRow label="Jackpot PDA" value={shortKey(findJackpotAddress())} onPress={() => void Linking.openURL(explorerAddress(findJackpotAddress()))} />
        {roundAddress ? <ProofMiniRow label="Round PDA" value={shortKey(roundAddress)} onPress={() => void Linking.openURL(round?.status === JACKPOT_STATUS.DRAWING ? explorerErAddress(roundAddress) : explorerAddress(roundAddress))} /> : null}
        <ProofMiniRow label="USDC vault" value={shortKey(findAssociatedTokenAddress(findJackpotAddress(), DEVNET_USDC_MINT))} onPress={() => void Linking.openURL(explorerAddress(findAssociatedTokenAddress(findJackpotAddress(), DEVNET_USDC_MINT)))} />
        <ProofMiniRow label="VRF program" value={shortKey(VRF_PROGRAM_ID)} onPress={() => void Linking.openURL(explorerAddress(VRF_PROGRAM_ID))} />
        <ProofMiniRow label="VRF queue" value={shortKey(DEFAULT_VRF_QUEUE)} onPress={() => void Linking.openURL(explorerAddress(DEFAULT_VRF_QUEUE))} />
        {game.jackpotProof.entry ? <ProofMiniRow label="Entry tx" value={shortKey(game.jackpotProof.entry)} onPress={() => void Linking.openURL(explorerTx(game.jackpotProof.entry!))} /> : null}
        {game.jackpotProof.draw ? <ProofMiniRow label="ER draw tx" value={shortKey(game.jackpotProof.draw)} onPress={() => void Linking.openURL(explorerErTx(game.jackpotProof.draw!))} /> : null}
        {game.jackpotProof.commit ? <ProofMiniRow label="ER commit tx" value={shortKey(game.jackpotProof.commit)} onPress={() => void Linking.openURL(explorerErTx(game.jackpotProof.commit!))} /> : null}
        {game.jackpotProof.claim ? <ProofMiniRow label="Claim tx" value={shortKey(game.jackpotProof.claim)} onPress={() => void Linking.openURL(explorerTx(game.jackpotProof.claim!))} /> : null}
      </View>
    </ScrollView>
  )
}

function MarketView({ game }: { game: ReturnType<typeof useGachapon> }) {
  const [sort, setSort] = useState<MarketSort>('newest')
  const [filter, setFilter] = useState<RarityFilter>('all')
  const floor = game.marketListings.reduce<bigint | null>((current, entry) => {
    if (current === null) return entry.listing.priceUsdcUnits
    return entry.listing.priceUsdcUnits < current ? entry.listing.priceUsdcUnits : current
  }, null)
  const rareOrBetter = game.marketListings.filter((entry) => entry.listing.rewardId > 0).length
  const visibleListings = useMemo(() => {
    const rewardFilter = ['common', 'rare', 'epic', 'legendary'].indexOf(filter)
    const next =
      rewardFilter === -1
        ? [...game.marketListings]
        : game.marketListings.filter((entry) => entry.listing.rewardId === rewardFilter)
    next.sort((left, right) => {
      if (sort === 'low') return Number(left.listing.priceUsdcUnits - right.listing.priceUsdcUnits)
      if (sort === 'high') return Number(right.listing.priceUsdcUnits - left.listing.priceUsdcUnits)
      if (sort === 'rarity') return right.listing.rewardId - left.listing.rewardId
      return Number(right.listing.pullId - left.listing.pullId)
    })
    return next
  }, [filter, game.marketListings, sort])

  return (
    <ScrollView contentContainerStyle={styles.collectionContent} showsVerticalScrollIndicator={false}>
      <View style={styles.sectionHeading}>
        <Text style={styles.title}>Custom market</Text>
        <Text style={styles.subtitle}>
          Listed cards are escrowed in our program PDA. Buyers pay standard Devnet USDC; seller proceeds and asset
          transfer are proven by transaction and sale-record links.
        </Text>
      </View>

      {game.lastMarketPurchase ? <MarketPurchaseSuccess receipt={game.lastMarketPurchase} /> : null}

      <View style={styles.marketStatsBand}>
        <View style={styles.marketStat}>
          <Text style={styles.marketStatValue}>{floor ? `${formatUsdcUnits(floor)} USDC` : '-'}</Text>
          <Text style={styles.marketStatLabel}>FLOOR</Text>
        </View>
        <View style={styles.marketStat}>
          <Text style={styles.marketStatValue}>{game.marketListings.length.toString()}</Text>
          <Text style={styles.marketStatLabel}>LISTED</Text>
        </View>
        <View style={styles.marketStat}>
          <Text style={styles.marketStatValue}>{rareOrBetter.toString()}</Text>
          <Text style={styles.marketStatLabel}>RARE+</Text>
        </View>
      </View>

      <View style={styles.marketControls}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlRail}>
          {(['all', 'common', 'rare', 'epic', 'legendary'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => setFilter(value)}
              style={({ pressed }) => [
                styles.filterChip,
                filter === value && styles.filterChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.filterChipText, filter === value && styles.filterChipTextActive]}>
                {value.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlRail}>
          {[
            ['newest', 'Newest'],
            ['low', 'Price low'],
            ['high', 'Price high'],
            ['rarity', 'Rarity'],
          ].map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => setSort(value as MarketSort)}
              style={({ pressed }) => [
                styles.filterChip,
                sort === value && styles.filterChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.filterChipText, sort === value && styles.filterChipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {visibleListings.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="store-remove" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>No active listings</Text>
          <Text style={styles.emptyBody}>List a card from your Vault to create the first custom market order.</Text>
        </View>
      ) : (
        <View style={styles.inventoryGrid}>
          {visibleListings.map((listing) => (
            <MarketCard
              key={listing.address.toString()}
              entry={listing}
              isOwnListing={Boolean(game.publicKey?.equals(listing.listing.seller))}
              isBuyingListing={game.isBuyingListing}
              onBuy={(entry) => void game.buyListing(entry)}
            />
          ))}
        </View>
      )}

      <RecentSales sales={game.marketSales} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  jackpotContent: { padding: 20, paddingBottom: 140, gap: 18 },
  jackpotHero: { borderWidth: 1, borderColor: 'rgba(51, 205, 227, 0.45)', backgroundColor: '#121511', padding: 20, gap: 16 },
  jackpotHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  jackpotTitle: { color: colors.verified, fontSize: 42, lineHeight: 48, fontFamily: 'ClashDisplay-Bold' },
  jackpotStatusPill: { borderWidth: 1, borderColor: colors.verified, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(90,230,255,0.08)' },
  jackpotStatusText: { color: colors.verified, fontSize: 9, fontFamily: 'Inter_800ExtraBold' },
  jackpotCountdown: { color: colors.text, fontSize: 25, fontFamily: 'Rajdhani_700Bold' },
  jackpotBody: { color: colors.muted, fontSize: 14, lineHeight: 21, fontFamily: 'Manrope_500Medium' },
  jackpotMetricRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  jackpotMetricBox: { flex: 1, minWidth: 0 },
  jackpotMetricBig: { color: colors.text, fontSize: 22, fontFamily: 'Rajdhani_700Bold' },
  jackpotMetricSmall: { color: colors.muted, fontSize: 8, fontFamily: 'Inter_800ExtraBold' },
  jackpotSection: { gap: 12 },
  jackpotEntryCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 10 },
  jackpotEntryImage: { width: 66, height: 66, borderWidth: 1, borderColor: '#F5C451' },
  jackpotEntryButton: { minWidth: 66, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5C451' },
  jackpotEntryButtonText: { color: colors.background, fontSize: 11, fontFamily: 'Inter_800ExtraBold' },
  jackpotWinner: { alignItems: 'center', borderWidth: 1, borderColor: '#F5C451', backgroundColor: 'rgba(245,196,81,0.07)', padding: 24, gap: 7 },
  jackpotWinnerLabel: { color: colors.muted, fontSize: 10, fontFamily: 'Inter_800ExtraBold' },
  jackpotWinnerKey: { color: colors.text, fontSize: 22, fontFamily: 'Rajdhani_700Bold' },
  jackpotWinnerPrize: { color: '#F5C451', fontSize: 32, fontFamily: 'ClashDisplay-Bold' },
  jackpotProofCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, gap: 4 },
  // ── Gacha Box (matches web HTML structure) ──
  gachaBoxOuter: {
    overflow: 'hidden',
    marginBottom: 4,
  },
  gachaGlowWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,180,216,0.035)',
  },
  gachaGlowCore: {
    position: 'absolute',
    alignSelf: 'center',
    top: 120,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(0,180,216,0.08)',
  },
  gachaBoxInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gachaMachineWrap: {
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 60,
    overflow: 'hidden',
  },
  gachaMachineImg: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    overflow: 'hidden',
  },
  gachaSheen: {
    position: 'absolute',
    top: -20,
    width: 60,
    height: 400,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 30,
  },
  gachaIndicator: {
    position: 'absolute',
    left: 120,
    top: 220,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(0,180,216,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gachaIndicatorDot: {
    width: 3,
    height: 8,
    borderRadius: 2,
    backgroundColor: 'rgba(0,180,216,1)',
  },
  gachaFloorGlow: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    width: 180,
    height: 20,
    borderRadius: 100,
    backgroundColor: 'rgba(0,180,216,0.25)',
  },
  gachaRevealCard: {
    position: 'absolute',
    width: 214,
    height: 320,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    zIndex: 30,
  },
  gachaStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(11,13,12,0.7)',
    marginTop: 12,
  },

  dynamicPackContainer: {
    backgroundColor: '#050706',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dynamicPackScrim: {
    backgroundColor: 'rgba(11,13,12,0.1)',
  },
  dynamicPackBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
  },
  dynamicPackTopSeal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  dynamicPackBottomSeal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  dynamicPackLabel: {
    position: 'absolute',
    top: 30,
    alignSelf: 'center',
    color: 'rgba(125,226,162,0.8)',
    fontFamily: 'Rajdhani_700Bold',
    fontSize: 24,
    letterSpacing: 4,
  },

  safeArea: { flex: 1, backgroundColor: colors.background },
  bgGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    minHeight: 76,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: colors.border,
  },
  brandButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 6 },
  wordmark: { color: colors.text, fontSize: 20, fontFamily: 'Rajdhani_700Bold', letterSpacing: 2 },
  networkRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.verified },
  networkText: { color: colors.muted, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0 },
  walletButton: {
    minHeight: 46,
    minWidth: 132,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
  },
  walletKey: { color: colors.text, fontSize: 13, fontFamily: 'Inter_700Bold' },
  walletBalances: { marginTop: 2, gap: 1 },
  walletBalance: { color: colors.muted, fontSize: 10, lineHeight: 13, fontFamily: 'Inter_700Bold' },
  walletUsdcBalance: { color: colors.verified },
  offlineBanner: {
    minHeight: 40,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.epic,
  },
  offlineText: { color: colors.background, fontSize: 13, fontFamily: 'Inter_800ExtraBold' },
  globalReceiptWrap: { paddingHorizontal: 20, paddingTop: 10 },
  content: { flex: 1 },
  homeContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  heroPanel: {
    height: 490,
    borderRadius: 8,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  heroImage: { width: '100%', height: '100%' },
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(5,7,6,0.48)',
  },
  heroCopy: { position: 'absolute', left: 20, right: 20, bottom: 22, gap: 13 },
  signalPill: {
    alignSelf: 'flex-start',
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(11,13,12,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  signalPillText: { color: colors.verified, fontSize: 10, fontFamily: 'Rajdhani_700Bold' },
  heroTitle: { color: colors.text, fontSize: 42, lineHeight: 46, fontFamily: 'Rajdhani_700Bold', letterSpacing: 0 },
  heroBody: { color: colors.text, fontSize: 15, lineHeight: 22, maxWidth: 310 },
  megapotCard: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: 'rgba(90,230,255,0.38)',
    borderRadius: 8,
    backgroundColor: '#101719',
    padding: 16,
    gap: 16,
  },
  megapotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  megapotEyebrow: { color: colors.verified, fontSize: 10, fontFamily: 'Inter_800ExtraBold' },
  megapotAmount: { color: colors.text, fontSize: 30, lineHeight: 36, fontFamily: 'ClashDisplay-Bold', marginTop: 4 },
  megapotStatus: {
    minHeight: 28,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  megapotStatusReady: { borderColor: 'rgba(90,230,255,0.45)' },
  megapotStatusText: { color: colors.muted, fontSize: 9, fontFamily: 'Inter_800ExtraBold' },
  megapotStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  megapotMetric: { flex: 1, minWidth: 0 },
  megapotMetricValue: { color: colors.text, fontSize: 18, fontFamily: 'Rajdhani_700Bold' },
  megapotMetricLabel: { color: colors.muted, fontSize: 8, lineHeight: 12, fontFamily: 'Inter_800ExtraBold' },
  megapotWeights: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  megapotWeightText: {
    color: colors.text,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  megapotProofs: { flexDirection: 'row', gap: 8 },
  megapotProofButton: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  megapotProofText: { color: colors.text, fontSize: 9, fontFamily: 'Inter_800ExtraBold' },
  homeSectionHeader: {
    marginTop: 32,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  homeSectionTitle: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: 'Inter_800ExtraBold',
    marginTop: 3,
  },
  setCounter: { color: colors.muted, fontSize: 11, fontFamily: 'Inter_800ExtraBold' },
  cardRail: { gap: 10, paddingRight: 16 },
  previewCard: {
    width: 170,
    height: 240,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  previewCardImage: { width: '100%', height: '100%' },
  previewCardScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 92,
    backgroundColor: 'rgba(11,13,12,0.72)',
  },
  previewCardCopy: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 2 },
  previewRarity: { fontSize: 10, fontFamily: 'Rajdhani_700Bold' },
  previewName: { color: colors.text, fontSize: 16, fontFamily: 'Inter_800ExtraBold' },
  protocolBand: {
    marginTop: 28,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    gap: 18,
  },
  protocolLead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  protocolCopy: { flex: 1 },
  protocolTitle: { color: colors.text, fontSize: 16, fontFamily: 'Inter_800ExtraBold' },
  protocolBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  protocolStats: { flexDirection: 'row', borderTopColor: colors.border, paddingTop: 14 },
  metric: { flex: 1, minWidth: 0 },
  metricValue: { color: colors.text, fontSize: 15, fontFamily: 'Rajdhani_700Bold' },
  metricLabel: { color: colors.muted, fontSize: 9, lineHeight: 13, fontFamily: 'Inter_800ExtraBold', marginTop: 3 },
  pullContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  pullHeading: { gap: 8 },
  dropHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  editionBadge: {
    width: 58,
    height: 58,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editionBadgeValue: { color: colors.text, fontSize: 18, fontFamily: 'Rajdhani_700Bold' },
  editionBadgeLabel: {
    color: colors.muted,
    fontSize: 7,
    fontFamily: 'Rajdhani_700Bold',
    marginTop: 1,
    letterSpacing: 1,
  },
  eyebrow: { color: colors.verified, fontSize: 11, fontFamily: 'Inter_800ExtraBold', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 32, lineHeight: 38, fontFamily: 'ClashDisplay-Bold', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, maxWidth: 520 },
  packStage: { height: 380, width: '100%', alignItems: 'center', justifyContent: 'center' },
  packEnergyRing: {
    position: 'absolute',
    width: 270,
    height: 270,
    borderRadius: 135,
    borderWidth: 2,
    backgroundColor: 'rgba(125,226,162,0.03)',
  },
  gachaMachineImage: { width: 240, height: 340 },
  wrapperScene: { width: 280, height: 350 },
  machineContainer: {
    backgroundColor: '#0F1215',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingTop: 40,
    paddingBottom: 20,
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gradientCircle: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(0, 180, 216, 0.15)', // Cyan gradient base
    top: '50%',
    marginTop: -150,
  },
  packHalf: {
    zIndex: 5,
    position: 'absolute',
    top: 0,
    width: '50%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  packHalfLeft: { left: 0, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  packHalfRight: { right: 0, borderTopRightRadius: 16, borderBottomRightRadius: 16 },

  machinePackFull: { width: 280, height: 350 },
  machinePackRight: { marginLeft: -140 },

  fullPackInHalf: { position: 'absolute', top: 0, left: 0, width: 214, height: 320 },
  fullPackRight: { left: -107 },
  revealBehindCard: {
    position: 'absolute',
    width: 214,
    height: 320,
    borderRadius: 8,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  openingStatusPill: {
    position: 'absolute',
    bottom: 5,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(11,13,12,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  openingStatusText: { color: colors.text, fontSize: 9, fontFamily: 'Rajdhani_700Bold' },
  packGlow: {
    position: 'absolute',
    width: 270,
    height: 318,
    borderRadius: 8,
    opacity: 0.35,
  },
  packFrame: {
    width: 214,
    height: 320,
    borderRadius: 8,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  packImage: { width: '100%', height: '100%' },
  packScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 112,
    backgroundColor: 'rgba(11,13,12,0.7)',
  },
  packMeta: { position: 'absolute', left: 14, right: 14, bottom: 15, gap: 3 },
  packRarity: { fontSize: 10, fontFamily: 'Rajdhani_700Bold', letterSpacing: 0 },
  packName: { color: colors.text, fontSize: 20, lineHeight: 24, fontFamily: 'Rajdhani_700Bold', letterSpacing: 0 },
  packFacts: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  dropRates: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    gap: 12,
  },
  dropRatesCompact: { marginBottom: 20 },
  dropRatesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  dropRatesTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dropRatesTitle: { color: colors.text, fontSize: 14, fontFamily: 'Inter_800ExtraBold' },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedPillText: { color: colors.verified, fontSize: 9, fontFamily: 'Rajdhani_700Bold' },
  rateRow: { gap: 5 },
  rateLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rateLabel: { fontSize: 10, fontFamily: 'Rajdhani_700Bold' },
  rateValue: { color: colors.text, fontSize: 11, fontFamily: 'Inter_800ExtraBold' },
  rateTrack: { height: 5, borderRadius: 3, backgroundColor: colors.raised, overflow: 'hidden' },
  rateFill: { height: '100%', borderRadius: 3 },
  statusBlock: {
    alignSelf: 'stretch',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(21, 24, 22, 0.85)',
    overflow: 'hidden',
  },
  statusTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statusIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  statusIconError: { borderColor: colors.danger },
  statusCopy: { flex: 1, paddingTop: 1 },
  statusTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontFamily: 'Inter_700Bold' },
  statusDetail: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  primaryButton: {
    minHeight: 54,
    borderRadius: 8,
    overflow: 'visible',
    justifyContent: 'center',
  },
  primaryButtonGlow: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.verified,
    shadowColor: colors.verified,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 8,
  },
  primaryButtonText: { color: colors.background, fontSize: 16, fontFamily: 'Inter_800ExtraBold' },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  secondaryButtonText: { color: colors.text, fontSize: 14, fontFamily: 'Inter_700Bold' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
  costNote: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  revealSummary: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  raritySwatch: { width: 10, height: 10, borderRadius: 5 },
  revealText: { flex: 1 },
  revealLabel: { color: colors.muted, fontSize: 10, fontFamily: 'Inter_800ExtraBold' },
  revealName: { color: colors.text, fontSize: 18, fontFamily: 'Inter_800ExtraBold', marginTop: 2 },
  revealModal: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingBottom: 20 },
  revealTopBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  revealVerified: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  revealVerifiedText: { color: colors.verified, fontSize: 11, fontFamily: 'Rajdhani_700Bold' },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  revealStage: { minHeight: 390, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  revealHalo: {
    position: 'absolute',
    width: 300,
    height: 420,
    borderRadius: 8,
    opacity: 0.35,
  },
  revealCard: {
    width: 260,
    height: 390,
    borderRadius: 8,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  revealCardImage: { width: '100%', height: '100%' },
  revealCardScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 130,
    backgroundColor: 'rgba(11,13,12,0.72)',
  },
  revealCardCopy: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 3 },
  revealCardRarity: { fontSize: 11, fontFamily: 'Rajdhani_700Bold' },
  revealCardName: { color: colors.text, fontSize: 25, lineHeight: 30, fontFamily: 'Rajdhani_700Bold' },
  revealCardEdition: { color: colors.muted, fontSize: 10, fontFamily: 'Inter_700Bold' },
  revealReceipt: {
    minHeight: 64,
    paddingHorizontal: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  revealReceiptLabel: { color: colors.verified, fontSize: 9, fontFamily: 'Rajdhani_700Bold' },
  revealReceiptValue: { color: colors.text, fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 3 },
  revealActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  revealSecondary: {
    minHeight: 48,
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  revealSecondaryText: { color: colors.text, fontSize: 13, fontFamily: 'Inter_800ExtraBold' },
  collectionContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  proofContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  sectionHeading: { gap: 8, marginBottom: 24 },
  emptyState: { minHeight: 320, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyTitle: { color: colors.text, fontSize: 18, fontFamily: 'Inter_800ExtraBold', marginTop: 14 },
  emptyBody: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  inventoryGrid: { gap: 12 },
  inventoryCard: {
    width: '100%',
    minHeight: 260,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(21, 24, 22, 0.85)',
    overflow: 'hidden',
  },
  inventoryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemArt: {
    width: 92,
    height: 92,
    borderRadius: 6,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  itemArtImage: { width: '100%', height: '100%' },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { color: colors.text, fontSize: 17, fontFamily: 'Inter_800ExtraBold' },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  tinySwatch: { width: 6, height: 6, borderRadius: 3 },
  itemMetaText: { color: colors.muted, fontSize: 11 },
  itemOwner: { color: colors.muted, fontSize: 11, marginTop: 8 },
  cardProofBlock: { paddingTop: 10 },
  proofToggle: {
    marginTop: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  proofToggleText: {
    color: colors.verified,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  cardSectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: 'ClashDisplay-Bold',
    marginTop: 12,
    marginBottom: 6,
  },
  proofMiniRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomColor: colors.border,
  },
  proofMiniLinkRow: { minHeight: 34 },
  proofMiniLabel: { flex: 1, color: colors.muted, fontSize: 12, fontFamily: 'Manrope_500Medium' },
  proofMiniValueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  proofMiniValue: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'Rajdhani_700Bold',
    textAlign: 'right',
    maxWidth: '88%',
  },
  proofMiniLinkValue: { color: colors.verified },
  proofUnavailable: { color: colors.epic, fontSize: 11, lineHeight: 16, marginTop: 10 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  miniButton: {
    minHeight: 38,
    flex: 1,
    borderRadius: 8,
    backgroundColor: colors.raised,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  miniButtonText: { color: colors.text, fontSize: 12, fontFamily: 'Inter_800ExtraBold' },
  modalBackdrop: {
    flex: 1,
    paddingHorizontal: 18,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.74)',
  },
  priceSheet: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 18,
    gap: 16,
  },
  successSheet: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.verified,
    backgroundColor: colors.surface,
    padding: 28,
    alignItems: 'center',
    gap: 14,
  },
  successIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 255, 170, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: {
    color: colors.text,
    fontSize: 24,
    fontFamily: 'ClashDisplay-Bold',
    textAlign: 'center',
  },
  successBody: {
    color: colors.muted,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
    lineHeight: 20,
  },
  successButton: {
    marginTop: 8,
    minHeight: 48,
    width: '100%',
    borderRadius: 10,
    backgroundColor: colors.verified,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successButtonText: {
    color: colors.background,
    fontSize: 15,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 1.2,
  },
  priceSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  priceSheetTitle: { color: colors.text, fontSize: 25, lineHeight: 30, fontFamily: 'Inter_800ExtraBold' },
  priceInputLabel: { color: colors.muted, fontSize: 11, fontFamily: 'Inter_800ExtraBold', letterSpacing: 0.8 },
  priceInputWrap: {
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  priceInput: { flex: 1, color: colors.text, fontSize: 28, fontFamily: 'Rajdhani_700Bold', paddingVertical: 8 },
  priceInputUnit: { color: colors.verified, fontSize: 13, fontFamily: 'Inter_800ExtraBold' },
  pricePresetRow: { flexDirection: 'row', gap: 8 },
  pricePreset: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pricePresetText: { color: colors.text, fontSize: 14, fontFamily: 'Inter_800ExtraBold' },
  fuseLab: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(90,230,255,0.35)',
    backgroundColor: 'rgba(21,24,22,0.92)',
    gap: 12,
  },
  fuseLabHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  fuseLabTitle: { color: colors.text, fontSize: 20, fontFamily: 'Inter_800ExtraBold' },
  fuseRulePill: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.verified,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(90,230,255,0.1)',
  },
  fuseRuleText: { color: colors.verified, fontSize: 10, fontFamily: 'Inter_800ExtraBold' },
  fuseLabBody: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  fuseTrackList: { gap: 10 },
  fuseTrackRow: {
    minHeight: 72,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fuseTrackArt: {
    width: 52,
    height: 52,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: colors.raised,
  },
  fuseTrackImage: { width: '100%', height: '100%' },
  fuseTrackCopy: { flex: 1, minWidth: 0 },
  fuseTrackName: { color: colors.text, fontSize: 14, fontFamily: 'Inter_800ExtraBold' },
  fuseTrackMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  fuseProgressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.raised,
    marginTop: 8,
  },
  fuseProgressFill: { height: '100%', borderRadius: 3 },
  fuseMiniButton: {
    minWidth: 76,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  fuseMiniButtonReady: { borderColor: colors.verified, backgroundColor: colors.verified },
  fuseMiniButtonText: { color: colors.muted, fontSize: 11, fontFamily: 'Inter_800ExtraBold' },
  fuseMiniButtonTextReady: { color: colors.background },
  marketStatsBand: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: 10,
  },
  marketStat: { flex: 1, minWidth: 0 },
  marketStatValue: { color: colors.text, fontSize: 17, fontFamily: 'Rajdhani_700Bold' },
  marketStatLabel: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 4,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 0.6,
  },
  marketControls: { gap: 8, marginBottom: 18 },
  controlRail: { gap: 8, paddingRight: 14 },
  filterChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { borderColor: colors.verified, backgroundColor: 'rgba(90,230,255,0.12)' },
  filterChipText: { color: colors.muted, fontSize: 11, fontFamily: 'Inter_800ExtraBold' },
  filterChipTextActive: { color: colors.text },
  purchaseSuccessCard: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(90,230,255,0.45)',
    backgroundColor: 'rgba(90,230,255,0.1)',
  },
  purchaseSuccessCardCompact: { marginBottom: 0 },
  purchaseSuccessTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  purchaseSuccessIcon: {
    width: 46,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.verified,
  },
  purchaseSuccessTitle: { color: colors.text, fontSize: 17, fontFamily: 'Inter_800ExtraBold' },
  purchaseSuccessBody: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  saleThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: colors.raised,
  },
  saleThumbImage: { width: '100%', height: '100%' },
  saleProofButton: {
    marginTop: 4,
    minHeight: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  saleProofText: { color: colors.verified, fontSize: 10, fontFamily: 'Inter_800ExtraBold' },
  verifiedBand: {
    minHeight: 86,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.verified,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 26,
  },
  verifiedCopy: { flex: 1 },
  verifiedTitle: { color: colors.background, fontSize: 16, fontFamily: 'Inter_800ExtraBold' },
  verifiedBody: { color: '#253129', fontSize: 12, lineHeight: 17, marginTop: 3 },
  sectionLabel: { color: colors.muted, fontSize: 11, fontFamily: 'Inter_800ExtraBold', marginBottom: 9 },
  oddsList: { borderTopColor: colors.border, marginBottom: 26 },
  oddsRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: colors.border,
  },
  oddsIdentity: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  oddsName: { color: colors.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  oddsCreature: { color: colors.muted, fontSize: 11, marginTop: 2 },
  oddsValue: { color: colors.text, fontSize: 15, fontFamily: 'Inter_800ExtraBold' },
  proofRows: { borderTopColor: colors.border, marginBottom: 14 },
  proofRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: colors.border,
  },
  proofLabel: { color: colors.muted, fontSize: 13 },
  proofValue: { color: colors.text, fontSize: 13, fontFamily: 'Inter_700Bold' },
  tabBar: {
    minHeight: 76,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  tabButton: { minWidth: 68, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabLabel: { color: colors.muted, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  tabLabelSelected: { color: colors.verified },
  badge: {
    position: 'absolute',
    top: -7,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.verified,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.background, fontSize: 9, fontFamily: 'Rajdhani_700Bold' },
  heroImageWrapper: {
    height: 280,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  pillBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(90,230,255,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
    gap: 6,
  },
  pillText: {
    color: colors.verified,
    fontSize: 10,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 1,
  },
  gachaMainPanel: { paddingHorizontal: 16, marginBottom: 24 },
  gachaMainCopy: {
    marginTop: 0,
    alignItems: 'center',
  },
  gachaMainTitle: {
    color: '#F4F4F5',
    fontSize: 32,
    fontFamily: 'ClashDisplay-Bold',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  gachaMainBody: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontFamily: 'Manrope_500Medium',
    lineHeight: 24,
    marginTop: 6,
    textAlign: 'center',
  },
  statsThreeCol: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
  statsCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsColLabel: {
    color: colors.muted,
    fontSize: 9,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statsColValue: {
    color: colors.text,
    fontSize: 16,
    fontFamily: 'ClashDisplay-Bold',
  },
  sidebarSection: {
    marginBottom: 28,
  },
  sidebarHeader: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'ClashDisplay-Bold',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  activePackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.verified,
    gap: 12,
  },
  activePackThumb: {
    width: 48,
    height: 64,
    borderRadius: 6,
  },
  activePackTitle: {
    color: colors.text,
    fontSize: 15,
    fontFamily: 'Inter_800ExtraBold',
  },
  activePackSub: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    marginTop: 2,
  },
  activePackPrice: {
    color: colors.text,
    fontSize: 14,
    fontFamily: 'Rajdhani_700Bold',
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  recentThumb: {
    width: 36,
    height: 48,
    borderRadius: 4,
    backgroundColor: colors.raised,
  },
  recentTitle: {
    color: colors.text,
    fontSize: 14,
    fontFamily: 'Inter_800ExtraBold',
  },
  recentSub: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    marginTop: 2,
  },
  recentRarity: {
    fontSize: 10,
    fontFamily: 'Rajdhani_700Bold',
    marginBottom: 2,
  },
  recentPrice: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  premiumHomeContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  premiumHeroBg: {
    position: 'absolute',
    top: -100,
    left: -20,
    right: -20,
    height: 650,
    opacity: 0.8,
  },
  premiumHeroFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 600,
    backgroundColor: 'transparent',
  },
  premiumHeroPanel: {
    marginTop: 240,
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  premiumHeroCopy: {
    alignItems: 'flex-start',
  },
  premiumPillBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(21, 24, 22, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(90,230,255,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
    gap: 8,
  },
  premiumPillText: {
    color: colors.verified,
    fontSize: 10,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 1.5,
  },
  premiumHeroTitle: {
    color: '#FFFFFF',
    fontSize: 54,
    fontFamily: 'Rajdhani_700Bold',
    lineHeight: 52,
    letterSpacing: -1,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  premiumHeroBody: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 24,
    marginTop: 16,
    maxWidth: '90%',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  premiumSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  premiumSectionLabel: {
    color: colors.verified,
    fontSize: 12,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  premiumSectionTitle: {
    color: colors.text,
    fontSize: 24,
    fontFamily: 'Rajdhani_700Bold',
  },
  premiumSetCounter: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 1,
  },
  premiumCardRail: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 16,
  },
  premiumPreviewCard: {
    width: 220,
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  premiumPreviewCardImage: {
    ...StyleSheet.absoluteFillObject,
  },
  premiumPreviewCardScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  premiumPreviewCardCopy: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  premiumPreviewRarity: {
    fontSize: 11,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 2,
    marginBottom: 4,
  },
  premiumPreviewName: {
    color: colors.text,
    fontSize: 22,
    fontFamily: 'Rajdhani_700Bold',
  },
  premiumProtocolBand: {
    marginHorizontal: 24,
    marginTop: 20,
    padding: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(21, 24, 22, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  premiumProtocolLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  premiumProtocolIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(90,230,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(90,230,255,0.2)',
  },
  premiumProtocolCopy: {
    flex: 1,
  },
  premiumProtocolTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: 'Inter_800ExtraBold',
  },
  premiumProtocolBody: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 4,
  },
})

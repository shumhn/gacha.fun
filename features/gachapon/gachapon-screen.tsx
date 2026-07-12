import { MaterialCommunityIcons, FontAwesome6 } from '@expo/vector-icons'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
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
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  DEFAULT_VRF_QUEUE,
  BUYBACK_PAYOUT_USDC_UNITS,
  DEVNET_USDC_MINT,
  ER_DEVNET_RPC_URL,
  PACK_PRICE_USDC,
  PROGRAM_ID,
  REWARDS,
  VRF_PROGRAM_ID,
  explorerAddress,
  explorerErAddress,
  explorerErTx,
  explorerTx,
  findInventoryAddress,
  shortKey,
} from '@/lib/gachapon-client'
import { InventoryItem, PullStage, useGachapon } from './use-gachapon'

type Tab = 'home' | 'packs' | 'vault' | 'market' | 'proof'

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

export function GachaponScreen() {
  const game = useGachapon()
  const [tab, setTab] = useState<Tab>('home')
  const [refreshing, setRefreshing] = useState(false)
  const [revealDismissed, setRevealDismissed] = useState(false)
  const [revealReady, setRevealReady] = useState(false)

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
          accessibilityLabel="Open STARWEAVER home"
          onPress={() => setTab('home')}
          style={({ pressed }) => [styles.brandButton, pressed && styles.pressed]}
        >
          <Image source={brandMark} style={styles.brandMark} contentFit="cover" />
          <View>
            <Text style={styles.wordmark}>STARWEAVER</Text>
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
          onConnect={() => void game.connect()}
          onDisconnect={() => void game.disconnect()}
        />
      </View>

      {game.isOffline ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <MaterialCommunityIcons name="wifi-off" size={18} color={colors.background} />
          <Text style={styles.offlineText}>Offline. Pulls are paused.</Text>
        </View>
      ) : null}

      <View style={styles.content}>
        {tab === 'home' ? (
          <HomeView onEnter={() => setTab('packs')} inventoryCount={game.inventory.length} onTabChange={(t) => setTab(t)} />
        ) : tab === 'packs' ? (
          <PullView game={game} onFund={() => void game.requestAirdrop()} />
        ) : tab === 'vault' ? (
          <CollectionView items={game.inventory} refreshing={refreshing} onRefresh={onRefresh} />
        ) : tab === 'market' ? (
          <MarketView game={game} />
        ) : (
          <ProofView game={game} />
        )}
      </View>

      <View style={styles.tabBar} accessibilityRole="tablist">
        <TabButton icon="home-outline" label="Home" selected={tab === 'home'} onPress={() => setTab('home')} />
        <TabButton icon="cards-outline" label="Packs" selected={tab === 'packs'} onPress={() => setTab('packs')} />
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

function HomeView({ onEnter, inventoryCount, onTabChange }: { onEnter: () => void; inventoryCount: number; onTabChange?: (tab: Tab) => void }) {
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
          Like <Text style={{ color: colors.verified }}>Genshin</Text>, but{'\n'}with a marketplace
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
          Starweaver brings true ownership into the anime gacha experience. Pull rare characters, fuse them into higher tiers, and trade on our secure decentralized marketplace.
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
            onPress={() => onTabChange && onTabChange('vault')}
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
              VIEW VAULT
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
              <MaterialCommunityIcons name="cash" size={28} color="#000000" />
              <Text style={{ color: '#000000', fontSize: 24, fontFamily: 'ClashDisplay-Bold', marginTop: 4 }}>01</Text>
            </View>
            <Text style={{ flex: 1, color: '#121212', fontSize: 16, fontFamily: 'Manrope_500Medium', lineHeight: 24 }}>
              <Text style={{ fontFamily: 'Inter_700Bold' }}>Pay 1 USDC, Pull a Pack</Text>
              {'\n'}
              Each pull costs 1 USDC. Your pull executes instantly on MagicBlock Ephemeral Rollups, with VRF randomness deciding your character.
            </Text>
          </View>

          {/* Step 2 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <View style={{ alignItems: 'center', width: 40 }}>
              <MaterialCommunityIcons name="wallet" size={28} color="#000000" />
              <Text style={{ color: '#000000', fontSize: 24, fontFamily: 'ClashDisplay-Bold', marginTop: 4 }}>02</Text>
            </View>
            <Text style={{ flex: 1, color: '#121212', fontSize: 16, fontFamily: 'Manrope_500Medium', lineHeight: 24 }}>
              <Text style={{ fontFamily: 'Inter_700Bold' }}>Claim or Instant Buyback</Text>
              {'\n'}
              Claim your character as a Metaplex Core NFT minted to your wallet, or sell it back instantly for USDC at a guaranteed payout.
            </Text>
          </View>

          {/* Step 3 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <View style={{ alignItems: 'center', width: 40 }}>
              <MaterialCommunityIcons name="swap-horizontal" size={28} color="#000000" />
              <Text style={{ color: '#000000', fontSize: 24, fontFamily: 'ClashDisplay-Bold', marginTop: 4 }}>03</Text>
            </View>
            <Text style={{ flex: 1, color: '#121212', fontSize: 16, fontFamily: 'Manrope_500Medium', lineHeight: 24 }}>
              <Text style={{ fontFamily: 'Inter_700Bold' }}>Trade on the Marketplace</Text>
              {'\n'}
              List characters at any price. Buyers pay USDC directly to you — fully peer-to-peer, no middleman, all on Solana.
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
            Starweaver
          </Text>
        </View>

        <Text style={{ color: '#71717A', fontSize: 12, fontFamily: 'Manrope_500Medium', marginBottom: 4 }}>
          © 2026 Starweaver. All rights reserved.
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
          <Text style={styles.gachaMainTitle}>Titan Pack</Text>
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
            <Image source={packArt} style={styles.gachaMachineImg} contentFit="contain" />
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
  refreshing,
  onRefresh,
}: {
  items: InventoryItem[]
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.collectionContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.verified} />}
    >
      <View style={styles.sectionHeading}>
        <Text style={styles.title}>Your vault</Text>
        <Text style={styles.subtitle}>
          Every card is wallet-owned, minted with Metaplex Core, and carries its complete MagicBlock proof trail.
        </Text>
      </View>
      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="archive-outline" size={38} color={colors.muted} />
          <Text style={styles.emptyTitle}>Your vault is empty</Text>
          <Text style={styles.emptyBody}>Open a Genesis Signal pack to reveal your first creature card.</Text>
        </View>
      ) : (
        <View style={styles.inventoryGrid}>
          {items.map((item) => (
            <InventoryCard key={item.accounts.asset.toString()} item={item} />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

function InventoryCard({ item }: { item: InventoryItem }) {
  const color = rarityColors[item.pull.rewardId]
  const reward = REWARDS[item.pull.rewardId]
  const inventoryAddress = item.proof?.inventory ?? findInventoryAddress(item.pull.player)
  const sold = Boolean(item.proof?.buybackSignature)
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
              {reward.rarity} · Pull #{item.pull.pullId.toString()}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.itemOwner}>
            Owner {shortKey(item.asset.owner)}
          </Text>
          {sold ? <Text style={[styles.itemMetaText, { color: colors.verified }]}>Sold · {buybackAmount} USDC</Text> : null}
        </View>
      </View>

      <View style={styles.cardProofBlock}>
        <Text style={styles.cardSectionLabel}>PACK PROOF</Text>
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
          label="Payment mint"
          value={shortKey(item.proof?.paymentMint ?? DEVNET_USDC_MINT)}
          onPress={() => void Linking.openURL(explorerAddress(item.proof?.paymentMint ?? DEVNET_USDC_MINT))}
        />
        <ProofMiniRow
          label="Treasury"
          value={shortKey(item.proof?.paymentTreasury ?? item.accounts.treasury)}
          onPress={() => void Linking.openURL(explorerAddress(item.proof?.paymentTreasury ?? item.accounts.treasury))}
        />
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
          label="Asset"
          value={shortKey(item.accounts.asset)}
          onPress={() => void Linking.openURL(explorerAddress(item.accounts.asset))}
        />
      </View>

      {!item.proof ? (
        <Text style={styles.proofUnavailable}>Full tx proof is captured for pulls made after this build.</Text>
      ) : null}

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

      {!sold ? (
        <View style={{ marginTop: 16 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Trade ${item.asset.name} on Tensor`}
            onPress={() => void Linking.openURL(`https://tensor.trade/item/${item.accounts.asset.toBase58()}`)}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons name="storefront-outline" size={18} color={colors.text} style={{ marginRight: 8 }} />
            <Text style={[styles.primaryButtonText, { color: colors.text }]}>Trade on Tensor</Text>
          </Pressable>
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
        <ProofRow label="VOIDDECK program" value={shortKey(PROGRAM_ID)} />
        <ProofRow label="Pack price" value={`${PACK_PRICE_USDC} Devnet USDC`} />
        <ProofRow label="Payment mint" value={shortKey(DEVNET_USDC_MINT)} />
        <ProofRow label="MagicBlock ER RPC" value={ER_DEVNET_RPC_URL.replace('https://', '')} />
        <ProofRow label="ER inventory" value={game.erReady ? 'Delegated · ready' : 'Not activated'} />
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
  onConnect,
  onDisconnect,
}: {
  publicKey: string | null
  walletMode: 'external' | 'devnet-test' | null
  balance: number | null
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
          {publicKey ? (walletMode === 'devnet-test' ? 'Test wallet' : shortKey(publicKey)) : 'Connect'}
        </Text>
        {publicKey ? (
          <Text style={styles.walletBalance}>{balance === null ? 'Loading' : `${balance.toFixed(3)} SOL`}</Text>
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
        detail: 'Charging 1 Devnet USDC and creating your onchain pull account.',
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

function MarketView({ game }: { game: ReturnType<typeof useGachapon> }) {
  if (game.marketListings.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <MaterialCommunityIcons name="store-remove" size={48} color={colors.border} />
        <Text style={{ color: colors.muted, fontSize: 16, fontFamily: 'Manrope_500Medium', marginTop: 16 }}>
          No cards currently listed for sale.
        </Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: '#F4F4F5', fontSize: 32, fontFamily: 'ClashDisplay-Bold', letterSpacing: -0.5 }}>
        Market
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, fontFamily: 'Manrope_500Medium', lineHeight: 24 }}>
        Peer-to-peer decentralized exchange. Trade cards directly via Tensor.
      </Text>

      <View style={{ marginTop: 16, gap: 12 }}>
        {game.marketListings.map((listing) => {
          const rewardIndex = REWARDS.findIndex((r) => r.name === listing.reward.name)
          const color = rarityColors[rewardIndex]
          const price = formatUsdcUnits(listing.listing.priceUsdcUnits)
          const isBuying = game.isBusy

          return (
            <View key={listing.address.toString()} style={styles.inventoryCard}>
              <View style={styles.inventoryTopRow}>
                <View style={[styles.itemArt, { borderColor: color }]}>
                  <Image source={rewardArt[rewardIndex]} style={styles.itemArtImage} contentFit="cover" />
                </View>
                <View style={styles.itemCopy}>
                  <Text numberOfLines={1} style={styles.itemName}>
                    {listing.reward.name}
                  </Text>
                  <View style={styles.itemMeta}>
                    <View style={[styles.tinySwatch, { backgroundColor: color }]} />
                    <Text style={styles.itemMetaText}>
                      {listing.reward.rarity} · Seller {shortKey(listing.asset.owner)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.cardProofBlock, { marginTop: 16, alignItems: 'center', justifyContent: 'space-between', flexDirection: 'row' }]}>
                <View>
                  <Text style={{ color: colors.muted, fontSize: 10, fontFamily: 'Inter_800ExtraBold', letterSpacing: 0.5 }}>
                    ASKING PRICE
                  </Text>
                  <Text style={{ color: colors.verified, fontSize: 20, fontFamily: 'ClashDisplay-Bold', marginTop: 2 }}>
                    {price} USDC
                  </Text>
                </View>
                <PrimaryButton
                  icon="cart-outline"
                  label={isBuying ? '...' : 'Buy'}
                  disabled={isBuying}
                  onPress={() => game.buyListing(listing)}
                />
              </View>
            </View>
          )
        })}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
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
    width: 260,
    height: 340,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gachaMachineImg: {
    width: '100%',
    height: '100%',
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
    minWidth: 108,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
  },
  walletKey: { color: colors.text, fontSize: 13, fontFamily: 'Inter_700Bold' },
  walletBalance: { color: colors.muted, fontSize: 10, marginTop: 1 },
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
  title: { color: colors.text, fontSize: 32, lineHeight: 38, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.5 },
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
  cardProofBlock: { marginTop: 14, borderTopColor: colors.border },
  cardSectionLabel: {
    color: colors.muted,
    fontSize: 10,
    fontFamily: 'Rajdhani_700Bold',
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
  proofMiniLabel: { flex: 1, color: colors.muted, fontSize: 12 },
  proofMiniValueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  proofMiniValue: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
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
    fontSize: 36,
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

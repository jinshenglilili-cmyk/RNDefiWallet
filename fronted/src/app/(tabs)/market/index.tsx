import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Keyboard,
  LayoutAnimation,
  useWindowDimensions,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Animated } from 'react-native';

import { getMarkets, getGlobal } from '@/utils/coingecko';
import * as portfolioStore from '@/utils/portfolioStore';
import { useTheme, formatPercent } from '@/utils/theme';
import { formatBig, formatCurrency, formatCurrency6 } from '@/utils/format';

/** 价格格式：千分位 + 2~6 位小数（对齐参考项目 asCurrencyWith6Decimals） */
function formatPrice(value) {
  const num = Number(value);
  if (num >= 1000) return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (num >= 1) return num.toFixed(2);
  return num.toPrecision(6).replace(/0+$/, '');
}

/**
 * 行情 Tab：对齐参考项目 HomeView 的「行情 / 持仓」双模式
 * - 头部圆形按钮：行情视图 info（打开设置）、持仓视图 +（打开编辑持仓）
 * - 右侧 chevron 切换行情/持仓（旋转 180°）
 * - 统计卡一行（市值/24h量/BTC占比/持仓价值），切换时横向滑出持仓价值卡
 * - 排序表头：币种(rank)/持仓(holdings)/价格(price)，点击正反切换
 * - 刷新按钮：旋转 2s 动画 + 重新拉数据（参考项目没有下拉刷新）
 */
export default function Market() {
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const priceColWidth = width / 3.5;
  const statsRef = useRef(null);
  const spinValue = useRef(new Animated.Value(0)).current;

  // ---------- 数据 ----------
  const [coins, setCoins] = useState([]);
  const [globalData, setGlobalData] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ---------- 视图状态 ----------
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sortOption, setSortOption] = useState('holdings');

  // ---------- 编辑持仓 sheet ----------
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetSearch, setSheetSearch] = useState('');
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [quantityText, setQuantityText] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const styles = makeStyles(t, priceColWidth, width);

  // 搜索 0.5s 防抖（对齐参考项目 debounce filter）
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(searchText.trim().toLowerCase()), 500);
    return () => clearTimeout(timer);
  }, [searchText]);

  const loadData = useCallback(async () => {
    try {
      setError(false);
      const [marketList, global] = await Promise.all([getMarkets(250), getGlobal()]);
      setCoins(marketList);
      setGlobalData(global);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次进入 + 每次聚焦到 tab 时刷新持仓数据
  useEffect(() => {
    portfolioStore.getPortfolio().then(setHoldings);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 刷新：旋转 2s + 重新拉数据（无下拉刷新，对齐参考项目）
  const onRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    spinValue.setValue(0);
    Animated.timing(spinValue, { toValue: 1, duration: 2000, useNativeDriver: true }).start();
    loadData().finally(() => setRefreshing(false));
  };
  const spin = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // ---------- 派生数据 ----------
  const amountMap = useMemo(
    () => Object.fromEntries(holdings.map((h) => [h.coinID, h.amount])),
    [holdings]
  );

  // allCoins ∩ 持仓（行情刷新后持仓价格自动跟着变）
  const portfolioCoins = useMemo(
    () =>
      coins
        .filter((c) => (amountMap[c.id] ?? 0) > 0)
        .map((c) => ({
          ...c,
          currentHoldings: amountMap[c.id] ?? 0,
          currentHoldingsValue: (amountMap[c.id] ?? 0) * c.current_price,
        })),
    [coins, amountMap]
  );

  const matches = useCallback(
    (c, k) =>
      !k ||
      c.name.toLowerCase().includes(k) ||
      c.symbol.toLowerCase().includes(k) ||
      c.id.toLowerCase().includes(k),
    []
  );

  // 排序：rank/holdings 在行情视图下等价于按 rank；持仓视图 holdings 按持仓价值
  const sortList = useCallback(
    (list, isPortfolio) => {
      const arr = [...list];
      switch (sortOption) {
        case 'rankReversed':
          arr.sort((a, b) => (b.market_cap_rank ?? 0) - (a.market_cap_rank ?? 0));
          break;
        case 'price':
          arr.sort((a, b) => b.current_price - a.current_price);
          break;
        case 'priceReversed':
          arr.sort((a, b) => a.current_price - b.current_price);
          break;
        case 'holdings':
        case 'holdingsReversed':
          if (isPortfolio) {
            arr.sort((a, b) => b.currentHoldingsValue - a.currentHoldingsValue);
            if (sortOption === 'holdingsReversed') arr.reverse();
          }
          break;
        default:
          break; // rank 升序：接口本来就按市值排
      }
      return arr;
    },
    [sortOption]
  );

  const marketList = useMemo(
    () => sortList(coins.filter((c) => matches(c, debounced)), false),
    [coins, debounced, matches, sortList]
  );
  const portfolioList = useMemo(
    () => sortList(portfolioCoins.filter((c) => matches(c, debounced)), true),
    [portfolioCoins, debounced, matches, sortList]
  );

  // 统计卡数据（持仓价值 24h 涨跌用正确公式，修复参考项目的运算符优先级 bug）
  const portfolioValue = portfolioCoins.reduce((s, c) => s + c.currentHoldingsValue, 0);
  const previousValue = portfolioCoins.reduce((s, c) => {
    const pct = c.price_change_percentage_24h ?? 0;
    return s + c.currentHoldingsValue / (1 + pct / 100);
  }, 0);
  const portfolioChange = previousValue > 0 ? ((portfolioValue - previousValue) / previousValue) * 100 : 0;

  const statistics = [
    { title: '市值', value: formatBig(globalData?.totalMarketCap ?? 0), change: globalData?.marketCapChange24h },
    { title: '24h量', value: formatBig(globalData?.totalVolume ?? 0), change: null },
    { title: 'BTC占比', value: `${(globalData?.btcDominance ?? 0).toFixed(2)}%`, change: null },
    { title: '持仓价值', value: formatCurrency(portfolioValue), change: portfolioChange },
  ];

  // ---------- 交互 ----------
  function togglePortfolio() {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch {}
    setShowPortfolio((v) => !v);
    setTimeout(() => {
      if (showPortfolio) statsRef.current?.scrollTo({ x: 0, animated: true });
      else statsRef.current?.scrollToEnd({ animated: true });
    }, 250);
  }

  // 表头点击：同列正反切换
  function toggleSort(option) {
    const reversed = `${option}Reversed`;
    setSortOption((cur) => (cur === option ? reversed : cur === reversed ? option : option));
  }

  // ---------- 编辑持仓 ----------
  function openPortfolioSheet() {
    setSheetSearch('');
    setSelectedCoin(null);
    setQuantityText('');
    setSheetVisible(true);
  }

  const sheetCoins = sheetSearch.trim()
    ? coins.filter((c) => matches(c, sheetSearch.trim().toLowerCase()))
    : portfolioCoins;

  const parsedQty = parseFloat(quantityText);
  const currentAmt = selectedCoin ? amountMap[selectedCoin.id] ?? 0 : 0;
  const canSave =
    selectedCoin !== null &&
    quantityText.length > 0 &&
    !Number.isNaN(parsedQty) &&
    parsedQty !== currentAmt;

  async function saveHolding() {
    if (!canSave || !selectedCoin) return;
    const updated = await portfolioStore.updatePortfolio(selectedCoin.id, parsedQty);
    setHoldings(updated);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
    setSelectedCoin(null);
    setQuantityText('');
    setSheetSearch('');
    Keyboard.dismiss();
  }

  // ---------- 加载/错误态 ----------
  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.dim}>行情加载中…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.dim}>行情加载失败（检查网络/代理）</Text>
        <TouchableOpacity onPress={() => { setLoading(true); loadData(); }} style={styles.retry}>
          <Text style={styles.retryText}>重新加载</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const listData = showPortfolio ? portfolioList : marketList;

  // ---------- 行渲染 ----------
  function CoinRow({ item }) {
    const change = item.price_change_percentage_24h;
    return (
      <Link href={{ pathname: '/market/[id]', params: { id: item.id } }} asChild push>
        <TouchableOpacity activeOpacity={0.6}>
          <View style={styles.row}>
            {!showPortfolio && <Text style={styles.rank}>{item.market_cap_rank}</Text>}
            <Image source={{ uri: item.image }} style={styles.logo} />
            <View style={styles.symbolCol}>
              <Text style={styles.symbol}>{item.symbol.toUpperCase()}</Text>
              {showPortfolio && (
                <Text style={styles.holdingsCaption}>
                  {item.currentHoldings} {item.symbol.toUpperCase()}
                </Text>
              )}
            </View>
            <View style={[styles.priceCol, { width: priceColWidth }]}>
              <Text style={styles.price}>${formatPrice(item.current_price)}</Text>
              <Text style={[styles.change, { color: change >= 0 ? t.green : t.red }]}>
                {formatPercent(change)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Link>
    );
  }

  // 排序箭头（当前列激活时显示）
  function SortArrow({ option }) {
    const active = sortOption === option || sortOption === `${option}Reversed`;
    const reversed = sortOption === `${option}Reversed`;
    if (!active) return null;
    return <Text style={styles.sortArrow}>{reversed ? '▴' : '▾'}</Text>;
  }

  function StatCard({ title, value, change }) {
    return (
      <View style={[styles.statCard, { width: width / 3 }]}>
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={styles.statValue}>{value}</Text>
        {change !== null && change !== undefined ? (
          <Text style={[styles.statChange, { color: change >= 0 ? t.green : t.red }]}>
            {formatPercent(change)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 头部：左圆形按钮 + 标题 + 右 chevron */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.circleButton}
          activeOpacity={0.7}
          onPress={showPortfolio ? openPortfolioSheet : () => router.push('/settings')}
        >
          <Text style={styles.circleIcon}>{showPortfolio ? '＋' : 'ⓘ'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{showPortfolio ? '持仓 Portfolio' : '行情 Live Prices'}</Text>
        <TouchableOpacity style={styles.circleButton} activeOpacity={0.7} onPress={togglePortfolio}>
          <Text
            style={[
              styles.circleIcon,
              { transform: [{ rotate: showPortfolio ? '180deg' : '0deg' }] },
            ]}
          >
            ›
          </Text>
        </TouchableOpacity>
      </View>

      {/* 统计卡一行：持仓模式滑到最右露出持仓价值卡 */}
      <ScrollView
        ref={statsRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statsRow}
      >
        {statistics.map((s) => (
          <StatCard key={s.title} title={s.title} value={s.value} change={s.change} />
        ))}
      </ScrollView>

      {/* 搜索条 */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Text style={[styles.searchIcon, searchText ? { color: t.accent } : null]}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="按名称或符号搜索…"
            placeholderTextColor={t.secondaryText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* 排序表头 */}
      <View style={styles.columnTitles}>
        <TouchableOpacity style={styles.colCoin} onPress={() => toggleSort('rank')}>
          <Text style={styles.columnTitle}>币种</Text>
          <SortArrow option="rank" />
        </TouchableOpacity>
        {showPortfolio ? (
          <TouchableOpacity style={styles.colHoldings} onPress={() => toggleSort('holdings')}>
            <Text style={styles.columnTitle}>持仓</Text>
            <SortArrow option="holdings" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[styles.colPrice, { width: priceColWidth }]} onPress={() => toggleSort('price')}>
          <Text style={styles.columnTitle}>价格</Text>
          <SortArrow option="price" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Animated.Text style={[styles.refreshIcon, { transform: [{ rotate: spin }] }]}>↻</Animated.Text>
        </TouchableOpacity>
      </View>

      {/* 列表 */}
      {showPortfolio && portfolioList.length === 0 && !debounced ? (
        <View style={styles.emptyPortfolio}>
          <Text style={styles.emptyPortfolioText}>
            你还没有添加任何持仓。{'\n'}点击左上角 ＋ 按钮开始！🧐
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CoinRow item={item} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 编辑持仓弹窗（+ 按钮，对齐参考项目 PortfolioView sheet） */}
      <Modal visible={sheetVisible} animationType="slide" onRequestClose={() => setSheetVisible(false)}>
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => setSheetVisible(false)}>
              <Text style={styles.sheetClose}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>编辑持仓</Text>
            <View style={styles.sheetRight}>
              {justSaved ? (
                <Text style={styles.savedCheck}>✓</Text>
              ) : canSave ? (
                <TouchableOpacity onPress={saveHolding}>
                  <Text style={styles.saveText}>保存</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* 搜索（复用防抖前的即时过滤） */}
          <View style={styles.searchWrap}>
            <View style={styles.searchBar}>
              <Text style={[styles.searchIcon, sheetSearch ? { color: t.accent } : null]}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                value={sheetSearch}
                onChangeText={(v) => {
                  setSheetSearch(v);
                  if (v === '') setSelectedCoin(null); // 清空搜索时取消选中
                }}
                placeholder="搜索要添加的币…"
                placeholderTextColor={t.secondaryText}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* 币 logo 横向选择（空搜索显示已持仓，搜索时显示全部） */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.logoRow}>
            {sheetCoins.map((c) => {
              const selected = selectedCoin?.id === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedCoin(c);
                    const amt = amountMap[c.id] ?? 0;
                    setQuantityText(amt > 0 ? String(amt) : '');
                  }}
                  style={[styles.logoCell, selected && styles.logoCellSelected]}
                >
                  <Image source={{ uri: c.image }} style={styles.logoPick} />
                  <Text style={styles.logoSymbol} numberOfLines={1}>
                    {c.symbol.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {sheetCoins.length === 0 && (
              <Text style={styles.dim}>无匹配的币</Text>
            )}
          </ScrollView>

          {/* 选中币的输入区 */}
          {selectedCoin ? (
            <View style={styles.editCard}>
              <Text style={styles.editPrice}>
                {selectedCoin.name} 现价 {formatCurrency6(selectedCoin.current_price)}
              </Text>
              <Text style={styles.editLabel}>持仓数量</Text>
              <TextInput
                style={styles.editInput}
                value={quantityText}
                onChangeText={setQuantityText}
                placeholder="如：1.4"
                placeholderTextColor={t.secondaryText}
                keyboardType="decimal-pad"
              />
              <Text style={styles.editLabel}>当前价值</Text>
              <Text style={styles.editValue}>
                {Number.isNaN(parsedQty) ? '$0.00' : formatCurrency(parsedQty * selectedCoin.current_price)}
              </Text>
              <Text style={styles.editHint}>数量填 0 并保存即从持仓中移除</Text>
            </View>
          ) : (
            <Text style={styles.pickHint}>
              {sheetSearch ? '点选一个币来添加持仓' : '已持仓的币显示在上方，搜索可添加新币'}
            </Text>
          )}
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (t, priceColWidth, screenWidth) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background,
    },
    center: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    dim: {
      color: t.secondaryText,
      fontSize: 14,
    },
    retry: {
      marginTop: 15,
      paddingHorizontal: 20,
      height: 36,
      borderRadius: 10,
      backgroundColor: t.accent,
      justifyContent: 'center',
    },
    retryText: {
      color: t.background,
      fontSize: 13,
      fontWeight: '600',
    },

    // 头部
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 58,
    },
    circleButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: t.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    circleIcon: {
      fontSize: 20,
      fontWeight: '700',
      color: t.accent,
    },
    title: {
      flex: 1,
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '900',
      color: t.accent,
    },

    // 统计卡
    statsRow: {
      flexGrow: 0,
      marginTop: 12,
    },
    statCard: {
      paddingHorizontal: 12,
    },
    statTitle: {
      fontSize: 12,
      color: t.secondaryText,
    },
    statValue: {
      fontSize: 16,
      fontWeight: '700',
      color: t.accent,
      marginTop: 3,
    },
    statChange: {
      fontSize: 12,
      marginTop: 2,
    },

    // 搜索条
    searchWrap: {
      padding: 16,
      paddingBottom: 8,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 25,
      backgroundColor: t.background,
      paddingHorizontal: 14,
      height: 44,
      shadowColor: t.accent,
      shadowOpacity: 0.15,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
      elevation: 3,
    },
    searchIcon: {
      fontSize: 14,
      color: t.secondaryText,
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: t.accent,
      padding: 0,
    },
    clearIcon: {
      fontSize: 16,
      color: t.accent,
      paddingHorizontal: 6,
    },

    // 排序表头
    columnTitles: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 6,
    },
    colCoin: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    colHoldings: {
      width: 90,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    colPrice: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    columnTitle: {
      fontSize: 12,
      color: t.secondaryText,
    },
    sortArrow: {
      fontSize: 11,
      color: t.secondaryText,
      marginLeft: 3,
    },
    refreshButton: {
      paddingLeft: 12,
    },
    refreshIcon: {
      fontSize: 18,
      color: t.accent,
    },

    // 行
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    rank: {
      width: 30,
      fontSize: 12,
      color: t.secondaryText,
    },
    logo: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: t.card,
    },
    symbolCol: {
      flex: 1,
      marginLeft: 6,
    },
    symbol: {
      fontSize: 15,
      fontWeight: '700',
      color: t.accent,
    },
    holdingsCaption: {
      fontSize: 12,
      color: t.secondaryText,
      marginTop: 2,
    },
    priceCol: {
      alignItems: 'flex-end',
    },
    price: {
      fontSize: 15,
      fontWeight: '700',
      color: t.accent,
    },
    change: {
      fontSize: 13,
      marginTop: 2,
    },

    // 持仓空态
    emptyPortfolio: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 30,
    },
    emptyPortfolioText: {
      textAlign: 'center',
      fontSize: 15,
      lineHeight: 24,
      color: t.secondaryText,
    },

    // 编辑持仓 sheet
    sheetContainer: {
      flex: 1,
      backgroundColor: t.background,
      paddingTop: 60,
      paddingHorizontal: 16,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    sheetClose: {
      fontSize: 20,
      color: t.link,
      width: 60,
    },
    sheetTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
      color: t.accent,
    },
    sheetRight: {
      width: 60,
      alignItems: 'flex-end',
    },
    saveText: {
      color: t.link,
      fontSize: 15,
      fontWeight: '700',
    },
    savedCheck: {
      color: t.green,
      fontSize: 18,
      fontWeight: '700',
    },
    logoRow: {
      flexGrow: 0,
      paddingVertical: 8,
    },
    logoCell: {
      width: 64,
      alignItems: 'center',
      marginRight: 10,
      padding: 6,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    logoCellSelected: {
      borderColor: t.green,
    },
    logoPick: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: t.card,
    },
    logoSymbol: {
      fontSize: 11,
      fontWeight: '600',
      color: t.accent,
      marginTop: 4,
    },
    pickHint: {
      marginTop: 20,
      textAlign: 'center',
      color: t.secondaryText,
      fontSize: 13,
    },
    editCard: {
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 16,
      marginTop: 12,
    },
    editPrice: {
      fontSize: 14,
      fontWeight: '600',
      color: t.accent,
    },
    editLabel: {
      fontSize: 12,
      color: t.secondaryText,
      marginTop: 14,
      marginBottom: 6,
    },
    editInput: {
      backgroundColor: t.bar,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 44,
      fontSize: 15,
      color: t.accent,
    },
    editValue: {
      fontSize: 20,
      fontWeight: '700',
      color: t.accent,
    },
    editHint: {
      fontSize: 11,
      color: t.secondaryText,
      marginTop: 12,
    },
  });

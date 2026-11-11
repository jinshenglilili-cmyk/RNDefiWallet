import { useCallback, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { t as tt } from '@/i18n';
import { useTheme } from '@/utils/theme';
import { useBscWallet } from '@/utils/defi/useBscWallet';
import { WBNB, tokenBySymbol } from '@/utils/defi/tokens';
import * as pancake from '@/utils/defi/pancake';
import { balanceOf } from '@/utils/defi/erc20';
import { formatTokenAmount } from '@/utils/defi/format';
import { DefiGuard, DefiHeader } from '@/components/defi/ui';

/** 候选交易对：WBNB 侧 + 代币侧（运行时经 Factory.getPair 确认存在才展示） */
const POOL_SYMBOLS = ['USDT', 'USDC', 'CAKE', 'ETH', 'BTCB'];

/**
 * LP Tab：PancakeSwap V2 流动性池子列表
 * - 池子列表：交易对、我的 LP 份额、池子规模（Factory/Pair 链上实时读）
 * - 点击池子卡片 → push 详情页（/defi/lp/[symbol]）做添加 / 移除流动性
 */
export default function LpTab() {
  const t = useTheme();
  const router = useRouter();
  const { session, hasAccount, address } = useBscWallet();
  const styles = makeStyles(t);

  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // 仅手动下拉时转圈（避免进页时刷新圈顶开内容导致闪动）

  const loadPools = useCallback(async () => {
    if (!address) {
      setPools([]);
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        POOL_SYMBOLS.map(async (sym) => {
          const token = tokenBySymbol(sym);
          const pair = await pancake.getPair(WBNB, token.address);
          if (!pair || BigInt(pair) === 0n) return null;
          const [[t0, t1], [res0, res1], totalSupply] = await Promise.all([
            pancake.pairTokens(pair),
            pancake.getReserves(pair),
            pancake.pairTotalSupply(pair),
          ]);
          // Pair 的 token0/token1 按地址排序，储备要对齐到「代币 / WBNB」两侧
          const tokenIs0 = t0.toLowerCase() === token.address.toLowerCase();
          const reserveToken = tokenIs0 ? res0 : res1;
          const reserveBnb = tokenIs0 ? res1 : res0;
          let myLp = 0n;
          try {
            myLp = await balanceOf(pair, address);
          } catch {}
          return {
            symbol: sym,
            pair,
            reserveToken,
            reserveBnb,
            myLp,
            share: totalSupply > 0n ? (myLp * 10000n) / totalSupply : 0n, // 万分比
          };
        })
      );
      setPools(
        results
          .filter((r) => r.status === 'fulfilled' && r.value)
          .map((r) => r.value)
      );
    } finally {
      setLoading(false);
    }
  }, [address]);

  useFocusEffect(
    useCallback(() => {
      loadPools();
    }, [loadPools])
  );

  /** 手动下拉刷新：只驱动 RefreshControl 的转圈，不影响页面其他状态 */
  async function onRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadPools();
    } finally {
      setRefreshing(false);
    }
  }

  const shownPools = pools.filter((p) => p.myLp > 0n).length > 0
    ? pools.filter((p) => p.myLp > 0n)
    : pools;

  return (
    <DefiGuard session={session} hasAccount={hasAccount}>
      <View style={styles.container}>
        <FlatList
          data={shownPools}
          keyExtractor={(item) => item.pair}
          // 与借贷/Swap 页一致：内容区 16pt 留白（标题与卡片左边对齐、顶部同样下沉）
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.secondaryText} />
          }
          ListHeaderComponent={
            <DefiHeader
              title={tt('defi.lp.headerTitle')}
              subtitle={tt('defi.lp.headerSubtitle')}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {loading ? tt('defi.lp.loadingPools') : tt('defi.lp.noPools')}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.poolCard}
              activeOpacity={0.7}
              // push 详情页做添加 / 移除流动性（带导航栏，返回可回列表）
              onPress={() =>
                router.push({ pathname: '/defi/lp/[symbol]', params: { symbol: item.symbol } })
              }
            >
              <View style={styles.poolTopRow}>
                <Text style={styles.poolName}>🥞 {item.symbol} / BNB</Text>
                {item.myLp > 0n ? (
                  <Text style={styles.myShareTag}>
                    {tt('defi.lp.myShare', { share: Number(item.share) / 100 })}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.poolReserve}>
                {tt('defi.lp.poolReserve', { bnb: formatTokenAmount(item.reserveBnb), token: formatTokenAmount(item.reserveToken), symbol: item.symbol })}
              </Text>
              {item.myLp > 0n ? (
                <Text style={styles.poolMine}>
                  {tt('defi.lp.myLp', { amount: formatTokenAmount(item.myLp, 18, 8) })}
                </Text>
              ) : (
                <Text style={styles.poolHint}>{tt('defi.lp.poolHint', { symbol: item.symbol })}</Text>
              )}
            </TouchableOpacity>
          )}
        />
      </View>
    </DefiGuard>
  );
}

const makeStyles = (t) => ({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  empty: {
    textAlign: 'center',
    color: t.secondaryText,
    fontSize: 13,
    marginTop: 40,
  },
  poolCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  poolTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poolName: {
    fontSize: 16,
    fontWeight: '700',
    color: t.accent,
  },
  myShareTag: {
    fontSize: 11,
    fontWeight: '600',
    color: t.green,
    backgroundColor: t.bar,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  poolReserve: {
    fontSize: 12,
    color: t.secondaryText,
    marginTop: 8,
  },
  poolMine: {
    fontSize: 12,
    fontWeight: '600',
    color: t.accent,
    marginTop: 4,
  },
  poolHint: {
    fontSize: 12,
    color: t.link,
    marginTop: 4,
  },
});

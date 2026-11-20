// 借款列表页：可借资产一览（Aave V3，从借贷 Tab 的「借款」入口 push 进入）

import { useCallback, useState } from 'react';
import {
  ScrollView,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';

import { t as tt } from '@/i18n';
import { useTheme } from '@/hooks/useTheme';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getTokens, tokenBySymbol, aaveWrappedAddress, net, wrappedSymbol } from '@/hooks/useDefiNetwork';
import * as aave from '@/utils/defi/aave';
import { formatTokenAmount } from '@/utils/format';
import { DefiGuard, DefiHeader } from '@/components/defi/ui';

/**
 * 可借资产符号（与存入同一份清单：排除 wrapped 侧，如 WBNB/WETH）。
 * 无活跃储备的代币（如 Sepolia 上的模拟币）会在加载时被 reserveTokens=0 过滤。
 */
const BORROW_SYMBOLS = () => getTokens().filter((tk) => !tk.wrapped).map((tk) => tk.symbol);

/**
 * 借款列表页：
 * - 可借额度 / 总负债 / 健康因子（账户级，USD 折算）
 * - 可借资产列表：每行展示钱包余额，点击 → push 借款详情页（/defi/borrow/[symbol]）
 */
export default function BorrowList() {
  const t = useTheme();
  const router = useRouter();
  const { session, hasAccount, address, bnbBalance, balances, network } = useUserInfo();
  const styles = makeStyles(t);

  const headerSubtitle = network === 'sepolia'
    ? tt('defi.common.testnetSubtitle', { dex: net().dexName, net: tt('defi.network.sepolia') })
    : tt('defi.lend.headerSubtitle', { net: tt(`defi.network.${net().id}`) });

  const [account, setAccount] = useState(null); // getUserAccountData 结果
  const [symbols, setSymbols] = useState(BORROW_SYMBOLS()); // 过滤掉无活跃储备后的清单
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!address) {
      setAccount(null);
      return;
    }
    setLoading(true);
    try {
      const [acc, reserves] = await Promise.all([
        aave.getUserAccountData(address).catch(() => null),
        Promise.allSettled(
          BORROW_SYMBOLS().map(async (sym) => {
            const token = tokenBySymbol(sym);
            const asset = token.native ? aaveWrappedAddress() : token.address; // 原生币用 Aave 储备里的 wrapped 资产
            const { aToken } = await aave.reserveTokens(asset);
            if (!aToken || BigInt(aToken) === 0n) return null; // 无活跃储备
            return sym;
          })
        ),
      ]);
      setAccount(acc);
      setSymbols(
        reserves
          .filter((r) => r.status === 'fulfilled' && r.value)
          .map((r) => r.value)
      );
    } finally {
      setLoading(false);
    }
    // 依赖 network：冷启动时网络配置是异步恢复的（默认 BSC → 恢复成设置里的网络），
    // 不依赖 network 的话 symbols 会停留在恢复前的清单，tokenBySymbol 找不到导致渲染崩溃
  }, [address, network]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  /** 手动下拉刷新：只驱动 RefreshControl 的转圈，不影响页面其他状态 */
  async function onRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }

  /** 健康因子颜色 */
  function hfColor(hf) {
    if (aave.isHealthFactorMax(hf)) return t.green;
    // 1e18 精度，与 1.2 / 1.5 比较
    if (hf < 12n * 10n ** 17n) return t.red;
    if (hf < 15n * 10n ** 17n) return t.orange;
    return t.green;
  }

  return (
    <DefiGuard session={session} hasAccount={hasAccount}>
      {/* 导航栏标题：借款 · Aave V3 */}
      <Stack.Screen options={{ title: `${tt('defi.lend.borrowSection')} · Aave V3` }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        stickyHeaderIndices={[0]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.secondaryText} />
        }
      >
        {/* 头部钉在顶部不随列表滚动；下拉刷新的转圈会出现在它上方（页面最顶） */}
        <View style={styles.headerWrap}>
          <DefiHeader title={tt('defi.lend.borrowSection')} subtitle={headerSubtitle} flush />
        </View>
        <View style={styles.body}>
        {/* 可借额度 / 总负债 / 健康因子 */}
        <View style={styles.card}>
          {account ? (
            <>
              <View style={styles.overviewRow}>
                <View style={styles.overviewCell}>
                  <Text style={styles.overviewLabel}>{tt('defi.lend.availableBorrowShort')}</Text>
                  <Text style={[styles.overviewValue, { color: t.accent }]}>
                    {aave.formatBaseAmount(account.availableBorrowsBase)}
                  </Text>
                </View>
                <View style={styles.overviewCell}>
                  <Text style={styles.overviewLabel}>{tt('defi.lend.totalDebt')}</Text>
                  <Text style={[styles.overviewValue, { color: t.accent }]}>
                    {aave.formatBaseAmount(account.totalDebtBase)}
                  </Text>
                </View>
                <View style={styles.overviewCell}>
                  <Text style={styles.overviewLabel}>{tt('defi.lend.healthFactor')}</Text>
                  <Text style={[styles.overviewValue, { color: hfColor(account.healthFactor) }]}>
                    {aave.formatHealthFactor(account.healthFactor)}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.emptyText}>
              {loading ? tt('defi.lend.loadingAccount') : tt('defi.lend.accountLoadFailed')}
            </Text>
          )}
        </View>

        {/* 可借资产列表：钱包余额，点击进借款详情 */}
        <Text style={styles.sectionTitle}>{tt('defi.lend.borrowAssets')}</Text>
        {symbols.map((sym) => {
          const token = tokenBySymbol(sym);
          if (!token) return null; // 网络恢复前的残留 symbol（如 BSC 的 BNB 在 Sepolia 清单里没有）
          return (
            <TouchableOpacity
              key={sym}
              style={styles.assetCard}
              activeOpacity={0.7}
              onPress={() =>
                router.push({ pathname: '/defi/borrow/[symbol]', params: { symbol: sym } })
              }
            >
              <Text style={{ fontSize: 22, marginRight: 12 }}>{token.icon}</Text>
              <View style={styles.depositInfo}>
                <Text style={styles.depositSymbol}>{sym}</Text>
                <Text style={styles.depositSub}>
                  {tt('defi.lend.balance', {
                    amount: token.native
                      ? (bnbBalance !== null ? formatTokenAmount(bnbBalance) : '…')
                      : (balances?.[sym] !== undefined ? formatTokenAmount(balances[sym], token.decimals) : '…'),
                  })}
                </Text>
              </View>
              <Text style={styles.depositHint}>{tt('defi.lend.borrowHint')}</Text>
            </TouchableOpacity>
          );
        })}

        <Text style={styles.tip}>
          {tt('defi.lend.borrowTip', { native: net().nativeSymbol, wrapped: wrappedSymbol() })}
        </Text>
        </View>
      </ScrollView>
    </DefiGuard>
  );
}

const makeStyles = (t) => ({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: t.background,
  },
  body: {
    padding: 16,
    paddingBottom: 40,
  },
  content: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: t.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: t.accent,
    marginBottom: 10,
  },
  overviewRow: {
    flexDirection: 'row',
  },
  overviewCell: {
    flex: 1,
    alignItems: 'center',
  },
  overviewLabel: {
    fontSize: 11,
    color: t.secondaryText,
    marginBottom: 4,
  },
  overviewValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 13,
    color: t.secondaryText,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  depositInfo: {
    flex: 1,
  },
  depositSymbol: {
    fontSize: 15,
    fontWeight: '700',
    color: t.accent,
  },
  depositSub: {
    fontSize: 12,
    color: t.secondaryText,
    marginTop: 2,
  },
  assetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  depositHint: {
    fontSize: 12,
    fontWeight: '600',
    color: t.link,
  },
  tip: {
    fontSize: 11,
    color: t.secondaryText,
    lineHeight: 18,
    marginTop: 20,
  },
});

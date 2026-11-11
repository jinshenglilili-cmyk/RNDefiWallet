import { useCallback, useState } from 'react';
import {
  ScrollView,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { t as tt } from '@/i18n';
import { useTheme } from '@/utils/theme';
import { useBscWallet } from '@/utils/defi/useBscWallet';
import { getTokens, tokenBySymbol, aaveWrappedAddress, net, wrappedSymbol } from '@/utils/defi/tokens';
import * as aave from '@/utils/defi/aave';
import { balanceOf } from '@/utils/defi/erc20';
import { formatTokenAmount } from '@/utils/defi/format';
import { DefiGuard, DefiHeader } from '@/components/defi/ui';

/**
 * 可存资产符号（按当前网络的代币清单推导：排除 wrapped 侧，如 WBNB/WETH）。
 * 无活跃储备的代币（如 Sepolia 上的模拟币）会在加载时被 reserveTokens=0 过滤。
 */
const LEND_SYMBOLS = () => getTokens().filter((t) => !t.wrapped).map((t) => t.symbol);

/**
 * 借贷 Tab：Aave V3（BSC）存币生息
 * - 账户总览：总抵押 / 总负债（USD）、健康因子（<1.2 红 / <1.5 橙 / 其余绿）
 * - 资产列表（合并「我的存款」与「存入资产」）：每行展示钱包余额，
 *   已有存款的资产右侧显示存款数量（≈USD 估值），点击 → push 详情页（/defi/lend/[symbol]）
 * - 借款暂未开放（只展示负债，不提供借款入口）
 */
export default function LendTab() {
  const t = useTheme();
  const router = useRouter();
   const { session, hasAccount, address, bnbBalance, balances, network, refresh } = useBscWallet();
  const styles = makeStyles(t);

  const headerSubtitle = network === 'sepolia'
    ? tt('defi.common.testnetSubtitle', { dex: net().dexName, net: tt('defi.network.sepolia') })
    : tt('defi.lend.headerSubtitle');

  const [account, setAccount] = useState(null); // getUserAccountData 结果
  const [deposits, setDeposits] = useState([]); // [{ symbol, token, amount, price }]
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // 仅手动下拉时转圈（避免进页时刷新圈顶开内容导致闪动）

  const loadData = useCallback(async () => {
    if (!address) {
      setAccount(null);
      setDeposits([]);
      return;
    }
    setLoading(true);
    try {
      const symbols = LEND_SYMBOLS();
      const [acc, depResults] = await Promise.all([
        aave.getUserAccountData(address).catch(() => null),
        Promise.allSettled(
          symbols.map(async (sym) => {
            const token = tokenBySymbol(sym);
            const asset = token.native ? aaveWrappedAddress() : token.address; // 原生币用 Aave 储备里的 wrapped 资产
            const { aToken } = await aave.reserveTokens(asset);
            if (!aToken || BigInt(aToken) === 0n) return null; // 无活跃储备
            const [amount, price] = await Promise.all([
              balanceOf(aToken, address),
              aave.assetPrice(asset),
            ]);
            return { symbol: sym, token, amount, price };
          })
        ),
      ]);
      setAccount(acc);
      setDeposits(
        depResults
          .filter((r) => r.status === 'fulfilled' && r.value)
          .map((r) => r.value)
      );
    } finally {
      setLoading(false);
    }
  }, [address]);

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

  /** 存款估值（价格 8 位精度 × 数量 18 位精度 → USD） */
  function depositUsd(row) {
    return (row.amount * row.price) / 10n ** 18n; // 8 位精度 USD
  }

  return (
    <DefiGuard session={session} hasAccount={hasAccount}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.secondaryText} />
        }
      >
        <DefiHeader title={tt('defi.lend.headerTitle')} subtitle={headerSubtitle} />

        {/* 账户总览 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{tt('defi.lend.accountOverview')}</Text>
          {account ? (
            <>
              <View style={styles.overviewRow}>
                <View style={styles.overviewCell}>
                  <Text style={styles.overviewLabel}>{tt('defi.lend.totalCollateral')}</Text>
                  <Text style={[styles.overviewValue, { color: t.accent }]}>
                    {aave.formatBaseAmount(account.totalCollateralBase)}
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
              <Text style={styles.hfHint}>
                {tt('defi.lend.hfHint', { threshold: Number(account.currentLiquidationThreshold) / 100 })}
              </Text>
            </>
          ) : (
            <Text style={styles.emptyText}>
              {loading ? tt('defi.lend.loadingAccount') : tt('defi.lend.accountLoadFailed')}
            </Text>
          )}
        </View>

        {/* 资产列表：钱包余额 + 已有存款数量（原「我的存款」「存入资产」两个模块合并） */}
        <Text style={styles.sectionTitle}>{tt('defi.lend.supplyAssets')}</Text>
        {LEND_SYMBOLS().map((sym) => {
          const token = tokenBySymbol(sym);
          const row = deposits.find((d) => d.symbol === sym);
          const hasDeposit = row && row.amount > 0n;
          return (
            <TouchableOpacity
              key={sym}
              style={styles.assetCard}
              activeOpacity={0.7}
              onPress={() =>
                router.push({ pathname: '/defi/lend/[symbol]', params: { symbol: sym } })
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
                  {hasDeposit ? `\n≈ ${aave.formatBaseAmount(depositUsd(row))}` : ''}
                </Text>
              </View>
              {hasDeposit ? (
                <View style={styles.depositRight}>
                  <Text style={styles.depositAmount}>{formatTokenAmount(row.amount, token.decimals)}</Text>
                  <Text style={styles.depositHint}>{tt('defi.lend.appendOrWithdraw')}</Text>
                </View>
              ) : (
                <Text style={styles.depositHint}>{tt('defi.lend.supplyHint')}</Text>
              )}
            </TouchableOpacity>
          );
        })}

        <Text style={styles.tip}>
          {tt('defi.lend.tip', { native: net().nativeSymbol, wrapped: wrappedSymbol() })}
        </Text>
      </ScrollView>
    </DefiGuard>
  );
}

const makeStyles = (t) => ({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
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
  hfHint: {
    fontSize: 11,
    color: t.secondaryText,
    marginTop: 10,
    lineHeight: 16,
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
  depositRight: {
    alignItems: 'flex-end',
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
  depositAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: t.accent,
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

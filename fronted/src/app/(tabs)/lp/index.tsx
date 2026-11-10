import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import * as walletStore from '@/utils/walletStore';
import { useTheme } from '@/utils/theme';
import { useBscWallet } from '@/utils/defi/useBscWallet';
import { PANCAKE_ROUTER, WBNB, tokenBySymbol } from '@/utils/defi/tokens';
import * as pancake from '@/utils/defi/pancake';
import { balanceOf } from '@/utils/defi/erc20';
import { applySlippage, formatTokenAmount, parseTokenAmount } from '@/utils/defi/format';
import { assertSigningAccount, ensureApproval, signAndSendWithReceipt } from '@/utils/defi/txSender';
import { DefiGuard, DefiHeader, recordDefiTx } from '@/components/defi/ui';

/** 候选交易对：WBNB 侧 + 代币侧（运行时经 Factory.getPair 确认存在才展示） */
const POOL_SYMBOLS = ['USDT', 'USDC', 'CAKE', 'ETH', 'BTCB'];

/**
 * LP Tab：PancakeSwap V2 添加 / 移除流动性（BNB 侧走 Router 的 ETH 接口）
 * - 池子列表：交易对、我的 LP 份额、池子规模（Factory/Pair 链上实时读）
 * - 添加：输入代币数量，按储备比例自动搭配 BNB，先授权 Router 再 addLiquidityETH
 * - 移除：输入 LP 数量（支持百分比），先授权 LP 再 removeLiquidityETH
 */
export default function LpTab() {
  const t = useTheme();
  const { session, meta, hasAccount, address, bnbBalance, balances, refresh } = useBscWallet();
  const styles = makeStyles(t);

  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // 仅手动下拉时转圈（避免进页时刷新圈顶开内容导致闪动）
  const [selected, setSelected] = useState(null); // 选中的池子对象
  const [tokenAmount, setTokenAmount] = useState('');
  const [lpAmount, setLpAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');

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
            token,
            pair,
            reserveToken,
            reserveBnb,
            totalSupply,
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

  async function handleAdd(pool) {
    try {
      setBusy(true);
      const from = await assertSigningAccount(meta);
      const tokenAmt = parseTokenAmount(tokenAmount, 18);
      if (tokenAmt <= 0n) throw new Error('请输入代币数量');
      // Router.quote 按储备比例算需要的 BNB（+1 防止整数截断导致 dust 不足）
      const bnbNeeded = (await pancake.quote(tokenAmt, pool.reserveToken, pool.reserveBnb)) + 1n;
      const gasReserve = 10n ** 16n; // 预留 0.01 BNB 作 gas
      if (bnbBalance === null || bnbBalance < bnbNeeded + gasReserve) {
        throw new Error('BNB 余额不足（含 gas 预留 0.01 BNB）');
      }
      const tokenMin = applySlippage(tokenAmt, 0.5);
      const bnbMin = applySlippage(bnbNeeded, 0.5);
      const mnemonic = await walletStore.getSigningMnemonic(address, meta.current);

      setBusyText('授权 Router…');
      await ensureApproval({
        tokenAddress: pool.token.address,
        owner: address,
        spender: PANCAKE_ROUTER,
        amountWei: tokenAmt,
        mnemonic,
      });

      setBusyText('签名广播中…');
      const data = pancake.addLiquidityETHData(
        pool.token.address, tokenAmt, tokenMin, bnbMin, address, pancake.defaultDeadline()
      );
      const record = await recordDefiTx(walletStore, {
        from: address,
        to: pool.pair,
        amount: `${tokenAmount} ${pool.symbol} + ${formatTokenAmount(bnbNeeded)} BNB`,
        status: '处理中',
      });
      const { txHash, receipt } = await signAndSendWithReceipt({
        to: PANCAKE_ROUTER, data, valueWei: bnbNeeded, from, mnemonic,
      });
      const ok = !receipt || receipt.status === '0x1';
      await walletStore.updateTransaction(record.id, {
        status: ok ? '成功' : '失败',
        txHash,
        error: ok ? undefined : '合约执行失败（revert）',
      });
      Alert.alert(ok ? '添加成功' : '添加失败', `交易哈希：\n${txHash}`);
      setSelected(null);
      setTokenAmount('');
      await loadPools();
      refresh();
    } catch (err) {
      Alert.alert('添加流动性失败', String(err.message ?? err));
    } finally {
      setBusy(false);
      setBusyText('');
    }
  }

  async function handleRemove(pool) {
    try {
      setBusy(true);
      const from = await assertSigningAccount(meta);
      const liquidity = parseTokenAmount(lpAmount, 18);
      if (liquidity <= 0n) throw new Error('请输入要移除的 LP 数量');
      if (liquidity > pool.myLp) throw new Error('超过持有的 LP 数量');
      // 按份额预估取回量，乘滑点作下限
      const tokenOut = (liquidity * pool.reserveToken) / pool.totalSupply;
      const bnbOut = (liquidity * pool.reserveBnb) / pool.totalSupply;
      const tokenMin = applySlippage(tokenOut, 0.5);
      const bnbMin = applySlippage(bnbOut, 0.5);
      const mnemonic = await walletStore.getSigningMnemonic(address, meta.current);

      setBusyText('授权 LP Token…');
      await ensureApproval({
        tokenAddress: pool.pair,
        owner: address,
        spender: PANCAKE_ROUTER,
        amountWei: liquidity,
        mnemonic,
      });

      setBusyText('签名广播中…');
      const data = pancake.removeLiquidityETHData(
        pool.token.address, liquidity, tokenMin, bnbMin, address, pancake.defaultDeadline()
      );
      const record = await recordDefiTx(walletStore, {
        from: address,
        to: pool.pair,
        amount: `${lpAmount} LP (${pool.symbol}/BNB)`,
        status: '处理中',
      });
      const { txHash, receipt } = await signAndSendWithReceipt({
        to: PANCAKE_ROUTER, data, valueWei: 0n, from, mnemonic,
      });
      const ok = !receipt || receipt.status === '0x1';
      await walletStore.updateTransaction(record.id, {
        status: ok ? '成功' : '失败',
        txHash,
        error: ok ? undefined : '合约执行失败（revert）',
      });
      Alert.alert(ok ? '移除成功' : '移除失败', `交易哈希：\n${txHash}`);
      setSelected(null);
      setLpAmount('');
      await loadPools();
      refresh();
    } catch (err) {
      Alert.alert('移除流动性失败', String(err.message ?? err));
    } finally {
      setBusy(false);
      setBusyText('');
    }
  }

  /** 添加数量 → 预计搭配的 BNB 文案 */
  function pairHintText(pool) {
    if (!tokenAmount || Number(tokenAmount) <= 0) return '输入代币数量后自动计算';
    try {
      const amt = parseTokenAmount(tokenAmount, 18);
      return ` ${formatTokenAmount((amt * pool.reserveBnb) / pool.reserveToken)} BNB`;
    } catch {
      return ' —';
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
              title="LP 流动性"
              subtitle="PancakeSwap V2 · BSC 链 · 添加 / 移除流动性"
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {loading ? '加载池子中…' : '没有可用池子或加载失败，下拉重试'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.poolCard}
              activeOpacity={0.7}
              onPress={() => {
                setSelected(item);
                setTokenAmount('');
                setLpAmount('');
              }}
            >
              <View style={styles.poolTopRow}>
                <Text style={styles.poolName}>🥞 {item.symbol} / BNB</Text>
                {item.myLp > 0n ? (
                  <Text style={styles.myShareTag}>
                    我的份额 {Number(item.share) / 100}%
                  </Text>
                ) : null}
              </View>
              <Text style={styles.poolReserve}>
                池子：{formatTokenAmount(item.reserveBnb)} BNB + {formatTokenAmount(item.reserveToken)} {item.symbol}
              </Text>
              {item.myLp > 0n ? (
                <Text style={styles.poolMine}>
                  我的 LP：{formatTokenAmount(item.myLp, 18, 8)}
                </Text>
              ) : (
                <Text style={styles.poolHint}>点击添加流动性（BNB + {item.symbol}）</Text>
              )}
            </TouchableOpacity>
          )}
        />

        {/* 池子操作 sheet（添加 + 移除两个动作） */}
        {selected ? (
          <View style={styles.sheetMask}>
            <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.sheetHeader}>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text style={styles.sheetClose}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>{selected.symbol} / BNB</Text>
                <View style={{ width: 40 }} />
              </View>

              <Text style={styles.sectionTitle}>添加流动性</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={tokenAmount}
                  onChangeText={setTokenAmount}
                  placeholder={`${selected.symbol} 数量`}
                  placeholderTextColor={t.secondaryText}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.inputSuffix}>{selected.symbol}</Text>
              </View>
              <Text style={styles.pairHint}>预计搭配：{pairHintText(selected)}</Text>
              <Text style={styles.balanceText}>
                代币余额：{formatTokenAmount(balances?.[selected.symbol] ?? 0n)}
              </Text>
              <TouchableOpacity
                style={[styles.actionButton, (!tokenAmount || busy) && styles.disabled]}
                disabled={!tokenAmount || busy}
                onPress={() => handleAdd(selected)}
              >
                <Text style={styles.actionText}>{busy ? busyText : '添加流动性'}</Text>
              </TouchableOpacity>

              {selected.myLp > 0n ? (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 24 }]}>移除流动性</Text>
                  <View style={styles.percentRow}>
                    {[25, 50, 75, 100].map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={styles.percentCell}
                        onPress={() =>
                          setLpAmount(formatTokenAmount((selected.myLp * BigInt(p)) / 100n, 18, 8))
                        }
                      >
                        <Text style={styles.percentText}>{p}%</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      value={lpAmount}
                      onChangeText={setLpAmount}
                      placeholder="LP 数量"
                      placeholderTextColor={t.secondaryText}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.inputSuffix}>LP</Text>
                  </View>
                  <Text style={styles.balanceText}>
                    我的 LP：{formatTokenAmount(selected.myLp, 18, 8)}
                  </Text>
                  <TouchableOpacity
                    style={[styles.removeButton, (!lpAmount || busy) && styles.disabled]}
                    disabled={!lpAmount || busy}
                    onPress={() => handleRemove(selected)}
                  >
                    <Text style={styles.actionText}>{busy ? busyText : '移除流动性'}</Text>
                  </TouchableOpacity>
                </>
              ) : null}

              <Text style={styles.tip}>
                添加按当前池子比例自动搭配 BNB；移除按 LP 份额取回两种代币。
                数量下限按 0.5% 滑点保护。首次操作需要一笔授权交易（approve）。
              </Text>
            </ScrollView>
          </View>
        ) : null}
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

  // sheet
  sheetMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.background,
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetClose: {
    fontSize: 20,
    color: t.link,
    width: 40,
  },
  sheetTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: t.accent,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: t.accent,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 12,
    paddingRight: 12,
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
    color: t.accent,
  },
  inputSuffix: {
    fontSize: 13,
    fontWeight: '600',
    color: t.secondaryText,
  },
  pairHint: {
    fontSize: 12,
    color: t.link,
    marginTop: 8,
  },
  balanceText: {
    fontSize: 12,
    color: t.secondaryText,
    marginTop: 4,
    marginBottom: 12,
  },
  actionButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: t.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: t.red,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    color: t.background,
    fontSize: 15,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.35,
  },
  percentRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  percentCell: {
    flex: 1,
    height: 32,
    borderRadius: 10,
    backgroundColor: t.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  percentText: {
    fontSize: 13,
    color: t.accent,
    fontWeight: '600',
  },
  tip: {
    fontSize: 11,
    color: t.secondaryText,
    lineHeight: 18,
    marginTop: 20,
  },
});

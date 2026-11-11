// LP 详情页：单一交易对的添加 / 移除流动性（从 LP Tab 点池子卡片 push 进入，带导航栏）

import { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { t as tt } from '@/i18n';
import * as walletStore from '@/utils/walletStore';
import { useTheme } from '@/utils/theme';
import { useBscWallet } from '@/utils/defi/useBscWallet';
import { net, wrappedAddress, tokenBySymbol } from '@/utils/defi/tokens';
import * as pancake from '@/utils/defi/pancake';
import { balanceOf } from '@/utils/defi/erc20';
import { applySlippage, formatTokenAmount, parseTokenAmount } from '@/utils/defi/format';
import { assertSigningAccount, ensureApproval, signAndSendWithReceipt } from '@/utils/defi/txSender';
import { DefiGuard, recordDefiTx } from '@/components/defi/ui';

/**
 * LP 详情页：添加 / 移除流动性（原生币侧走 Router 的 ETH 接口）
 * - 数据按 URL 参数的 symbol 链上实时读（Pool 储备 / 我的 LP 份额）
 * - 添加：输入代币数量，按储备比例自动搭配原生币，先授权 Router 再 addLiquidityETH
 * - 移除：输入 LP 数量（支持百分比），先授权 LP 再 removeLiquidityETH
 */
export default function LpDetail() {
  const params = useLocalSearchParams();
  const symbol = String(Array.isArray(params.symbol) ? params.symbol[0] : params.symbol || '');
  const token = tokenBySymbol(symbol);
  const nativeSymbol = net().nativeSymbol;
  const t = useTheme();
  const { session, meta, hasAccount, address, bnbBalance, balances, refresh } = useBscWallet();
  const styles = makeStyles(t);

  const [pool, setPool] = useState(null); // 单个池子数据（结构同 LP Tab）
  const [loading, setLoading] = useState(false);
  const [tokenAmount, setTokenAmount] = useState('');
  const [lpAmount, setLpAmount] = useState('');
  // 两个操作的 busy 状态独立（操作互不阻塞对方的按钮显示）
  const [addBusy, setAddBusy] = useState(false);
  const [addText, setAddText] = useState('');
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeText, setRemoveText] = useState('');

  const loadPool = useCallback(async () => {
    if (!address || !token) {
      setPool(null);
      return;
    }
    setLoading(true);
    try {
      const pair = await pancake.getPair(wrappedAddress(), token.address);
      if (!pair || BigInt(pair) === 0n) {
        setPool(null);
        return;
      }
      const [[t0, t1], [res0, res1], totalSupply] = await Promise.all([
        pancake.pairTokens(pair),
        pancake.getReserves(pair),
        pancake.pairTotalSupply(pair),
      ]);
      // Pair 的 token0/token1 按地址排序，储备要对齐到「代币 / wrapped」两侧
      const tokenIs0 = t0.toLowerCase() === token.address.toLowerCase();
      setPool({
        symbol,
        token,
        pair,
        reserveToken: tokenIs0 ? res0 : res1,
        reserveBnb: tokenIs0 ? res1 : res0,
        totalSupply,
        myLp: await balanceOf(pair, address).catch(() => 0n),
      });
    } finally {
      setLoading(false);
    }
  }, [address, symbol]);

  useFocusEffect(
    useCallback(() => {
      loadPool();
    }, [loadPool])
  );

  /** 添加流动性：approve Router → addLiquidityETH */
  async function handleAdd() {
    try {
      setAddBusy(true);
      const router = net().router;
      const from = await assertSigningAccount(meta);
      const tokenAmt = parseTokenAmount(tokenAmount, token.decimals);
      if (tokenAmt <= 0n) throw new Error(tt('defi.lp.needTokenAmount'));
      // Router.quote 按储备比例算需要的原生币（+1 防止整数截断导致 dust 不足）
      const bnbNeeded = (await pancake.quote(tokenAmt, pool.reserveToken, pool.reserveBnb)) + 1n;
      const gasReserve = 10n ** 16n; // 预留 0.01 原生币作 gas
      if (bnbBalance === null || bnbBalance < bnbNeeded + gasReserve) {
        throw new Error(tt('defi.lp.insufficientBnb', { native: nativeSymbol }));
      }
      const tokenMin = applySlippage(tokenAmt, 0.5);
      const bnbMin = applySlippage(bnbNeeded, 0.5);
      const sign = await walletStore.getSigningCredential(address);

      setAddText(tt('defi.lp.busyApprovingRouter'));
      await ensureApproval({
        tokenAddress: token.address,
        owner: address,
        spender: router,
        amountWei: tokenAmt,
        sign,
      });

      setAddText(tt('defi.lp.busySigning'));
      const data = pancake.addLiquidityETHData(
        token.address, tokenAmt, tokenMin, bnbMin, address, pancake.defaultDeadline()
      );
      const record = await recordDefiTx(walletStore, {
        from: address,
        to: pool.pair,
        amount: `${tokenAmount} ${symbol} + ${formatTokenAmount(bnbNeeded)} ${nativeSymbol}`,
        status: tt('common.processing'),
      });
      const { txHash, receipt } = await signAndSendWithReceipt({
        to: router, data, valueWei: bnbNeeded, from, sign, method: 'addLiquidityETH',
      });
      const ok = !receipt || receipt.status === '0x1';
      await walletStore.updateTransaction(record.id, {
        status: ok ? tt('common.success') : tt('common.failed'),
        txHash,
        error: ok ? undefined : tt('defi.common.revert'),
      });
      Alert.alert(ok ? tt('defi.lp.addSuccess') : tt('defi.lp.addFailed'), tt('defi.common.txHashAlert', { hash: txHash }));
      setTokenAmount('');
      await loadPool();
      refresh();
    } catch (err) {
      Alert.alert(tt('defi.lp.addErrorTitle'), String(err.message ?? err));
    } finally {
      setAddBusy(false);
      setAddText('');
    }
  }

  /** 移除流动性：approve LP → removeLiquidityETH */
  async function handleRemove() {
    try {
      setRemoveBusy(true);
      const router = net().router;
      const from = await assertSigningAccount(meta);
      const liquidity = parseTokenAmount(lpAmount, 18);
      if (liquidity <= 0n) throw new Error(tt('defi.lp.needLpAmount'));
      if (liquidity > pool.myLp) throw new Error(tt('defi.lp.lpExceeded'));
      // 按份额预估取回量，乘滑点作下限
      const tokenOut = (liquidity * pool.reserveToken) / pool.totalSupply;
      const bnbOut = (liquidity * pool.reserveBnb) / pool.totalSupply;
      const tokenMin = applySlippage(tokenOut, 0.5);
      const bnbMin = applySlippage(bnbOut, 0.5);
      const sign = await walletStore.getSigningCredential(address);

      setRemoveText(tt('defi.lp.busyApprovingLp'));
      await ensureApproval({
        tokenAddress: pool.pair,
        owner: address,
        spender: router,
        amountWei: liquidity,
        sign,
      });

      setRemoveText(tt('defi.lp.busySigning'));
      const data = pancake.removeLiquidityETHData(
        token.address, liquidity, tokenMin, bnbMin, address, pancake.defaultDeadline()
      );
      const record = await recordDefiTx(walletStore, {
        from: address,
        to: pool.pair,
        amount: `${lpAmount} LP (${symbol}/${nativeSymbol})`,
        status: tt('common.processing'),
      });
      const { txHash, receipt } = await signAndSendWithReceipt({
        to: router, data, valueWei: 0n, from, sign, method: 'removeLiquidityETH',
      });
      const ok = !receipt || receipt.status === '0x1';
      await walletStore.updateTransaction(record.id, {
        status: ok ? tt('common.success') : tt('common.failed'),
        txHash,
        error: ok ? undefined : tt('defi.common.revert'),
      });
      Alert.alert(ok ? tt('defi.lp.removeSuccess') : tt('defi.lp.removeFailed'), tt('defi.common.txHashAlert', { hash: txHash }));
      setLpAmount('');
      await loadPool();
      refresh();
    } catch (err) {
      Alert.alert(tt('defi.lp.removeErrorTitle'), String(err.message ?? err));
    } finally {
      setRemoveBusy(false);
      setRemoveText('');
    }
  }

  /** 添加数量 → 预计搭配的原生币文案 */
  function pairHintText() {
    if (!tokenAmount || Number(tokenAmount) <= 0) return tt('defi.lp.pairHintAuto');
    try {
      const amt = parseTokenAmount(tokenAmount, token.decimals);
      // 小数量对应的搭配量也很小，完整精度显示避免四舍五入成 0
      return tt('defi.lp.pairHintValue', {
        amount: formatTokenAmount((amt * pool.reserveBnb) / pool.reserveToken, 18, 18),
        native: nativeSymbol,
      });
    } catch {
      return ' —';
    }
  }

  return (
    <DefiGuard session={session} hasAccount={hasAccount}>
      {/* 导航栏标题：交易对名（语言无关） */}
      <Stack.Screen options={{ title: token ? `${symbol} / ${nativeSymbol}` : tt('defi.lp.detailTitle') }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {!token || !pool ? (
          <Text style={styles.empty}>
            {loading ? tt('defi.lp.loadingPools') : tt('defi.lp.noPools')}
          </Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>{tt('defi.lp.addSection')}</Text>
            <Text style={styles.poolReserve}>
              {tt('defi.lp.poolReserve', { bnb: formatTokenAmount(pool.reserveBnb), token: formatTokenAmount(pool.reserveToken, token.decimals), symbol, native: nativeSymbol })}
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={tokenAmount}
                onChangeText={setTokenAmount}
                placeholder={tt('defi.lp.tokenAmountPlaceholder', { symbol })}
                placeholderTextColor={t.secondaryText}
                keyboardType="decimal-pad"
              />
              <Text style={styles.inputSuffix}>{symbol}</Text>
            </View>
            <Text style={styles.pairHint}>{tt('defi.lp.pairHint', { hint: pairHintText() })}</Text>
            <Text style={styles.balanceText}>
              {tt('defi.lp.tokenBalance', { amount: formatTokenAmount(balances?.[symbol] ?? 0n, token.decimals) })}
            </Text>
            <TouchableOpacity
              style={[styles.actionButton, (!tokenAmount || addBusy) && styles.disabled]}
              disabled={!tokenAmount || addBusy}
              onPress={handleAdd}
            >
              <Text style={styles.actionText}>{addBusy ? addText : tt('defi.lp.addSection')}</Text>
            </TouchableOpacity>

            {pool.myLp > 0n ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{tt('defi.lp.removeSection')}</Text>
                <View style={styles.percentRow}>
                  {[25, 50, 75, 100].map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={styles.percentCell}
                      onPress={() =>
                        setLpAmount(formatTokenAmount((pool.myLp * BigInt(p)) / 100n, 18, 8))
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
                    placeholder={tt('defi.lp.lpAmountPlaceholder')}
                    placeholderTextColor={t.secondaryText}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.inputSuffix}>LP</Text>
                </View>
                <Text style={styles.balanceText}>
                  {tt('defi.lp.myLp', { amount: formatTokenAmount(pool.myLp, 18, 8) })}
                </Text>
                <TouchableOpacity
                  style={[styles.removeButton, (!lpAmount || removeBusy) && styles.disabled]}
                  disabled={!lpAmount || removeBusy}
                  onPress={handleRemove}
                >
                  <Text style={styles.actionText}>{removeBusy ? removeText : tt('defi.lp.removeSection')}</Text>
                </TouchableOpacity>
              </>
            ) : null}

            <Text style={styles.tip}>
              {tt('defi.lp.tip', { native: nativeSymbol })}
            </Text>
          </>
        )}
      </ScrollView>
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: t.accent,
    marginBottom: 10,
  },
  poolReserve: {
    fontSize: 12,
    color: t.secondaryText,
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

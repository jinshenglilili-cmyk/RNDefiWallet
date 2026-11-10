import { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { t as tt } from '@/i18n';
import * as walletStore from '@/utils/walletStore';
import { useTheme } from '@/utils/theme';
import { useBscWallet } from '@/utils/defi/useBscWallet';
import { AAVE_POOL, WBNB, tokenBySymbol } from '@/utils/defi/tokens';
import * as aave from '@/utils/defi/aave';
import { balanceOf, wbnbDepositData, wbnbWithdrawData } from '@/utils/defi/erc20';
import { formatTokenAmount, parseTokenAmount } from '@/utils/defi/format';
import { assertSigningAccount, ensureApproval, signAndSendWithReceipt } from '@/utils/defi/txSender';
import { DefiGuard, DefiHeader, recordDefiTx } from '@/components/defi/ui';

/**
 * 借贷资产清单（BSC 上有活跃储备的；DAI 在 BSC 无活跃储备故排除）
 * BNB 特殊：存入前先 WBNB.deposit 包装，取回后 WBNB.withdraw 解包
 */
const LEND_SYMBOLS = ['BNB', 'USDT', 'USDC', 'ETH', 'BTCB', 'CAKE'];

/**
 * 借贷 Tab：Aave V3（BSC）存币生息
 * - 账户总览：总抵押 / 总负债（USD）、健康因子（<1.2 红 / <1.5 橙 / 其余绿）
 * - 我的存款：各资产 aToken 余额（链上实时读）
 * - 存入：approve → Pool.supply（BNB 先 wrap 成 WBNB）
 * - 取回：Pool.withdraw（BNB 再 unwrap）
 * - 借款暂未开放（只展示负债，不提供借款入口）
 */
export default function LendTab() {
  const t = useTheme();
  const { session, meta, hasAccount, address, bnbBalance, balances, refresh } = useBscWallet();
  const styles = makeStyles(t);

  const [account, setAccount] = useState(null); // getUserAccountData 结果
  const [deposits, setDeposits] = useState([]); // [{ symbol, token, asset, aToken, amount, price }]
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // 仅手动下拉时转圈（避免进页时刷新圈顶开内容导致闪动）
  const [selected, setSelected] = useState(null); // 选中的资产行
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');

  const loadData = useCallback(async () => {
    if (!address) {
      setAccount(null);
      setDeposits([]);
      return;
    }
    setLoading(true);
    try {
      const [acc, depResults] = await Promise.all([
        aave.getUserAccountData(address).catch(() => null),
        Promise.allSettled(
          LEND_SYMBOLS.map(async (sym) => {
            const token = tokenBySymbol(sym);
            const asset = token.native ? WBNB : token.address; // BNB 用 WBNB 作储备资产
            const { aToken } = await aave.reserveTokens(asset);
            if (!aToken || BigInt(aToken) === 0n) return null; // 无活跃储备
            const [amount, price] = await Promise.all([
              balanceOf(aToken, address),
              aave.assetPrice(asset),
            ]);
            return { symbol: sym, token, asset, aToken, amount, price };
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

  async function handleSupply(row) {
    try {
      setBusy(true);
      const from = await assertSigningAccount(meta);
      const amt = parseTokenAmount(amount, 18);
      if (amt <= 0n) throw new Error(tt('defi.lend.needAmount'));
      const isNative = row.token.native;
      // BNB：预留 gas 后再 wrap
      const gasReserve = 10n ** 16n;
      const available = isNative && bnbBalance !== null ? bnbBalance - gasReserve : bnbBalance;
      const bal = isNative ? available : balances?.[row.symbol];
      if (bal === null || bal === undefined || bal < amt) {
        throw new Error(isNative
          ? tt('defi.lend.insufficientBalanceNative', { symbol: row.symbol })
          : tt('defi.lend.insufficientBalance', { symbol: row.symbol }));
      }
      const mnemonic = await walletStore.getSigningMnemonic(address, meta.current);

      // BNB 特殊流程：wrap → approve → supply；其他代币：approve → supply
      const steps = [];
      if (isNative) steps.push({ label: tt('defi.lend.stepWrap'), to: WBNB, data: wbnbDepositData(), valueWei: amt });
      steps.push({ label: tt('defi.lend.stepApprove', { symbol: row.symbol }), approve: row.asset, amountWei: amt });
      steps.push({ label: tt('defi.lend.stepSupply'), to: AAVE_POOL, data: aave.supplyData(row.asset, amt, address), valueWei: 0n });

      const record = await recordDefiTx(walletStore, {
        from: address,
        to: AAVE_POOL,
        amount: tt('defi.lend.recordSupply', { amount, symbol: row.symbol }),
        status: tt('common.processing'),
      });
      let lastHash = '';
      let ok = true;
      for (const step of steps) {
        setBusyText(step.label);
        let txHash;
        if (step.approve) {
          const res = await ensureApproval({
            tokenAddress: step.approve,
            owner: address,
            spender: AAVE_POOL,
            amountWei: step.amountWei,
            mnemonic,
          });
          txHash = res.txHash ?? '';
        } else {
          const res = await signAndSendWithReceipt({
            to: step.to, data: step.data, valueWei: step.valueWei ?? 0n, from, mnemonic,
          });
          txHash = res.txHash;
          if (res.receipt && res.receipt.status !== '0x1') ok = false;
        }
        if (txHash) lastHash = txHash;
        if (!ok) break;
      }
      await walletStore.updateTransaction(record.id, {
        status: ok ? tt('common.success') : tt('common.failed'),
        txHash: lastHash,
        error: ok ? undefined : tt('defi.common.revert'),
      });
      Alert.alert(ok ? tt('defi.lend.supplySuccess') : tt('defi.lend.supplyFailed'), lastHash ? tt('defi.common.txHashAlert', { hash: lastHash }) : tt('common.done'));
      setSelected(null);
      setAmount('');
      await loadData();
      refresh();
    } catch (err) {
      Alert.alert(tt('defi.lend.supplyFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
      setBusyText('');
    }
  }

  async function handleWithdraw(row) {
    try {
      setBusy(true);
      const from = await assertSigningAccount(meta);
      const amt = parseTokenAmount(amount, 18);
      if (amt <= 0n) throw new Error(tt('defi.lend.needWithdrawAmount'));
      if (amt > row.amount) throw new Error(tt('defi.lend.exceedsDeposit'));
      const isNative = row.token.native;
      const mnemonic = await walletStore.getSigningMnemonic(address, meta.current);

      // BNB 特殊流程：withdraw(WBNB) → unwrap；其他代币：直接 withdraw
      const record = await recordDefiTx(walletStore, {
        from: address,
        to: AAVE_POOL,
        amount: tt('defi.lend.recordWithdraw', { amount, symbol: row.symbol }),
        status: tt('common.processing'),
      });
      setBusyText(isNative ? tt('defi.lend.stepWithdrawNative') : tt('defi.lend.stepWithdraw'));
      const res = await signAndSendWithReceipt({
        to: AAVE_POOL,
        data: aave.withdrawData(row.asset, amt, address),
        valueWei: 0n,
        from,
        mnemonic,
      });
      let ok = !res.receipt || res.receipt.status === '0x1';
      let lastHash = res.txHash;
      // unwrap WBNB → BNB（全量解包，失败不影响取回本身）
      if (ok && isNative) {
        try {
          setBusyText(tt('defi.lend.stepUnwrap'));
          const unwrap = await signAndSendWithReceipt({
            to: WBNB,
            data: wbnbWithdrawData(amt),
            valueWei: 0n,
            from,
            mnemonic,
          });
          if (unwrap.txHash) lastHash = unwrap.txHash;
        } catch {
          // WBNB 留在钱包里，可后续手动解包
        }
      }
      await walletStore.updateTransaction(record.id, {
        status: ok ? tt('common.success') : tt('common.failed'),
        txHash: lastHash,
        error: ok ? undefined : tt('defi.common.revert'),
      });
      Alert.alert(ok ? tt('defi.lend.withdrawSuccess') : tt('defi.lend.withdrawFailed'), tt('defi.common.txHashAlert', { hash: lastHash }));
      setSelected(null);
      setAmount('');
      await loadData();
      refresh();
    } catch (err) {
      Alert.alert(tt('defi.lend.withdrawFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
      setBusyText('');
    }
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
        <DefiHeader title={tt('defi.lend.headerTitle')} subtitle={tt('defi.lend.headerSubtitle')} />

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

        {/* 我的存款 */}
        <Text style={styles.sectionTitle}>{tt('defi.lend.myDeposits')}</Text>
        {deposits.length === 0 ? (
          <Text style={styles.emptyText}>
            {loading ? tt('defi.lend.loadingDeposits') : tt('defi.lend.noDeposits')}
          </Text>
        ) : (
          deposits.map((row) => (
            <TouchableOpacity
              key={row.symbol}
              style={styles.depositCard}
              activeOpacity={0.7}
              onPress={() => {
                setSelected(row);
                setAmount('');
              }}
            >
              <Text style={{ fontSize: 22, marginRight: 12 }}>{row.token.icon}</Text>
              <View style={styles.depositInfo}>
                <Text style={styles.depositSymbol}>{row.symbol}</Text>
                <Text style={styles.depositSub}>
                  ≈ {aave.formatBaseAmount(depositUsd(row))}
                </Text>
              </View>
              <Text style={styles.depositAmount}>
                {formatTokenAmount(row.amount)}
              </Text>
            </TouchableOpacity>
          ))
        )}

        {/* 可存资产（全部列出，无论是否已有存款） */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{tt('defi.lend.supplyAssets')}</Text>
        {LEND_SYMBOLS.map((sym) => {
          const token = tokenBySymbol(sym);
          const row = deposits.find((d) => d.symbol === sym);
          return (
            <TouchableOpacity
              key={sym}
              style={styles.assetCard}
              activeOpacity={0.7}
              onPress={() => {
                setSelected({ symbol: sym, token, asset: token.native ? WBNB : token.address, amount: row?.amount ?? 0n, price: row?.price ?? 0n });
                setAmount('');
              }}
            >
              <Text style={{ fontSize: 22, marginRight: 12 }}>{token.icon}</Text>
              <View style={styles.depositInfo}>
                <Text style={styles.depositSymbol}>{sym}</Text>
                <Text style={styles.depositSub}>
                  {tt('defi.lend.balance', {
                    amount: token.native
                      ? (bnbBalance !== null ? formatTokenAmount(bnbBalance) : '…')
                      : (balances?.[sym] !== undefined ? formatTokenAmount(balances[sym]) : '…'),
                  })}
                </Text>
              </View>
              <Text style={styles.depositHint}>{row && row.amount > 0n ? tt('defi.lend.appendOrWithdraw') : tt('defi.lend.supplyHint')}</Text>
            </TouchableOpacity>
          );
        })}

        <Text style={styles.tip}>
          {tt('defi.lend.tip')}
        </Text>

        {/* 存入 / 取回 sheet */}
        {selected ? (
          <View style={styles.sheetMask}>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.sheetHeader}>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text style={styles.sheetClose}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>{selected.symbol} · Aave V3</Text>
                <View style={{ width: 40 }} />
              </View>

              <Text style={styles.sectionTitle}>{tt('defi.lend.supplySection')}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder={tt('defi.lend.amountPlaceholder', { symbol: selected.symbol })}
                  placeholderTextColor={t.secondaryText}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.inputSuffix}>{selected.symbol}</Text>
              </View>
              <TouchableOpacity
                style={[styles.actionButton, (!amount || busy) && styles.disabled]}
                disabled={!amount || busy}
                onPress={() => handleSupply(selected)}
              >
                <Text style={styles.actionText}>{busy ? busyText : tt('defi.lend.supplySection')}</Text>
              </TouchableOpacity>

              {selected.amount > 0n ? (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{tt('defi.lend.withdrawSection')}</Text>
                  <Text style={styles.balanceText}>
                    {tt('defi.lend.currentDeposit', { amount: formatTokenAmount(selected.amount), symbol: selected.symbol })}
                  </Text>
                  <TouchableOpacity
                    style={[styles.withdrawButton, (!amount || busy) && styles.disabled]}
                    disabled={!amount || busy}
                    onPress={() => handleWithdraw(selected)}
                  >
                    <Text style={styles.actionText}>{busy ? busyText : tt('defi.lend.withdrawSection')}</Text>
                  </TouchableOpacity>
                </>
              ) : null}

              <Text style={styles.tip}>
                {tt('defi.lend.sheetTip')}
              </Text>
            </ScrollView>
          </View>
        ) : null}
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
  depositCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.card,
    borderRadius: 12,
    paddingRight: 12,
    marginBottom: 12,
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
  balanceText: {
    fontSize: 12,
    color: t.secondaryText,
    marginBottom: 12,
  },
  actionButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: t.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  withdrawButton: {
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
  tip: {
    fontSize: 11,
    color: t.secondaryText,
    lineHeight: 18,
    marginTop: 20,
  },
});

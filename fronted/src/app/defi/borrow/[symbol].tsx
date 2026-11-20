// 借款详情页：单一资产的借出 / 还款（Aave V3，从借款列表页点资产行 push 进入，带导航栏）

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
import { useWalletStore } from '@/hooks/useWalletStore';
import { useTheme } from '@/hooks/useTheme';
import { useUserInfo } from '@/hooks/useUserInfo';
import { net, aaveWrappedAddress, wrappedSymbol, tokenBySymbol } from '@/hooks/useDefiNetwork';
import * as aave from '@/utils/defi/aave';
import { balanceOf, wbnbDepositData, wbnbWithdrawData } from '@/utils/defi/erc20';
import { formatTokenAmount, parseTokenAmount } from '@/utils/format';
import { assertSigningAccount, ensureApproval, signAndSendWithReceipt } from '@/utils/defi/txSender';
import { DefiGuard, recordDefiTx } from '@/components/defi/ui';

/**
 * 借款详情页：借出 / 还款
 * - 数据按 URL 参数的 symbol 链上实时读（variableDebtToken 余额 = 我的负债）
 * - 借出：Pool.borrow（浮动利率；可借额度/健康因子校验；原生币借 wrapped 后自动解包）
 * - 还款：approve → Pool.repay（原生币先 wrap）
 */
export default function BorrowDetail() {
  const params = useLocalSearchParams();
  const symbol = String(Array.isArray(params.symbol) ? params.symbol[0] : params.symbol || '');
  const token = tokenBySymbol(symbol);
  const t = useTheme();
  const { session, meta, hasAccount, address, bnbBalance, balances, refresh } = useUserInfo();
  const styles = makeStyles(t);

  const [asset, setAsset] = useState(null); // 储备资产地址（原生币 → wrapped）
  const [debt, setDebt] = useState(0n); // 我的负债（variableDebtToken 余额）
  const [account, setAccount] = useState(null); // getUserAccountData（可借额度 / 健康因子）
  const [loading, setLoading] = useState(false);
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');

  const loadDetail = useCallback(async () => {
    if (!address || !token) {
      setDebt(0n);
      return;
    }
    setLoading(true);
    try {
      const reserve = token.native ? aaveWrappedAddress() : token.address;
      const { aToken: at, variableDebtToken: vt } = await aave.reserveTokens(reserve);
      if (!at || BigInt(at) === 0n) {
        setAsset(null);
        setDebt(0n);
        return;
      }
      setAsset(reserve);
      // 负债 = variableDebtToken 余额（浮息债务，利息随区块累积）
      setDebt(vt && BigInt(vt) !== 0n ? await balanceOf(vt, address).catch(() => 0n) : 0n);
      // 账户级数据：可借额度 / 健康因子（跨资产 USD 折算，8 位精度）
      setAccount(await aave.getUserAccountData(address).catch(() => null));
    } finally {
      setLoading(false);
    }
  }, [address, symbol]);

  useFocusEffect(
    useCallback(() => {
      loadDetail();
    }, [loadDetail])
  );

  /** 借出：Pool.borrow（浮动利率）——先校验健康因子与可借额度，借到 wrapped 后自动解包 */
  async function handleBorrow() {
    try {
      setBusy(true);
      const pool = net().aave.pool;
      const wrapped = aaveWrappedAddress();
      const from = await assertSigningAccount(meta);
      const amt = parseTokenAmount(borrowAmount, token.decimals);
      if (amt <= 0n) throw new Error(tt('defi.lend.needBorrowAmount'));
      const isNative = token.native;

      // 风控 1：健康因子 < 1（已在清算区间）禁止再借
      const acc = await aave.getUserAccountData(address);
      if (acc.healthFactor < 10n ** 18n) throw new Error(tt('defi.lend.healthFactorLow'));
      // 风控 2：可借额度校验（USD 8 位精度）：借出量 × 实时价 ≤ availableBorrowsBase
      const price = await aave.assetPrice(asset).catch(() => 0n);
      if (price > 0n) {
        const base = (amt * price) / 10n ** BigInt(token.decimals);
        if (base > acc.availableBorrowsBase) {
          throw new Error(tt('defi.lend.exceedsAvailable', {
            available: aave.formatBaseAmount(acc.availableBorrowsBase),
          }));
        }
      }

      const record = await recordDefiTx({
        from: address,
        to: pool,
        amount: tt('defi.lend.recordBorrow', { amount: borrowAmount, symbol }),
        status: tt('common.processing'),
      });
      setBusyText(tt('defi.lend.stepBorrow'));
      const res = await signAndSendWithReceipt({
        // to：Aave V3 Pool 合约
        to: pool,
        // data：borrow(资产地址, 数量, 利率模式2=浮动, 推荐码0, 自己地址) 编码——
        //   Pool 铸 variableDebtToken 记账，并把底层资产（原生币 = wrapped）转出
        data: aave.borrowData(asset, amt, address),
        // valueWei：借出不发原生币（资产由 Pool 转给你），固定 0n
        valueWei: 0n,
        from,
        method: 'borrow (Aave Pool)',
      });
      let ok = !res.receipt || res.receipt.status === '0x1';
      let lastHash = res.txHash;
      // 借到的是 wrapped → 自动解包成原生币（失败不影响借款本身）
      if (ok && isNative) {
        try {
          setBusyText(tt('defi.lend.stepUnwrap', { native: net().nativeSymbol, wrapped: wrappedSymbol() }));
          const unwrap = await signAndSendWithReceipt({
            to: wrapped,
            data: wbnbWithdrawData(amt),
            valueWei: 0n,
            from,
            method: `WETH withdraw (unwrap ${net().nativeSymbol})`,
          });
          if (unwrap.txHash) lastHash = unwrap.txHash;
        } catch {
          // wrapped 留在钱包里，可后续手动解包
        }
      }
      await useWalletStore.getState().updateTransaction(record.id, {
        status: ok ? tt('common.success') : tt('common.failed'),
        txHash: lastHash,
        error: ok ? undefined : tt('defi.common.revert'),
      });
      Alert.alert(ok ? tt('defi.lend.borrowSuccess') : tt('defi.lend.borrowFailed'), tt('defi.common.txHashAlert', { hash: lastHash }));
      setBorrowAmount('');
      await loadDetail();
      refresh();
    } catch (err) {
      Alert.alert(tt('defi.lend.borrowFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
      setBusyText('');
    }
  }

  /** 还款：原生币先 wrap → approve → Pool.repay；其他代币 approve → repay */
  async function handleRepay() {
    try {
      setBusy(true);
      const pool = net().aave.pool;
      const wrapped = aaveWrappedAddress();
      const from = await assertSigningAccount(meta);
      const amt = parseTokenAmount(repayAmount, token.decimals);
      if (amt <= 0n) throw new Error(tt('defi.lend.needRepayAmount'));
      if (amt > debt) throw new Error(tt('defi.lend.exceedsDebt'));
      const isNative = token.native;

      // 余额校验（native 预留 gas）
      const gasReserve = 10n ** 16n;
      const bal = isNative ? (bnbBalance !== null ? bnbBalance - gasReserve : bnbBalance) : balances?.[symbol];
      if (bal === null || bal === undefined || bal < amt) {
        throw new Error(isNative
          ? tt('defi.lend.insufficientBalanceNative', { symbol, native: net().nativeSymbol })
          : tt('defi.lend.insufficientBalance', { symbol }));
      }
      // 原生币：wrap → approve → repay；其他代币：approve → repay
      const nativeParams = { native: net().nativeSymbol, wrapped: wrappedSymbol() };
      const steps = [];
      if (isNative) steps.push({ label: tt('defi.lend.stepWrap', nativeParams), to: wrapped, data: wbnbDepositData(), valueWei: amt, method: `WETH deposit (wrap ${net().nativeSymbol})` });
      steps.push({ label: tt('defi.lend.stepApprove', { symbol }), approve: asset, amountWei: amt });
      steps.push({ label: tt('defi.lend.stepRepay'), to: pool, data: aave.repayData(asset, amt, address), valueWei: 0n, method: 'repay (Aave Pool)' });

      const record = await recordDefiTx({
        from: address,
        to: pool,
        amount: tt('defi.lend.recordRepay', { amount: repayAmount, symbol }),
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
            // spender = Pool：repay 时 Pool 会 transferFrom 你的还款资产
            spender: pool,
            amountWei: step.amountWei,
          });
          txHash = res.txHash ?? '';
        } else {
          const res = await signAndSendWithReceipt({
            to: step.to,
            data: step.data,
            valueWei: step.valueWei ?? 0n,
            from,
            method: step.method,
          });
          txHash = res.txHash;
          if (res.receipt && res.receipt.status !== '0x1') ok = false;
        }
        if (txHash) lastHash = txHash;
        if (!ok) break;
      }
      await useWalletStore.getState().updateTransaction(record.id, {
        status: ok ? tt('common.success') : tt('common.failed'),
        txHash: lastHash,
        error: ok ? undefined : tt('defi.common.revert'),
      });
      Alert.alert(ok ? tt('defi.lend.repaySuccess') : tt('defi.lend.repayFailed'), tt('defi.common.txHashAlert', { hash: lastHash }));
      setRepayAmount('');
      await loadDetail();
      refresh();
    } catch (err) {
      Alert.alert(tt('defi.lend.repayFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
      setBusyText('');
    }
  }

  return (
    <DefiGuard session={session} hasAccount={hasAccount}>
      {/* 导航栏标题：资产名 · 借款 · Aave V3 */}
      <Stack.Screen options={{ title: token ? `${symbol} · ${tt('defi.lend.borrowSection')} · Aave V3` : tt('defi.lend.detailTitle') }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {!token || !asset ? (
          <Text style={styles.emptyText}>
            {loading ? tt('defi.lend.loadingDeposits') : tt('defi.lend.noDeposits')}
          </Text>
        ) : (
          <>
            {/* 可借额度 / 健康 / 负债一览 + 数量输入 + 借出按钮 */}
            <Text style={styles.sectionTitle}>{tt('defi.lend.borrowSection')}</Text>
            <View style={styles.infoCard}>
              <Text style={styles.balanceText}>
                {tt('defi.lend.availableBorrow', { amount: account ? aave.formatBaseAmount(account.availableBorrowsBase) : '…' })}
              </Text>
              <Text style={styles.balanceText}>
                {tt('defi.lend.currentDebt', { amount: formatTokenAmount(debt, token.decimals), symbol })}
              </Text>
              <Text style={styles.balanceText}>
                {tt('defi.lend.hfLabel', { hf: account ? aave.formatHealthFactor(account.healthFactor) : '…' })}
              </Text>
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={borrowAmount}
                onChangeText={setBorrowAmount}
                placeholder={tt('defi.lend.amountPlaceholder', { symbol })}
                placeholderTextColor={t.secondaryText}
                keyboardType="decimal-pad"
              />
              <Text style={styles.inputSuffix}>{symbol}</Text>
            </View>
            <TouchableOpacity
              style={[styles.actionButton, (!borrowAmount || busy) && styles.disabled]}
              disabled={!borrowAmount || busy}
              onPress={handleBorrow}
            >
              <Text style={styles.actionText}>{busy ? busyText : tt('defi.lend.borrowSection')}</Text>
            </TouchableOpacity>

            {debt > 0n ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{tt('defi.lend.repaySection')}</Text>
                <Text style={styles.balanceText}>
                  {tt('defi.lend.currentDebt', { amount: formatTokenAmount(debt, token.decimals), symbol })}
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={repayAmount}
                    onChangeText={setRepayAmount}
                    placeholder={tt('defi.lend.amountPlaceholder', { symbol })}
                    placeholderTextColor={t.secondaryText}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.inputSuffix}>{symbol}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.withdrawButton, (!repayAmount || busy) && styles.disabled]}
                  disabled={!repayAmount || busy}
                  onPress={handleRepay}
                >
                  <Text style={styles.actionText}>{busy ? busyText : tt('defi.lend.repaySection')}</Text>
                </TouchableOpacity>
              </>
            ) : null}

            <Text style={styles.tip}>
              {tt('defi.lend.borrowTip', { native: net().nativeSymbol, wrapped: wrappedSymbol() })}
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
  emptyText: {
    fontSize: 13,
    color: t.secondaryText,
    textAlign: 'center',
    marginTop: 40,
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
    marginTop: 4,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    padding: 12,
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

// 借贷详情页：单一资产的存入 / 取回（Aave V3，从借贷 Tab 点资产行 push 进入，带导航栏）

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
import { net, aaveWrappedAddress, wrappedSymbol, tokenBySymbol } from '@/utils/defi/tokens';
import * as aave from '@/utils/defi/aave';
import { balanceOf, wbnbDepositData, wbnbWithdrawData } from '@/utils/defi/erc20';
import { formatTokenAmount, parseTokenAmount } from '@/utils/defi/format';
import { assertSigningAccount, ensureApproval, signAndSendWithReceipt } from '@/utils/defi/txSender';
import { DefiGuard, recordDefiTx } from '@/components/defi/ui';

/**
 * 借贷详情页：存入 / 取回
 * - 数据按 URL 参数的 symbol 链上实时读（aToken 余额 = 我的存款）
 * - 存入：approve → Pool.supply（原生币先 wrap 成 WBNB/WETH）
 * - 取回：Pool.withdraw（原生币再 unwrap）
 */
export default function LendDetail() {
  const params = useLocalSearchParams();
  const symbol = String(Array.isArray(params.symbol) ? params.symbol[0] : params.symbol || '');
  const token = tokenBySymbol(symbol);
  const t = useTheme();
  const { session, meta, hasAccount, address, bnbBalance, balances, refresh } = useBscWallet();
  const styles = makeStyles(t);

  const [asset, setAsset] = useState(null); // 储备资产地址（原生币 → wrapped）
  const [aToken, setAToken] = useState(null); // 对应 aToken 地址
  const [deposit, setDeposit] = useState(0n); // 我的存款（aToken 余额）
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');

  const loadDetail = useCallback(async () => {
    if (!address || !token) {
      setDeposit(0n);
      return;
    }
    setLoading(true);
    try {
      const reserve = token.native ? aaveWrappedAddress() : token.address;
      const { aToken: at } = await aave.reserveTokens(reserve);
      if (!at || BigInt(at) === 0n) {
        setAsset(null);
        setAToken(null);
        setDeposit(0n);
        return;
      }
      setAsset(reserve);
      setAToken(at);
      setDeposit(await balanceOf(at, address).catch(() => 0n));
    } finally {
      setLoading(false);
    }
  }, [address, symbol]);

  useFocusEffect(
    useCallback(() => {
      loadDetail();
    }, [loadDetail])
  );

  /** 存入：原生币先 wrap → approve → Pool.supply */
  async function handleSupply() {
    try {
      setBusy(true);
      const pool = net().aave.pool;
      const wrapped = aaveWrappedAddress();
      const from = await assertSigningAccount(meta);
      const amt = parseTokenAmount(amount, token.decimals);
      if (amt <= 0n) throw new Error(tt('defi.lend.needAmount'));
      const isNative = token.native;
      // 原生币：预留 gas 后再 wrap
      const gasReserve = 10n ** 16n;
      const available = isNative && bnbBalance !== null ? bnbBalance - gasReserve : bnbBalance;
      const bal = isNative ? available : balances?.[symbol];
      if (bal === null || bal === undefined || bal < amt) {
        throw new Error(isNative
          ? tt('defi.lend.insufficientBalanceNative', { symbol, native: net().nativeSymbol })
          : tt('defi.lend.insufficientBalance', { symbol }));
      }
      const sign = await walletStore.getSigningCredential(address);

      // 原生币特殊流程：wrap → approve → supply；其他代币：approve → supply
      const nativeParams = { native: net().nativeSymbol, wrapped: wrappedSymbol() };
      const steps = [];
      if (isNative) steps.push({ label: tt('defi.lend.stepWrap', nativeParams), to: wrapped, data: wbnbDepositData(), valueWei: amt, method: `WETH deposit (wrap ${net().nativeSymbol})` });
      steps.push({ label: tt('defi.lend.stepApprove', { symbol }), approve: asset, amountWei: amt });
      steps.push({ label: tt('defi.lend.stepSupply'), to: pool, data: aave.supplyData(asset, amt, address), valueWei: 0n, method: 'supply (Aave Pool)' });

      const record = await recordDefiTx(walletStore, {
        from: address,
        to: pool,
        amount: tt('defi.lend.recordSupply', { amount, symbol }),
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
            spender: pool,
            amountWei: step.amountWei,
            sign,
          });
          txHash = res.txHash ?? '';
        } else {
          const res = await signAndSendWithReceipt({
            to: step.to, data: step.data, valueWei: step.valueWei ?? 0n, from, sign, method: step.method,
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
      setAmount('');
      await loadDetail();
      refresh();
    } catch (err) {
      Alert.alert(tt('defi.lend.supplyFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
      setBusyText('');
    }
  }

  /** 取回：Pool.withdraw（原生币再 unwrap） */
  async function handleWithdraw() {
    try {
      setBusy(true);
      const pool = net().aave.pool;
      const wrapped = aaveWrappedAddress();
      const from = await assertSigningAccount(meta);
      const amt = parseTokenAmount(amount, token.decimals);
      if (amt <= 0n) throw new Error(tt('defi.lend.needWithdrawAmount'));
      if (amt > deposit) throw new Error(tt('defi.lend.exceedsDeposit'));
      const isNative = token.native;
      const sign = await walletStore.getSigningCredential(address);

      const record = await recordDefiTx(walletStore, {
        from: address,
        to: pool,
        amount: tt('defi.lend.recordWithdraw', { amount, symbol }),
        status: tt('common.processing'),
      });
      setBusyText(isNative ? tt('defi.lend.stepWithdrawNative', { wrapped: wrappedSymbol() }) : tt('defi.lend.stepWithdraw'));
      const res = await signAndSendWithReceipt({
        to: pool,
        data: aave.withdrawData(asset, amt, address),
        valueWei: 0n,
        from,
        sign,
        method: 'withdraw (Aave Pool)',
      });
      let ok = !res.receipt || res.receipt.status === '0x1';
      let lastHash = res.txHash;
      // unwrap wrapped → 原生币（全量解包，失败不影响取回本身）
      if (ok && isNative) {
        try {
          setBusyText(tt('defi.lend.stepUnwrap', { native: net().nativeSymbol, wrapped: wrappedSymbol() }));
          const unwrap = await signAndSendWithReceipt({
            to: wrapped,
            data: wbnbWithdrawData(amt),
            valueWei: 0n,
            from,
            sign,
            method: `WETH withdraw (unwrap ${net().nativeSymbol})`,
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
      setAmount('');
      await loadDetail();
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
      {/* 导航栏标题：资产名 · Aave V3 */}
      <Stack.Screen options={{ title: token ? `${symbol} · Aave V3` : tt('defi.lend.detailTitle') }} />
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
            <Text style={styles.sectionTitle}>{tt('defi.lend.supplySection')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder={tt('defi.lend.amountPlaceholder', { symbol })}
                placeholderTextColor={t.secondaryText}
                keyboardType="decimal-pad"
              />
              <Text style={styles.inputSuffix}>{symbol}</Text>
            </View>
            <Text style={styles.balanceText}>
              {tt('defi.lend.balance', {
                amount: token.native
                  ? (bnbBalance !== null ? formatTokenAmount(bnbBalance) : '…')
                  : (balances?.[symbol] !== undefined ? formatTokenAmount(balances[symbol], token.decimals) : '…'),
              })}
            </Text>
            <TouchableOpacity
              style={[styles.actionButton, (!amount || busy) && styles.disabled]}
              disabled={!amount || busy}
              onPress={handleSupply}
            >
              <Text style={styles.actionText}>{busy ? busyText : tt('defi.lend.supplySection')}</Text>
            </TouchableOpacity>

            {deposit > 0n ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{tt('defi.lend.withdrawSection')}</Text>
                <Text style={styles.balanceText}>
                  {tt('defi.lend.currentDeposit', { amount: formatTokenAmount(deposit, token.decimals), symbol })}
                </Text>
                <TouchableOpacity
                  style={[styles.withdrawButton, (!amount || busy) && styles.disabled]}
                  disabled={!amount || busy}
                  onPress={handleWithdraw}
                >
                  <Text style={styles.actionText}>{busy ? busyText : tt('defi.lend.withdrawSection')}</Text>
                </TouchableOpacity>
              </>
            ) : null}

            <Text style={styles.tip}>
              {tt('defi.lend.sheetTip')}
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

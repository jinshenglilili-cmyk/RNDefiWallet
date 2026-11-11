import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { t as tt } from '@/i18n';
import * as walletStore from '@/utils/walletStore';
import { useTheme } from '@/utils/theme';
import { useBscWallet } from '@/utils/defi/useBscWallet';
import { getTokens, pathAddress, net, wrappedSymbol } from '@/utils/defi/tokens';
import * as pancake from '@/utils/defi/pancake';
import { getAmountsOut } from '@/utils/defi/pancake';
import { applySlippage, formatTokenAmount, parseTokenAmount } from '@/utils/defi/format';
import { assertSigningAccount, ensureApproval, signAndSendWithReceipt } from '@/utils/defi/txSender';
import * as oneInch from '@/utils/defi/oneInch';
import { DefiGuard, DefiHeader, TokenSheet, recordDefiTx } from '@/components/defi/ui';

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0];

/**
 * Swap Tab：代币兑换（V2 DEX 链上报价为主，1inch 聚合器为实验选项）
 * - 原生币兑换路径自动换 WBNB/WETH；原生币侧不需要授权
 * - 滑点设置：0.1% / 0.5% / 1% / 自定义
 * - 交易走当前 DeFi 网络（BSC / Sepolia），成功/失败写入钱包交易历史
 */
export default function SwapTab() {
  const t = useTheme();
  const { session, meta, hasAccount, address, bnbBalance, balances, refresh, network } = useBscWallet();
  const styles = makeStyles(t);

  // 初始代币按当前网络取（原生币 / USDT）
  const tokens = getTokens();
  const [fromToken, setFromToken] = useState(tokens[0]); // 原生币
  const [toToken, setToToken] = useState(tokens[2]); // USDT
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [provider, setProvider] = useState('pancake');
  const [quote, setQuote] = useState(null); // { amountOutWei, amountInWei }
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null); // 'from' | 'to' | null
  const quoteTimer = useRef(null);

  function tokenBalance(token) {
    return token?.native ? bnbBalance : balances?.[token.symbol];
  }

  /** 1 个卖出代币 ≈ 多少买入代币（解析失败时返回空） */
  function ratioText() {
    try {
      const amountInWei = parseTokenAmount(amount, fromToken.decimals);
      if (amountInWei === 0n) return ' ';
      // 人类可读比例的 18 位定点：out*10^inDec*10^18 / (in*10^outDec)（两侧小数位可能不同）
      const ratio = (quote.amountOutWei * 10n ** BigInt(fromToken.decimals + 18))
        / (amountInWei * 10n ** BigInt(toToken.decimals));
      return `1 ${fromToken.symbol} ≈ ${formatTokenAmount(ratio, 18, 10)} ${toToken.symbol}`;
    } catch {
      return ' ';
    }
  }

  // 输入/方向/协议变化后 400ms 防抖报价
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    setQuote(null);
    setQuoteError('');
    const amountIn = Number(amount);
    if (!amountIn || amountIn <= 0 || fromToken.symbol === toToken.symbol) return;
    quoteTimer.current = setTimeout(() => {
      doQuote();
    }, 400);
    return () => clearTimeout(quoteTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, fromToken.symbol, toToken.symbol, provider]);

  async function doQuote() {
    try {
      setQuoting(true);
      const amountInWei = parseTokenAmount(amount, fromToken.decimals);
      let amountOutWei;
      if (provider === 'pancake') {
        const amounts = await getAmountsOut(amountInWei, [pathAddress(fromToken), pathAddress(toToken)]);
        amountOutWei = amounts[amounts.length - 1];
      } else {
        const src = fromToken.native ? oneInch.NATIVE_1INCH : fromToken.address;
        const dst = toToken.native ? oneInch.NATIVE_1INCH : toToken.address;
        amountOutWei = (await oneInch.quote(src, dst, amountInWei)).dstAmount;
      }
      setQuote({ amountOutWei, amountInWei });
    } catch (err) {
      setQuote(null);
      setQuoteError(provider === 'pancake' ? String(err.message ?? err) : tt('defi.swap.oneInchUnavailable'));
    } finally {
      setQuoting(false);
    }
  }

  function pickMax() {
    const bal = tokenBalance(fromToken);
    if (bal === null || bal === undefined) return;
    // BNB 留一点 gas
    const text = fromToken.native && bal > 10n ** 16n
      ? formatTokenAmount(bal - 10n ** 16n)
      : formatTokenAmount(bal, fromToken.decimals);
    setAmount(text);
  }

  async function handleSwap() {
    try {
      setBusy(true);
      const from = await assertSigningAccount(meta);
      const amountInWei = parseTokenAmount(amount, fromToken.decimals);
      const bal = tokenBalance(fromToken);
      if (bal === null || bal === undefined || bal < amountInWei) {
        throw new Error(tt('defi.swap.insufficientBalance', { symbol: fromToken.symbol }));
      }
      if (!quote || quote.amountInWei !== amountInWei) {
        throw new Error(tt('defi.swap.quoteStale'));
      }
      const slip = Number(slippage);
      if (!(slip >= 0.01 && slip <= 50)) {
        throw new Error(tt('defi.swap.slippageRange'));
      }
      const sign = await walletStore.getSigningCredential(address);

      let target, data, valueWei, approveToken, routerLabel, method;
      if (provider === 'pancake') {
        const amountOutMin = applySlippage(quote.amountOutWei, slip);
        const built = pancake.buildSwap(fromToken, toToken, amountInWei, amountOutMin, address, pancake.defaultDeadline());
        target = built.to;
        data = built.data;
        valueWei = built.valueWei;
        approveToken = built.approveToken;
        routerLabel = net().dexName;
        method = built.method;
      } else {
        const src = fromToken.native ? oneInch.NATIVE_1INCH : fromToken.address;
        const dst = toToken.native ? oneInch.NATIVE_1INCH : toToken.address;
        const built = await oneInch.buildSwap(src, dst, amountInWei, address, slip);
        target = built.to;
        data = built.data;
        valueWei = built.valueWei;
        approveToken = fromToken.native ? null : fromToken.address;
        routerLabel = '1inch';
        method = '1inch swap';
      }

      const est = formatTokenAmount(quote.amountOutWei, toToken.decimals);
      Alert.alert(
        tt('defi.swap.confirmTitle'),
        tt('defi.swap.confirmBody', {
          amount,
          from: fromToken.symbol,
          to: toToken.symbol,
          est,
          router: routerLabel,
          net: tt(`defi.network.${net().id}`),
          slip,
        }),
        [
          { text: tt('common.cancel'), style: 'cancel', onPress: () => setBusy(false) },
          {
            text: tt('common.confirm'),
            style: 'destructive',
            onPress: async () => {
              try {
                // 需要授权时先 approve（Pancake 给 Router / 1inch 给其路由）
                if (approveToken) {
                  await ensureApproval({
                    tokenAddress: approveToken,
                    owner: address,
                    spender: target,
                    amountWei: amountInWei,
                    sign,
                  });
                }
                const record = await recordDefiTx(walletStore, {
                  from: address,
                  to: target,
                  amount: `${amount} ${fromToken.symbol}`,
                  status: tt('common.processing'),
                });
                const { txHash, receipt } = await signAndSendWithReceipt({
                  to: target, data, valueWei, from, sign, method,
                });
                const ok = !receipt || receipt.status === '0x1';
                await walletStore.updateTransaction(record.id, {
                  status: ok ? tt('common.success') : tt('common.failed'),
                  txHash,
                  error: ok ? undefined : tt('defi.common.revert'),
                });
                Alert.alert(ok ? tt('defi.swap.success') : tt('defi.swap.failed'), tt('defi.common.txHashAlert', { hash: txHash }));
                setAmount('');
                setQuote(null);
                refresh();
              } catch (err) {
                Alert.alert(tt('defi.swap.failed'), String(err.message ?? err));
              } finally {
                setBusy(false);
              }
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert(tt('defi.swap.cannotSwap'), String(err.message ?? err));
      setBusy(false);
    }
  }

  const canSwap = !!amount && Number(amount) > 0 && !!quote && !busy && !quoting
    && fromToken.symbol !== toToken.symbol;

  return (
    <DefiGuard session={session} hasAccount={hasAccount}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <DefiHeader
          title="Swap"
          subtitle={network === 'sepolia'
            ? tt('defi.common.testnetSubtitle', { dex: net().dexName, net: tt('defi.network.sepolia') })
            : tt('defi.swap.headerSubtitle')}
        />

        {/* 协议选择：1inch 仅在 BSC 开放（Sepolia 不提供聚合器报价） */}
        <View style={styles.providerRow}>
          {['pancake', ...(net().oneInch ? ['1inch'] : [])].map((key) => (
            <TouchableOpacity
              key={key}
              style={[styles.providerCell, provider === key && styles.providerCellActive]}
              onPress={() => setProvider(key)}
            >
              <Text style={[styles.providerText, provider === key && styles.providerTextActive]}>
                {key === 'pancake' ? `${net().dexName}${tt('defi.swap.onchainQuoteSuffix')}` : tt('defi.swap.providerOneInch')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 兑换卡 */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{tt('defi.swap.sell')}</Text>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.tokenBtn} onPress={() => setSheet('from')}>
              <Text style={{ fontSize: 18, marginRight: 6 }}>{fromToken.icon}</Text>
              <Text style={styles.tokenBtnText}>{fromToken.symbol}</Text>
              <Text style={styles.tokenBtnChevron}>▾</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.0"
              placeholderTextColor={t.secondaryText}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceText}>
              {tt('defi.swap.balance', {
                amount: tokenBalance(fromToken) !== null && tokenBalance(fromToken) !== undefined
                  ? formatTokenAmount(tokenBalance(fromToken), fromToken.decimals) : tt('common.loading'),
              })}
            </Text>
            <TouchableOpacity onPress={pickMax}>
              <Text style={styles.maxText}>MAX</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.flipButton}
            onPress={() => {
              setFromToken(toToken);
              setToToken(fromToken);
            }}
          >
            <Text style={styles.flipIcon}>⇅</Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>{tt('defi.swap.buy')}</Text>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.tokenBtn} onPress={() => setSheet('to')}>
              <Text style={{ fontSize: 18, marginRight: 6 }}>{toToken.icon}</Text>
              <Text style={styles.tokenBtnText}>{toToken.symbol}</Text>
              <Text style={styles.tokenBtnChevron}>▾</Text>
            </TouchableOpacity>
            <Text style={styles.quoteText} numberOfLines={1}>
              {quoting ? '…' : quote ? formatTokenAmount(quote.amountOutWei, toToken.decimals) : '0.0'}
            </Text>
          </View>
          <Text style={styles.balanceText}>
            {quote ? ratioText() : ' '}
          </Text>
          {quoteError ? <Text style={styles.errorText}>{quoteError}</Text> : null}
        </View>

        {/* 滑点设置 */}
        <Text style={styles.sectionLabel}>{tt('defi.swap.slippageLabel')}</Text>
        <View style={styles.slipRow}>
          {SLIPPAGE_PRESETS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.slipCell, slippage === String(s) && styles.slipCellActive]}
              onPress={() => setSlippage(String(s))}
            >
              <Text style={[styles.slipText, slippage === String(s) && styles.slipTextActive]}>
                {s}%
              </Text>
            </TouchableOpacity>
          ))}
          <TextInput
            style={[styles.slipInput, !SLIPPAGE_PRESETS.includes(Number(slippage)) && styles.slipInputActive]}
            value={slippage}
            onChangeText={(v) => /^\d*\.?\d*$/.test(v) && setSlippage(v)}
            placeholder={tt('defi.swap.customSlippage')}
            placeholderTextColor={t.secondaryText}
            keyboardType="decimal-pad"
          />
        </View>

        <TouchableOpacity
          style={[styles.swapButton, !canSwap && styles.disabled]}
          disabled={!canSwap}
          onPress={handleSwap}
        >
          <Text style={styles.swapButtonText}>
            {busy ? tt('defi.swap.btnBusy') : quoting ? tt('defi.swap.btnQuoting') : quote ? tt('defi.swap.btnSwap') : tt('defi.swap.btnEnterAmount')}
          </Text>
        </TouchableOpacity>

        <Text style={styles.tip}>
          {tt('defi.swap.tip', { native: net().nativeSymbol })}
        </Text>

        <TokenSheet
          visible={sheet !== null}
          balances={balances}
          nativeBalance={bnbBalance}
          excludeSymbol={sheet === 'from' ? toToken.symbol : fromToken.symbol}
          onSelect={(tk) => (sheet === 'from' ? setFromToken(tk) : setToToken(tk))}
          onClose={() => setSheet(null)}
        />
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
  providerRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  providerCell: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: t.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  providerCellActive: {
    backgroundColor: t.accent,
  },
  providerText: {
    fontSize: 12,
    color: t.accent,
    fontWeight: '600',
  },
  providerTextActive: {
    color: t.background,
  },
  card: {
    backgroundColor: t.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    color: t.secondaryText,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.bar,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
  },
  tokenBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: t.accent,
  },
  tokenBtnChevron: {
    fontSize: 12,
    color: t.secondaryText,
    marginLeft: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 26,
    fontWeight: '700',
    color: t.accent,
    textAlign: 'right',
    paddingVertical: 4,
  },
  quoteText: {
    flex: 1,
    fontSize: 26,
    fontWeight: '700',
    color: t.accent,
    textAlign: 'right',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  balanceText: {
    fontSize: 12,
    color: t.secondaryText,
    marginTop: 6,
  },
  maxText: {
    fontSize: 12,
    fontWeight: '700',
    color: t.link,
  },
  flipButton: {
    alignSelf: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.bar,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
  },
  flipIcon: {
    fontSize: 18,
    color: t.accent,
  },
  errorText: {
    fontSize: 12,
    color: t.red,
    marginTop: 6,
  },
  slipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  slipCell: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    backgroundColor: t.card,
    justifyContent: 'center',
    marginRight: 8,
  },
  slipCellActive: {
    backgroundColor: t.accent,
  },
  slipText: {
    fontSize: 13,
    fontWeight: '600',
    color: t.accent,
  },
  slipTextActive: {
    color: t.background,
  },
  slipInput: {
    flex: 1,
    height: 34,
    borderRadius: 17,
    backgroundColor: t.card,
    paddingHorizontal: 12,
    fontSize: 13,
    color: t.accent,
  },
  slipInputActive: {
    borderWidth: 1,
    borderColor: t.accent,
  },
  swapButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: t.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  swapButtonText: {
    color: t.background,
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.35,
  },
  tip: {
    fontSize: 11,
    color: t.secondaryText,
    lineHeight: 18,
    marginBottom: 20,
  },
});

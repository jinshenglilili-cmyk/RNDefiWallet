// DeFi 三个 tab 共用的钱包状态 Hook：
// 登录态 + 当前账号 + 原生币/各代币余额（当前 DeFi 网络链上实时读）
// 网络（BSC / Sepolia）来自 stores/defiNetwork；切换时自动重拉余额。

import { useCallback, useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/auth';
import { useWalletStore } from '@/stores/wallet';
import { useDefiNetwork } from '@/stores/defiNetwork';
import { getBalance } from '@/utils/defi/bscRpc';
import { balanceOf } from '@/utils/defi/erc20';
import { getTokens } from '@/utils/defi/tokens';

/**
 * @returns {{ session, meta, address, hasAccount, bnbBalance, balances, refresh }}
 * - address: 未登录或无账号时为 ''
 * - bnbBalance: BigInt | null（原生 BNB，作 gas 用）
 * - balances: { [symbol]: BigInt }（含 BNB 与 WBNB）
 */
export function useBscWallet() {
  const { session } = useAuthStore();
  const { meta } = useWalletStore();
  // 订阅 DeFi 网络：切换时重渲染并重新拉余额
  const network = useDefiNetwork((s) => s.network);
  const hasAccounts = !!meta && meta.accounts.length > 0;
  const address = session && hasAccounts ? meta.accounts[meta.current] : '';

  const [nativeBalance, setNativeBalance] = useState(null);
  const [balances, setBalances] = useState({});

  const refresh = useCallback(async () => {
    if (!address) {
      setNativeBalance(null);
      setBalances({});
      return;
    }
    // 原生币余额（gas + 计价）与各 ERC20 余额并行拉取
    const [native, ...tokens] = await Promise.allSettled([
      getBalance(address),
      ...getTokens().filter((t) => !t.native).map(async (t) => ({
        symbol: t.symbol,
        amount: await balanceOf(t.address, address),
      })),
    ]);
    if (native.status === 'fulfilled') setNativeBalance(BigInt(native.value));
    else setNativeBalance(null);

    const next = {};
    for (const item of tokens) {
      if (item.status === 'fulfilled') next[item.value.symbol] = item.value.amount;
    }
    setBalances(next);
  }, [address, network]);

  // 账号变化、网络变化或进入页面时刷新
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    session,
    meta,
    hasAccount: hasAccounts,
    address,
    network,
    bnbBalance: nativeBalance,
    balances,
    refresh,
  };
}

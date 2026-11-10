// DeFi 三个 tab 共用的钱包状态 Hook：
// 登录态 + 当前账号 + BNB/各代币余额（BSC 链上实时读）

import { useCallback, useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/auth';
import { useWalletStore } from '@/stores/wallet';
import { getBalance } from '@/utils/defi/bscRpc';
import { balanceOf } from '@/utils/defi/erc20';
import { TOKENS } from '@/utils/defi/tokens';

/**
 * @returns {{ session, meta, address, hasAccount, bnbBalance, balances, refresh }}
 * - address: 未登录或无账号时为 ''
 * - bnbBalance: BigInt | null（原生 BNB，作 gas 用）
 * - balances: { [symbol]: BigInt }（含 BNB 与 WBNB）
 */
export function useBscWallet() {
  const { session } = useAuthStore();
  const { meta } = useWalletStore();
  const hasAccounts = !!meta && meta.accounts.length > 0;
  const address = session && hasAccounts ? meta.accounts[meta.current] : '';

  const [bnbBalance, setBnbBalance] = useState(null);
  const [balances, setBalances] = useState({});

  const refresh = useCallback(async () => {
    if (!address) {
      setBnbBalance(null);
      setBalances({});
      return;
    }
    // BNB 余额（gas + BNB 计价）与各 ERC20 余额并行拉取
    const [bnb, ...tokens] = await Promise.allSettled([
      getBalance(address),
      ...TOKENS.filter((t) => !t.native).map(async (t) => ({
        symbol: t.symbol,
        amount: await balanceOf(t.address, address),
      })),
    ]);
    if (bnb.status === 'fulfilled') setBnbBalance(BigInt(bnb.value));
    else setBnbBalance(null);

    const next = {};
    for (const item of tokens) {
      if (item.status === 'fulfilled') next[item.value.symbol] = item.value.amount;
    }
    // 原生 BNB 与 WBNB 分开两个键，UI 里 BNB 走 bnbBalance，这里补一份 WBNB
    setBalances(next);
  }, [address]);

  // 账号变化或进入页面时刷新
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    session,
    meta,
    hasAccount: hasAccounts,
    address,
    bnbBalance,
    balances,
    refresh,
  };
}

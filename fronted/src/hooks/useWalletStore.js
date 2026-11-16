// 钱包状态 store（zustand）：一份登录用户的全部钱包信息
//
// 存储层 utils/walletStore.js 里一个 uid 对应一份用户信息对象（wallet.data：
// { meta, transactions }），这里持有这份对象的内存副本，作为跨页面共享的
// 唯一数据源：钱包页、转账记录、签名、dApp 浏览器、DeFi 页面都从本 store
// 取数据。所有增删改都走本 store 的 action —— 先更新内存状态（订阅组件
// 同步刷新），再把整份对象写回存储。机密数据（各账号私钥）不进状态，
// 仍按需从 SecureStore 读取；助记词只在创建账号那一刻使用，不落盘。
// 表单类局部状态（输入中的私钥等）留在各页面。

import { create } from 'zustand';

import * as walletStore from '@/utils/walletStore';
// 余额走 DeFi 网络开关（BSC → BNB，Sepolia → 测试网 ETH），与 DeFi tab 一致
import { getBalance } from '@/utils/defi/bscRpc';
import { formatEther } from '@/utils/format';
import { t as tt } from '@/i18n';

const EMPTY_META = { accounts: [], current: 0 };

/** 刷新当前账号余额（异步写入，失败置 null；链随 DeFi 网络开关） */
function refreshBalance(set, meta) {
  const addr = meta?.accounts[meta.current];
  if (!addr) {
    set({ balance: null });
    return;
  }
  getBalance(addr)
    .then((wei) => set({ balance: formatEther(wei) }))
    .catch(() => set({ balance: null }));
}

export const useWalletStore = create((set, get) => ({
  /** 钱包元数据 { accounts, names?, types?, current }；null = 尚无钱包 */
  meta: null,
  /** 交易记录（新的在前；[{ id, from, to, amount, chain, chainSymbol, status, txHash?, time }]） */
  transactions: [],
  /** 当前账号余额（字符串，已格式化） */
  balance: null,
  /** 启动后第一次 load 是否完成（避免闪空状态） */
  ready: false,

  /** 读取存储里的整份用户信息并刷新余额（钱包页/转账页聚焦时调用） */
  load: async () => {
    const has = await walletStore.hasWallet();
    if (!has) {
      set({ meta: null, transactions: [], balance: null, ready: true });
      return;
    }
    const { meta, transactions } = await walletStore.getUserData();
    // 旧版助记词账号一次性转换成私钥账号（幂等；失败不阻塞钱包数据展示）
    await walletStore.ensureAccountPrivateKeys().catch(() => {});
    set({ meta, transactions, ready: true });
    refreshBalance(set, meta);
  },

  /** 清空内存数据（切换登录归属/注销后调用；存储由 walletStore 层负责） */
  reset: () => {
    set({ meta: null, transactions: [], balance: null, ready: true });
  },

  /** 创建/导入/新增账号后从存储重读整份用户信息（兜底同步） */
  reloadFromStorage: async () => {
    const { meta, transactions } = await walletStore.getUserData();
    set({ meta, transactions });
    refreshBalance(set, meta);
  },

  /** 切换当前账号 */
  switchAccount: async (index) => {
    const meta = get().meta ?? EMPTY_META;
    const next = { ...meta, current: Math.min(index, meta.accounts.length - 1) };
    set({ meta: next, balance: null });
    await walletStore.saveUserData({ meta: next, transactions: get().transactions });
    return next;
  },

  /**
   * 添加账号：追加到账号列表并选中（创建/导入/新增账号页在保存完机密数据后调用）
   * @param type 账号类型：'mnemonic'（助记词派生，默认）| 'private-key'（导入私钥）
   * @returns 更新后的 meta
   */
  addAccount: async (address, type = 'mnemonic') => {
    const meta = get().meta ?? EMPTY_META;
    const index = meta.accounts.length;
    const next = {
      ...meta,
      accounts: [...meta.accounts, address],
      names: [...(meta.names ?? []), tt('wallet.common.accountName', { index: index + 1 })],
      types: [...(meta.types ?? []), type],
      current: index,
    };
    set({ meta: next, balance: null });
    await walletStore.saveUserData({ meta: next, transactions: get().transactions });
    return next;
  },

  /** 删除账号（删除当前账号后选中退化为最后一个；机密数据由存储层连带清理） */
  deleteAccount: async (index) => {
    const meta = get().meta ?? EMPTY_META;
    await walletStore.deleteAccountSecrets(meta, index);
    const accounts = meta.accounts.filter((_, i) => i !== index);
    const next = {
      ...meta,
      accounts,
      names: (meta.names ?? []).filter((_, i) => i !== index),
      types: (meta.types ?? []).filter((_, i) => i !== index),
      current: meta.current === index || meta.current >= accounts.length
        ? Math.max(0, accounts.length - 1)
        : meta.current,
    };
    set({ meta: next, balance: null });
    await walletStore.saveUserData({ meta: next, transactions: get().transactions });
    return next;
  },

  /** 删除钱包（清空全部本地数据：存储层删对象与机密数据，内存同步清空） */
  deleteWallet: async () => {
    await walletStore.deleteWallet();
    set({ meta: null, transactions: [], balance: null });
  },

  // ---------- 交易记录（内存状态为主，整体写回存储） ----------

  /** 追加一条交易记录（自动补 id/时间；status 缺省为「处理中」），返回带 id 的记录 */
  addTransaction: async (record) => {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: tt('common.processing'),
      chain: 'ethereum',
      chainSymbol: 'ETH',
      ...record,
      time: Date.now(),
    };
    const transactions = [item, ...get().transactions].slice(0, 100);
    set({ transactions });
    await walletStore.saveUserData({ meta: get().meta ?? EMPTY_META, transactions });
    return item;
  },

  /** 按 id 更新交易记录（状态流转：处理中 → 成功/失败） */
  updateTransaction: async (id, patch) => {
    const transactions = get().transactions.map((t) => (t.id === id ? { ...t, ...patch } : t));
    set({ transactions });
    await walletStore.saveUserData({ meta: get().meta ?? EMPTY_META, transactions });
  },

  /** 按 id 删除一条交易记录（转账记录滑动删除） */
  deleteTransaction: async (id) => {
    const transactions = get().transactions.filter((t) => t.id !== id);
    set({ transactions });
    await walletStore.saveUserData({ meta: get().meta ?? EMPTY_META, transactions });
  },
}));

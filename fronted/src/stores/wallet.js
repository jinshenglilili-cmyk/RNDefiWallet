// 钱包状态 store（zustand）：账号列表 / 当前账号 / 余额
//
// 存储层仍是 utils/walletStore.js（AsyncStorage + SecureStore），
// 这里只放「跨页面共享」的状态：钱包页、转账、签名等页面共用同一份 meta/balance。
// 表单类局部状态（输入中的私钥、助记词确认勾选等）仍留在各页面组件里。

import { create } from 'zustand';

import * as walletStore from '@/utils/walletStore';
import { getBalance } from '@/utils/rpc';
import { formatEther } from '@/utils/format';

export const useWalletStore = create((set) => ({
  /** 钱包元数据 { accounts, names?, types?, current }；null = 尚无钱包 */
  meta: null,
  /** 当前账号 ETH 余额（字符串，已格式化） */
  balance: null,
  /** 启动后第一次 load 是否完成（避免闪空状态） */
  ready: false,

  /** 加载钱包数据并刷新当前账号余额（钱包页每次聚焦调用） */
  load: async () => {
    const has = await walletStore.hasWallet();
    if (!has) {
      set({ meta: null, balance: null, ready: true });
      return;
    }
    const meta = await walletStore.getMeta();
    set({ meta, ready: true });
    const addr = meta.accounts[meta.current];
    if (addr) {
      getBalance(addr)
        .then((wei) => set({ balance: formatEther(wei) }))
        .catch(() => set({ balance: null }));
    } else {
      set({ balance: null });
    }
  },

  /** 创建/导入/新增账号后刷新 meta（其他页面写入了存储） */
  refreshMeta: async () => {
    set({ meta: await walletStore.getMeta() });
  },

  /** 切换当前账号 */
  switchAccount: async (index) => {
    const meta = await walletStore.switchAccount(index);
    set({ meta, balance: null });
    return meta;
  },

  /** 删除账号（删除当前账号后选中退化为最后一个） */
  deleteAccount: async (index) => {
    const meta = await walletStore.deleteAccount(index);
    set({ meta, balance: null });
    return meta;
  },

  /** 删除钱包（清空全部本地数据） */
  deleteWallet: async () => {
    await walletStore.deleteWallet();
    set({ meta: null, balance: null });
  },
}));

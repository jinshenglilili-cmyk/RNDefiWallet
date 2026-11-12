// DeFi 网络 store（zustand）：Swap/LP/借贷 三个 tab 使用的链（BSC / Ethereum 主网、Sepolia 测试网）
//
// 选择持久化在 AsyncStorage（key: defi.network.choice）。
// 链上常量（RPC / 合约地址 / 代币清单）按当前网络在 utils/defi/tokens.js 里读取；
// 组件订阅本 store，切换网络时 DeFi 页面整体重渲染并重新拉取数据。

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** 网络标识 */
export const BSC = 'bsc';
export const ETHEREUM = 'ethereum';
export const SEPOLIA = 'sepolia';

const KEY = 'defi.network.choice';

export const useDefiNetwork = create((set) => ({
  /** 当前网络 id（'bsc' | 'sepolia'） */
  network: BSC,

  /** 启动时读取持久化的选择 */
  load: async () => {
    try {
      const v = await AsyncStorage.getItem(KEY);
      if (v === BSC || v === ETHEREUM || v === SEPOLIA) set({ network: v });
    } catch {}
  },

  /** 切换网络（持久化 + 触发订阅组件重渲染） */
  setNetwork: async (network) => {
    try {
      await AsyncStorage.setItem(KEY, network);
    } catch {}
    set({ network });
  },
}));

/** 非组件代码（utils）读取当前网络 id */
export function defiNetworkId() {
  return useDefiNetwork.getState().network;
}

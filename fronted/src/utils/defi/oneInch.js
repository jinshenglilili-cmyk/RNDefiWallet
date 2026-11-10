// 1inch 聚合器（BSC, chainId 56）云端报价/兑换
//
// 1inch 的公开 API 需要 API Key（api.1inch.dev），旧域名 api.1inch.io 已逐步下线。
// 这里按官方 v6.0 / v5.2 协议实现，先试带 Key 的 dev 域名，失败再试旧域名；
// 都拿不到时抛出可读错误，UI 引导用户回退 PancakeSwap 链上报价。
//
// Swap tab 的「1inch」选项就是走这里（实验性，网络可达时可用）。

import { t as tt } from '@/i18n';

const BASES = [
  'https://api.1inch.dev/swap/v6.0/56', // 官方当前版本（需 API Key 时返回 401）
  'https://api.1inch.io/v5.2/56',       // 旧版公共网关，可能仍可用
];

/** 可选：设置 1inch API Key（设置后自动带在 dev 域名的 Authorization 头里） */
let apiKey = '';
export function setOneInchApiKey(key) {
  apiKey = key ?? '';
}

async function request(path, params) {
  const qs = new URLSearchParams(params).toString();
  let lastErr;
  for (const base of BASES) {
    try {
      const headers = { Accept: 'application/json' };
      if (apiKey && base.includes('1inch.dev')) headers.Authorization = `Bearer ${apiKey}`;
      const response = await fetch(`${base}${path}?${qs}`, { headers });
      if (!response.ok) {
        lastErr = new Error(`1inch HTTP ${response.status}`);
        continue;
      }
      return await response.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error(tt('defi.oneInch.requestFailed'));
}

/**
 * 报价：返回 { dstAmount: bigint }（目标代币最小单位）
 * @param {string} srcToken 卖出代币合约地址（原生 BNB 用 0xEeeEE... 假地址，见 swap 接口说明）
 * @param {string} dstToken 买入代币合约地址
 */
export async function quote(srcToken, dstToken, amountWei) {
  const data = await request('/quote', {
    src: srcToken,
    dst: dstToken,
    amount: amountWei.toString(),
  });
  if (!data?.dstAmount) throw new Error(tt('defi.oneInch.quoteFailed'));
  return { dstAmount: BigInt(data.dstAmount) };
}

/**
 * 生成兑换交易（发给钱包签名广播）
 * @returns {{ to: string, data: string, valueWei: bigint }}
 */
export async function buildSwap(srcToken, dstToken, amountWei, fromAddr, slippagePercent) {
  const data = await request('/swap', {
    src: srcToken,
    dst: dstToken,
    amount: amountWei.toString(),
    from: fromAddr,
    origin: fromAddr,
    slippage: String(slippagePercent),
  });
  const tx = data?.tx;
  if (!tx?.to || !tx?.data) throw new Error(tt('defi.oneInch.noTxData'));
  return {
    to: tx.to,
    data: tx.data,
    valueWei: BigInt(tx.value ?? '0'),
  };
}

/** 1inch 原生币占位地址（BSC 上 1inch 约定用 0xEeeEEeeEEeeEEeeEEeeEEeeEEeeeEeeEeeeeeEEeE 表示 BNB） */
export const NATIVE_1INCH = '0xEeeEEeeEEeeEEeeEEeeEEeeEEeeeEeeEeeeeeEEeE';

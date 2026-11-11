// DeFi JSON-RPC 客户端（Swap/LP/借贷三个 tab 共用）
//
// RPC 地址按当前 DeFi 网络（BSC 主网 / Sepolia 测试网，见 utils/defi/tokens.js
// 与 stores/defiNetwork.js）现场读取，切换网络后无需重启。
// 与主网 rpc.js 分开，避免互相影响（转账页仍走主网）。

import { t as tt } from '@/i18n';
import { net } from './tokens';

let nextId = 1;

/** 当前网络的原生币符号（BNB / ETH） */
export function nativeSymbol() {
  return net().nativeSymbol;
}

/** 当前网络的链 ID（十进制字符串，签名参数用） */
export function chainId() {
  return net().chainId;
}

/**
 * 带重试的 fetch：网络走系统代理时链路不稳（TLS 握手中途被断），
 * 与 coingecko.js 的 retryFetch 同一策略——网络层异常或 5xx 重试，4xx 直接抛
 */
async function retryFetchJson(url, options, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      lastErr = new Error(`HTTP ${response.status}`);
      // 4xx 是请求本身的问题（参数错），重试没有意义
      if (response.status < 500) throw lastErr;
    } catch (err) {
      if (err.message?.startsWith('HTTP 4')) throw err;
      lastErr = err;
    }
    // 指数退避：400ms / 800ms / 1600ms ...
    await new Promise((r) => setTimeout(r, 400 * 2 ** i));
  }
  throw lastErr;
}

/** 发送一条 JSON-RPC 请求 */
export async function rpc(method, params = []) {
  const response = await retryFetchJson(net().rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  const { result, error } = await response.json();
  if (error) {
    throw new Error(tt('defi.rpc.rpcError', { method, message: error.message ?? JSON.stringify(error) }));
  }
  return result;
}

/** eth_call：失败时抛错（调用方决定怎么兜底） */
export function ethCall(to, data) {
  return rpc('eth_call', [{ to, data }, 'latest']);
}

/** 原生币余额（wei，字符串；BNB / ETH） */
export function getBalance(address) {
  return rpc('eth_getBalance', [address, 'latest']);
}

/** 交易序号 nonce（十进制字符串） */
export async function getNonce(address) {
  const hex = await rpc('eth_getTransactionCount', [address, 'pending']);
  return BigInt(hex).toString(10);
}

/** 当前 gas 价格（wei，十进制字符串） */
export async function getGasPrice() {
  const hex = await rpc('eth_gasPrice', []);
  return BigInt(hex).toString(10);
}

/** 估算 gas 上限（十进制字符串，失败返回默认值） */
export async function estimateGas(tx) {
  try {
    const hex = await rpc('eth_estimateGas', [tx]);
    return BigInt(hex).toString(10);
  } catch {
    return '500000';
  }
}

/** 广播原始交易，返回交易哈希（节点要求 0x 前缀，原生签名返回的是裸 hex） */
export function sendRawTransaction(rawTx) {
  const raw = rawTx.startsWith('0x') ? rawTx : '0x' + rawTx;
  return rpc('eth_sendRawTransaction', [raw]);
}

/** 等待交易上链：轮询 eth_getTransactionReceipt，成功返回 receipt，超时返回 null */
export async function waitForReceipt(txHash, { intervalMs = 2000, attempts = 15 } = {}) {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
      if (receipt) return receipt;
    } catch {}
  }
  return null;
}

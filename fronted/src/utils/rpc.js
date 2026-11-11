// 以太坊 JSON-RPC 客户端
//
// 使用公共节点（无需 API Key），负责转账/浏览器 dApp 需要的链上读写：
// 余额、nonce、gas、广播、eth_call 代理。

import { t as tt } from '@/i18n';

const RPC_URL = 'https://ethereum-rpc.publicnode.com';
export const CHAIN_ID_HEX = '0x1'; // 以太坊主网

let nextId = 1;

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

/**
 * 发送一条 JSON-RPC 请求
 * @param {string} method 如 'eth_getBalance'
 * @param {Array}  params 如 [address, 'latest']
 */
export async function rpc(method, params = []) {
  const response = await retryFetchJson(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  const { result, error } = await response.json();
  if (error) {
    throw new Error(tt('wallet.rpc.methodError', { method, message: error.message }));
  }
  return result;
}

/** 余额（wei，字符串） */
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
    return '21000';
  }
}

/** 广播原始交易，返回交易哈希（节点要求 0x 前缀，原生签名返回的是裸 hex） */
export function sendRawTransaction(rawTx) {
  const raw = rawTx.startsWith('0x') ? rawTx : '0x' + rawTx;
  return rpc('eth_sendRawTransaction', [raw]);
}

/** dApp 浏览器用的只读方法白名单（直接代理到公共节点） */
const READONLY_METHODS = new Set([
  'eth_chainId',
  'net_version',
  'eth_blockNumber',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_call',
  'eth_estimateGas',
  'eth_getCode',
  'eth_getTransactionReceipt',
]);

/** dApp 只读请求直接代理；其余方法返回 null（由调用方决定怎么处理） */
export function proxyReadonly(method, params) {
  if (!READONLY_METHODS.has(method)) return null;
  return rpc(method, params);
}

// BSC JSON-RPC 客户端（DeFi 专用）
//
// DeFi 三个 tab（Swap/LP/借贷）统一走 BSC 链：PancakeSwap V2 与 Aave V3 都在
// BSC 有深度流动性。与主网 rpc.js 分开，避免互相影响（转账页仍走主网）。

const RPC_URL = 'https://bsc-rpc.publicnode.com';
/** BSC 链 ID（十进制字符串，签名参数用） */
export const CHAIN_ID = '56';
/** 原生币符号 */
export const NATIVE_SYMBOL = 'BNB';

let nextId = 1;

/** 发送一条 JSON-RPC 请求 */
export async function rpc(method, params = []) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  if (!response.ok) {
    throw new Error(`RPC 请求失败：HTTP ${response.status}`);
  }
  const { result, error } = await response.json();
  if (error) {
    throw new Error(`RPC ${method} 出错：${error.message ?? JSON.stringify(error)}`);
  }
  return result;
}

/** eth_call：失败时抛错（调用方决定怎么兜底） */
export function ethCall(to, data) {
  return rpc('eth_call', [{ to, data }, 'latest']);
}

/** BNB 余额（wei，字符串） */
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

/** 广播原始交易，返回交易哈希 */
export function sendRawTransaction(rawTx) {
  return rpc('eth_sendRawTransaction', [rawTx]);
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

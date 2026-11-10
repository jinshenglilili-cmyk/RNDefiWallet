// BSC 交易签名广播通用流程（DeFi 三个 tab 共用）
//
// 复用项目现成的签名通道：@wallet 原生模块（Trust Wallet Core）+ 助记词，
// chainId 固定 56（BSC）。DeFi 调用 = 合约 to + data（+ 可选 value）。
//
// 流程：取助记词 → nonce/gasPrice/estimateGas → 签名 → 广播 → 等回执。
// 导入私钥的账号没有交易签名通道（原生模块只支持助记词签交易），提前拦截。

import Wallet from '@wallet';
import * as walletStore from '../walletStore';
import { getNonce, getGasPrice, estimateGas, sendRawTransaction, waitForReceipt } from './bscRpc';

/**
 * 确认当前账号可签 DeFi 交易（助记词派生账号），否则抛错
 * @param {object} meta 钱包元数据
 */
export async function assertSigningAccount(meta) {
  const addr = meta?.accounts?.[meta?.current];
  if (!addr) throw new Error('请先创建钱包');
  const type = walletStore.accountType(meta, meta.current);
  if (type === 'private-key') {
    throw new Error('导入私钥的账号暂不支持 DeFi 交易，请切换到助记词账号');
  }
  return addr;
}

/**
 * 签名并广播一笔 BSC 合约交易
 * @param {object} opts
 * @param {string} opts.to 合约地址
 * @param {string} opts.data calldata（hex，带 0x）
 * @param {bigint|string} [opts.valueWei] 随交易发送的原生 BNB（wei）
 * @param {string} opts.from 发起地址
 * @param {string} opts.mnemonic 助记词
 * @returns {Promise<string>} 交易哈希
 */
export async function signAndSend({ to, data, valueWei = 0n, from, mnemonic }) {
  const [nonce, gasPrice] = await Promise.all([getNonce(from), getGasPrice()]);
  const est = await estimateGas({
    from,
    to,
    value: '0x' + BigInt(valueWei).toString(16),
    data,
  });
  // 预估 1.2 倍余量（池子状态在签名到打包之间可能变化）
  const gasLimit = ((BigInt(est) * 12n) / 10n + 10000n).toString(10);

  const rawTx = await Wallet.signTransaction('ethereum', mnemonic, {
    chainId: '56',
    nonce,
    gasPrice,
    gasLimit,
    to,
    value: BigInt(valueWei).toString(10),
    data,
  });
  return sendRawTransaction(rawTx);
}

/**
 * 带回执等待的发送：返回 { txHash, receipt }
 * receipt.status === '0x1' 视为成功；等不到回执时不代表失败（网络慢），由调用方提示
 */
export async function signAndSendWithReceipt(opts) {
  const txHash = await signAndSend(opts);
  const receipt = await waitForReceipt(txHash);
  return { txHash, receipt };
}

/**
 * 确保代币授权额度足够（不足则先发一笔 approve）
 * @returns {Promise<{ approved: boolean, txHash?: string }>}
 */
export async function ensureApproval({ tokenAddress, owner, spender, amountWei, mnemonic }) {
  const { allowance } = await import('./erc20');
  const current = await allowance(tokenAddress, owner, spender);
  if (current >= BigInt(amountWei)) {
    return { approved: true };
  }
  const { approveData } = await import('./erc20');
  const { txHash, receipt } = await signAndSendWithReceipt({
    to: tokenAddress,
    data: approveData(spender, amountWei),
    valueWei: 0n,
    from: owner,
    mnemonic,
  });
  if (receipt && receipt.status !== '0x1') {
    throw new Error('授权交易失败，请检查 BNB 余额后重试');
  }
  return { approved: true, txHash };
}

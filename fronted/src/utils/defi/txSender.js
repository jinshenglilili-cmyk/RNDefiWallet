// DeFi 交易签名广播通用流程（Swap/LP/借贷三个 tab 共用）
//
// 复用项目现成的签名通道：@wallet 原生模块（Trust Wallet Core），
// chainId 取当前 DeFi 网络（BSC 56 / Ethereum 1 / Sepolia 11155111）。
// DeFi 调用 = 合约 to + data（+ 可选 value）。
//
// 流程：取签名凭据（助记词账号走 signTransaction，私钥导入账号走
// signTransactionWithPrivateKey）→ nonce/gasPrice/estimateGas → 签名 → 广播 → 等回执。

import { Alert } from 'react-native';

import Wallet from '@wallet';
import { t as tt } from '@/i18n';
import * as walletStore from '../walletStore';
import { getNonce, getGasPrice, estimateGas, sendRawTransaction, waitForReceipt, chainId, nativeSymbol } from './bscRpc';
import { formatEther } from '../format';

/**
 * 确认当前账号可签交易（有账号即可：助记词账号与私钥导入账号都有签名通道），返回地址
 * @param {object} meta 钱包元数据
 */
export async function assertSigningAccount(meta) {
  const addr = meta?.accounts?.[meta?.current];
  if (!addr) throw new Error(tt('defi.common.noWalletCreated'));
  return addr;
}

/** 按签名凭据类型选择原生签名方法（sign: { mnemonic } 或 { privateKey }） */
function signRawTx(sign, params) {
  if (sign?.privateKey) {
    return Wallet.signTransactionWithPrivateKey('ethereum', sign.privateKey, params);
  }
  return Wallet.signTransaction('ethereum', sign.mnemonic, params);
}

/** 地址中间截断（签名确认弹框用） */
function shorten(addr, head = 8, tail = 8) {
  if (!addr) return '';
  return addr.length > head + tail + 3 ? `${addr.slice(0, head)}…${addr.slice(-tail)}` : addr;
}

/** 交易固有 gas 消耗（EIP-2028）：21000 + calldata 零字节 4 / 非零字节 16 */
function intrinsicGas(data) {
  const hex = String(data ?? '0x').replace(/^0x/i, '');
  let nonzero = 0n;
  let zero = 0n;
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) continue;
    if (byte === 0) zero += 1n; else nonzero += 1n;
  }
  return 21000n + 4n * zero + 16n * nonzero;
}

/**
 * 签名确认弹框：展示本次签名调用的合约 / 方法 / 金额 / gas 上限 / 发起账号。
 * 点「确认签名」才真正调原生签名；取消则抛错（不发交易、不消耗 gas）。
 * @returns {Promise<void>} 确认 resolve，取消 reject
 */
function requestSignConfirm({ from, to, valueWei, gasLimit, method, data }) {
  return new Promise((resolve, reject) => {
    Alert.alert(
      tt('defi.common.signConfirmTitle'),
      tt('defi.common.signConfirmBody', {
        method: method || (data ? `selector ${String(data).slice(0, 10)}` : '-'),
        to: shorten(to),
        from: shorten(from),
        value: formatEther(BigInt(valueWei ?? 0n)),
        gas: String(gasLimit),
        native: nativeSymbol(),
      }),
      [
        { text: tt('common.cancel'), style: 'cancel', onPress: () => reject(new Error(tt('defi.common.userCancel'))) },
        { text: tt('defi.common.signConfirmBtn'), style: 'default', onPress: resolve },
      ],
      { cancelable: false }
    );
  });
}

/**
 * 签名并广播一笔当前 DeFi 网络的合约交易（签名前弹签名确认框，取消则中止）
 * @param {object} opts
 * @param {string} opts.to 合约地址
 * @param {string} opts.data calldata（hex，带 0x）
 * @param {bigint|string} [opts.valueWei] 随交易发送的原生币（wei）
 * @param {string} opts.from 发起地址
 * @param {{ mnemonic?: string, privateKey?: string }} opts.sign 签名凭据（getSigningCredential 返回值）
 * @returns {Promise<string>} 交易哈希
 */
export async function signAndSend({ to, data, valueWei = 0n, from, sign, method }) {
  const [nonce, gasPrice] = await Promise.all([getNonce(from), getGasPrice()]);
  const est = await estimateGas({
    from,
    to,
    value: '0x' + BigInt(valueWei).toString(16),
    data,
  });
  // 预估 1.2 倍余量（池子状态在签名到打包之间可能变化）
  // publicnode 对带 value 的 eth_estimateGas 会返回偏低甚至错误的值（连固有消耗都不到），
  // 估算结果低于固有 gas 的 2 倍时视为不可信，改用 50 万安全上限（未用部分会退回）
  const intrinsic = intrinsicGas(data);
  let base = (BigInt(est) * 12n) / 10n + 10000n;
  if (base < intrinsic * 2n) base = 500000n;
  const gasLimit = base.toString(10);

  // 签名确认弹框：取消则整体中止（抛错给调用方提示）
  await requestSignConfirm({ from, to, valueWei, gasLimit, method, data });

  const rawTx = await signRawTx(sign, {
    chainId: chainId(),
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
export async function ensureApproval({ tokenAddress, owner, spender, amountWei, sign }) {
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
    sign,
    method: 'approve (ERC20 授权)',
  });
  if (receipt && receipt.status !== '0x1') {
    throw new Error(tt('defi.common.approveFailed', { native: nativeSymbol() }));
  }
  return { approved: true, txHash };
}

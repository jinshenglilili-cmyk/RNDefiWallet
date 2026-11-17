// ABI 编码/解码工具（基于 viem）
//
// 覆盖 DeFi 用到的类型：address/uint256/bool/address[]/string。
// encodeCall 走 viem 的完整 ABI 编码器（支持 tuple、bytes 等全部类型），
// 解码走 decodeAbiParameters；decodeWords 是裸 word 拆分（getReserves 等
// 多返回值按 32 字节取位用），保留 BigInt 输出格式不变。
//
// 对外函数签名与旧手写版一致：encodeCall/decodeWords/wordToAddress/
// decodeAddressArray/decodeString，调用方无感知。

import {
  encodeFunctionData,
  decodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  hexToBigInt,
  hexToBytes,
  toHex,
  sliceHex,
  size,
} from 'viem';
import { t as tt } from '@/i18n';

/**
 * 组装 calldata（返回 0x 前缀 hex）
 * @param {string} sig 函数签名，如 'swapExactTokensForETH(uint256,uint256,address[],address,uint256)'
 * @param {string[]} types 参数类型数组（仅用于长度校验与数值归一化，编码按 sig 自带类型）
 * @param {Array} args 参数值数组（数值传 BigInt/十进制字符串，地址传 hex 字符串）
 */
export function encodeCall(sig, types, args) {
  if (types.length !== args.length) {
    throw new Error(tt('errors.abiParamMismatch'));
  }
  const name = sig.slice(0, sig.indexOf('('));
  if (!name) throw new Error(tt('errors.abiParamMismatch'));
  // viem 的人类可读 ABI 需要带 'function ' 前缀；返回值子句可省略
  const abi = parseAbi([`function ${sig}`]);
  // 旧版调用方可能传十进制字符串，数值统一归一化为 BigInt
  const normalized = args.map((arg, i) => {
    if (/^(u?int)\d*$/.test(types[i]) && typeof arg === 'string') return BigInt(arg);
    return arg;
  });
  return encodeFunctionData({ abi, functionName: name, args: normalized });
}

/** eth_call 返回的 hex 拆成 BigInt 数组（每 32 字节一个 word） */
export function decodeWords(result) {
  if (!result || result === '0x') return [];
  const total = size(result);
  const words = [];
  for (let i = 0; i + 32 <= total; i += 32) {
    words.push(hexToBigInt(sliceHex(result, i, i + 32)));
  }
  return words;
}

/** word（BigInt）转地址（小写 hex，与旧版行为一致） */
export function wordToAddress(word) {
  const bytes = hexToBytes(toHex(BigInt(word), { size: 32 }));
  return toHex(bytes.slice(12)).toLowerCase();
}

/** 解码动态 address[] 返回值（如 V2 factory 的 pairs 列表） */
export function decodeAddressArray(result) {
  if (!result || result === '0x') return [];
  const [list] = decodeAbiParameters(parseAbiParameters('address[]'), result);
  // viem 返回带 EIP-55 校验和的地址，旧版输出小写，统一转小写保持调用方行为不变
  return (list?.result ?? []).map((a) => a.toLowerCase());
}

/** 解码动态 string 返回值（如 ERC20 symbol()） */
export function decodeString(result) {
  if (!result || result === '0x') return '';
  const [value] = decodeAbiParameters(parseAbiParameters('string'), result);
  return value?.result ?? '';
}

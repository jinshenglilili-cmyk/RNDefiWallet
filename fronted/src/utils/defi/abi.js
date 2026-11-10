// ABI 编码/解码工具（手写，覆盖 DeFi 用到的类型：address/uint256/bool/address[]）
//
// 依赖同目录 keccak256.js 计算函数选择器。
// 全部用 BigInt 处理数值，避免浮点精度问题。

import { selector } from './keccak256';
import { t as tt } from '@/i18n';

/** 金额左填充到 32 字节（64 个 hex 字符） */
export function encodeUint(value) {
  const v = BigInt(value);
  if (v < 0n) throw new Error(tt('errors.abiNegativeUint'));
  if (v >= 1n << 256n) throw new Error(tt('errors.abiUintOverflow'));
  return v.toString(16).padStart(64, '0');
}

/** 地址右填充（高位补 0）为 32 字节 word */
export function encodeAddress(addr) {
  const s = String(addr).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(s)) {
    throw new Error(tt('errors.abiInvalidAddress', { addr }));
  }
  return s.slice(2).padStart(64, '0');
}

/** bool → word */
export function encodeBool(v) {
  return (v ? '01' : '00').padStart(64, '0');
}

/**
 * 组装 calldata：selector(sig) + 静态参数 word + 动态 address[] tail
 * types/args 支持三类：'address' | 'uint256' | 'bool' | 'address[]'
 * DeFi 调用里 address[] 最多出现一次（swap 的 path），编码为末尾 tail 段
 * @param {string} sig 函数签名，如 'swapExactTokensForETH(uint256,uint256,address[],address,uint256)'
 * @param {string[]} types 参数类型数组
 * @param {Array} args 参数值数组
 */
export function encodeCall(sig, types, args) {
  if (types.length !== args.length) {
    throw new Error(tt('errors.abiParamMismatch'));
  }
  let data = selector(sig);
  let tail = '';
  // 动态数组的偏移 = head 全部 word 数 × 32（静态 word + 每个动态参数占 1 个偏移 word），
  // 因为动态数据固定排在 head 之后
  const staticCount = types.filter((t) => t !== 'address[]').length;
  const dynamicCount = types.length - staticCount;
  const dynamicOffset = 32 * (staticCount + dynamicCount);
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const arg = args[i];
    if (type === 'address') {
      data += encodeAddress(arg);
    } else if (type === 'uint256') {
      data += encodeUint(arg);
    } else if (type === 'bool') {
      data += encodeBool(arg);
    } else if (type === 'address[]') {
      data += encodeUint(dynamicOffset);
      tail = encodeUint(arg.length) + arg.map((a) => encodeAddress(a)).join('');
    } else {
      throw new Error(tt('errors.abiUnsupportedType', { type }));
    }
  }
  return data + tail;
}

/** eth_call 返回的 hex 拆成 BigInt 数组（每 32 字节一个 word） */
export function decodeWords(result) {
  if (!result || result === '0x') return [];
  let hex = result.replace(/^0x/, '');
  if (hex.length % 64 !== 0) {
    hex = hex.slice(0, Math.floor(hex.length / 64) * 64);
  }
  const words = [];
  for (let i = 0; i < hex.length; i += 64) {
    words.push(BigInt('0x' + hex.slice(i, i + 64)));
  }
  return words;
}

/** word（BigInt）转地址 */
export function wordToAddress(word) {
  return '0x' + word.toString(16).padStart(64, '0').slice(24);
}

/** 解码动态 address[] 返回值（head 偏移 + 长度 + 元素） */
export function decodeAddressArray(result) {
  const words = decodeWords(result);
  if (words.length === 0) return [];
  const offset = Number(words[0]) / 32;
  const len = Number(words[offset]);
  const out = [];
  for (let i = 0; i < len; i++) {
    out.push(wordToAddress(words[offset + 1 + i]));
  }
  return out;
}

/** 解码动态 string 返回值（如 ERC20 symbol()） */
export function decodeString(result) {
  const words = decodeWords(result);
  if (words.length < 2) return '';
  const len = Number(words[1]);
  let s = '';
  for (let i = 0; i < len; i++) {
    const byte = Number(
      (words[2 + Math.floor(i / 32)] >> BigInt(8 * (31 - (i % 32)))) & 0xffn
    );
    if (byte) s += String.fromCharCode(byte);
  }
  return s;
}

export { selector };

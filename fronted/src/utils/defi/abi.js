// ABI 编码/解码工具（基于 viem，标准 JSON ABI 形式）
//
// encodeCall 接收 JSON ABI 常量（见 ./abis.js）+ 函数名 + 参数数组，
// 走 viem 的完整 ABI 编码器（支持 tuple、bytes 等全部类型）。
// 函数名在 ABI 里查表校验：拼错 / 参数个数不符 → viem 当场报错，
// 不会生成错误的 calldata 上链。
//
// 解码用 decodeCall：按 ABI 的 outputs 直接解出值（viem decodeFunctionResult），
// 单返回值 → 值本身；多返回值 → 数组或按名字的对象；空响应 → null。

import { encodeFunctionData, decodeFunctionResult } from 'viem';

/**
 * 组装 calldata（返回 0x 前缀 hex）
 * @param {Array} abi JSON ABI 常量，如 ERC20_ABI（见 ./abis.js）
 * @param {string} functionName 函数名，如 'approve'（在 abi 中查表）
 * @param {Array} args 参数值数组（数值传 BigInt/number/十进制字符串，地址传 hex 字符串）
 */
export function encodeCall(abi, functionName, args) {
  const item = abi.find((a) => a.type === 'function' && a.name === functionName);
  if (!item) {
    throw new Error(`ABI 中没有函数 ${functionName}（检查 abis.js）`);
  }
  // 旧调用方可能传十进制字符串，数值统一归一化为 BigInt 把字符串数字转化成bigint
  const normalized = args.map((arg, i) => {
    const type = item.inputs[i]?.type ?? '';
    if (/^u?int/.test(type) && typeof arg === 'string' && /^\d+$/.test(arg)) return BigInt(arg);
    return arg;
  });
  return encodeFunctionData({ abi, functionName, args: normalized });
}

/**
 * 解码 eth_call 的返回 hex（按 abi 里该函数的 outputs）
 * @param {Array} abi JSON ABI 常量，与 encodeCall 用同一份
 * @param {string} functionName 函数名
 * @param {string} result eth_call 返回的 0x hex
 * @returns {any} outputs 只有一个 → 该值（BigInt/address/bool…）；
 *          多个 → 数组（outputs 未命名）或对象（outputs 有名字）；空响应 → null
 */
export function decodeCall(abi, functionName, result) {
  if (!result || result === '0x') return null;
  return decodeFunctionResult({ abi, functionName, data: result });
}

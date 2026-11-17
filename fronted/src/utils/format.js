// 金额与 hex 工具（全部用 BigInt，避免浮点精度问题）
//
// 单位换算交给 viem（parseUnits/formatUnits），本项目只保留：
// - 输入校验 + 中文报错（viem 报错是英文，且超长小数会四舍五入——金额必须拒绝）
// - 展示层小数位截断（formatEther 8 位 / formatTokenAmount 6 位）
// hex 转换不用 viem 的 hexToDecimal（它返回 number，大数值会超 2^53 丢精度），
// 自己用 BigInt 保证任意大小无损。

import { formatUnits, parseUnits } from 'viem';
import { t as tt } from '@/i18n';

/** viem formatUnits + 小数位截断 + 末尾去 0（内部共用）
 *
 * @param {bigint} value 最小单位数值
 * @param {number} decimals 代币精度
 * @param {number} maxFrac 最多展示的小数位
 */
export function formatUnitsCap(value, decimals, maxFrac) {
  // viem formatUnits：BigInt 换算、纯截断不四舍五入、末尾去 0
  const full = formatUnits(value, decimals);
  const [whole, frac] = full.split('.');
  if (!frac) return whole;
  const capped = frac.slice(0, maxFrac).replace(/0+$/, '');
  return capped ? `${whole}.${capped}` : whole;
}

/** 最小单位 → 可读字符串（最多 maxFrac 位小数，末尾去 0；默认按 18 位精度）
 *
 * @example formatTokenAmount(1000000n, 6) → '1'（USDT）
 *          formatTokenAmount(76221000000000000n) → '0.076221'（ETH）
 */
export function formatTokenAmount(amount, decimals = 18, maxFrac = 6) {
  return formatUnitsCap(BigInt(amount ?? 0n), decimals, maxFrac);
}

/**
 * wei 转 ETH 可读字符串（最多 8 位小数，末尾去 0）
 * @param {string|bigint} wei
 */
export function formatEther(wei) {
  return formatUnitsCap(BigInt(wei), 18, 8);
}

/** 可读字符串 → 最小单位 BigInt（内部统一入口）
 * 校验三步：正则拒绝负数/科学计数/非法字符 → 小数超长拒绝（不进位）→ viem parseUnits
 */
function parseAmount(text, decimals, invalidKey, tooManyKey) {
  const s = String(text).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(tt(invalidKey, { text }));
  }
  // viem parseUnits 对超长小数会四舍五入（1.1234567→1.123457），金额输入必须拒绝而不是进位
  const [, frac = ''] = s.split('.');
  if (frac.length > decimals) {
    throw new Error(tt(tooManyKey, { decimals }));
  }
  return parseUnits(s, decimals);
}

/**
 * ETH 金额转 wei（十进制 BigInt）
 * @param {string} eth 如 '0.01'、'1.5'
 */
export function parseEther(eth) {
  return parseAmount(eth, 18, 'errors.amountFormat', 'errors.amountDecimals');
}

/** 可读字符串 → 最小单位 BigInt（精度可变，如 USDT 传 6）
 *
 * @example parseTokenAmount('100', 6) → 100000000n
 *          parseTokenAmount('0.5', 18) → 500000000000000000n
 */
export function parseTokenAmount(text, decimals = 18) {
  return parseAmount(text, decimals, 'defi.format.invalidAmount', 'defi.format.tooManyDecimals');
}

/** 按滑点百分比计算最小输出额：amountOut × (1 - slippage)
 *
 * @example applySlippage(394800000n, 0.5) → 392826000n（报价 394.8 USDT 打 0.5% 滑点）
 */
export function applySlippage(amountOut, slippagePercent) {
  const pct = BigInt(Math.round(Number(slippagePercent || 0.5) * 100)); // 0.5% → 50
  return (amountOut * (10000n - pct)) / 10000n;
}

/** hex（带 0x）转十进制字符串 */
export function hexToDecimal(hex) {
  return BigInt(hex).toString(10);
}

/** 金额转 hex（带 0x，交易参数用） */
export function decimalToHex(decimal) {
  return '0x' + BigInt(decimal).toString(16);
}

// ---------- 行情数字格式（对齐参考项目 Extensions/Double.swift） ----------

/** 货币：$1,234.56（默认 2 位小数） */
export function formatCurrency(value, decimals = 2) {
  const num = Number(value) || 0;
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** 小币种价格：2~6 位小数 */
export function formatCurrency6(value) {
  const num = Number(value) || 0;
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

/** 大数缩写：≥1e12 → x.xTr，≥1e9 → Bn，≥1e6 → M，≥1e3 → K */
export function formatBig(value) {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}Tr`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}Bn`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

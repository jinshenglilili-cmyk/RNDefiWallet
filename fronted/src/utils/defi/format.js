// DeFi 金额格式化（18 位精度为主，全 BigInt）

import { t as tt } from '@/i18n';

/** 最小单位 → 可读字符串（最多 maxFrac 位小数，末尾去 0） */
export function formatTokenAmount(amount, decimals = 18, maxFrac = 6) {
  const v = BigInt(amount ?? 0n);
  if (v === 0n) return '0';
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, '0').slice(0, maxFrac);
  frac = frac.replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** 可读字符串 → 最小单位 BigInt（与 utils/format 的 parseEther 同规则，但精度可变） */
export function parseTokenAmount(text, decimals = 18) {
  const s = String(text).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(tt('defi.format.invalidAmount', { text }));
  }
  const [whole, frac = ''] = s.split('.');
  if (frac.length > decimals) {
    throw new Error(tt('defi.format.tooManyDecimals', { decimals }));
  }
  const base = 10n ** BigInt(decimals);
  return BigInt(whole || '0') * base + BigInt(frac.padEnd(decimals, '0') || '0');
}

/** 按滑点百分比计算最小输出额：amountOut × (1 - slippage) */
export function applySlippage(amountOut, slippagePercent) {
  const pct = BigInt(Math.round(Number(slippagePercent || 0.5) * 100)); // 0.5% → 50
  return (amountOut * (10000n - pct)) / 10000n;
}

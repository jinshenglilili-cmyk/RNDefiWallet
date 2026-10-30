// 金额与 hex 工具（全部用 BigInt，避免浮点精度问题）

/** ETH 单位：1 ETH = 10^18 wei */
const WEI_PER_ETH = 10n ** 18n;

/**
 * ETH 金额转 wei（十进制字符串）
 * @param {string} eth 如 '0.01'、'1.5'
 */
export function parseEther(eth) {
  const s = String(eth).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`金额格式不对：${eth}`);
  }
  const [whole, frac = ''] = s.split('.');
  if (frac.length > 18) {
    throw new Error('小数位最多 18 位');
  }
  return BigInt(whole || '0') * WEI_PER_ETH + BigInt(frac.padEnd(18, '0') || '0');
}

/**
 * wei 转 ETH 可读字符串（最多 8 位小数，末尾去 0）
 * @param {string|bigint} wei
 */
export function formatEther(wei) {
  const value = BigInt(wei);
  const whole = value / WEI_PER_ETH;
  const frac = (value % WEI_PER_ETH).toString().padStart(18, '0').slice(0, 8).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
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

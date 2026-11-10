// Aave V3（BSC）：存款 / 取款 / 账户数据 / 储备资产信息

import { ethCall } from './bscRpc';
import { encodeCall, decodeWords, wordToAddress } from './abi';
import { AAVE_POOL, AAVE_DATA_PROVIDER, AAVE_ORACLE } from './tokens';

/**
 * Pool.getUserAccountData
 * 返回（全部为 BigInt）：
 * - totalCollateralBase / totalDebtBase / availableBorrowsBase：USD，8 位精度
 * - currentLiquidationThreshold / ltv：百分比 × 100（如 8000 = 80%）
 * - healthFactor：1e18 精度；无负债时为 uint256 max（视为 ∞）
 */
export async function getUserAccountData(address) {
  const result = await ethCall(
    AAVE_POOL,
    encodeCall('getUserAccountData(address)', ['address'], [address])
  );
  const w = decodeWords(result);
  return {
    totalCollateralBase: w[0] ?? 0n,
    totalDebtBase: w[1] ?? 0n,
    availableBorrowsBase: w[2] ?? 0n,
    currentLiquidationThreshold: w[3] ?? 0n,
    ltv: w[4] ?? 0n,
    healthFactor: w[5] ?? 0n,
  };
}

/** 健康因子是否为「无穷大」（无任何负债） */
export function isHealthFactorMax(hf) {
  return hf >= (1n << 250n);
}

/** 健康因子格式化（1e18 精度，两位小数；∞ 直接显示） */
export function formatHealthFactor(hf) {
  if (isHealthFactorMax(hf)) return '∞';
  const whole = hf / 10n ** 18n;
  const frac = ((hf % 10n ** 18n) * 100n / 10n ** 18n).toString().padStart(2, '0');
  return `${whole}.${frac}`;
}

/**
 * DataProvider.getReserveTokensAddresses
 * @returns {{ aToken: string, stableDebtToken: string, variableDebtToken: string }}
 */
export async function reserveTokens(asset) {
  const result = await ethCall(
    AAVE_DATA_PROVIDER,
    encodeCall('getReserveTokensAddresses(address)', ['address'], [asset])
  );
  const w = decodeWords(result);
  return {
    aToken: wordToAddress(w[0] ?? 0n),
    stableDebtToken: wordToAddress(w[1] ?? 0n),
    variableDebtToken: wordToAddress(w[2] ?? 0n),
  };
}

/**
 * DataProvider.getReserveData（新版返回 12 个数值 word，无地址段）
 * 提取展示要用的字段：decimals / ltv / liquidationThreshold / active / borrowingEnabled / paused
 */
export async function reserveInfo(asset) {
  const result = await ethCall(
    AAVE_DATA_PROVIDER,
    encodeCall('getReserveData(address)', ['address'], [asset])
  );
  const w = decodeWords(result);
  if (w.length === 0) return null;
  return {
    decimals: Number(w[0] ?? 18),
    ltv: Number(w[1] ?? 0),                        // 8000 = 80%
    liquidationThreshold: Number(w[2] ?? 0),
    usageAsCollateralEnabled: Number(w[4] ?? 0) === 1,
    isActive: Number(w[5] ?? 0) === 1,
    isFrozen: Number(w[6] ?? 0) === 1,
    borrowingEnabled: Number(w[7] ?? 0) === 1,
    isPaused: Number(w[9] ?? 0) === 1,
  };
}

/** AaveOracle.getAssetPrice：USD 价格（8 位精度 BigInt） */
export async function assetPrice(asset) {
  const result = await ethCall(
    AAVE_ORACLE,
    encodeCall('getAssetPrice(address)', ['address'], [asset])
  );
  return decodeWords(result)[0] ?? 0n;
}

// ---------- 交易 calldata ----------

/** Pool.supply：存币生息（需先 approve 给 Pool） */
export function supplyData(asset, amount, onBehalfOf) {
  return encodeCall('supply(address,uint256,address,uint16)',
    ['address', 'uint256', 'address', 'uint256'],
    [asset, amount, onBehalfOf, 0]);
}

/** Pool.withdraw：取回存款（aToken 会同时销毁） */
export function withdrawData(asset, amount, to) {
  return encodeCall('withdraw(address,uint256,address)',
    ['address', 'uint256', 'address'],
    [asset, amount, to]);
}

/** USD 金额格式化（base 货币 8 位精度 → '$12.34'） */
export function formatBaseAmount(base) {
  const value = BigInt(base ?? 0n);
  const whole = value / 10n ** 8n;
  const frac = ((value % 10n ** 8n) * 100n / 10n ** 8n).toString().padStart(2, '0');
  return `$${whole}.${frac}`;
}

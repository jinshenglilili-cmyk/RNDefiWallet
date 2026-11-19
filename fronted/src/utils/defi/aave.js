// Aave V3：存款 / 取款 / 账户数据 / 储备资产信息
// 网络：BSC 主网 / Sepolia 测试网（地址见 hooks/useDefiNetwork.js 的 net()）

import { ethCall } from './bscRpc';
import { encodeCall, decodeCall } from './abi';
import { AAVE_POOL_ABI, AAVE_PROVIDER_ABI, AAVE_ORACLE_ABI } from './abis';
import { net } from '@/hooks/useDefiNetwork';

/**
 * Pool.getUserAccountData
 * 返回（全部为 BigInt）：
 * - totalCollateralBase / totalDebtBase / availableBorrowsBase：USD，8 位精度
 * - currentLiquidationThreshold / ltv：百分比 × 100（如 8000 = 80%）
 * - healthFactor：1e18 精度；无负债时为 uint256 max（视为 ∞）
 */
export async function getUserAccountData(address) {
  const result = await ethCall(
    net().aave.pool,
    encodeCall(AAVE_POOL_ABI, 'getUserAccountData', [address])
  );
  const [totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor] =
    decodeCall(AAVE_POOL_ABI, 'getUserAccountData', result) ?? [];
  return {
    totalCollateralBase: totalCollateralBase ?? 0n,
    totalDebtBase: totalDebtBase ?? 0n,
    availableBorrowsBase: availableBorrowsBase ?? 0n,
    currentLiquidationThreshold: currentLiquidationThreshold ?? 0n,
    ltv: ltv ?? 0n,
    healthFactor: healthFactor ?? 0n,
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
    net().aave.dataProvider,
    encodeCall(AAVE_PROVIDER_ABI, 'getReserveTokensAddresses', [asset])
  );
  const [aTokenAddress, stableDebtTokenAddress, variableDebtTokenAddress] =
    decodeCall(AAVE_PROVIDER_ABI, 'getReserveTokensAddresses', result) ?? [];
  const ZERO = '0x0000000000000000000000000000000000000000';
  return {
    aToken: aTokenAddress?.toLowerCase() ?? ZERO,
    stableDebtToken: stableDebtTokenAddress?.toLowerCase() ?? ZERO,
    variableDebtToken: variableDebtTokenAddress?.toLowerCase() ?? ZERO,
  };
}

/** AaveOracle.getAssetPrice：USD 价格（8 位精度 BigInt） */
export async function assetPrice(asset) {
  const result = await ethCall(
    net().aave.oracle,
    encodeCall(AAVE_ORACLE_ABI, 'getAssetPrice', [asset])
  );
  return decodeCall(AAVE_ORACLE_ABI, 'getAssetPrice', result) ?? 0n;
}

// ---------- 交易 calldata ----------

/** Pool.supply：存币生息（需先 approve 给 Pool） */
export function supplyData(asset, amount, onBehalfOf) {
  return encodeCall(AAVE_POOL_ABI, 'supply', [asset, amount, onBehalfOf, 0]);
}

/** Pool.withdraw：取回存款（aToken 会同时销毁） */
export function withdrawData(asset, amount, to) {
  return encodeCall(AAVE_POOL_ABI, 'withdraw', [asset, amount, to]);
}

/** USD 金额格式化（base 货币 8 位精度 → '$12.34'） */
export function formatBaseAmount(base) {
  const value = BigInt(base ?? 0n);
  const whole = value / 10n ** 8n;
  const frac = ((value % 10n ** 8n) * 100n / 10n ** 8n).toString().padStart(2, '0');
  return `$${whole}.${frac}`;
}

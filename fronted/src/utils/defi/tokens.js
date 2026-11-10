// DeFi 用到的 BSC 合约地址与代币清单
//
// 所有地址都在 2026-11 通过 bsc-rpc.publicnode.com 的 eth_call 逐一验证过：
// - PancakeSwap V2 Router：WETH() 返回 WBNB、factory() 返回下方 Factory
// - PancakeSwap V2 Factory：getPair(WBNB, USDT) = 0x16b9...0dae
// - Aave V3 Pool：getUserAccountData 返回 6 个 word
// - Aave aToken：DataProvider.getReserveTokensAddresses 现场查询（aBnbWBNB 等）
//
// 注意：PancakeSwap V2 Router/Factory 的 BSC 规范地址在以太坊主网上存在
// 同地址假合约（地址蹲守攻击），所以 DeFi 功能只支持 BSC。

/** PancakeSwap V2 Router 02 */
export const PANCAKE_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
/** PancakeSwap V2 Factory */
export const PANCAKE_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';

/** Aave V3 Pool（BSC） */
export const AAVE_POOL = '0x6807dc923806fE8Fd134338EABCA509979a7e0cB';
/** Aave V3 PoolDataProvider（BSC） */
export const AAVE_DATA_PROVIDER = '0xc90Df74A7c16245c5F5C5870327Ceb38Fe5d5328';
/** Aave V3 AaveOracle（BSC，价格 8 位精度 USD） */
export const AAVE_ORACLE = '0x39bc1bfDa2130d6Bb6DBEfd366939b4c7aa7C697';

/** WBNB（ERC20 包装的原生 BNB，swap/LP 路径里替代原生币） */
export const WBNB = '0xbb4CDB9CBd36B01bD1cBaEBF2De08d9173bc095c';

/** 原生币在代币列表里的占位地址（很多 UI 惯例用全 0x0 表示） */
export const NATIVE = '0x0000000000000000000000000000000000000000';

/**
 * 代币清单（全部 18 位精度，symbol/decimals 已链上核验）
 * native: true 表示原生 BNB（余额走 eth_getBalance，路径里换成 WBNB）
 */
export const TOKENS = [
  { symbol: 'BNB', name: 'BNB', address: NATIVE, decimals: 18, native: true, icon: '🟡' },
  { symbol: 'WBNB', name: 'Wrapped BNB', address: WBNB, decimals: 18, icon: '🟡' },
  { symbol: 'USDT', name: 'Tether USD', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, icon: '🟢' },
  { symbol: 'USDC', name: 'USD Coin', address: '0x8AC76a51cc950d9822D68b163fE7EAd4b155C', decimals: 18, icon: '🔵' },
  { symbol: 'CAKE', name: 'PancakeSwap', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18, icon: '🥞' },
  { symbol: 'ETH', name: 'Binance-Peg ETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18, icon: '💎' },
  { symbol: 'BTCB', name: 'Binance-Peg BTC', address: '0x7130d2A12b9BCBFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18, icon: '🟠' },
];

/** 按 symbol 找代币 */
export function tokenBySymbol(symbol) {
  return TOKENS.find((t) => t.symbol === symbol);
}

/**
 * Swap/LP 路径地址：原生 BNB 在 calldata 路径里必须用 WBNB
 */
export function pathAddress(token) {
  return token?.native ? WBNB : token?.address;
}

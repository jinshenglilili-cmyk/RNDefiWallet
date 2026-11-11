// DeFi 支持的网络配置与代币清单
//
// 当前网络来自 stores/defiNetwork.js（BSC 主网 / Sepolia 测试网，可在设置页切换）。
// 所有用到链上常量的代码（RPC、Router、Aave、代币列表）都通过 net() 现场读取，
// 切换网络后无需重启。
//
// BSC 地址在 2026-11 通过 bsc-rpc.publicnode.com 的 eth_call 逐一验证过：
// - PancakeSwap V2 Router：WETH() 返回 WBNB、factory() 返回下方 Factory
// - Aave V3 Pool：getUserAccountData 返回 6 个 word
// Sepolia 地址在 2026-11 通过 ethereum-sepolia-rpc.publicnode.com 逐一验证过：
// - Aave V3 官方部署（地址来源 @bgd-labs/aave-address-book，链上复核通过：
//   getUserAccountData 6 个 word、getReserveTokensAddresses 与地址簿一致、
//   Oracle WETH=$400/USDC=$1.00）
// - Uniswap V2（Factory/Router02/Mock 代币）为本项目部署到 Sepolia 的测试实例
//
// 注意：PancakeSwap V2 Router/Factory 的 BSC 规范地址在以太坊主网上存在
// 同地址假合约（地址蹲守攻击），所以 DeFi 功能只支持 BSC 与 Sepolia。

import { defiNetworkId, BSC, SEPOLIA } from '@/stores/defiNetwork';

/** 原生币在代币列表里的占位地址（很多 UI 惯例用全 0x0 表示） */
export const NATIVE = '0x0000000000000000000000000000000000000000';

/** BSC 主网（默认）：PancakeSwap V2 + Aave V3 */
const BSC_NET = {
  id: BSC,
  chainId: '56',
  rpcUrl: 'https://bsc-rpc.publicnode.com',
  nativeSymbol: 'BNB',
  dexName: 'PancakeSwap V2',
  // PancakeSwap V2 Router 02 / Factory
  router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
  factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
  // Aave V3（BSC）
  aave: {
    pool: '0x6807dc923806fE8Fd134338EABCA509979a7e0cB',
    dataProvider: '0xc90Df74A7c16245c5F5C5870327Ceb38Fe5d5328',
    oracle: '0x39bc1bfDa2130d6Bb6DBEfd366939b4c7aa7C697',
  },
  // 1inch 聚合器仅在 BSC 开放
  oneInch: true,
  tokens: [
    { symbol: 'BNB', name: 'BNB', address: NATIVE, decimals: 18, native: true, icon: '🟡' },
    { symbol: 'WBNB', name: 'Wrapped BNB', address: '0xbb4CDB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18, wrapped: true, icon: '🟡' },
    { symbol: 'USDT', name: 'Tether USD', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, icon: '🟢' },
    { symbol: 'USDC', name: 'USD Coin', address: '0x8AC76a51cc950d9822D68b163fE7EAd4b155C', decimals: 18, icon: '🔵' },
    { symbol: 'CAKE', name: 'PancakeSwap', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18, icon: '🥞' },
    { symbol: 'ETH', name: 'Binance-Peg ETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18, icon: '💎' },
    { symbol: 'BTCB', name: 'Binance-Peg BTC', address: '0x7130d2A12b9BCBFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18, icon: '🟠' },
  ],
};

/** Sepolia 测试网：本项目部署的 Uniswap V2（测试）+ Aave V3 官方测试部署 */
const SEPOLIA_NET = {
  id: SEPOLIA,
  chainId: '11155111',
  rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  nativeSymbol: 'ETH',
  dexName: 'Uniswap V2',
  // 本项目部署的 Uniswap V2 测试实例（2026-11-11 部署，Router 已 patch 本地编译的 init code hash）
  router: '0x6A8da309dF567a40c4A77cAd85028D08f4f8B409',
  factory: '0x40153C0594CE4dB9F12530023e3C37A89b43360a',
  // Aave V3 官方 Sepolia 部署（@bgd-labs/aave-address-book，链上核验通过）
  aave: {
    pool: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
    dataProvider: '0x3e9708d80f7B3e43118013075F7e95CE3AB31F31',
    oracle: '0x2da88497588bf89281816106C7259e31AF45a663',
    // Aave 的 WETH 储备资产（注意：其 deposit() 被限制，Sepolia 上无法 wrap 原生 ETH 存入）
    wrapped: '0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c',
  },
  oneInch: false,
  tokens: [
    // native：Sepolia ETH（gas；Router 的 WETH = 下面 wrapped 条目）
    { symbol: 'ETH', name: 'Ethereum (Sepolia)', address: NATIVE, decimals: 18, native: true, icon: '💎' },
    // 本项目自部署的标准 WETH9（Router/WETH，LP 交易对用它）
    { symbol: 'WETH', name: 'Wrapped ETH (Sepolia)', address: '0xDA2cFf019BB2311E3788B25f560cBa665F60D120', decimals: 18, wrapped: true, icon: '💎' },
    // 本项目部署的模拟币（部署后回填），用于测试 Swap / LP
    { symbol: 'USDT', name: 'Mock USDT (Sepolia)', address: '0x2dCfD916598c5AA120DF57713D8699cf7695bFe7', decimals: 6, icon: '🟢' },
    { symbol: 'USDC', name: 'Mock USDC (Sepolia)', address: '0xcABd797323843FF00BF8556d29BD8b1303e5a530', decimals: 6, icon: '🔵' },
  ],
};

const NETWORKS = { [BSC]: BSC_NET, [SEPOLIA]: SEPOLIA_NET };

/** 当前网络配置（每次调用现场读取，切换网络即生效） */
export function net() {
  return NETWORKS[defiNetworkId()] ?? BSC_NET;
}

/** 当前网络的代币清单 */
export function getTokens() {
  return net().tokens;
}

/** 按 symbol 找当前网络的代币 */
export function tokenBySymbol(symbol) {
  return getTokens().find((t) => t.symbol === symbol);
}

/** 当前网络 wrapped 原生币地址（WBNB / WETH） */
export function wrappedAddress() {
  return net().tokens.find((t) => t.wrapped)?.address;
}

/** 当前网络 wrapped 原生币符号（WBNB / WETH） */
export function wrappedSymbol() {
  return net().tokens.find((t) => t.wrapped)?.symbol;
}

/**
 * Aave 储备里的 wrapped 原生币地址（借贷用）。
 * BSC 用 WBNB；Sepolia 用 Aave 官方 WETH 储备（与 DEX 的自部署 WETH9 不同）。
 */
export function aaveWrappedAddress() {
  if (net().aave?.wrapped) return net().aave.wrapped;
  return wrappedAddress();
}

/**
 * Swap/LP 路径地址：原生币在 calldata 路径里必须用 wrapped（WBNB/WETH）
 */
export function pathAddress(token) {
  if (token?.native) return wrappedAddress();
  return token?.address;
}

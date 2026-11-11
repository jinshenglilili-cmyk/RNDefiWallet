// V2 DEX（BSC: PancakeSwap V2 / Sepolia: 本项目部署的 Uniswap V2 测试实例）
// 报价 / 兑换 / 流动性（Factory + Router）

import { ethCall } from './bscRpc';
import { t as tt } from '@/i18n';
import { encodeCall, decodeWords, wordToAddress } from './abi';
import { net, pathAddress } from './tokens';
import { parseEther, formatEther } from '../format';

/** 交易 20 分钟后过期（deadline） */
export function defaultDeadline() {
  return Math.floor(Date.now() / 1000) + 1200;
}

/** Factory.getPair：交易对地址（无该对返回 0x0 地址） */
export async function getPair(tokenA, tokenB) {
  const result = await ethCall(
    net().factory,
    encodeCall('getPair(address,address)', ['address', 'address'], [tokenA, tokenB])
  );
  return wordToAddress(decodeWords(result)[0] ?? 0n);
}

/** Pair.getReserves：返回 [reserve0, reserve1]（BigInt） */
export async function getReserves(pair) {
  const result = await ethCall(pair, encodeCall('getReserves()', [], []));
  const words = decodeWords(result);
  return [words[0] ?? 0n, words[1] ?? 0n];
}

/** Pair.totalSupply：LP 总量（BigInt） */
export async function pairTotalSupply(pair) {
  const result = await ethCall(pair, encodeCall('totalSupply()', [], []));
  return decodeWords(result)[0] ?? 0n;
}

/** Pair 的两个代币地址 [token0, token1]（Pair 是排序后的， reserves 对应 token0/token1） */
export async function pairTokens(pair) {
  const [r0, r1] = await Promise.all([
    ethCall(pair, encodeCall('token0()', [], [])),
    ethCall(pair, encodeCall('token1()', [], [])),
  ]);
  return [wordToAddress(decodeWords(r0)[0] ?? 0n), wordToAddress(decodeWords(r1)[0] ?? 0n)];
}

/**
 * Router.getAmountsOut 链上报价（自动含 0.25% 手续费）
 * @param {bigint} amountIn 输入额（最小单位）
 * @param {string[]} path 如 [WBNB, USDT]
 * @returns {bigint[]} 每个路径节点的输出额
 */
export async function getAmountsOut(amountIn, path) {
  const result = await ethCall(
    net().router,
    encodeCall('getAmountsOut(uint256,address[])', ['uint256', 'address[]'], [amountIn, path])
  );
  const words = decodeWords(result);
  // 返回 = [数组偏移, 长度, 元素...]
  if (words.length < 2) throw new Error(tt('defi.pancake.quoteFailed'));
  return words.slice(2);
}

/**
 * Router.quote：按储备比例换算（用于加流动性时算 BNB/代币搭配额）
 * quote(amountA, reserveA, reserveB) = amountA * reserveB / reserveA
 */
export async function quote(amountA, reserveA, reserveB) {
  const result = await ethCall(
    net().router,
    encodeCall('quote(uint256,uint256,uint256)', ['uint256', 'uint256', 'uint256'],
      [amountA, reserveA, reserveB])
  );
  return decodeWords(result)[0] ?? 0n;
}

// ---------- 兑换 calldata ----------

/** BNB → 代币：swapExactETHForTokens（value 携带 BNB） */
export function swapETHForTokensData(amountOutMin, path, to, deadline) {
  return encodeCall('swapExactETHForTokens(uint256,address[],address,uint256)',
    ['uint256', 'address[]', 'address', 'uint256'],
    [amountOutMin, path, to, deadline]);
}

/** 代币 → BNB：swapExactTokensForETH */
export function swapTokensForETHData(amountIn, amountOutMin, path, to, deadline) {
  return encodeCall('swapExactTokensForETH(uint256,uint256,address[],address,uint256)',
    ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
    [amountIn, amountOutMin, path, to, deadline]);
}

/** 代币 → 代币：swapExactTokensForTokens */
export function swapTokensForTokensData(amountIn, amountOutMin, path, to, deadline) {
  return encodeCall('swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
    ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
    [amountIn, amountOutMin, path, to, deadline]);
}

/** 按方向挑兑换函数，返回 { data, valueWei, spender } */
export function buildSwap(fromToken, toToken, amountInWei, amountOutMin, userAddr, deadline) {
  const router = net().router;
  const fromNative = !!fromToken?.native;
  const toNative = !!toToken?.native;
  const path = [pathAddress(fromToken), pathAddress(toToken)];
  if (fromNative) {
    return {
      to: router,
      data: swapETHForTokensData(amountOutMin, path, userAddr, deadline),
      valueWei: amountInWei,
      // 原生币直接随交易发送，不需要 approve
      approveToken: null,
      method: 'swapExactETHForTokens',
    };
  }
  if (toNative) {
    return {
      to: router,
      data: swapTokensForETHData(amountInWei, amountOutMin, path, userAddr, deadline),
      valueWei: 0n,
      approveToken: fromToken.address,
      method: 'swapTokensForETH',
    };
  }
  return {
    to: router,
    data: swapTokensForTokensData(amountInWei, amountOutMin, path, userAddr, deadline),
    valueWei: 0n,
    approveToken: fromToken.address,
    method: 'swapExactTokensForTokens',
  };
}

// ---------- 流动性 calldata ----------

/** 加流动性（ETH 侧）：addLiquidityETH */
export function addLiquidityETHData(tokenAddress, amountTokenDesired, amountTokenMin, amountBNBMin, to, deadline) {
  return encodeCall('addLiquidityETH(address,uint256,uint256,uint256,address,uint256)',
    ['address', 'uint256', 'uint256', 'uint256', 'address', 'uint256'],
    [tokenAddress, amountTokenDesired, amountTokenMin, amountBNBMin, to, deadline]);
}

/** 撤流动性（ETH 侧）：removeLiquidityETH */
export function removeLiquidityETHData(tokenAddress, liquidity, amountTokenMin, amountBNBMin, to, deadline) {
  return encodeCall('removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)',
    ['address', 'uint256', 'uint256', 'uint256', 'address', 'uint256'],
    [tokenAddress, liquidity, amountTokenMin, amountBNBMin, to, deadline]);
}

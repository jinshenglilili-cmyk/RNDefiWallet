// V2 DEX（BSC: PancakeSwap V2 / Sepolia: 本项目部署的 Uniswap V2 测试实例）
// 报价 / 兑换 / 流动性（Factory + Router）

import { ethCall } from './bscRpc';
import { t as tt } from '@/i18n';
import { encodeCall, decodeWords, wordToAddress } from './abi';
import { net, pathAddress } from '@/hooks/useDefiNetwork';
import { parseEther, formatEther } from '../format';

/**
 * 交易过期时间戳（unix 秒）：当前时间 + 20 分钟
 *
 * @example
 * 入参：无
 * 返参：1763356800（= 2025-11-17 12:00:00 UTC + 1200 秒，纯数字）
 *       塞进 swap/addLiquidity 的最后一个 uint256 参数，超过这个时间链上会拒绝执行
 */
export function defaultDeadline() {
  return Math.floor(Date.now() / 1000) + 1200;
}

/**
 * Factory.getPair：交易对地址（无该对返回 0x0 地址）
 *
 * @example
 * 入参：getPair(WETH, USDT) → eth_call 发出的 data =
 *   '0xe6a43905'                          // getPair(address,address) 选择器
 *   + WETH 地址填充成 32 字节              // '0x0000…7c07f8'
 *   + USDT 地址填充成 32 字节              // '0x0000…fcaf25'
 * 返参：'0x000000000000000000000000abc123…def' → 解码 = pair 合约地址（'0xabc…'）；
 *       没有这个交易对时返回全 0 → '0x0000000000000000000000000000000000000000'
 */
export async function getPair(tokenA, tokenB) {
  const result = await ethCall(
    net().factory,
    encodeCall('getPair(address,address)', ['address', 'address'], [tokenA, tokenB])
  );
  return wordToAddress(decodeWords(result)[0] ?? 0n);
}

/**
 * Pair.getReserves：返回 [reserve0, reserve1]（BigInt，最小单位）
 *
 * @example
 * 入参：getReserves(pair 地址) → data = '0x0900f010'（无参数，只有选择器）
 * 返参：'0x0000…0439b0 + 0000…0044c8…'（3 个 word：reserve0, reserve1, blockTimestamp）
 *       → 解码 = [76221000000000000n, 300867216000000n]
 *         （0.076221 ETH + 300.867216 USDT，USDT 6 位小数）
 * 注意 reserve0/reserve1 对应 token0/token1 的排序，不是 USDT/ETH 的展示顺序
 */
export async function getReserves(pair) {
  const result = await ethCall(pair, encodeCall('getReserves()', [], []));
  const words = decodeWords(result);
  return [words[0] ?? 0n, words[1] ?? 0n];
}

/**
 * Pair.totalSupply：LP 总量（BigInt）
 *
 * @example
 * 入参：data = '0x18160ddd'（totalSupply() 无参数）
 * 返参：'0x0000…02cb7c…' → 解码 = 478000000000n
 *       （LP 也是 ERC20，9 位小数；478000000000 / 1e9 = 478 LP 份）
 */
export async function pairTotalSupply(pair) {
  const result = await ethCall(pair, encodeCall('totalSupply()', [], []));
  return decodeWords(result)[0] ?? 0n;
}

/**
 * Pair 的两个代币地址 [token0, token1]（Pair 是按地址排序后的，reserves 对应 token0/token1）
 *
 * @example
 * 入参：data = '0x0dfe1681'（token0()）/ '0xd21220a7'（token1()）
 * 返参：'0x0000…02a2f7…' → 解码 = '0x…7c07f8'（WETH 地址）
 *       token0 = 地址小的那个，token1 = 地址大的那个（全小写比较）
 */
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
 *
 * @example
 * 入参：amountIn = 100000000000000000n（0.1 ETH）、
 *       path = ['0x…WETH地址', '0x…USDT地址']
 *       → data = '0xd06ca61f'                       // getAmountsOut(uint256,address[]) 选择器
 *         + '0x0000…016345785d8a0000'               // 0.1 ETH（1e17）
 *         + 偏移 '0x20' + 数组长度 '0x2'
 *         + WETH 地址填充 32 字节 + USDT 地址填充 32 字节
 * 返参：'0x…' 解码 words 后 = [100000000000000000n, 394800000n]
 *       （第 0 位 = 输入原样；第 1 位 = 394.8 USDT，6 位小数）
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
 *
 * @example
 * 入参：amountA = 10000000000000000n（0.01 ETH）
 *       reserveA = 76221000000000000n（池子现有 0.076221 ETH）
 *       reserveB = 300867216000000n（池子现有 300.867216 USDT）
 *       → data = '0xa1cb65ad' + 三个 uint256 各填充 32 字节
 * 返参：39480000n（= 39.48 USDT，6 位小数）
 *       即想投 0.01 ETH 就要按比例搭配 39.48 USDT
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

/**
 * BNB → 代币：swapExactETHForTokens（value 携带 BNB，calldata 只管代币侧）
 *
 * @example
 * 入参：amountOutMin = 391966800n（报价 394.8 USDT 打 0.5% 滑点）
 *       path = [WETH 地址, USDT 地址]、to = '0x1492…fD60'（收币地址）
 *       deadline = 1763356800
 * 返参：'0x7ff36ab5'                                   // swapExactETHForTokens 选择器
 *       + '0x0000…175168ea8e00'                        // amountOutMin（391.9668 USDT）
 *       + 偏移 '0x20' + 长度 '0x2' + 两个地址填充 32 字节
 *       + '0x0000…68e92100'                            // deadline
 * 注意：0.1 ETH 本身不走 data，放在交易的 value 字段里随交易发送
 */
export function swapETHForTokensData(amountOutMin, path, to, deadline) {
  return encodeCall('swapExactETHForTokens(uint256,address[],address,uint256)',
    ['uint256', 'address[]', 'address', 'uint256'],
    [amountOutMin, path, to, deadline]);
}

/**
 * 代币 → BNB：swapExactTokensForETH
 *
 * @example
 * 入参：amountIn = 100000000n（100 USDT，6 位小数）
 *       amountOutMin = 25190000000000000n（报价打滑点后至少要拿回 0.02519 ETH）
 *       path = [USDT 地址, WETH 地址]、to = '0x1492…fD60'、deadline = 1763356800
 * 返参：'0x18cbafe5'                     // swapExactTokensForETH 选择器
 *       + 五个参数按序填充 32 字节（数组参数是 偏移+长度+元素）
 * 前提：已对 Router approve 过至少 100000000（ensureApproval 会自动做）
 */
export function swapTokensForETHData(amountIn, amountOutMin, path, to, deadline) {
  return encodeCall('swapExactTokensForETH(uint256,uint256,address[],address,uint256)',
    ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
    [amountIn, amountOutMin, path, to, deadline]);
}

/**
 * 代币 → 代币：swapExactTokensForTokens
 *
 * @example
 * 入参：amountIn = 100000000n（100 USDT）、amountOutMin = 99950000n（99.95 USDC）
 *       path = [USDT 地址, USDC 地址]、to = '0x1492…fD60'、deadline = 1763356800
 * 返参：'0x38ed1739'                     // swapExactTokensForTokens 选择器
 *       + 五个参数按序填充 32 字节（数组参数是 偏移+长度+元素）
 * 前提：已对 Router approve 过 fromToken（USDT）
 */
export function swapTokensForTokensData(amountIn, amountOutMin, path, to, deadline) {
  return encodeCall('swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
    ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
    [amountIn, amountOutMin, path, to, deadline]);
}

/**
 * 按方向挑兑换函数，返回 { data, valueWei, spender }
 *
 * @example
 * 入参：fromToken = {native: true}（卖 BNB/ETH）、toToken = {address: '0x…USDT'}
 *       amountInWei = 100000000000000000n（0.1 ETH）、amountOutMin = 391966800n
 *       userAddr = '0x1492…fD60'、deadline = 1763356800
 * 返参：{
 *   to: '0x…Router 地址',                  // 交易发给 Router
 *   data: '0x7ff36ab5…',                   // swapETHForTokensData 的结果
 *   valueWei: 100000000000000000n,         // 卖原生币：金额放 value；其他方向 0n
 *   approveToken: null,                    // 卖原生币不用授权；卖代币 = fromToken.address
 *   method: 'swapExactETHForTokens',       // 仅用于签名确认弹框展示
 * }
 * 调用方（swap 页面）拿返回值走 ensureApproval(approveToken) → signAndSendWithReceipt
 */
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

/**
 * 加流动性（ETH 侧）：addLiquidityETH
 *
 * @example
 * 入参：tokenAddress = '0x…USDT 地址'
 *       amountTokenDesired = 394800000n（394.8 USDT，按 quote 算出的搭配额）
 *       amountTokenMin = 392826000n（打 0.5% 滑点）
 *       amountBNBMin = 99500000000000000n（0.1 ETH 打滑点）
 *       to = '0x1492…fD60'、deadline = 1763356800
 * 返参：'0xf305d719'                     // addLiquidityETH 选择器
 *       + 六个参数按序填充 32 字节
 * 交易的 value = 0.1 ETH（BNB 侧随交易发）；发之前要先 approve Router 动 USDT
 */
export function addLiquidityETHData(tokenAddress, amountTokenDesired, amountTokenMin, amountBNBMin, to, deadline) {
  return encodeCall('addLiquidityETH(address,uint256,uint256,uint256,address,uint256)',
    ['address', 'uint256', 'uint256', 'uint256', 'address', 'uint256'],
    [tokenAddress, amountTokenDesired, amountTokenMin, amountBNBMin, to, deadline]);
}

/**
 * 撤流动性（ETH 侧）：removeLiquidityETH
 *
 * @example
 * 入参：tokenAddress = '0x…USDT 地址'
 *       liquidity = 239000000000n（239 LP 份，9 位小数，amountWei 数量）
 *       amountTokenMin = 157000000n（至少拿回 157 USDT）、amountBNBMin = 38000000000000000n（至少 0.038 ETH）
 *       to = '0x1492…fD60'、deadline = 1763356800
 * 返参：'0x02751ce9'                     // removeLiquidityETH 选择器
 *       + 六个参数按序填充 32 字节
 * 交易的 value = 0n（不付原生币）；但 LP 凭证本身要先 approve Router（pair 也是 ERC20）
 */
export function removeLiquidityETHData(tokenAddress, liquidity, amountTokenMin, amountBNBMin, to, deadline) {
  return encodeCall('removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)',
    ['address', 'uint256', 'uint256', 'uint256', 'address', 'uint256'],
    [tokenAddress, liquidity, amountTokenMin, amountBNBMin, to, deadline]);
}

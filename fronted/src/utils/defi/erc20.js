// ERC-20 只读调用与 approve 数据构造

import { ethCall } from './bscRpc';
import { encodeCall, decodeWords } from './abi';

/** 余额（BigInt，按代币最小单位）
 *
 * @example
 * 入参：balanceOf('0x…USDT 地址', '0x1492…fD60') → data = '0x70a08231' + 地址填充 32 字节
 * 返参：999699132784n（= 999699.132784 USDT，6 位小数）
 */
export async function balanceOf(tokenAddress, owner) {
  const result = await ethCall(
    tokenAddress,
    encodeCall('balanceOf(address)', ['address'], [owner])
  );
  return decodeWords(result)[0] ?? 0n;
}

/** 精度（number）
 *
 * @example
 * 入参：data = '0x313ce567'（decimals() 无参数）
 * 返参：6（USDT/USDC 是 6；多数代币 18）
 */
export async function decimals(tokenAddress) {
  const result = await ethCall(tokenAddress, encodeCall('decimals()', [], []));
  return Number(decodeWords(result)[0] ?? 18);
}

/** 授权额度（BigInt）
 *
 * @example
 * 入参：allowance('0x…USDT', '0x1492…fD60', '0x…Router') → data = '0xdd62ed3e' + 两个地址各填充 32 字节
 * 返参：0n（还没授权）或 '1000000000000000000000000n'（上次 approve 留下的额度）
 */
export async function allowance(tokenAddress, owner, spender) {
  const result = await ethCall(
    tokenAddress,
    encodeCall('allowance(address,address)', ['address', 'address'], [owner, spender])
  );
  return decodeWords(result)[0] ?? 0n;
}

/** approve calldata（approve 给 spender 花 amount）
 *
 * @example
 * 入参：approveData('0x…Router', 100000000n) → 返参 calldata =
 *   '0x095ea7b3'                        // approve(address,uint256) 选择器
 *   + '0x0000…10ED…24E5'                // spender = Router 地址填充 32 字节
 *   + '0x0000…05f5e100'                 // amount = 100000000（100 USDT，6 位小数）
 * 发这笔交易后 Router 才能从你的地址 transferFrom 最多 100 USDT
 */
export function approveData(spender, amount) {
  return encodeCall('approve(address,uint256)', ['address', 'uint256'], [spender, amount]);
}

/** WBNB.wrap：原生 BNB 存成 WBNB 的 calldata（value 携带 BNB）
 *
 * @example
 * 入参：无参数 → 返参 calldata = '0xd0e30db0'（只有 deposit() 选择器）
 * 兑换比例固定 1:1：value 发 1000000000000000000n（1 BNB）→ 得到 1e18 WBNB
 */
export function wbnbDepositData() {
  return encodeCall('deposit()', [], []);
}

/** WBNB.unwrap：WBNB 取回原生 BNB 的 calldata
 *
 * @example
 * 入参：amount = 500000000000000000n（0.5 WBNB）
 * 返参：'0x2e1a7d4d' + '0x0000…06f05b59d3b20000'（0.5e18 填充 32 字节）
 * 1:1 烧掉 0.5 WBNB，退回 0.5 BNB；这笔交易 value = 0n
 */
export function wbnbWithdrawData(amount) {
  return encodeCall('withdraw(uint256)', ['uint256'], [amount]);
}

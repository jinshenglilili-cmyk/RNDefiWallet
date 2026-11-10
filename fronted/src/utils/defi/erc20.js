// ERC-20 只读调用与 approve 数据构造

import { ethCall } from './bscRpc';
import { encodeCall, decodeWords } from './abi';

/** 余额（BigInt，按代币最小单位） */
export async function balanceOf(tokenAddress, owner) {
  const result = await ethCall(
    tokenAddress,
    encodeCall('balanceOf(address)', ['address'], [owner])
  );
  return decodeWords(result)[0] ?? 0n;
}

/** 精度（number） */
export async function decimals(tokenAddress) {
  const result = await ethCall(tokenAddress, encodeCall('decimals()', [], []));
  return Number(decodeWords(result)[0] ?? 18);
}

/** 授权额度（BigInt） */
export async function allowance(tokenAddress, owner, spender) {
  const result = await ethCall(
    tokenAddress,
    encodeCall('allowance(address,address)', ['address', 'address'], [owner, spender])
  );
  return decodeWords(result)[0] ?? 0n;
}

/** approve calldata（approve 给 spender 花 amount） */
export function approveData(spender, amount) {
  return encodeCall('approve(address,uint256)', ['address', 'uint256'], [spender, amount]);
}

/** WBNB.wrap：原生 BNB 存成 WBNB 的 calldata（value 携带 BNB） */
export function wbnbDepositData() {
  return encodeCall('deposit()', [], []);
}

/** WBNB.unwrap：WBNB 取回原生 BNB 的 calldata */
export function wbnbWithdrawData(amount) {
  return encodeCall('withdraw(uint256)', ['uint256'], [amount]);
}

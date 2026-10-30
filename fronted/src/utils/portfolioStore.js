// 持仓数据（对齐参考项目 PortfolioDataService）
//
// 参考项目用 CoreData 存 PortfolioEntity { coinID, amount }，这里用 AsyncStorage
// 存同样的结构：[{ coinID, amount }]。持仓是全局一份，与钱包账号无关。

import AsyncStorage from '@react-native-async-storage/async-storage';

const PORTFOLIO_KEY = 'market.portfolio';

/** 读取全部持仓：[{ coinID, amount }] */
export async function getPortfolio() {
  const raw = await AsyncStorage.getItem(PORTFOLIO_KEY);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 更新某个币的持仓数量（对齐 updatePortfolio(coin, amount)）：
 * amount > 0 新增/更新；amount <= 0 删除该条
 */
export async function updatePortfolio(coinID, amount) {
  const list = await getPortfolio();
  const filtered = list.filter((p) => p.coinID !== coinID);
  if (amount > 0) {
    filtered.push({ coinID, amount });
  }
  await AsyncStorage.setItem(PORTFOLIO_KEY, JSON.stringify(filtered));
  return filtered;
}

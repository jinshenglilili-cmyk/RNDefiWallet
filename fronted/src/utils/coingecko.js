// CoinGecko 公开行情接口（免费、无需 Key，有频率限制）
// 网络走系统代理时链路可能不稳定（TLS 握手中途被断），
// 统一用 retryFetch 多试几次，成功率能从单次 ~30% 提到 ~85%

const BASE = 'https://api.coingecko.com/api/v3';

/** 带重试的 fetch：网络层异常或 5xx 时重试，最多 attempts 次 */
async function retryFetch(url, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      // 4xx 是请求本身的问题（限频/参数错），重试没有意义
      if (response.status < 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      lastErr = new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (err.message?.startsWith('HTTP 4')) throw err;
      lastErr = err;
    }
    // 指数退避：400ms / 800ms / 1600ms ...
    await new Promise((r) => setTimeout(r, 400 * 2 ** i));
  }
  throw lastErr;
}

/** 首页行情列表（按市值排序前 N 个） */
export async function getMarkets(perPage = 50) {
  const url = `${BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=true&price_change_percentage=24h`;
  const response = await retryFetch(url);
  return response.json();
}

/** 全局行情（总市值/24h 总量/BTC 占比），对齐参考项目 MarketDataService */
export async function getGlobal() {
  const url = `${BASE}/global`;
  const response = await retryFetch(url);
  const { data } = await response.json();
  return {
    totalMarketCap: data.total_market_cap?.usd ?? 0,
    totalVolume: data.total_volume?.usd ?? 0,
    btcDominance: data.market_cap_percentage?.btc ?? 0,
    marketCapChange24h: data.market_cap_change_percentage_24h_usd ?? 0,
  };
}

/** 币种详情（价格/市值/涨跌/描述） */
export async function getCoin(id) {
  const url = `${BASE}/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`;
  const response = await retryFetch(url);
  return response.json();
}

/** 7 天价格走势（[[timestamp, price], ...]） */
export async function getMarketChart(id, days = 7) {
  const url = `${BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const response = await retryFetch(url);
  const { prices } = await response.json();
  return prices;
}

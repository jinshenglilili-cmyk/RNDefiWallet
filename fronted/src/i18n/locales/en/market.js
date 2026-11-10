// Market domain (Market tab / coin detail / edit holdings)
export default {
  stats: {
    marketCap: 'Market Cap',
    volume24h: '24h Volume',
    btcDominance: 'BTC Dominance',
    portfolioValue: 'Holdings Value',
  },
  tab: {
    prices: 'Live Prices',
    portfolio: 'Portfolio',
  },
  list: {
    loading: 'Loading prices…',
    loadFailed: 'Failed to load prices (check network/proxy)',
  },
  search: {
    placeholder: 'Search by name or symbol…',
  },
  col: {
    coin: 'Coin',
    holdings: 'Holdings',
    price: 'Price',
  },
  empty: {
    hint: "You haven't added any holdings yet.\nTap the ＋ button in the top left to get started! 🧐",
  },
  sheet: {
    title: 'Edit Holdings',
    save: 'Save',
    searchPlaceholder: 'Search coins to add…',
    noMatch: 'No matching coins',
    currentPrice: '%{name} current price %{price}',
    quantityLabel: 'Holdings amount',
    quantityPlaceholder: 'e.g. 1.4',
    valueLabel: 'Current value',
    removeHint: 'Set the amount to 0 and save to remove it from your holdings',
    pickHintToAdd: 'Tap a coin to add a holding',
    pickHintSearch: 'Your holdings are shown above; search to add new coins',
  },
  detail: {
    title: 'Details',
    loadFailed: 'Failed to load',
    currentPrice: 'Current Price',
    rank: 'Rank',
    volume24h: '24h Volume',
    high24h: '24h High',
    low24h: '24h Low',
    circulatingSupply: 'Circulating Supply',
    totalSupply: 'Total Supply',
    noChartData: 'No chart data',
    overview: 'Overview',
    moreData: 'More Data',
    collapse: 'Show Less',
    expand: 'Read more…',
  },
};

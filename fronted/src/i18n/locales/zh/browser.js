// DApp 浏览器
export default {
  title: '浏览器',
  urlPlaceholder: '输入网址…',
  go: '前往',
  quickLinks: '快捷入口',
  invalidUrlTitle: '网址不对',
  invalidUrlMessage: '请输入合法的网址',
  eip1193Note:
    '浏览器内置 EIP-1193 Provider：dApp 可以请求你的账号、\n请求签名（会弹审批窗），签名由原生钱包模块完成，\n私钥不进入网页。',
  // 快捷入口描述
  dapps: {
    walletconnectTest: 'WC 官方测试',
    metamaskTest: 'MetaMask 测试',
    uniswap: '去中心化交易',
    etherscan: '区块浏览器',
  },
  // 审批弹窗 / 连接状态
  noWallet: '尚未创建钱包，请先到「钱包」Tab 创建',
  notConnected: '未连接钱包（请先到「钱包」Tab 创建）',
  builtInWallet: '内置钱包',
  requestConnect: '连接钱包',
  requestSign: '签名消息',
  requestSend: '发送交易',
  requestRejected: '用户拒绝了请求',
  confirmTx: '请确认以下交易详情',
  confirmSign: '请确认以下签名消息来自当前页面',
  confirmConnect: '该页面请求连接你的内置钱包账号',
  empty: '（空）',
  reject: '拒绝',
  approve: '批准',
  debugRequest: '收到请求 #%{id} %{method}',
  unsupportedMethod: '暂不支持的方法： %{method}',
};

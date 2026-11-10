// WalletConnect 连接（dApp 端）
export default {
  connect: {
    title: '连接钱包',
    notConfiguredTitle: '尚未配置 WalletConnect',
    notConfiguredSteps:
      '1. 到 cloud.walletconnect.com 免费注册一个 Project ID\n2. 写入 fronted/.env：\n     EXPO_PUBLIC_WC_PROJECT_ID=你的ID\n3. 重启 Metro（npm start -c）',
    connectedWallet: '已连接钱包',
    signMessage: '签名消息',
    waitingWallet: '等待钱包处理…',
    disconnect: '断开连接',
    scanHint: '用 MetaMask / Trust 等 App 扫码连接',
    intro:
      '通过 WalletConnect 协议连接 MetaMask、Trust Wallet 等外部钱包，\n无需导出私钥即可签名交易和消息。',
    connectButton: '连接外部钱包',
    connecting: '正在建立连接…',
    connectSuccess: '连接成功',
    connectFailed: '连接失败',
    signSuccess: '签名成功',
    signFailed: '签名失败',
    disconnectFailed: '断开失败',
  },
  missingProjectId:
    '缺少 WalletConnect Project ID，请在 fronted/.env 中配置 EXPO_PUBLIC_WC_PROJECT_ID',
  generateUriFailed: '生成连接 URI 失败',
  metadataDescription: 'RN 课程项目：内嵌钱包 + WalletConnect',
};

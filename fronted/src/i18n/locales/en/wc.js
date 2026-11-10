// WalletConnect (dApp side)
export default {
  connect: {
    title: 'Connect Wallet',
    notConfiguredTitle: 'WalletConnect Not Configured',
    notConfiguredSteps:
      '1. Register a free Project ID at cloud.walletconnect.com\n2. Add it to fronted/.env:\n     EXPO_PUBLIC_WC_PROJECT_ID=your_id\n3. Restart Metro (npm start -c)',
    connectedWallet: 'Connected Wallet',
    signMessage: 'Sign Message',
    waitingWallet: 'Waiting for wallet…',
    disconnect: 'Disconnect',
    scanHint: 'Scan the QR code with MetaMask, Trust or another wallet',
    intro:
      'Connect external wallets like MetaMask or Trust Wallet via the WalletConnect protocol.\nSign transactions and messages without exporting your private key.',
    connectButton: 'Connect External Wallet',
    connecting: 'Connecting…',
    connectSuccess: 'Connected',
    connectFailed: 'Connection Failed',
    signSuccess: 'Signed Successfully',
    signFailed: 'Signature Failed',
    disconnectFailed: 'Disconnect Failed',
  },
  missingProjectId:
    'WalletConnect Project ID is missing. Set EXPO_PUBLIC_WC_PROJECT_ID in fronted/.env',
  generateUriFailed: 'Failed to generate connect URI',
  metadataDescription: 'RN course project: embedded wallet + WalletConnect',
};

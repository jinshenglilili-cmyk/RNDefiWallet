// DApp browser
export default {
  title: 'Browser',
  urlPlaceholder: 'Enter URL…',
  go: 'Go',
  quickLinks: 'Quick Links',
  invalidUrlTitle: 'Invalid URL',
  invalidUrlMessage: 'Please enter a valid URL',
  eip1193Note:
    'The browser has a built-in EIP-1193 Provider: dApps can request your account\nand request signatures (an approval dialog pops up). Signing is done by the\nnative wallet module — private keys never enter the web page.',
  // Quick link descriptions
  dapps: {
    walletconnectTest: 'Official WC test',
    metamaskTest: 'MetaMask test',
    uniswap: 'Decentralized exchange',
    etherscan: 'Block explorer',
  },
  // Approval dialog / connection status
  noWallet: 'No wallet yet. Create one in the Wallet tab first',
  notConnected: 'Wallet not connected (create one in the Wallet tab first)',
  builtInWallet: 'Built-in Wallet',
  requestConnect: 'Connect Wallet',
  requestSign: 'Sign Message',
  requestSend: 'Send Transaction',
  requestRejected: 'User rejected the request',
  confirmTx: 'Please review the transaction details below',
  confirmSign: 'Please confirm this signature request is from the current page',
  confirmConnect: 'This page requests to connect to your built-in wallet account',
  empty: '(empty)',
  reject: 'Reject',
  approve: 'Approve',
  debugRequest: 'Request #%{id} %{method}',
  unsupportedMethod: 'Unsupported method: %{method}',
};

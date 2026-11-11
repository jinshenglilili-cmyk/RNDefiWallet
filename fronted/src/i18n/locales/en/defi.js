// DeFi domain strings (Swap / LP / Lending tabs + shared components and util errors)
export default {
  common: {
    // Sign-in guard (DefiGuard)
    pleaseLogin: 'Please sign in first',
    noWallet: 'No wallet yet',
    loginHint: 'Sign in to use Swap, Liquidity and Lending',
    walletHint: 'Create or import a wallet to use DeFi features',
    addWalletTitle: 'Add Wallet',
    addWalletMessage: 'Create a new wallet or import an existing one?',
    createWallet: 'Create Wallet',
    importWallet: 'Import Wallet',
    goLogin: 'Sign In',
    goAddWallet: 'Add Wallet',
    // Token picker sheet (TokenSheet)
    selectToken: 'Select Token',
    tokenSheetTip: 'Only common BSC tokens are shown. BNB is the native coin (gas balance included); swap routes go through WBNB automatically.',
    // Transaction results / status
    txHashAlert: 'Tx Hash:\n%{hash}',
    revert: 'Contract execution failed (revert)',
    // txSender errors
    noWalletCreated: 'Create a wallet first',
    privateKeyUnsupported: 'Private-key accounts cannot sign DeFi transactions. Switch to a mnemonic account',
    approveFailed: 'Approval transaction failed. Check your BNB balance and retry',
  },

  swap: {
    headerSubtitle: 'PancakeSwap V2 · 1inch · BSC',
    providerPancake: 'PancakeSwap V2 (on-chain quote)',
    providerOneInch: '1inch aggregator (experimental)',
    oneInchUnavailable: '1inch quote unavailable (needs network or API key). Use PancakeSwap instead',
    sell: 'Sell',
    buy: 'Buy',
    balance: 'Balance %{amount}',
    insufficientBalance: 'Insufficient %{symbol} balance',
    quoteStale: 'Quote expired, please refresh',
    slippageRange: 'Slippage must be between 0.01% and 50%',
    confirmTitle: 'Confirm Swap',
    confirmBody: '%{amount} %{from} → ≥%{est} %{to}\nProtocol: %{router} (BSC)\nSlippage: %{slip}%',
    success: 'Swap Successful',
    failed: 'Swap Failed',
    cannotSwap: 'Cannot Swap',
    slippageLabel: 'Slippage Tolerance (%)',
    customSlippage: 'Custom',
    btnBusy: 'Processing transaction…',
    btnQuoting: 'Getting quote…',
    btnSwap: 'Swap',
    btnEnterAmount: 'Enter an amount to get a quote',
    tip: 'Swaps execute on BSC and need a small amount of BNB for gas. PancakeSwap V2 fee is 0.25%. 1inch is an aggregated router (experimental); when unreachable, you will be prompted to use PancakeSwap. Approval is only sent when the allowance is insufficient.',
  },

  lp: {
    headerTitle: 'LP Liquidity',
    headerSubtitle: 'PancakeSwap V2 · BSC · Add / Remove Liquidity',
    // Detail page nav title (overridden in-page by "PAIR / BNB")
    detailTitle: 'Add / Remove Liquidity',
    loadingPools: 'Loading pools…',
    noPools: 'No pools available or failed to load. Pull down to retry',
    myShare: 'My share %{share}%',
    poolReserve: 'Pool: %{bnb} BNB + %{token} %{symbol}',
    myLp: 'My LP: %{amount}',
    poolHint: 'Tap to add liquidity (BNB + %{symbol})',
    addSection: 'Add Liquidity',
    removeSection: 'Remove Liquidity',
    tokenAmountPlaceholder: '%{symbol} amount',
    pairHint: 'Est. paired: %{hint}',
    pairHintAuto: 'Calculated automatically after entering an amount',
    pairHintValue: ' %{amount} BNB',
    tokenBalance: 'Token balance: %{amount}',
    lpAmountPlaceholder: 'LP amount',
    // Busy texts
    busyApprovingRouter: 'Approving Router…',
    busyApprovingLp: 'Approving LP Token…',
    busySigning: 'Signing & broadcasting…',
    // Results
    addSuccess: 'Liquidity Added',
    addFailed: 'Add Failed',
    removeSuccess: 'Liquidity Removed',
    removeFailed: 'Remove Failed',
    addErrorTitle: 'Add Liquidity Failed',
    removeErrorTitle: 'Remove Liquidity Failed',
    // Validation errors
    needTokenAmount: 'Enter a token amount',
    insufficientBnb: 'Insufficient BNB balance (incl. 0.01 BNB gas reserve)',
    needLpAmount: 'Enter an LP amount to remove',
    lpExceeded: 'Exceeds your LP balance',
    tip: 'Adding pairs BNB automatically at the current pool ratio; removing returns both tokens by LP share. Minimum amounts include 0.5% slippage protection. The first action needs an approval (approve) transaction.',
  },

  lend: {
    headerTitle: 'Lending',
    headerSubtitle: 'Aave V3 · BSC · Earn interest',
    // Detail page nav title (overridden in-page by "ASSET · Aave V3")
    detailTitle: 'Supply / Withdraw',
    // Account overview
    accountOverview: 'Account Overview',
    totalCollateral: 'Total Collateral',
    totalDebt: 'Total Debt',
    healthFactor: 'Health Factor',
    hfHint: 'A health factor below 1 risks liquidation (current liquidation threshold %{threshold}%)',
    loadingAccount: 'Loading account data…',
    accountLoadFailed: 'Failed to load account data. Pull down to retry',
    // Deposit list (merged asset list: wallet balance + existing deposit amount; loading/no-deposit texts reused by the detail page)
    loadingDeposits: 'Loading deposits…',
    noDeposits: 'No deposits yet. Tap an asset below to deposit and start earning.',
    supplyAssets: 'Assets to Supply',
    balance: 'Balance %{amount}',
    appendOrWithdraw: 'Add / Withdraw',
    supplyHint: 'Supply',
    // Sheet
    supplySection: 'Supply',
    withdrawSection: 'Withdraw',
    amountPlaceholder: '%{symbol} amount',
    currentDeposit: 'Current deposit: %{amount} %{symbol}',
    sheetTip: 'Depositing mints aTokens (interest-bearing). Withdrawing burns aTokens to redeem your assets.',
    // Busy / step texts
    stepWrap: 'Wrapping BNB → WBNB…',
    stepApprove: 'Approving %{symbol}…',
    stepSupply: 'Supplying to Aave…',
    stepWithdraw: 'Withdrawing…',
    stepWithdrawNative: 'Withdrawing WBNB…',
    stepUnwrap: 'Unwrapping WBNB → BNB…',
    recordSupply: 'Supply %{amount} %{symbol}',
    recordWithdraw: 'Withdraw %{amount} %{symbol}',
    // Results
    supplySuccess: 'Deposit Successful',
    supplyFailed: 'Supply Failed',
    withdrawSuccess: 'Withdrawal Successful',
    withdrawFailed: 'Withdrawal Failed',
    // Validation errors
    needAmount: 'Enter an amount',
    insufficientBalance: 'Insufficient %{symbol} balance',
    insufficientBalanceNative: 'Insufficient %{symbol} balance (0.01 BNB gas reserved)',
    needWithdrawAmount: 'Enter a withdrawal amount',
    exceedsDeposit: 'Exceeds current deposit',
    tip: 'Deposits earn interest via Aave V3 (aToken amount grows over time). BNB is wrapped to WBNB on deposit and unwrapped on withdrawal. Borrowing is not available yet; debt is display only. The first deposit of an asset needs an approval (approve) transaction. Deposits carry liquidation risk — watch your health factor.',
  },

  rpc: {
    httpError: 'RPC request failed: HTTP %{status}',
    rpcError: 'RPC %{method} error: %{message}',
  },

  pancake: {
    quoteFailed: 'Quote failed: insufficient pool liquidity',
  },

  oneInch: {
    requestFailed: '1inch request failed',
    quoteFailed: '1inch quote failed',
    noTxData: '1inch returned no transaction data',
  },

  format: {
    invalidAmount: 'Invalid amount format: %{text}',
    tooManyDecimals: 'At most %{decimals} decimal places',
  },
};

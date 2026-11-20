// 各合约的 JSON ABI 常量（viem 通用形式，与链上部署版本对应）
//
// 只声明本项目实际调用到的函数。inputs 用于编码时的参数类型校验
// （函数名拼错 / 参数个数错 → viem 当场报错，不会生成错误的 calldata 上链）；
// outputs 供 viem 的 decodeFunctionResult 使用。
// 来源：以太坊标准 JSON ABI 格式，可从编译产物 / etherscan 直接复制对照。

/** ERC20 标准（所有代币合约通用） */
export const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
];

/** WETH/WBNB：原生币 1:1 包装（deposit 随 value 存入，withdraw 烧币退原生币） */
export const WETH_ABI = [
  { type: 'function', name: 'deposit', stateMutability: 'payable',
    inputs: [], outputs: [] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
];

/** Uniswap V2 Factory：交易对登记处 */
export const FACTORY_ABI = [
  { type: 'function', name: 'getPair', stateMutability: 'view',
    inputs: [{ name: 'tokenA', type: 'address' }, { name: 'tokenB', type: 'address' }],
    outputs: [{ name: '', type: 'address' }] },
];

/** Uniswap V2 Pair：交易对合约（池子 + LP 凭证，本身也是 ERC20） */
export const PAIR_ABI = [
  { type: 'function', name: 'getReserves', stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint112' }, { name: '', type: 'uint112' }, { name: '', type: 'uint32' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'token0', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'token1', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }] },
];

/** Uniswap V2 Router：兑换与流动性的用户入口 */
export const ROUTER_ABI = [
  { type: 'function', name: 'getAmountsOut', stateMutability: 'view',
    inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'path', type: 'address[]' }],
    outputs: [{ name: '', type: 'uint256[]' }] },
  { type: 'function', name: 'quote', stateMutability: 'view',
    inputs: [{ name: 'amountA', type: 'uint256' }, { name: 'reserveA', type: 'uint256' }, { name: 'reserveB', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'swapExactETHForTokens', stateMutability: 'payable',
    inputs: [{ name: 'amountOutMin', type: 'uint256' }, { name: 'path', type: 'address[]' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]' }] },
  { type: 'function', name: 'swapExactTokensForETH', stateMutability: 'nonpayable',
    inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'amountOutMin', type: 'uint256' }, { name: 'path', type: 'address[]' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]' }] },
  { type: 'function', name: 'swapExactTokensForTokens', stateMutability: 'nonpayable',
    inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'amountOutMin', type: 'uint256' }, { name: 'path', type: 'address[]' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]' }] },
  { type: 'function', name: 'addLiquidityETH', stateMutability: 'payable',
    inputs: [{ name: 'token', type: 'address' }, { name: 'amountTokenDesired', type: 'uint256' }, { name: 'amountTokenMin', type: 'uint256' }, { name: 'amountETHMin', type: 'uint256' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }, { name: '', type: 'uint256' }, { name: '', type: 'uint256' }] },
  { type: 'function', name: 'removeLiquidityETH', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }, { name: 'liquidity', type: 'uint256' }, { name: 'amountTokenMin', type: 'uint256' }, { name: 'amountETHMin', type: 'uint256' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }, { name: '', type: 'uint256' }] },
];

/** Aave V3 Pool：存取款入口 */
export const AAVE_POOL_ABI = [
  { type: 'function', name: 'getUserAccountData', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' }, { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' }, { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' }, { name: 'healthFactor', type: 'uint256' },
    ] },
  { type: 'function', name: 'supply', stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'onBehalfOf', type: 'address' }, { name: 'referralCode', type: 'uint16' }],
    outputs: [] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'to', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'borrow', stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' }, { name: 'referralCode', type: 'uint16' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [] },
  { type: 'function', name: 'repay', stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' }, { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }] },
];

/** Aave V3 DataProvider：储备 aToken/债务代币地址查询 */
export const AAVE_PROVIDER_ABI = [
  { type: 'function', name: 'getReserveTokensAddresses', stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: 'aTokenAddress', type: 'address' }, { name: 'stableDebtTokenAddress', type: 'address' }, { name: 'variableDebtTokenAddress', type: 'address' }] },
];

/** Aave V3 Oracle：资产 USD 报价（8 位精度） */
export const AAVE_ORACLE_ABI = [
  { type: 'function', name: 'getAssetPrice', stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
];

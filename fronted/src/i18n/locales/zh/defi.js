// DeFi 域文案（Swap / LP / 借贷 三个 tab + 公用组件与工具错误信息）
export default {
  common: {
    // 登录守卫（DefiGuard）
    pleaseLogin: '请先登录',
    noWallet: '还没有钱包账号',
    loginHint: '登录后即可使用 Swap / 流动性 / 借贷功能',
    walletHint: '创建或导入钱包后即可使用 DeFi 功能',
    addWalletTitle: '添加钱包',
    addWalletMessage: '创建新钱包还是导入已有钱包？',
    createWallet: '创建钱包',
    importWallet: '导入钱包',
    goLogin: '去登录',
    goAddWallet: '去添加钱包',
    // 代币选择 sheet（TokenSheet）
    selectToken: '选择代币',
    tokenSheetTip: '仅展示常用代币；%{native} 为原生币（含 gas 余额），兑换路径自动走 %{wrapped}。',
    // 交易结果 / 状态
    txHashAlert: '交易哈希：\n%{hash}',
    revert: '合约执行失败（revert）',
    // 测试网副标题（Sepolia）
    testnetSubtitle: '%{dex} · %{net}（Swap/LP 为本项目部署的测试合约）',
    // txSender 错误
    noWalletCreated: '请先创建钱包',
    privateKeyUnsupported: '导入私钥的账号暂不支持 DeFi 交易，请切换到助记词账号',
    // 签名确认弹框（txSender 统一弹出）
    signConfirmTitle: '签名确认',
    signConfirmBody: '方法：%{method}\n合约：%{to}\n发送：%{value} %{native}\ngas 上限：%{gas}\n发起账号：%{from}\n\n签名前请确认以上内容，签名在本地完成，私钥不会离开设备。',
    signConfirmBtn: '确认签名',
    userCancel: '已取消签名',
    approveFailed: '授权交易失败，请检查 %{native} 余额后重试',
  },

  swap: {
    headerSubtitle: '%{dex} · %{net} · 兑换',
    onchainQuoteSuffix: '（链上报价）',
    providerOneInch: '1inch 聚合器（实验）',
    oneInchUnavailable: '1inch 报价不可用（需网络或 API Key），可改用链上报价',
    sell: '卖出',
    buy: '买入',
    balance: '余额 %{amount}',
    insufficientBalance: '%{symbol} 余额不足',
    quoteStale: '报价已过期，请重新获取',
    slippageRange: '滑点需在 0.01% ~ 50% 之间',
    confirmTitle: '确认兑换',
    confirmBody: '%{amount} %{from} → ≥%{est} %{to}\n协议：%{router}（%{net}）\n滑点：%{slip}%',
    success: '兑换成功',
    failed: '兑换失败',
    cannotSwap: '无法兑换',
    slippageLabel: '滑点容忍（%）',
    customSlippage: '自定义',
    btnBusy: '交易处理中…',
    btnQuoting: '获取报价…',
    btnSwap: '兑换',
    btnEnterAmount: '输入金额以获取报价',
    tip: '说明：兑换在当前链上执行，需要少量 %{native} 作 gas；%{dex} 手续费 %{fee}。1inch 为聚合路由（实验功能），网络不可达时会提示改用链上报价。授权只需在额度不足时发起。',
  },

  lp: {
    headerTitle: 'LP 流动性',
    headerSubtitle: '%{dex} · %{net} · 添加 / 移除流动性',
    // 详情页导航栏标题（页面内会动态覆盖为「交易对 / BNB」）
    detailTitle: '添加 / 移除流动性',
    loadingPools: '加载池子中…',
    noPools: '没有可用池子或加载失败，下拉重试',
    myShare: '我的份额 %{share}%',
    poolReserve: '池子：%{bnb} %{native} + %{token} %{symbol}',
    myLp: '我的 LP：%{amount}',
    poolHint: '点击添加流动性（%{native} + %{symbol}）',
    addSection: '添加流动性',
    removeSection: '移除流动性',
    tokenAmountPlaceholder: '%{symbol} 数量',
    pairHint: '预计搭配：%{hint}',
    pairHintAuto: '输入代币数量后自动计算',
    pairHintValue: ' %{amount} %{native}',
    tokenBalance: '代币余额：%{amount}',
    lpAmountPlaceholder: 'LP 数量',
    // 操作流程 busy 文案
    busyApprovingRouter: '授权 Router…',
    busyApprovingLp: '授权 LP Token…',
    busySigning: '签名广播中…',
    // 结果
    addSuccess: '添加成功',
    addFailed: '添加失败',
    removeSuccess: '移除成功',
    removeFailed: '移除失败',
    addErrorTitle: '添加流动性失败',
    removeErrorTitle: '移除流动性失败',
    // 校验错误
    needTokenAmount: '请输入代币数量',
    insufficientBnb: '%{native} 余额不足（含 gas 预留 0.01 %{native}）',
    needLpAmount: '请输入要移除的 LP 数量',
    lpExceeded: '超过持有的 LP 数量',
    tip: '添加按当前池子比例自动搭配 %{native}；移除按 LP 份额取回两种代币。数量下限按 0.5% 滑点保护。首次操作需要一笔授权交易（approve）。',
  },

  lend: {
    headerTitle: '借贷',
    headerSubtitle: 'Aave V3 · %{net} · 存币生息',
    // 详情页导航栏标题（页面内会动态覆盖为「资产 · Aave V3」）
    detailTitle: '存入 / 取回',
    // 账户总览
    accountOverview: '账户总览',
    totalCollateral: '总抵押',
    totalDebt: '总负债',
    healthFactor: '健康因子',
    hfHint: '健康因子低于 1 有清算风险（当前清算阈值 %{threshold}%）',
    loadingAccount: '加载账户数据…',
    accountLoadFailed: '账户数据加载失败，下拉重试',
    // 存款列表（合并后的资产列表：钱包余额 + 已有存款数量）
    loadingDeposits: '加载存款列表…',
    noDeposits: '暂无存款。点击下方资产存入即可开始生息。',
    supplyAssets: '存入资产',
    balance: '余额 %{amount}',
    appendOrWithdraw: '追加 / 取回',
    supplyHint: '存入',
    // sheet
    supplySection: '存入',
    withdrawSection: '取回',
    amountPlaceholder: '%{symbol} 数量',
    currentDeposit: '当前存款：%{amount} %{symbol}',
    sheetTip: '存入后获得对应 aToken（利息凭证）。取回时销毁 aToken 换回资产。',
    // 操作流程 busy / 步骤文案（native/wrapped 随网络变化：BNB/WBNB 或 ETH/WETH）
    stepWrap: '包装 %{native} → %{wrapped}…',
    stepApprove: '授权 %{symbol}…',
    stepSupply: '存入 Aave…',
    stepWithdraw: '取回中…',
    stepWithdrawNative: '取回 %{wrapped}…',
    stepUnwrap: '解包 %{wrapped} → %{native}…',
    recordSupply: '存入 %{amount} %{symbol}',
    recordWithdraw: '取回 %{amount} %{symbol}',
    // 结果
    supplySuccess: '存入成功',
    supplyFailed: '存入失败',
    withdrawSuccess: '取回成功',
    withdrawFailed: '取回失败',
    // 校验错误
    needAmount: '请输入数量',
    insufficientBalance: '%{symbol} 余额不足',
    insufficientBalanceNative: '%{symbol} 余额不足（已预留 0.01 %{native} gas）',
    needWithdrawAmount: '请输入取回数量',
    exceedsDeposit: '超过当前存款数量',
    tip: '存款通过 Aave V3 获得利息（aToken 数量随时间增长）。%{native} 存入会自动包装为 %{wrapped}，取回后自动解包。借款功能暂未开放；负债仅作展示。首次存入某资产需要一笔授权交易（approve）。存款有被清算风险，请关注健康因子。',
  },

  rpc: {
    httpError: 'RPC 请求失败：HTTP %{status}',
    rpcError: 'RPC %{method} 出错：%{message}',
  },

  // DeFi 网络名称（标题徽标 / 副标题 / 确认弹窗）
  network: {
    bsc: 'BSC 链',
    ethereum: '以太坊主网',
    sepolia: 'Sepolia 测试网',
  },

  pancake: {
    quoteFailed: '报价失败：池子流动性不足',
  },

  oneInch: {
    requestFailed: '1inch 请求失败',
    quoteFailed: '1inch 报价失败',
    noTxData: '1inch 未返回交易数据',
  },

  format: {
    invalidAmount: '金额格式不对：%{text}',
    tooManyDecimals: '小数位最多 %{decimals} 位',
  },
};

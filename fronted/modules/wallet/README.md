# expo-modules-wallet

基于 [Trust Wallet Core](https://github.com/trustwallet/wallet-core)（v4.8.4）实现的内嵌钱包原生模块，提供 Web3 基础能力：

- 助记词生成 / 校验 / 导入（BIP39，12 或 24 词）
- 多链地址派生（BIP44 默认路径）：**Ethereum / TRON / Bitcoin**
- 消息签名（ETH EIP-191、TRON、BTC）
- 交易签名（ETH Legacy 转账、TRON TRX 转账、BTC UTXO 转账）

模块本身**不保存任何私钥状态**，所有方法无状态；助记词由调用方通过
`expo-secure-store` 等方式自行安全保管。

## 使用

```ts
import Wallet from '@/modules/wallet';

// 1. 生成 12 个单词的助记词（256 = 24 词）
const mnemonic = await Wallet.generateMnemonic(128);

// 2. 校验助记词
const valid = await Wallet.validateMnemonic(mnemonic);

// 3. 导入钱包，得到三条链的地址
const wallet = await Wallet.importWallet(mnemonic);
// wallet.addresses = { ethereum: '0x…', tron: 'T…', bitcoin: 'bc1…' }

// 4. 签名消息（等价于 MetaMask personal_sign）
const signature = await Wallet.signMessage('ethereum', mnemonic, 'hello');

// 5. 签名以太坊转账（0.01 ETH，主网）
const rawTx = await Wallet.signTransaction('ethereum', mnemonic, {
  chainId: '1',
  nonce: '0',
  gasPrice: '3600000000',
  gasLimit: '21000',
  to: '0x3535353535353535353535353535353535353535',
  value: '10000000000000000', // wei
});
// rawTx 可直接用于 eth_sendRawTransaction 广播
```

### TRON 转账签名

区块头信息从波场节点 `walletsolidity/getnowblock` 接口获取：

```ts
const txJson = await Wallet.signTransaction('tron', mnemonic, {
  to: 'THTR75o8xXAgCTQqpiot2AFRAjvW1tSbVV',
  amount: 1_000_000, // 1 TRX（单位 sun）
  feeLimit: 1_000_000_000,
  timestamp: Date.now(),
  expiration: Date.now() + 10 * 60 * 1000,
  blockNumber: 3111739,
  blockTimestamp: 1539295479000,
  parentHash: '00000000002f7b3af4f5f8b9e23a30c530f719f165b742e7358536b280eead2d',
  witnessAddress: '415863f6091b8e71766da808b1dd3159790f61de7d',
});
// 返回交易 JSON，可直接调用波场节点 broadcasttransaction 广播
```

### Bitcoin 转账签名

UTXO 列表从链上接口获取（如 blockbook 的 `address/utxo`）：

```ts
const rawTx = await Wallet.signTransaction('bitcoin', mnemonic, {
  to: '1Bp9U1ogV3A14FMvKbRJms7ctyso4Z4Tcx',
  amount: 10_000, // 聪
  byteFee: 2,     // 聪/字节
  changeAddress: myBtcAddress,
  utxos: [
    {
      txid: 'fff7f7881a8099afa6940d42d1e7f6362bec38171ea3edf433541db4e4ad969f',
      vout: 0,
      amount: 625_000_000,
      script: '2103c9f4836b9a4f77fc0d81f7bcb01b7f1b35916864b9476c241ce9fc198bd25432ac',
    },
  ],
});
// rawTx 可直接用于 sendrawtransaction 广播
```

## 目录结构

```
modules/wallet/
├── expo-module.config.json   # Expo 模块声明（iOS / Android）
├── package.json
├── src/index.ts              # TS 接口 + 十进制→hex 归一化
├── ios/
│   ├── expo-modules-wallet.podspec
│   └── WalletModule.swift    # iOS 实现（Swift + WalletCore）
└── android/
    ├── build.gradle
    └── src/main/java/expo/modules/wallet/WalletModule.kt  # Android 实现（Kotlin + wallet-core）
```

## 安装注意事项

### iOS

`pod 'TrustWalletCore'` 是公开的 CocoaPods 包，`pod install` 时会自动从
GitHub Release 下载预编译二进制（约 50MB），无需任何 token。

> 如果 pod install 报 `Unicode Normalization not appropriate for ASCII-8BIT`，
> 是终端缺 UTF-8 编码环境变量，执行：
> `export LANG=en_US.UTF-8` 后重试。

### Android（需要 GitHub Token）

`com.trustwallet:wallet-core` 发布在 **GitHub Packages**，拉取需要一个
只读 token（勾选 `read:packages` 权限，在
https://github.com/settings/tokens 创建）。

配置方式（二选一）：

1. 在 `fronted/android/gradle.properties`（不要提交到 git）添加：

   ```properties
   walletcore.gpr.user=你的GitHub用户名
   walletcore.gpr.key=ghp_你的token
   ```

2. 或设置环境变量 `GITHUB_USER` / `GITHUB_TOKEN`。

> 注意：`expo prebuild --clean` 会重建 `android/` 目录，
> `gradle.properties` 里的 token 需要重新添加。

### 重新生成原生工程

模块位于 `modules/`，会被 Expo autolinking 自动链接，
`npx expo prebuild --clean` 重建原生工程时无需其他配置。

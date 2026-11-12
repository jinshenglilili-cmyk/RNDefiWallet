# RN DeFi Wallet

基于 React Native + Expo 的 DeFi 移动钱包，
配套 [React Native 实战课程](https://clwy.cn/courses/react-native)后端接口。

![Expo](https://img.shields.io/badge/Expo-57-000020?logo=exponent)
![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react)
![zustand](https://img.shields.io/badge/zustand-5-FA8420)

## 功能

- **行情**：CoinGecko 加密货币行情列表、币种详情
- **Swap**：V2 DEX 链上报价兑换（BSC: PancakeSwap V2 / Ethereum: Uniswap V2），
  1inch 聚合器实验选项（BSC / Ethereum），滑点设置、原生币自动走 wrapped 路径
- **LP**：V2 交易对的流动性池子列表、添加 / 移除流动性（按储备比例自动搭配原生币，
  按份额取回两种代币）
- **借贷**：Aave V3 存币生息——账户总览（总抵押 / 总负债 / 健康因子）、资产存入 / 取回
  （原生币自动 wrap / unwrap）
- **钱包**：
  - 创建 / 导入助记词钱包，BIP44 派生账号
  - 新增账号三种方式：助记词派生 / 导入私钥 / 独立新助记词
  - 收发转账（转账记录本地保存，含 DeFi 交易记录）、信息签名、导出助记词
  - WalletConnect 连接外部 DApp（连接钱包）
- **浏览器**：内置 DApp 浏览器（WebView + 注入 Provider），可连接 DApp
- **设置**：语言切换（跟随系统 / 简体中文 / English）、DeFi 网络切换、主题、退出登录

### DeFi 多网络

三套网络配置集中在 [src/utils/defi/tokens.js](src/utils/defi/tokens.js)，设置页一键切换、即时生效（无需重启）：

| 网络 | DEX | 借贷 | 1inch | 说明 |
| ---- | --- | ---- | ----- | ---- |
| BSC 主网（默认） | PancakeSwap V2 | Aave V3 | ✅ | |
| Ethereum 主网 | Uniswap V2 | Aave V3 | ✅ | 真实资产，WETH/USDT 等池子流动性充足 |
| Sepolia 测试网 | Uniswap V2（项目自部署） | Aave V3（官方测试部署，WETH deposit 受限） | ❌ | Swap/LP 用项目自部署合约 + Mock 代币，方便无门槛测试 |

所有链上常量（RPC / Router / Factory / Aave / 代币清单）都通过 `net()` 在调用时现场读取，
Swap / LP / 借贷页面与签名广播（chainId、原生币符号、手续费文案）全动态跟随网络。
合约地址均经 `eth_call` 逐一链上核验（Aave 地址来自 @bgd-labs/aave-address-book）。

## 技术栈

| 模块        | 选型                                                 |
| ----------- | ---------------------------------------------------- |
| 框架        | Expo SDK 57 / React Native 0.86 / React 19           |
| 路由        | expo-router（文件系统路由）                          |
| 状态管理    | zustand                                              |
| 钱包核心    | `modules/wallet`（原生模块，Trust Wallet Core：助记词/私钥/EVM 签名） |
| 敏感数据    | expo-secure-store（iOS Keychain / Android Keystore） |
| 本地存储    | @react-native-async-storage/async-storage            |
| DeFi        | PancakeSwap V2 / Uniswap V2 / Aave V3 / 1inch（eth_call 直连，无 SDK） |
| DApp 连接   | WalletConnect Sign Client v2                         |
| 国际化      | i18n-js（zh / en，跟随系统）                         |
| 图表/二维码 | react-native-svg + react-native-qrcode-svg           |

## 目录结构

```
RNDefiWallet/
├── api/        # 课程后端（Express + Prisma，端口 3000）
└── fronted/    # 本前端项目
    ├── modules/wallet/        # 钱包原生模块（助记词、私钥、派生、EVM 交易签名）
    ├── plugins/               # Expo config plugins
    └── src/
        ├── app/               # expo-router 路由
        │   ├── (tabs)/        # 行情 / Swap / LP / 借贷 / 钱包 五个 Tab
        │   ├── auth/          # 登录 & 注册（模态）
        │   ├── browser/       # DApp 浏览器
        │   ├── defi/          # DeFi 二级页：lp/[symbol]、lend/[symbol]
        │   ├── market/        # 币种详情
        │   ├── settings/      # 设置（语言 / DeFi 网络）
        │   ├── wallet/        # 创建/导入/新增账号/转账记录/签名/导出
        │   └── wc/            # WalletConnect 连接
        ├── stores/            # zustand：auth.js / wallet.js / defiNetwork.js
        ├── utils/
        │   ├── defi/          # DeFi 服务层：tokens.js（网络配置）/ pancake.js /
        │   │                  #   aave.js / oneInch.js / bscRpc.js / txSender.js /
        │   │                  #   erc20.js / useBscWallet.js
        │   ├── walletStore.js / request.js / rpc.js / coingecko.js
        │   └── injectedProvider.js / walletConnect.js / theme.js / format.js
        ├── i18n/              # locales/{zh,en}/ 多语言文案
        └── components/
            └── defi/          # DeFi 三 tab 共用组件（引导页 / 代币 sheet / 记录写入）
```

## 快速开始

### 1. 启动后端

```bash
cd api
npm install
npx prisma generate
npm start        # http://localhost:3000，接口文档见 api/README.md
```

### 2. 配置前端

```bash
cd fronted
npm install
```

创建 `.env`（API 地址建议直接用局域网 IP，不要用 localhost）：

```bash
EXPO_PUBLIC_API_URL=http://<你的局域网IP>:3000
EXPO_PUBLIC_WC_PROJECT_ID=<WalletConnect Project ID>
```

> .env 是打包时注入的，改完需要重启 metro。

### 3. 启动

```bash
npm run ios      # 需要 ios/ 目录已存在（开发客户端模式）
```

或经开发客户端加载：

```bash
npx expo start
```

模拟器内打开 `clwy://` 深链可直达指定路由（如 `clwy://swap`）；开发客户端冷启动：

```bash
xcrun simctl terminate booted com.hrbbcfc.client
xcrun simctl openurl booted "com.hrbbcfc.client://expo-development-client/?url=<metro 地址>"
```

## 架构图

### 整体架构

```mermaid
flowchart TB
    subgraph UI["UI 层（src/app，expo-router 路由）"]
        TABS["(tabs) Tab 容器<br/>行情 index / Swap / LP / 借贷 / 钱包"]
        PAGES["二级页面<br/>defi/lp/[symbol] · defi/lend/[symbol]<br/>market/[id] · wallet/* · browser · settings · wc · auth(模态)"]
    end

    subgraph STORE["状态层（src/stores，zustand）"]
        AUTH["useAuthStore<br/>session / userInfo<br/>signIn / signUp / signOut / fetchProfile"]
        WALLET["useWalletStore<br/>meta / balance / ready / switchAccount"]
        NET["useDefiNetwork<br/>bsc / ethereum / sepolia<br/>设置页切换，AsyncStorage 持久化"]
    end

    subgraph UTIL["服务层（src/utils）"]
        WS["walletStore.js<br/>钱包本地存储（按登录账号隔离）"]
        DEFNI["defi/tokens.js<br/>三网络配置（合约地址/代币清单）<br/>net() 调用时现场读取"]
        DEX["defi/pancake.js<br/>V2 DEX 报价/兑换/流动性"]
        AAVE["defi/aave.js<br/>Aave V3 Pool/DataProvider/Oracle"]
        OI["defi/oneInch.js<br/>1inch 聚合器（按链号拼 URL）"]
        RPCD["defi/bscRpc.js<br/>RPC 客户端（读 net().rpcUrl）"]
        TX["defi/txSender.js<br/>签名广播通用流程 + 签名确认"]
        REQ["request.js<br/>HTTP 封装 + Bearer token"]
        RPC["rpc.js<br/>以太坊 JSON-RPC（dApp 浏览器专用）"]
        CG["coingecko.js<br/>行情 API"]
        WC["walletConnect.js<br/>WalletConnect 会话"]
        IP["injectedProvider.js<br/>WebView 注入 Provider"]
        THEME["theme.js / format.js"]
    end

    subgraph NATIVE["原生 / 系统能力"]
        WM["modules/wallet<br/>原生钱包模块：助记词生成/校验、<br/>BIP44 派生、私钥导入、EVM 交易签名"]
        SS["expo-secure-store<br/>Keychain / Keystore"]
        AS["AsyncStorage"]
        WEBVIEW["react-native-webview<br/>DApp 页面"]
    end

    subgraph EXT["外部服务"]
        BE["课程后端 api/:3000<br/>Express + Prisma<br/>/auth/* /users/me"]
        CHAINS["BSC / Ethereum / Sepolia RPC<br/>（publicnode 公共节点）"]
        DEXS["PancakeSwap V2 / Uniswap V2<br/>Aave V3 / 1inch"]
        CGS["CoinGecko API"]
        DAPP["DApp 网站"]
        WCS["WalletConnect 中继"]
    end

    UI --> STORE
    TABS --> CG
    TABS --> DEFNI
    TABS --> DEX
    TABS --> AAVE
    TABS --> OI
    PAGES --> TX
    PAGES --> WS
    PAGES --> RPC
    PAGES --> WC
    PAGES --> THEME

    AUTH --> REQ
    AUTH --> WS
    WALLET --> WS
    NET --> DEFNI

    WS --> SS
    WS --> AS
    WM --> SS
    TX --> WM
    IP --> WEBVIEW

    REQ --> BE
    RPCD --> CHAINS
    DEX --> CHAINS
    AAVE --> CHAINS
    OI --> DEXS
    CG --> CGS
    WC --> WCS
    IP --> DAPP
```

### DeFi 网络切换

```mermaid
flowchart LR
    SET["设置页 pickNetwork"] -->|setNetwork| ZS["useDefiNetwork（zustand）"]
    ZS -->|AsyncStorage 持久化| DISK[("defi.network.choice")]
    ZS -->|订阅组件重渲染| TABS["Swap / LP / 借贷 Tab"]
    ZS -->|getState| TOKENS["defi/tokens.js net()"]

    subgraph NETS["三份网络配置（net() 调用时读取）"]
        BSC["BSC：PancakeSwap V2 + Aave V3 + 1inch(56)"]
        ETH["Ethereum：Uniswap V2 + Aave V3 + 1inch(1)"]
        SEP["Sepolia：自部署 Uniswap V2 + Aave V3"]
    end

    TOKENS --> NETS
    TABS -->|"余额/报价/签名/文案 全动态"| NETS
```

> 切换无需重启：所有合约地址、RPC URL、chainId、代币清单、原生币符号、手续费
> 都通过 `net()` 在调用时现场读取；余额按 `[address, network]` 自动重新拉取。

### 钱包存储分层（按登录账号隔离）

```mermaid
flowchart LR
    subgraph 登录切换
        LOGIN["登录 uid=1"] --> SW["switchWalletOwner(1)"]
        LOGOUT["退出登录"] --> SWN["switchWalletOwner(null)"]
    end

    SW --> NS1
    SWN --> NSN

    subgraph KEYCHAIN["SecureStore（Keychain，敏感数据）"]
        SS1["wallet.u1.wallet.mnemonic<br/>wallet.u1.wallet.pk.&lt;地址&gt;<br/>wallet.u1.wallet.account-mnemonic.&lt;地址&gt;"]
    end

    subgraph MANIFEST["AsyncStorage（非敏感数据）"]
        NS1["wallet.u1.*<br/>wallet.meta（账号列表/当前账号）<br/>wallet.transactions（转账/DeFi 记录）"]
        NSN["wallet.none.*<br/>（未登录空命名空间，与用户数据隔离）"]
        NS2["wallet.u2.*<br/>（其他登录用户，互不可见）"]
        LEGACY["旧版键 wallet.archive.* / 明文键<br/>→ migrateLegacyInto 一次性迁移"]
    end
```

### 登录 / 钱包数据流转

```mermaid
sequenceDiagram
    participant App as 钱包页 (tabs)/wallet
    participant Auth as useAuthStore
    participant WS as walletStore
    participant API as 后端 /users/me

    App->>Auth: fetchProfile()（聚焦时触发）
    Auth->>API: GET /users/me
    API-->>Auth: { data: { user: { id } } }
    Auth->>WS: switchWalletOwner(user.id)
    Note over WS: 切换键前缀 wallet.u<uid>.*<br/>首次登录触发 migrateLegacyInto

    App->>WS: load()
    WS-->>App: meta + balance → 渲染账号列表
```

### 架构要点

- **状态管理（zustand）**：[src/stores/auth.js](src/stores/auth.js) 管登录态与用户信息；[src/stores/wallet.js](src/stores/wallet.js) 管钱包元数据与余额；[src/stores/defiNetwork.js](src/stores/defiNetwork.js) 管 DeFi 网络（三网络持久化）。
- **钱包存储（按登录账号隔离）**：[src/utils/walletStore.js](src/utils/walletStore.js)
  - 助记词、私钥存 SecureStore（Keychain/Keystore）；账号列表、交易记录等非敏感数据存 AsyncStorage
  - 所有键按登录用户加命名空间前缀 `wallet.u<uid>.`，未登录落在隔离的 `wallet.none.` 空命名空间
  - 退出登录只是切换前缀，数据不搬家；重新登录原样恢复；旧版数据由 `migrateLegacyInto` 一次性迁移
- **DeFi 网络抽象**：[src/utils/defi/tokens.js](src/utils/defi/tokens.js) 集中三份网络配置（合约地址 / 代币清单 / RPC），其余代码全部通过 `net()` 调用时读取——切换网络不散落任何 if/else
- **签名通道**：[src/utils/defi/txSender.js](src/utils/defi/txSender.js) 复用 `modules/wallet` 原生签名（Trust Wallet Core），签名前弹确认（方法 / 金额 / gas），带固有 gas 下限与回执等待
- **HTTP 封装**：[src/utils/request.js](src/utils/request.js)，接口统一返回 `{status, message, data}`；401 自动跳登录
- **国际化**：[src/i18n/](src/i18n/index.js)，i18n-js，zh / en 两种语言（跟随系统可切换），链名 / 原生币符号等动态参数经插值传入

## 测试账号

`admin / 123123`（本地后端）

## License

见 [LICENSE](LICENSE)。

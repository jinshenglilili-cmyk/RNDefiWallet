                                                                        # RN DeFi Wallet

基于 React Native + Expo 的 DeFi 移动钱包，
//配套 [React Native 实战课程](https://clwy.cn/courses/react-native)后端接口。

![Expo](https://img.shields.io/badge/Expo-57-000020?logo=exponent)
![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react)
![zustand](https://img.shields.io/badge/zustand-5-FA8420)

## 功能

- **行情**：CoinGecko 加密货币行情列表、币种详情
- **浏览器**：内置 DApp 浏览器（WebView + 注入 Provider），可连接 DApp
- **钱包**：
  - 创建 / 导入助记词钱包，BIP44 派生账号
  - 新增账号三种方式：助记词派生 / 导入私钥 / 独立新助记词
  - 收发转账（转账记录本地保存）、信息签名、导出助记词
  - WalletConnect 连接外部 DApp（连接钱包）
- **设置**：主题切换、退出登录、注销账号

## 技术栈

| 模块        | 选型                                                 |
| ----------- | ---------------------------------------------------- |
| 框架        | Expo SDK 57 / React Native 0.86 / React 19           |
| 路由        | expo-router（文件系统路由）                          |
| 状态管理    | zustand                                              |
| 钱包核心    | `modules/wallet`（原生模块，助记词/私钥/签名）       |
| 敏感数据    | expo-secure-store（iOS Keychain / Android Keystore） |
| 本地存储    | @react-native-async-storage/async-storage            |
| DApp 连接   | WalletConnect Sign Client v2                         |
| 图表/二维码 | react-native-svg + react-native-qrcode-svg           |

## 目录结构

```
RNDefiWallet/
├── api/        # 课程后端（Express + Prisma，端口 3000）
└── fronted/    # 本前端项目
    ├── modules/wallet/        # 钱包原生模块（助记词、私钥、派生、签名）
    ├── plugins/               # Expo config plugins
    └── src/
        ├── app/               # expo-router 路由
        │   ├── (tabs)/        # 行情 / 浏览器 / 钱包 三个 Tab
        │   ├── auth/          # 登录 & 注册（模态）
        │   ├── browser/       # DApp 浏览器
        │   ├── market/        # 币种详情
        │   ├── settings/      # 设置
        │   ├── wallet/        # 创建/导入/新增账号/转账记录/签名/导出
        │   └── wc/            # WalletConnect 连接
        ├── stores/            # zustand：auth.js / wallet.js
        ├── utils/             # walletStore.js / request.js / rpc.js / coingecko.js 等
        └── components/
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

模拟器内打开 `clwy://` 深链可直达指定路由；开发客户端冷启动：

```bash
xcrun simctl terminate booted com.hrbbcfc.client
xcrun simctl openurl booted "com.hrbbcfc.client://expo-development-client/?url=<metro 地址>"
```

## 架构图

### 整体架构

```mermaid
flowchart TB
    subgraph UI["UI 层（src/app，expo-router 路由）"]
        TABS["(tabs) Tab 容器<br/>行情 index / 浏览器 browser / 钱包 wallet"]
        PAGES["二级页面<br/>market/[id] · wallet/*<br/>settings · wc · auth(模态)"]
    end

    subgraph STORE["状态层（src/stores，zustand）"]
        AUTH["useAuthStore<br/>session / userInfo<br/>signIn / signUp / signOut<br/>fetchProfile / switchOwner"]
        WALLET["useWalletStore<br/>meta / balance / ready<br/>load / switchAccount"]
    end

    subgraph UTIL["服务层（src/utils）"]
        WS["walletStore.js<br/>钱包本地存储（命名空间隔离）"]
        REQ["request.js<br/>HTTP 封装 + Bearer token"]
        RPC["rpc.js<br/>以太坊 JSON-RPC"]
        CG["coingecko.js<br/>行情 API"]
        WC["walletConnect.js<br/>WalletConnect 会话"]
        IP["injectedProvider.js<br/>WebView 注入 Provider"]
        THEME["theme.js / format.js"]
    end

    subgraph NATIVE["原生 / 系统能力"]
        WM["modules/wallet<br/>原生钱包模块：助记词生成/校验、<br/>BIP44 派生、私钥导入、交易签名"]
        SS["expo-secure-store<br/>Keychain / Keystore"]
        AS["AsyncStorage"]
        WEBVIEW["react-native-webview<br/>DApp 页面"]
    end

    subgraph EXT["外部服务"]
        BE["课程后端 api/:3000<br/>Express + Prisma<br/>/auth/* /users/me"]
        ETH["以太坊 RPC 节点"]
        CGS["CoinGecko API"]
        DAPP["DApp 网站"]
        WCS["WalletConnect 中继"]
    end

    UI --> STORE
    TABS --> CG
    TABS --> IP
    PAGES --> WS
    PAGES --> RPC
    PAGES --> WC
    PAGES --> THEME

    AUTH --> REQ
    AUTH --> WS
    WALLET --> WS
    WALLET --> RPC

    WS --> SS
    WS --> AS
    WM --> SS
    IP --> WEBVIEW

    REQ --> BE
    RPC --> ETH
    CG --> CGS
    WC --> WCS
    IP --> DAPP
```

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
        NS1["wallet.u1.*<br/>wallet.meta（账号列表/当前账号）<br/>wallet.transactions（转账记录）"]
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

- **状态管理（zustand）**：[src/stores/auth.js](src/stores/auth.js) 管登录态与用户信息；[src/stores/wallet.js](src/stores/wallet.js) 管钱包元数据与余额。
- **钱包存储（按登录账号隔离）**：[src/utils/walletStore.js](src/utils/walletStore.js)
  - 助记词、私钥存 SecureStore（Keychain/Keystore）；账号列表、交易记录等非敏感数据存 AsyncStorage
  - 所有键按登录用户加命名空间前缀 `wallet.u<uid>.`，未登录落在隔离的 `wallet.none.` 空命名空间
  - 退出登录只是切换前缀，数据不搬家；重新登录原样恢复；旧版数据由 `migrateLegacyInto` 一次性迁移
- **HTTP 封装**：[src/utils/request.js](src/utils/request.js)，接口统一返回 `{status, message, data}`；401 自动跳登录

## 测试账号

`admin / 123123`（本地后端）

## License

见 [LICENSE](LICENSE)。

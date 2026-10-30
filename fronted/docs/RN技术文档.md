# React Native 技术文档

> 基于 `RNDefiWallet/fronted` 项目（Expo SDK 57 + expo-router）编写，所有代码引用均来自本项目真实文件。
>
> 适用读者：刚接手本项目的 React / RN 开发者。

---

## 一、RN 技术基础点

### 1.1 React Native 是什么

React Native（RN）用 **JavaScript + React** 的方式编写原生 App。代码运行在 JS 引擎里，通过"桥"把界面描述翻译成原生控件：

```
┌─────────────────────────────┐
│  JS 层（React 组件 + 业务）   │  ← fronted/src 下所有代码
├─────────────────────────────┤
│  JS 引擎（Hermes）           │  ← 字节码运行，启动快、内存小
├─────────────────────────────┤
│  桥（新架构 JSI / 旧架构 Bridge）│  ← 序列化通信
├─────────────────────────────┤
│  原生层（iOS / Android 控件） │  ← ios/ android/ 目录
└─────────────────────────────┘
```

- **新架构（Fabric + TurboModules）**：同步、类型安全的 JSI 通信。本项目 iOS 在 `app.json` 里关闭了新架构（`"newArchEnabled": false`），走旧 Bridge。
- **Hermes**：Facebook 出品的 JS 引擎，RN 默认启用，支持 `BigInt`（本项目钱包模块的十进制转 hex 就靠它）。

### 1.2 组件与样式

- 基础组件：`View`（div）、`Text`（必须用 Text 包文字）、`Image`、`ScrollView`、`FlatList`
- 样式用 `StyleSheet.create()`，是 **Flexbox 子集**，默认主轴是纵向（`flexDirection: 'column'`），**没有 CSS 继承**
- 单位是无单位逻辑像素，适配用 `flex` + 百分比

### 1.3 Expo 与原生模块

Expo 是 RN 的工程化全家桶，本项目用到：

| 能力 | 包 | 说明 |
|------|----|------|
| 文件路由 | `expo-router` | 目录即路由（见第二章） |
| 安全存储 | `expo-secure-store` | 存登录 token |
| 本地原生模块 | `modules/wallet` | 自己写的 Swift/Kotlin 模块 |

**本地原生模块结构**（以 `modules/wallet` 为例）：

```
modules/wallet/
├── expo-module.config.json   # 声明平台和模块类名，Expo 自动链接
├── src/index.ts              # JS 侧接口（requireNativeModule('Wallet')）
├── ios/WalletModule.swift    # iOS 实现（Swift）
└── android/.../WalletModule.kt  # Android 实现（Kotlin）
```

JS 调用原生方法就是调用 TS 里声明的函数，Expo 负责跨端分发和 Promise 包装。

### 1.4 状态与网络

- **Context + Hook**：本项目没有引入 Redux/Zustand，登录态用 `createContext` + Provider 管理（`src/utils/ctx.js`）
- **网络**：`src/utils/request.js` 封装了 `fetch`，自动带上 `EXPO_PUBLIC_API_URL`（`.env` 配置）和 Bearer token，统一处理 401
- **持久化**：token 用 `expo-secure-store`（iOS Keychain / Android Keystore），见 `src/hooks/useStorageState`

---

## 二、项目路由加载过程

### 2.1 文件即路由

expo-router 的核心规则：**`src/app/` 下的文件结构就是路由表**。

```
src/app/
├── _layout.tsx          # 根布局（Stack 导航器）— 不产生 URL
├── (tabs)/              # 括号目录：分组，不产生 URL 段
│   ├── _layout.tsx      # Tab 布局（Tabs 导航器）— 不产生 URL
│   ├── index.tsx        # 路由 "/"        → Tab「发现」
│   ├── videos.tsx       # 路由 "/videos"  → Tab「视频课程」
│   └── users/index.tsx  # 路由 "/users"   → Tab「我的」
├── articles/index.tsx   # 路由 "/articles" → 通知
├── auth/index.tsx       # 路由 "/auth"     → 登录（modal）
└── ...
```

三条核心规则：

1. **文件决定路由有没有**：文件存在即可导航，`_layout.tsx` 不注册也能跳
2. **布局决定长什么样**：`_layout.tsx` 是常驻的"壳"，给子页面套导航器
3. **`index` 是默认页**：`/` 永远匹配 `index.tsx`，与声明顺序无关

### 2.2 启动加载链路

App 冷启动时，模块入口是 `package.json` 里的 `"main": "expo-router/entry"`，之后：

```
1. expo-router 扫描 src/app/，生成路由表
2. 渲染根 _layout.tsx
   └─ <SessionProvider>          # 登录态 Context，全局包裹
      └─ <Stack screenOptions>   # 根导航器
3. URL "/" 匹配 → 渲染 (tabs)/_layout.tsx
   └─ <Tabs> 导航器 + 三个 Tab 配置
4. Tabs 默认子路由 → 渲染 (tabs)/index.tsx（「发现」页）
5. 用户看到 Tab 页面
```

要点：

- **布局从外到内渲染，且只渲染一次**。切 Tab 只换里面的子页面，两层 `_layout` 不重新挂载（所以 Tab 栏不闪、状态保留）
- **页面按需加载**：启动时只加载 `/` 这条路径上的文件，`videos.tsx`、`users/` 等切过去才渲染
- 根 `_layout.tsx` 里的每个 `<Stack.Screen>` 只是把页面**注册进路由表并配置标题/动画/modal**，注册 ≠ 显示；同一时刻栈里只有一个页面可见

### 2.3 页面注册的配置项

根 `_layout.tsx` 里按用途分组注册：

```tsx
<Stack screenOptions={screenOptions}>
  <Stack.Screen name="(tabs)" options={tabOptions()} />   {/* 主页：顶部导航栏 */}
  <Stack.Screen name="articles/index" options={{ title: '通知' }} />
  ...
  <Stack.Screen name="auth/index" options={{
    presentation: 'modal',          {/* 以弹窗形式从底部弹出 */}
    title: '会员登录 & 注册',
    headerLeft: () => <CloseButton />,  {/* 左上角关闭按钮 */}
    animation: 'slide_from_bottom',
  }} />
</Stack>
```

Tab 页内部的 `(tabs)/_layout.tsx` 同理：每个 `<Tabs.Screen>` 只配置 Tab 的标题和图标（`tabBarIcon`），**声明顺序只影响 Tab 栏排列位置，不影响启动选中谁**。

---

## 三、路由跳转过程

### 3.1 六种跳转方式

| 方式 | 栈行为 | 典型场景 | 项目示例 |
|------|--------|---------|---------|
| `<Link href>` | 同 push | 页面内按钮 | `SignInNotice.js` 登录按钮 |
| `router.push()` | 无条件压栈 | 进详情页 | 搜索结果 → 章节详情 |
| `router.navigate()` | 有则跳、无则压 | Tab 切换、防重复 | `request.js` 401 跳登出 |
| `router.replace()` | 顶替当前页 | 登录后禁止返回 | |
| `router.back()` | 出栈一步 | 返回 | |
| `router.dismiss()` | 回到本组栈底 | 关闭 modal | `ctx.js` 登录成功关弹窗 |

**push 与 navigate 的区别**（最常混淆）：

```
当前栈: [tabs, articles]
push('/articles')    → [tabs, articles, articles]   再叠一份，返回按两次
navigate('/articles') → [tabs, articles]             跳回已有的那页
```

日常跳页面**优先 navigate**，避免用户把栈点爆。

### 3.2 modal 的跳转与关闭

`auth/index`、`teachers/[id]`、`me/edit` 配置了 `presentation: 'modal'`：

```
跳转时: router.push('/auth')          → 从底部滑出弹窗
关闭时: router.dismiss()              → 整组弹窗关闭，回到弹出前的页面
```

`dismiss` 与 `back` 的区别：`back` 只退一步；`dismiss` 一次性关掉这组弹出的页面。登录/注册这类"办完事就走"的页面用 `dismiss`。

---

## 四、登录实现过程

### 4.1 整体架构

登录态由三层组成：

```
┌────────────────────────────────────────────────┐
│ 持久层  useStorageState('session')              │
│         → expo-secure-store 存 token            │
├────────────────────────────────────────────────┤
│ 逻辑层  SessionProvider (src/utils/ctx.js)      │
│         → signIn / signUp / signOut 方法        │
│         → 通过 Context 下发 { session, ... }    │
├────────────────────────────────────────────────┤
│ 消费层  useSession()                            │
│         → 任意组件读取登录态（如 users/_layout）  │
└────────────────────────────────────────────────┘
```

- Provider 挂在根 `_layout.tsx` 最外层，全局可用
- token 存在系统安全存储里（非 AsyncStorage），请求时由 `request.js` 自动取出放进 `Authorization: Bearer <token>`

### 4.2 登录守卫：未登录时"我的"页显示什么

`src/app/(tabs)/users/_layout.tsx` 用**条件渲染**做页面级守卫：

```tsx
const { session, isLoading } = useSession();

if (isLoading) return <Loading />;        // 还在读存储
if (!session)  return <SignInNotice />;   // 未登录：整页换成提示组件
return <Slot />;                          // 已登录：正常渲染子路由
```

`SignInNotice` 组件（`src/components/(tabs)/users/SignInNotice.js`）渲染"登录"按钮：

```tsx
<Link href={{ pathname: '/auth' }} asChild>
  <TouchableOpacity><Text>登录</Text></TouchableOpacity>
</Link>
```

### 4.3 登录完整时序

```
用户点击「登录」
  → Link 跳转 /auth（modal 从底部弹出，src/app/auth/index.tsx）
  → 用户填写账号密码，提交表单
  → 调用 useSession().signIn(formParams, setLoading)   ← ctx.js
      → POST /auth/sign_in { login, password }
      → 成功:
          setSession(data.token)     # token 写入 SecureStore
          session 状态更新，触发所有 useSession 消费者重渲染
          router.dismiss()           # 关闭登录弹窗
      → 失败:
          Alert 弹出后端返回的 err.errors[0]
  → 回到「我的」Tab
  → users/_layout 重新渲染: session 有值 → <Slot /> → 显示用户信息
```

关键点：**跳回用户页不需要手动 navigate**——`setSession` 触发 Context 更新，`users/_layout.tsx` 的条件渲染自动从 `<SignInNotice />` 切换回 `<Slot />`。状态驱动界面，而不是命令式控制界面。

### 4.4 token 过期的兜底

`src/utils/request.js` 统一处理所有请求：

```js
if (!response.ok) {
  if (response.status === 401) {
    router.navigate('/auth/sign-out');   // token 失效 → 强制走登出
    return;
  }
  ...
}
```

任何页面发起的请求只要返回 401（token 过期/无效），都会被这一层拦截并跳到登出流程，业务代码不需要各自处理。

### 4.5 注册与注销

同一套 Context 还提供：

- `signUp(formParams)`：`POST /auth/sign_up`，成功后同样 `setSession(token)`，Alert 确认后 `dismiss`
- `signOut()`：`setSession(null)`，删除本地 token
- `destroyAccount()`：`DELETE /users/me` 注销账号 + `setSession(null)`

---

## 五、速查表

| 想做什么 | 改哪里 |
|---------|--------|
| 加一个 Tab 页 | `(tabs)/` 下建文件 + `(tabs)/_layout.tsx` 加 `<Tabs.Screen>` 配置 |
| 加一个普通页面 | `app/` 下建文件（根 `_layout` 注册只为配标题/modal） |
| 加一个弹窗页 | 建文件 + 根 `_layout` 配 `presentation: 'modal'` |
| 让某文件不出现在 Tab 栏 | `<Tabs.Screen name="x" options={{ href: null }} />` |
| 改启动首页 | `index.tsx` 的归属（谁叫 index 谁是 `/`） |
| 读登录态 | `const { session } = useSession()` |
| 调接口 | `import { get, post } from '@/utils/request'` |
| 配置接口地址 | `fronted/.env` 的 `EXPO_PUBLIC_API_URL`（改完重启 Metro） |

# i18n 迁移规范（供批量迁移使用）

项目用 i18n-js v4 + expo-localization，核心 API 在 `src/i18n/index.js`：

```js
import { t as tt } from '@/i18n';   // 任意文件（组件/非组件）都能用
tt('wallet.create.title');           // 普通取词
tt('wallet.created', { name });      // 插值：文案里写 %{name}
```

## 逐文件操作流程

1. 通读目标文件，找出所有**用户可见**的中文字符串：
   - JSX 文本节点、`placeholder`、`Alert.alert(标题, 内容, 按钮文案)`
   - `throw new Error('...')`（这些 message 最终会显示在 Alert 里）
   - 组件 props 里的标题（如 `<SubPageHeader title="..." />`）
2. 把它们替换成 `tt('<域>.<页面>.<语义化key>')`
3. 把中文原文与英文翻译**同步写入** `src/i18n/locales/zh/<你的域>.js` 和 `src/i18n/locales/en/<你的域>.js`
   （域文件已有 `export default {}` 占位，往里填）

## 规则

- **key 命名**：`<域>.<页面或功能>.<语义>`，camelCase，如 `wallet.import.pasteMnemonic`。
  同一页面多条文案归到同一小节。
- **注释不要动**：`//` 与 `/** */` 里的中文保持原样，不做迁移。
- **不翻译**：代币符号（BNB/USDT）、协议名（PancakeSwap/Aave/1inch/CoinGecko）、URL、
  纯符号（✕ ▾ %）、console.log / console.warn 的调试输出。
- **变量名冲突**：很多组件里 `const t = useTheme()` 已占用 `t`，
  一律 `import { t as tt } from '@/i18n'` 用 `tt`，不要改动已有的主题变量。
- **复用 common**：通用词（确认/取消/加载中/成功/失败/交易哈希等）先查
  `src/i18n/locales/zh/common.js`，已有一律用 `tt('common.xxx')`，不要重复定义。
  common 由主线维护，**不要编辑 common.js / tabs.js / index.js**。
- **文案里带变量的**：用插值 `%{name}`，调用处传 `{ name }`。
- **模板字符串**：`` `转账 ${addr} 失败` `` → `tt('key', { addr })` + 英文 `'Transfer to %{addr} failed'`。
- **只做这一件事**：不要顺手重构、改样式、改逻辑；除中文字符串替换与 import 外的 diff 越小越好。
- 完成后对每个改过的文件自查：文件里不应再剩**用户可见**的中文字符串（注释除外）。

## 英文翻译要求

- 简洁、钱包类 App 语气（如“余额不足”→ 'Insufficient balance'）；
- 句子短、不用复杂时态；UI 按钮/标题用 Title Case 或短句。

// 钱包本地存储
//
// 助记词是全部资产的根，用 expo-secure-store（iOS Keychain / Android Keystore）保存；
// 非敏感数据（账号列表、交易记录、当前选中账号）用 AsyncStorage 保存。
//
// 按登录账号分开保存：每个登录用户的钱包数据存在自己的命名空间下
// （键前缀 wallet.u<uid>.），切换登录只是切换前缀，数据永不搬家，
// 不存在「归档/恢复中途失败丢数据」的问题。退出登录后读不到任何数据，
// 重新登录后该用户的命名空间原样恢复。
//
// 历史遗留：早期版本用「整体归档」（wallet.archive.<uid>__<键>）和
// 无前缀明文键存数据，migrateLegacyInto 负责把它们一次性搬进命名空间。

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MNEMONIC_KEY = 'wallet.mnemonic';
const WALLET_META_KEY = 'wallet.meta';
const TX_HISTORY_KEY = 'wallet.transactions';
const PK_KEY_PREFIX = 'wallet.pk.';
const ACCOUNT_MNEMONIC_PREFIX = 'wallet.account-mnemonic.';

// 当前登录用户的钱包命名空间（'' = 未登录/未绑定，读写落到 wallet.none.* 的空命名空间）
const ACTIVE_OWNER_KEY = 'wallet.activeOwner';
let activeOwner = ''; // 内存缓存
let ownerLoadedPromise = null;

function ensureOwnerLoaded() {
  if (!ownerLoadedPromise) {
    ownerLoadedPromise = AsyncStorage.getItem(ACTIVE_OWNER_KEY).then((v) => {
      activeOwner = v ?? '';
    });
  }
  return ownerLoadedPromise;
}

/** 带命名空间的键：登录用户各有一套，未登录是隔离的空命名空间 */
function k(key) {
  return `wallet.u${activeOwner || 'none'}.${key}`;
}

/**
 * 切换钱包数据归属（登录/退出时调用，幂等）
 * @param uid 登录用户 id（/users/me 返回的 user.id）；退出登录传 null
 */
export async function switchWalletOwner(uid) {
  await ensureOwnerLoaded();
  const next = uid != null ? String(uid) : '';
  if (activeOwner === next) return;
  // 登录新用户时，把该用户的历史遗留数据（旧版归档/明文键）搬进他的命名空间
  if (next) {
    await migrateLegacyInto(next);
  }
  activeOwner = next;
  await AsyncStorage.setItem(ACTIVE_OWNER_KEY, activeOwner);
}

/**
 * 一次性迁移：把旧版数据搬进 targetOwner 的命名空间
 * 对每个键按优先级找来源：旧版按用户归档（wallet.archive.<uid>__*）→
 * 遗留归档（wallet.archive.__local____*）→ 无前缀明文键。
 * （上次归档可能中途失败，meta 在归档里而助记词还在明文键里，所以逐键找）
 */
async function migrateLegacyInto(targetOwner) {
  const prefix = `wallet.u${targetOwner}.`;
  const all = await AsyncStorage.getAllKeys();
  // 目标命名空间已经有数据就不动（迁移只做一次）
  if (all.includes(prefix + WALLET_META_KEY)) return;

  const sources = [
    `wallet.archive.${targetOwner}__`,
    'wallet.unone.', // 曾经「已登录但未绑定」时创建的钱包（当前设备正显示的）
    'wallet.archive.__local____',
    '', // 无前缀明文活跃键（最早期）
  ];

  async function copyAsync(base) {
    for (const src of sources) {
      const srcKey = src + base;
      if (!all.includes(srcKey)) continue;
      const value = await AsyncStorage.getItem(srcKey);
      if (value !== null) {
        await AsyncStorage.setItem(prefix + base, value);
        if (src !== '') await AsyncStorage.removeItem(srcKey);
        return true;
      }
    }
    return false;
  }

  async function copySecure(base) {
    for (const src of sources) {
      const srcKey = src + base;
      try {
        const value = await SecureStore.getItemAsync(srcKey);
        if (value !== null) {
          await SecureStore.setItemAsync(prefix + base, value);
          if (src !== '') await SecureStore.deleteItemAsync(srcKey).catch(() => {});
          return true;
        }
      } catch {}
    }
    return false;
  }

  await copyAsync(WALLET_META_KEY);
  await copyAsync(TX_HISTORY_KEY);
  await copySecure(MNEMONIC_KEY);
  // 按迁移后的 meta 找回各账号的私钥 / 独立助记词
  try {
    const meta = JSON.parse((await AsyncStorage.getItem(prefix + WALLET_META_KEY)) ?? 'null');
    for (const addr of meta?.accounts ?? []) {
      if (!addr) continue;
      const lower = addr.toLowerCase();
      await copySecure(PK_KEY_PREFIX + lower);
      await copySecure(ACCOUNT_MNEMONIC_PREFIX + lower);
    }
  } catch {}
}

/** 是否已创建钱包：当前命名空间里有助记词或账号 */
export async function hasWallet() {
  await ensureOwnerLoaded();
  const meta = await getMeta();
  return (await SecureStore.getItemAsync(k(MNEMONIC_KEY)) !== null) || meta.accounts.length > 0;
}

/** 读取助记词（仅在签名/导出时调用） */
export function getMnemonic() {
  return SecureStore.getItemAsync(k(MNEMONIC_KEY));
}

/** 保存助记词（创建/导入钱包时调用一次） */
export function saveMnemonic(mnemonic) {
  return SecureStore.setItemAsync(k(MNEMONIC_KEY), mnemonic);
}

/** 读取钱包元数据 */
export async function getMeta() {
  await ensureOwnerLoaded();
  const raw = await AsyncStorage.getItem(k(WALLET_META_KEY));
  if (!raw) return { accounts: [], current: 0 };
  try {
    return JSON.parse(raw);
  } catch {
    return { accounts: [], current: 0 };
  }
}

/** 保存钱包元数据 */
export function saveMeta(meta) {
  return AsyncStorage.setItem(k(WALLET_META_KEY), JSON.stringify(meta));
}

/** 账号显示名（无自定义名时用「账号 N」） */
export function accountName(meta, index) {
  return meta?.names?.[index] || `账号 ${index + 1}`;
}

/**
 * 添加账号：追加到账号列表
 * @param type 账号类型：'mnemonic'（助记词派生，默认）| 'private-key'（导入私钥）
 * @returns 更新后的 meta
 */
export async function addAccount(mnemonic, index, address, type = 'mnemonic') {
  const meta = await getMeta();
  meta.accounts[index] = address;
  if (!meta.names) meta.names = [];
  meta.names[index] = `账号 ${index + 1}`;
  if (!meta.types) meta.types = [];
  meta.types[index] = type;
  meta.current = index;
  await saveMeta(meta);
  return meta;
}

// ---------- 账号私钥（导入私钥方式创建的账号） ----------

/** 保存账号私钥（按地址存 SecureStore） */
export function savePrivateKey(address, privateKeyHex) {
  return SecureStore.setItemAsync(k(PK_KEY_PREFIX) + address.toLowerCase(), privateKeyHex);
}

/** 读取账号私钥（无则返回 null） */
export function getPrivateKey(address) {
  return SecureStore.getItemAsync(k(PK_KEY_PREFIX) + address.toLowerCase());
}

/** 删除账号私钥 */
export function deletePrivateKey(address) {
  return SecureStore.deleteItemAsync(k(PK_KEY_PREFIX) + address.toLowerCase());
}

/** 账号类型：'mnemonic'（默认）| 'private-key' | 'external' */
export function accountType(meta, index) {
  return meta?.types?.[index] ?? 'mnemonic';
}

// ---------- 账号独立助记词（「创建助记词」方式新增的账号，每个账号一套助记词） ----------

/** 保存账号独立助记词（按地址存 SecureStore） */
export function saveAccountMnemonic(address, mnemonic) {
  return SecureStore.setItemAsync(k(ACCOUNT_MNEMONIC_PREFIX) + address.toLowerCase(), mnemonic);
}

/** 读取账号独立助记词（无则返回 null） */
export function getAccountMnemonic(address) {
  return SecureStore.getItemAsync(k(ACCOUNT_MNEMONIC_PREFIX) + address.toLowerCase());
}

/**
 * 取账号签名用的助记词：优先账号独立助记词，否则用根助记词（BIP44 派生的账号）
 */
export async function getSigningMnemonic(address, index) {
  const own = address ? await getAccountMnemonic(address) : null;
  if (own) return own;
  return getMnemonic();
}

/** 切换当前账号 */
export async function switchAccount(index) {
  const meta = await getMeta();
  meta.current = Math.min(index, meta.accounts.length - 1);
  await saveMeta(meta);
  return meta;
}

/**
 * 删除账号（对齐参考项目 AccountSelectorView 的 onDelete）：
 * 若删的是当前账号，选中退化为最后一个账号；没有账号则清空选择
 */
export async function deleteAccount(index) {
  const meta = await getMeta();
  const wasCurrent = meta.current === index;
  // 导入私钥/独立助记词的账号要连带清掉 SecureStore 里的机密数据
  const addr = meta.accounts[index];
  if (addr) {
    if (meta.types?.[index] === 'private-key') {
      await deletePrivateKey(addr);
    } else {
      await SecureStore.deleteItemAsync(k(ACCOUNT_MNEMONIC_PREFIX) + addr.toLowerCase()).catch(() => {});
    }
  }
  meta.accounts.splice(index, 1);
  if (meta.names) meta.names.splice(index, 1);
  if (meta.types) meta.types.splice(index, 1);
  if (wasCurrent || meta.current >= meta.accounts.length) {
    meta.current = Math.max(0, meta.accounts.length - 1);
  }
  await saveMeta(meta);
  return meta;
}

/** 删除钱包（清空当前命名空间下的全部数据，含导入的私钥与账号独立助记词） */
export async function deleteWallet() {
  const meta = await getMeta();
  await Promise.all(
    meta.accounts.flatMap((addr) => {
      if (!addr) return [];
      const lower = addr.toLowerCase();
      return [
        SecureStore.deleteItemAsync(k(PK_KEY_PREFIX) + lower).catch(() => {}),
        SecureStore.deleteItemAsync(k(ACCOUNT_MNEMONIC_PREFIX) + lower).catch(() => {}),
      ];
    })
  );
  await SecureStore.deleteItemAsync(k(MNEMONIC_KEY)).catch(() => {});
  await AsyncStorage.removeItem(k(WALLET_META_KEY));
  await AsyncStorage.removeItem(k(TX_HISTORY_KEY));
}

/** 删除某登录用户的全部钱包数据（注销账号时调用，不可恢复） */
export async function discardWallet(uid) {
  if (uid == null) return;
  const prefix = `wallet.u${uid}.`;
  // AsyncStorage 键可直接枚举删除
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
  await Promise.all(keys.map((key) => AsyncStorage.removeItem(key)));
  // SecureStore 键无法枚举，按 meta 推断
  try {
    const meta = JSON.parse((await AsyncStorage.getItem(prefix + WALLET_META_KEY)) ?? 'null');
    for (const addr of meta?.accounts ?? []) {
      if (!addr) continue;
      const lower = addr.toLowerCase();
      await SecureStore.deleteItemAsync(prefix + PK_KEY_PREFIX + lower).catch(() => {});
      await SecureStore.deleteItemAsync(prefix + ACCOUNT_MNEMONIC_PREFIX + lower).catch(() => {});
    }
    await SecureStore.deleteItemAsync(prefix + MNEMONIC_KEY).catch(() => {});
  } catch {}
}

// ---------- 交易记录 ----------

/**
 * 交易记录：[{ id, from, to, amount, chain, chainSymbol, status, txHash?, time }]
 * status: '处理中' | '成功' | '失败'（旧记录没有 status 视为已广播的「成功」）
 */

/** 读取交易记录（新的在前） */
export async function getTransactions() {
  await ensureOwnerLoaded();
  const raw = await AsyncStorage.getItem(k(TX_HISTORY_KEY));
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 追加一条交易记录（自动补 id/时间；status 缺省为「处理中」） */
export async function addTransaction(record) {
  const list = await getTransactions();
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: '处理中',
    chain: 'ethereum',
    chainSymbol: 'ETH',
    ...record,
    time: Date.now(),
  };
  list.unshift(item);
  await AsyncStorage.setItem(k(TX_HISTORY_KEY), JSON.stringify(list.slice(0, 100)));
  return item;
}

/** 按 id 更新交易记录（状态流转：处理中 → 成功/失败） */
export async function updateTransaction(id, patch) {
  const list = await getTransactions();
  const index = list.findIndex((t) => t.id === id);
  if (index === -1) return;
  list[index] = { ...list[index], ...patch };
  await AsyncStorage.setItem(k(TX_HISTORY_KEY), JSON.stringify(list));
}

/** 按 id 删除一条交易记录（转账记录滑动删除） */
export async function deleteTransaction(id) {
  const list = await getTransactions();
  await AsyncStorage.setItem(
    k(TX_HISTORY_KEY),
    JSON.stringify(list.filter((t) => t.id !== id))
  );
}

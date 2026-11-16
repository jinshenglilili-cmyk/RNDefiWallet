// 钱包本地存储
//
// 一个登录 uid 对应一份完整的钱包用户信息，收敛为单个 AsyncStorage 键：
//   wallet.u<uid>.wallet.data = { meta, transactions }（整体读写）
// 敏感凭据（各账号的私钥）用 expo-secure-store（iOS Keychain / Android Keystore）
// 单独保存（按需读取，不放进用户信息对象）。
//
// 助记词不落盘：仅在创建/导入账号的那一刻用于派生私钥（原生 derivePrivateKey），
// 展示一次后即丢弃，之后所有签名都只用各账号的私钥。
// 旧版本存的助记词由 ensureAccountPrivateKeys 一次性转换（派生私钥 → 删助记词）。
//
// 按登录账号分开保存：每个登录用户的用户信息存在自己的命名空间下
// （键前缀 wallet.u<uid>.），切换登录只是切换前缀，数据永不搬家。
// 退出登录后读不到任何数据，重新登录后该用户的命名空间原样恢复。
//
// 历史遗留：更早版本把 meta / transactions 拆成两个键存（wallet.meta /
// wallet.transactions），最初版本还有「整体归档」（wallet.archive.<uid>__<键>）
// 和无前缀明文键。migrateLegacyInto 负责把旧数据一次性搬进命名空间并
// 收敛为单对象格式；getUserData 读取时也会对旧格式做同样的收敛。

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Wallet from '@wallet';
import { t as tt } from '@/i18n';

/** 用户信息对象（单键）：{ meta: {accounts, names?, types?, current}, transactions: [...] } */
const WALLET_DATA_KEY = 'wallet.data';
// 旧版分键（读取时收敛为单对象）
const LEGACY_META_KEY = 'wallet.meta';
const LEGACY_TX_KEY = 'wallet.transactions';
// 旧版助记词键（仅用于迁移：转换成私钥后删除）
const MNEMONIC_KEY = 'wallet.mnemonic';
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

/** 当前命名空间前缀：登录用户各有一套，未登录是隔离的空命名空间 */
function ownerPrefix() {
  return `wallet.u${activeOwner || 'none'}.`;
}

/** 带命名空间的键 */
function k(key) {
  return ownerPrefix() + key;
}

/**
 * 切换钱包数据归属（登录/退出时调用，幂等）
 * @param uid 登录用户 id（/users/me 返回的 user.id）；退出登录传 null
 */
export async function switchWalletOwner(uid) {
  await ensureOwnerLoaded();
  const next = uid != null ? String(uid) : '';
  if (activeOwner === next) return;
  // 登录新用户时，把该用户的历史遗留数据（旧版归档/分键/明文键）搬进他的命名空间
  if (next) {
    await migrateLegacyInto(next);
  }
  activeOwner = next;
  await AsyncStorage.setItem(ACTIVE_OWNER_KEY, activeOwner);
}

/**
 * 一次性迁移：把旧版数据搬进 targetOwner 的命名空间并收敛为单对象格式
 * 对每个键按优先级找来源：旧版按用户归档（wallet.archive.<uid>__*）→
 * 遗留归档（wallet.archive.__local____*）→ 无前缀明文键。
 * （上次归档可能中途失败，meta 在归档里而私钥还在明文键里，所以逐键找）
 */
async function migrateLegacyInto(targetOwner) {
  const prefix = `wallet.u${targetOwner}.`;
  const all = await AsyncStorage.getAllKeys();
  // 目标命名空间已经是单对象格式就不动（迁移只做一次）
  if (all.includes(prefix + WALLET_DATA_KEY)) return;

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

  await copyAsync(LEGACY_META_KEY);
  await copyAsync(LEGACY_TX_KEY);
  await copySecure(MNEMONIC_KEY);
  // 按迁移后的 meta 找回各账号的私钥 / 独立助记词
  try {
    const meta = JSON.parse((await AsyncStorage.getItem(prefix + LEGACY_META_KEY)) ?? 'null');
    for (const addr of meta?.accounts ?? []) {
      if (!addr) continue;
      const lower = addr.toLowerCase();
      await copySecure(PK_KEY_PREFIX + lower);
      await copySecure(ACCOUNT_MNEMONIC_PREFIX + lower);
    }
  } catch {}

  // 收敛为单对象格式（分键 → wallet.data）
  const { data } = await readNamespaceData(prefix);
  await AsyncStorage.setItem(prefix + WALLET_DATA_KEY, JSON.stringify(data));
  await AsyncStorage.removeItem(prefix + LEGACY_META_KEY);
  await AsyncStorage.removeItem(prefix + LEGACY_TX_KEY);
}

/**
 * 读取一个命名空间的用户信息（单对象）。
 * 新格式：prefix + wallet.data；旧格式（分键）现读现合并，标记 isNew=false。
 */
async function readNamespaceData(prefix) {
  const raw = await AsyncStorage.getItem(prefix + WALLET_DATA_KEY);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) ?? {};
      return {
        isNew: true,
        data: {
          meta: parsed.meta ?? { accounts: [], current: 0 },
          transactions: parsed.transactions ?? [],
        },
      };
    } catch {}
  }
  // 旧版分键：合并成单对象返回
  let meta = { accounts: [], current: 0 };
  let transactions = [];
  try {
    meta = JSON.parse((await AsyncStorage.getItem(prefix + LEGACY_META_KEY)) ?? '') ?? meta;
  } catch {}
  try {
    transactions = JSON.parse((await AsyncStorage.getItem(prefix + LEGACY_TX_KEY)) ?? '') ?? transactions;
  } catch {}
  return { isNew: false, data: { meta, transactions } };
}

/**
 * 读取当前命名空间的全部用户信息（单对象 { meta, transactions }）。
 * 首次读到旧版分键格式时自动收敛为单对象（写回 wallet.data 并删除旧键）。
 */
export async function getUserData() {
  await ensureOwnerLoaded();
  const prefix = ownerPrefix();
  const { isNew, data } = await readNamespaceData(prefix);
  if (!isNew) {
    await AsyncStorage.setItem(prefix + WALLET_DATA_KEY, JSON.stringify(data));
    await AsyncStorage.removeItem(prefix + LEGACY_META_KEY).catch(() => {});
    await AsyncStorage.removeItem(prefix + LEGACY_TX_KEY).catch(() => {});
  }
  return data;
}

/** 整体保存当前用户的用户信息（单对象） */
export function saveUserData(data) {
  return AsyncStorage.setItem(k(WALLET_DATA_KEY), JSON.stringify(data));
}

/** 是否已创建钱包：当前命名空间里有账号 */
export async function hasWallet() {
  await ensureOwnerLoaded();
  const { meta } = await getUserData();
  return meta.accounts.length > 0;
}

/**
 * 把旧版助记词账号一次性转换成私钥账号（幂等，启动 load 时调用）：
 * 每个账号若还没有私钥 → 从旧存的助记词派生出私钥存 SecureStore，
 * 然后删除全部旧助记词（根助记词 + 账号独立助记词）。
 * 根助记词派生账号的 BIP44 序号没有记录，按地址在 0..N 范围里扫描匹配找回。
 */
export async function ensureAccountPrivateKeys() {
  await ensureOwnerLoaded();
  const { meta } = await getUserData();
  if (!meta?.accounts?.length) return;
  const rootMnemonic = await SecureStore.getItemAsync(k(MNEMONIC_KEY)).catch(() => null);
  let hasRoot = !!rootMnemonic;
  for (let i = 0; i < meta.accounts.length; i++) {
    const addr = meta.accounts[i];
    if (!addr) continue;
    const lower = addr.toLowerCase();
    if (await getPrivateKey(addr)) continue;
    // 账号独立助记词：该账号就是这套助记词的 index 0
    const own = await SecureStore.getItemAsync(k(ACCOUNT_MNEMONIC_PREFIX) + lower).catch(() => null);
    let pk = null;
    try {
      if (own) {
        pk = await Wallet.derivePrivateKey('ethereum', own, 0);
      } else if (rootMnemonic) {
        // 根助记词派生账号：按地址匹配找回派生序号（删除账号会让序号与位置错开）
        const scanMax = meta.accounts.length * 2 + 10;
        for (let idx = 0; idx <= scanMax && !pk; idx++) {
          const derived = await Wallet.deriveAddress('ethereum', rootMnemonic, idx);
          if (derived.toLowerCase() === lower) {
            pk = await Wallet.derivePrivateKey('ethereum', rootMnemonic, idx);
          }
        }
      }
    } catch {}
    if (pk) await savePrivateKey(addr, pk);
    // 无论转换成败都清掉账号独立助记词（转换失败说明助记词对不上，留着也无用）
    if (own) await SecureStore.deleteItemAsync(k(ACCOUNT_MNEMONIC_PREFIX) + lower).catch(() => {});
  }
  if (hasRoot) await SecureStore.deleteItemAsync(k(MNEMONIC_KEY)).catch(() => {});
}

/** 账号显示名（无自定义名时用「账号 N」） */
export function accountName(meta, index) {
  return meta?.names?.[index] || tt('wallet.common.accountName', { index: index + 1 });
}

// ---------- 账号私钥（所有账号统一用私钥签名） ----------

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

/** 账号类型（创建方式记录）：'mnemonic'（助记词派生/生成）| 'private-key'（导入私钥）| 'external' */
export function accountType(meta, index) {
  return meta?.types?.[index] ?? 'mnemonic';
}

/**
 * 取账号签名凭据：各账号的私钥（助记词已不再持久化，签名统一走私钥）
 * privateKey 为 null 表示没有凭据（旧数据转换失败/账号异常），调用方需给出提示
 */
export async function getSigningCredential(address) {
  const pk = address ? await getPrivateKey(address) : null;
  return { privateKey: pk };
}

/**
 * 删除账号（对齐参考项目 AccountSelectorView 的 onDelete）：
 * 若删的是当前账号，选中退化为最后一个账号；没有账号则清空选择
 * @returns 清理机密数据需要的账号信息（地址/类型），meta 更新由 useWalletStore 负责
 */
export async function deleteAccountSecrets(meta, index) {
  const addr = meta.accounts[index];
  if (!addr) return;
  await deletePrivateKey(addr);
  // 旧版独立助记词键（若迁移前残留）一并清理
  await SecureStore.deleteItemAsync(k(ACCOUNT_MNEMONIC_PREFIX) + addr.toLowerCase()).catch(() => {});
}

/** 删除钱包（清空当前命名空间下的用户信息 + 机密数据） */
export async function deleteWallet() {
  const { meta } = await getUserData();
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
  await AsyncStorage.removeItem(k(WALLET_DATA_KEY));
  // 旧版分键（若有残留）一并清掉
  await AsyncStorage.removeItem(k(LEGACY_META_KEY)).catch(() => {});
  await AsyncStorage.removeItem(k(LEGACY_TX_KEY)).catch(() => {});
}

/** 删除某登录用户的全部钱包数据（注销账号时调用，不可恢复） */
export async function discardWallet(uid) {
  if (uid == null) return;
  const prefix = `wallet.u${uid}.`;
  // AsyncStorage 键可直接枚举删除（wallet.data 也在前缀内）
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
  await Promise.all(keys.map((key) => AsyncStorage.removeItem(key)));
  // SecureStore 键无法枚举，按 meta 推断（新格式/旧格式都兼容）
  try {
    const { data } = await readNamespaceData(prefix);
    for (const addr of data.meta?.accounts ?? []) {
      if (!addr) continue;
      const lower = addr.toLowerCase();
      await SecureStore.deleteItemAsync(prefix + PK_KEY_PREFIX + lower).catch(() => {});
      await SecureStore.deleteItemAsync(prefix + ACCOUNT_MNEMONIC_PREFIX + lower).catch(() => {});
    }
    await SecureStore.deleteItemAsync(prefix + MNEMONIC_KEY).catch(() => {});
  } catch {}
}

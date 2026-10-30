// WalletConnect v2 服务层（dApp 端）
//
// 通过 SignClient 与 MetaMask / Trust 等外部钱包建立会话：
// 生成连接二维码 -> 钱包扫码确认 -> 拿到账户地址 -> 可发起 personal_sign 签名。
//
// 需要 WalletConnect Project ID（https://cloud.walletconnect.com 免费注册），
// 写在 fronted/.env 里：EXPO_PUBLIC_WC_PROJECT_ID=xxxxx

import '@walletconnect/react-native-compat';
import { SignClient } from '@walletconnect/sign-client';

const PROJECT_ID = process.env.EXPO_PUBLIC_WC_PROJECT_ID || '';
const RELAY_URL = 'wss://relay.walletconnect.com';

// 主网命名空间，目前只连以太坊系
const ETH_CHAINS = ['eip155:1'];

let clientPromise = null;

/** 获取（或初始化）全局唯一的 SignClient 实例 */
export function getClient() {
  if (!PROJECT_ID) {
    throw new Error(
      '缺少 WalletConnect Project ID，请在 fronted/.env 中配置 EXPO_PUBLIC_WC_PROJECT_ID'
    );
  }
  if (!clientPromise) {
    clientPromise = SignClient.init({
      projectId: PROJECT_ID,
      relayUrl: RELAY_URL,
      metadata: {
        name: 'RN Defi Wallet',
        description: 'RN 课程项目：内嵌钱包 + WalletConnect',
        url: 'https://example.com',
        icons: ['https://walletconnect.com/walletconnect-logo.png'],
      },
    });
  }
  return clientPromise;
}

/** 是否已配置 Project ID，用于 UI 提示 */
export function isConfigured() {
  return PROJECT_ID !== '';
}

/**
 * 发起连接，返回 { uri, approval }。
 * uri 用于渲染二维码（wc: 开头）；approval 是等待钱包确认的 Promise，
 * resolve 后得到 session（含账户地址）。
 */
export async function connect() {
  const client = await getClient();
  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      eip155: {
        chains: ETH_CHAINS,
        methods: ['eth_sendTransaction', 'personal_sign'],
        events: ['chainChanged', 'accountsChanged'],
      },
    },
  });
  if (!uri) throw new Error('生成连接 URI 失败');
  return { uri, approval };
}

/** 从 session 中取出第一个账户地址（完整格式 eip155:1:0x...） */
export function getAccount(session) {
  return session?.namespaces?.eip155?.accounts?.[0] ?? '';
}

/** 取纯地址部分（0x...） */
export function getAddress(session) {
  const account = getAccount(session);
  return account.split(':')[2] ?? '';
}

/**
 * 用 personal_sign 让钱包签名消息
 * @param {object} session   当前会话
 * @param {string} message   待签名消息
 * @returns {string} 签名结果
 */
export async function signMessage(session, message) {
  const client = await getClient();
  const account = getAccount(session);
  const address = getAddress(session);
  const hexMessage = toHex(message);
  return await client.request({
    topic: session.topic,
    chainId: ETH_CHAINS[0],
    request: {
      method: 'personal_sign',
      params: [hexMessage, address],
    },
  });
}

/** 断开当前会话 */
export async function disconnect(session) {
  const client = await getClient();
  await client.disconnect({
    topic: session.topic,
    reason: { code: 6000, message: 'User disconnected' },
  });
}

/**
 * 尝试恢复本地保存的会话（App 重启后复用，不用重新扫码）
 * @returns {object|null} session 或 null
 */
export async function restoreSession() {
  const client = await getClient();
  const topics = client.session.keys;
  if (topics.length === 0) return null;
  return client.session.get(topics[topics.length - 1]);
}

/** 监听钱包主动断开（如在 MetaMask 里删掉了会话） */
export function onSessionDelete(callback) {
  getClient().then((client) => {
    client.on('session_delete', callback);
  });
}

function toHex(str) {
  return (
    '0x' +
    Array.from(new TextEncoder().encode(str))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

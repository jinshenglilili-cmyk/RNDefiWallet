import { NativeModule, requireNativeModule } from 'expo';

/**
 * 支持的链
 * - ethereum: 以太坊
 * - tron:     波场 TRON
 * - bitcoin:  比特币
 */
export type Coin = 'ethereum' | 'tron' | 'bitcoin';

/**
 * 多条链的地址集合（由助记词派生）
 */
export type WalletAddresses = {
  ethereum: string;
  tron: string;
  bitcoin: string;
};

/**
 * 导入钱包的结果
 */
export type ImportedWallet = {
  /** 助记词原文 */
  mnemonic: string;
  /** 三条链的默认地址（BIP44 默认路径派生） */
  addresses: WalletAddresses;
};

/**
 * 签名消息的附加选项
 */
export type SignMessageOptions = {
  /** 助记词密码（BIP39 第 25 个单词），默认空 */
  passphrase?: string;
  /** Bitcoin 消息签名需要传入签名用的 BTC 地址 */
  bitcoinAddress?: string;
};

/**
 * 以太坊交易签名参数
 * 金额类字段接受十进制字符串（推荐）或 hex 字符串，内部自动转为最小大端编码
 */
export type EthereumSignParams = {
  /** 链 ID，如 '1'（以太坊主网）、'56'（BSC），也可用 hex '0x1' */
  chainId: string;
  /** 账户 nonce，如 '9' */
  nonce: string;
  /** gas 价格（wei），如 '3600000000' */
  gasPrice: string;
  /** gas 上限，如 '21000' */
  gasLimit: string;
  /** 收款地址 */
  to: string;
  /** 转账金额（wei），如 '1000000000000000000' 表示 1 ETH */
  value: string;
  /** 可选：合约调用的 data 字段（hex 字符串，可带 0x 前缀） */
  data?: string;
};

/**
 * 波场交易签名参数
 * amount 单位是 sun（1 TRX = 1,000,000 sun）
 * 区块头信息从波场节点接口（walletsolidity/getnowblock）获取
 */
export type TronSignParams = {
  /** 收款地址（T 开头） */
  to: string;
  /** 转账金额（sun） */
  amount: number;
  /** 可选：能量/带宽费用上限（sun），默认 0 */
  feeLimit?: number;
  /** 交易创建时间戳（毫秒） */
  timestamp: number;
  /** 交易过期时间戳（毫秒），一般取 timestamp + 10 分钟 */
  expiration: number;
  /** 最新区块高度 */
  blockNumber: number;
  /** 最新区块时间戳（毫秒） */
  blockTimestamp: number;
  /** 最新区块 parentHash（hex，可带 0x 前缀） */
  parentHash: string;
  /** 可选：出块见证人地址（hex） */
  witnessAddress?: string;
  /** 可选：区块 Merkel 根（hex） */
  txTrieRoot?: string;
  /** 可选：备注 */
  memo?: string;
};

/**
 * 比特币 UTXO 输入
 * script 为该 UTXO 的锁定脚本（scriptPubKey，hex）
 * txid 使用区块链浏览器/接口返回的原始顺序（内部会自动转为签名需要的字节序）
 */
export type BitcoinUtxo = {
  /** 交易 ID（hex） */
  txid: string;
  /** 输出序号 */
  vout: number;
  /** UTXO 金额（聪 satoshi） */
  amount: number;
  /** 锁定脚本（scriptPubKey，hex） */
  script: string;
};

/**
 * 比特币交易签名参数
 * 金额单位为聪（satoshi），1 BTC = 100,000,000 sat
 */
export type BitcoinSignParams = {
  /** 收款地址 */
  to: string;
  /** 转账金额（聪），useMaxAmount 为 true 时忽略 */
  amount: number;
  /** 手续费率（聪/字节） */
  byteFee: number;
  /** 找零地址（一般传自己的地址） */
  changeAddress: string;
  /** UTXO 列表 */
  utxos: BitcoinUtxo[];
  /** 是否转出全部可用余额（含手续费） */
  useMaxAmount?: boolean;
  /** 可选：P2SH 系地址需要的赎回脚本，key 为脚本 hex，value 为 redeem script hex */
  scripts?: Record<string, string>;
};

/**
 * 各链的签名参数
 */
export type SignParams = {
  ethereum: EthereumSignParams;
  tron: TronSignParams;
  bitcoin: BitcoinSignParams;
};

declare class WalletNativeModule extends NativeModule<{
  generateMnemonic(strength?: number, passphrase?: string): Promise<string>;
  validateMnemonic(mnemonic: string): Promise<boolean>;
  importWallet(mnemonic: string, passphrase?: string): Promise<ImportedWallet>;
  /** 导入私钥（hex），返回对应的以太坊地址 */
  importPrivateKey(privateKeyHex: string): Promise<{ address: string }>;
  signMessage(
    coin: Coin,
    mnemonic: string,
    message: string,
    options?: SignMessageOptions
  ): Promise<string>;
  /** 用私钥（hex）签名以太坊消息（EIP-191） */
  signMessageWithPrivateKey(privateKeyHex: string, message: string): Promise<string>;
  signTransaction(
    coin: Coin,
    mnemonic: string,
    params: SignParams[Coin],
    options?: { passphrase?: string }
  ): Promise<string>;
  /** 按账户序号派生地址（BIP44 路径 index 位），用于多账号切换 */
  deriveAddress(coin: Coin, mnemonic: string, index: number, passphrase?: string): Promise<string>;
}> {}

const native = requireNativeModule<WalletNativeModule>('Wallet');

/**
 * 数值转最小大端 hex（带 0x 前缀）
 * 接受十进制字符串或 hex 字符串，统一归一化，0 返回 '0x'（空字节，表示数值 0）
 */
function toHex(value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`非法的数值：${value}`);
  }
  const raw = value.trim().replace(/^0[xX]/, '');
  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(`非法的数值：${value}`);
  }
  // BigInt 归一化：十进制和 hex 都能正确转换，并去掉前导 0
  return `0x${BigInt(`0x${raw}`).toString(16)}`;
}

/**
 * 归一化以太坊参数里的全部金额字段
 */
function normalizeEthereumParams(params: EthereumSignParams): Record<string, unknown> {
  return {
    ...params,
    chainId: toHex(params.chainId),
    nonce: toHex(params.nonce),
    gasPrice: toHex(params.gasPrice),
    gasLimit: toHex(params.gasLimit),
    value: toHex(params.value),
    data: params.data ?? '0x',
  };
}

/**
 * Wallet 模块
 *
 * 基于 Trust Wallet Core 实现的内嵌钱包基础能力：
 * 助记词生成 / 校验 / 导入、多链地址派生（ETH、TRON、BTC）、消息签名、交易签名。
 *
 * 模块本身不保存任何私钥状态，所有方法无状态，助记词由调用方自行通过
 * expo-secure-store 等方式安全保管。
 *
 * @example
 * import Wallet from '@/modules/wallet';
 *
 * // 1. 生成 12 个单词的助记词
 * const mnemonic = await Wallet.generateMnemonic(128);
 *
 * // 2. 校验并导入钱包，得到三条链的地址
 * const wallet = await Wallet.importWallet(mnemonic);
 * // wallet.addresses.ethereum / wallet.addresses.tron / wallet.addresses.bitcoin
 *
 * // 3. 签名以太坊转账（0.01 ETH）
 * const rawTx = await Wallet.signTransaction('ethereum', mnemonic, {
 *   chainId: '1',
 *   nonce: '0',
 *   gasPrice: '3600000000',
 *   gasLimit: '21000',
 *   to: '0x3535353535353535353535353535353535353535',
 *   value: '10000000000000000',
 * });
 */
const Wallet = {
  /** 生成新助记词（strength: 128 = 12 词，256 = 24 词） */
  generateMnemonic(strength: 128 | 256 = 128, passphrase = ''): Promise<string> {
    return native.generateMnemonic(strength, passphrase);
  },

  /** 校验助记词是否合法 */
  validateMnemonic(mnemonic: string): Promise<boolean> {
    return native.validateMnemonic(mnemonic);
  },

  /** 导入助记词，返回钱包信息和三条链的默认地址 */
  importWallet(mnemonic: string, passphrase = ''): Promise<ImportedWallet> {
    return native.importWallet(mnemonic, passphrase);
  },

  /** 导入私钥（hex），返回对应的以太坊地址 */
  importPrivateKey(privateKeyHex: string): Promise<{ address: string }> {
    return native.importPrivateKey(privateKeyHex.trim().replace(/^0x/i, ''));
  },

  /**
   * 签名消息
   * - ethereum: EIP-191 个人消息签名（等价于 MetaMask personal_sign）
   * - tron:     TRON 消息签名
   * - bitcoin:  Bitcoin 消息签名（需要通过 options.bitcoinAddress 传入 BTC 地址）
   */
  signMessage(
    coin: Coin,
    mnemonic: string,
    message: string,
    options?: SignMessageOptions
  ): Promise<string> {
    return native.signMessage(coin, mnemonic, message, options);
  },

  /** 用私钥（hex）签名以太坊消息（EIP-191，等价 personal_sign） */
  signMessageWithPrivateKey(privateKeyHex: string, message: string): Promise<string> {
    return native.signMessageWithPrivateKey(privateKeyHex.trim().replace(/^0x/i, ''), message);
  },

  /**
   * 签名交易
   * - ethereum: 返回原始交易 hex（eth_sendRawTransaction 可直接广播）
   * - tron:     返回交易 JSON（broadcasttransaction 可直接广播）
   * - bitcoin:  返回原始交易 hex（sendrawtransaction 可直接广播）
   */
  signTransaction<C extends Coin>(
    coin: C,
    mnemonic: string,
    params: SignParams[C],
    options?: { passphrase?: string }
  ): Promise<string> {
    if (coin === 'ethereum') {
      return native.signTransaction(
        coin,
        mnemonic,
        normalizeEthereumParams(params as EthereumSignParams) as SignParams[C],
        options
      );
    }
    return native.signTransaction(coin, mnemonic, params, options);
  },

  /** 原生模块本体（一般不需要直接使用） */
  native,

  /**
   * 按账户序号派生某条链的地址
   * index 0 = 默认账户（与 importWallet 的地址一致），1、2… 为新增账号
   */
  deriveAddress(coin: Coin, mnemonic: string, index: number, passphrase = ''): Promise<string> {
    return native.deriveAddress(coin, mnemonic, index, passphrase);
  },
};

export default Wallet;

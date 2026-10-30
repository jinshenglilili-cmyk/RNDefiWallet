import ExpoModulesCore
import WalletCore

/**
 * Wallet 原生模块（iOS）
 *
 * 基于 Trust Wallet Core 实现内嵌钱包的基础 Web3 能力：
 * 助记词生成 / 校验 / 导入、多链地址派生（ETH、TRON、BTC）、消息签名、交易签名。
 *
 * 模块无状态：不保存任何私钥，助记词由调用方传入并通过 SecureStore 等方式自行保管。
 */
public class WalletModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Wallet")

    // 生成新助记词（strength: 128 = 12 词，256 = 24 词）
    AsyncFunction("generateMnemonic") { (strength: Int?, passphrase: String?) -> String in
      let strength = strength ?? 128
      guard strength == 128 || strength == 256 else {
        throw Exception(name: "InvalidStrength", description: "强度只支持 128（12 词）或 256（24 词）")
      }
      guard let wallet = HDWallet(strength: Int32(strength), passphrase: passphrase ?? "") else {
        throw Exception(name: "WalletError", description: "生成助记词失败")
      }
      return wallet.mnemonic
    }

    // 校验助记词（BIP39 词表 + 校验和）
    AsyncFunction("validateMnemonic") { (mnemonic: String) -> Bool in
      Mnemonic.isValid(mnemonic: normalizeMnemonic(mnemonic))
    }

    // 导入助记词，返回三条链的默认地址
    AsyncFunction("importWallet") { (mnemonic: String, passphrase: String?) -> [String: Any] in
      let wallet = try makeWallet(mnemonic, passphrase)
      return [
        "mnemonic": wallet.mnemonic,
        "addresses": [
          "ethereum": wallet.getAddressForCoin(coin: .ethereum) ?? "",
          "tron": wallet.getAddressForCoin(coin: .tron) ?? "",
          "bitcoin": wallet.getAddressForCoin(coin: .bitcoin) ?? "",
        ],
      ]
    }

    // 签名消息：ETH 用 EIP-191，TRON 用 TRON 消息格式，BTC 需要传入 BTC 地址
    AsyncFunction("signMessage") {
      (coin: String, mnemonic: String, message: String, options: [String: Any]?) -> String in
      let wallet = try makeWallet(mnemonic, options?["passphrase"] as? String)

      switch coin {
      case "ethereum":
        let key = try keyFor(wallet, .ethereum)
        return EthereumMessageSigner.signMessage(privateKey: key, message: message)
      case "tron":
        let key = try keyFor(wallet, .tron)
        return TronMessageSigner.signMessage(privateKey: key, message: message)
      case "bitcoin":
        guard let address = options?["bitcoinAddress"] as? String, !address.isEmpty else {
          throw Exception(name: "MissingAddress", description: "Bitcoin 消息签名需要传入 bitcoinAddress")
        }
        let key = try keyFor(wallet, .bitcoin)
        return BitcoinMessageSigner.signMessage(privateKey: key, address: address, message: message)
      default:
        throw unsupportedCoin(coin)
      }
    }

    // 签名交易，返回可广播的原始交易 hex
    AsyncFunction("signTransaction") {
      (coin: String, mnemonic: String, params: [String: Any], options: [String: Any]?) -> String in
      let wallet = try makeWallet(mnemonic, options?["passphrase"] as? String)

      switch coin {
      case "ethereum":
        return try signEthereumTransaction(wallet, params)
      case "tron":
        return try signTronTransaction(wallet, params)
      case "bitcoin":
        return try signBitcoinTransaction(wallet, params)
      default:
        throw unsupportedCoin(coin)
      }
    }

    // 导入私钥（hex），返回对应的以太坊地址
    AsyncFunction("importPrivateKey") { (hex: String) -> [String: Any] in
      let key = try privateKeyFromHex(hex)
      let address = CoinType.ethereum.deriveAddress(privateKey: key)
      return ["address": address]
    }

    // 用私钥（hex）签名以太坊消息（EIP-191，等价 personal_sign）
    AsyncFunction("signMessageWithPrivateKey") { (hex: String, message: String) -> String in
      let key = try privateKeyFromHex(hex)
      return EthereumMessageSigner.signMessage(privateKey: key, message: message)
    }

    // 按账户序号派生地址（BIP44 路径 index 位），用于多账号切换
    AsyncFunction("deriveAddress") { (coin: String, mnemonic: String, index: Int, passphrase: String?) -> String in
      let wallet = try makeWallet(mnemonic, passphrase)
      guard let coinType = coinTypeByName(coin) else {
        throw unsupportedCoin(coin)
      }
      // derivationPath() 是带 %d 占位符的模板，如 "m/44'/60'/0'/0/%d"
      let path = String(format: coinType.derivationPath(), index)
      guard let key = wallet.getKey(coin: coinType, derivationPath: path) else {
        throw Exception(name: "WalletError", description: "派生地址失败（index: \(index)）")
      }
      return coinType.deriveAddress(privateKey: key)
    }
  }

  // MARK: - 各链交易签名

  /// 以太坊交易签名（Legacy 交易）
  /// 金额类字段接收 hex 字符串（可带 0x 前缀），JS 层负责把十进制转成 hex
  private func signEthereumTransaction(_ wallet: HDWallet, _ params: [String: Any]) throws -> String {
    let chainId = try hexValue(params, "chainId")
    let nonce = try hexValue(params, "nonce")
    let gasPrice = try hexValue(params, "gasPrice")
    let gasLimit = try hexValue(params, "gasLimit")
    let value = try hexValue(params, "value")

    guard let to = params["to"] as? String, !to.isEmpty else {
      throw Exception(name: "InvalidParams", description: "缺少收款地址 to")
    }

    let dataHex = params["data"] as? String
    let privateKeyData = try keyFor(wallet, .ethereum).data

    let input = EthereumSigningInput.with {
      $0.chainID = minimalData(hex: chainId)
      $0.nonce = minimalData(hex: nonce)
      $0.gasPrice = minimalData(hex: gasPrice)
      $0.gasLimit = minimalData(hex: gasLimit)
      $0.toAddress = to
      $0.privateKey = privateKeyData
      $0.transaction = EthereumTransaction.with {
        $0.transfer = EthereumTransaction.Transfer.with {
          $0.amount = minimalData(hex: value)
          $0.data = minimalData(hex: dataHex ?? "")
        }
      }
    }

    let output: EthereumSigningOutput = AnySigner.sign(input: input, coin: .ethereum)
    try checkError(output.error.rawValue, output.errorMessage)
    return output.encoded.hexString
  }

  /// 波场交易签名（TRX 转账）
  /// 区块头信息从波场节点 walletsolidity/getnowblock 接口获取
  private func signTronTransaction(_ wallet: HDWallet, _ params: [String: Any]) throws -> String {
    guard let to = params["to"] as? String, !to.isEmpty else {
      throw Exception(name: "InvalidParams", description: "缺少收款地址 to")
    }
    guard let amount = params["amount"] as? Int64 else {
      throw Exception(name: "InvalidParams", description: "缺少转账金额 amount（单位 sun）")
    }
    guard let timestamp = params["timestamp"] as? Int64,
      let expiration = params["expiration"] as? Int64,
      let blockNumber = params["blockNumber"] as? Int64,
      let blockTimestamp = params["blockTimestamp"] as? Int64,
      let parentHash = params["parentHash"] as? String
    else {
      throw Exception(name: "InvalidParams", description: "缺少区块头信息（timestamp / expiration / blockNumber / blockTimestamp / parentHash）")
    }

    let contract = TronTransferContract.with {
      $0.ownerAddress = wallet.getAddressForCoin(coin: .tron) ?? ""
      $0.toAddress = to
      $0.amount = amount
    }

    let tronPrivateKeyData = try keyFor(wallet, .tron).data

    let input = TronSigningInput.with {
      $0.transaction = TronTransaction.with {
        $0.contractOneof = .transfer(contract)
        $0.timestamp = timestamp
        $0.expiration = expiration
        $0.feeLimit = params["feeLimit"] as? Int64 ?? 0
        $0.memo = params["memo"] as? String ?? ""
        $0.blockHeader = TronBlockHeader.with {
          $0.timestamp = blockTimestamp
          $0.number = blockNumber
          $0.parentHash = minimalData(hex: parentHash)
          if let witnessAddress = params["witnessAddress"] as? String {
            $0.witnessAddress = minimalData(hex: witnessAddress)
          }
          if let txTrieRoot = params["txTrieRoot"] as? String {
            $0.txTrieRoot = minimalData(hex: txTrieRoot)
          }
        }
      }
      $0.privateKey = tronPrivateKeyData
    }

    let output: TronSigningOutput = AnySigner.sign(input: input, coin: .tron)
    try checkError(output.error.rawValue, output.errorMessage)
    // 返回完整的交易 JSON，可直接调用波场节点 broadcasttransaction 广播
    return output.json
  }

  /// 比特币交易签名
  /// utxos 由 JS 层从链上接口获取，script 为 UTXO 的锁定脚本
  private func signBitcoinTransaction(_ wallet: HDWallet, _ params: [String: Any]) throws -> String {
    guard let to = params["to"] as? String, !to.isEmpty else {
      throw Exception(name: "InvalidParams", description: "缺少收款地址 to")
    }
    guard let amount = params["amount"] as? Int64,
      let byteFee = params["byteFee"] as? Int64,
      let changeAddress = params["changeAddress"] as? String,
      let utxos = params["utxos"] as? [[String: Any]], !utxos.isEmpty
    else {
      throw Exception(name: "InvalidParams", description: "缺少 amount / byteFee / changeAddress / utxos")
    }

    let bitcoinPrivateKeyData = try keyFor(wallet, .bitcoin).data

    let input = BitcoinSigningInput.with {
      $0.hashType = BitcoinScript.hashTypeForCoin(coinType: .bitcoin)
      $0.amount = amount
      $0.byteFee = byteFee
      $0.toAddress = to
      $0.changeAddress = changeAddress
      $0.useMaxAmount = params["useMaxAmount"] as? Bool ?? false
      $0.coinType = UInt32(CoinType.bitcoin.rawValue)
      $0.privateKey = [bitcoinPrivateKeyData]
      $0.utxo = utxos.map { utxo in
        BitcoinUnspentTransaction.with {
          $0.outPoint = BitcoinOutPoint.with {
            // 接口返回的 txid 是展示顺序，签名需要内部字节序（反向）
            $0.hash = reversedData(hex: utxo["txid"] as? String ?? "")
            $0.index = UInt32(utxo["vout"] as? Int ?? 0)
          }
          $0.script = minimalData(hex: utxo["script"] as? String ?? "")
          $0.amount = Int64(utxo["amount"] as? Int ?? 0)
        }
      }
      if let scripts = params["scripts"] as? [String: String] {
        $0.scripts = scripts.mapValues { minimalData(hex: $0) }
      }
    }

    let output: BitcoinSigningOutput = AnySigner.sign(input: input, coin: .bitcoin)
    try checkError(output.error.rawValue, output.errorMessage)
    return output.encoded.hexString
  }

  // MARK: - 工具方法

  /// 链名 -> CoinType
  private func coinTypeByName(_ name: String) -> CoinType? {
    switch name {
    case "ethereum": return .ethereum
    case "tron": return .tron
    case "bitcoin": return .bitcoin
    default: return nil
    }
  }

  /// 用助记词构建钱包，非法助记词直接抛错
  private func makeWallet(_ mnemonic: String, _ passphrase: String?) throws -> HDWallet {
    let normalized = normalizeMnemonic(mnemonic)
    guard Mnemonic.isValid(mnemonic: normalized) else {
      throw Exception(name: "InvalidMnemonic", description: "助记词不合法")
    }
    guard let wallet = HDWallet(mnemonic: normalized, passphrase: passphrase ?? "") else {
      throw Exception(name: "WalletError", description: "创建钱包失败")
    }
    return wallet
  }

  /// 派生某条链的默认私钥
  private func keyFor(_ wallet: HDWallet, _ coin: CoinType) throws -> PrivateKey {
    guard let key = wallet.getKeyForCoin(coin: coin) else {
      throw Exception(name: "WalletError", description: "派生私钥失败")
    }
    return key
  }

  /// 从 hex 字符串解析私钥，非法输入抛错
  private func privateKeyFromHex(_ hex: String) throws -> PrivateKey {
    let data = try dataFromHex(hex)
    guard let key = PrivateKey(data: data) else {
      throw Exception(name: "InvalidPrivateKey", description: "私钥不合法")
    }
    return key
  }

  /// 去掉多余空白并转小写，保证词表校验稳定
  private func normalizeMnemonic(_ mnemonic: String) -> String {
    return mnemonic
      .split(whereSeparator: { $0.isWhitespace || $0 == "\n" || $0 == "\r" || $0 == "\t" })
      .joined(separator: " ")
      .lowercased()
  }

  /// 从参数字典里取数值字段（十进制或 hex 字符串均可），JS 层一般已转为 hex
  private func hexValue(_ params: [String: Any], _ key: String) throws -> String {
    guard let value = params[key] as? String, !value.isEmpty else {
      throw Exception(name: "InvalidParams", description: "缺少数值字段 \(key)")
    }
    return value
  }

  /// 检查签名输出错误码，非 0 抛出
  private func checkError(_ error: Int, _ message: String) throws {
    if error != 0 {
      throw Exception(name: "SignError", description: "签名失败：\(message)")
    }
  }

  private func unsupportedCoin(_ coin: String) -> Exception {
    return Exception(name: "UnsupportedCoin", description: "不支持的链：\(coin)，只支持 ethereum / tron / bitcoin")
  }
}

// MARK: - Hex 与字节处理

extension WalletModule {
  /// 解析 hex 字符串为 Data（支持 0x 前缀），非法输入抛错
  fileprivate func dataFromHex(_ hex: String) throws -> Data {
    var string = hex
    if string.hasPrefix("0x") || string.hasPrefix("0X") {
      string.removeFirst(2)
    }
    guard string.count % 2 == 0,
      string.allSatisfy({ $0.isHexDigit })
    else {
      throw Exception(name: "InvalidHex", description: "非法的 hex 字符串：\(hex)")
    }
    return Data(hexString: string) ?? Data()
  }

  /// 解析 hex 并去掉开头的 0x00 字节，得到最小大端编码（空串返回空 Data，表示数值 0）
  fileprivate func minimalData(hex: String) -> Data {
    var data: Data
    do {
      data = try dataFromHex(hex)
    } catch {
      data = Data()
    }
    while let first = data.first, first == 0 {
      data.removeFirst()
    }
    return data
  }

  /// 解析 hex 并反转字节序（用于 Bitcoin UTXO 的 txid）
  fileprivate func reversedData(hex: String) -> Data {
    var data = minimalData(hex: hex)
    return Data(data.reversed())
  }
}

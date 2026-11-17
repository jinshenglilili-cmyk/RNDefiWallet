package expo.modules.wallet

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.google.protobuf.ByteString
import expo.modules.kotlin.exception.Exception
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import wallet.core.java.AnySigner
import wallet.core.jni.BitcoinMessageSigner
import wallet.core.jni.BitcoinScript
import wallet.core.jni.CoinType
import wallet.core.jni.EthereumMessageSigner
import wallet.core.jni.HDWallet
import wallet.core.jni.Mnemonic
import wallet.core.jni.PrivateKey
import wallet.core.jni.TronMessageSigner
import wallet.core.jni.proto.Bitcoin
import wallet.core.jni.proto.Common
import wallet.core.jni.proto.Ethereum
import wallet.core.jni.proto.Tron

/**
 * Wallet 原生模块（Android）
 *
 * 基于 Trust Wallet Core 实现内嵌钱包的基础 Web3 能力：
 * 助记词生成 / 校验 / 导入、多链地址派生（ETH、TRON、BTC）、消息签名、交易签名。
 *
 * 基础能力之外，模块还内置私钥保管（AndroidKeyStore AES/GCM 加密 + SharedPreferences 密文）：
 * JS 层只传地址引用，「按地址签名」在原生层解密私钥完成，私钥 hex 不会跨桥进入 JS 上下文
 * （savePrivateKey / signTransactionWithStoredKey / signMessageWithStoredKey）。
 */
class WalletModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Wallet")

    // 生成新助记词（strength: 128 = 12 词，256 = 24 词）
    AsyncFunction("generateMnemonic") { strength: Int?, passphrase: String? ->
      val realStrength = strength ?: 128
      if (realStrength != 128 && realStrength != 256) {
        throw Exception("InvalidStrength", "强度只支持 128（12 词）或 256（24 词）")
      }
      HDWallet(realStrength, passphrase ?: "").mnemonic()
    }

    // 校验助记词（BIP39 词表 + 校验和）
    AsyncFunction("validateMnemonic") { mnemonic: String ->
      Mnemonic.isValid(normalizeMnemonic(mnemonic))
    }

    // 导入助记词，返回三条链的默认地址
    AsyncFunction("importWallet") { mnemonic: String, passphrase: String? ->
      val wallet = makeWallet(mnemonic, passphrase)
      mapOf(
        "mnemonic" to wallet.mnemonic(),
        "addresses" to mapOf(
          "ethereum" to wallet.getAddressForCoin(CoinType.ETHEREUM),
          "tron" to wallet.getAddressForCoin(CoinType.TRON),
          "bitcoin" to wallet.getAddressForCoin(CoinType.BITCOIN)
        )
      )
    }

    // 签名消息：ETH 用 EIP-191，TRON 用 TRON 消息格式，BTC 需要传入 BTC 地址
    AsyncFunction("signMessage") { coin: String, mnemonic: String, message: String, options: Map<String, Any?>? ->
      val wallet = makeWallet(mnemonic, options?.get("passphrase") as? String)

      when (coin) {
        "ethereum" -> {
          val key = wallet.getKeyForCoin(CoinType.ETHEREUM)
          EthereumMessageSigner.signMessage(key, message)
        }
        "tron" -> {
          val key = wallet.getKeyForCoin(CoinType.TRON)
          TronMessageSigner.signMessage(key, message)
        }
        "bitcoin" -> {
          val address = options?.get("bitcoinAddress") as? String
          if (address.isNullOrEmpty()) {
            throw Exception("MissingAddress", "Bitcoin 消息签名需要传入 bitcoinAddress")
          }
          val key = wallet.getKeyForCoin(CoinType.BITCOIN)
          BitcoinMessageSigner.signMessage(key, address, message)
        }
        else -> throw unsupportedCoin(coin)
      }
    }

    // 签名交易，返回可广播的原始交易（hex，TRON 返回交易 JSON）
    AsyncFunction("signTransaction") { coin: String, mnemonic: String, params: Map<String, Any?>, options: Map<String, Any?>? ->
      val wallet = makeWallet(mnemonic, options?.get("passphrase") as? String)

      when (coin) {
        "ethereum" -> signEthereumTransaction(
          ByteString.copyFrom(wallet.getKeyForCoin(CoinType.ETHEREUM).data()),
          params
        )
        "tron" -> signTronTransaction(wallet, params)
        "bitcoin" -> signBitcoinTransaction(wallet, params)
        else -> throw unsupportedCoin(coin)
      }
    }

    // 用私钥（hex）直接签名以太坊交易（私钥导入账号的签名通道），返回可广播的原始交易 hex
    AsyncFunction("signTransactionWithPrivateKey") { coin: String, hex: String, params: Map<String, Any?> ->
      if (coin != "ethereum") {
        throw unsupportedCoin(coin)
      }
      signEthereumTransaction(ByteString.copyFrom(hexToBytes(hex)), params)
    }

    // 导入私钥（hex），返回对应的以太坊地址
    AsyncFunction("importPrivateKey") { hex: String ->
      val key = PrivateKey(hexToBytes(hex))
      mapOf("address" to CoinType.ETHEREUM.deriveAddress(key))
    }

    // 签名以太坊消息（EIP-191，等价 personal_sign），用私钥（hex）直接签名
    AsyncFunction("signMessageWithPrivateKey") { hex: String, message: String ->
      EthereumMessageSigner.signMessage(PrivateKey(hexToBytes(hex)), message)
    }

    // ---------- 私钥保管（AndroidKeyStore 加密）：JS 层只拿地址引用，私钥不进 JS ----------

    // 保存账号私钥（按地址存，AES/GCM 加密后落 SharedPreferences，仅原生层可解）
    AsyncFunction("savePrivateKey") { address: String, hex: String ->
      val keyBytes = hexToBytes(hex)
      if (keyBytes.size != 32) {
        throw Exception("InvalidPrivateKey", "私钥不合法")
      }
      pkPrefs().edit().putString(pkKey(address), encryptToBase64(keyBytes)).apply()
      true
    }

    // 是否已保存某账号的私钥（不返回私钥本身）
    AsyncFunction("hasPrivateKey") { address: String ->
      pkPrefs().contains(pkKey(address))
    }

    // 删除账号私钥
    AsyncFunction("deletePrivateKey") { address: String ->
      pkPrefs().edit().remove(pkKey(address)).apply()
      true
    }

    // 用保管中的私钥签名以太坊消息（EIP-191）：按地址在原生层解密私钥，私钥不回 JS
    AsyncFunction("signMessageWithStoredKey") { address: String, message: String ->
      EthereumMessageSigner.signMessage(PrivateKey(storedPrivateKeyBytes(address)), message)
    }

    // 用保管中的私钥签名以太坊交易：按地址在原生层解密私钥，私钥不回 JS
    AsyncFunction("signTransactionWithStoredKey") { coin: String, address: String, params: Map<String, Any?> ->
      if (coin != "ethereum") {
        throw unsupportedCoin(coin)
      }
      signEthereumTransaction(ByteString.copyFrom(storedPrivateKeyBytes(address)), params)
    }

    // 按账户序号派生地址（BIP44 路径 index 位），用于多账号切换
    AsyncFunction("deriveAddress") { coin: String, mnemonic: String, index: Int, passphrase: String? ->
      val wallet = makeWallet(mnemonic, passphrase)
      val coinType = when (coin) {
        "ethereum" -> CoinType.ETHEREUM
        "tron" -> CoinType.TRON
        "bitcoin" -> CoinType.BITCOIN
        else -> throw unsupportedCoin(coin)
      }
      // derivationPath() 是带 %d 占位符的模板，如 "m/44'/60'/0'/0/%d"
      val path = String.format(coinType.derivationPath(), index)
      val key = wallet.getKey(path) ?: throw Exception("WalletError", "派生地址失败（index: $index）")
      coinType.deriveAddress(key)
    }

    // 按账户序号派生以太坊私钥（BIP44 路径 index 位）。
    // 仅在账号创建/迁移那一刻调用：拿到地址后由 JS 调 savePrivateKey 存入原生保管，
    // 助记词本身不再持久化（展示一次后即丢弃）。
    AsyncFunction("derivePrivateKey") { mnemonic: String, index: Int, passphrase: String? ->
      val wallet = makeWallet(mnemonic, passphrase)
      val path = String.format(CoinType.ETHEREUM.derivationPath(), index)
      val key = wallet.getKey(path) ?: throw Exception("WalletError", "派生私钥失败（index: $index）")
      toHex(key.data().toByteArray())
    }
  }

  // MARK: - 各链交易签名

  /// 以太坊交易签名（Legacy 交易）
  /// 金额类字段接收 hex 字符串（可带 0x 前缀），JS 层负责把十进制转成 hex
  private fun signEthereumTransaction(
    privateKey: ByteString,
    params: Map<String, Any?>
  ): String {
    val chainId = hexValue(params, "chainId")
    val nonce = hexValue(params, "nonce")
    val gasPrice = hexValue(params, "gasPrice")
    val gasLimit = hexValue(params, "gasLimit")
    val value = hexValue(params, "value")
    val to = params["to"] as? String
    if (to.isNullOrEmpty()) {
      throw Exception("InvalidParams", "缺少收款地址 to")
    }
    val data = params["data"] as? String

    val input = Ethereum.SigningInput.newBuilder()
      .setChainId(ByteString.copyFrom(minimalBytes(chainId)))
      .setNonce(ByteString.copyFrom(minimalBytes(nonce)))
      .setGasPrice(ByteString.copyFrom(minimalBytes(gasPrice)))
      .setGasLimit(ByteString.copyFrom(minimalBytes(gasLimit)))
      .setToAddress(to)
      .setPrivateKey(privateKey)
      .setTransaction(
        Ethereum.Transaction.newBuilder()
          .setTransfer(
            Ethereum.Transaction.Transfer.newBuilder()
              .setAmount(ByteString.copyFrom(minimalBytes(value)))
              .setData(ByteString.copyFrom(minimalBytes(data ?: "")))
              .build()
          )
          .build()
      )

    val output = AnySigner.sign(input.build(), CoinType.ETHEREUM, Ethereum.SigningOutput.parser())
    checkError(output.error, output.errorMessage)
    return toHex(output.encoded.toByteArray())
  }

  /// 波场交易签名（TRX 转账）
  /// 区块头信息从波场节点 walletsolidity/getnowblock 接口获取
  private fun signTronTransaction(
    wallet: HDWallet,
    params: Map<String, Any?>
  ): String {
    val to = params["to"] as? String
    if (to.isNullOrEmpty()) {
      throw Exception("InvalidParams", "缺少收款地址 to")
    }
    val timestamp = longValue(params, "timestamp")
    val expiration = longValue(params, "expiration")
    val blockNumber = longValue(params, "blockNumber")
    val blockTimestamp = longValue(params, "blockTimestamp")
    val parentHash = params["parentHash"] as? String
    if (parentHash.isNullOrEmpty()) {
      throw Exception("InvalidParams", "缺少区块头信息（timestamp / expiration / blockNumber / blockTimestamp / parentHash）")
    }

    val contract = Tron.TransferContract.newBuilder()
      .setOwnerAddress(wallet.getAddressForCoin(CoinType.TRON))
      .setToAddress(to)
      .setAmount(longValue(params, "amount"))
      .build()

    val blockHeader = Tron.BlockHeader.newBuilder()
      .setTimestamp(blockTimestamp)
      .setNumber(blockNumber)
      .setParentHash(ByteString.copyFrom(minimalBytes(parentHash)))
    (params["witnessAddress"] as? String)?.let { blockHeader.witnessAddress = ByteString.copyFrom(minimalBytes(it)) }
    (params["txTrieRoot"] as? String)?.let { blockHeader.txTrieRoot = ByteString.copyFrom(minimalBytes(it)) }

    val transaction = Tron.Transaction.newBuilder()
      .setTransfer(contract)
      .setTimestamp(timestamp)
      .setExpiration(expiration)
      .setFeeLimit(longValue(params, "feeLimit"))
      .setMemo(params["memo"] as? String ?: "")
      .setBlockHeader(blockHeader.build())
      .build()

    val input = Tron.SigningInput.newBuilder()
      .setTransaction(transaction)
      .setPrivateKey(ByteString.copyFrom(wallet.getKeyForCoin(CoinType.TRON).data()))
      .build()

    val output = AnySigner.sign(input, CoinType.TRON, Tron.SigningOutput.parser())
    checkError(output.error, output.errorMessage)
    // 返回完整的交易 JSON，可直接调用波场节点 broadcasttransaction 广播
    return output.json
  }

  /// 比特币交易签名
  /// utxos 由 JS 层从链上接口获取，script 为 UTXO 的锁定脚本
  private fun signBitcoinTransaction(
    wallet: HDWallet,
    params: Map<String, Any?>
  ): String {
    val to = params["to"] as? String
    if (to.isNullOrEmpty()) {
      throw Exception("InvalidParams", "缺少收款地址 to")
    }
    val changeAddress = params["changeAddress"] as? String
    if (changeAddress.isNullOrEmpty()) {
      throw Exception("InvalidParams", "缺少找零地址 changeAddress")
    }
    @Suppress("UNCHECKED_CAST")
    val utxos = params["utxos"] as? List<Map<String, Any?>>
    if (utxos.isNullOrEmpty()) {
      throw Exception("InvalidParams", "缺少 utxos")
    }

    val input = Bitcoin.SigningInput.newBuilder()
      .setHashType(BitcoinScript.hashTypeForCoin(CoinType.BITCOIN))
      .setAmount(longValue(params, "amount"))
      .setByteFee(longValue(params, "byteFee"))
      .setToAddress(to)
      .setChangeAddress(changeAddress)
      .setUseMaxAmount(boolValue(params, "useMaxAmount"))
      .setCoinType(CoinType.BITCOIN.value())
      .addPrivateKey(ByteString.copyFrom(wallet.getKeyForCoin(CoinType.BITCOIN).data()))

    utxos.forEach { utxo ->
      val outPoint = Bitcoin.OutPoint.newBuilder()
        // 接口返回的 txid 是展示顺序，签名需要内部字节序（反向）
        .setHash(ByteString.copyFrom(reversedBytes(utxo["txid"] as? String ?: "")))
        .setIndex(intValue(utxo, "vout"))
        .build()
      input.addUtxo(
        Bitcoin.UnspentTransaction.newBuilder()
          .setOutPoint(outPoint)
          .setScript(ByteString.copyFrom(minimalBytes(utxo["script"] as? String ?: "")))
          .setAmount(longValue(utxo, "amount"))
          .build()
      )
    }

    @Suppress("UNCHECKED_CAST")
    (params["scripts"] as? Map<String, String>)?.forEach { (key, value) ->
      input.putScripts(key, ByteString.copyFrom(minimalBytes(value)))
    }

    val output = AnySigner.sign(input.build(), CoinType.BITCOIN, Bitcoin.SigningOutput.parser())
    checkError(output.error, output.errorMessage)
    return toHex(output.encoded.toByteArray())
  }

  // MARK: - 私钥保管（AndroidKeyStore AES/GCM + SharedPreferences 密文）

  private companion object {
    const val MASTER_KEY_ALIAS = "wallet_pk_master"
    const val PK_PREFS = "wallet_pk"
  }

  /// 私钥密文存放的 SharedPreferences（app 私有目录，密文不可读出明文）
  private fun pkPrefs() =
    appContext?.reactContext?.getSharedPreferences(PK_PREFS, Context.MODE_PRIVATE)
      ?: throw Exception("StorageError", "无法访问本地存储")

  /// Keychain/Keystore 账号键：按小写地址区分账号
  private fun pkKey(address: String) = "pk.${address.lowercase()}"

  /// AndroidKeyStore 里的 AES/GCM 主密钥（首次调用生成，之后复用）
  private fun masterKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getEntry(MASTER_KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        MASTER_KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build()
    )
    return generator.generateKey()
  }

  /// 加密为 "base64(iv):base64(ciphertext)"（GCM 的 iv 每次随机，随密文一起存）
  private fun encryptToBase64(plain: ByteArray): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, masterKey())
    val cipherText = cipher.doFinal(plain)
    return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
      Base64.encodeToString(cipherText, Base64.NO_WRAP)
  }

  /// 解密 "base64(iv):base64(ciphertext)"
  private fun decryptFromBase64(stored: String): ByteArray {
    val parts = stored.split(":", limit = 2)
    if (parts.size != 2) throw Exception("StorageError", "私钥密文格式不合法")
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, masterKey(), javax.crypto.spec.GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
    return cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP))
  }

  /// 从保管中解密账号私钥字节（仅原生层内部使用，结果不回 JS）
  private fun storedPrivateKeyBytes(address: String): ByteArray {
    val stored = pkPrefs().getString(pkKey(address), null)
      ?: throw Exception("NoPrivateKey", "未找到该账号的私钥，请先重新创建/导入账号")
    return try {
      decryptFromBase64(stored)
    } catch (e: Exception) {
      throw Exception("StorageError", "读取私钥失败")
    }
  }

  // MARK: - 工具方法

  /// 用助记词构建钱包，非法助记词直接抛错
  private fun makeWallet(mnemonic: String, passphrase: String?): HDWallet {
    val normalized = normalizeMnemonic(mnemonic)
    if (!Mnemonic.isValid(normalized)) {
      throw Exception("InvalidMnemonic", "助记词不合法")
    }
    return HDWallet(normalized, passphrase ?: "")
  }

  /// 去掉多余空白并转小写，保证词表校验稳定
  private fun normalizeMnemonic(mnemonic: String): String {
    return mnemonic.trim().split(Regex("\\s+")).joinToString(" ").lowercase()
  }

  private fun hexValue(params: Map<String, Any?>, key: String): String {
    val value = params[key] as? String
    if (value.isNullOrEmpty()) {
      throw Exception("InvalidParams", "缺少数值字段 $key")
    }
    return value
  }

  private fun checkError(error: Common.SigningError, message: String) {
    if (error != Common.SigningError.OK) {
      throw Exception("SignError", "签名失败：$message")
    }
  }

  private fun unsupportedCoin(coin: String): Exception {
    return Exception("UnsupportedCoin", "不支持的链：$coin，只支持 ethereum / tron / bitcoin")
  }

  private fun longValue(map: Map<String, Any?>, key: String): Long {
    return when (val v = map[key]) {
      is Long -> v
      is Int -> v.toLong()
      is Double -> v.toLong()
      is Number -> v.toLong()
      else -> 0L
    }
  }

  private fun intValue(map: Map<String, Any?>, key: String): Int {
    return when (val v = map[key]) {
      is Int -> v
      is Long -> v.toInt()
      is Double -> v.toInt()
      is Number -> v.toInt()
      else -> 0
    }
  }

  private fun boolValue(map: Map<String, Any?>, key: String): Boolean {
    return map[key] as? Boolean ?: false
  }

  /// hex 字符串转字节数组（支持 0x 前缀，奇数位自动补 0）
  private fun hexToBytes(hex: String): ByteArray {
    var s = hex.removePrefix("0x").removePrefix("0X")
    if (s.isEmpty()) return ByteArray(0)
    if (s.length % 2 != 0) s = "0$s"
    return s.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
  }

  /// 字节数组转小写 hex
  private fun toHex(bytes: ByteArray): String {
    return bytes.joinToString("") { "%02x".format(it) }
  }

  /// 解析 hex 并去掉开头的 0x00 字节，得到最小大端编码（空串返回空数组，表示数值 0）
  private fun minimalBytes(hex: String): ByteArray {
    val bytes = hexToBytes(hex)
    var i = 0
    while (i < bytes.size && bytes[i] == 0.toByte()) i++
    return bytes.copyOfRange(i, bytes.size)
  }

  /// 解析 hex 并反转字节序（用于 Bitcoin UTXO 的 txid）
  private fun reversedBytes(hex: String): ByteArray {
    return minimalBytes(hex).reversedArray()
  }
}

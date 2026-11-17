// 生物识别门禁：所有涉及私钥签名的路径统一从这里过
//
// 签名即验身——DeFi 交易（txSender）、转账（transactions）、DApp 浏览器
// （viewer 的 personal_sign / eth_sendTransaction）、信息签名（sign）在
// 调原生签名前都必须先通过本函数，失败则不签名。
// 无硬件/未录入生物识别时直接拦截（钱包无法签名，提示去系统设置录入）。

import * as LocalAuthentication from 'expo-local-authentication';
import { Alert } from 'react-native';

import { t as tt } from '@/i18n';

/** 生物识别验证本人操作，通过返回 true（取消/失败/未录入均返回 false，失败会弹提示） */
export async function requireBiometric() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      Alert.alert(
        tt('wallet.sign.notEnrolledTitle'),
        tt('wallet.sign.notEnrolledMsg')
      );
      return false;
    }
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: tt('wallet.sign.promptMessage'),
      cancelLabel: tt('common.cancel'),
    });
    return !!res.success;
  } catch (err) {
    Alert.alert(tt('wallet.sign.verifyFailed'), String(err.message ?? err));
    return false;
  }
}

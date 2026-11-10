import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import * as walletStore from '@/utils/walletStore';
import { useTheme } from '@/utils/theme';
import { t as tt } from '@/i18n';

/** 导出助记词：二次确认 + 生物识别验证后显示 */
export default function ExportWallet() {
  const t = useTheme();
  const [mnemonic, setMnemonic] = useState(null);
  const styles = makeStyles(t);

  // 风险提示 -> 生物识别（Face ID / Touch ID）-> 读取助记词
  function reveal() {
    Alert.alert(tt('wallet.export.riskTitle'), tt('wallet.export.riskMsg'), [
      { text: tt('common.cancel'), style: 'cancel' },
      {
        text: tt('wallet.export.continue'),
        onPress: async () => {
          const ok = await authenticate();
          if (!ok) return; // 生物识别失败或被取消，保持隐藏
          setMnemonic(await walletStore.getMnemonic());
        },
      },
    ]);
  }

  if (!mnemonic) {
    return (
      <View style={styles.container}>
        <Text style={styles.hint}>{tt('wallet.export.hint')}</Text>
        <TouchableOpacity style={styles.button} onPress={reveal}>
          <Text style={styles.buttonText}>{tt('wallet.export.show')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {mnemonic.split(' ').map((word, i) => (
          <View style={styles.wordChip} key={`${word}-${i}`}>
            <Text style={styles.wordIndex}>{i + 1}</Text>
            <Text style={styles.word}>{word}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.hideButton} onPress={() => setMnemonic(null)}>
        <Text style={styles.hideText}>{tt('wallet.export.hide')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/** 生物识别：设备未录入时降级为仅二次确认；录入后必须验证通过 */
async function authenticate() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      Alert.alert(
        tt('wallet.export.notEnrolledTitle'),
        tt('wallet.export.notEnrolledMsg')
      );
      return false;
    }
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: tt('wallet.export.promptMessage'),
      cancelLabel: tt('common.cancel'),
    });
    if (!res.success) {
      Alert.alert(tt('wallet.export.verifyFailedTitle'), tt('wallet.export.verifyFailedMsg'));
      return false;
    }
    return true;
  } catch (err) {
    Alert.alert(tt('wallet.export.verifyError'), String(err.message ?? err));
    return false;
  }
}

const makeStyles = (t) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background,
    },
    content: {
      padding: 20,
    },
    hint: {
      color: t.secondaryText,
      fontSize: 13,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: 30,
      marginBottom: 25,
    },
    button: {
      marginHorizontal: 20,
      height: 48,
      borderRadius: 12,
      backgroundColor: t.red,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
    },
    card: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 12,
    },
    wordChip: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '31%',
      marginRight: '2%',
      marginBottom: 10,
      backgroundColor: t.bar,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    wordIndex: {
      color: t.red,
      fontSize: 11,
      marginRight: 6,
    },
    word: {
      color: t.accent,
      fontSize: 14,
      fontWeight: '600',
    },
    hideButton: {
      marginTop: 20,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    hideText: {
      color: t.link,
      fontSize: 14,
    },
  });

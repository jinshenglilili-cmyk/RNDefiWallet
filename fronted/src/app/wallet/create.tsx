import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Wallet from '@wallet';
import * as walletStore from '@/utils/walletStore';
import { useAuthStore } from '@/hooks/useAuthStore';
import { useWalletStore } from '@/hooks/useWalletStore';
import { useTheme } from '@/hooks/useTheme';
import { t as tt } from '@/i18n';

/** 创建钱包：生成助记词 -> 抄写确认 -> 派生私钥保存（助记词只展示一次，不落盘） */
export default function CreateWallet() {
  const t = useTheme();
  const router = useRouter();
  const [mnemonic, setMnemonic] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const styles = makeStyles(t);

  async function handleGenerate() {
    try {
      setBusy(true);
      setMnemonic(await Wallet.generateMnemonic(128));
    } catch (err) {
      Alert.alert(tt('wallet.create.generateFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    try {
      setBusy(true);
      // 助记词只在这一刻使用：派生 index 0 私钥后即丢弃（助记词不落盘，签名全走私钥）
      const privateKey = await Wallet.derivePrivateKey('ethereum', mnemonic, 0);
      const { address } = await Wallet.importPrivateKey(privateKey);
      await walletStore.savePrivateKey(address, privateKey);
      // 账号列表走 useWalletStore（内存更新 + 整体写回存储）
      await useWalletStore.getState().addAccount(address);
      // 新钱包立即绑定给当前登录用户（退出登录时才能正确归档）
      await useAuthStore.getState().ensureOwnerBound().catch(() => {});
      Alert.alert(tt('wallet.create.createSuccessTitle'), tt('wallet.create.createSuccessMsg'), [
        { text: tt('wallet.common.ok'), onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(tt('wallet.create.createFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{tt('wallet.create.title')}</Text>

      {!mnemonic ? (
        <>
          <Text style={styles.warn}>{tt('wallet.create.warning')}</Text>
          <TouchableOpacity style={styles.button} disabled={busy} onPress={handleGenerate}>
            <Text style={styles.buttonText}>{busy ? tt('wallet.create.generating') : tt('wallet.create.generate')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.warn}>{tt('wallet.create.writeDown')}</Text>
          <View style={styles.mnemonicCard}>
            {mnemonic.split(' ').map((word, i) => (
              <View style={styles.wordChip} key={`${word}-${i}`}>
                <Text style={styles.wordIndex}>{i + 1}</Text>
                <Text style={styles.word}>{word}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setConfirmed(!confirmed)}
          >
            <Text style={styles.checkbox}>{confirmed ? '☑' : '☐'}</Text>
            <Text style={styles.checkText}>{tt('wallet.create.backupConfirm')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, (!confirmed || busy) && styles.disabled]}
            disabled={!confirmed || busy}
            onPress={handleConfirm}
          >
            <Text style={styles.buttonText}>{busy ? tt('wallet.create.creating') : tt('wallet.create.createButton')}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
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
    title: {
      fontSize: 22,
      fontWeight: 'bold',
      color: t.accent,
      marginBottom: 15,
    },
    warn: {
      color: t.red,
      fontSize: 13,
      lineHeight: 22,
      marginBottom: 20,
    },
    mnemonicCard: {
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
      color: t.secondaryText,
      fontSize: 11,
      marginRight: 6,
    },
    word: {
      color: t.accent,
      fontSize: 14,
      fontWeight: '600',
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 20,
    },
    checkbox: {
      fontSize: 18,
      marginRight: 8,
      color: t.accent,
    },
    checkText: {
      flex: 1,
      color: t.accent,
      fontSize: 13,
    },
    button: {
      height: 48,
      borderRadius: 12,
      backgroundColor: t.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    disabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: t.background,
      fontSize: 15,
      fontWeight: '600',
    },
  });

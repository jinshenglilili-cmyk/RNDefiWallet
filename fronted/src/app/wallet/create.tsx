import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Wallet from '@wallet';
import * as walletStore from '@/utils/walletStore';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/utils/theme';

/** 创建钱包：生成助记词 -> 抄写确认 -> 保存并派生账号 0（导入私钥/新助记词在「新增账号」里） */
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
      Alert.alert('生成失败', String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    try {
      setBusy(true);
      await walletStore.saveMnemonic(mnemonic);
      // 派生默认账号（index 0）的 ETH 地址
      const address = await Wallet.deriveAddress('ethereum', mnemonic, 0);
      await walletStore.addAccount(mnemonic, 0, address);
      // 新钱包立即绑定给当前登录用户（退出登录时才能正确归档）
      await useAuthStore.getState().ensureOwnerBound().catch(() => {});
      Alert.alert('创建成功', '账号已生成，可以开始使用了', [
        { text: '好的', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('创建失败', String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>创建钱包</Text>

      {!mnemonic ? (
        <>
          <Text style={styles.warn}>
            将为你生成 12 个单词的助记词。助记词等于资产所有权，{'\n'}
            平台不提供找回服务，请务必离线抄写保管。
          </Text>
          <TouchableOpacity style={styles.button} disabled={busy} onPress={handleGenerate}>
            <Text style={styles.buttonText}>{busy ? '生成中…' : '生成助记词'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.warn}>请把助记词抄写在纸上，不要截图或存网络相册：</Text>
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
            <Text style={styles.checkText}>我已离线备份助记词，明白丢失后资产无法找回</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, (!confirmed || busy) && styles.disabled]}
            disabled={!confirmed || busy}
            onPress={handleConfirm}
          >
            <Text style={styles.buttonText}>{busy ? '创建中…' : '我已备份，创建钱包'}</Text>
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

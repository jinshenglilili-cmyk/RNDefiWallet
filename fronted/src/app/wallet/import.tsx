import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import Wallet from '@wallet';
import * as walletStore from '@/utils/walletStore';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/utils/theme';
import { t as tt } from '@/i18n';

/** 导入钱包：粘贴/输入助记词 -> 校验 -> 保存并派生账号 0 */
export default function ImportWallet() {
  const t = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const styles = makeStyles(t);

  async function handleImport() {
    try {
      setBusy(true);
      const mnemonic = text.trim().replace(/\s+/g, ' ').toLowerCase();
      const valid = await Wallet.validateMnemonic(mnemonic);
      if (!valid) {
        Alert.alert(tt('wallet.import.failed'), tt('wallet.import.invalid'));
        return;
      }
      await walletStore.saveMnemonic(mnemonic);
      const address = await Wallet.deriveAddress('ethereum', mnemonic, 0);
      await walletStore.addAccount(mnemonic, 0, address);
      await useAuthStore.getState().ensureOwnerBound().catch(() => {});
      Alert.alert(tt('wallet.import.successTitle'), tt('wallet.import.successMsg'), [
        { text: tt('wallet.common.ok'), onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(tt('wallet.import.failed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{tt('wallet.import.title')}</Text>
      <Text style={styles.hint}>{tt('wallet.import.hint')}</Text>
      <TextInput
        style={styles.input}
        multiline
        numberOfLines={4}
        value={text}
        onChangeText={setText}
        placeholder={tt('wallet.import.placeholder')}
        placeholderTextColor={t.secondaryText}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <TouchableOpacity
        style={[styles.button, (!text.trim() || busy) && styles.disabled]}
        disabled={!text.trim() || busy}
        onPress={handleImport}
      >
        <Text style={styles.buttonText}>{busy ? tt('wallet.import.importing') : tt('wallet.import.button')}</Text>
      </TouchableOpacity>
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
      marginBottom: 10,
    },
    hint: {
      color: t.secondaryText,
      fontSize: 13,
      lineHeight: 20,
      marginBottom: 15,
    },
    input: {
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 16,
      fontSize: 14,
      lineHeight: 22,
      color: t.accent,
      textAlignVertical: 'top',
      marginBottom: 20,
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

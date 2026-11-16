import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import Wallet from '@wallet';
import * as walletStore from '@/utils/walletStore';
import { useAuthStore } from '@/hooks/useAuthStore';
import { useWalletStore } from '@/hooks/useWalletStore';
import { useTheme } from '@/hooks/useTheme';
import { t as tt } from '@/i18n';

/**
 * 新增账号：两种方式
 * - 导入私钥：粘贴以太坊私钥，独立账号
 * - 创建助记词账号：随机生成或输入已有助记词，派生出私钥后只存私钥，
 *   助记词仅随机生成时展示一次，不落盘
 */
export default function AddAccount() {
  const t = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState(null); // null=选方式，'private-key' | 'mnemonic'
  const [privateKey, setPrivateKey] = useState('');
  const [typedMnemonic, setTypedMnemonic] = useState('');
  const [generated, setGenerated] = useState(null); // 随机生成的助记词（展示一次）
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const styles = makeStyles(t);
  // 账号列表从 useWalletStore 取（全局共享，新增账号后立即同步）
  const meta = useWalletStore((s) => s.meta);

  /** 新账号的序号 = 当前账号列表长度 */
  function nextIndex() {
    return meta?.accounts.length ?? 0;
  }

  /** 方式一：导入私钥 */
  async function handleImportKey() {
    // 兼容带/不带 0x 前缀（去除首尾空白后统一补 0x 再校验）
    const raw = privateKey.trim().replace(/\s+/g, '');
    const key = raw.startsWith('0x') || raw.startsWith('0X') ? raw : `0x${raw}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      Alert.alert(tt('wallet.addAccount.error'), tt('wallet.addAccount.pkInvalid'));
      return;
    }
    try {
      setBusy(true);
      const { address } = await Wallet.importPrivateKey(key);
      await walletStore.savePrivateKey(address, key);
      const index = nextIndex();
      await useWalletStore.getState().addAccount(address, 'private-key');
      await useAuthStore.getState().ensureOwnerBound().catch(() => {});
      Alert.alert(tt('wallet.addAccount.addSuccessTitle'), tt('wallet.addAccount.addSuccessMsg', { index: index + 1, addr: address }), [
        { text: tt('wallet.common.ok'), onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(tt('wallet.addAccount.importFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  /** 方式二：随机生成一套新助记词（只展示一次，确认后即丢弃） */
  async function handleGenerate() {
    try {
      setBusy(true);
      setGenerated(await Wallet.generateMnemonic(128));
    } catch (err) {
      Alert.alert(tt('wallet.addAccount.generateFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  /** 用一套助记词创建账号：派生 index 0 私钥保存，助记词不落盘 */
  async function createFromMnemonic(mnemonic) {
    const normalized = mnemonic.trim().replace(/\s+/g, ' ').toLowerCase();
    const valid = await Wallet.validateMnemonic(normalized);
    if (!valid) {
      Alert.alert(tt('wallet.addAccount.error'), tt('wallet.import.invalid'));
      return;
    }
    try {
      setBusy(true);
      const privateKey = await Wallet.derivePrivateKey('ethereum', normalized, 0);
      const { address } = await Wallet.importPrivateKey(privateKey);
      await walletStore.savePrivateKey(address, privateKey);
      const index = nextIndex();
      await useWalletStore.getState().addAccount(address);
      await useAuthStore.getState().ensureOwnerBound().catch(() => {});
      Alert.alert(tt('wallet.addAccount.addSuccessTitle'), tt('wallet.addAccount.addSuccessMsg', { index: index + 1, addr: address }), [
        { text: tt('wallet.common.ok'), onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(tt('wallet.addAccount.addFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  /** 用户输入的助记词直接创建 */
  function handleCreateTyped() {
    createFromMnemonic(typedMnemonic);
  }

  /** 展示过一次的随机助记词，勾选备份后创建 */
  function handleConfirmGenerated() {
    createFromMnemonic(generated);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!mode ? (
        <>
          <Text style={styles.hint}>{tt('wallet.addAccount.chooseMethod')}</Text>
          <TouchableOpacity style={styles.option} disabled={busy} onPress={() => setMode('private-key')}>
            <Text style={styles.optionIcon}>🔑</Text>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>{tt('wallet.addAccount.importKeyTitle')}</Text>
              <Text style={styles.optionDesc}>{tt('wallet.addAccount.importKeyDesc')}</Text>
            </View>
            <Text style={styles.optionChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.option} disabled={busy} onPress={() => setMode('mnemonic')}>
            <Text style={styles.optionIcon}>📝</Text>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>{tt('wallet.addAccount.createMnemonicTitle')}</Text>
              <Text style={styles.optionDesc}>{tt('wallet.addAccount.createMnemonicDesc')}</Text>
            </View>
            <Text style={styles.optionChevron}>›</Text>
          </TouchableOpacity>
        </>
      ) : mode === 'private-key' ? (
        <>
          <Text style={styles.warn}>{tt('wallet.addAccount.pkWarning')}</Text>
          <TextInput
            style={styles.input}
            value={privateKey}
            onChangeText={setPrivateKey}
            placeholder={tt('wallet.addAccount.pkPlaceholder')}
            placeholderTextColor={t.secondaryText}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            multiline
          />
          <TouchableOpacity
            style={[styles.button, busy && styles.disabled]}
            disabled={busy}
            onPress={handleImportKey}
          >
            <Text style={styles.buttonText}>{busy ? tt('wallet.addAccount.importing') : tt('wallet.addAccount.importKeyButton')}</Text>
          </TouchableOpacity>
        </>
      ) : !generated ? (
        <>
          <Text style={styles.warn}>{tt('wallet.addAccount.mnemonicWarning')}</Text>
          <TextInput
            style={styles.input}
            value={typedMnemonic}
            onChangeText={setTypedMnemonic}
            placeholder={tt('wallet.addAccount.mnemonicPlaceholder')}
            placeholderTextColor={t.secondaryText}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            multiline
          />
          <TouchableOpacity
            style={[styles.secondaryButton, busy && styles.disabled]}
            disabled={busy}
            onPress={handleGenerate}
          >
            <Text style={styles.secondaryButtonText}>{busy ? tt('wallet.addAccount.generating') : tt('wallet.addAccount.generate')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, (!typedMnemonic.trim() || busy) && styles.disabled]}
            disabled={!typedMnemonic.trim() || busy}
            onPress={handleCreateTyped}
          >
            <Text style={styles.buttonText}>{busy ? tt('wallet.addAccount.creating') : tt('wallet.addAccount.createNow')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.warn}>{tt('wallet.addAccount.writeDown')}</Text>
          <View style={styles.mnemonicCard}>
            {generated.split(' ').map((word, i) => (
              <View style={styles.wordChip} key={`${word}-${i}`}>
                <Text style={styles.wordIndex}>{i + 1}</Text>
                <Text style={styles.word}>{word}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.checkRow} onPress={() => setConfirmed(!confirmed)}>
            <Text style={styles.checkbox}>{confirmed ? '☑' : '☐'}</Text>
            <Text style={styles.checkText}>{tt('wallet.addAccount.backupConfirm')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, (!confirmed || busy) && styles.disabled]}
            disabled={!confirmed || busy}
            onPress={handleConfirmGenerated}
          >
            <Text style={styles.buttonText}>{busy ? tt('wallet.addAccount.creating') : tt('wallet.addAccount.createButton')}</Text>
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
      paddingBottom: 40,
    },
    hint: {
      color: t.secondaryText,
      fontSize: 13,
      lineHeight: 22,
      marginBottom: 12,
    },
    warn: {
      color: t.red,
      fontSize: 13,
      lineHeight: 22,
      marginBottom: 20,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    optionIcon: {
      fontSize: 22,
      marginRight: 12,
    },
    optionInfo: {
      flex: 1,
    },
    optionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: t.accent,
    },
    optionDesc: {
      fontSize: 12,
      color: t.secondaryText,
      marginTop: 4,
    },
    optionChevron: {
      fontSize: 18,
      color: t.secondaryText,
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
    input: {
      backgroundColor: t.card,
      borderRadius: 12,
      height: 100,
      padding: 14,
      fontSize: 13,
      color: t.accent,
      textAlignVertical: 'top',
      marginBottom: 18,
    },
    button: {
      height: 48,
      borderRadius: 12,
      backgroundColor: t.accent,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
    },
    secondaryButton: {
      height: 48,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: t.accent,
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
    secondaryButtonText: {
      color: t.accent,
      fontSize: 15,
      fontWeight: '600',
    },
  });

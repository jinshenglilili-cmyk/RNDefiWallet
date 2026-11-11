import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import Wallet from '@wallet';
import * as walletStore from '@/utils/walletStore';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/utils/theme';
import { t as tt } from '@/i18n';

/**
 * 新增账号：三种方式
 * - 派生新账号：同一助记词按 BIP44 序号派生（有根助记词钱包时显示）
 * - 导入私钥：粘贴以太坊私钥，独立账号
 * - 创建助记词：生成一套新助记词，作为独立账号
 */
export default function AddAccount() {
  const t = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState(null); // null=选方式，'derive' | 'private-key' | 'mnemonic'
  const [hasRootMnemonic, setHasRootMnemonic] = useState(null);
  const [privateKey, setPrivateKey] = useState('');
  const [mnemonic, setMnemonic] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const styles = makeStyles(t);

  useEffect(() => {
    walletStore.getMnemonic().then((m) => setHasRootMnemonic(!!m));
  }, []);

  async function nextIndex() {
    const meta = await walletStore.getMeta();
    return meta.accounts.length;
  }

  /** 方式一：现有助记词派生下一个序号地址 */
  async function handleDerive() {
    try {
      setBusy(true);
      const mnemonic = await walletStore.getMnemonic();
      if (!mnemonic) {
        Alert.alert(tt('wallet.addAccount.error'), tt('wallet.addAccount.noRootMnemonic'));
        return;
      }
      const index = await nextIndex();
      const address = await Wallet.deriveAddress('ethereum', mnemonic, index);
      await walletStore.addAccount(mnemonic, index, address);
      await useAuthStore.getState().ensureOwnerBound().catch(() => {});
      await walletStore.switchAccount(index);
      Alert.alert(tt('wallet.addAccount.addSuccessTitle'), tt('wallet.addAccount.addSuccessMsg', { index: index + 1, addr: address }), [
        { text: tt('wallet.common.ok'), onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(tt('wallet.addAccount.addFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  /** 方式二：导入私钥 */
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
      const index = await nextIndex();
      await walletStore.addAccount(null, index, address, 'private-key');
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

  /** 方式三：创建新助记词，作为独立账号 */
  async function handleGenerate() {
    try {
      setBusy(true);
      setMnemonic(await Wallet.generateMnemonic(128));
    } catch (err) {
      Alert.alert(tt('wallet.addAccount.generateFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmMnemonic() {
    try {
      setBusy(true);
      const wallet = await Wallet.importWallet(mnemonic);
      const address = wallet.addresses.ethereum;
      await walletStore.saveAccountMnemonic(address, mnemonic);
      const index = await nextIndex();
      await walletStore.addAccount(null, index, address);
      await useAuthStore.getState().ensureOwnerBound().catch(() => {});
      await walletStore.switchAccount(index);
      Alert.alert(tt('wallet.addAccount.addSuccessTitle'), tt('wallet.addAccount.addSuccessMsg', { index: index + 1, addr: address }), [
        { text: tt('wallet.common.ok'), onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(tt('wallet.addAccount.addFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!mode ? (
        <>
          <Text style={styles.hint}>{tt('wallet.addAccount.chooseMethod')}</Text>
          {hasRootMnemonic ? (
            <TouchableOpacity style={styles.option} disabled={busy} onPress={() => setMode('derive')}>
              <Text style={styles.optionIcon}>🌿</Text>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>{tt('wallet.addAccount.deriveTitle')}</Text>
                <Text style={styles.optionDesc}>{tt('wallet.addAccount.deriveDesc')}</Text>
              </View>
              <Text style={styles.optionChevron}>›</Text>
            </TouchableOpacity>
          ) : null}
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
      ) : mode === 'derive' ? (
        <>
          <Text style={styles.hint}>{tt('wallet.addAccount.deriveHint')}</Text>
          <TouchableOpacity style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={handleDerive}>
            <Text style={styles.buttonText}>{busy ? tt('wallet.addAccount.deriving') : tt('wallet.addAccount.deriveButton')}</Text>
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
      ) : !mnemonic ? (
        <>
          <Text style={styles.warn}>{tt('wallet.addAccount.mnemonicWarning')}</Text>
          <TouchableOpacity style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={handleGenerate}>
            <Text style={styles.buttonText}>{busy ? tt('wallet.addAccount.generating') : tt('wallet.addAccount.generate')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.warn}>{tt('wallet.addAccount.writeDown')}</Text>
          <View style={styles.mnemonicCard}>
            {mnemonic.split(' ').map((word, i) => (
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
            onPress={handleConfirmMnemonic}
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

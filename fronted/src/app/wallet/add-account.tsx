import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import Wallet from '@wallet';
import * as walletStore from '@/utils/walletStore';
import { useAuthStore } from '@/stores/auth';
import { useTheme } from '@/utils/theme';

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
        Alert.alert('错误', '本地没有助记词钱包');
        return;
      }
      const index = await nextIndex();
      const address = await Wallet.deriveAddress('ethereum', mnemonic, index);
      await walletStore.addAccount(mnemonic, index, address);
      await useAuthStore.getState().ensureOwnerBound().catch(() => {});
      await walletStore.switchAccount(index);
      Alert.alert('新增成功', `账号 ${index + 1}：${address}`, [
        { text: '好的', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('新增失败', String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  /** 方式二：导入私钥 */
  async function handleImportKey() {
    const key = privateKey.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      Alert.alert('错误', '私钥格式不对：应为 0x 开头的 66 位 hex（64 个十六进制字符）');
      return;
    }
    try {
      setBusy(true);
      const { address } = await Wallet.importPrivateKey(key);
      await walletStore.savePrivateKey(address, key);
      const index = await nextIndex();
      await walletStore.addAccount(null, index, address, 'private-key');
      await useAuthStore.getState().ensureOwnerBound().catch(() => {});
      Alert.alert('新增成功', `账号 ${index + 1}：${address}`, [
        { text: '好的', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('导入失败', String(err.message ?? err));
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
      Alert.alert('生成失败', String(err.message ?? err));
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
      Alert.alert('新增成功', `账号 ${index + 1}：${address}`, [
        { text: '好的', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('新增失败', String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!mode ? (
        <>
          <Text style={styles.hint}>请选择新增账号的方式：</Text>
          {hasRootMnemonic ? (
            <TouchableOpacity style={styles.option} disabled={busy} onPress={() => setMode('derive')}>
              <Text style={styles.optionIcon}>🌿</Text>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>派生新账号</Text>
                <Text style={styles.optionDesc}>与现有账号共用助记词，按序号派生新地址</Text>
              </View>
              <Text style={styles.optionChevron}>›</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.option} disabled={busy} onPress={() => setMode('private-key')}>
            <Text style={styles.optionIcon}>🔑</Text>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>导入私钥</Text>
              <Text style={styles.optionDesc}>使用已有的以太坊私钥创建账号（仅保存在本机）</Text>
            </View>
            <Text style={styles.optionChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.option} disabled={busy} onPress={() => setMode('mnemonic')}>
            <Text style={styles.optionIcon}>📝</Text>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>创建助记词</Text>
              <Text style={styles.optionDesc}>生成一套新助记词，创建独立账号</Text>
            </View>
            <Text style={styles.optionChevron}>›</Text>
          </TouchableOpacity>
        </>
      ) : mode === 'derive' ? (
        <>
          <Text style={styles.hint}>
            新账号与现有账号共用同一套助记词，{'\n'}
            地址由 BIP44 派生路径的序号（index）区分，{'\n'}
            恢复钱包时输入同一助记词即可找回全部账号。
          </Text>
          <TouchableOpacity style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={handleDerive}>
            <Text style={styles.buttonText}>{busy ? '派生中…' : '派生新账号'}</Text>
          </TouchableOpacity>
        </>
      ) : mode === 'private-key' ? (
        <>
          <Text style={styles.warn}>
            导入的私钥只保存在本机（iOS Keychain），{'\n'}
            不要截图或发给任何人。
          </Text>
          <TextInput
            style={styles.input}
            value={privateKey}
            onChangeText={setPrivateKey}
            placeholder="请输入 0x 开头的私钥"
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
            <Text style={styles.buttonText}>{busy ? '导入中…' : '导入私钥，新增账号'}</Text>
          </TouchableOpacity>
        </>
      ) : !mnemonic ? (
        <>
          <Text style={styles.warn}>
            将为这个账号生成一套全新的 12 词助记词，{'\n'}
            与现有账号互相独立，请务必离线抄写保管。
          </Text>
          <TouchableOpacity style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={handleGenerate}>
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
          <TouchableOpacity style={styles.checkRow} onPress={() => setConfirmed(!confirmed)}>
            <Text style={styles.checkbox}>{confirmed ? '☑' : '☐'}</Text>
            <Text style={styles.checkText}>我已离线备份助记词，明白丢失后资产无法找回</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, (!confirmed || busy) && styles.disabled]}
            disabled={!confirmed || busy}
            onPress={handleConfirmMnemonic}
          >
            <Text style={styles.buttonText}>{busy ? '创建中…' : '我已备份，创建账号'}</Text>
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

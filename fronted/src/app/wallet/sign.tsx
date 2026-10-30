import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Modal, ScrollView } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from '@/utils/theme';

import Wallet from '@wallet';
import * as walletStore from '@/utils/walletStore';
import { accountType, getPrivateKey } from '@/utils/walletStore';
import * as walletConnect from '@/utils/walletConnect';

/**
 * 信息签名：对一段文本做 personal_sign 签名并展示结果
 * - 内嵌账号（助记词 / 导入私钥）：生物识别验证后本地签名
 * - 外部钱包：通过 WalletConnect 让外部钱包签名
 */
export default function SignMessage() {
  const t = useTheme();
  const [meta, setMeta] = useState(null);
  const [message, setMessage] = useState('Hello RNDefiWallet');
  const [source, setSource] = useState('embedded'); // 'embedded' | 'external'
  const [wcSession, setWcSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { address, message, signature, source }
  const styles = makeStyles(t);

  useEffect(() => {
    (async () => {
      setMeta(await walletStore.getMeta());
      if (walletConnect.isConfigured()) {
        walletConnect
          .restoreSession()
          .then(setWcSession)
          .catch(() => {});
      }
    })();
  }, []);

  const hasAccounts = !!meta && meta.accounts.length > 0;
  const current = hasAccounts ? meta.accounts[meta.current] : '';
  const type = hasAccounts ? accountType(meta, meta.current) : 'mnemonic';
  const typeLabel = type === 'private-key' ? '私钥账号' : '助记词账号';
  const hasExternal = !!wcSession;

  /** 内嵌账号：生物识别 -> 本地签名 */
  async function signEmbedded() {
    const ok = await requireBiometric();
    if (!ok) return;
    try {
      setBusy(true);
      let signature;
      if (type === 'private-key') {
        const pk = await getPrivateKey(current);
        if (!pk) throw new Error('本机没有该账号的私钥');
        signature = await Wallet.signMessageWithPrivateKey(pk, message);
      } else {
        // 独立助记词账号优先用自己的助记词，派生账号用根助记词
        const m = await walletStore.getSigningMnemonic(current, meta.current);
        if (!m) throw new Error('本地没有该账号的助记词');
        signature = await Wallet.signMessage('ethereum', m, message);
      }
      setResult({ address: current, message, signature, source: 'embedded' });
    } catch (err) {
      Alert.alert('签名失败', String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  /** 外部钱包：WalletConnect personal_sign */
  async function signExternal() {
    try {
      setBusy(true);
      const signature = await walletConnect.signMessage(wcSession, message);
      setResult({
        address: walletConnect.getAddress(wcSession),
        message,
        signature,
        source: 'external',
        via: 'WalletConnect',
      });
    } catch (err) {
      Alert.alert('签名失败', String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSign() {
    if (!message.trim()) {
      Alert.alert('提示', '请输入要签名的消息');
      return;
    }
    if (source === 'external') {
      await signExternal();
    } else {
      await signEmbedded();
    }
  }

  function shorten(addr) {
    if (!addr) return '';
    return addr.length > 19 ? `${addr.slice(0, 8)}...${addr.slice(-8)}` : addr;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 签名账号选择：内嵌 / 外部 */}
        <Text style={styles.sectionTitle}>签名方式</Text>
        <View style={styles.sourceRow}>
          <TouchableOpacity
            style={[styles.sourceBtn, source === 'embedded' && styles.sourceBtnActive]}
            disabled={!hasAccounts || busy}
            onPress={() => setSource('embedded')}
          >
            <Text
              style={[
                styles.sourceBtnText,
                source === 'embedded' && styles.sourceBtnTextActive,
                !hasAccounts && styles.sourceBtnDisabled,
              ]}
            >
              内嵌账号{hasAccounts ? '' : '（无）'}
            </Text>
            {hasAccounts && source === 'embedded' ? (
              <Text style={styles.sourceBtnSub}>
                {typeLabel} · {shorten(current)} · 生物识别后签名
              </Text>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sourceBtn, source === 'external' && styles.sourceBtnActive]}
            disabled={busy}
            onPress={() => setSource('external')}
          >
            <Text
              style={[
                styles.sourceBtnText,
                source === 'external' && styles.sourceBtnTextActive,
                !hasExternal && source === 'external' && styles.sourceBtnDisabled,
              ]}
            >
              外部钱包{hasExternal ? '' : '（未连接）'}
            </Text>
            {hasExternal && source === 'external' ? (
              <Text style={styles.sourceBtnSub}>
                WalletConnect · {shorten(walletConnect.getAddress(wcSession))}
              </Text>
            ) : null}
          </TouchableOpacity>
        </View>

        {source === 'external' && !hasExternal ? (
          <Text style={styles.warn}>
            尚未连接外部钱包。请到「钱包」→「连接 DApp (WalletConnect)」扫码连接
            MetaMask 等 App 后再来签名。
          </Text>
        ) : null}

        <Text style={styles.sectionTitle}>要签名的消息</Text>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          placeholder="请输入要签名的消息"
          placeholderTextColor={t.secondaryText}
          multiline
        />

        <TouchableOpacity
          style={[styles.button, busy && styles.disabled]}
          disabled={busy || !message.trim() || (source === 'external' && !hasExternal) || (source === 'embedded' && !hasAccounts)}
          onPress={handleSign}
        >
          <Text style={styles.buttonText}>
            {busy ? '签名中…' : source === 'external' ? '调用外部钱包签名' : '生物识别并签名'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 签名结果弹框 */}
      <Modal visible={!!result} transparent animationType="fade">
        <View style={styles.mask}>
          <View style={styles.dialog}>
            <Text style={styles.dialogIcon}>✍️</Text>
            <Text style={styles.dialogTitle}>签名成功</Text>
            <Text style={styles.sectionLabel}>签名账号</Text>
            <Text style={styles.monoCard}>
              {result?.address} {result?.via ? `（经 ${result.via}）` : ''}
            </Text>
            <Text style={styles.sectionLabel}>消息</Text>
            <Text style={styles.monoCard}>{result?.message}</Text>
            <Text style={styles.sectionLabel}>签名结果</Text>
            <ScrollView style={styles.sigScroll}>
              <Text style={styles.monoCard}>{result?.signature}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setResult(null)}>
              <Text style={styles.closeText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** 生物识别（同导出助记词的验证逻辑） */
async function requireBiometric() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      Alert.alert(
        '未设置生物识别',
        '本机未录入 Face ID / Touch ID，无法验证身份，请先到系统设置录入。'
      );
      return false;

    }
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: '验证身份以签名消息',
      cancelLabel: '取消',
    });
    return !!res.success;
  } catch (err) {
    Alert.alert('验证失败', String(err.message ?? err));
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
      paddingBottom: 40,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: t.accent,
      marginBottom: 10,
      marginTop: 5,
    },
    sourceRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 8,
    },
    sourceBtn: {
      flex: 1,
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    sourceBtnActive: {
      borderColor: t.accent,
    },
    sourceBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: t.accent,
    },
    sourceBtnTextActive: {
      color: t.accent,
    },
    sourceBtnSub: {
      fontSize: 11,
      color: t.secondaryText,
      marginTop: 6,
    },
    sourceBtnDisabled: {
      opacity: 0.5,
    },
    warn: {
      color: t.red,
      fontSize: 13,
      lineHeight: 21,
      marginBottom: 10,
    },
    input: {
      backgroundColor: t.card,
      borderRadius: 12,
      minHeight: 90,
      padding: 14,
      fontSize: 14,
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
    mask: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 20,
    },
    dialog: {
      backgroundColor: t.background,
      borderRadius: 14,
      padding: 16,
      maxHeight: '85%',
    },
    dialogIcon: {
      fontSize: 30,
      textAlign: 'center',
    },
    dialogTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: t.accent,
      textAlign: 'center',
      marginVertical: 8,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: t.accent,
      marginTop: 10,
      marginBottom: 4,
    },
    monoCard: {
      fontFamily: 'Menlo',
      fontSize: 11,
      color: t.secondaryText,
      backgroundColor: t.bar,
      borderRadius: 8,
      padding: 10,
    },
    sigScroll: {
      maxHeight: 120,
    },
    closeBtn: {
      height: 44,
      borderRadius: 10,
      backgroundColor: t.accent,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
    },
    closeText: {
      color: t.background,
      fontSize: 15,
      fontWeight: '600',
    },
  });

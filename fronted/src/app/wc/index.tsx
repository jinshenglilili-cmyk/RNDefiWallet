import { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  isConfigured,
  connect,
  disconnect,
  signMessage,
  restoreSession,
  onSessionDelete,
  getAddress,
} from '@/utils/walletConnect';
import { t as tt } from '@/i18n';

/**
 * 连接钱包（WalletConnect dApp 端）
 *
 * 生成连接二维码 -> 用 MetaMask 等钱包 App 扫码 -> 会话建立后显示地址，
 * 可让钱包签名消息、断开连接。
 */
export default function Wallet() {
  const [session, setSession] = useState(null);
  const [uri, setUri] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isConfigured()) return;

    // App 重启后恢复上次的会话，不用重新扫码
    restoreSession()
      .then((restored) => {
        if (restored) setSession(restored);
      })
      .catch(() => {});

    // 钱包那边主动断开时同步界面状态
    onSessionDelete(() => setSession(null));
  }, []);

  // 未配置 Project ID：给出引导
  if (!isConfigured()) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.warnTitle}>{tt('wc.connect.notConfiguredTitle')}</Text>
        <Text style={styles.warnText}>{tt('wc.connect.notConfiguredSteps')}</Text>
      </View>
    );
  }

  // 发起连接：生成二维码并等待钱包确认
  async function handleConnect() {
    try {
      setBusy(true);
      const { uri, approval } = await connect();
      setUri(uri);
      const session = await approval();
      setSession(session);
      setUri(null);
      Alert.alert(tt('wc.connect.connectSuccess'), getAddress(session));
    } catch (err) {
      setUri(null);
      Alert.alert(tt('wc.connect.connectFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  // 让钱包签名一条消息（personal_sign）
  async function handleSign() {
    try {
      setBusy(true);
      const signature = await signMessage(session, 'Hello WalletConnect from RNDefiWallet');
      Alert.alert(tt('wc.connect.signSuccess'), signature);
    } catch (err) {
      Alert.alert(tt('wc.connect.signFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  // 断开会话
  async function handleDisconnect() {
    try {
      setBusy(true);
      await disconnect(session);
      setSession(null);
    } catch (err) {
      Alert.alert(tt('wc.connect.disconnectFailed'), String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  function cancelButton() {
    return (
      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary]}
        disabled={busy}
        onPress={() => setUri(null)}
      >
        <Text style={[styles.buttonText, { color: '#666' }]}>{tt('common.cancel')}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>WalletConnect</Text>

      {session ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{tt('wc.connect.connectedWallet')}</Text>
            <Text style={styles.address}>{getAddress(session)}</Text>
          </View>

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={handleSign}
          >
            <Text style={styles.buttonText}>
              {busy ? tt('wc.connect.waitingWallet') : tt('wc.connect.signMessage')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonDanger, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={handleDisconnect}
          >
            <Text style={styles.buttonText}>{tt('wc.connect.disconnect')}</Text>
          </TouchableOpacity>
        </>
      ) : uri ? (
        <>
          <View style={styles.qrCard}>
            <QRCode value={uri} size={220} />
          </View>
          <Text style={styles.hint}>{tt('wc.connect.scanHint')}</Text>
          {cancelButton()}
        </>
      ) : (
        <>
          <Text style={styles.hint}>{tt('wc.connect.intro')}</Text>
          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={handleConnect}
          >
            <Text style={styles.buttonText}>
              {busy ? tt('wc.connect.connecting') : tt('wc.connect.connectButton')}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    justifyContent: 'center',
    padding: 30,
  },
  content: {
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 20,
  },
  card: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#1f99b0',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
  },
  cardLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  address: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f99b0',
  },
  qrCard: {
    padding: 20,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    marginBottom: 15,
  },
  hint: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  button: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1f99b0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonSecondary: {
    backgroundColor: '#f0f0f0',
  },
  buttonDanger: {
    backgroundColor: '#d9534f',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
  },
  warnTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#d9534f',
    marginBottom: 12,
  },
  warnText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 22,
  },
});

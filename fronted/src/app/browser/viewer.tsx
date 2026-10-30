import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';

import Wallet from '@wallet';
import * as walletStore from '@/utils/walletStore';
import INJECTED_PROVIDER from '@/utils/injectedProvider';
import * as rpc from '@/utils/rpc';
import { formatEther, hexToDecimal } from '@/utils/format';
import { useTheme } from '@/utils/theme';

/**
 * DApp 浏览器查看页（对齐参考项目 BrowserTabView 布局：
 * 工具栏 -> 外部钱包状态条 -> WebView；审批窗对齐 SigningRequestView）
 *
 * JS 桥链路：
 * 页面 window.ethereum.request -> 注入脚本 postMessage -> 这里 onMessage
 * -> 只读方法代理 RPC / 签名方法弹审批 -> injectJavaScript 回写 Promise 结果
 */
export default function BrowserViewer() {
  const t = useTheme();
  const { url } = useLocalSearchParams();
  const webRef = useRef(null);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [inputUrl, setInputUrl] = useState(url);
  const [navState, setNavState] = useState(null);
  const [progress, setProgress] = useState(1);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null); // {id, title, message, tx, method, run}
  const [account, setAccount] = useState(null);
  const [connected, setConnected] = useState(false); // 本页已授权连接
  const [editingUrl, setEditingUrl] = useState(false);
  const [debugMsg, setDebugMsg] = useState(''); // 临时调试：注入脚本探针结果
  const styles = makeStyles(t);

  useEffect(() => {
    (async () => {
      try {
        const meta = await walletStore.getMeta();
        setAccount(meta.accounts[meta.current] ?? null);
      } catch {
        setAccount(null);
      }
    })();
  }, []);

  /** 把结果回写给页面的 Promise（错误走 sendError） */
  const respond = useCallback((id, result) => {
    webRef.current?.injectJavaScript(
      `window.__rnWallet && window.__rnWallet.sendResponse(${id}, ${JSON.stringify(result)}); true;`
    );
  }, []);

  const respondError = useCallback((id, message) => {
    const escaped = String(message).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webRef.current?.injectJavaScript(
      `window.__rnWallet && window.__rnWallet.sendError(${id}, '${escaped}'); true;`
    );
  }, []);

  /** 取当前账号（未创建钱包时报错） */
  const getAccount = useCallback(async () => {
    const meta = await walletStore.getMeta();
    const address = meta.accounts[meta.current];
    if (!address) throw new Error('尚未创建钱包，请先到「钱包」Tab 创建');
    return address;
  }, []);

  /** 构造 EIP-2255 权限对象（Uniswap 等新版 dApp 连接前先要权限） */
  const buildPermission = useCallback((address) => {
    return [
      {
        parentCapability: 'eth_accounts',
        id: `${address.toLowerCase()}-${Date.now()}`,
        invoker: 'dapp-browser',
        caveats: [{ type: 'restrictedAccounts', value: [address] }],
        date: Date.now(),
      },
    ];
  }, []);

  /** 处理页面发来的 JSON-RPC 请求 */
  const handleRequest = useCallback(
    async (id, method, params) => {
      try {
        // 账号类：连接授权（eth_requestAccounts）首次弹审批窗，之后静默放行
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
          const address = await getAccount();
          if (connected || method === 'eth_accounts') {
            respond(id, [address]);
            return;
          }
          setPending({
            id,
            title: '连接钱包',
            method,
            from: address,
            run: async () => {
              setConnected(true);
              return [address];
            },
          });
          return;
        }

        // EIP-2255：请求/查询/撤销权限（新版 dApp 的连接流程）
        if (method === 'wallet_requestPermissions') {
          const address = await getAccount();
          if (connected) {
            respond(id, buildPermission(address));
            return;
          }
          setPending({
            id,
            title: '连接钱包',
            method,
            from: address,
            run: async () => {
              setConnected(true);
              return buildPermission(address);
            },
          });
          return;
        }
        if (method === 'wallet_getPermissions') {
          const address = await getAccount().catch(() => null);
          respond(id, connected && address ? buildPermission(address) : []);
          return;
        }
        if (method === 'wallet_revokePermissions') {
          setConnected(false);
          respond(id, null);
          return;
        }

        // 签名类：弹审批窗
        if (method === 'personal_sign') {
          const [messageHex] = params;
          const message = hexToUtf8(messageHex);
          setPending({
            id,
            title: '签名消息',
            message,
            method,
            run: async () => {
              const mnemonic = await walletStore.getMnemonic();
              return await Wallet.signMessage('ethereum', mnemonic, message);
            },
          });
          return;
        }

        if (method === 'eth_sendTransaction') {
          const tx = params[0] ?? {};
          const from = await getAccount();
          const valueWei = tx.value ? BigInt(tx.value) : 0n;
          setPending({
            id,
            title: '发送交易',
            tx,
            method,
            from,
            run: async () => {
              const mnemonic = await walletStore.getMnemonic();
              const [nonce, gasPrice] = await Promise.all([
                rpc.getNonce(from),
                rpc.getGasPrice(),
              ]);
              const gasLimit = tx.gas
                ? hexToDecimal(tx.gas)
                : await rpc.estimateGas({ from, to: tx.to, value: tx.value ?? '0x0' });
              const rawTx = await Wallet.signTransaction('ethereum', mnemonic, {
                chainId: '1',
                nonce,
                gasPrice,
                gasLimit,
                to: tx.to,
                value: valueWei.toString(10),
                data: tx.data,
              });
              return await rpc.sendRawTransaction(rawTx);
            },
          });
          return;
        }

        // 只读方法直接代理
        const proxied = await rpc.proxyReadonly(method, params ?? []);
        if (proxied !== null) {
          respond(id, proxied);
          return;
        }

        respondError(id, `暂不支持的方法：${method}`);
      } catch (err) {
        respondError(id, err.message ?? String(err));
      }
    },
    [respond, respondError, getAccount, connected, buildPermission]
  );

  /** 页面加载完后探测注入脚本 + 自动发起一次连接请求，结果回显到页面（临时调试） */
  const probeInjection = useCallback(() => {
    webRef.current?.injectJavaScript(
      `try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', probe: 'V2' }));
        if (window.ethereum && window.ethereum.request) {
          window.ethereum.request({ method: 'eth_requestAccounts' })
            .then(function (r) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', probeConnect: r }));
            })
            .catch(function (e) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', probeError: String(e && e.message || e) }));
            });
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', probeCalled: true }));
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', noEth: true }));
        }
      } catch (e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', probeCrash: String(e) }));
      }
      true;`
    );
  }, []);

  function onMessage(event) {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    // 调试信息直接显示在页面上（metro 终端收不到设备 console.log）
    if (data.type === 'debug') {
      setDebugMsg(JSON.stringify(data));
      return;
    }
    if (data.type === 'provider-ready') {
      setDebugMsg('provider-ready');
      return;
    }
    if (data.type === 'eth-request') {
      setDebugMsg(`收到请求 #${data.id} ${data.method}`);
      handleRequest(data.id, data.method, data.params);
    }
  }

  // 用户在审批窗点击确认
  async function handleApprove() {
    const request = pending;
    setPending(null);
    try {
      respond(request.id, await request.run());
    } catch (err) {
      respondError(request.id, err.message ?? String(err));
    }
  }

  function handleReject() {
    respondError(pending.id, '用户拒绝了请求');
    setPending(null);
  }

  function submitUrl() {
    let target = inputUrl.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    setEditingUrl(false);
    setCurrentUrl(target);
    setProgress(0);
    setLoading(true);
  }

  /** 地址中间截断：前8...后8 */
  function shorten(addr, head = 8, tail = 8) {
    if (!addr) return '';
    return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
  }

  return (
    <View style={styles.container}>
      {/* 工具栏：后退/前进/刷新 + 地址栏（标题/返回箭头由原生导航栏显示） */}
      <View style={styles.toolbar}>
        <ToolButton
          label="‹"
          color={navState?.canGoBack ? t.accent : t.secondaryText}
          disabled={!navState?.canGoBack}
          onPress={() => webRef.current?.goBack()}
        />
        <ToolButton
          label="›"
          color={navState?.canGoForward ? t.accent : t.secondaryText}
          disabled={!navState?.canGoForward}
          onPress={() => webRef.current?.goForward()}
        />
        <ToolButton
          label={loading ? '✕' : '↻'}
          color={t.accent}
          onPress={() => (loading ? webRef.current?.stopLoading() : webRef.current?.reload())}
        />
        {editingUrl ? (
          <TextInput
            style={styles.urlInput}
            value={inputUrl}
            onChangeText={setInputUrl}
            onSubmitEditing={submitUrl}
            onBlur={() => setEditingUrl(false)}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        ) : (
          <TouchableOpacity
            style={styles.urlPill}
            onPress={() => {
              setInputUrl(currentUrl);
              setEditingUrl(true);
            }}
          >
            <Text style={styles.urlText} numberOfLines={1}>
              {currentUrl}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 加载进度条 */}
      {loading && progress < 1 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}

      {/* 外部钱包状态条：连接状态圆点 + 地址 */}
      <View style={styles.walletBar}>
        <View
          style={[styles.statusDot, { backgroundColor: account ? t.green : t.secondaryText }]}
        />
        {account ? (
          <>
            <Text style={styles.walletName}>内置钱包</Text>
            <Text style={styles.walletAddr}>{shorten(account, 6, 4)}</Text>
          </>
        ) : (
          <Text style={styles.walletName}>未连接钱包（请先到「钱包」Tab 创建）</Text>
        )}
      </View>

      {debugMsg ? (
        <Text style={{ fontSize: 10, color: '#FF9500', paddingHorizontal: 12, paddingVertical: 2 }} numberOfLines={2}>
          [debug] {debugMsg}
        </Text>
      ) : null}

      <WebView
        ref={webRef}
        source={{ uri: currentUrl }}
        // EIP-1193 Provider 在页面任何脚本执行前注入
        injectedJavaScriptBeforeContentLoaded={INJECTED_PROVIDER}
        onMessage={onMessage}
        onNavigationStateChange={(state) => {
          setNavState(state);
          setCurrentUrl(state.url);
        }}
        onLoadEnd={() => {
          setLoading(false);
          probeInjection();
        }}
        onProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        javaScriptEnabled
        domStorageEnabled
      />

      {/* 签名审批弹窗（对齐 SigningRequestView） */}
      <Modal visible={!!pending} transparent animationType="fade">
        <View style={styles.mask}>
          <View style={styles.dialog}>
            <Text style={styles.dialogKeyIcon}>🔑</Text>
            <Text style={styles.dialogTitle}>{pending?.title ?? ''}</Text>
            <Text style={styles.dialogDesc}>
              {pending?.tx
                ? '请确认以下交易详情'
                : pending?.message
                  ? '请确认以下签名消息来自当前页面'
                  : '该页面请求连接你的内置钱包账号'}
            </Text>

            {/* 消息明文（签名类） */}
            {pending?.message ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Message</Text>
                <Text style={styles.monoCard}>{pending.message}</Text>
              </View>
            ) : null}

            {/* 交易详情 */}
            {pending?.tx ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Transaction</Text>
                <Text style={styles.detailLabel}>To</Text>
                <Text style={styles.monoCard}>{pending.tx.to ?? '(空)'}</Text>
                <Text style={styles.detailLabel}>
                  Value (wei) = {pending.tx.value ? formatEther(BigInt(pending.tx.value).toString()) : '0'} ETH
                </Text>
                <Text style={styles.monoCard}>{pending.tx.value ?? '0x0'}</Text>
                {pending.tx.data ? (
                  <>
                    <Text style={styles.detailLabel}>Data</Text>
                    <Text style={styles.monoCard}>{pending.tx.data.slice(0, 66)}…</Text>
                  </>
                ) : null}
              </View>
            ) : null}

            {/* From Account */}
            {pending?.from ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>From Account</Text>
                <Text style={styles.monoCard}>{pending.from}</Text>
              </View>
            ) : null}

            {/* Method */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Method</Text>
              <Text style={styles.monoCard}>{pending?.method ?? ''}</Text>
            </View>

            <View style={styles.dialogButtons}>
              <TouchableOpacity style={[styles.dialogButton, styles.reject]} onPress={handleReject}>
                <Text style={styles.rejectText}>拒绝</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogButton} onPress={handleApprove}>
                <Text style={styles.approveText}>批准</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ToolButton({ label, onPress, disabled, color }) {
  // ToolButton 在主组件外定义，需要自建样式（主组件里的 styles 不在作用域内）
  const t = useTheme();
  const styles = makeStyles(t);
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[styles.toolButton, disabled && { opacity: 0.35 }]}
    >
      <Text style={[styles.toolButtonLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** personal_sign 的消息是 hex 编码，还原成可读文字 */
function hexToUtf8(hex) {
  const bytes = String(hex).replace(/^0x/i, '').match(/.{2}/g) ?? [];
  const raw = bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join('');
  try {
    return decodeURIComponent(escape(raw));
  } catch {
    return raw;
  }
}

const makeStyles = (t) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    toolButton: {
      width: 34,
      height: 34,
      justifyContent: 'center',
      alignItems: 'center',
    },
    toolButtonLabel: {
      fontSize: 20,
    },
    urlPill: {
      flex: 1,
      height: 34,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.accent === '#000000' ? 'rgba(0,0,0,0.3)' : 'rgba(250,207,252,0.3)',
      justifyContent: 'center',
      paddingHorizontal: 10,
      marginLeft: 4,
    },
    urlInput: {
      flex: 1,
      height: 34,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.accent === '#000000' ? 'rgba(0,0,0,0.3)' : 'rgba(250,207,252,0.3)',
      paddingHorizontal: 10,
      marginLeft: 4,
      fontSize: 12,
      color: t.accent,
      padding: 0,
    },
    urlText: {
      fontSize: 12,
      color: t.accent,
    },
    progressTrack: {
      height: 2,
      backgroundColor: t.bar,
      marginHorizontal: 12,
    },
    progressBar: {
      height: 2,
      backgroundColor: t.accent,
    },
    walletBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.bar,
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 10,
    },
    walletName: {
      fontSize: 12,
      color: t.accent,
      fontWeight: '600',
    },
    walletAddr: {
      fontSize: 11,
      color: t.secondaryText,
      marginLeft: 8,
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
    dialogKeyIcon: {
      fontSize: 34,
      textAlign: 'center',
    },
    dialogTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: t.accent,
      textAlign: 'center',
      marginTop: 6,
    },
    dialogDesc: {
      fontSize: 13,
      color: t.secondaryText,
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 10,
    },
    section: {
      marginTop: 14,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: t.accent,
      marginBottom: 8,
    },
    detailLabel: {
      fontSize: 12,
      color: t.secondaryText,
      marginBottom: 4,
      marginTop: 6,
    },
    monoCard: {
      fontFamily: 'Menlo',
      fontSize: 11,
      color: t.secondaryText,
      backgroundColor: t.bar,
      borderRadius: 8,
      padding: 12,
      lineHeight: 16,
    },
    dialogButtons: {
      flexDirection: 'row',
      marginTop: 20,
      marginBottom: 8,
    },
    dialogButton: {
      flex: 1,
      height: 46,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 12,
      backgroundColor: t.accent,
    },
    reject: {
      backgroundColor: t.accent === '#000000' ? 'rgba(148,22,81,0.8)' : 'rgba(255,47,146,0.8)',
      marginLeft: 0,
    },
    rejectText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
    approveText: {
      color: t.background,
      fontSize: 15,
      fontWeight: '700',
    },
  });

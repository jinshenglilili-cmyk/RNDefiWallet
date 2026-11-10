import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/utils/theme';

/** 常用 DApp 快捷入口 */
const DAPPS = [
  { name: 'WalletConnect Test', url: 'https://react-app.walletconnect.com', desc: 'WC 官方测试' },
  { name: 'Ethereum Test Dapp', url: 'https://metamask.github.io/test-dapp/', desc: 'MetaMask 测试' },
  { name: 'Uniswap', url: 'https://app.uniswap.org', desc: '去中心化交易' },
  { name: 'Etherscan', url: 'https://etherscan.io', desc: '区块浏览器' },
];

/** DApp 浏览器首页：地址栏 + 快捷入口列表 */
export default function Browser() {
  const t = useTheme();
  const router = useRouter();
  const [url, setUrl] = useState('');
  const styles = makeStyles(t);

  function open(raw) {
    let target = String(raw).trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) {
      target = `https://${target}`;
    }
    try {
      const { hostname } = new URL(target);
      if (!hostname.includes('.')) throw new Error('bad host');
      router.push({ pathname: '/browser/viewer', params: { url: target } });
    } catch {
      Alert.alert('网址不对', '请输入合法的网址');
    }
  }

  return (
    <View style={styles.container}>
      {/* 地址栏：描边输入框（对齐参考工具栏样式） */}
      <View style={styles.urlBar}>
        <TextInput
          style={styles.urlInput}
          value={url}
          onChangeText={setUrl}
          placeholder="输入网址…"
          placeholderTextColor={t.secondaryText}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={() => open(url)}
          returnKeyType="go"
        />
        <TouchableOpacity style={styles.goButton} onPress={() => open(url)}>
          <Text style={styles.goText}>前往</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <Text style={styles.sectionTitle}>快捷入口</Text>
        {DAPPS.map((dapp) => (
          <TouchableOpacity
            key={dapp.url}
            style={styles.cell}
            activeOpacity={0.6}
            onPress={() => open(dapp.url)}
          >
            <View style={styles.cellIcon}>
              <Text style={styles.cellIconText}>{dapp.name[0]}</Text>
            </View>
            <View style={styles.cellInfo}>
              <Text style={styles.cellName}>{dapp.name}</Text>
              <Text style={styles.cellDesc}>{dapp.desc}</Text>
            </View>
            <Text style={styles.cellArrow}>›</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.note}>
          浏览器内置 EIP-1193 Provider：dApp 可以请求你的账号、{'\n'}
          请求签名（会弹审批窗），签名由原生钱包模块完成，{'\n'}
          私钥不进入网页。
        </Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background,
      paddingTop: 58,
    },
    urlBar: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
    },
    urlInput: {
      flex: 1,
      height: 38,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.accent === '#000000' ? 'rgba(0,0,0,0.3)' : 'rgba(250,207,252,0.3)',
      paddingHorizontal: 12,
      fontSize: 13,
      color: t.accent,
      backgroundColor: t.background,
    },
    goButton: {
      marginLeft: 10,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
      height: 38,
      borderRadius: 8,
      backgroundColor: t.accent,
    },
    goText: {
      color: t.background,
      fontSize: 13,
      fontWeight: '600',
    },
    list: {
      flex: 1,
    },
    listContent: {
      padding: 16,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: t.accent,
      marginBottom: 14,
    },
    cell: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    cellIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: t.bar,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cellIconText: {
      color: t.accent,
      fontSize: 18,
      fontWeight: 'bold',
    },
    cellInfo: {
      flex: 1,
      marginLeft: 12,
    },
    cellName: {
      fontSize: 15,
      color: t.accent,
      fontWeight: '600',
    },
    cellDesc: {
      fontSize: 12,
      color: t.secondaryText,
      marginTop: 2,
    },
    cellArrow: {
      fontSize: 22,
      color: t.secondaryText,
    },
    note: {
      marginTop: 20,
      color: t.secondaryText,
      fontSize: 12,
      lineHeight: 20,
    },
  });

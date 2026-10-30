import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import SubPageHeader from '@/components/SubPageHeader';

import { useSession } from '@/utils/ctx';
import { useTheme } from '@/utils/theme';

/**
 * 设置页（普通 push 推出，非弹窗）
 * - 数据来源（CoinGecko）
 * - 应用信息
 * - 退出登录（登录后显示）
 */
export default function Settings() {
  const t = useTheme();
  const router = useRouter();
  const { session, signOut } = useSession();
  const styles = makeStyles(t);

  function confirmSignOut() {
    Alert.alert('退出登录', '确定退出当前账号？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.back();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <SubPageHeader title="设置" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* 数据来源 */}
        <Text style={styles.sectionHeader}>CoinGecko</Text>
        <View style={styles.card}>
          <Text style={styles.title}>行情数据</Text>
          <Text style={styles.desc}>
            所有加密货币价格、市值与图表数据均来自 CoinGecko 公开 API（免费接口，有频率限制）。
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.coingecko.com')}>
            <Text style={styles.link}>访问 coingecko.com ↗</Text>
          </TouchableOpacity>
        </View>

        {/* 应用 */}
        <Text style={styles.sectionHeader}>应用</Text>
        <View style={styles.card}>
          <Text style={styles.rowText}>服务条款</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.rowText}>隐私政策</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.rowText}>版本 1.0（学习示例）</Text>
        </View>

        {/* 退出登录 */}
        {session ? (
          <>
            <Text style={styles.sectionHeader}>账号</Text>
            <TouchableOpacity style={styles.card} activeOpacity={0.6} onPress={confirmSignOut}>
              <Text style={[styles.rowText, { color: t.red, textAlign: 'center' }]}>退出登录</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    sectionHeader: {
      fontSize: 13,
      color: t.secondaryText,
      marginBottom: 8,
      marginLeft: 4,
    },
    card: {
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: t.accent,
    },
    desc: {
      fontSize: 13,
      lineHeight: 20,
      color: t.secondaryText,
      marginTop: 6,
    },
    link: {
      color: t.link,
      fontSize: 13,
      marginTop: 10,
    },
    rowText: {
      fontSize: 15,
      color: t.accent,
    },
  });

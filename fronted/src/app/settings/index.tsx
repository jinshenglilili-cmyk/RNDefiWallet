import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import SubPageHeader from '@/components/SubPageHeader';

import { useSession } from '@/utils/ctx';
import { useTheme } from '@/utils/theme';
import { t as tt, useI18nStore, useI18nLocale, LANG_CHOICES } from '@/i18n';
import { useDefiNetwork } from '@/stores/defiNetwork';

/**
 * 设置页（普通 push 推出，非弹窗）
 * - 语言切换（跟随系统 / 简体中文 / English）
 * - DeFi 网络（BSC / Ethereum 主网、Sepolia 测试网）
 * - 数据来源（CoinGecko）
 * - 应用信息
 * - 退出登录（登录后显示）
 */
export default function Settings() {
  const t = useTheme();
  const router = useRouter();
  const { session, signOut } = useSession();
  const locale = useI18nLocale(); // 订阅语言，切换时整页重渲染
  const { choice, setChoice } = useI18nStore();
  const { network, setNetwork } = useDefiNetwork(); // 订阅 DeFi 网络，切换时整页重渲染
  const styles = makeStyles(t);

  /** DeFi 网络切换弹窗（BSC / Ethereum 主网、Sepolia 测试网） */
  function pickNetwork() {
    Alert.alert(tt('settings.defiNetwork'), undefined, [
      {
        text: network === 'bsc' ? `✓ ${tt('defi.network.bsc')}` : tt('defi.network.bsc'),
        onPress: () => setNetwork('bsc'),
      },
      {
        text: network === 'ethereum' ? `✓ ${tt('defi.network.ethereum')}` : tt('defi.network.ethereum'),
        onPress: () => setNetwork('ethereum'),
      },
      {
        text: network === 'sepolia' ? `✓ ${tt('defi.network.sepolia')}` : tt('defi.network.sepolia'),
        onPress: () => setNetwork('sepolia'),
      },
    ], { cancelable: true });
  }

  function confirmSignOut() {
    Alert.alert(tt('settings.signOutConfirmTitle'), tt('settings.signOutConfirmMsg'), [
      { text: tt('common.cancel'), style: 'cancel' },
      {
        text: tt('settings.signOutConfirmOk'),
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.back();
        },
      },
    ]);
  }

  /** 语言切换弹窗（label 用各自语言书写，无需翻译） */
  function pickLanguage() {
    const current = choice;
    Alert.alert(
      tt('settings.language'),
      undefined,
      LANG_CHOICES.map(({ code, label }) => ({
        text: code === current ? `✓ ${label}` : label,
        onPress: () => setChoice(code),
      })),
      { cancelable: true }
    );
  }

  return (
    <View style={styles.container}>
      <SubPageHeader title={tt('settings.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* 通用（语言） */}
        <Text style={styles.sectionHeader}>{tt('settings.languageSection')}</Text>
        <TouchableOpacity style={styles.card} activeOpacity={0.6} onPress={pickLanguage}>
          <View style={styles.rowBetween}>
            <Text style={styles.rowText}>{tt('settings.language')}</Text>
            <Text style={styles.rowValue}>
              {LANG_CHOICES.find((l) => l.code === choice)?.label ?? labelFor(locale)}
            </Text>
          </View>
        </TouchableOpacity>

        {/* DeFi 网络 */}
        <Text style={styles.sectionHeader}>{tt('settings.defiNetworkSection')}</Text>
        <TouchableOpacity style={styles.card} activeOpacity={0.6} onPress={pickNetwork}>
          <View style={styles.rowBetween}>
            <Text style={styles.rowText}>{tt('settings.defiNetwork')}</Text>
            <Text style={styles.rowValue}>
              {tt(`defi.network.${network}`)}
            </Text>
          </View>
        </TouchableOpacity>

        {/* 数据来源 */}
        <Text style={styles.sectionHeader}>{tt('settings.dataSection')}</Text>
        <View style={styles.card}>
          <Text style={styles.title}>{tt('settings.marketData')}</Text>
          <Text style={styles.desc}>{tt('settings.marketDataDesc')}</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.coingecko.com')}>
            <Text style={styles.link}>{tt('settings.visitCoinGecko')}</Text>
          </TouchableOpacity>
        </View>

        {/* 应用 */}
        <Text style={styles.sectionHeader}>{tt('settings.appSection')}</Text>
        <View style={styles.card}>
          <Text style={styles.rowText}>{tt('settings.terms')}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.rowText}>{tt('settings.privacy')}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.rowText}>{tt('settings.version')}</Text>
        </View>

        {/* 退出登录 */}
        {session ? (
          <>
            <Text style={styles.sectionHeader}>{tt('settings.accountSection')}</Text>
            <TouchableOpacity style={styles.card} activeOpacity={0.6} onPress={confirmSignOut}>
              <Text style={[styles.rowText, { color: t.red, textAlign: 'center' }]}>
                {tt('settings.signOut')}
              </Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** 'zh' | 'en' → 展示名（设置项当前值） */
function labelFor(locale) {
  return locale === 'en' ? 'English' : '简体中文';
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
    rowValue: {
      fontSize: 13,
      color: t.secondaryText,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  });

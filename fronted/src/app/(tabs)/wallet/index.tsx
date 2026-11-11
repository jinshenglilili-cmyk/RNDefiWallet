import { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { useAuthStore } from '@/stores/auth';
import { useWalletStore } from '@/stores/wallet';
import { accountName } from '@/utils/walletStore';
import { nativeSymbol } from '@/utils/defi/bscRpc';
import { useDefiNetwork } from '@/stores/defiNetwork';
import { useTheme } from '@/utils/theme';
import { t as tt } from '@/i18n';

/** 地址截断：前8...后8 */
function shorten(addr) {
  if (!addr) return '';
  return addr.length > 19 ? `${addr.slice(0, 8)}...${addr.slice(-8)}` : addr;
}

/**
 * 钱包 Tab：对齐参考项目「我的」(ProfileView) 的结构与导航
 * - 头部标题 + 齿轮（push 设置页）
 * - 个人信息模块：未登录显示「未登录」，点击去登录；登录后显示用户昵称/邮箱
 * - 账号卡：点击打开「选择账号」sheet（选择/删除账号，删除后选中退化为最后一个）
 * - 常用功能列表：新增账号 / 转账 / 导出助记词 / 连接 DApp / 删除钱包（登录后可用）
 */
export default function WalletTab() {
  const t = useTheme();
  const router = useRouter();
  const { session, isLoading: sessionLoading, userInfo } = useAuthStore();
  const { meta, balance, ready, load, switchAccount, deleteAccount, deleteWallet } = useWalletStore();
  // 订阅 DeFi 网络：切换后余额符号随网络显示（BNB / ETH），返回本 tab 时 load() 会重查对应链
  const defiNetwork = useDefiNetwork((s) => s.network);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const styles = makeStyles(t);

  // 每次聚焦（含从创建/导入/转账页、登录页返回）：
  // 先拉用户信息（会兜底切换钱包归属），再加载钱包数据与余额
  useFocusEffect(
    useCallback(() => {
      (async () => {
        await useAuthStore.getState().fetchProfile();
        await load();
      })();
    }, [load])
  );

  if (!ready || sessionLoading) {
    return <View style={styles.container} />;
  }

  const hasAccounts = !!meta && meta.accounts.length > 0;
  const currentAddr = hasAccounts ? meta.accounts[meta.current] : '';

  // 删除账号（对齐参考项目：删除当前账号后选中退化为最后一个）
  function confirmDeleteAccount(index) {
    Alert.alert(tt('wallet.tab.deleteAccountTitle'), tt('wallet.tab.deleteAccountMsg', { name: accountName(meta, index) }), [
      { text: tt('common.cancel'), style: 'cancel' },
      {
        text: tt('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteAccount(index);
        },
      },
    ]);
  }

  function confirmDeleteWallet() {
    Alert.alert(tt('wallet.tab.deleteWalletTitle'), tt('wallet.tab.deleteWalletMsg'), [
      { text: tt('common.cancel'), style: 'cancel' },
      {
        text: tt('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteWallet();
        },
      },
    ]);
  }

  // 功能列表行（对齐参考项目 ProfileView 的 List 样式）
  // 未登录时点击任意功能行 → 先调起登录页；登录后才能继续操作
  function FeatureRow({ icon, label, href, destructive, disabled, onPress }) {
    const content = (
      <View style={styles.row}>
        <Text style={[styles.rowIcon, destructive && { color: t.red }]}>{icon}</Text>
        <Text style={[styles.rowLabel, destructive && { color: t.red }]}>{label}</Text>
        {href ? <Text style={styles.rowChevron}>›</Text> : null}
      </View>
    );
    if (!session) {
      return (
        <TouchableOpacity activeOpacity={0.6} onPress={() => router.push('/auth')}>
          {content}
        </TouchableOpacity>
      );
    }
    // 已登录但还没有钱包：被禁用的功能行点击时给引导，而不是无反应
    if (disabled) {
      return (
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() =>
            Alert.alert(tt('wallet.tab.hintTitle'), tt('wallet.tab.hintNeedWallet'), [
              { text: tt('common.cancel'), style: 'cancel' },
              { text: tt('wallet.tab.createWallet'), onPress: () => router.push('/wallet/create') },
              { text: tt('wallet.tab.importWallet'), onPress: () => router.push('/wallet/import') },
            ])
          }
        >
          {content}
        </TouchableOpacity>
      );
    }
    if (onPress) {
      return (
        <TouchableOpacity disabled={disabled} activeOpacity={0.6} onPress={onPress}>
          {content}
        </TouchableOpacity>
      );
    }
    // push 语义：确保是真正的压栈，返回箭头才有历史可退
    return (
      <Link href={href} asChild disabled={disabled} push>
        <TouchableOpacity activeOpacity={0.6} disabled={disabled}>
          {content}
        </TouchableOpacity>
      </Link>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 头部：标题 + 齿轮（push 设置页） */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{tt('wallet.tab.title')}</Text>
        <TouchableOpacity
          style={styles.gearButton}
          activeOpacity={0.7}
          onPress={() => router.push('/settings')}
        >
          <Text style={styles.gearIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* 个人信息模块：未登录 → 点击登录；已登录 → 昵称/邮箱 */}
      <TouchableOpacity
        style={styles.profileCard}
        activeOpacity={session ? 1 : 0.7}
        disabled={!!session}
        onPress={() => router.push('/auth')}
      >
        {session && userInfo?.avatar ? (
          <Image source={{ uri: userInfo.avatar }} style={styles.profileAvatar} />
        ) : (
          <View style={[styles.profileAvatar, styles.profileAvatarPlaceholder]}>
            <Text style={styles.profileAvatarIcon}>👤</Text>
          </View>
        )}
        <View style={styles.profileInfo}>
          {session ? (
            <>
              <Text style={styles.profileName}>{userInfo?.nickname ?? tt('wallet.tab.loggedIn')}</Text>
              <Text style={styles.profileSub}>{userInfo?.email ?? ''}</Text>
            </>
          ) : (
            <>
              <Text style={styles.profileName}>{tt('wallet.tab.notLoggedIn')}</Text>
              <Text style={styles.profileSub}>{tt('wallet.tab.tapToLogin')}</Text>
            </>
          )}
        </View>
        {!session ? <Text style={styles.profileChevron}>›</Text> : null}
      </TouchableOpacity>

      {/* 账号卡：点击打开选择账号 sheet */}
      {hasAccounts ? (
        <TouchableOpacity style={styles.accountCard} activeOpacity={0.7} onPress={() => setSelectorVisible(true)}>
          <View style={styles.accountTopRow}>
            <Text style={styles.accountSectionLabel}>{tt('wallet.tab.currentAccount')}</Text>
            <Text style={styles.accountChevron}>▾</Text>
          </View>
          <View style={styles.accountNameRow}>
            <Text style={styles.accountName}>{accountName(meta, meta.current)}</Text>
            <Text style={styles.accountCheck}>✓</Text>
          </View>
          <Text style={styles.accountAddress}>
            {nativeSymbol()} {shorten(currentAddr)}
          </Text>
          {balance !== null ? (
            <Text style={styles.accountBalance}>{balance} {nativeSymbol()}</Text>
          ) : null}
        </TouchableOpacity>
      ) : (
        <View style={[styles.accountCard, styles.accountEmpty]}>
          <Text style={styles.accountEmptyTitle}>{tt('wallet.tab.noWalletTitle')}</Text>
          <Text style={styles.accountEmptyHint}>{tt('wallet.tab.noWalletHint')}</Text>
        </View>
      )}

      {/* 常用功能（所有功能需登录；未登录点击先调起登录页） */}
      <Text style={styles.listHeader}>{tt('wallet.tab.featuresHeader')}</Text>
      <View style={styles.listCard}>
        <FeatureRow icon="🔑" label={tt('wallet.tab.exportMnemonic')} href="/wallet/export" disabled={!hasAccounts} />
        <FeatureRow icon="✍️" label={tt('wallet.tab.signMessage')} href="/wallet/sign" disabled={!hasAccounts} />
        <FeatureRow icon="💸" label={tt('wallet.tab.transfer')} href="/wallet/transactions" disabled={!hasAccounts} />
        <FeatureRow icon="➕" label={tt('wallet.tab.addAccount')} href="/wallet/add-account" disabled={!hasAccounts} />
        <FeatureRow icon="🌐" label={tt('wallet.tab.browser')} href="/browser" />
        <FeatureRow icon="🔗" label={tt('wallet.tab.connectDApp')} href="/wc" disabled={!hasAccounts} />
        <FeatureRow icon="🗑" label={tt('wallet.tab.deleteWallet')} destructive onPress={confirmDeleteWallet} />
      </View>
      {!hasAccounts ? (
        <View style={styles.listCard}>
          <FeatureRow icon="📝" label={tt('wallet.tab.createWallet')} href="/wallet/create" />
          <FeatureRow icon="📥" label={tt('wallet.tab.importWallet')} href="/wallet/import" />
        </View>
      ) : null}

      <Text style={styles.tip}>{tt('wallet.tab.mainnetTip')}</Text>

      {/* 选择账号 sheet（对齐参考项目 AccountSelectorView） */}
      <Modal visible={selectorVisible} animationType="slide" onRequestClose={() => setSelectorVisible(false)}>
        <View style={styles.selectorContainer}>
          <View style={styles.selectorHeader}>
            <TouchableOpacity onPress={() => setSelectorVisible(false)}>
              <Text style={styles.selectorClose}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.selectorTitle}>{tt('wallet.tab.selectAccount')}</Text>
            <View style={{ width: 60 }} />
          </View>

          {meta?.accounts.map((addr, index) => {
            const active = index === meta.current;
            return (
              <View
                key={`${addr}-${index}`}
                style={[styles.selectorRow, active && styles.selectorRowActive]}
              >
                <TouchableOpacity
                  style={styles.selectorMain}
                  activeOpacity={0.6}
                  onPress={async () => {
                    await switchAccount(index);
                    setSelectorVisible(false);
                  }}
                >
                  <View style={styles.selectorNameRow}>
                    <Text style={styles.selectorName}>{accountName(meta, index)}</Text>
                    {active ? <Text style={styles.selectorCheck}>✓</Text> : null}
                  </View>
                  <Text style={styles.selectorAddress} numberOfLines={1}>
                    [{nativeSymbol()}] {shorten(addr)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmDeleteAccount(index)} style={styles.selectorDelete}>
                  <Text style={styles.selectorDeleteText}>{tt('common.delete')}</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          <Text style={styles.selectorTip}>{tt('wallet.tab.selectorTip')}</Text>
        </View>
      </Modal>
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
      padding: 16,
    },

    // 头部
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 58,
      marginBottom: 16,
    },
    headerTitle: {
      fontSize: 26,
      fontWeight: '900',
      color: t.accent,
    },
    gearButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: t.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    gearIcon: {
      fontSize: 20,
      color: t.accent,
    },

    // 个人信息模块
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    profileAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: t.bar,
    },
    profileAvatarPlaceholder: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    profileAvatarIcon: {
      fontSize: 26,
    },
    profileInfo: {
      flex: 1,
      marginLeft: 14,
    },
    profileName: {
      fontSize: 17,
      fontWeight: '700',
      color: t.accent,
    },
    profileSub: {
      fontSize: 13,
      color: t.secondaryText,
      marginTop: 4,
    },
    profileChevron: {
      fontSize: 20,
      color: t.secondaryText,
    },

    // 账号卡
    accountCard: {
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 16,
    },
    accountEmpty: {
      minHeight: 110,
      justifyContent: 'center',
      alignItems: 'center',
    },
    accountEmptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: t.accent,
    },
    accountEmptyHint: {
      fontSize: 12,
      color: t.secondaryText,
      marginTop: 6,
      textAlign: 'center',
    },
    accountTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    accountSectionLabel: {
      fontSize: 12,
      color: t.secondaryText,
    },
    accountChevron: {
      fontSize: 16,
      color: t.secondaryText,
    },
    accountNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },
    accountName: {
      fontSize: 20,
      fontWeight: '700',
      color: t.accent,
    },
    accountCheck: {
      color: t.green,
      fontSize: 15,
      fontWeight: '700',
      marginLeft: 8,
    },
    accountAddress: {
      fontSize: 13,
      fontWeight: '600',
      color: t.accent,
      marginTop: 8,
    },
    accountBalance: {
      fontSize: 24,
      fontWeight: 'bold',
      color: t.accent,
      marginTop: 10,
    },

    // 功能列表
    listHeader: {
      fontSize: 13,
      color: t.secondaryText,
      marginTop: 20,
      marginBottom: 8,
      marginLeft: 4,
    },
    listCard: {
      backgroundColor: t.card,
      borderRadius: 12,
      marginBottom: 12,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.divider,
    },
    rowIcon: {
      fontSize: 18,
      width: 30,
    },
    rowLabel: {
      flex: 1,
      fontSize: 15,
      color: t.accent,
    },
    rowChevron: {
      fontSize: 18,
      color: t.secondaryText,
    },

    // 选择账号 sheet
    selectorContainer: {
      flex: 1,
      backgroundColor: t.background,
      paddingTop: 60,
      paddingHorizontal: 16,
    },
    selectorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    selectorClose: {
      color: t.link,
      fontSize: 17,
      fontWeight: '700',
      width: 70,
    },
    selectorTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
      color: t.accent,
    },
    selectorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.card,
      borderRadius: 12,
      marginBottom: 10,
      paddingRight: 12,
    },
    selectorRowActive: {
      borderWidth: 1,
      borderColor: t.green,
    },
    selectorMain: {
      flex: 1,
      padding: 14,
    },
    selectorNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    selectorName: {
      fontSize: 15,
      fontWeight: '600',
      color: t.accent,
    },
    selectorCheck: {
      color: t.green,
      fontSize: 14,
      fontWeight: '700',
      marginLeft: 8,
    },
    selectorAddress: {
      fontSize: 12,
      color: t.secondaryText,
      marginTop: 4,
    },
    selectorDelete: {
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    selectorDeleteText: {
      color: t.red,
      fontSize: 13,
    },
    selectorTip: {
      marginTop: 12,
      fontSize: 12,
      lineHeight: 20,
      color: t.secondaryText,
    },

    tip: {
      marginTop: 10,
      color: t.secondaryText,
      fontSize: 12,
      lineHeight: 20,
      marginBottom: 30,
    },
  });

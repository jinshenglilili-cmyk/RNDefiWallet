// DeFi 三个 tab 共用的 UI 小组件：登录/钱包引导、代币选择 sheet、交易记录写入

import { Alert, Modal, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/utils/theme';
import { t as tt } from '@/i18n';
import { useDefiNetwork } from '@/stores/defiNetwork';
import { getTokens, net } from '@/utils/defi/tokens';
import { formatTokenAmount } from '@/utils/defi/format';

/** 通用守卫：未登录 / 没有钱包账号时渲染引导页（有账号渲染 children） */
export function DefiGuard({ session, hasAccount, children }) {
  const t = useTheme();
  const router = useRouter();
  if (!session || !hasAccount) {
    return (
      <View style={styles.guard}>
        <Text style={styles.guardIcon}>🔐</Text>
        <Text style={[styles.guardTitle, { color: t.accent }]}>
          {!session ? tt('defi.common.pleaseLogin') : tt('defi.common.noWallet')}
        </Text>
        <Text style={[styles.guardHint, { color: t.secondaryText }]}>
          {!session
            ? tt('defi.common.loginHint')
            : tt('defi.common.walletHint')}
        </Text>
        <TouchableOpacity
          style={[styles.guardButton, { backgroundColor: t.accent }]}
          activeOpacity={0.7}
          onPress={() => {
            if (!session) {
              router.push('/auth');
            } else {
              Alert.alert(tt('defi.common.addWalletTitle'), tt('defi.common.addWalletMessage'), [
                { text: tt('common.cancel'), style: 'cancel' },
                { text: tt('defi.common.createWallet'), onPress: () => router.push('/wallet/create') },
                { text: tt('defi.common.importWallet'), onPress: () => router.push('/wallet/import') },
              ]);
            }
          }}
        >
          <Text style={[styles.guardButtonText, { color: t.background }]}>
            {!session ? tt('defi.common.goLogin') : tt('defi.common.goAddWallet')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
  return children;
}

/** 页面大标题（对齐钱包 tab 的头部样式）；测试网时标题旁带网络徽标 */
export function DefiHeader({ title, subtitle }) {
  const t = useTheme();
  const network = useDefiNetwork((s) => s.network);
  const isTestnet = network === 'sepolia';
  return (
    <View style={{ paddingTop: 58, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 26, fontWeight: '900', color: t.accent }}>{title}</Text>
        {isTestnet ? (
          <Text style={{
            fontSize: 10, fontWeight: '700', color: t.orange,
            borderWidth: 1, borderColor: t.orange, borderRadius: 8,
            paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8,
          }}>
            {tt('defi.network.sepolia')}
          </Text>
        ) : null}
      </View>
      {subtitle ? (
        <Text style={{ fontSize: 12, color: t.secondaryText, marginTop: 4 }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

/**
 * 代币选择 sheet（modal 全屏，列出 TOKENS 与各自余额）
 * balances: { [symbol]: BigInt }，nativeBalance: BigInt | null（原生 BNB）
 */
export function TokenSheet({ visible, balances, nativeBalance, onSelect, onClose, excludeSymbol }) {
  const t = useTheme();
  function balanceOfToken(token) {
    if (token.native) return formatTokenAmount(nativeBalance ?? 0n);
    return formatTokenAmount(balances?.[token.symbol] ?? 0n, token.decimals);
  }
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.background, paddingTop: 60, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 20, color: t.link, width: 60 }}>✕</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: t.accent }}>
              {tt('defi.common.selectToken')}
          </Text>
          <View style={{ width: 60 }} />
        </View>
        {getTokens().filter((tk) => tk.symbol !== excludeSymbol && !tk.wrapped).map((token) => (
          <TouchableOpacity
            key={token.symbol}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: t.card,
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
            }}
            activeOpacity={0.6}
            onPress={() => {
              onSelect(token);
              onClose();
            }}
          >
            <Text style={{ fontSize: 24, marginRight: 12 }}>{token.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: t.accent }}>{token.symbol}</Text>
              <Text style={{ fontSize: 12, color: t.secondaryText, marginTop: 2 }}>{token.name}</Text>
            </View>
            <Text style={{ fontSize: 14, color: t.accent, fontWeight: '600' }}>
              {balanceOfToken(token)}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={{ fontSize: 11, color: t.secondaryText, marginTop: 8, lineHeight: 18 }}>
          {tt('defi.common.tokenSheetTip', { native: net().nativeSymbol, wrapped: net().tokens.find((tk) => tk.wrapped)?.symbol ?? '' })}
        </Text>
      </View>
    </Modal>
  );
}

/** 写一条 DeFi 交易记录（复用钱包页的交易历史；chain 按当前 DeFi 网络） */
export async function recordDefiTx(walletStore, record) {
  const network = useDefiNetwork.getState().network;
  return walletStore.addTransaction({
    type: 'defi',
    chain: network, // 'bsc' | 'ethereum' | 'sepolia'（钱包侧 chains i18n 已含全部 key）
    chainSymbol: net().nativeSymbol,
    ...record,
  });
}

const styles = {
  guard: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 150,
    paddingHorizontal: 32,
  },
  guardIcon: {
    fontSize: 52,
  },
  guardTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  guardHint: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  guardButton: {
    borderRadius: 12,
    paddingHorizontal: 32,
    height: 46,
    justifyContent: 'center',
    marginTop: 24,
  },
  guardButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
};

// 用函数生成（保持与项目 makeStyles 风格一致）
export const makeStyles = () => styles;

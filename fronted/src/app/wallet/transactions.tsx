import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { Animated } from 'react-native';

import Wallet from '@wallet';
import * as walletStore from '@/utils/walletStore';
import { getBalance, getNonce, getGasPrice, estimateGas, sendRawTransaction } from '@/utils/rpc';
import { parseEther, formatEther } from '@/utils/format';
import { useTheme } from '@/utils/theme';

/** 区块链选择（对齐参考项目 ChainType.allCases 7 条链） */
const CHAINS = [
  { key: 'bitcoin', symbol: 'BTC', name: '比特币' },
  { key: 'ethereum', symbol: 'ETH', name: '以太坊' },
  { key: 'solana', symbol: 'SOL', name: 'Solana' },
  { key: 'tron', symbol: 'TRX', name: '波场' },
  { key: 'bsc', symbol: 'BNB', name: 'BNB 链' },
  { key: 'avalanche', symbol: 'AVAX', name: 'Avalanche' },
  { key: 'polygon', symbol: 'MATIC', name: 'Polygon' },
];

/** 地址中间截断 */
function shorten(addr, head = 8, tail = 8) {
  if (!addr) return '';
  return addr.length > head + tail + 3 ? `${addr.slice(0, head)}...${addr.slice(-tail)}` : addr;
}

/** mock 交易哈希（32 hex，对齐参考项目模拟确认） */
function mockTxHash() {
  let s = '';
  for (let i = 0; i < 64; i++) s += Math.floor(Math.random() * 16).toString(16);
  return '0x' + s;
}

/**
 * 转账记录 + 新建转账（对齐参考项目 TransactionListView + CreateTransactionView）
 * - 头部：标题 + 刷新（旋转）+「新建转账」按钮打开 sheet
 * - 列表：金额+状态标签（处理中橙/成功绿/失败红）、地址、链+时间、哈希；滑动删除
 * - 新建转账 sheet：发起账户 / 接收地址 / 金额（全部）+ 区块链横向选择
 *   ETH 走真实签名广播；其他链无签名通道，按参考项目模拟确认（3-10s，90% 成功）
 */
export default function Transactions() {
  const t = useTheme();
  const [list, setList] = useState([]);
  const [meta, setMeta] = useState(null);
  const [balance, setBalance] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);

  // 新建转账表单
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [chainKey, setChainKey] = useState('ethereum');
  const [busy, setBusy] = useState(false);

  const styles = makeStyles(t);

  const load = useCallback(async () => {
    setList(await walletStore.getTransactions());
    const m = await walletStore.getMeta();
    setMeta(m);
    const addr = m.accounts[m.current];
    if (addr) {
      try {
        setBalance(formatEther(await getBalance(addr)));
      } catch {
        setBalance(null);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // 下拉刷新：1s 延迟后重读本地存储（对齐参考项目 refreshTransactions）
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([new Promise((r) => setTimeout(r, 1000)), load()]);
    setRefreshing(false);
  };

  async function openSheet() {
    setTo('');
    setAmount('');
    setChainKey('ethereum');
    await load();
    setSheetVisible(true);
  }

  const from = meta?.accounts[meta.current] ?? '';
  const chain = CHAINS.find((c) => c.key === chainKey);

  // ---------- 提交转账 ----------
  function handleSubmit() {
    if (!/^0x[0-9a-fA-F]{40}$/.test(to.trim())) {
      Alert.alert('错误', '接收地址格式不对：应为 0x 开头的 42 位十六进制');
      return;
    }
    const valueWei = parseEther(amount);
    if (valueWei <= 0n) {
      Alert.alert('错误', '转账金额需要大于 0');
      return;
    }
    if (chainKey === 'ethereum') {
      Alert.alert('确认转账', `转出 ${amount} ETH 到\n${to.trim()}`, [
        { text: '取消', style: 'cancel' },
        { text: '确认', style: 'destructive', onPress: () => sendRealEth(valueWei) },
      ]);
    } else {
      simulateTransfer();
    }
  }

  // ETH：真实链上转账（Trust Wallet Core 签名 -> 广播）
  async function sendRealEth(valueWei) {
    let record = null;
    try {
      setBusy(true);
      const mnemonic = await walletStore.getMnemonic();
      record = await walletStore.addTransaction({
        type: 'transfer',
        from,
        to: to.trim(),
        amount: formatEther(valueWei),
        chain: 'ethereum',
        chainSymbol: 'ETH',
        status: '处理中',
      });
      setSheetVisible(false);
      setList(await walletStore.getTransactions());

      const [nonce, gasPrice] = await Promise.all([getNonce(from), getGasPrice()]);
      const gasLimit = await estimateGas({
        from,
        to: to.trim(),
        value: '0x' + valueWei.toString(16),
      });
      const rawTx = await Wallet.signTransaction('ethereum', mnemonic, {
        chainId: '1',
        nonce,
        gasPrice,
        gasLimit,
        to: to.trim(),
        value: valueWei.toString(10),
      });
      const txHash = await sendRawTransaction(rawTx);
      await walletStore.updateTransaction(record.id, { status: '成功', txHash });
    } catch (err) {
      if (record) {
        await walletStore.updateTransaction(record.id, {
          status: '失败',
          error: String(err.message ?? err),
        });
      } else {
        Alert.alert('转账失败', String(err.message ?? err));
      }
    } finally {
      setBusy(false);
      setList(await walletStore.getTransactions());
    }
  }

  // 其他链：模拟确认（对齐参考项目 simulateTransactionConfirmation：3-10s，90% 成功）
  async function simulateTransfer() {
    const record = await walletStore.addTransaction({
      type: 'transfer',
      from,
      to: to.trim(),
      amount,
      chain: chainKey,
      chainSymbol: chain.symbol,
      status: '处理中',
    });
    setSheetVisible(false);
    setList(await walletStore.getTransactions());
    const delay = 3000 + Math.random() * 7000;
    setTimeout(async () => {
      if (Math.random() < 0.9) {
        await walletStore.updateTransaction(record.id, { status: '成功', txHash: mockTxHash() });
      } else {
        await walletStore.updateTransaction(record.id, { status: '失败', error: '模拟：交易被拒绝' });
      }
      setList(await walletStore.getTransactions());
    }, delay);
  }

  // ---------- 渲染 ----------
  function StatusTag({ status }) {
    const bg = status === '成功' ? t.green : status === '失败' ? t.red : '#FF9500';
    return (
      <View style={[styles.statusTag, { backgroundColor: bg }]}>
        <Text style={styles.statusText}>{status}</Text>
      </View>
    );
  }

  function renderRightActions(progress, dragX, item) {
    const translate = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [0, 80],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.deleteAction, { transform: [{ translateX: translate }] }]}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={async () => {
            await walletStore.deleteTransaction(item.id);
            setList(await walletStore.getTransactions());
          }}
        >
          <Text style={styles.deleteText}>删除</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const noAccount = !meta || meta.accounts.length === 0;

  return (
    <View style={styles.container}>
      {/* 「新建转账」放到原生导航栏右侧；刷新只保留下拉刷新 */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              style={[styles.newButton, noAccount && styles.disabled]}
              disabled={noAccount || busy}
              onPress={openSheet}
            >
              <Text style={styles.newButtonText}>＋ 新建转账</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {noAccount ? (
        <Text style={styles.warnBanner}>请先在「钱包」页面创建或导入账号</Text>
      ) : null}

      <FlatList
        data={list}
        keyExtractor={(item) => item.id ?? `${item.txHash}-${item.time}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.secondaryText} />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Swipeable renderRightActions={(p, d) => renderRightActions(p, d, item)} overshootRight={false}>
            <View style={styles.card}>
              <View style={styles.rowTop}>
                <Text style={styles.amount}>
                  -{item.amount} {item.chainSymbol ?? 'ETH'}
                </Text>
                <StatusTag status={item.status ?? '成功'} />
              </View>
              <Text style={styles.addrLine} numberOfLines={1}>
                <Text style={styles.addrLabel}>发件地址：</Text>
                <Text style={styles.addrValue}>{shorten(item.from)}</Text>
              </Text>
              <Text style={styles.addrLine} numberOfLines={1}>
                <Text style={styles.addrLabel}>接收地址：</Text>
                <Text style={styles.addrValue}>{shorten(item.to)}</Text>
              </Text>
              {item.txHash ? (
                <Text style={styles.addrLine} numberOfLines={1}>
                  <Text style={styles.addrLabel}>交易哈希：</Text>
                  <Text style={styles.addrValue}>{shorten(item.txHash, 10, 10)}</Text>
                </Text>
              ) : null}
              <View style={styles.rowBottom}>
                <Text style={styles.chain}>
                  {(CHAINS.find((c) => c.key === item.chain)?.name ?? '以太坊')}
                </Text>
                <Text style={styles.time}>
                  {new Date(item.time).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          </Swipeable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>⇄</Text>
            <Text style={styles.emptyTitle}>暂无转账记录</Text>
            <Text style={styles.emptyHint}>点击右上角「新建转账」发起第一笔</Text>
          </View>
        }
      />

      {/* 新建转账 sheet（对齐参考项目 CreateTransactionView） */}
      <Modal visible={sheetVisible} animationType="slide" onRequestClose={() => setSheetVisible(false)}>
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => setSheetVisible(false)}>
              <Text style={styles.sheetClose}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>新建转账</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* 发起账户（只读） */}
          <Text style={styles.sectionTitle}>发起账户</Text>
          <View style={styles.accountCard}>
            <Text style={styles.accountName}>
              {meta ? `账号 ${meta.current + 1}` : '-'}
            </Text>
            <Text style={styles.accountAddr} numberOfLines={1}>
              ETH {shorten(from)}
            </Text>
            {balance !== null ? <Text style={styles.accountBalance}>余额 {balance} ETH</Text> : null}
          </View>

          {/* 接收地址 */}
          <Text style={styles.sectionTitle}>接收地址</Text>
          <TextInput
            style={styles.input}
            value={to}
            onChangeText={setTo}
            placeholder="请输入接收地址"
            placeholderTextColor={t.secondaryText}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* 转账金额 */}
          <Text style={styles.sectionTitle}>转账金额 ({chain.symbol})</Text>
          <View style={styles.amountRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="如：0.01"
              placeholderTextColor={t.secondaryText}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={styles.allButton}
              onPress={() => balance && setAmount(String(balance))}
            >
              <Text style={styles.allButtonText}>全部</Text>
            </TouchableOpacity>
          </View>

          {/* 区块链横向选择 */}
          <Text style={styles.sectionTitle}>区块链</Text>
          <View style={styles.chainRow}>
            {CHAINS.map((c) => {
              const active = c.key === chainKey;
              return (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setChainKey(c.key)}
                  style={[styles.chainCell, active && styles.chainCellActive]}
                >
                  <Text style={[styles.chainCellText, active && styles.chainCellTextActive]}>
                    {c.symbol}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {chainKey !== 'ethereum' ? (
            <Text style={styles.chainHint}>
              {chain.name}暂未接入签名通道，将按参考项目方式模拟确认（3-10 秒后出结果）。
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.submitButton, (!to.trim() || !amount || busy) && styles.disabled]}
            disabled={!to.trim() || !amount || busy}
            onPress={handleSubmit}
          >
            <Text style={styles.submitText}>{busy ? '签名广播中…' : '发起转账'}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (t) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background,
    },
    newButton: {
      backgroundColor: t.accent,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 34,
      justifyContent: 'center',
    },
    newButtonText: {
      color: t.background,
      fontSize: 13,
      fontWeight: '600',
    },
    disabled: {
      opacity: 0.4,
    },
    warnBanner: {
      color: '#FF9500',
      fontSize: 13,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    listContent: {
      paddingBottom: 20,
    },

    // 列表卡
    card: {
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 14,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    rowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    amount: {
      fontSize: 20,
      fontWeight: '600',
      color: t.accent,
    },
    statusTag: {
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#fff',
    },
    addrLine: {
      marginTop: 6,
      fontSize: 12,
    },
    addrLabel: {
      fontSize: 12,
      color: t.secondaryText,
    },
    addrValue: {
      fontSize: 12,
      color: t.accent,
    },
    rowBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    chain: {
      fontSize: 12,
      color: t.accent,
    },
    time: {
      fontSize: 12,
      color: t.secondaryText,
    },

    // 滑动删除
    deleteAction: {
      justifyContent: 'center',
      marginLeft: -16,
    },
    deleteButton: {
      backgroundColor: t.red,
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      borderTopRightRadius: 12,
      borderBottomRightRadius: 12,
      width: 70,
    },
    deleteText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },

    // 空态
    empty: {
      alignItems: 'center',
      paddingTop: 120,
    },
    emptyIcon: {
      fontSize: 56,
      color: t.secondaryText,
    },
    emptyTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: t.accent,
      marginTop: 16,
    },
    emptyHint: {
      fontSize: 12,
      color: t.secondaryText,
      marginTop: 8,
    },

    // 新建转账 sheet
    sheetContainer: {
      flex: 1,
      backgroundColor: t.background,
      paddingTop: 60,
      paddingHorizontal: 16,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    sheetClose: {
      fontSize: 20,
      color: t.link,
      width: 40,
    },
    sheetTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
      color: t.accent,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: t.accent,
      marginBottom: 10,
    },
    accountCard: {
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 18,
    },
    accountName: {
      fontSize: 15,
      fontWeight: '600',
      color: t.accent,
    },
    accountAddr: {
      fontSize: 12,
      color: t.accent,
      marginTop: 6,
    },
    accountBalance: {
      fontSize: 12,
      color: t.secondaryText,
      marginTop: 4,
    },
    input: {
      backgroundColor: t.card,
      borderRadius: 12,
      paddingHorizontal: 16,
      height: 48,
      fontSize: 14,
      color: t.accent,
      marginBottom: 18,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 18,
    },
    allButton: {
      marginLeft: 10,
      backgroundColor: t.accent,
      borderRadius: 12,
      paddingHorizontal: 16,
      height: 48,
      justifyContent: 'center',
    },
    allButtonText: {
      color: t.background,
      fontSize: 14,
      fontWeight: '600',
    },
    chainRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 8,
    },
    chainCell: {
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.card,
      justifyContent: 'center',
      marginRight: 8,
      marginBottom: 8,
    },
    chainCellActive: {
      backgroundColor: t.accent,
    },
    chainCellText: {
      fontSize: 13,
      fontWeight: '600',
      color: t.accent,
    },
    chainCellTextActive: {
      color: t.background,
    },
    chainHint: {
      fontSize: 11,
      color: t.secondaryText,
      marginBottom: 12,
    },
    submitButton: {
      height: 52,
      borderRadius: 12,
      backgroundColor: t.accent,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
    },
    submitText: {
      color: t.background,
      fontSize: 15,
      fontWeight: '600',
    },
  });

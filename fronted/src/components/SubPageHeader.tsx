import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/utils/theme';

/**
 * 二级页面顶部导航：左侧 ✕ 返回（无文字）+ 居中标题
 * 二级页面之前依赖 tab 容器的公共导航栏，公共栏下线后统一用它
 */
export default function SubPageHeader({ title, onClose, fallbackHref = '/' }) {
  const t = useTheme();
  const router = useRouter();
  const styles = makeStyles(t);
  // 深链接直接打开的页面没有可返回的历史，back 会报错，此时 replace 到兜底路由
  const handleClose = onClose ?? (() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackHref);
    }
  });
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.closeButton}
        activeOpacity={0.7}
        onPress={handleClose}
      >
        <Text style={styles.closeIcon}>✕</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{title || ''}</Text>
      <View style={styles.spacer} />
    </View>
  );
}

const makeStyles = (t) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 58,
      paddingBottom: 8,
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: t.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    closeIcon: {
      fontSize: 17,
      fontWeight: '700',
      color: t.accent,
    },
    title: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '700',
      color: t.accent,
    },
    spacer: {
      width: 40,
    },
  });

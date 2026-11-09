import { useEffect } from 'react';
import { View, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuthStore } from '@/stores/auth';

/**
 * 退出登录中转页：request.js 收到 401（token 过期）时跳到这里。
 * 清空本地登录态（含钱包数据归属归档），提示后回到登录注册页。
 */
export default function SignOut() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      await useAuthStore.getState().signOut();
      Alert.alert('提示', '登录超时，请重新登录！', [
        {
          text: 'OK',
          onPress: () => router.replace('/auth'),
        },
      ]);
    })();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1f99b0" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

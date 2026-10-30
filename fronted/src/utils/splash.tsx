import { SplashScreen } from 'expo-router';

import { useSession } from '@/utils/ctx';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function SplashScreenController() {
  const { isLoading } = useSession();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // 每次组件挂载时都阻止自动隐藏，确保开发环境热重载后也能工作
    SplashScreen.preventAutoHideAsync();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      // 添加 3 秒延迟，让启动页多停留一会，效果更明显
      setTimeout(() => {
        SplashScreen.hide();
        setVisible(false); // 隐藏自定义的 splash 页面
      }, 3000);
    }
  }, [isLoading]);

  // 如果不显示了，返回 null
  if (!visible) {
    return null;
  }

  // 返回一个自定义的红色背景 splash 页面
  return (
    <View style={styles.container}>
      <Text style={styles.text}>自定义 Splash 页面</Text>
      <Text style={styles.subtext}>（红色背景，容易看清效果）</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'red',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  text: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
  },
  subtext: {
    color: 'white',
    fontSize: 16,
    marginTop: 16,
  },
});

import { Link, SplashScreen, Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import screenOptions from '@/options/screenOptions';
import { SplashScreenController } from '@/utils/splash';
import { t as tt, useI18nLocale } from '@/i18n';

export default function Layout() {
  // 订阅语言：切换语言时重新渲染，导航栏标题随语言刷新
  useI18nLocale();
  function CloseButton() {
    const router = useRouter();
    return (
      <View style={{ padding: 3 }}>
        <TouchableOpacity onPress={() => router.dismiss()}>
          <MaterialCommunityIcons name="close" size={30} color="#1f99b0" />
        </TouchableOpacity>
      </View>
    );
  }
  return (
    // 进来显示的规则：  这个layout 是注册所有页面。显示规则是启动先显示“/” 这个路由
    // 命中那个页面就先显示哪个页面
    // <Stack> 这个是路由栈，里面注册了所有的页面，路由跳转的时候会根据路由名称去匹配对应的页面
    // <Stack.Screen> 这个是注册单个页面，name 是路由名称，options 是页面配置
    // <Stack.Screen name="(tabs)" ... /> 注册 tab 容器（行情/浏览器/钱包）
    // <Stack.Screen name="auth/index" ... /> 会员登录 & 注册，模态弹窗，左上角关闭按钮，从底部滑入
    <Stack screenOptions={screenOptions}>
        {/* tab 容器不再使用课程项目的公共导航栏（logo/铃铛/搜索），
            行情/浏览器/钱包各自渲染自己的页内导航 */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* 钱包/行情/浏览器的二级页面：普通 push 推出。
            钱包二级页用原生导航栏（返回箭头 + 居中标题，同「连接钱包」） */}
        <Stack.Screen name="market/[id]" options={{ title: tt('market.detail.title') }} />
        <Stack.Screen name="browser/index" options={{ headerShown: false }} />
        <Stack.Screen name="browser/viewer" options={{ title: tt('browser.title') }} />
        <Stack.Screen name="wallet/create" options={{ title: tt('wallet.create.title') }} />
        <Stack.Screen name="wallet/import" options={{ title: tt('wallet.import.title') }} />
        <Stack.Screen name="wallet/add-account" options={{ title: tt('wallet.addAccount.title') }} />
        <Stack.Screen name="wallet/transactions" options={{ title: tt('wallet.transactions.title') }} />
        <Stack.Screen name="wallet/sign" options={{ title: tt('wallet.sign.title') }} />
        <Stack.Screen name="wallet/export" options={{ title: tt('wallet.export.title') }} />
        <Stack.Screen name="settings/index" options={{ headerShown: false }} />
        <Stack.Screen name="wc/index" options={{ title: tt('wc.connect.title') }} />
        {/* Modal */}
        <Stack.Screen
          name="auth/index"
          options={{
            presentation: 'modal',
            title: tt('auth.signin.title'),
            headerLeft: () => <CloseButton />,
            animation: 'slide_from_bottom',
          }}
        />
        {/* 401 中转页：request.js 里 token 失效自动跳入，清登录态后 replace 回登录页 */}
        <Stack.Screen name="auth/sign-out" options={{ headerShown: false }} />
      </Stack>
  );
}
const styles = StyleSheet.create({
  logo: {
    width: 130,
    height: 30,
  },
  headerButton: {
    padding: 8,
  },
  searchButton: {
    marginRight: 8,
  },
});

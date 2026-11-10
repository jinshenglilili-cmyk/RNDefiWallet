import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { t as tt, useI18nLocale } from '@/i18n';

export default function TabLayout() {
  // 订阅语言：切换语言时 key 变化使 Tabs 重挂载，标题随语言刷新
  const locale = useI18nLocale();
  function MdTabBarIcon(props) {
    return <MaterialCommunityIcons size={26} {...props} />;
  }
  return (
    <Tabs key={locale}
      screenOptions={{
        headerShown: false,
        // Android 取消水波纹效果（展平 style，并去掉 TouchableOpacity 不接受的 ref）
        tabBarButton: (props) => {
          const { ref, ...tabProps } = props;
          return (
            <TouchableOpacity
              {...tabProps}
              activeOpacity={1}
              style={StyleSheet.flatten([tabProps.style, { backgroundColor: 'transparent' }])}
            />
          );
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null, // 仅作根路由重定向到 /market
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: tt('tabs.market'),
          headerShown: false, // 行情用自己的页内导航（对齐参考项目）
          tabBarIcon: ({ color }) => <MdTabBarIcon name="chart-line" color={color} />
        }}
      />
      {/* DeFi 三件套：Swap / LP / 借贷（均在 BSC 链上执行） */}
      <Tabs.Screen
        name="swap"
        options={{
          title: tt('tabs.swap'),
          headerShown: false,
          tabBarIcon: ({ color }) => <MdTabBarIcon name="swap-horizontal" color={color} />,
        }}
      />
      <Tabs.Screen
        name="lp"
        options={{
          title: tt('tabs.lp'),
          headerShown: false,
          tabBarIcon: ({ color }) => <MdTabBarIcon name="layers-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="lend"
        options={{
          title: tt('tabs.lend'),
          headerShown: false,
          tabBarIcon: ({ color }) => <MdTabBarIcon name="bank-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: tt('tabs.wallet'),
          headerShown: false,
          tabBarIcon: ({ color }) => <MdTabBarIcon name="wallet-outline" color={color} />,
        }}
      />
      {/* 浏览器不再是 tab：入口移到钱包 tab 的「常用功能」，页面本身移到根 Stack（/browser）。
          二级页面（详情/创建/导入/转账记录等）在 (tabs) 外的根 Stack，
          从 tab 内跳转是真正的 push，返回不会把 tab 重置回首页 */}
    </Tabs>
  );
}

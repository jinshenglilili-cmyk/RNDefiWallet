import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity } from 'react-native';

export default function TabLayout() {
  function MdTabBarIcon(props) {
    return <MaterialCommunityIcons size={26} {...props} />;
  }
  return (
    <Tabs
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
          title: '行情',
          headerShown: false, // 行情用自己的页内导航（对齐参考项目）
          tabBarIcon: ({ color }) => <MdTabBarIcon name="chart-line" color={color} />
        }}
      />
      <Tabs.Screen
        name="browser"
        options={{
          title: '浏览器',
          headerShown: false,
          tabBarIcon: ({ color }) => <MdTabBarIcon name="web" color={color} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: '钱包',
          headerShown: false,
          tabBarIcon: ({ color }) => <MdTabBarIcon name="wallet-outline" color={color} />,
        }}
      />
      {/* 二级页面（详情/创建/导入/转账记录等）已移到 (tabs) 外的根 Stack，
          从 tab 内跳转是真正的 push，返回不会把 tab 重置回首页 */}
    </Tabs>
  );
}

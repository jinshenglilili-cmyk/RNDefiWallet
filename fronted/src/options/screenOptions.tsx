import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

const screenOptions: NativeStackNavigationOptions = {
  title: '', // 默认标题为空
  headerTitleAlign: 'center', // 安卓标题栏居中
  animation: 'simple_push', // 安卓使用左右切屏
  headerTintColor: '#1f99b0', // 导航栏中文字、按钮、图标的颜色
  // 标题组件的样式
  headerTitleStyle: {
    fontWeight: '400',
    color: '#2A2929',
    fontSize: 16,
  },
  headerBackButtonDisplayMode: 'minimal', // 设置返回按钮只显示箭头，不显示 "Back"
};

export default screenOptions;

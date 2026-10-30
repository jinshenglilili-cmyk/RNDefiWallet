// 全局主题 —— 对齐 swiftNativeWallet（SwiftfulCrypto）的配色体系
// 特点：主文字色 = accent（浅色模式纯黑 / 深色模式粉紫 #FACFFC），
//       卡片背景 = 次级文字色 10% 透明度，涨绿跌红，支持深浅色切换

import { useColorScheme } from 'react-native';

export function useTheme() {
  const dark = useColorScheme() === 'dark';
  return {
    dark,
    /** 页面背景：白 / 黑 */
    background: dark ? '#000000' : '#FFFFFF',
    /** 主文字色（浅色=黑，深色=粉紫） */
    accent: dark ? '#FACFFC' : '#000000',
    /** 次级文字色 */
    secondaryText: dark ? '#C0C0C0' : '#919191',
    /** 涨（>= 0） */
    green: dark ? '#73FA79' : '#008F00',
    /** 跌（< 0） */
    red: dark ? '#FF2F92' : '#941651',
    /** 链接色 */
    link: '#007AFF',
    /** 卡片/输入框背景（次级文字 10%） */
    card: dark ? 'rgba(192,192,192,0.10)' : 'rgba(145,145,145,0.10)',
    /** 浅色条背景（次级文字 6%） */
    bar: dark ? 'rgba(192,192,192,0.06)' : 'rgba(145,145,145,0.06)',
    /** 分隔线 */
    divider: dark ? 'rgba(192,192,192,0.2)' : 'rgba(145,145,145,0.25)',
  };
}

/** 不依赖 Hook 的固定色值（浅色模式，供 StyleSheet.create 使用） */
export const lightColors = {
  background: '#FFFFFF',
  accent: '#000000',
  secondaryText: '#919191',
  green: '#008F00',
  red: '#941651',
  link: '#007AFF',
  card: 'rgba(145,145,145,0.10)',
  bar: 'rgba(145,145,145,0.06)',
  divider: 'rgba(145,145,145,0.25)',
};

/** 涨跌颜色：>= 0 绿，< 0 红 */
export function changeColor(value, theme) {
  return value >= 0 ? theme.green : theme.red;
}

/** 百分比文案：两位小数 + %，正数带 + */
export function formatPercent(value) {
  const num = Number(value ?? 0);
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

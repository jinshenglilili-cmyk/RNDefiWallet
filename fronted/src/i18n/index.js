// 国际化核心：i18n-js 初始化 + 语言切换
//
// 设计：
// - 语言标识本地存储（AsyncStorage），首次启动跟随系统语言（expo-localization）
// - 切换语言 = 更新 storage + i18n.locale + zustand store
// - 组件里订阅 useI18nLocale() 获得当前语言（变更时重渲染）；
//   非组件文件（stores/utils 的报错文案）直接 import { t } 使用
// - 缺 key 时回落中文（defaultLocale），英文翻译不全也不会显示裸 key

import { I18n } from 'i18n-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { create } from 'zustand';

import zh from './locales/zh';
import en from './locales/en';

/** 用户可选语言（设置页展示；label 用各自语言书写，不做翻译） */
export const LANG_CHOICES = [
  { code: 'system', label: '跟随系统（Follow System）' },
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: 'English' },
];

const STORAGE_KEY = 'app.locale.choice'; // 'system' | 'zh' | 'en'

const i18n = new I18n({ zh, en });
i18n.defaultLocale = 'zh';
i18n.enableFallback = true;

/** 选项（'system'）→ 实际语言码；系统语言不在支持列表时兜底中文 */
function resolveLocale(choice) {
  if (choice === 'zh' || choice === 'en') return choice;
  const code = getLocales()?.[0]?.languageCode; // 如 'zh-CN' → 'zh'
  return i18n.translations[code] ? code : 'zh';
}

export const useI18nStore = create((set) => ({
  choice: 'system', // 用户选择：'system' | 'zh' | 'en'
  locale: 'zh', // 实际生效语言：'zh' | 'en'（组件订阅它触发重渲染）
  init: async () => {
    let saved = 'system';
    try {
      saved = (await AsyncStorage.getItem(STORAGE_KEY)) ?? 'system';
    } catch {}
    const locale = resolveLocale(saved);
    i18n.locale = locale;
    set({ choice: saved, locale });
  },
  setChoice: async (choice) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, choice);
    } catch {}
    const locale = resolveLocale(choice);
    i18n.locale = locale;
    set({ choice, locale });
  },
}));

// 模块加载即恢复上次选择（异步，恢复前先用默认中文渲染，恢复后自动重渲染）
useI18nStore.getState().init();

/** 翻译函数（任何地方可用，包括非组件文件） */
export function t(key, params) {
  return i18n.t(key, params);
}

/** 当前实际生效语言（'zh' | 'en'） */
export function currentLocale() {
  return i18n.locale;
}

/** 组件用：订阅语言变更并触发重渲染 */
export function useI18nLocale() {
  return useI18nStore((s) => s.locale);
}

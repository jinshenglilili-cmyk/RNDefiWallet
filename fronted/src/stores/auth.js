// 登录状态 store（zustand 全局状态，取代原来的 AuthContext）
//
// - session（token）持久化在 SecureStore，启动时 init() 恢复
// - userInfo（/users/me 返回的当前用户）也放这里，登录后各页共用
// - 钱包数据按登录账号分开保存的逻辑（switchWalletOwner）在登录/退出时触发

import { Alert } from 'react-native';
import { router } from 'expo-router';
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

import { post, del, get as apiGet } from '@/utils/request';
import * as walletStore from '@/utils/walletStore';

const SESSION_KEY = 'session';

export const useAuthStore = create((set, get) => ({
  /** 登录 token（null = 未登录） */
  session: null,
  /** 启动时等 SecureStore 恢复 session（Splash 页等待这个标记） */
  isLoading: true,
  /** 当前登录用户信息（/users/me），未登录为 null */
  userInfo: null,

  /** 应用启动时恢复 session（stores/auth.js 模块加载时调用一次） */
  init: async () => {
    const session = await SecureStore.getItemAsync(SESSION_KEY);
    set({ session, isLoading: false });
  },

  /** 写/清 token 并同步到全局状态 */
  setSession: async (token) => {
    if (token == null) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } else {
      await SecureStore.setItemAsync(SESSION_KEY, token);
    }
    set({ session: token });
  },

  /**
   * 切换钱包数据归属：优先用登录响应里的 user.id，没有则拉一次 /users/me
   * （失败时跳过，钱包页聚焦时会兜底重试）
   */
  switchOwner: async (uid) => {
    try {
      if (uid != null) {
        await walletStore.switchWalletOwner(uid);
        return;
      }
      const me = await apiGet('/users/me');
      await walletStore.switchWalletOwner(me.data?.user?.id ?? null);
    } catch {}
  },

  /** 登录后拉取当前用户信息，并兜底切换钱包数据归属（幂等） */
  fetchProfile: async () => {
    if (!get().session) {
      set({ userInfo: null });
      return;
    }
    try {
      const data = await apiGet('/users/me');
      set({ userInfo: data.data?.user ?? null });
      if (data.data?.user?.id != null) {
        await walletStore.switchWalletOwner(data.data.user.id).catch(() => {});
      }
    } catch {
      set({ userInfo: null });
    }
  },

  /** 创建/导入钱包后调用：确保新钱包数据立即绑定到当前登录用户（幂等） */
  ensureOwnerBound: async () => {
    if (!get().session) return;
    await get().switchOwner(undefined);
  },

  signIn: async (formParams, setLoading) => {
    try {
      // 登录成功
      const { data } = await post('/auth/sign_in', formParams);
      await get().setSession(data.token);
      // 钱包数据按登录账号分开保存：切到该用户名下的钱包数据
      await get().switchOwner(data.user?.id);
      setLoading(false);
      router.dismiss();
    } catch (err) {
      // 登录失败（后端校验错误带 errors 数组；网络/401 等情况没有，退回 err.message）
      Alert.alert(
        '错误',
        err.errors?.[0] ?? err.message ?? '登录失败，请稍后重试',
        [
          {
            text: 'OK',
            onPress: () => setLoading(false),
          },
        ],
        { cancelable: false },
      );
    }
  },

  signUp: async (formParams, setLoading) => {
    try {
      // 注册成功
      const { data } = await post('/auth/sign_up', formParams);
      await get().setSession(data.token);
      // 钱包数据按登录账号分开保存：切到该用户名下的钱包数据
      await get().switchOwner(data.user?.id);
      Alert.alert('提示', '您已经注册成功。', [
        {
          text: 'OK',
          onPress: () => {
            setLoading(false);
            router.dismiss();
          },
        },
      ]);
    } catch (err) {
      // 注册失败（同 signIn：errors 可能不存在）
      Alert.alert('错误', err.errors?.[0] ?? err.message ?? '注册失败，请稍后重试', [
        {
          text: 'OK',
          onPress: () => setLoading(false),
        },
      ]);
    }
  },

  signOut: async () => {
    // 退出登录：当前钱包数据整体归档到该用户名下（重新登录后恢复）
    await walletStore.switchWalletOwner(null).catch(() => {});
    await get().setSession(null);
    set({ userInfo: null });
  },

  destroyAccount: async () => {
    // 注销账号：先取用户 id，删除该用户归档的钱包数据 + 活跃数据
    try {
      const me = await apiGet('/users/me');
      await walletStore.discardWallet(me.data?.user?.id);
    } catch {}
    await walletStore.deleteWallet().catch(() => {});
    await walletStore.switchWalletOwner(null).catch(() => {});
    await del('/users/me');
    await get().setSession(null);
    set({ userInfo: null });
  },
}));

// 模块加载时恢复一次 session（等价于原来 SessionProvider 里的 useStorageState）
useAuthStore.getState().init();

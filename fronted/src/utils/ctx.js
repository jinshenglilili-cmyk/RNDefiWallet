// 兼容层：登录/用户状态已迁移到 zustand（stores/auth.js）。
// 保留 useSession() 这个旧入口，课程项目里的组件（登录表单、splash 等）
// 不用改调用方式，拿到的就是 auth store 本身。

import { useAuthStore } from '@/stores/auth';

/** 使用这个 Hook 来获取登录状态与用户信息（等价于 useAuthStore()） */
export function useSession() {
  return useAuthStore();
}

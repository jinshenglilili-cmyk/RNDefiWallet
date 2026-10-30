import { Redirect } from 'expo-router';

/** 「发现」模块已下线：根路由 / 直接重定向到行情 tab */
export default function IndexRedirect() {
  return <Redirect href="/market" />;
}

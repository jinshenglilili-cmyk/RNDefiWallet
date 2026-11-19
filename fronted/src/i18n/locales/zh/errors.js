// 跨页面通用错误（HTTP 请求 / 会话过期等）
export default {
  notice: '提示',
  error: '错误',
  // 401（token 过期）落地页提示
  sessionExpired: '登录超时，请重新登录！',
  // 后端未返回具体 message 时的兜底文案
  requestFailed: '请求失败，请稍后重试',
  // 金额解析（utils/format.js）
  amountFormat: '金额格式不对：%{text}',
  amountDecimals: '小数位最多 18 位',
};

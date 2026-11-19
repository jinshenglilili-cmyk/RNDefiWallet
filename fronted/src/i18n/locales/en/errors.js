// Cross-page shared errors (HTTP requests / expired session, etc.)
export default {
  notice: 'Notice',
  error: 'Error',
  // 401 (token expired) landing page
  sessionExpired: 'Your session has expired. Please sign in again!',
  // Fallback when the server returns no specific message
  requestFailed: 'Request failed, please try again later',
  // Amount parsing (utils/format.js)
  amountFormat: 'Invalid amount format: %{text}',
  amountDecimals: 'At most 18 decimal places',
};

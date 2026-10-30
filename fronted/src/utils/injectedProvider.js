// DApp 浏览器注入脚本（EIP-1193 Provider）
//
// 在页面加载前注入，把 window.ethereum.request 的调用转发给 RN 层：
// 页面 -> postMessage -> RN 处理（读链直接代理 / 签名弹审批） -> injectJavaScript 回写结果。
//
// 注意：这个字符串会以模板字面量嵌入 WebView，不能包含反引号。

const CHAIN_ID_HEX = '0x1';

const INJECTED_PROVIDER = `
(function () {
  if (window.__rnWalletInjected) return;
  window.__rnWalletInjected = true;

  var callbacks = {};
  var nextId = 1;
  var chainId = '${CHAIN_ID_HEX}';

  function sendToNative(id, method, params) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'eth-request', id: id, method: method, params: params,
    }));
  }

  var provider = {
    isMetaMask: true,
    chainId: chainId,
    request: function (args) {
      var method = args && args.method;
      var params = args && args.params || [];

      // 本地直接返回的只读方法
      if (method === 'eth_chainId' || method === 'net_version') {
        return Promise.resolve(method === 'net_version' ? '1' : chainId);
      }
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
        return new Promise(function (resolve, reject) {
          var id = nextId++;
          callbacks[id] = { resolve: resolve, reject: reject };
          sendToNative(id, method, params);
        });
      }
      return new Promise(function (resolve, reject) {
        var id = nextId++;
        callbacks[id] = { resolve: resolve, reject: reject };
        sendToNative(id, method, params);
      });
    },
    on: function () {},
    removeListener: function () {},
  };

  // RN 层回写结果入口
  window.__rnWallet = {
    sendResponse: function (id, result) {
      var cb = callbacks[id];
      if (cb) { delete callbacks[id]; cb.resolve(result); }
    },
    sendError: function (id, message) {
      var cb = callbacks[id];
      if (cb) {
        delete callbacks[id];
        var err = new Error(message);
        err.code = 4001;
        cb.reject(err);
      }
    },
    emit: function (event, payload) {
      // 预留：链切换/账号变更事件
    },
  };

  // dApp 兼容：老式 send + provider 常量
  provider.send = function (payload, callback) {
    provider.request({ method: payload.method, params: payload.params })
      .then(function (r) { callback(null, { id: payload.id, result: r }); })
      .catch(function (e) { callback(e, null); });
  };
  Object.defineProperty(provider, 'networkVersion', { value: '1' });

  Object.defineProperty(window, 'ethereum', {
    value: provider,
    writable: false,
    configurable: false,
  });

  // EIP-6963：新版 dApp（如 Uniswap）只通过这个标准发现注入钱包，
  // 不广播的话页面根本找不到我们的 Provider
  var icon =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="20" fill="#247AF3"/><text x="48" y="64" font-size="44" text-anchor="middle" fill="#fff" font-family="Arial" font-weight="bold">W</text></svg>'
    );
  function announceProvider() {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({
          info: {
            uuid: '350670db-19fa-4704-a866-2b8a3b5c1d2e',
            name: '内置钱包',
            icon: icon,
            rdns: 'cn.clwy.defiwallet',
          },
          provider: provider,
        }),
      })
    );
  }
  announceProvider();
  window.addEventListener('eip6963:requestProvider', announceProvider);
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', msg: '6963-announced' }));

  // 通知 RN 页面已就绪
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'provider-ready' }));
})();
true;
`;

export default INJECTED_PROVIDER;

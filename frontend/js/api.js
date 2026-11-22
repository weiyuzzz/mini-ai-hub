/* Mini AI Hub — api.js  XMLHttpRequest 封装（iOS 9 无 fetch） */
(function () {
  'use strict';

  function request(method, path, body, timeout, onOk, onErr) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, path, true);
    xhr.timeout = timeout || 10000;
    if (body != null) {
      xhr.setRequestHeader('Content-Type', 'application/json');
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (e) { /* 非 JSON 响应 */ }
      if (xhr.status >= 200 && xhr.status < 300 && data) {
        onOk(data);
      } else {
        var msg;
        if (xhr.status === 0) {
          msg = '无法连接 Windows 主机（服务未运行或网络断开）';
        } else if (data && data.error) {
          msg = data.error;
        } else {
          msg = '请求失败（HTTP ' + xhr.status + '）';
        }
        if (onErr) onErr(msg);
      }
    };
    try {
      xhr.send(body != null ? JSON.stringify(body) : null);
    } catch (e) {
      if (onErr) onErr('请求发送失败');
    }
  }

  window.HubAPI = {
    get: function (path, onOk, onErr, timeout) {
      request('GET', path, null, timeout, onOk, onErr);
    },
    post: function (path, body, onOk, onErr, timeout) {
      request('POST', path, body, timeout, onOk, onErr);
    }
  };
})();

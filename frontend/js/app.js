/* Mini AI Hub — app.js  启动引导 / 时钟 / 数据轮询 */
(function () {
  'use strict';

  var pollMs = 5000;
  var timer = null;
  var offline = true;   /* 启动时假设离线，首次成功后转绿 */
  var visible = true;

  /* ------------------------------------------------ toast */
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-show');
    }, 2600);
  }

  /* ------------------------------------------------ 顶栏状态胶囊 */
  function setChip(id, cls, text) {
    var chip = document.getElementById(id);
    if (!chip) return;
    chip.className = 'chip ' + cls;
    chip.querySelector('span').textContent = text;
  }

  function renderChips(d) {
    if (!d) {
      setChip('chipPc', 'is-bad', 'Windows 离线');
      setChip('chipAi', 'is-bad', 'AI 未知');
      return;
    }
    var net = d.network || {};
    var pcOk = !!net.local_ip;
    setChip('chipPc', pcOk ? 'is-ok' : 'is-bad',
      pcOk ? 'Windows 在线' : 'Windows 离线');

    var ai = d.ai || {};
    if (ai.configured) setChip('chipAi', 'is-ok', 'AI 就绪');
    else setChip('chipAi', 'is-warn', 'AI 未配置');
  }

  /* ------------------------------------------------ 轮询 */
  function poll() {
    window.HubAPI.get('/api/overview', function (d) {
      if (offline) {
        offline = false;
        toast('已连接 Windows 主机');
      }
      renderChips(d);
      window.HubPages.render(d);
    }, function (err) {
      if (!offline) {
        offline = true;
        toast(err);
      }
      renderChips(null);
      window.HubPages.setOffline(true, err);
    }, 8000);
  }

  function pollNow() {
    poll();
  }

  function schedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (visible) poll();
    }, pollMs);
  }

  function setPollInterval(ms) {
    pollMs = ms;
    schedule();
  }

  /* ------------------------------------------------ 时钟 */
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function tickClock() {
    var d = new Date();
    var time = document.getElementById('clockTime');
    var date = document.getElementById('clockDate');
    if (time) time.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (date) {
      date.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()];
    }
  }

  /* ------------------------------------------------ 初始化 */
  function init() {
    /* iPad 主屏幕模式：状态栏让位 */
    if (navigator.standalone) {
      document.documentElement.className += ' standalone';
    }

    document.addEventListener('visibilitychange', function () {
      visible = !(document.hidden || document.webkitHidden);
      if (visible) poll();
    });

    window.HubNav.init();
    window.HubPages.init();

    tickClock();
    setInterval(tickClock, 1000);

    poll();
    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.HubApp = {
    toast: toast,
    pollNow: pollNow,
    setPollInterval: setPollInterval,
    onPageShow: function (id) {
      if (id === 'settings') window.HubPages.refreshSettings();
    }
  };
})();

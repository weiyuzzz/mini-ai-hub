/* Mini AI Hub — pages.js  五个页面的渲染与交互（纯 ES5） */
(function () {
  'use strict';

  /* ================================================= 工具 */
  function $(id) { return document.getElementById(id); }

  function setText(id, text) {
    var node = $(id);
    if (node) node.textContent = text == null ? '—' : String(text);
  }

  function show(id, on) {
    var node = $(id);
    if (node) {
      if (on) node.classList.remove('hidden');
      else node.classList.add('hidden');
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function trimNum(v, digits) {
    if (v == null || isNaN(v)) return '--';
    if (Math.abs(v) < 10) return v.toFixed(digits);
    return String(Math.round(v));
  }

  function fmtBytes(b) {
    if (b == null || isNaN(b)) return '—';
    var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    var v = b, u = 0;
    while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
    return (u === 0 ? String(Math.round(v)) : trimNum(v, 1)) + ' ' + units[u];
  }

  /* 网速 → [数值, 单位] */
  function rateParts(bps) {
    if (bps == null || isNaN(bps)) return ['--', ''];
    var kb = bps / 1024;
    if (kb < 1024) return [trimNum(kb, 1), 'KB/s'];
    var mb = kb / 1024;
    if (mb < 1024) return [trimNum(mb, 1), 'MB/s'];
    return [trimNum(mb / 1024, 2), 'GB/s'];
  }

  function fmtUptime(sec) {
    if (sec == null || sec < 0) return '—';
    var d = Math.floor(sec / 86400);
    var h = Math.floor((sec % 86400) / 3600);
    var m = Math.floor((sec % 3600) / 60);
    if (d > 0) return d + ' 天 ' + h + ' 小时';
    if (h > 0) return h + ' 小时 ' + m + ' 分';
    return m + ' 分钟';
  }

  function valsOf(list, cap) {
    var out = [];
    if (!list) return out;
    for (var i = 0; i < list.length && i < (cap || 999); i++) {
      out.push(list[i][1]);
    }
    return out;
  }

  function meterSet(id, pct) {
    var bar = $(id);
    if (!bar) return;
    var v = Math.max(0, Math.min(100, pct || 0));
    bar.style.width = v.toFixed(1) + '%';
    bar.className = '';
    if (v >= 90) bar.classList.add('lv-bad');
    else if (v >= 80) bar.classList.add('lv-warn');
  }

  function toast(msg) {
    if (window.HubApp && window.HubApp.toast) window.HubApp.toast(msg);
  }

  /* ================================================= 全局状态 */
  var lastData = null;
  var serverOnline = false;
  var aiStatus = null;

  /* ================================================= AI 快捷指令预设 */
  var PRESETS = {
    explain: '用通俗易懂的方式解释这个概念：\n',
    translate: '将下面的内容翻译成中文（若原文是中文则翻译成英文），保留原格式：\n',
    polish: '润色下面这段文字，使其更专业、流畅，直接给出结果：\n',
    code: '分析下面这段代码，指出问题并给出改进建议：\n',
    summary: '总结下面这份文档的要点，列出关键信息：\n'
  };

  /* ================================================= 简易 Markdown（先转义再渲染，防注入） */
  function mdInline(text) {
    text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    text = text.replace(/(^|\n)#{1,4} /g, '$1');
    text = text.replace(/(^|\n)- /g, '$1• ');
    text = text.replace(/\n/g, '<br>');
    return text;
  }

  function mdLite(raw) {
    var text = esc(raw || '');
    var parts = text.split(/```[a-zA-Z0-9_+-]*\n?/);
    var html = '';
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        html += '<pre><code>' + parts[i].replace(/\n$/, '') + '</code></pre>';
      } else if (parts[i]) {
        html += mdInline(parts[i]);
      }
    }
    return html;
  }

  /* ================================================= GPU 公共渲染 */
  function renderGpu(prefix, gpu) {
    var ok = gpu && gpu.available;
    show(prefix + 'GpuOk', !!ok);
    show(prefix + 'GpuNa', !ok);
    if (!ok) return;
    setText(prefix + 'GpuName', gpu.name || 'GPU');
    var util = (gpu.percent == null) ? null : Math.max(0, Math.min(100, gpu.percent));
    meterSet(prefix + 'GpuBar', util || 0);
    setText(prefix + 'GpuVal', util == null ? '--%' : Math.round(util) + '%');

    if (prefix === 'ov') {
      var parts = [];
      if (gpu.vram_total_mb) {
        parts.push('显存 ' + fmtBytes((gpu.vram_used_mb || 0) * 1024 * 1024) + ' / ' + fmtBytes(gpu.vram_total_mb * 1024 * 1024));
      }
      if (gpu.temp_c != null) parts.push('温度 ' + Math.round(gpu.temp_c) + ' °C');
      setText('ovGpuStat', parts.length ? parts.join('  ·  ') : '—');
    }
  }

  /* ================================================= 页面一：总览 */
  function renderOverview(d) {
    var s = d.system || {};
    var net = d.network || {};
    var hist = d.history || {};
    var netHist = d.net_history || {};

    setText('ovHostNote', (s.host ? (s.host.hostname + ' · ' + s.host.os) : '—'));

    /* CPU */
    var cpu = s.cpu || {};
    var cpuPct = cpu.percent;
    setText('ovCpuVal', cpuPct == null ? '--' : String(Math.round(cpuPct)));
    HubCharts.setRing($('ovCpuRing'), cpuPct);
    var coreInfo = (cpu.logical ? cpu.logical + ' 逻辑核心' : '') + (cpu.freq_mhz ? ' · ' + (cpu.freq_mhz / 1000).toFixed(1) + ' GHz' : '');
    setText('ovCpuSub', coreInfo || '—');
    HubCharts.spark($('ovCpuSpark'), valsOf(hist.cpu, 40));

    /* 内存 */
    var mem = s.memory || {};
    setText('ovMemVal', mem.percent == null ? '--' : String(Math.round(mem.percent)));
    meterSet('ovMemBar', mem.percent);
    setText('ovMemSub', mem.total ? (fmtBytes(mem.used) + ' / ' + fmtBytes(mem.total)) : '— / —');

    /* 网速 */
    var down = rateParts(net.down_bps);
    var up = rateParts(net.up_bps);
    setText('ovDown', down[0]);
    setText('ovDownUnit', down[1] || ' ');
    setText('ovUp', up[0]);
    setText('ovUpUnit', up[1] || ' ');

    /* GPU */
    renderGpu('ov', s.gpu);

    /* AI 提示 */
    if (aiStatus && aiStatus.configured) {
      setText('ovAiHint', '已连接 ' + (aiStatus.model || 'AI 模型'));
    } else {
      setText('ovAiHint', '未配置 AI 服务，到“设置”页填写接口地址');
    }

    /* 流量图 */
    HubCharts.lineChart($('ovChart'), [
      { data: valsOf(netHist.down, 60), area: true },
      { data: valsOf(netHist.up, 60), blue: true, area: true }
    ], 150);
    setText('ovNetNote', net.nic ? (net.nic + (net.down_bps != null ? ' · 实时' : '')) : '等待网络数据');

    /* 主机信息 */
    if (s.host) {
      setText('ovHostName', s.host.hostname || '—');
      var dot = $('ovHostDot');
      if (dot) { dot.className = 'dot dot-ok'; }
      var rows = [];
      rows.push(['系统', s.host.os + ' ' + (s.host.arch || '')]);
      rows.push(['开机时长', fmtUptime(s.host.uptime_sec)]);
      rows.push(['本机 IP', net.local_ip || '—']);
      var html = '';
      for (var i = 0; i < rows.length; i++) {
        html += '<div class="host-row"><span>' + esc(rows[i][0]) + '</span><b>' + esc(rows[i][1]) + '</b></div>';
      }
      $('ovHostRows').innerHTML = html;

      /* 系统盘 */
      var disk = null;
      for (var k = 0; k < (s.disks || []).length; k++) {
        if (!disk || (s.disks[k].mount && s.disks[k].mount.indexOf('C') === 0)) disk = s.disks[k];
      }
      if (disk) {
        $('ovDiskMini').innerHTML =
          '<div class="disk-mini-head"><span>系统盘 ' + esc(disk.mount) + '</span><b>' +
          esc(fmtBytes(disk.used) + ' / ' + fmtBytes(disk.total)) + '</b></div>' +
          '<div class="meter"><i style="width:' + (disk.percent || 0).toFixed(1) + '%"></i></div>';
      } else {
        $('ovDiskMini').innerHTML = '<div class="sub">磁盘信息不可用</div>';
      }
    }
  }

  /* ================================================= 页面二：AI 助手 */
  var aiMsgs = [];
  var aiBusy = false;
  var typingEl = null;
  var CHAT_KEY = 'hub.chat.v1';

  function saveChat() {
    try {
      var data = [];
      var start = Math.max(0, aiMsgs.length - 40);
      for (var i = start; i < aiMsgs.length; i++) data.push(aiMsgs[i]);
      localStorage.setItem(CHAT_KEY, JSON.stringify(data));
    } catch (e) { /* 存储不可用时忽略 */ }
  }

  function restoreChat() {
    try {
      var raw = localStorage.getItem(CHAT_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (Object.prototype.toString.call(data) === '[object Array]') {
        for (var i = 0; i < data.length; i++) {
          var m = data[i];
          if (m && (m.role === 'user' || m.role === 'assistant') && m.content) {
            aiMsgs.push(m);
          }
        }
      }
    } catch (e) { /* 损坏的历史直接丢弃 */ }
  }

  function msgHtml(m) {
    if (m.role === 'user') {
      return '<div class="msg msg-user"><div class="msg-body">' + esc(m.content) + '</div></div>';
    }
    var cls = 'msg msg-ai' + (m.error ? ' msg-err' : '');
    var meta = '';
    if (m.model && !m.error) {
      meta = '<div class="msg-meta">' + esc(m.model) + (m.latency_ms ? ' · ' + m.latency_ms + 'ms' : '') + '</div>';
    }
    return '<div class="' + cls + '"><div class="msg-body">' + mdLite(m.content) + '</div>' + meta + '</div>';
  }

  function refreshEmpty() {
    show('aiEmpty', aiMsgs.length === 0);
  }

  function renderAllMsgs() {
    var list = $('aiMsgList');
    list.innerHTML = '';
    for (var i = 0; i < aiMsgs.length; i++) {
      var wrap = document.createElement('div');
      wrap.innerHTML = msgHtml(aiMsgs[i]);
      list.appendChild(wrap.firstChild);
    }
    refreshEmpty();
  }

  function appendMsg(m) {
    aiMsgs.push(m);
    var list = $('aiMsgList');
    var wrap = document.createElement('div');
    wrap.innerHTML = msgHtml(m);
    list.appendChild(wrap.firstChild);
    refreshEmpty();
    scrollChat();
  }

  function appendTyping() {
    var list = $('aiMsgList');
    typingEl = document.createElement('div');
    typingEl.className = 'msg msg-ai';
    typingEl.innerHTML = '<div class="msg-body"><span class="typing"><i></i><i></i><i></i></span></div>';
    list.appendChild(typingEl);
    scrollChat();
  }

  function removeTyping() {
    if (typingEl && typingEl.parentNode) {
      typingEl.parentNode.removeChild(typingEl);
    }
    typingEl = null;
  }

  function scrollChat() {
    var box = $('aiMsgs');
    if (box) box.scrollTop = box.scrollHeight;
  }

  function historyForApi() {
    var out = [];
    for (var i = 0; i < aiMsgs.length; i++) {
      var m = aiMsgs[i];
      if (!m.error && m.role && m.content) out.push({ role: m.role, content: m.content });
    }
    return out.slice(-20);
  }

  function aiSend(text) {
    text = (text || '').replace(/^\s+|\s+$/g, '');
    if (!text || aiBusy) return;
    if (aiStatus && !aiStatus.configured) {
      toast('请先在“设置”页配置 AI 服务');
      window.HubNav.go('settings');
      return;
    }

    var history = historyForApi();
    appendMsg({ role: 'user', content: text, ts: Date.now() });
    saveChat();

    aiBusy = true;
    sendBtnState();
    appendTyping();

    window.HubAPI.post('/api/chat', { message: text, history: history }, function (res) {
      aiBusy = false;
      removeTyping();
      appendMsg({
        role: 'assistant',
        content: res.reply || '（AI 返回了空回复）',
        model: res.model,
        latency_ms: res.latency_ms,
        ts: Date.now()
      });
      saveChat();
      sendBtnState();
    }, function (err) {
      aiBusy = false;
      removeTyping();
      appendMsg({ role: 'assistant', content: err, error: true, ts: Date.now() });
      saveChat();
      sendBtnState();
    }, 120000);
  }

  function sendBtnState() {
    var btn = $('aiSend');
    if (btn) btn.className = 'btn-icon btn-send' + (aiBusy ? ' is-disabled' : '');
  }

  function newChat() {
    aiMsgs = [];
    saveChat();
    var list = $('aiMsgList');
    while (list.firstChild) list.removeChild(list.firstChild);
    refreshEmpty();
    toast('已开始新对话');
  }

  function updateAiStatus(ai) {
    aiStatus = ai;
    var dot = $('aiDot');
    var name = $('aiModelName');
    if (ai && ai.configured) {
      if (dot) dot.className = 'dot dot-ok';
      setText('aiModelName', ai.model || '已配置');
    } else {
      if (dot) dot.className = 'dot dot-warn';
      setText('aiModelName', '未配置 AI 服务');
    }
    var hint = $('aiEmptyHint');
    if (hint) {
      hint.textContent = (ai && ai.configured)
        ? '在下方输入问题，或点按快捷指令开始'
        : '尚未配置 AI 服务，请先到“设置”页填写接口地址';
    }
  }

  /* 首页快捷输入 → 发送到 AI 页 */
  function aiQuickSend(text) {
    text = (text || '').replace(/^\s+|\s+$/g, '');
    if (!text) return;
    if (aiStatus && !aiStatus.configured) {
      toast('请先在“设置”页配置 AI 服务');
      window.HubNav.go('settings');
      return;
    }
    window.HubNav.go('ai');
    /* 等页面切换完成后再发送 */
    window.setTimeout(function () { aiSend(text); }, 60);
  }

  /* ================================================= 页面三：电脑监控 */
  var coreBars = [];
  var coreCount = -1;

  function buildCores(count) {
    if (count === coreCount) return;
    coreCount = count;
    coreBars = [];
    var host = $('sysCores');
    host.innerHTML = '';
    var shown = Math.min(count || 0, 12);
    for (var i = 0; i < shown; i++) {
      var row = document.createElement('div');
      row.className = 'core';
      var label = document.createElement('span');
      label.className = 'core-label';
      label.textContent = 'C' + i;
      var bar = document.createElement('div');
      bar.className = 'core-bar';
      var fill = document.createElement('i');
      bar.appendChild(fill);
      row.appendChild(label);
      row.appendChild(bar);
      host.appendChild(row);
      coreBars.push(fill);
    }
  }

  function renderSystem(d) {
    var s = d.system || {};
    var hist = d.history || {};

    setText('sysUptimeNote', s.host ? ('已运行 ' + fmtUptime(s.host.uptime_sec)) : '—');

    /* CPU */
    var cpu = s.cpu || {};
    setText('sysCpuVal', cpu.percent == null ? '--' : String(Math.round(cpu.percent)));
    HubCharts.setRing($('sysCpuRing'), cpu.percent);
    buildCores(cpu.logical || 0);
    for (var i = 0; i < coreBars.length; i++) {
      var v = (cpu.per_core && cpu.per_core[i] != null) ? cpu.per_core[i] : 0;
      coreBars[i].style.width = Math.max(2, Math.min(100, v)).toFixed(0) + '%';
      coreBars[i].className = '';
      if (v >= 90) coreBars[i].classList.add('lv-bad');
      else if (v >= 80) coreBars[i].classList.add('lv-warn');
    }
    var brandText = cpu.brand || '—';
    if (brandText.length > 46) brandText = brandText.slice(0, 44) + '…';
    if (cpu.freq_mhz && brandText.indexOf('GHz') < 0) {
      brandText += ' · ' + (cpu.freq_mhz / 1000).toFixed(1) + ' GHz';
    }
    setText('sysCpuBrand', brandText);

    /* 内存 */
    var mem = s.memory || {};
    setText('sysMemVal', mem.percent == null ? '--' : String(Math.round(mem.percent)));
    meterSet('sysMemBar', mem.percent);
    setText('sysMemSub', mem.total ? (fmtBytes(mem.used) + ' / ' + fmtBytes(mem.total)) : '— / —');
    if (mem.swap_total) {
      setText('sysSwap', '虚拟内存 ' + fmtBytes(mem.swap_used) + ' / ' + fmtBytes(mem.swap_total) +
        '（' + Math.round(mem.swap_percent || 0) + '%）');
    } else {
      setText('sysSwap', '虚拟内存未启用');
    }

    /* GPU */
    renderGpu('sys', s.gpu);
    if (s.gpu && s.gpu.available && s.gpu.vram_total_mb) {
      var vp = ((s.gpu.vram_used_mb || 0) / s.gpu.vram_total_mb) * 100;
      meterSet('sysVramBar', vp);
      setText('sysVramVal', Math.round(vp) + '%');
    } else {
      meterSet('sysVramBar', 0);
      setText('sysVramVal', '—');
    }

    /* 磁盘 */
    var disks = s.disks || [];
    setText('sysDiskNote', disks.length ? (disks.length + ' 个分区') : '—');
    var dhtml = '';
    for (var k = 0; k < disks.length; k++) {
      var dk = disks[k];
      dhtml += '<div class="disk-row">' +
        '<div class="disk-line1"><span class="disk-mount">' + esc(dk.mount) +
        '</span><span class="disk-detail">' + esc(fmtBytes(dk.used) + ' / ' + fmtBytes(dk.total) + ' · ' + Math.round(dk.percent) + '%') +
        '</span></div>' +
        '<div class="meter"><i style="width:' + (dk.percent || 0).toFixed(1) + '%"></i></div>' +
        '</div>';
    }
    $('sysDiskList').innerHTML = dhtml || '<div class="sub">磁盘信息不可用</div>';

    /* 进程 */
    var procs = s.processes || [];
    var phtml = '';
    if (!procs.length) {
      phtml = '<tr><td colspan="3" class="proc-empty">采样中，下一轮更新…</td></tr>';
    } else {
      for (var p = 0; p < procs.length; p++) {
        var pr = procs[p];
        phtml += '<tr><td class="proc-name">' + esc(pr.name) + '</td>' +
          '<td class="r">' + Math.round(pr.cpu) + '%</td>' +
          '<td class="r">' + Math.round(pr.mem) + '%</td></tr>';
      }
    }
    $('sysProcBody').innerHTML = phtml;

    /* 历史曲线 */
    HubCharts.lineChart($('sysChart'), [
      { data: valsOf(hist.cpu, 120), area: true },
      { data: valsOf(hist.mem, 120), blue: true, area: true }
    ], 150);

    /* 温度（真实值才显示） */
    var temps = s.temps || {};
    var thtml = '';
    thtml += chipHtml('CPU 温度', temps.cpu != null ? Math.round(temps.cpu) + ' °C' : '不可用', temps.cpu != null);
    thtml += chipHtml('GPU 温度', temps.gpu != null ? Math.round(temps.gpu) + ' °C' : '不可用', temps.gpu != null);
    $('sysTemps').innerHTML = thtml;
  }

  function chipHtml(label, val, ok) {
    return '<span class="chip' + (ok ? ' is-ok' : '') + '"><i class="chip-dot"></i><span>' +
      esc(label) + '<b>' + esc(val) + '</b></span></span>';
  }

  /* ================================================= 页面四：网络监控 */
  function renderNetwork(d) {
    var net = d.network || {};
    var hist = d.net_history || {};

    setText('netNote', net.local_ip ? ('默认路由 · ' + net.nic) : '等待网络数据');

    setText('netNic', net.nic || '不可用');
    setText('netIp', net.local_ip || '—');
    setText('netGw', net.gateway || '—');
    setText('netMac', net.mac ? String(net.mac).toUpperCase() : '—');
    var link = '—';
    if (net.link_mbps) {
      link = (net.link_mbps >= 1000 ? (net.link_mbps / 1000) + ' Gbps' : net.link_mbps + ' Mbps');
    }
    if (net.isup === false) link += ' · 已断开';
    else if (net.isup) link += ' · 已连接';
    setText('netLink', link);

    /* 延迟 */
    setText('netLatVal', net.latency_ms == null ? '--' : String(Math.round(net.latency_ms)));
    setText('netLatSub', net.latency_ms == null
      ? '无法 ping 网关（可能被防火墙拦截）'
      : '网关 ' + (net.gateway || '—') + ' · ping 实测');

    /* 互联网探测 */
    var internet = net.internet || {};
    var inetEl = $('netInternet');
    if (internet.ok) {
      inetEl.className = 'net-internet is-ok';
      var ims = (internet.ms != null && internet.ms < 1) ? '<1' : Math.round(internet.ms);
      setText('netInternetText', '互联网连接正常 · ' + ims + ' ms（' + (internet.target || '') + '）');
    } else {
      inetEl.className = 'net-internet is-bad';
      setText('netInternetText', '互联网连接异常（探测 ' + (internet.target || '—') + ' 超时）');
    }

    /* 流量图与累计 */
    HubCharts.lineChart($('netChart'), [
      { data: valsOf(hist.down, 120), area: true },
      { data: valsOf(hist.up, 120), blue: true, area: true }
    ], 170);
    setText('netRecvTotal', fmtBytes(net.total_recv));
    setText('netSentTotal', fmtBytes(net.total_sent));

    /* 适配器列表 */
    var adapters = net.adapters || [];
    var ahtml = '';
    for (var i = 0; i < adapters.length; i++) {
      var a = adapters[i];
      var speed = a.link_mbps ? (a.link_mbps >= 1000 ? (a.link_mbps / 1000) + ' Gbps' : a.link_mbps + ' Mbps') : '—';
      ahtml += '<div class="adapter-row"><span><i class="dot ' + (a.isup ? 'dot-ok' : '') + '"></i>' +
        esc(a.nic) + '</span><b>' + esc((a.ip || '—') + ' · ' + speed) + '</b></div>';
    }
    $('netAdapterList').innerHTML = ahtml || '<div class="sub">未发现启用的 IPv4 网卡</div>';
  }

  /* ================================================= 页面五：设置 */
  var segMs = 5000;

  function refreshSettings() {
    window.HubAPI.get('/api/settings', function (res) {
      var ai = res.ai || {};
      $('setBase').value = ai.base_url || '';
      $('setModel').value = ai.model || '';
      $('setKey').value = '';
      var hint = $('setKeyHint');
      if (ai.has_api_key) {
        hint.textContent = '已保存 ' + (ai.key_hint || '••••');
      } else {
        hint.textContent = '未设置（本地服务如 LM Studio / Ollama 可不填）';
      }
      var srv = res.server || {};
      setText('setSrvState', serverOnline ? '运行中' : '已断开');
      setText('setSrvVersion', 'v' + (srv.version || '—'));
      setText('setSrvPort', srv.port ? '0.0.0.0:' + srv.port : '—');
      setText('setSrvUptime', fmtUptime(srv.uptime_sec));
      setText('setSrvLan', (srv.lan_urls && srv.lan_urls.length) ? srv.lan_urls.join('　') : '—');
    }, function (err) {
      setText('setSrvState', '已断开');
      toast(err);
    });
  }

  function statusLine(cls, text) {
    var el = $('setTestStatus');
    el.className = 'form-status' + (cls ? ' is-' + cls : '');
    el.textContent = text;
  }

  function saveSettings() {
    var payload = {
      ai: {
        base_url: $('setBase').value,
        model: $('setModel').value,
        api_key: $('setKey').value
      }
    };
    window.HubAPI.post('/api/settings', payload, function (res) {
      aiStatus = res.ai || aiStatus;
      updateAiStatus(aiStatus);
      statusLine('ok', '已保存。AI 服务状态将在下一轮刷新后更新。');
      var hint = $('setKeyHint');
      if (aiStatus.has_api_key) hint.textContent = '已保存 ' + (aiStatus.key_hint || '••••');
      toast('配置已保存');
    }, function (err) {
      statusLine('err', err);
    });
  }

  function testSettings() {
    statusLine('busy', '正在测试连接，请稍候…');
    var payload = {
      ai: {
        base_url: $('setBase').value,
        model: $('setModel').value,
        api_key: $('setKey').value
      }
    };
    window.HubAPI.post('/api/settings/test', payload, function (res) {
      statusLine('ok', '连接成功 · ' + (res.model || '') + ' · 延迟 ' + res.latency_ms + ' ms · 回复“' + (res.sample || '') + '”');
    }, function (err) {
      statusLine('err', err);
    }, 45000);
  }

  function initRefreshSeg() {
    try {
      var saved = localStorage.getItem('hub.poll');
      if (saved === '3000' || saved === '5000' || saved === '10000') segMs = parseInt(saved, 10);
    } catch (e) { /* ignore */ }
    paintSeg();
    var btns = $('setRefresh').querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        segMs = parseInt(this.getAttribute('data-v'), 10);
        paintSeg();
        try { localStorage.setItem('hub.poll', String(segMs)); } catch (e) { /* ignore */ }
        if (window.HubApp && window.HubApp.setPollInterval) window.HubApp.setPollInterval(segMs);
        toast('刷新频率已设为 ' + (segMs / 1000) + ' 秒');
      });
    }
  }

  function paintSeg() {
    var btns = $('setRefresh').querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      if (parseInt(btns[i].getAttribute('data-v'), 10) === segMs) btns[i].classList.add('is-on');
      else btns[i].classList.remove('is-on');
    }
  }

  /* ================================================= 离线状态 */
  function setOffline(off, msg) {
    serverOnline = !off;
    show('ovBanner', off);
    if (off && msg) setText('ovBannerText', msg);
    var dot = $('ovHostDot');
    if (off && dot) dot.className = 'dot dot-bad';
    var linkDot = $('linkDot');
    if (linkDot) linkDot.className = 'dot ' + (off ? 'dot-bad' : 'dot-ok');
  }

  /* ================================================= 渲染入口 */
  function renderAll(d) {
    lastData = d;
    setOffline(false);
    updateAiStatus(d.ai);
    renderOverview(d);
    renderSystem(d);
    renderNetwork(d);
  }

  /* ================================================= 事件绑定 */
  function bindEvents() {
    /* 首页快捷输入 */
    $('ovQuickSend').addEventListener('click', function () {
      aiQuickSend($('ovQuickInput').value);
    });
    $('ovQuickInput').addEventListener('keydown', function (e) {
      if (e.keyCode === 13) {
        e.preventDefault();
        aiQuickSend(this.value);
      }
    });
    var quickChips = $('ovQuickChips').querySelectorAll('.chip-btn');
    for (var i = 0; i < quickChips.length; i++) {
      quickChips[i].addEventListener('click', function () {
        var input = $('ovQuickInput');
        input.value = PRESETS[this.getAttribute('data-p')] || '';
        input.focus();
      });
    }

    /* AI 页 */
    var aiChips = $('aiQuick').querySelectorAll('.chip-btn');
    for (var j = 0; j < aiChips.length; j++) {
      aiChips[j].addEventListener('click', function () {
        var input = $('aiInput');
        input.value = PRESETS[this.getAttribute('data-p')] || '';
        input.focus();
        autoGrow();
      });
    }
    $('aiSend').addEventListener('click', function () {
      var input = $('aiInput');
      var v = input.value;
      input.value = '';
      autoGrow();
      aiSend(v);
    });
    $('aiInput').addEventListener('keydown', function (e) {
      if (e.keyCode === 13 && !e.shiftKey) {
        e.preventDefault();
        var v = this.value;
        this.value = '';
        autoGrow();
        aiSend(v);
      }
    });
    $('aiInput').addEventListener('input', autoGrow);
    $('aiNewChat').addEventListener('click', newChat);

    /* 设置页 */
    $('setSave').addEventListener('click', saveSettings);
    $('setTest').addEventListener('click', testSettings);
    initRefreshSeg();

    /* 离线横幅重试 */
    $('ovRetry').addEventListener('click', function () {
      if (window.HubApp && window.HubApp.pollNow) window.HubApp.pollNow();
    });
  }

  function autoGrow() {
    var input = $('aiInput');
    input.style.height = 'auto';
    var h = Math.min(96, Math.max(46, input.scrollHeight));
    input.style.height = h + 'px';
    input.style.overflowY = (h >= 96) ? 'auto' : 'hidden';
  }

  /* ================================================= 初始化 */
  function init() {
    bindEvents();
    restoreChat();
    renderAllMsgs();
    sendBtnState();
    updateAiStatus(null);
  }

  window.HubPages = {
    init: init,
    render: renderAll,
    setOffline: setOffline,
    aiQuickSend: aiQuickSend,
    refreshSettings: refreshSettings
  };
})();

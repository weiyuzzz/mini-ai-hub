/* Mini AI Hub — charts.js  SVG 环形仪表 / 迷你趋势 / 折线图（纯 ES5） */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (var key in attrs) {
        if (attrs.hasOwnProperty(key)) node.setAttribute(key, attrs[key]);
      }
    }
    return node;
  }

  /* 环形仪表：按百分比设置 stroke-dasharray */
  function setRing(circle, pct) {
    if (!circle) return;
    var r = parseFloat(circle.getAttribute('r'));
    var c = 2 * Math.PI * r;
    var v = Math.max(0, Math.min(100, pct || 0));
    circle.setAttribute('stroke-dasharray', (c * v / 100).toFixed(1) + ' ' + c.toFixed(1));
  }

  /* 迷你趋势线：polyline points，0-100 量程 */
  function spark(polyline, data, w, h) {
    if (!polyline) return;
    w = w || 120;
    h = h || 32;
    if (!data || data.length < 2) {
      polyline.setAttribute('points', '');
      return;
    }
    var n = data.length;
    var step = w / (n - 1);
    var pts = [];
    for (var i = 0; i < n; i++) {
      var v = Math.max(0, Math.min(100, data[i] || 0));
      var y = h - 2 - (v / 100) * (h - 4);
      pts.push((i * step).toFixed(1) + ',' + y.toFixed(1));
    }
    polyline.setAttribute('points', pts.join(' '));
  }

  /* 取“好看的”纵轴上限：1/2/5 × 10^k */
  function niceMax(rawMax) {
    if (!rawMax || rawMax <= 0) return 1;
    var exp = Math.floor(Math.log(rawMax) / Math.log(10));
    var base = Math.pow(10, exp);
    var scaled = rawMax / base;
    var nice;
    if (scaled <= 1) nice = 1;
    else if (scaled <= 2) nice = 2;
    else if (scaled <= 5) nice = 5;
    else nice = 10;
    return nice * base;
  }

  /* 主折线图：series = [{ data:[数值], blue:bool, area:bool }]
     viewBox 600×h，均匀时间间隔；值自动取整到 niceMax */
  function lineChart(svg, series, h, minPoints) {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var w = 600;
    h = h || 150;
    var top = 6;
    var bottom = h - 6;

    // 纵轴上限
    var rawMax = 0;
    for (var si = 0; si < series.length; si++) {
      var d = series[si].data || [];
      for (var i = 0; i < d.length; i++) {
        if (d[i] > rawMax) rawMax = d[i];
      }
    }
    var maxV = niceMax(rawMax * 1.05);
    var span = bottom - top;

    // 网格线（4 条）
    for (var g = 0; g < 4; g++) {
      var gy = top + (span * g / 3);
      svg.appendChild(el('line', {
        'class': 'chart-grid',
        x1: 0, x2: w, y1: gy.toFixed(1), y2: gy.toFixed(1)
      }));
    }

    var hasAny = false;
    for (var k = 0; k < series.length; k++) {
      var data = series[k].data || [];
      var n = data.length;
      if (n < 2) continue;
      hasAny = true;
      var pts = [];
      for (var j = 0; j < n; j++) {
        var val = Math.max(0, data[j]);
        var y = bottom - Math.min(1, val / maxV) * span;
        pts.push((j * w / (n - 1)).toFixed(1) + ',' + y.toFixed(1));
      }
      if (series[k].area !== false) {
        svg.appendChild(el('path', {
          'class': 'chart-area' + (series[k].blue ? ' is-blue' : ''),
          d: 'M' + pts.join(' L') + ' L' + w + ',' + bottom + ' L0,' + bottom + ' Z'
        }));
      }
      svg.appendChild(el('path', {
        'class': 'chart-line' + (series[k].blue ? ' is-blue' : ''),
        d: 'M' + pts.join(' L')
      }));
    }

    // 无数据时给出“暂无数据”占位线
    if (!hasAny) {
      svg.appendChild(el('line', {
        'class': 'chart-grid',
        x1: 0, x2: w, y1: bottom, y2: bottom
      }));
    }
    svg.setAttribute('data-max', String(maxV));
    return maxV;
  }

  window.HubCharts = {
    setRing: setRing,
    spark: spark,
    lineChart: lineChart,
    el: el
  };
})();

/* Mini AI Hub — navigation.js  页面切换（hash 路由，iOS 9 可用） */
(function () {
  'use strict';

  var PAGES = [
    { id: 'overview', title: '总览', tag: 'Overview' },
    { id: 'ai', title: 'AI 助手', tag: 'Assistant' },
    { id: 'system', title: '电脑监控', tag: 'System' },
    { id: 'network', title: '网络监控', tag: 'Network' },
    { id: 'settings', title: '设置', tag: 'Settings' }
  ];

  var byId = {};
  for (var i = 0; i < PAGES.length; i++) byId[PAGES[i].id] = PAGES[i];

  var current = null;

  function toggleClass(node, cls, on) {
    if (on) node.classList.add(cls);
    else node.classList.remove(cls);
  }

  function go(id, silent) {
    if (!byId[id]) id = 'overview';
    if (id === current) return;
    current = id;

    var sections = document.querySelectorAll('.page');
    for (var i = 0; i < sections.length; i++) {
      toggleClass(sections[i], 'is-active', sections[i].id === 'page-' + id);
    }

    var navs = document.querySelectorAll('[data-page]');
    for (var j = 0; j < navs.length; j++) {
      toggleClass(navs[j], 'is-active', navs[j].getAttribute('data-page') === id);
    }

    document.getElementById('pageTitle').textContent = byId[id].title;
    document.getElementById('pageTag').textContent = byId[id].tag;

    var content = document.getElementById('content');
    if (content) content.scrollTop = 0;

    if (!silent && location.hash !== '#' + id) {
      location.hash = id;
    }

    if (window.HubApp && window.HubApp.onPageShow) {
      window.HubApp.onPageShow(id);
    }
  }

  function init() {
    var navs = document.querySelectorAll('[data-page]');
    for (var i = 0; i < navs.length; i++) {
      navs[i].addEventListener('click', function (e) {
        e.preventDefault();
        go(this.getAttribute('data-page'));
      });
    }
    window.addEventListener('hashchange', function () {
      var id = (location.hash || '#overview').slice(1);
      go(id, true);
    });
    var initial = (location.hash || '#overview').slice(1);
    go(byId[initial] ? initial : 'overview', true);
  }

  window.HubNav = {
    init: init,
    go: go,
    currentId: function () { return current; }
  };
})();

# -*- coding: utf-8 -*-
"""Mini AI Hub — 网络监控采集。

默认网卡、本地 IP、网关、链路速率、上下行速度、网关延迟与互联网连通性。
速度 = 计数器差值 / 时间差；延迟 = 真实 ping 网关；无数据时保持 None。
"""

import re
import socket
import subprocess
import threading
import time
from collections import deque

import psutil

try:
    _CREATE_NO_WINDOW = subprocess.CREATE_NO_WINDOW
except AttributeError:
    _CREATE_NO_WINDOW = 0

_GATE_ROW = re.compile(
    r'0\.0\.0\.0\s+0\.0\.0\.0\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\d{1,3}(?:\.\d{1,3}){3})')
_PING_TIME = re.compile(r'(?:time|时间)[=<](\d+)ms', re.IGNORECASE)

PROBE_HOST = ('223.5.5.5', 443)  # 公共 DNS 的 TCP 探测，仅用于连通性判断


def _now():
    return time.time()


class NetworkMonitor(object):

    def __init__(self, sample_interval=3):
        self.interval = max(2, int(sample_interval))
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None

        self.snapshot = {}
        self.down_history = deque(maxlen=120)
        self.up_history = deque(maxlen=120)
        self.latency_history = deque(maxlen=120)

        self._last_counters = None
        self._last_ts = None
        self._nic_cache = None
        self._nic_tick = 0
        self._gw_cache = None
        self._gw_ts = 0.0

    # ------------------------------------------------------------------ 生命周期
    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name='netmon')
        self._thread.daemon = True
        self._thread.start()

    def stop(self):
        self._stop.set()

    def _loop(self):
        while not self._stop.is_set():
            try:
                self._sample()
            except Exception as exc:
                print('[netmon] 采样异常: %r' % exc)
            self._stop.wait(self.interval)

    # ------------------------------------------------------------------ 采样
    def _sample(self):
        ts = _now()
        counters = psutil.net_io_counters(pernic=True)

        down_bps = up_bps = None
        if self._last_counters is not None and self._last_ts:
            dt = ts - self._last_ts
            if dt > 0.2:
                sent_delta = recv_delta = 0
                for nic, c in counters.items():
                    prev = self._last_counters.get(nic)
                    if prev is None:
                        continue
                    recv_delta += max(0, c.bytes_recv - prev.bytes_recv)
                    sent_delta += max(0, c.bytes_sent - prev.bytes_sent)
                down_bps = recv_delta / dt
                up_bps = sent_delta / dt
        self._last_counters = counters
        self._last_ts = ts

        nic = self._nic_info()
        gw = self._gateway(nic.get('local_ip') if nic else None)
        latency_ms = self._ping(gw) if gw else None
        internet_ms = self._probe_internet()

        total = psutil.net_io_counters()
        snap = {
            'ts': ts,
            'nic': (nic or {}).get('nic'),
            'local_ip': (nic or {}).get('local_ip'),
            'mac': (nic or {}).get('mac'),
            'link_mbps': (nic or {}).get('link_mbps'),
            'isup': (nic or {}).get('isup'),
            'adapters': self._adapters(),
            'gateway': gw,
            'down_bps': down_bps,
            'up_bps': up_bps,
            'total_recv': total.bytes_recv,
            'total_sent': total.bytes_sent,
            'latency_ms': latency_ms,
            'internet': {
                'ok': internet_ms is not None,
                'ms': internet_ms,
                'target': '%s:%d' % PROBE_HOST,
            },
        }

        with self._lock:
            self.snapshot = snap
            if down_bps is not None:
                self.down_history.append((ts, down_bps))
            if up_bps is not None:
                self.up_history.append((ts, up_bps))
            if latency_ms is not None:
                self.latency_history.append((ts, latency_ms))

    def _nic_info(self):
        """识别默认路由所在网卡：本地 IP → 匹配网卡名。结果缓存 5 个周期。"""
        self._nic_tick += 1
        if self._nic_cache and self._nic_tick % 5 != 1:
            return self._nic_cache
        info = None
        local_ip = self._local_ip()
        if local_ip:
            try:
                addrs = psutil.net_if_addrs()
                stats = psutil.net_if_stats()
                for name, items in addrs.items():
                    for a in items:
                        if a.family == socket.AF_INET and a.address == local_ip:
                            st = stats.get(name)
                            info = {
                                'nic': name,
                                'local_ip': local_ip,
                                'mac': self._mac(items),
                                'link_mbps': st.speed if st and st.speed > 0 else None,
                                'isup': bool(st.isup) if st else None,
                            }
                            break
                    if info:
                        break
            except Exception:
                pass
        if info:
            self._nic_cache = info
        return info or self._nic_cache

    def _adapters(self):
        """所有启用 IPv4 的物理/虚拟网卡概览（VPN 接管默认路由时用户可对照查看）。"""
        out = []
        try:
            addrs = psutil.net_if_addrs()
            stats = psutil.net_if_stats()
            for name, items in addrs.items():
                ip = None
                mac = None
                for a in items:
                    if a.family == socket.AF_INET and not (a.address or '').startswith('127.'):
                        ip = a.address
                    fam = getattr(a, 'family', None)
                    if fam is not None and 'AF_LINK' in str(fam):
                        mac = a.address
                if not ip:
                    continue
                st = stats.get(name)
                out.append({
                    'nic': name,
                    'ip': ip,
                    'mac': mac,
                    'link_mbps': st.speed if st and st.speed > 0 else None,
                    'isup': bool(st.isup) if st else None,
                })
        except Exception:
            pass
        return out[:8]

    @staticmethod
    def _local_ip():
        """UDP connect 不会发包，仅让系统选路，返回默认路由使用的本地 IP。"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                s.settimeout(1.0)
                s.connect(PROBE_HOST)
                return s.getsockname()[0]
            finally:
                s.close()
        except Exception:
            try:
                return socket.gethostbyname(socket.gethostname())
            except Exception:
                return None

    @staticmethod
    def _mac(items):
        for a in items:
            fam = getattr(a, 'family', None)
            if fam is not None and 'AF_LINK' in str(fam):
                return a.address
        return None

    def _gateway(self, local_ip):
        """从 `route print -4` 的 0.0.0.0 路由行里取网关（行内容与系统语言无关）。"""
        now = _now()
        if self._gw_cache and now - self._gw_ts < 60:
            return self._gw_cache
        try:
            raw = subprocess.check_output(['route', 'print', '-4'], timeout=5,
                                          creationflags=_CREATE_NO_WINDOW)
            text = raw.decode('gbk', 'replace')
            fallback = None
            for m in _GATE_ROW.finditer(text):
                gw, iface = m.group(1), m.group(2)
                if local_ip and iface == local_ip:
                    self._gw_cache, self._gw_ts = gw, now
                    return gw
                if fallback is None and gw != iface:
                    fallback = gw
            if fallback:
                self._gw_cache, self._gw_ts = fallback, now
                return fallback
        except Exception:
            pass
        return self._gw_cache

    @staticmethod
    def _ping(host):
        try:
            raw = subprocess.check_output(
                ['ping', '-n', '1', '-w', '1200', host],
                timeout=3, creationflags=_CREATE_NO_WINDOW)
            m = _PING_TIME.search(raw.decode('gbk', 'replace'))
            if m:
                return float(m.group(1))
        except Exception:
            pass
        return None

    @staticmethod
    def _probe_internet():
        """TCP 握手耗时衡量互联网连通性；失败返回 None。"""
        try:
            start = _now()
            s = socket.create_connection(PROBE_HOST, timeout=2)
            ms = (_now() - start) * 1000.0
            s.close()
            return round(ms, 1)
        except Exception:
            return None

    # ------------------------------------------------------------------ 对外读取
    def get(self):
        with self._lock:
            return dict(self.snapshot), {
                'down': list(self.down_history),
                'up': list(self.up_history),
                'latency': list(self.latency_history),
            }

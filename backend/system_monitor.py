# -*- coding: utf-8 -*-
"""Mini AI Hub — 系统监控采集。

后台线程按固定间隔采样 CPU / 内存 / 磁盘 / GPU / 进程 / 开机时长，
所有数据均为真实采集值；拿不到的指标保持 None，由前端显示为“不可用”。
"""

import platform
import subprocess
import threading
import time
from collections import deque

import psutil

try:
    import winreg
except ImportError:
    winreg = None

try:  # Windows 下隐藏子进程窗口
    _CREATE_NO_WINDOW = subprocess.CREATE_NO_WINDOW
except AttributeError:
    _CREATE_NO_WINDOW = 0


def _now():
    return time.time()


class SystemMonitor(object):
    """轮询采样 Windows 主机的系统指标，维护快照与历史序列。"""

    def __init__(self, sample_interval=3):
        self.interval = max(2, int(sample_interval))
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None

        self.snapshot = {}
        self.cpu_history = deque(maxlen=120)
        self.mem_history = deque(maxlen=120)

        self._disk_cache = []
        self._disk_tick = 0
        self._gpu_state = None        # 最近一次成功的 GPU 信息
        self._gpu_fail = 0
        self._gpu_next_try = 0.0
        self._proc_warm = []          # 进程 cpu_percent 需要两次采样才有值

        # 预热 cpu_percent（首次调用返回 0）
        psutil.cpu_percent(interval=None)
        psutil.cpu_percent(percpu=True)

    # ------------------------------------------------------------------ 生命周期
    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name='sysmon')
        self._thread.daemon = True
        self._thread.start()

    def stop(self):
        self._stop.set()

    def _loop(self):
        while not self._stop.is_set():
            try:
                self._sample()
            except Exception as exc:
                print('[sysmon] 采样异常: %r' % exc)
            self._stop.wait(self.interval)

    @staticmethod
    def _cpu_brand():
        """Windows 注册表里的友好 CPU 名称，清理为 "Intel Core i5-9300H @ 2.40GHz" 样式。"""
        if winreg is not None:
            try:
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                    r'HARDWARE\DESCRIPTION\System\CentralProcessor\0') as key:
                    name, _ = winreg.QueryValueEx(key, 'ProcessorNameString')
                    import re
                    name = re.sub(r'\((R|TM)\)', '', name or '')
                    name = name.replace(' CPU', '').strip()
                    name = re.sub(r'\s{2,}', ' ', name)
                    if name:
                        return name
            except Exception:
                pass
        return (platform.processor() or '').strip() or None

    # ------------------------------------------------------------------ 采样
    def _sample(self):
        ts = _now()
        boot_ts = psutil.boot_time()

        cpu_percent = psutil.cpu_percent(interval=None)
        per_core = psutil.cpu_percent(percpu=True)
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()

        freq_mhz = None
        try:
            freq = psutil.cpu_freq()
            if freq and freq.current:
                freq_mhz = round(freq.current)
        except Exception:
            pass

        processes = self._top_processes()
        disks = self._disks()
        gpu = self._query_gpu()

        # CPU 温度：Windows + psutil 通常拿不到，只有在拿到真实值时才输出
        cpu_temp = None
        try:
            temps = psutil.sensors_temperatures() or {}
            for name in ('coretemp', 'k10temp', 'cpu_thermal', 'acpitz'):
                if name in temps and temps[name]:
                    cpu_temp = temps[name][0].current
                    break
        except Exception:
            pass

        snap = {
            'ts': ts,
            'online': True,
            'host': {
                'hostname': platform.node() or 'Windows PC',
                'os': '%s %s' % (platform.system(), platform.release()),
                'arch': platform.machine(),
                'uptime_sec': int(ts - boot_ts) if boot_ts else None,
            },
            'cpu': {
                'percent': round(cpu_percent, 1),
                'per_core': [round(x, 1) for x in per_core],
                'physical': psutil.cpu_count(logical=False) or psutil.cpu_count(),
                'logical': psutil.cpu_count(logical=True),
                'freq_mhz': freq_mhz,
                'brand': self._cpu_brand(),
            },
            'memory': {
                'total': mem.total,
                'used': mem.total - mem.available,
                'available': mem.available,
                'percent': round(mem.percent, 1),
                'swap_total': swap.total,
                'swap_used': swap.used,
                'swap_percent': round(swap.percent, 1) if swap.total else None,
            },
            'gpu': gpu,
            'temps': {'cpu': cpu_temp, 'gpu': (gpu or {}).get('temp_c')},
            'disks': disks,
            'processes': processes,
        }

        with self._lock:
            self.snapshot = snap
            self.cpu_history.append((ts, round(cpu_percent, 1)))
            self.mem_history.append((ts, round(mem.percent, 1)))

    def _top_processes(self, limit=6):
        procs = []
        for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            info = p.info
            if info['cpu_percent'] is None:
                continue
            name = info['name'] or '?'
            if name.lower() in ('system idle process', '_total'):  # 空闲统计噪音
                continue
            procs.append({
                'pid': info['pid'],
                'name': name[:28],
                'cpu': round(info['cpu_percent'] or 0, 1),
                'mem': round(info['memory_percent'] or 0, 1),
            })
        procs.sort(key=lambda x: x['cpu'], reverse=True)
        procs = procs[:limit]
        # cpu_percent 首次调用无意义，丢弃第一轮
        if not self._proc_warm:
            self._proc_warm.append(True)
            return []
        return procs

    def _disks(self):
        self._disk_tick += 1
        if self._disk_cache and self._disk_tick % 5 != 1:
            return self._disk_cache
        out = []
        for part in psutil.disk_partitions(all=False):
            if 'cdrom' in (part.opts or '').lower() or not part.fstype:
                continue
            try:
                usage = psutil.disk_usage(part.mountpoint)
            except Exception:
                continue
            out.append({
                'mount': part.mountpoint,
                'fstype': part.fstype,
                'total': usage.total,
                'used': usage.used,
                'free': usage.free,
                'percent': round(usage.percent, 1),
            })
        if out:
            self._disk_cache = out
        return self._disk_cache

    def _query_gpu(self):
        """nvidia-smi 采样；失败时退避重试，拿不到返回 None（前端显示不可用）。"""
        now = _now()
        if now < self._gpu_next_try:
            return self._gpu_state
        try:
            cmd = ['nvidia-smi',
                   '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
                   '--format=csv,noheader,nounits']
            raw = subprocess.check_output(cmd, timeout=5, creationflags=_CREATE_NO_WINDOW)
            line = raw.decode('utf-8', 'replace').strip().splitlines()
            if not line:
                raise ValueError('empty nvidia-smi output')
            cols = [c.strip() for c in line[0].split(',')]
            if len(cols) < 5:
                raise ValueError('unexpected nvidia-smi output')
            name, util, mem_used, mem_total, temp = cols[0], cols[1], cols[2], cols[3], cols[4]

            def _num(text):
                try:
                    return float(text)
                except (TypeError, ValueError):
                    return None

            self._gpu_state = {
                'available': True,
                'name': name,
                'percent': _num(util),
                'vram_used_mb': _num(mem_used),
                'vram_total_mb': _num(mem_total),
                'temp_c': _num(temp),
            }
            self._gpu_fail = 0
        except Exception:
            self._gpu_fail += 1
            self._gpu_state = None
            # 连续失败 3 次后，每 30 秒重试一次（无独显的机器不做无谓开销）
            self._gpu_next_try = now + (self.interval if self._gpu_fail < 3 else 30)
        return self._gpu_state

    # ------------------------------------------------------------------ 对外读取
    def get(self):
        with self._lock:
            return dict(self.snapshot), {
                'cpu': list(self.cpu_history),
                'mem': list(self.mem_history),
            }

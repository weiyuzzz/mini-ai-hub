# -*- coding: utf-8 -*-
"""Mini AI Hub — 配置管理。

配置持久化到 data/config.json（包含 API Key，已加入 .gitignore，绝不发往前端）。
"""

import copy
import json
import os
import threading

# 项目根目录（backend/ 的上一级）
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
CONFIG_PATH = os.path.join(DATA_DIR, 'config.json')

VERSION = '1.0.0'

DEFAULT_CONFIG = {
    'server': {
        'host': '0.0.0.0',
        'port': 8781,
    },
    'ai': {
        # OpenAI-compatible 接口地址，例如：
        #   https://api.openai.com/v1
        #   http://127.0.0.1:1234/v1   (LM Studio)
        #   http://127.0.0.1:11434/v1  (Ollama)
        'base_url': '',
        'api_key': '',
        'model': '',
        'temperature': 0.7,
        'max_tokens': 2048,
        'system_prompt': '你是 Mini AI Hub 的内置助手，运行在用户的个人电脑上。'
                         '回答简洁、准确、结构清晰，默认使用中文。',
    },
    # 可选访问控制：只允许匹配这些前缀的局域网 IP 访问（如 "192.168.1."）。为空表示不限制。
    'security': {
        'allowed_prefixes': [],
    },
    # 后端采样间隔（秒）
    'sample_interval': 3,
}

_lock = threading.Lock()
_cache = None


def _deep_merge(base, extra):
    """递归合并配置，extra 优先。"""
    out = copy.deepcopy(base)
    if not isinstance(extra, dict):
        return out
    for key, val in extra.items():
        if key in out and isinstance(out[key], dict) and isinstance(val, dict):
            out[key] = _deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def load():
    """读取配置（带缓存），文件不存在或损坏时返回默认值。"""
    global _cache
    with _lock:
        if _cache is not None:
            return _cache
        cfg = copy.deepcopy(DEFAULT_CONFIG)
        try:
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                    raw = json.load(f)
                cfg = _deep_merge(DEFAULT_CONFIG, raw)
        except Exception as exc:  # 配置损坏时不让服务挂掉
            print('[config] 读取配置失败，使用默认配置: %s' % exc)
        _cache = cfg
        return cfg


def save(cfg):
    """写入配置文件。"""
    global _cache
    with _lock:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = CONFIG_PATH + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        os.replace(tmp, CONFIG_PATH)
        _cache = copy.deepcopy(cfg)


def update(section, patch):
    """更新某个配置段（如 'ai'）并落盘。"""
    cfg = load()
    new = copy.deepcopy(cfg)
    if section not in new:
        new[section] = {}
    for key, val in (patch or {}).items():
        new[section][key] = val
    save(new)
    return new


def get_server():
    return load().get('server', DEFAULT_CONFIG['server'])


def get_ai():
    return load().get('ai', DEFAULT_CONFIG['ai'])


def get_security():
    return load().get('security', DEFAULT_CONFIG['security'])


def public_ai_status():
    """返回不含 API Key 的 AI 配置状态（可安全发给前端）。"""
    ai = get_ai()
    key = (ai.get('api_key') or '').strip()
    hint = ('••••' + key[-4:]) if len(key) >= 4 else ('已设置' if key else '')
    configured = bool((ai.get('base_url') or '').strip()) and bool((ai.get('model') or '').strip())
    return {
        'configured': configured,
        'base_url': (ai.get('base_url') or '').strip(),
        'model': (ai.get('model') or '').strip(),
        'has_api_key': bool(key),
        'key_hint': hint,
    }

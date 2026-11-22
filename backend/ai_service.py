# -*- coding: utf-8 -*-
"""Mini AI Hub — AI 服务（OpenAI-compatible）。

统一从 Windows 后端调用云端/本地大模型，API Key 只存在后端，不下发前端。
兼容任何 OpenAI-compatible 接口（OpenAI / DeepSeek / LM Studio / Ollama 等）。
"""

import json
import time
import urllib.error
import urllib.request


class AIError(Exception):
    """带用户可读信息的 AI 调用异常。"""

    def __init__(self, message):
        super(AIError, self).__init__(message)
        self.user_message = message


def _normalize_base_url(base_url):
    base = (base_url or '').strip().rstrip('/')
    if base and not base.endswith('/chat/completions'):
        base += '/chat/completions'
    return base


def chat(messages, ai_cfg, timeout=90):
    """调用 chat/completions，成功返回 dict，失败抛 AIError（message 已可读）。"""
    url = _normalize_base_url(ai_cfg.get('base_url'))
    model = (ai_cfg.get('model') or '').strip()
    if not url:
        raise AIError('尚未配置 AI 服务地址，请到“设置”页填写 Base URL。')
    if not model:
        raise AIError('尚未配置模型名称，请到“设置”页填写模型名。')

    payload = {
        'model': model,
        'messages': messages,
        'temperature': ai_cfg.get('temperature', 0.7),
        'max_tokens': ai_cfg.get('max_tokens', 2048),
        'stream': False,
    }
    headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'MiniAIHub/1.0',
    }
    key = (ai_cfg.get('api_key') or '').strip()
    if key:
        headers['Authorization'] = 'Bearer ' + key

    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as exc:
        detail = ''
        try:
            err = json.loads(exc.read().decode('utf-8', 'replace'))
            detail = (err.get('error') or {}).get('message') or ''
        except Exception:
            pass
        raise AIError(_friendly_http_error(exc.code, detail))
    except urllib.error.URLError as exc:
        raise AIError('无法连接 AI 服务（%s）。请检查地址是否可达。' % _reason(exc))
    except Exception as exc:
        raise AIError('AI 请求失败：%s' % exc)

    elapsed_ms = int((time.time() - started) * 1000)
    try:
        data_obj = json.loads(body)
    except ValueError:
        raise AIError('AI 服务返回了无法解析的内容，请确认地址是 OpenAI-compatible 接口。')
    try:
        reply = data_obj['choices'][0]['message']['content']
    except (KeyError, IndexError, TypeError):
        raise AIError('AI 服务响应格式异常，请检查接口地址与模型名。')
    usage = data_obj.get('usage') or {}
    return {
        'reply': (reply or '').strip(),
        'model': data_obj.get('model') or model,
        'latency_ms': elapsed_ms,
        'usage': {
            'prompt_tokens': usage.get('prompt_tokens'),
            'completion_tokens': usage.get('completion_tokens'),
        },
    }


def test(ai_cfg, timeout=30):
    """连接测试：发一条极小的对话请求。"""
    messages = [
        {'role': 'system', 'content': 'You are a connectivity probe. Reply with exactly: ok'},
        {'role': 'user', 'content': 'ping'},
    ]
    cfg = dict(ai_cfg)
    cfg['max_tokens'] = 16
    result = chat(messages, cfg, timeout=timeout)
    result['base_url'] = (ai_cfg.get('base_url') or '').strip()
    return result


def _friendly_http_error(code, detail):
    base = {
        401: 'API Key 无效或未授权，请检查 Key。',
        403: '服务拒绝了请求（403），请检查 Key 权限或模型访问许可。',
        404: '接口地址或模型不存在（404），请检查 Base URL 是否包含 /v1、模型名是否正确。',
        429: '请求过于频繁或配额不足（429），请稍后再试。',
    }.get(code, 'AI 服务返回错误（HTTP %d）。' % code)
    if detail:
        base += ' ' + detail[:200]
    return base


def _reason(exc):
    reason = getattr(exc, 'reason', None)
    text = str(reason) if reason is not None else str(exc)
    if isinstance(reason, Exception) and 'timed out' in text.lower():
        return '连接超时'
    return text[:120]

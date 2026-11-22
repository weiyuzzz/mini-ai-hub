# -*- coding: utf-8 -*-
"""Mini AI Hub — Windows 服务端入口。

  python backend/app.py
默认监听 0.0.0.0:8781，供同一局域网内的 iPad（iOS 9 Safari）访问。
"""

import os
import socket
import time

from flask import Flask, jsonify, request, send_from_directory

import ai_service
import config
import network_monitor
import system_monitor

VERSION = config.VERSION
START_TS = time.time()
MAX_MSG_LEN = 8000
MAX_HISTORY = 40

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024

FRONTEND_DIR = os.path.join(config.BASE_DIR, 'frontend')

sysmon = system_monitor.SystemMonitor(config.load().get('sample_interval', 3))
netmon = network_monitor.NetworkMonitor(config.load().get('sample_interval', 3))


# ---------------------------------------------------------------- 安全访问控制
@app.before_request
def _gate():
    prefixes = (config.get_security().get('allowed_prefixes') or [])
    if not prefixes:
        return None
    ip = request.remote_addr or ''
    if ip in ('127.0.0.1', '::1', 'localhost'):
        return None
    for p in prefixes:
        if p and ip.startswith(p):
            return None
    return jsonify({'ok': False, 'error': '访问被拒绝（IP 不在允许列表内）'}), 403


# ---------------------------------------------------------------- 静态资源
@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.route('/css/<path:name>')
def css(name):
    return send_from_directory(os.path.join(FRONTEND_DIR, 'css'), name, max_age=30)


@app.route('/js/<path:name>')
def js(name):
    return send_from_directory(os.path.join(FRONTEND_DIR, 'js'), name, max_age=30)


@app.route('/icons/<path:name>')
def icons(name):
    return send_from_directory(os.path.join(FRONTEND_DIR, 'icons'), name, max_age=86400)


# ---------------------------------------------------------------- 监控 API
@app.route('/api/health')
def health():
    return jsonify({
        'ok': True,
        'service': 'mini-ai-hub',
        'version': VERSION,
        'uptime_sec': int(time.time() - START_TS),
        'time': time.strftime('%Y-%m-%d %H:%M:%S'),
    })


@app.route('/api/system')
def system():
    snap, hist = sysmon.get()
    if not snap:
        return jsonify({'ok': False, 'error': '监控数据尚未就绪，请稍候'}), 503
    return jsonify({'ok': True, 'system': snap, 'history': hist})


@app.route('/api/network')
def network():
    snap, hist = netmon.get()
    if not snap:
        return jsonify({'ok': False, 'error': '监控数据尚未就绪，请稍候'}), 503
    return jsonify({'ok': True, 'network': snap, 'history': hist})


@app.route('/api/overview')
def overview():
    """首页/各页共用的合并快照，一次请求拿全（减少老设备请求数）。"""
    sys_snap, sys_hist = sysmon.get()
    net_snap, net_hist = netmon.get()
    if not sys_snap:
        return jsonify({'ok': False, 'error': '监控数据尚未就绪，请稍候'}), 503
    return jsonify({
        'ok': True,
        'ts': time.time(),
        'system': sys_snap,
        'network': net_snap,
        'history': sys_hist,
        'net_history': net_hist,
        'ai': config.public_ai_status(),
    })


# ---------------------------------------------------------------- AI API
def _sanitize_history(raw):
    out = []
    for item in (raw or [])[:MAX_HISTORY]:
        if not isinstance(item, dict):
            continue
        role = item.get('role')
        content = item.get('content')
        if role not in ('user', 'assistant') or not isinstance(content, str):
            continue
        if content.strip():
            out.append({'role': role, 'content': content[:MAX_MSG_LEN]})
    return out


@app.route('/api/chat', methods=['POST'])
def chat():
    body = request.get_json(force=True, silent=True) or {}
    message = (body.get('message') or '').strip()
    if not message:
        return jsonify({'ok': False, 'error': '消息内容为空'}), 400
    if len(message) > MAX_MSG_LEN:
        return jsonify({'ok': False, 'error': '消息过长（最多 %d 字）' % MAX_MSG_LEN}), 400

    messages = [{'role': 'system', 'content': config.get_ai().get('system_prompt') or ''}]
    messages += _sanitize_history(body.get('history'))
    messages.append({'role': 'user', 'content': message})

    try:
        result = ai_service.chat(messages, config.get_ai())
    except ai_service.AIError as exc:
        return jsonify({'ok': False, 'error': exc.user_message}), 502
    return jsonify({
        'ok': True,
        'reply': result['reply'],
        'model': result['model'],
        'latency_ms': result['latency_ms'],
    })


# ---------------------------------------------------------------- 设置 API
@app.route('/api/settings')
def settings_get():
    ai = config.public_ai_status()
    return jsonify({
        'ok': True,
        'ai': ai,
        'server': {
            'version': VERSION,
            'port': config.get_server().get('port', 8781),
            'uptime_sec': int(time.time() - START_TS),
            'lan_urls': _lan_urls(config.get_server().get('port', 8781)),
            'hostname': sysmon.snapshot.get('host', {}).get('hostname'),
        },
    })


@app.route('/api/settings', methods=['POST'])
def settings_post():
    body = request.get_json(force=True, silent=True) or {}
    ai_in = body.get('ai') or {}
    patch = {}
    if 'base_url' in ai_in:
        patch['base_url'] = (ai_in.get('base_url') or '').strip()
    if 'model' in ai_in:
        patch['model'] = (ai_in.get('model') or '').strip()
    if 'api_key' in ai_in and (ai_in.get('api_key') or '').strip():
        patch['api_key'] = ai_in['api_key'].strip()  # 空字符串 = 保留原 Key
    if 'temperature' in ai_in:
        try:
            patch['temperature'] = min(2.0, max(0.0, float(ai_in['temperature'])))
        except (TypeError, ValueError):
            pass
    if patch:
        config.update('ai', patch)
    return jsonify({'ok': True, 'ai': config.public_ai_status()})


@app.route('/api/settings/test', methods=['POST'])
def settings_test():
    body = request.get_json(force=True, silent=True) or {}
    saved = config.get_ai()
    cfg = {
        'base_url': (body.get('base_url') if body.get('base_url') is not None
                     else saved.get('base_url')) or '',
        'model': (body.get('model') if body.get('model') is not None
                  else saved.get('model')) or '',
        # 前端留空表示沿用已保存的 Key
        'api_key': (body.get('api_key') if (body.get('api_key') or '').strip()
                    else saved.get('api_key')) or '',
        'temperature': saved.get('temperature', 0.7),
        'max_tokens': 16,
    }
    try:
        result = ai_service.test(cfg)
    except ai_service.AIError as exc:
        return jsonify({'ok': False, 'error': exc.user_message}), 502
    return jsonify({
        'ok': True,
        'latency_ms': result['latency_ms'],
        'model': result['model'],
        'sample': result['reply'][:40],
    })


# ---------------------------------------------------------------- 错误处理
@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'error': '接口不存在'}), 404
    return send_from_directory(FRONTEND_DIR, 'index.html')  # 其余路径回首页


@app.errorhandler(500)
def server_error(e):
    return jsonify({'ok': False, 'error': '服务内部错误：%s' % e}), 500


def _lan_urls(port):
    """列出可用的局域网地址（真实局域网网段优先），方便在 iPad 上输入。"""
    urls = []
    seen = set()
    ip = network_monitor.NetworkMonitor._local_ip()
    if ip and ip not in seen:
        seen.add(ip)
        urls.append(ip)
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip2 = info[4][0]
            if ip2 not in seen and not ip2.startswith('127.'):
                seen.add(ip2)
                urls.append(ip2)
    except Exception:
        pass

    def _rank(addr):
        if addr.startswith('192.168.'):
            return 0
        if addr.startswith('10.') or addr.startswith('172.'):
            return 1
        return 2

    urls.sort(key=_rank)
    return ['http://%s:%d' % (a, port) for a in urls]


def _banner():
    cfg = config.get_server()
    port = cfg.get('port', 8781)
    print('=' * 58)
    print('  Mini AI Hub v%s' % VERSION)
    print('  本机访问   http://127.0.0.1:%d' % port)
    for url in _lan_urls(port):
        print('  iPad 访问  %s' % url)
    print('  按 Ctrl+C 停止服务')
    print('=' * 58)


def main():
    cfg = config.get_server()
    port = int(cfg.get('port', 8781))
    host = cfg.get('host', '0.0.0.0')
    os.makedirs(config.DATA_DIR, exist_ok=True)
    sysmon.start()
    netmon.start()
    _banner()
    try:
        app.run(host=host, port=port, threaded=True, debug=False, use_reloader=False)
    finally:
        sysmon.stop()
        netmon.stop()


if __name__ == '__main__':
    main()

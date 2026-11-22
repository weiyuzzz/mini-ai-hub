# -*- coding: utf-8 -*-
"""Mini AI Hub — 本地 OpenAI-compatible 模拟服务（仅用于端到端联调测试）。

用法：python tools/mock_llm.py  （监听 127.0.0.1:8790）
"""

import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

REPLY = (
    "这是一条来自本地模拟服务的回复，用于验证端到端链路。\n\n"
    "**要点如下：**\n"
    "- 链路一：iPad → Windows Flask 后端\n"
    "- 链路二：后端 → OpenAI-compatible 接口\n\n"
    "代码示例：\n"
    "```python\n"
    "def hello():\n"
    "    return 'Mini AI Hub'\n"
    "```\n\n"
    "行内代码 `xhr.send()` 测试完成。"
)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print('[mock] ' + fmt % args)

    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length) if length else b'{}'
        try:
            req = json.loads(raw.decode('utf-8'))
        except ValueError:
            req = {}

        auth = self.headers.get('Authorization') or ''
        print('[mock] auth=%s model=%s path=%s' % (auth, req.get('model'), self.path))

        time.sleep(0.6)  # 模拟推理延迟

        if self.path.endswith('/chat/completions'):
            self._send(200, {
                'id': 'mock-1',
                'object': 'chat.completion',
                'model': req.get('model') or 'mock-mini',
                'choices': [{
                    'index': 0,
                    'message': {'role': 'assistant', 'content': REPLY},
                    'finish_reason': 'stop'
                }],
                'usage': {'prompt_tokens': 42, 'completion_tokens': 128}
            })
        else:
            self._send(404, {'error': {'message': 'unknown path'}})


if __name__ == '__main__':
    print('mock LLM on http://127.0.0.1:8790/v1')
    HTTPServer(('127.0.0.1', 8790), Handler).serve_forever()

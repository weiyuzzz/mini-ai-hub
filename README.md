# Mini AI Hub

**个人 AI 智能控制终端** — 运行在 Windows 电脑上，通过局域网供老旧 iPad（iOS 9 Safari）使用的轻量级 Web App。

Windows 负责计算、数据采集与 AI 调用；iPad 负责显示与触摸交互。让一台 2012 年的 iPad mini 变成精致、专业的 AI 控制台。

![架构](https://img.shields.io/badge/Windows-Flask%20%E2%9C%95%20psutil-blue) ![客户端](https://img.shields.io/badge/iPad%20mini%201-iOS%209.3.5%20Safari-green)

---

## 功能总览

| 页面 | 内容 |
|---|---|
| **总览 Overview** | CPU 环形仪表 + 趋势线、内存、GPU 长条、实时网速、AI 快捷指令输入、流量曲线、主机信息 |
| **AI 助手** | 完整对话界面（历史 / 加载 / 错误态 / 快捷指令 / 新建对话），调用 OpenAI-compatible API |
| **电脑监控 System** | 各核心占用、内存与虚拟内存、GPU 负载 / 显存 / 温度、磁盘分区、高占用进程、历史曲线 |
| **网络监控 Network** | 默认网卡 / IP / MAC / 网关 / 链路速率、网关延迟（真实 ping）、互联网连通探测、实时流量图、全部网卡列表 |
| **设置 Settings** | AI 服务地址 / 模型 / API Key 配置、连接测试、刷新频率、服务端信息与 iPad 访问地址 |

所有数据**真实采集**（psutil / nvidia-smi / ping / 路由表）；无法获取的指标（如多数 Windows 下的 CPU 温度）明确显示"不可用"，绝不伪造。

---

## 快速开始（Windows）

### 1. 环境要求

- Windows 10/11
- Python 3.8+（安装时勾选 **Add Python to PATH**）
- （可选）NVIDIA 显卡：GPU 监控自动接入 `nvidia-smi`

### 2. 一键启动

双击 **`start.bat`** 即可：

- 自动检测 Python
- 首次运行自动安装依赖（flask、psutil）
- 启动服务并打印访问地址

启动后控制台会显示：

```
==========================================================
  Mini AI Hub v1.0.0
  本机访问   http://127.0.0.1:8781
  iPad 访问  http://192.168.x.x:8781
  按 Ctrl+C 停止服务
==========================================================
```

### 3. 手动启动（备选）

```bat
python -m pip install -r requirements.txt
python backend\app.py
```

---

## 在 iPad 上使用（iPad mini 1 · iOS 9.3.5/9.3.6）

1. 确保 iPad 与电脑连在**同一个局域网**（同一 Wi-Fi/路由器）。
2. 在 iPad 的 Safari 中打开电脑控制台显示的地址，如 `http://192.168.1.100:8781`。
3. 添加到主屏幕（成为独立全屏 App）：
   - 点按 Safari 顶部**分享按钮**（方框加向上箭头）
   - 选择 **添加到主屏幕**
   - 确认名称 "Mini AI Hub"，点 **添加**
4. 从主屏幕点开图标 → 无地址栏、无工具栏，全屏运行。

> 提示：Windows 防火墙首次可能弹出允许访问提示，请选择"允许（专用网络）"。
> 若 iPad 无法访问，检查电脑防火墙是否放行 8781 端口，以及路由器是否开启了"AP 隔离"。

---

## 配置 AI 模型

进入 **设置 → AI Service**：

| 字段 | 说明 | 示例 |
|---|---|---|
| 服务地址 Base URL | OpenAI-compatible 接口，通常以 `/v1` 结尾 | `https://api.deepseek.com/v1` |
| 模型名称 | 服务商提供的模型 ID | `deepseek-chat` |
| API Key | 云端服务必填；本地服务可不填 | `sk-...` |

填好后点 **保存配置**，再点 **测试连接** 验证。

常见服务示例：

| 服务 | Base URL | 模型示例 | Key |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | 必填 |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | 必填 |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | 必填 |
| LM Studio（本地） | `http://127.0.0.1:1234/v1` | 按软件内为准 | 不填 |
| Ollama（本地） | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` | 不填 |

**API Key 只保存在 Windows 端 `data/config.json`，绝不发到浏览器**（前端只收到"已保存 ••••"样式的掩码提示）。该文件已加入 `.gitignore`。

---

## 项目结构

```
mini-ai-hub/
├── backend/
│   ├── app.py               # Flask 入口：路由、静态资源、访问控制
│   ├── config.py            # 配置读写（data/config.json）
│   ├── system_monitor.py    # CPU/内存/磁盘/GPU/进程 后台采样线程
│   ├── network_monitor.py   # 网卡/网关/速率/延迟/互联网探测
│   └── ai_service.py        # OpenAI-compatible 调用与错误翻译
├── frontend/
│   ├── index.html           # 单页应用 + 内联 SVG 图标库
│   ├── css/
│   │   ├── base.css         # 设计令牌、文字层级、基础组件
│   │   ├── layout.css       # 应用骨架、侧栏/顶栏/底部导航、响应式
│   │   ├── components.css   # 胶囊/按钮/输入/环形仪表/图表/对话气泡
│   │   └── pages.css        # 五个页面各自的模块布局
│   ├── js/
│   │   ├── api.js           # XMLHttpRequest 封装
│   │   ├── charts.js        # SVG 环形仪表 / 迷你趋势 / 折线图
│   │   ├── navigation.js    # hash 路由页面切换
│   │   ├── pages.js         # 五个页面的渲染与交互
│   │   └── app.js           # 启动、时钟、轮询调度
│   └── icons/               # 本地生成的 Apple Touch Icon / favicon
├── data/                    # 运行时数据（config.json，含 Key，勿提交）
├── tools/make_icons.py      # 图标生成脚本（纯标准库）
├── start.bat                # Windows 一键启动
├── requirements.txt
└── DESIGN_SPEC.md           # 完整设计规范
```

---

## API 一览（本机调试用）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 服务健康检查 |
| GET | `/api/overview` | 系统+网络+AI 状态合并快照（前端轮询用） |
| GET | `/api/system` | CPU / 内存 / 磁盘 / GPU / 进程 + 历史序列 |
| GET | `/api/network` | 网卡 / 网关 / 速率 / 延迟 + 历史序列 |
| POST | `/api/chat` | `{message, history[]}` → AI 回复 |
| GET | `/api/settings` | 配置状态（不含 API Key） |
| POST | `/api/settings` | 更新 AI 配置（Key 留空保持不变） |
| POST | `/api/settings/test` | AI 连接测试 |

---

## 安全说明

- 服务**只应运行在可信任的局域网**，请勿将 8781 端口暴露到公网。
- 可在 `data/config.json` 的 `security.allowed_prefixes` 中配置 IP 前缀白名单（如 `["192.168.1."]`），重启后只允许该网段访问。
- 本地服务（127.0.0.1）始终可访问。

---

## 兼容性说明（iOS 9）

前端为 iOS 9 Safari 特别设计：

- 纯 ES5 JavaScript（`var` / 无箭头函数 / 无模板串 / 无 async-await），请求全部使用 `XMLHttpRequest`
- CSS 仅使用 Flexbox（无 Grid、无 flex `gap`、无 `position: sticky`）
- 图标为内联 SVG sprite，图表为 SVG，无外部 CDN / 字体 / 图片依赖
- 触控目标 ≥ 44×44px，主屏幕模式自动预留 iOS 状态栏高度
- 屏幕适配：1024×768 横屏（主模式，侧栏导航）、768×1024 竖屏（底部导航）、桌面浏览器可调试

---

## 故障排查

| 现象 | 处理 |
|---|---|
| iPad 打不开页面 | 确认同一局域网；检查防火墙放行 8781；确认服务窗口正在运行 |
| 显示"无法连接 Windows 主机" | 电脑休眠/服务停止；重新运行 `start.bat` |
| GPU 显示"不可用" | 非 NVIDIA 显卡或未装驱动；安装 GeForce 驱动后自动恢复 |
| CPU 温度"不可用" | 正常现象：Windows + psutil 通常读不到传感器，非伪造数据 |
| AI 测试连接失败 | 核对 Base URL（含 `/v1`）、模型名、Key；本地服务确认端口已监听 |
| 主屏幕图标无圆角/异常 | 删除主屏幕图标后重新"添加到主屏幕" |

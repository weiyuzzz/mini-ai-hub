# Mini AI Hub — 设计规范（DESIGN_SPEC）

> Premium Minimalist AI Control Console
> 深色 · 冷静 · 秩序感 · 专业监控终端质感。本文件是全部 UI 实现的唯一视觉依据。

---

## 1. 设计原则

1. **层级先于装饰**：用字号、字重、留白和一条强调色建立层级，不堆叠阴影和渐变。
2. **模块有节奏**：页面由不同尺寸、不同形状的模块组成（大数字模块 / 环形仪表 / 长条卡 / 图表区），
   禁止"一排等宽白色卡片"式模板布局。
3. **强调色克制**：薄荷绿仅用于关键状态、活跃导航、主按钮、数据正向变化；其余信息一律中性色。
4. **真实数据**：任何数字都必须来自后端采集；无法获取的指标显示"不可用"，绝不伪造。
5. **为触摸而生**：主操作区 ≥ 44×44px，全部交互通过 touch 可完成，不依赖 hover。

---

## 2. 色彩（Color Tokens）

| 用途 | 值 | 说明 |
|---|---|---|
| 主背景 `bg0` | `#101820` | 页面底色 |
| 次级背景 `bg1` | `#162129` | 顶栏 / 侧栏 / 输入框内底 |
| 卡片背景 `card` | `#1D2A32` | 数据模块 |
| 浮层背景 `float` | `#263640` | 弹层 / 气泡 / 高亮行 |
| 主文字 `ink` | `#EDF4F1` | 标题与大数字 |
| 次级文字 `ink2` | `#97AAA7` | 标签、辅助说明 |
| 主强调 `mint` | `#9DE6C8` | 正常状态 / 主按钮 / 下载曲线 |
| 辅助强调 `blue` | `#8ABDF0` | 上传曲线 / 链接型信息 |
| 警告 `amber` | `#E9B66B` | 未配置、降级提示 |
| 异常 `red` | `#EF8B83` | 离线、错误、超阈值 |
| 分隔线 `line` | `#30414A` | 1px 描边（可用 60% 透明度弱化） |

派生规则：
- 卡片描边：`1px solid #30414A`；强调卡片可用 `rgba(157,230,200,.35)`。
- 状态点：8px 圆点，外圈 `4px` 同色 18% 透明光圈（静态，不闪烁）。
- 禁止大面积霓虹、禁止全文发光。

## 3. 字体与排版

字体栈：`-apple-system, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`

| 层级 | 规格 | 用途 |
|---|---|---|
| Display | 40px / weight 300 / `#EDF4F1` | 首页大数字 |
| Number | 22px / weight 300 | 模块级数字（延迟、容量） |
| Title | 16px / weight 600 | 页面标题、卡片主标题 |
| Body | 14px / weight 400 / 行高 1.55 | 正文、表单 |
| Sub | 12px / `#97AAA7` | 次要说明 |
| Eyebrow | 10px / weight 600 / 大写 / 字距 0.14em / `#97AAA7` | 分区标签（SYSTEM PULSE 等） |
| Tiny | 10px | 时间轴刻度、单位 |

三级层次 = Eyebrow（分区）→ Title（模块）→ Number/Sub（数据）。数字右对齐或紧跟单位，单位小一号且 `#97AAA7`。

## 4. 几何与间距

- 8px 间距体系：4 / 8 / 12 / 16 / 20 / 24。
- 圆角：卡片 14px；按钮/输入 10px；小徽章 8px；胶囊 999px。
- 阴影：卡片默认无阴影（仅 1px 描边）；弹层 `0 12px 32px rgba(0,0,0,.45)`。
- 分区之间用 **Eyebrow 行**（标签 + 右侧注释）分组，而不是每个卡片内部重复标题。
- 卡片内边距 16px；相邻卡片间距 14px；分区之间 20px。

## 5. 图标

- 本地 SVG sprite（`<symbol>` + `<use>`），24×24 viewBox，线宽 1.7，圆头圆角，`currentColor`。
- 禁止 emoji 图标、禁止外部字体图标库。
- 图标语义：overview=四宫格、AI=气泡、system=芯片、network=脉冲线、settings=滑杆，另含
  cpu/memory/gpu/disk/down/up/send/plus/refresh/check/alert/info/clock/chevron/key/globe/server/x/thermo/power/wifi/layers。

## 6. 组件规范

**主导航（横屏）**：左侧 72px 图标栏，图标 22px + 10px 文字标签；活跃项 = 左侧 2px mint 指示条 + mint 图标 + `#EDF4F1` 文字。
**底部导航（竖屏）**：56px，5 等分，结构同上。
**顶部栏**：60px。左：页面标题 + Eyebrow；右：时钟（HH:MM / 日期）+ 状态胶囊（Windows · AI）。
**状态胶囊 chip**：32px 高，`bg1` 底 + 1px `line` 描边，左侧状态点，文字 12px。
**卡片 card**：`card` 底、14px 圆角、1px `line` 描边、16px 内边距。
**环形仪表 ring**：SVG，轨 `#30414A` 3px，值环 mint 3px，中心大数字 + 小标签。
**条形 meter**：6px 高圆角槽 `#101820`，填充 mint（>80% 转 amber，>90% 转 red）。
**按钮**：主按钮 mint 底 `#101820` 字 600；次按钮透明底 1px `line` 描边；图标按钮 44×44。按下态整体 78% 不透明度，无持续动画。
**输入框**：`bg1` 底、1px `line`、10px 圆角、内边距 10×12；聚焦边框 mint + 2px 18% 光圈。
**AI 气泡**：用户 = `rgba(157,230,200,.10)` 底 + 描边，右对齐；AI = 无底色，左侧 3px mint 竖线 + 正文直接排在页面上；AI 消息内代码块用 `bg0` 底等宽字体。
**提示 toast**：顶部居中 `float` 底胶囊，2.5s 自动消失。
**加载**：AI 回复时三个 4px 圆点呼吸闪烁；轮询期顶部无进度条（避免干扰）。
**错误横幅**：`rgba(239,139,131,.10)` 底 + red 描边 + alert 图标 + 文字 + 重试按钮。
**不可用态**：数值位显示 `--`，Sub 行注明"不可用"或"未检测到"。

## 7. 布局

### 横屏 1024×768（主模式）
- 左侧 72px 图标导航 + 右侧主列（顶栏 60px + 内容区滚动）。
- 内容区最大宽 980px，居中，左右 20px 边距。
- Overview 分区（自上而下，模块尺寸刻意不等）：
  1. **System Pulse**：CPU 大环仪表卡（主视觉，flex 5）｜内存条形卡（flex 3）｜实时网速卡（flex 4，双速率数字）
  2. **GPU 长条卡**（通栏）：名称 + 利用率条 + 显存 + 温度（无 GPU 时优雅降级为说明行）
  3. **AI 快捷卡**（通栏）：输入框 + 发送 + 3 个建议指令（点按后跳转 AI 助手并发送）
  4. **Network**：流量双曲线图卡（flex 7）｜Windows 主机信息卡（flex 5：主机名/系统/开机时长/系统盘）
- 首屏完整呈现，无纵向滚动。

### 竖屏 768×1024
- 侧栏 → 底部 56px 导航；顶栏精简（标题 + 时钟）。
- 横排模块纵向堆叠为单列；图表高度保持 160px；触控目标全部 ≥44px。

### 桌面 ≥1200px
- 与横屏同构，内容最大宽 1080px，留白进一步放大；桌面浏览器仅作调试与演示。

## 8. 交互与状态

- 轮询：默认 5s（可在设置调 3/5/10s），页面隐藏时暂停（visibilitychange）。
- 断连：顶栏状态点转红 + Overview 顶部出现离线横幅（自动重连，恢复后横幅消失并 toast 提示）。
- 数字变化不做补间动画（老设备性能优先），图表每轮重绘。
- 页面切换：瞬时切换 + 8px 淡入位移（150ms，`-webkit-transform/opacity`）。
- 时钟每秒更新；日期格式 `11月22日 周六`。

## 9. iOS 9 Safari 兼容红线

实现必须遵守（本节为验收项）：
1. JS 仅 ES5：`var`、无箭头函数/模板串/解构/async/let/const/for-of/Promise 链。
2. 请求一律 `XMLHttpRequest` + JSON。
3. CSS 无 Grid、无 flex `gap`（用 margin）、无 `position:sticky`、无 `inset`/`aspect-ratio`/`clamp()`、无 CSS 自定义属性（直接写 token 字面值）。
4. 布局 flex（含 `-webkit-` 前缀备写），滚动区 `-webkit-overflow-scrolling:touch`。
5. SVG 图标 sprite 内联于文档，`<use>` 同时带 `href` 与 `xlink:href`。
6. 主屏幕 Web App：`apple-mobile-web-app-capable=yes` + `black-translucent` + 本地 76/152px touch icon；standalone 下顶部预留 20px 状态栏高度。
7. 触控：`-webkit-tap-highlight-color:transparent`，禁用 UI 区文本选择，输入框除外。

## 10. 验收视角清单

- [ ] 首屏 5 秒内可读：PC 在线？AI 可用？网速多少？CPU/内存状态？
- [ ] 无两块完全同尺寸的相邻卡片；无满屏描边框的"表格感"。
- [ ] 大数字 → 标签 → 辅助信息层级一眼可辨。
- [ ] 1024×768 / 768×1024 / 桌面三视口无横向滚动、无拥挤留白失衡。
- [ ] 全部数字为真实采集值；温度不可用时明确标注。

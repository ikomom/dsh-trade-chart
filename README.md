# dsh-trade-chart

[![Release v0.1.0](https://img.shields.io/badge/release-v0.1.0-5B4CF0?style=flat-square)](https://github.com/ikomom/dsh-trade-chart)
[![License: MIT](https://img.shields.io/badge/license-MIT-0B7285?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%5E22.19-339933?style=flat-square&logo=nodedotjs&logoColor=white)](package.json)
[![DSH profiles](https://img.shields.io/badge/DSH-Web-5B4CF0?style=flat-square)](cordis.patch.yml)

**DeepSeek Harness 交易图表插件**：模型调用 `trade_chart` 工具后，K线/折线/柱状/面积图直接渲染在对话流中——波段自动标注、自由标注、滚轮缩放、上下左右自由拖动、手绘工具栏。

纯自绘 SVG，零外部依赖（不加载 CDN、不引入图表库），数据来自会话中的行情技能（longbridge / hithink 等）。

## 功能

| 能力 | 说明 |
|---|---|
| K线图 | 蜡烛图（红涨绿跌）+ 成交量副图 + MA5/10/20 均线（可自定义周期） |
| 折线/柱状/面积 | 多序列对比、图例、悬浮提示、缩放 |
| 波段自动标注 | `pivots: true` 自动检测局部极值（红三角=高点 / 绿三角=低点 + 价格标签） |
| 自由标注 | `annotations`：pivot / hline / trendline / arrow / rect / note，支持自定义颜色/标签 |
| 鼠标缩放 | 滚轮缩放（以鼠标位置为锚点），缩放后 **y 轴锁定显示范围**（不再跳动） |
| 自由拖动 | ⌖ 模式按住拖动：**左右=时间平移，上下=价格区间平移**（缩放后可上下查看）；双击或 ⟲ 复位 |
| 手绘工具栏 | 趋势线 / 箭头 / 矩形 / 水平线 / 文字 / 删除；「⧉ 复制标注」一键导出为参数 |
| 均线正确性 | MA 基于全量数据计算，缩放/平移后按索引映射，窗口边缘不缺历史 |
| 大数据量 | >800 根自动聚合显示（保形）；>5000 根拒绝并提示改用大周期 |

## 安装

### 方式一：本地克隆（开发/尝鲜，推荐）

```bash
git clone https://github.com/ikomom/dsh-trade-chart.git
dsh plugin --profile web add link:D:/path/to/dsh-trade-chart
```

### 方式二：直接从 git 安装（无构建步骤，lib/ 已提交）

```bash
dsh plugin --profile web add git+https://github.com/ikomom/dsh-trade-chart.git
```

### 方式三：npm 安装（发布后可用）

```bash
dsh plugin --profile web add @ikonon/dsh-trade-chart
```

> `dsh plugin` 会把声明了 `dsh.bundle` 的依赖自动写进 profile 的 bundles 列表。

**内部依赖**：宿主端依赖 `@deepseek-ai/dsh-tools`（已在 `dependencies` 声明）。该包为 DSH 内部包，本机通过 `node_modules/@deepseek-ai/dsh-tools` 链接到 DSH 部署目录安装（junction）；其他机器安装时请确认该依赖可用。

## 验证与生效

```bash
node scripts/verify.mjs                 # 语法 + 宿主冒烟 + 客户端渲染冒烟 + 真实启动冒烟
dsh --profile web --dump-config | grep trade-chart
```

看到 `trade-chart` 行即挂载成功。**重启 dsh 的 web 进程并刷新页面**生效。

> Windows PowerShell 下把 `grep` 换成 `Select-String`。

## 卸载

```bash
dsh plugin --profile web remove @ikonon/dsh-trade-chart
```

## 使用

在对话中直接说，例如：

- 「画一下贵州茅台的日K，标出波段高低点」
- 「在 07/19 的高点画一条趋势线到 07/26 的低点，标注压力位」
- 「对比 XX 和 YY 的收盘价走势」
- 「把最近 3 年的周线画出来」

### 图表卡片交互

- **滚轮**：缩放（以鼠标位置为锚点）；缩放后 Y 轴锁定，不再因窗口变化跳动
- **⌖ 查看模式拖动**：左右平移时间、**上下平移价格区间**（缩放后）
- **双击 / ⟲ 按钮**：复位视图（恢复全览与 Y 轴自适应）
- **工具栏**：╱ 趋势线 · ➔ 箭头 · ▭ 矩形 · ― 水平线 · Ｔ 文字 · ✕ 删除（鼠标拖拽绘制）
- **⧉ 复制标注**：把当前所有标注（含手绘）复制为 `annotations` JSON，粘贴给模型即可固化到对话

## trade_chart 工具参数

```jsonc
{
  "chart": {
    "type": "kline",                 // kline | line | bar | area
    "title": "贵州茅台 日K",
    "symbol": "600519.SH",
    "period": "日K",
    "unit": "元",
    "ma": [5, 10, 20],               // K线均线周期；传 [] 不画均线
    "kline": [                       // type=kline 时必填（OHLCV，按时间升序）
      { "time": "2026-07-19T16:00:00Z", "open": 1270, "high": 1329, "low": 1266, "close": 1327.5, "volume": 106151 }
    ],
    "pivots": true,                  // K线：自动标注波段高低点
    "pivotLookback": 3,              // 波段检测窗口（左右各 N 根，2-30，默认 3）
    "annotations": [                 // K线：自由标注
      { "type": "pivot", "kind": "high", "time": "2026-07-19T16:00:00Z", "price": 1329, "label": "前高" },
      { "type": "hline", "price": 1400, "label": "整数关口" },
      { "type": "trendline", "from": { "time": "2026-02-23T16:00:00Z", "price": 1524 }, "to": { "time": "2026-04-15T16:00:00Z", "price": 1477 }, "label": "下降压力线" },
      { "type": "arrow", "from": { "i": 0, "price": 1151 }, "to": { "i": 59, "price": 1362 } },
      { "type": "rect", "from": { "time": "2026-03-22T16:00:00Z", "price": 1400 }, "to": { "time": "2026-04-22T16:00:00Z", "price": 1420 }, "label": "横盘区" },
      { "type": "note", "time": "2026-07-19T16:00:00Z", "price": 1327.5, "text": "放量突破" }
    ]
  }
}
```

**标注定位**：`time`（须与 `kline` 数据中的 time 一致）或 `i`（K线下标，0 起）二选一；所有类型可选 `color`（hex）覆盖默认颜色。

**数据量**：单次建议 ≤800 根（直接渲染）；800–5000 根自动聚合显示；超过 5000 根被拒绝。长时间范围请用周K/月K 或截取区间，避免占用过多模型上下文。

## 开发

```bash
node scripts/verify.mjs   # 推送前验证：语法 + 宿主冒烟 + 客户端渲染冒烟 + 真实启动冒烟
```

仓库已配置 **pre-push hook**：推送前自动运行 `verify.mjs`，任一环节失败会阻止推送。

## 目录结构

```
dsh-trade-chart/
├── lib/
│   ├── index.js          # 宿主端：trade_chart 工具注册、参数校验、波段检测、摘要
│   └── client.js         # 客户端：SVG 图表卡片（渲染/标注/缩放/自由拖动/手绘）
├── scripts/
│   └── verify.mjs        # 推送前验证脚本
├── cordis.patch.yml      # profile 组合补丁（挂载插件行）
└── package.json
```

## License

MIT

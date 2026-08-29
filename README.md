# dsh-trade-chart

[![Release v0.2.0](https://img.shields.io/badge/release-v0.2.0-5B4CF0?style=flat-square)](https://github.com/ikomom/dsh-trade-chart)
[![License: MIT](https://img.shields.io/badge/license-MIT-0B7285?style=flat-square)](LICENSE)

**DeepSeek Harness 交易图表插件**：模型调用 `trade_chart` 工具后，K线/折线/柱状/面积图直接渲染在对话流中。纯自绘 SVG，零外部依赖。

## 功能

| 能力 | 说明 |
|---|---|
| K线图 | 蜡烛图（红涨绿跌）+ 成交量副图 + MA 均线（可自定义周期） |
| 折线/柱状/面积 | 多序列对比、图例、悬浮提示 |
| 波段标注 | `pivots: true` 自动标注局部高低点（红三角/绿三角 + 价格） |
| 自由标注 | `annotations`：pivot / hline / trendline / arrow / rect / note |
| 交互 | 滚轮缩放（y 轴锁定）、拖动平移、双击/⟲ 复位 |
| 大数据量 | >800 根自动聚合；>5000 根拒绝 |

## 安装

```bash
# 方式一：本地克隆（link 路径换成你的真实路径）
git clone https://github.com/ikomom/dsh-trade-chart.git
dsh plugin --profile web add link:D:\你的真实路径\dsh-trade-chart   # Windows
dsh plugin --profile web add link:/你的/真实/路径/dsh-trade-chart    # macOS / Linux / WSL

# 方式二：直接从 git 安装（推荐）
dsh plugin --profile web add git+https://github.com/ikomom/dsh-trade-chart.git

# 方式三：npm 安装（发布后可用）
dsh plugin --profile web add @ikonon/dsh-trade-chart
```

## 验证

```bash
node scripts/verify.mjs                 # 语法 + 宿主/客户端/启动冒烟（跨平台自动探测 DSH 目录）
dsh --profile web --dump-config | grep trade-chart   # 有输出即挂载成功
```

重启 dsh 的 web 进程并刷新页面生效。卸载：`dsh plugin --profile web remove @ikonon/dsh-trade-chart`。

## 使用

对话中直接说：「画一下贵州茅台的日K，标出波段高低点」「对比 XX 和 YY 的收盘价走势」「把最近 3 年的周线画出来」。

### trade_chart 工具参数

```jsonc
{
  "chart": {
    "type": "kline",                 // kline | line | bar | area
    "title": "贵州茅台 日K",
    "symbol": "600519.SH",
    "period": "日K",
    "unit": "元",
    "ma": [5, 10, 20],               // K线均线周期；传 [] 不画均线
    "kline": [                       // type=kline 必填（OHLCV，按时间升序）
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

**数据格式**：`time`（与 kline 的 time 一致）或 `i`（下标，0 起）定位；可加 `color`（hex）。K线 ≤800 根直接渲染、800–5000 根自动聚合、>5000 根拒绝。

## 目录结构

```
lib/index.js      # 宿主端：工具注册、参数校验、波段检测、摘要
lib/client.js     # 客户端：SVG 图表卡片（渲染/标注/缩放/拖动）
scripts/verify.mjs  # 推送前验证（pre-push hook 自动运行）
cordis.patch.yml  # profile 组合补丁
```

## License

MIT

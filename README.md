# dsh-trade-chart

[![Release v0.3.0](https://img.shields.io/badge/release-v0.3.0-5B4CF0?style=flat-square)](https://github.com/ikomom/dsh-trade-chart)
[![License: MIT](https://img.shields.io/badge/license-MIT-0B7285?style=flat-square)](LICENSE)

**DeepSeek Harness 交易图表插件**：模型调用 `trade_chart` 工具后，K线/折线/柱状/面积图直接渲染在对话流中。纯自绘 SVG，零外部依赖。

## 功能

| 能力 | 说明 |
|---|---|
| K线图 | 蜡烛图（红涨绿跌）+ 成交量副图 + MA 均线（可自定义周期） |
| 主图指标 | EMA（自定义周期）+ BOLL 布林带（带状填充） |
| 副图指标 | MACD（DIF/DEA/柱）+ RSI（30/70 超买超卖区）+ KDJ，可组合开启 |
| 成交量 | 量柱 + MAVOL 均量线 |
| 折线/柱状/面积 | 多序列对比、图例、悬浮提示 |
| 热点轮动矩阵 | `type=heatmap`：板块×日期矩阵，红涨绿跌着色，悬浮看明细 |
| 连板晋级图 | `type=ladder`：板数×日期天梯，格内显示家数与晋级率（自动计算） |
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

对话中直接说：「画一下贵州茅台的日K，标出波段高低点」「对比 XX 和 YY 的收盘价走势」「把最近 3 年的周线画出来」「画 XX 的日K，加 MACD 和 RSI 副图、布林带」「画一下最近 10 个交易日热点板块轮动」「把这几天的连板晋级画出来」。

### trade_chart 工具参数

```jsonc
{
  "chart": {
    "type": "kline",                 // kline | line | bar | area | heatmap | ladder
    "title": "贵州茅台 日K",
    "symbol": "600519.SH",
    "period": "日K",
    "unit": "元",
    "ma": [5, 10, 20],               // K线均线周期；传 [] 不画均线
    "kline": [                       // type=kline 必填（OHLCV，按时间升序）
      { "time": "2026-07-19T16:00:00Z", "open": 1270, "high": 1329, "low": 1266, "close": 1327.5, "volume": 106151 }
    ],
    "indicators": {                  // K线专用：技术指标（客户端基于全量数据计算）
      "ema": [12, 26],               //   主图 EMA 均线
      "boll": true,                  //   布林带：true=默认(20,2)，或 { "period": 20, "std": 2 }
      "mavol": [5, 10],              //   成交量均线：true=默认[5,10]，或周期数组
      "macd": true,                  //   副图 MACD：true=默认(12,26,9)，或 { "fast": 12, "slow": 26, "signal": 9 }
      "rsi": [6, 12, 24],            //   副图 RSI：true=默认14，或周期数组
      "kdj": true                    //   副图 KDJ：true=默认(9,3,3)，或 { "n": 9, "k": 3, "d": 3 }
    },
    "heatmap": {                     // type=heatmap 必填：热点轮动矩阵（板块×日期）
      "rows": ["AI算力", "机器人"],   //   板块/主题名称（y 轴）
      "categories": ["07-01", "07-02"], // 日期/周期（x 轴）
      "values": [[5.2, 3.1], [-1.5, 2.3]], // 数值矩阵（行=板块，列=日期），可为 null；红涨绿跌
      "unit": "%"
    },
    "ladder": [                      // type=ladder 必填：连板晋级（按日期升序）
      { "date": "2026-07-01", "boards": [ { "level": 1, "count": 42 }, { "level": 2, "count": 9 } ] }
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

**指标说明**：均线/指标全部基于全量数据计算，缩放平移后仍连续正确；指标值（EMA/BOLL/MACD/RSI/KDJ/MAVOL）同时显示在图例、悬浮提示和模型返回的摘要文本中。MACD 柱 = 2×(DIF−DEA)，RSI 采用 SMA 平滑（与国内行情软件一致），KDJ 默认 (9,3,3)。

**热点矩阵说明**：`values` 行=板块、列=日期；颜色以 0 为中性发散（红涨绿跌，符合 A 股惯例），`null` 显示为灰块。**连板晋级说明**：格内大数字为当日该板数家数；非首板格子下方小字「晋级X% 断Y」= 今日该板家数 ÷ 昨日上一板家数（晋级率）与昨日上一板中断板家数（客户端自动计算）；首板行标注「首板」（新涨停无晋级概念）；悬浮查看明细。

## 目录结构

```
lib/index.js      # 宿主端：工具注册、参数校验、波段检测、摘要
lib/client.js     # 客户端：SVG 图表卡片（渲染/标注/缩放/拖动）
scripts/verify.mjs  # 推送前验证（pre-push hook 自动运行）
cordis.patch.yml  # profile 组合补丁
```

## License

MIT

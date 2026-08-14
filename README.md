# dsh-trade-chart

DeepSeek Harness 交易图表插件：模型调用 `trade_chart` 工具后，K线/折线/柱状/面积图**直接渲染在对话里**，支持波段自动标注、自由标注、缩放平移与手绘标注。

纯自绘 SVG 实现，零外部依赖（不加载 CDN、不引入图表库），数据来自会话中的行情技能（longbridge / hithink 等）。

## 功能

| 能力 | 说明 |
| --- | --- |
| K线图 | 蜡烛图（红涨绿跌）+ 成交量副图 + MA5/10/20 均线（可自定义周期） |
| 折线/柱状/面积 | 多序列对比、图例、悬浮提示 |
| 波段自动标注 | `pivots: true` 自动检测局部极值（红三角=高点 / 绿三角=低点 + 价格标签） |
| 自由标注 | `annotations`：pivot / hline / trendline / arrow / rect / note，支持自定义颜色/标签 |
| 缩放平移 | 滚轮缩放（以鼠标为锚点）、⌖ 拖动平移、双击或 ⟲ 复位 |
| 手绘工具栏 | 趋势线 / 箭头 / 矩形 / 水平线 / 文字 / 删除；「⧉ 复制标注」一键导出为参数 |
| 大数据量 | >800 根自动聚合显示（保形：首开末收/区间极值/量能求和）；>5000 根拒绝并提示改用大周期 |
| 均线正确性 | MA 基于全量数据计算，缩放/平移后按索引映射，窗口边缘不缺历史 |

## 安装

插件包以 `link:` 方式挂载到 DSH web profile：

```jsonc
// C:\Users\<you>\.dsh\profiles\web\package.json
{
  "dependencies": {
    "@ikonon/dsh-trade-chart": "link:D:/path/to/dsh-trade-chart"
  },
  "dsh": {
    "profile": {
      "bundles": [
        // ...其他 bundle
        "@ikonon/dsh-trade-chart"
      ]
    }
  }
}
```

然后安装依赖并重启 dsh：

```bash
cd <profile 目录>
pnpm install     # 建立包链接（本包内部依赖见下）
# 重启 dsh web，刷新浏览器页面
```

> **内部依赖**：宿主端依赖 `@deepseek-ai/dsh-tools`（已在 `dependencies` 声明）。由于该包是 DSH 内部包，本机通过 `node_modules/@deepseek-ai/dsh-tools` 链接到 DSH 部署目录的对应包安装（junction）。若在其他机器安装，请确认该依赖可用。

## 使用

在对话中直接说即可，例如：

- 「画一下贵州茅台的日K，标出波段高低点」
- 「在 07/19 的高点画一条趋势线到 07/26 的低点，标注压力位」
- 「对比 XX 和 YY 的收盘价走势」
- 「把最近 3 年的周线画出来」

### 图表卡片交互

- **滚轮**：缩放（以鼠标位置为锚点）
- **⌖ 查看模式拖动**：平移视图
- **双击 / ⟲ 按钮**：复位到全览
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

## 开发与验证

```bash
node scripts/verify.mjs   # 推送前验证：语法 + 宿主冒烟 + 客户端渲染冒烟 + 真实启动冒烟
```

仓库已配置 **pre-push hook**：推送前自动运行 `verify.mjs`，任一环节失败会阻止推送。

## 目录结构

```
dsh-trade-chart/
├── lib/
│   ├── index.js          # 宿主端：trade_chart 工具注册、参数校验、波段检测、摘要
│   └── client.js         # 客户端：SVG 图表卡片（渲染/标注/缩放平移/手绘）
├── scripts/
│   └── verify.mjs        # 推送前验证脚本
├── cordis.patch.yml      # profile 组合补丁（挂载插件行）
└── package.json
```

## License

MIT

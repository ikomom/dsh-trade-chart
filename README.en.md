# dsh-trade-chart

[中文](./README.md) | **English**

[![Release v0.3.0](https://img.shields.io/badge/release-v0.3.0-5B4CF0?style=flat-square)](https://github.com/ikomom/dsh-trade-chart/releases/tag/v0.3.0)
[![License: MIT](https://img.shields.io/badge/license-MIT-0B7285?style=flat-square)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-dsh%20plugin-5B4CF0?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

A **trading chart plugin for DeepSeek Harness**: after the model calls the `trade_chart` tool, candlestick / line / bar / area charts are rendered directly in the conversation stream — plus technical indicators, sector-rotation heatmaps and limit-up ladders. Pure hand-written SVG, zero external dependencies.

## Features

| Capability | Description |
|---|---|
| Candlestick | Candles (red up / green down) + volume sub-chart + MA lines (custom periods) |
| Main-chart indicators | EMA (custom periods) + BOLL Bollinger Bands (band fill) |
| Sub-chart indicators | MACD (DIF/DEA/histogram) + RSI (30/70 overbought-oversold zones) + KDJ, combinable |
| Volume | Volume bars + MAVOL moving-average lines |
| Line / Bar / Area | Multi-series comparison, legend, hover tooltip |
| Sector rotation | `type=heatmap`: sector × date matrix, red/green diverging colors, hover for details |
| Limit-up ladder | `type=ladder`: board-count × date ladder, per-cell counts & promotion rates (auto-computed), concrete limit-up stocks listed on high boards |
| Swing marking | `pivots: true` auto-marks local highs/lows (red/green triangles + price) |
| Free annotations | `annotations`: pivot / hline / trendline / arrow / rect / note |
| Interaction | Wheel zoom (y-axis lock), drag pan, double-click/⟲ reset, panel-aware crosshair (price / volume / indicator values) |
| Large datasets | >800 bars auto-aggregated; >5000 rejected |

## Install

Use the plugin manager built into DeepSeek Harness:

```bash
# Option 1: local clone (replace the link path with your real path)
git clone https://github.com/ikomom/dsh-trade-chart.git
dsh plugin --profile web add link:D:\your-real-path\dsh-trade-chart   # Windows
dsh plugin --profile web add link:/your/real/path/dsh-trade-chart     # macOS / Linux / WSL

# Option 2: install directly from git (recommended)
dsh plugin --profile web add git+https://github.com/ikomom/dsh-trade-chart.git

# Option 3: npm (after publishing)
dsh plugin --profile web add @ikonon/dsh-trade-chart
```

Restart the dsh web process and refresh the page for changes to take effect. Uninstall: `dsh plugin --profile web remove @ikonon/dsh-trade-chart`.

## Verify

```bash
node scripts/verify.mjs                # syntax + host/client/boot smoke (auto-detects the DSH dir)
dsh --profile web --dump-config | grep trade-chart   # output means the plugin is mounted
```

## Usage

Just say it in the conversation: "Draw the daily candlestick for 600519.SH with swing pivots", "Compare the close trends of XX and YY", "Plot the weekly chart for the last 3 years", "Draw XX's daily chart with MACD and RSI panels and Bollinger Bands", "Show the hot-sector rotation for the last 10 trading days", "Plot the limit-up ladder for the last few days".

### `trade_chart` tool parameters

```jsonc
{
  "chart": {
    "type": "kline",                 // kline | line | bar | area | heatmap | ladder
    "title": "600519.SH Daily",
    "symbol": "600519.SH",
    "period": "1D",
    "unit": "CNY",
    "ma": [5, 10, 20],               // MA periods; pass [] for no MA lines
    "kline": [                       // required for type=kline (OHLCV, ascending by time)
      { "time": "2026-07-19T16:00:00Z", "open": 1270, "high": 1329, "low": 1266, "close": 1327.5, "volume": 106151 }
    ],
    "indicators": {                  // kline only: technical indicators (computed client-side over the full dataset)
      "ema": [12, 26],               //   main-chart EMA periods
      "boll": true,                  //   Bollinger Bands: true = (20,2), or { "period": 20, "std": 2 }
      "mavol": [5, 10],              //   volume moving average: true = [5,10], or an array of periods
      "macd": true,                  //   MACD panel: true = (12,26,9), or { "fast": 12, "slow": 26, "signal": 9 }
      "rsi": [6, 12, 24],            //   RSI panel: true = 14, or an array of periods
      "kdj": true                    //   KDJ panel: true = (9,3,3), or { "n": 9, "k": 3, "d": 3 }
    },
    "heatmap": {                     // required for type=heatmap: sector-rotation matrix (sector × date)
      "rows": ["AI Compute", "Robotics"],   // sector/theme names (y axis)
      "categories": ["07-01", "07-02"],     // dates/periods (x axis)
      "values": [[5.2, 3.1], [-1.5, 2.3]],  // value matrix (row = sector, col = date), null allowed; red/green diverging
      "unit": "%"
    },
    "ladder": [                      // required for type=ladder: limit-up ladder (ascending by date)
      { "date": "2026-07-01", "boards": [
        { "level": 1, "count": 42 },
        { "level": 2, "count": 9 },
        { "level": 3, "count": 3, "stocks": ["Stock A", "Stock B", "Stock C"] }  // optional: concrete stocks, shown inside the cell on high boards
      ] }
    ],
    "pivots": true,                  // kline: auto-mark swing highs/lows
    "pivotLookback": 3,              // swing lookback window (N bars each side, 2-30, default 3)
    "annotations": [                 // kline: free-form annotations
      { "type": "pivot", "kind": "high", "time": "2026-07-19T16:00:00Z", "price": 1329, "label": "prev high" },
      { "type": "hline", "price": 1400, "label": "round number" },
      { "type": "trendline", "from": { "time": "2026-02-23T16:00:00Z", "price": 1524 }, "to": { "time": "2026-04-15T16:00:00Z", "price": 1477 }, "label": "downtrend" },
      { "type": "arrow", "from": { "i": 0, "price": 1151 }, "to": { "i": 59, "price": 1362 } },
      { "type": "rect", "from": { "time": "2026-03-22T16:00:00Z", "price": 1400 }, "to": { "time": "2026-04-22T16:00:00Z", "price": 1420 }, "label": "range" },
      { "type": "note", "time": "2026-07-19T16:00:00Z", "price": 1327.5, "text": "volume breakout" }
    ]
  }
}
```

**Data format**: locate points by `time` (must match a `kline` entry's time) or `i` (0-based index); optional `color` (hex). Candles ≤800 render directly, 800–5000 are auto-aggregated, >5000 are rejected.

**Indicators**: all averages/indicators are computed over the full dataset, so they stay correct after zooming and panning. Indicator values (EMA/BOLL/MACD/RSI/KDJ/MAVOL) appear in the legend, hover tooltip and the model-facing summary. MACD histogram = 2×(DIF−DEA), RSI uses SMA smoothing (matching mainland-China quote software), KDJ defaults to (9,3,3).

**Heatmap**: `values` rows = sectors, columns = dates; colors diverge from 0 (red up / green down, A-share convention), `null` renders as gray. **Ladder**: rows are board counts (first board at the bottom, higher boards at the top), columns are dates; the big number is the day's stock count for that board, the small "promotion rate X%" below = today's count ÷ yesterday's one-lower-board count (auto-computed, ≥50% in red); high boards with few stocks list the **concrete limit-up stocks** in the cell (up to 3, "+N more" if more); the first-board row is labeled "首板/1st board" (new limit-ups, no promotion); hover for the full stock list / broken-board count.

## Project structure

```
lib/index.js      # Host: tool registration, param validation, swing detection, summary
lib/client.js     # Client: SVG chart cards (render / annotate / zoom / pan)
scripts/verify.mjs  # Pre-push verification (runs automatically via pre-push hook)
cordis.patch.yml  # profile composition patch
```

## License

MIT

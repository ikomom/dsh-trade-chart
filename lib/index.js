/**
 * @ikonon/dsh-trade-chart — 对话内交易图表渲染（持久化插件）。
 *
 * 注册 `trade_chart` 模型工具：K线（含成交量副图与 MA 均线）、折线、柱状、
 * 面积图。宿主端只做参数校验与摘要，渲染由客户端 lib/client.js 在
 * `tool.call.toolview` 的 `trade_chart` 卡片中完成（纯 SVG，无外部依赖）。
 * @module @ikonon/dsh-trade-chart
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = '@ikonon/dsh-trade-chart'
export const inject = ['tools']

const CHART_TYPES = ['kline', 'line', 'bar', 'area', 'heatmap', 'ladder']
/** 单次 K 线数据量上限：超过即拒绝（保护模型上下文与渲染）。 */
const MAX_KLINE = 5000

const fp = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(Math.abs(v) >= 1 ? 2 : 4) : '—')
const fv = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1e8) return `${(v / 1e8).toFixed(2)}亿`
  if (a >= 1e4) return `${(v / 1e4).toFixed(2)}万`
  return String(Math.round(v))
}
const ft = (s) => (typeof s === 'string' ? s.replace('T', ' ').slice(0, 16) : '')

/** 波段高低点检测：i 处为左右各 lookback 根内的局部极值（价格平台取首根）。 */
function findPivots(kline, lookback) {
  const highs = []
  const lows = []
  for (let i = lookback; i < kline.length - lookback; i++) {
    const h = kline[i].high
    let isHigh = h > kline[i - 1].high
    if (isHigh) {
      for (let j = i + 1; j <= i + lookback; j++) {
        if (kline[j].high >= h) { isHigh = false; break }
      }
    }
    if (isHigh) highs.push({ i, time: kline[i].time, price: h })
    const l = kline[i].low
    let isLow = l < kline[i - 1].low
    if (isLow) {
      for (let j = i + 1; j <= i + lookback; j++) {
        if (kline[j].low <= l) { isLow = false; break }
      }
    }
    if (isLow) lows.push({ i, time: kline[i].time, price: l })
  }
  return { highs, lows }
}

/* ---------- 技术指标（与客户端 lib/client.js 保持同一套算法，供摘要使用） ---------- */

/** 简单移动平均；前 period-1 个位置为 null。 */
function maValues(vals, period) {
  const out = new Array(vals.length).fill(null)
  let sum = 0
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i]
    if (i >= period) sum -= vals[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** 指数移动平均（首值种子）。 */
function emaValues(vals, period) {
  const out = new Array(vals.length).fill(null)
  const k = 2 / (period + 1)
  let prev = null
  for (let i = 0; i < vals.length; i++) {
    prev = prev === null ? vals[i] : vals[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** 布林带：中轨 MA(period)，上下轨 ±std 倍总体标准差。 */
function bollValues(closes, period, stdMul) {
  const mid = maValues(closes, period)
  const upper = new Array(closes.length).fill(null)
  const lower = new Array(closes.length).fill(null)
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0, sumSq = 0
    for (let j = i - period + 1; j <= i; j++) {
      const c = closes[j]
      sum += c
      sumSq += c * c
    }
    const mean = sum / period
    const sd = Math.sqrt(Math.max(0, sumSq / period - mean * mean))
    upper[i] = mid[i] + stdMul * sd
    lower[i] = mid[i] - stdMul * sd
  }
  return { upper, mid, lower }
}

/** MACD：DIF=EMA(fast)-EMA(slow)，DEA=EMA(DIF, signal)，柱=2*(DIF-DEA)。 */
function macdValues(closes, fast, slow, signal) {
  const ef = emaValues(closes, fast)
  const es = emaValues(closes, slow)
  const dif = closes.map((_, i) => ef[i] - es[i])
  const dea = emaValues(dif, signal)
  const hist = dif.map((v, i) => (v - dea[i]) * 2)
  return { dif, dea, hist }
}

/** RSI（SMA 平滑，与国内行情软件一致）：RSI = 100 * 涨均值 / (涨均值+跌均值)。 */
function rsiValues(closes, period) {
  const out = new Array(closes.length).fill(null)
  let up = 0, down = 0
  for (let i = 1; i < closes.length; i++) {
    const chg = closes[i] - closes[i - 1]
    const u = Math.max(chg, 0), d = Math.max(-chg, 0)
    if (i === 1) {
      up = u
      down = d
    } else {
      up = (up * (period - 1) + u) / period
      down = (down * (period - 1) + d) / period
    }
    out[i] = up + down === 0 ? 50 : up / (up + down) * 100
  }
  return out
}

/** KDJ：RSV=(C-LLV(LOW,N))/(HHV(HIGH,N)-LLV(LOW,N))*100；K=SMA(RSV,M1)；D=SMA(K,M2)；J=3K-2D。 */
function kdjValues(highs, lows, closes, n, kP, dP) {
  const kArr = new Array(closes.length).fill(null)
  const dArr = new Array(closes.length).fill(null)
  const jArr = new Array(closes.length).fill(null)
  let prevK = 50, prevD = 50
  for (let i = 0; i < closes.length; i++) {
    let hh = -Infinity, ll = Infinity
    for (let j = Math.max(0, i - n + 1); j <= i; j++) {
      if (highs[j] > hh) hh = highs[j]
      if (lows[j] < ll) ll = lows[j]
    }
    const rsv = hh === ll ? 50 : (closes[i] - ll) / (hh - ll) * 100
    const k = i === 0 ? rsv : (prevK * (kP - 1) + rsv) / kP
    const d = i === 0 ? k : (prevD * (dP - 1) + k) / dP
    prevK = k
    prevD = d
    kArr[i] = k
    dArr[i] = d
    jArr[i] = 3 * k - 2 * d
  }
  return { k: kArr, d: dArr, j: jArr }
}

/** 校验 indicators 参数（仅 K 线图支持）。 */
function validateIndicators(chart) {
  const ind = chart.indicators
  if (ind === undefined || ind === null) return
  if (typeof ind !== 'object' || Array.isArray(ind)) throw new Error('indicators 必须是对象（ema/boll/mavol/macd/rsi/kdj）')
  const checkIntArr = (name, min, max) => {
    const v = ind[name]
    if (v === undefined) return
    if (!Array.isArray(v) || v.length === 0) throw new Error(`indicators.${name} 必须是周期数组`)
    v.forEach((x, i) => {
      if (typeof x !== 'number' || !Number.isInteger(x) || x < min || x > max) {
        throw new Error(`indicators.${name}[${i}] 必须是 ${min}-${max} 的整数`)
      }
    })
  }
  checkIntArr('ema', 2, 250)
  checkIntArr('mavol', 2, 250)
  if (ind.rsi !== undefined && ind.rsi !== true) {
    if (!Array.isArray(ind.rsi) || ind.rsi.length === 0) throw new Error('indicators.rsi 必须是 true 或周期数组')
    ind.rsi.forEach((x, i) => {
      if (typeof x !== 'number' || !Number.isInteger(x) || x < 2 || x > 100) {
        throw new Error(`indicators.rsi[${i}] 必须是 2-100 的整数`)
      }
    })
  }
  const checkObj = (name, fields) => {
    const v = ind[name]
    if (v === undefined || v === true) return
    if (typeof v !== 'object' || Array.isArray(v)) throw new Error(`indicators.${name} 必须是 true 或对象`)
    for (const [f, lo, hi] of fields) {
      if (v[f] !== undefined && (typeof v[f] !== 'number' || !Number.isFinite(v[f]) || v[f] < lo || v[f] > hi)) {
        throw new Error(`indicators.${name}.${f} 必须是 ${lo}-${hi} 的数字`)
      }
    }
  }
  checkObj('boll', [['period', 2, 250], ['std', 0.1, 10]])
  checkObj('macd', [['fast', 2, 100], ['slow', 3, 200], ['signal', 2, 100]])
  checkObj('kdj', [['n', 2, 100], ['k', 1, 100], ['d', 1, 100]])
  if (ind.macd && typeof ind.macd === 'object' && typeof ind.macd.fast === 'number' && typeof ind.macd.slow === 'number' && ind.macd.fast >= ind.macd.slow) {
    throw new Error('indicators.macd.slow 必须大于 fast')
  }
}

/** 热点轮动矩阵（heatmap）数据校验与摘要。heatmap.rows=板块（y轴），categories=日期（x轴），values=行×列矩阵。 */
function summarizeHeatmap(chart) {
  const hm = chart.heatmap && typeof chart.heatmap === 'object' ? chart.heatmap : null
  if (!hm) throw new Error('热点矩阵需要 chart.heatmap 对象（rows/categories/values）')
  const rows = Array.isArray(hm.rows) ? hm.rows : []
  const cats = Array.isArray(hm.categories) ? hm.categories : []
  const values = Array.isArray(hm.values) ? hm.values : []
  if (rows.length === 0) throw new Error('热点矩阵需要 chart.heatmap.rows（板块名称）')
  if (cats.length === 0) throw new Error('热点矩阵需要 chart.heatmap.categories（日期/周期）')
  if (values.length !== rows.length) {
    throw new Error(`热点矩阵 chart.heatmap.values 行数（${values.length}）与 rows（${rows.length}）不一致`)
  }
  for (let r = 0; r < values.length; r++) {
    const row = values[r]
    if (!Array.isArray(row) || row.length !== cats.length) {
      throw new Error(`热点矩阵 chart.heatmap.values[${r}] 列数需为 ${cats.length}`)
    }
    for (let c = 0; c < row.length; c++) {
      const v = row[c]
      if (v !== null && v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) {
        throw new Error(`热点矩阵 chart.heatmap.values[${r}][${c}] 不是数字或 null`)
      }
    }
  }
  const unit = typeof hm.unit === 'string' && hm.unit !== '' ? hm.unit : ''
  const lastCol = cats.length - 1
  const colVals = values
    .map((row, ri) => ({ row: rows[ri], v: typeof row[lastCol] === 'number' && Number.isFinite(row[lastCol]) ? row[lastCol] : null }))
    .filter((x) => x.v !== null)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
  const lines = [`已渲染${chart.title || '热点轮动矩阵'}：${rows.length} 个板块 × ${cats.length} 个周期`]
  if (colVals.length > 0) {
    lines.push(`最新（${cats[lastCol]}）领涨：${colVals.map((x) => `${x.row} ${x.v >= 0 ? '+' : ''}${x.v}${unit}`).join('  ')}`)
  }
  return lines.join('\n')
}

/** 连板晋级（ladder）数据校验与摘要。ladder=[{date, boards:[{level, count, stocks}]}]，按日期升序。 */
function summarizeLadder(chart) {
  const ladder = Array.isArray(chart.ladder) ? chart.ladder : []
  if (ladder.length === 0) throw new Error('连板晋级图需要 chart.ladder 数组（每日板数分布）')
  let maxLevel = 0
  for (let i = 0; i < ladder.length; i++) {
    const d = ladder[i]
    if (!d || typeof d !== 'object' || typeof d.date !== 'string' || d.date === '') {
      throw new Error(`chart.ladder[${i}] 缺少 date`)
    }
    if (!Array.isArray(d.boards)) throw new Error(`chart.ladder[${i}] 缺少 boards 数组`)
    for (const b of d.boards) {
      if (!b || typeof b.level !== 'number' || !Number.isInteger(b.level) || b.level < 1) {
        throw new Error(`chart.ladder[${i}].boards 的 level 必须是 ≥1 的整数`)
      }
      if (b.stocks !== undefined) {
        if (!Array.isArray(b.stocks) || b.stocks.some((s) => typeof s !== 'string' || s === '')) {
          throw new Error(`chart.ladder[${i}].boards 的 stocks 必须是股票名称数组`)
        }
        if (b.count !== undefined && (typeof b.count !== 'number' || !Number.isInteger(b.count) || b.count < b.stocks.length)) {
          throw new Error(`chart.ladder[${i}].boards 的 count 必须 ≥ stocks 长度`)
        }
      } else if (b.count !== undefined && (typeof b.count !== 'number' || !Number.isInteger(b.count) || b.count < 0)) {
        throw new Error(`chart.ladder[${i}].boards 的 count 必须是非负整数`)
      }
      if (b.level > maxLevel) maxLevel = b.level
    }
  }
  const last = ladder[ladder.length - 1]
  const byLevel = {}
  const byStocks = {}
  for (const b of last.boards) {
    const n = typeof b.count === 'number' ? b.count : (Array.isArray(b.stocks) ? b.stocks.length : 0)
    byLevel[b.level] = (byLevel[b.level] || 0) + n
    if (Array.isArray(b.stocks) && b.stocks.length > 0) byStocks[b.level] = b.stocks
  }
  const levels = Object.keys(byLevel).map(Number).sort((a, b) => a - b)
  const lines = [
    `已渲染${chart.title || '连板晋级图'}：${ladder.length} 个交易日，最高 ${maxLevel} 板`,
    `最新（${last.date}）：${levels.map((lv) => `${lv === 1 ? '首板' : lv + '板'} ${byLevel[lv]}家`).join('，')}`,
  ]
  // 最高板股票名单（若有）
  if (Object.keys(byStocks).length > 0) {
    const topLv = Math.max(...Object.keys(byStocks).map(Number))
    const names = byStocks[topLv]
    lines.push(`${topLv === 1 ? '首板' : topLv + '板'}：${names.slice(0, 5).join('、')}${names.length > 5 ? ` 等 ${names.length} 只` : ''}`)
  }
  return lines.join('\n')
}

const ANNOTATION_TYPES = ['pivot', 'hline', 'trendline', 'rect', 'note', 'arrow']
const POINT_SIDES = ['from', 'to']

/** 校验自由标注列表，返回标注数量。 */
function validateAnnotations(chart) {
  const list = Array.isArray(chart.annotations) ? chart.annotations : []
  for (let idx = 0; idx < list.length; idx++) {
    const a = list[idx]
    if (!a || typeof a !== 'object' || typeof a.type !== 'string') {
      throw new Error(`annotations[${idx}] 缺少 type`)
    }
    const t = a.type
    if (!ANNOTATION_TYPES.includes(t)) throw new Error(`annotations[${idx}] type 不支持: ${t}`)
    const needPoint = (tag, v) => {
      if (!v || typeof v !== 'object') throw new Error(`annotations[${idx}] ${tag} 缺少定位点`)
      if (typeof v.price !== 'number' || !Number.isFinite(v.price)) throw new Error(`annotations[${idx}] ${tag} 缺少 price`)
      if (typeof v.time !== 'string' && typeof v.i !== 'number') throw new Error(`annotations[${idx}] ${tag} 需要 time 或 i`)
    }
    if (t === 'pivot') {
      if (a.kind !== 'high' && a.kind !== 'low') throw new Error(`annotations[${idx}] pivot 需要 kind=high/low`)
      needPoint('pivot', a)
    } else if (t === 'hline') {
      if (typeof a.price !== 'number' || !Number.isFinite(a.price)) throw new Error(`annotations[${idx}] hline 缺少 price`)
    } else if (t === 'note') {
      if (typeof a.text !== 'string' || a.text === '') throw new Error(`annotations[${idx}] note 缺少 text`)
      needPoint('note', a)
    } else {
      for (const side of POINT_SIDES) needPoint(`${t}.${side}`, a[side])
    }
    if (typeof a.color === 'string' && !/^#[0-9a-fA-F]{3,8}$/.test(a.color)) {
      throw new Error(`annotations[${idx}] color 必须是 hex 颜色`)
    }
  }
  return list.length
}

const klineItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    time: { type: 'string', required: true },
    open: { type: 'number', required: true },
    high: { type: 'number', required: true },
    low: { type: 'number', required: true },
    close: { type: 'number', required: true },
    volume: { type: 'number' },
  },
}

const pointSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    x: { type: 'string', required: true },
    y: { type: 'number', required: true },
  },
}

const seriesItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', required: true },
    color: { type: 'string', description: '可选，系列颜色 hex' },
    points: { type: 'array', items: pointSchema, description: '点序列（x为时间/标签，y为数值），与 data 二选一' },
    data: { type: 'array', items: { type: 'number' }, description: '数值序列（与 categories 配合），与 points 二选一' },
  },
}

/** K线图数据校验与摘要。 */
function summarizeKline(chart) {
  const k = Array.isArray(chart.kline) ? chart.kline : []
  if (k.length === 0) throw new Error('K线图需要 chart.kline 数据数组')
  for (let i = 0; i < k.length; i++) {
    const c = k[i]
    if (!c || typeof c !== 'object') throw new Error(`chart.kline[${i}] 不是对象`)
    if (typeof c.time !== 'string' || c.time === '') throw new Error(`chart.kline[${i}] 缺少 time`)
    for (const f of ['open', 'high', 'low', 'close']) {
      if (typeof c[f] !== 'number' || !Number.isFinite(c[f])) throw new Error(`chart.kline[${i}] 的 ${f} 不是数字`)
    }
    if (c.low > c.high) throw new Error(`chart.kline[${i}] 的 low 大于 high`)
  }
  const unit = typeof chart.unit === 'string' && chart.unit !== '' ? chart.unit : ''
  const last = k[k.length - 1]
  const prev = k.length > 1 ? k[k.length - 2] : null
  let hi = -Infinity, lo = Infinity, vol = 0
  for (const c of k) {
    if (c.high > hi) hi = c.high
    if (c.low < lo) lo = c.low
    if (typeof c.volume === 'number' && Number.isFinite(c.volume)) vol += c.volume
  }
  const chg = prev ? ((last.close - prev.close) / prev.close) * 100 : null
  const lines = []
  lines.push(`已渲染 ${chart.title || 'K线图'}${chart.symbol ? `（${chart.symbol}）` : ''}：共 ${k.length} 根K线`)
  lines.push(
    `最新 ${ft(last.time)}：收 ${fp(last.close)}${unit}${chg === null ? '' : `（${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%）`}` +
      `，区间高 ${fp(hi)}${unit} / 低 ${fp(lo)}${unit}，区间成交量 ${fv(vol)}`
  )
  const periods = Array.isArray(chart.ma) ? chart.ma : [5, 10, 20]
  const closes = k.map((c) => c.close)
  const maStrs = []
  for (const p of periods) {
    if (typeof p !== 'number' || p < 2 || p > closes.length) continue
    let sum = 0
    for (let i = closes.length - p; i < closes.length; i++) sum += closes[i]
    maStrs.push(`MA${p}=${fp(sum / p)}${unit}`)
  }
  if (maStrs.length > 0) lines.push(maStrs.join('  '))
  // ---- 技术指标摘要 ----
  const ind = chart.indicators && typeof chart.indicators === 'object' ? chart.indicators : {}
  const indParts = []
  if (Array.isArray(ind.ema) && ind.ema.length > 0) {
    indParts.push(ind.ema.map((p) => `EMA${p}=${fp(emaValues(closes, p)[closes.length - 1])}${unit}`).join(' '))
  }
  if (ind.boll === true || (ind.boll && typeof ind.boll === 'object' && !Array.isArray(ind.boll))) {
    const bp = ind.boll === true ? 20 : (typeof ind.boll.period === 'number' ? Math.floor(ind.boll.period) : 20)
    const bs = ind.boll === true ? 2 : (typeof ind.boll.std === 'number' ? ind.boll.std : 2)
    if (bp <= closes.length) {
      const bb = bollValues(closes, bp, bs)
      const i = closes.length - 1
      indParts.push(`BOLL(${bp},${bs}) 上/中/下=${fp(bb.upper[i])}${unit}/${fp(bb.mid[i])}${unit}/${fp(bb.lower[i])}${unit}`)
    }
  }
  const mavPs = ind.mavol === true ? [5, 10] : (Array.isArray(ind.mavol) ? ind.mavol : [])
  if (mavPs.length > 0) {
    const vols = k.map((c) => (typeof c.volume === 'number' && Number.isFinite(c.volume) ? c.volume : 0))
    indParts.push(mavPs.map((p) => `MAVOL${p}=${fp(maValues(vols, p)[vols.length - 1])}`).join(' '))
  }
  if (ind.macd === true || (ind.macd && typeof ind.macd === 'object' && !Array.isArray(ind.macd))) {
    const mc = ind.macd === true
      ? { fast: 12, slow: 26, signal: 9 }
      : {
          fast: typeof ind.macd.fast === 'number' ? Math.floor(ind.macd.fast) : 12,
          slow: typeof ind.macd.slow === 'number' ? Math.floor(ind.macd.slow) : 26,
          signal: typeof ind.macd.signal === 'number' ? Math.floor(ind.macd.signal) : 9,
        }
    if (mc.slow <= closes.length) {
      const m = macdValues(closes, mc.fast, mc.slow, mc.signal)
      const i = closes.length - 1
      indParts.push(`MACD(${mc.fast},${mc.slow},${mc.signal}) DIF=${fp(m.dif[i])} DEA=${fp(m.dea[i])} 柱=${fp(m.hist[i])}`)
    }
  }
  const rsiPs = ind.rsi === true ? [14] : (Array.isArray(ind.rsi) ? ind.rsi : [])
  if (rsiPs.length > 0) {
    indParts.push(rsiPs.map((p) => `RSI${p}=${fp(rsiValues(closes, p)[closes.length - 1])}`).join(' '))
  }
  if (ind.kdj === true || (ind.kdj && typeof ind.kdj === 'object' && !Array.isArray(ind.kdj))) {
    const kc = ind.kdj === true
      ? { n: 9, k: 3, d: 3 }
      : {
          n: typeof ind.kdj.n === 'number' ? Math.floor(ind.kdj.n) : 9,
          k: typeof ind.kdj.k === 'number' ? Math.floor(ind.kdj.k) : 3,
          d: typeof ind.kdj.d === 'number' ? Math.floor(ind.kdj.d) : 3,
        }
    if (kc.n <= closes.length) {
      const kd = kdjValues(k.map((c) => c.high), k.map((c) => c.low), closes, kc.n, kc.k, kc.d)
      const i = closes.length - 1
      indParts.push(`KDJ(${kc.n},${kc.k},${kc.d}) K=${fp(kd.k[i])} D=${fp(kd.d[i])} J=${fp(kd.j[i])}`)
    }
  }
  if (indParts.length > 0) lines.push('指标：' + indParts.join('  ｜  '))
  if (chart.pivots === true || (chart.pivots && typeof chart.pivots === 'object')) {
    const lookback =
      typeof chart.pivotLookback === 'number'
        ? Math.max(2, Math.min(30, Math.floor(chart.pivotLookback)))
        : chart.pivots && typeof chart.pivots === 'object' && typeof chart.pivots.lookback === 'number'
          ? Math.max(2, Math.min(30, Math.floor(chart.pivots.lookback)))
          : 3
    const { highs, lows } = findPivots(k, lookback)
    if (highs.length > 0 || lows.length > 0) {
      const lastHigh = highs[highs.length - 1]
      const lastLow = lows[lows.length - 1]
      lines.push(
        `波段（lookback=${lookback}）：高点 ${highs.length} 个` +
          (lastHigh ? `，最新 ${ft(lastHigh.time)} ${fp(lastHigh.price)}${unit}` : '') +
          `；低点 ${lows.length} 个` +
          (lastLow ? `，最新 ${ft(lastLow.time)} ${fp(lastLow.price)}${unit}` : '')
      )
    }
  }
  if (Array.isArray(chart.annotations) && chart.annotations.length > 0) {
    lines.push(`已标记 ${chart.annotations.length} 处标注`)
  }
  return lines.join('\n')
}

/** 折线/柱状/面积图数据校验与摘要。 */
function summarizeSeries(chart) {
  const series = Array.isArray(chart.series) ? chart.series : []
  if (series.length === 0) throw new Error('折线/柱状/面积图需要 chart.series 数组')
  const parts = []
  for (let si = 0; si < series.length; si++) {
    const s = series[si]
    if (!s || typeof s !== 'object' || typeof s.name !== 'string' || s.name === '') {
      throw new Error(`chart.series[${si}] 缺少 name`)
    }
    const pts = Array.isArray(s.points) ? s.points : []
    const data = Array.isArray(s.data) ? s.data : []
    if (pts.length === 0 && data.length === 0) throw new Error(`chart.series[${si}] 需要 points 或 data`)
    const vals =
      pts.length > 0
        ? pts.filter((p) => p && typeof p.y === 'number' && Number.isFinite(p.y)).map((p) => p.y)
        : data.filter((v) => typeof v === 'number' && Number.isFinite(v))
    if (vals.length === 0) throw new Error(`chart.series[${si}] 没有有效数值`)
    let slo = Infinity, shi = -Infinity
    for (const v of vals) {
      if (v < slo) slo = v
      if (v > shi) shi = v
    }
    parts.push(`${s.name}：${vals.length} 个点，最新 ${fp(vals[vals.length - 1])}，区间 ${fp(slo)} ~ ${fp(shi)}`)
  }
  const typeName = { kline: 'K线图', line: '折线图', bar: '柱状图', area: '面积图' }[chart.type]
  return `已渲染${chart.title ? `「${chart.title}」` : typeName}（${series.length} 条序列）：\n${parts.join('\n')}`
}

const TOOL_DEFINITION = defineTool({
  name: 'trade_chart',
  description:
    '在对话中直接渲染交易图表。当用户要求绘制或查看 K 线、价格走势、成交量、涨跌幅、多序列对比、热点板块轮动、连板晋级等图表时调用此工具。' +
    'K线：type=kline，传 chart.kline（OHLCV 数组，按时间升序），客户端会自动绘制蜡烛图、成交量副图与 MA 均线；' +
    '其他类型：type=line/bar/area，传 chart.series（每个序列用 points（x为时间/标签，y为数值）或 categories+data）；' +
    '热点轮动：type=heatmap，传 chart.rows（板块名称）、chart.categories（日期）与 chart.values（板块×日期数值矩阵，红涨绿跌着色）；' +
    '连板晋级：type=ladder，传 chart.ladder（[{date, boards:[{level, count}]}]，按日期升序，客户端自动计算晋级率）。' +
    '数据优先使用行情工具（longbridge、hithink 等）返回的真实数据。' +
    '技术指标：indicators 传 ema（主图EMA）/ boll（布林带）/ mavol（成交量均线）/ macd / rsi / kdj（副图），客户端基于全量数据自动计算。' +
    '数据量：单次建议 ≤800 根（直接渲染）；800-5000 根客户端自动聚合显示；超过 5000 根会被拒绝。长时间范围请改用更大周期（周K/月K）或截取最近区间，避免占用过多上下文。',
  parameters: {
    chart: {
      type: 'object',
      required: true,
      additionalProperties: false,
      description: '图表规格',
      properties: {
        type: {
          type: 'string',
          enum: CHART_TYPES,
          required: true,
          description: 'kline=蜡烛图(含成交量副图与均线)；line=折线；bar=柱状(0轴基线)；area=面积；heatmap=热点轮动矩阵(板块×日期)；ladder=连板晋级图(板数×日期)',
        },
        title: { type: 'string', description: '图表标题，如：贵州茅台 日K' },
        symbol: { type: 'string', description: '标的代码，如 600519.SH' },
        period: { type: 'string', description: '周期，如 日K / 周K / 60分钟' },
        unit: { type: 'string', description: '价格单位，如 元 / USD / HKD' },
        ma: { type: 'array', items: { type: 'number' }, description: 'K线均线周期，默认 [5,10,20]；传空数组 [] 则不画均线' },
        kline: { type: 'array', items: klineItemSchema, description: 'K线数据，按时间升序' },
        categories: { type: 'array', items: { type: 'string' }, description: 'X轴类别标签（与 series[].data 配合）' },
        series: { type: 'array', items: seriesItemSchema, description: '折线/柱状/面积图的序列' },
        pivots: { type: 'boolean', description: 'K线专用：true 时自动标注波段高低点（局部极值，红/绿三角+价格）' },
        pivotLookback: { type: 'integer', description: '波段检测窗口（左右各 N 根），默认 3，范围 2-30' },
        annotations: {
          type: 'array',
          description: 'K线专用：自由标注列表。type=pivot(波段点,kind=high/low)｜hline(水平线,price)｜trendline/arrow/rect(from/to 两点)｜note(注释,text)。定位点用 {time(与kline一致) 或 i(下标), price}，可选 color(hex)/label/text',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ANNOTATION_TYPES, required: true, description: 'pivot/hline/trendline/rect/note/arrow' },
              kind: { type: 'string', enum: ['high', 'low'], description: 'pivot 专用：波段高点/低点' },
              time: { type: 'string', description: 'K线 time（与 kline 数据一致），与 i 二选一' },
              i: { type: 'integer', description: 'K线下标（0 起），与 time 二选一' },
              price: { type: 'number', description: '价格坐标' },
              from: {
                type: 'object', additionalProperties: false, description: '趋势线/箭头/矩形起点',
                properties: { time: { type: 'string' }, i: { type: 'integer' }, price: { type: 'number', required: true } },
              },
              to: {
                type: 'object', additionalProperties: false, description: '趋势线/箭头/矩形终点',
                properties: { time: { type: 'string' }, i: { type: 'integer' }, price: { type: 'number', required: true } },
              },
              text: { type: 'string', description: 'note 正文' },
              label: { type: 'string', description: '标签文字（pivot/hline/trendline/rect/arrow）' },
              color: { type: 'string', description: '可选，覆盖默认颜色 hex' },
            },
          },
        },
        indicators: {
          type: 'object',
          additionalProperties: false,
          description:
            'K线专用：技术指标（客户端基于全量数据计算）。ema=[12,26] 主图EMA；boll=true(默认20,2) 或 {period,std} 布林带；mavol=true(默认[5,10]) 或周期数组 成交量均线；macd=true(默认12,26,9) 或 {fast,slow,signal} 副图；rsi=true(默认14) 或周期数组 副图；kdj=true(默认9,3,3) 或 {n,k,d} 副图',
          properties: {
            ema: { type: 'array', items: { type: 'number' }, description: '主图 EMA 周期列表，如 [12,26]' },
            boll: {
              oneOf: [
                { type: 'boolean', description: 'true 用默认 (20,2)' },
                { type: 'object', additionalProperties: false, properties: { period: { type: 'number' }, std: { type: 'number' } }, description: '{period, std}' },
              ],
              description: '布林带：true 或 {period, std}',
            },
            mavol: {
              oneOf: [
                { type: 'boolean', description: 'true 用默认 [5,10]' },
                { type: 'array', items: { type: 'number' }, description: '周期数组，如 [5,10]' },
              ],
              description: '成交量均线：true 或周期数组',
            },
            macd: {
              oneOf: [
                { type: 'boolean', description: 'true 用默认 (12,26,9)' },
                { type: 'object', additionalProperties: false, properties: { fast: { type: 'number' }, slow: { type: 'number' }, signal: { type: 'number' } }, description: '{fast, slow, signal}' },
              ],
              description: 'MACD 副图：true 或 {fast,slow,signal}',
            },
            rsi: {
              oneOf: [
                { type: 'boolean', description: 'true 用默认 14' },
                { type: 'array', items: { type: 'number' }, description: '周期数组，如 [6,12,24]' },
              ],
              description: 'RSI 副图：true 或周期数组',
            },
            kdj: {
              oneOf: [
                { type: 'boolean', description: 'true 用默认 (9,3,3)' },
                { type: 'object', additionalProperties: false, properties: { n: { type: 'number' }, k: { type: 'number' }, d: { type: 'number' } }, description: '{n, k, d}' },
              ],
              description: 'KDJ 副图：true 或 {n,k,d}',
            },
          },
        },
        heatmap: {
          type: 'object',
          additionalProperties: false,
          description: 'type=heatmap 专用：热点轮动矩阵。rows=板块/主题名称（y轴），categories=日期/周期（x轴），values=板块×日期数值矩阵（可为 null），unit=单位（如 %）。客户端红涨绿跌着色',
          properties: {
            rows: { type: 'array', items: { type: 'string' }, description: '板块/主题名称（y 轴），如 ["AI算力","机器人"]' },
            categories: { type: 'array', items: { type: 'string' }, description: '日期/周期（x 轴），如 ["07-01","07-02"]' },
            values: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: '数值矩阵，行=板块、列=日期；null 表示无数据' },
            unit: { type: 'string', description: '单位，如 %' },
          },
        },
        ladder: {
          type: 'array',
          description: 'type=ladder 专用：连板晋级数据（按日期升序）。每项 {date, boards:[{level, count, stocks}]}；level=连板数（1=首板），count=该板数家数（可省略，缺省=stocks 长度），stocks=该板数具体股票名称（可选，客户端在格内展示）；客户端自动计算晋级率',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              date: { type: 'string', required: true, description: '日期，如 2026-07-01' },
              boards: {
                type: 'array',
                description: '当日板数分布',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    level: { type: 'integer', required: true, description: '连板数，1=首板' },
                    count: { type: 'integer', description: '该板数股票家数（可省略，缺省为 stocks 数组长度）' },
                    stocks: { type: 'array', items: { type: 'string' }, description: '该板数具体股票名称（可选，高板数量少时客户端直接展示）' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  output: {
    schema: { type: 'string', description: '图表数据摘要文本' },
    render: (_args, value) => [{ type: 'text', text: String(value) }],
  },
  execute(args) {
    const chart = args && args.chart && typeof args.chart === 'object' ? args.chart : null
    if (!chart) throw new Error('缺少 chart 参数')
    const type = chart.type
    if (!CHART_TYPES.includes(type)) throw new Error('chart.type 必须是 kline/line/bar/area/heatmap/ladder')
    const hasMarking = chart.pivots !== undefined || chart.pivotLookback !== undefined || chart.annotations !== undefined || chart.indicators !== undefined
    if (hasMarking && type !== 'kline') throw new Error('pivots / pivotLookback / annotations / indicators 仅支持 K 线图（type=kline）')
    if (chart.pivots !== undefined && chart.pivots !== true && chart.pivots !== false) {
      throw new Error('pivots 必须是布尔值')
    }
    if (chart.pivotLookback !== undefined) {
      if (typeof chart.pivotLookback !== 'number' || !Number.isInteger(chart.pivotLookback) || chart.pivotLookback < 2 || chart.pivotLookback > 30) {
        throw new Error('pivotLookback 必须是 2-30 的整数')
      }
    }
    validateAnnotations(chart)
    validateIndicators(chart)
    if (type === 'kline') {
      const k = Array.isArray(chart.kline) ? chart.kline : []
      if (k.length > MAX_KLINE) {
        throw new Error(`K线数据量过大（${k.length} 根）：单次最多 ${MAX_KLINE} 根。客户端会自动聚合显示（>800 根按系数合并），但数据本身仍会占用大量模型上下文——长时间范围请改用更大周期（周K/月K）或截取最近区间。`)
      }
      return summarizeKline(chart)
    }
    if (type === 'heatmap') return summarizeHeatmap(chart)
    if (type === 'ladder') return summarizeLadder(chart)
    return summarizeSeries(chart)
  },
})

/** Plugin entry: register the trade_chart tool for every session of the profile. */
export function apply(ctx) {
  ctx.tools.register(TOOL_DEFINITION)
}

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

const KLINE_TYPES = ['kline', 'line', 'bar', 'area']
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
  const periods = Array.isArray(chart.ma) && chart.ma.length > 0 ? chart.ma : [5, 10, 20]
  const closes = k.map((c) => c.close)
  const maStrs = []
  for (const p of periods) {
    if (typeof p !== 'number' || p < 2 || p > closes.length) continue
    let sum = 0
    for (let i = closes.length - p; i < closes.length; i++) sum += closes[i]
    maStrs.push(`MA${p}=${fp(sum / p)}${unit}`)
  }
  if (maStrs.length > 0) lines.push(maStrs.join('  '))
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
    '在对话中直接渲染交易图表。当用户要求绘制或查看 K 线、价格走势、成交量、涨跌幅、多序列对比等图表时调用此工具。' +
    'K线：type=kline，传 chart.kline（OHLCV 数组，按时间升序），客户端会自动绘制蜡烛图、成交量副图与 MA 均线；' +
    '其他类型：type=line/bar/area，传 chart.series（每个序列用 points（x为时间/标签，y为数值）或 categories+data）。' +
    '数据优先使用行情工具（longbridge、hithink 等）返回的真实数据。' +
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
          enum: KLINE_TYPES,
          required: true,
          description: 'kline=蜡烛图(含成交量副图与均线)；line=折线；bar=柱状(0轴基线)；area=面积',
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
    if (!KLINE_TYPES.includes(type)) throw new Error('chart.type 必须是 kline/line/bar/area')
    const hasMarking = chart.pivots !== undefined || chart.pivotLookback !== undefined || chart.annotations !== undefined
    if (hasMarking && type !== 'kline') throw new Error('pivots / pivotLookback / annotations 仅支持 K 线图（type=kline）')
    if (chart.pivots !== undefined && chart.pivots !== true && chart.pivots !== false) {
      throw new Error('pivots 必须是布尔值')
    }
    if (chart.pivotLookback !== undefined) {
      if (typeof chart.pivotLookback !== 'number' || !Number.isInteger(chart.pivotLookback) || chart.pivotLookback < 2 || chart.pivotLookback > 30) {
        throw new Error('pivotLookback 必须是 2-30 的整数')
      }
    }
    validateAnnotations(chart)
    if (type === 'kline') {
      const k = Array.isArray(chart.kline) ? chart.kline : []
      if (k.length > MAX_KLINE) {
        throw new Error(`K线数据量过大（${k.length} 根）：单次最多 ${MAX_KLINE} 根。客户端会自动聚合显示（>800 根按系数合并），但数据本身仍会占用大量模型上下文——长时间范围请改用更大周期（周K/月K）或截取最近区间。`)
      }
      return summarizeKline(chart)
    }
    return summarizeSeries(chart)
  },
})

/** Plugin entry: register the trade_chart tool for every session of the profile. */
export function apply(ctx) {
  ctx.tools.register(TOOL_DEFINITION)
}

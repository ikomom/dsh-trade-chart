/* 开发辅助：把真实 client 渲染器（含技术指标/热点/连板）输出为静态 SVG/HTML 示例页，无需重启 DSH。
 * 运行：node scripts/make-preview.mjs [--out examples/index.html]
 * 原理：以最小 React 桩执行 lib/client.js 的 TradeChartCard，把生成的元素树序列化为 SVG。
 * 输出页为纯静态（无 JS 依赖），可直接挂到 GitHub Pages / 静态托管供他人预览。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
const outFile = outArg || join(root, 'examples', 'index.html');

// ---- 环境桩（与 verify.mjs 客户端冒烟一致）----
globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, style: {}, setAttribute() {}, select() {}, appendChild() {}, remove() {} }),
  head: { appendChild() {} },
};
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
let factory = null;
globalThis.__ModuleLoader__ = { load: (o) => { factory = o.factory; } };

// ---- 最小 React 桩 ----
let hookState = [], hookIdx = 0;
const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (init) => { const i = hookIdx++; hookState[i] = hookState[i] !== undefined ? hookState[i] : init; return [hookState[i], () => {}]; },
  useRef: (init) => ({ current: init }),
  useEffect: () => {},
};
const req = (name) => (name === 'react' ? ReactStub : null);

let clientCode = readFileSync(join(root, 'lib/client.js'), 'utf8');
clientCode = clientCode.replace('return module.exports;', 'exports.TradeChartCard = TradeChartCard; return module.exports;');
(0, eval)(clientCode);
const { TradeChartCard } = factory(req);

// 执行函数组件并返回可序列化树
function renderElement(el) {
  if (el === null || el === undefined || typeof el === 'boolean') return el;
  if (typeof el === 'string' || typeof el === 'number') return el;
  if (Array.isArray(el)) return el.map(renderElement);
  if (typeof el.type === 'function') { hookState = []; hookIdx = 0; return renderElement(el.type(el.props || {})); }
  const children = el.children !== undefined ? (Array.isArray(el.children) ? el.children.map(renderElement) : renderElement(el.children)) : undefined;
  return { type: el.type, props: el.props, children };
}

// ---- 元素树 → SVG 字符串 ----
const ATTR_MAP = {
  className: 'class',
  strokeWidth: 'stroke-width',
  strokeDasharray: 'stroke-dasharray',
  strokeLinejoin: 'stroke-linejoin',
  textAnchor: 'text-anchor',
  fontSize: 'font-size',
  fillOpacity: 'fill-opacity',
};
const SKIP_KEYS = new Set(['key', 'ref', 'style', 'onMouseMove', 'onMouseLeave', 'onMouseDown', 'onMouseUp', 'onDoubleClick', 'onWheel']);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function serialize(el) {
  if (el === null || el === undefined || typeof el === 'boolean') return '';
  if (typeof el === 'string' || typeof el === 'number') return esc(el);
  if (Array.isArray(el)) return el.map(serialize).join('');
  const { type, props, children } = el;
  const attrs = [];
  for (const [k, v] of Object.entries(props || {})) {
    if (SKIP_KEYS.has(k) || /^on[A-Z]/.test(k)) continue;
    if (v === undefined || v === null || v === false) continue;
    const name = ATTR_MAP[k] || k;
    attrs.push(` ${name}="${esc(v)}"`);
  }
  const inner = children !== undefined ? (Array.isArray(children) ? children.map(serialize).join('') : serialize(children)) : '';
  return inner === '' ? `<${type}${attrs}/>` : `<${type}${attrs}>${inner}</${type}>`;
}

function renderToSvg(chart) {
  const block = { kind: 'r', callId: 'c1', call: { name: 'trade_chart', argsRaw: JSON.stringify({ chart }) }, content: [], isError: false };
  const tree = renderElement(TradeChartCard({ block }));
  // 找 tc-chart-wrap（含图例 + svg + 底部信息）；找不到则退回 svg 节点
  let wrapNode = null;
  const findWrap = (n) => {
    if (wrapNode || n === null || n === undefined || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(findWrap); return; }
    if (n.type === 'div' && n.props && n.props.className === 'tc-chart-wrap') { wrapNode = n; return; }
    if (n.children !== undefined) findWrap(n.children);
  };
  findWrap(tree);
  if (wrapNode) return serialize(wrapNode);
  let svgNode = null;
  const findSvg = (n) => {
    if (svgNode || n === null || n === undefined || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(findSvg); return; }
    if (n.type === 'svg') { svgNode = n; return; }
    if (n.children !== undefined) findSvg(n.children);
  };
  findSvg(tree);
  if (!svgNode) throw new Error('未找到图表元素');
  return serialize(svgNode);
}

// ---- 演示数据（合成，非真实行情）----
const bars = [];
let price = 12.0;
const d = new Date('2026-03-02T00:00:00Z');
for (let i = 0; i < 90; i++) {
  const trend = Math.sin(i / 14) * 0.5;
  const shock = (Math.random() - 0.48) * 1.1;
  const open = price + (Math.random() - 0.5) * 0.3;
  const c = open + trend + shock;
  const high = Math.max(open, c) + Math.random() * 0.7 + 0.1;
  const low = Math.min(open, c) - Math.random() * 0.7 - 0.1;
  const vol = Math.round(80000 + 40000 * Math.random() + (Math.abs(shock) > 0.6 ? 90000 : 0));
  bars.push({ time: d.toISOString(), open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +c.toFixed(2), volume: vol });
  price = c;
  d.setDate(d.getDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setDate(d.getDate() + 1);
}
const day = (i) => bars[i].time;
const closes = bars.map((b) => +b.close.toFixed(2));
const pts = (arr) => arr.map((y, i) => ({ x: day(i), y }));

const heatRows = ['AI算力', '机器人', '低空经济', '固态电池', '创新药', '商业航天'];
const heatDates = ['08-25', '08-26', '08-27', '08-28', '08-29', '08-30', '08-31'];
const heatValues = [
  [3.8, 2.1, 4.6, -0.9, 1.2, 5.4, 6.8],
  [1.5, 2.9, -1.2, 3.3, 0.6, -2.1, 4.2],
  [-0.8, 1.1, 2.4, 1.9, 3.6, 0.4, -1.5],
  [2.2, -0.6, 0.9, -2.4, 1.8, 2.7, 1.1],
  [0.4, 3.1, 1.6, 2.2, -1.8, 0.9, 3.3],
  [-1.5, 0.7, -0.3, 1.4, 2.9, -0.8, 0.2],
];

const ladder = [
  { date: '2026-07-24', boards: [{ level: 1, stocks: ['首板恒达', '宏图新材', '天工智能', '云帆数据'] }, { level: 2, stocks: ['二板凌云', '二板科创'] }, { level: 3, stocks: ['三板龙头'] }] },
  { date: '2026-07-25', boards: [{ level: 1, stocks: ['新锐光电', '聚能电池', '星链通信'] }, { level: 2, stocks: ['二板凌云', '二板科创', '三板龙头'] }, { level: 4, stocks: ['四板先锋'] }] },
  { date: '2026-07-26', boards: [{ level: 1, stocks: ['元启智能', '鼎盛材料', '海天生物', '鹏程物流'] }, { level: 2, stocks: ['二板凌云'] }, { level: 4, stocks: ['四板先锋'] }] },
  { date: '2026-07-27', boards: [{ level: 1, stocks: ['极目科技', '中航低空', '芯动半导'] }, { level: 3, stocks: ['三板新锐'] }, { level: 5, stocks: ['五板之王'] }] },
  { date: '2026-07-28', boards: [{ level: 1, stocks: ['启明软件', '浪潮智能', '通宇卫星'] }, { level: 2, stocks: ['二板极目', '二板中航'] }, { level: 3, stocks: ['三板芯动'] }, { level: 5, stocks: ['五板之王'] }] },
  { date: '2026-07-29', boards: [{ level: 1, stocks: ['九洲光电', '恒信数科', '瑞达重工', '绿能新材'] }, { level: 2, stocks: ['二板启明', '二板浪潮'] }, { level: 3, stocks: ['三板极目'] }, { level: 4, stocks: ['四板芯动'] }, { level: 6, stocks: ['六板之王'] }] },
  { date: '2026-07-30', boards: [{ level: 1, stocks: ['远航智能', '晶彩显示'] }, { level: 2, stocks: ['二板九洲'] }, { level: 4, stocks: ['四板极目'] }, { level: 5, stocks: ['五板芯动'] }, { level: 7, stocks: ['七板之王'] }] },
];

const charts = [
  {
    title: 'K线 · 全指标',
    desc: '主图 EMA/BOLL 叠加 + 成交量 MAVOL + MACD / RSI / KDJ 副图，波段高低点自动标注',
    chart: { type: 'kline', title: '示例标的 日K（全指标）', symbol: 'DEMO.SH', period: '日K', unit: '元', indicators: { ema: [12, 26], boll: true, mavol: [5, 10], macd: true, rsi: [6, 12, 24], kdj: true }, pivots: true, kline: bars },
  },
  {
    title: 'K线 · 轻量副图',
    desc: '仅开启 MACD + RSI 副图，主图不加任何均线叠加',
    chart: { type: 'kline', title: '示例标的 日K（MACD+RSI）', symbol: 'DEMO.SH', period: '日K', unit: '元', ma: [], indicators: { macd: true, rsi: [14] }, kline: bars },
  },
  {
    title: '折线 · 多序列对比',
    desc: '两条收盘价走势对比，图例 + 悬浮提示',
    chart: { type: 'line', title: '示例标的 收盘价对比', unit: '元', series: [{ name: '标的A', color: '#5B8DEF', points: pts(closes) }, { name: '标的B', color: '#f0b429', points: pts(closes.map((v) => +(v * 1.35).toFixed(2))) }] },
  },
  {
    title: '柱状 · 涨跌幅',
    desc: '以 0 为基线的涨跌幅柱状图，红涨绿跌',
    chart: { type: 'bar', title: '示例标的 区间涨跌幅', unit: '%', categories: closes.map((_, i) => day(i)).filter((_, i) => i % 10 === 0), series: [{ name: '涨跌幅', color: '#5B8DEF', data: closes.filter((_, i) => i % 10 === 0).map((v, i, a) => +(i === 0 ? 0 : ((v - a[i - 1]) / a[i - 1]) * 100).toFixed(2)) }] },
  },
  {
    title: '面积 · 净值曲线',
    desc: '累计净值面积图（基准 = 1.00）',
    chart: { type: 'area', title: '示例组合 净值曲线', unit: '', categories: closes.map((_, i) => day(i)).filter((_, i) => i % 5 === 0), series: [{ name: '净值', color: '#5B8DEF', data: closes.filter((_, i) => i % 5 === 0).map((v) => +(v / closes[0]).toFixed(3)) }] },
  },
  {
    title: '热点轮动矩阵',
    desc: '板块 × 日期矩阵，红涨绿跌发散着色，悬浮看明细',
    chart: { type: 'heatmap', title: '热点板块轮动', unit: '%', heatmap: { rows: heatRows, categories: heatDates, values: heatValues, unit: '%' } },
  },
  {
    title: '连板晋级天梯',
    desc: '板数 × 日期天梯，格内家数 + 自动晋级率，悬浮查看具体连板股票名单',
    chart: { type: 'ladder', title: '连板晋级天梯', ladder },
  },
];

const svgs = charts.map((c) => renderToSvg(c.chart));
const cards = charts.map((c, i) => `
<section class="card">
  <h2>${c.title}</h2>
  <p class="desc">${c.desc}</p>
  <div class="chart">${svgs[i]}</div>
</section>`).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>dsh-trade-chart 示例预览</title>
<style>
  :root { color-scheme: dark; }
  body { background:#14171f; color:#e5e7eb; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin:0; padding:32px 20px 64px; }
  .wrap { max-width:960px; margin:0 auto; }
  header h1 { font-size:22px; margin:0 0 6px; }
  header p { font-size:13px; color:#9ca3af; margin:0 0 4px; line-height:1.7; }
  .badges { margin:10px 0 4px; }
  .badges a { display:inline-block; color:#c7d2fe; text-decoration:none; font-size:12px; background:#242a38; border:1px solid #3a4152; border-radius:999px; padding:3px 12px; margin:0 8px 6px 0; }
  .badges a:hover { border-color:#5B8DEF; }
  .hint { font-size:12px; color:#6b7280; line-height:1.7; margin-top:6px; }
  .card { background:#1d222d; border:1px solid #343b4b; border-radius:12px; padding:16px 18px; margin:22px 0; }
  .card h2 { font-size:15px; margin:0 0 4px; }
  .card .desc { font-size:12.5px; color:#9ca3af; margin:0 0 10px; }
  .chart { background:#1b1f27; border:1px solid #2c3242; border-radius:8px; padding:8px; overflow-x:auto; }
  svg { width:100%; height:auto; display:block; min-width:640px; }
  footer { margin-top:30px; font-size:12px; color:#6b7280; text-align:center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>dsh-trade-chart 示例预览</h1>
    <div class="badges">
      <a href="https://github.com/ikomom/dsh-trade-chart">GitHub</a>
      <a href="https://www.npmjs.com/package/@ikonon/dsh-trade-chart">npm</a>
      <a href="https://github.com/ikomom/dsh-trade-chart/releases/tag/v0.3.0">Release v0.3.0</a>
    </div>
    <p>DeepSeek Harness 交易图表插件：对话内直接渲染 K线 / 折线 / 柱状 / 面积图、技术指标（EMA / BOLL / MACD / RSI / KDJ / MAVOL）、热点轮动矩阵与连板晋级图。纯自绘 SVG，零外部依赖。</p>
    <p class="hint">本页为纯静态 SVG，由真实客户端渲染器生成；滚轮缩放 / 拖动平移 / 十字光标等交互需在 DSH 对话内体验。图中数据为合成演示数据。</p>
  </header>
  ${cards}
  <footer>Generated by scripts/make-preview.mjs · dsh-trade-chart v0.3.0</footer>
</div>
</body>
</html>`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html, 'utf8');
console.log('已生成预览: ' + outFile + '（' + (html.length / 1024).toFixed(1) + ' KB，' + charts.length + ' 个示例）');

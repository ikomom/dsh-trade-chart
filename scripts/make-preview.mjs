/* 开发辅助：把新版 K线渲染器（含技术指标）输出为独立 SVG/HTML 预览，无需重启 DSH。
 * 运行：node scripts/make-preview.mjs [--out preview.html]
 * 原理：以最小 React 桩执行 lib/client.js 的 TradeChartCard，把生成的元素树序列化为 SVG。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outFile = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : join(root, 'preview.html');

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

function renderToSvg(chart, title) {
  const block = { kind: 'r', callId: 'c1', call: { name: 'trade_chart', argsRaw: JSON.stringify({ chart }) }, content: [], isError: false };
  const tree = renderElement(TradeChartCard({ block }));
  // 找 tc-chart-wrap（含图例 + svg + 底部最新价）；找不到则退回 svg 节点
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

// ---- 演示数据：90 根日K（12→27 上涨后回调）----
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

const charts = [
  { title: '全指标：EMA + BOLL + MAVOL + MACD + RSI + KDJ', chart: { type: 'kline', title: '示例标的 日K（全指标）', symbol: 'DEMO.SH', period: '日K', unit: '元', indicators: { ema: [12, 26], boll: true, mavol: [5, 10], macd: true, rsi: [6, 12, 24], kdj: true }, pivots: true, kline: bars } },
  { title: '只开 MACD + RSI 副图（无主图叠加）', chart: { type: 'kline', title: '示例标的 日K（MACD+RSI）', symbol: 'DEMO.SH', period: '日K', unit: '元', ma: [], indicators: { macd: true, rsi: [14] }, kline: bars } },
];

const svgs = charts.map((c) => renderToSvg(c.chart, c.title));
const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<title>dsh-trade-chart v0.3.0 预览</title>
<style>
  body { background:#1b1f27; color:#e5e7eb; font-family: system-ui, sans-serif; padding:24px; }
  h1 { font-size:18px; }
  h2 { font-size:14px; color:#9ca3af; margin:28px 0 8px; }
  .card { background:#242a35; border:1px solid #3a4152; border-radius:12px; padding:12px; max-width:900px; }
  svg { width:100%; height:auto; display:block; }
  .hint { font-size:12px; color:#6b7280; margin-top:6px; }
</style>
</head>
<body>
<h1>dsh-trade-chart v0.3.0 — 技术指标渲染预览</h1>
<p class="hint">由 scripts/make-preview.mjs 通过真实 client 渲染器生成（静态 SVG，交互缩放/平移需在 DSH 对话内体验）</p>
${charts.map((c, i) => `<h2>${c.title}</h2><div class="card">${svgs[i]}</div>`).join('\n')}
</body>
</html>`;

writeFileSync(outFile, html, 'utf8');
console.log('已生成预览: ' + outFile + '（' + (html.length / 1024).toFixed(1) + ' KB）');

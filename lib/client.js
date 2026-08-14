/* @ikonon/dsh-trade-chart client — 对话内交易图表卡片（纯 SVG，无外部依赖）。
 * 功能：K线/折线/柱状/面积图渲染 + 波段自动标注（pivots）+ 自由标注
 * （pivot/hline/trendline/arrow/rect/note）+ 图上手绘工具栏 + 鼠标缩放平移
 * （滚轮缩放 / 拖动平移 / 双击复位，窗口内自适应聚合）。 */
window.__ModuleLoader__.load({
	id: "@ikonon/dsh-trade-chart",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		"use strict";
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.inject = void 0;
		exports.apply = apply;

		const React = require("react");

		// ---------- 常量 ----------
		const UP_COLOR = '#e5484d';
		const DOWN_COLOR = '#2f9e6e';
		const MA_PALETTE = ['#f5a524', '#3b82f6', '#a855f7', '#10b981', '#ec4899'];
		const SERIES_PALETTE = ['#3b82f6', '#f5a524', '#a855f7', '#10b981', '#ec4899', '#e5484d', '#f97316'];
		const MARK_COLORS = {
			pivotHigh: '#e5484d',
			pivotLow: '#2f9e6e',
			hline: '#3b82f6',
			trendline: '#f5a524',
			arrow: '#f97316',
			rect: '#a855f7',
			note: 'var(--dsw-alias-label-primary)',
		};
		const TYPE_LABELS = { kline: 'K线图', line: '折线图', bar: '柱状图', area: '面积图' };
		const TOOLBAR = [
			{ id: 'select', label: '⌖', title: '查看 / 拖动平移' },
			{ id: 'line', label: '╱', title: '趋势线（拖拽两点）' },
			{ id: 'arrow', label: '➔', title: '箭头（拖拽两点）' },
			{ id: 'rect', label: '▭', title: '区间矩形（拖拽两点）' },
			{ id: 'hline', label: '―', title: '水平线（支撑/压力）' },
			{ id: 'note', label: 'Ｔ', title: '文字注释（点击输入）' },
			{ id: 'erase', label: '✕', title: '删除标注（点击标注）' },
		];
		const CARD_CSS = [
			'.tc-card{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);margin:4px 0 4px 4px;padding:10px 12px 12px}',
			'.tc-head{display:flex;align-items:baseline;gap:10px;min-width:0}',
			'.tc-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.tc-sub{font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
			'.tc-state{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-tertiary);animation:tcPulse 1.6s ease-in-out infinite}',
			'@keyframes tcPulse{0%,100%{opacity:.45}50%{opacity:1}}',
			'.tc-chart-wrap{position:relative;width:100%}',
			'.tc-chart{display:block;width:100%;height:auto;user-select:none;-webkit-user-select:none}',
			'.tc-top{display:flex;align-items:center;gap:10px;margin:2px 0 4px}',
			'.tc-top .tc-legend{margin:0}',
			'.tc-legend{display:flex;flex-wrap:wrap;gap:10px;margin:2px 0 4px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
			'.tc-legend-item{display:inline-flex;align-items:center;gap:4px}',
			'.tc-dot{width:8px;height:8px;border-radius:50%;display:inline-block}',
			'.tc-tools{display:flex;align-items:center;gap:4px;margin-left:auto;flex:none}',
			'.tc-tool{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 4px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;cursor:pointer;user-select:none;font-family:inherit}',
			'.tc-tool:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.tc-tool[data-active]{background:var(--dsw-alias-interactive-bg-hover-accent);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
			'.tc-copy{margin-left:4px;padding:0 8px;font-size:11px}',
			'.tc-tip{position:absolute;pointer-events:none;z-index:5;min-width:170px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 94%,transparent);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 9px;font-size:12px;line-height:1.65;color:var(--dsw-alias-label-primary);box-shadow:0 4px 14px rgba(0,0,0,.18);white-space:nowrap}',
			'.tc-last{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:2px}',
			'.tc-err{font-size:12px;color:var(--dsw-alias-state-error-primary)}',
			'.tc-fallback{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
			'.tc-pre{background:var(--dsw-alias-markdown-code-block);border-radius:8px;padding:8px 10px;margin:6px 0 0;font-family:var(--ds-font-family-code);font-size:12px;white-space:pre-wrap;word-break:break-word;max-height:180px;overflow:auto;color:var(--dsw-alias-label-secondary)}',
		].join('');
		const CSS_TAG = "@ikonon/dsh-trade-chart/trade-chart.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@ikonon/dsh-trade-chart";
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = CARD_CSS;
			document.head.appendChild(tag);
		}

		// ---------- 工具函数 ----------
		function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
		function fmtPrice(v) { if (typeof v !== 'number' || !isFinite(v)) return '—'; return v.toFixed(Math.abs(v) >= 1 ? 2 : 4); }
		function fmtVol(v) {
			if (typeof v !== 'number' || !isFinite(v)) return '—';
			const a = Math.abs(v);
			if (a >= 1e8) return (v / 1e8).toFixed(2) + '亿';
			if (a >= 1e4) return (v / 1e4).toFixed(2) + '万';
			return String(Math.round(v));
		}
		function niceStep(range, count) {
			if (!(range > 0) || !isFinite(range)) return 1;
			const raw = range / Math.max(1, count);
			const mag = Math.pow(10, Math.floor(Math.log10(raw)));
			const mults = [1, 2, 2.5, 5, 10];
			for (let i = 0; i < mults.length; i++) if (raw <= mults[i] * mag) return mults[i] * mag;
			return 10 * mag;
		}
		function ticks(min, max, count) {
			const step = niceStep(max - min, count);
			const out = [];
			const start = Math.floor(min / step) * step;
			for (let v = start; v <= max + step * 1e-6; v += step) out.push(v);
			return out;
		}
		function shortTime(s) { if (typeof s !== 'string') return ''; const m = s.match(/^\d{4}-\d{2}-\d{2}/); return m ? s.slice(5, 10) : s.slice(0, 8); }
		function fullTime(s) { return typeof s === 'string' ? s.replace('T', ' ').slice(0, 16) : ''; }
		function maValues(closes, period) {
			const out = new Array(closes.length).fill(null);
			let sum = 0;
			for (let i = 0; i < closes.length; i++) {
				sum += closes[i];
				if (i >= period) sum -= closes[i - period];
				if (i >= period - 1) out[i] = sum / period;
			}
			return out;
		}
		function polyPath(vals, x, y) {
			let d = '';
			let started = false;
			for (let i = 0; i < vals.length; i++) {
				const v = vals[i];
				if (v === null || v === undefined) { started = false; continue; }
				d += (started ? 'L' : 'M') + x(i).toFixed(2) + ',' + y(v).toFixed(2);
				started = true;
			}
			return d;
		}
		function parseSpec(block) {
			if (!block || typeof block !== 'object') return { spec: null, raw: '' };
			const done = 'kind' in block;
			const raw = done ? (block.call && block.call.argsRaw) || '' : block.argsRaw || '';
			if (typeof raw !== 'string' || raw === '') return { spec: null, raw: '' };
			try {
				const p = JSON.parse(raw);
				if (p && typeof p === 'object' && p.chart && typeof p.chart === 'object') return { spec: p.chart, raw };
			} catch (e) { /* 忽略解析错误 */ }
			return { spec: null, raw };
		}
		function findPivots(kline, lookback) {
			const highs = [], lows = [];
			for (let i = lookback; i < kline.length - lookback; i++) {
				const h = kline[i].high;
				let isHigh = h > kline[i - 1].high;
				if (isHigh) {
					for (let j = i + 1; j <= i + lookback; j++) {
						if (kline[j].high >= h) { isHigh = false; break; }
					}
				}
				if (isHigh) highs.push({ i, time: kline[i].time, price: h });
				const l = kline[i].low;
				let isLow = l < kline[i - 1].low;
				if (isLow) {
					for (let j = i + 1; j <= i + lookback; j++) {
						if (kline[j].low <= l) { isLow = false; break; }
					}
				}
				if (isLow) lows.push({ i, time: kline[i].time, price: l });
			}
			return [...highs.map((p) => ({ ...p, kind: 'high' })), ...lows.map((p) => ({ ...p, kind: 'low' }))];
		}
		function pointSegDist(px, py, x1, y1, x2, y2) {
			const dx = x2 - x1, dy = y2 - y1;
			const len2 = dx * dx + dy * dy;
			const t = len2 === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
			return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
		}
		function copyText(text) {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).catch(() => { /* 忽略 */ });
			} else {
				try {
					const ta = document.createElement('textarea');
					ta.value = text;
					ta.style.position = 'fixed';
					ta.style.opacity = '0';
					document.body.appendChild(ta);
					ta.select();
					document.execCommand('copy');
					document.body.removeChild(ta);
				} catch (e) { /* 忽略 */ }
			}
		}
		/** 缩放计算：以 anchorRaw 为锚点，返回新窗口 {start,end}；放大到全览时返回 null。 */
		function zoomView(view, anchorRaw, factor, origN, minLen) {
			const start = view !== null ? view.start : 0;
			const len = (view !== null ? view.end : origN) - start;
			const newLen = clamp(Math.round(len * factor), minLen, origN);
			if (newLen >= origN) return null;
			const ratio = clamp((anchorRaw - start) / Math.max(1, len), 0, 1);
			let newStart = Math.round(anchorRaw - newLen * ratio);
			newStart = clamp(newStart, 0, origN - newLen);
			return { start: newStart, end: newStart + newLen };
		}

		// ---------- K线图 ----------
		function KlineChart(props) {
			const spec = props.spec;
			const [hover, setHover] = React.useState(null);
			const [tool, setTool] = React.useState('select');
			const [drawing, setDrawing] = React.useState(null);
			const [marks, setMarks] = React.useState([]);
			const [copied, setCopied] = React.useState(false);
			const [view, setView] = React.useState(null); // {start,end} 原始索引；null=全览
			const [pan, setPan] = React.useState(null);   // 平移中 {startRaw,len,anchorRaw}
			const svgRef = React.useRef(null);
			const viewRef = React.useRef(null);
			viewRef.current = view;

			const allData = (Array.isArray(spec.kline) ? spec.kline : []).filter((c) =>
				c && typeof c === 'object' && typeof c.time === 'string' &&
				['open', 'high', 'low', 'close'].every((f) => typeof c[f] === 'number' && isFinite(c[f]))
			);
			const origN = allData.length;
			if (origN === 0) return React.createElement('div', { className: 'tc-fallback' }, '没有可渲染的K线数据');
			// 视图窗口（原始索引空间）
			const vStart = view !== null ? clamp(Math.round(view.start), 0, origN - 1) : 0;
			const vEnd = view !== null ? clamp(Math.round(view.end), vStart + 1, origN) : origN;
			const zoomed = vStart > 0 || vEnd < origN;
			const wData = allData.slice(vStart, vEnd);
			const wLen = wData.length;
			// 窗口内自适应聚合：>800 根按系数合并（保形：首开末收/区间极值/量能求和）
			const AGG_TARGET = 800;
			const aggK = wLen > AGG_TARGET ? Math.ceil(wLen / AGG_TARGET) : 1;
			let kline = wData;
			if (aggK > 1) {
				const agg = [];
				for (let s = 0; s < wLen; s += aggK) {
					const seg = wData.slice(s, Math.min(s + aggK, wLen));
					let hi = -Infinity, lo = Infinity, vol = 0;
					for (const c of seg) {
						if (c.high > hi) hi = c.high;
						if (c.low < lo) lo = c.low;
						if (typeof c.volume === 'number' && isFinite(c.volume)) vol += c.volume;
					}
					agg.push({ time: seg[0].time, timeEnd: seg[seg.length - 1].time, open: seg[0].open, high: hi, low: lo, close: seg[seg.length - 1].close, volume: vol });
				}
				kline = agg;
			}
			const n = kline.length;
			const periods = Array.isArray(spec.ma) && spec.ma.length > 0
				? spec.ma.filter((p) => typeof p === 'number' && p >= 2 && Math.floor(p) === p)
				: [5, 10, 20];
			const closes = kline.map((c) => c.close);
			const maSeries = periods.map((p, pi) => ({ period: p, color: MA_PALETTE[pi % MA_PALETTE.length], vals: maValues(closes, p) }));
			const W = 760, L = 10, R = 70, T = 10, B = 22, GAP = 12;
			const priceH = 250, volH = 78;
			const plotW = W - L - R;
			const H = T + priceH + GAP + volH + B;
			let lo = Infinity, hi = -Infinity;
			kline.forEach((c) => { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high; });
			maSeries.forEach((ms) => ms.vals.forEach((v) => { if (v !== null && v < lo) lo = v; if (v !== null && v > hi) hi = v; }));
			let pad = (hi - lo) * 0.05;
			if (!(pad > 0)) pad = Math.abs(hi) * 0.02 + 0.01;
			const yMin = lo - pad, yMax = hi + pad;
			let maxVol = 0;
			kline.forEach((c) => { const v = typeof c.volume === 'number' && isFinite(c.volume) ? c.volume : 0; if (v > maxVol) maxVol = v; });
			if (!(maxVol > 0)) maxVol = 1;
			const x = (i) => L + (i + 0.5) * plotW / n;
			const y = (v) => T + (yMax - v) / (yMax - yMin) * priceH;
			const volBase = T + priceH + GAP + volH - 3;
			const yv = (v) => volBase - v / maxVol * (volH - 8);
			const cw = plotW / n;
			const bodyW = Math.max(1, Math.min(14, cw * 0.62));
			const unit = typeof spec.unit === 'string' && spec.unit !== '' ? ' ' + spec.unit : '';
			const pxToIndex = (px) => clamp(Math.round((px - L) / plotW * n - 0.5), 0, n - 1);
			const pyToPrice = (py) => yMax - (py - T) / priceH * (yMax - yMin);
			// 原始索引 ↔ 渲染索引
			const toRaw = (vi) => vStart + vi * aggK;
			const toView = (rawI) => {
				if (rawI < vStart || rawI >= vEnd) return null;
				return Math.floor((rawI - vStart) / aggK);
			};
			const toData = (e) => {
				const rect = e.currentTarget.getBoundingClientRect();
				if (rect.width <= 0) return null;
				const px = (e.clientX - rect.left) * W / rect.width;
				const py = (e.clientY - rect.top) * H / rect.height;
				const vi = pxToIndex(px);
				return { i: vi, rawI: toRaw(vi), price: pyToPrice(py), px, py };
			};

			// ---- 滚轮缩放（原生监听，preventDefault 生效）----
			React.useEffect(() => {
				const el = svgRef.current;
				if (el === null) return;
				const onWheel = (e) => {
					e.preventDefault();
					const rect = el.getBoundingClientRect();
					if (rect.width <= 0) return;
					const v = viewRef.current;
					const curStart = v !== null ? v.start : 0;
					const curLen = (v !== null ? v.end : origN) - curStart;
					const px = (e.clientX - rect.left) * W / rect.width;
					const ratio = clamp((px - L) / plotW, 0, 1);
					const anchorRaw = curStart + ratio * curLen;
					const factor = e.deltaY < 0 ? 1 / 1.25 : 1.25;
					setView(zoomView(v, anchorRaw, factor, origN, 10));
				};
				el.addEventListener('wheel', onWheel, { passive: false });
				return () => el.removeEventListener('wheel', onWheel);
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, []);

			// ---- 标注数据（统一存原始索引 rawI）----
			const pivotsOn = spec.pivots === true || (spec.pivots !== null && typeof spec.pivots === 'object');
			const lookback = typeof spec.pivotLookback === 'number'
				? clamp(Math.floor(spec.pivotLookback), 2, 30)
				: spec.pivots && typeof spec.pivots === 'object' && typeof spec.pivots.lookback === 'number'
					? clamp(Math.floor(spec.pivots.lookback), 2, 30)
					: 3;
			const autoPivots = pivotsOn
				? findPivots(wData, lookback).map((p) => ({ type: 'pivot', rawI: vStart + p.i, price: p.price, kind: p.kind, auto: true }))
				: [];
			const normalizePoint = (p) => {
				if (!p || typeof p !== 'object') return null;
				if (typeof p.i === 'number' && p.i >= 0 && p.i < origN) return { rawI: Math.floor(p.i), price: p.price };
				if (typeof p.time === 'string') {
					for (let j = 0; j < origN; j++) {
						if (allData[j].time === p.time) return { rawI: j, price: p.price };
					}
					// 兜底：聚合模式下 time 落在聚合段区间内
					if (aggK > 1) {
						for (let j = 0; j < n; j++) {
							const c = kline[j];
							if (c.timeEnd !== undefined && p.time >= c.time && p.time <= c.timeEnd) return { rawI: toRaw(j), price: p.price };
						}
					}
				}
				return null;
			};
			const modelMarks = (Array.isArray(spec.annotations) ? spec.annotations : []).map((a) => {
				if (!a || typeof a !== 'object' || typeof a.type !== 'string') return null;
				const at = a.time !== undefined || a.i !== undefined ? { time: a.time, i: a.i, price: a.price } : null;
				switch (a.type) {
					case 'pivot': {
						const p = normalizePoint(at);
						if (!p || (a.kind !== 'high' && a.kind !== 'low')) return null;
						return { type: 'pivot', rawI: p.rawI, price: p.price, kind: a.kind, label: a.label, color: a.color };
					}
					case 'hline': {
						if (typeof a.price !== 'number' || !isFinite(a.price)) return null;
						return { type: 'hline', price: a.price, label: a.label, color: a.color };
					}
					case 'note': {
						const p = normalizePoint(at);
						if (!p || typeof a.text !== 'string') return null;
						return { type: 'note', rawI: p.rawI, price: p.price, text: a.text, color: a.color };
					}
					case 'trendline': case 'arrow': case 'rect': {
						const f = normalizePoint(a.from), t = normalizePoint(a.to);
						if (!f || !t) return null;
						return { type: a.type, from: f, to: t, label: a.label, color: a.color };
					}
					default: return null;
				}
			}).filter(Boolean);

			// ---- 标注渲染（按当前视图映射；窗口外不渲染）----
			const markEls = (mk, mi, preview) => {
				const out = [];
				const color = mk.color || MARK_COLORS[mk.type === 'pivot' ? (mk.kind === 'high' ? 'pivotHigh' : 'pivotLow') : mk.type] || '#888';
				const dash = preview ? '4 3' : undefined;
				const opacity = preview ? 0.7 : 1;
				const labelColor = 'var(--dsw-alias-label-secondary)';
				switch (mk.type) {
					case 'pivot': {
						const vi = toView(mk.rawI);
						if (vi === null) return out;
						const px = x(vi), py = y(mk.price);
						const up = mk.kind === 'high';
						out.push(React.createElement('path', {
							key: 'mk' + mi, d: up ? `M${px - 5},${py}L${px + 5},${py}L${px},${py - 8}Z` : `M${px - 5},${py}L${px + 5},${py}L${px},${py + 8}Z`,
							fill: color, stroke: 'rgba(255,255,255,0.7)', strokeWidth: 0.5, opacity,
						}));
						out.push(React.createElement('text', {
							key: 'mkl' + mi, x: px, y: up ? py - 11 : py + 21, fontSize: 10,
							fill: labelColor, textAnchor: 'middle', opacity,
						}, mk.label !== undefined && mk.label !== '' ? mk.label : fmtPrice(mk.price)));
						break;
					}
					case 'hline': {
						const py = y(mk.price);
						out.push(React.createElement('line', {
							key: 'mk' + mi, x1: L, y1: py, x2: W - R, y2: py, stroke: color,
							strokeWidth: 1.2, strokeDasharray: dash, opacity,
						}));
						if (mk.label !== undefined && mk.label !== '') {
							out.push(React.createElement('text', {
								key: 'mkl' + mi, x: W - R, y: py - 4, fontSize: 10, fill: color,
								textAnchor: 'end', opacity,
							}, mk.label));
						}
						break;
					}
					case 'trendline': case 'arrow': {
						const fi = toView(mk.from.rawI), ti = toView(mk.to.rawI);
						if (fi === null || ti === null) return out;
						const fx = x(fi), fy = y(mk.from.price);
						const tx = x(ti), ty = y(mk.to.price);
						out.push(React.createElement('line', {
							key: 'mk' + mi, x1: fx, y1: fy, x2: tx, y2: ty, stroke: color,
							strokeWidth: 1.5, strokeDasharray: dash, opacity,
						}));
						if (mk.type === 'arrow') {
							const ang = Math.atan2(ty - fy, tx - fx);
							const a1 = ang + 0.45, a2 = ang - 0.45, len = 9;
							out.push(React.createElement('path', {
								key: 'mka' + mi,
								d: `M${tx},${ty}L${tx - len * Math.cos(a1)},${ty - len * Math.sin(a1)}L${tx - len * Math.cos(a2)},${ty - len * Math.sin(a2)}Z`,
								fill: color, stroke: 'none', opacity,
							}));
						}
						if (mk.label !== undefined && mk.label !== '') {
							out.push(React.createElement('text', {
								key: 'mkl' + mi, x: (fx + tx) / 2, y: (fy + ty) / 2 - 6, fontSize: 10,
								fill: labelColor, textAnchor: 'middle', opacity,
							}, mk.label));
						}
						break;
					}
					case 'rect': {
						const fi = toView(mk.from.rawI), ti = toView(mk.to.rawI);
						if (fi === null || ti === null) return out;
						const rx1 = Math.min(x(fi), x(ti)), rx2 = Math.max(x(fi), x(ti));
						const ry1 = Math.min(y(mk.from.price), y(mk.to.price)), ry2 = Math.max(y(mk.from.price), y(mk.to.price));
						out.push(React.createElement('rect', {
							key: 'mk' + mi, x: rx1, y: ry1, width: Math.max(1, rx2 - rx1), height: Math.max(1, ry2 - ry1),
							fill: color, fillOpacity: 0.12, stroke: color, strokeWidth: 1.2,
							strokeDasharray: dash, opacity,
						}));
						if (mk.label !== undefined && mk.label !== '') {
							out.push(React.createElement('text', {
								key: 'mkl' + mi, x: rx1 + 4, y: ry1 + 12, fontSize: 10, fill: color, opacity,
							}, mk.label));
						}
						break;
					}
					case 'note': {
						const vi = toView(mk.rawI);
						if (vi === null) return out;
						const px = x(vi), py = y(mk.price);
						const ty = Math.max(T + 8, py - 16);
						out.push(React.createElement('circle', { key: 'mk' + mi, cx: px, cy: py, r: 3, fill: color, stroke: 'rgba(255,255,255,0.7)', strokeWidth: 0.5, opacity }));
						out.push(React.createElement('line', { key: 'mkl' + mi, x1: px + 3, y1: py, x2: px + 12, y2: ty, stroke: color, strokeWidth: 1, opacity }));
						const text = String(mk.text || '').slice(0, 24);
						out.push(React.createElement('text', {
							key: 'mkt' + mi, x: px + 15, y: ty + 3, fontSize: 11, fill: labelColor, opacity,
						}, text));
						break;
					}
				}
				return out;
			};

			// ---- 事件：hover / 平移 / 绘制 / 删除 ----
			const onMove = (e) => {
				const rect = e.currentTarget.getBoundingClientRect();
				if (rect.width <= 0) return;
				const d = toData(e);
				if (d === null) return;
				if (pan !== null) {
					// 平移中：按按下时的像素位移换算窗口偏移（与视图无关，避免反馈振荡抖动），并隐藏十字线/提示
					const deltaIdx = Math.round((d.px - pan.startPx) / plotW * pan.len);
					const newStart = clamp(pan.startRaw + deltaIdx, 0, origN - pan.len);
					setView({ start: newStart, end: newStart + pan.len });
					return;
				}
				// hover 存原始索引，窗口变化后经 toView 映射，避免越界崩溃
				setHover({ idx: d.i, rawI: d.rawI, px: d.px, py: d.py, w: rect.width });
				if (drawing !== null) {
					setDrawing({ ...drawing, to: { rawI: d.rawI, price: d.price } });
				}
			};
			const onDown = (e) => {
				const d = toData(e);
				if (d === null) return;
				if (tool === 'select') {
					setHover(null);
					setPan({ startRaw: vStart, len: wLen, startPx: d.px });
					return;
				}
				if (tool === 'erase') return;
				if (tool === 'note') {
					const text = window.prompt('标注文字：');
					if (text !== null && text.trim() !== '') {
						setMarks([...marks, { type: 'note', rawI: d.rawI, price: d.price, text: text.trim() }]);
					}
					return;
				}
				setDrawing({ type: tool, from: { rawI: d.rawI, price: d.price }, to: { rawI: d.rawI, price: d.price } });
			};
			const onUp = (e) => {
				if (pan !== null) { setPan(null); return; }
				if (tool === 'erase') {
					const d = toData(e);
					if (d === null) return;
					let bestIdx = -1, bestDist = 14;
					marks.forEach((m, idx) => {
						let dist;
						if (m.type === 'hline') dist = Math.abs(d.py - y(m.price));
						else if (m.type === 'rect') {
							const fi = toView(m.from.rawI), ti = toView(m.to.rawI);
							if (fi === null || ti === null) return;
							const x1 = Math.min(x(fi), x(ti)), x2 = Math.max(x(fi), x(ti));
							const y1 = Math.min(y(m.from.price), y(m.to.price)), y2 = Math.max(y(m.from.price), y(m.to.price));
							dist = (d.px >= x1 && d.px <= x2 && d.py >= y1 && d.py <= y2) ? 0 : Math.min(Math.abs(d.px - x1), Math.abs(d.px - x2), Math.abs(d.py - y1), Math.abs(d.py - y2));
						} else {
							const fi = toView(m.from.rawI), ti = toView(m.to.rawI);
							if (fi === null || ti === null) return;
							dist = pointSegDist(d.px, d.py, x(fi), y(m.from.price), x(ti), y(m.to.price));
						}
						if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
					});
					if (bestIdx >= 0) setMarks(marks.filter((_, idx) => idx !== bestIdx));
					return;
				}
				if (drawing === null) return;
				const d = toData(e);
				if (d === null) return;
				const mk = { ...drawing, to: { rawI: d.rawI, price: d.price } };
				if (mk.type === 'hline') {
					setMarks([...marks, { type: 'hline', price: mk.to.price }]);
				} else if (Math.abs(mk.to.rawI - mk.from.rawI) >= 1 || Math.abs(mk.to.price - mk.from.price) > 0.0001) {
					setMarks([...marks, mk]);
				}
				setDrawing(null);
			};
			const onDoubleClick = () => {
				if (tool === 'select') setView(null);
			};
			const onCopy = () => {
				const pt = (p) => {
					const o = {};
					if (p && p.rawI !== undefined && allData[p.rawI] !== undefined) o.time = allData[p.rawI].time;
					if (p) o.price = p.price;
					return o;
				};
				const out = [...modelMarks, ...marks].map((m) => {
					switch (m.type) {
						case 'pivot': {
							const o = { type: 'pivot', kind: m.kind, ...pt({ rawI: m.rawI, price: m.price }) };
							if (m.label !== undefined) o.label = m.label;
							if (m.color !== undefined) o.color = m.color;
							return o;
						}
						case 'hline': {
							const o = { type: 'hline', price: m.price };
							if (m.label !== undefined) o.label = m.label;
							if (m.color !== undefined) o.color = m.color;
							return o;
						}
						case 'note': return { type: 'note', ...pt({ rawI: m.rawI, price: m.price }), text: m.text };
						case 'trendline': case 'arrow': case 'rect': {
							const o = { type: m.type, from: pt(m.from), to: pt(m.to) };
							if (m.label !== undefined) o.label = m.label;
							if (m.color !== undefined) o.color = m.color;
							return o;
						}
						default: return null;
					}
				}).filter(Boolean);
				copyText(JSON.stringify(out));
				setCopied(true);
				window.setTimeout(() => setCopied(false), 1500);
			};

			// ---- 静态元素 ----
			const yTicks = ticks(yMin, yMax, 5);
			const xStep = Math.max(1, Math.ceil(n / 6));
			const els = [];
			yTicks.forEach((tv) => {
				els.push(React.createElement('line', { key: 'gl' + tv, x1: L, y1: y(tv), x2: W - R, y2: y(tv), stroke: 'rgba(128,128,128,0.18)', strokeWidth: 1 }));
				els.push(React.createElement('text', { key: 'gt' + tv, x: W - R + 6, y: y(tv) + 4, fontSize: 11, fill: 'rgba(128,128,128,0.85)' }, fmtPrice(tv) + unit));
			});
			for (let i = 0; i < n; i += xStep) {
				els.push(React.createElement('text', { key: 'xl' + i, x: x(i), y: H - 6, fontSize: 11, fill: 'rgba(128,128,128,0.85)', textAnchor: 'middle' }, shortTime(kline[i].time)));
			}
			kline.forEach((c, i) => {
				const col = c.close >= c.open ? UP_COLOR : DOWN_COLOR;
				const v = typeof c.volume === 'number' && isFinite(c.volume) ? c.volume : 0;
				els.push(React.createElement('rect', { key: 'v' + i, x: x(i) - bodyW / 2, y: yv(v), width: bodyW, height: Math.max(0.5, volBase - yv(v)), fill: col, opacity: 0.5 }));
			});
			kline.forEach((c, i) => {
				const col = c.close >= c.open ? UP_COLOR : DOWN_COLOR;
				els.push(React.createElement('line', { key: 'w' + i, x1: x(i), y1: y(c.high), x2: x(i), y2: y(c.low), stroke: col, strokeWidth: 1 }));
				const top = y(Math.max(c.open, c.close));
				const h = Math.max(1, Math.abs(y(c.open) - y(c.close)));
				els.push(React.createElement('rect', { key: 'b' + i, x: x(i) - bodyW / 2, y: top, width: bodyW, height: h, fill: col }));
			});
			maSeries.forEach((ms) => {
				els.push(React.createElement('path', { key: 'ma' + ms.period, d: polyPath(ms.vals, x, y), fill: 'none', stroke: ms.color, strokeWidth: 1.5, strokeLinejoin: 'round' }));
			});
			// 标注（模型 + 自动波段 + 手绘 + 绘制预览）
			const allMarks = [...modelMarks, ...autoPivots, ...marks];
			allMarks.forEach((mk, mi) => { els.push(...markEls(mk, mi, false)); });
			if (drawing !== null) {
				const prev = drawing.type === 'hline'
					? { type: 'hline', price: (drawing.to || drawing.from).price }
					: { ...drawing, to: drawing.to || drawing.from };
				els.push(...markEls(prev, 'prev', true));
			}
			// 十字光标（按当前视图映射；窗口外不显示）
			const hoverVi = hover !== null ? toView(hover.rawI) : null;
			if (hoverVi !== null) {
				els.push(React.createElement('line', { key: 'cx', x1: x(hoverVi), y1: T, x2: x(hoverVi), y2: volBase + 3, stroke: 'rgba(128,128,128,0.5)', strokeWidth: 1, strokeDasharray: '3 3' }));
			}

			// ---- 底部：最新价（始终取原始最新一根）+ 视图信息 ----
			const lastC = allData[origN - 1];
			const prevC = origN > 1 ? allData[origN - 2] : null;
			const chgC = prevC ? (lastC.close - prevC.close) / prevC.close * 100 : null;
			const footer = React.createElement('div', { className: 'tc-last' }, [
				React.createElement('span', { key: 'f0' }, '最新 ' + fullTime(lastC.time) + ' '),
				React.createElement('b', { key: 'f1', style: { color: lastC.close >= lastC.open ? UP_COLOR : DOWN_COLOR } }, fmtPrice(lastC.close) + unit),
				React.createElement('span', { key: 'f2' }, (chgC === null ? '' : '（' + (chgC >= 0 ? '+' : '') + chgC.toFixed(2) + '%）') + ' 量 ' + fmtVol(lastC.volume)),
				zoomed ? React.createElement('span', { key: 'f3' }, '  ·  显示 ' + shortTime(wData[0].time) + ' ~ ' + shortTime(wData[wLen - 1].time) + '（' + wLen + '/' + origN + ' 根，滚轮缩放/拖动平移）') : null,
				aggK > 1 ? React.createElement('span', { key: 'f4' }, '  ·  聚合显示（' + wLen + ' → ' + n + '）') : null,
			]);

			// ---- 悬浮提示 ----
			const ti = hoverVi !== null ? hoverVi : n - 1;
			const c = kline[ti];
			const prev = ti > 0 ? kline[ti - 1] : null;
			const chg = prev ? (c.close - prev.close) / prev.close * 100 : null;
			const tipLines = [
				React.createElement('div', { key: 't0' }, React.createElement('b', null, aggK > 1 && c.timeEnd !== undefined ? fullTime(c.time) + ' ~ ' + fullTime(c.timeEnd) : fullTime(c.time))),
				React.createElement('div', { key: 't1' }, '开 ', fmtPrice(c.open), '  高 ', fmtPrice(c.high), '  低 ', fmtPrice(c.low), '  收 ',
					React.createElement('b', { style: { color: c.close >= c.open ? UP_COLOR : DOWN_COLOR } }, fmtPrice(c.close))),
				React.createElement('div', { key: 't2' }, '涨跌 ', chg === null ? '—' : (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%', '  量 ', fmtVol(c.volume)),
			];
			maSeries.forEach((ms) => {
				const mv = ms.vals[ti];
				if (mv !== null) tipLines.push(React.createElement('div', { key: 'tma' + ms.period }, React.createElement('span', { style: { color: ms.color } }, 'MA' + ms.period + ' '), fmtPrice(mv)));
			});
			let tipStyle = null;
			if (hoverVi !== null) {
				const flip = hover.w - hover.px < 240;
				tipStyle = { left: (flip ? hover.px - 236 : hover.px + 12) + 'px', top: Math.max(4, hover.py - 30) + 'px' };
			}

			// ---- 顶部行：图例 + 工具栏 ----
			const legend = React.createElement('div', { className: 'tc-legend' }, maSeries.map((ms) =>
				React.createElement('span', { key: 'lg' + ms.period, className: 'tc-legend-item' },
					React.createElement('span', { className: 'tc-dot', style: { background: ms.color } }), 'MA' + ms.period)
			));
			const tools = React.createElement('div', { className: 'tc-tools' }, [
				...TOOLBAR.map((tb) =>
					React.createElement('button', {
						key: tb.id, className: 'tc-tool', title: tb.title, type: 'button',
						'data-active': tool === tb.id || undefined,
						onClick: () => setTool(tool === tb.id ? 'select' : tb.id),
					}, tb.label)
				),
				React.createElement('button', {
					key: 'reset', className: 'tc-tool', type: 'button', title: '复位视图（双击图表也可复位）',
					'data-active': zoomed || undefined,
					onClick: () => setView(null),
				}, '⟲'),
				React.createElement('button', {
					key: 'copy', className: 'tc-tool tc-copy', type: 'button',
					title: '把所有标注（含手绘）复制为 trade_chart 的 annotations JSON，粘贴到对话即可固化',
					onClick: onCopy,
				}, copied ? '✓ 已复制' : '⧉ 复制标注'),
			]);
			const topRow = React.createElement('div', { className: 'tc-top' }, legend, tools);

			return React.createElement('div', { className: 'tc-chart-wrap' },
				topRow,
				React.createElement('svg', {
					ref: svgRef,
					className: 'tc-chart', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet',
					style: { cursor: tool === 'select' ? (pan !== null ? 'grabbing' : 'grab') : 'crosshair' },
					onMouseMove: onMove, onMouseLeave: () => { setHover(null); setPan(null); },
					onMouseDown: onDown, onMouseUp: onUp, onDoubleClick: onDoubleClick,
				}, els),
				hoverVi !== null ? React.createElement('div', { className: 'tc-tip', style: tipStyle }, tipLines) : null,
				footer
			);
		}

		// ---------- 折线/柱状/面积图 ----------
		function SimpleChart(props) {
			const spec = props.spec;
			const type = spec.type;
			const [hover, setHover] = React.useState(null);
			const cats = Array.isArray(spec.categories) ? spec.categories : null;
			const rawSeries = Array.isArray(spec.series) ? spec.series : [];
			const series = [];
			rawSeries.forEach((s, si) => {
				if (!s || typeof s !== 'object' || typeof s.name !== 'string') return;
				const color = typeof s.color === 'string' && s.color !== '' ? s.color : SERIES_PALETTE[si % SERIES_PALETTE.length];
				if (Array.isArray(s.data) && s.data.length > 0) { series.push({ name: s.name, color, values: s.data, xs: cats }); return; }
				if (Array.isArray(s.points) && s.points.length > 0) {
					const pts = s.points.filter((p) => p && typeof p === 'object' && typeof p.x === 'string' && typeof p.y === 'number' && isFinite(p.y));
					if (pts.length > 0) series.push({ name: s.name, color, values: pts.map((p) => p.y), xs: pts.map((p) => p.x) });
				}
			});
			if (series.length === 0) return React.createElement('div', { className: 'tc-fallback' }, '没有可渲染的序列数据');
			const labels = cats !== null ? cats : (series[0].xs !== null ? series[0].xs : null);
			let n = 0;
			series.forEach((s) => { if (s.values.length > n) n = s.values.length; });
			let lo = Infinity, hi = -Infinity;
			series.forEach((s) => s.values.forEach((v) => { if (typeof v === 'number' && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }));
			if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
			if (type === 'bar') { if (lo > 0) lo = 0; if (hi < 0) hi = 0; }
			if (lo === hi) { lo -= 1; hi += 1; }
			const pad = (hi - lo) * 0.08;
			const yMin = lo - pad;
			const yMax = hi + pad;
			const W = 760, L = 10, R = 70, T = 10, B = 24;
			const plotW = W - L - R;
			const plotH = 300;
			const H = T + plotH + B;
			const x = (i) => L + (i + 0.5) * plotW / n;
			const y = (v) => T + (yMax - v) / (yMax - yMin) * plotH;
			const yBase = y(0);
			const m = series.length;
			const groupW = plotW / n;
			const barW = type === 'bar' ? Math.max(1, Math.min(26, groupW * 0.7 / m)) : 0;
			// 大数据量抽稀：超过 2000 个点时每隔 step 个画一个（坐标不变，仅减少节点）
			const step = n > 2000 ? Math.ceil(n / 2000) : 1;
			const onMove = (e) => {
				const rect = e.currentTarget.getBoundingClientRect();
				if (rect.width <= 0) return;
				const relX = (e.clientX - rect.left) * W / rect.width;
				const idx = clamp(Math.round((relX - L) / plotW * n - 0.5), 0, n - 1);
				setHover({ idx, px: e.clientX - rect.left, py: e.clientY - rect.top, w: rect.width });
			};
			const yTicks = ticks(yMin, yMax, 5);
			const xStep = Math.max(1, Math.ceil(n / 8));
			const els = [];
			yTicks.forEach((tv) => {
				els.push(React.createElement('line', { key: 'gl' + tv, x1: L, y1: y(tv), x2: W - R, y2: y(tv), stroke: 'rgba(128,128,128,0.18)', strokeWidth: 1 }));
				els.push(React.createElement('text', { key: 'gt' + tv, x: W - R + 6, y: y(tv) + 4, fontSize: 11, fill: 'rgba(128,128,128,0.85)' }, fmtPrice(tv)));
			});
			for (let i = 0; i < n; i += xStep) {
				const lb = labels !== null && labels[i] !== undefined ? String(labels[i]).slice(0, 10) : String(i + 1);
				els.push(React.createElement('text', { key: 'xl' + i, x: x(i), y: H - 6, fontSize: 11, fill: 'rgba(128,128,128,0.85)', textAnchor: 'middle' }, lb));
			}
			series.forEach((s, si) => {
				const vals = s.values;
				if (type === 'bar') {
					for (let i = 0; i < vals.length; i += step) {
						const v = vals[i];
						if (typeof v !== 'number' || !isFinite(v)) continue;
						const bx = x(i) - groupW / 2 + (groupW - barW * m) / 2 + si * barW;
						const top = Math.min(y(v), yBase);
						const h = Math.max(1, Math.abs(y(v) - yBase));
						els.push(React.createElement('rect', { key: 'bar' + si + '_' + i, x: bx, y: top, width: barW, height: h, fill: s.color }));
					}
				} else {
					let d = '';
					let started = false;
					let first = -1, last = -1;
					for (let i = 0; i < vals.length; i += step) {
						const v = vals[i];
						if (typeof v !== 'number' || !isFinite(v)) { started = false; continue; }
						if (first < 0) first = i;
						last = i;
						d += (started ? 'L' : 'M') + x(i).toFixed(2) + ',' + y(v).toFixed(2);
						started = true;
					}
					if (d !== '') {
						if (type === 'area') {
							els.push(React.createElement('path', { key: 'ar' + si, d: d + 'L' + x(last).toFixed(2) + ',' + yBase.toFixed(2) + 'L' + x(first).toFixed(2) + ',' + yBase.toFixed(2) + 'Z', fill: s.color, opacity: 0.18, stroke: 'none' }));
						}
						els.push(React.createElement('path', { key: 'ln' + si, d, fill: 'none', stroke: s.color, strokeWidth: 1.8, strokeLinejoin: 'round' }));
						if (n <= 80) {
							for (let i = 0; i < vals.length; i += step) {
								const v = vals[i];
								if (typeof v !== 'number' || !isFinite(v)) continue;
								els.push(React.createElement('circle', { key: 'pt' + si + '_' + i, cx: x(i), cy: y(v), r: 2.6, fill: s.color }));
							}
						}
					}
				}
			});
			if (hover !== null) {
				els.push(React.createElement('line', { key: 'cx', x1: x(hover.idx), y1: T, x2: x(hover.idx), y2: T + plotH, stroke: 'rgba(128,128,128,0.5)', strokeWidth: 1, strokeDasharray: '3 3' }));
			}
			const ti = hover !== null ? hover.idx : n - 1;
			const tipLines = [
				React.createElement('div', { key: 't0' }, React.createElement('b', null, labels !== null && labels[ti] !== undefined ? fullTime(String(labels[ti])) : '#' + (ti + 1))),
			];
			series.forEach((s, si) => {
				const v = s.values[ti];
				tipLines.push(React.createElement('div', { key: 'ts' + si }, React.createElement('span', { style: { color: s.color } }, '● ' + s.name + ' '), typeof v === 'number' && isFinite(v) ? fmtPrice(v) : '—'));
			});
			let tipStyle = null;
			if (hover !== null) {
				const flip = hover.w - hover.px < 240;
				tipStyle = { left: (flip ? hover.px - 236 : hover.px + 12) + 'px', top: Math.max(4, hover.py - 30) + 'px' };
			}
			const legend = React.createElement('div', { className: 'tc-legend' }, series.map((s) =>
				React.createElement('span', { key: 'lg' + s.name, className: 'tc-legend-item' },
					React.createElement('span', { className: 'tc-dot', style: { background: s.color } }), s.name)
			));
			return React.createElement('div', { className: 'tc-chart-wrap' },
				legend,
				React.createElement('svg', { className: 'tc-chart', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet', onMouseMove: onMove, onMouseLeave: () => setHover(null) }, els),
				hover !== null ? React.createElement('div', { className: 'tc-tip', style: tipStyle }, tipLines) : null,
				step > 1 ? React.createElement('div', { className: 'tc-last' }, '抽稀显示（每 ' + step + ' 点取 1，共 ' + n + ' 点）') : null
			);
		}

		// ---------- 卡片主组件 ----------
		function TradeChartCard(props) {
			const block = props.block;
			const done = block !== null && typeof block === 'object' && 'kind' in block;
			const parsed = parseSpec(block);
			const spec = parsed.spec;
			const raw = parsed.raw;
			let errText = '';
			if (done && block.error) {
				const er = block.error;
				errText = String(er.message || ((er.name ? er.name + ': ' : '') + (er.code || '')) || '');
			}
			const title = spec !== null && spec.title ? spec.title : (spec !== null && TYPE_LABELS[spec.type]) || '交易图表';
			const subParts = [];
			if (spec !== null && spec.symbol) subParts.push(spec.symbol);
			if (spec !== null && spec.period) subParts.push(spec.period);
			if (spec !== null && spec.unit) subParts.push(spec.unit);
			const head = React.createElement('div', { className: 'tc-head' }, [
				React.createElement('span', { key: 'h1', className: 'tc-title' }, title),
				subParts.length > 0 ? React.createElement('span', { key: 'h2', className: 'tc-sub' }, subParts.join(' · ')) : null,
				!done ? React.createElement('span', { key: 'h3', className: 'tc-state' }, '绘制中…') : null,
			]);
			let body = null;
			if (spec !== null && spec.type === 'kline') body = React.createElement(KlineChart, { spec });
			else if (spec !== null && (spec.type === 'line' || spec.type === 'bar' || spec.type === 'area')) body = React.createElement(SimpleChart, { spec });
			else {
				const parts = [React.createElement('div', { key: 'e1', className: 'tc-err' }, errText !== '' ? errText : '图表参数缺失或格式不正确')];
				if (raw !== '') parts.push(React.createElement('pre', { key: 'e2', className: 'tc-pre' }, raw));
				body = React.createElement('div', { className: 'tc-fallback' }, parts);
			}
			return React.createElement('div', { className: 'tc-card' }, head, body);
		}

		// ---------- 插件 ----------
		const inject = ['slots'];

		function apply(ctx) {
			ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
				{ name: 'tool.call.toolview', key: 'trade_chart' },
				TradeChartCard
			));
		}

		exports.name = "@ikonon/dsh-trade-chart";
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});

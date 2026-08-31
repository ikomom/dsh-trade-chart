/* @ikonon/dsh-trade-chart client — 对话内交易图表卡片（纯 SVG，无外部依赖）。
 * 功能：K线/折线/柱状/面积图渲染 + 技术指标（主图 EMA/BOLL、副图 MACD/RSI/KDJ、
 * 成交量均线 MAVOL）+ 波段自动标注（pivots）+ 自由标注
 * （pivot/hline/trendline/arrow/rect/note）+ 鼠标缩放平移
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
		const EMA_PALETTE = ['#06b6d4', '#f43f5e'];
		const BOLL_COLOR = '#94a3b8';
		const VOL_PALETTE = ['#eab308', '#6366f1'];
		const RSI_PALETTE = ['#a855f7', '#06b6d4', '#f97316'];
		const MACD_DIF_COLOR = '#3b82f6';
		const MACD_DEA_COLOR = '#f59e0b';
		const KDJ_K_COLOR = '#3b82f6';
		const KDJ_D_COLOR = '#f59e0b';
		const KDJ_J_COLOR = '#a855f7';
		const MARK_COLORS = {
			pivotHigh: '#e5484d',
			pivotLow: '#2f9e6e',
			hline: '#3b82f6',
			trendline: '#f5a524',
			arrow: '#f97316',
			rect: '#a855f7',
			note: 'var(--dsw-alias-label-primary)',
		};
		const TYPE_LABELS = { kline: 'K线图', line: '折线图', bar: '柱状图', area: '面积图', heatmap: '热点轮动图', ladder: '连板晋级图' };
		const CARD_CSS = [
			'.tc-card{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);margin:4px 0 4px 4px;padding:10px 12px 12px}',
			'.tc-head{display:flex;align-items:baseline;gap:10px;min-width:0}',
			'.tc-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.tc-sub{font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
			'.tc-state{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-tertiary);animation:tcPulse 1.6s ease-in-out infinite}',
			'@keyframes tcPulse{0%,100%{opacity:.45}50%{opacity:1}}',
			'.tc-chart-wrap{position:relative;width:100%}',
			'.tc-chart{display:block;width:100%;height:auto;user-select:none;-webkit-user-select:none}',
			'.tc-legend{display:flex;flex-wrap:wrap;gap:10px;margin:2px 0 4px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
			'.tc-legend-item{display:inline-flex;align-items:center;gap:4px}',
			'.tc-dot{width:8px;height:8px;border-radius:50%;display:inline-block}',
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
		// ---- 技术指标（与宿主端 lib/index.js 同一套算法）----
		function emaValues(vals, period) {
			const out = new Array(vals.length).fill(null);
			const k = 2 / (period + 1);
			let prev = null;
			for (let i = 0; i < vals.length; i++) {
				prev = prev === null ? vals[i] : vals[i] * k + prev * (1 - k);
				out[i] = prev;
			}
			return out;
		}
		function bollValues(closes, period, stdMul) {
			const mid = maValues(closes, period);
			const upper = new Array(closes.length).fill(null);
			const lower = new Array(closes.length).fill(null);
			for (let i = period - 1; i < closes.length; i++) {
				let sum = 0, sumSq = 0;
				for (let j = i - period + 1; j <= i; j++) { const c = closes[j]; sum += c; sumSq += c * c; }
				const mean = sum / period;
				const sd = Math.sqrt(Math.max(0, sumSq / period - mean * mean));
				upper[i] = mid[i] + stdMul * sd;
				lower[i] = mid[i] - stdMul * sd;
			}
			return { upper, mid, lower };
		}
		function macdValues(closes, fast, slow, signal) {
			const ef = emaValues(closes, fast);
			const es = emaValues(closes, slow);
			const dif = closes.map((_, i) => ef[i] - es[i]);
			const dea = emaValues(dif, signal);
			const hist = dif.map((v, i) => (v - dea[i]) * 2);
			return { dif, dea, hist };
		}
		function rsiValues(closes, period) {
			const out = new Array(closes.length).fill(null);
			let up = 0, down = 0;
			for (let i = 1; i < closes.length; i++) {
				const chg = closes[i] - closes[i - 1];
				const u = Math.max(chg, 0), d = Math.max(-chg, 0);
				if (i === 1) { up = u; down = d; }
				else { up = (up * (period - 1) + u) / period; down = (down * (period - 1) + d) / period; }
				out[i] = up + down === 0 ? 50 : up / (up + down) * 100;
			}
			return out;
		}
		function kdjValues(highs, lows, closes, n, kP, dP) {
			const kArr = new Array(closes.length).fill(null);
			const dArr = new Array(closes.length).fill(null);
			const jArr = new Array(closes.length).fill(null);
			let prevK = 50, prevD = 50;
			for (let i = 0; i < closes.length; i++) {
				let hh = -Infinity, ll = Infinity;
				for (let j = Math.max(0, i - n + 1); j <= i; j++) {
					if (highs[j] > hh) hh = highs[j];
					if (lows[j] < ll) ll = lows[j];
				}
				const rsv = hh === ll ? 50 : (closes[i] - ll) / (hh - ll) * 100;
				const k = i === 0 ? rsv : (prevK * (kP - 1) + rsv) / kP;
				const d = i === 0 ? k : (prevD * (dP - 1) + k) / dP;
				prevK = k; prevD = d;
				kArr[i] = k; dArr[i] = d; jArr[i] = 3 * k - 2 * d;
			}
			return { k: kArr, d: dArr, j: jArr };
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
			const [view, setView] = React.useState(null); // {start,end} 原始索引；null=全览
			const [pan, setPan] = React.useState(null);   // 平移中 {startRaw,len,startPx,startPy,yLo,yHi}
			const [yLock, setYLock] = React.useState(null); // 缩放后锁定的价格显示范围 {lo,hi}；null=自适应
			const svgRef = React.useRef(null);
			// 价格面板裁剪 id：上下拖动价格区间时，越界的蜡烛/均线/标注被裁剪，不会画进成交量/指标副图
			const clipId = React.useRef('tcclip' + Math.random().toString(36).slice(2, 10)).current;
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
			const periods = Array.isArray(spec.ma)
				? spec.ma.filter((p) => typeof p === 'number' && p >= 2 && Math.floor(p) === p)
				: [5, 10, 20];
			// 均线/指标基于全量数据计算（缩放/平移后仍连续正确，窗口边缘不缺历史）
			const allCloses = allData.map((c) => c.close);
			const allHighs = allData.map((c) => c.high);
			const allLows = allData.map((c) => c.low);
			const allVols = allData.map((c) => (typeof c.volume === 'number' && isFinite(c.volume) ? c.volume : 0));
			const maSeries = periods.map((p, pi) => ({ period: p, color: MA_PALETTE[pi % MA_PALETTE.length], vals: maValues(allCloses, p) }));
			// 窗口渲染索引 i → 全量索引（聚合段取段末；aggK=1 即 vStart+i）
			const maRawAt = (i) => Math.min(vStart + i * aggK + aggK - 1, origN - 1);
			// ---- 技术指标参数解析 ----
			const ind = spec.indicators && typeof spec.indicators === 'object' ? spec.indicators : {};
			const indArr = (v, min, max) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number' && x >= min && x <= max);
			const indCfg = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
			const emaPeriods = indArr(ind.ema, 2, 250) ? ind.ema : [];
			const bollCfg = ind.boll === true ? { period: 20, std: 2 }
				: indCfg(ind.boll) && typeof ind.boll.period === 'number' && ind.boll.period >= 2
					? { period: Math.floor(ind.boll.period), std: (typeof ind.boll.std === 'number' && ind.boll.std > 0) ? ind.boll.std : 2 }
					: null;
			const mavolPeriods = ind.mavol === true ? [5, 10] : (indArr(ind.mavol, 2, 250) ? ind.mavol : []);
			const macdCfg = ind.macd === true ? { fast: 12, slow: 26, signal: 9 }
				: indCfg(ind.macd) && typeof ind.macd.fast === 'number' && typeof ind.macd.slow === 'number' && typeof ind.macd.signal === 'number' && ind.macd.fast >= 2 && ind.macd.slow > ind.macd.fast && ind.macd.signal >= 2
					? { fast: Math.floor(ind.macd.fast), slow: Math.floor(ind.macd.slow), signal: Math.floor(ind.macd.signal) }
					: null;
			const rsiPeriods = ind.rsi === true ? [14] : (indArr(ind.rsi, 2, 100) ? ind.rsi : []);
			const kdjCfg = ind.kdj === true ? { n: 9, k: 3, d: 3 }
				: indCfg(ind.kdj) && typeof ind.kdj.n === 'number' && ind.kdj.n >= 2 && typeof ind.kdj.k === 'number' && ind.kdj.k >= 1 && typeof ind.kdj.d === 'number' && ind.kdj.d >= 1
					? { n: Math.floor(ind.kdj.n), k: Math.floor(ind.kdj.k), d: Math.floor(ind.kdj.d) }
					: null;
			// ---- 指标计算（全量数据，聚合/缩放视图按索引映射）----
			const emaSeries = emaPeriods.map((p, pi) => ({ period: p, color: EMA_PALETTE[pi % EMA_PALETTE.length], vals: emaValues(allCloses, p) }));
			const boll = bollCfg !== null && bollCfg.period <= origN ? bollValues(allCloses, bollCfg.period, bollCfg.std) : null;
			const mavolSeries = mavolPeriods.map((p, pi) => ({ period: p, color: VOL_PALETTE[pi % VOL_PALETTE.length], vals: maValues(allVols, p) }));
			const macd = macdCfg !== null && macdCfg.slow <= origN ? macdValues(allCloses, macdCfg.fast, macdCfg.slow, macdCfg.signal) : null;
			const rsiSeries = rsiPeriods.map((p, pi) => ({ period: p, color: RSI_PALETTE[pi % RSI_PALETTE.length], vals: rsiValues(allCloses, p) }));
			const kdj = kdjCfg !== null && kdjCfg.n <= origN ? kdjValues(allHighs, allLows, allCloses, kdjCfg.n, kdjCfg.k, kdjCfg.d) : null;
			// ---- 布局：主图 + 动态副图面板（成交量 + 可选指标副图）----
			const W = 760, L = 10, R = 70, T = 10, B = 22, GAP = 10;
			const priceH = 250;
			const plotW = W - L - R;
			const panels = [{ key: 'vol', label: 'VOL', h: 58 }];
			if (macd !== null) panels.push({ key: 'macd', label: 'MACD(' + macdCfg.fast + ',' + macdCfg.slow + ',' + macdCfg.signal + ')', h: 72 });
			if (rsiSeries.length > 0) panels.push({ key: 'rsi', label: 'RSI', h: 64 });
			if (kdj !== null) panels.push({ key: 'kdj', label: 'KDJ(' + kdjCfg.n + ',' + kdjCfg.k + ',' + kdjCfg.d + ')', h: 64 });
			let accY = T + priceH;
			panels.forEach((p) => { p.top = accY + GAP; p.bottom = p.top + p.h; accY = p.bottom; });
			const H = accY + B;
			const panelBy = (key) => panels.find((p) => p.key === key);
			const volPanel = panelBy('vol');
			// 主图 y 域：K线 + MA/EMA + BOLL 上下轨
			let lo = Infinity, hi = -Infinity;
			kline.forEach((c) => { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high; });
			const extendY = (v) => { if (v !== null && v !== undefined && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
			maSeries.forEach((ms) => { for (let i = 0; i < n; i++) extendY(ms.vals[maRawAt(i)]); });
			emaSeries.forEach((es) => { for (let i = 0; i < n; i++) extendY(es.vals[maRawAt(i)]); });
			if (boll !== null) { for (let i = 0; i < n; i++) { extendY(boll.upper[maRawAt(i)]); extendY(boll.lower[maRawAt(i)]); } }
			let pad = (hi - lo) * 0.05;
			if (!(pad > 0)) pad = Math.abs(hi) * 0.02 + 0.01;
			const autoYMin = lo - pad, autoYMax = hi + pad;
			// 缩放后 y 轴锁定显示范围（上下拖动查看价格区间）；未锁定时跟随窗口自适应
			const yMin = yLock !== null ? yLock.lo : autoYMin;
			const yMax = yLock !== null ? yLock.hi : autoYMax;
			// onWheel 需要读取最新 y 域/锁定状态（useEffect 闭包是首次渲染值）
			const chartRef = React.useRef({ yMin: 0, yMax: 1, yLock: null });
			chartRef.current = { yMin, yMax, yLock };
			// 副图 y 域（MACD/KDJ 窗口自适应；RSI 固定 0-100）
			const panelDomains = {};
			const domFrom = (key, arrs) => {
				let plo = Infinity, phi = -Infinity;
				for (let i = 0; i < n; i++) {
					const r = maRawAt(i);
					arrs.forEach((a) => { const v = a[r]; if (v !== null && v !== undefined && isFinite(v)) { if (v < plo) plo = v; if (v > phi) phi = v; } });
				}
				if (!isFinite(plo)) { plo = -1; phi = 1; }
				if (plo === phi) { plo -= 1; phi += 1; }
				const mp = (phi - plo) * 0.06;
				panelDomains[key] = { lo: plo - mp, hi: phi + mp };
			};
			if (macd !== null) domFrom('macd', [macd.dif, macd.dea, macd.hist]);
			if (rsiSeries.length > 0) panelDomains.rsi = { lo: 0, hi: 100 };
			if (kdj !== null) domFrom('kdj', [kdj.k, kdj.d, kdj.j]);
			const pyOf = (pnl, dom, v) => pnl.bottom - (v - dom.lo) / (dom.hi - dom.lo) * pnl.h;
			// 成交量域（含均量线）
			let maxVol = 0;
			kline.forEach((c) => { const v = typeof c.volume === 'number' && isFinite(c.volume) ? c.volume : 0; if (v > maxVol) maxVol = v; });
			mavolSeries.forEach((ms) => { for (let i = 0; i < n; i++) { const v = ms.vals[maRawAt(i)]; if (v !== null && v !== undefined && v > maxVol) maxVol = v; } });
			if (!(maxVol > 0)) maxVol = 1;
			const x = (i) => L + (i + 0.5) * plotW / n;
			const y = (v) => T + (yMax - v) / (yMax - yMin) * priceH;
			const volBase = volPanel.bottom - 3;
			const yv = (v) => volBase - v / maxVol * (volPanel.h - 8);
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
					const nv = zoomView(v, anchorRaw, factor, origN, 10);
					if (nv === null) {
						setYLock(null); // 缩回全览：恢复 y 轴自适应
					} else {
						// 缩放时锁定当前价格显示范围，避免窗口变化导致 y 轴跳动
						setYLock((prev) => (prev !== null ? prev : { lo: chartRef.current.yMin, hi: chartRef.current.yMax }));
					}
					setView(nv);
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

			// ---- 事件：hover / 平移 ----
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
					// 纵向：y 轴锁定时上下拖动查看价格区间
					if (pan.yLo !== null && pan.yHi !== null) {
						const range = pan.yHi - pan.yLo;
						const deltaY = (d.py - pan.startPy) / priceH * range;
						setYLock({ lo: pan.yLo + deltaY, hi: pan.yHi + deltaY });
					}
					return;
				}
				// hover 存原始索引与鼠标价格，窗口变化后经 toView 映射，避免越界崩溃
				setHover({ idx: d.i, rawI: d.rawI, px: d.px, py: d.py, price: d.price, w: rect.width });
			};
			const onDown = (e) => {
				const d = toData(e);
				if (d === null) return;
				setHover(null);
				setPan({
					startRaw: vStart, len: wLen, startPx: d.px, startPy: d.py,
					yLo: yLock !== null ? yLock.lo : null,
					yHi: yLock !== null ? yLock.hi : null,
				});
			};
			const onUp = () => {
				if (pan !== null) setPan(null);
			};
			const onDoubleClick = () => {
				setView(null);
				setYLock(null);
			};

			// ---- 静态元素 ----
			const yTicks = ticks(yMin, yMax, 5);
			const xStep = Math.max(1, Math.ceil(n / 6));
			const els = [];
			const priceEls = []; // 价格面板域内的元素（蜡烛/主图指标/标注），统一裁剪
			const lineEl = (key, x1, y1, x2, y2, extra) => React.createElement('line', Object.assign({ key, x1, y1, x2, y2 }, extra || {}));
			yTicks.forEach((tv) => {
				els.push(lineEl('gl' + tv, L, y(tv), W - R, y(tv), { stroke: 'rgba(128,128,128,0.18)', strokeWidth: 1 }));
				els.push(React.createElement('text', { key: 'gt' + tv, x: W - R + 6, y: y(tv) + 4, fontSize: 11, fill: 'rgba(128,128,128,0.85)' }, fmtPrice(tv) + unit));
			});
			for (let i = 0; i < n; i += xStep) {
				els.push(React.createElement('text', { key: 'xl' + i, x: x(i), y: H - 6, fontSize: 11, fill: 'rgba(128,128,128,0.85)', textAnchor: 'middle' }, shortTime(kline[i].time)));
			}
			// 副图面板：网格 + 刻度 + 标签
			panels.forEach((pnl) => {
				if (pnl.key === 'vol') {
					els.push(React.createElement('text', { key: 'plvol', x: L + 2, y: pnl.top + 11, fontSize: 10, fill: 'rgba(128,128,128,0.7)' }, 'VOL'));
					const ts = ticks(0, maxVol, 2);
					ts.forEach((tv) => {
						const py = yv(tv);
						els.push(lineEl('vgl' + tv, L, py, W - R, py, { stroke: 'rgba(128,128,128,0.12)', strokeWidth: 1 }));
						els.push(React.createElement('text', { key: 'vgt' + tv, x: W - R + 6, y: py + 3, fontSize: 10, fill: 'rgba(128,128,128,0.7)' }, fmtVol(tv)));
					});
				} else {
					const dom = panelDomains[pnl.key];
					const ts = ticks(dom.lo, dom.hi, 3);
					ts.forEach((tv) => {
						const py = pyOf(pnl, dom, tv);
						els.push(lineEl('sgl' + pnl.key + tv, L, py, W - R, py, { stroke: 'rgba(128,128,128,0.12)', strokeWidth: 1 }));
						els.push(React.createElement('text', { key: 'sgt' + pnl.key + tv, x: W - R + 6, y: py + 3, fontSize: 10, fill: 'rgba(128,128,128,0.7)' }, fmtPrice(tv)));
					});
					if (pnl.key === 'rsi') {
						[30, 70].forEach((lv) => {
							const py = pyOf(pnl, dom, lv);
							els.push(lineEl('rsiz' + lv, L, py, W - R, py, { stroke: 'rgba(128,128,128,0.28)', strokeWidth: 1, strokeDasharray: '3 3' }));
							els.push(React.createElement('text', { key: 'rsizt' + lv, x: W - R + 6, y: py + 3, fontSize: 10, fill: 'rgba(128,128,128,0.7)' }, String(lv)));
						});
					}
					els.push(React.createElement('text', { key: 'pl' + pnl.key, x: L + 2, y: pnl.top + 11, fontSize: 10, fill: 'rgba(128,128,128,0.7)' }, pnl.label));
				}
			});
			// 成交量柱 + 均量线
			kline.forEach((c, i) => {
				const col = c.close >= c.open ? UP_COLOR : DOWN_COLOR;
				const v = typeof c.volume === 'number' && isFinite(c.volume) ? c.volume : 0;
				els.push(React.createElement('rect', { key: 'v' + i, x: x(i) - bodyW / 2, y: yv(v), width: bodyW, height: Math.max(0.5, volBase - yv(v)), fill: col, opacity: 0.5 }));
			});
			mavolSeries.forEach((ms) => {
				let d = '', started = false;
				for (let i = 0; i < n; i++) {
					const v = ms.vals[maRawAt(i)];
					if (v === null || v === undefined || !isFinite(v)) { started = false; continue; }
					d += (started ? 'L' : 'M') + x(i).toFixed(2) + ',' + yv(v).toFixed(2);
					started = true;
				}
				if (d !== '') els.push(React.createElement('path', { key: 'mav' + ms.period, d, fill: 'none', stroke: ms.color, strokeWidth: 1.2 }));
			});
			// 蜡烛（价格面板域 → 裁剪组）
			kline.forEach((c, i) => {
				const col = c.close >= c.open ? UP_COLOR : DOWN_COLOR;
				priceEls.push(React.createElement('line', { key: 'w' + i, x1: x(i), y1: y(c.high), x2: x(i), y2: y(c.low), stroke: col, strokeWidth: 1 }));
				const top = y(Math.max(c.open, c.close));
				const h = Math.max(1, Math.abs(y(c.open) - y(c.close)));
				priceEls.push(React.createElement('rect', { key: 'b' + i, x: x(i) - bodyW / 2, y: top, width: bodyW, height: h, fill: col }));
			});
			// 主图指标：MA / EMA / BOLL（全量值按窗口映射：缩放后与全览区间完全一致，边缘不缺历史）
			const pathFromVals = (key, vals, color, width, dash) => {
				let d = '', started = false;
				for (let i = 0; i < n; i++) {
					const v = vals[maRawAt(i)];
					if (v === null || v === undefined || !isFinite(v)) { started = false; continue; }
					d += (started ? 'L' : 'M') + x(i).toFixed(2) + ',' + y(v).toFixed(2);
					started = true;
				}
				if (d !== '') priceEls.push(React.createElement('path', { key, d, fill: 'none', stroke: color, strokeWidth: width, strokeLinejoin: 'round', strokeDasharray: dash }));
			};
			maSeries.forEach((ms) => pathFromVals('ma' + ms.period, ms.vals, ms.color, 1.5));
			emaSeries.forEach((es) => pathFromVals('ema' + es.period, es.vals, es.color, 1.3));
			if (boll !== null) {
				// 带状填充：上轨正序 + 下轨倒序闭合
				const upPts = [], loPts = [];
				for (let i = 0; i < n; i++) {
					const r = maRawAt(i);
					const u = boll.upper[r], l = boll.lower[r];
					if (u === null || u === undefined || !isFinite(u) || l === null || l === undefined || !isFinite(l)) continue;
					upPts.push([x(i), y(u)]);
					loPts.push([x(i), y(l)]);
				}
				if (upPts.length > 1) {
					let d = 'M' + upPts[0][0].toFixed(2) + ',' + upPts[0][1].toFixed(2);
					for (let i = 1; i < upPts.length; i++) d += 'L' + upPts[i][0].toFixed(2) + ',' + upPts[i][1].toFixed(2);
					for (let i = loPts.length - 1; i >= 0; i--) d += 'L' + loPts[i][0].toFixed(2) + ',' + loPts[i][1].toFixed(2);
					priceEls.push(React.createElement('path', { key: 'bollband', d: d + 'Z', fill: BOLL_COLOR, opacity: 0.08, stroke: 'none' }));
				}
				pathFromVals('bollu', boll.upper, BOLL_COLOR, 1.2);
				pathFromVals('bolll', boll.lower, BOLL_COLOR, 1.2);
				pathFromVals('bollm', boll.mid, BOLL_COLOR, 1.2, '4 3');
			}
			// 副图指标：MACD / RSI / KDJ
			if (macd !== null) {
				const pnl = panelBy('macd'), dom = panelDomains.macd;
				const zy = pyOf(pnl, dom, 0);
				els.push(lineEl('macdz', L, zy, W - R, zy, { stroke: 'rgba(128,128,128,0.35)', strokeWidth: 1 }));
				for (let i = 0; i < n; i++) {
					const v = macd.hist[maRawAt(i)];
					if (v === null || v === undefined || !isFinite(v)) continue;
					const py = pyOf(pnl, dom, v);
					els.push(React.createElement('rect', { key: 'mh' + i, x: x(i) - bodyW / 2, y: Math.min(py, zy), width: bodyW, height: Math.max(0.5, Math.abs(py - zy)), fill: v >= 0 ? UP_COLOR : DOWN_COLOR, opacity: 0.55 }));
				}
				const macdLine = (key, arr, color) => {
					let d = '', started = false;
					for (let i = 0; i < n; i++) {
						const v = arr[maRawAt(i)];
						if (v === null || v === undefined || !isFinite(v)) { started = false; continue; }
						d += (started ? 'L' : 'M') + x(i).toFixed(2) + ',' + pyOf(pnl, dom, v).toFixed(2);
						started = true;
					}
					if (d !== '') els.push(React.createElement('path', { key, d, fill: 'none', stroke: color, strokeWidth: 1.3 }));
				};
				macdLine('macdf', macd.dif, MACD_DIF_COLOR);
				macdLine('macds', macd.dea, MACD_DEA_COLOR);
			}
			if (rsiSeries.length > 0) {
				const pnl = panelBy('rsi'), dom = panelDomains.rsi;
				rsiSeries.forEach((rs) => {
					let d = '', started = false;
					for (let i = 0; i < n; i++) {
						const v = rs.vals[maRawAt(i)];
						if (v === null || v === undefined || !isFinite(v)) { started = false; continue; }
						d += (started ? 'L' : 'M') + x(i).toFixed(2) + ',' + pyOf(pnl, dom, v).toFixed(2);
						started = true;
					}
					if (d !== '') els.push(React.createElement('path', { key: 'rsi' + rs.period, d, fill: 'none', stroke: rs.color, strokeWidth: 1.3 }));
				});
			}
			if (kdj !== null) {
				const pnl = panelBy('kdj'), dom = panelDomains.kdj;
				[{ k: kdj.k, c: KDJ_K_COLOR }, { k: kdj.d, c: KDJ_D_COLOR }, { k: kdj.j, c: KDJ_J_COLOR }].forEach((o, oi) => {
					let d = '', started = false;
					for (let i = 0; i < n; i++) {
						const v = o.k[maRawAt(i)];
						if (v === null || v === undefined || !isFinite(v)) { started = false; continue; }
						d += (started ? 'L' : 'M') + x(i).toFixed(2) + ',' + pyOf(pnl, dom, v).toFixed(2);
						started = true;
					}
					if (d !== '') els.push(React.createElement('path', { key: 'kdj' + oi, d, fill: 'none', stroke: o.c, strokeWidth: 1.3 }));
				});
			}
			// 标注（模型标注 + 自动波段；价格面板域 → 裁剪组）
			const allMarks = [...modelMarks, ...autoPivots];
			allMarks.forEach((mk, mi) => { priceEls.push(...markEls(mk, mi, false)); });
			// 价格面板裁剪组：上下拖动价格区间时越界元素被裁剪，不再画进成交量/指标副图
			els.push(React.createElement('defs', { key: 'tcdefs' }, React.createElement('clipPath', { id: clipId }, React.createElement('rect', { x: L, y: T, width: plotW, height: priceH }))));
			els.push(React.createElement('g', { key: 'priceclip', clipPath: 'url(#' + clipId + ')' }, priceEls));
			// 十字光标（按当前视图映射；窗口外不显示）
			const hoverVi = hover !== null ? toView(hover.rawI) : null;
			if (hoverVi !== null) {
				els.push(React.createElement('line', { key: 'cx', x1: x(hoverVi), y1: T, x2: x(hoverVi), y2: H - B, stroke: 'rgba(128,128,128,0.5)', strokeWidth: 1, strokeDasharray: '3 3' }));
			}
			// 横向虚线 + 右侧值标签：按鼠标所在面板适配——
			// 价格面板显示鼠标价格，成交量/指标副图显示该面板的数值（跟随鼠标），横轴区显示当前 K 线收盘价
			if (hover !== null && hoverVi !== null) {
				const inPrice = hover.py >= T && hover.py <= T + priceH;
				let hpy = 0, label = '', loY = T + 10, hiY = T + priceH - 6;
				if (inPrice) {
					const p = typeof hover.price === 'number' ? hover.price : kline[hoverVi].close;
					hpy = y(p);
					label = fmtPrice(p) + unit;
				} else {
					const pnl = panels.find((p) => hover.py >= p.top && hover.py <= p.bottom);
					if (pnl !== undefined) {
						hpy = hover.py;
						loY = pnl.top + 9;
						hiY = pnl.bottom - 7;
						if (pnl.key === 'vol') {
							label = fmtVol(Math.max(0, (volBase - hover.py) * maxVol / (volPanel.h - 8)));
						} else {
							const dom = panelDomains[pnl.key];
							const v = dom.lo + (dom.hi - dom.lo) * (pnl.bottom - hover.py) / pnl.h;
							label = pnl.key === 'rsi' ? v.toFixed(1) : fmtPrice(v);
						}
					} else {
						// 横坐标/图外区域：显示当前 K 线收盘价
						hpy = y(kline[hoverVi].close);
						label = fmtPrice(kline[hoverVi].close) + unit;
					}
				}
				els.push(lineEl('hxl', L, hpy, W - R, hpy, { stroke: 'rgba(128,128,128,0.5)', strokeWidth: 1, strokeDasharray: '3 3' }));
				const pyy = clamp(hpy, loY, hiY);
				// 放在右缘刻度区，水平左对齐，与刻度数字同方向；高亮背景条 + 红色描边
				els.push(React.createElement('rect', { key: 'hxr', x: W - R + 2, y: pyy - 9, width: R - 8, height: 17, rx: 3, fill: 'var(--dsw-alias-bg-base)', stroke: 'rgba(229,72,77,0.65)', strokeWidth: 1 }));
				els.push(React.createElement('text', { key: 'hxt', x: W - R + 8, y: pyy + 4, fontSize: 11, fontWeight: '600', fill: 'var(--dsw-alias-label-primary)', textAnchor: 'start' }, label));
			}

			// ---- 底部：最新价（始终取原始最新一根）+ 视图信息 ----
			const lastC = allData[origN - 1];
			const prevC = origN > 1 ? allData[origN - 2] : null;
			const chgC = prevC ? (lastC.close - prevC.close) / prevC.close * 100 : null;
			const footer = React.createElement('div', { className: 'tc-last' }, [
				React.createElement('span', { key: 'f0' }, '最新 ' + fullTime(lastC.time) + ' '),
				React.createElement('b', { key: 'f1', style: { color: lastC.close >= lastC.open ? UP_COLOR : DOWN_COLOR } }, fmtPrice(lastC.close) + unit),
				React.createElement('span', { key: 'f2' }, (chgC === null ? '' : '（' + (chgC >= 0 ? '+' : '') + chgC.toFixed(2) + '%）') + ' 量 ' + fmtVol(lastC.volume)),
				zoomed ? React.createElement('span', { key: 'f3' }, '  ·  显示 ' + shortTime(wData[0].time) + ' ~ ' + shortTime(wData[wLen - 1].time) + '（' + wLen + '/' + origN + ' 根，滚轮缩放 / 拖动平移 / 双击复位，上下=价格）') : null,
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
				const mv = ms.vals[maRawAt(ti)];
				if (mv !== null && mv !== undefined) tipLines.push(React.createElement('div', { key: 'tma' + ms.period }, React.createElement('span', { style: { color: ms.color } }, 'MA' + ms.period + ' '), fmtPrice(mv)));
			});
			// 技术指标提示行
			emaSeries.forEach((es) => {
				const ev = es.vals[maRawAt(ti)];
				if (ev !== null && ev !== undefined) tipLines.push(React.createElement('div', { key: 'tema' + es.period }, React.createElement('span', { style: { color: es.color } }, 'EMA' + es.period + ' '), fmtPrice(ev)));
			});
			if (boll !== null) {
				const r = maRawAt(ti);
				const u = boll.upper[r], m = boll.mid[r], l = boll.lower[r];
				if (u !== null && u !== undefined) tipLines.push(React.createElement('div', { key: 'tboll' }, React.createElement('span', { style: { color: BOLL_COLOR } }, 'BOLL '), '上 ' + fmtPrice(u) + ' 中 ' + fmtPrice(m) + ' 下 ' + fmtPrice(l)));
			}
			if (mavolSeries.length > 0) {
				tipLines.push(React.createElement('div', { key: 'tmavol' }, mavolSeries.map((mv) => {
					const v = mv.vals[maRawAt(ti)];
					return React.createElement('span', { key: 'mv' + mv.period, style: { color: mv.color } }, 'MAVOL' + mv.period + ' ' + (v !== null && v !== undefined ? fmtVol(v) : '—') + '  ');
				})));
			}
			if (macd !== null) {
				const r = maRawAt(ti);
				const dif = macd.dif[r], dea = macd.dea[r], hist = macd.hist[r];
				tipLines.push(React.createElement('div', { key: 'tmacd' },
					React.createElement('span', { style: { color: MACD_DIF_COLOR } }, 'DIF '), fmtPrice(dif), '  ',
					React.createElement('span', { style: { color: MACD_DEA_COLOR } }, 'DEA '), fmtPrice(dea), '  柱 ',
					React.createElement('span', { style: { color: hist >= 0 ? UP_COLOR : DOWN_COLOR } }, fmtPrice(hist))));
			}
			rsiSeries.forEach((rs) => {
				const v = rs.vals[maRawAt(ti)];
				if (v !== null && v !== undefined) tipLines.push(React.createElement('div', { key: 'trsi' + rs.period }, React.createElement('span', { style: { color: rs.color } }, 'RSI' + rs.period + ' '), v.toFixed(2)));
			});
			if (kdj !== null) {
				const r = maRawAt(ti);
				tipLines.push(React.createElement('div', { key: 'tkdj' },
					React.createElement('span', { style: { color: KDJ_K_COLOR } }, 'K '), fmtPrice(kdj.k[r]), '  ',
					React.createElement('span', { style: { color: KDJ_D_COLOR } }, 'D '), fmtPrice(kdj.d[r]), '  ',
					React.createElement('span', { style: { color: KDJ_J_COLOR } }, 'J '), fmtPrice(kdj.j[r])));
			}
			let tipStyle = null;
			if (hoverVi !== null) {
				const flip = hover.w - hover.px < 240;
				tipStyle = { left: (flip ? hover.px - 236 : hover.px + 12) + 'px', top: Math.max(4, hover.py - 30) + 'px' };
			}

			// ---- 顶部行：图例 ----
			const legendItems = [
				...maSeries.map((ms) => React.createElement('span', { key: 'lgma' + ms.period, className: 'tc-legend-item' }, React.createElement('span', { className: 'tc-dot', style: { background: ms.color } }), 'MA' + ms.period)),
				...emaSeries.map((es) => React.createElement('span', { key: 'lgema' + es.period, className: 'tc-legend-item' }, React.createElement('span', { className: 'tc-dot', style: { background: es.color } }), 'EMA' + es.period)),
				boll !== null ? React.createElement('span', { key: 'lgboll', className: 'tc-legend-item' }, React.createElement('span', { className: 'tc-dot', style: { background: BOLL_COLOR } }), 'BOLL(' + bollCfg.period + ',' + bollCfg.std + ')') : null,
				...mavolSeries.map((mv) => React.createElement('span', { key: 'lgmav' + mv.period, className: 'tc-legend-item' }, React.createElement('span', { className: 'tc-dot', style: { background: mv.color } }), 'MAVOL' + mv.period)),
				macd !== null ? React.createElement('span', { key: 'lgmacd', className: 'tc-legend-item' }, React.createElement('span', { className: 'tc-dot', style: { background: MACD_DIF_COLOR } }), 'MACD(' + macdCfg.fast + ',' + macdCfg.slow + ',' + macdCfg.signal + ')') : null,
				...rsiSeries.map((rs) => React.createElement('span', { key: 'lgrsi' + rs.period, className: 'tc-legend-item' }, React.createElement('span', { className: 'tc-dot', style: { background: rs.color } }), 'RSI' + rs.period)),
				kdj !== null ? React.createElement('span', { key: 'lgkdj', className: 'tc-legend-item' }, React.createElement('span', { className: 'tc-dot', style: { background: KDJ_K_COLOR } }), 'KDJ(' + kdjCfg.n + ',' + kdjCfg.k + ',' + kdjCfg.d + ')') : null,
			].filter(Boolean);
			const legend = React.createElement('div', { className: 'tc-legend' }, legendItems);

			return React.createElement('div', { className: 'tc-chart-wrap' },
				legend,
				React.createElement('svg', {
					ref: svgRef,
					className: 'tc-chart', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet',
					style: { cursor: pan !== null ? 'grabbing' : 'grab' },
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

		// ---------- 热点轮动矩阵（heatmap）----------
		function HeatmapChart(props) {
			const spec = props.spec;
			const hm = spec.heatmap && typeof spec.heatmap === 'object' ? spec.heatmap : null;
			const rows = hm !== null && Array.isArray(hm.rows) ? hm.rows : [];
			const cats = hm !== null && Array.isArray(hm.categories) ? hm.categories : [];
			const values = hm !== null && Array.isArray(hm.values) ? hm.values : [];
			const [hover, setHover] = React.useState(null);
			if (rows.length === 0 || cats.length === 0 || values.length !== rows.length) {
				return React.createElement('div', { className: 'tc-fallback' }, '没有可渲染的热点矩阵数据（需要 rows/categories/values）');
			}
			const unit = hm !== null && typeof hm.unit === 'string' && hm.unit !== '' ? ' ' + hm.unit : '';
			const W = 760, L = 10, R = 70, T = 10, B = 24;
			const nCols = cats.length, nRows = rows.length;
			const plotW = W - L - R;
			const plotH = Math.max(140, Math.min(420, nRows * 30));
			const H = T + plotH + B;
			const cellW = plotW / nCols;
			const cellH = plotH / nRows;
			// 发散色标：红涨绿跌（以 0 为中性）
			let vmax = 0;
			values.forEach((row) => row.forEach((v) => { if (typeof v === 'number' && isFinite(v) && Math.abs(v) > vmax) vmax = Math.abs(v); }));
			const cellColor = (v) => {
				if (v === null || v === undefined || !isFinite(v)) return 'rgba(128,128,128,0.08)';
				const t = vmax > 0 ? Math.min(1, Math.abs(v) / vmax) : 0;
				const alpha = 0.12 + t * 0.72;
				return v >= 0 ? 'rgba(229,72,77,' + alpha + ')' : 'rgba(47,158,110,' + alpha + ')';
			};
			const xOf = (c) => L + c * cellW;
			const yOf = (r) => T + r * cellH;
			const onMove = (e) => {
				const rect = e.currentTarget.getBoundingClientRect();
				if (rect.width <= 0) return;
				const px = (e.clientX - rect.left) * W / rect.width;
				const py = (e.clientY - rect.top) * H / rect.height;
				const c = Math.floor((px - L) / cellW);
				const r = Math.floor((py - T) / cellH);
				if (c >= 0 && c < nCols && r >= 0 && r < nRows) setHover({ r, c, px: e.clientX - rect.left, py: e.clientY - rect.top, w: rect.width });
				else setHover(null);
			};
			const els = [];
			for (let r = 0; r < nRows; r++) {
				for (let c = 0; c < nCols; c++) {
					const v = values[r][c];
					els.push(React.createElement('rect', { key: 'h' + r + '_' + c, x: xOf(c), y: yOf(r), width: cellW, height: cellH, fill: cellColor(v), stroke: 'var(--dsw-alias-bg-base)', strokeWidth: 1 }));
					if (cellW >= 44 && cellH >= 20 && typeof v === 'number' && isFinite(v)) {
						els.push(React.createElement('text', {
							key: 'ht' + r + '_' + c, x: xOf(c) + cellW / 2, y: yOf(r) + cellH / 2 + 4, fontSize: 10,
							fill: 'var(--dsw-alias-label-primary)', textAnchor: 'middle',
						}, (v >= 0 ? '+' : '') + fmtPrice(v) + unit));
					}
				}
			}
			// 行标签（板块名，左侧）
			for (let r = 0; r < nRows; r++) {
				const lb = String(rows[r] || '').slice(0, 8);
				els.push(React.createElement('text', { key: 'rl' + r, x: L - 6, y: yOf(r) + cellH / 2 + 3, fontSize: 11, fill: 'rgba(128,128,128,0.85)', textAnchor: 'end' }, lb));
			}
			// 列标签（日期）
			const xStep = Math.max(1, Math.ceil(nCols / 8));
			for (let c = 0; c < nCols; c += xStep) {
				els.push(React.createElement('text', { key: 'cl' + c, x: xOf(c) + cellW / 2, y: H - 6, fontSize: 10, fill: 'rgba(128,128,128,0.85)', textAnchor: 'middle' }, shortTime(String(cats[c]))));
			}
			if (hover !== null) {
				els.push(React.createElement('rect', { key: 'hx', x: xOf(hover.c), y: yOf(hover.r), width: cellW, height: cellH, fill: 'none', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 1.5 }));
			}
			let tip = null;
			if (hover !== null) {
				const v = values[hover.r][hover.c];
				const tipLines = [
					React.createElement('div', { key: 't0' }, React.createElement('b', null, String(rows[hover.r] || ''))),
					React.createElement('div', { key: 't1' }, String(cats[hover.c])),
					React.createElement('div', { key: 't2' }, typeof v === 'number' && isFinite(v) ? (v >= 0 ? '+' : '') + fmtPrice(v) + unit : '—'),
				];
				const flip = hover.w - hover.px < 220;
				tip = React.createElement('div', { className: 'tc-tip', style: { left: (flip ? hover.px - 216 : hover.px + 12) + 'px', top: Math.max(4, hover.py - 26) + 'px' } }, tipLines);
			}
			return React.createElement('div', { className: 'tc-chart-wrap' },
				React.createElement('svg', { className: 'tc-chart', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet', onMouseMove: onMove, onMouseLeave: () => setHover(null) }, els),
				tip
			);
		}

		// ---------- 连板晋级图（ladder）----------
		function LadderChart(props) {
			const spec = props.spec;
			const ladder = Array.isArray(spec.ladder) ? spec.ladder : [];
			const [hover, setHover] = React.useState(null);
			if (ladder.length === 0) {
				return React.createElement('div', { className: 'tc-fallback' }, '没有可渲染的连板晋级数据（需要 chart.ladder）');
			}
			const dates = ladder.map((d) => d.date);
			const counts = {};   // level -> (number|null)[]（按日期）
			const stockList = {}; // level -> (string[]|null)[]（按日期，具体连板股票）
			let maxLevel = 1;
			ladder.forEach((d, di) => {
				if (!d || typeof d !== 'object' || !Array.isArray(d.boards)) return;
				d.boards.forEach((b) => {
					if (!b || typeof b.level !== 'number') return;
					const lv = b.level;
					if (!counts[lv]) { counts[lv] = new Array(ladder.length).fill(null); stockList[lv] = new Array(ladder.length).fill(null); }
					const stocks = Array.isArray(b.stocks) ? b.stocks.filter((s) => typeof s === 'string' && s !== '') : [];
					stockList[lv][di] = stocks.length > 0 ? stocks : null;
					counts[lv][di] = typeof b.count === 'number' ? b.count : (stocks.length > 0 ? stocks.length : null);
					if (lv > maxLevel) maxLevel = lv;
				});
			});
			const levels = Object.keys(counts).map(Number).sort((a, b) => a - b);
			if (levels.length === 0) return React.createElement('div', { className: 'tc-fallback' }, '连板数据为空');
			// 晋级率（目标格视角）：今日 L 板家数 / 昨日 L-1 板家数（L≥2 且非首日）
			const rateInto = (level, di) => {
				if (level < 2 || di < 1) return null;
				const from = counts[level - 1] ? counts[level - 1][di - 1] : null;
				const to = counts[level] ? counts[level][di] : null;
				if (from === null || from === undefined || from <= 0 || to === null || to === undefined) return null;
				return to / from * 100;
			};
			// 断板数：昨日 L-1 板家数 - 今日 L 板家数（未能晋级的部分）
			const brokenOf = (level, di) => {
				if (level < 2 || di < 1) return null;
				const from = counts[level - 1] ? counts[level - 1][di - 1] : null;
				const to = counts[level] ? counts[level][di] : null;
				if (from === null || from === undefined || from <= 0 || to === null || to === undefined) return null;
				return from - to;
			};
			const W = 760, L = 10, R = 10, T = 10, B = 24;
			const nCols = dates.length;
			const nRows = maxLevel;
			const plotW = W - L - R;
			const plotH = Math.max(150, Math.min(440, nRows * 42));
			const H = T + plotH + B;
			const cellW = plotW / nCols;
			const cellH = plotH / nRows;
			const xOf = (c) => L + c * cellW;
			const yOf = (level) => T + plotH - (level - 1) * cellH - cellH; // 1板在底
			const onMove = (e) => {
				const rect = e.currentTarget.getBoundingClientRect();
				if (rect.width <= 0) return;
				const px = (e.clientX - rect.left) * W / rect.width;
				const py = (e.clientY - rect.top) * H / rect.height;
				const c = Math.floor((px - L) / cellW);
				const rowFromTop = Math.floor((py - T) / cellH);
				const level = nRows - rowFromTop;
				if (c >= 0 && c < nCols && level >= 1 && level <= nRows) setHover({ c, level, px: e.clientX - rect.left, py: e.clientY - rect.top, w: rect.width });
				else setHover(null);
			};
			const els = [];
			for (let li = 0; li < levels.length; li++) {
				const lv = levels[li];
				// 同花顺风格：红底渐变，板数越高越深；浅底用深字、深底用白字
				const bgAlpha = 0.08 + (lv / maxLevel) * 0.38;
				const col = 'rgba(229,72,77,' + bgAlpha.toFixed(3) + ')';
				const darkText = bgAlpha < 0.24;
				const countFill = darkText ? 'var(--dsw-alias-label-primary)' : '#fff';
				const rateFill = darkText ? UP_COLOR : 'rgba(255,255,255,0.92)';
				const subFill = darkText ? 'var(--dsw-alias-label-tertiary)' : 'rgba(255,255,255,0.75)';
				for (let c = 0; c < nCols; c++) {
					const v = counts[lv][c];
					els.push(React.createElement('rect', { key: 'l' + lv + '_' + c, x: xOf(c), y: yOf(lv), width: cellW, height: cellH, fill: v !== null ? col : 'rgba(128,128,128,0.06)', stroke: 'var(--dsw-alias-bg-base)', strokeWidth: 1 }));
					if (v === null) continue;
					const cx = xOf(c) + cellW / 2;
					const names = stockList[lv] ? stockList[lv][c] : null;
					if (names !== null && names.length > 0 && cellH >= 42) {
						// 同花顺风格：高板数量少时，格内直接列出具体连板股票
						const shown = Math.min(names.length, 3);
						const extra = Math.max(0, v - shown);
						const lines = 1 + shown + (extra > 0 ? 1 : 0);
						const lineH = 10;
						let ty = yOf(lv) + cellH / 2 - ((lines - 1) * lineH) / 2 + 4;
						els.push(React.createElement('text', { key: 'lc' + lv + '_' + c, x: cx, y: ty, fontSize: 11, fontWeight: '700', fill: countFill, textAnchor: 'middle' }, String(v)));
						ty += lineH;
						for (let ni = 0; ni < shown; ni++) {
							els.push(React.createElement('text', { key: 'ln' + lv + '_' + c + '_' + ni, x: cx, y: ty, fontSize: 9, fill: countFill, textAnchor: 'middle' }, String(names[ni]).slice(0, 6)));
							ty += lineH;
						}
						if (extra > 0) els.push(React.createElement('text', { key: 'lx' + lv + '_' + c, x: cx, y: ty, fontSize: 9, fill: subFill, textAnchor: 'middle' }, '+' + extra + '只'));
					} else {
						els.push(React.createElement('text', { key: 'lc' + lv + '_' + c, x: cx, y: yOf(lv) + cellH / 2 - 1, fontSize: cellH >= 24 ? 13 : 11, fontWeight: '700', fill: countFill, textAnchor: 'middle' }, String(v)));
						if (lv === 1) {
							els.push(React.createElement('text', { key: 'lf1_' + c, x: cx, y: yOf(lv) + cellH / 2 + 10, fontSize: 9, fill: subFill, textAnchor: 'middle' }, '首板'));
						} else {
							const rate = rateInto(lv, c);
							if (rate !== null && cellH >= 26) {
								els.push(React.createElement('text', { key: 'lr' + lv + '_' + c, x: cx, y: yOf(lv) + cellH / 2 + 10, fontSize: 9, fontWeight: '600', fill: rateFill, textAnchor: 'middle' }, '晋级率 ' + rate.toFixed(0) + '%'));
							}
						}
					}
				}
				els.push(React.createElement('text', { key: 'll' + lv, x: W - R + 4, y: yOf(lv) + cellH / 2 + 3, fontSize: 11, fill: 'rgba(128,128,128,0.85)' }, lv === 1 ? '首板' : lv + '板'));
			}
			// 日期列标签
			const xStep = Math.max(1, Math.ceil(nCols / 8));
			for (let c = 0; c < nCols; c += xStep) {
				els.push(React.createElement('text', { key: 'cl' + c, x: xOf(c) + cellW / 2, y: H - 6, fontSize: 10, fill: 'rgba(128,128,128,0.85)', textAnchor: 'middle' }, shortTime(String(dates[c]))));
			}
			if (hover !== null) {
				els.push(React.createElement('rect', { key: 'hx', x: xOf(hover.c), y: yOf(hover.level), width: cellW, height: cellH, fill: 'none', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 1.5 }));
			}
			let tip = null;
			if (hover !== null) {
				const v = counts[hover.level] ? counts[hover.level][hover.c] : null;
				const rate = rateInto(hover.level, hover.c);
				const broken = brokenOf(hover.level, hover.c);
				const names = stockList[hover.level] ? stockList[hover.level][hover.c] : null;
				const tipLines = [
					React.createElement('div', { key: 't0' }, React.createElement('b', null, String(dates[hover.c]) + '  ' + (hover.level === 1 ? '首板' : hover.level + '板'))),
					React.createElement('div', { key: 't1' }, '家数 ', React.createElement('b', null, v !== null ? String(v) : '—')),
					hover.level === 1
						? React.createElement('div', { key: 't2' }, '首板（新涨停，无晋级）')
						: React.createElement('div', { key: 't2' },
							'晋级 ', React.createElement('b', { style: { color: rate !== null && rate >= 50 ? UP_COLOR : undefined } }, rate !== null ? rate.toFixed(1) + '%' : '—'),
							'（昨 ' + (hover.level - 1) + ' 板', broken !== null ? '，断板 ' + broken + ' 家' : '', '）'),
				];
				if (names !== null && names.length > 0) {
					tipLines.push(React.createElement('div', { key: 't3' }, '股票：', names.slice(0, 8).join('、'), names.length > 8 ? ' 等 ' + names.length + ' 只' : ''));
				}
				const flip = hover.w - hover.px < 220;
				tip = React.createElement('div', { className: 'tc-tip', style: { left: (flip ? hover.px - 236 : hover.px + 12) + 'px', top: Math.max(4, hover.py - 26) + 'px' } }, tipLines);
			}
			return React.createElement('div', { className: 'tc-chart-wrap' },
				React.createElement('svg', { className: 'tc-chart', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet', onMouseMove: onMove, onMouseLeave: () => setHover(null) }, els),
				tip
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
			else if (spec !== null && spec.type === 'heatmap') body = React.createElement(HeatmapChart, { spec });
			else if (spec !== null && spec.type === 'ladder') body = React.createElement(LadderChart, { spec });
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

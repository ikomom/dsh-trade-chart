/* 推送前验证：语法 + 宿主冒烟 + 客户端渲染冒烟 + 真实启动冒烟。
 * 运行：node scripts/verify.mjs（全绿退出码 0，任一失败退出码 1）
 * 跨平台：DSH 部署目录自动探测（环境变量 DSH_DEPLOY > npm 全局 > 本地链接反推），
 * 不再硬编码任何平台的路径。 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SMOKE_PORT = 3091;

/** 探测 DSH 部署目录（@deepseek-ai/dsh 包的根）：返回绝对路径，找不到返回 null。 */
function detectDshDeploy() {
  // 1. 环境变量优先（最明确）
  if (process.env.DSH_DEPLOY && existsSync(join(process.env.DSH_DEPLOY, 'lib/bin.js'))) {
    return process.env.DSH_DEPLOY;
  }
  // 2. 从本地 node_modules 里的 dsh-tools 链接反推部署位置
  //    （README：本地开发时 dsh-tools 以 junction/symlink 指向 DSH 部署目录）
  try {
    const req = createRequire(join(root, 'verify.mjs'));
    const toolsPkg = req.resolve('@deepseek-ai/dsh-tools/package.json');
    // toolsPkg 形如 <deploy>/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/package.json
    const m = toolsPkg.match(/(.+)[\\/]node_modules[\\/]@deepseek-ai[\\/]dsh[\\/]node_modules[\\/]@deepseek-ai[\\/]dsh-tools[\\/]package\.json$/);
    if (m && existsSync(join(m[1], 'lib/bin.js'))) return m[1];
    // 链接指向的可能是 dsh-tools 自身目录：再向上找两级的 @deepseek-ai/dsh
    const real = realpathSync(dirname(dirname(toolsPkg))); // .../node_modules/@deepseek-ai
    const cand = join(real, 'dsh');
    if (existsSync(join(cand, 'lib/bin.js'))) return cand;
  } catch (e) { /* 本地未链接 dsh-tools，走下一步 */ }
  // 3. npm 全局安装位置
  try {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    const cand = join(g, '@deepseek-ai', 'dsh');
    if (existsSync(join(cand, 'lib/bin.js'))) return cand;
  } catch (e) { /* npm 不可用 */ }
  // 4. 常见安装位置（跨平台候选）
  const home = process.env.HOME || process.env.USERPROFILE || '';
  for (const cand of [
    '/usr/local/lib/node_modules/@deepseek-ai/dsh',
    '/usr/lib/node_modules/@deepseek-ai/dsh',
    home ? join(home, '.nvm/versions/node/v22.22.1/lib/node_modules/@deepseek-ai/dsh') : null,
    home ? join(home, '.nvm/versions/node/v20.19.0/lib/node_modules/@deepseek-ai/dsh') : null,
  ]) {
    if (!cand) continue;
    if (existsSync(join(cand, 'lib/bin.js'))) return cand;
  }
  // 5. 从全局 node_modules 里扫描 @deepseek-ai/dsh（兜底）
  try {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    const dshDir = join(g, '@deepseek-ai', 'dsh');
    if (existsSync(join(dshDir, 'lib/bin.js'))) return dshDir;
  } catch (e) { /* npm 不可用 */ }
  return null;
}

const DSH_DEPLOY = detectDshDeploy();
const DSH_NODE_MODULES = DSH_DEPLOY ? join(DSH_DEPLOY, 'node_modules') : null;
const DSH_BIN = DSH_DEPLOY ? join(DSH_DEPLOY, 'lib/bin.js') : null;

let failed = 0;
const ok = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { console.log('  ✗ ' + msg); failed++; };

// ---------- 1. 语法检查 ----------
console.log('== 1. 语法检查 ==');
for (const f of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml']) {
  if (!f.endsWith('.js')) { if (existsSync(join(root, f))) ok(f + ' 存在'); continue; }
  try {
    execFileSync(process.execPath, ['--check', join(root, f)], { stdio: 'pipe' });
    ok(f);
  } catch (e) {
    fail(f + ' 语法错误: ' + String(e.stderr || e.message).slice(0, 300));
  }
}

// 红线：@deepseek-ai/dsh-* 核心包只允许出现在 peerDependencies，
// 放进 dependencies 会让 pnpm 在宿主 profile 安装第二份 DSH 核心，破坏会话恢复（见 issue #1）。
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const coreInDeps = Object.keys(pkg.dependencies || {}).filter((d) => d.startsWith('@deepseek-ai/dsh-'));
if (coreInDeps.length === 0) ok('dependencies 不含 @deepseek-ai/dsh-* 核心包（红线）');
else fail('dependencies 含核心包: ' + coreInDeps.join(', ') + '（应仅保留在 peerDependencies）');

// ---------- 2. 宿主冒烟（真实 DSH 依赖解析，依赖位于插件 node_modules） ----------
console.log('== 2. 宿主冒烟 ==');
try {
  const m = await import('file://' + join(root, 'lib/index.js').replace(/\\/g, '/'));
  let tool = null;
  m.apply({ tools: { register: (t) => { tool = t; return () => {}; } } });
  if (!tool) {
    fail('apply 未注册工具');
  } else {
    const kline = Array.from({ length: 30 }, (_, i) => ({ time: 'D' + i, open: 10, high: 12, low: 9, close: 11, volume: 100 }));
    const r1 = await tool.execute({ chart: { type: 'kline', kline, pivots: true, pivotLookback: 3, annotations: [{ type: 'hline', price: 10, label: 'x' }, { type: 'note', time: 'D5', price: 11, text: 'n' }] } });
    if (typeof r1 === 'string' && r1.includes('已渲染')) ok('execute：K线 + 波段 + 标注');
    else fail('execute 输出异常: ' + String(r1).slice(0, 100));
    const r2 = await tool.execute({ chart: { type: 'line', series: [{ name: 'a', data: [1, 2, 3] }] } });
    if (typeof r2 === 'string' && r2.includes('已渲染')) ok('execute：折线图');
    else fail('execute 折线异常: ' + String(r2).slice(0, 100));
    const r3 = await tool.execute({ chart: { type: 'kline', kline, indicators: { macd: true, rsi: [14], boll: true, ema: [12, 26], mavol: [5, 10], kdj: true } } });
    if (typeof r3 === 'string' && r3.includes('MACD') && r3.includes('RSI14') && r3.includes('BOLL') && r3.includes('KDJ')) ok('execute：技术指标摘要');
    else fail('execute 指标异常: ' + String(r3).slice(0, 200));
    const r5 = await tool.execute({ chart: { type: 'heatmap', heatmap: { rows: ['AI', '机器人'], categories: ['07-01', '07-02'], values: [[5.2, 3.1], [-1.5, 2.3]], unit: '%' } } });
    if (typeof r5 === 'string' && r5.includes('热点') && r5.includes('领涨')) ok('execute：热点轮动矩阵');
    else fail('execute 热点矩阵异常: ' + String(r5).slice(0, 150));
    const r6 = await tool.execute({ chart: { type: 'ladder', ladder: [{ date: '2026-07-01', boards: [{ level: 1, count: 42 }, { level: 2, count: 9, stocks: ['东方财富', '中国银河'] }] }, { date: '2026-07-02', boards: [{ level: 1, count: 38 }, { level: 2, count: 11 }] }] } });
    if (typeof r6 === 'string' && r6.includes('连板') && r6.includes('最高 2 板') && r6.includes('东方财富')) ok('execute：连板晋级（含股票名单）');
    else fail('execute 连板异常: ' + String(r6).slice(0, 150));
    try {
      await tool.execute({ chart: { type: 'heatmap', heatmap: { rows: ['a'], categories: ['x', 'y'], values: [[1]] } } });
      fail('非法矩阵未被拒绝');
    } catch (e) { ok('非法矩阵被拒绝'); }
    try {
      await tool.execute({ chart: { type: 'kline', kline, indicators: { macd: { fast: 26, slow: 12, signal: 9 } } } });
      fail('非法指标参数未被拒绝');
    } catch (e) { ok('非法指标参数被拒绝'); }
    try {
      await tool.execute({ chart: { type: 'kline', kline: Array.from({ length: 5001 }, () => ({ time: 'x', open: 1, high: 1, low: 1, close: 1 })) } });
      fail('5001 根未被拒绝');
    } catch (e) { ok('5001 根被拒绝（上限保护）'); }
    try {
      await tool.execute({ chart: { type: 'kline', kline, annotations: [{ type: 'pivot', price: 10 }] } });
      fail('非法标注未被拒绝');
    } catch (e) { ok('非法标注被拒绝'); }
  }
} catch (e) {
  fail('宿主加载失败: ' + e.message);
}

// ---------- 3. 客户端冒烟 ----------
console.log('== 3. 客户端冒烟 ==');
if (!DSH_DEPLOY) {
  console.log('  ⚠ 未探测到 DSH 部署目录（可通过环境变量 DSH_DEPLOY 指定），跳过客户端渲染冒烟');
  console.log('    例如: DSH_DEPLOY=/path/to/@deepseek-ai/dsh node scripts/verify.mjs');
} else {
  // 客户端冒烟需要 react / react-dom/server。原逻辑从 DSH 部署目录向上解析
  // （react 在 dsh/node_modules，react-dom 在 nvm 全局 node_modules），
  // 若当前环境没有可用的 react-dom/server，则降级跳过（不判失败）。
  let req = null;
  try {
    const r = createRequire(join(DSH_NODE_MODULES, 'verify.js'));
    r.resolve('react-dom/server');
    req = r;
  } catch (e) { req = null; }
  if (!req) {
    console.log('  ⚠ 当前环境无 react-dom/server（DSH 部署目录: ' + DSH_DEPLOY + '），跳过客户端渲染冒烟');
    console.log('    在装有 react-dom 的完整 DSH 环境（如 npm 全局安装）下会自动运行');
  } else {
  try {
    globalThis.window = globalThis;
    globalThis.document = {
      querySelector: () => null,
      createElement: () => ({ dataset: {}, style: {}, setAttribute() {}, select() {}, appendChild() {}, remove() {} }),
      head: { appendChild() {} },
      body: { appendChild() {}, removeChild() {} },
    };
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    let factory = null;
    globalThis.__ModuleLoader__ = { load: (o) => { factory = o.factory; } };
    let clientCode = readFileSync(join(root, 'lib/client.js'), 'utf8');
    clientCode = clientCode.replace('return module.exports;', 'exports.TradeChartCard = TradeChartCard; return module.exports;');
    (0, eval)(clientCode);
    const out = factory(req);
    const React = req('react');
    const { renderToString } = req('react-dom/server');
    const kline = Array.from({ length: 30 }, (_, i) => ({ time: 'D' + i, open: 10, high: 12, low: 9, close: 11, volume: 100 }));
    const block = (chart) => ({ kind: 'r', callId: 'c1', call: { name: 'trade_chart', argsRaw: JSON.stringify({ chart }) }, content: [], isError: false });
    const h1 = renderToString(React.createElement(out.TradeChartCard, { block: block({ type: 'kline', kline, pivots: true, annotations: [{ type: 'hline', price: 10, label: '支撑' }] }) }));
    if (h1.includes('<svg') && h1.includes('MA5') && h1.includes('支撑')) ok('K线渲染（标注/均线）');
    else fail('K线渲染异常');
    const h4 = renderToString(React.createElement(out.TradeChartCard, { block: block({ type: 'kline', kline, indicators: { macd: true, rsi: [14], boll: true, ema: [12, 26], mavol: [5, 10], kdj: true } }) }));
    if (h4.includes('MACD') && h4.includes('RSI14') && h4.includes('BOLL') && h4.includes('KDJ') && h4.includes('MAVOL5')) ok('K线渲染（技术指标副图/主图）');
    else fail('指标渲染异常: ' + h4.slice(0, 200));
    const h5 = renderToString(React.createElement(out.TradeChartCard, { block: block({ type: 'heatmap', heatmap: { rows: ['AI', '机器人'], categories: ['07-01', '07-02'], values: [[5.2, 3.1], [-1.5, 2.3]], unit: '%' } }) }));
    if (h5.includes('AI') && h5.includes('07-01')) ok('热点矩阵渲染');
    else fail('热点矩阵渲染异常: ' + h5.slice(0, 200));
    const h6 = renderToString(React.createElement(out.TradeChartCard, { block: block({ type: 'ladder', ladder: [{ date: '2026-07-01', boards: [{ level: 1, count: 42 }, { level: 2, count: 9, stocks: ['东方财富', '中国银河', '华泰证券'] }] }, { date: '2026-07-02', boards: [{ level: 1, count: 38 }, { level: 2, count: 11 }] }] }) }));
    if (h6.includes('首板') && h6.includes('2板') && h6.includes('东方财富') && h6.includes('晋级率 26%')) ok('连板晋级渲染（含股票名单与晋级率）');
    else fail('连板渲染异常: ' + h6.slice(0, 200));
    const h2 = renderToString(React.createElement(out.TradeChartCard, { block: block({ type: 'line', series: [{ name: 'a', data: [1, 2, 3] }] }) }));
    if (h2.includes('<svg')) ok('折线渲染');
    else fail('折线渲染异常');
    const h3 = renderToString(React.createElement(out.TradeChartCard, { block: { ...block({}), call: { name: 'trade_chart', argsRaw: 'bad-json' } } }));
    if (h3.includes('图表参数缺失')) ok('错误路径降级');
    else fail('错误路径异常');
  } catch (e) {
    fail('客户端加载/渲染失败: ' + e.message);
  }
  }
}

// ---------- 4. 真实启动冒烟 ----------
console.log('== 4. 启动冒烟（临时实例 :' + SMOKE_PORT + '） ==');
if (!DSH_DEPLOY) {
  console.log('  ⚠ 未探测到 DSH 部署目录，跳过启动冒烟');
} else {
  try {
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, [DSH_BIN, '--profile', 'web', '--port', String(SMOKE_PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: root,
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    let booted = false;
    for (let i = 0; i < 45 && !booted; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const r = await fetch('http://127.0.0.1:' + SMOKE_PORT + '/plugins/@ikonon/dsh-trade-chart/client.js');
        if (r.ok) {
          const boot = await fetch('http://127.0.0.1:' + SMOKE_PORT + '/').then((x) => x.text());
          if (boot.includes('@ikonon/dsh-trade-chart')) booted = true;
        }
      } catch (e) { /* 未就绪 */ }
    }
    if (booted) {
      ok('临时实例启动，插件 bundle 已服务且进入 boot entries');
      const errLines = log.split('\n').filter((l) => /trade-chart/i.test(l) && /error|fail|throw/i.test(l));
      if (errLines.length > 0) {
        fail('启动日志含插件错误: ' + errLines.slice(0, 3).join(' | '));
      } else {
        ok('启动日志无插件错误');
      }
    } else {
      fail('临时实例未在 45s 内就绪（端口 ' + SMOKE_PORT + ' 可能被占用）');
      console.log(log.slice(-1500));
    }
    try { child.kill(); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
  } catch (e) {
    fail('启动冒烟执行失败: ' + e.message);
  }
}

console.log('\nDSH 部署目录: ' + (DSH_DEPLOY ? DSH_DEPLOY : '未探测到（跳过客户端/启动冒烟）'));
console.log(failed === 0 ? '\nVERIFY PASS ✓' : '\nVERIFY FAIL ✗（' + failed + ' 项）');
process.exit(failed === 0 ? 0 : 1);

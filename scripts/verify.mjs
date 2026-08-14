/* 推送前验证：语法 + 宿主冒烟 + 客户端渲染冒烟 + 真实启动冒烟。
 * 运行：node scripts/verify.mjs（全绿退出码 0，任一失败退出码 1） */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DSH_DEPLOY = process.env.DSH_DEPLOY || 'D:/Software/nvm/v22.22.2/node_modules/@deepseek-ai/dsh';
const DSH_NODE_MODULES = join(DSH_DEPLOY, 'node_modules');
const DSH_BIN = join(DSH_DEPLOY, 'lib/bin.js');
const SMOKE_PORT = 3091;

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
try {
  const req = createRequire(join(DSH_NODE_MODULES, 'verify.js'));
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
  if (h1.includes('<svg') && h1.includes('MA5') && h1.includes('支撑') && h1.includes('⧉ 复制标注')) ok('K线渲染（标注/均线/工具栏）');
  else fail('K线渲染异常');
  const h2 = renderToString(React.createElement(out.TradeChartCard, { block: block({ type: 'line', series: [{ name: 'a', data: [1, 2, 3] }] }) }));
  if (h2.includes('<svg')) ok('折线渲染');
  else fail('折线渲染异常');
  const h3 = renderToString(React.createElement(out.TradeChartCard, { block: { ...block({}), call: { name: 'trade_chart', argsRaw: 'bad-json' } } }));
  if (h3.includes('图表参数缺失')) ok('错误路径降级');
  else fail('错误路径异常');
} catch (e) {
  fail('客户端加载/渲染失败: ' + e.message);
}

// ---------- 4. 真实启动冒烟 ----------
console.log('== 4. 启动冒烟（临时实例 :' + SMOKE_PORT + '） ==');
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

console.log(failed === 0 ? '\nVERIFY PASS ✓' : '\nVERIFY FAIL ✗（' + failed + ' 项）');
process.exit(failed === 0 ? 0 : 1);

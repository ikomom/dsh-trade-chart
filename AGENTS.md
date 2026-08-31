# AGENTS.md

## What this project is

A DeepSeek Harness plugin that renders trading charts — candlestick / line / bar / area, technical indicators (EMA/BOLL/MAVOL/MACD/RSI/KDJ), sector-rotation heatmaps and limit-up ladders — directly in the conversation as hand-written inline SVG. No charting library, zero runtime dependencies. Two halves: the host (`lib/index.js`) registers the `trade_chart` tool and validates arguments; the client (`lib/client.js`) renders the SVG chart cards. A static examples page (`docs/index.html`) is generated from the real client renderer and served on GitHub Pages.

## Runtime & tooling

- Node >= 18. No build step, no test framework — verification is one smoke script.
- pnpm is the package manager of dsh profiles: `dsh plugin --profile web <add|update|remove> <pkg>` forwards to pnpm inside the profile directory. The plugin installs as `github:ikomom/dsh-trade-chart` (floating git spec) or `@ikonon/dsh-trade-chart` from npm.

## Layout — what to read before modifying

| Path | Role |
|------|------|
| `lib/index.js` | Host: tool registration, param validation, swing/pivot detection, model-facing summary. The tool description here is shown to the model — wording matters. |
| `lib/client.js` | Client: the entire SVG renderer — KlineChart / SimpleChart / HeatmapChart / LadderChart, indicators, crosshair, zoom/pan. |
| `scripts/verify.mjs` | Pre-push smoke: syntax, host smoke, client-render smoke, real boot smoke. Steps auto-skip when no DSH deploy dir is detected; set `DSH_DEPLOY` to force them. |
| `scripts/make-preview.mjs` | Regenerates `docs/index.html` (static SVG examples page) from the real client renderer — no DSH restart needed. |
| `cordis.patch.yml` | Profile composition patch that mounts the plugin (row id `trade-chart`). |
| `docs/index.html` | Committed examples page; GitHub Pages deploys from `master` / `docs`. |

User-facing docs are `README.md` (中文) and `README.en.md` — read them before touching any public wording.

## Development workflow

1. Edit `lib/*.js`, then run `node scripts/verify.mjs` (exit 0 = pass). A local `.git/hooks/pre-push` runs it automatically on push; in sandboxed environments where the boot smoke (real DSH instance on port 3091) hangs, push with `git push --no-verify`.
2. After any client rendering change, regenerate and commit the examples page: `node scripts/make-preview.mjs` → `docs/index.html`. GitHub Pages rebuilds automatically on push.
3. Push to `master` and let the pre-push hook verify.

## Non-obvious constraints

- **Public docs must never name the market-data tools** (longbridge / hithink): READMEs, the repo description and the examples page all say the chart data is "合成演示数据 / synthetic demo data". The internal tool description in `lib/index.js` may reference them, nowhere public may.
- **A-share visual conventions**: red = up (`#e5484d`), green = down (`#2f9e6e`); heatmap colors diverge from 0; ladder first board at the bottom, promotion rates auto-computed.
- **Bilingual READMEs stay in sync**: same sections, same content, 中文 vs English. User-facing only — developer workflow (verify, regenerate, structure) lives here in AGENTS.md, not in the READMEs.
- **`lib/client.js` runs inside a stubbed DOM** when make-preview.mjs executes it: keep renderer code free of browser-only globals at module top level; event handlers may use them (they never run statically).
- **Release flow**: bump `package.json` version + README badge, tag and `gh release create`; npm publishing is manual. The npm scope is `@ikonon` while the GitHub owner is `ikomom` — GitHub Packages registry is deliberately not used.
- **Data limits**: candles ≤800 render directly, 800–5000 auto-aggregate, >5000 are rejected — the limit lives in the tool description and the client; keep them consistent.

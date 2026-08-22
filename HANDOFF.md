# HANDOFF — yuuki terminal

_Last updated: 2026-08-21 (session 1 — initial build)_

## State: v1 complete, smoke-verified, deployed

- All requested feature areas built and verified in a real browser (28-check Playwright smoke, all passing, zero console errors).
- `npm run build` (tsc + vite) is clean.
- LIVE at https://yuuki-terminal.vercel.app (public, verified in prod with a browser check).
- Public repo: https://github.com/Gariyuuu/yuuki-terminal
- **Deploys are manual**: `vercel deploy --prod` — GitHub→Vercel auto-deploy is NOT wired. Pushing alone does not deploy.

## Architecture (read this before touching anything)

Everything hinges on one boundary: **the UI only consumes `Block` and `SessionState`**
(`src/engine/types.ts`). The simulated shell could be replaced by node-pty/SSH backends without UI changes.

- `src/engine/` — the simulated shell
  - `types.ts` — all domain types. Start here.
  - `shell.ts` — builtins (`cd/ls/cat/grep/…`), `rule()/canned()/streamed()` helpers for env authors.
  - `vfs.ts` — path normalize / virtual fs over `EnvDef.files`.
  - `ansi.tsx` — minimal ANSI SGR parser + `<Ansi>` renderer + `c.*` color helpers.
  - `envs/*.ts` — the four fixture environments. Each owns files, command rules, seeded history, base processes. `envs/index.ts` also holds the SSH host registry.
  - `failures.ts` — failure knowledge base (pattern → explanation + suggestion). Suggestions are inserted into the prompt, never run.
  - `composer.ts` — deterministic NL→command rules (same contract an LLM backend would serve).
- `src/state/store.ts` — zustand store: sessions, tabs/pane-tree, exec runtime (cancellation via
  module-level controllers + wakeable sleeps), dynamic processes, history, workspaces, persistence
  (localStorage key `yuuki-terminal-v1`: user workspaces + user pins only).
- `src/components/` — TabBar, PaneGrid (recursive splits), TerminalPane (prompt, search, per-pane),
  BlockView, Composer, Panels (history/processes/hosts/workspaces/library/inspector), StatusBar, Shortcuts.
- `src/styles/tokens.css` — ALL colors/spacing/motion as tokens (hallmark Terminal theme). Never inline colors.

## Behavior invariants (do not break)

1. **AI/suggestions never auto-execute.** Composer and failure inspector only prefill the prompt.
2. Destructive suggestions carry a `destructive` reason and render with warning treatment.
3. One foreground process per session; ⌃C works globally for the active pane (App.tsx handler) because the prompt input is disabled while running.
4. `EADDRINUSE` simulation: `portInUse()` checks dynamic + base processes on the same machine (hostname). Don't sort or mutate process arrays in place.
5. SSH: no credentials anywhere; copy always says auth is delegated to ssh-agent.
6. Long-running handlers must check `ctx.signal.cancelled` inside every loop and return 130.

## How to verify changes

```sh
npm run build
npm run preview -- --port 4823 &
node scripts/smoke.mjs   # 28 assertions across all feature areas
```

## Known gaps / next-session candidates

- Pane split ratios are fixed 50/50 (no drag-to-resize yet).
- Search highlights plain text (ANSI colors drop out while a query is active) — acceptable tradeoff, documented in BlockView.
- `staging-02` / `gpu-box` reuse the deploy-01 env fixture (labeled in envs/index.ts).
- Composer rules are deterministic; wiring a real LLM backend would slot into `compose()`.
- No xterm.js/pty — by design for the demo; the swap path is documented in types.ts.

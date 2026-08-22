# yuuki terminal

A serious developer terminal environment: the immediacy of a traditional terminal plus modern
session management, project awareness, command intelligence, observability, and optional AI
assistance. It is a terminal that evolved — not a GUI wearing a terminal costume.

**Demo build.** The shell is simulated in-browser against four realistic fixture environments so
every feature is explorable with zero risk. The engine boundary (`src/engine/types.ts`) is designed
so a real backend — node-pty locally, an SSH channel remotely — can replace the simulated
`CommandHandler` layer without touching the UI.

## What's inside

- **Terminal engine** — tabs, split panes (⌘D / ⌘⇧D), scrollback, per-session input history (↑/↓),
  tab completion, ANSI rendering, long-running processes, ⌃C cancellation, ⌘F scrollback search,
  zsh/bash prompts, working directories, `ssh`/`exit` session stacking.
- **Command blocks** — commands and output stay terminal-native but form subtle navigable blocks:
  collapse, copy command/output, rerun, edit-and-rerun, bookmark, share (formatted copy), exit
  status + duration on every block. Failed blocks carry a clickable `exit N` tag.
- **Project awareness** — one-line status strip: branch, dirty count, runtime, package manager,
  live ports (static + dynamically bound), host + latency, recent commands.
- **Failure intelligence** — a knowledge base over (command, output, exit): exit meaning, likely
  error location, relevant earlier commands, an explanation, and a suggested correction that is
  only ever *inserted into the prompt* for review. Destructive suggestions are flagged loudly.
- **⌘K composer** — plain English → proposed command with a flag-by-flag breakdown. The user
  decides; nothing composed is ever executed automatically.
- **SSH** — saved hosts with pinned ed25519 fingerprints, connection state, live latency, per-host
  tinting, MOTD banners. Auth is delegated to ssh-agent; no credentials are ever stored.
- **Process view** — per-machine process tables (cpu/mem/ports/parent-child), with jump-back to
  the terminal session that launched a process.
- **History** — cross-session search filtered by project, directory, host, exit status, and date;
  pin commands into per-project command libraries.
- **Workspaces** — repo + layout + directories + frequent commands + notes + services; restoring
  reconstructs the whole development context, including autorun services.

## Demo environments

| workspace | what it demonstrates |
| --- | --- |
| `atlas-web` (Next.js) | dev server autorun, EADDRINUSE port conflict, TS build failure, failing vitest, git upstream failure |
| `torch-lab` (Python ML) | long training runs with graceful ⌃C, pytest failure triage, MPS-vs-CUDA intelligence |
| `deploy-01` (remote Linux) | ssh flow, systemd/journald, live log following, disk pressure, production guard rails |
| `atlas postgres` | blocked migration chain (0042 needs 0041), psql, pgbench, dropdb refusal |

## Run

```sh
npm install
npm run dev        # local dev
npm run build      # typecheck + production build
node scripts/smoke.mjs   # Playwright end-to-end smoke (28 checks) — needs `npm run preview -- --port 4823` running
```

## Principles

Optimized for people who already know terminals: no over-explaining, no replacing the CLI, no
cards, and AI never executes commands on its own.

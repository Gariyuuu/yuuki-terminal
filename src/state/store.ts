import { create } from "zustand";
import type {
  Block, ExecCtx, HistoryEntry, PaneNode, PinnedCommand, ProcInfo,
  SessionState, Tab, Workspace,
} from "../engine/types";
import { ENVS, getEnv, getHost, HOSTS } from "../engine/envs";
import { builtins, notFound, tokenize } from "../engine/shell";
import { c } from "../engine/ansi";
import { displayPath } from "../engine/vfs";

let counter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export type PanelId = "history" | "processes" | "hosts" | "workspaces" | "library";

// ---- non-reactive exec controllers ----
interface Controller {
  signal: { cancelled: boolean };
  wakers: Set<() => void>;
}
const controllers = new Map<string, Controller>();
let pidCounter = 40100;

// ---- persistence ----
const LS_KEY = "yuuki-terminal-v1";
interface Persisted {
  workspaces: Workspace[];
  pinned: PinnedCommand[];
}
function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Persisted;
  } catch { /* fresh start */ }
  return { workspaces: [], pinned: [] };
}
function savePersisted(p: Persisted) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* quota */ }
}

// ---- builtin workspaces ----
const BUILTIN_WORKSPACES: Workspace[] = [
  {
    id: "ws-atlas",
    name: "atlas-web",
    repo: "github.com/atlas-inc/atlas-web",
    builtin: true,
    tabs: [{ panes: [{ envId: "atlas-web" }, { envId: "atlas-web", autorun: "pnpm dev" }], splitDir: "row" }],
    notes: "Checkout flow branch. Rounding bug in pricing.ts is the open thread — fix round2 placement, then pnpm test.",
    frequentCommands: ["pnpm dev", "pnpm test", "pnpm build", "git status", "git diff --stat"],
    services: [{ name: "next dev", command: "pnpm dev", port: 3000 }],
  },
  {
    id: "ws-torch",
    name: "torch-lab",
    repo: "github.com/gary/torch-lab",
    builtin: true,
    tabs: [{ panes: [{ envId: "torch-lab" }] }],
    notes: "exp8 sweep next: lr 1e-4 vs 3e-4 at 24 epochs. precision_at_k tie-break test is red — fix sort stability in tlab/metrics.py first.",
    frequentCommands: ["python train.py --epochs 12", "pytest", "tensorboard --logdir runs", "python eval.py --ckpt runs/exp7/best.pt"],
    services: [{ name: "tensorboard", command: "tensorboard --logdir runs", port: 6006 }],
  },
  {
    id: "ws-ops",
    name: "deploy-01 ops",
    builtin: true,
    tabs: [{ panes: [{ envId: "deploy-01" }, { envId: "deploy-01", autorun: "journalctl -u atlas-api -f" }], splitDir: "row" }],
    notes: "/var/lib/postgresql at 92% — schedule WAL archive cleanup before Friday. pg pool timeouts recur around 05:00 UTC.",
    frequentCommands: ["systemctl status atlas-api", "journalctl -u atlas-api -n 100", "df -h", "docker ps", "./deploy.sh"],
    services: [{ name: "atlas-api", command: "systemctl status atlas-api", port: 8080 }],
  },
  {
    id: "ws-db",
    name: "atlas postgres",
    builtin: true,
    tabs: [{ panes: [{ envId: "pg-dev" }] }],
    notes: "Migration 0042 (invoices) blocked: 0041 (orders) was never applied. Apply 0041 then re-run make migrate.",
    frequentCommands: ['psql -d atlas_dev -c "\\dt"', "make migrate", "pg_ctl status", "pgbench -c 10 -T 5 atlas_bench"],
    services: [{ name: "postgres 16", command: "pg_ctl status", port: 5432 }],
  },
  {
    id: "ws-fullstack",
    name: "atlas full-stack",
    builtin: true,
    tabs: [
      { title: "web", panes: [{ envId: "atlas-web" }, { envId: "atlas-web", autorun: "pnpm dev" }], splitDir: "row" },
      { title: "db", panes: [{ envId: "pg-dev" }] },
      { title: "prod", panes: [{ envId: "deploy-01" }] },
    ],
    notes: "Everything for the checkout feature: web + schema + prod api in one place.",
    frequentCommands: ["pnpm test", "make migrate", "systemctl status atlas-api"],
    services: [
      { name: "next dev", command: "pnpm dev", port: 3000 },
      { name: "postgres 16", command: "pg_ctl status", port: 5432 },
    ],
  },
];

// ---- seed history from env fixtures ----
function seedHistory(): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const env of Object.values(ENVS)) {
    for (const s of env.seedHistory) {
      out.push({
        id: uid("h"),
        command: s.command,
        cwd: s.cwd ?? env.defaultCwd,
        envId: env.id,
        host: env.kind === "ssh" ? env.id : "local",
        exitCode: s.exitCode,
        at: Date.now() - s.hoursAgo * 3600_000,
        durationMs: s.durationMs,
      });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

const SEED_PINNED: PinnedCommand[] = [
  { id: "p1", envId: "atlas-web", command: "pnpm test -- --reporter=verbose", note: "full test names when hunting a flake" },
  { id: "p2", envId: "atlas-web", command: "git log --oneline -n 10", note: "" },
  { id: "p3", envId: "deploy-01", command: "journalctl -u atlas-api --since '1 hour ago' | grep '\"level\":50'", note: "errors only, last hour" },
  { id: "p4", envId: "pg-dev", command: 'psql -d atlas_dev -c "SELECT count(*) FROM customers;"', note: "sanity row count" },
  { id: "p5", envId: "torch-lab", command: "pytest tests/test_metrics.py -x", note: "metrics suite, stop at first failure" },
];

// ---- pane tree helpers ----
function leafIds(node: PaneNode): string[] {
  return node.type === "leaf" ? [node.id] : [...leafIds(node.a), ...leafIds(node.b)];
}
function findLeaf(node: PaneNode, id: string): Extract<PaneNode, { type: "leaf" }> | null {
  if (node.type === "leaf") return node.id === id ? node : null;
  return findLeaf(node.a, id) ?? findLeaf(node.b, id);
}
function splitLeaf(node: PaneNode, id: string, dir: "row" | "col", newLeaf: PaneNode): PaneNode {
  if (node.type === "leaf") {
    if (node.id !== id) return node;
    return { type: "split", id: uid("sp"), dir, ratio: 0.5, a: node, b: newLeaf };
  }
  return { ...node, a: splitLeaf(node.a, id, dir, newLeaf), b: splitLeaf(node.b, id, dir, newLeaf) };
}
function removeLeaf(node: PaneNode, id: string): PaneNode | null {
  if (node.type === "leaf") return node.id === id ? null : node;
  const a = removeLeaf(node.a, id);
  const b = removeLeaf(node.b, id);
  if (a && b) return { ...node, a, b };
  return a ?? b;
}

interface YuukiStore {
  sessions: Record<string, SessionState>;
  blocks: Record<string, Block[]>;
  tabs: Tab[];
  activeTabId: string;
  processes: ProcInfo[]; // ephemeral, spawned by running blocks
  history: HistoryEntry[];
  pinned: PinnedCommand[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  panel: PanelId | null;
  inspector: { sessionId: string; blockId: string } | null;
  composerOpen: boolean;
  shortcutsOpen: boolean;
  running: Record<string, boolean>;
  promptPrefill: { sessionId: string; text: string; nonce: number } | null;
  searchFor: string | null; // sessionId whose pane search bar is open
  setSearchFor: (sessionId: string | null) => void;

  boot: () => void;
  runCommand: (sessionId: string, raw: string, opts?: { fast?: boolean; seeded?: boolean }) => Promise<void>;
  cancel: (sessionId: string) => void;
  newTab: (envId?: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  splitPane: (dir: "row" | "col") => void;
  closePane: (paneId?: string) => void;
  focusPane: (tabId: string, paneId: string) => void;
  openWorkspace: (wsId: string) => void;
  saveWorkspaceAs: (name: string) => void;
  deleteWorkspace: (wsId: string) => void;
  togglePanel: (p: PanelId) => void;
  openInspector: (sessionId: string, blockId: string) => void;
  closeInspector: () => void;
  setComposerOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
  toggleCollapse: (sessionId: string, blockId: string) => void;
  toggleBookmark: (sessionId: string, blockId: string) => void;
  pinCommand: (envId: string, command: string, note?: string) => void;
  unpinCommand: (id: string) => void;
  prefillPrompt: (text: string, sessionId?: string) => void;
  connectHost: (hostId: string) => void;
  activeSessionId: () => string | null;
}

export const useStore = create<YuukiStore>((set, get) => {
  const persisted = loadPersisted();

  function persist() {
    const s = get();
    savePersisted({ workspaces: s.workspaces.filter((w) => !w.builtin), pinned: s.pinned.filter((p) => !SEED_PINNED.some((sp) => sp.id === p.id)) });
  }

  function makeSession(envId: string, cwd?: string): SessionState {
    const env = getEnv(envId);
    return {
      id: uid("s"),
      envStack: [envId],
      cwd: cwd ?? env.defaultCwd,
      inputHistory: [],
      createdAt: Date.now(),
      connectedAt: env.kind === "ssh" ? Date.now() : undefined,
      hostId: env.kind === "ssh" ? envId : undefined,
    };
  }

  function currentEnvId(session: SessionState): string {
    return session.envStack[session.envStack.length - 1];
  }

  function updateBlock(sessionId: string, blockId: string, patch: Partial<Block> | ((b: Block) => Partial<Block>)) {
    set((state) => {
      const list = state.blocks[sessionId];
      if (!list) return {};
      return {
        blocks: {
          ...state.blocks,
          [sessionId]: list.map((b) => (b.id === blockId ? { ...b, ...(typeof patch === "function" ? patch(b) : patch) } : b)),
        },
      };
    });
  }

  function appendBlock(sessionId: string, block: Block) {
    set((state) => ({
      blocks: { ...state.blocks, [sessionId]: [...(state.blocks[sessionId] ?? []), block] },
    }));
  }

  function machineOf(envId: string): string {
    return getEnv(envId).hostname;
  }

  function findPortHolder(envId: string, port: number): ProcInfo | undefined {
    const machine = machineOf(envId);
    const state = get();
    const dyn = state.processes.find((p) => p.ports.includes(port) && machineOf(p.envId) === machine);
    if (dyn) return dyn;
    for (const env of Object.values(ENVS)) {
      if (env.hostname !== machine) continue;
      const base = env.baseProcesses.find((p) => p.ports.includes(port));
      if (base) return { ...base, envId: env.id };
    }
    return undefined;
  }

  async function exec(sessionId: string, raw: string, opts: { fast?: boolean; seeded?: boolean } = {}) {
    const state = get();
    const session = state.sessions[sessionId];
    if (!session) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (state.running[sessionId]) return; // one foreground process per session

    // record input history
    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: { ...session, inputHistory: [...session.inputHistory, trimmed].slice(-200) },
      },
    }));

    const envId = currentEnvId(session);
    const env = getEnv(envId);

    // -- special forms handled by the terminal itself --
    if (trimmed === "clear") {
      set((s) => ({ blocks: { ...s.blocks, [sessionId]: [] } }));
      return;
    }

    const block: Block = {
      id: uid("b"),
      sessionId,
      command: trimmed,
      cwd: session.cwd,
      envId,
      host: env.kind === "ssh" ? envId : "local",
      startedAt: Date.now(),
      durationMs: null,
      exitCode: null,
      output: "",
      collapsed: false,
      bookmarked: false,
      seeded: opts.seeded,
    };
    appendBlock(sessionId, block);
    set((s) => ({ running: { ...s.running, [sessionId]: true } }));

    const ctrl: Controller = { signal: { cancelled: false }, wakers: new Set() };
    controllers.set(sessionId, ctrl);
    const spawned: number[] = [];
    let buffer = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (!buffer) return;
      const text = buffer;
      buffer = "";
      updateBlock(sessionId, block.id, (b) => ({ output: b.output + text }));
    };
    const emit = (text: string) => {
      buffer += text;
      if (!flushTimer) {
        flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 24);
      }
    };
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        if (opts.fast || ctrl.signal.cancelled) { resolve(); return; }
        const t = setTimeout(() => { ctrl.wakers.delete(wake); resolve(); }, ms);
        const wake = () => { clearTimeout(t); resolve(); };
        ctrl.wakers.add(wake);
      });

    const ctx: ExecCtx = {
      argv: tokenize(trimmed),
      raw: trimmed,
      cwd: session.cwd,
      env,
      sessionId,
      emit,
      setCwd: (p) => {
        ctx.cwd = p;
        set((s) => ({ sessions: { ...s.sessions, [sessionId]: { ...s.sessions[sessionId], cwd: p } } }));
      },
      sleep,
      signal: ctrl.signal,
      registerProcess: (p) => {
        const pid = pidCounter++;
        const proc: ProcInfo = {
          pid, ppid: 1, user: env.user, name: p.name, cmd: p.cmd,
          cpu: p.cpu ?? 1, mem: p.mem ?? 50, ports: p.ports ?? [],
          startedAt: Date.now(), envId, sessionId, ephemeral: true,
        };
        spawned.push(pid);
        set((s) => ({ processes: [...s.processes, proc] }));
        return pid;
      },
      unregisterProcess: (pid) => {
        set((s) => ({ processes: s.processes.filter((pr) => pr.pid !== pid) }));
      },
      portInUse: (port) => findPortHolder(envId, port),
    };

    let exitCode = 0;
    try {
      exitCode = await dispatch(ctx, sessionId, trimmed);
    } catch {
      emit(`${c.red}yuuki: internal error executing command${c.reset}\n`);
      exitCode = 70;
    }

    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    flush();
    const durationMs = opts.fast
      ? Math.max(40, Math.round(80 + Math.random() * 600))
      : Date.now() - block.startedAt;
    updateBlock(sessionId, block.id, { exitCode, durationMs });
    set((s) => ({
      running: { ...s.running, [sessionId]: false },
      processes: s.processes.filter((p) => !spawned.includes(p.pid)),
      history: [
        {
          id: uid("h"), command: trimmed, cwd: block.cwd, envId, host: block.host,
          exitCode, at: block.startedAt, durationMs,
        },
        ...s.history,
      ],
    }));
    controllers.delete(sessionId);
  }

  async function dispatch(ctx: ExecCtx, sessionId: string, trimmed: string): Promise<number> {
    const argv = ctx.argv;

    // ssh / exit are session-level, not env-level
    if (argv[0] === "ssh") {
      const target = argv[argv.length - 1];
      const host = getHost(target);
      if (!host) {
        await ctx.sleep(1200);
        ctx.emit(`ssh: Could not resolve hostname ${target}: nodename nor servname provided, or not known\n`);
        return 255;
      }
      await ctx.sleep(300 + host.baseLatencyMs * 4);
      if (ctx.signal.cancelled) return 130;
      ctx.emit(`${c.gray}# ${host.user}@${host.hostname}:${host.port} · host key ${host.keyAlgo} ${host.fingerprint.slice(0, 19)}… matches known_hosts${c.reset}\n`);
      ctx.emit(`${c.gray}# auth: ${host.auth} — yuuki stores no credentials${c.reset}\n`);
      await ctx.sleep(200 + host.baseLatencyMs * 2);
      for (const l of host.motd) ctx.emit(l + "\n");
      const remoteEnv = getEnv(host.envId);
      set((s) => ({
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...s.sessions[sessionId],
            envStack: [...s.sessions[sessionId].envStack, host.envId],
            cwd: remoteEnv.defaultCwd,
            connectedAt: Date.now(),
            hostId: host.id,
          },
        },
      }));
      return 0;
    }

    if (trimmed === "exit" || trimmed === "logout") {
      const session = get().sessions[sessionId];
      if (session.envStack.length > 1) {
        const leaving = getEnv(currentEnvId(session));
        ctx.emit(`logout\nConnection to ${leaving.hostname} closed.\n`);
        const prevEnv = getEnv(session.envStack[session.envStack.length - 2]);
        set((s) => ({
          sessions: {
            ...s.sessions,
            [sessionId]: {
              ...s.sessions[sessionId],
              envStack: s.sessions[sessionId].envStack.slice(0, -1),
              cwd: prevEnv.defaultCwd,
              connectedAt: undefined,
              hostId: undefined,
            },
          },
        }));
        return 0;
      }
      ctx.emit(`${c.gray}# closing pane${c.reset}\n`);
      setTimeout(() => get().closePane(), 350);
      return 0;
    }

    if (trimmed === "history") {
      const session = get().sessions[sessionId];
      const recent = get().history
        .filter((h) => h.envId === currentEnvId(session))
        .slice(0, 15)
        .reverse();
      recent.forEach((h, i) => ctx.emit(`${String(i + 1).padStart(5)}  ${h.command}\n`));
      ctx.emit(`${c.gray}# full cross-session search: ⌃⌥H${c.reset}\n`);
      return 0;
    }

    for (const rule of ctx.env.commands) if (rule.match(argv, trimmed)) return rule.run(ctx);
    for (const rule of builtins) if (rule.match(argv, trimmed)) return rule.run(ctx);
    return notFound(ctx);
  }

  return {
    sessions: {},
    blocks: {},
    tabs: [],
    activeTabId: "",
    processes: [],
    history: seedHistory(),
    pinned: [...SEED_PINNED, ...persisted.pinned],
    workspaces: [...BUILTIN_WORKSPACES, ...persisted.workspaces],
    activeWorkspaceId: null,
    panel: null,
    inspector: null,
    composerOpen: false,
    shortcutsOpen: false,
    running: {},
    promptPrefill: null,
    searchFor: null,
    setSearchFor: (sessionId) => set({ searchFor: sessionId }),

    boot: () => {
      if (get().tabs.length > 0) return;
      get().openWorkspace("ws-atlas");
      // replay a little recent context so the terminal doesn't open cold
      const tab = get().tabs[0];
      const leftPane = leafIds(tab.layout)[0];
      const leaf = findLeaf(tab.layout, leftPane)!;
      void get().runCommand(leaf.sessionId, "git status", { fast: true, seeded: true }).then(() =>
        get().runCommand(leaf.sessionId, "pnpm test", { fast: true, seeded: true }),
      );
    },

    runCommand: (sessionId, raw, opts) => exec(sessionId, raw, opts),

    cancel: (sessionId) => {
      const ctrl = controllers.get(sessionId);
      if (!ctrl) return;
      ctrl.signal.cancelled = true;
      for (const wake of [...ctrl.wakers]) wake();
      ctrl.wakers.clear();
    },

    newTab: (envId = "atlas-web") => {
      const session = makeSession(envId);
      const leaf: PaneNode = { type: "leaf", id: uid("p"), sessionId: session.id };
      const tab: Tab = { id: uid("t"), title: getEnv(envId).label, layout: leaf, activePaneId: leaf.id };
      set((s) => ({
        sessions: { ...s.sessions, [session.id]: session },
        blocks: { ...s.blocks, [session.id]: [] },
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }));
    },

    closeTab: (tabId) => {
      const s = get();
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      for (const pid of leafIds(tab.layout)) {
        const leaf = findLeaf(tab.layout, pid);
        if (leaf) s.cancel(leaf.sessionId);
      }
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      if (tabs.length === 0) {
        set({ tabs: [] });
        get().newTab();
        return;
      }
      set({
        tabs,
        activeTabId: s.activeTabId === tabId ? tabs[Math.max(0, s.tabs.indexOf(tab) - 1)].id : s.activeTabId,
      });
    },

    setActiveTab: (tabId) => set({ activeTabId: tabId }),

    splitPane: (dir) => {
      const s = get();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      if (!tab) return;
      const active = findLeaf(tab.layout, tab.activePaneId);
      if (!active) return;
      const srcSession = s.sessions[active.sessionId];
      const session = makeSession(currentEnvId(srcSession), srcSession.cwd);
      const newLeaf: PaneNode = { type: "leaf", id: uid("p"), sessionId: session.id };
      set((state) => ({
        sessions: { ...state.sessions, [session.id]: session },
        blocks: { ...state.blocks, [session.id]: [] },
        tabs: state.tabs.map((t) =>
          t.id === tab.id
            ? { ...t, layout: splitLeaf(t.layout, active.id, dir, newLeaf), activePaneId: newLeaf.id }
            : t,
        ),
      }));
    },

    closePane: (paneId) => {
      const s = get();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      if (!tab) return;
      const target = paneId ?? tab.activePaneId;
      const leaf = findLeaf(tab.layout, target);
      if (leaf) s.cancel(leaf.sessionId);
      const next = removeLeaf(tab.layout, target);
      if (!next) {
        get().closeTab(tab.id);
        return;
      }
      const remaining = leafIds(next);
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tab.id
            ? { ...t, layout: next, activePaneId: remaining.includes(t.activePaneId) ? t.activePaneId : remaining[0] }
            : t,
        ),
      }));
    },

    focusPane: (tabId, paneId) =>
      set((s) => ({
        activeTabId: tabId,
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, activePaneId: paneId } : t)),
      })),

    openWorkspace: (wsId) => {
      const s = get();
      const ws = s.workspaces.find((w) => w.id === wsId);
      if (!ws) return;
      // tear down current sessions
      for (const sid of Object.keys(s.sessions)) s.cancel(sid);
      const sessions: Record<string, SessionState> = {};
      const blocks: Record<string, Block[]> = {};
      const tabs: Tab[] = [];
      const autoruns: { sessionId: string; command: string }[] = [];
      for (const tabSpec of ws.tabs) {
        const leaves: PaneNode[] = tabSpec.panes.map((p) => {
          const session = makeSession(p.envId, p.cwd);
          sessions[session.id] = session;
          blocks[session.id] = [];
          if (p.autorun) autoruns.push({ sessionId: session.id, command: p.autorun });
          return { type: "leaf", id: uid("p"), sessionId: session.id };
        });
        let layout: PaneNode = leaves[0];
        for (let i = 1; i < leaves.length; i++) {
          layout = { type: "split", id: uid("sp"), dir: tabSpec.splitDir ?? "row", ratio: 0.5, a: layout, b: leaves[i] };
        }
        tabs.push({
          id: uid("t"),
          title: tabSpec.title ?? getEnv(tabSpec.panes[0].envId).label,
          layout,
          activePaneId: leafIds(layout)[0],
        });
      }
      set({
        sessions, blocks, tabs,
        activeTabId: tabs[0].id,
        activeWorkspaceId: ws.id,
        processes: [],
        running: {},
        panel: null,
        inspector: null,
      });
      for (const a of autoruns) void exec(a.sessionId, a.command);
    },

    saveWorkspaceAs: (name) => {
      const s = get();
      const tabs = s.tabs.map((t) => {
        const ids = leafIds(t.layout);
        const dir = t.layout.type === "split" ? t.layout.dir : "row";
        return {
          title: t.title,
          splitDir: dir,
          panes: ids.map((pid) => {
            const leaf = findLeaf(t.layout, pid)!;
            const session = s.sessions[leaf.sessionId];
            return { envId: currentEnvId(session), cwd: session.cwd };
          }),
        };
      });
      const ws: Workspace = {
        id: uid("ws"),
        name,
        tabs,
        notes: "",
        frequentCommands: [],
        services: [],
        savedAt: Date.now(),
      };
      set((state) => ({ workspaces: [...state.workspaces, ws], activeWorkspaceId: ws.id }));
      persist();
    },

    deleteWorkspace: (wsId) => {
      set((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== wsId || w.builtin) }));
      persist();
    },

    togglePanel: (p) => set((s) => ({ panel: s.panel === p ? null : p, inspector: null })),
    openInspector: (sessionId, blockId) => set({ inspector: { sessionId, blockId }, panel: null }),
    closeInspector: () => set({ inspector: null }),
    setComposerOpen: (v) => set({ composerOpen: v }),
    setShortcutsOpen: (v) => set({ shortcutsOpen: v }),

    toggleCollapse: (sessionId, blockId) => {
      updateBlock(sessionId, blockId, (b) => ({ collapsed: !b.collapsed }));
    },
    toggleBookmark: (sessionId, blockId) => {
      updateBlock(sessionId, blockId, (b) => ({ bookmarked: !b.bookmarked }));
    },

    pinCommand: (envId, command, note = "") => {
      set((s) => ({ pinned: [...s.pinned, { id: uid("pin"), envId, command, note }] }));
      persist();
    },
    unpinCommand: (id) => {
      set((s) => ({ pinned: s.pinned.filter((p) => p.id !== id) }));
      persist();
    },

    prefillPrompt: (text, sessionId) => {
      const s = get();
      const sid = sessionId ?? s.activeSessionId();
      if (!sid) return;
      set({ promptPrefill: { sessionId: sid, text, nonce: Date.now() } });
    },

    connectHost: (hostId) => {
      const s = get();
      const sid = s.activeSessionId();
      if (!sid) return;
      set({ panel: null });
      void exec(sid, `ssh ${hostId}`);
    },

    activeSessionId: () => {
      const s = get();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      if (!tab) return null;
      const leaf = findLeaf(tab.layout, tab.activePaneId);
      return leaf?.sessionId ?? null;
    },
  };
});

export function sessionEnvId(session: SessionState): string {
  return session.envStack[session.envStack.length - 1];
}

export function sessionIsRemote(session: SessionState): boolean {
  return getEnv(sessionEnvId(session)).kind === "ssh";
}

export function promptString(session: SessionState): { user: string; host: string; path: string } {
  const env = getEnv(sessionEnvId(session));
  return { user: env.user, host: env.hostname, path: displayPath(session.cwd, env.home) };
}

export { HOSTS, ENVS, getEnv };

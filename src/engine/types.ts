// Core domain types for the Yuuki Terminal simulated shell engine.
// The engine is designed so a real backend (node-pty locally, SSH channel
// remotely) can replace `CommandHandler` execution without touching the UI:
// everything above this layer consumes Blocks and Session state only.

export interface Block {
  id: string;
  sessionId: string;
  command: string;
  cwd: string;
  envId: string;
  host: string; // "local" or ssh host id
  startedAt: number;
  durationMs: number | null; // null while running
  exitCode: number | null; // null while running
  output: string; // raw text including ANSI SGR escapes
  collapsed: boolean;
  bookmarked: boolean;
  seeded?: boolean; // came from demo history replay, not typed this session
}

export interface HistoryEntry {
  id: string;
  command: string;
  cwd: string;
  envId: string;
  host: string;
  exitCode: number;
  at: number; // epoch ms
  durationMs: number;
}

export interface PinnedCommand {
  id: string;
  envId: string;
  command: string;
  note: string;
}

export interface ProcInfo {
  pid: number;
  ppid: number;
  user: string;
  name: string;
  cmd: string;
  cpu: number; // percent
  mem: number; // MB
  ports: number[];
  startedAt: number;
  envId: string;
  sessionId?: string; // present when a terminal session spawned it
  ephemeral?: boolean; // registered by a running block, dies with it
}

export interface SshHost {
  id: string;
  label: string;
  user: string;
  hostname: string;
  port: number;
  fingerprint: string; // ed25519 SHA256
  keyAlgo: string;
  auth: string; // e.g. "ssh-agent (ed25519)" — never a stored password
  baseLatencyMs: number;
  themeHue: string; // accent token name for per-host tinting
  envId: string; // environment served when connected
  motd: string[];
}

export interface EnvContext {
  branch?: string;
  dirtyFiles?: number;
  runtime?: string; // "node 22.11" | "python 3.12.4" | ...
  packageManager?: string;
  ports?: { port: number; label: string }[]; // statically owned (e.g. postgres)
}

export interface EnvDef {
  id: string;
  label: string;
  kind: "local" | "ssh";
  user: string;
  hostname: string;
  shell: string; // "zsh" | "bash"
  home: string;
  defaultCwd: string;
  context: EnvContext;
  files: Record<string, string | null>; // absolute path -> content, null = dir
  commands: CommandRule[];
  seedHistory: SeedHistoryItem[];
  baseProcesses: Omit<ProcInfo, "envId">[];
  envVars: Record<string, string>;
}

export interface SeedHistoryItem {
  command: string;
  exitCode: number;
  hoursAgo: number;
  durationMs: number;
  cwd?: string;
}

export interface ExecSignal {
  cancelled: boolean;
}

export interface ExecCtx {
  argv: string[];
  raw: string;
  cwd: string;
  env: EnvDef;
  sessionId: string;
  emit: (text: string) => void;
  setCwd: (path: string) => void;
  sleep: (ms: number) => Promise<void>; // resolves early (cancelled) on SIGINT
  signal: ExecSignal;
  // Register a live process while this command runs (dev servers etc.)
  registerProcess: (p: {
    name: string;
    cmd: string;
    cpu?: number;
    mem?: number;
    ports?: number[];
  }) => number;
  unregisterProcess: (pid: number) => void;
  // True if some session already owns this port (EADDRINUSE simulation)
  portInUse: (port: number) => ProcInfo | undefined;
}

export type CommandHandler = (ctx: ExecCtx) => Promise<number>;

export interface CommandRule {
  // matches on the full argv; first token already trimmed
  match: (argv: string[], raw: string) => boolean;
  run: CommandHandler;
}

// ---- layout ----

export type PaneNode =
  | { type: "leaf"; id: string; sessionId: string }
  | { type: "split"; id: string; dir: "row" | "col"; ratio: number; a: PaneNode; b: PaneNode };

export interface Tab {
  id: string;
  title: string; // usually derived from active session
  layout: PaneNode;
  activePaneId: string;
}

export interface SessionState {
  id: string;
  envStack: string[]; // last = current env (ssh pushes, exit pops)
  cwd: string;
  inputHistory: string[];
  createdAt: number;
  connectedAt?: number; // for ssh latency display
  hostId?: string; // ssh host currently connected in this session
}

export interface WorkspacePaneSpec {
  envId: string;
  cwd?: string;
  autorun?: string; // a command started on restore, shown as running (never AI-generated)
}

export interface WorkspaceTabSpec {
  title?: string;
  panes: WorkspacePaneSpec[]; // 1 = single, 2 = vertical split
  splitDir?: "row" | "col";
}

export interface Workspace {
  id: string;
  name: string;
  repo?: string;
  builtin?: boolean;
  tabs: WorkspaceTabSpec[];
  notes: string;
  frequentCommands: string[];
  services: { name: string; command: string; port?: number }[];
  savedAt?: number;
}

export interface ComposerProposal {
  command: string;
  summary: string;
  breakdown: { part: string; meaning: string }[];
  destructive?: string; // reason it deserves extra review
  confidence: "high" | "medium";
}

export interface FailureAnalysis {
  exitCode: number;
  exitMeaning: string;
  location?: string; // "src/lib/pricing.ts:42"
  explanation: string;
  suggestion?: { command: string; rationale: string; destructive?: string };
  relatedBlockIds: string[];
}

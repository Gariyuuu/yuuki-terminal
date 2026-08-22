import { useEffect, useMemo, useState } from "react";
import { analyzeFailure } from "../engine/failures";
import type { ProcInfo } from "../engine/types";
import { displayPath } from "../engine/vfs";
import { ENVS, getEnv, HOSTS, sessionEnvId, useStore } from "../state/store";

function fmtAgo(t: number): string {
  const d = Date.now() - t;
  if (d < 3600_000) return `${Math.max(1, Math.round(d / 60_000))}m ago`;
  if (d < 86400_000) return `${Math.round(d / 3600_000)}h ago`;
  return `${Math.round(d / 86400_000)}d ago`;
}

function fmtDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

export function SidePanel() {
  const panel = useStore((s) => s.panel);
  const inspector = useStore((s) => s.inspector);
  if (!panel && !inspector) return null;
  return (
    <aside className="side-panel">
      {inspector ? (
        <InspectorPanel />
      ) : panel === "history" ? (
        <HistoryPanel />
      ) : panel === "processes" ? (
        <ProcessPanel />
      ) : panel === "hosts" ? (
        <HostsPanel />
      ) : panel === "workspaces" ? (
        <WorkspacesPanel />
      ) : (
        <LibraryPanel />
      )}
    </aside>
  );
}

function PanelHead({ title, hint }: { title: string; hint?: string }) {
  const togglePanel = useStore((s) => s.togglePanel);
  const panel = useStore((s) => s.panel);
  const closeInspector = useStore((s) => s.closeInspector);
  const inspector = useStore((s) => s.inspector);
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      {hint && <span className="panel-hint">{hint}</span>}
      <button
        className="ghost"
        title="close"
        onClick={() => (inspector ? closeInspector() : panel && togglePanel(panel))}
      >
        ✕
      </button>
    </div>
  );
}

// ---------- history ----------

export function HistoryPanel() {
  const history = useStore((s) => s.history);
  const prefillPrompt = useStore((s) => s.prefillPrompt);
  const pinCommand = useStore((s) => s.pinCommand);
  const [q, setQ] = useState("");
  const [envF, setEnvF] = useState("all");
  const [hostF, setHostF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [rangeF, setRangeF] = useState("all");

  const rows = useMemo(() => {
    const cutoff =
      rangeF === "24h" ? Date.now() - 86400_000 : rangeF === "7d" ? Date.now() - 7 * 86400_000 : 0;
    return history
      .filter((h) => (q ? h.command.toLowerCase().includes(q.toLowerCase()) || h.cwd.toLowerCase().includes(q.toLowerCase()) : true))
      .filter((h) => (envF === "all" ? true : h.envId === envF))
      .filter((h) => (hostF === "all" ? true : h.host === hostF))
      .filter((h) =>
        statusF === "all" ? true : statusF === "ok" ? h.exitCode === 0 : h.exitCode !== 0 && h.exitCode !== 130,
      )
      .filter((h) => h.at >= cutoff)
      .slice(0, 200);
  }, [history, q, envF, hostF, statusF, rangeF]);

  return (
    <>
      <PanelHead title="history" hint="across every session" />
      <div className="panel-filters">
        <input
          autoFocus
          placeholder="search commands + directories"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="filter-row">
          <select value={envF} onChange={(e) => setEnvF(e.target.value)} aria-label="project">
            <option value="all">project: all</option>
            {Object.values(ENVS).map((env) => (
              <option key={env.id} value={env.id}>{env.label}</option>
            ))}
          </select>
          <select value={hostF} onChange={(e) => setHostF(e.target.value)} aria-label="host">
            <option value="all">host: all</option>
            <option value="local">local</option>
            <option value="deploy-01">deploy-01</option>
          </select>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="exit status">
            <option value="all">exit: all</option>
            <option value="ok">ok</option>
            <option value="fail">failed</option>
          </select>
          <select value={rangeF} onChange={(e) => setRangeF(e.target.value)} aria-label="date range">
            <option value="all">any time</option>
            <option value="24h">24h</option>
            <option value="7d">7 days</option>
          </select>
        </div>
      </div>
      <div className="panel-list">
        {rows.map((h) => (
          <div key={h.id} className={`hist-row${h.exitCode !== 0 && h.exitCode !== 130 ? " failed" : ""}`}>
            <button className="hist-cmd" title="insert into prompt" onClick={() => prefillPrompt(h.command)}>
              {h.command}
            </button>
            <div className="hist-meta">
              <span>{getEnv(h.envId).label}</span>
              <span>{displayPath(h.cwd, getEnv(h.envId).home)}</span>
              <span>{h.host === "local" ? "local" : h.host}</span>
              <span className={h.exitCode === 0 ? "ok" : h.exitCode === 130 ? "" : "bad"}>
                {h.exitCode === 0 ? "✓" : h.exitCode === 130 ? "⌃C" : `exit ${h.exitCode}`}
              </span>
              <span>{fmtDur(h.durationMs)}</span>
              <span>{fmtAgo(h.at)}</span>
              <button className="ghost tiny" title="pin to project library" onClick={() => pinCommand(h.envId, h.command)}>
                pin
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="panel-empty">no matching commands</p>}
      </div>
    </>
  );
}

// ---------- processes ----------

export function ProcessPanel() {
  const dynamic = useStore((s) => s.processes);
  const sessions = useStore((s) => s.sessions);
  const tabs = useStore((s) => s.tabs);
  const focusPane = useStore((s) => s.focusPane);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 2000);
    return () => clearInterval(t);
  }, []);

  const machines = useMemo(() => {
    const activeMachines = new Set<string>();
    for (const s of Object.values(sessions)) activeMachines.add(getEnv(sessionEnvId(s)).hostname);
    const out: { machine: string; procs: (ProcInfo & { depth: number })[] }[] = [];
    for (const machine of activeMachines) {
      const procs: ProcInfo[] = [];
      const seen = new Set<number>();
      for (const env of Object.values(ENVS)) {
        if (env.hostname !== machine) continue;
        for (const p of env.baseProcesses) {
          if (!seen.has(p.pid)) { seen.add(p.pid); procs.push({ ...p, envId: env.id }); }
        }
      }
      for (const p of dynamic) if (getEnv(p.envId).hostname === machine) procs.push(p);
      // flatten as parent → child with depth
      const byPid = new Map(procs.map((p) => [p.pid, p]));
      const roots = procs.filter((p) => !byPid.has(p.ppid));
      const flat: (ProcInfo & { depth: number })[] = [];
      const walk = (p: ProcInfo, depth: number) => {
        flat.push({ ...p, depth });
        procs.filter((ch) => ch.ppid === p.pid).forEach((ch) => walk(ch, depth + 1));
      };
      roots.forEach((r) => walk(r, 0));
      out.push({ machine, procs: flat });
    }
    return out;
  }, [dynamic, sessions]);

  const jump = (sessionId: string) => {
    for (const tab of tabs) {
      const find = (n: typeof tab.layout): string | null => {
        if (n.type === "leaf") return n.sessionId === sessionId ? n.id : null;
        return find(n.a) ?? find(n.b);
      };
      const paneId = find(tab.layout);
      if (paneId) { focusPane(tab.id, paneId); return; }
    }
  };

  const jitter = (base: number, pid: number) =>
    Math.max(0, base + Math.sin(tick * 0.9 + pid) * base * 0.25).toFixed(1);

  return (
    <>
      <PanelHead title="processes" hint="live on active machines" />
      <div className="panel-list proc-list">
        {machines.map(({ machine, procs }) => (
          <div key={machine} className="proc-group">
            <h3>{machine}</h3>
            <div className="proc-header-row">
              <span>pid</span><span>process</span><span>cpu%</span><span>mem</span><span>ports</span><span />
            </div>
            {procs.map((p) => (
              <div key={p.pid} className={`proc-row${p.ephemeral ? " mine" : ""}`}>
                <span className="pid">{p.pid}</span>
                <span className="pname" style={{ paddingLeft: p.depth * 12 }} title={p.cmd}>
                  {p.depth > 0 && <span className="tree">└ </span>}
                  {p.name}
                  <span className="pcmd"> {p.cmd}</span>
                </span>
                <span className="num">{jitter(p.cpu, p.pid)}</span>
                <span className="num">{p.mem}M</span>
                <span className="ports">{p.ports.map((x) => `:${x}`).join(" ")}</span>
                <span>
                  {p.sessionId && (
                    <button className="ghost tiny" title="jump to the session that launched this" onClick={() => jump(p.sessionId!)}>
                      →term
                    </button>
                  )}
                </span>
              </div>
            ))}
            <div className="proc-foot">
              up {Math.round((Date.now() - Math.min(...procs.map((p) => p.startedAt))) / 3600_000)}h max ·{" "}
              {procs.length} shown
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- hosts ----------

export function HostsPanel() {
  const sessions = useStore((s) => s.sessions);
  const connectHost = useStore((s) => s.connectHost);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 2500);
    return () => clearInterval(t);
  }, []);

  const connectedIds = new Set(
    Object.values(sessions).map((s) => s.hostId).filter((x): x is string => Boolean(x)),
  );

  return (
    <>
      <PanelHead title="ssh hosts" hint="connect runs `ssh <host>` in the active pane" />
      <div className="panel-list">
        {HOSTS.map((h) => {
          const connected = connectedIds.has(h.id);
          const lat = connected ? Math.round(h.baseLatencyMs + Math.sin(tick + h.baseLatencyMs) * 5 + 2) : null;
          return (
            <div key={h.id} className={`host-row ${h.themeHue}${connected ? " connected" : ""}`}>
              <div className="host-line1">
                <span className="host-chip" aria-hidden="true" />
                <span className="host-label">{h.label}</span>
                <span className={`host-state${connected ? " on" : ""}`}>
                  {connected ? `connected · ${lat}ms` : "not connected"}
                </span>
              </div>
              <div className="host-line2">
                <span>{h.user}@{h.hostname}:{h.port}</span>
              </div>
              <div className="host-line3">
                <span title={h.fingerprint}>{h.keyAlgo} {h.fingerprint.slice(0, 22)}…</span>
                <span>{h.auth}</span>
                <button className="ghost tiny" onClick={() => connectHost(h.id)}>
                  {connected ? "connect again" : "connect"}
                </button>
              </div>
            </div>
          );
        })}
        <p className="panel-note">
          host keys are pinned against known_hosts; auth is delegated to your local ssh-agent — yuuki never
          stores passwords or private keys.
        </p>
      </div>
    </>
  );
}

// ---------- workspaces ----------

export function WorkspacesPanel() {
  const workspaces = useStore((s) => s.workspaces);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const openWorkspace = useStore((s) => s.openWorkspace);
  const saveWorkspaceAs = useStore((s) => s.saveWorkspaceAs);
  const deleteWorkspace = useStore((s) => s.deleteWorkspace);
  const prefillPrompt = useStore((s) => s.prefillPrompt);
  const processes = useStore((s) => s.processes);
  const [name, setName] = useState("");

  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  return (
    <>
      <PanelHead title="workspaces" hint="restore rebuilds tabs, panes, dirs, services" />
      <div className="panel-list">
        {workspaces.map((w) => (
          <div key={w.id} className={`ws-row${w.id === activeWorkspaceId ? " on" : ""}`}>
            <div className="ws-line1">
              <button className="ws-open" title="open workspace" onClick={() => openWorkspace(w.id)}>
                {w.name}
              </button>
              <span className="ws-meta">
                {w.tabs.length} tab{w.tabs.length === 1 ? "" : "s"} ·{" "}
                {w.tabs.reduce((n, t) => n + t.panes.length, 0)} panes
                {w.repo ? ` · ${w.repo.split("/").slice(-1)[0]}` : ""}
              </span>
              {!w.builtin && (
                <button className="ghost tiny" title="delete workspace" onClick={() => deleteWorkspace(w.id)}>rm</button>
              )}
            </div>
            {w.services.length > 0 && (
              <div className="ws-services">
                {w.services.map((svc) => {
                  const up = svc.port ? processes.some((p) => p.ports.includes(svc.port!)) : false;
                  return (
                    <span key={svc.name} className={`ws-svc${up ? " up" : ""}`} title={svc.command}>
                      {up ? "●" : "○"} {svc.name}
                      {svc.port ? `:${svc.port}` : ""}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {active && (
          <div className="ws-detail">
            <h3>notes — {active.name}</h3>
            <p className="ws-notes">{active.notes || "no notes yet"}</p>
            {active.frequentCommands.length > 0 && (
              <>
                <h3>frequent commands</h3>
                {active.frequentCommands.map((cmd) => (
                  <button key={cmd} className="lib-cmd" title="insert into prompt" onClick={() => prefillPrompt(cmd)}>
                    {cmd}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        <div className="ws-save">
          <input
            placeholder="save current layout as…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) { saveWorkspaceAs(name.trim()); setName(""); }
            }}
          />
          <button
            className="ghost"
            disabled={!name.trim()}
            onClick={() => { saveWorkspaceAs(name.trim()); setName(""); }}
          >
            save
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- command library ----------

export function LibraryPanel() {
  const pinned = useStore((s) => s.pinned);
  const unpinCommand = useStore((s) => s.unpinCommand);
  const prefillPrompt = useStore((s) => s.prefillPrompt);
  const bookmarks = useStore((s) =>
    Object.values(s.blocks).flat().filter((b) => b.bookmarked),
  );

  const groups = useMemo(() => {
    const g = new Map<string, typeof pinned>();
    for (const p of pinned) {
      if (!g.has(p.envId)) g.set(p.envId, []);
      g.get(p.envId)!.push(p);
    }
    return [...g.entries()];
  }, [pinned]);

  return (
    <>
      <PanelHead title="command library" hint="pinned per project · click inserts" />
      <div className="panel-list">
        {groups.map(([envId, cmds]) => (
          <div key={envId} className="lib-group">
            <h3>{getEnv(envId).label}</h3>
            {cmds.map((p) => (
              <div key={p.id} className="lib-row">
                <button className="lib-cmd" title="insert into prompt" onClick={() => prefillPrompt(p.command)}>
                  {p.command}
                </button>
                {p.note && <span className="lib-note">{p.note}</span>}
                <button className="ghost tiny" title="unpin" onClick={() => unpinCommand(p.id)}>✕</button>
              </div>
            ))}
          </div>
        ))}
        {bookmarks.length > 0 && (
          <div className="lib-group">
            <h3>bookmarked this session</h3>
            {bookmarks.map((b) => (
              <div key={b.id} className="lib-row">
                <button className="lib-cmd" onClick={() => prefillPrompt(b.command)}>{b.command}</button>
                <span className="lib-note">exit {b.exitCode}</span>
              </div>
            ))}
          </div>
        )}
        <p className="panel-note">pin from the history panel, or ★ any block in the scrollback.</p>
      </div>
    </>
  );
}

// ---------- failure inspector ----------

export function InspectorPanel() {
  const inspector = useStore((s) => s.inspector);
  const blocks = useStore((s) => (inspector ? s.blocks[inspector.sessionId] : undefined));
  const prefillPrompt = useStore((s) => s.prefillPrompt);

  if (!inspector || !blocks) return null;
  const block = blocks.find((b) => b.id === inspector.blockId);
  if (!block) return null;
  const analysis = analyzeFailure(block, blocks);
  const related = analysis.relatedBlockIds
    .map((id) => blocks.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b));

  return (
    <>
      <PanelHead title="failure inspector" />
      <div className="panel-list inspector">
        <code className="insp-cmd">$ {block.command}</code>
        <div className="insp-grid">
          <span className="k">exit</span>
          <span>{analysis.exitCode} — {analysis.exitMeaning}</span>
          {analysis.location && (
            <>
              <span className="k">likely at</span>
              <span className="insp-loc">{analysis.location}</span>
            </>
          )}
          <span className="k">duration</span>
          <span>{block.durationMs !== null ? fmtDur(block.durationMs) : "—"}</span>
        </div>
        <h3>what happened</h3>
        <p className="insp-expl">{analysis.explanation}</p>
        {related.length > 0 && (
          <>
            <h3>relevant earlier commands</h3>
            {related.map((r) => (
              <button
                key={r.id}
                className="insp-related"
                title="scroll to this block"
                onClick={() => document.getElementById(`block-${r.id}`)?.scrollIntoView({ block: "center" })}
              >
                <span className={r.exitCode === 0 ? "ok" : "bad"}>{r.exitCode === 0 ? "✓" : `✗${r.exitCode}`}</span>{" "}
                {r.command}
              </button>
            ))}
          </>
        )}
        {analysis.suggestion && (
          <>
            <h3>suggested next step</h3>
            <div className={`insp-suggestion${analysis.suggestion.destructive ? " danger" : ""}`}>
              <code>{analysis.suggestion.command}</code>
              <p>{analysis.suggestion.rationale}</p>
              {analysis.suggestion.destructive && (
                <p className="cp-danger" role="alert">⚠ {analysis.suggestion.destructive}</p>
              )}
              <button className="cp-insert" onClick={() => prefillPrompt(analysis.suggestion!.command, block.sessionId)}>
                insert into prompt
              </button>
              <p className="cp-note">review before running — suggestions never execute themselves</p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

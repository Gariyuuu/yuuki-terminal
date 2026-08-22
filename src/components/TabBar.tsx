import { useState } from "react";
import { useStore, type PanelId } from "../state/store";

const PANEL_BUTTONS: { id: PanelId; label: string; title: string }[] = [
  { id: "workspaces", label: "wksp", title: "workspaces · ⌃⌥O" },
  { id: "hosts", label: "ssh", title: "ssh hosts · ⌃⌥S" },
  { id: "history", label: "hist", title: "history · ⌃⌥H" },
  { id: "processes", label: "proc", title: "processes · ⌃⌥P" },
  { id: "library", label: "lib", title: "command library · ⌃⌥L" },
];

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const newTab = useStore((s) => s.newTab);
  const panel = useStore((s) => s.panel);
  const togglePanel = useStore((s) => s.togglePanel);
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen);
  const workspaces = useStore((s) => s.workspaces);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const running = useStore((s) => s.running);
  const sessions = useStore((s) => s.sessions);
  const blocks = useStore((s) => s.blocks);

  const [envMenu, setEnvMenu] = useState(false);
  const ws = workspaces.find((w) => w.id === activeWorkspaceId);

  const tabHasRunning = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    const collect = (n: typeof tab.layout): string[] =>
      n.type === "leaf" ? [n.sessionId] : [...collect(n.a), ...collect(n.b)];
    return collect(tab.layout).some((sid) => running[sid]);
  };

  const tabFailed = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    const collect = (n: typeof tab.layout): string[] =>
      n.type === "leaf" ? [n.sessionId] : [...collect(n.a), ...collect(n.b)];
    return collect(tab.layout).some((sid) => {
      const list = blocks[sid];
      const last = list?.[list.length - 1];
      return last && last.exitCode !== null && last.exitCode !== 0 && last.exitCode !== 130;
    });
  };

  void sessions;

  return (
    <header className="tabbar">
      <span className="brand" title="yuuki terminal">yuuki</span>
      {ws && <span className="ws-name" title="active workspace">{ws.name}</span>}
      <div className="tabs" role="tablist">
        {tabs.map((t, i) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === activeTabId}
            className={`tab${t.id === activeTabId ? " active" : ""}`}
            onMouseDown={(e) => { if (e.button === 1) closeTab(t.id); else setActiveTab(t.id); }}
          >
            <span className="tab-idx">{i + 1}</span>
            <span className="tab-title">{t.title}</span>
            {tabHasRunning(t.id) && <span className="tab-dot run" title="process running" />}
            {!tabHasRunning(t.id) && tabFailed(t.id) && <span className="tab-dot fail" title="last command failed" />}
            <button className="tab-close" title="close tab" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>×</button>
          </div>
        ))}
        <div className="newtab-wrap">
          <button className="tab-new" title="new tab · ⌃⌥T" onClick={() => setEnvMenu((v) => !v)}>+</button>
          {envMenu && (
            <div className="env-menu" onMouseLeave={() => setEnvMenu(false)}>
              {["atlas-web", "torch-lab", "pg-dev", "deploy-01"].map((id) => (
                <button key={id} onClick={() => { newTab(id); setEnvMenu(false); }}>
                  {id === "deploy-01" ? "deploy-01 (ssh)" : id}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="tabbar-right">
        {PANEL_BUTTONS.map((b) => (
          <button
            key={b.id}
            className={`panel-btn${panel === b.id ? " on" : ""}`}
            title={b.title}
            onClick={() => togglePanel(b.id)}
          >
            {b.label}
          </button>
        ))}
        <button className="panel-btn" title="keyboard shortcuts · ⌘/" onClick={() => setShortcutsOpen(true)}>⌘</button>
      </div>
    </header>
  );
}

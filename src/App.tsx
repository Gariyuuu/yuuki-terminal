import { useEffect } from "react";
import { useStore } from "./state/store";
import { TabBar } from "./components/TabBar";
import { PaneGrid } from "./components/PaneGrid";
import { SidePanel } from "./components/Panels";
import { StatusBar } from "./components/StatusBar";
import { Shortcuts } from "./components/Shortcuts";

export default function App() {
  const boot = useStore((s) => s.boot);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);

  useEffect(() => { boot(); }, [boot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.metaKey;
      const alt = e.ctrlKey && e.altKey;

      // global interrupt — works even while the prompt input is disabled
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === "c") {
        const sid = s.activeSessionId();
        if (sid && s.running[sid]) { e.preventDefault(); s.cancel(sid); return; }
      }
      if (mod && e.key === "k") { e.preventDefault(); s.setComposerOpen(!s.composerOpen); return; }
      if (mod && e.key === "/") { e.preventDefault(); s.setShortcutsOpen(!s.shortcutsOpen); return; }
      if (mod && !e.shiftKey && e.key === "d") { e.preventDefault(); s.splitPane("row"); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === "d") { e.preventDefault(); s.splitPane("col"); return; }
      if (mod && e.key === "f") {
        e.preventDefault();
        const sid = s.activeSessionId();
        s.setSearchFor(s.searchFor === sid ? null : sid);
        return;
      }
      if (alt) {
        const k = e.code.startsWith("Key") ? e.code.slice(3).toLowerCase() : e.key;
        if (k === "t") { e.preventDefault(); s.newTab(); return; }
        if (k === "w") { e.preventDefault(); s.closePane(); return; }
        if (k === "h") { e.preventDefault(); s.togglePanel("history"); return; }
        if (k === "p") { e.preventDefault(); s.togglePanel("processes"); return; }
        if (k === "s") { e.preventDefault(); s.togglePanel("hosts"); return; }
        if (k === "o") { e.preventDefault(); s.togglePanel("workspaces"); return; }
        if (k === "l") { e.preventDefault(); s.togglePanel("library"); return; }
        const digitMatch = /^Digit([1-9])$/.exec(e.code);
        if (digitMatch) {
          e.preventDefault();
          const idx = parseInt(digitMatch[1], 10) - 1;
          if (s.tabs[idx]) s.setActiveTab(s.tabs[idx].id);
          return;
        }
      }
      if (e.key === "Escape") {
        if (s.composerOpen) { s.setComposerOpen(false); return; }
        if (s.shortcutsOpen) { s.setShortcutsOpen(false); return; }
        if (s.inspector) { s.closeInspector(); return; }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="app">
      <TabBar />
      <main className="main">
        <div className="panes">
          {activeTab && <PaneGrid tabId={activeTab.id} node={activeTab.layout} />}
        </div>
        <SidePanel />
      </main>
      <StatusBar />
      <Shortcuts />
    </div>
  );
}

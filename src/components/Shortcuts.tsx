import { useStore } from "../state/store";

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "terminal",
    rows: [
      ["⏎", "run command"],
      ["⌃C", "interrupt running process / clear input"],
      ["⌃L", "clear scrollback"],
      ["↑ / ↓", "walk input history"],
      ["⇥", "complete command or path"],
      ["⌘F", "search scrollback in pane"],
    ],
  },
  {
    title: "layout",
    rows: [
      ["⌘D", "split pane right"],
      ["⌘⇧D", "split pane down"],
      ["⌃⌥T", "new tab"],
      ["⌃⌥W", "close pane"],
      ["⌃⌥1…9", "switch tab"],
    ],
  },
  {
    title: "intelligence",
    rows: [
      ["⌘K", "compose command from plain english"],
      ["⌃⌥H", "history across sessions"],
      ["⌃⌥P", "process inspector"],
      ["⌃⌥S", "ssh hosts"],
      ["⌃⌥O", "workspaces"],
      ["⌃⌥L", "command library"],
      ["⌘/", "this overlay"],
    ],
  },
];

export function Shortcuts() {
  const open = useStore((s) => s.shortcutsOpen);
  const setOpen = useStore((s) => s.setShortcutsOpen);
  if (!open) return null;
  return (
    <div className="overlay" onClick={() => setOpen(false)} role="dialog" aria-label="keyboard shortcuts">
      <div className="shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>shortcuts</h2>
          <button className="ghost" onClick={() => setOpen(false)}>✕</button>
        </div>
        <div className="shortcut-groups">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3>{g.title}</h3>
              {g.rows.map(([k, v]) => (
                <div key={k} className="sc-row">
                  <kbd>{k}</kbd>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

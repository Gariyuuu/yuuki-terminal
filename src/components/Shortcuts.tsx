import { X } from "lucide-react";
import { useStore } from "../state/store";

// YUUKI SHELL §4.1 — one cap per key, symbols never spelled out.
const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: "terminal",
    rows: [
      [["⏎"], "run command"],
      [["⌃", "C"], "interrupt running process / clear input"],
      [["⌃", "L"], "clear scrollback"],
      [["↑"], "walk input history"],
      [["⇥"], "complete command or path"],
      [["⌘", "F"], "search scrollback in pane"],
    ],
  },
  {
    title: "layout",
    rows: [
      [["⌘", "D"], "split pane right"],
      [["⌘", "⇧", "D"], "split pane down"],
      [["⌃", "⌥", "T"], "new tab"],
      [["⌃", "⌥", "W"], "close pane"],
      [["⌃", "⌥", "1"], "switch tab (1…9)"],
    ],
  },
  {
    title: "intelligence",
    rows: [
      [["⌘", "K"], "compose command from plain english"],
      [["⌃", "⌥", "H"], "history across sessions"],
      [["⌃", "⌥", "P"], "process inspector"],
      [["⌃", "⌥", "S"], "ssh hosts"],
      [["⌃", "⌥", "O"], "workspaces"],
      [["⌃", "⌥", "L"], "command library"],
      [["?"], "this overlay"],
    ],
  },
];

export function Shortcuts() {
  const open = useStore((s) => s.shortcutsOpen);
  const setOpen = useStore((s) => s.setShortcutsOpen);
  if (!open) return null;
  return (
    <div className="overlay" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="keyboard shortcuts">
      <div className="shortcuts shell-pop" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>shortcuts</h2>
          <button className="ghost" onClick={() => setOpen(false)} aria-label="close" title="close  ⎋">
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
        <div className="shell-keysheet shortcut-groups">
          {GROUPS.map((g) => (
            <div className="shell-keysheet-group" key={g.title}>
              <h4>{g.title}</h4>
              {g.rows.map(([keys, v]) => (
                <div key={v} className="shell-keyrow">
                  {v}
                  <span className="shell-shortcut">
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

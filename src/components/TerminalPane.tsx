import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getEnv, promptString, sessionEnvId, useStore, HOSTS } from "../state/store";
import { BlockView } from "./BlockView";
import { Composer } from "./Composer";
import { listDir } from "../engine/vfs";
import { normalize } from "../engine/vfs";
import { X } from "lucide-react";

const COMMON_COMMANDS = [
  "git status", "git log --oneline", "git diff", "cd", "ls", "cat", "grep -rn", "clear", "history", "ssh", "exit",
];

export function TerminalPane({ tabId, paneId, sessionId }: { tabId: string; paneId: string; sessionId: string }) {
  const session = useStore((s) => s.sessions[sessionId]);
  const blocks = useStore((s) => s.blocks[sessionId]) ?? [];
  const running = useStore((s) => s.running[sessionId]) ?? false;
  const isActive = useStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return s.activeTabId === tabId && tab?.activePaneId === paneId;
  });
  const composerOpen = useStore((s) => s.composerOpen);
  const searchFor = useStore((s) => s.searchFor);
  const setSearchFor = useStore((s) => s.setSearchFor);
  const focusPane = useStore((s) => s.focusPane);
  const runCommand = useStore((s) => s.runCommand);
  const cancel = useStore((s) => s.cancel);
  const prefill = useStore((s) => s.promptPrefill);

  const [input, setInput] = useState("");
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);

  const searchOpen = searchFor === sessionId;

  useEffect(() => {
    if (prefill && prefill.sessionId === sessionId) {
      setInput(prefill.text);
      inputRef.current?.focus();
    }
  }, [prefill, sessionId]);

  useEffect(() => {
    if (isActive && !searchOpen) inputRef.current?.focus();
  }, [isActive, searchOpen, running]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [blocks]);

  if (!session) return null;

  const envId = sessionEnvId(session);
  const env = getEnv(envId);
  const p = promptString(session);
  const host = session.hostId ? HOSTS.find((h) => h.id === session.hostId) : undefined;
  const branch = env.context.branch;

  const onScroll = () => {
    const el = scrollRef.current!;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const submit = () => {
    const cmd = input;
    setInput("");
    setHistIdx(null);
    stickBottom.current = true;
    void runCommand(sessionId, cmd);
  };

  const complete = () => {
    const parts = input.split(" ");
    const last = parts[parts.length - 1];
    if (parts.length > 1 || input.includes("/")) {
      // path completion in cwd
      const dirPart = last.includes("/") ? last.slice(0, last.lastIndexOf("/") + 1) : "";
      const stem = last.slice(dirPart.length);
      const abs = normalize(dirPart || ".", session.cwd, env.home);
      const cands = listDir(env, abs).filter((e) => e.name.startsWith(stem));
      if (cands.length === 1) {
        parts[parts.length - 1] = dirPart + cands[0].name + (cands[0].dir ? "/" : "");
        setInput(parts.join(" "));
      }
    } else {
      const vocab = [
        ...new Set([
          ...session.inputHistory.slice().reverse(),
          ...env.seedHistory.map((h) => h.command),
          ...COMMON_COMMANDS,
        ]),
      ];
      const cand = vocab.find((v) => v.startsWith(last) && v !== last);
      if (cand) setInput(cand);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); return; }
    if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      if (running) cancel(sessionId);
      else setInput("");
      return;
    }
    if (e.key === "l" && e.ctrlKey) { e.preventDefault(); void runCommand(sessionId, "clear"); return; }
    if (e.key === "Tab") { e.preventDefault(); complete(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const h = session.inputHistory;
      if (h.length === 0) return;
      const next = histIdx === null ? h.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(h[next]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const h = session.inputHistory;
      if (histIdx === null) return;
      const next = histIdx + 1;
      if (next >= h.length) { setHistIdx(null); setInput(""); }
      else { setHistIdx(next); setInput(h[next]); }
      return;
    }
    if (e.key === "Escape" && searchOpen) { setSearchFor(null); setQuery(""); }
  };

  const hueClass = host ? ` ${host.themeHue}` : "";

  return (
    <section
      className={`pane${isActive ? " active" : ""}${env.kind === "ssh" ? " remote" : ""}${hueClass}`}
      onMouseDown={() => focusPane(tabId, paneId)}
      aria-label={`terminal session ${env.label}`}
    >
      {searchOpen && (
        <div className="pane-search">
          <span className="ps-label">/</span>
          <input
            autoFocus
            value={query}
            placeholder="search scrollback"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setSearchFor(null); setQuery(""); inputRef.current?.focus(); }
              if (e.key === "Enter") {
                const first = document.querySelector(`#pane-${paneId} .block.matched`);
                first?.scrollIntoView({ block: "center" });
              }
            }}
          />
          <span className="ps-count">
            {query ? `${blocks.filter((b) => (b.output + b.command).toLowerCase().includes(query.toLowerCase())).length} blocks` : ""}
          </span>
          <button onClick={() => { setSearchFor(null); setQuery(""); }} title="close search  ⎋" aria-label="close search"><X size={14} strokeWidth={1.75} /></button>
        </div>
      )}
      <div className="pane-scroll" ref={scrollRef} onScroll={onScroll} id={`pane-${paneId}`}>
        {blocks.length === 0 && (
          <div className="pane-empty">
            <span className="a-d"># {env.user}@{env.hostname} · {env.shell} · {p.path}</span>
            <span className="a-d">
              # <kbd>⌘</kbd><kbd>K</kbd> compose from plain english ·{" "}
              <kbd>⌃</kbd><kbd>⌥</kbd><kbd>H</kbd> history · <kbd>?</kbd> all shortcuts
            </span>
          </div>
        )}
        {blocks.map((b) => (
          <BlockView key={b.id} block={b} searchQuery={searchOpen ? query : ""} />
        ))}
        <div className={`prompt${running ? " waiting" : ""}`} onClick={() => inputRef.current?.focus()}>
          <span className="pr-user">{p.user}@{p.host}</span>
          <span className="pr-path">{p.path}</span>
          {branch && !session.hostId && (
            <span className="pr-branch">
              {branch}
              {env.context.dirtyFiles ? <span className="pr-dirty">*</span> : null}
            </span>
          )}
          <span className="pr-char">{env.kind === "ssh" ? "$" : "›"}</span>
          <input
            ref={inputRef}
            className="pr-input"
            value={running ? "" : input}
            placeholder={running ? "running — ⌃C to interrupt" : ""}
            disabled={running}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            onChange={(e) => { setInput(e.target.value); setHistIdx(null); }}
            onKeyDown={onKeyDown}
            aria-label="command input"
          />
        </div>
      </div>
      {isActive && composerOpen && <Composer sessionId={sessionId} />}
    </section>
  );
}

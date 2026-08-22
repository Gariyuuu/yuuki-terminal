import React, { useMemo } from "react";
import type { Block } from "../engine/types";
import { Ansi, stripAnsi } from "../engine/ansi";
import { getEnv, useStore } from "../state/store";
import { displayPath } from "../engine/vfs";

function fmtDuration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  return `${m}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Highlight search matches inside already-ANSI-parsed text: simplest reliable
// approach is highlighting on the plain text layer when a query is active.
function Highlighted({ text, query }: { text: string; query: string }) {
  const plain = stripAnsi(text);
  const parts = useMemo(() => {
    const out: { s: string; hit: boolean }[] = [];
    const q = query.toLowerCase();
    let i = 0;
    const lower = plain.toLowerCase();
    while (i < plain.length) {
      const idx = lower.indexOf(q, i);
      if (idx === -1) { out.push({ s: plain.slice(i), hit: false }); break; }
      if (idx > i) out.push({ s: plain.slice(i, idx), hit: false });
      out.push({ s: plain.slice(idx, idx + q.length), hit: true });
      i = idx + q.length;
    }
    return out;
  }, [plain, query]);
  return (
    <>
      {parts.map((p, i) => (p.hit ? <mark key={i}>{p.s}</mark> : <React.Fragment key={i}>{p.s}</React.Fragment>))}
    </>
  );
}

export const BlockView = React.memo(function BlockView({
  block,
  searchQuery,
}: {
  block: Block;
  searchQuery: string;
}) {
  const toggleCollapse = useStore((s) => s.toggleCollapse);
  const toggleBookmark = useStore((s) => s.toggleBookmark);
  const openInspector = useStore((s) => s.openInspector);
  const prefillPrompt = useStore((s) => s.prefillPrompt);
  const runCommand = useStore((s) => s.runCommand);
  const running = block.exitCode === null;
  const failed = block.exitCode !== null && block.exitCode !== 0 && block.exitCode !== 130;
  const cancelled = block.exitCode === 130;

  const env = getEnv(block.envId);
  const lineCount = block.output === "" ? 0 : block.output.replace(/\n$/, "").split("\n").length;
  const matches = searchQuery
    ? (stripAnsi(block.output + "\n" + block.command).toLowerCase().split(searchQuery.toLowerCase()).length - 1)
    : 0;

  const copy = (text: string) => { void navigator.clipboard.writeText(text); };
  const share = () => {
    const meta = `[exit ${block.exitCode ?? "…"} · ${fmtDuration(block.durationMs)} · ${env.user}@${env.hostname} ${displayPath(block.cwd, env.home)} · ${new Date(block.startedAt).toISOString()}]`;
    copy(`$ ${block.command}\n${stripAnsi(block.output)}${meta}\n`);
  };

  const statusClass = running ? "run" : failed ? "fail" : cancelled ? "int" : "ok";

  return (
    <div
      className={`block ${statusClass}${searchQuery && matches === 0 ? " dimmed" : ""}${matches > 0 ? " matched" : ""}`}
      id={`block-${block.id}`}
    >
      <div className="block-cmdline">
        <span className="block-gutter" aria-hidden="true" />
        <span className="block-prompt-char">{env.kind === "ssh" ? "$" : "›"}</span>
        <span className="block-cmd">
          {searchQuery ? <Highlighted text={block.command} query={searchQuery} /> : block.command}
        </span>
        <span className="block-meta">
          {block.bookmarked && <span className="bm" title="bookmarked">▸</span>}
          {block.exitCode !== null && block.exitCode !== 0 && (
            <button
              className={`exit-tag${failed ? " bad" : ""}`}
              title="inspect failure"
              onClick={() => openInspector(block.sessionId, block.id)}
            >
              exit {block.exitCode}
            </button>
          )}
          <span className="t">{fmtTime(block.startedAt)}</span>
          <span className="t">{running ? "running" : fmtDuration(block.durationMs)}</span>
          <span className="block-actions">
            <button title="copy command" onClick={() => copy(block.command)}>⧉</button>
            <button title="copy output" onClick={() => copy(stripAnsi(block.output))}>⇣</button>
            <button title="share command + output" onClick={share}>⤴</button>
            <button title="rerun" disabled={running} onClick={() => void runCommand(block.sessionId, block.command)}>↻</button>
            <button title="edit & rerun" disabled={running} onClick={() => prefillPrompt(block.command, block.sessionId)}>✎</button>
            <button title={block.bookmarked ? "remove bookmark" : "bookmark"} onClick={() => toggleBookmark(block.sessionId, block.id)}>
              {block.bookmarked ? "★" : "☆"}
            </button>
            {lineCount > 0 && (
              <button title={block.collapsed ? "expand output" : "collapse output"} onClick={() => toggleCollapse(block.sessionId, block.id)}>
                {block.collapsed ? "▸" : "▾"}
              </button>
            )}
          </span>
        </span>
      </div>
      {lineCount > 0 && !block.collapsed && (
        <pre className="block-out">
          {searchQuery ? <Highlighted text={block.output} query={searchQuery} /> : <Ansi text={block.output} />}
          {running && <span className="cursor-line">▍</span>}
        </pre>
      )}
      {lineCount > 0 && block.collapsed && (
        <button className="block-collapsed" onClick={() => toggleCollapse(block.sessionId, block.id)}>
          … {lineCount} line{lineCount === 1 ? "" : "s"} hidden
        </button>
      )}
    </div>
  );
});

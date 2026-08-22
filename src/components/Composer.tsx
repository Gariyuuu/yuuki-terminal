import { useMemo, useRef, useState } from "react";
import { compose } from "../engine/composer";
import { useStore } from "../state/store";

// Natural-language command composer. Proposes and explains; the user decides.
// Nothing composed here is ever executed automatically — Enter only inserts
// the command into the prompt, where it still needs an explicit ⏎.

export function Composer({ sessionId }: { sessionId: string }) {
  const setComposerOpen = useStore((s) => s.setComposerOpen);
  const prefillPrompt = useStore((s) => s.prefillPrompt);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const proposal = useMemo(() => compose(q), [q]);

  const insert = () => {
    if (!proposal) return;
    prefillPrompt(proposal.command, sessionId);
    setComposerOpen(false);
  };

  return (
    <div className="composer" role="dialog" aria-label="command composer">
      <div className="composer-input-row">
        <span className="composer-glyph">?</span>
        <input
          ref={ref}
          autoFocus
          value={q}
          placeholder="describe what you want — e.g. find every TypeScript file modified this week containing TODO"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setComposerOpen(false);
            if (e.key === "Enter" && proposal) insert();
          }}
        />
        <button className="ghost" onClick={() => setComposerOpen(false)} title="close (esc)">esc</button>
      </div>
      {proposal && (
        <div className="composer-proposal">
          <div className="cp-cmd-row">
            <code className="cp-cmd">{proposal.command}</code>
            <button className="cp-insert" onClick={insert}>insert ⏎</button>
          </div>
          <p className="cp-summary">{proposal.summary}</p>
          <dl className="cp-breakdown">
            {proposal.breakdown.map((b) => (
              <div key={b.part}>
                <dt>{b.part}</dt>
                <dd>{b.meaning}</dd>
              </div>
            ))}
          </dl>
          {proposal.destructive && (
            <p className="cp-danger" role="alert">⚠ {proposal.destructive}</p>
          )}
          <p className="cp-note">inserted into the prompt for review — never run automatically</p>
        </div>
      )}
      {q.length >= 6 && !proposal && (
        <p className="cp-miss">
          no confident proposal for that phrasing — try naming the thing (files, port, branch, logs) and the action
        </p>
      )}
    </div>
  );
}

import type { PaneNode } from "../engine/types";
import { TerminalPane } from "./TerminalPane";

export function PaneGrid({ tabId, node }: { tabId: string; node: PaneNode }) {
  if (node.type === "leaf") {
    return <TerminalPane tabId={tabId} paneId={node.id} sessionId={node.sessionId} />;
  }
  return (
    <div className={`split ${node.dir}`}>
      <div className="split-cell" style={{ flexGrow: node.ratio }}>
        <PaneGrid tabId={tabId} node={node.a} />
      </div>
      <div className="split-divider" aria-hidden="true" />
      <div className="split-cell" style={{ flexGrow: 1 - node.ratio }}>
        <PaneGrid tabId={tabId} node={node.b} />
      </div>
    </div>
  );
}

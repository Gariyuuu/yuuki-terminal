import { useEffect, useState } from "react";
import { getEnv, sessionEnvId, useStore, HOSTS, ENVS } from "../state/store";
import { displayPath } from "../engine/vfs";

// One-line, terminal-native context strip for the ACTIVE session:
// branch · dirty · runtime · package manager · live ports · host + latency.

export function StatusBar() {
  const session = useStore((s) => {
    const sid = s.activeSessionId();
    return sid ? s.sessions[sid] : null;
  });
  const processes = useStore((s) => s.processes);
  const running = useStore((s) => (session ? s.running[session.id] : false));
  const blocks = useStore((s) => (session ? s.blocks[session.id] : undefined));

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 2500);
    return () => clearInterval(t);
  }, []);

  if (!session) return null;
  const envId = sessionEnvId(session);
  const env = getEnv(envId);
  const host = session.hostId ? HOSTS.find((h) => h.id === session.hostId) : undefined;
  const latency = host ? Math.round(host.baseLatencyMs + Math.sin(tick * 1.7 + host.baseLatencyMs) * 6 + 3) : null;

  // ports live on this machine: static env ports + dynamically registered
  const machine = env.hostname;
  const dynPorts = processes
    .filter((p) => getEnv(p.envId).hostname === machine)
    .flatMap((p) => p.ports.map((port) => ({ port, label: p.name })));
  const staticPorts = Object.values(ENVS)
    .filter((e) => e.hostname === machine)
    .flatMap((e) => e.context.ports ?? []);
  const ports = [...staticPorts, ...dynPorts]
    .filter((v, i, arr) => arr.findIndex((x) => x.port === v.port) === i)
    .sort((a, b) => a.port - b.port);

  const lastCmds = (blocks ?? []).slice(-2).map((b) => b.command);

  return (
    <footer className="statusbar">
      <span className={`sb-host${host ? " sb-remote" : ""}`}>
        {host ? `⇅ ${env.user}@${env.hostname}` : `${env.user}@${env.hostname}`}
        {latency !== null && <span className="sb-lat"> {latency}ms</span>}
      </span>
      <span className="sb-item">{displayPath(session.cwd, env.home)}</span>
      {env.context.branch && (
        <span className="sb-item">
          ⎇ {env.context.branch}
          {env.context.dirtyFiles ? <span className="sb-dirty"> +{env.context.dirtyFiles}</span> : null}
        </span>
      )}
      {env.context.runtime && <span className="sb-item sb-dim">{env.context.runtime}</span>}
      {env.context.packageManager && <span className="sb-item sb-dim">{env.context.packageManager}</span>}
      {ports.length > 0 && (
        <span className="sb-item">
          {ports.map((p) => (
            <span key={p.port} className="sb-port" title={p.label}>:{p.port}</span>
          ))}
        </span>
      )}
      <span className="sb-spacer" />
      {lastCmds.length > 0 && !running && (
        <span className="sb-dim sb-recent" title="recent commands">{lastCmds.join(" · ")}</span>
      )}
      {running && <span className="sb-running">● running — ⌃C interrupts</span>}
      <span className="sb-item sb-dim">{env.shell}</span>
    </footer>
  );
}

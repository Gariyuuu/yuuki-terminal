import type { EnvDef, SshHost } from "../types";
import { atlasWeb } from "./atlas-web";
import { torchLab } from "./torch-lab";
import { deploy01 } from "./deploy-01";
import { pgDev } from "./pg-dev";

export const ENVS: Record<string, EnvDef> = {
  [atlasWeb.id]: atlasWeb,
  [torchLab.id]: torchLab,
  [deploy01.id]: deploy01,
  [pgDev.id]: pgDev,
};

export function getEnv(id: string): EnvDef {
  const env = ENVS[id];
  if (!env) throw new Error(`unknown env: ${id}`);
  return env;
}

// SSH host registry. Credentials are never stored by Yuuki Terminal —
// authentication is delegated to the local ssh-agent, exactly like `ssh` itself.
export const HOSTS: SshHost[] = [
  {
    id: "deploy-01",
    label: "deploy-01 · prod api",
    user: "ubuntu",
    hostname: "deploy-01.atlas.dev",
    port: 22,
    keyAlgo: "ed25519",
    fingerprint: "SHA256:kM9dJx2fQ7vLpTeR8wYzB3nC5aG1hU4iO6sE0mXrVdA",
    auth: "ssh-agent (ed25519)",
    baseLatencyMs: 34,
    themeHue: "host-amber",
    envId: "deploy-01",
    motd: [
      "Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)",
      "",
      "  System load:  0.31    Users logged in: 0",
      "  Usage of /:   85.0%   IPv4 address:    10.0.4.11",
      "  Memory usage: 49%",
      "",
      "Last login: Thu Aug 21 05:12:40 2026 from 98.42.117.6",
    ],
  },
  {
    id: "staging-02",
    label: "staging-02 · staging",
    user: "ubuntu",
    hostname: "staging-02.atlas.dev",
    port: 22,
    keyAlgo: "ed25519",
    fingerprint: "SHA256:Yw3rT8uK1oPfDs6bN0cV9xZ2eQ5mA7jL4hG8iR1nSvE",
    auth: "ssh-agent (ed25519)",
    baseLatencyMs: 41,
    themeHue: "host-cyan",
    envId: "deploy-01", // demo: staging serves the same env fixture
    motd: [
      "Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)",
      "",
      "  * staging — data resets nightly at 04:00 UTC",
      "",
      "Last login: Wed Aug 20 19:03:12 2026 from 98.42.117.6",
    ],
  },
  {
    id: "gpu-box",
    label: "gpu-box · lambda a10",
    user: "ubuntu",
    hostname: "129.146.121.88",
    port: 22,
    keyAlgo: "ed25519",
    fingerprint: "SHA256:pQ2sD9fH4jK7lZ1xC3vB6nM8aW5eR0tY2uI4oPgEmSk",
    auth: "ssh-agent (ed25519)",
    baseLatencyMs: 87,
    themeHue: "host-violet",
    envId: "deploy-01", // demo fixture; a real build maps this to its own env
    motd: ["Lambda GPU Cloud — A10 (24 GB)", "", "Last login: Mon Aug 18 22:41:09 2026"],
  },
];

export function getHost(idOrName: string): SshHost | undefined {
  return HOSTS.find(
    (h) => h.id === idOrName || h.hostname === idOrName || `${h.user}@${h.hostname}` === idOrName,
  );
}

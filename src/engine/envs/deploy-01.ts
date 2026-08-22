import type { EnvDef } from "../types";
import { c } from "../ansi";
import { canned, rule, streamed } from "../shell";

const HOME = "/home/ubuntu";

const nginxConf = `server {
    listen 80;
    server_name api.atlas.dev;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
`;

const systemdUnit = `[Unit]
Description=Atlas API (fastify)
After=network.target postgresql.service

[Service]
User=atlas
WorkingDirectory=/srv/atlas-api
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/etc/atlas/api.env

[Install]
WantedBy=multi-user.target
`;

export const deploy01: EnvDef = {
  id: "deploy-01",
  label: "deploy-01",
  kind: "ssh",
  user: "ubuntu",
  hostname: "deploy-01",
  shell: "bash",
  home: HOME,
  defaultCwd: HOME,
  context: {
    runtime: "node 20.18.1",
    ports: [
      { port: 8080, label: "atlas-api" },
      { port: 80, label: "nginx" },
      { port: 5432, label: "postgres 16" },
    ],
  },
  envVars: {
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    LANG: "en_US.UTF-8",
    SHELL: "/bin/bash",
  },
  files: {
    [HOME]: null,
    [`${HOME}/deploy.sh`]: "#!/usr/bin/env bash\nset -euo pipefail\ncd /srv/atlas-api\ngit fetch origin main\ngit reset --hard origin/main\nnpm ci --omit=dev\nnpm run build\nsudo systemctl restart atlas-api\n",
    "/srv/atlas-api": null,
    "/srv/atlas-api/package.json": `{ "name": "atlas-api", "version": "1.9.2", "scripts": { "build": "tsc -p .", "start": "node dist/server.js" } }`,
    "/etc/nginx/sites-enabled/atlas-api.conf": nginxConf,
    "/etc/systemd/system/atlas-api.service": systemdUnit,
    "/var/log/nginx/access.log": "<rotated — use tail -f>",
  },
  commands: [
    canned(/^systemctl status atlas-api$/, `${c.green}●${c.reset} atlas-api.service - Atlas API (fastify)
     Loaded: loaded (/etc/systemd/system/atlas-api.service; enabled; preset: enabled)
     Active: ${c.green}active (running)${c.reset} since Tue 2026-08-18 03:12:44 UTC; 2 days ago
   Main PID: 1841 (node)
      Tasks: 11 (limit: 4557)
     Memory: 212.4M (peak: 384.1M)
        CPU: 41min 12.031s
     CGroup: /system.slice/atlas-api.service
             └─1841 /usr/bin/node dist/server.js

Aug 20 22:47:03 deploy-01 node[1841]: {"level":30,"msg":"request completed","reqId":"r-88412","statusCode":200,"responseTime":18}
Aug 21 01:15:22 deploy-01 node[1841]: {"level":50,"msg":"stripe webhook signature mismatch","reqId":"r-90163"}
Aug 21 04:02:11 deploy-01 node[1841]: {"level":30,"msg":"request completed","reqId":"r-91427","statusCode":200,"responseTime":9}`, 0, 180),

    streamed(/^sudo systemctl restart atlas-api$/, [], { delay: 0, exit: 0 }),

    rule(/^journalctl -u atlas-api/, async (ctx) => {
      await ctx.sleep(300);
      const lines = [
        `Aug 21 04:02:11 deploy-01 node[1841]: {"level":30,"msg":"request completed","statusCode":200,"responseTime":9}`,
        `Aug 21 04:18:56 deploy-01 node[1841]: {"level":30,"msg":"request completed","statusCode":200,"responseTime":14}`,
        `Aug 21 05:03:40 deploy-01 node[1841]: ${c.red}{"level":50,"msg":"pg pool timeout acquiring connection","reqId":"r-93011"}${c.reset}`,
        `Aug 21 05:03:40 deploy-01 node[1841]: {"level":40,"msg":"retrying with backoff","attempt":1}`,
        `Aug 21 05:03:41 deploy-01 node[1841]: {"level":30,"msg":"request completed","statusCode":200,"responseTime":1204}`,
        `Aug 21 06:11:02 deploy-01 node[1841]: {"level":30,"msg":"request completed","statusCode":200,"responseTime":11}`,
      ];
      for (const l of lines) {
        if (ctx.signal.cancelled) return 130;
        ctx.emit(l + "\n");
        await ctx.sleep(60);
      }
      if (ctx.raw.includes("-f")) {
        while (!ctx.signal.cancelled) {
          await ctx.sleep(3500 + Math.random() * 5000);
          if (ctx.signal.cancelled) break;
          const now = new Date();
          const hh = String(now.getUTCHours()).padStart(2, "0");
          const mm = String(now.getUTCMinutes()).padStart(2, "0");
          const ss = String(now.getUTCSeconds()).padStart(2, "0");
          ctx.emit(`Aug 21 ${hh}:${mm}:${ss} deploy-01 node[1841]: {"level":30,"msg":"request completed","statusCode":200,"responseTime":${(6 + Math.random() * 40).toFixed(0)}}\n`);
        }
        return 130;
      }
      return 0;
    }),

    canned(/^df -h$/, `Filesystem      Size  Used Avail Use% Mounted on
/dev/root        58G   49G  9.2G  ${c.yellow}85%${c.reset} /
tmpfs           2.0G     0  2.0G   0% /dev/shm
/dev/sda15      105M  6.1M   99M   6% /boot/efi
/dev/sdb1       147G  ${c.red}134G   13G  92%${c.reset} /var/lib/postgresql`, 0, 90),

    canned(/^free -h$/, `               total        used        free      shared  buff/cache   available
Mem:           3.8Gi       1.9Gi       312Mi        18Mi       1.6Gi       1.7Gi
Swap:          2.0Gi       256Mi       1.8Gi`, 0, 70),

    canned(/^uptime$/, ` 07:41:22 up 47 days,  3:12,  1 user,  load average: 0.31, 0.24, 0.19`, 0, 60),

    canned(/^docker ps$/, `CONTAINER ID   IMAGE                    COMMAND                  CREATED       STATUS                 PORTS                    NAMES
f3a91c04b2d1   redis:7-alpine           "docker-entrypoint.s…"   5 weeks ago   Up 5 weeks (healthy)   127.0.0.1:6379->6379/tcp redis
8809d1e77c02   grafana/grafana:11.4.0   "/run.sh"                5 weeks ago   Up 5 weeks             127.0.0.1:3001->3000/tcp grafana`, 0, 160),

    canned(/^docker logs redis( --tail \d+)?$/, `1:M 21 Aug 2026 06:00:01.114 * 100 changes in 300 seconds. Saving...
1:M 21 Aug 2026 06:00:01.115 * Background saving started by pid 88811
88811:C 21 Aug 2026 06:00:01.142 * DB saved on disk
1:M 21 Aug 2026 06:00:01.216 * Background saving terminated with success`, 0, 140),

    rule(/^tail -f \/var\/log\/nginx\/access\.log$/, async (ctx) => {
      const paths = ["/api/products", "/api/cart", "/api/checkout", "/health", "/api/products/atlas-mini"];
      const agents = ["Mozilla/5.0", "curl/8.5.0", "Atlas-Mobile/2.3"];
      while (!ctx.signal.cancelled) {
        await ctx.sleep(1200 + Math.random() * 2600);
        if (ctx.signal.cancelled) break;
        const ip = `203.0.113.${(Math.random() * 254 + 1).toFixed(0)}`;
        const status = Math.random() < 0.93 ? 200 : Math.random() < 0.5 ? 404 : 500;
        const path = paths[Math.floor(Math.random() * paths.length)];
        const statusStr = status === 200 ? "200" : status === 404 ? `${c.yellow}404${c.reset}` : `${c.red}500${c.reset}`;
        ctx.emit(`${ip} - - [21/Aug/2026:07:41:00 +0000] "GET ${path} HTTP/1.1" ${statusStr} ${(120 + Math.random() * 4000).toFixed(0)} "-" "${agents[Math.floor(Math.random() * agents.length)]}"\n`);
      }
      return 130;
    }),

    canned(/^curl (-s )?(http:\/\/)?localhost:8080\/health$/, `{"status":"ok","version":"1.9.2","uptime":172441,"db":"connected"}`, 0, 220),

    rule(/^(sudo )?npm/, async (ctx) => {
      await ctx.sleep(300);
      ctx.emit(`This is a production box — builds run through ./deploy.sh, not ad-hoc npm.\n`);
      return 1;
    }),

    canned(/^top( -bn1)?$/, `top - 07:41:30 up 47 days,  3:12,  1 user,  load average: 0.31, 0.24, 0.19
Tasks: 118 total,   1 running, 117 sleeping,   0 stopped,   0 zombie
%Cpu(s):  2.3 us,  0.7 sy,  0.0 ni, 96.8 id,  0.1 wa
MiB Mem :   3894.9 total,    318.2 free,   1944.6 used,   1632.1 buff/cache

    PID USER      PR  NI    VIRT    RES  %CPU  %MEM     TIME+ COMMAND
   1841 atlas     20   0 1024.1m 212.4m   2.0   5.5  41:12.03 node
    912 postgres  20   0  340.2m 128.7m   0.7   3.3  88:02.44 postgres
    644 root      20   0   88.1m  14.2m   0.3   0.4   4:41.20 nginx
  88712 ubuntu    20   0   17.1m   9.8m   0.0   0.3   0:00.04 bash`, 0, 200),

    canned(/^\.\/deploy\.sh$/, `+ cd /srv/atlas-api
+ git fetch origin main
+ git reset --hard origin/main
HEAD is now at 2f8c1aa api: pool max 20 -> 40, statement_timeout 5s
+ npm ci --omit=dev
added 214 packages in 6s
+ npm run build
> atlas-api@1.9.2 build
> tsc -p .
+ sudo systemctl restart atlas-api
${c.green}deploy complete${c.reset} — atlas-api 1.9.2 @ 2f8c1aa`, 0, 6500),
  ],
  seedHistory: [
    { command: "systemctl status atlas-api", exitCode: 0, hoursAgo: 120, durationMs: 240 },
    { command: "./deploy.sh", exitCode: 0, hoursAgo: 119, durationMs: 41_000 },
    { command: "journalctl -u atlas-api -n 100", exitCode: 0, hoursAgo: 119, durationMs: 600 },
    { command: "df -h", exitCode: 0, hoursAgo: 72, durationMs: 90 },
    { command: "docker ps", exitCode: 0, hoursAgo: 72, durationMs: 200 },
    { command: "curl -s localhost:8080/health", exitCode: 0, hoursAgo: 48, durationMs: 180 },
    { command: "tail -f /var/log/nginx/access.log", exitCode: 130, hoursAgo: 47, durationMs: 312_000 },
    { command: "journalctl -u atlas-api -f", exitCode: 130, hoursAgo: 8, durationMs: 128_000 },
    { command: "free -h", exitCode: 0, hoursAgo: 8, durationMs: 70 },
  ],
  baseProcesses: [
    { pid: 1841, ppid: 1, user: "atlas", name: "node", cmd: "/usr/bin/node dist/server.js", cpu: 2.0, mem: 212, ports: [8080], startedAt: Date.now() - 2 * 86400_000 },
    { pid: 912, ppid: 1, user: "postgres", name: "postgres", cmd: "postgres -D /var/lib/postgresql/16/main", cpu: 0.7, mem: 129, ports: [5432], startedAt: Date.now() - 47 * 86400_000 },
    { pid: 644, ppid: 1, user: "root", name: "nginx", cmd: "nginx: master process", cpu: 0.3, mem: 14, ports: [80], startedAt: Date.now() - 47 * 86400_000 },
    { pid: 645, ppid: 644, user: "www-data", name: "nginx", cmd: "nginx: worker process", cpu: 0.1, mem: 11, ports: [], startedAt: Date.now() - 47 * 86400_000 },
    { pid: 1490, ppid: 1, user: "root", name: "dockerd", cmd: "/usr/bin/dockerd", cpu: 0.4, mem: 96, ports: [], startedAt: Date.now() - 47 * 86400_000 },
    { pid: 1512, ppid: 1490, user: "root", name: "redis", cmd: "redis-server 127.0.0.1:6379", cpu: 0.2, mem: 38, ports: [6379], startedAt: Date.now() - 35 * 86400_000 },
    { pid: 1513, ppid: 1490, user: "root", name: "grafana", cmd: "grafana server", cpu: 0.5, mem: 142, ports: [3001], startedAt: Date.now() - 35 * 86400_000 },
  ],
};

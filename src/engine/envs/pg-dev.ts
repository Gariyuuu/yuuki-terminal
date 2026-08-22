import type { EnvDef } from "../types";
import { c } from "../ansi";
import { canned, rule } from "../shell";

const HOME = "/Users/gary";
const ROOT = `${HOME}/dev/atlas-db`;

const migration42 = `-- 0042_add_invoices.sql
BEGIN;

CREATE TABLE invoices (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    bigint NOT NULL REFERENCES orders (id),
    issued_at   timestamptz NOT NULL DEFAULT now(),
    due_at      timestamptz NOT NULL,
    total_cents integer NOT NULL CHECK (total_cents >= 0),
    status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'paid', 'void'))
);

CREATE INDEX invoices_order_id_idx ON invoices (order_id);

COMMIT;
`;

const migration41 = `-- 0041_add_orders.sql
BEGIN;

CREATE TABLE orders (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  bigint NOT NULL REFERENCES customers (id),
    placed_at    timestamptz NOT NULL DEFAULT now(),
    total_cents  integer NOT NULL,
    status       text NOT NULL DEFAULT 'pending'
);

COMMIT;
`;

const makefile = `migrate:
\tpsql -d atlas_dev -f $(shell ls migrations/*.sql | tail -1)

migrate-all:
\tfor f in migrations/*.sql; do psql -d atlas_dev -f $$f; done

psql:
\tpsql -d atlas_dev
`;

export const pgDev: EnvDef = {
  id: "pg-dev",
  label: "atlas-db",
  kind: "local",
  user: "gary",
  hostname: "macbook",
  shell: "zsh",
  home: HOME,
  defaultCwd: ROOT,
  context: {
    branch: "main",
    dirtyFiles: 0,
    runtime: "psql 16.4",
    packageManager: undefined,
    ports: [{ port: 5432, label: "postgres 16" }],
  },
  envVars: {
    PATH: "/opt/homebrew/opt/postgresql@16/bin:/opt/homebrew/bin:/usr/bin:/bin",
    PGDATABASE: "atlas_dev",
    SHELL: "/bin/zsh",
  },
  files: {
    [ROOT]: null,
    [`${ROOT}/README.md`]: "# atlas-db\n\nSchema + migrations for atlas_dev (Postgres 16 via homebrew).\n\n- `make migrate` — apply latest migration\n- `make psql` — open a session\n",
    [`${ROOT}/Makefile`]: makefile,
    [`${ROOT}/migrations`]: null,
    [`${ROOT}/migrations/0040_add_customers.sql`]: "-- 0040_add_customers.sql\nCREATE TABLE customers (\n    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n    email text NOT NULL UNIQUE,\n    created_at timestamptz NOT NULL DEFAULT now()\n);\n",
    [`${ROOT}/migrations/0041_add_orders.sql`]: migration41,
    [`${ROOT}/migrations/0042_add_invoices.sql`]: migration42,
  },
  commands: [
    // The failure-intelligence demo: 0042 depends on orders (0041 not applied)
    rule(/^(make migrate|psql -d atlas_dev -f migrations\/0042_add_invoices\.sql)$/, async (ctx) => {
      if (ctx.raw.startsWith("make")) ctx.emit(`psql -d atlas_dev -f migrations/0042_add_invoices.sql\n`);
      await ctx.sleep(400);
      ctx.emit(`BEGIN\n`);
      await ctx.sleep(150);
      ctx.emit(`psql:migrations/0042_add_invoices.sql:13: ${c.red}ERROR:  relation "orders" does not exist${c.reset}\n`);
      ctx.emit(`ROLLBACK\n`);
      return ctx.raw.startsWith("make") ? 2 : 3;
    }),

    canned(/^psql -d atlas_dev -f migrations\/0041_add_orders\.sql$/, `BEGIN\nCREATE TABLE\nCOMMIT`, 0, 500),
    canned(/^psql -d atlas_dev -f migrations\/0040_add_customers\.sql$/, `CREATE TABLE`, 0, 400),

    canned(/^psql -d atlas_dev -c ["']?\\\\dt["']?$/, `           List of relations
 Schema |    Name    | Type  | Owner
--------+------------+-------+-------
 public | customers  | table | gary
 public | schema_log | table | gary
(2 rows)`, 0, 300),

    canned(/^psql -d atlas_dev -c ["']SELECT count\(\*\) FROM customers;?["']$/, ` count
-------
  1284
(1 row)`, 0, 340),

    canned(/^psql -d atlas_dev -c ["']SELECT .*FROM customers.*["']$/, `  id  |          email           |          created_at
------+--------------------------+-------------------------------
    1 | mei.tanaka@example.com   | 2026-06-02 09:14:11.402193+00
    2 | j.okafor@example.com     | 2026-06-02 09:31:47.190022+00
    3 | sam.reyes@example.com    | 2026-06-03 11:02:53.771840+00
(3 rows)`, 0, 380),

    canned(/^psql (-V|--version)$/, `psql (PostgreSQL) 16.4 (Homebrew)`, 0, 60),

    canned(/^pg_ctl status$/, `pg_ctl: server is running (PID: 641)\n/opt/homebrew/opt/postgresql@16/bin/postgres "-D" "/opt/homebrew/var/postgresql@16"`, 0, 120),

    canned(/^brew services list$/, `Name              Status  User  File
postgresql@16     ${c.green}started${c.reset} gary  ~/Library/LaunchAgents/homebrew.mxcl.postgresql@16.plist
redis             none`, 0, 400),

    rule(/^pgbench -i/, async (ctx) => {
      ctx.emit("dropping old tables...\n");
      await ctx.sleep(400);
      ctx.emit("creating tables...\ngenerating data (client-side)...\n");
      await ctx.sleep(900);
      if (ctx.signal.cancelled) return 130;
      ctx.emit("100000 of 100000 tuples (100%) done (elapsed 0.71 s, remaining 0.00 s)\nvacuuming...\ncreating primary keys...\ndone in 1.94 s (drop tables 0.02 s, create tables 0.01 s, client-side generate 0.94 s, vacuum 0.31 s, primary keys 0.66 s).\n");
      return 0;
    }),

    rule(/^pgbench(\s|$)(?!-i)/, async (ctx) => {
      await ctx.sleep(2400);
      if (ctx.signal.cancelled) return 130;
      ctx.emit(`pgbench (16.4 (Homebrew))\nstarting vacuum...end.\ntransaction type: <builtin: TPC-B (sort of)>\nscaling factor: 1\nnumber of clients: 10\nnumber of threads: 2\nmaximum number of tries: 1\nduration: 5 s\nnumber of transactions actually processed: 21419\nnumber of failed transactions: 0 (0.000%)\nlatency average = 2.331 ms\ninitial connection time = 18.402 ms\n${c.bold}tps = 4289.114768${c.reset} (without initial connection time)\n`);
      return 0;
    }),

    canned(/^pg_dump atlas_dev > /, "", 0, 2100),

    rule(/^dropdb /, async (ctx) => {
      const db = ctx.argv[1];
      await ctx.sleep(200);
      if (db === "atlas_dev") {
        ctx.emit(`dropdb: error: database removal failed: ERROR:  database "atlas_dev" is being accessed by other users\nDETAIL:  There is 1 other session using the database.\n`);
        return 1;
      }
      ctx.emit(`dropdb: error: database "${db}" does not exist\n`);
      return 1;
    }),

    canned(/^psql -d atlas_dev -c ["']SELECT version\(\);?["']$/, `                                    version
--------------------------------------------------------------------------------
 PostgreSQL 16.4 (Homebrew) on aarch64-apple-darwin24, compiled by clang 16.0.0
(1 row)`, 0, 280),

    canned(/^git status$/, `On branch ${c.green}main${c.reset}\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean`, 0, 80),
    canned(/^git log/, `${c.yellow}88d02c1${c.reset} ${c.gray}(HEAD -> main, origin/main)${c.reset} migrations: 0042 invoices table\n${c.yellow}f7a3e90${c.reset} migrations: 0041 orders table\n${c.yellow}1c9b442${c.reset} migrations: 0040 customers table`, 0, 80),
  ],
  seedHistory: [
    { command: "brew services list", exitCode: 0, hoursAgo: 130, durationMs: 800 },
    { command: "pg_ctl status", exitCode: 0, hoursAgo: 130, durationMs: 150 },
    { command: "psql -d atlas_dev -f migrations/0040_add_customers.sql", exitCode: 0, hoursAgo: 129, durationMs: 420 },
    { command: 'psql -d atlas_dev -c "\\dt"', exitCode: 0, hoursAgo: 129, durationMs: 300 },
    { command: 'psql -d atlas_dev -c "SELECT count(*) FROM customers;"', exitCode: 0, hoursAgo: 54, durationMs: 340 },
    { command: "pgbench -i atlas_bench", exitCode: 0, hoursAgo: 53, durationMs: 2100 },
    { command: "pgbench -c 10 -T 5 atlas_bench", exitCode: 0, hoursAgo: 53, durationMs: 7400 },
    { command: "make migrate", exitCode: 2, hoursAgo: 2, durationMs: 900 },
    { command: "cat migrations/0042_add_invoices.sql", exitCode: 0, hoursAgo: 2, durationMs: 40 },
  ],
  baseProcesses: [
    { pid: 641, ppid: 1, user: "gary", name: "postgres", cmd: "postgres -D /opt/homebrew/var/postgresql@16", cpu: 0.3, mem: 84, ports: [5432], startedAt: Date.now() - 6 * 86400_000 },
    { pid: 655, ppid: 641, user: "gary", name: "postgres", cmd: "postgres: checkpointer", cpu: 0.0, mem: 22, ports: [], startedAt: Date.now() - 6 * 86400_000 },
    { pid: 656, ppid: 641, user: "gary", name: "postgres", cmd: "postgres: walwriter", cpu: 0.0, mem: 18, ports: [], startedAt: Date.now() - 6 * 86400_000 },
  ],
};

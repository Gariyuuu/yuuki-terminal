import type { Block, FailureAnalysis } from "./types";
import { stripAnsi } from "./ansi";

// Failure intelligence: pattern knowledge base over (command, output, exit).
// Suggestions are proposals only — the UI inserts them into the prompt for
// review; nothing here is ever executed automatically.

interface KbEntry {
  match: (cmd: string, out: string, exit: number) => boolean;
  analyze: (cmd: string, out: string, exit: number) => Omit<FailureAnalysis, "exitCode" | "relatedBlockIds" | "exitMeaning">;
}

const KB: KbEntry[] = [
  {
    match: (_c, out) => /TS2339|Property '.*' does not exist on type/.test(out),
    analyze: (_c, out) => {
      const loc = /([\w./-]+\.tsx?):(\d+)(?::(\d+))?/.exec(out);
      const prop = /Property '(\w+)' does not exist on type '(\w+)'/.exec(out);
      return {
        location: loc ? `${loc[1]}:${loc[2]}` : undefined,
        explanation: prop
          ? `The code reads \`.${prop[1]}\` on a value typed \`${prop[2]}\`, but \`${prop[2]}\` doesn't declare that field. Either the type is missing the new field or the code is ahead of the contract.`
          : "TypeScript found a property access that the declared type doesn't allow.",
        suggestion: prop
          ? { command: `cat src/lib/cart.ts`, rationale: `Inspect the ${prop[2]} type — if '${prop[1]}' is part of the new contract, add it there; otherwise gate the access.` }
          : undefined,
      };
    },
  },
  {
    match: (_c, out) => /EADDRINUSE/.test(out),
    analyze: (_c, out) => {
      const port = /:{1,3}(\d{2,5})/.exec(out)?.[1] ?? "3000";
      return {
        explanation: `Port ${port} is already bound — almost always a previous dev server still running (check the process view, ⌃⌥P).`,
        suggestion: {
          command: `lsof -i :${port}`,
          rationale: `See which process holds :${port} before deciding to stop it.`,
        },
      };
    },
  },
  {
    match: (_c, out) => /has no upstream branch/.test(out),
    analyze: (_c, out) => {
      const branch = /branch ([\w./-]+) has no upstream/.exec(out)?.[1] ?? "HEAD";
      return {
        explanation: `The local branch '${branch}' was created locally and has never been pushed, so git doesn't know where to send it.`,
        suggestion: {
          command: `git push -u origin ${branch}`,
          rationale: "Publishes the branch and records origin as its upstream so plain `git push` works afterwards.",
        },
      };
    },
  },
  {
    match: (_c, out) => /relation "(\w+)" does not exist/.test(out),
    analyze: (_c, out) => {
      const rel = /relation "(\w+)" does not exist/.exec(out)![1];
      const loc = /psql:([\w./-]+\.sql):(\d+)/.exec(out);
      return {
        location: loc ? `${loc[1]}:${loc[2]}` : undefined,
        explanation: `This migration references \`${rel}\`, but that table hasn't been created in atlas_dev — the migration that creates it hasn't been applied. Migrations here apply newest-only via \`make migrate\`, so 0041 was skipped.`,
        suggestion: {
          command: "psql -d atlas_dev -f migrations/0041_add_orders.sql",
          rationale: `Applies the migration that creates \`${rel}\` first; then re-run the failing one.`,
        },
      };
    },
  },
  {
    match: (_c, out, exit) => exit === 127 && /command not found/.test(out),
    analyze: (cmd, out) => {
      if (/nvidia-smi/.test(out)) {
        return {
          explanation: "nvidia-smi only exists on machines with NVIDIA drivers. This is an Apple Silicon Mac — PyTorch uses the MPS backend here, not CUDA.",
          suggestion: {
            command: `python -c "import torch; print(torch.backends.mps.is_available())"`,
            rationale: "Confirms the Metal (MPS) accelerator is available to PyTorch on this machine.",
          },
        };
      }
      const typo = /command not found: ([\w.-]+)/.exec(out)?.[1] ?? cmd.split(" ")[0];
      const near = closest(typo, ["git", "grep", "cat", "ls", "pnpm", "npm", "python", "pytest", "psql", "docker", "ssh", "make", "curl", "tail"]);
      return {
        explanation: `'${typo}' isn't on PATH in this session.` + (near ? ` It's one edit away from '${near}'.` : ""),
        suggestion: near ? { command: cmd.replace(typo, near), rationale: `Most likely intent: '${near}'.` } : undefined,
      };
    },
  },
  {
    match: (_c, out) => /AssertionError|assert .* == |expected .* to be/.test(out),
    analyze: (_c, out) => {
      const pyLoc = /((?:tests?|src)\/[\w./-]+\.py):(\d+)/.exec(stripPlain(out));
      const vitest = /❯ ([\w./-]+\.test\.tsx?):(\d+)/.exec(stripPlain(out));
      const pyName = /FAILED [\w./-]+::(\w+)/.exec(out);
      const loc = vitest ? `${vitest[1]}:${vitest[2]}` : pyLoc ? `${pyLoc[1]}:${pyLoc[2]}` : undefined;
      const explanation = /1\.0 == 0\.5/.test(out)
        ? "The tie-break in precision_at_k isn't behaving as the test expects: with tied scores it returned both tied items as positives (1.0) instead of the stable-ordering result (0.5). The sort in tlab/metrics.py is likely keying on score alone, losing stability."
        : /97\.87.*97\.88|97\.88.*97\.87/s.test(out)
          ? "A one-cent drift: rounding is applied per intermediate value instead of once at the end, so 108.9375 → 97.87 instead of 97.88 after the discount. Matches the FIXME in pricing.ts."
          : "An assertion compared an actual value against the expectation and they differ — inspect the diff above for which invariant broke.";
      return {
        location: loc,
        explanation,
        suggestion: pyName
          ? { command: `pytest tests/test_metrics.py::${pyName[1]} -x`, rationale: "Re-run just the failing test while iterating on the fix." }
          : vitest
            ? { command: "pnpm test", rationale: "Re-run after adjusting the rounding in src/lib/pricing.ts." }
            : undefined,
      };
    },
  },
  {
    match: (_c, out) => /Permission denied|permission denied/.test(out),
    analyze: (cmd) => ({
      explanation: "The operation needs privileges this user doesn't have.",
      suggestion: {
        command: `sudo ${cmd}`,
        rationale: "Re-run with elevated privileges.",
        destructive: "Runs with root privileges — confirm the command is exactly what you intend before executing.",
      },
    }),
  },
  {
    match: (_c, out) => /is being accessed by other users/.test(out),
    analyze: () => ({
      explanation: "Postgres refuses to drop a database while sessions are connected to it. Something (an app, a psql shell, a pool) still holds a connection.",
      suggestion: {
        command: `psql -d postgres -c "SELECT pid, application_name FROM pg_stat_activity WHERE datname='atlas_dev';"`,
        rationale: "Lists the connected sessions so you can close them deliberately rather than force-terminating.",
      },
    }),
  },
  {
    match: (_c, out) => /This is a production box/.test(out),
    analyze: () => ({
      explanation: "Ad-hoc package operations are blocked on this host by policy; deploys go through the pinned script so the systemd unit and build stay consistent.",
      suggestion: { command: "./deploy.sh", rationale: "The sanctioned deploy path: fetch, clean install, build, restart." },
    }),
  },
];

function stripPlain(s: string) {
  return stripAnsi(s);
}

function closest(word: string, dict: string[]): string | undefined {
  let best: string | undefined;
  let bestD = 3;
  for (const d of dict) {
    const dist = lev(word, d);
    if (dist < bestD) { bestD = dist; best = d; }
  }
  return best;
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const EXIT_MEANINGS: Record<number, string> = {
  1: "general error",
  2: "misuse / build error",
  3: "psql script error",
  126: "found but not executable",
  127: "command not found",
  128: "fatal git error",
  130: "terminated by Ctrl-C (SIGINT)",
};

export function analyzeFailure(block: Block, sessionBlocks: Block[]): FailureAnalysis {
  const out = stripAnsi(block.output);
  const exit = block.exitCode ?? 1;
  const base: FailureAnalysis = {
    exitCode: exit,
    exitMeaning: EXIT_MEANINGS[exit] ?? `exit status ${exit}`,
    explanation:
      exit === 130
        ? "The process was interrupted by Ctrl-C — this is a cancellation, not a fault."
        : "No specific pattern matched. Read the last lines of output above — the failing tool usually states its reason there.",
    relatedBlockIds: related(block, sessionBlocks),
  };
  for (const entry of KB) {
    if (entry.match(block.command, out, exit)) {
      return { ...base, ...entry.analyze(block.command, out, exit) };
    }
  }
  return base;
}

// Related prior commands: same leading tool, or mentioning the same file.
function related(block: Block, all: Block[]): string[] {
  const tool = block.command.split(" ")[0];
  const fileRefs = [...block.output.matchAll(/[\w./-]+\.(ts|tsx|py|sql|json)/g)].map((m) => m[0]);
  return all
    .filter((b) => b.id !== block.id && b.startedAt < block.startedAt)
    .filter((b) => b.command.split(" ")[0] === tool || fileRefs.some((f) => b.command.includes(f) || b.output.includes(f)))
    .slice(-3)
    .map((b) => b.id);
}

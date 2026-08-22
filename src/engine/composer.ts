import type { ComposerProposal } from "./types";

// Natural-language command composer. Deterministic pattern rules in the demo;
// the same interface can be served by an LLM backend. Either way the contract
// holds: propose + explain, never execute. The user runs it or doesn't.

interface Rule {
  test: (q: string) => boolean;
  build: (q: string) => ComposerProposal;
}

const has = (q: string, ...words: string[]) => words.every((w) => q.includes(w));
const any = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

const RULES: Rule[] = [
  {
    test: (q) => any(q, "typescript", ".ts") && any(q, "modified", "changed", "edited") && q.includes("todo"),
    build: () => ({
      command: `find . -name '*.ts' -not -path '*/node_modules/*' -mtime -7 -exec grep -l 'TODO' {} +`,
      summary: "TypeScript files modified in the last 7 days that contain TODO.",
      breakdown: [
        { part: "find . -name '*.ts'", meaning: "walk the tree for TypeScript files" },
        { part: "-not -path '*/node_modules/*'", meaning: "skip dependencies" },
        { part: "-mtime -7", meaning: "modified within the last 7 days" },
        { part: "-exec grep -l 'TODO' {} +", meaning: "keep only files whose contents mention TODO; print filenames" },
      ],
      confidence: "high",
    }),
  },
  {
    test: (q) => any(q, "kill", "stop", "free") && q.includes("port"),
    build: (q) => {
      const port = /(\d{2,5})/.exec(q)?.[1] ?? "3000";
      return {
        command: `lsof -ti :${port} | xargs kill`,
        summary: `Terminate whatever process is listening on port ${port}.`,
        breakdown: [
          { part: `lsof -ti :${port}`, meaning: `PIDs bound to :${port}, bare numbers only` },
          { part: "| xargs kill", meaning: "send SIGTERM to each of those PIDs" },
        ],
        destructive: "Kills a running process. Check `lsof -i :" + port + "` first if you're not certain what owns the port.",
        confidence: "high",
      };
    },
  },
  {
    test: (q) => any(q, "undo", "revert") && q.includes("commit"),
    build: () => ({
      command: "git reset --soft HEAD~1",
      summary: "Undo the last commit but keep its changes staged.",
      breakdown: [
        { part: "reset --soft", meaning: "move the branch pointer without touching files or the index" },
        { part: "HEAD~1", meaning: "one commit back" },
      ],
      destructive: "Rewrites branch history. Safe locally; do not do this on a commit that's already pushed and shared.",
      confidence: "high",
    }),
  },
  {
    test: (q) => any(q, "largest", "biggest", "large files", "big files") || (q.includes("disk") && any(q, "what", "using", "usage", "space")),
    build: () => ({
      command: "du -sh * | sort -rh | head -12",
      summary: "The 12 largest entries in the current directory, human-readable, biggest first.",
      breakdown: [
        { part: "du -sh *", meaning: "summarize the size of each entry here" },
        { part: "sort -rh", meaning: "order by human-readable size, descending" },
        { part: "head -12", meaning: "top twelve" },
      ],
      confidence: "high",
    }),
  },
  {
    test: (q) => any(q, "search", "find", "grep", "look for") && any(q, "string", "text", "contains", "containing", "mention"),
    build: (q) => {
      const quoted = /["'“]([^"'”]+)["'”]/.exec(q)?.[1] ?? "<pattern>";
      return {
        command: `grep -rn --include='*.{ts,tsx,py,sql}' '${quoted}' .`,
        summary: `Every source line mentioning '${quoted}', with file and line number.`,
        breakdown: [
          { part: "-r", meaning: "recurse from the current directory" },
          { part: "-n", meaning: "print line numbers" },
          { part: "--include=...", meaning: "only source files, skip artifacts" },
        ],
        confidence: quoted === "<pattern>" ? "medium" : "high",
      };
    },
  },
  {
    test: (q) => has(q, "node_modules") && any(q, "delete", "remove", "clean"),
    build: () => ({
      command: "rm -rf node_modules && pnpm install",
      summary: "Delete the dependency tree and reinstall from the lockfile.",
      breakdown: [
        { part: "rm -rf node_modules", meaning: "remove the installed dependency tree" },
        { part: "&& pnpm install", meaning: "reinstall exactly per pnpm-lock.yaml" },
      ],
      destructive: "rm -rf permanently deletes the directory. Fine for node_modules; make sure the path is exactly node_modules.",
      confidence: "high",
    }),
  },
  {
    test: (q) => any(q, "branches", "branch") && any(q, "merged", "cleanup", "clean up", "delete old"),
    build: () => ({
      command: "git branch --merged main | grep -v 'main' | xargs git branch -d",
      summary: "Delete local branches already merged into main.",
      breakdown: [
        { part: "--merged main", meaning: "branches whose commits are all reachable from main" },
        { part: "grep -v 'main'", meaning: "never touch main itself" },
        { part: "xargs git branch -d", meaning: "-d refuses anything not fully merged (safety net)" },
      ],
      destructive: "Deletes branches. `-d` (not `-D`) will refuse unmerged work, but review the list first: `git branch --merged main`.",
      confidence: "high",
    }),
  },
  {
    test: (q) => any(q, "log", "logs") && any(q, "follow", "tail", "watch", "live", "stream"),
    build: (q) => {
      const isRemote = any(q, "server", "api", "service", "remote", "nginx");
      return isRemote
        ? {
            command: "journalctl -u atlas-api -f",
            summary: "Follow the atlas-api service log live.",
            breakdown: [
              { part: "-u atlas-api", meaning: "only this systemd unit" },
              { part: "-f", meaning: "keep streaming new entries (Ctrl-C to stop)" },
            ],
            confidence: "high",
          }
        : {
            command: "tail -f /var/log/nginx/access.log",
            summary: "Follow the nginx access log live.",
            breakdown: [{ part: "-f", meaning: "keep streaming appended lines (Ctrl-C to stop)" }],
            confidence: "medium",
          };
    },
  },
  {
    test: (q) => any(q, "count", "how many") && any(q, "lines of code", "loc", "lines"),
    build: () => ({
      command: "find src -name '*.ts*' | xargs wc -l | tail -1",
      summary: "Total line count across TypeScript sources.",
      breakdown: [
        { part: "find src -name '*.ts*'", meaning: "all .ts/.tsx under src" },
        { part: "xargs wc -l", meaning: "count lines per file" },
        { part: "tail -1", meaning: "just the total row" },
      ],
      confidence: "high",
    }),
  },
  {
    test: (q) => any(q, "recently changed", "recent files", "last edited", "changed recently", "modified today"),
    build: () => ({
      command: "find . -not -path '*/node_modules/*' -type f -mtime -1 -exec ls -lt {} +",
      summary: "Files modified in the last 24 hours, newest first.",
      breakdown: [
        { part: "-mtime -1", meaning: "modified within one day" },
        { part: "-exec ls -lt {} +", meaning: "list with timestamps, newest first" },
      ],
      confidence: "high",
    }),
  },
  {
    test: (q) => any(q, "docker", "container") && any(q, "running", "list", "show"),
    build: () => ({
      command: "docker ps",
      summary: "Currently running containers with ports and uptime.",
      breakdown: [{ part: "ps", meaning: "running containers only (add -a for stopped ones)" }],
      confidence: "high",
    }),
  },
  {
    test: (q) => any(q, "who", "what", "which") && q.includes("port"),
    build: (q) => {
      const port = /(\d{2,5})/.exec(q)?.[1] ?? "3000";
      return {
        command: `lsof -i :${port}`,
        summary: `The process currently bound to port ${port}.`,
        breakdown: [{ part: `-i :${port}`, meaning: "network files on that TCP/UDP port" }],
        confidence: "high",
      };
    },
  },
];

export function compose(query: string): ComposerProposal | null {
  const q = query.toLowerCase().trim();
  if (q.length < 6) return null;
  for (const rule of RULES) if (rule.test(q)) return rule.build(q);
  return null;
}

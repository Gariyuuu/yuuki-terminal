import type { CommandHandler, CommandRule, ExecCtx } from "./types";
import { c } from "./ansi";
import { displayPath, exists, isDir, listDir, normalize, readFile } from "./vfs";

// Shared builtins + helpers for environment authors. Environment-specific
// rules get first crack at a command; these run after; unknown -> 127.

export function rule(pattern: RegExp, run: CommandHandler): CommandRule {
  return { match: (_argv, raw) => pattern.test(raw.trim()), run };
}

// Instant canned output helper.
export function canned(pattern: RegExp, output: string | ((ctx: ExecCtx) => string), exit = 0, delay = 60): CommandRule {
  return rule(pattern, async (ctx) => {
    await ctx.sleep(delay);
    if (ctx.signal.cancelled) return 130;
    const text = typeof output === "function" ? output(ctx) : output;
    if (text) ctx.emit(text.endsWith("\n") ? text : text + "\n");
    return exit;
  });
}

// Stream lines with per-line delay; supports cancellation mid-stream.
export function streamed(
  pattern: RegExp,
  lines: string[] | ((ctx: ExecCtx) => string[]),
  opts: { delay?: number; exit?: number; jitter?: number } = {},
): CommandRule {
  return rule(pattern, async (ctx) => {
    const ls = typeof lines === "function" ? lines(ctx) : lines;
    for (const line of ls) {
      await ctx.sleep((opts.delay ?? 45) + Math.random() * (opts.jitter ?? 40));
      if (ctx.signal.cancelled) return 130;
      ctx.emit(line + "\n");
    }
    return opts.exit ?? 0;
  });
}

export function tokenize(raw: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const NOT_FOUND_HINTS: Record<string, string> = {
  vim: "vim is not bundled in the demo shell — try `cat <file>` to inspect files",
  nano: "try `cat <file>` to inspect files in this demo shell",
  code: "editor hand-off is not wired in the demo build",
};

export const builtins: CommandRule[] = [
  rule(/^pwd$/, async (ctx) => {
    ctx.emit(ctx.cwd + "\n");
    return 0;
  }),

  rule(/^cd(\s|$)/, async (ctx) => {
    const target = ctx.argv[1] ?? "~";
    const abs = normalize(target, ctx.cwd, ctx.env.home);
    if (!isDir(ctx.env, abs)) {
      ctx.emit(`cd: no such file or directory: ${target}\n`);
      return 1;
    }
    ctx.setCwd(abs);
    return 0;
  }),

  rule(/^ls(\s|$)/, async (ctx) => {
    const flags = ctx.argv.filter((a) => a.startsWith("-")).join("");
    const targetArg = ctx.argv.slice(1).find((a) => !a.startsWith("-"));
    const abs = normalize(targetArg ?? ".", ctx.cwd, ctx.env.home);
    await ctx.sleep(30);
    if (!isDir(ctx.env, abs)) {
      if (exists(ctx.env, abs)) { ctx.emit(targetArg + "\n"); return 0; }
      ctx.emit(`ls: ${targetArg}: No such file or directory\n`);
      return 1;
    }
    const entries = listDir(ctx.env, abs).filter((e) => flags.includes("a") || !e.name.startsWith("."));
    if (flags.includes("l")) {
      for (const e of entries) {
        const size = e.dir ? 96 : Math.min(48000, 180 + e.name.length * 137);
        ctx.emit(
          `${e.dir ? "drwxr-xr-x" : "-rw-r--r--"}  ${ctx.env.user}  staff  ${String(size).padStart(6)}  ${
            e.dir ? c.blue + e.name + c.reset : e.name
          }\n`,
        );
      }
    } else {
      ctx.emit(entries.map((e) => (e.dir ? c.blue + e.name + c.reset : e.name)).join("  ") + "\n");
    }
    return 0;
  }),

  rule(/^cat(\s|$)/, async (ctx) => {
    const target = ctx.argv[1];
    if (!target) { ctx.emit("cat: missing operand\n"); return 1; }
    const abs = normalize(target, ctx.cwd, ctx.env.home);
    const content = readFile(ctx.env, abs);
    if (content === undefined) {
      if (isDir(ctx.env, abs)) { ctx.emit(`cat: ${target}: Is a directory\n`); return 1; }
      ctx.emit(`cat: ${target}: No such file or directory\n`);
      return 1;
    }
    await ctx.sleep(30);
    ctx.emit(content.endsWith("\n") ? content : content + "\n");
    return 0;
  }),

  rule(/^(head|tail)(\s|$)/, async (ctx) => {
    const nIdx = ctx.argv.indexOf("-n");
    const n = nIdx >= 0 ? parseInt(ctx.argv[nIdx + 1], 10) || 10 : 10;
    const target = ctx.argv.slice(1).find((a) => !a.startsWith("-") && a !== String(n));
    if (!target) { ctx.emit(`${ctx.argv[0]}: missing file operand\n`); return 1; }
    const content = readFile(ctx.env, normalize(target, ctx.cwd, ctx.env.home));
    if (content === undefined) { ctx.emit(`${ctx.argv[0]}: ${target}: No such file or directory\n`); return 1; }
    const lines = content.replace(/\n$/, "").split("\n");
    const slice = ctx.argv[0] === "head" ? lines.slice(0, n) : lines.slice(-n);
    ctx.emit(slice.join("\n") + "\n");
    return 0;
  }),

  rule(/^grep(\s|$)/, async (ctx) => {
    const args = ctx.argv.slice(1).filter((a) => !a.startsWith("-"));
    const [pattern, target] = args;
    if (!pattern) { ctx.emit("usage: grep [-rn] pattern [file]\n"); return 2; }
    const recursive = ctx.argv.some((a) => /^-\w*r/.test(a));
    await ctx.sleep(80);
    let matched = 0;
    const scan = (path: string, content: string) => {
      content.split("\n").forEach((line, i) => {
        if (line.toLowerCase().includes(pattern.toLowerCase())) {
          matched++;
          const rel = displayPath(path, ctx.env.home);
          ctx.emit(`${c.magenta}${rel}${c.reset}${c.gray}:${i + 1}:${c.reset}${line.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), (s) => c.brred + s + c.reset)}\n`);
        }
      });
    };
    if (recursive || !target) {
      const root = normalize(target ?? ".", ctx.cwd, ctx.env.home);
      for (const [p, content] of Object.entries(ctx.env.files)) {
        if (typeof content === "string" && p.startsWith(root)) scan(p, content);
      }
    } else {
      const content = readFile(ctx.env, normalize(target, ctx.cwd, ctx.env.home));
      if (content === undefined) { ctx.emit(`grep: ${target}: No such file or directory\n`); return 2; }
      scan(normalize(target, ctx.cwd, ctx.env.home), content);
    }
    return matched > 0 ? 0 : 1;
  }),

  canned(/^echo(\s|$)/, (ctx) => ctx.raw.replace(/^echo\s*/, "").replace(/^["']|["']$/g, ""), 0, 10),
  canned(/^whoami$/, (ctx) => ctx.env.user, 0, 10),
  canned(/^hostname$/, (ctx) => ctx.env.hostname, 0, 10),
  canned(/^date$/, () => new Date().toString(), 0, 10),
  canned(/^uname(\s|$)/, (ctx) => (ctx.env.kind === "ssh" ? "Linux deploy-01 6.8.0-45-generic #45-Ubuntu SMP x86_64 GNU/Linux" : "Darwin macbook.local 24.1.0 Darwin Kernel Version 24.1.0 arm64"), 0, 10),
  canned(/^env$/, (ctx) => Object.entries(ctx.env.envVars).map(([k, v]) => `${k}=${v}`).join("\n"), 0, 10),
  canned(/^which\s+/, (ctx) => {
    const target = ctx.argv[1];
    const known = ["git", "node", "pnpm", "npm", "python", "pip", "pytest", "psql", "docker", "ssh", "grep", "find", "cat", "ls"];
    return known.includes(target) ? `/usr/local/bin/${target}` : `${target} not found`;
  }, 0, 10),
  canned(/^(true|:)$/, "", 0, 5),
  canned(/^false$/, "", 1, 5),
  canned(/^clear$/, "", 0, 5), // handled specially by the store (clears scrollback)

  rule(/^sleep\s+\d+/, async (ctx) => {
    const secs = parseFloat(ctx.argv[1]) || 1;
    await ctx.sleep(secs * 1000);
    return ctx.signal.cancelled ? 130 : 0;
  }),
];

export function notFound(ctx: ExecCtx): number {
  const cmd = ctx.argv[0];
  ctx.emit(`${ctx.env.shell}: command not found: ${cmd}\n`);
  const hint = NOT_FOUND_HINTS[cmd];
  if (hint) ctx.emit(`${c.gray}# ${hint}${c.reset}\n`);
  return 127;
}

// Known command vocabulary per env — used by failure intelligence for
// "did you mean" and by the prompt's tab completion.
export function knownCommands(envRules: CommandRule[]): string[] {
  void envRules;
  return [
    "cd", "ls", "cat", "pwd", "echo", "grep", "head", "tail", "clear", "env",
    "git", "which", "whoami", "hostname", "date", "uname", "history", "ssh", "exit",
  ];
}

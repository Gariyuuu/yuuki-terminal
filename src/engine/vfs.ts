import type { EnvDef } from "./types";

// Tiny virtual filesystem over EnvDef.files (path -> content, null = dir).

export function normalize(path: string, cwd: string, home: string): string {
  let p = path.trim();
  if (p === "" || p === "~") p = home;
  else if (p.startsWith("~/")) p = home + p.slice(1);
  else if (!p.startsWith("/")) p = cwd.replace(/\/$/, "") + "/" + p;
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return "/" + parts.join("/");
}

export function isDir(env: EnvDef, abs: string): boolean {
  if (env.files[abs] === null) return true;
  const prefix = abs.replace(/\/$/, "") + "/";
  return Object.keys(env.files).some((k) => k.startsWith(prefix));
}

export function exists(env: EnvDef, abs: string): boolean {
  return abs in env.files || isDir(env, abs);
}

export function readFile(env: EnvDef, abs: string): string | undefined {
  const v = env.files[abs];
  return typeof v === "string" ? v : undefined;
}

export function listDir(env: EnvDef, abs: string): { name: string; dir: boolean }[] {
  const prefix = abs === "/" ? "/" : abs.replace(/\/$/, "") + "/";
  const seen = new Map<string, boolean>();
  for (const k of Object.keys(env.files)) {
    if (!k.startsWith(prefix) || k === abs) continue;
    const rest = k.slice(prefix.length);
    if (!rest) continue;
    const first = rest.split("/")[0];
    const isChildDir = rest.includes("/") || env.files[prefix + first] === null;
    seen.set(first, seen.get(first) || isChildDir);
  }
  return [...seen.entries()]
    .map(([name, dir]) => ({ name, dir }))
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
}

export function displayPath(abs: string, home: string): string {
  if (abs === home) return "~";
  if (abs.startsWith(home + "/")) return "~" + abs.slice(home.length);
  return abs;
}

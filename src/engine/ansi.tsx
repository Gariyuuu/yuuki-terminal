import React from "react";

// Minimal ANSI SGR parser: supports reset, bold, dim, italic, underline,
// 16-color fg/bg (30–37, 90–97, 40–47), and 38;5;n 256-color fg (mapped to
// nearest of the 16). Enough for realistic tool output; deliberately not a
// full terminal emulator — a real pty backend would swap in xterm.js here.

export interface AnsiSpan {
  text: string;
  fg?: number; // 0..15
  bg?: number;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const ESC = /\x1b\[([0-9;]*)m/g;

export function parseAnsi(input: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  let last = 0;
  let state: Omit<AnsiSpan, "text"> = {};
  ESC.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ESC.exec(input)) !== null) {
    if (m.index > last) spans.push({ text: input.slice(last, m.index), ...state });
    const codes = (m[1] === "" ? "0" : m[1]).split(";").map((c) => parseInt(c, 10));
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) state = {};
      else if (c === 1) state.bold = true;
      else if (c === 2) state.dim = true;
      else if (c === 3) state.italic = true;
      else if (c === 4) state.underline = true;
      else if (c === 22) { state.bold = false; state.dim = false; }
      else if (c === 39) state.fg = undefined;
      else if (c === 49) state.bg = undefined;
      else if (c >= 30 && c <= 37) state.fg = c - 30;
      else if (c >= 90 && c <= 97) state.fg = c - 90 + 8;
      else if (c >= 40 && c <= 47) state.bg = c - 40;
      else if (c === 38 && codes[i + 1] === 5) { state.fg = codes[i + 2] % 16; i += 2; }
      else if (c === 48 && codes[i + 1] === 5) { state.bg = codes[i + 2] % 16; i += 2; }
    }
    last = ESC.lastIndex;
  }
  if (last < input.length) spans.push({ text: input.slice(last), ...state });
  return spans;
}

export function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

export const Ansi = React.memo(function Ansi({ text }: { text: string }) {
  const spans = parseAnsi(text);
  return (
    <>
      {spans.map((s, i) => {
        const cls: string[] = [];
        if (s.fg !== undefined) cls.push(`a-fg${s.fg}`);
        if (s.bg !== undefined) cls.push(`a-bg${s.bg}`);
        if (s.bold) cls.push("a-b");
        if (s.dim) cls.push("a-d");
        if (s.italic) cls.push("a-i");
        if (s.underline) cls.push("a-u");
        return cls.length ? (
          <span key={i} className={cls.join(" ")}>{s.text}</span>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        );
      })}
    </>
  );
});

// Convenience color helpers used by environment authors.
export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  brred: "\x1b[91m",
  brgreen: "\x1b[92m",
  bryellow: "\x1b[93m",
  brcyan: "\x1b[96m",
  white: "\x1b[97m",
};

import type { EnvDef } from "../types";
import { c } from "../ansi";
import { canned, rule, streamed } from "../shell";

const HOME = "/Users/gary";
const ROOT = `${HOME}/dev/atlas-web`;

const pkgJson = `{
  "name": "atlas-web",
  "private": true,
  "version": "0.4.2",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "15.1.3",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "zod": "3.24.1",
    "stripe": "17.4.0"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "vitest": "2.1.8",
    "eslint": "9.17.0",
    "eslint-config-next": "15.1.3"
  }
}`;

const pricingTs = `import type { CartItem, Discount } from "./cart";

const TAX_RATE = 0.0875;

export function subtotal(items: CartItem[]): number {
  return items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
}

export function applyDiscount(amount: number, discount: Discount): number {
  if (discount.kind === "percent") {
    return amount * (1 - discount.value / 100);
  }
  return Math.max(0, amount - discount.value);
}

export function total(items: CartItem[], discount?: Discount): number {
  let amount = subtotal(items);
  if (discount) {
    amount = applyDiscount(amount, discount);
  }
  // FIXME(gary): rounding should happen once at the end, not per line item
  return round2(amount * (1 + TAX_RATE));
}

export function formatTotal(items: CartItem[], discount?: Discount): string {
  const t = total(items, discount);
  return t.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
`;

const cartTs = `export interface CartItem {
  sku: string;
  name: string;
  unitPrice: number;
  qty: number;
}

// TODO: support stacking discounts once promo service ships
export interface Discount {
  kind: "percent" | "fixed";
  value: number;
  code: string;
}

export function itemCount(items: CartItem[]): number {
  return items.reduce((n, it) => n + it.qty, 0);
}
`;

const checkoutTest = `import { describe, expect, it } from "vitest";
import { applyDiscount, total } from "../src/lib/pricing";

describe("pricing", () => {
  it("applies percent discounts", () => {
    expect(applyDiscount(100, { kind: "percent", value: 20, code: "SAVE20" })).toBe(80);
  });

  it("never lets fixed discounts go negative", () => {
    expect(applyDiscount(5, { kind: "fixed", value: 10, code: "TEN" })).toBe(0);
  });

  it("charges tax after discount", () => {
    const items = [{ sku: "sku-1", name: "Widget", unitPrice: 100, qty: 1 }];
    expect(total(items, { kind: "percent", value: 10, code: "S10" })).toBe(97.88);
  });
});
`;

const gitStatus = `On branch ${c.green}feat/checkout-flow${c.reset}
Your branch is based on 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
	${c.red}modified:   src/lib/pricing.ts${c.reset}
	${c.red}modified:   src/app/checkout/page.tsx${c.reset}

Untracked files:
	${c.red}tests/checkout.test.ts${c.reset}

no changes added to commit (use "git add" and/or "git commit -a")`;

const gitLog = `${c.yellow}9f31c2a${c.reset} ${c.gray}(HEAD -> feat/checkout-flow)${c.reset} checkout: wire discount codes into cart summary
${c.yellow}4be80d7${c.reset} checkout: scaffold /checkout route + server action
${c.yellow}e2a91cc${c.reset} ${c.gray}(origin/main, main)${c.reset} chore: bump next to 15.1.3
${c.yellow}77d10f8${c.reset} cart: extract CartItem/Discount types
${c.yellow}0c4e6b1${c.reset} api: stripe webhook signature verification
${c.yellow}b8f22ad${c.reset} fix: hydration mismatch on product gallery
${c.yellow}3d9c051${c.reset} feat: product listing page with server components`;

export const atlasWeb: EnvDef = {
  id: "atlas-web",
  label: "atlas-web",
  kind: "local",
  user: "gary",
  hostname: "macbook",
  shell: "zsh",
  home: HOME,
  defaultCwd: ROOT,
  context: {
    branch: "feat/checkout-flow",
    dirtyFiles: 3,
    runtime: "node 22.11.0",
    packageManager: "pnpm 9.15",
  },
  envVars: {
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    SHELL: "/bin/zsh",
  },
  files: {
    [ROOT]: null,
    [`${ROOT}/package.json`]: pkgJson,
    [`${ROOT}/README.md`]: "# atlas-web\n\nStorefront for Atlas. Next.js 15 app router.\n\n- `pnpm dev` — local dev on :3000\n- `pnpm test` — vitest\n- `pnpm build` — production build\n",
    [`${ROOT}/next.config.mjs`]: "/** @type {import('next').NextConfig} */\nconst nextConfig = { reactStrictMode: true };\nexport default nextConfig;\n",
    [`${ROOT}/tsconfig.json`]: `{\n  "compilerOptions": {\n    "strict": true,\n    "target": "ES2022",\n    "moduleResolution": "bundler",\n    "jsx": "preserve",\n    "paths": { "@/*": ["./src/*"] }\n  }\n}`,
    [`${ROOT}/.env.local`]: "# local only — never committed\nSTRIPE_SECRET_KEY=sk_test_[redacted]\nDATABASE_URL=postgres://gary@localhost:5432/atlas_dev\n",
    [`${ROOT}/src`]: null,
    [`${ROOT}/src/app/page.tsx`]: "export default function Home() {\n  return <main>Atlas storefront</main>;\n}\n",
    [`${ROOT}/src/app/checkout/page.tsx`]: "import { formatTotal } from \"@/lib/pricing\";\n\n// TODO: hook up promo code input to applyDiscount\nexport default async function CheckoutPage() {\n  return <main>{/* checkout summary */}</main>;\n}\n",
    [`${ROOT}/src/lib/pricing.ts`]: pricingTs,
    [`${ROOT}/src/lib/cart.ts`]: cartTs,
    [`${ROOT}/tests/checkout.test.ts`]: checkoutTest,
  },
  commands: [
    // dev server — long-running, port-aware, cancellable
    rule(/^(pnpm|npm run|npm) dev$/, async (ctx) => {
      const holder = ctx.portInUse(3000);
      if (holder) {
        await ctx.sleep(700);
        ctx.emit(`${c.brcyan}   ▲ Next.js 15.1.3${c.reset}\n   - Local:        http://localhost:3000\n\n`);
        ctx.emit(`${c.red}⨯ Failed to start server${c.reset}\nError: listen EADDRINUSE: address already in use :::3000\n    at Server.setupListenHandle [as _listen2] (node:net:1912:16)\n    at listenInCluster (node:net:1969:12)\n`);
        return 1;
      }
      const pid = ctx.registerProcess({ name: "next-server", cmd: "next dev", cpu: 12.4, mem: 412, ports: [3000] });
      void pid;
      ctx.emit(`${c.brcyan}   ▲ Next.js 15.1.3${c.reset}\n`);
      await ctx.sleep(300);
      ctx.emit("   - Local:        http://localhost:3000\n   - Environments: .env.local\n\n");
      await ctx.sleep(900);
      if (ctx.signal.cancelled) return 130;
      ctx.emit(` ${c.green}✓${c.reset} Starting...\n`);
      await ctx.sleep(1400);
      if (ctx.signal.cancelled) return 130;
      ctx.emit(` ${c.green}✓${c.reset} Ready in 2.1s\n`);
      const routes = ["/", "/checkout", "/products/[slug]", "/api/webhook"];
      let i = 0;
      while (!ctx.signal.cancelled) {
        await ctx.sleep(6000 + Math.random() * 9000);
        if (ctx.signal.cancelled) break;
        const route = routes[i++ % routes.length];
        ctx.emit(` ${c.green}✓${c.reset} Compiled ${route} in ${(200 + Math.random() * 700).toFixed(0)}ms\n`);
      }
      return 130;
    }),

    // production build — the flagship failure-intelligence demo
    rule(/^(pnpm|npm run) build$/, async (ctx) => {
      ctx.emit(`${c.brcyan}   ▲ Next.js 15.1.3${c.reset}\n\n`);
      await ctx.sleep(500);
      ctx.emit("   Creating an optimized production build ...\n");
      await ctx.sleep(2600);
      if (ctx.signal.cancelled) return 130;
      ctx.emit(`${c.red}Failed to compile.${c.reset}\n\n`);
      ctx.emit(`${c.bold}./src/lib/pricing.ts:42:18${c.reset}\n`);
      ctx.emit(`${c.red}Type error${c.reset}: Property 'stackable' does not exist on type 'Discount'.\n\n`);
      ctx.emit(`  ${c.gray}40 |${c.reset} export function canStack(a: Discount, b: Discount): boolean {\n`);
      ctx.emit(`  ${c.gray}41 |${c.reset}   // promo service contract, not yet in the type\n`);
      ctx.emit(`${c.red}> 42 |${c.reset}   return a.${c.red}stackable${c.reset} && b.stackable;\n`);
      ctx.emit(`  ${c.gray}   |${c.reset}            ${c.red}^${c.reset}\n`);
      ctx.emit(`  ${c.gray}43 |${c.reset} }\n\n`);
      ctx.emit(`Next.js build worker exited with code: 1\n`);
      return 1;
    }),

    rule(/^(pnpm|npm) (run )?test$/, async (ctx) => {
      ctx.emit(`${c.gray}> atlas-web@0.4.2 test${c.reset}\n${c.gray}> vitest run${c.reset}\n\n`);
      await ctx.sleep(900);
      ctx.emit(` ${c.brcyan}RUN${c.reset}  v2.1.8 ${ROOT}\n\n`);
      await ctx.sleep(1100);
      if (ctx.signal.cancelled) return 130;
      ctx.emit(` ${c.red}❯${c.reset} tests/checkout.test.ts ${c.gray}(3 tests | 1 failed)${c.reset} 214ms\n`);
      ctx.emit(`   ${c.green}✓${c.reset} pricing > applies percent discounts\n`);
      ctx.emit(`   ${c.green}✓${c.reset} pricing > never lets fixed discounts go negative\n`);
      ctx.emit(`   ${c.red}× pricing > charges tax after discount${c.reset}\n\n`);
      await ctx.sleep(300);
      ctx.emit(`${c.red}FAIL${c.reset}  tests/checkout.test.ts > pricing > charges tax after discount\n`);
      ctx.emit(`AssertionError: expected 97.87 to be 97.88 ${c.gray}// Object.is equality${c.reset}\n\n`);
      ctx.emit(`${c.gray}- Expected${c.reset}  97.88\n${c.gray}+ Received${c.reset}  ${c.red}97.87${c.reset}\n\n`);
      ctx.emit(` ${c.gray}❯ tests/checkout.test.ts:14:59${c.reset}\n\n`);
      ctx.emit(` Test Files  ${c.red}1 failed${c.reset} ${c.gray}(1)${c.reset}\n      Tests  ${c.red}1 failed${c.reset} | ${c.green}2 passed${c.reset} ${c.gray}(3)${c.reset}\n   Duration  1.42s\n`);
      return 1;
    }),

    streamed(/^pnpm (install|i)$/, [
      "Lockfile is up to date, resolution step is skipped",
      "Already up to date",
      "",
      `${c.gray}Done in 412ms${c.reset}`,
    ], { delay: 120 }),

    rule(/^(pnpm|npm run) lint$/, async (ctx) => {
      await ctx.sleep(1600);
      if (ctx.signal.cancelled) return 130;
      ctx.emit(`\n${c.yellow}./src/app/checkout/page.tsx${c.reset}\n`);
      ctx.emit(`8:27  ${c.yellow}Warning${c.reset}: 'formatTotal' is defined but never used.  ${c.gray}@typescript-eslint/no-unused-vars${c.reset}\n\n`);
      ctx.emit(`${c.gray}info${c.reset}  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/app/api-reference/config/eslint\n`);
      return 0;
    }),

    canned(/^(pnpm tsc|npx tsc|tsc)( --noEmit)?$/, `src/lib/pricing.ts:42:18 - error TS2339: Property 'stackable' does not exist on type 'Discount'.\n\n${c.bold}Found 1 error in src/lib/pricing.ts:42${c.reset}`, 2, 1800),

    // git
    canned(/^git status$/, gitStatus, 0, 90),
    canned(/^git log/, gitLog, 0, 90),
    canned(/^git branch$/, `* ${c.green}feat/checkout-flow${c.reset}\n  main\n  fix/gallery-hydration`, 0, 60),
    canned(/^git diff --stat$/, ` src/app/checkout/page.tsx | 31 ${c.green}+++++++++++++++++${c.red}--${c.reset}\n src/lib/pricing.ts        | 18 ${c.green}++++++++++${c.reset}\n 2 files changed, 41 insertions(+), 8 deletions(-)`, 0, 80),
    canned(/^git diff$/, `${c.bold}diff --git a/src/lib/pricing.ts b/src/lib/pricing.ts${c.reset}\n${c.gray}index 3f81a02..9c2e4b7 100644${c.reset}\n${c.cyan}@@ -37,6 +37,11 @@${c.reset} export function total(items: CartItem[], discount?: Discount): number {\n${c.green}+export function canStack(a: Discount, b: Discount): boolean {${c.reset}\n${c.green}+  // promo service contract, not yet in the type${c.reset}\n${c.green}+  return a.stackable && b.stackable;${c.reset}\n${c.green}+}${c.reset}`, 0, 90),
    canned(/^git add /, "", 0, 60),
    canned(/^git commit/, `[feat/checkout-flow ${c.yellow}c7d20e4${c.reset}] checkout: stackable discount groundwork\n 2 files changed, 41 insertions(+), 8 deletions(-)`, 0, 200),
    rule(/^git push$/, async (ctx) => {
      await ctx.sleep(800);
      ctx.emit(`fatal: The current branch feat/checkout-flow has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream origin feat/checkout-flow\n`);
      return 128;
    }),
    streamed(/^git push (-u|--set-upstream) origin/, [
      "Enumerating objects: 24, done.",
      "Counting objects: 100% (24/24), done.",
      "Delta compression using up to 10 threads",
      "Compressing objects: 100% (14/14), done.",
      "Writing objects: 100% (15/15), 4.31 KiB | 4.31 MiB/s, done.",
      `remote: \nremote: Create a pull request for 'feat/checkout-flow' on GitHub by visiting:\nremote:      https://github.com/atlas-inc/atlas-web/pull/new/feat/checkout-flow\nremote: `,
      `To github.com:atlas-inc/atlas-web.git\n * [new branch]      feat/checkout-flow -> feat/checkout-flow`,
      `branch 'feat/checkout-flow' set up to track 'origin/feat/checkout-flow'.`,
    ], { delay: 160 }),

    canned(/^node (-v|--version)$/, "v22.11.0", 0, 40),
    canned(/^pnpm (-v|--version)$/, "9.15.0", 0, 40),
    canned(/^lsof -i( -P)? ?:?3000$/, (ctx) => {
      const p = ctx.portInUse(3000);
      return p ? `COMMAND     PID  USER   FD   TYPE  DEVICE  SIZE/OFF  NODE NAME\nnode      ${p.pid}  gary   23u  IPv6  0x1a2b      0t0   TCP *:3000 (LISTEN)` : "";
    }, 0, 120),
  ],
  seedHistory: [
    { command: "pnpm install", exitCode: 0, hoursAgo: 76, durationMs: 8200 },
    { command: "pnpm dev", exitCode: 130, hoursAgo: 75, durationMs: 3600_000 },
    { command: "git checkout -b feat/checkout-flow", exitCode: 0, hoursAgo: 74, durationMs: 300 },
    { command: "git log --oneline -n 10", exitCode: 0, hoursAgo: 52, durationMs: 120 },
    { command: "pnpm test", exitCode: 0, hoursAgo: 51, durationMs: 4100 },
    { command: "git add -A && git commit -m 'checkout: scaffold route'", exitCode: 0, hoursAgo: 50, durationMs: 450 },
    { command: "pnpm dev", exitCode: 130, hoursAgo: 30, durationMs: 7200_000 },
    { command: "grep -rn TODO src", exitCode: 0, hoursAgo: 29, durationMs: 210 },
    { command: "pnpm lint", exitCode: 0, hoursAgo: 28, durationMs: 2900 },
    { command: "pnpm test", exitCode: 1, hoursAgo: 6, durationMs: 3800 },
    { command: "git diff --stat", exitCode: 0, hoursAgo: 5, durationMs: 130 },
    { command: "cat src/lib/pricing.ts", exitCode: 0, hoursAgo: 5, durationMs: 40 },
  ],
  baseProcesses: [
    { pid: 812, ppid: 1, user: "gary", name: "Docker", cmd: "com.docker.backend", cpu: 1.2, mem: 640, ports: [], startedAt: Date.now() - 86400_000 },
  ],
};

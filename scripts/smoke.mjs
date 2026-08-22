import { chromium } from "playwright";

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:4823");
await page.waitForTimeout(1500);

// 1. boot: workspace opened with split pane + seeded blocks + dev server autorun
const panes = await page.locator(".pane").count();
console.log("panes:", panes);
const blocks = await page.locator(".block").count();
console.log("blocks after boot:", blocks);
console.log("has failed seeded block:", await page.locator(".block.fail").count());

// 2. type a command in the active pane and run it
await page.locator(".pane.active .pr-input").fill("git status");
await page.locator(".pane.active .pr-input").press("Enter");
await page.waitForTimeout(700);
const out = await page.locator(".pane.active .block").last().textContent();
console.log("git status ran:", out.includes("feat/checkout-flow"));

// 3. dev server should be streaming in the right pane (autorun pnpm dev)
await page.waitForTimeout(2500);
const bodyText = await page.textContent("body");
console.log("dev server ready:", bodyText.includes("Ready in"));
console.log("statusbar port 3000:", bodyText.includes(":3000"));

// 4. EADDRINUSE: run pnpm dev in the left pane too
await page.locator(".pane.active .pr-input").fill("pnpm dev");
await page.locator(".pane.active .pr-input").press("Enter");
await page.waitForTimeout(1600);
console.log("EADDRINUSE:", (await page.textContent("body")).includes("EADDRINUSE"));

// 5. open failure inspector via exit tag
await page.locator(".pane.active .exit-tag").first().click();
await page.waitForTimeout(300);
console.log("inspector open:", await page.locator(".inspector").count());
console.log("inspector suggestion:", (await page.textContent(".inspector")).includes("suggested next step"));
await page.keyboard.press("Escape");

// 6. composer
await page.keyboard.press("Meta+k");
await page.waitForTimeout(200);
await page.locator(".composer input").fill("find every typescript file modified this week containing TODO");
await page.waitForTimeout(300);
const prop = await page.locator(".cp-cmd").textContent().catch(() => "");
console.log("composer proposal:", prop.includes("find . -name"));
await page.locator(".composer input").press("Enter");
await page.waitForTimeout(200);
const promptVal = await page.locator(".pane.active .pr-input").inputValue();
console.log("inserted into prompt (not run):", promptVal.startsWith("find ."));
await page.locator(".pane.active .pr-input").fill("");

// 7. history panel
await page.keyboard.press("Control+Alt+h");
await page.waitForTimeout(300);
const histRows = await page.locator(".hist-row").count();
console.log("history rows:", histRows);
await page.locator(".panel-filters input").fill("pytest");
await page.waitForTimeout(200);
console.log("history filtered:", await page.locator(".hist-row").count());
await page.keyboard.press("Control+Alt+h");

// 8. processes panel with jump-to-session (next-server from autorun)
await page.keyboard.press("Control+Alt+p");
await page.waitForTimeout(300);
const procText = await page.textContent(".panel-list");
console.log("proc has next-server:", procText.includes("next-server"));
console.log("jump button:", await page.locator(".proc-row .ghost.tiny").count() > 0);
await page.keyboard.press("Control+Alt+p");

// 9. ssh: hosts panel + connect
await page.keyboard.press("Control+Alt+s");
await page.waitForTimeout(300);
console.log("hosts listed:", await page.locator(".host-row").count());
await page.locator(".host-row").first().locator("button.ghost").click();
await page.waitForTimeout(2500);
const paneText = await page.locator(".pane.active").textContent();
console.log("ssh banner:", paneText.includes("Ubuntu"));
console.log("fingerprint line:", paneText.includes("known_hosts"));
console.log("statusbar remote:", (await page.textContent(".statusbar")).includes("ubuntu@deploy-01"));

// run remote command
await page.locator(".pane.active .pr-input").fill("df -h");
await page.locator(".pane.active .pr-input").press("Enter");
await page.waitForTimeout(700);
console.log("remote df -h:", (await page.locator(".pane.active").textContent()).includes("/var/lib/postgresql"));

// exit back
await page.locator(".pane.active .pr-input").fill("exit");
await page.locator(".pane.active .pr-input").press("Enter");
await page.waitForTimeout(600);
console.log("ssh closed:", (await page.locator(".pane.active").textContent()).includes("closed"));

// 10. cancel long-running: pane 2 dev server via Ctrl+C
const rightPane = page.locator(".pane").nth(1);
await rightPane.click();
await page.waitForTimeout(200);
await page.keyboard.press("Control+c");
await page.waitForTimeout(500);
console.log("dev server cancelled (exit tag 130):", (await rightPane.textContent()).includes("exit 130"));

// 11. workspace switch
await page.keyboard.press("Control+Alt+o");
await page.waitForTimeout(300);
await page.locator(".ws-open", { hasText: "torch-lab" }).click();
await page.waitForTimeout(600);
console.log("torch workspace:", (await page.textContent(".statusbar")).includes("python 3.12"));

// train + interrupt
await page.locator(".pane.active .pr-input").fill("python train.py --epochs 2");
await page.locator(".pane.active .pr-input").press("Enter");
await page.waitForTimeout(3500);
await page.keyboard.press("Control+c");
await page.waitForTimeout(600);
console.log("train interrupted gracefully:", (await page.locator(".pane.active").textContent()).includes("KeyboardInterrupt"));

// 12. split pane
await page.keyboard.press("Meta+d");
await page.waitForTimeout(300);
console.log("panes after split:", await page.locator(".pane").count());

// 13. pg workspace migration failure chain
await page.keyboard.press("Control+Alt+o");
await page.waitForTimeout(300);
await page.locator(".ws-open", { hasText: "atlas postgres" }).click();
await page.waitForTimeout(500);
await page.locator(".pane.active .pr-input").fill("make migrate");
await page.locator(".pane.active .pr-input").press("Enter");
await page.waitForTimeout(1500);
await page.locator(".pane.active .exit-tag").first().click();
await page.waitForTimeout(300);
const inspText = await page.textContent(".inspector").catch(() => "");
console.log("pg failure explained:", inspText.includes("orders"));
console.log("pg suggestion 0041:", inspText.includes("0041"));

// 14. search
await page.keyboard.press("Escape");
await page.keyboard.press("Meta+f");
await page.waitForTimeout(200);
console.log("search bar:", await page.locator(".pane-search").count());

await page.screenshot({ path: "/private/tmp/claude-501/-Users-gariyuu-Projects/59b5dc1a-7fb1-4752-b5d3-93919e445655/scratchpad/final.png" });
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();

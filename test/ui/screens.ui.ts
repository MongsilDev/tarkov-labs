import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, createReadStream, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer as httpServer, type Server } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const STANDALONE = join(ROOT, ".next/standalone");
const FIXTURES = join(ROOT, "test/fixtures");
const DATA = mkdtempSync(join(tmpdir(), "tarkov-labs-ui-"));
const SHOTS = mkdtempSync(join(tmpdir(), "tarkov-labs-ui-shots-"));
process.env.DATA_DIR = DATA;

let server: ChildProcess;
let upstream: Server;
let base = "";
let browser: Browser;

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

// players.tarkov.dev 대신 픽스처 폴더를 그대로 내려줌
async function fixtureServer(): Promise<string> {
  const port = await freePort();
  upstream = httpServer((req, res) => {
    const file = join(FIXTURES, decodeURIComponent((req.url ?? "/").split("?")[0]));
    if (!file.startsWith(FIXTURES) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => upstream.listen(port, "127.0.0.1", r));
  return `http://127.0.0.1:${port}`;
}

async function seed() {
  const { db } = await import("../../src/server/db");
  const conn = db();
  const t = Date.now();
  const acc = conn.prepare("INSERT INTO accounts (aid, name, name_lc, u_pvp, u_season, u_pve, u_arena) VALUES (?, ?, ?, ?, ?, ?, ?)");
  acc.run(1001, "Fixture-Alpha", "fixture-alpha", t, t, t, null);
  acc.run(1002, "Fixture-Bravo", "fixture-bravo", t, t, t, t);
  acc.run(1003, "Fixture-Charlie", "fixture-charlie", t, null, t, t);
  acc.run(1004, "Fixture-Hidden", "fixture-hidden", t, null, null, null);
  conn.prepare("INSERT INTO hidden (aid, at) VALUES (1004, ?)").run(t);
  conn.prepare("INSERT INTO names (aid, old_name, new_name, seen_at) VALUES (1001, ?, ?, ?)").run("아주아주긴옛날닉네임_Long_Old_Name", "Fixture-Alpha", t);
  // 1001과 비슷한 계정 200개로 판정이 나오게 함
  const b = conn.prepare("INSERT INTO baseline (mode, aid, updated, hours, n, kills, deaths, survived, streak, headshots, max_game_kills) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (let i = 0; i < 200; i++) {
    b.run("pvp", 50_000 + i, t, 2456 * (0.95 + (i % 10) / 100), 1055 + (i % 40) - 20, 150 + i, 560 + (i % 30), 400 + (i % 80), 4 + (i % 9), 0, 0);
    b.run("arena", 50_000 + i, t, 100 * (0.95 + (i % 10) / 100), 21 + (i % 3), 300 + i, 500 + (i % 50), 10 + (i % 5), 10 + (i % 15), 120 + (i % 60), 30 + (i % 20));
  }
  conn.prepare("INSERT INTO meta (key, value) VALUES ('indexed_at', ?), ('accounts', '4')").run(String(t));
}

beforeAll(async () => {
  if (!existsSync(join(STANDALONE, "server.js"))) throw new Error("먼저 pnpm build를 실행해주세요.");
  for (const dir of ["public", "assets"]) cpSync(join(ROOT, dir), join(STANDALONE, dir), { recursive: true });
  cpSync(join(ROOT, ".next/static"), join(STANDALONE, ".next/static"), { recursive: true });
  await seed();
  const players = await fixtureServer();
  const port = await freePort();
  base = `http://localhost:${port}`;
  // 운영 .env가 섞이지 않게 환경 변수를 직접 지정
  server = spawn(process.execPath, ["server.js"], {
    cwd: STANDALONE,
    env: { NODE_ENV: "production", PATH: process.env.PATH ?? "", PORT: String(port), HOSTNAME: "127.0.0.1", BASE_URL: base, DATA_DIR: DATA, PLAYERS_BASE: players, JOBS: "0" },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    if (await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  server?.kill();
  upstream?.close();
  rmSync(DATA, { recursive: true, force: true });
  if (readdirSync(SHOTS).length === 0) rmSync(SHOTS, { recursive: true });
});

type Screen = { name: string; path: string; status?: number };

const SCREENS: Screen[] = [
  { name: "홈", path: "/" },
  { name: "계정 조회", path: "/players" },
  { name: "프로필 PvP", path: "/players/1001?mode=pvp" },
  { name: "프로필 시즌", path: "/players/1001?mode=season" },
  { name: "프로필 PvE", path: "/players/1003?mode=pve" },
  { name: "프로필 아레나", path: "/players/1003?mode=arena" },
  { name: "기록 없는 모드", path: "/players/1001?mode=arena" },
  { name: "숨긴 계정", path: "/players/1004" },
  { name: "판정 기준", path: "/criteria" },
  { name: "처리방침", path: "/privacy" },
  { name: "KORD BREACH", path: "/kord-breach" },
  { name: "없는 페이지", path: "/players/abc", status: 404 },
];

type Problems = { overflow: number; undefinedClass: string[]; unstyled: string[] };

function inspect(): Problems {
  const defined = new Set<string>();
  const collect = (rule: CSSRule) => {
    const sel = (rule as CSSStyleRule).selectorText;
    if (sel) for (const m of sel.matchAll(/\.([\w-]+)/g)) defined.add(m[1]);
    for (const child of (rule as CSSGroupingRule).cssRules ?? []) collect(child);
  };
  for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) collect(rule);
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const label = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
  const undefinedClass = new Set<string>();
  for (const el of document.body.querySelectorAll("[class]")) {
    if (!visible(el)) continue;
    for (const c of el.classList) if (!defined.has(c)) undefinedClass.add(`.${c} ${label(el)}`);
  }
  const unstyled: string[] = [];
  for (const el of document.querySelectorAll("button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden])")) {
    if (!visible(el)) continue;
    const border = getComputedStyle(el).borderTopStyle;
    if (border === "outset" || border === "inset") unstyled.push(label(el));
  }
  return { overflow: document.documentElement.scrollWidth - innerWidth, undefinedClass: [...undefinedClass], unstyled };
}

async function open(screen: Screen, width: number, theme: "dark" | "light"): Promise<{ page: Page; errors: string[]; status: number }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript((t) => localStorage.setItem("tl-theme", t), theme);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !(screen.status === 404 && m.text().includes("404"))) errors.push(m.text());
  });
  const res = await page.goto(base + screen.path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { page, errors, status: res?.status() ?? 0 };
}

describe("화면 점검", () => {
  for (const screen of SCREENS) {
    for (const width of [390, 1440]) {
      for (const theme of ["dark", "light"] as const) {
        it(`${screen.name} ${width} ${theme}`, async () => {
          const { page, errors, status } = await open(screen, width, theme);
          try {
            expect(status).toBe(screen.status ?? 200);
            expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
            const p = await page.evaluate(inspect);
            expect(p, `가로 넘침, 정의 없는 클래스, 브라우저 기본 모양 컨트롤 ${JSON.stringify(p)}`).toEqual({ overflow: 0, undefinedClass: [], unstyled: [] });
            expect(errors).toEqual([]);
          } catch (e) {
            await page.screenshot({ path: join(SHOTS, `${screen.name}-${width}-${theme}.png`), fullPage: true });
            throw new Error(`${e instanceof Error ? e.message : e}\n캡처: ${SHOTS}`);
          } finally {
            await page.context().close();
          }
        });
      }
    }
  }

  it("프로필에 판정과 닉네임 변경이 표시된다", async () => {
    const { page } = await open(SCREENS[2], 1440, "dark");
    await expect(page.locator(".badge").first().textContent()).resolves.toMatch(/특이점 없음|확인 필요|이상 수치/);
    await expect(page.getByText("아주아주긴옛날닉네임_Long_Old_Name").count()).resolves.toBe(1);
    await page.context().close();
  });

  it("검색어를 넣으면 후보가 뜨고 고르면 프로필로 이동한다", async () => {
    const { page } = await open(SCREENS[1], 390, "dark");
    await page.getByRole("combobox").fill("fixture");
    await page.getByRole("option").first().waitFor();
    const names = await page.getByRole("option").allTextContents();
    expect(names.some((n) => n.includes("Hidden"))).toBe(false);
    await page.getByRole("combobox").fill("Fixture-Bravo");
    await page.getByRole("option", { name: /Fixture-Bravo/ }).waitFor();
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/players\/1002/);
    await page.context().close();
  });

  it("시뮬레이터는 포인트를 계산하고 빌드를 주소로 되살린다", async () => {
    const { page } = await open(SCREENS[10], 390, "dark");
    const left = page.locator(".kb-left dd");
    await page.getByRole("button", { name: /플리마켓 금지령/ }).click();
    await expect(left.textContent()).resolves.toBe("10");
    await page.getByRole("button", { name: /카파 프로토콜/ }).click();
    await expect(left.textContent()).resolves.toBe("-2");
    await page.getByText("포인트가 2 부족합니다").waitFor();
    await page.getByRole("button", { name: /^혈우병/ }).click();
    const blocked = page.getByRole("button", { name: /혈전성향증/ });
    await expect(blocked.getAttribute("aria-disabled")).resolves.toBe("true");
    await blocked.click({ force: true });
    await expect(blocked.getAttribute("aria-pressed")).resolves.toBe("false");
    const url = page.url();
    await page.getByRole("button", { name: "초기화" }).click();
    await expect(left.textContent()).resolves.toBe("0");
    const kappa = () => page.getByRole("button", { name: /카파 프로토콜/ }).getAttribute("aria-pressed");
    await expect(kappa()).resolves.toBe("false");
    await page.getByRole("button", { name: "되돌리기" }).click();
    await expect(kappa()).resolves.toBe("true");
    await page.getByRole("button", { name: "초기화" }).click();
    await page.goto(url, { waitUntil: "networkidle" });
    await expect(kappa()).resolves.toBe("true");
    await expect(page.locator(".kb-left dd").textContent()).resolves.toBe("0");
    await page.context().close();
  });

  it("프로필을 열면 계정 조회 화면에 최근 본 계정이 나온다", async () => {
    const { page } = await open(SCREENS[2], 1440, "dark");
    await page.goto(`${base}/players`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Fixture-Alpha" }).waitFor();
    await page.context().close();
  });

  it("시즌 프로필은 고른 특성을 보여주고 시뮬레이터로 연다", async () => {
    const { page } = await open(SCREENS[2], 1440, "dark");
    await page.goto(`${base}/players/1001?mode=season`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /고른 시즌 특성/ }).waitFor();
    await page.getByRole("heading", { name: "스캐브 레이드" }).waitFor();
    await page.getByRole("heading", { name: /^스킬/ }).waitFor();
    const n = await page.locator(".perks li").count();
    await page.getByRole("link", { name: "시뮬레이터에서 열기" }).click();
    await page.waitForURL(/\/kord-breach\?b=/);
    await page.locator(".kb-left dd").waitFor();
    await expect(page.locator('.kb-card[aria-pressed="true"]').count()).resolves.toBe(n);
    await page.context().close();
  });

  it("시즌 진행과 아레나 배틀패스를 보여준다", async () => {
    const { page } = await open(SCREENS[2], 1440, "dark");
    await page.goto(`${base}/players/1001?mode=season`, { waitUntil: "networkidle" });
    const progs = page.locator(".prog");
    await expect(progs.allInnerTexts()).resolves.toEqual([
      expect.stringContaining("루스리스 IV"),
      expect.stringContaining("41 / 53"),
      expect.stringContaining("4 / 5"),
    ]);
    await expect(page.locator(".league li.on").count()).resolves.toBe(4);
    await page.getByText("최고 등급 리본 V").waitFor();
    await page.goto(`${base}/players/1001?mode=pvp`, { waitUntil: "networkidle" });
    await expect(progs.count()).resolves.toBe(2);
    await page.goto(`${base}/players/1003?mode=arena`, { waitUntil: "networkidle" });
    await expect(page.locator(".prog-label").allInnerTexts()).resolves.toEqual([expect.stringMatching(/^시즌 3\s*진행 중$/), "시즌 2", "시즌 1", "시즌 0"]);
    await expect(page.locator(".prog.done").count()).resolves.toBe(3);
    await page.context().close();
  });

  it("업적은 최근 획득순이 기본이고 정렬을 바꿀 수 있다", async () => {
    const { page } = await open(SCREENS[2], 1440, "dark");
    await page.goto(`${base}/players/1001?mode=pvp`, { waitUntil: "networkidle" });
    await expect(page.locator("nav.tabs a").allTextContents()).resolves.toEqual(["시즌", "PvP", "PvE", "아레나"]);
    const dates = async () => (await page.locator(".ach-side .num.nowrap").allTextContents()).filter((t) => /^\d{4}\./.test(t));
    const recent = await dates();
    expect(recent).toEqual([...recent].sort().reverse());
    await page.getByRole("button", { name: "오래된 순" }).click();
    const old = await dates();
    expect(old).toEqual([...old].sort());
    await page.context().close();
  });

  it("키보드로 옮긴 초점이 화면에 표시된다", async () => {
    const { page } = await open(SCREENS[2], 1440, "dark");
    const missing: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const shown = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
        return shown ? null : `${el.tagName.toLowerCase()} "${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 30)}"`;
      });
      if (r) missing.push(r);
    }
    await page.context().close();
    expect(missing).toEqual([]);
  });
});

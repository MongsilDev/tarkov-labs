import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { judge, quantile, trimmedMean, type Sample } from "@/lib/criteria";
import { toSample } from "@/lib/sample";
import { levelFromExp, parse, parseArena, parseEft } from "@/lib/summary";

const fx = (folder: string, aid: number) => JSON.parse(readFileSync(`test/fixtures/${folder}/${aid}.json`, "utf8"));

describe("EFT 프로필", () => {
  it("카운터와 계정 정보를 읽음", () => {
    const s = parseEft(fx("profile", 1001));
    expect(s).toMatchObject({ kind: "eft", aid: 1001, name: "Fixture-Alpha", side: "Bear", member: 1026, prestige: 3 });
    expect(s).toMatchObject({ raids: 1055, survived: 457, kia: 574, mia: 7, runner: 7, transit: 10, kills: 2623, pmcKills: 266, deaths: 581, streak: 9 });
    expect(s.seconds).toBe(8843228);
    expect(s.achievements).toHaveLength(22);
  });
  it("시즌 프로필의 스캐브 전적과 고른 특성을 읽음", () => {
    const s = parseEft(fx("pvp-season", 1002));
    expect(s.scav).toEqual({ raids: 30, survived: 14, kia: 16, kills: 8, pmcKills: 3 });
    expect(s.perks).toHaveLength(17);
    expect(parseEft(fx("pvp-season", 1003)).scav).toBeNull();
  });

  it("스킬, 무기 숙련, 장비를 읽고 빠진 카운터는 0으로 둠", () => {
    const s = parseEft(fx("pvp-season", 1001));
    expect(s.skills!.length).toBeGreaterThan(0);
    expect(s.skills!.every((k, i, a) => i === 0 || a[i - 1].level >= k.level)).toBe(true);
    expect(s.mastery!.length).toBeGreaterThan(0);
    // 픽스처는 장비를 지운 상태라 장비는 따로 만든 입력으로 확인
    const equipment = { Id: "root", Items: [{ _id: "root", _tpl: "x" }, { _id: "a", _tpl: "b", parentId: "root", slotId: "SecuredContainer" }, { _id: "c", _tpl: "d", parentId: "a", slotId: "main" }] };
    expect(parseEft({ equipment }).gear).toEqual([{ slot: "SecuredContainer", tpl: "b" }]);
    expect(parseEft({ pmcStats: { eft: { overAllCounters: { Items: [{ Key: ["Sessions", "Pmc"], Value: 3 }] } } } }).mia).toBe(0);
  });

  it("리그 등급, 배틀패스, 시즌 퀘스트 보상을 읽음", () => {
    const s = parseEft(fx("pvp-season", 1001));
    expect(s.league).toEqual({ rank: 4, max: 5 });
    expect(s.pass).toEqual({ done: 41, total: 53 });
    expect(s.seasonRewards).toEqual({ done: 4, total: 5 });
    const pvp = parseEft(fx("profile", 1001));
    expect(pvp.league).toBeNull();
    expect(pvp.pass).toEqual({ done: 41, total: 53 });
    expect(parseEft(fx("pvp-season", 1002))).toMatchObject({ league: null, pass: null, seasonRewards: null });
  });

  it("레벨은 tarkov.dev 화면과 같음", () => {
    // 9706 계정을 tarkov.dev에서 열었을 때 레벨 29
    expect(parseEft(fx("profile", 1003)).level).toBe(29);
    expect(levelFromExp(0)).toBe(1);
    expect(levelFromExp(999)).toBe(1);
    expect(levelFromExp(1000)).toBe(2);
    expect(levelFromExp(null)).toBeNull();
  });
  it("모든 EFT 픽스처를 오류 없이 읽음", () => {
    for (const [folder, aids] of [["profile", [1001, 1002, 1003]], ["pvp-season", [1001, 1002, 1003]], ["pve", [1001, 1002, 1003]]] as const) {
      for (const aid of aids) {
        const s = parse(folder, fx(folder, aid));
        expect(s.kind).toBe("eft");
        expect(s.updated).toBeGreaterThan(1.7e12);
      }
    }
  });
  it("필드가 없어도 빈 값으로 둠", () => {
    const s = parseEft({ aid: 5, info: {} });
    expect(s).toMatchObject({ aid: 5, name: "", raids: null, level: null, seconds: null, lastActive: null });
  });
});

describe("아레나 프로필", () => {
  it("모드별 카운터를 합치고 최댓값을 고름", () => {
    const s = parseArena(fx("arena", 1002));
    expect(s.kind).toBe("arena");
    expect(s.seconds).toBe(377453);
    expect(s.registered).toBe(1786871943);
    const cp = s.modes.find((m) => m.key === "UnrankedCheckPoint")!.stats;
    expect(cp).toMatchObject({ games: 21, kills: 546, deaths: 581, headshots: 301, maxGameKills: 45, killStreak: 23, teamKills: 14 });
    const sum = s.modes.reduce((a, m) => a + m.stats.kills, 0);
    expect(s.total!.kills).toBe(sum);
    expect(s.total!.maxGameKills).toBe(Math.max(...s.modes.map((m) => m.stats.maxGameKills)));
  });
  it("배틀패스 단계를 최근 시즌부터 읽음", () => {
    expect(parseArena(fx("arena", 1003)).passes).toEqual([
      { id: "6a7ef35bf1520fccd107be5d", level: 91 },
      { id: "69cd05d6ddad8594db0700ca", level: 100 },
      { id: "68c7f09ef2c815c21c0ab1fc", level: 120 },
      { id: "67b8ac64cfb91e762e03ef32", level: 150 },
    ]);
  });
  it("판정용 표본으로 바꿈", () => {
    const s = toSample(parseArena(fx("arena", 1002)))!;
    expect(s.hours).toBeCloseTo(377453 / 3600);
    expect(s.headshots).toBeGreaterThan(0);
  });
});

describe("판정", () => {
  const base: Sample = { hours: 500, n: 400, kills: 400, deaths: 250, survived: 125, streak: 6, headshots: 0, maxGameKills: 0 };
  const peers = Array.from({ length: 200 }, (_, i) => ({ ...base, kills: 200 + i * 2, deaths: 250 + (i % 7), survived: 100 + (i % 50), streak: 3 + (i % 8) }));

  it("보조 계산", () => {
    expect(trimmedMean([1, 2, 3, 4, 5, 6, 7, 8, 9, 100])).toBeCloseTo(5.5);
    expect(quantile([0, 10], 0.9)).toBeCloseTo(9);
  });
  it("레이드가 적으면 판정하지 않음", () => {
    expect(judge("eft", { ...base, n: 10 }, peers, 0.1)).toEqual({ state: "none", reason: "few" });
  });
  it("비교군이 작으면 판정하지 않음", () => {
    expect(judge("eft", base, peers.slice(0, 10), 0.1)).toEqual({ state: "none", reason: "peers" });
  });
  it("비교군 중간이면 특이점 없음", () => {
    expect(judge("eft", { ...base, kills: 400 }, peers, 0.1).state).toBe("clear");
  });
  it("함께 움직이는 지표는 하나로 셈", () => {
    // 사망이 적으면 K/D, 레이드당 킬, 생존율이 같이 오름
    const v = judge("eft", { ...base, kills: 575, deaths: 252, survived: 146 }, peers, 0.1);
    const high = v.state === "none" ? [] : v.metrics.filter((m) => m.level >= 1);
    expect(high.length).toBeGreaterThanOrEqual(2);
    expect(new Set(high.map((m) => m.family))).toEqual(new Set(["combat"]));
    expect(v.state).toBe("warn");
  });
  it("여러 지표가 상위 1%를 넘으면 이상 수치", () => {
    const v = judge("eft", { ...base, kills: 4000, deaths: 40, survived: 360, streak: 60 }, peers, 0.1);
    expect(v.state).toBe("alert");
  });
});

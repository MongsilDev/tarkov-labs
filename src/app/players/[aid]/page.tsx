import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import badges from "@/data/level-badges.json";
import itemsData from "@/data/items.json";
import masteringData from "@/data/mastering.json";
import skillsData from "@/data/skills.json";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import AchievementList, { type AchievementRow } from "@/components/players/AchievementList";
import Actions from "@/components/players/Actions";
import { Remember } from "@/components/players/Recent";
import SearchBox from "@/components/players/SearchBox";
import Verdict from "@/components/players/Verdict";
import { date, dateTime, dec, div, hours, int, pct } from "@/lib/format";
import { arenaModeLabel, memberChips, sideLabel } from "@/lib/labels";
import { MODES, pickMode, tarkovDevUrl } from "@/lib/modes";
import { toSample } from "@/lib/sample";
import { PERK, encodeBuild, type Perk } from "@/lib/kord";
import { ARENA_PASSES, LEAGUE, leagueLabel } from "@/lib/season";
import { achievementInfo, type ArenaSummary, type EftSummary, type Progress, type Summary } from "@/lib/summary";
import { verdict } from "@/server/baseline";
import { isHidden } from "@/server/db";
import { account, displayName, load, nameHistory, snapshots } from "@/server/profiles";
import "./profile.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ aid: string }>; searchParams: Promise<{ mode?: string }> };

function parseAid(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const aid = parseAid((await params).aid);
  if (!aid) return {};
  const acc = account(aid);
  const mode = pickMode(acc?.modes ?? null, (await searchParams).mode);
  const name = acc?.name ?? `#${aid}`;
  const image = { url: `/players/${aid}/og?mode=${mode.key}`, width: 1200, height: 630 };
  return {
    title: `${name} ${mode.label}`,
    description: `${name}의 Escape from Tarkov ${mode.label} 전적`,
    robots: { index: false, follow: true },
    openGraph: { images: [image] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "tile strong" : "tile"}>
      <b className="num">{value}</b>
      <span>{label}</span>
    </div>
  );
}

function EftStats({ s }: { s: EftSummary }) {
  return (
    <>
      <div className="tiles key">
        <Tile strong label="PMC K/D" value={dec(div(s.pmcKills, s.kia))} />
        <Tile strong label="생존율" value={pct(div(s.survived, s.raids))} />
        <Tile strong label="레이드당 PMC 킬" value={dec(div(s.pmcKills, s.raids))} />
        <Tile strong label="최장 연속 생존" value={int(s.streak)} />
      </div>
      <div className="tiles">
        <Tile label="레이드" value={int(s.raids)} />
        <Tile label="생존" value={int(s.survived)} />
        <Tile label="사망" value={int(s.kia)} />
        <Tile label="실종" value={int(s.mia)} />
        <Tile label="도주" value={int(s.runner)} />
        <Tile label="지역 이동" value={int(s.transit)} />
        <Tile label="PMC 킬" value={int(s.pmcKills)} />
        <Tile label="전체 킬" value={int(s.kills)} />
      </div>
    </>
  );
}

function ArenaStats({ s }: { s: ArenaSummary }) {
  const t = s.total;
  if (!t) return <p className="sub">아레나 경기 기록이 없습니다.</p>;
  return (
    <>
      <div className="tiles key">
        <Tile strong label="K/D" value={dec(div(t.kills, t.deaths))} />
        <Tile strong label="헤드샷 비율" value={pct(div(t.headshots, t.kills))} />
        <Tile strong label="한 경기 최다 킬" value={int(t.maxGameKills)} />
        <Tile strong label="최고 연속 킬" value={int(t.killStreak)} />
      </div>
      <div className="tiles">
        <Tile label="경기" value={int(t.games)} />
        <Tile label="승률" value={pct(div(t.wins, t.games), 0)} />
        <Tile label="킬" value={int(t.kills)} />
        <Tile label="사망" value={int(t.deaths)} />
        <Tile label="시간당 킬" value={dec(s.seconds ? t.kills / (s.seconds / 3600) : null, 1)} />
        <Tile label="헤드샷" value={int(t.headshots)} />
        <Tile label="팀킬" value={int(t.teamKills)} />
        <Tile label="매치 MVP" value={int(t.matchMvp)} />
      </div>
      {s.modes.length > 1 && (
        <section className="block">
          <h2 className="h2">모드별</h2>
          <div className="table-scroll panel">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>모드</th>
                  <th>경기</th>
                  <th>승률</th>
                  <th>K/D</th>
                  <th>헤드샷</th>
                  <th>최다 킬</th>
                  <th>연속 킬</th>
                  <th className="opt">팀킬</th>
                </tr>
              </thead>
              <tbody>
                {s.modes.map((m) => (
                  <tr key={m.key}>
                    <td className="nowrap">{arenaModeLabel(m.key)}</td>
                    <td className="num">{int(m.stats.games)}</td>
                    <td className="num">{pct(div(m.stats.wins, m.stats.games), 0)}</td>
                    <td className="num">{dec(div(m.stats.kills, m.stats.deaths))}</td>
                    <td className="num">{pct(div(m.stats.headshots, m.stats.kills), 0)}</td>
                    <td className="num">{int(m.stats.maxGameKills)}</td>
                    <td className="num">{int(m.stats.killStreak)}</td>
                    <td className="num opt">{int(m.stats.teamKills)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Achievements({ s }: { s: Summary }) {
  if (!s.achievements.length) return null;
  const rows: AchievementRow[] = [];
  for (const a of s.achievements) {
    const info = achievementInfo(a.id);
    if (info) rows.push({ id: a.id, at: a.at, name: info.name, description: info.description, icon: info.icon, rarity: info.rarity, percent: info.percent });
  }
  return (
    <section className="block">
      <h2 className="h2">
        업적 <span className="muted num">{s.achievements.length}</span>
      </h2>
      {rows.length > 0 ? <AchievementList rows={rows} /> : <p className="sub">아레나 업적은 공개된 이름 자료가 없어 개수만 표시합니다.</p>}
    </section>
  );
}

const ITEMS = itemsData as Record<string, string>;
const SKILL_NAME = skillsData as Record<string, string>;
const MASTERING = masteringData as Record<string, { weapon: string | null; level2: number; level3: number }>;

const SLOTS: [string, string][] = [
  ["FirstPrimaryWeapon", "주무기"],
  ["SecondPrimaryWeapon", "보조 주무기"],
  ["Holster", "권총"],
  ["Scabbard", "근접 무기"],
  ["Headwear", "머리"],
  ["Earpiece", "헤드셋"],
  ["FaceCover", "얼굴"],
  ["Eyewear", "눈"],
  ["ArmorVest", "방탄복"],
  ["TacticalVest", "전술 조끼"],
  ["Backpack", "배낭"],
  ["SecuredContainer", "보안 컨테이너"],
  ["ArmBand", "완장"],
];

function Gear({ s }: { s: EftSummary }) {
  const rows = SLOTS.map(([slot, label]) => ({ label, tpl: s.gear?.find((g) => g.slot === slot)?.tpl })).filter(
    (r): r is { label: string; tpl: string } => !!r.tpl && !!ITEMS[r.tpl],
  );
  if (!rows.length) return null;
  return (
    <section className="block">
      <h2 className="h2">마지막 장비</h2>
      <p className="sub">tarkov.dev 기록이 갱신된 시점에 캐릭터가 입고 있던 장비입니다.</p>
      <ul className="gear">
        {rows.map((r) => (
          <li key={r.label}>
            <Image src={`/api/icon/${r.tpl}`} alt="" width={44} height={44} unoptimized />
            <span className="gear-text">
              <span className="small muted">{r.label}</span>
              <b className="ellipsis" title={ITEMS[r.tpl]}>
                {ITEMS[r.tpl]}
              </b>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Skills({ s }: { s: EftSummary }) {
  const list = s.skills ?? [];
  if (!list.length) return null;
  const chip = (k: { id: string; level: number }) => (
    <li key={k.id} className={k.level >= 51 ? "elite" : undefined}>
      <Image src={`/img/skill/${k.id}.webp`} alt="" width={28} height={28} unoptimized />
      <span className="ellipsis">{SKILL_NAME[k.id]}</span>
      <b className="num">{k.level >= 51 ? "엘리트" : dec(k.level, 1)}</b>
    </li>
  );
  return (
    <section className="block">
      <h2 className="h2">
        스킬 <span className="muted num">{list.length}</span>
      </h2>
      <ul className="skills">{list.slice(0, 12).map(chip)}</ul>
      {list.length > 12 && (
        <details className="more">
          <summary>나머지 {list.length - 12}개 보기</summary>
          <ul className="skills">{list.slice(12).map(chip)}</ul>
        </details>
      )}
    </section>
  );
}

function Mastery({ s }: { s: EftSummary }) {
  const list = (s.mastery ?? []).filter((m) => MASTERING[m.id]).slice(0, 8);
  if (!list.length) return null;
  return (
    <section className="block">
      <h2 className="h2">무기 숙련</h2>
      <ul className="gear mastery">
        {list.map((m) => {
          const def = MASTERING[m.id];
          // tarkov.dev와 같게 기준값을 넘으면 다음 단계
          const level = m.progress > def.level3 ? 3 : m.progress > def.level2 ? 2 : 1;
          return (
            <li key={m.id}>
              {def.weapon ? <Image src={`/api/icon/${def.weapon}`} alt="" width={44} height={44} unoptimized /> : <span className="gear-blank" />}
              <span className="gear-text">
                <b className="ellipsis">{m.id}</b>
                <span className="small muted num">
                  {level}단계, {int(m.progress)}
                  {level < 3 ? ` / ${int(level === 2 ? def.level3 : def.level2)}` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Scav({ s }: { s: EftSummary }) {
  const v = s.scav;
  if (!v) return null;
  return (
    <section className="block">
      <h2 className="h2">스캐브 레이드</h2>
      <div className="tiles">
        <Tile label="레이드" value={int(v.raids)} />
        <Tile label="생존율" value={pct(div(v.survived, v.raids))} />
        <Tile label="킬" value={int(v.kills)} />
        <Tile label="PMC 킬" value={int(v.pmcKills)} />
      </div>
    </section>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="meter" aria-hidden="true">
      <span style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </span>
  );
}

function ProgressCard({ label, p, note }: { label: string; p: Progress; note: string }) {
  return (
    <div className={p.done >= p.total ? "prog done" : "prog"}>
      <span className="prog-label">{label}</span>
      <b className="num">
        {p.done} <span className="muted">/ {p.total}</span>
      </b>
      <Bar value={p.done} max={p.total} />
      <span className="small muted">{p.done >= p.total ? "모두 받음" : note}</span>
    </div>
  );
}

function SeasonProgress({ s }: { s: EftSummary }) {
  const { league, pass, seasonRewards } = s;
  if (!league && !pass && !seasonRewards) return null;
  return (
    <section className="block">
      <h2 className="h2">KORD BREACH 시즌 진행</h2>
      <div className="progs">
        {league && (
          <div className="prog rank">
            <span className="prog-label">리그 등급</span>
            <b>{leagueLabel(league.rank)}</b>
            <ol className="league" aria-hidden="true">
              {LEAGUE.map((n, i) => (
                <li key={n} className={i + 1 <= league.rank ? "on" : i + 1 <= league.max ? "peak" : undefined} />
              ))}
            </ol>
            <span className="small muted">{league.max > league.rank ? `최고 등급 ${leagueLabel(league.max)}` : "주간 경험치 순위로 결정"}</span>
          </div>
        )}
        {pass && <ProgressCard label="배틀패스" p={pass} note="모든 모드 공통" />}
        {seasonRewards && <ProgressCard label="시즌 퀘스트 보상" p={seasonRewards} note="시즌 퀘스트를 끝내면 받음" />}
      </div>
    </section>
  );
}

// id 앞부분이 생성 시각이라 문자열 비교가 시즌 순서와 같음
const LATEST_ARENA_PASS = Object.keys(ARENA_PASSES).sort().at(-1)!;

function ArenaPasses({ s }: { s: ArenaSummary }) {
  const list = s.passes ?? [];
  if (!list.length) return null;
  return (
    <section className="block">
      <h2 className="h2">배틀패스</h2>
      <ul className="progs">
        {list.map((x, i) => {
          const def = ARENA_PASSES[x.id];
          return (
            <li key={x.id} className={def && x.level >= def.levels ? "prog done" : "prog"}>
              <span className="prog-label">
                {def ? `시즌 ${def.season}` : "새 시즌"}
                {i === 0 && x.id >= LATEST_ARENA_PASS && <span className="chip">진행 중</span>}
              </span>
              <b className="num">
                {x.level}
                {def && <span className="muted"> / {def.levels}</span>}
              </b>
              {def && <Bar value={x.level} max={def.levels} />}
              <span className="small muted num">{def ? `${def.start} 시작` : "단계 수 미확인"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SeasonPerks({ ids }: { ids: string[] }) {
  const picked = ids.map((id) => PERK.get(id)).filter((p): p is Perk => p != null && p.points != null);
  if (!picked.length) return null;
  picked.sort((a, b) => a.points! - b.points!);
  const left = -picked.reduce((a, p) => a + p.points!, 0);
  return (
    <section className="block">
      <div className="block-head">
        <h2 className="h2">
          고른 시즌 특성 <span className="muted num">{picked.length}</span>
        </h2>
        <Link className="link small" href={`/kord-breach?b=${encodeBuild(picked.map((p) => p.id))}`}>
          시뮬레이터에서 열기
        </Link>
      </div>
      <ul className="perks">
        {picked.map((p) => (
          <li key={p.id} className={p.points! < 0 ? "pos" : "neg"} title={p.effects.join("\n")}>
            <span className="perk-icon" style={{ WebkitMaskImage: `url(/kord/perks/${p.id}.png)`, maskImage: `url(/kord/perks/${p.id}.png)` }} aria-hidden="true" />
            <span>{p.name}</span>
            <b className="num">{p.points! > 0 ? `+${p.points}` : p.points}</b>
          </li>
        ))}
      </ul>
      <p className="sub">남은 포인트 {left}</p>
    </section>
  );
}

function Trend({ list }: { list: Summary[] }) {
  if (list.length < 2) return null;
  return (
    <section className="block">
      <h2 className="h2">이 사이트에서 받은 기록</h2>
      <div className="table-scroll panel">
        <table className="grid-table">
          <thead>
            <tr>
              <th>기준 시각</th>
              {list[0].kind === "eft" ? (
                <>
                  <th>레이드</th>
                  <th>PMC K/D</th>
                  <th>생존율</th>
                  <th>PMC 킬</th>
                </>
              ) : (
                <>
                  <th>경기</th>
                  <th>K/D</th>
                  <th>헤드샷</th>
                  <th>킬</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 8).map((s) => (
              <tr key={s.updated}>
                <td className="nowrap num">{dateTime(s.updated)}</td>
                {s.kind === "eft" ? (
                  <>
                    <td className="num">{int(s.raids)}</td>
                    <td className="num">{dec(div(s.pmcKills, s.kia))}</td>
                    <td className="num">{pct(div(s.survived, s.raids))}</td>
                    <td className="num">{int(s.pmcKills)}</td>
                  </>
                ) : (
                  <>
                    <td className="num">{int(s.total?.games)}</td>
                    <td className="num">{dec(div(s.total?.kills, s.total?.deaths))}</td>
                    <td className="num">{pct(div(s.total?.headshots, s.total?.kills), 0)}</td>
                    <td className="num">{int(s.total?.kills)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Hidden() {
  return (
    <>
      <Header crumb={{ href: "/players", label: "계정 조회" }} />
      <main id="main" className="wrap slim">
        <section className="panel nf">
          <h1>표시하지 않는 계정입니다</h1>
          <p className="muted">계정 주인의 요청으로 기록을 지웠습니다.</p>
        </section>
      </main>
      <Footer />
    </>
  );
}

export default async function Profile({ params, searchParams }: Props) {
  const aid = parseAid((await params).aid);
  if (!aid) notFound();
  if (isHidden(aid)) return <Hidden />;
  const acc = account(aid);
  const mode = pickMode(acc?.modes ?? null, (await searchParams).mode);
  const arenaMode = MODES.find((m) => m.key === "arena")!;
  // 아레나 JSON의 등급 값에는 Unheard가 빠져 있어 EFT 기록의 등급을 함께 씀
  const eftMode = mode.key === "arena" && acc ? MODES.filter((m) => m.key !== "arena" && acc.modes[m.key]).sort((a, b) => acc.modes[b.key]! - acc.modes[a.key]!)[0] : undefined;
  const [res, other] = await Promise.all([
    load(mode, aid),
    mode.key !== "arena" && acc?.modes.arena ? load(arenaMode, aid) : eftMode ? load(eftMode, aid) : Promise.resolve(null),
  ]);
  const arena = mode.key !== "arena" ? other : null;
  const s = res.summary;
  const registered = s?.kind === "arena" ? s.registered : arena?.summary?.kind === "arena" ? arena.summary.registered : null;
  const name = displayName(aid, acc, s);
  const history = nameHistory(aid);
  const v = s ? verdict(mode, aid, toSample(s)) : null;
  const chips = s ? memberChips(s.member | (other?.summary?.member ?? 0)) : [];
  const eft = s?.kind === "eft" ? s : null;

  return (
    <>
      <Header crumb={{ href: "/players", label: "계정 조회" }} />
      <main id="main" className="wrap profile">
        <SearchBox compact />
        {name !== `#${aid}` && <Remember aid={aid} name={name} />}

        <section className="panel phead">
          <div className="pname">
            <h1 className="ellipsis" translate="no">{name}</h1>
            {s?.side && <span className="chip">{sideLabel(s.side)}</span>}
            {chips.map((c) => (
              <span key={c.label} className={c.official ? "chip official" : "chip"}>
                {c.label}
              </span>
            ))}
          </div>
          <dl className="pmeta">
            <div>
              <dt>계정 번호</dt>
              <dd className="num">{aid}</dd>
            </div>
            {eft && (
              <div>
                <dt>레벨</dt>
                <dd className="num with-icon">
                  {eft.level && badges[eft.level - 1] ? <Image className="lvl-badge" src={`/img/level/${badges[eft.level - 1]}.png`} alt="" width={22} height={22} unoptimized /> : null}
                  {eft.level ?? "-"}
                </dd>
              </div>
            )}
            {eft?.prestige ? (
              <div>
                <dt>프레스티지</dt>
                <dd className="num with-icon">
                  {eft.prestige <= 6 && <Image src={`/img/prestige/${eft.prestige}.webp`} alt="" width={22} height={22} unoptimized />}
                  {eft.prestige}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>{s?.kind === "arena" ? "아레나 플레이 시간" : "플레이 시간"}</dt>
              <dd className="num">{hours(s?.seconds)}</dd>
            </div>
            {registered && (
              <div>
                <dt>가입일</dt>
                <dd className="num">{date(registered * 1000)}</dd>
              </div>
            )}
            {eft?.lastActive && (
              <div>
                <dt>마지막 활동</dt>
                <dd className="num">{date(eft.lastActive * 1000)}</dd>
              </div>
            )}
            <div>
              <dt>기준 시각</dt>
              <dd className="num">{s ? dateTime(s.updated) : "-"}</dd>
            </div>
          </dl>
          <Actions aid={aid} mode={mode.key} tarkovDev={tarkovDevUrl(mode, aid)} />
          {res.error && <p className="err">tarkov.dev에서 받아오지 못해 {s ? "이전에 받은 기록을 보여줍니다." : "표시할 기록이 없습니다."}</p>}
        </section>

        <nav className="tabs" aria-label="모드">
          {MODES.map((m) => {
            const known = !acc || acc.modes[m.key] != null;
            return (
              <Link key={m.key} href={`/players/${aid}?mode=${m.key}`} aria-current={m.key === mode.key ? "page" : undefined} className={known ? undefined : "faint"} replace>
                {m.label}
              </Link>
            );
          })}
        </nav>

        {!s && !res.error && (
          <section className="panel empty">
            <p>tarkov.dev에서 이 계정의 {mode.label} 기록을 아직 조회한 적이 없습니다.</p>
            <p className="sub">tarkov.dev에서 한 번 열면 기록이 생깁니다. 열고 돌아오면 자동으로 다시 불러옵니다.</p>
          </section>
        )}

        {s && (
          <>
            {v && <Verdict v={v} mode={mode.key} official={chips.some((c) => c.official)} />}
            {s.kind === "eft" ? <EftStats s={s} /> : <ArenaStats s={s} />}
            {eft && <SeasonProgress s={eft} />}
            {s.kind === "arena" && <ArenaPasses s={s} />}
            {eft?.perks?.length ? <SeasonPerks ids={eft.perks} /> : null}
            {eft && <Scav s={eft} />}
            {eft && <Gear s={eft} />}
            {eft && <Skills s={eft} />}
            {eft && <Mastery s={eft} />}
            <Achievements s={s} />
          </>
        )}

        {history.length > 0 && (
          <section className="block">
            <h2 className="h2">닉네임 변경</h2>
            <div className="table-scroll panel">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>이전</th>
                    <th>이후</th>
                    <th>확인한 날</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={`${h.at}-${h.old}`}>
                      <td translate="no">{h.old}</td>
                      <td translate="no">{h.next}</td>
                      <td className="num nowrap">{date(h.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {s && <Trend list={snapshots(aid, mode.key)} />}
      </main>
      <Footer />
    </>
  );
}

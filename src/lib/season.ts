// 리그 등급 이름은 게임 한국어 데이터의 등급 보상 부조 이름과 리그 업적 문구에서 가져옴
export const LEAGUE = ["신참", "생존자", "베테랑", "루스리스", "리본", "어센디드", "지휘관"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

export const leagueLabel = (rank: number) => (LEAGUE[rank - 1] ? `${LEAGUE[rank - 1]} ${ROMAN[rank - 1]}` : `${rank}등급`);

// 아레나 배틀패스 id별 시즌 번호와 단계 수. 시작일은 Escape from Tarkov 위키 기준
export const ARENA_PASSES: Record<string, { season: number; levels: number; start: string }> = {
  "67b8ac64cfb91e762e03ef32": { season: 0, levels: 150, start: "2025.04.09" },
  "68c7f09ef2c815c21c0ab1fc": { season: 1, levels: 120, start: "2025.10.22" },
  "69cd05d6ddad8594db0700ca": { season: 2, levels: 100, start: "2026.04.20" },
  "6a7ef35bf1520fccd107be5d": { season: 3, levels: 100, start: "2026.09.18" },
};

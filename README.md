# Tarkov Labs

Escape from Tarkov 도구를 모아 둔 사이트입니다. 계정 전적 조회와 KORD BREACH 특성 시뮬레이터가 있습니다. [tarkov.mongsil.dev](https://tarkov.mongsil.dev)에서 쓸 수 있습니다.

## 기능

### 계정 조회

- 닉네임 앞부분이나 계정 번호로 찾습니다. tarkov.dev에서 한 번 이상 조회된 계정만 찾을 수 있습니다.
- 시즌, PvP, PvE, 아레나 전적을 탭으로 나눠 보여 줍니다. 아레나는 헤드샷 비율, 한 경기 최다 킬, 최고 연속 킬, 모드별 기록까지 나옵니다.
- EFT 모드에는 스캐브 레이드 전적, 스킬 레벨, 무기 숙련, 기록이 갱신될 때 입고 있던 장비도 나옵니다. 시즌 모드에서는 그 계정이 고른 Kord Breach 특성을 보여 주고, 같은 조합을 특성 시뮬레이터에서 열 수 있습니다.
- 시즌 모드에서는 리그 등급과 최고 등급이 나오고, EFT 모드에서는 Kord Breach 배틀패스와 시즌 퀘스트 보상을 얼마나 받았는지 보여 줍니다. 아레나에서는 배틀패스 시즌별 단계가 나옵니다.
- 판정 배지는 플레이 시간과 레이드 수가 비슷한 계정들 사이에서 PMC K/D, 생존율 같은 지표가 어디쯤인지 보여 줍니다. 통계 기준이며 부정행위의 증거가 아닙니다. 계산 방식은 사이트의 판정 기준 페이지에 있습니다.
- 닉네임 변경과 이 사이트에서 받은 전적 기록이 쌓입니다.
- 기록이 오래됐으면 tarkov.dev에서 그 계정을 열고 돌아오면 됩니다. 탭으로 돌아오면 자동으로 다시 불러옵니다.

### KORD BREACH 특성 시뮬레이터

시즌 1 Kord Breach 특성으로 빌드를 짜 봅니다. 긍정 특성은 포인트를 쓰고 부정 특성은 포인트를 얻으며, 남은 포인트가 0 아래로 내려가면 부족하다고 표시합니다. 게임에서 함께 고를 수 없는 특성은 고를 수 없고, 어떤 특성 때문인지 카드에 나옵니다. 고른 빌드는 주소에 담겨 그대로 공유할 수 있습니다.

### 계정 조회 화면의 최근 본 계정

프로필을 열면 그 브라우저에만 최근 본 계정 8개가 남습니다. 서버로 보내지 않습니다.

## 실행

Node 24 이상과 pnpm이 필요합니다.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

처음 띄우면 tarkov.dev에서 이름 목록 약 300만 건을 받아 SQLite에 넣습니다. 1분 정도 걸리고 DB는 약 250MB입니다. 받지 않으려면 `JOBS=0`으로 띄웁니다.

```bash
pnpm test    # 프로필 파서와 판정 계산 테스트
pnpm test:ui # 빌드한 서버를 픽스처 데이터로 띄워 화면별 가로 넘침, 빠진 스타일, 콘솔 오류 점검
pnpm lint
pnpm build
```

## 설정

| 키 | 설명 |
|---|---|
| `BASE_URL` | 사이트 주소. 요청 출처 검사와 sitemap에 씁니다 |
| `DATA_DIR` | SQLite 파일을 둘 폴더. 기본값은 `./data` |
| `PLAYERS_BASE` | 프로필 JSON을 받을 주소. 기본값은 `https://players.tarkov.dev` |
| `JOBS` | `0`이면 이름 목록 적재와 비교군 수집을 하지 않습니다 |
| `SENTRY_DSN` | 서버 오류를 보낼 Sentry DSN. 비우면 보내지 않습니다 |

## 데이터

- 전적은 [tarkov.dev](https://tarkov.dev)가 공개하는 `players.tarkov.dev` JSON에서 받습니다. 이름 목록은 하루 한 번, 판정 비교군은 최근 30일 안에 갱신된 계정을 초당 1건씩 받습니다. Battlestate Games 서버에는 접속하지 않습니다.
- `src/data/levels.json`, `src/data/achievements.json`, `src/data/season.json`은 tarkov.dev JSON API의 레벨 표, 업적, 시즌 특성입니다. 특성의 이름, 효과, 포인트, 함께 고를 수 없는 관계는 게임 데이터의 한국어 번역 그대로입니다. `pnpm refdata`로 다시 만들고, 이때 특성 아이콘은 `public/kord/perks`에, 업적, 스킬 아이콘과 레벨, 프레스티지 배지는 `public/img`에 받습니다. 장비와 무기 아이콘은 종류가 많아 화면에서 처음 쓰일 때 서버가 받아 데이터 폴더의 `icons`에 둡니다. 아이콘을 줄이는 데 macOS `sips`를 씁니다.
- 리그 등급 이름과 아레나 배틀패스 시즌별 단계 수는 `src/lib/season.ts`에 직접 적었습니다. 등급 이름은 게임 한국어 데이터의 등급 보상 부조 이름과 리그 업적 문구에서, 단계 수와 시작일은 [Escape from Tarkov 위키](https://escapefromtarkov.fandom.com/wiki/Arena_BattlePass)에서 가져왔습니다. 새 아레나 시즌이 열리면 이 표에 추가합니다.
- `test/fixtures`는 실제 프로필 세 개에서 장비와 아이템을 빼고 닉네임과 계정 번호를 바꾼 것입니다.
- 계정 주인이 삭제를 요청하면 `node scripts/hide.mjs <계정 번호>`로 기록을 지우고 이후 표시하지 않습니다.
- 글꼴은 [Pretendard](https://github.com/orioncactus/pretendard)이며 SIL Open Font License를 따릅니다.

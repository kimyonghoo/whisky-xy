# Route W

위스키 성지 네비게이션, Route W

신뢰할 수 있는 리테일러의 위스키 **가격과 재고**를 세금 포함 기준으로 정렬해 보여주는 시세 서비스입니다. 같은 병끼리 묶어 도시별로 비교하고, 한국 가격(데일리샷)과 견줘 얼마나 유리한지 보여주며, 위스키를 모르는 사람도 매장에서 헷갈리지 않는 **구매 카드 링크**와 관심 병 **텔레그램 알림**을 제공합니다. 상용 서비스로 키울 예정이라 화면은 딥 블랙과 골드 포인트의 다크 테마이며, UI는 [`docs/design-system.md`](docs/design-system.md)를 따릅니다.

설계 배경은 [`docs/superpowers/specs/2026-10-11-whisky-index-rebrand-design.md`](docs/superpowers/specs/2026-10-11-whisky-index-rebrand-design.md)(리브랜드·도시·다국어)와 [`docs/superpowers/specs/2026-10-10-whisky-portal-design.md`](docs/superpowers/specs/2026-10-10-whisky-portal-design.md)(기존 포털), 배포 절차는 [`docs/SETUP.md`](docs/SETUP.md)에 있습니다.

## 언어

한국어(기본)와 영어를 지원합니다. 주소는 언어별로 `/ko/...`, `/en/...`입니다. 언어 없이 들어온 주소(`/`, `/card/123` 등)는 전에 고른 언어(`wi_lang` 쿠키)로, 없으면 한국어로 이동합니다(브라우저 언어는 보지 않습니다). 헤더의 `KO / EN`은 같은 페이지의 다른 언어로 이동합니다. 모든 문구는 `src/lib/i18n/ko.ts`, `src/lib/i18n/en.ts`에 있고, 두 사전의 키가 어긋나면 테스트가 실패합니다.

## 기술 스택

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui(Base UI)
- DB: Postgres (Supabase 풀러) + Drizzle ORM. 로컬에서는 PGlite(파일 DB)라서 DB 설치가 필요 없음
- 크롤러/알림: Node 스크립트(`scripts/crawl.ts`), GitHub Actions로 6시간마다 실행, 텔레그램 Bot API
- 지도: Leaflet + react-leaflet
- 테스트: Vitest

## 도시와 매장

헤더의 도시 선택(국가 → 도시)으로 고른 도시의 결과가 맨 위에, 같은 나라의 다른 도시는 그 아래에 도시별로 접혀(판매 매장 수와 최저가 표시) 나옵니다. 선택은 `wi_city` 쿠키와 `?city=`에 저장됩니다. 기본 도시는 브루클린입니다.

| 국가 | 도시 (ID) | 상태 |
|---|---|---|
| 미국 | 브루클린 (`brooklyn`), 뉴저지 (`nj`), 로스앤젤레스 (`la`) | 운영 |
| 일본 | 도쿄 (`tokyo`), 오사카 (`osaka`), 삿포로 (`sapporo`) | 준비 중 |
| 대만 | 타이베이 (`taipei`) | 준비 중 |

준비 중인 도시를 고르면 빈 결과 대신 오픈 예정 안내가 나오고, 기본 도시로 저장되지 않습니다. 도시를 여는 방법은 매장 데이터에 `city`를 지정하고 도시 상태를 `live`로 바꾸는 것뿐입니다(`src/lib/geo.ts`, `src/lib/stores.ts`).

모두 Shopify 공개 엔드포인트(`/products.json`, `/products/<handle>.js`, `/cart.js`)만 사용합니다. 봇 차단을 우회하지 않습니다.

| 도시 | 매장 |
|---|---|
| 브루클린 | De Wine Spot, The Liquor Store, Grain & Vine, Slope Cellars |
| 뉴저지 | Liquor Cave, Wine Chateau, CoolVines |
| 로스앤젤레스 | Flask Fine Wine & Whisky, Bitters & Bottles (온라인 주문 전용) |

매장 설정(도시, 주소, 좌표, 전화, 세율, 재고 신뢰도)은 `src/lib/stores.ts`에 있습니다. 한국 가격은 데일리샷(`/m/search/result`, `/m/item/<id>`만 사용)에서 가져옵니다.

## 화면

모든 경로는 `/ko`, `/en` 아래에 있습니다(예: `/en/map`).

| 경로 | 내용 |
|---|---|
| `/` | 홈과 병 검색. 같은 병끼리 묶어 가격·재고·확인 시각 표시. 선택한 도시가 먼저, 같은 나라의 다른 도시는 접힌 섹션. 연결된 병에는 한국 가격 비교 칩 |
| `/card/[id]` | 구매 카드. 지금 다시 확인, 전화, 길찾기, 점원에게 보여주기 모드(영어), 카톡 미리보기 OG |
| `/watchlist` | 관심 목록(관리자 키 필요) |
| `/map` | 매장 지도. `?bottle=<key>`로 그 병이 있는 매장만 표시 |
| `/link-kr` | 미국 병과 데일리샷 상품 연결(관리자 키 필요) |
| `/compare` | 한국 대비 순위(막대 비교, 미국 전체 최저가 기준) |

## 로컬 개발

```bash
npm install
cp .env.example .env.local   # 필요한 값만 채우기. 전부 비워도 동작
npm run crawl                # 매장 크롤링 + 환율 + 한국 가격 갱신
npm run dev                  # http://localhost:3000 → /ko
```

`DATABASE_URL`을 비워 두면 `.data/pglite`에 로컬 DB가 만들어지므로 별도 DB가 필요 없습니다. `CRAWL_ONLY=dewinespot,flask npm run crawl`처럼 특정 매장만 돌릴 수도 있습니다. 텔레그램 값이 없으면 알림은 콘솔에 출력됩니다.

**로컬 DB(PGlite) 주의:** `.data/pglite`는 한 번에 **한 프로세스만** 열 수 있습니다. 두 프로세스(예: `npm run dev`가 켜진 상태에서 `npm run crawl`, 또는 `next dev`와 `next start` 동시 실행)가 같은 폴더에 쓰면 DB가 깨집니다("could not locate a valid checkpoint record"). 이제는 `.data/pglite.lock`으로 두 번째 프로세스가 열지 못하게 막고 이유를 알려 줍니다. 크롤 전에 dev 서버를 **Ctrl+C**로 끄고, `node.exe`를 작업 관리자로 강제 종료하지 마세요. 그래도 깨졌다면 `.data/pglite`를 다른 이름으로 옮기고(삭제 대신) `npm run crawl`로 새로 채우세요.

**병 묶음 키를 바꾼 뒤(`npm run rekey`):** `bottleKey()` 규칙이 바뀌면 기존 행의 `bottle_key`와 한국 가격 연결이 옛 키에 남습니다. `npm run rekey`는 모든 행의 키를 제목에서 다시 계산하고, `kr_links`를 새 키로 옮깁니다. 두 연결이 같은 새 키로 합쳐지면 **가장 최근에 확인한 연결을 남기고** 나머지는 지운 뒤 로그에 남깁니다(데일리샷 상품 ID 포함). 키가 바뀌면 예전에 공유한 `/map?bottle=` 링크는 열리지 않을 수 있습니다. 배포 DB에서는 crawl 워크플로가 크롤링 직전에 매번 자동으로 실행합니다(크롤링이 먼저 돌면 옛 키가 사라져 연결이 고아가 되므로 순서가 중요합니다).

| 명령 | 설명 |
|---|---|
| `npm run dev` / `build` / `start` | Next.js 개발 / 빌드 / 실행 |
| `npm run crawl` | 크롤러 1회 실행 |
| `npm run rekey` | 병 묶음 키(`bottle_key`)를 현재 규칙으로 다시 계산하고 한국 가격 연결(`kr_links`)을 새 키로 옮김. 여러 번 실행해도 결과가 같음(아래 참고) |
| `npm test` | Vitest |
| `npm run lint` | ESLint |
| `npm run db:generate` / `db:migrate` | Drizzle 마이그레이션 생성 / 적용 (`DATABASE_URL` 필요) |

## 환경 변수

`.env.example`의 모든 변수입니다. 비밀 값은 커밋하지 말고 `.env.local`, Vercel, GitHub Secrets에만 넣으세요.

| 변수 | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | 배포 시 필수 | Supabase **Transaction pooler**(포트 6543) 연결 문자열. 비우면 로컬 PGlite 사용 |
| `TELEGRAM_BOT_TOKEN` | 알림 사용 시 | @BotFather가 발급한 봇 토큰 |
| `TELEGRAM_CHAT_IDS` | 알림 사용 시 | 알림을 받을 채팅 ID, 쉼표로 구분 |
| `SITE_URL` | 권장 | 공개 사이트 주소. 알림의 카드 링크와 크롤러 User-Agent에 사용 |
| `ADMIN_KEY` | 관리 화면 사용 시 | `/watchlist`, `/link-kr` 보호용 비밀 키. **32자 이상** 무작위 문자열(아래 참고). 비어 있거나 32자 미만이면 관리 화면은 열리지 않음(서버 로그에 경고). 쿠키에는 키가 아니라 서명된 30일 세션만 저장됨 |
| `NEXT_PUBLIC_MAP_TILE_URL` | 공개 출시 전 필수 | 지도 타일 URL(`https://.../{z}/{x}/{y}...` 형식). 비우면 OpenStreetMap 공개 타일(다크 테마에 맞게 CSS로 반전해 표시) |
| `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` | 타일 URL 설정 시 | 위 타일 제공자가 요구하는 출처 표기(일반 텍스트) |

`ADMIN_KEY` 생성 예:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**지도 타일 주의:** OpenStreetMap 공개 타일은 개발과 소규모 사용만 허용하며, 상용 서비스나 많은 트래픽에는 쓸 수 없습니다(OSM 타일 사용 정책). 공개 출시 전에 상용 타일 제공자를 정해 `NEXT_PUBLIC_MAP_TILE_URL`과 `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION`을 설정하세요. 두 값은 `NEXT_PUBLIC_` 접두사라 **빌드 시점에 코드에 들어가므로**, 값을 바꾸면 Vercel에서 다시 배포해야 합니다.

## 배포

[`docs/SETUP.md`](docs/SETUP.md)를 따라 Supabase, 텔레그램 봇, GitHub Actions, Vercel을 차례로 설정합니다.

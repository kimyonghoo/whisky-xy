# 배포 가이드 (직접 해야 하는 일)

이 문서의 단계는 계정과 비밀 값이 필요해서 **본인이 직접** 해야 합니다. 값은 절대 코드나 문서에 적지 말고, 아래 안내된 곳(Vercel, GitHub Secrets)에만 넣으세요. 전체 환경 변수 설명은 [README](../README.md#환경-변수)에 있습니다.

준비물: GitHub 계정, Supabase 계정, Vercel 계정, 텔레그램 앱.

## 1. Supabase 프로젝트 만들기 (DATABASE_URL)

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다. 데이터베이스 비밀번호는 따로 안전하게 보관하세요.
2. 프로젝트 화면 위쪽 **Connect**를 엽니다.
3. **Transaction pooler** 연결 문자열을 복사합니다. 포트가 **6543**인 주소입니다.
   - 형식: `postgresql://postgres.<프로젝트ref>:<비밀번호>@<리전>.pooler.supabase.com:6543/postgres`
   - `<비밀번호>` 자리에 1번의 데이터베이스 비밀번호를 넣습니다.
4. 이 문자열이 `DATABASE_URL`입니다. 4단계(GitHub)와 5단계(Vercel)에서 씁니다.

테이블은 3단계의 crawl 워크플로가 실행 전에 `npm run db:migrate`로 자동 생성합니다. 따로 만들 필요가 없습니다.

## 2. 텔레그램 봇 만들기 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS)

1. 텔레그램에서 **@BotFather**와 대화를 시작하고 `/newbot`을 보냅니다. 안내에 따라 이름과 사용자명을 정하면 토큰을 줍니다. 이것이 `TELEGRAM_BOT_TOKEN`입니다.
2. 방금 만든 봇을 검색해서 열고, 아무 메시지(예: `hi`)를 보냅니다. 먼저 말을 걸어야 봇이 메시지를 보낼 수 있습니다.
3. 브라우저에서 아래 주소를 엽니다(`<token>`은 1번 토큰으로 바꿉니다).

   `https://api.telegram.org/bot<token>/getUpdates`

4. 결과 JSON에서 `"chat":{"id": 123456789, ...}`의 숫자가 채팅 ID입니다. 이것이 `TELEGRAM_CHAT_IDS`입니다.
5. 누나 등 여러 명에게 보내려면 각자 봇에 메시지를 보낸 뒤 ID를 쉼표로 이어 붙입니다. 예: `123456789,987654321`
6. 결과가 비어 있으면 2번을 다시 하고 새로고침하세요.

토큰은 비밀입니다. 채팅방이나 문서에 붙여넣지 마세요.

## 3. GitHub 저장소와 크롤러

1. GitHub에서 새 저장소를 만들고 이 코드를 push합니다. 비밀 값이 든 `.env.local`은 `.gitignore`에 있어 올라가지 않습니다.
2. 저장소 **Settings → Secrets and variables → Actions → New repository secret**에서 아래 4개를 추가합니다.

   | Secret 이름 | 값 |
   |---|---|
   | `DATABASE_URL` | 1단계 Transaction pooler 문자열 |
   | `TELEGRAM_BOT_TOKEN` | 2단계 봇 토큰 |
   | `TELEGRAM_CHAT_IDS` | 2단계 채팅 ID(쉼표 구분) |
   | `SITE_URL` | 배포 후 사이트 주소(예: `https://내프로젝트.vercel.app`). 5단계 후에 알 수 있으니 우선 임시 값을 넣고 나중에 수정해도 됩니다 |

3. **Actions** 탭에서 **crawl** 워크플로를 선택하고 **Run workflow**로 한 번 수동 실행합니다. 초록색으로 끝나면 DB에 데이터가 들어간 것입니다. 이후에는 6시간마다 자동 실행됩니다.
4. 일부 매장이 `ok:false`로 나올 수 있습니다(사이트 점검, 통화 확인 실패 등). 그 매장은 건너뛰고 기존 데이터를 유지하므로 정상 동작입니다.

## 4. ADMIN_KEY 만들기

`/watchlist`(관심 목록)와 `/link-kr`(한국 가격 연결)을 보호하는 비밀 키입니다. 추측할 수 없도록 **긴 무작위 문자열**로 만드세요. 터미널에서:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

출력된 문자열을 `ADMIN_KEY`로 씁니다. 짧은 단어나 생일 같은 값은 쓰지 마세요. 비밀번호 관리자에 따로 저장해 두세요. **32자 이상**이어야 합니다. 더 짧으면 관리 화면이 꺼지고 서버 로그에 이유가 남습니다. 관리 화면에서 이 키를 입력하면 그 기기에 키 자체가 아니라 **서명된 로그인 정보**가 저장되고 30일 동안 유지됩니다. 키를 바꾸면(Vercel 환경 변수 수정 후 재배포) 모든 기기의 로그인이 풀립니다. 틀린 키를 입력하면 매번 잠깐 기다려야 해서 추측 공격이 사실상 불가능합니다.

## 5. Vercel에 배포하기

1. [vercel.com](https://vercel.com)에서 **Add New → Project**로 3단계의 GitHub 저장소를 import합니다(Framework는 Next.js로 자동 인식).
2. **Environment Variables**에 아래를 입력합니다.

   | 이름 | 값 |
   |---|---|
   | `DATABASE_URL` | 1단계 Transaction pooler 문자열 |
   | `SITE_URL` | 이 프로젝트의 Vercel 주소 (예: `https://내프로젝트.vercel.app`) |
   | `ADMIN_KEY` | 4단계에서 만든 긴 무작위 문자열 |
   | `NEXT_PUBLIC_MAP_TILE_URL` | (공개 출시 전 필수, 아래 6단계) |
   | `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` | (위와 함께) |

3. **Deploy**를 누릅니다. 배포 주소가 정해지면 3단계 GitHub Secret `SITE_URL`도 같은 값으로 수정합니다.
4. 배포된 사이트에서 `/`, `/map`, `/compare`가 열리는지 확인합니다.
5. 한국 가격 비교를 쓰려면 `/link-kr`에서 `ADMIN_KEY`를 입력하고, 미국 병과 데일리샷 상품을 연결합니다. 연결 후에는 크롤링할 때마다 한국 최저가가 갱신됩니다.

## 6. 공개 출시 전: 지도 타일 교체

`NEXT_PUBLIC_MAP_TILE_URL`을 비우면 OpenStreetMap 공개 타일을 씁니다. 이 타일은 **개발과 소규모 사용만 허용**하며, 상용 서비스나 많은 트래픽에는 쓸 수 없습니다(OSM 타일 사용 정책). 사이트를 일반에 공개하거나 상용으로 운영하기 전에:

1. 상용 타일 제공자(예: MapTiler, Stadia Maps, Mapbox 등)에 가입하고 API 키를 받습니다.
2. 제공자 문서에서 래스터 타일 URL을 확인합니다. `{z}/{x}/{y}` 자리표시자가 들어간 https 주소이고, 키는 URL에 포함됩니다.
3. Vercel 환경 변수에 `NEXT_PUBLIC_MAP_TILE_URL`(타일 URL)과 `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION`(제공자가 요구하는 출처 문구, 일반 텍스트)을 설정합니다.
4. **다시 배포합니다.** `NEXT_PUBLIC_` 값은 빌드 시점에 코드에 들어가므로 재배포 전에는 바뀌지 않습니다.
5. 이 키는 브라우저에 노출됩니다. 제공자 대시보드에서 허용 도메인(리퍼러)을 사이트 주소로 제한하세요.

## 7. 공개 출시 전: 요청 제한(WAF)

카드 페이지(`/card/<id>`)를 열거나 "다시 확인"(`POST /api/recheck/<id>`)을 누르면 서버가 매장 사이트에 실시간 확인 요청을 보냅니다. 누군가 카드 주소를 대량으로 열면 매장이 우리 봇(`WhiskyPortalBot`)을 차단할 수 있고, 그러면 크롤링도 멈춥니다.

코드에는 이미 두 가지 방어가 있습니다.
- **매장별 실시간 확인 예산**(DB 공유): 매장마다 최대 6회까지 연속, 이후 6초마다 1회만 매장에 요청합니다. 예산이 바닥나면 매장에 요청하지 않고 저장된 정보를 보여 줍니다("매장 확인 요청이 많아…").
- **다른 사이트에서 보낸 POST 거부**: `Origin`/`Sec-Fetch-Site`가 우리 사이트가 아니면 403.

공개 출시 전에는 IP별 제한도 **직접** 걸어 주세요(한 사람이 예산을 다 써서 누나가 확인을 못 하는 일을 막기 위해).

1. Vercel 프로젝트 → **Firewall** → **Configure** → **New Rule**.
2. 조건: Request Path **starts with** `/api/recheck/` → 동작 **Rate Limit**, 예: IP당 **10 요청 / 60초**, 초과 시 429.
3. 같은 방식으로 `/card/`에 IP당 **30 요청 / 60초** 규칙을 하나 더 만듭니다.
4. `/watchlist`, `/link-kr`(관리자 로그인)에도 IP당 **10 요청 / 60초** 규칙을 권장합니다.
5. 플랜에 Rate Limit 규칙이 없으면 Upstash Ratelimit 같은 미들웨어로 같은 제한을 걸어야 합니다(코드 작업 필요).

## 문제가 생기면

- **crawl이 실패:** Actions 로그에서 어느 단계인지 확인합니다. `db:migrate` 실패는 보통 `DATABASE_URL`(비밀번호, 포트 6543) 문제입니다.
- **텔레그램 알림이 안 옴:** 봇에 먼저 메시지를 보냈는지, `TELEGRAM_CHAT_IDS`가 맞는지 확인합니다.
- **사이트에 데이터가 없음:** crawl 워크플로를 한 번 수동 실행했는지, Vercel의 `DATABASE_URL`이 Actions와 같은 값인지 확인합니다.
- **지도가 회색/빈 타일:** 타일 URL과 키, 허용 도메인을 확인하고 재배포했는지 확인합니다.

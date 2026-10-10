# 🥃 US Whiskey Explorer (가칭)

## 📌 프로젝트 개요
미국 내 주요 주류 판매점(Total Wine, BevMo 등)의 웹 데이터를 크롤링하여, **위스키 가격, 재고, 판매처 위치(X/Y 좌표)** 를 인터랙티브 지도 위에 직관적으로 제공하는 Next.js 기반 포털 서비스입니다.

## 🛠 기술 스택 (Tech Stack)
- **Frontend/Backend:** Next.js (App Router), React, TypeScript
- **Styling:** Tailwind CSS, shadcn/ui
- **Map UI:** Mapbox GL JS 또는 Google Maps API (React-map-gl)
- **Data Crawling:** Puppeteer, Cheerio (Node.js 기반 크롤러) 또는 Python(BeautifulSoup/Selenium) 마이크로서비스
- **Database:** Supabase (PostgreSQL + PostGIS 공간 데이터 처리) 또는 MongoDB

## ✨ 핵심 기능 (Core Features)

### 1. 🗺️ 인터랙티브 위스키 맵 (Whiskey Map)
- 미국 전역의 위스키 판매점 위치를 마커(좌표)로 표시.
- 지도 확대/축소(Zoom) 및 드래그(Pan) 기능.
- 지역별(State/City) 클러스터링 기능 (마커가 많을 경우 그룹화).

### 2. 📊 상세 재고 목록 뷰 (Detail & Inventory List)
- 지도에서 특정 마커(판매점)를 클릭하면, 화면 측면(Sidebar)이나 하단에 해당 매장의 위스키 정보 노출.
- **표시 정보:** 위스키 이름, 가격($), 재고 상태(In Stock / Low Stock / Out of Stock), 용량(750ml 등).
- 가격순, 이름순 정렬 및 검색 필터 기능.

### 3. 🤖 자동화된 크롤링 파이프라인
- 타겟 웹사이트의 공개된 HTML 데이터를 주기적으로 스크래핑.
- Vercel Cron Jobs 또는 AWS EventBridge를 활용해 매일/매주 데이터 최신화.

## 🗄️ 데이터베이스 스키마 설계 (예시)

**1. `stores` (판매점 테이블)**
- `id` (UUID)
- `name` (String) - 매장명 (예: Total Wine Brooklyn)
- `lat` (Float) - 위도 (Y 좌표)
- `lng` (Float) - 경도 (X 좌표)
- `state` (String) - 주 (예: NY, CA)

**2. `whiskey_inventory` (재고 테이블)**
- `id` (UUID)
- `store_id` (Foreign Key)
- `brand` (String) - 브랜드 (예: Macallan, Buffalo Trace)
- `name` (String) - 상세 제품명 (예: Blanton's Single Barrel)
- `price` (Float) - 가격
- `in_stock` (Boolean) - 재고 여부
- `last_updated` (Timestamp) - 크롤링 최신화 시간

## 🚀 향후 확장 계획 (Next Steps)
1. **유저 알림 기능:** 특정 희귀 위스키(예: Pappy Van Winkle) 입고 시 이메일/푸시 알림.
2. **가격 추이 차트:** 시간에 따른 위스키 가격 변동 그래프 제공.
3. **사용자 리뷰/평점:** 판매점 또는 특정 병에 대한 유저 커뮤니티 기능.
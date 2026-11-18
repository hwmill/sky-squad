# CLAUDE.md — sky-squad

## 프로젝트 개요
- 최대 4명이 각자 안드로이드 폰으로 함께 하는 협동 비행기 슈팅 웹게임(PWA)
- 초대 링크로 친구를 맺고, 게임방에 친구를 초대해 2P~4P로 플레이
- 사용자: 개발자 본인, 가족(초등학생 자녀 포함), 아는 사람. 앱 스토어 배포 없음
- 상세 설계: `SPEC.md` (규칙, API, 단계별 완료 기준은 모두 SPEC.md를 따른다)
- 2차 설계: `SPEC-v2.md` (6~10단계. 캐릭터 그림은 `web/js/game/sprites.js`, 미리보기 `?preview=chars`)
- GitHub: `hwmill/sky-squad` → 화면 주소 `https://hwmill.github.io/sky-squad/`

## 기술 스택
| 구분 | 내용 |
|---|---|
| 화면 | 순수 JavaScript(ES 모듈), Canvas 2D, PWA(manifest + service worker). 빌드 도구·프레임워크 없음 |
| 서버 | Cloudflare Workers + Durable Objects(SQLite 방식, 무료 플랜), wrangler |
| 배포 | 화면: GitHub Actions → GitHub Pages (`web/`) / 서버: Workers Builds (`server/`, 빌드 명령 `npm test` 통과해야 배포, 빌드 감시 경로 `server/*`만 → 다른 폴더만 바뀌면 서버 빌드 안 함). 서버 코드를 바꾸면 `SERVER_VERSION`을 올린다 |
| 테스트 | `node --test tests/` (게임 규칙), `server/test/` (API) |
| 개발 PC | Windows, VS Code, Node.js LTS, Python(로컬 정적 서버용) |

## 디렉터리
- `web/` 공개 화면. `js/game/` 게임 계산·그리기, `js/net/` 통신, `js/ui/` 화면 전환
- `server/` Worker. `src/index.js` 입구, `src/lobby.js` 친구·접속, `src/room.js` 게임방 중계
- `tests/` 게임 규칙 단위 테스트

## 실행·테스트 명령
```
# 화면 로컬 실행
cd web && python -m http.server 8080

# 서버 로컬 실행
cd server && npx wrangler dev

# 테스트 (Node 24는 폴더 이름만 주면 파일을 못 찾으므로 파일 패턴으로)
node --test tests/*.test.js      # 또는 npm test
cd server && npm test

# 앱 아이콘 다시 만들기 (web/icons/)
python tools/make_icons.py
```
- 서버 테스트는 `@cloudflare/vitest-plugin` + vitest (실제 workerd 안에서 실행, `exports.default.fetch`로 호출). Windows는 최신 VC++ 재배포 패키지 필요
- DO 선언은 wrangler.jsonc의 `exports`(storage: "sqlite") 방식. `migrations`와 같이 쓸 수 없음
- 개발 모드: `?debug=1` FPS 표시, `?debug=1&boss=1` 보스 직전부터 시작, 콘솔에서 `window.__world`로 상태 확인
- `web/` 파일을 바꿔 배포할 때는 `web/sw.js`의 `CACHE_VERSION`을 올리고, 새 파일은 `ASSETS` 목록에 추가한다 (안 하면 폰이 옛 파일을 계속 씀)

## 반드시 지킬 규칙
1. 비밀값(토큰, 키)을 코드·커밋·로그·채팅에 넣지 않는다. 서버 비밀값이 생기면 `wrangler secret`, 로컬은 `.dev.vars`(gitignore)를 쓴다.
2. 사용자 토큰은 URL에 넣지 않는다. REST는 Authorization 헤더, WebSocket은 첫 메시지로 보낸다. 서버에는 해시만 저장한다.
3. 실명, 전화번호, 위치, 연락처 등 개인정보를 받지 않는다. 닉네임(1~8자)만 쓴다. 채팅 기능을 만들지 않는다.
4. 결제, 광고, 외부 추적 스크립트를 넣지 않는다. AI API를 호출하지 않는다.
5. 기존 상용 게임의 캐릭터·그림·음악을 쓰거나 흉내 내지 않는다. 그림은 코드로 그리고 소리는 WebAudio로 합성한다.
6. 게임 규칙 숫자는 `web/js/game/rules.js` 상수로만 관리한다. 코드 곳곳에 숫자를 직접 쓰지 않는다.
7. 게임 계산(업데이트)과 그리기(렌더)를 분리한다. 계산 함수는 Node에서 테스트할 수 있어야 한다.
8. 무료 한도를 지킨다. 스냅샷은 초당 15회, 입력은 초당 10회를 넘기지 않는다. 메시지 빈도를 늘리는 변경은 사용자 승인 후에 한다.
9. 모든 네트워크 호출에 타임아웃(REST 5초)과 실패 시 안내 문구를 둔다. 서버가 죽어도 혼자 하기는 동작해야 한다.
10. Cloudflare API·wrangler 문법은 지어내지 않는다. 확실하지 않으면 공식 문서를 확인하고, 확인하지 못한 부분은 "확인 필요"로 보고한다.

## 작업 원칙
- SPEC.md의 단계 순서대로 진행한다. 한 번에 한 단계만 한다.
- 단계가 끝나면 멈추고 다음을 보여 준다: 변경 파일 목록, 확인 방법(실행 명령과 기대 결과), 남은 문제
- 사용자가 "진행"이라고 하면 다음 단계로, "커밋 푸쉬"라고 하면 커밋하고 푸시한다.
- 코드 주석, 커밋 메시지, README는 한국어로 쓴다.
- 사용자가 직접 해야 하는 일(대시보드 설정, 배포 승인 등)은 응답 마지막에 번호 목록으로 정리한다.
- 오류가 나면 추측으로 고치지 말고 로그와 재현 방법을 먼저 정리한다.

## 현재 상태 / 다음 할 일
- [x] 0단계: 준비 (폴더 뼈대, Pages 배포)
- [x] 1단계: 혼자 하기 완성 + 폰 설치
- [x] 2단계: 서버 + 친구 등록 ← Worker 배포 완료 (https://sky-squad-api.terry96.workers.dev)
- [x] 3단계: 게임방 + 2~4인 플레이 ← 실제 폰 2대 확인 완료
- [x] 4단계: 안정화 ← 실제 폰 확인 완료
- [x] 5단계: 자동 배포 ← Workers Builds 연결, 서버 푸시 51초 만에 자동 반영 확인 (2026-11-17)

**2차: SPEC-v2.md** (귀여운 캐릭터·상점·스테이지 5, 1차 규칙 그대로 + 저작권 규칙 강화)
- [x] 6단계: 캐릭터·적 그림 교체 (기능 변화 없음) ← 폰 미리보기 승인 (2026-11-18)
- [x] 7단계: 코인 + 상점 (혼자 하기) ← 폰 확인 완료. 총알 4→8단계(사용자 결정, f9815fc)
- [x] 8단계: 스테이지 2~5 + 엔딩 + 최고 도달 스테이지 (f6a96cb). 개발용 `?debug=1&stage=4&boss=1&power=8&coins=500`
- [ ] 9단계: 같이 하기에 반영 ← 구현·테스트 완료(창 3개 E2E: 클리어→각자 구매→스테이지 2, 상점 중 재연결), 실제 폰 2대·대시보드 요청 수 확인 대기. 서버 SERVER_VERSION 7
- [ ] 10단계: 밸런스 조정 + 배포 (README에 상점·스테이지 설명)

**1차 완성 이후 남은 후보** (우선순위 순)
1. Lobby 오류 약 18%(26건) 원인 찾기 — 4단계에서 오류 로그 추가함, Cloudflare 대시보드 → Workers 로그에서 확인
2. 4인 30분 플레이 후 DO 요청 수 실측 (SPEC 추정: 시간당 약 8,100, 1.5배 이하면 OK)
3. 배포 서버의 시험 계정 테스트A·테스트B 정리
- 제작 과정 발표 PPT는 저장소 밖 `../sky-squad-발표/`에 있음 (README 참고)

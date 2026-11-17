# sky-squad — 함께 하는 비행기 슈팅 (초안)

최대 4명이 각자 안드로이드 폰으로 함께 하는 협동 비행기 슈팅 웹게임입니다.
앱 스토어 없이 Chrome의 **홈 화면에 추가**로 설치합니다.

- 화면 주소: https://hwmill.github.io/sky-squad/
- 상세 설계: [SPEC.md](SPEC.md)
- 현재 상태: **0단계(준비)** — 아직 "준비 중" 화면만 있습니다.

## 폴더
| 폴더 | 내용 |
|---|---|
| `web/` | 화면 (GitHub Pages로 공개) |
| `server/` | Cloudflare Worker (2단계부터) |
| `tests/` | 게임 규칙 테스트 (1단계부터) |

## PC에서 화면 확인
```
cd web
python -m http.server 8080
```
브라우저에서 http://localhost:8080 을 엽니다. 끌 때는 `Ctrl + C`.

## 배포
- `main` 브랜치에 푸시하면 GitHub Actions(`.github/workflows/pages.yml`)가 `web/` 폴더를 Pages로 배포합니다.
- 처음 한 번: 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 설정해야 합니다.

## 지키는 것
- 개인정보는 받지 않습니다(닉네임만). 채팅, 결제, 광고, AI 기능 없음.
- 그림과 소리는 코드로 직접 만듭니다.

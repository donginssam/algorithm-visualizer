# 8단계 — 설치와 오프라인 실행

> 상태: 완료

## 목표

7단계에서 작업 내용을 `localStorage`에 자동 저장하게 되면서, 이상한 상태가 하나 남았습니다. **데이터는 이미 기기 안에 있는데, 그 데이터를 여는 앱 코드만 매번 네트워크에서 받아야 합니다.** 학교 무선망이 느리거나 끊기면 저장해 둔 작업을 열지도 못합니다.

- 한 번 연 뒤에는 네트워크 없이도 열리고 모든 기능이 동작할 것
- 주소를 외우지 않고 앱 아이콘으로 열 수 있을 것
- 새 버전이 배포됐을 때 작업 도중에 화면이 멋대로 새로 고쳐지지 않을 것

## 구현 내용

### service worker precache

[`vite.config.ts`](../../vite.config.ts)에 `vite-plugin-pwa` 1.3.0(Workbox)을 붙였습니다.

- `globPatterns`를 `["**/*.{js,css,html,svg}", "icon-*.png"]`로 두어 기본값이 빠뜨리는 아이콘까지 담습니다. 설치 창 갈무리(`screenshot-*.png`, 169 KB)는 오프라인에서 쓸 일이 없어 일부러 뺐습니다.
- 화면 전환이 URL 해시라 실제 문서는 `index.html` 하나뿐이므로 `navigateFallback`도 그것 하나입니다. 평소에는 precache가 그대로 맞고, 쿼리가 붙은 주소(`?from=lms`처럼 LMS 링크에서 오는 경우)만 이 fallback이 받습니다. 오프라인에서 실제로 그 주소로 들어가 확인했습니다.
- 빌드 결과는 precache 16개 항목, 790.61 KiB입니다. 여기에는 예제 화면 chunk(`ExamplesPage-*.js`)도 들어갑니다. Workbox는 실제 요청이 아니라 glob으로 담기 때문에, 예제 화면에 한 번도 들어가지 않았어도 오프라인에서 열립니다.
- pnpm 환경에서는 `workbox-window`를 직접 적어야 합니다. 가상 모듈이 이것을 import하는데 pnpm의 엄격한 `node_modules`에서는 자동으로 찾지 못해 빌드가 멈춥니다. 번들에 실제로 들어가는 라이브러리이므로 `dependencies`에 둡니다(`vite-plugin-pwa` 자체는 빌드 도구라 `devDependencies`).

### 설치 manifest

[`src/constants/pwa.ts`](../../src/constants/pwa.ts)의 `buildManifest(base)`가 manifest를 만들고, `vite.config.ts`가 `base` 계산과 manifest 양쪽에 같은 `PAGES_BASE`를 씁니다.

- 아이콘은 정사각형 PNG 세 개(`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`)입니다. 그림의 원본은 [`public/icon.svg`](../../public/icon.svg)와 [`public/icon-maskable.svg`](../../public/icon-maskable.svg)이고, [`scripts/generate-icons.mjs`](../../scripts/generate-icons.mjs)가 헤드리스 Chrome으로 PNG를 뽑습니다. `index.html`의 favicon은 data URI 대신 `icon.svg`를 가리킵니다.
- 설치 창 미리보기로 `screenshot-wide.png`(1366×768)를 넣고, 넓은 화면용과 그 밖의 화면용으로 각각 등록합니다.
- `theme_color`·`background_color`는 `index.html`의 `<meta name="theme-color">`, `_tokens.scss`의 `--surface-page`와 같은 `#eef2fa`입니다.
- `display: "standalone"`, `lang: "ko"`, `categories: ["education"]`.

### 새 버전 알림

[`src/components/UpdatePrompt.tsx`](../../src/components/UpdatePrompt.tsx)가 `useRegisterSW`로 service worker를 등록하고, 새 버전이 대기 상태가 되면 대화상자를 띄웁니다.

- 스타일은 기호 편집·초기화 대화상자와 같은 것(`.modal-backdrop` + `.node-editor-dialog` + `.dialog-actions`)을 그대로 씁니다. CSS는 한 줄도 늘지 않았습니다.
- 초점은 `나중에`에 먼저 가고, `Esc`와 바깥 누르기로 닫힙니다.
- `지금 새로 고침`은 예약된 저장을 먼저 흘려보낸 뒤(`saveNow`) 새 worker로 교체하고 새로 고칩니다.

## 선택 이유와 고려한 대안

### service worker를 손으로 쓰지 않은 이유

이 프로젝트는 파일 이름에 해시가 붙고, `manualChunks`로 vendor chunk가 셋으로 갈라져 있고, `base`가 개발 서버(`/`)와 배포(`/algorithm-visualizer/`)에서 다릅니다. 세 가지가 겹치면 손으로 적은 precache 목록은 배포할 때마다 낡고, 낡았다는 사실이 화면에 드러나지 않습니다. 목록을 빌드 결과에서 만들게 두는 편이 안전합니다.

### 자동으로 새로 고치지 않는 이유

`autoUpdate`는 새 worker가 제어권을 잡는 순간 페이지를 새로 고칩니다. 자동 저장이 있어 내용을 잃지는 않지만, 수업 중에 기호를 끌거나 글자를 치는 도중 화면이 바뀌면 하던 동작이 끊깁니다. 되돌릴 수 없는 `초기화`에 확인을 두기로 한 것과 같은 이유로, 여기서도 한 번 묻습니다.

### 한글 글꼴을 캐시하지 않은 이유

본문 글꼴 Pretendard는 CDN의 `dynamic-subset`이라 unicode-range로 쪼개진 파일 묶음입니다. 이것을 runtime cache에 담으면 오프라인 직전까지 실제로 그려진 글자의 subset만 캐시됩니다. 그러면 오프라인에서 **한 문장 안에서 글꼴이 섞여** 지금보다 나빠집니다. 전부 시스템 한글 글꼴로 대체되는 편이 낫습니다. 정적 subset을 직접 호스팅하는 방법도 있지만 수백 KB에서 1MB를 늘리는 대신 얻는 것이 글꼴 통일뿐이라 하지 않았습니다.

### 아이콘을 SVG로 두려다 PNG로 되돌린 이유

처음에는 manifest 아이콘도 `sizes: "any"`인 SVG 하나로 덮으려 했습니다. 크기별 PNG를 만들어 원본과 계속 맞추는 일을 피할 수 있기 때문입니다. `Page.getAppManifest`가 `errors: []`를 돌려주기에 문제가 없다고 판단했지만, **그 명령은 manifest를 파싱만 하고 아이콘을 실제로 불러 보지 않습니다.** DevTools의 Application 탭은 아이콘을 직접 받아 보고 다음을 알려 줍니다.

```
Icon …/icon.svg failed to load
Most operating systems require square icons.
```

파일 자체는 멀쩡합니다(같은 파일이 `<img>`로도 favicon으로도 잘 그려집니다). **Chrome의 manifest 아이콘 처리기가 SVG를 받지 않는 것**입니다. 그래서 원본만 SVG로 두고 manifest에는 정사각형 PNG를 넣습니다.

PNG를 손으로 만들어 두면 원본과 어긋나므로, 래스터 변환 라이브러리를 의존성에 넣는 대신 이미 설치된 크롬으로 뽑는 스크립트를 하나 뒀습니다. 빌드에 넣지 않은 것은 배포마다 크롬 실행 파일이 필요해지는 것을 피하기 위해서입니다.

### 좁은 화면용 갈무리에 같은 그림을 쓴 이유

설치 창 미리보기는 `form_factor: "wide"`인 갈무리와 그렇지 않은 갈무리가 각각 있어야 나옵니다. 이 도구는 가로 화면 전용이라 좁은 화면용 화면을 만들 수 없습니다. 좁은 화면용을 비워 두면 미리보기가 아예 나오지 않으므로, 같은 그림을 `form_factor` 없이 한 번 더 등록해 어떤 화면에서든 쓰이게 했습니다. 없는 화면을 지어내지 않으면서 미리보기는 나오게 하는 선택입니다.

### manifest를 TypeScript 모듈로 둔 이유

`scope`·`start_url`이 Vite의 `base`와 어긋나면 설치는 되는데 열면 404가 나고, 원인이 화면에 드러나지 않습니다. 정적 JSON 파일로 두면 `base`를 바꿀 때 같이 고쳐야 한다는 사실을 잊기 쉽습니다. `base` 하나에서 만들어 내고, 그 관계를 [`src/constants/pwa.test.ts`](../../src/constants/pwa.test.ts)가 검사합니다.

## 주요 산출물

| 파일                              | 역할                                        |
| --------------------------------- | ------------------------------------------- |
| `src/constants/pwa.ts`            | `PAGES_BASE`, 테마색, `buildManifest(base)` |
| `src/constants/pwa.test.ts`       | `base`↔`scope` 결합과 아이콘·테마색 검증    |
| `src/components/UpdatePrompt.tsx` | service worker 등록과 새 버전 대화상자      |
| `public/icon.svg`                 | favicon이자 PNG 아이콘의 원본               |
| `public/icon-maskable.svg`        | `maskable` PNG의 원본                       |
| `public/icon-*.png`               | manifest에 들어가는 정사각형 아이콘         |
| `public/screenshot-wide.png`      | 설치 창 미리보기                            |
| `scripts/generate-icons.mjs`      | SVG에서 PNG 아이콘 뽑기(빌드와 분리)        |
| `vite.config.ts`                  | `VitePWA` 설정과 `base` 공유                |
| `src/vite-env.d.ts`               | 가상 모듈 타입 참조                         |

## 완료 기준

- service worker가 `/algorithm-visualizer/` scope로 활성화됩니다.
- DevTools Application 탭에 아이콘·갈무리 관련 경고가 없습니다.
- 오프라인에서 편집·팔레트·예제 화면·이미지 저장·작업 복원이 모두 동작합니다.
- 새 버전이 오면 물어보고, 확인해야 새로 고칩니다.
- 새로 고친 뒤에도 만들던 순서도가 위치까지 그대로 남습니다.
- 개발 서버(`base: "/"`)는 service worker 없이 지금처럼 동작합니다.

## 검증 결과

`pnpm test` 5개 파일 46개 통과, `pnpm build` 통과. 브라우저 확인은 CDP로 헤드리스 Chrome을 1366×768로 띄워 `pnpm preview`의 `/algorithm-visualizer/`에서 했습니다.

| 확인                      | 결과                                                                   |
| ------------------------- | ---------------------------------------------------------------------- |
| service worker            | `activated`, scope `…/algorithm-visualizer/`                           |
| precache                  | 16개 — `ExamplesPage` chunk와 아이콘 포함, 갈무리는 제외               |
| manifest 아이콘           | PNG 3개 모두 선언한 크기 그대로 로드, 전부 정사각형                    |
| 설치 창 갈무리            | `wide`와 `form_factor` 없는 항목 각각 로드, 비율·크기 제한 통과        |
| `getInstallabilityErrors` | `[]`                                                                   |
| 오프라인 새로 고침        | 상단바·편집기·팔레트 4개·시작 기호가 그대로, 세로 스크롤 없음(768=768) |
| 오프라인 예제 화면        | 카드 2개와 미리보기 2개                                                |
| 오프라인 예제 불러오기    | 기호 8개·화살표 8개, 저장 4218 bytes, 새로 고침 뒤 위치까지 동일       |
| 오프라인 이미지 저장      | `저장했어요`, PNG 116 KB 생성                                          |
| 새 버전 대화상자          | 버튼 높이 44px, 초점 `나중에`, 닫으면 작업 유지                        |
| `지금 새로 고침`          | 새 worker가 제어, 기호 8개와 위치 8개가 문자열까지 동일                |
| 오프라인 `?from=lms`      | `navigateFallback`으로 앱이 그대로 뜸                                  |
| 개발 서버                 | service worker 0개, 콘솔 오류 0건                                      |

오프라인에서 뜨는 콘솔 오류는 Pretendard subset 요청 실패뿐이며, 의도한 동작입니다(시스템 한글 글꼴로 대체). CDN의 CSS는 브라우저 HTTP 캐시에 남아 `@font-face` 규칙이 살아 있으므로, 화면에 그려진 글자의 subset 수만큼 실패가 납니다.

## 아직 확인하지 않은 항목

- 실제 크롬북에서 설치한 뒤의 창 크기와 세로 여유
- 실제 GitHub Pages 배포본에서의 service worker 갱신 주기
- 저장 공간이 부족한 기기에서 precache가 실패할 때의 동작

## 이번 단계에서 제외한 기능

- 한글 글꼴 자체 호스팅
- iOS 설치 아이콘(`apple-touch-icon`)과 세로 모드 레이아웃
- 오프라인 준비 완료 알림 — 첫 방문 학생에게 의미가 없습니다.
- 배경 동기화나 푸시 알림 — 서버가 없습니다.

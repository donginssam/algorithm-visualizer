# 본문 글꼴

공식 `pretendard` 패키지를 pnpm으로 관리합니다. 버전은 `1.3.9`로 고정합니다.

`src/main.tsx`에서 `pretendard/dist/web/variable/pretendardvariable.css`를 불러옵니다. Vite가 CSS에서 참조하는 전체 가변 WOFF2를 `assets/PretendardVariable-<hash>.woff2`로 빌드하고 GitHub Pages 하위 경로에 맞춰 URL을 만듭니다. 브라우저는 앱과 같은 출처에서 글꼴을 받으며 npm이나 별도 글꼴 CDN에 접속하지 않습니다.

글꼴은 약 2 MB이며 `vite.config.ts`의 WOFF2 precache 규칙에 포함됩니다. 캐시가 준비되면 오프라인에서도 새 한글 문장을 같은 글꼴로 표시합니다.

## 라이선스와 업데이트

글꼴에는 앱의 MIT 라이선스와 별개로 SIL Open Font License 1.1이 적용됩니다. 저작권 고지와 라이선스 전문은 `public/licenses/pretendard-OFL.txt`로 함께 배포합니다.

- 공식 소스: https://github.com/orioncactus/pretendard
- 현재 라이선스 원본: https://github.com/orioncactus/pretendard/blob/v1.3.9/LICENSE

업데이트할 때는 `pnpm add --save-exact pretendard@<version>`으로 패키지와 잠금 파일을 갱신하고, 해당 버전의 라이선스도 확인합니다. 빌드 결과에 글꼴이 한 벌만 포함되는지, service worker precache에 포함되는지, 앱과 같은 출처에서 로드되는지 점검합니다. 수동으로 글꼴 바이너리를 저장소에 복사할 필요는 없습니다.

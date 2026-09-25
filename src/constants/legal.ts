/**
 * 개인정보 처리방침 페이지의 위치(배포 경로 base 기준).
 *
 * 빌드 플러그인(plugins/privacyPage.ts)이 이 이름으로 페이지를 내보내고, 앱의
 * 링크(components/LegalLinks.tsx)가 이 이름으로 엽니다. 한쪽만 바꾸면 링크가
 * 404가 되므로 값을 여기 하나에 둡니다. 파일명은 「개인정보 처리방침 작성지침」
 * (2026. 4.)의 권장 형식(privacy_policy.<확장자>)을 따릅니다.
 */
export const PRIVACY_PAGE_PATH = "legal/privacy_policy.html"

/**
 * 오픈소스 라이선스 고지 페이지의 위치(배포 경로 base 기준).
 *
 * 처리방침과 같은 구조입니다. plugins/licensePage.ts가 내보내고
 * components/LegalLinks.tsx가 엽니다.
 */
export const LICENSE_PAGE_PATH = "legal/open_source_licenses.html"

/**
 * 글꼴 라이선스 전문의 위치(배포 경로 base 기준).
 *
 * SIL Open Font License는 저작권 고지와 라이선스 전문을 함께 배포하도록 요구합니다.
 * 원본은 public/licenses/에 두고 빌드가 그대로 복사하므로, 라이선스 페이지에서
 * 이 경로로 링크합니다. 파일을 옮기면 링크가 404가 됩니다.
 */
export const FONT_LICENSE_PATH = "licenses/pretendard-OFL.txt"

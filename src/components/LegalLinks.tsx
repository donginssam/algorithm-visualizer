import { LICENSE_PAGE_PATH, PRIVACY_PAGE_PATH } from "../constants/legal"

const links = [
  { path: LICENSE_PAGE_PATH, label: "오픈소스 라이선스" },
  { path: PRIVACY_PAGE_PATH, label: "개인정보 처리방침" },
]

/** 편집 화면을 유지하도록 공통 푸터의 고지 페이지는 새 탭에서 엽니다. */
export function LegalLinks() {
  return links.map(({ path, label }) => (
    <a
      key={path}
      className="legal-link"
      href={`${import.meta.env.BASE_URL}${path}`}
      target="_blank"
      rel="noopener"
    >
      {label}
    </a>
  ))
}

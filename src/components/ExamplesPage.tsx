import { useMemo } from "react"
import { astToFlow } from "../core/astToFlow"
import { flowToSvg } from "../core/flowToSvg"
import { examples, type Example } from "../examples"

/**
 * 카드에 넣을 순서도 축소판.
 *
 * PNG 저장에 쓰는 SVG 생성기를 그대로 재사용하므로, 미리보기와 실제 순서도가
 * 어긋날 일이 없다.
 */
function previewUrl(example: Example): string {
  const graph = astToFlow(example.program)
  const { markup } = flowToSvg(graph.nodes, graph.edges)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

interface ExamplesPageProps {
  onLoad: (example: Example) => void
}

export function ExamplesPage({ onLoad }: ExamplesPageProps) {
  const cards = useMemo(
    () => examples.map(example => ({ example, preview: previewUrl(example) })),
    [],
  )

  return (
    <section className="examples-page" aria-label="예제 알고리즘">
      <div className="examples-intro">
        <h2>예제로 시작해 보기</h2>
        <p>
          마음에 드는 예제를 불러오면 의사코드와 순서도가 함께 채워집니다. 내용을 고쳐 가며
          알고리즘이 어떻게 바뀌는지 살펴보세요.
        </p>
      </div>

      <ul className="example-grid">
        {cards.map(({ example, preview }) => (
          <li key={example.id} className="example-card">
            <div className="example-preview">
              <img src={preview} alt={`${example.title} 순서도 미리보기`} />
            </div>
            <div className="example-copy">
              <h3>{example.title}</h3>
              <p>{example.description}</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => onLoad(example)}>
              이 예제 불러오기
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

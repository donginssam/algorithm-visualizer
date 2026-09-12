/**
 * 순서도를 PNG 파일로 내려받습니다.
 *
 * core에서 유일하게 DOM에 손대는 파일입니다. 래스터화는 브라우저의 캔버스가
 * 있어야만 할 수 있어서, 이것만 브라우저 없이 테스트할 수 없습니다. 대신 그림의
 * 내용을 정하는 일은 전부 flowToSvg.ts가 맡고(테스트 가능), 여기서는 그 결과를
 * 그림 파일로 굽는 일만 합니다.
 */

import { flowToSvg } from "./flowToSvg"
import type { AlgorithmFlowEdge, AlgorithmFlowNode } from "./flowTypes"

/** 화면 배율과 무관하게 항상 2배 해상도로 저장합니다(과제 제출용). */
const EXPORT_SCALE = 2

/** PNG 파일명에 붙일 `YYYYMMDD-HHmm` 시각 문자열. */
function exportStamp(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  )
}

export async function exportGraphAsPng(
  nodes: AlgorithmFlowNode[],
  edges: AlgorithmFlowEdge[],
): Promise<void> {
  const { markup, width, height } = flowToSvg(nodes, edges)

  const image = new Image()
  image.width = width
  image.height = height
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("순서도를 이미지로 바꾸지 못했어요."))
    image.src = svgUrl
  })

  const canvas = document.createElement("canvas")
  canvas.width = width * EXPORT_SCALE
  canvas.height = height * EXPORT_SCALE
  const context = canvas.getContext("2d")
  if (!context) throw new Error("이미지를 만들 수 없는 브라우저예요.")
  context.scale(EXPORT_SCALE, EXPORT_SCALE)
  context.drawImage(image, 0, 0, width, height)

  const link = document.createElement("a")
  link.download = `순서도-${exportStamp()}.png`
  link.href = canvas.toDataURL("image/png")
  link.click()
}

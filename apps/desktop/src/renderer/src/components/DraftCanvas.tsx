import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

export type PaperKind = 'blank' | 'ruled' | 'code'

export interface DraftCanvasHandle {
  undo(): void
  clear(): void
  isEmpty(): boolean
}

interface DraftCanvasProps {
  paper: PaperKind
}

type Point = { x: number; y: number; pressure: number }
type Stroke = Point[]

const MIN_WIDTH = 0.9
const MAX_WIDTH = 4.2
const PEN_COLOR = '#e6e9ef'

function widthFor(pressure: number): number {
  const p = pressure > 0 ? pressure : 0.5
  return MIN_WIDTH + p * (MAX_WIDTH - MIN_WIDTH)
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.length === 0) return
  ctx.strokeStyle = PEN_COLOR
  ctx.fillStyle = PEN_COLOR
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (stroke.length === 1) {
    const p = stroke[0]
    ctx.beginPath()
    ctx.arc(p.x, p.y, widthFor(p.pressure) / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1]
    const b = stroke[i]
    ctx.lineWidth = (widthFor(a.pressure) + widthFor(b.pressure)) / 2
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
}

/**
 * 手写草稿纸：Canvas + Pointer Events。
 * - 保留每笔的压力与顺序（提交判题时会用到 stroke 时序）
 * - 撤销 / 清空由外层通过 ref 调用
 */
export const DraftCanvas = forwardRef<DraftCanvasHandle, DraftCanvasProps>(function DraftCanvas(
  { paper },
  ref
) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)
  const [hasInk, setHasInk] = useState(false)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, stage.clientWidth)
    const h = Math.max(1, stage.clientHeight)
    const pw = Math.round(w * dpr)
    const ph = Math.round(h * dpr)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke)
    if (drawingRef.current) drawStroke(ctx, drawingRef.current)
  }, [])

  useEffect(() => {
    redraw()
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(() => redraw())
    observer.observe(stage)
    window.addEventListener('resize', redraw)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', redraw)
    }
  }, [redraw, paper])

  const toPoint = (e: { clientX: number; clientY: number; pressure: number }): Point => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
      pressure: e.pressure
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (paper === 'code') return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = [toPoint(e.nativeEvent)]
    redraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const stroke = drawingRef.current
    if (!stroke) return
    const native = e.nativeEvent
    const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [native]
    for (const ev of events) {
      const p = toPoint(ev)
      const last = stroke[stroke.length - 1]
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.4) continue
      stroke.push(p)
    }
    redraw()
  }

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const stroke = drawingRef.current
    drawingRef.current = null
    if (stroke && stroke.length > 0) {
      strokesRef.current.push(stroke)
      setHasInk(true)
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    redraw()
  }

  const undo = (): void => {
    strokesRef.current.pop()
    setHasInk(strokesRef.current.length > 0)
    redraw()
  }

  const clear = (): void => {
    strokesRef.current = []
    setHasInk(false)
    redraw()
  }

  useImperativeHandle(
    ref,
    () => ({ undo, clear, isEmpty: () => strokesRef.current.length === 0 }),
    [redraw]
  )

  return (
    <div ref={stageRef} className={`draft-stage paper-${paper}`}>
      <div className="paper-lines" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="draft-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={finishStroke}
      />
      {paper === 'code' ? (
        <textarea
          className="code-area"
          spellCheck={false}
          placeholder="// 代码页：直接写代码，判题时按文本分析"
        />
      ) : null}
      {!hasInk && paper !== 'code' ? <div className="draft-hint">用触屏笔或鼠标在这里演算</div> : null}
    </div>
  )
})

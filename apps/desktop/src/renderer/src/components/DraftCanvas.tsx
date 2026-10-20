import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

export type PaperKind = 'blank' | 'ruled' | 'code'

export interface DraftCanvasHandle {
  undo(): void
  clear(): void
  resetView(): void
  zoomBy(factor: number): void
}

interface DraftCanvasProps {
  paper: PaperKind
  color: string
  width: number
  onZoomChange?: (percent: number) => void
}

type Point = { x: number; y: number; pressure: number }
type Stroke = { color: string; width: number; points: Point[] }

const MIN_SCALE = 0.25
const MAX_SCALE = 5
const RULED_GAP = 48

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function strokeWidth(base: number, pressure: number): number {
  const p = pressure > 0 ? pressure : 0.5
  return base * (0.55 + clamp(p, 0, 1) * 0.9)
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length === 0) return
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (stroke.points.length === 1) {
    const p = stroke.points[0]
    ctx.beginPath()
    ctx.arc(p.x, p.y, strokeWidth(stroke.width, p.pressure) / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1]
    const b = stroke.points[i]
    ctx.lineWidth = (strokeWidth(stroke.width, a.pressure) + strokeWidth(stroke.width, b.pressure)) / 2
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
}

/**
 * 无限草稿纸：视口可平移/缩放，笔画存世界坐标。
 * - 单指/鼠标左键 = 书写
 * - 空格+左键 / 鼠标中键 / 双指拖动 = 平移
 * - 滚轮 = 以光标为中心缩放；双指捏合 = 缩放
 */
export const DraftCanvas = forwardRef<DraftCanvasHandle, DraftCanvasProps>(function DraftCanvas(
  { paper, color, width, onZoomChange },
  ref
) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)
  const viewRef = useRef({ x: 0, y: 0, scale: 1 })
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef<{ midX: number; midY: number; dist: number } | null>(null)
  const panningRef = useRef<{ x: number; y: number } | null>(null)
  const spaceRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  const emitZoom = useCallback((): void => {
    onZoomChange?.(Math.round(viewRef.current.scale * 100))
  }, [onZoomChange])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, wrap.clientWidth)
    const h = Math.max(1, wrap.clientHeight)
    const pw = Math.round(w * dpr)
    const ph = Math.round(h * dpr)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const view = viewRef.current

    // 屏幕空间：背景
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#10141b'
    ctx.fillRect(0, 0, w, h)

    // 世界空间：纸纹 + 笔画
    ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y)

    if (paper === 'ruled') {
      const x0 = (0 - view.x) / view.scale
      const x1 = (w - view.x) / view.scale
      const y0 = (0 - view.y) / view.scale
      const y1 = (h - view.y) / view.scale
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'
      ctx.lineWidth = 1 / view.scale
      for (let y = Math.floor(y0 / RULED_GAP) * RULED_GAP; y <= y1; y += RULED_GAP) {
        ctx.beginPath()
        ctx.moveTo(x0, y)
        ctx.lineTo(x1, y)
        ctx.stroke()
      }
    }

    for (const stroke of strokesRef.current) drawStroke(ctx, stroke)
    if (drawingRef.current) drawStroke(ctx, drawingRef.current)
  }, [paper])

  useEffect(() => {
    redraw()
    const wrap = wrapRef.current
    if (!wrap) return
    const observer = new ResizeObserver(() => redraw())
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [redraw])

  // 空格临时平移
  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      const node = el as HTMLElement | null
      return Boolean(node && (node.isContentEditable || ['INPUT', 'TEXTAREA'].includes(node.tagName)))
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !isEditable(e.target)) {
        spaceRef.current = true
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') spaceRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const toWorld = (clientX: number, clientY: number): Point => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const view = viewRef.current
    return {
      x: (clientX - (rect?.left ?? 0) - view.x) / view.scale,
      y: (clientY - (rect?.top ?? 0) - view.y) / view.scale,
      pressure: 0
    }
  }

  /** 以屏幕点为中心缩放 */
  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number): void => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const view = viewRef.current
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      const wx = (sx - view.x) / view.scale
      const wy = (sy - view.y) / view.scale
      const next = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE)
      view.scale = next
      view.x = sx - wx * next
      view.y = sy - wy * next
      redraw()
      emitZoom()
    },
    [redraw, emitZoom]
  )

  // 滚轮缩放（需要 non-passive 才能 preventDefault）
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.0015)
      zoomAt(e.clientX, e.clientY, factor)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const twoFinger = (): { midX: number; midY: number; dist: number } | null => {
    const pts = [...pointersRef.current.values()]
    if (pts.length < 2) return null
    const [a, b] = pts
    return {
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      dist: Math.hypot(a.x - b.x, a.y - b.y)
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (paper === 'code') return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    e.currentTarget.setPointerCapture(e.pointerId)

    const multi = twoFinger()
    if (multi) {
      // 第二根手指落下：放弃未完成的笔画，进入双指平移/缩放
      drawingRef.current = null
      panningRef.current = null
      gestureRef.current = { ...multi }
      redraw()
      return
    }

    if (e.pointerType === 'mouse' && e.button === 1) {
      panningRef.current = { x: e.clientX, y: e.clientY }
      return
    }
    if (spaceRef.current || (e.pointerType === 'touch' && e.buttons === 2)) {
      panningRef.current = { x: e.clientX, y: e.clientY }
      return
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return

    const p = toWorld(e.clientX, e.clientY)
    p.pressure = e.pressure
    drawingRef.current = { color, width, points: [p] }
    redraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    // 双指手势
    if (pointersRef.current.size >= 2) {
      const cur = twoFinger()
      const gesture = gestureRef.current
      if (cur && gesture) {
        const factor = cur.dist / Math.max(1, gesture.dist)
        zoomAt(cur.midX, cur.midY, factor)
        const view = viewRef.current
        view.x += cur.midX - gesture.midX
        view.y += cur.midY - gesture.midY
        gesture.midX = cur.midX
        gesture.midY = cur.midY
        gesture.dist = cur.dist
        redraw()
      }
      return
    }

    // 平移
    const panning = panningRef.current
    if (panning) {
      const view = viewRef.current
      view.x += e.clientX - panning.x
      view.y += e.clientY - panning.y
      panning.x = e.clientX
      panning.y = e.clientY
      redraw()
      return
    }

    // 书写
    const stroke = drawingRef.current
    if (!stroke) return
    const native = e.nativeEvent
    const events =
      typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [native]
    const view = viewRef.current
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    for (const ev of events) {
      const p: Point = {
        x: (ev.clientX - rect.left - view.x) / view.scale,
        y: (ev.clientY - rect.top - view.y) / view.scale,
        pressure: ev.pressure
      }
      const last = stroke.points[stroke.points.length - 1]
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.4 / view.scale) continue
      stroke.points.push(p)
    }
    redraw()
  }

  const finishPointer = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) gestureRef.current = null
    panningRef.current = null

    const stroke = drawingRef.current
    drawingRef.current = null
    if (stroke && stroke.points.length > 0) {
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

  const resetView = (): void => {
    viewRef.current = { x: 0, y: 0, scale: 1 }
    redraw()
    emitZoom()
  }

  const zoomBy = (factor: number): void => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  useImperativeHandle(
    ref,
    () => ({ undo, clear, resetView, zoomBy }),
    [redraw, emitZoom, zoomBy]
  )

  return (
    <div ref={wrapRef} className={`draft-stage paper-${paper}`}>
      {paper === 'code' ? (
        <textarea
          className="code-area"
          spellCheck={false}
          placeholder="// 代码页：直接写代码，判题时按文本分析"
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className="draft-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerLeave={finishPointer}
      />
      {!hasInk && paper !== 'code' ? (
        <div className="draft-hint">书写 · 空格/中键拖动平移 · 滚轮缩放 · 双指捏合缩放</div>
      ) : null}
    </div>
  )
})

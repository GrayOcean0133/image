import { useEffect, useRef, useState } from 'react'
import { registry, type PanelContribution } from '@image/plugin-api'
import { helloPlugin } from './plugins/hello'
import { DraftCanvas, type DraftCanvasHandle, type PaperKind } from './components/DraftCanvas'
import './styles.css'

const PLUGINS = [helloPlugin]
const ENABLED_KEY = 'image.plugins.enabled'
const LAYOUT_KEY = 'image.layout'
const SPLITTER = 6

const PEN_COLORS = ['#e6e9ef', '#ff6b6b', '#4f8cff', '#4ade80', '#fbbf24', '#c084fc']
const PEN_SIZES = [
  { label: '细', width: 1.6 },
  { label: '中', width: 3 },
  { label: '粗', width: 5.5 }
]

interface LayoutState {
  leftWidth: number
  rightWidth: number
  mainRatio: number
  leftCollapsed: boolean
  rightCollapsed: boolean
}

const DEFAULT_LAYOUT: LayoutState = {
  leftWidth: 232,
  rightWidth: 288,
  mainRatio: 0.55,
  leftCollapsed: false,
  rightCollapsed: false
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) return { ...DEFAULT_LAYOUT, ...(JSON.parse(raw) as Partial<LayoutState>) }
  } catch {
    // 回退默认布局
  }
  return DEFAULT_LAYOUT
}

function loadEnabled(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(ENABLED_KEY)
    if (raw) return JSON.parse(raw) as Record<string, boolean>
  } catch {
    // 存储不可用时回退到默认值
  }
  return Object.fromEntries(PLUGINS.map((plugin) => [plugin.manifest.id, true]))
}

function App(): React.JSX.Element {
  const [paper, setPaper] = useState<PaperKind>('blank')
  const [penColor, setPenColor] = useState(PEN_COLORS[0])
  const [penWidth, setPenWidth] = useState(PEN_SIZES[1].width)
  const [zoom, setZoom] = useState(100)
  const [enabled, setEnabled] = useState<Record<string, boolean>>(loadEnabled)
  const [pluginPanels, setPluginPanels] = useState<PanelContribution[]>([])
  const [layout, setLayout] = useState<LayoutState>(loadLayout)
  const [containerWidth, setContainerWidth] = useState(1200)
  const draftRef = useRef<DraftCanvasHandle>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ kind: 'left' | 'main' | 'right'; startX: number; start: LayoutState } | null>(null)

  // 插件开关：按状态加载/卸载，并刷新贡献点列表
  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const plugin of PLUGINS) {
        if (enabled[plugin.manifest.id]) {
          await registry.load(plugin)
        } else {
          await registry.unload(plugin.manifest.id)
        }
      }
      if (!cancelled) setPluginPanels(registry.listPanels())
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    try {
      localStorage.setItem(ENABLED_KEY, JSON.stringify(enabled))
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    } catch {
      // 忽略存储失败
    }
  }, [enabled, layout])

  // 记录布局容器宽度，用于把 px 与主栏比例换算成实际列宽
  useEffect(() => {
    const el = layoutRef.current
    if (!el) return
    const update = (): void => setContainerWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const splitterTotal =
    (layout.leftCollapsed ? 0 : SPLITTER) + SPLITTER + (layout.rightCollapsed ? 0 : SPLITTER)
  const leftTrack = layout.leftCollapsed ? 0 : layout.leftWidth
  const rightTrack = layout.rightCollapsed ? 0 : layout.rightWidth
  const available = Math.max(240, containerWidth - leftTrack - rightTrack - splitterTotal)
  const mainLeftTrack = Math.round(available * layout.mainRatio)
  const mainRightTrack = available - mainLeftTrack
  const gridTemplateColumns = [
    `${leftTrack}px`,
    `${layout.leftCollapsed ? 0 : SPLITTER}px`,
    `${mainLeftTrack}px`,
    `${SPLITTER}px`,
    `${mainRightTrack}px`,
    `${layout.rightCollapsed ? 0 : SPLITTER}px`,
    `${rightTrack}px`
  ].join(' ')

  const beginDrag =
    (kind: 'left' | 'main' | 'right') =>
    (e: React.PointerEvent<HTMLDivElement>): void => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = { kind, startX: e.clientX, start: layout }
    }

  const onDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    if (drag.kind === 'left') {
      const next = clamp(drag.start.leftWidth + dx, 180, Math.max(180, containerWidth * 0.45))
      setLayout((prev) => ({ ...prev, leftWidth: Math.round(next) }))
    } else if (drag.kind === 'right') {
      const next = clamp(drag.start.rightWidth - dx, 180, Math.max(180, containerWidth * 0.45))
      setLayout((prev) => ({ ...prev, rightWidth: Math.round(next) }))
    } else {
      const dragSplitterTotal =
        (drag.start.leftCollapsed ? 0 : SPLITTER) + SPLITTER + (drag.start.rightCollapsed ? 0 : SPLITTER)
      const dragAvailable = Math.max(
        240,
        containerWidth -
          (drag.start.leftCollapsed ? 0 : drag.start.leftWidth) -
          (drag.start.rightCollapsed ? 0 : drag.start.rightWidth) -
          dragSplitterTotal
      )
      const ratio = clamp(drag.start.mainRatio + dx / dragAvailable, 0.2, 0.8)
      setLayout((prev) => ({ ...prev, mainRatio: ratio }))
    }
  }

  const endDrag = (): void => {
    dragRef.current = null
  }

  const togglePlugin = (id: string): void => {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="rail-toggle"
          type="button"
          title={layout.leftCollapsed ? '展开账户栏' : '折叠账户栏'}
          onClick={() => setLayout((prev) => ({ ...prev, leftCollapsed: !prev.leftCollapsed }))}
        >
          {layout.leftCollapsed ? '▶' : '◀'}
        </button>
        <span className="brand">.image</span>
        <span className="tagline">理工科 · 笔记 / 判题 / 纠错</span>
        <span className="spacer" />
        <span className="badge">v0.1 · 骨架</span>
        <button
          className="rail-toggle"
          type="button"
          title={layout.rightCollapsed ? '展开工具栏' : '折叠工具栏'}
          onClick={() => setLayout((prev) => ({ ...prev, rightCollapsed: !prev.rightCollapsed }))}
        >
          {layout.rightCollapsed ? '◀' : '▶'}
        </button>
      </header>

      <main className="layout" ref={layoutRef} style={{ gridTemplateColumns }}>
        {/* -1 栏 */}
        {layout.leftCollapsed ? null : (
          <aside className="panel sidebar-left" style={{ gridColumn: '1' }}>
            <section className="sidebar-block">
              <h2 className="panel-title">账户</h2>
              <ul className="stub-list">
                <li>未登录</li>
                <li>本地存储：—</li>
              </ul>
            </section>

            <section className="sidebar-block">
              <h2 className="panel-title">插件</h2>
              <ul className="plugin-switches">
                {PLUGINS.map((plugin) => (
                  <li className="plugin-switch" key={plugin.manifest.id}>
                    <span className="plugin-switch-meta">
                      <span className="plugin-switch-name">{plugin.manifest.name}</span>
                      <small>{plugin.manifest.id}</small>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(enabled[plugin.manifest.id])}
                      aria-label={`开关插件 ${plugin.manifest.name}`}
                      className={`switch ${enabled[plugin.manifest.id] ? 'on' : ''}`}
                      onClick={() => togglePlugin(plugin.manifest.id)}
                    >
                      <span className="switch-knob" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="sidebar-block">
              <h2 className="panel-title">同步</h2>
              <p className="panel-hint">未配置</p>
            </section>
          </aside>
        )}

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          style={{ gridColumn: '2' }}
          hidden={layout.leftCollapsed}
          onPointerDown={beginDrag('left')}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />

        {/* 1 栏 */}
        <section className="panel main-left" style={{ gridColumn: '3' }}>
          <h2 className="panel-title">题目</h2>
          <p className="panel-hint">左主栏 · 题目 + 手写答题区</p>
          <div className="placeholder question">
            <span>题目渲染区</span>
            <small>Markdown + LaTeX</small>
          </div>
          <div className="placeholder answer">
            <span>答题区</span>
            <small>手写 · 选择题为按钮</small>
          </div>
        </section>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          style={{ gridColumn: '4' }}
          onPointerDown={beginDrag('main')}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />

        {/* 2 栏 */}
        <section className="panel main-right" style={{ gridColumn: '5' }}>
          <div className="panel-head">
            <h2 className="panel-title">草稿纸</h2>
            <div className="draft-tools">
              <div className="segmented">
                {(['blank', 'ruled', 'code'] as PaperKind[]).map((kind) => (
                  <button
                    key={kind}
                    className={`seg ${paper === kind ? 'active' : ''}`}
                    type="button"
                    onClick={() => setPaper(kind)}
                  >
                    {kind === 'blank' ? '白纸' : kind === 'ruled' ? '横线' : '代码'}
                  </button>
                ))}
              </div>
              <button className="tool" type="button" onClick={() => draftRef.current?.undo()}>
                撤销
              </button>
              <button className="tool" type="button" onClick={() => draftRef.current?.clear()}>
                清空
              </button>
            </div>
          </div>

          <div className="draft-wrap">
            <DraftCanvas
              ref={draftRef}
              paper={paper}
              color={penColor}
              width={penWidth}
              onZoomChange={setZoom}
            />
            <div className="draft-float">
              <div className="pen-colors">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-dot ${penColor === c ? 'active' : ''}`}
                    style={{ background: c }}
                    aria-label={`笔色 ${c}`}
                    onClick={() => setPenColor(c)}
                  />
                ))}
              </div>
              <div className="pen-sizes">
                {PEN_SIZES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className={`size-btn ${penWidth === s.width ? 'active' : ''}`}
                    title={s.label}
                    onClick={() => setPenWidth(s.width)}
                  >
                    <span style={{ width: s.width * 3, height: s.width * 3 }} />
                  </button>
                ))}
              </div>
              <span className="draft-sep" />
              <button className="tool" type="button" onClick={() => draftRef.current?.zoomBy(0.8)}>
                −
              </button>
              <span className="zoom-label">{zoom}%</span>
              <button className="tool" type="button" onClick={() => draftRef.current?.zoomBy(1.25)}>
                +
              </button>
              <button className="tool" type="button" onClick={() => draftRef.current?.resetView()}>
                复位
              </button>
            </div>
          </div>
        </section>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          style={{ gridColumn: '6' }}
          hidden={layout.rightCollapsed}
          onPointerDown={beginDrag('right')}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />

        {/* +1 栏 */}
        {layout.rightCollapsed ? null : (
          <aside className="panel sidebar-right" style={{ gridColumn: '7' }}>
            <h2 className="panel-title">工具</h2>
            <p className="panel-hint">公式可视化 / terminal</p>
            <div className="placeholder tools">
              <span>函数图像</span>
              <small>LaTeX · 2D / 3D · 参数旋钮</small>
            </div>
            {pluginPanels.map((panel) => (
              <section className="plugin-panel" key={panel.id}>
                <h3 className="plugin-title">{panel.title}</h3>
                {panel.description ? <p className="panel-hint">{panel.description}</p> : null}
                {panel.render()}
              </section>
            ))}
          </aside>
        )}
      </main>
    </div>
  )
}

export default App

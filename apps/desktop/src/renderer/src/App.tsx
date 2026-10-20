import { useEffect, useRef, useState } from 'react'
import { registry, type PanelContribution } from '@image/plugin-api'
import { helloPlugin } from './plugins/hello'
import { DraftCanvas, type DraftCanvasHandle, type PaperKind } from './components/DraftCanvas'
import './styles.css'

const PLUGINS = [helloPlugin]
const ENABLED_KEY = 'image.plugins.enabled'

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
  const [enabled, setEnabled] = useState<Record<string, boolean>>(loadEnabled)
  const [pluginPanels, setPluginPanels] = useState<PanelContribution[]>([])
  const draftRef = useRef<DraftCanvasHandle>(null)

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
    } catch {
      // 忽略存储失败
    }
  }, [enabled])

  const togglePlugin = (id: string): void => {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">.image</span>
        <span className="tagline">理工科 · 笔记 / 判题 / 纠错</span>
        <span className="spacer" />
        <span className="badge">v0.1 · 骨架</span>
      </header>

      <main className="layout">
        {/* -1 栏 */}
        <aside className="panel sidebar-left">
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

        {/* 1 栏 */}
        <section className="panel main-left">
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

        {/* 2 栏 */}
        <section className="panel main-right">
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
          <DraftCanvas ref={draftRef} paper={paper} />
        </section>

        {/* +1 栏 */}
        <aside className="panel sidebar-right">
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
      </main>
    </div>
  )
}

export default App

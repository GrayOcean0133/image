import './styles.css'

function App(): React.JSX.Element {
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
          <h2 className="panel-title">账户</h2>
          <p className="panel-hint">登录 / 存储位置</p>
          <ul className="stub-list">
            <li>未登录</li>
            <li>本地存储：—</li>
            <li>同步：未配置</li>
          </ul>
        </aside>

        {/* 1 栏 */}
        <section className="panel main-left">
          <h2 className="panel-title">题目</h2>
          <p className="panel-hint">左主栏 · 题目 + 手写答题区</p>
          <div className="placeholder">
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
            <div className="segmented">
              <button className="seg active" type="button">
                白纸
              </button>
              <button className="seg" type="button">
                横线
              </button>
              <button className="seg" type="button">
                代码
              </button>
            </div>
          </div>
          <div className="placeholder draft">
            <span>手写画布</span>
            <small>压感 · 撤销 · 判错标注落在这一层</small>
          </div>
        </section>

        {/* +1 栏 */}
        <aside className="panel sidebar-right">
          <h2 className="panel-title">工具</h2>
          <p className="panel-hint">公式可视化 / terminal</p>
          <div className="placeholder tools">
            <span>函数图像</span>
            <small>LaTeX · 2D / 3D · 参数旋钮</small>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App

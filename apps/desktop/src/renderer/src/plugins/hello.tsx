import { useState } from 'react'
import type { ImagePlugin } from '@image/plugin-api'

/**
 * 示例插件：演示第三方扩展的最小形态
 * - 声明 manifest（权限、版本、入口）
 * - 在 activate 里通过 ctx.api 注册贡献点
 * - 往右侧栏（+1 栏）加一个可交互面板
 */
export const helloPlugin: ImagePlugin = {
  manifest: {
    id: 'com.image.hello',
    name: '示例插件',
    version: '0.1.0',
    description: '演示插件 API：往右侧栏加一个工具面板',
    author: 'GrayOcean0133',
    main: 'hello.tsx',
    permissions: ['storage']
  },

  activate(ctx) {
    // 面板组件只在激活时创建一次，保证跨渲染保留组件状态
    function HelloPanel(): React.JSX.Element {
      const [count, setCount] = useState<number>(() => ctx.storage.get<number>('clicks', 0))
      return (
        <div className="plugin-card">
          <p>
            这是由 <code>@image/plugin-api</code> 注册的第三方面板。
          </p>
          <button
            className="seg"
            type="button"
            onClick={() => {
              const next = count + 1
              setCount(next)
              ctx.storage.set('clicks', next)
              ctx.logger.info('clicked', next)
            }}
          >
            点我（已存 {count} 次）
          </button>
        </div>
      )
    }

    ctx.api.addPanel({
      id: 'com.image.hello.panel',
      title: '示例插件',
      description: '第三方插件 · 贡献点：右侧工具面板',
      render: () => <HelloPanel />
    })
  }
}

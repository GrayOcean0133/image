# 插件 API（v0.1 · 接口已预留）

`.image` 从第一天就把**第三方扩展**考虑进来了。当前版本提供了稳定的类型契约与注册表，第三方插件可以：

- 往 **+1 右侧栏** 添加工具面板
- 注册 **判题器**（可替换/补充 AI 判题，例如本地符号验证）
- 注册 **题目导入器**（PDF / Word / 图片 / 自定义格式）
- 注册 **草稿纸纸型**
- 注册 **LLM 供应商适配**

> 状态说明：v0.1 是「同进程注册」——插件与宿主共享渲染进程，**只信任可信插件**。
> 磁盘加载（`userData/plugins/<id>/manifest.json`）与能力沙箱（权限拦截）在后续版本实现，接口面不变。

## 最小插件

```ts
import type { ImagePlugin } from '@image/plugin-api'

export const myPlugin: ImagePlugin = {
  manifest: {
    id: 'com.example.my-plugin',
    name: '我的插件',
    version: '0.1.0',
    main: 'index.tsx',
    permissions: ['storage']
  },

  activate(ctx) {
    ctx.api.addPanel({
      id: 'com.example.my-plugin.panel',
      title: '我的面板',
      render: () => <div>Hello, .image</div>
    })
  }
}
```

宿主侧：

```ts
import { registry } from '@image/plugin-api'
await registry.load(myPlugin)
registry.listPanels() // → 面板列表
```

## 清单（manifest）

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | ✅ | 反向域名式唯一标识，如 `com.example.hello` |
| `name` | ✅ | 展示名 |
| `version` | ✅ | 插件版本（semver） |
| `main` | ✅ | 入口模块路径 |
| `description` / `author` | | 展示信息 |
| `permissions` | | `llm` / `storage` / `network` / `fs` |

## 贡献点

| API | 说明 | 现状 |
| --- | --- | --- |
| `addPanel()` | +1 栏工具面板 | ✅ 已渲染 |
| `addJudge()` | 判题器（`match` + `judge`） | 接口就绪，宿主接入中 |
| `addImporter()` | 题目导入器 | 接口就绪 |
| `addPaper()` | 草稿纸纸型 | 接口就绪 |
| `addProvider()` | LLM 供应商适配 | 接口就绪 |

所有贡献点 id 必须全局唯一，重复注册会抛错（便于排查插件冲突）。

## 判题器接口

```ts
interface JudgeContribution {
  id: string
  title: string
  match(question: QuestionRef): boolean
  judge(input: JudgeInput, ctx: PluginContext): Promise<JudgeResult>
}

interface JudgeResult {
  verdict: 'correct' | 'wrong' | 'unsure'
  score?: number          // 百分制参考分
  firstErrorStep?: number // 第一个出错的步骤（从 1 开始）
  message?: string
}
```

多个判题器可并存，宿主按 `match()` 选第一个命中的；命中者异常时回退到内置 AI 判题。

## 上下文

`PluginContext` 只给插件三类东西：`api`（注册贡献）、`logger`（带插件 id 前缀的日志）、`storage`（自动加命名空间的 localStorage）。插件拿不到宿主内部对象，这是后续加沙箱的基础。

## 版本与兼容

- 插件只依赖 `@image/plugin-api` 的类型面，**不直接引用宿主 UI 组件**。
- 接口遵循 semver：破坏性变更随主版本号推进，`ImageApi` 只增不改。
- 示例插件：`apps/desktop/src/renderer/src/plugins/hello.tsx`（右栏"示例插件"面板）。

import type { ReactNode } from 'react'

/** 插件可声明的能力；宿主据此决定是否开放对应 API（v0.1 仅做声明与展示，拦截在后续版本实现） */
export type PluginPermission = 'llm' | 'storage' | 'network' | 'fs'

/** 插件清单。约定字段为后续发布到 npm / 插件市场保留 */
export interface PluginManifest {
  /** 反向域名，全局唯一，如 com.example.my-plugin */
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** 入口模块路径，相对清单文件 */
  main: string
  permissions?: PluginPermission[]
}

/** 宿主暴露给插件的工具函数 */
export interface PluginLogger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/** 插件级命名空间存储（localStorage 封装，键自动加前缀） */
export interface PluginStorage {
  get<T>(key: string, fallback: T): T
  set(key: string, value: unknown): void
}

/** 插件运行上下文：由宿主在 activate 时注入 */
export interface PluginContext {
  pluginId: string
  api: ImageApi
  logger: PluginLogger
  storage: PluginStorage
}

/** 题目/作答的最小视图，插件拿到的都是快照，不直接改宿主数据 */
export interface QuestionRef {
  id: string
  type: 'choice' | 'fill' | 'essay' | 'proof' | 'code'
  stem: string
}

export interface DraftSnapshot {
  /** 位图（data URL）或代码文本；判题插件按需处理 */
  kind: 'image' | 'code'
  data: string
}

export interface JudgeInput {
  question: QuestionRef
  draft: DraftSnapshot
  answer?: string
}

export type Verdict = 'correct' | 'wrong' | 'unsure'

export interface JudgeResult {
  verdict: Verdict
  /** 百分制参考分，仅作展示 */
  score?: number
  /** 第一个出错的步骤序号（从 1 开始） */
  firstErrorStep?: number
  message?: string
}

/** 贡献点：右侧工具面板（+1 栏），返回任意 React 节点 */
export interface PanelContribution {
  id: string
  title: string
  description?: string
  render(): ReactNode
}

/** 贡献点：判题器。可以多个并存，宿主按 match 选择 */
export interface JudgeContribution {
  id: string
  title: string
  match(question: QuestionRef): boolean
  judge(input: JudgeInput, ctx: PluginContext): Promise<JudgeResult>
}

/** 贡献点：题目导入器（PDF / Word / 图片 / 自定义格式） */
export interface ImporterContribution {
  id: string
  title: string
  extensions: string[]
  import(file: File, ctx: PluginContext): Promise<unknown[]>
}

/** 贡献点：草稿纸纸型 */
export interface PaperContribution {
  id: string
  title: string
  kind: 'blank' | 'ruled' | 'code' | string
}

/** 贡献点：LLM 供应商适配（统一 OpenAI 兼容协议，插件补充私有字段） */
export interface ProviderContribution {
  id: string
  title: string
  protocol: 'openai-compatible'
  defaults?: Record<string, unknown>
}

/** 插件可调用的注册 API —— 第三方开发者唯一需要面对的接口面 */
export interface ImageApi {
  addPanel(panel: PanelContribution): void
  addJudge(judge: JudgeContribution): void
  addImporter(importer: ImporterContribution): void
  addPaper(paper: PaperContribution): void
  addProvider(provider: ProviderContribution): void
}

/** 插件入口模块的默认导出形状 */
export interface ImagePlugin {
  manifest: PluginManifest
  activate(ctx: PluginContext): void | Promise<void>
  deactivate?(): void
}

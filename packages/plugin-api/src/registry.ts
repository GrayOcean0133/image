import type {
  ImageApi,
  ImagePlugin,
  ImporterContribution,
  JudgeContribution,
  PanelContribution,
  PaperContribution,
  PluginContext,
  PluginManifest,
  PluginStorage,
  ProviderContribution
} from './types'

function assertUnique<T>(map: Map<string, T>, id: string, kind: string): void {
  if (map.has(id)) {
    throw new Error(`[plugin] duplicate ${kind} id: ${id}`)
  }
}

function storageFor(pluginId: string): PluginStorage {
  const prefix = `image.plugin.${pluginId}.`
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = localStorage.getItem(prefix + key)
        return raw == null ? fallback : (JSON.parse(raw) as T)
      } catch {
        return fallback
      }
    },
    set(key: string, value: unknown): void {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value))
      } catch {
        // 存储满或不可用时静默失败，插件不应因此崩溃
      }
    }
  }
}

/** 校验清单的最小合法性；加载器在读取磁盘插件时复用 */
export function validateManifest(manifest: PluginManifest): string[] {
  const errors: string[] = []
  if (!manifest.id || !/^[a-zA-Z0-9._-]+$/.test(manifest.id)) {
    errors.push('manifest.id 必须是非空的反向域名（字母/数字/._-）')
  }
  if (!manifest.name) errors.push('manifest.name 不能为空')
  if (!manifest.version) errors.push('manifest.version 不能为空')
  if (!manifest.main) errors.push('manifest.main 不能为空')
  return errors
}

/**
 * 插件注册表（单例）。
 * v0.1 直接在主进程同源的渲染层里注册；后续版本再接入磁盘加载 + 能力沙箱。
 */
export class PluginRegistry {
  private panels = new Map<string, PanelContribution>()
  private judges = new Map<string, JudgeContribution>()
  private importers = new Map<string, ImporterContribution>()
  private papers = new Map<string, PaperContribution>()
  private providers = new Map<string, ProviderContribution>()
  private loaded = new Set<string>()

  /** 贡献点 id -> 插件 id，卸载时据此精确回收 */
  private owners = new Map<string, string>()

  /** 为某个插件构造受限的注册 API */
  apiFor(pluginId: string): ImageApi {
    const own = (kind: string, id: string): void => {
      this.owners.set(`${kind}:${id}`, pluginId)
    }
    return {
      addPanel: (panel) => {
        assertUnique(this.panels, panel.id, 'panel')
        this.panels.set(panel.id, panel)
        own('panel', panel.id)
      },
      addJudge: (judge) => {
        assertUnique(this.judges, judge.id, 'judge')
        this.judges.set(judge.id, judge)
        own('judge', judge.id)
      },
      addImporter: (importer) => {
        assertUnique(this.importers, importer.id, 'importer')
        this.importers.set(importer.id, importer)
        own('importer', importer.id)
      },
      addPaper: (paper) => {
        assertUnique(this.papers, paper.id, 'paper')
        this.papers.set(paper.id, paper)
        own('paper', paper.id)
      },
      addProvider: (provider) => {
        assertUnique(this.providers, provider.id, 'provider')
        this.providers.set(provider.id, provider)
        own('provider', provider.id)
      }
    }
  }

  contextFor(plugin: ImagePlugin): PluginContext {
    const { id } = plugin.manifest
    return {
      pluginId: id,
      api: this.apiFor(id),
      logger: {
        info: (...args) => console.info(`[${id}]`, ...args),
        warn: (...args) => console.warn(`[${id}]`, ...args),
        error: (...args) => console.error(`[${id}]`, ...args)
      },
      storage: storageFor(id)
    }
  }

  /** 激活插件；重复激活会被忽略 */
  async load(plugin: ImagePlugin): Promise<void> {
    const errors = validateManifest(plugin.manifest)
    if (errors.length) {
      throw new Error(`[plugin] invalid manifest for "${plugin.manifest.id}": ${errors.join('; ')}`)
    }
    if (this.loaded.has(plugin.manifest.id)) return
    await plugin.activate(this.contextFor(plugin))
    this.loaded.add(plugin.manifest.id)
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id)
  }

  /** 卸载插件：回收它注册过的全部贡献点（宿主切换开关时调用） */
  async unload(pluginId: string): Promise<void> {
    const prefixKinds: Record<string, Map<string, unknown>> = {
      panel: this.panels,
      judge: this.judges,
      importer: this.importers,
      paper: this.papers,
      provider: this.providers
    }
    for (const [key, owner] of this.owners) {
      if (owner !== pluginId) continue
      const sep = key.indexOf(':')
      const kind = key.slice(0, sep)
      const id = key.slice(sep + 1)
      prefixKinds[kind]?.delete(id)
      this.owners.delete(key)
    }
    this.loaded.delete(pluginId)
  }

  listLoadedPlugins(): string[] {
    return [...this.loaded]
  }

  listPanels(): PanelContribution[] {
    return [...this.panels.values()]
  }

  listJudges(): JudgeContribution[] {
    return [...this.judges.values()]
  }

  listImporters(): ImporterContribution[] {
    return [...this.importers.values()]
  }

  listPapers(): PaperContribution[] {
    return [...this.papers.values()]
  }

  listProviders(): ProviderContribution[] {
    return [...this.providers.values()]
  }
}

/** 全局单例，渲染层直接引用 */
export const registry = new PluginRegistry()

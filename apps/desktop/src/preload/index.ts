import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 扩展给渲染进程的 API（后续：题库 / 判题 / 同步 的 IPC 桥）
const api = {}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}

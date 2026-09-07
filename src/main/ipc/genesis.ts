/**
 * genesis 域 IPC：构思台五步设定存取。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import { getBookGenesis, saveGenesisStep } from '../db/genesis'
import type { GenesisStep, GenesisStepData, SaveGenesisInput } from '../../shared/genesis.types'

export function registerGenesisIpc(): void {
  ipcMain.handle('genesis:get', (_e, bookId: string) => wrap(() => getBookGenesis(bookId)))

  ipcMain.handle(
    'genesis:save',
    (_e, bookId: string, input: SaveGenesisInput) =>
      wrap(() => saveGenesisStep(bookId, input))
  )

  // 静默保存单步便捷方法（前端自动保存用）
  ipcMain.handle(
    'genesis:save-step',
    (_e, bookId: string, step: GenesisStep, data: GenesisStepData, isDone: boolean) =>
      wrap(() => saveGenesisStep(bookId, { step, data, isDone }))
  )
}

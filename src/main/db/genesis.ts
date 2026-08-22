/**
 * genesis_steps 表 DAO：创世台五步设定存取。
 * 每书每步一行（复合主键 book_id+step）；data 为 JSON 字符串。
 */
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type {
  GenesisStep,
  GenesisStepData,
  GenesisStepRecord,
  SaveGenesisInput
} from '../../shared/genesis.types'

interface GenesisRow {
  book_id: string
  step: number
  data: string
  is_done: number
  updated_at: string
}

function toRecord(r: GenesisRow): GenesisStepRecord {
  let data: GenesisStepData | null = null
  try {
    data = JSON.parse(r.data) as GenesisStepData
    if (r.data === '{}' || r.data === 'null') data = null
  } catch {
    data = null
  }
  return {
    bookId: r.book_id,
    step: r.step as GenesisStep,
    data,
    isDone: r.is_done === 1,
    updatedAt: r.updated_at
  }
}

/** 取某书全部五步记录（未做的步骤不返回，调用方按 step 补默认） */
export function getBookGenesis(bookId: string): GenesisStepRecord[] {
  const d: Database = getDb()
  return (
    d.prepare('SELECT * FROM genesis_steps WHERE book_id = ? ORDER BY step ASC').all(bookId) as GenesisRow[]
  ).map(toRecord)
}

/** 取单步 */
export function getGenesisStep(bookId: string, step: GenesisStep): GenesisStepRecord | undefined {
  const d: Database = getDb()
  const row = d
    .prepare('SELECT * FROM genesis_steps WHERE book_id = ? AND step = ?')
    .get(bookId, step) as GenesisRow | undefined
  return row ? toRecord(row) : undefined
}

/** 保存某步（UPSERT） */
export function saveGenesisStep(bookId: string, input: SaveGenesisInput): GenesisStepRecord {
  const d: Database = getDb()
  const now = new Date().toISOString()
  const isDone = input.isDone ?? false
  d.prepare(
    `INSERT INTO genesis_steps (book_id, step, data, is_done, updated_at)
     VALUES (@book_id, @step, @data, @is_done, @updated_at)
     ON CONFLICT(book_id, step) DO UPDATE SET
       data = excluded.data, is_done = excluded.is_done, updated_at = excluded.updated_at`
  ).run({
    book_id: bookId,
    step: input.step,
    data: JSON.stringify(input.data),
    is_done: isDone ? 1 : 0,
    updated_at: now
  })
  return getGenesisStep(bookId, input.step)!
}

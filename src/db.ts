import sqlite3InitModule, { type Database, type SqlValue } from '@sqlite.org/sqlite-wasm'

export type QueryResult = {
  columns: string[]
  values: unknown[][]
}

export class SqliteAdapter {
  private db: Database | null = null

  async init(): Promise<void> {
    if (this.db) return
    const sqlite3 = await sqlite3InitModule()
    this.db = new sqlite3.oo1.DB(':memory:', 'c')
  }

  private quoteIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`
  }

  async syncTable(name: string, headers: string[], rows: string[][]): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('SQLite is not initialized')
    const tableName = this.quoteIdentifier(name)
    this.db.exec(`DROP TABLE IF EXISTS ${tableName}`)
    const columns = headers.map((header) => `${this.quoteIdentifier(header)} TEXT`).join(', ')
    this.db.exec(`CREATE TABLE ${tableName} (${columns})`)
    if (rows.length === 0) return

    const placeholders = headers.map(() => '?').join(', ')
    const statement = this.db.prepare(`INSERT INTO ${tableName} VALUES (${placeholders})`)
    try {
      this.db.exec('BEGIN')
      for (const row of rows) {
        const values = headers.map((_, index) => row[index] ?? '')
        statement.bind(values as SqlValue[])
        statement.step()
        statement.reset(true)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    } finally {
      statement.finalize()
    }
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    await this.init()
    if (!this.db) throw new Error('SQLite is not initialized')
    const statement = this.db.prepare(sql)
    try {
      const columns = statement.getColumnNames([])
      const values: unknown[][] = []
      while (statement.step()) {
        values.push(statement.get([]) as unknown[])
      }
      return { columns, values }
    } finally {
      statement.finalize()
    }
  }

  async dropTable(name: string): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('SQLite is not initialized')
    this.db.exec(`DROP TABLE IF EXISTS ${this.quoteIdentifier(name)}`)
  }
}

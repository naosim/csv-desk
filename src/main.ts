import './style.css'
import { parseCsv, serializeCsv, inferColumnType, type CsvTable } from './csv'
import { SqliteAdapter } from './db'

const app = document.querySelector<HTMLDivElement>('#app')!
const sqlite = new SqliteAdapter()

type TableMeta = {
  schema: Record<string, 'auto' | 'string' | 'number' | 'boolean' | 'date'>
  undo: string[][][]
  redo: string[][][]
  editSnapshot: string[][] | null
}

const tables: CsvTable[] = []
const meta = new Map<CsvTable, TableMeta>()
let activeTable: CsvTable | null = null
let sqlText = 'SELECT * FROM '

function tableName(table: CsvTable): string {
  const base = table.name.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9_]/g, '_')
  return /^[0-9]/.test(base) ? `table_${base}` : base
}

function getMeta(table: CsvTable): TableMeta {
  if (!meta.has(table)) {
    meta.set(table, { schema: {}, undo: [], redo: [], editSnapshot: null })
  }
  return meta.get(table)!
}

app.innerHTML = `
  <header class="topbar">
    <div class="brand">CSV Desk</div>
    <div class="actions">
      <input id="fileInput" type="file" accept=".csv,text/csv" multiple hidden>
      <button id="newButton">新規作成</button>
      <button id="openButton">CSVを開く</button>
      <button id="saveButton">保存</button>
      <button id="addRowButton">行を追加</button>
      <button id="addColumnButton">列を追加</button>
      <button id="undoButton">Undo</button>
      <button id="redoButton">Redo</button>
    </div>
  </header>
  <nav id="tabs" class="tabs"></nav>
  <main class="workspace">
    <aside class="sidebar">
      <h2>テーブル</h2>
      <div id="tableList"></div>
    </aside>
    <section class="editor">
      <div id="grid" class="grid"></div>
      <section class="sqlPane">
        <textarea id="sqlEditor" spellcheck="false"></textarea>
        <div class="sqlActions">
          <button id="runButton" class="primary">実行 (Ctrl+Enter)</button>
          <button id="exportResultButton">結果をCSV出力</button>
          <button id="promoteButton">新規編集タブへ</button>
        </div>
        <div id="queryStatus" class="status"></div>
        <div id="result" class="result"></div>
      </section>
    </section>
  </main>
`

const fileInput = document.querySelector<HTMLInputElement>('#fileInput')!
const sqlEditor = document.querySelector<HTMLTextAreaElement>('#sqlEditor')!
sqlEditor.value = sqlText

let lastResult: { columns: string[]; values: unknown[][] } | null = null

function snapshotRows(table: CsvTable): string[][] {
  return table.rows.map((row) => [...row])
}

function pushUndo(table: CsvTable) {
  const tableMeta = getMeta(table)
  tableMeta.undo.push(snapshotRows(table))
  if (tableMeta.undo.length > 100) tableMeta.undo.shift()
  tableMeta.redo = []
  table.dirty = true
  renderTabs()
}

function renderTabs() {
  const tabs = document.querySelector<HTMLDivElement>('#tabs')!
  tabs.innerHTML = tables.map((table, index) => `
    <button class="tab ${table === activeTable ? 'active' : ''}" data-index="${index}">
      ${escapeHtml(table.name)}${table.dirty ? '*' : ''}
    </button>
  `).join('')
  tabs.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTable = tables[Number(tab.dataset.index)]
      renderAll()
    })
  })

  const tableList = document.querySelector<HTMLDivElement>('#tableList')!
  tableList.innerHTML = tables.map((table) => {
    const rows = table.rows.map((row) => row.map((value) => value.length > 18 ? `${value.slice(0, 18)}…` : value))
    void rows
    return `<button class="tableItem ${table === activeTable ? 'active' : ''}" data-name="${escapeHtml(tableName(table))}">
      ${escapeHtml(tableName(table))}
    </button>`
  }).join('')
  tableList.querySelectorAll<HTMLButtonElement>('.tableItem').forEach((item) => {
    item.addEventListener('click', () => {
      sqlEditor.setRangeText(`${item.dataset.name}.`, sqlEditor.selectionStart, sqlEditor.selectionEnd, 'end')
      sqlEditor.focus()
    })
  })
}

function renderGrid() {
  const grid = document.querySelector<HTMLDivElement>('#grid')!
  if (!activeTable) {
    grid.innerHTML = '<div class="empty">CSVファイルを開くか、ドラッグ＆ドロップしてください。</div>'
    return
  }
  const table = activeTable
  const tableMeta = getMeta(table)
  grid.innerHTML = `
    <table>
      <thead><tr><th class="rowNumber"></th>${table.headers.map((header, column) => {
        const values = table.rows.map((row) => row[column] ?? '')
        const inferred = inferColumnType(values)
        const selected = tableMeta.schema[header] || 'auto'
        return `<th>
          <div class="headerTitle">${escapeHtml(header)}</div>
          <select class="typeSelect" data-column="${column}" title="列型">
            ${(['auto', 'string', 'number', 'boolean', 'date'] as const).map((type) =>
              `<option value="${type}" ${selected === type ? 'selected' : ''}>${type === 'auto' ? `自動(${inferred})` : type}</option>`
            ).join('')}
          </select>
        </th>`
      }).join('')}</tr></thead>
      <tbody>${table.rows.map((row, rowIndex) => `
        <tr><th class="rowNumber">${rowIndex + 1}</th>
          ${table.headers.map((_, column) => `
            <td contenteditable="true" spellcheck="false" data-row="${rowIndex}" data-column="${column}">${escapeHtml(row[column] ?? '').replace(/\n/g, '<br>')}</td>
          `).join('')}
        </tr>
      `).join('')}</tbody>
    </table>
  `

  grid.querySelectorAll<HTMLTableCellElement>('td[contenteditable]').forEach((cell) => {
    cell.addEventListener('focus', () => {
      if (activeTable) getMeta(activeTable).editSnapshot = snapshotRows(activeTable)
    })
    cell.addEventListener('input', () => {
      if (!activeTable) return
      const row = Number(cell.dataset.row)
      const column = Number(cell.dataset.column)
      activeTable.rows[row][column] = cell.innerText.replace(/\n/g, '\n')
      activeTable.dirty = true
    })
    cell.addEventListener('blur', () => {
      if (!activeTable) return
      const tableMeta = getMeta(activeTable)
      if (tableMeta.editSnapshot) {
        tableMeta.undo.push(tableMeta.editSnapshot)
        if (tableMeta.undo.length > 100) tableMeta.undo.shift()
        tableMeta.redo = []
        tableMeta.editSnapshot = null
      }
      renderTabs()
    })
  })

  grid.querySelectorAll<HTMLSelectElement>('.typeSelect').forEach((select) => {
    select.addEventListener('change', () => {
      const column = Number(select.dataset.column)
      const header = table.headers[column]
      tableMeta.schema[header] = select.value as TableMeta['schema'][string]
      renderGrid()
    })
  })
}

function renderAll() {
  renderTabs()
  renderGrid()
  if (activeTable) {
    sqlText = sqlText || `SELECT * FROM ${tableName(activeTable)}`
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function createNewTable() {
  let number = tables.filter((table) => /^untitled(?:_\d+)?\.csv$/.test(table.name)).length + 1
  const name = number === 1 ? 'untitled.csv' : `untitled_${number}.csv`
  const table: CsvTable = {
    name,
    headers: ['Column1'],
    rows: [['']],
    newline: '\n',
    dirty: true,
  }
  tables.push(table)
  activeTable = table
  sqlEditor.value = `SELECT * FROM ${tableName(table)}`
  renderAll()
}

async function openFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    if (!file.name.toLowerCase().endsWith('.csv')) continue
    const text = await file.text()
    try {
      const parsed = parseCsv(text)
      const table: CsvTable = { name: file.name, ...parsed, dirty: false }
      tables.push(table)
      activeTable = table
    } catch (error) {
      setStatus(`読み込みエラー: ${error instanceof Error ? error.message : String(error)}`, true)
    }
  }
  if (!sqlEditor.value.trim() && activeTable) sqlEditor.value = `SELECT * FROM ${tableName(activeTable)}`
  renderAll()
}

function saveActive() {
  if (!activeTable) return
  const csv = serializeCsv(activeTable.headers, activeTable.rows, activeTable.newline)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = activeTable.name
  anchor.click()
  URL.revokeObjectURL(url)
  activeTable.dirty = false
  renderTabs()
}

function setStatus(message: string, error = false) {
  const status = document.querySelector<HTMLDivElement>('#queryStatus')!
  status.textContent = message
  status.className = `status ${error ? 'error' : ''}`
}

async function runQuery() {
  if (tables.length === 0) {
    setStatus('テーブルがありません。まずCSVを開いてください。', true)
    return
  }
  setStatus('SQLiteへ同期しています...')
  try {
    for (const table of tables) {
      await sqlite.syncTable(tableName(table), table.headers, table.rows)
    }
    lastResult = await sqlite.executeQuery(sqlEditor.value)
    renderResult(lastResult)
    setStatus(`${lastResult.values.length} 行`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true)
  }
}

function renderResult(result: { columns: string[]; values: unknown[][] }) {
  const resultElement = document.querySelector<HTMLDivElement>('#result')!
  if (result.columns.length === 0) {
    resultElement.innerHTML = '<div class="empty">クエリは実行されました。</div>'
    return
  }
  resultElement.innerHTML = `
    <table>
      <thead><tr>${result.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
      <tbody>${result.values.map((row) =>
        `<tr>${result.columns.map((_, index) => `<td>${escapeHtml(String(row[index] ?? ''))}</td>`).join('')}</tr>`
      ).join('')}</tbody>
    </table>
  `
}

document.querySelector('#newButton')!.addEventListener('click', createNewTable)
document.querySelector('#openButton')!.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  if (fileInput.files) void openFiles(fileInput.files)
})
document.querySelector('#saveButton')!.addEventListener('click', saveActive)
document.querySelector('#runButton')!.addEventListener('click', () => void runQuery())
sqlEditor.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === 'Enter') void runQuery()
})

document.querySelector('#addRowButton')!.addEventListener('click', () => {
  if (!activeTable) return
  pushUndo(activeTable)
  activeTable.rows.push(activeTable.headers.map(() => ''))
  renderAll()
})

document.querySelector('#addColumnButton')!.addEventListener('click', () => {
  if (!activeTable) return
  pushUndo(activeTable)
  const index = activeTable.headers.length + 1
  activeTable.headers.push(`Column${index}`)
  activeTable.rows.forEach((row) => row.push(''))
  renderAll()
})

document.querySelector('#undoButton')!.addEventListener('click', () => {
  if (!activeTable) return
  const tableMeta = getMeta(activeTable)
  const previous = tableMeta.undo.pop()
  if (!previous) return
  tableMeta.redo.push(snapshotRows(activeTable))
  activeTable.rows = previous
  activeTable.dirty = true
  renderAll()
})

document.querySelector('#redoButton')!.addEventListener('click', () => {
  if (!activeTable) return
  const tableMeta = getMeta(activeTable)
  const next = tableMeta.redo.pop()
  if (!next) return
  tableMeta.undo.push(snapshotRows(activeTable))
  activeTable.rows = next
  activeTable.dirty = true
  renderAll()
})

document.querySelector('#exportResultButton')!.addEventListener('click', () => {
  if (!lastResult) return
  const rows = lastResult.values.map((row) => row.map((value) => String(value ?? '')))
  const csv = serializeCsv(lastResult.columns, rows, '\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'query-result.csv'
  anchor.click()
  URL.revokeObjectURL(url)
})

document.querySelector('#promoteButton')!.addEventListener('click', () => {
  if (!lastResult) return
  const rows = lastResult.values.map((row) => row.map((value) => String(value ?? '')))
  const table: CsvTable = { name: `query_${tables.length + 1}.csv`, headers: lastResult.columns, rows, newline: '\n', dirty: true }
  tables.push(table)
  activeTable = table
  renderAll()
})

window.addEventListener('dragover', (event) => event.preventDefault())
window.addEventListener('drop', (event) => {
  event.preventDefault()
  if (event.dataTransfer?.files) void openFiles(event.dataTransfer.files)
})

renderAll()

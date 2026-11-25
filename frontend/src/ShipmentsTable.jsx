import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DataGrid } from 'react-data-grid'
import 'react-data-grid/lib/styles.css'

const RESERVE = ['reserve_1', 'reserve_2', 'reserve_3']

function canEditCell(role, key, row, editUntil) {
  if (role === 'admin') return true

  if (role === 'temp-admin') {
    if (key === 'overage') return false
    if (key.startsWith('reserve_')) return true

    return row.isNew || !row.date ||
      (!!editUntil && row.date >= editUntil)
  }

  return key.startsWith('reserve_')
}

const fmtDate = (v) => {
  if (!v) return ''
  const [y, m, d] = String(v).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ---------- Даты в формате дд/мм/гггг ----------

// 'YYYY-MM-DD' -> 'дд/мм/гггг'
const isoToDisplay = (iso) => iso ? fmtDate(iso) : ''

// Маска: оставляет цифры и расставляет слэши -> 'дд/мм/гггг'
const maskDate = (raw) => {
  const d = String(raw).replace(/\D/g, '').slice(0, 8)

  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

// 'дд/мм/гггг' -> 'YYYY-MM-DD' (или null, если неполная/несуществующая дата)
const displayToIso = (text) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!m) return null

  const [, dd, mm, yyyy] = m
  const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd))

  if (
    dt.getFullYear() !== Number(yyyy) ||
    dt.getMonth() !== Number(mm) - 1 ||
    dt.getDate() !== Number(dd)
  ) return null

  return `${yyyy}-${mm}-${dd}`
}

// Текстовое поле даты для фильтров: наружу отдаёт ISO ('' если пусто)
function DateTextField({ value, onChange }) {
  const [text, setText] = useState(isoToDisplay(value))

  useEffect(() => {
    if ((displayToIso(text) ?? '') !== (value ?? '')) {
      setText(isoToDisplay(value))
    }
  }, [value])

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="дд/мм/гггг"
      maxLength={10}
      value={text}
      onChange={e => {
        const masked = maskDate(e.target.value)
        setText(masked)

        if (masked === '') {
          onChange('')
          return
        }

        const iso = displayToIso(masked)
        if (iso) onChange(iso)
      }}
    />
  )
}

// ---------- Фильтры: общая логика ----------

// ФИО и телефон в одной колонке: «ФИО, телефон»
const contactText = (row) =>
  [row.full_name, row.phone]
    .map(v => String(v ?? '').trim())
    .filter(Boolean)
    .join(', ')

// «ФИО, телефон» -> { full_name, phone }
const parseContact = (text) => {
  const t = String(text ?? '')
  const i = t.indexOf(',')

  if (i === -1) {
    // одно только число — считаем телефоном
    if (/^[+()\d\s-]+$/.test(t) && /\d{5,}/.test(t)) {
      return { full_name: '', phone: t.trim() }
    }

    return { full_name: t.trim(), phone: '' }
  }

  return {
    full_name: t.slice(0, i).trim(),
    phone: t.slice(i + 1).trim()
  }
}

const cellValue = (row, key) =>
  key === 'contact'
    ? contactText(row)
    : key === 'overage'
      ? String(!!row[key])
      : String(row[key] ?? '').trim()

const isDateKey = (key) => key === 'date' || key === 'trip_paid_at'

const isFilterActive = (f) =>
  !!f && (f.selected != null || !!f.from || !!f.to)

const matchesFilter = (row, key, f) => {
  if (!isFilterActive(f)) return true

  if (isDateKey(key)) {
    const v = row[key] ? String(row[key]).slice(0, 10) : ''

    if (f.selected != null && !f.selected.includes(v.slice(0, 7))) return false
    if (f.from && (!v || v < f.from)) return false
    if (f.to && (!v || v > f.to)) return false
    return true
  }

  return f.selected == null || f.selected.includes(cellValue(row, key))
}

const monthLabel = (m) => {
  if (m === '') return '(Пусто)'
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric'
  })
}


function TextInput({ row, column, onRowChange, onClose, rows }) {
  const ref = useRef(null)
  const activeSuggestionRef = useRef(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState({})

  const value = String(row[column.key] ?? '')

  const suggestions = [...new Set(
    rows
      .filter(r => r.id !== row.id)
      .map(r => r[column.key])
      .filter(v => v != null && String(v).trim() !== '')
      .map(String)
  )]
    .filter(item =>
      item.toLowerCase().includes(value.toLowerCase().trim())
    )
    .slice(0, 10)

  const updateDropdownPosition = () => {
    if (!ref.current) return

    const rect = ref.current.getBoundingClientRect()

    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom,
      left: rect.left,
      width: Math.max(rect.width, 220),
      maxHeight: 220,
      zIndex: 9999999
    })
  }
  useEffect(() => {
  activeSuggestionRef.current?.scrollIntoView({
    block: 'nearest',
    behavior: 'smooth'
  })
}, [activeSuggestion])

  const selectSuggestion = (item) => {
    onRowChange({
      ...row,
      [column.key]: item
    })

    setShowSuggestions(false)
    setActiveSuggestion(0)
    ref.current?.focus()
  }

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()

    requestAnimationFrame(updateDropdownPosition)
  }, [])

  return (
    <>
      <input
        ref={ref}
        className="rdg-text-editor"
        value={value}

        onChange={e => {
          onRowChange({
            ...row,
            [column.key]: e.target.value
          })

          setActiveSuggestion(0)
          setShowSuggestions(true)
          updateDropdownPosition()
        }}

        onFocus={() => {
          setShowSuggestions(true)
          updateDropdownPosition()
        }}

        onBlur={() => {
          setTimeout(() => {
            setShowSuggestions(false)
            onClose(true, false)
          }, 200)
        }}

        onKeyDown={e => {
          if (e.key === 'ArrowDown' && suggestions.length > 0) {
            e.preventDefault()
            e.stopPropagation()

            setShowSuggestions(true)

            setActiveSuggestion(prev =>
              prev < suggestions.length - 1 ? prev + 1 : 0
            )

            return
          }

          if (e.key === 'ArrowUp' && suggestions.length > 0) {
            e.preventDefault()
            e.stopPropagation()

            setShowSuggestions(true)

            setActiveSuggestion(prev =>
              prev > 0 ? prev - 1 : suggestions.length - 1
            )

            return
          }

          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()

            if (showSuggestions && suggestions.length > 0) {
              const selected =
                suggestions[activeSuggestion] ?? suggestions[0]

              selectSuggestion(selected)
              return
            }

            onClose(true, true)
          }

          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()

            setShowSuggestions(false)
            onClose(false, true)
          }
        }}
      />

      {showSuggestions && suggestions.length > 0 &&
        createPortal(
          <div
            className="suggestions-list"
            style={dropdownStyle}
          >
            {suggestions.map((item, index) => (
              <div
                key={item}
                ref={index === activeSuggestion ? activeSuggestionRef : null}
                className={`suggestion-item ${
                  index === activeSuggestion ? 'suggestion-active' : ''
                }`}

                onMouseEnter={() => setActiveSuggestion(index)}

                onMouseDown={e => {
                  e.preventDefault()
                  selectSuggestion(item)
                }}
              >
                {item}
              </div>
            ))}
          </div>,
          document.body
        )
      }
    </>
  )
}

// Редактор колонки «ФИО, телефон»: одно поле, подсказки по уже введённым людям.
// Выбор подсказки подставляет и ФИО, и телефон.
function ContactInput({ row, onRowChange, onClose, rows }) {
  const ref = useRef(null)
  const activeSuggestionRef = useRef(null)
  const [text, setText] = useState(contactText(row))
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState({})

  const query = text.toLowerCase().trim()

  const suggestions = [...new Set(
    rows
      .filter(r => r.id !== row.id)
      .map(contactText)
      .filter(v => v !== '')
  )]
    .filter(item => item.toLowerCase().includes(query))
    .slice(0, 10)

  const updateDropdownPosition = () => {
    if (!ref.current) return

    const rect = ref.current.getBoundingClientRect()

    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom,
      left: rect.left,
      width: Math.max(rect.width, 280),
      maxHeight: 220,
      zIndex: 9999999
    })
  }

  useEffect(() => {
    activeSuggestionRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth'
    })
  }, [activeSuggestion])

  const apply = (value) => {
    setText(value)
    onRowChange({ ...row, ...parseContact(value) })
  }

  const selectSuggestion = (item) => {
    apply(item)
    setShowSuggestions(false)
    setActiveSuggestion(0)
    ref.current?.focus()
  }

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()

    requestAnimationFrame(updateDropdownPosition)
  }, [])

  return (
    <>
      <input
        ref={ref}
        className="rdg-text-editor"
        value={text}

        onChange={e => {
          apply(e.target.value)
          setActiveSuggestion(0)
          setShowSuggestions(true)
          updateDropdownPosition()
        }}

        onFocus={() => {
          setShowSuggestions(true)
          updateDropdownPosition()
        }}

        onBlur={() => {
          setTimeout(() => {
            setShowSuggestions(false)
            onClose(true, false)
          }, 200)
        }}

        onKeyDown={e => {
          if (e.key === 'ArrowDown' && suggestions.length > 0) {
            e.preventDefault()
            e.stopPropagation()
            setShowSuggestions(true)
            setActiveSuggestion(prev =>
              prev < suggestions.length - 1 ? prev + 1 : 0
            )
            return
          }

          if (e.key === 'ArrowUp' && suggestions.length > 0) {
            e.preventDefault()
            e.stopPropagation()
            setShowSuggestions(true)
            setActiveSuggestion(prev =>
              prev > 0 ? prev - 1 : suggestions.length - 1
            )
            return
          }

          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()

            if (showSuggestions && suggestions.length > 0) {
              selectSuggestion(
                suggestions[activeSuggestion] ?? suggestions[0]
              )
              return
            }

            onClose(true, true)
          }

          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setShowSuggestions(false)
            onClose(false, true)
          }
        }}
      />

      {showSuggestions && suggestions.length > 0 &&
        createPortal(
          <div className="suggestions-list" style={dropdownStyle}>
            {suggestions.map((item, index) => (
              <div
                key={item}
                ref={index === activeSuggestion ? activeSuggestionRef : null}
                className={`suggestion-item ${
                  index === activeSuggestion ? 'suggestion-active' : ''
                }`}
                onMouseEnter={() => setActiveSuggestion(index)}
                onMouseDown={e => {
                  e.preventDefault()
                  selectSuggestion(item)
                }}
              >
                {item}
              </div>
            ))}
          </div>,
          document.body
        )
      }
    </>
  )
}

// Редактор дат (ввод в формате дд/мм/гггг, в данных хранится YYYY-MM-DD)
function DateInput({ row, column, onRowChange, onClose }) {
  const ref = useRef(null)
  const [text, setText] = useState(isoToDisplay(row[column.key]))

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  // пусто или корректная полная дата
  const isValid = text === '' || displayToIso(text) !== null

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      placeholder="дд/мм/гггг"
      maxLength={10}
      className="rdg-text-editor"
      style={text !== '' && !isValid ? { color: 'crimson' } : undefined}
      value={text}
      onChange={e => {
        const masked = maskDate(e.target.value)
        setText(masked)

        if (masked === '') {
          onRowChange({ ...row, [column.key]: null })
          return
        }

        const iso = displayToIso(masked)
        if (iso) onRowChange({ ...row, [column.key]: iso })
      }}
      onBlur={() => onClose(isValid, false)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onClose(isValid, true)
        }

        if (e.key === 'Escape') {
          e.preventDefault()
          onClose(false, true)
        }
      }}
    />
  )
}

const dateEditor = (props) => <DateInput {...props} />

// API
const api = async (method, url, body) => {
  const res = await fetch(`http://localhost:3000${url}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || 'Не удалось сохранить')
  }

  return data
}

function FilterHeader({
  column,
  values,
  filter,
  onFilterChange,
  isOpen,
  onToggle,
  formatValue = v => (v === '' ? '(Пусто)' : v)
}) {
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState({})
  const buttonRef = useRef(null)

  const selected = filter?.selected ?? null
  const isFiltered = selected !== null

  const visibleValues = values.filter(value =>
    formatValue(value).toLowerCase().includes(search.toLowerCase())
  )

  const updatePosition = () => {
    if (!buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()

    setPosition({
      position: 'fixed',
      top: rect.bottom + 5,
      left: Math.min(rect.left, window.innerWidth - 270),
      zIndex: 9999999
    })
  }

  useEffect(() => {
    if (isOpen) {
      updatePosition()
    }
  }, [isOpen])

  const toggleValue = (value) => {
    const current = selected ?? values

    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]

    onFilterChange(
      next.length === values.length ? null : next
    )
  }

  return (
    <>
      <div className="filter-header">
        <span>{column.name}</span>

        <button
          ref={buttonRef}
          type="button"
          className={`filter-button ${isFiltered ? 'filter-active' : ''}`}
          onClick={() => {
            updatePosition()
            onToggle()
          }}
          title="Фильтр"
        >
          <span>▼</span>
        </button>
      </div>

      {isOpen && createPortal(
        <div className="column-filter" style={position}>
          <input
            className="filter-search"
            placeholder="Поиск..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="filter-actions">
            <button
              type="button"
              onClick={() => onFilterChange(null)}
            >
              Выбрать все
            </button>

            <button
              type="button"
              onClick={() => onFilterChange([])}
            >
              Снять все
            </button>
          </div>

          <div className="filter-values">
            {visibleValues.map(value => (
              <label key={value} className="filter-option">
                <input
                  type="checkbox"
                  checked={
                    selected === null || selected.includes(value)
                  }
                  onChange={() => toggleValue(value)}
                />

                <span>{formatValue(value)}</span>
              </label>
            ))}

            {visibleValues.length === 0 && (
              <div className="filter-empty">
                Ничего не найдено
              </div>
            )}
          </div>

          <button
            className="filter-close"
            type="button"
            onClick={onToggle}
          >
            Закрыть
          </button>
        </div>,
        document.body
      )}
    </>
  )
}

// Фильтр дат: выбор месяцев + ручной ввод диапазона
function DateFilterHeader({
  column,
  months,
  filter,
  onFilterChange,
  isOpen,
  onToggle
}) {
  const [position, setPosition] = useState({})
  const buttonRef = useRef(null)

  const selected = filter?.selected ?? null
  const from = filter?.from ?? ''
  const to = filter?.to ?? ''
  const isFiltered = selected !== null || !!from || !!to

  const updatePosition = () => {
    if (!buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()

    setPosition({
      position: 'fixed',
      top: rect.bottom + 5,
      left: Math.min(rect.left, window.innerWidth - 270),
      zIndex: 9999999
    })
  }

  useEffect(() => {
    if (isOpen) updatePosition()
  }, [isOpen])

  const toggleMonth = (m) => {
    const current = selected ?? months

    const next = current.includes(m)
      ? current.filter(v => v !== m)
      : [...current, m]

    onFilterChange({
      selected: next.length === months.length ? null : next
    })
  }

  return (
    <>
      <div className="filter-header">
        <span>{column.name}</span>

        <button
          ref={buttonRef}
          type="button"
          className={`filter-button ${isFiltered ? 'filter-active' : ''}`}
          onClick={() => {
            updatePosition()
            onToggle()
          }}
          title="Фильтр"
        >
          <span>▼</span>
        </button>
      </div>

      {isOpen && createPortal(
        <div className="column-filter" style={position}>
          <div className="filter-range">
            <label>
              С
              <DateTextField
                value={from}
                onChange={v => onFilterChange({ from: v })}
              />
            </label>

            <label>
              По
              <DateTextField
                value={to}
                onChange={v => onFilterChange({ to: v })}
              />
            </label>
          </div>

          <div className="filter-actions">
            <button
              type="button"
              onClick={() => onFilterChange({ selected: null })}
            >
              Все месяцы
            </button>

            <button
              type="button"
              onClick={() => onFilterChange({ selected: [] })}
            >
              Снять все
            </button>

            <button
              type="button"
              onClick={() =>
                onFilterChange({ selected: null, from: '', to: '' })
              }
            >
              Сбросить
            </button>
          </div>

          <div className="filter-values">
            {months.map(m => (
              <label key={m} className="filter-option">
                <input
                  type="checkbox"
                  checked={selected === null || selected.includes(m)}
                  onChange={() => toggleMonth(m)}
                />

                <span>{monthLabel(m)}</span>
              </label>
            ))}
          </div>

          <button
            className="filter-close"
            type="button"
            onClick={onToggle}
          >
            Закрыть
          </button>
        </div>,
        document.body
      )}
    </>
  )
}


export default function ShipmentsTable({ role, editUntil, canCreate }) {
  const [rows, setRows] = useState([])

  const gridRef = useRef(null)
  const draftId = useRef(0)
  const creating = useRef(new Map())
  const scrolledOnce = useRef(false)
  // Данные загружены — только после этого скролл может создавать строки
  const loaded = useRef(false)
  // Игнорируем onScroll, пока идёт программная прокрутка вниз
  const ignoreScrollUntil = useRef(0)
  const lastScrollTop = useRef(0)
  const lastAddAt = useRef(0)
  const [filters, setFilters] = useState({})
  const [openFilter, setOpenFilter] = useState(null)

  const setColumnFilter = (key, patch) => {
    setFilters(prev => ({
      ...prev,
      [key]: { selected: null, from: '', to: '', ...prev[key], ...patch }
    }))
  }

  const hasActiveFilter = Object.values(filters).some(isFilterActive)

  const filteredRows = rows.filter(row => {
    if (row.isNew) return !hasActiveFilter

    return Object.entries(filters).every(([key, f]) =>
      matchesFilter(row, key, f)
    )
  })

  // Программная прокрутка вниз: не должна считаться пользовательской
  const scrollToBottom = (length) => {
    ignoreScrollUntil.current = Date.now() + 500

    gridRef.current?.scrollToCell({
      rowIdx: length - 1,
      idx: 0
    })
  }

  useEffect(() => {
    if (filteredRows.length === 0) return
    requestAnimationFrame(() => {
      scrollToBottom(filteredRows.length)
    })
  }, [filters])

  const getColumnValues = (key) => {
    return [...new Set(
      rows
        .filter(row => !row.isNew)
        .map(row => cellValue(row, key))
        .filter(v => v !== '')
    )].sort((a, b) => a.localeCompare(b, 'ru'))
  }

  // Для дат: список месяцев 'YYYY-MM', новые сверху; '' = без даты
  const getMonthValues = (key) => {
    const set = new Set(
      rows
        .filter(r => !r.isNew)
        .map(r => (r[key] ? String(r[key]).slice(0, 7) : ''))
    )

    return [...set].sort().reverse()
  }

  const textEditor = (props) => (
    <TextInput {...props} rows={rows} />
  )

  const editable = (key) => (row) =>
    canEditCell(role, key, row, editUntil)

  const cellClass = (key) => (row) =>
    canEditCell(role, key, row, editUntil)
      ? undefined
      : 'cell-readonly'

  const text = (key, name, minWidth) => ({
    key,
    name,
    minWidth,
    resizable: true,
    editable: editable(key),
    cellClass: cellClass(key),
    renderEditCell: textEditor,

    renderHeaderCell: ({ column }) => (
      <FilterHeader
        column={column}
        values={getColumnValues(key)}
        filter={filters[key]}
        onFilterChange={selected =>
          setColumnFilter(key, { selected })
        }
        isOpen={openFilter === key}
        onToggle={() =>
          setOpenFilter(prev => prev === key ? null : key)
        }
      />
    )
  })

  const date = (key, name, width) => ({
    key,
    name,
    width,
    resizable: true,
    editable: editable(key),
    cellClass: cellClass(key),
    renderCell: ({ row }) => fmtDate(row[key]),
    renderEditCell: dateEditor,

    renderHeaderCell: ({ column }) => (
      <DateFilterHeader
        column={column}
        months={getMonthValues(key)}
        filter={filters[key]}
        onFilterChange={patch => setColumnFilter(key, patch)}
        isOpen={openFilter === key}
        onToggle={() =>
          setOpenFilter(prev => prev === key ? null : key)
        }
      />
    )
  })

  // Одна колонка «ФИО, телефон» (в БД поля остаются раздельными)
  const contactColumn = {
    key: 'contact',
    name: 'ФИО, телефон',
    minWidth: 320,
    resizable: true,
    editable: editable('full_name'),
    cellClass: cellClass('full_name'),
    renderCell: ({ row }) => contactText(row),
    renderEditCell: (props) => <ContactInput {...props} rows={rows} />,

    renderHeaderCell: ({ column }) => (
      <FilterHeader
        column={column}
        values={getColumnValues('contact')}
        filter={filters.contact}
        onFilterChange={selected =>
          setColumnFilter('contact', { selected })
        }
        isOpen={openFilter === 'contact'}
        onToggle={() =>
          setOpenFilter(prev => prev === 'contact' ? null : 'contact')
        }
      />
    )
  }

  const columns = [
    date('date', 'Дата', 120),
    text('recipient', 'Получатель', 140),
    text('supplier', 'Поставщик', 140),
    text('city', 'Город', 110),
    contactColumn,

    {
      key: 'overage',
      name: 'Перебрали',
      width: 110,
      cellClass: cellClass('overage'),

      renderCell: ({ row, onRowChange }) => (
        <input
          type="checkbox"
          checked={!!row.overage}
          disabled={
            !canEditCell(role, 'overage', row, editUntil)
          }
          onChange={e =>
            onRowChange({
              ...row,
              overage: e.target.checked
            }, true)
          }
        />
      ),

      renderHeaderCell: ({ column }) => (
        <FilterHeader
          column={column}
          values={['true', 'false']}
          formatValue={v => (v === 'true' ? 'Да' : 'Нет')}
          filter={filters.overage}
          onFilterChange={selected =>
            setColumnFilter('overage', { selected })
          }
          isOpen={openFilter === 'overage'}
          onToggle={() =>
            setOpenFilter(prev => prev === 'overage' ? null : 'overage')
          }
        />
      )
    },

    date('trip_paid_at', 'Дата оплаты рейса', 170),
    text('note', 'Примечание', 200),
    text('other', 'Прочее', 220),
    text('reserve_1', 'Резерв 1', 100),
    text('reserve_2', 'Резерв 2', 100),
    text('reserve_3', 'Резерв 3', 100)
  ]

  // Загрузка данных
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(
          'http://localhost:3000/shipments',
          { credentials: 'include' }
        )

        if (res.ok) {
          setRows((await res.json()).shipments ?? [])
        }
      } catch (err) {
        console.error(err)
      } finally {
        loaded.current = true
      }
    }

    load()
  }, [])

  // Прокрутка вниз после первой загрузки
  useEffect(() => {
    if (rows.length > 0 && !scrolledOnce.current) {
      scrolledOnce.current = true

      scrollToBottom(rows.length)
    }
  }, [rows.length])

  const revertCells = (id, keys, oldRow) => {
    setRows(cur =>
      cur.map(r =>
        r.id === id
          ? {
              ...r,
              ...Object.fromEntries(keys.map(k => [k, oldRow?.[k]]))
            }
          : r
      )
    )
  }

  // Сохранение
  const save = async (row, keys, oldRow) => {
    const tempId = row.id

    try {
      if (row.isNew) {
        let pending = creating.current.get(tempId)

        if (!pending) {
          const payload = { ...row }

          delete payload.id
          delete payload.isNew

          pending = api('POST', '/shipments', payload)
            .then(d => {
              if (!d.shipment?.id) {
                throw new Error('Сервер не вернул ID созданной записи')
              }

              return d.shipment
            })

          creating.current.set(tempId, pending)
        }

        const created = await pending

        setRows(cur =>
          cur.map(r =>
            r.id === tempId
              ? { ...r, ...created, isNew: false }
              : r
          )
        )

        creating.current.delete(tempId)
        return
      }

      await api(
        'PATCH',
        `/shipments/${row.id}`,
        Object.fromEntries(keys.map(k => [k, row[k]]))
      )

    } catch (err) {
      console.error('Ошибка сохранения:', err)

      creating.current.delete(tempId)

      alert(err.message || 'Не удалось сохранить')

      revertCells(tempId, keys, oldRow)
    }
  }

  const onRowsChange = (newRows, { indexes, column }) => {
    const row = newRows[indexes[0]]
    const old = rows.find(r => r.id === row.id)

    // колонка «ФИО, телефон» меняет сразу два поля
    const keys = column.key === 'contact'
      ? ['full_name', 'phone']
      : [column.key]

    if (old && keys.every(k => old[k] === row[k])) {
      return
    }

    setRows(newRows)

    save(row, keys, old)
  }

  // Новая строка (можно создавать сколько угодно)
  const addDraft = () => {
    const draft = {
      id: `new-${++draftId.current}`,
      isNew: true,
      overage: false
    }

    lastAddAt.current = Date.now()
    setRows(prev => [...prev, draft])
  }

  // Колесо мыши вниз, когда уже внизу таблицы — создаём новую строку
  useEffect(() => {
    const el = gridRef.current?.element
    if (!el || !canCreate) return

    const onWheel = (e) => {
      if (e.deltaY <= 0) return
      if (!loaded.current || hasActiveFilter) return
      if (Date.now() < ignoreScrollUntil.current) return
      if (Date.now() - lastAddAt.current < 250) return

      const atBottom =
        el.scrollTop + el.clientHeight >= el.scrollHeight - 5

      if (!atBottom) return

      addDraft()
    }

    el.addEventListener('wheel', onWheel, { passive: true })
    return () => el.removeEventListener('wheel', onWheel)
  }, [canCreate, hasActiveFilter])

  // Выделить ячейку в новой строке после того, как она реально отрисована
  const pendingSelect = useRef(null)

  useEffect(() => {
    if (pendingSelect.current == null) return

    const idx = pendingSelect.current
    pendingSelect.current = null

    const handle = gridRef.current
    const rowIdx = rows.length - 1

    // В новых версиях react-data-grid есть selectCell
    if (typeof handle?.selectCell === 'function') {
      handle.selectCell({ rowIdx, idx })
      return
    }

    // В старых его нет: прокручиваем к ячейке и кликаем по ней
    handle?.scrollToCell?.({ rowIdx, idx })

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = handle?.element
      if (!el) return

      const rowCount = el.getAttribute('aria-rowcount')

      el.querySelector(
        `[role="row"][aria-rowindex="${rowCount}"] ` +
        `[role="gridcell"][aria-colindex="${idx + 1}"]`
      )?.click()
    }))
  }, [rows.length])

  // Стрелка вниз на последней строке.
  // Слушаем keydown напрямую на элементе сетки, не завися от API onCellKeyDown.
  useEffect(() => {
    const el = gridRef.current?.element
    if (!el || !canCreate) return

    const onKeyDown = (e) => {
      if (e.key !== 'ArrowDown') return
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      if (!loaded.current || hasActiveFilter) return

      // не мешаем редакторам ячеек (текст, дата) и подсказкам
      const t = e.target
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'SELECT' ||
          t.tagName === 'TEXTAREA' ||
          (t.tagName === 'INPUT' && t.type !== 'checkbox'))
      ) return

      const cell = el.querySelector('[role="gridcell"][aria-selected="true"]')
      if (!cell) return

      const row = cell.closest('[role="row"]')
      const rowIndex = Number(row?.getAttribute('aria-rowindex'))
      const rowCount = Number(el.getAttribute('aria-rowcount'))

      if (!rowIndex || !rowCount || rowIndex !== rowCount) return

      const colIndex = Number(cell.getAttribute('aria-colindex')) - 1
      if (!(colIndex >= 0)) return

      e.preventDefault()
      e.stopPropagation()

      ignoreScrollUntil.current = Date.now() + 500
      pendingSelect.current = colIndex
      addDraft()
    }

    el.addEventListener('keydown', onKeyDown, true)
    return () => el.removeEventListener('keydown', onKeyDown, true)
  }, [canCreate, hasActiveFilter])

  // ---------- Вставка из буфера (Excel, Google Sheets, другая таблица) ----------
  // Текст в формате TSV раскладывается по ячейкам вправо и вниз от выделенной.
  // Если строк в буфере больше, чем в таблице, создаются новые.

  const parsePastedDate = (v) => {
    const t = String(v).trim()
    if (t === '') return null

    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
    if (iso) {
      return displayToIso(`${iso[3]}/${iso[2]}/${iso[1]}`) ?? undefined
    }

    const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t)
    if (!m) return undefined

    return displayToIso(
      `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`
    ) ?? undefined
  }

  const parsePastedBool = (v) =>
    /^(true|1|да|yes|\+|✓|x)$/i.test(String(v).trim())

  const handlePaste = (e) => {
    // в режиме редактирования ячейки работает обычная вставка в поле
    const t = e.target
    if (
      t instanceof HTMLElement &&
      (t.tagName === 'SELECT' ||
        t.tagName === 'TEXTAREA' ||
        (t.tagName === 'INPUT' && t.type !== 'checkbox'))
    ) return

    if (!loaded.current) return

    const text = e.clipboardData?.getData('text/plain')
    if (!text) return

    const el = gridRef.current?.element
    const cell = el?.querySelector(
      '[role="gridcell"][aria-selected="true"]'
    )
    if (!el || !cell) return

    const ariaRow = Number(
      cell.closest('[role="row"]')?.getAttribute('aria-rowindex')
    )
    const ariaCount = Number(el.getAttribute('aria-rowcount'))
    const colIdx = Number(cell.getAttribute('aria-colindex')) - 1

    if (!ariaRow || !ariaCount || !(colIdx >= 0)) return

    // aria-rowcount = строки заголовка + строки данных
    const rowIdx = ariaRow - 1 - (ariaCount - filteredRows.length)
    if (rowIdx < 0) return

    e.preventDefault()

    const grid = text
      .replace(/\r/g, '')
      .replace(/\n$/, '')
      .split('\n')
      .map(line => line.split('\t'))

    const patches = new Map()   // id -> { row, patch }
    const created = []          // новые строки, созданные вставкой
    const canAppend = canCreate && !hasActiveFilter

    for (let i = 0; i < grid.length; i++) {
      let target = filteredRows[rowIdx + i]

      if (!target) {
        if (!canAppend) break

        target = {
          id: `new-${++draftId.current}`,
          isNew: true,
          overage: false
        }

        created.push(target)
      }

      for (let j = 0; j < grid[i].length; j++) {
        const column = columns[colIdx + j]
        if (!column) break

        const raw = grid[i][j]
        const key = column.key
        const entry = patches.get(target.id) ?? { row: target, patch: {} }
        const current = { ...entry.row, ...entry.patch }
        const patch = {}

        if (key === 'contact') {
          if (!canEditCell(role, 'full_name', current, editUntil)) continue
          Object.assign(patch, parseContact(raw))
        } else if (!canEditCell(role, key, current, editUntil)) {
          continue
        } else if (isDateKey(key)) {
          const iso = parsePastedDate(raw)
          if (iso === undefined) continue
          patch[key] = iso
        } else if (key === 'overage') {
          patch[key] = parsePastedBool(raw)
        } else {
          patch[key] = String(raw).trim()
        }

        // оставляем только реальные изменения
        const changed = Object.keys(patch).filter(k =>
          (current[k] ?? '') !== (patch[k] ?? '')
        )
        if (changed.length === 0 && !target.isNew) continue

        Object.assign(entry.patch, patch)
        patches.set(target.id, entry)
      }
    }

    if (patches.size === 0 && created.length === 0) return

    ignoreScrollUntil.current = Date.now() + 500

    // обновляем таблицу одним действием
    setRows(cur => {
      const next = cur.map(r =>
        patches.has(r.id) ? { ...r, ...patches.get(r.id).patch } : r
      )

      const existing = new Set(cur.map(r => r.id))

      for (const r of created) {
        if (!existing.has(r.id)) {
          next.push({ ...r, ...(patches.get(r.id)?.patch ?? {}) })
        }
      }

      return next
    })

    // сохраняем: по одному запросу на строку
    for (const { row, patch } of patches.values()) {
      const merged = { ...row, ...patch }
      const keys = Object.keys(patch)

      if (keys.length === 0) continue

      save(merged, keys, rows.find(r => r.id === row.id))
    }
  }

  // слушатель ставим один раз, а актуальный обработчик берём из ref
  const pasteRef = useRef(null)
  pasteRef.current = handlePaste

  useEffect(() => {
    const el = gridRef.current?.element
    if (!el) return

    const onPaste = (e) => pasteRef.current?.(e)

    el.addEventListener('paste', onPaste, true)
    return () => el.removeEventListener('paste', onPaste, true)
  }, [])

  const onScroll = (e) => {
    if (!canCreate) return
    if (!loaded.current) return
    if (hasActiveFilter) return

    const el = e.currentTarget
    const movedDown = el.scrollTop > lastScrollTop.current
    lastScrollTop.current = el.scrollTop

    if (!movedDown) return
    if (Date.now() < ignoreScrollUntil.current) return
    if (Date.now() - lastAddAt.current < 250) return

    const atBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 5

    if (!atBottom) return

    addDraft()
  }

  return (
    <DataGrid
      ref={gridRef}
      columns={columns}
      rows={filteredRows}
      rowKeyGetter={r => r.id}
      onRowsChange={onRowsChange}
      onScroll={onScroll}
    />
  )
}
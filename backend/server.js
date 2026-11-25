//Зависимости 

import express from 'express'
import {Pool} from 'pg'
import pg from 'pg'
import bcrypt from 'bcrypt'
import cors from 'cors'
import dotenv from 'dotenv'
import session from 'express-session'
dotenv.config()


const app = express()

app.use(express.json())
app.use(cors({
    credentials:true,
    origin:'http://localhost:5173'
}))

app.use(session({
    secret:process.env.JWT_SECRET,
    resave:false,
    saveUninitialized:false,
    cookie:{secure:false}
}))

const pool = new Pool({
    host: process.env.DB_HOST,
    port:process.env.DB_PORT,
    password:process.env.DB_PASSWORD,
    user:process.env.DB_USER,
    database:process.env.DB_NAME
})



//Работа с пользователем(вход, регистрация, удаление, изменение прав)



const PERMISSIONS = {
    user:         ['shipments:view'],
    'temp-admin': ['shipments:view', 'shipments:import', 'shipments:create'],
    admin:        ['shipments:view', 'shipments:import', 'shipments:create',
                   'shipments:edit', 'shipments:delete',
                   'users:view', 'users:create', 'users:delete', 'users:set-role'],
}

async function loadUser(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ message: 'Не авторизован' })
    }
    try {
        const r = await pool.query(
            'SELECT id, username, role FROM users WHERE id = $1',
            [req.session.user.id]
        )
        if (!r.rows[0]) return res.status(401).json({ message: 'Не авторизован' })
        req.user = r.rows[0]
        req.user.permissions = PERMISSIONS[req.user.role] ?? []
        next()
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Ошибка сервера' })
    }
}

const can = (perm) => (req, res, next) =>
    req.user.permissions.includes(perm)
        ? next()
        : res.status(403).json({ message: 'Нет доступа' })


app.post('/create-user', async(req,res)=>{
    const {username, password} = req.body
    try{
        const check = await pool.query("SELECT * FROM users WHERE username=$1",[username])
        if(check.rows.length > 0){
            return res.status(400).json({message:'username уже используется'})
        }
        const hashed_password = await bcrypt.hash(password,10)
        const result = await pool.query(`INSERT INTO users (username, password, role) VALUES($1,$2,'admin') RETURNING id, username, role`,[username, hashed_password])

        req.session.user = {
            id: result.rows[0].id,
            role: result.rows[0].role,
            username: result.rows[0].username
        }
        return res.status(200).json({message:'Пользователь создан!'})

    }catch(err){
        console.error(err)
        return res.status(500).json({message: 'Ошибка сервера'})

    }
})
app.post('/login', async(req,res)=>{
    const {username, password} = req.body

    try{
        const foundUser = await pool.query("SELECT * FROM users WHERE username=$1", [username])
        if(foundUser.rows.length == 0){
            return res.status(404).json({message:'Пользователь не найден'})
        }
        const checkPassword = await bcrypt.compare(password, foundUser.rows[0].password )
        if(!checkPassword){
            return res.status(400).json({message:"Неверный логин или пароль"})
        }
        console.log(foundUser.rows[0].edit_until)
        req.session.user = {
            username: foundUser.rows[0].username,
            role: foundUser.rows[0].role,
            id: foundUser.rows[0].id,
            edit_until: foundUser.rows[0].edit_until
        }
        return res.status(200).json({message:'Вход выполнен!'})


    }
    catch(err){
        console.error(err)
        return res.status(500).json({message:"Ошибка сервера"})
    }
})

app.get('/get-data', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: 'Не авторизован' })
    }

    try {
        const me = await pool.query(
            'SELECT id, username, role, edit_until FROM users WHERE id = $1',
            [req.session.user.id]
        )
        const user = me.rows[0]
        if (!user) {
            return res.status(401).json({ message: 'Не авторизован' })
        }

        if (user.role === 'admin') {
            const users = await pool.query(
                'SELECT id, username, role FROM users WHERE id <> $1 ORDER BY id',
                [user.id]
            )
            return res.status(200).json({ users: users.rows, user })
        }

        return res.status(200).json({ user })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ message: 'Ошибка сервера' })
    }
})
app.post('/delete-user', async(req,res)=>{
    const {user_id} = req.body
    try{
        const result = await pool.query("DELETE FROM users WHERE id=$1",[user_id])
        return res.status(200).json({message:'Пользователь удален'})
    }catch(err){
        console.error(err)
        return res.status(500).json({message:'Ошибка сервера'})
    }
})
app.post('/change-privileges', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: 'Не авторизован' })
    }
    const { user_id, edit_until } = req.body
    if (!user_id) {
        return res.status(400).json({ message: 'Укажите user_id' })
    }
    

    try {
        const me = await pool.query('SELECT role FROM users WHERE id = $1', [req.session.user.id])
        if (me.rows[0]?.role !== 'admin') {
            return res.status(403).json({ message: 'Нет доступа' })
        }
        if (Number(user_id) === req.session.user.id) {
            return res.status(400).json({ message: 'Нельзя менять свою роль' })
        }

        const target = await pool.query('SELECT role FROM users WHERE id = $1', [user_id])
        if (!target.rows[0]) {
            return res.status(404).json({ message: 'Пользователь не найден' })
        }

        const current = target.rows[0].role
        if (current === 'admin') {
            return res.status(400).json({ message: 'Роль админа менять нельзя' })
        }

        const newRole = current === 'user' ? 'temp-admin' : 'user'
        console.log(req.body);
        console.log('edit_until:', req.body.edit_until);
        const result = await pool.query(
            `UPDATE users
            SET role = $1,
                edit_until = $3
            WHERE id = $2
            RETURNING
                id,
                username,
                role,
                to_char(edit_until, 'YYYY-MM-DD') AS edit_until;`,
            [newRole, user_id, newRole == 'temp-admin' ? edit_until: null]
        )

        const message = newRole === 'temp-admin'
            ? `Пользователю выданы права на создание новых отгрузок, редактирование старых до ${edit_until} без возможности менять статус «Перебрали»`
            : 'Теперь пользователь может только просматривать таблицу'

        return res.status(200).json({ message, user: result.rows[0] })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ message: 'Ошибка сервера' })
    }
})


//Импорт из excel



import multer from 'multer'
import ExcelJS from 'exceljs'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const HEADERS = {
  'дата': 'date',
  'получатель': 'recipient',
  'получаетель': 'recipient',        
  'поставщик': 'supplier',
  'город': 'city',
  'фио, телефон': 'full_name_phone',
  'фио': 'full_name',
  'телефон': 'phone',
  'перебрали': 'overage',
  'дата оплаты рейса': 'trip_paid_at',
  'примечание': 'note',
  'прочее': 'other',
  'резерв 1': 'reserve_1',
  'резерв 2': 'reserve_2',
  'резерв 3': 'reserve_3',
}
const FIELDS = ['date','recipient','supplier','city','full_name','phone','overage',
                'trip_paid_at','note','other','reserve_1','reserve_2','reserve_3']
const MAX_ROWS = 20000

function cellValue(v) {
  if (v == null) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('')
    if ('result' in v) return v.result
    if ('text' in v) return v.text
  }
  return v
}
function splitNamePhone(v) {
  if (v == null) return { name: null, phone: null }
  const s = String(v).trim()
  if (!s) return { name: null, phone: null }

  const clean = (x) => {
    const t = x.replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '')
    return t === '' ? null : t
  }

  const idx = s.search(/\d/)
  if (idx === -1) return { name: clean(s), phone: null }      // только ФИО

  // телефон в начале: "+7 999 123-45-67 Иванов"
  const lead = s.match(/^[+()\d\s\-.,;]+/)
  if (lead && /\d/.test(lead[0]) && s.slice(lead[0].length).trim()) {
    return { name: clean(s.slice(lead[0].length)), phone: clean(lead[0]) }
  }

  // обычный случай: "Иванов Иван, +7 999 123-45-67"
  let cut = idx
  if (cut > 0 && (s[cut - 1] === '+' || s[cut - 1] === '(')) cut--
  return { name: clean(s.slice(0, cut)), phone: clean(s.slice(cut)) }
}
function toDate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return isNaN(v) ? undefined : v.toISOString().slice(0, 10)
  const s = String(v).trim()
  let iso = null

  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)        // дд.мм.гггг
  if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`

  if (!iso) {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)           // мм/дд/гггг
    if (m) iso = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }

  if (!iso && /^\d{4}-\d{2}-\d{2}$/.test(s)) iso = s          // гггг-мм-дд

  if (!iso) return undefined
  const d = new Date(iso)
  return !isNaN(d) && d.toISOString().slice(0, 10) === iso ? iso : undefined
}

function toBool(v) {
  const s = String(v ?? '').trim().toLowerCase()
  if (['да','ДА','Да','дА', 'yes', 'true', '1'].includes(s)) return true
  if (['','НЕт', 'нет','НЕТ','нЕт','Нет','неТ', 'no', 'false', '0'].includes(s)) return false
  return undefined
}

function toText(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
function toRawText(v) {
  if (v == null) return null
  if (v instanceof Date) return isNaN(v) ? null : fmtUS(v)   // ячейка целиком дата
  const s = String(v).trim()
  return s === '' ? null : s
}
// Date -> '03/18/2026'
const fmtUS = (d) => {
  const [y, m, day] = d.toISOString().slice(0, 10).split('-')
  return `${m}/${day}/${y}`
}
app.post('/shipments/import', loadUser, can('shipments:import'),
  upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Файл не передан' })

    try {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(req.file.buffer)
      const ws = wb.worksheets[0]
      if (!ws) return res.status(400).json({ message: 'В файле нет листов' })

      // карта: номер колонки -> поле
      const colMap = {}
      ws.getRow(1).eachCell((cell, col) => {
        const name = String(cellValue(cell.value) ?? '').trim().toLowerCase()
        if (HEADERS[name]) colMap[col] = HEADERS[name]
      })
      const found = Object.values(colMap)
      const seen = []
        ws.getRow(1).eachCell((cell, col) => seen.push([col, String(cellValue(cell.value) ?? '')]))
        console.log('Лист:', ws.name, '| строк:', ws.rowCount)
        console.log('Заголовки:', JSON.stringify(seen))
      const missing = ['date', 'recipient', 'supplier'].filter(f => !found.includes(f))
      if (missing.length) {
        return res.status(400).json({ message: 'Не найдены обязательные заголовки в первой строке' })
      }

      if (ws.rowCount - 1 > MAX_ROWS) {
        return res.status(400).json({ message: `Максимум ${MAX_ROWS} строк за раз` })
      }

      const cols = Object.fromEntries(FIELDS.map(f => [f, []]))
      const errors = []
      let count = 0

      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        const rec = {}
        for (const [col, field] of Object.entries(colMap)) {
            rec[field] = cellValue(row.getCell(Number(col)).value)
        }
        if (Object.values(rec).every(v => v == null || String(v).trim() === '')) continue

        const date = toDate(rec.date)
        const paid = toDate(rec.trip_paid_at)
        const overage = toBool(rec.overage)
        if (date === undefined) errors.push(`Строка ${r}: неверная дата`)
        if (overage === undefined) errors.push(`Строка ${r}: «Перебрали» должно быть да/нет`)

        cols.date.push(date)
        cols.trip_paid_at.push(paid === undefined ? null : paid)
        cols.overage.push(overage)

        const np = rec.full_name_phone != null
            ? splitNamePhone(rec.full_name_phone)
            : { name: toText(rec.full_name), phone: toText(rec.phone) }
        cols.full_name.push(np.name)
        cols.phone.push(np.phone)

        for (const f of ['recipient','supplier','city','reserve_1','reserve_2','reserve_3']) {
            cols[f].push(toText(rec[f]))
        }
        cols.other.push(toRawText(rec.other))
        cols.note.push(toRawText(rec.note))
        count++
        }

      if (errors.length) {
        return res.status(400).json({ message: 'В файле есть ошибки', errors: errors.slice(0, 50) })
      }
      if (count === 0) return res.status(400).json({ message: 'Нет данных для импорта' })

        await pool.query(
        `INSERT INTO shipments
            (date, recipient, supplier, city, full_name, phone, overage,
            trip_paid_at, note, other, reserve_1, reserve_2, reserve_3, created_by)
        SELECT d, rc, s, c, f, p, o, tp, nt, ot, r1, r2, r3, $14::int
        FROM unnest($1::date[], $2::text[], $3::text[], $4::text[], $5::text[],
                    $6::text[], $7::boolean[], $8::date[], $9::text[],
                    $10::text[], $11::text[], $12::text[], $13::text[])
                AS t(d, rc, s, c, f, p, o, tp, nt, ot, r1, r2, r3)`,
        [cols.date, cols.recipient, cols.supplier, cols.city, cols.full_name,
        cols.phone, cols.overage, cols.trip_paid_at, cols.note, cols.other,
        cols.reserve_1, cols.reserve_2, cols.reserve_3, req.user.id]
        )

      res.status(201).json({ message: `Импортировано строк: ${count}`, count })
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Не удалось прочитать файл' })
    }
  })



//Работа с таблицой


app.get('/shipments', loadUser, can('shipments:view'), async (req, res) => {
    try {
        const r = await pool.query(
        `SELECT id,
                to_char(date, 'YYYY-MM-DD')         AS date,
                recipient, supplier, city, full_name, phone, overage,
                to_char(trip_paid_at, 'YYYY-MM-DD') AS trip_paid_at,
                note, other, reserve_1, reserve_2, reserve_3
        FROM shipments
        ORDER BY shipments.date ASC NULLS FIRST, id ASC`
        )
        res.json({ shipments: r.rows })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Ошибка сервера' })
    }
})


const RESERVE = ['reserve_1', 'reserve_2', 'reserve_3']
const EDIT_TEXT = ['recipient','supplier','city','full_name','phone','note','other', ...RESERVE]
const EDIT_DATES = ['date', 'trip_paid_at']
function canEditField(user, field) {
  if (user.role === 'admin') return field === 'overage' || EDIT_TEXT.includes(field) || EDIT_DATES.includes(field)
  if (user.role === 'temp-admin') return EDIT_TEXT.includes(field) || EDIT_DATES.includes(field)
  return RESERVE.includes(field)
}
app.patch('/shipments/:id', async(req,res)=>{
    const id = Number(req.params.id)
    if(!Number.isInteger(id)) return res.status(400).json({message:'Неверный id'})
    const [field, raw] = Object.entries(req.body)[0] ?? []
    if(!field || !canEditField(req.session.user, field)){
        return res.status(403).json({message:"Вы не можете менять эту колонку"})
    }

    let value
    if(field == 'overage'){
        value = Boolean(raw)
    } else if(EDIT_DATES.includes(field)){
        const s = raw == null ? '' : String(raw).trim()
        if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            return res.status(400).json({ message: 'Неверный формат даты' })
        }
        value = s || null
    } else {
        const s = raw == null ? '' : String(raw).trim()
        value = s || null
    }

    const params = [value, id]
    let where = 'id = $2'

if (req.session.user.role === 'temp-admin') {
    const limit = req.session.user.edit_until

    if (!limit) {
        return res.status(403).json({
            message: 'Не задана граница дат'
        })
    }

    // Проверяем дату только для обычных полей
    if (!RESERVE.includes(field)) {
        if (field === 'date' && value && value < String(limit).slice(0, 10)) {
            return res.status(403).json({
                message: 'Дата раньше разрешенной границы'
            })
        }

        params.push(String(limit).slice(0, 10))
        where += ' AND (date IS NULL OR date >= $3::date)'
    }
}

    try{
        const r = await pool.query(`UPDATE shipments SET ${field} = $1 WHERE ${where}`, params)
        if (!r.rowCount) return res.status(403).json({ message: 'Эту запись вам редактировать нельзя' })
        res.json({ok:true})

    }catch(err){
        console.error(err)
        return res.status(500).json({message:"Ошибка сервера"})
    }

})
app.post('/shipments', async (req, res) => {
  try {
    const {
      date,
      recipient,
      supplier,
      city,
      full_name,
      phone,
      overage,
      trip_paid_at,
      note,
      other,
      reserve_1,
      reserve_2,
      reserve_3
    } = req.body

    const result = await pool.query(`
      INSERT INTO shipments (
        date,
        recipient,
        supplier,
        city,
        full_name,
        phone,
        overage,
        trip_paid_at,
        note,
        other,
        reserve_1,
        reserve_2,
        reserve_3
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13
      )
      RETURNING *
    `, [
      date || null,
      recipient || null,
      supplier || null,
      city || null,
      full_name || null,
      phone || null,
      Boolean(overage),
      trip_paid_at || null,
      note || null,
      other || null,
      reserve_1 || null,
      reserve_2 || null,
      reserve_3 || null
    ])

    res.json({ shipment: result.rows[0] })

  } catch (err) {
    console.error('POST /shipments:', err)
    res.status(500).json({ message: 'Ошибка создания записи' })
  }
})

pool.query('SELECT NOW()')
    .then(()=> console.log('DB CONNECTED'))
    .catch((err)=> {
        console.error("DB ERROR", err.message)
        process.exit(1)
})

app.listen(process.env.PORT,()=>{
    console.log("SERVER STARTED")
})
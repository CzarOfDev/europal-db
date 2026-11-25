import { useEffect, useState } from 'react'
import { FiEdit3, FiTrash2 } from 'react-icons/fi'
import { FaUserCircle } from 'react-icons/fa'
import UserModal from './UserModal'
import { ROLE_LABELS } from './role'
import { useRef } from 'react'
import ShipmentsTable from './ShipmentsTable'
export default function Home(){
    const ROLE_CAPS = {
        user: 'Только просмотр таблицы',
        'temp-admin': 'Добавление отгрузок',
        admin: 'Полный доступ',
    }

    const [users, setUsers] = useState([])
    const [until, setUntil] = useState('')
    const [data, setData] = useState([])
    const [user, setUser] = useState([])
    const [selected, setSelected] = useState(null)
    const fileRef = useRef(null)
    const [reload, setReload] = useState(0)
    const importExcel = async (e) => {
        const file = e.target.files[0]
        e.target.value = ''        
        if (!file) return

        const form = new FormData()
        form.append('file', file)

        try {
            const res = await fetch('http://localhost:3000/shipments/import', {
            method: 'POST',
            credentials: 'include',
            body: form,              
            })
            const data = await res.json()
            if (!res.ok) {
            alert([data.message, ...(data.errors ?? [])].join('\n'))
            return
            }
            alert(data.message)
            setReload(r => r + 1)
            window.location.reload()
        } catch {
            alert('Сервер недоступен')
        }
        }
    

    const deleteUser = async() =>{
        try{
            const res = await fetch('http://localhost:3000/delete-user', {
                method:'POST',
                credentials:'include',
                headers:{
                    'Content-Type':'application/json'
                },
                body: JSON.stringify({user_id:selected.id})
            })
            if(res.ok){
                alert('Пользователь удален')
                window.location.reload()
            }
            else{
                alert('Что-то пошло не так')
            }
        }
        catch(err){
            console.error(err)
            alert('Ошибка!')
        }

    }
    
    const changePrivileges = async() =>{
        try{
            const res = await fetch('http://localhost:3000/change-privileges', {
                method:"POST",
                credentials:'include',
                headers: {
                    "Content-Type":'application/json'
                },
                body: JSON.stringify({user_id: selected.id, edit_until: until})
            })
            const data = await res.json()
            if(res.ok){
                alert(data.message)
                window.location.reload()
            }
            else{
                alert(data.message)
            }
        }catch(err){
            console.error(err)
            alert('Ошибка!')
        }
    }
    useEffect(()=>{
        const getData = async()=>{
            try{
                const res = await fetch('http://localhost:3000/get-data', {
                    method:'GET',
                    credentials:'include',
                })
                if(res.ok){
                    const data = await res.json()
                    console.log(user.edit_until)
                    setUsers(data.users ?? [])
                    setUser(data.user)
                }
            }catch(err){
                console.error(err)
                alert('Ошибка загрузки данных')
            }
        }
        getData()
    },[])
    return(
        <>
            <div className="main" >
                <div className="left-box">
                    <div className='title'>
                        <div className='profile-icon'>
                            <FaUserCircle size={40} />
                        </div>
                        <div className='profile-info'>
                            <h1>{user.username}</h1>
                            <span className={`profile-role ${user.role}`}>
                            {ROLE_LABELS[user.role] ?? user.role}
                            </span>
                            <span className='profile-caps'>{ROLE_CAPS[user.role]}</span>
                        </div>
                    </div>
                    <div className="load-box">
                        <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx"
                        hidden
                        onChange={importExcel}
                        />
                    <button onClick={() => fileRef.current.click()} className="load-btn">
                        <img className='excel-img' src='./public/excel.png'/>
                        Загрузить из Excel
                    </button>
                    </div>
                        <div className="users">
                        {users.map(u => (
                            <button key={u.id} onClick={()=>setSelected(u)} className="user-item">
                            <div className="user-avatar">{u.username[0].toUpperCase()}</div>
                            <div className="user-info">
                                <span className="user-name">{u.username}</span>
                                <span className={`user-role ${u.role}`}>{ROLE_LABELS[u.role] ?? u.role}</span>
                            </div>
                            </button>
                        ))}
                        </div>
                </div>
                <div className="right-box">
                    <ShipmentsTable
                    role={user.role}
                    editUntil={user.edit_until}
                    canCreate={['admin', 'temp-admin'].includes(user.role)}
                    />
                </div>
            </div>

        <UserModal open={!!selected} onClose={() => setSelected(null)} title={selected?.username}>
        <p className="modal-status">
            Статус: <span className={`status-badge ${selected?.role}`}>
            {ROLE_LABELS[selected?.role] ?? selected?.role}
            </span>
        </p>

        <div className="field">
            <label htmlFor="edit-until" className="field-label">
            Может редактировать записи с датой до (включительно)
            </label>
            <input
            lang="ru"
            id="edit-until"
            className="date-input"
            type="date"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
            />
        </div>
        <div className="modal-actions">
            <button onClick={()=>changePrivileges()} type="button" className="btn-action">
            <FiEdit3 size={16} />
            {selected?.role === 'temp-admin' ? 'Снять расширенные права' : 'Выдать расширенные права'}
            </button>
            <button onClick={()=>deleteUser()} type="button" className="btn-action danger">
            <FiTrash2 size={16} />
                Удалить
            </button>
            </div>

        </UserModal>
            
        </>
    )
}
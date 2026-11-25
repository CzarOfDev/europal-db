import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  const login = async() =>{
    if(username.trim() == '' || password.trim() == ''){
      setMessage('Заполните все поля')
    }
    try{
      const res = await fetch('http://localhost:3000/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'include',
        body: JSON.stringify({username: username.trim(), password})
      })

      if(res.ok){
        navigate('/home')
      }
      else{
        const data = await res.json()
        setMessage(data.message)
      }
    }
    catch(err){
      setMessage('Сервер недоступен')
    }

  }
  

  return (
    <>
    <div className='main-box'>
      <div className='form'>
        <div className='actions'>
          <h1 className='login-title'>Вход</h1>
          <input value={username} onChange={(e)=>setUsername(e.target.value)} className='login-input'  placeholder='Логин' />
          <input value={password} onChange={(e)=>setPassword(e.target.value)} className='login-input' type='password' placeholder='Пароль'/>
          <button onClick={()=>login()} >Войти</button>
          <p className='message' >{message}</p>
        </div>
      </div>
    </div>
    </>
  )
}

export default Login

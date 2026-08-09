import { useState, type FormEvent } from 'react'
import { tryUnlock } from '../lib/adminGate'

export default function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (await tryUnlock(password)) {
      onUnlock()
    } else {
      setError(true)
    }
  }

  return (
    <main className="admin admin-gate">
      <form onSubmit={submit}>
        <label>
          Mot de passe
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(false)
            }}
          />
        </label>
        <button type="submit">Entrer</button>
        {error && <p className="admin-conflict">Mot de passe incorrect.</p>}
      </form>
    </main>
  )
}

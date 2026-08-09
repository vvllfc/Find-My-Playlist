import { ADMIN_GATE_PASSWORD_HASH } from '../config'
import { sha256Hex } from './hash'

const UNLOCKED_KEY = 'admin_gate_unlocked'

// Deterrent only, not real security — the hash ships in the public bundle
// like everything else on a static site. Real protection is the GitHub PAT
// and Spotify login already required to actually change anything (see README
// "Sécurité"). This just keeps casual visitors who find the URL from poking
// around the admin UI.
export function isGateConfigured(): boolean {
  return ADMIN_GATE_PASSWORD_HASH.length > 0
}

export function isUnlocked(): boolean {
  if (!isGateConfigured()) return true
  return localStorage.getItem(UNLOCKED_KEY) === ADMIN_GATE_PASSWORD_HASH
}

export async function tryUnlock(password: string): Promise<boolean> {
  const hash = await sha256Hex(password)
  if (hash !== ADMIN_GATE_PASSWORD_HASH) return false
  localStorage.setItem(UNLOCKED_KEY, hash)
  return true
}

export function lock(): void {
  localStorage.removeItem(UNLOCKED_KEY)
}

import { createHash } from 'node:crypto'

const password = process.argv[2]
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your-password"')
  process.exitCode = 1
} else {
  console.log(createHash('sha256').update(password).digest('hex'))
}

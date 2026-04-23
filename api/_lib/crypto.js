import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto'

function getKey() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  if (!raw) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY não configurada')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY deve ser 32 bytes em base64')
  return key
}

/**
 * Criptografa plaintext com AES-256-GCM.
 * Formato armazenado: base64(iv).base64(authTag).base64(ciphertext)
 */
export function encrypt(plaintext) {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.')
}

/**
 * Descriptografa valor armazenado no formato base64(iv).base64(authTag).base64(ciphertext)
 */
export function decrypt(stored) {
  const key = getKey()
  const parts = stored.split('.')
  if (parts.length !== 3) throw new Error('Formato de token inválido')
  const [ivB64, authTagB64, ciphertextB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/**
 * Gera state assinado: base64url(payload).hmac
 * payload = { consultor_id, timestamp, nonce }
 */
export function generateState(consultorId) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET
  if (!secret) throw new Error('GOOGLE_OAUTH_STATE_SECRET não configurada')
  const payload = Buffer.from(JSON.stringify({
    consultor_id: consultorId,
    timestamp: Date.now(),
    nonce: randomBytes(16).toString('hex'),
  })).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
}

/**
 * Valida e decodifica state. Lança erro se inválido ou expirado (> 10 min).
 * Retorna o payload decodificado.
 */
export function verifyState(state) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET
  if (!secret) throw new Error('GOOGLE_OAUTH_STATE_SECRET não configurada')
  const dot = state.lastIndexOf('.')
  if (dot === -1) throw new Error('State malformado')
  const payload = state.slice(0, dot)
  const sig = state.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  if (sig !== expected) throw new Error('Assinatura do state inválida')
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (Date.now() - data.timestamp > 10 * 60 * 1000) throw new Error('State expirado')
  return data
}

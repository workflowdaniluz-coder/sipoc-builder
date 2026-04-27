/**
 * POST /api/auth/google/start
 * Valida JWT do consultor, gera state assinado, retorna URL de consentimento Google.
 */

import { getAdminClient } from '../../_lib/supabase-admin.js'
import { generateState } from '../../_lib/crypto.js'

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
].join(' ')

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' })

  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim()
  if (!clientId || !redirectUri) {
    return res.status(503).json({ ok: false, error: 'OAuth não configurado neste ambiente.' })
  }

  // Validar JWT do consultor
  const authHeader = req.headers['authorization'] ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  if (!jwt) return res.status(401).json({ ok: false, error: 'Não autorizado.' })

  const supabase = getAdminClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
  if (authError || !user) return res.status(401).json({ ok: false, error: 'Token inválido.' })

  const state = generateState(user.id)

  const params = new URLSearchParams({
    client_id:              clientId,
    redirect_uri:           redirectUri,
    response_type:          'code',
    scope:                  SCOPES,
    access_type:            'offline',
    prompt:                 'consent',
    include_granted_scopes: 'true',
    state,
  })

  return res.status(200).json({ ok: true, authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
}

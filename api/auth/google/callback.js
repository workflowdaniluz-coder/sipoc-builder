/**
 * GET /api/auth/google/callback?code=...&state=...
 * Troca o code por tokens, criptografa refresh_token, faz UPSERT e redireciona.
 */

import { createClient } from '@supabase/supabase-js'
import { verifyState, encrypt } from '../../_lib/crypto.js'

function redirect(res, status) {
  const base = process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br'
  return res.redirect(302, `${base}/?google_connected=${status}`)
}

function decodeJwtPayload(token) {
  const part = token.split('.')[1]
  if (!part) throw new Error('id_token inválido')
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { code, state, error: oauthError } = req.query

  if (oauthError) {
    console.error('[google/callback] OAuth error:', oauthError)
    return redirect(res, `error&reason=${encodeURIComponent(oauthError)}`)
  }

  if (!code || !state) return redirect(res, 'error&reason=missing_params')

  // Verificar state
  let stateData
  try {
    stateData = verifyState(state)
  } catch (err) {
    console.error('[google/callback] State inválido:', err.message)
    return redirect(res, `error&reason=invalid_state`)
  }

  const { consultor_id } = stateData

  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim()

  if (!clientId || !clientSecret || !redirectUri) {
    return redirect(res, 'error&reason=oauth_not_configured')
  }

  // Trocar code por tokens
  let tokenResponse
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    })
    tokenResponse = await resp.json()
  } catch (err) {
    console.error('[google/callback] Erro ao trocar code:', err.message)
    return redirect(res, 'error&reason=token_exchange_failed')
  }

  if (tokenResponse.error) {
    console.error('[google/callback] Token error:', tokenResponse.error)
    return redirect(res, `error&reason=${encodeURIComponent(tokenResponse.error)}`)
  }

  const { refresh_token, id_token } = tokenResponse
  if (!refresh_token) {
    console.error('[google/callback] refresh_token ausente na resposta')
    return redirect(res, 'error&reason=no_refresh_token')
  }

  // Extrair email do id_token
  let googleEmail
  try {
    const payload = decodeJwtPayload(id_token)
    googleEmail = payload.email
    if (!googleEmail) throw new Error('email ausente no id_token')
  } catch (err) {
    console.error('[google/callback] Erro ao decodificar id_token:', err.message)
    return redirect(res, 'error&reason=invalid_id_token')
  }

  // Criptografar refresh_token
  let refreshTokenEncrypted
  try {
    refreshTokenEncrypted = encrypt(refresh_token)
  } catch (err) {
    console.error('[google/callback] Erro ao criptografar token:', err.message)
    return redirect(res, 'error&reason=encryption_failed')
  }

  // UPSERT em consultor_google_auth (service role bypassa RLS)
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { error: upsertError } = await supabase
    .from('consultor_google_auth')
    .upsert({
      consultor_id,
      google_email:             googleEmail,
      refresh_token_encrypted:  refreshTokenEncrypted,
      conectado_em:             new Date().toISOString(),
      revogado_em:              null,
    }, { onConflict: 'consultor_id' })

  if (upsertError) {
    console.error('[google/callback] Erro no upsert:', upsertError.message)
    return redirect(res, 'error&reason=db_error')
  }

  return redirect(res, 'success')
}

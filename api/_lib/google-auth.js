import { createClient } from '@supabase/supabase-js'
import { decrypt } from './crypto.js'

export async function getAccessTokenForConsultor(consultorId) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: row, error } = await supabase
    .from('consultor_google_auth')
    .select('refresh_token_encrypted, revogado_em, google_email')
    .eq('consultor_id', consultorId)
    .maybeSingle()

  if (error) throw new Error('Erro ao buscar autenticação Google: ' + error.message)
  if (!row || row.revogado_em) throw new Error('CONSULTOR_GOOGLE_NAO_CONECTADO')

  const refreshToken = decrypt(row.refresh_token_encrypted)

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim(),
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
    }),
  })

  const json = await resp.json()

  if (json.error === 'invalid_grant') {
    await supabase
      .from('consultor_google_auth')
      .update({ revogado_em: new Date().toISOString() })
      .eq('consultor_id', consultorId)
    throw new Error('CONSULTOR_GOOGLE_REVOGADO')
  }

  if (json.error || !json.access_token) {
    throw new Error('Erro ao renovar token Google: ' + (json.error ?? 'resposta inválida'))
  }

  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    googleEmail: row.google_email,
  }
}

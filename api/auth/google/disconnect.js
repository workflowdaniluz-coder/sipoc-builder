/**
 * POST /api/auth/google/disconnect
 * Revoga token no Google e marca revogado_em no banco.
 */

import { createClient } from '@supabase/supabase-js'
import { decrypt } from '../../_lib/crypto.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' })

  const authHeader = req.headers['authorization'] ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  if (!jwt) return res.status(401).json({ ok: false, error: 'Não autorizado.' })

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
  if (authError || !user) return res.status(401).json({ ok: false, error: 'Token inválido.' })

  // Buscar registro
  const { data: row, error: fetchError } = await supabase
    .from('consultor_google_auth')
    .select('refresh_token_encrypted')
    .eq('consultor_id', user.id)
    .is('revogado_em', null)
    .maybeSingle()

  if (fetchError) return res.status(500).json({ ok: false, error: 'Erro ao buscar conexão.' })
  if (!row) return res.status(404).json({ ok: false, error: 'Nenhuma conexão Google ativa.' })

  // Revogar token no Google (best effort — não bloqueia mesmo se falhar)
  try {
    const refreshToken = decrypt(row.refresh_token_encrypted)
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  } catch (err) {
    console.error('[google/disconnect] Erro ao revogar token no Google:', err.message)
  }

  // Marcar como revogado no banco
  const { error: updateError } = await supabase
    .from('consultor_google_auth')
    .update({ revogado_em: new Date().toISOString() })
    .eq('consultor_id', user.id)

  if (updateError) return res.status(500).json({ ok: false, error: 'Erro ao desconectar.' })

  return res.status(200).json({ ok: true })
}

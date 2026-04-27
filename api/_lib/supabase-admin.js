import { createClient } from '@supabase/supabase-js'

let _client = null

export function getAdminClient() {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios')
  _client = createClient(url, key)
  return _client
}

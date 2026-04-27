/**
 * Executa a migration de notificações no Supabase homolog.
 * Requer SUPABASE_SERVICE_ROLE_KEY no ambiente.
 *
 * Uso:
 *   SUPABASE_URL=https://sapthkusrcvsgvpyuczc.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   node scripts/run-migration.mjs
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('❌  Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sql = readFileSync(
  new URL('../supabase/migrations/20260418_notifications.sql', import.meta.url),
  'utf8'
)

const supabase = createClient(url, key)

const { error } = await supabase.rpc('exec_sql', { query: sql }).catch(() => ({ error: { message: 'rpc não disponível' } }))

if (error) {
  // Fallback: executa via REST /rest/v1/rpc não existe — imprime SQL para execução manual
  console.log('\n⚠️  Execute o SQL abaixo no SQL Editor do Supabase dashboard:\n')
  console.log(sql)
} else {
  console.log('✅  Migration executada com sucesso!')
}

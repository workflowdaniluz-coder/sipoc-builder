/**
 * POST /api/bpmn-ready
 * Payload: { sipoc_id, drive_url }
 * Converte drive_url para embed URL, salva ambas no sipoc e cria notificação.
 * Requer consultor autenticado via Authorization: Bearer <supabase_jwt>
 */

import { getAdminClient } from './_lib/supabase-admin.js'
import { converterParaEmbedUrl } from './_utils.js'

async function verificarAuth(req, supabase) {
  const authHeader = req.headers['authorization'] ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  if (!jwt) return null
  const { data: { user } } = await supabase.auth.getUser(jwt)
  return user ?? null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' })

  const supabase = getAdminClient()

  const user = await verificarAuth(req, supabase)
  if (!user) return res.status(401).json({ ok: false, error: 'Não autorizado.' })

  const { sipoc_id, drive_url } = req.body ?? {}
  if (!sipoc_id) return res.status(400).json({ ok: false, error: 'sipoc_id é obrigatório' })
  if (!drive_url) return res.status(400).json({ ok: false, error: 'drive_url é obrigatório' })

  const embed_url = converterParaEmbedUrl(drive_url)
  if (!embed_url) return res.status(400).json({ ok: false, error: 'drive_url inválida — não foi possível extrair o FILE_ID' })

  const { data: sipoc, error: sipocError } = await supabase
    .from('sipocs')
    .update({ bpmn_drive_url: drive_url, bpmn_embed_url: embed_url })
    .eq('id', sipoc_id)
    .select('nome_processo, setores ( nome, clientes ( id, nome ) )')
    .single()

  if (sipocError) return res.status(500).json({ ok: false, error: 'Erro ao atualizar sipoc: ' + sipocError.message })

  const projectId = sipoc.setores?.clientes?.id
  if (projectId) {
    await supabase.from('notifications').insert({
      project_id: projectId,
      type:       'bpmn_ready',
      title:      `Diagrama disponível — ${sipoc.nome_processo}`,
      body: {
        processo:  sipoc.nome_processo,
        setor:     sipoc.setores?.nome,
        drive_url,
        embed_url,
      },
    }).catch(() => {})
  }

  return res.status(200).json({ ok: true, embed_url })
}

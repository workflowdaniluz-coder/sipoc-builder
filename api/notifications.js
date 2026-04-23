/**
 * POST /api/notifications
 *
 * Recebe alertas de agentes externos e persiste como notificações
 * no banco. Protegido por API key via header:
 *   Authorization: Bearer <NOTIFICATIONS_API_KEY>
 *
 * Payload esperado:
 * {
 *   "project_id": "uuid",
 *   "type": "bpmn_not_in_sipoc",
 *   "title": "BPMN sem processo no SIPOC",
 *   "body": {
 *     "file_name": "Emissão NF.png",
 *     "file_path": "/Consultoria/EmpresaX/Financeiro/",
 *     "setor": "Financeiro",
 *     "empresa": "EmpresaX"
 *   }
 * }
 */

import { createClient } from '@supabase/supabase-js'

// Cria cliente com service role key para bypassar RLS no INSERT
function getAdminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios')
  return createClient(url, key)
}

function unauthorized(res) {
  res.status(401).json({ success: false, error: 'Unauthorized' })
}

function badRequest(res, message) {
  res.status(400).json({ success: false, error: message })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // ── Validar API key ──────────────────────────────────────────────
  const apiKey = (process.env.NOTIFICATIONS_API_KEY ?? '').trim()
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'NOTIFICATIONS_API_KEY não configurada no servidor' })
  }

  const authHeader = req.headers['authorization'] ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token || token !== apiKey) {
    return unauthorized(res)
  }

  // ── Validar payload ──────────────────────────────────────────────
  const { project_id, type, title, body } = req.body ?? {}

  if (!project_id || typeof project_id !== 'string') {
    return badRequest(res, 'project_id é obrigatório')
  }
  if (!type || typeof type !== 'string') {
    return badRequest(res, 'type é obrigatório')
  }
  if (!title || typeof title !== 'string') {
    return badRequest(res, 'title é obrigatório')
  }
  if (body !== undefined && typeof body !== 'object') {
    return badRequest(res, 'body deve ser um objeto JSON')
  }

  const supabase = getAdminClient()

  // ── Validar que project_id existe ────────────────────────────────
  const { data: projeto, error: projetoError } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', project_id)
    .maybeSingle()

  if (projetoError) {
    return res.status(500).json({ success: false, error: 'Erro ao validar projeto: ' + projetoError.message })
  }
  if (!projeto) {
    return badRequest(res, 'project_id não encontrado')
  }

  // ── Deduplicação: evita duplicata de mesmo file_name + project_id ─
  const fileName = body?.file_name ?? null

  if (fileName) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('project_id', project_id)
      .eq('status', 'unread')
      .contains('body', { file_name: fileName })
      .maybeSingle()

    if (existing) {
      return res.status(200).json({
        success: true,
        notification_id: existing.id,
        deduplicated: true,
      })
    }
  }

  // ── Inserir notificação ──────────────────────────────────────────
  const { data: notification, error: insertError } = await supabase
    .from('notifications')
    .insert({
      project_id,
      type,
      title,
      body: body ?? {},
    })
    .select('id')
    .single()

  if (insertError) {
    return res.status(500).json({ success: false, error: 'Erro ao criar notificação: ' + insertError.message })
  }

  return res.status(201).json({
    success: true,
    notification_id: notification.id,
  })
}

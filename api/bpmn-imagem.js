/**
 * GET /api/bpmn-imagem?sipoc_id=X&vb=TOKEN  → cliente (token de validação por setor)
 * GET /api/bpmn-imagem?sipoc_id=X            → consultor (Bearer token no header Authorization)
 *
 * Faz proxy do arquivo no Google Drive via service account.
 * Só serve arquivos enquanto o processo está em fase 'validacao' ou 'retrabalho'.
 */

import { getAdminClient } from './_lib/supabase-admin.js'
import { getServiceAccountToken } from './_lib/google-auth.js'

const IMAGE_TYPES = /^image\//

function extractFileId(url) {
  const m = url?.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).end()

  const { sipoc_id, vb } = req.query
  if (!sipoc_id) return res.status(400).json({ error: 'sipoc_id obrigatório' })

  let supabase, driveUrl

  try {
    supabase = getAdminClient()
  } catch (err) {
    return res.status(500).json({ error: 'Supabase: ' + err.message })
  }

  try {
    if (vb) {
      // ── Acesso via token de validação de setor ───────────────────────────
      const { data: tokenData } = await supabase
        .from('tokens_acesso')
        .select('setor_id')
        .eq('token', vb)
        .eq('tipo', 'validacao_bpmn')
        .is('revogado_em', null)
        .gt('expira_em', new Date().toISOString())
        .maybeSingle()
      if (!tokenData) return res.status(403).json({ error: 'Token inválido' })

      const { data: sipoc } = await supabase
        .from('sipocs')
        .select('bpmn_drive_url, bpmn_fase_atual')
        .eq('id', sipoc_id)
        .eq('setor_id', tokenData.setor_id)
        .maybeSingle()

      if (!sipoc) return res.status(404).json({ error: 'Processo não encontrado' })
      if (!sipoc.bpmn_drive_url) return res.status(404).json({ error: 'Drive URL não configurada' })
      if (!['validacao', 'retrabalho'].includes(sipoc.bpmn_fase_atual))
        return res.status(404).json({ error: 'Fase inativa: ' + sipoc.bpmn_fase_atual })
      driveUrl = sipoc.bpmn_drive_url

    } else {
      // ── Acesso via sessão do consultor ───────────────────────────────────
      const auth = req.headers.authorization
      if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autenticado' })
      const { data: { user } } = await supabase.auth.getUser(auth.slice(7))
      if (!user) return res.status(401).json({ error: 'Sessão inválida' })

      // Verifica que o sipoc pertence a um setor do próprio consultor (P1 fix)
      const { data: sipoc } = await supabase
        .from('sipocs')
        .select('bpmn_drive_url, setores(consultor_id)')
        .eq('id', sipoc_id)
        .maybeSingle()

      if (!sipoc) return res.status(404).json({ error: 'Processo não encontrado' })
      if (sipoc.setores?.consultor_id !== user.id)
        return res.status(403).json({ error: 'Acesso negado' })
      if (!sipoc.bpmn_drive_url) return res.status(404).json({ error: 'Drive URL não configurada' })
      driveUrl = sipoc.bpmn_drive_url
    }
  } catch (err) {
    return res.status(500).json({ error: 'DB: ' + err.message })
  }

  const fileId = extractFileId(driveUrl)
  if (!fileId) return res.status(400).json({ error: 'URL do Drive inválida: ' + driveUrl })

  try {
    const accessToken = await getServiceAccountToken()
    const fileResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!fileResp.ok) {
      const body = await fileResp.text()
      return res.status(fileResp.status).json({ error: 'Drive: ' + fileResp.status + ' ' + body.slice(0, 200) })
    }
    const contentType = fileResp.headers.get('content-type') || 'application/octet-stream'
    // Só serve imagens raster — outros formatos (PDF, XML, Workspace docs) não renderizam no <img> (P2 fix)
    if (!IMAGE_TYPES.test(contentType))
      return res.status(415).json({ error: 'Formato não suportado: ' + contentType })
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    const buffer = Buffer.from(await fileResp.arrayBuffer())
    return res.send(buffer)
  } catch (err) {
    return res.status(500).json({ error: 'Drive fetch: ' + err.message })
  }
}

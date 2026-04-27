import { logEvent, logError } from '../_lib/logger.js'
import { monday, verificarAuthMonday } from '../_lib/monday-client.js'

const WORKSPACE_ID = '13792662'
const TEMPLATE_BOARDS = [
  { id: '18397263401', tipo: 'cronograma' },
  { id: '18397210104', tipo: 'infos' },
  { id: '18397210756', tipo: 'ocorrencias' },
]

async function criarPastaCliente(apiKey, clienteNome) {
  const folderData = await monday(apiKey, `
    mutation($name: String!, $wsId: ID!) {
      create_folder(name: $name, workspace_id: $wsId) { id name }
    }
  `, { name: clienteNome, wsId: WORKSPACE_ID })

  const folderId = folderData.create_folder.id
  logEvent('monday.folder_created', { clienteNome, folderId })

  let cronogramaBoardId = null
  for (const tmpl of TEMPLATE_BOARDS) {
    const boardName = tmpl.tipo === 'cronograma' ? `Cronograma Projeto BPM - ${clienteNome}` : null
    const dupData = await monday(apiKey, `
      mutation($boardId: ID!, $name: String, $folderId: ID, $wsId: ID!) {
        duplicate_board(
          board_id: $boardId
          duplicate_type: duplicate_board_with_pulses
          board_name: $name
          folder_id: $folderId
          workspace_id: $wsId
        ) { board { id name } }
      }
    `, { boardId: tmpl.id, name: boardName, folderId, wsId: WORKSPACE_ID })
    logEvent('monday.board_duplicated', { clienteNome, tipo: tmpl.tipo, boardId: dupData.duplicate_board.board.id })
    if (tmpl.tipo === 'cronograma') cronogramaBoardId = dupData.duplicate_board.board.id
  }

  return { boardId: cronogramaBoardId, folderId }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' })

  const user = await verificarAuthMonday(req)
  if (!user) return res.status(401).json({ ok: false, error: 'Não autorizado.' })

  const apiKey = process.env.MONDAY_API_KEY
  if (!apiKey) return res.status(503).json({ ok: false, error: 'Integração Monday.com não configurada.' })

  const { clienteNome } = req.body ?? {}
  if (!clienteNome?.trim()) return res.status(400).json({ ok: false, error: 'Nome do cliente obrigatório.' })

  try {
    const result = await criarPastaCliente(apiKey, clienteNome.trim())
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    logError('monday.criar_pasta_error', err, { clienteNome })
    return res.status(500).json({ ok: false, error: err.message })
  }
}

import { logEvent, logError } from '../_lib/logger.js'
import { monday, verificarAuthMonday } from '../_lib/monday-client.js'

const GROUP_AS_IS = 'group_title'
const GROUP_TO_BE = 'group_mkzc5pg5'

async function adicionarProcesso(apiKey, boardId, processoNome) {
  const [asIsData, toBeData] = await Promise.all([
    monday(apiKey, `
      mutation($boardId: ID!, $groupId: String!, $name: String!) {
        create_item(board_id: $boardId, group_id: $groupId, item_name: $name) { id }
      }
    `, { boardId: String(boardId), groupId: GROUP_AS_IS, name: processoNome }),
    monday(apiKey, `
      mutation($boardId: ID!, $groupId: String!, $name: String!) {
        create_item(board_id: $boardId, group_id: $groupId, item_name: $name) { id }
      }
    `, { boardId: String(boardId), groupId: GROUP_TO_BE, name: processoNome }),
  ])
  logEvent('monday.process_added', { boardId, processoNome })
  return { itemIdAsis: asIsData.create_item.id, itemIdTobe: toBeData.create_item.id }
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

  const { boardId, processoNome } = req.body ?? {}
  if (!boardId || !processoNome?.trim())
    return res.status(400).json({ ok: false, error: 'boardId e processoNome são obrigatórios.' })

  try {
    const result = await adicionarProcesso(apiKey, boardId, processoNome.trim())
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    logError('monday.adicionar_processo_error', err, { boardId, processoNome })
    return res.status(500).json({ ok: false, error: err.message })
  }
}

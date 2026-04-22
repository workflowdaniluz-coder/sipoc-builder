const MONDAY_API_URL = 'https://api.monday.com/v2'

// IDs fixos — workspace Consultoria + pasta template
const WORKSPACE_ID   = '13792662'
const TEMPLATE_BOARDS = [
  { id: '18397263401', tipo: 'cronograma' },
  { id: '18397210104', tipo: 'infos' },
  { id: '18397210756', tipo: 'ocorrencias' },
]
const GROUP_AS_IS = 'group_title'
const GROUP_TO_BE = 'group_mkzc5pg5'

async function monday(apiKey, query, variables = {}) {
  const resp = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
      'API-Version': '2024-01',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await resp.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}

// Cria pasta + duplica os 3 boards do template
async function criarPastaCliente(apiKey, clienteNome) {
  // 1. Cria pasta com o nome do cliente
  const folderData = await monday(apiKey, `
    mutation($name: String!, $wsId: ID!) {
      create_folder(name: $name, workspace_id: $wsId) { id name }
    }
  `, { name: clienteNome, wsId: WORKSPACE_ID })

  const folderId = folderData.create_folder.id

  // 2. Duplica cada board do template para a nova pasta
  let cronogramaBoardId = null

  for (const tmpl of TEMPLATE_BOARDS) {
    const boardName = tmpl.tipo === 'cronograma'
      ? `Cronograma Projeto BPM - ${clienteNome}`
      : null

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
    `, {
      boardId: tmpl.id,
      name: boardName,
      folderId,
      wsId: WORKSPACE_ID,
    })

    if (tmpl.tipo === 'cronograma') {
      cronogramaBoardId = dupData.duplicate_board.board.id
    }
  }

  return { boardId: cronogramaBoardId, folderId }
}

// Adiciona processo nos grupos AS IS e TO BE do cronograma do cliente
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

  return {
    itemIdAsis: asIsData.create_item.id,
    itemIdTobe: toBeData.create_item.id,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' })

  const apiKey = process.env.MONDAY_API_KEY
  if (!apiKey) return res.status(503).json({ ok: false, error: 'Integração Monday.com não configurada.' })

  const { action, ...params } = req.body ?? {}

  try {
    if (action === 'criar_pasta') {
      if (!params.clienteNome?.trim()) return res.status(400).json({ ok: false, error: 'Nome do cliente obrigatório.' })
      const result = await criarPastaCliente(apiKey, params.clienteNome.trim())
      return res.status(200).json({ ok: true, ...result })
    }

    if (action === 'adicionar_processo') {
      if (!params.boardId || !params.processoNome?.trim())
        return res.status(400).json({ ok: false, error: 'boardId e processoNome são obrigatórios.' })
      const result = await adicionarProcesso(apiKey, params.boardId, params.processoNome.trim())
      return res.status(200).json({ ok: true, ...result })
    }

    return res.status(400).json({ ok: false, error: 'Ação inválida.' })
  } catch (err) {
    console.error('[monday]', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
}

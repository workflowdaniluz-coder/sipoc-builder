import { getAdminClient } from './supabase-admin.js'

const MONDAY_API_URL = 'https://api.monday.com/v2'

export async function monday(apiKey, query, variables = {}) {
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

export async function verificarAuthMonday(req) {
  const authHeader = req.headers['authorization'] ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  if (!jwt) return null
  const supabase = getAdminClient()
  const { data: { user } } = await supabase.auth.getUser(jwt)
  return user ?? null
}

import { randomUUID } from 'node:crypto'

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

function authHeader(accessToken) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

/**
 * Cria evento provisório [HOLD] no Calendar do consultor.
 * status=tentative, visibility=private, sem participantes, sem Meet.
 */
export async function createHoldEvent({ accessToken, clienteNome, startISO, endISO }) {
  const body = {
    summary: `[HOLD] ${clienteNome} — Aguardando confirmação`,
    start: { dateTime: startISO, timeZone: 'America/Sao_Paulo' },
    end:   { dateTime: endISO,   timeZone: 'America/Sao_Paulo' },
    status: 'tentative',
    visibility: 'private',
    reminders: { useDefault: false },
  }

  const resp = await fetch(BASE, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify(body),
  })
  const event = await resp.json()
  if (!resp.ok) throw new Error('Erro ao criar hold: ' + (event.error?.message ?? resp.status))
  return { googleEventId: event.id }
}

/**
 * Deleta evento [HOLD] do Calendar. Best-effort — não joga erro se já deletado.
 */
export async function deleteHoldEvent({ accessToken, googleEventId }) {
  try {
    const resp = await fetch(`${BASE}/${encodeURIComponent(googleEventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
      console.warn('[google-calendar] deleteHoldEvent status inesperado:', resp.status, googleEventId)
    }
  } catch (err) {
    console.warn('[google-calendar] deleteHoldEvent falhou (ignorado):', googleEventId, err.message)
  }
}

// USADO NA CAMADA 5
export async function createConfirmedEventWithMeet({
  accessToken, summary, description, startISO, endISO,
  timeZone = 'America/Sao_Paulo', attendeeEmails = [],
}) {
  const body = {
    summary, description,
    start: { dateTime: startISO, timeZone },
    end:   { dateTime: endISO,   timeZone },
    attendees: attendeeEmails.map(email => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: { useDefault: true },
  }

  const resp = await fetch(`${BASE}?conferenceDataVersion=1&sendUpdates=all`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify(body),
  })
  const event = await resp.json()
  if (!resp.ok) throw new Error('Erro ao criar evento: ' + (event.error?.message ?? resp.status))

  const videoEntry = event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')
  return { googleEventId: event.id, meetUrl: videoEntry?.uri ?? null }
}

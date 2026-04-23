import { randomUUID } from 'node:crypto'

export async function createCalendarEventWithMeet({
  accessToken,
  summary,
  description,
  startISO,
  endISO,
  timeZone = 'America/Sao_Paulo',
  attendeeEmails = [],
}) {
  const body = {
    summary,
    description,
    start: { dateTime: startISO, timeZone },
    end: { dateTime: endISO, timeZone },
    attendees: attendeeEmails.map(email => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: { useDefault: true },
  }

  const resp = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  const event = await resp.json()

  if (!resp.ok) {
    throw new Error('Erro ao criar evento no Google Calendar: ' + (event.error?.message ?? resp.status))
  }

  let meetUrl = null
  try {
    const videoEntry = event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')
    meetUrl = videoEntry?.uri ?? null
  } catch {
    console.warn('[google-calendar] Meet URL não encontrada no evento', event.id)
  }

  return {
    googleEventId: event.id,
    meetUrl,
    htmlLink: event.htmlLink,
  }
}

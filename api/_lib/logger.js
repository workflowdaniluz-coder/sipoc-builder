export function logEvent(event, data = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }))
}

export function logError(event, err, ctx = {}) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event, error: err.message, stack: err.stack?.split('\n')[1]?.trim() ?? null, ...ctx }))
}

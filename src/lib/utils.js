/**
 * Converte URL do Google Drive para embed preview.
 * Exportado aqui para evitar duplicação entre db.js e api/bpmn-ready.js.
 */
export function converterParaEmbedUrl(driveUrl) {
  if (!driveUrl) return null
  const m = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (!m) return null
  return `https://drive.google.com/file/d/${m[1]}/preview`
}

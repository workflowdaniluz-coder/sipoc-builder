const TIPO_LABELS = {
  sipoc: 'Mapeamento SIPOC',
  bpmn: 'Mapeamento BPMN',
  validacao_bpmn: 'Validação BPMN',
}

export function gerarTituloReuniao({ clienteNome, tipo, tipoCustomizado, setorNome }) {
  const tipoLabel = tipo === 'outra' ? tipoCustomizado.trim() : TIPO_LABELS[tipo]
  return setorNome
    ? `[${clienteNome}] ${tipoLabel} - ${setorNome}`
    : `[${clienteNome}] ${tipoLabel}`
}

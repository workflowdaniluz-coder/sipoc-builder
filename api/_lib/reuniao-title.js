const TIPO_LABELS = {
  sipoc: 'Mapeamento SIPOC',
  bpmn: 'Mapeamento BPMN',
  validacao_bpmn: 'Validação BPMN',
}

export function gerarTitulo({ clienteNome, tipo, tipoCustomizado, setorNome }) {
  const label = tipo === 'outra' ? tipoCustomizado.trim() : TIPO_LABELS[tipo]
  return setorNome
    ? `[${clienteNome}] ${label} - ${setorNome}`
    : `[${clienteNome}] ${label}`
}

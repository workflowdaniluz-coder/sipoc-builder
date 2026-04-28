import { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  listarProcessos, salvarProcesso, deletarProcesso, calcularProgresso,
  atualizarResponsavelSetor, getVinculos, addVinculo, removeVinculo, removeVinculosByChip,
} from '../lib/db'

const BuilderContext = createContext(null)

const VINCULO_CFG = {
  suppliers: { tipo: 'supplier_input',  role: 'de',   targetKey: 'inputs',    tiposLimpar: ['supplier_input'] },
  inputs:    { tipo: 'input_output',    role: 'de',   targetKey: 'outputs',   tiposLimpar: ['supplier_input','input_output'] },
  outputs:   { tipo: 'output_customer', role: 'de',   targetKey: 'customers', tiposLimpar: ['input_output','output_customer'] },
  customers: { tipo: 'output_customer', role: 'para', targetKey: 'outputs',   tiposLimpar: ['output_customer'] },
}

export const defaultProcess = {
  id: 'p1', supabase_id: null, setor: 'Geral', setor_id: null,
  name: 'Novo Processo',
  suppliers: [''], inputs: [''], outputs: [''], customers: [''],
  ferramentas: [], periodicidade: '', tipo: '', inputsPadronizados: '',
  outputsPadronizados: '', geridoDados: '', tecnologia: '',
  maturidade: '', esforco: '', impacto: '', observacoes: '',
  rasci: { r: [], a: [], s: [], c: [], i: [] },
}

function newProcess(id = 'p1', overrides = {}) {
  return {
    ...defaultProcess,
    ...overrides,
    id,
    suppliers: [], inputs: [], outputs: [], customers: [],
    ferramentas: [],
    rasci: { r: [], a: [], s: [], c: [], i: [] },
  }
}

function buildEmptyClienteResposta(processo) {
  const inputs = {}; const outputs = {}
  ;(processo.inputs  || []).filter(s => s.trim()).forEach(name => {
    inputs[name]  = { padronizado: '', ferramentas: [], quem_envia: [], observacoes: '' }
  })
  ;(processo.outputs || []).filter(s => s.trim()).forEach(name => {
    outputs[name] = { padronizado: '', ferramentas: [], quem_recebe: [], observacoes: '' }
  })
  return { inputs, outputs, processo: { periodicidade: '', volume_esforco: '', observacoes_gerais: '', rasci: { Responsável: [], Aprovador: [], Suporte: [], Consultado: [], Informado: [] } } }
}

export function BuilderProvider({ children }) {
  const [processes, setProcesses] = useState([])
  const [activeProcessId, setActiveProcessId] = useState(null)
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(false)
  const [clienteExpInputs, setClienteExpInputs] = useState({})
  const [clienteExpOutputs, setClienteExpOutputs] = useState({})
  const [setorResponsavel, setSetorResponsavel] = useState({})
  const [setorDropdownOpen, setSetorDropdownOpen] = useState(null)
  const [filtroResponsavel, setFiltroResponsavel] = useState('')
  const [vinculos, setVinculos] = useState([])
  const [openPopoverKey, setOpenPopoverKey] = useState(null)
  const [syncStatus, setSyncStatus] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('sipoc')

  // Internal state for activeProject and session (synced from App via exposed setters)
  const [_activeProject, _setActiveProject] = useState(null)
  const [_session, _setSession] = useState(null)

  // Refs for stale-closure safety in async callbacks
  const activeProcessIndex = processes.findIndex(p => p.id === activeProcessId)
  const current = processes[activeProcessIndex] || defaultProcess
  const currentRef = useRef(current)
  const activeProjectRef = useRef(_activeProject)
  const sessionRef = useRef(_session)
  const autoSaveTimer = useRef(null)

  useEffect(() => { currentRef.current = current }, [current])
  useEffect(() => { activeProjectRef.current = _activeProject }, [_activeProject])
  useEffect(() => { sessionRef.current = _session }, [_session])

  // Reset expand state when active process changes
  useEffect(() => {
    const inputKeys  = (current.inputs  || []).filter(s => s.trim())
    const outputKeys = (current.outputs || []).filter(s => s.trim())
    setClienteExpInputs( inputKeys.length  > 0 ? { [inputKeys[0]]:  true } : {})
    setClienteExpOutputs(outputKeys.length > 0 ? { [outputKeys[0]]: true } : {})
  }, [activeProcessId]) // eslint-disable-line

  // Load vinculos when active process changes
  useEffect(() => {
    const sid = current.supabase_id
    if (!sid || String(sid).startsWith('p')) { setVinculos([]); return }
    getVinculos(sid).then(setVinculos).catch(() => {})
  }, [current.supabase_id]) // eslint-disable-line

  const processosPorSetor = useMemo(() =>
    processes.reduce((acc, p) => { (acc[p.setor] ??= []).push(p); return acc; }, {}), [processes])

  const globalOutputs = useMemo(() =>
    processes.flatMap(p => p.outputs.filter(o => o.trim()).map(o => ({
      output: o,
      label: `${o} [${p.name}] [${p.setor}]`,
    }))), [processes])

  const progresso = useMemo(() => {
    const map = {}
    processes.forEach(p => { map[p.id] = calcularProgresso(p) })
    return map
  }, [processes])

  const carregarProcessos = async (projectId) => {
    setSyncStatus({}); setActiveTab('sipoc'); setIsLoadingProcesses(true)
    try {
      const procs = await listarProcessos(projectId)
      if (procs.length > 0) {
        setProcesses(procs); setActiveProcessId(procs[0].id)
        const s = {}; procs.forEach(p => { s[p.id] = 'synced' }); setSyncStatus(s)
        const resp = {}
        procs.forEach(p => { if (p.setor_id && p.setor_responsavel) resp[p.setor_id] = p.setor_responsavel })
        setSetorResponsavel(resp)
      } else { setProcesses([newProcess()]); setActiveProcessId('p1') }
    } catch (err) {
      alert('❌ ' + err.message)
      setProcesses([newProcess()]); setActiveProcessId('p1')
    } finally { setIsLoadingProcesses(false) }
  }

  const resetBuilder = () => {
    setSyncStatus({}); setActiveTab('sipoc')
    setProcesses([]); setActiveProcessId(null)
    setVinculos([]); setSetorResponsavel({})
    setFiltroResponsavel('')
  }

  const scheduleAutoSave = useCallback(() => {
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      const proc = currentRef.current
      const proj = activeProjectRef.current
      if (!proj?.id) return
      if (!proc?.supabase_id || proc.supabase_id.startsWith('p')) return
      try {
        setSyncStatus(prev => ({ ...prev, [proc.id]: 'saving' }))
        const { supabase_id, setor_id } = await salvarProcesso(proj.id, proc)
        setProcesses(prev => prev.map(p => p.id === proc.id ? { ...p, supabase_id, setor_id, id: supabase_id } : p))
        setSyncStatus(prev => ({ ...prev, [supabase_id]: 'synced' }))
        setActiveProcessId(supabase_id)
      } catch (err) {
        console.error('Auto-save falhou:', err.message)
        setSyncStatus(prev => ({ ...prev, [proc.id]: 'draft' }))
      }
    }, 2000)
  }, [])

  const markDraft = () => {
    setSyncStatus(prev => ({ ...prev, [activeProcessId]: 'draft' }))
    scheduleAutoSave()
  }

  const guardar = async () => {
    const proj = activeProjectRef.current
    const sess = sessionRef.current
    if (!proj?.id) { alert('Projeto não selecionado.'); return }
    clearTimeout(autoSaveTimer.current)
    setIsSubmitting(true)
    const isNewProcess = !current.supabase_id || current.supabase_id.startsWith('p')
    try {
      const { supabase_id, setor_id } = await salvarProcesso(proj.id, current)
      setProcesses(prev => prev.map(p => p.id === current.id ? { ...p, supabase_id, setor_id, id: supabase_id } : p))
      setSyncStatus(prev => ({ ...prev, [supabase_id]: 'synced' }))
      setActiveProcessId(supabase_id)
      if (isNewProcess && current.name?.trim() && proj.mondayBoardId) {
        fetch('/api/monday/adicionar-processo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sess?.access_token ?? ''}` },
          body: JSON.stringify({ boardId: proj.mondayBoardId, processoNome: current.name.trim() }),
        }).catch(() => {})
      }
    } catch (err) { alert('❌ ' + err.message) }
    finally { setIsSubmitting(false) }
  }

  const excluirProcesso = async () => {
    if (!window.confirm(`Excluir o processo "${current.name}"?\n\nEsta ação não pode ser desfeita.`)) return
    clearTimeout(autoSaveTimer.current)
    const isNew = !current.supabase_id || current.supabase_id.startsWith('p')
    if (!isNew) {
      try { await deletarProcesso(current.supabase_id) }
      catch (err) { alert('❌ ' + err.message); return }
    }
    const remaining = processes.filter(p => p.id !== current.id)
    if (remaining.length === 0) {
      const newId = `p${Date.now()}`
      setProcesses([newProcess(newId)]); setActiveProcessId(newId)
    } else {
      setProcesses(remaining); setActiveProcessId(remaining[0].id)
    }
    setSyncStatus(prev => { const s = { ...prev }; delete s[current.id]; return s })
  }

  const updProc = (fn) => {
    markDraft()
    setProcesses(prev => prev.map((p, i) => i === activeProcessIndex ? fn(p) : p))
  }
  const upd     = (f, v)    => updProc(p => ({ ...p, [f]: v }))
  const updRasci = (l, tags) => updProc(p => ({ ...p, rasci: { ...p.rasci, [l]: tags } }))
  const updArr  = (f, i, v) => updProc(p => ({ ...p, [f]: p[f].map((x, j) => j === i ? v : x) }))
  const rmArr   = (f, i)    => { if (processes[activeProcessIndex]?.[f]?.length > 1) updProc(p => ({ ...p, [f]: p[f].filter((_, j) => j !== i) })) }
  const addArr  = (f)       => updProc(p => ({ ...p, [f]: [...p[f], ''] }))

  const handleVinculoAdd = (newVinculo) => setVinculos(prev => [...prev, newVinculo])
  const handleVinculoRemove = (vinculoId) => {
    setVinculos(prev => prev.filter(v => v.id !== vinculoId))
    removeVinculo(vinculoId).catch(() => {
      const sid = current.supabase_id
      if (sid && !String(sid).startsWith('p')) getVinculos(sid).then(setVinculos).catch(() => {})
    })
  }
  const handleChipRemove = (colKey, chip) => {
    const cfg = VINCULO_CFG[colKey]
    const sid = current.supabase_id
    if (!cfg || !sid || String(sid).startsWith('p')) return
    setVinculos(prev => prev.filter(v =>
      !(cfg.tiposLimpar.includes(v.tipo) && (v.de === chip || v.para === chip))
    ))
    removeVinculosByChip(sid, cfg.tiposLimpar, chip).catch(() => {})
  }

  const getRC = () => {
    const rc = current.respostas_cliente
    return (rc && Object.keys(rc).length > 0) ? rc : buildEmptyClienteResposta(current)
  }
  const updCI = (name, field, val) => { const rc = getRC(); upd('respostas_cliente', { ...rc, inputs:  { ...rc.inputs,  [name]: { ...rc.inputs[name],  [field]: val } } }) }
  const updCO = (name, field, val) => { const rc = getRC(); upd('respostas_cliente', { ...rc, outputs: { ...rc.outputs, [name]: { ...rc.outputs[name], [field]: val } } }) }
  const updCP = (field, val)       => { const rc = getRC(); upd('respostas_cliente', { ...rc, processo: { ...rc.processo, [field]: val } }) }
  const updCR = (papel, tags)      => { const rc = getRC(); upd('respostas_cliente', { ...rc, processo: { ...rc.processo, rasci: { ...rc.processo.rasci, [papel]: tags } } }) }
  const togCI = (name) => setClienteExpInputs( p => ({ ...p, [name]: !p[name] }))
  const togCO = (name) => setClienteExpOutputs(p => ({ ...p, [name]: !p[name] }))

  const handleResponsavelChange = async (setorId, nome) => {
    setSetorResponsavel(prev => ({ ...prev, [setorId]: nome }))
    try { await atualizarResponsavelSetor(setorId, nome || null) }
    catch (err) { alert('❌ ' + err.message) }
  }

  const handleAdicionarProcesso = (activeSetor) => {
    if (!activeSetor?.id) return
    const newId = `p${Date.now()}`
    setProcesses(prev => [...prev, newProcess(newId, { setor: activeSetor.nome, setor_id: activeSetor.id })])
    setActiveProcessId(newId)
  }

  return (
    <BuilderContext.Provider value={{
      defaultProcess, processes, setProcesses, activeProcessId, setActiveProcessId,
      isLoadingProcesses, syncStatus, setSyncStatus, isSubmitting,
      clienteExpInputs, clienteExpOutputs,
      setorResponsavel, setSetorResponsavel, setorDropdownOpen, setSetorDropdownOpen,
      filtroResponsavel, setFiltroResponsavel,
      vinculos, openPopoverKey, setOpenPopoverKey,
      activeTab, setActiveTab,
      current, activeProcessIndex, processosPorSetor, globalOutputs, progresso,
      carregarProcessos, resetBuilder,
      guardar, excluirProcesso,
      upd, updRasci, updArr, rmArr, addArr,
      markDraft, scheduleAutoSave,
      handleVinculoAdd, handleVinculoRemove, handleChipRemove,
      getRC, updCI, updCO, updCP, updCR, togCI, togCO,
      handleResponsavelChange, handleAdicionarProcesso,
      // Setters for App to sync state into this context
      setActiveProjectInBuilder: _setActiveProject,
      setSessionInBuilder: _setSession,
    }}>
      {children}
    </BuilderContext.Provider>
  )
}

export function useBuilder() { return useContext(BuilderContext) }

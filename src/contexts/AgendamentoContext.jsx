import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { getGoogleAuthStatus, ofertarDisponibilidade, cancelarOferta, listarTokensAgendamentoPorSetor } from '../lib/db'
import { supabase } from '../lib/supabase'

const AgendamentoContext = createContext(null)

export function AgendamentoProvider({ children }) {
  // Internal state synced from App via exposed setters
  const [_activeProject, _setActiveProject] = useState(null)
  const [_activeSetor, _setActiveSetor] = useState(null)
  const [_session, _setSession] = useState(null)

  const activeProjectRef = useRef(_activeProject)
  const activeSetorRef = useRef(_activeSetor)
  const sessionRef = useRef(_session)
  useEffect(() => { activeProjectRef.current = _activeProject }, [_activeProject])
  useEffect(() => { activeSetorRef.current = _activeSetor }, [_activeSetor])
  useEffect(() => { sessionRef.current = _session }, [_session])

  const [googleAuth, setGoogleAuth] = useState(null)
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false)
  const [agendarModalOpen, setAgendarModalOpen] = useState(false)
  const [agendarForm, setAgendarForm] = useState({
    tipo: 'sipoc', tipo_customizado: '', duracao_min: 60, sipoc_ids: [], slots: [''], qtd_escolha: 1, participantes_sugeridos: [],
  })
  const [agendarParticipanteInput, setAgendarParticipanteInput] = useState({ nome: '', email: '' })
  const [agendarLoading, setAgendarLoading] = useState(false)
  const [agendarResultado, setAgendarResultado] = useState(null)
  const [ofertasAtivas, setOfertasAtivas] = useState([])
  const [ofertasCancelando, setOfertasCancelando] = useState(new Set())
  const [levModal, setLevModal] = useState(null)
  const [levConversa, setLevConversa] = useState([])
  const [levCarregando, setLevCarregando] = useState(false)

  const carregarGoogleAuth = async () => {
    const sess = sessionRef.current
    if (!sess?.user?.id) return
    try {
      const status = await getGoogleAuthStatus(sess.user.id)
      setGoogleAuth(status)
    } catch { setGoogleAuth({ conectado: false, email: null, conectadoEm: null }) }
  }

  const handleConectarGoogle = async () => {
    setGoogleAuthLoading(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const resp = await fetch('/api/auth/google/start', { method: 'POST', headers: { Authorization: `Bearer ${s.access_token}` } })
      const json = await resp.json()
      if (json.ok) window.location.href = json.authUrl
      else alert('Erro ao iniciar conexão: ' + (json.error ?? 'tente novamente'))
    } catch { alert('Erro ao iniciar conexão com o Google.') }
    finally { setGoogleAuthLoading(false) }
  }

  const handleDesconectarGoogle = async () => {
    if (!window.confirm('Desconectar sua conta Google Calendar?')) return
    setGoogleAuthLoading(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const resp = await fetch('/api/auth/google/disconnect', { method: 'POST', headers: { Authorization: `Bearer ${s.access_token}` } })
      const json = await resp.json()
      if (json.ok) await carregarGoogleAuth()
      else alert('Erro ao desconectar: ' + (json.error ?? 'tente novamente'))
    } catch { alert('Erro ao desconectar Google.') }
    finally { setGoogleAuthLoading(false) }
  }

  const abrirAgendarModal = () => {
    setAgendarResultado(null)
    setAgendarForm({ tipo: 'sipoc', tipo_customizado: '', duracao_min: 60, sipoc_ids: [], slots: [''], qtd_escolha: 1, participantes_sugeridos: [] })
    setAgendarParticipanteInput({ nome: '', email: '' })
    setAgendarModalOpen(true)
  }

  const carregarOfertasAtivas = async (setorId) => {
    try {
      const data = await listarTokensAgendamentoPorSetor(setorId)
      setOfertasAtivas(data)
    } catch { /* silencia */ }
  }

  const handleOfertarSubmit = async () => {
    const proj = activeProjectRef.current
    const setor = activeSetorRef.current
    const slotsValidos = agendarForm.slots.filter(s => s.trim())
    if (slotsValidos.length < 2) return alert('Informe pelo menos 2 horários disponíveis.')
    if (agendarForm.tipo === 'outra' && !agendarForm.tipo_customizado.trim()) return alert('Informe o tipo customizado.')
    const minFuturo = Date.now() + 60 * 60 * 1000
    for (const s of slotsValidos) {
      if (new Date(s).getTime() < minFuturo) return alert('Todos os horários devem ser pelo menos 1h no futuro.')
    }
    setAgendarLoading(true)
    try {
      const result = await ofertarDisponibilidade({
        cliente_id: proj.id, setor_id: setor.id,
        tipo: agendarForm.tipo,
        tipo_customizado: agendarForm.tipo === 'outra' ? agendarForm.tipo_customizado.trim() : undefined,
        duracao_min: agendarForm.duracao_min, sipoc_ids: agendarForm.sipoc_ids,
        slots: slotsValidos, qtd_escolha: agendarForm.qtd_escolha,
        participantes_sugeridos: agendarForm.participantes_sugeridos,
      })
      setAgendarResultado(result)
      carregarOfertasAtivas(setor.id)
    } catch (err) { alert('Erro: ' + err.message) }
    finally { setAgendarLoading(false) }
  }

  const handleCancelarOferta = async (token) => {
    if (!confirm('Cancelar esta oferta? Os horários reservados no Google Calendar serão liberados.')) return
    setOfertasCancelando(prev => new Set(prev).add(token))
    try {
      await cancelarOferta(token)
      setOfertasAtivas(prev => prev.filter(o => o.token !== token))
    } catch (err) { alert('Erro ao cancelar: ' + err.message) }
    finally { setOfertasCancelando(prev => { const s = new Set(prev); s.delete(token); return s }) }
  }

  return (
    <AgendamentoContext.Provider value={{
      googleAuth, googleAuthLoading,
      agendarModalOpen, setAgendarModalOpen, agendarForm, setAgendarForm,
      agendarParticipanteInput, setAgendarParticipanteInput,
      agendarLoading, agendarResultado,
      ofertasAtivas, setOfertasAtivas, ofertasCancelando,
      levModal, setLevModal, levConversa, setLevConversa, levCarregando, setLevCarregando,
      carregarGoogleAuth, handleConectarGoogle, handleDesconectarGoogle,
      abrirAgendarModal, carregarOfertasAtivas, handleOfertarSubmit, handleCancelarOferta,
      // Setters for App to sync state into this context
      setActiveProjectInAgenda: _setActiveProject,
      setActiveSetorInAgenda: _setActiveSetor,
      setSessionInAgenda: _setSession,
    }}>
      {children}
    </AgendamentoContext.Provider>
  )
}

export function useAgendamento() { return useContext(AgendamentoContext) }

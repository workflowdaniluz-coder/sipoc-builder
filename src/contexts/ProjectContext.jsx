import { createContext, useContext, useState } from 'react'
import {
  listarProjetos, buscarDetalhesCliente, listarNotificacoes,
  atualizarStatusNotificacao, contarNotificacoesUnread, criarSetor,
} from '../lib/db'

const ProjectContext = createContext(null)

export function ProjectProvider({ children }) {
  const [projetos, setProjetos] = useState([])
  const [activeProject, setActiveProject] = useState(null)
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [criarProjetoModal, setCriarProjetoModal] = useState(false)
  const [projetoDetalhes, setProjetoDetalhes] = useState(null)
  const [isLoadingDetalhes, setIsLoadingDetalhes] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState({})
  const [notifications, setNotifications] = useState([])
  const [notifModalData, setNotifModalData] = useState(null)
  const [notifSectionOpen, setNotifSectionOpen] = useState(true)
  const [novoSetorModal, setNovoSetorModal] = useState(false)
  const [novoSetorNome, setNovoSetorNome] = useState('')
  const [novoSetorResp, setNovoSetorResp] = useState('')

  const carregarProjetos = async () => {
    setIsLoadingProjects(true)
    try {
      const lista = await listarProjetos()
      setProjetos(lista)
      const counts = await contarNotificacoesUnread(lista.map(p => p.id)).catch(() => ({}))
      setUnreadCounts(counts)
    } catch (err) { alert('Não foi possível carregar os projetos: ' + err.message) }
    finally { setIsLoadingProjects(false) }
  }

  const carregarDetalhes = async (projectId) => {
    setIsLoadingDetalhes(true)
    try {
      const detalhes = await buscarDetalhesCliente(projectId)
      setProjetoDetalhes(detalhes)
    } catch (err) { alert('❌ ' + err.message) }
    finally { setIsLoadingDetalhes(false) }
  }

  const carregarNotificacoes = async (projectId) => {
    try {
      const data = await listarNotificacoes(projectId)
      setNotifications(data)
    } catch { /* silencia — notificações não bloqueiam o fluxo */ }
  }

  const handleDismissNotif = async (notifId) => {
    try {
      await atualizarStatusNotificacao(notifId, 'dismissed')
      setNotifications(prev => prev.filter(n => n.id !== notifId))
      setUnreadCounts(prev => ({
        ...prev,
        [activeProject.id]: Math.max(0, (prev[activeProject.id] ?? 0) - 1),
      }))
    } catch (err) { alert('❌ ' + err.message) }
  }

  const handleMarkRead = async (notifId) => {
    try {
      await atualizarStatusNotificacao(notifId, 'read')
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, status: 'read' } : n))
      setUnreadCounts(prev => ({
        ...prev,
        [activeProject.id]: Math.max(0, (prev[activeProject.id] ?? 0) - 1),
      }))
    } catch { /* silencia */ }
  }

  const handleCriarSetor = async () => {
    const nome = novoSetorNome.trim()
    if (!nome || !activeProject?.id) return
    try {
      await criarSetor(activeProject.id, nome, novoSetorResp || null)
      setNovoSetorModal(false); setNovoSetorNome(''); setNovoSetorResp('')
      carregarDetalhes(activeProject.id)
    } catch (err) { alert('❌ ' + err.message) }
  }

  return (
    <ProjectContext.Provider value={{
      projetos, setProjetos, activeProject, setActiveProject,
      isLoadingProjects, criarProjetoModal, setCriarProjetoModal,
      projetoDetalhes, isLoadingDetalhes,
      unreadCounts, setUnreadCounts, notifications, setNotifications,
      notifModalData, setNotifModalData, notifSectionOpen, setNotifSectionOpen,
      novoSetorModal, setNovoSetorModal, novoSetorNome, setNovoSetorNome,
      novoSetorResp, setNovoSetorResp,
      carregarProjetos, carregarDetalhes, carregarNotificacoes,
      handleDismissNotif, handleMarkRead, handleCriarSetor,
    }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() { return useContext(ProjectContext) }

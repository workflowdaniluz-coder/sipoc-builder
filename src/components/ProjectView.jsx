import { useState } from 'react'
import { atualizarCliente, gerarTokenFormulario } from '../lib/db'
import { STATUS_CONFIG } from '../lib/constants'

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
]

function formatarData(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const LBL = ({ children, htmlFor, optional }) => (
  <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
    {children}
    {optional && <span className="ml-1 text-slate-400 normal-case font-normal tracking-normal">opcional</span>}
  </label>
)
const INPUT = ({ id, ...props }) => (
  <input id={id} {...props}
    className={`w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
      focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
      placeholder:text-slate-400 bg-white ${props.className ?? ''}`} />
)
const TEXTAREA = ({ id, ...props }) => (
  <textarea id={id} {...props} rows={3}
    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
      focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
      placeholder:text-slate-400 resize-none bg-white" />
)

function ChipsInput({ values, onChange, placeholder }) {
  const [val, setVal] = useState('')
  const commit = (text) => {
    const t = text.trim()
    if (t && !values.includes(t)) onChange([...values, t])
    setVal('')
  }
  return (
    <div className="min-h-[42px] px-2.5 py-2 rounded-xl border border-slate-200 flex flex-wrap gap-1.5
      bg-white focus-within:border-[#ecbf03] focus-within:ring-2 focus-within:ring-[#ecbf03]/20 transition-all">
      {values.map((a, i) => (
        <span key={i} className="inline-flex items-center gap-1 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md">
          {a}
          <button type="button" onClick={() => onChange(values.filter((_, idx) => idx !== i))}
            className="text-slate-400 hover:text-white leading-none">×</button>
        </span>
      ))}
      <input value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(val) }
          else if (e.key === 'Backspace' && !val && values.length > 0) onChange(values.slice(0, -1))
        }}
        onBlur={() => { if (val.trim()) commit(val) }}
        placeholder={values.length === 0 ? placeholder : 'Enter para adicionar…'}
        className="flex-1 bg-transparent outline-none text-sm min-w-[140px] text-slate-700 placeholder:text-slate-400" />
    </div>
  )
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-700">{value}</p>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────

export default function ProjectView({ projeto, isLoading, onBack, onOpenTools, onRefresh }) {
  const [statusDropdown, setStatusDropdown] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [drawerOpen,     setDrawerOpen]     = useState(false)
  const [copiedLink,     setCopiedLink]     = useState(false)
  const [generatingLink, setGeneratingLink] = useState(false)

  if (isLoading || !projeto) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-[#ecbf03] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Carregando projeto…</span>
        </div>
      </div>
    )
  }

  const status = projeto.statusProjeto ?? 'em_andamento'
  const sc     = STATUS_CONFIG[status] ?? STATUS_CONFIG.em_andamento
  const qtd        = projeto.quantidadeMapeamentos ?? 0
  const realizados = projeto.mapeamentosRealizados ?? 0
  const pct        = qtd > 0 ? Math.round((realizados / qtd) * 100) : 0

  const temProposta = !!(projeto.tempoProjeto || projeto.quantidadeMapeamentos || projeto.escopo || projeto.dataInicio)

  const handleStatusChange = async (novoStatus) => {
    setStatusDropdown(false)
    setUpdatingStatus(true)
    try {
      await atualizarCliente(projeto.id, { statusProjeto: novoStatus })
      onRefresh()
    } catch (err) { alert('❌ ' + err.message) }
    finally { setUpdatingStatus(false) }
  }

  const handleGerarLink = async () => {
    setGeneratingLink(true)
    try {
      const token = await gerarTokenFormulario(projeto.id)
      const url = `${window.location.origin}?cf=${token}`
      await navigator.clipboard.writeText(url)
      onRefresh()
      alert(`Link copiado!\n\n${url}\n\nEnvie para os participantes preencherem seus dados.`)
    } catch (err) { alert('❌ ' + err.message) }
    finally { setGeneratingLink(false) }
  }

  const handleCopyLink = async () => {
    const url = `${window.location.origin}?cf=${projeto.tokenFormulario}`
    await navigator.clipboard.writeText(url)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  // Timeline
  const marcos = [
    { done: true, label: 'Projeto iniciado', detalhe: formatarData(projeto.criadoEm?.split('T')[0]) },
    {
      done: projeto.totalSetores > 0,
      label: projeto.totalSetores > 0
        ? `${projeto.totalSetores} setor${projeto.totalSetores !== 1 ? 'es' : ''} cadastrado${projeto.totalSetores !== 1 ? 's' : ''}`
        : 'Setores não cadastrados',
    },
    {
      done: projeto.totalSipocs > 0,
      label: projeto.totalSipocs > 0
        ? `${realizados} de ${projeto.totalSipocs} processo${projeto.totalSipocs !== 1 ? 's' : ''} mapeado${projeto.totalSipocs !== 1 ? 's' : ''}`
        : 'Nenhum processo mapeado',
    },
    {
      done: !!projeto.ultimoAcessoCliente,
      label: projeto.ultimoAcessoCliente ? 'Cliente acessou pela última vez' : 'Cliente ainda não acessou',
      detalhe: projeto.ultimoAcessoCliente ? formatarData(projeto.ultimoAcessoCliente.split('T')[0]) : null,
    },
    { done: false, future: true, label: 'Encerramento previsto', detalhe: formatarData(projeto.dataFimProjeto) },
  ]

  return (
    <div className="max-w-screen-md mx-auto w-full px-6 py-8 space-y-5 flex-1">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-800 truncate">{projeto.nome}</h1>
          {projeto.segmento && <p className="text-sm text-slate-400 mt-0.5">{projeto.segmento}</p>}
          {(projeto.cidade || projeto.estado) && (
            <p className="text-xs text-slate-400 mt-0.5">
              {[projeto.cidade, projeto.estado].filter(Boolean).join(' — ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <button onClick={() => setStatusDropdown(o => !o)} disabled={updatingStatus}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all
                ${sc.cls} hover:opacity-80 disabled:opacity-50`}>
              {updatingStatus ? '…' : sc.label}
              <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {statusDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-30 min-w-[160px]">
                {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                  <button key={val} onClick={() => handleStatusChange(val)}
                    className={`w-full text-left px-4 py-2.5 text-sm font-semibold flex items-center gap-2
                      hover:bg-slate-50 transition-all ${val === status ? 'bg-slate-50' : ''}`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${cfg.cls.split(' ')[0]}`} />
                    {cfg.label}
                    {val === status && (
                      <svg className="w-3.5 h-3.5 text-[#ecbf03] ml-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setDrawerOpen(true)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold
                       text-slate-600 hover:bg-slate-50 transition-all">
            Editar
          </button>
        </div>
      </div>

      {/* Empresa */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Empresa</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          <InfoRow label="Unidades / filiais" value={projeto.unidades != null ? String(projeto.unidades) : null} />
          <InfoRow label="Colaboradores" value={projeto.colaboradoresTotal != null ? projeto.colaboradoresTotal.toLocaleString('pt-BR') : null} />
          <InfoRow label="Colab. / filial" value={projeto.colaboradoresPorFilial} />
          {projeto.linkDrive && (
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Drive</p>
              <a href={projeto.linkDrive} target="_blank" rel="noopener noreferrer"
                className="text-sm font-semibold text-[#ecbf03] hover:underline truncate block">
                Abrir documentos
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Áreas */}
      {(projeto.areas?.length > 0 || projeto.colaboradoresPorArea || projeto.processosPorArea) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Áreas</p>
          {projeto.areas?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {projeto.areas.map((a, i) => (
                <span key={i} className="text-xs font-semibold bg-[#ecbf03]/10 text-[#16253e] border border-[#ecbf03]/30 px-2.5 py-1 rounded-lg">
                  {a}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="Colab. / área" value={projeto.colaboradoresPorArea} />
            <InfoRow label="Processos / área" value={projeto.processosPorArea} />
          </div>
        </div>
      )}

      {/* Problemas */}
      {projeto.problemasNecessidades && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Problemas e necessidades</p>
          <p className="text-sm text-slate-600 leading-relaxed">{projeto.problemasNecessidades}</p>
        </div>
      )}

      {/* Proposta */}
      <div className={`rounded-2xl border shadow-sm p-5 space-y-4 ${temProposta ? 'bg-white border-slate-200' : 'bg-slate-50 border-dashed border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Proposta</p>
          {!temProposta && (
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
              Aguardando
            </span>
          )}
        </div>
        {temProposta ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
            <InfoRow label="Duração" value={projeto.tempoProjeto} />
            <InfoRow label="Mapeamentos" value={projeto.quantidadeMapeamentos != null ? String(projeto.quantidadeMapeamentos) : null} />
            <InfoRow label="Data de início" value={formatarData(projeto.dataInicio)} />
            {projeto.escopo && (
              <div className="col-span-2 sm:col-span-4">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Escopo</p>
                <p className="text-sm text-slate-600 leading-relaxed">{projeto.escopo}</p>
              </div>
            )}
            {qtd > 0 && (
              <div className="col-span-2 sm:col-span-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Progresso</p>
                  <p className="text-[10px] font-bold text-slate-500">{realizados}/{qtd} — {pct}%</p>
                </div>
                <div className="bg-slate-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">
            Preencha os dados da proposta após a aprovação do cliente. Clique em <strong>Editar</strong> para complementar.
          </p>
        )}
      </div>

      {/* Participantes */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Participantes</p>
            {projeto.contatos?.length > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">{projeto.contatos.length} cadastrado{projeto.contatos.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          <div className="flex gap-2">
            {projeto.tokenFormulario && (
              <button onClick={handleCopyLink}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold
                           text-slate-600 hover:bg-slate-50 transition-all">
                {copiedLink ? 'Copiado!' : 'Copiar link'}
              </button>
            )}
            <button onClick={handleGerarLink} disabled={generatingLink}
              className="px-3 py-1.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e]
                         text-xs font-bold transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/20">
              {generatingLink ? 'Gerando…' : projeto.tokenFormulario ? 'Novo link' : 'Gerar link'}
            </button>
          </div>
        </div>

        {projeto.contatos?.length > 0 ? (
          <div className="divide-y divide-slate-100 -mx-1">
            {projeto.contatos.map(c => (
              <div key={c.id} className="px-1 py-2.5 grid grid-cols-[1fr_auto] gap-2 items-start">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{c.nome}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {[c.cargo, c.setor].filter(Boolean).join(' · ')}
                    {c.gestao_direta && <span className="ml-2 text-slate-300">Gestão: {c.gestao_direta}</span>}
                  </p>
                </div>
                {c.email && (
                  <a href={`mailto:${c.email}`} className="text-xs text-slate-400 hover:text-[#ecbf03] transition-colors truncate max-w-[180px]">
                    {c.email}
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
            <p className="text-sm text-slate-400">Nenhum participante cadastrado.</p>
            <p className="text-xs text-slate-400 mt-1">Gere um link e envie para os participantes preencherem.</p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Linha do tempo</p>
        <div className="space-y-0">
          {marcos.map((m, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex flex-col items-center flex-shrink-0 w-5">
                <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 mt-1
                  ${m.future ? 'border-slate-300 bg-white' : m.done ? 'border-[#ecbf03] bg-[#ecbf03]' : 'border-slate-300 bg-slate-100'}`} />
                {i < marcos.length - 1 && (
                  <div className={`w-px flex-1 min-h-[20px] ${m.done && !m.future ? 'bg-[#ecbf03]/40' : 'bg-slate-200'}`} />
                )}
              </div>
              <div className="pb-4 min-w-0">
                <p className={`text-sm font-semibold ${m.future || !m.done ? 'text-slate-400' : 'text-slate-700'}`}>{m.label}</p>
                {m.detalhe && <p className="text-xs text-slate-400 mt-0.5">{m.detalhe}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="flex justify-end pb-4">
        <button onClick={onOpenTools}
          className="bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] px-8 py-3 rounded-xl
                     font-bold text-sm transition-all shadow-sm shadow-[#ecbf03]/30 flex items-center gap-2">
          Abrir ferramentas
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>

      {drawerOpen && (
        <EditDrawer projeto={projeto} onClose={() => setDrawerOpen(false)} onSaved={() => { setDrawerOpen(false); onRefresh() }} />
      )}
    </div>
  )
}

// ── Drawer de edição ──────────────────────────────────────────────

function EditDrawer({ projeto, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)

  // Dados da empresa
  const [nome,                  setNome]                  = useState(projeto.nome ?? '')
  const [segmento,              setSegmento]              = useState(projeto.segmento ?? '')
  const [unidades,              setUnidades]              = useState(projeto.unidades ?? '')
  const [colaboradoresTotal,    setColaboradoresTotal]    = useState(projeto.colaboradoresTotal ?? '')
  const [colaboradoresPorFilial,setColaboradoresPorFilial]= useState(projeto.colaboradoresPorFilial ?? '')
  const [cidade,                setCidade]                = useState(projeto.cidade ?? '')
  const [estado,                setEstado]                = useState(projeto.estado ?? '')
  const [areas,                 setAreas]                 = useState(projeto.areas ?? [])
  const [colaboradoresPorArea,  setColaboradoresPorArea]  = useState(projeto.colaboradoresPorArea ?? '')
  const [processosPorArea,      setProcessosPorArea]      = useState(projeto.processosPorArea ?? '')
  const [problemasNecessidades, setProblemasNecessidades] = useState(projeto.problemasNecessidades ?? '')
  const [linkDrive,             setLinkDrive]             = useState(projeto.linkDrive ?? '')
  // Dados pós-proposta
  const [tempoProjeto,          setTempoProjeto]          = useState(projeto.tempoProjeto ?? '')
  const [quantidadeMapeamentos, setQuantidadeMapeamentos] = useState(projeto.quantidadeMapeamentos ?? '')
  const [escopo,                setEscopo]                = useState(projeto.escopo ?? '')
  const [dataInicio,            setDataInicio]            = useState(projeto.dataInicio ?? '')
  const [dataFimProjeto,        setDataFimProjeto]        = useState(projeto.dataFimProjeto ?? '')

  const handleSave = async () => {
    if (!nome.trim()) return
    setSaving(true)
    try {
      await atualizarCliente(projeto.id, {
        nome: nome.trim(), segmento, unidades, colaboradoresTotal,
        colaboradoresPorFilial, cidade, estado, areas,
        colaboradoresPorArea, processosPorArea, problemasNecessidades, linkDrive,
        tempoProjeto, quantidadeMapeamentos, escopo, dataInicio, dataFimProjeto,
      })
      onSaved()
    } catch (err) {
      alert('❌ ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-slate-800 text-lg">Editar projeto</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Proposta */}
          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Proposta</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <LBL htmlFor="ed-tempo" optional>Duração do projeto</LBL>
                <INPUT id="ed-tempo" value={tempoProjeto} onChange={e => setTempoProjeto(e.target.value)} placeholder="Ex: 3 meses" />
              </div>
              <div>
                <LBL htmlFor="ed-qtd" optional>Qtd. mapeamentos</LBL>
                <INPUT id="ed-qtd" type="number" min="1" value={quantidadeMapeamentos} onChange={e => setQuantidadeMapeamentos(e.target.value)} placeholder="Ex: 10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <LBL htmlFor="ed-inicio" optional>Data de início</LBL>
                <INPUT id="ed-inicio" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              </div>
              <div>
                <LBL htmlFor="ed-fim" optional>Data de encerramento</LBL>
                <INPUT id="ed-fim" type="date" value={dataFimProjeto} onChange={e => setDataFimProjeto(e.target.value)} />
              </div>
            </div>
            <div>
              <LBL htmlFor="ed-escopo" optional>Escopo</LBL>
              <TEXTAREA id="ed-escopo" value={escopo} onChange={e => setEscopo(e.target.value)} placeholder="Descreva o escopo acordado…" />
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Empresa */}
          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Empresa</p>
            <div>
              <LBL htmlFor="ed-nome">Nome <span className="text-red-400">*</span></LBL>
              <INPUT id="ed-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da empresa" />
            </div>
            <div>
              <LBL htmlFor="ed-segmento" optional>Segmento</LBL>
              <INPUT id="ed-segmento" value={segmento} onChange={e => setSegmento(e.target.value)} placeholder="Ex: Indústria, Varejo…" />
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Estrutura */}
          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estrutura</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <LBL htmlFor="ed-unidades" optional>Filiais</LBL>
                <INPUT id="ed-unidades" type="number" min="0" value={unidades} onChange={e => setUnidades(e.target.value)} placeholder="Qtd." />
              </div>
              <div>
                <LBL htmlFor="ed-colab" optional>Colaboradores</LBL>
                <INPUT id="ed-colab" type="number" min="0" value={colaboradoresTotal} onChange={e => setColaboradoresTotal(e.target.value)} placeholder="Nº total" />
              </div>
            </div>
            <div>
              <LBL htmlFor="ed-colab-filial" optional>Colaboradores / filial</LBL>
              <INPUT id="ed-colab-filial" value={colaboradoresPorFilial} onChange={e => setColaboradoresPorFilial(e.target.value)} placeholder="Ex: 50 por filial" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <LBL htmlFor="ed-cidade" optional>Cidade</LBL>
                <INPUT id="ed-cidade" value={cidade} onChange={e => setCidade(e.target.value)} placeholder="São Paulo" />
              </div>
              <div>
                <LBL htmlFor="ed-estado" optional>Estado</LBL>
                <select id="ed-estado" value={estado} onChange={e => setEstado(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white
                    focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all text-slate-700">
                  <option value="">—</option>
                  {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Áreas */}
          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Áreas</p>
            <div>
              <LBL optional>Áreas da empresa</LBL>
              <ChipsInput values={areas} onChange={setAreas} placeholder="Financeiro, RH… (Enter)" />
            </div>
            <div>
              <LBL htmlFor="ed-colab-area" optional>Colab. / área</LBL>
              <INPUT id="ed-colab-area" value={colaboradoresPorArea} onChange={e => setColaboradoresPorArea(e.target.value)} placeholder="Ex: Financeiro 10, RH 8…" />
            </div>
            <div>
              <LBL htmlFor="ed-proc-area" optional>Processos / área</LBL>
              <INPUT id="ed-proc-area" value={processosPorArea} onChange={e => setProcessosPorArea(e.target.value)} placeholder="Ex: Financeiro 5, RH 3…" />
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Contexto */}
          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contexto</p>
            <div>
              <LBL htmlFor="ed-problemas" optional>Problemas e necessidades</LBL>
              <TEXTAREA id="ed-problemas" value={problemasNecessidades} onChange={e => setProblemasNecessidades(e.target.value)}
                placeholder="Principais problemas e gargalos…" />
            </div>
            <div>
              <LBL htmlFor="ed-drive" optional>Link Drive</LBL>
              <INPUT id="ed-drive" type="url" value={linkDrive} onChange={e => setLinkDrive(e.target.value)} placeholder="https://drive.google.com/…" />
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold
                       text-slate-500 hover:bg-slate-50 transition-all">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !nome.trim()}
            className="flex-1 py-2.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e]
                       font-bold text-sm transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </>
  )
}

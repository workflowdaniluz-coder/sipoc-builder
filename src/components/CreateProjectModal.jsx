import { useState } from 'react'
import { criarProjeto, atualizarCliente } from '../lib/db'

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
]

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

export default function CreateProjectModal({ onClose, onCreated }) {
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const [nome,                  setNome]                  = useState('')
  const [segmento,              setSegmento]              = useState('')
  const [unidades,              setUnidades]              = useState('')
  const [colaboradoresTotal,    setColaboradoresTotal]    = useState('')
  const [colaboradoresPorFilial,setColaboradoresPorFilial]= useState('')
  const [cidade,                setCidade]                = useState('')
  const [estado,                setEstado]                = useState('')
  const [areas,                 setAreas]                 = useState([])
  const [colaboradoresPorArea,  setColaboradoresPorArea]  = useState('')
  const [processosPorArea,      setProcessosPorArea]      = useState('')
  const [problemasNecessidades, setProblemasNecessidades] = useState('')
  const [linkDrive,             setLinkDrive]             = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    setError('')
    try {
      const p = await criarProjeto({
        nome: nome.trim(), segmento, unidades, colaboradoresTotal,
        colaboradoresPorFilial, cidade, estado, areas,
        colaboradoresPorArea, processosPorArea,
        problemasNecessidades, linkDrive,
      })

      // Cria pasta no Monday.com em background — não bloqueia o fluxo principal
      fetch('/api/monday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'criar_pasta', clienteNome: nome.trim() }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.ok && d.boardId) {
            atualizarCliente(p.id, { mondayBoardId: d.boardId, mondayFolderId: d.folderId })
              .catch(() => {})
          }
        })
        .catch(() => {})

      onCreated(p)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Novo projeto</h2>
            <p className="text-xs text-slate-400 mt-0.5">Preencha as informações do cliente</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">×</button>
        </div>

        {/* Body */}
        <form id="create-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Empresa */}
          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Empresa</p>
            <div>
              <LBL htmlFor="cp-nome">Nome da empresa <span className="text-red-400">*</span></LBL>
              <INPUT id="cp-nome" autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Empresa ABC" required />
            </div>
            <div>
              <LBL htmlFor="cp-segmento" optional>Segmento</LBL>
              <INPUT id="cp-segmento" value={segmento} onChange={e => setSegmento(e.target.value)} placeholder="Ex: Indústria, Varejo, Saúde…" />
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Estrutura */}
          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estrutura</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <LBL htmlFor="cp-unidades" optional>Filiais</LBL>
                <INPUT id="cp-unidades" type="number" min="0" value={unidades} onChange={e => setUnidades(e.target.value)} placeholder="Qtd." />
              </div>
              <div>
                <LBL htmlFor="cp-colab" optional>Colaboradores total</LBL>
                <INPUT id="cp-colab" type="number" min="0" value={colaboradoresTotal} onChange={e => setColaboradoresTotal(e.target.value)} placeholder="Nº" />
              </div>
            </div>
            <div>
              <LBL htmlFor="cp-colab-filial" optional>Colaboradores / filial</LBL>
              <INPUT id="cp-colab-filial" value={colaboradoresPorFilial} onChange={e => setColaboradoresPorFilial(e.target.value)} placeholder="Ex: 50 por filial" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <LBL htmlFor="cp-cidade" optional>Cidade</LBL>
                <INPUT id="cp-cidade" value={cidade} onChange={e => setCidade(e.target.value)} placeholder="São Paulo" />
              </div>
              <div>
                <LBL htmlFor="cp-estado" optional>Estado</LBL>
                <select id="cp-estado" value={estado} onChange={e => setEstado(e.target.value)}
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
              <LBL htmlFor="cp-colab-area" optional>Nº de colaboradores / área</LBL>
              <INPUT id="cp-colab-area" value={colaboradoresPorArea} onChange={e => setColaboradoresPorArea(e.target.value)} placeholder="Ex: Financeiro 10, RH 8…" />
            </div>
            <div>
              <LBL htmlFor="cp-proc-area" optional>Processos / área</LBL>
              <INPUT id="cp-proc-area" value={processosPorArea} onChange={e => setProcessosPorArea(e.target.value)} placeholder="Ex: Financeiro 5, RH 3…" />
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Contexto */}
          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contexto</p>
            <div>
              <LBL htmlFor="cp-problemas" optional>Problemas e necessidades</LBL>
              <TEXTAREA id="cp-problemas" value={problemasNecessidades} onChange={e => setProblemasNecessidades(e.target.value)}
                placeholder="Descreva os principais problemas, gargalos e necessidades do cliente…" />
            </div>
            <div>
              <LBL htmlFor="cp-drive" optional>Link Drive</LBL>
              <INPUT id="cp-drive" type="url" value={linkDrive} onChange={e => setLinkDrive(e.target.value)}
                placeholder="https://drive.google.com/…" />
              <p className="text-[11px] text-slate-400 mt-1">Organograma e documentações de processos gerais</p>
            </div>
          </section>

          {error && (
            <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold
                       text-slate-500 hover:bg-slate-50 transition-all">
            Cancelar
          </button>
          <button type="submit" form="create-form" disabled={saving || !nome.trim()}
            className="flex-1 py-2.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e]
                       font-bold text-sm transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30">
            {saving ? 'Criando…' : 'Criar projeto'}
          </button>
        </div>
      </div>
    </>
  )
}

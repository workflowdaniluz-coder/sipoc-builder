import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from './lib/supabase';
import {
  criarProjeto, listarProjetos, listarProcessos, salvarProcesso,
  gerarTokenAcesso, listarTokensDoSetor, revogarToken, buscarSetorPorToken, verificarSenhaToken,
  deletarProcesso, calcularProgresso, atualizarResponsavelSetor, criarSetor,
  listarNotificacoes, atualizarStatusNotificacao, contarNotificacoesUnread,
  buscarDetalhesCliente,
  getVinculos, addVinculo, removeVinculo, removeVinculosByChip,
  getGoogleAuthStatus,
  ofertarDisponibilidade,
  cancelarOferta,
  listarTokensAgendamentoPorSetor,
} from './lib/db';
import { STATUS_CONFIG } from './lib/constants';
import CreateProjectModal from './components/CreateProjectModal';
import ProjectView from './components/ProjectView';
import BpmnValidacaoView from './components/BpmnValidacaoView';
import BpmnAcessosPanel from './components/BpmnAcessosPanel'
import BpmnTab from './components/BpmnTab';
import BpmnValidacaoSetorView, { ErroTokenView } from './components/BpmnValidacaoSetorView';
import FormularioContatosView from './components/FormularioContatosView';
import AgendarView from './components/AgendarView';

const CONSULTORES = [
  'Guilherme Jesus',
  'Luana Ferranti',
  'Eumara Mayra',
  'Daniela Silveira',
  'Iélifer Marques',
];
import ClientView from './components/ClientView';

// ─────────────────────────────────────────────────────────────────
// Design tokens & helpers
// ─────────────────────────────────────────────────────────────────

const SIPOC_COLS = [
  { key: 'suppliers', label: 'Suppliers',  color: 'bg-amber-500',   ring: 'focus:border-amber-400' },
  { key: 'inputs',    label: 'Inputs',     color: 'bg-sky-500',     ring: 'focus:border-sky-400',   isInput: true },
  { key: 'outputs',   label: 'Outputs',    color: 'bg-violet-500',  ring: 'focus:border-violet-400' },
  { key: 'customers', label: 'Customers',  color: 'bg-emerald-500', ring: 'focus:border-emerald-400' },
];

const IMPACTO_COLORS = {
  Alto:  'bg-red-100 text-red-700 border-red-200',
  Médio: 'bg-amber-100 text-amber-700 border-amber-200',
  Baixo: 'bg-green-100 text-green-700 border-green-200',
};

const TIPO_COLORS = {
  Principal: 'bg-[#ecbf03]/20 text-[#16253e] border-[#ecbf03]/40',
  Apoio:     'bg-slate-100 text-slate-600 border-slate-200',
  Gestão:    'bg-purple-100 text-purple-700 border-purple-200',
};

function getInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const AVATAR_COLORS = [
  'bg-[#16253e]','bg-[#ecbf03]','bg-emerald-600','bg-violet-600',
  'bg-rose-600','bg-cyan-700','bg-indigo-700','bg-teal-700',
];
function avatarColor(str = '') {
  let hash = 0;
  for (const c of str) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─────────────────────────────────────────────────────────────────
// Helper — estado inicial da resposta do cliente
// ─────────────────────────────────────────────────────────────────

function buildEmptyClienteResposta(processo) {
  const inputs = {};
  const outputs = {};
  (processo.inputs  || []).filter(s => s.trim()).forEach(name => {
    inputs[name]  = { padronizado: '', ferramentas: [], quem_envia: [], observacoes: '' };
  });
  (processo.outputs || []).filter(s => s.trim()).forEach(name => {
    outputs[name] = { padronizado: '', ferramentas: [], quem_recebe: [], observacoes: '' };
  });
  return {
    inputs,
    outputs,
    processo: {
      periodicidade: '',
      volume_esforco: '',
      observacoes_gerais: '',
      rasci: { Responsável: [], Aprovador: [], Suporte: [], Consultado: [], Informado: [] },
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Componentes base
// ─────────────────────────────────────────────────────────────────

const TagsInput = ({ tags, onChange, placeholder, label, disabled }) => {
  const [inputValue, setInputValue] = useState('');
  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const t = inputValue.trim();
      if (t && !tags.includes(t)) { onChange([...tags, t]); setInputValue(''); }
    }
  };
  return (
    <div>
      {label && <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>}
      <div className={`min-h-[40px] px-2.5 py-2 rounded-lg border flex flex-wrap gap-1.5 transition-all
        ${disabled ? 'bg-slate-50 border-slate-200 cursor-not-allowed' : 'bg-white border-slate-200 focus-within:border-[#ecbf03] focus-within:ring-2 focus-within:ring-[#ecbf03]/20'}`}>
        {tags.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md">
            {tag}
            {!disabled && (
              <button type="button" onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
                className="text-slate-400 hover:text-white transition-colors leading-none">×</button>
            )}
          </span>
        ))}
        {!disabled && (
          <input value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? placeholder : 'Enter para adicionar…'}
            className="flex-1 bg-transparent outline-none text-sm min-w-[100px] text-slate-700 placeholder:text-slate-400" />
        )}
      </div>
    </div>
  );
};

const Select = ({ label, value, options, onChange, disabled }) => (
  <div>
    {label && <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700
                 focus:outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20
                 disabled:bg-slate-50 disabled:text-slate-400 transition-all">
      <option value="">— selecione —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const PADRONIZADO_OPTIONS = [
  { value: 'sim',     label: 'Sim',     cls: 'bg-emerald-500 border-emerald-500 text-white' },
  { value: 'parcial', label: 'Parcial', cls: 'bg-amber-500  border-amber-500  text-white' },
  { value: 'nao',     label: 'Não',     cls: 'bg-red-500    border-red-500    text-white' },
];

const PillSelect = ({ value, onChange }) => (
  <div className="flex gap-2">
    {PADRONIZADO_OPTIONS.map(opt => (
      <button key={opt.value} type="button"
        onClick={() => onChange(value === opt.value ? '' : opt.value)}
        className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
          value === opt.value
            ? opt.cls
            : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300 hover:bg-slate-50'
        }`}>
        {opt.label}
      </button>
    ))}
  </div>
);

const ExpandableCard = ({ isExpanded, onToggle, badge, title, children }) => (
  <div className={`rounded-xl border transition-all ${isExpanded ? 'border-slate-300 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
    <button type="button" onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left">
      <div className="flex items-center gap-3 min-w-0">
        {badge}
        <span className="font-semibold text-slate-700 text-sm truncate">{title}</span>
      </div>
      <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    {isExpanded && (
      <div className="px-5 pb-5 pt-4 space-y-4 border-t border-slate-100">{children}</div>
    )}
  </div>
);

const CFL = ({ children }) => (
  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{children}</label>
);

const MultiChipSelect = ({ options = [], value = [], onChange }) => {
  const valid = options.filter(o => o.trim());
  if (valid.length === 0) return <p className="text-xs text-slate-400 py-1">Nenhum cadastrado pelo consultor.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {valid.map(opt => {
        const sel = value.includes(opt);
        return (
          <button key={opt} type="button"
            onClick={() => onChange(sel ? value.filter(v => v !== opt) : [...value, opt])}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5
              ${sel ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50'}`}>
            {opt}
            {sel && <span className="opacity-50 leading-none">×</span>}
          </button>
        );
      })}
    </div>
  );
};

// Input inline para RASCI
const RasciInlineInput = ({ onAdd }) => {
  const [val, setVal] = useState('');
  return (
    <input type="text" value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const t = val.trim();
          if (t) { onAdd(t); setVal(''); }
        }
      }}
      placeholder="+ Adicionar… (Enter)"
      className="w-full px-2.5 py-1.5 rounded-lg border border-dashed border-slate-200 text-xs
                 text-slate-500 bg-white outline-none focus:border-[#ecbf03] focus:ring-1
                 focus:ring-[#ecbf03]/20 transition-all placeholder:text-slate-400" />
  );
};

// ─── SIPOC Vínculos ────────────────────────────────────────────────────────────

const VINCULO_CFG = {
  suppliers: { tipo: 'supplier_input',  role: 'de',   targetKey: 'inputs',    label: 'PROVÊ ENTRADAS',    tiposLimpar: ['supplier_input'],                    openRight: true  },
  inputs:    { tipo: 'input_output',    role: 'de',   targetKey: 'outputs',   label: 'ALIMENTA SAÍDAS',   tiposLimpar: ['supplier_input','input_output'],      openRight: true  },
  outputs:   { tipo: 'output_customer', role: 'de',   targetKey: 'customers', label: 'VAI PARA CLIENTES', tiposLimpar: ['input_output','output_customer'],     openRight: true  },
  customers: { tipo: 'output_customer', role: 'para', targetKey: 'outputs',   label: 'RECEBE SAÍDAS',     tiposLimpar: ['output_customer'],                   openRight: false },
};

function VinculoPopover({ chipValor, colKey, sipocId, sipocItems, vinculos, onAdd, onRemove, onClose }) {
  const cfg = VINCULO_CFG[colKey];
  const popoverRef = useRef(null);
  const [selectVal, setSelectVal] = useState('');
  const [adding,    setAdding]    = useState(false);

  // Fechar ao clicar fora
  useEffect(() => {
    const handle = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handle, true);
    return () => document.removeEventListener('mousedown', handle, true);
  }, [onClose]);

  const chipVinculos = vinculos.filter(v =>
    cfg.role === 'de'
      ? v.tipo === cfg.tipo && v.de   === chipValor
      : v.tipo === cfg.tipo && v.para === chipValor
  );
  const linkedTargets   = chipVinculos.map(v => cfg.role === 'de' ? v.para : v.de);
  const availableOptions = (sipocItems[cfg.targetKey] || []).filter(s => s.trim() && !linkedTargets.includes(s));

  const handleAdd = async () => {
    if (!selectVal) return;
    setAdding(true);
    try {
      const newV = cfg.role === 'de'
        ? await addVinculo(sipocId, cfg.tipo, chipValor, selectVal)
        : await addVinculo(sipocId, cfg.tipo, selectVal, chipValor);
      onAdd(newV);
      setSelectVal('');
    } catch (err) { alert('❌ ' + err.message); }
    finally { setAdding(false); }
  };

  return (
    <div
      ref={popoverRef}
      className={`absolute top-full z-50 bg-white rounded-[10px] border border-slate-200 shadow-lg p-2.5 ${cfg.openRight ? 'left-0' : 'right-0'}`}
      style={{ width: 200, marginTop: 4 }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{cfg.label}</p>

      {chipVinculos.length > 0 ? (
        <div className="flex flex-wrap gap-1 mb-2">
          {chipVinculos.map(v => {
            const lbl = cfg.role === 'de' ? v.para : v.de;
            return (
              <span key={v.id} className="inline-flex items-center gap-1 bg-[#fffbeb] border border-[#ecbf03] text-[#16253e] text-[11px] font-medium px-1.5 py-0.5 rounded-md">
                {lbl}
                <button type="button" aria-label={`Remover vínculo com ${lbl}`}
                  onClick={() => onRemove(v.id)}
                  className="text-[#16253e]/50 hover:text-[#16253e] transition-colors leading-none">×</button>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 italic mb-2">Nenhum vínculo</p>
      )}

      {availableOptions.length > 0 && (
        <div className="flex gap-1">
          <select value={selectVal} onChange={e => setSelectVal(e.target.value)}
            className="flex-1 text-[11px] px-1.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-[#ecbf03] min-w-0">
            <option value="">Vincular…</option>
            {availableOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <button type="button" onClick={handleAdd} disabled={!selectVal || adding} aria-label="Adicionar vínculo"
            className="px-2 py-1 rounded-md bg-[#ecbf03] text-[#16253e] text-xs font-bold hover:bg-[#d4ab02] transition-colors disabled:opacity-50 flex-shrink-0">
            +
          </button>
        </div>
      )}
      {availableOptions.length === 0 && chipVinculos.length === 0 && (
        <p className="text-[11px] text-slate-400 italic">Sem opções para vincular</p>
      )}
    </div>
  );
}

// Coluna do SIPOC — chip input com Enter
const SIPOCColumn = ({ col, items, globalOutputs, onUpdate, sipocId, sipocItems, vinculos, onVinculoAdd, onVinculoRemove, onChipRemove, openPopoverKey, setOpenPopoverKey }) => {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef(null);
  const chips  = (items || []).filter(s => s.trim());
  const vcfg   = VINCULO_CFG[col.key];
  const isReal = sipocId && !String(sipocId).startsWith('p');

  const commit = (text) => {
    const t = text.trim();
    if (t && !chips.includes(t)) onUpdate(col.key, [...chips, t]);
    setInputVal('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(inputVal);
    } else if (e.key === 'Backspace' && !inputVal && chips.length > 0) {
      const chip = chips[chips.length - 1];
      onChipRemove(col.key, chip);
      onUpdate(col.key, chips.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 shadow-sm">
      <div className={`${col.color} px-3 py-2.5 text-center rounded-t-xl`}>
        <span className="text-white font-bold text-xs uppercase tracking-widest">{col.label}</span>
      </div>
      <div
        className="flex-1 p-3 bg-white min-h-[220px] flex flex-col gap-2 cursor-text rounded-b-xl"
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip, idx) => {
            const popoverKey  = `${col.key}_${idx}`;
            const isOpen      = openPopoverKey === popoverKey;
            const chipVins    = vcfg && isReal
              ? (vinculos || []).filter(v =>
                  vcfg.role === 'de'
                    ? v.tipo === vcfg.tipo && v.de   === chip
                    : v.tipo === vcfg.tipo && v.para === chip
                )
              : [];
            const hasVinculos = chipVins.length > 0;

            return (
              <span key={idx} className="relative inline-flex items-center gap-1 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md">
                {chip}
                {/* Botão de vínculo */}
                {vcfg && (
                  <button
                    type="button"
                    aria-label={isReal ? `Vínculos de ${chip}` : 'Salve o processo primeiro para vincular'}
                    title={!isReal ? 'Salve o processo primeiro para vincular' : undefined}
                    disabled={!isReal}
                    onClick={e => {
                      e.stopPropagation();
                      if (!isReal) return;
                      setOpenPopoverKey(isOpen ? null : popoverKey);
                    }}
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      !isReal
                        ? 'border border-slate-600 bg-transparent cursor-not-allowed opacity-40'
                        : hasVinculos
                        ? 'border border-[#ecbf03] bg-[#ecbf03] cursor-pointer'
                        : 'border border-slate-500 bg-transparent hover:border-slate-300 cursor-pointer'
                    }`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                      stroke={hasVinculos ? '#16253e' : 'currentColor'} strokeWidth={2.5}
                      strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                    </svg>
                  </button>
                )}
                {/* Popover de vínculo */}
                {isOpen && isReal && vcfg && (
                  <VinculoPopover
                    chipValor={chip}
                    colKey={col.key}
                    sipocId={sipocId}
                    sipocItems={sipocItems}
                    vinculos={vinculos || []}
                    onAdd={onVinculoAdd}
                    onRemove={onVinculoRemove}
                    onClose={() => setOpenPopoverKey(null)}
                  />
                )}
                {/* Remover chip */}
                <button type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onChipRemove(col.key, chip);
                    onUpdate(col.key, chips.filter((_, i) => i !== idx));
                    if (isOpen) setOpenPopoverKey(null);
                  }}
                  className="text-slate-400 hover:text-white transition-colors leading-none">×</button>
              </span>
            );
          })}
        </div>
        <input
          ref={inputRef}
          type="text"
          list={col.isInput ? 'global-outputs-list' : undefined}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (inputVal.trim()) commit(inputVal); }}
          placeholder="Escreva e Enter para adicionar…"
          className="w-full px-2.5 py-1.5 rounded-lg border border-dashed border-slate-200 text-sm
                     focus:outline-none focus:border-[#ecbf03] focus:ring-1 focus:ring-[#ecbf03]/20 bg-white
                     placeholder:text-slate-300 text-slate-700"
        />
        {col.isInput && (
          <datalist id="global-outputs-list">
            {(globalOutputs || []).map((o, i) => <option key={i} value={o.output} />)}
          </datalist>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Painel de tokens
// ─────────────────────────────────────────────────────────────────

const TokenPanel = ({ setorId, setorNome }) => {
  const [tokens, setTokens] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (!setorId) return;
    setIsLoading(true);
    listarTokensDoSetor(setorId)
      .then(setTokens)
      .catch(err => alert('Erro ao carregar links: ' + err.message))
      .finally(() => setIsLoading(false));
  }, [setorId]);

  const handleGerar = async () => {
    setIsGenerating(true);
    try {
      const data = await gerarTokenAcesso(setorId);
      setTokens(prev => [data, ...prev]);
      await navigator.clipboard.writeText(data.url);
      alert(`✅ Link gerado e copiado!\n\nLink: ${data.url}\nSenha: ${data.senha}\n\nEnvie o link e a senha separadamente ao cliente.`);
    } catch (err) { alert('❌ ' + err.message); }
    finally { setIsGenerating(false); }
  };

  const handleRevogar = async (id) => {
    if (!window.confirm('Revogar este link?')) return;
    try {
      await revogarToken(id);
      setTokens(prev => prev.map(t => t.id === id ? { ...t, revogado_em: new Date().toISOString() } : t));
    } catch (err) { alert('❌ ' + err.message); }
  };

  const handleCopy = async (url, id) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!setorId) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-xs">
        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-xl">🔗</div>
        <p className="font-semibold text-slate-600 text-sm">Salve o processo primeiro</p>
        <p className="text-xs text-slate-400 mt-1">Os links são gerados por setor. Salve qualquer processo deste setor para liberar.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-[#ecbf03]/8 to-[#16253e]/5 border border-[#ecbf03]/25 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800 mb-1">Link de acesso — <span className="text-[#ecbf03]">{setorNome}</span></h3>
            <p className="text-sm text-slate-500">Envie ao cliente para preencher os processos deste setor. Válido por 90 dias, sem necessidade de login.</p>
          </div>
          <button onClick={handleGerar} disabled={isGenerating}
            className="flex-shrink-0 bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] px-5 py-2.5 rounded-xl
                       font-bold text-sm transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30 whitespace-nowrap">
            {isGenerating ? 'Gerando…' : '+ Gerar link'}
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Histórico de links</p>
        {isLoading ? (
          <div className="text-sm text-slate-400 text-center py-8">Carregando…</div>
        ) : tokens.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
            Nenhum link gerado para este setor.
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map(t => {
              const revogado = !!t.revogado_em;
              const expirado = new Date(t.expira_em) < new Date();
              const ativo = !revogado && !expirado;
              const badge = revogado ? { label: 'Revogado', cls: 'bg-red-100 text-red-600' }
                : expirado ? { label: 'Expirado', cls: 'bg-slate-100 text-slate-500' }
                : t.usado_em ? { label: 'Usado', cls: 'bg-green-100 text-green-700' }
                : { label: 'Ativo', cls: 'bg-[#ecbf03]/20 text-[#16253e]' };
              return (
                <div key={t.id} className={`flex items-center gap-3 p-4 rounded-xl border transition-all
                  ${ativo ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-slate-500 truncate">{t.url}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-[10px] text-slate-400">
                        Criado {new Date(t.criado_em).toLocaleDateString('pt-BR')} · Expira {new Date(t.expira_em).toLocaleDateString('pt-BR')}
                      </p>
                      {t.senha && (
                        <span className="text-[10px] font-black tracking-widest text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-mono">
                          {t.senha}
                        </span>
                      )}
                    </div>
                  </div>
                  {ativo && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => handleCopy(t.url, t.id)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600
                                   hover:bg-slate-50 transition-all">
                        {copiedId === t.id ? '✅ Copiado' : 'Copiar'}
                      </button>
                      <button onClick={() => handleRevogar(t.id)}
                        className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-500
                                   hover:bg-red-50 transition-all">
                        Revogar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Password gate (acesso do cliente)
// ─────────────────────────────────────────────────────────────────

const PasswordGate = ({ token, onSuccess }) => {
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!senha.trim()) return;
    setLoading(true); setError('');
    try {
      const ok = await verificarSenhaToken(token, senha.trim().toUpperCase());
      if (ok) onSuccess();
      else setError('Senha incorreta. Verifique com o consultor.');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        value={senha}
        onChange={e => setSenha(e.target.value.toUpperCase())}
        placeholder="Ex: XK4R9M"
        maxLength={6}
        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-center text-2xl font-black
                   tracking-[0.3em] uppercase outline-none focus:border-[#ecbf03] focus:ring-2
                   focus:ring-[#ecbf03]/20 transition-all placeholder:text-slate-300 placeholder:text-base
                   placeholder:font-normal placeholder:tracking-normal"
      />
      {error && <p className="text-sm text-red-500 text-center font-medium">{error}</p>}
      <button type="submit" disabled={loading || senha.length < 1}
        className="w-full bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] py-3 rounded-xl font-bold
                   text-sm transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30">
        {loading ? 'Verificando…' : 'Acessar'}
      </button>
    </form>
  );
};

// ─────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────

function App() {
  // ── Auth ──────────────────────────────────────
  const [appMode, setAppMode]       = useState('loading');
  const [session, setSession]       = useState(null);
  const [clientData, setClientData] = useState(null);
  const [senhaVerificada, setSenhaVerificada] = useState(false);
  const [validacaoData, setValidacaoData]         = useState(null);
  const [validacaoSetorData, setValidacaoSetorData] = useState(null);
  const [erroTokenMsg, setErroTokenMsg]             = useState(null);
  const [formularioContatos, setFormularioContatos] = useState(null); // { clienteId, clienteNome }

  const agendarToken = (() => {
    const m = window.location.pathname.match(/^\/agendar\/([^/]+)$/)
    return m ? m[1] : null
  })()

  useEffect(() => {
    const init = async () => {
      // Página pública de agendamento — não requer auth
      if (agendarToken) { setAppMode('agendar'); return; }

      // Consultor autenticado tem sempre prioridade
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) { setSession(s); setAppMode('consultant'); return; }

      // Só verifica token de cliente se não houver sessão de consultor
      const params = new URLSearchParams(window.location.search);
      const tokenFromUrl = params.get('t');
      if (tokenFromUrl) {
        localStorage.setItem('sipoc_client_token', tokenFromUrl);
        window.history.replaceState({}, '', window.location.pathname);
      }
      const saved = localStorage.getItem('sipoc_client_token');
      if (saved) {
        try {
          const td = await buscarSetorPorToken(saved);
          if (td) {
            setClientData({ tokenId: td.id, token: saved, setorId: td.setor_id, setorNome: td.setor_nome, clienteNome: td.cliente_nome, has_senha: td.has_senha });
            if (!td.has_senha) setSenhaVerificada(true);
            setAppMode('client'); return;
          }
        } catch { }
        localStorage.removeItem('sipoc_client_token');
      }

      // Token de validação BPMN por processo (?vt=)
      const validacaoToken = params.get('vt');
      if (validacaoToken) {
        try {
          const resp = await fetch(`/api/validar-bpmn?token=${encodeURIComponent(validacaoToken)}`);
          const data = await resp.json();
          if (data.ok && data.processo) {
            window.history.replaceState({}, '', window.location.pathname);
            setValidacaoData({ token: validacaoToken, ...data.processo });
            setAppMode('validacao_bpmn');
            return;
          }
        } catch { }
      }

      // Formulário de contatos (?cf=)
      const cfToken = params.get('cf');
      if (cfToken) {
        window.history.replaceState({}, '', window.location.pathname);
        try {
          const resp = await fetch(`/api/formulario-contatos?cf=${encodeURIComponent(cfToken)}`);
          const data = await resp.json();
          if (data.ok) {
            setFormularioContatos({ clienteId: data.clienteId, clienteNome: data.clienteNome, token: cfToken });
            setAppMode('formulario_contatos');
          } else {
            setErroTokenMsg(data.error ?? 'Link inválido.');
            setAppMode('validacao_bpmn_setor_erro');
          }
        } catch {
          setErroTokenMsg('Não foi possível carregar o formulário.');
          setAppMode('validacao_bpmn_setor_erro');
        }
        return;
      }

      // Token de validação BPMN por setor (?vb=)
      const vbToken = params.get('vb');
      if (vbToken) {
        window.history.replaceState({}, '', window.location.pathname);
        try {
          const resp = await fetch(`/api/validar-bpmn-setor?vb=${encodeURIComponent(vbToken)}`);
          const data = await resp.json();
          if (data.ok) {
            setValidacaoSetorData({ ...data });
            setAppMode('validacao_bpmn_setor');
          } else {
            setErroTokenMsg(data.error ?? 'Token inválido ou expirado.');
            setAppMode('validacao_bpmn_setor_erro');
          }
        } catch {
          setErroTokenMsg('Não foi possível validar o link. Tente novamente.');
          setAppMode('validacao_bpmn_setor_erro');
        }
        return;
      }

      setAppMode('auth');
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setAppMode(prev => {
        if (prev === 'loading') return prev;        // init() ainda não terminou — não interferir
        if (s) return 'consultant';                 // sessão ativa → sempre consultor
        return (prev === 'client' || prev === 'agendar') ? prev : 'auth';  // sem sessão → manter cliente/agendar ou ir p/ login
      });
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('sipoc_client_token');
  };

  // ── Navegação ─────────────────────────────────
  const [view, setView]           = useState('dashboard');
  const [mode, setMode]           = useState('consultant');
  const [activeTab, setActiveTab] = useState('sipoc');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncStatus, setSyncStatus]     = useState({});

  // ── Auto-save refs ────────────────────────────
  const currentRef       = useRef(null);
  const activeProjectRef = useRef(null);
  const autoSaveTimer    = useRef(null);

  // ── Dashboard ─────────────────────────────────
  const [projetos, setProjetos]             = useState([]);
  const [activeProject, setActiveProject]   = useState(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [criarProjetoModal, setCriarProjetoModal] = useState(false);

  // ── Página do projeto ─────────────────────────
  const [projetoDetalhes, setProjetoDetalhes]         = useState(null);
  const [isLoadingDetalhes, setIsLoadingDetalhes]     = useState(false);

  // ── Notificações ──────────────────────────────
  const [unreadCounts, setUnreadCounts]         = useState({}); // { [project_id]: n }
  const [notifications, setNotifications]       = useState([]); // do projeto ativo
  const [notifModalData, setNotifModalData]     = useState(null); // notif para modal Adicionar SIPOC
  const [notifSectionOpen, setNotifSectionOpen] = useState(true);

  // ── Google Calendar OAuth ──────────────────────
  const [googleAuth, setGoogleAuth]         = useState(null); // { conectado, email, conectadoEm } | null
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);

  const carregarGoogleAuth = async () => {
    if (!session?.user?.id) return;
    try {
      const status = await getGoogleAuthStatus(session.user.id);
      setGoogleAuth(status);
    } catch { setGoogleAuth({ conectado: false, email: null, conectadoEm: null }); }
  };

  useEffect(() => {
    if (appMode !== 'consultant' || !session?.user?.id) return;
    carregarGoogleAuth();
    const params = new URLSearchParams(window.location.search);
    const gc = params.get('google_connected');
    if (gc) {
      window.history.replaceState({}, '', window.location.pathname);
      if (gc === 'success') alert('Google Calendar conectado com sucesso!');
      else {
        const reason = params.get('reason') ?? 'erro desconhecido';
        alert(`Erro ao conectar Google Calendar: ${reason}`);
      }
    }
  }, [appMode, session?.user?.id]);

  const handleConectarGoogle = async () => {
    setGoogleAuthLoading(true);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const resp = await fetch('/api/auth/google/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.access_token}` },
      });
      const json = await resp.json();
      if (json.ok) window.location.href = json.authUrl;
      else alert('Erro ao iniciar conexão: ' + (json.error ?? 'tente novamente'));
    } catch { alert('Erro ao iniciar conexão com o Google.'); }
    finally { setGoogleAuthLoading(false); }
  };

  const handleDesconectarGoogle = async () => {
    if (!window.confirm('Desconectar sua conta Google Calendar?')) return;
    setGoogleAuthLoading(true);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const resp = await fetch('/api/auth/google/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.access_token}` },
      });
      const json = await resp.json();
      if (json.ok) await carregarGoogleAuth();
      else alert('Erro ao desconectar: ' + (json.error ?? 'tente novamente'));
    } catch { alert('Erro ao desconectar Google.'); }
    finally { setGoogleAuthLoading(false); }
  };

  // ── Modal de agendamento (ofertar disponibilidade) ──
  const [agendarModalOpen, setAgendarModalOpen] = useState(false);
  const [agendarForm, setAgendarForm]           = useState({
    tipo: 'sipoc', tipo_customizado: '',
    duracao_min: 60, sipoc_ids: [], slots: [''], qtd_escolha: 1,
    participantes_sugeridos: [],
  });
  const [agendarParticipanteInput, setAgendarParticipanteInput] = useState({ nome: '', email: '' });
  const [agendarLoading, setAgendarLoading]     = useState(false);
  const [agendarResultado, setAgendarResultado] = useState(null); // { token, link, expira_em, slots_count, qtd_escolha }
  const [ofertasAtivas, setOfertasAtivas]       = useState([]);
  const [ofertasCancelando, setOfertasCancelando] = useState(new Set());

  const abrirAgendarModal = () => {
    setAgendarResultado(null);
    setAgendarForm({
      tipo: 'sipoc', tipo_customizado: '',
      duracao_min: 60, sipoc_ids: [], slots: [''], qtd_escolha: 1,
      participantes_sugeridos: [],
    });
    setAgendarParticipanteInput({ nome: '', email: '' });
    setAgendarModalOpen(true);
  };

  const carregarOfertasAtivas = async (setorId) => {
    try {
      const data = await listarTokensAgendamentoPorSetor(setorId);
      setOfertasAtivas(data);
    } catch { /* silencia */ }
  };

  const handleOfertarSubmit = async () => {
    const slotsValidos = agendarForm.slots.filter(s => s.trim());
    if (slotsValidos.length < 2) return alert('Informe pelo menos 2 horários disponíveis.');
    if (agendarForm.tipo === 'outra' && !agendarForm.tipo_customizado.trim()) return alert('Informe o tipo customizado.');
    const minFuturo = Date.now() + 60 * 60 * 1000;
    for (const s of slotsValidos) {
      if (new Date(s).getTime() < minFuturo) return alert('Todos os horários devem ser pelo menos 1h no futuro.');
    }
    setAgendarLoading(true);
    try {
      const result = await ofertarDisponibilidade({
        cliente_id: activeProject.id,
        setor_id: activeSetor.id,
        tipo: agendarForm.tipo,
        tipo_customizado: agendarForm.tipo === 'outra' ? agendarForm.tipo_customizado.trim() : undefined,
        duracao_min: agendarForm.duracao_min,
        sipoc_ids: agendarForm.sipoc_ids,
        slots: slotsValidos,
        qtd_escolha: agendarForm.qtd_escolha,
        participantes_sugeridos: agendarForm.participantes_sugeridos,
      });
      setAgendarResultado(result);
      carregarOfertasAtivas(activeSetor.id);
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setAgendarLoading(false);
    }
  };

  const handleCancelarOferta = async (token) => {
    if (!confirm('Cancelar esta oferta? Os horários reservados no Google Calendar serão liberados.')) return;
    setOfertasCancelando(prev => new Set(prev).add(token));
    try {
      await cancelarOferta(token);
      setOfertasAtivas(prev => prev.filter(o => o.token !== token));
    } catch (err) {
      alert('Erro ao cancelar: ' + err.message);
    } finally {
      setOfertasCancelando(prev => { const s = new Set(prev); s.delete(token); return s; });
    }
  };

  const carregarProjetos = async () => {
    setIsLoadingProjects(true);
    try {
      const lista = await listarProjetos();
      setProjetos(lista);
      // Carrega contagem de unread para todos os projetos de uma vez
      const counts = await contarNotificacoesUnread(lista.map(p => p.id)).catch(() => ({}));
      setUnreadCounts(counts);
    } catch (err) { alert('Não foi possível carregar os projetos: ' + err.message); }
    finally { setIsLoadingProjects(false); }
  };

  const carregarNotificacoes = async (projectId) => {
    try {
      const data = await listarNotificacoes(projectId);
      setNotifications(data);
    } catch { /* silencia — notificações não bloqueiam o fluxo */ }
  };

  const handleDismissNotif = async (notifId) => {
    try {
      await atualizarStatusNotificacao(notifId, 'dismissed');
      setNotifications(prev => prev.filter(n => n.id !== notifId));
      setUnreadCounts(prev => ({
        ...prev,
        [activeProject.id]: Math.max(0, (prev[activeProject.id] ?? 0) - 1),
      }));
    } catch (err) { alert('❌ ' + err.message); }
  };

  const handleMarkRead = async (notifId) => {
    try {
      await atualizarStatusNotificacao(notifId, 'read');
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, status: 'read' } : n));
      setUnreadCounts(prev => ({
        ...prev,
        [activeProject.id]: Math.max(0, (prev[activeProject.id] ?? 0) - 1),
      }));
    } catch { /* silencia */ }
  };

  useEffect(() => { if (appMode === 'consultant') carregarProjetos(); }, [appMode]);

  // ── Builder ───────────────────────────────────
  const defaultProcess = {
    id: 'p1', supabase_id: null, setor: 'Geral', setor_id: null,
    name: 'Novo Processo',
    suppliers: [''], inputs: [''], outputs: [''], customers: [''],
    ferramentas: [], periodicidade: '', tipo: '', inputsPadronizados: '',
    outputsPadronizados: '', geridoDados: '', tecnologia: '',
    maturidade: '', esforco: '', impacto: '', observacoes: '',
    rasci: { r: [], a: [], s: [], c: [], i: [] },
  };

  const [processes, setProcesses]             = useState([]);
  const [activeProcessId, setActiveProcessId] = useState(null);
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(false);
  const [clienteExpInputs,  setClienteExpInputs]  = useState({});
  const [clienteExpOutputs, setClienteExpOutputs] = useState({});
  const [setorResponsavel, setSetorResponsavel]   = useState({}); // { setor_id: nome }
  const [setorDropdownOpen, setSetorDropdownOpen] = useState(null); // setor_id aberto
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  const [vinculos,          setVinculos]          = useState([]);
  const [openPopoverKey,    setOpenPopoverKey]    = useState(null);
  const [novoSetorModal, setNovoSetorModal]       = useState(false);
  const [novoSetorNome,  setNovoSetorNome]        = useState('');
  const [novoSetorResp,  setNovoSetorResp]        = useState('');

  const carregarDetalhes = async (projectId) => {
    setIsLoadingDetalhes(true);
    try {
      const detalhes = await buscarDetalhesCliente(projectId);
      setProjetoDetalhes(detalhes);
    } catch (err) { alert('❌ ' + err.message); }
    finally { setIsLoadingDetalhes(false); }
  };

  const [activeSetor, setActiveSetor] = useState(null);

  const selecionarProjeto = async (proj) => {
    setActiveProject(proj);
    setActiveSetor(null);
    setView('project');
    carregarDetalhes(proj.id);
  };

  const selecionarSetor = (setor) => {
    setActiveSetor(setor);
    setView('setor');
    setOfertasAtivas([]);
    carregarOfertasAtivas(setor.id);
  };

  const abrirFerramentas = async (proj, setor = null) => {
    setActiveProject(proj);
    setActiveSetor(setor);
    setView('builder');
    setSyncStatus({}); setActiveTab('sipoc'); setIsLoadingProcesses(true);
    setNotifications([]); setNotifSectionOpen(true);
    carregarNotificacoes(proj.id);
    try {
      const procs = await listarProcessos(proj.id);
      if (procs.length > 0) {
        setProcesses(procs); setActiveProcessId(procs[0].id);
        const s = {}; procs.forEach(p => { s[p.id] = 'synced'; }); setSyncStatus(s);
        // Popula responsáveis por setor
        const resp = {};
        procs.forEach(p => { if (p.setor_id && p.setor_responsavel) resp[p.setor_id] = p.setor_responsavel; });
        setSetorResponsavel(resp);
      } else { setProcesses([defaultProcess]); setActiveProcessId('p1'); }
    } catch (err) {
      alert('❌ ' + err.message);
      setProcesses([defaultProcess]); setActiveProcessId('p1');
    } finally { setIsLoadingProcesses(false); }
  };

  const handleResponsavelChange = async (setorId, nome) => {
    setSetorResponsavel(prev => ({ ...prev, [setorId]: nome }));
    try { await atualizarResponsavelSetor(setorId, nome || null); }
    catch (err) { alert('❌ ' + err.message); }
  };

  const handleCriarSetor = async () => {
    const nome = novoSetorNome.trim() || 'Geral';
    if (!activeProject?.id) return;
    try {
      const setor = await criarSetor(activeProject.id, nome, novoSetorResp || null);
      const newId = `p${Date.now()}`;
      setProcesses(prev => [...prev, {
        ...defaultProcess, id: newId, supabase_id: null,
        name: 'Novo Processo', setor: setor.nome, setor_id: setor.id,
      }]);
      if (novoSetorResp) setSetorResponsavel(prev => ({ ...prev, [setor.id]: novoSetorResp }));
      setActiveProcessId(newId);
      setNovoSetorModal(false); setNovoSetorNome(''); setNovoSetorResp('');
    } catch (err) { alert('❌ ' + err.message); }
  };

  const activeProcessIndex = processes.findIndex(p => p.id === activeProcessId);
  const current = processes[activeProcessIndex] || defaultProcess;

  // Reset client card expand state when active process changes
  useEffect(() => {
    const inputKeys  = (current.inputs  || []).filter(s => s.trim());
    const outputKeys = (current.outputs || []).filter(s => s.trim());
    setClienteExpInputs( inputKeys.length  > 0 ? { [inputKeys[0]]:  true } : {});
    setClienteExpOutputs(outputKeys.length > 0 ? { [outputKeys[0]]: true } : {});
  }, [activeProcessId]); // eslint-disable-line

  useEffect(() => {
    const sid = current.supabase_id;
    if (!sid || String(sid).startsWith('p')) { setVinculos([]); return; }
    getVinculos(sid).then(setVinculos).catch(() => {});
  }, [current.supabase_id]); // eslint-disable-line

  const processosPorSetor = useMemo(() =>
    processes.reduce((acc, p) => { (acc[p.setor] ??= []).push(p); return acc; }, {}), [processes]);

  const globalOutputs = useMemo(() =>
    processes.flatMap(p => p.outputs.filter(o => o.trim()).map(o => ({ processo: p.name, output: o }))), [processes]);

  const progresso = useMemo(() => {
    const map = {};
    processes.forEach(p => { map[p.id] = calcularProgresso(p); });
    return map;
  }, [processes]);

  // Mantém refs sempre atualizados para uso no auto-save
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { activeProjectRef.current = activeProject; }, [activeProject]);

  const scheduleAutoSave = useCallback(() => {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const proc = currentRef.current;
      const proj = activeProjectRef.current;
      if (!proj?.id) return;
      if (!proc?.supabase_id || proc.supabase_id.startsWith('p')) return;
      try {
        setSyncStatus(prev => ({ ...prev, [proc.id]: 'saving' }));
        const { supabase_id, setor_id } = await salvarProcesso(proj.id, proc);
        setProcesses(prev => prev.map(p => p.id === proc.id ? { ...p, supabase_id, setor_id, id: supabase_id } : p));
        setSyncStatus(prev => ({ ...prev, [supabase_id]: 'synced' }));
        setActiveProcessId(supabase_id);
      } catch (err) {
        console.error('Auto-save falhou:', err.message);
        setSyncStatus(prev => ({ ...prev, [proc.id]: 'draft' }));
      }
    }, 2000);
  }, []);

  const markDraft = () => {
    setSyncStatus(prev => ({ ...prev, [activeProcessId]: 'draft' }));
    scheduleAutoSave();
  };

  const guardar = async () => {
    if (!activeProject?.id) { alert('Projeto não selecionado.'); return; }
    clearTimeout(autoSaveTimer.current);
    setIsSubmitting(true);
    const isNewProcess = !current.supabase_id || current.supabase_id.startsWith('p');
    try {
      const { supabase_id, setor_id } = await salvarProcesso(activeProject.id, current);
      setProcesses(prev => prev.map(p => p.id === current.id ? { ...p, supabase_id, setor_id, id: supabase_id } : p));
      setSyncStatus(prev => ({ ...prev, [supabase_id]: 'synced' }));
      setActiveProcessId(supabase_id);

      // Sincroniza processo novo com Monday.com (fire-and-forget)
      if (isNewProcess && current.name?.trim() && activeProject.mondayBoardId) {
        fetch('/api/monday', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({
            action: 'adicionar_processo',
            boardId: activeProject.mondayBoardId,
            processoNome: current.name.trim(),
          }),
        }).catch(() => {});
      }
    } catch (err) { alert('❌ ' + err.message); }
    finally { setIsSubmitting(false); }
  };

  const excluirProcesso = async () => {
    if (!window.confirm(`Excluir o processo "${current.name}"?\n\nEsta ação não pode ser desfeita.`)) return;
    clearTimeout(autoSaveTimer.current);
    const isNew = !current.supabase_id || current.supabase_id.startsWith('p');
    if (!isNew) {
      try { await deletarProcesso(current.supabase_id); }
      catch (err) { alert('❌ ' + err.message); return; }
    }
    const remaining = processes.filter(p => p.id !== current.id);
    if (remaining.length === 0) {
      const newId = `p${Date.now()}`;
      setProcesses([{ ...defaultProcess, id: newId }]);
      setActiveProcessId(newId);
    } else {
      setProcesses(remaining);
      setActiveProcessId(remaining[0].id);
    }
    setSyncStatus(prev => { const s = { ...prev }; delete s[current.id]; return s; });
  };

  const upd   = (f, v) => { markDraft(); const u = [...processes]; u[activeProcessIndex][f] = v; setProcesses(u); };
  const updRasci = (l, tags) => { markDraft(); const u = [...processes]; u[activeProcessIndex].rasci[l] = tags; setProcesses(u); };

  const handleVinculoAdd = (newVinculo) => {
    setVinculos(prev => [...prev, newVinculo]);
  };
  const handleVinculoRemove = (vinculoId) => {
    setVinculos(prev => prev.filter(v => v.id !== vinculoId));
    removeVinculo(vinculoId).catch(() => {
      const sid = current.supabase_id;
      if (sid && !String(sid).startsWith('p')) getVinculos(sid).then(setVinculos).catch(() => {});
    });
  };
  const handleChipRemove = (colKey, chip) => {
    const cfg = VINCULO_CFG[colKey];
    const sid = current.supabase_id;
    if (!cfg || !sid || String(sid).startsWith('p')) return;
    setVinculos(prev => prev.filter(v =>
      !(cfg.tiposLimpar.includes(v.tipo) && (v.de === chip || v.para === chip))
    ));
    removeVinculosByChip(sid, cfg.tiposLimpar, chip).catch(() => {});
  };

  // ── Helpers de resposta do cliente ───────────
  const getRC = () => {
    const rc = current.respostas_cliente;
    return (rc && Object.keys(rc).length > 0) ? rc : buildEmptyClienteResposta(current);
  };
  const updCI  = (name, field, val) => { const rc = getRC(); upd('respostas_cliente', { ...rc, inputs:  { ...rc.inputs,  [name]: { ...rc.inputs[name],  [field]: val } } }); };
  const updCO  = (name, field, val) => { const rc = getRC(); upd('respostas_cliente', { ...rc, outputs: { ...rc.outputs, [name]: { ...rc.outputs[name], [field]: val } } }); };
  const updCP  = (field, val)       => { const rc = getRC(); upd('respostas_cliente', { ...rc, processo: { ...rc.processo, [field]: val } }); };
  const updCR  = (papel, tags)      => { const rc = getRC(); upd('respostas_cliente', { ...rc, processo: { ...rc.processo, rasci: { ...rc.processo.rasci, [papel]: tags } } }); };
  const togCI  = (name) => setClienteExpInputs( p => ({ ...p, [name]: !p[name] }));
  const togCO  = (name) => setClienteExpOutputs(p => ({ ...p, [name]: !p[name] }));
  const updArr   = (f, i, v) => { markDraft(); const u = [...processes]; u[activeProcessIndex][f][i] = v; setProcesses(u); };
  const rmArr    = (f, i)    => { markDraft(); const u = [...processes]; if (u[activeProcessIndex][f].length > 1) { u[activeProcessIndex][f].splice(i,1); setProcesses(u); } };
  const addArr   = (f)       => { markDraft(); const u = [...processes]; u[activeProcessIndex][f] = [...u[activeProcessIndex][f], '']; setProcesses(u); };

  // ─────────────────────────────────────────────
  // Roteamento
  // ─────────────────────────────────────────────

  if (appMode === 'agendar') return <AgendarView token={agendarToken} />;

  if (appMode === 'loading') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-[#ecbf03] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Carregando…</span>
      </div>
    </div>
  );

  if (appMode === 'client' && !senhaVerificada) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#16253e] via-[#1e3257] to-[#0d1927] flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-3 mb-8">
            <img src="/logo-mark.png" alt="P-Excellence" className="h-16 w-auto" />
            <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">SIPOC Builder</p>
          </div>
          <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/40 p-8">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Acesso protegido</h2>
            <p className="text-sm text-slate-400 mb-6">Insira a senha fornecida pelo consultor para continuar.</p>
            <PasswordGate token={clientData?.token} onSuccess={() => setSenhaVerificada(true)} />
          </div>
        </div>
      </div>
    );
  }

  if (appMode === 'client') return <ClientView clientData={clientData} />;

  if (appMode === 'validacao_bpmn') return <BpmnValidacaoView validacaoData={validacaoData} />;

  if (appMode === 'formulario_contatos' && formularioContatos)
    return <FormularioContatosView clienteId={formularioContatos.clienteId} clienteNome={formularioContatos.clienteNome} token={formularioContatos.token} />;

  if (appMode === 'validacao_bpmn_setor')
    return <BpmnValidacaoSetorView validacaoData={validacaoSetorData} />;

  if (appMode === 'validacao_bpmn_setor_erro')
    return <ErroTokenView mensagem={erroTokenMsg} />;

  if (appMode === 'auth') return (
    <div className="min-h-screen bg-gradient-to-br from-[#16253e] via-[#1e3257] to-[#0d1927] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src="/logo-mark.png" alt="P-Excellence" className="h-16 w-auto" />
          <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">SIPOC Builder</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/40 p-8">
          <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={[]}
            view="sign_in" showLinks={false}
            localization={{ variables: {
              sign_in: { email_label: 'Email', password_label: 'Senha', button_label: 'Entrar' },
            }}} />
        </div>
      </div>
    </div>
  );

  // ── Consultor autenticado ─────────────────────
  const isSynced  = syncStatus[current.id] === 'synced';
  const isSaving  = syncStatus[current.id] === 'saving';

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-[#16253e] sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-positive.png" alt="P-Excellence" className="h-8 w-auto" />
            {(view === 'project' || view === 'builder') && (
              <>
                <span className="text-slate-600 text-sm mx-1">/</span>
                <span className="text-slate-300 text-sm font-medium truncate max-w-[180px]">{activeProject?.empresa}</span>
              </>
            )}
            {view === 'builder' && (
              <>
                <span className="text-slate-600 text-sm mx-1">/</span>
                <span className="text-slate-500 text-sm">Ferramentas</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {view === 'project' && (
              <button onClick={() => setView('dashboard')}
                className="text-xs text-slate-400 hover:text-white transition-colors font-medium flex items-center gap-1">
                ← Dashboard
              </button>
            )}
            {view === 'setor' && (
              <button onClick={() => { setView('project'); carregarDetalhes(activeProject.id); }}
                className="text-xs text-slate-400 hover:text-white transition-colors font-medium flex items-center gap-1">
                ← {activeProject?.empresa}
              </button>
            )}
            {view === 'builder' && (
              <button onClick={() => {
                if (activeSetor) { setView('setor'); }
                else { setView('project'); carregarDetalhes(activeProject.id); }
              }} className="text-xs text-slate-400 hover:text-white transition-colors font-medium flex items-center gap-1">
                ← {activeSetor ? activeSetor.nome : activeProject?.empresa}
              </button>
            )}
            {view === 'builder' && (
              <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                {['consultant','client'].map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all
                      ${mode === m ? 'bg-[#ecbf03] text-[#16253e]' : 'text-slate-400 hover:text-white'}`}>
                    {m === 'consultant' ? 'Consultor' : 'Cliente'}
                  </button>
                ))}
              </div>
            )}
            <button onClick={handleLogout}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors font-medium">
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* ══ PROJECT ══ */}
      {view === 'project' && (
        <ProjectView
          projeto={projetoDetalhes}
          isLoading={isLoadingDetalhes}
          onBack={() => setView('dashboard')}
          onSelecionarSetor={selecionarSetor}
          onRefresh={() => carregarDetalhes(activeProject.id)}
        />
      )}

      {/* ══ SETOR ══ */}
      {view === 'setor' && activeSetor && (() => {
        const sipocs      = activeSetor.sipocs ?? []
        const total       = sipocs.length
        const realizados  = sipocs.filter(s => s.status === 'em_revisao' || s.status === 'aprovado').length
        const rascunhos   = sipocs.filter(s => s.status === 'rascunho').length
        const comBpmn     = sipocs.filter(s => s.bpmnStatus).length
        const bpmnDone    = sipocs.filter(s => s.bpmnStatus === 'aprovado').length
        const pct         = total > 0 ? Math.round((realizados / total) * 100) : 0

        return (
          <main className="max-w-screen-md mx-auto w-full px-6 py-10 flex-1">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-xs text-slate-400 mb-1">{activeProject?.empresa}</p>
                <h2 className="text-2xl font-black text-slate-800">{activeSetor.nome}</h2>
                {activeSetor.responsavel && (
                  <p className="text-sm text-slate-400 mt-0.5">Responsável: {activeSetor.responsavel}</p>
                )}
              </div>
              <button
                onClick={() => abrirFerramentas(activeProject, activeSetor)}
                className="bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] px-6 py-2.5 rounded-xl
                           font-bold text-sm transition-all shadow-sm shadow-[#ecbf03]/30 flex items-center gap-2">
                Abrir ferramentas
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Mapeamentos', value: total, sub: 'total' },
                { label: 'Realizados', value: realizados, sub: `${pct}% concluído`, color: realizados > 0 ? 'text-emerald-500' : null },
                { label: 'Rascunhos', value: rascunhos, sub: 'em andamento', color: rascunhos > 0 ? 'text-amber-500' : null },
                { label: 'BPMN', value: comBpmn, sub: bpmnDone > 0 ? `${bpmnDone} aprovado${bpmnDone > 1 ? 's' : ''}` : 'mapeamentos com BPMN', color: comBpmn > 0 ? 'text-blue-400' : null },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                  <p className={`text-3xl font-black ${color ?? 'text-slate-700'}`}>{value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            {/* Barra de progresso */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-500">Progresso geral</p>
                <p className="text-xs font-bold text-slate-700">{pct}%</p>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-[#ecbf03] h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Lista de processos */}
            {total > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 pt-4 pb-2 mb-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Processos</p>
                <div className="divide-y divide-slate-100">
                  {sipocs.map(s => (
                    <div key={s.id} className="py-2 flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        s.status === 'aprovado' ? 'bg-emerald-400' :
                        s.status === 'em_revisao' ? 'bg-amber-400' : 'bg-slate-300'
                      }`} />
                      <p className="flex-1 text-sm text-slate-700">{s.nomeProcesso || '—'}</p>
                      {s.bpmnStatus && (
                        <span className="text-[10px] font-semibold text-blue-400 bg-blue-50 px-2 py-0.5 rounded-full">
                          BPMN
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reuniões / Agendamentos */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 pt-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reuniões</p>
                {googleAuth?.conectado && (
                  <button
                    onClick={abrirAgendarModal}
                    className="bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-sm">
                    + Agendar reunião
                  </button>
                )}
              </div>
              {!googleAuth?.conectado ? (
                <p className="text-sm text-slate-400 text-center py-2">
                  Conecte o Google Calendar no painel principal para agendar reuniões.
                </p>
              ) : ofertasAtivas.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-2">Nenhuma oferta ativa no momento.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {ofertasAtivas.map(o => {
                    const tipoLabel = { sipoc: 'SIPOC', bpmn: 'BPMN', validacao_bpmn: 'Validação BPMN', outra: o.tipo_customizado }[o.tipo] ?? o.tipo;
                    const link = `${window.location.origin}/agendar/${o.token}`;
                    return (
                      <div key={o.id} className="py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700">{tipoLabel} · {o.duracao_min} min</p>
                          <p className="text-xs text-slate-400 mt-0.5">{o.slots.length} horários · {o.qtd_escolha} escolha{o.qtd_escolha > 1 ? 's' : ''}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <input readOnly value={link}
                              className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-600 font-mono truncate" />
                            <button onClick={() => navigator.clipboard.writeText(link)}
                              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors flex-shrink-0">
                              Copiar
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCancelarOferta(o.token)}
                          disabled={ofertasCancelando.has(o.token)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors flex-shrink-0 mt-0.5 disabled:opacity-40">
                          {ofertasCancelando.has(o.token) ? '…' : 'Cancelar'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>
        )
      })()}

      {/* ══ DASHBOARD ══ */}
      {view === 'dashboard' && (
        <main className="max-w-screen-md mx-auto w-full px-6 py-10 flex-1">

          {/* Header + lista de projetos */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {projetos.length > 0 && <span className="text-[#ecbf03] mr-1">{projetos.length}</span>}
                {projetos.length === 1 ? 'projeto' : 'projetos'}
              </h2>
              <div className="flex items-center gap-3">
                <button onClick={carregarProjetos} disabled={isLoadingProjects}
                  className="text-xs text-slate-400 hover:text-[#ecbf03] font-medium transition-colors flex items-center gap-1">
                  {isLoadingProjects ? 'Carregando…' : '↻ Atualizar'}
                </button>
                <button
                  onClick={() => setCriarProjetoModal(true)}
                  className="bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] px-5 py-2 rounded-xl font-bold
                             text-sm transition-all shadow-sm shadow-[#ecbf03]/30 flex items-center gap-1.5">
                  + Novo projeto
                </button>
              </div>
            </div>

            {projetos.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-xl">🏢</div>
                <p className="font-semibold text-slate-500 text-sm">
                  {isLoadingProjects ? 'Carregando projetos…' : 'Nenhum projeto ainda. Crie o primeiro acima.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {projetos.map(p => (
                  <button key={p.id} onClick={() => selecionarProjeto(p)}
                    className="group text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5
                               hover:border-[#ecbf03]/60 hover:shadow-md transition-all">
                    <div className="flex items-start gap-4">
                      <div className={`w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center
                                      font-black text-white text-sm ${avatarColor(p.empresa)}`}>
                        {getInitials(p.empresa)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 group-hover:text-[#ecbf03] transition-colors truncate">{p.empresa}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{p.dataCriacao}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        {(() => {
                          const sc = STATUS_CONFIG[p.statusProjeto] ?? STATUS_CONFIG.em_andamento;
                          return (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${sc.cls}`}>
                              {sc.label}
                            </span>
                          );
                        })()}
                        {(unreadCounts[p.id] ?? 0) > 0 && (
                          <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold min-w-[20px] text-center leading-tight">
                            {unreadCounts[p.id]}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {/* Mapeamentos */}
                      {p.quantidadeMapeamentos ? (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Mapeamentos</span>
                            <span className="text-[10px] font-bold text-slate-600">
                              {p.mapeamentosRealizados} / {p.quantidadeMapeamentos}
                            </span>
                          </div>
                          <div className="bg-slate-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                Math.round((p.mapeamentosRealizados / p.quantidadeMapeamentos) * 100) >= 80
                                  ? 'bg-green-500'
                                  : Math.round((p.mapeamentosRealizados / p.quantidadeMapeamentos) * 100) >= 40
                                    ? 'bg-amber-500'
                                    : 'bg-red-400'
                              }`}
                              style={{ width: `${Math.round((p.mapeamentosRealizados / p.quantidadeMapeamentos) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-slate-400 font-medium">Cons.</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${p.avgConsultor >= 80 ? 'bg-green-500' : p.avgConsultor >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                              style={{ width: `${p.avgConsultor}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500">{p.avgConsultor}%</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-slate-400">{p.totalSipocs} processo{p.totalSipocs !== 1 ? 's' : ''}</p>
                        {p.dataFimProjeto && (
                          <p className="text-[10px] text-slate-400">
                            até {new Date(p.dataFimProjeto + 'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── Google Calendar ── */}
          {(() => {
            const isProd = window.location.hostname === 'app.p-excellence.com.br';
            if (!isProd) {
              return (
                <section className="mt-8 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5 opacity-50">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📅</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-400">Google Calendar</p>
                      <p className="text-xs text-slate-500">OAuth disponível apenas em produção</p>
                    </div>
                  </div>
                </section>
              );
            }
            if (!googleAuth) {
              return (
                <section className="mt-8 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📅</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-300">Google Calendar</p>
                      <p className="text-xs text-slate-500">Carregando…</p>
                    </div>
                  </div>
                </section>
              );
            }
            if (googleAuth.conectado) {
              return (
                <section className="mt-8 rounded-2xl border border-emerald-800/40 bg-emerald-900/10 p-5">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📅</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                        <p className="text-sm font-semibold text-emerald-300">Google Calendar conectado</p>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{googleAuth.email}</p>
                    </div>
                    <button
                      onClick={handleDesconectarGoogle}
                      disabled={googleAuthLoading}
                      className="text-xs text-slate-400 hover:text-red-400 font-medium transition-colors disabled:opacity-50">
                      {googleAuthLoading ? 'Aguarde…' : 'Desconectar'}
                    </button>
                  </div>
                </section>
              );
            }
            return (
              <section className="mt-8 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📅</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-300">Google Calendar</p>
                    <p className="text-xs text-slate-500">Conecte para agendar reuniões diretamente</p>
                  </div>
                  <button
                    onClick={handleConectarGoogle}
                    disabled={googleAuthLoading}
                    className="bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] px-4 py-2 rounded-xl font-bold
                               text-xs transition-all shadow-sm shadow-[#ecbf03]/30 disabled:opacity-50">
                    {googleAuthLoading ? 'Aguarde…' : 'Conectar'}
                  </button>
                </div>
              </section>
            );
          })()}
        </main>
      )}

      {/* ══ BUILDER ══ */}
      {view === 'builder' && (
        <div className="max-w-screen-xl mx-auto px-6 py-6 flex gap-5 flex-1 w-full flex-col">

          {/* ── Seção Atenção (notificações) ── */}
          {notifications.length > 0 && (
            <div className="w-full">
              <button
                type="button"
                onClick={() => setNotifSectionOpen(o => !o)}
                className="flex items-center gap-2 mb-2 group"
              >
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="text-xs font-bold text-red-600 uppercase tracking-widest group-hover:text-red-700 transition-colors">
                  Atenção — {notifications.filter(n => n.status === 'unread').length > 0
                    ? `${notifications.filter(n => n.status === 'unread').length} nova${notifications.filter(n => n.status === 'unread').length > 1 ? 's' : ''}`
                    : `${notifications.length} pendente${notifications.length > 1 ? 's' : ''}`}
                </span>
                <svg className={`w-3.5 h-3.5 text-red-400 transition-transform duration-200 ${notifSectionOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {notifSectionOpen && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
                  {notifications.map(n => (
                    <div key={n.id}
                      onMouseEnter={() => n.status === 'unread' && handleMarkRead(n.id)}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all
                        ${n.status === 'unread'
                          ? 'bg-white border-red-200 shadow-sm'
                          : 'bg-red-50/60 border-red-100'}`}>
                      {/* Ícone tipo */}
                      <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                          {n.status === 'unread' && (
                            <span className="text-[9px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                              Novo
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {n.body?.file_name && (
                            <span className="text-xs text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                              {n.body.file_name}
                            </span>
                          )}
                          {n.body?.setor && (
                            <span className="text-xs text-slate-500">{n.body.setor}</span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            {new Date(n.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => setNotifModalData(n)}
                          className="px-3 py-1.5 rounded-lg bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e]
                                     text-xs font-bold transition-all shadow-sm shadow-[#ecbf03]/30 whitespace-nowrap">
                          + SIPOC
                        </button>
                        <button
                          onClick={() => handleDismissNotif(n.id)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold
                                     text-slate-500 hover:bg-slate-50 transition-all whitespace-nowrap">
                          Dispensar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Conteúdo do builder (sidebar + main) ── */}
          <div className="flex gap-5 flex-1 w-full">

          {/* ── Sidebar ── */}
          <aside className="w-56 flex-shrink-0 flex flex-col gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-100 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Processos</p>
                {/* Filtro por responsável */}
                {Object.values(setorResponsavel).some(v => v) && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setFiltroResponsavel('')}
                      className={`text-[9px] font-bold px-2 py-1 rounded-full transition-all
                        ${!filtroResponsavel ? 'bg-[#ecbf03] text-[#16253e]' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                      Todos
                    </button>
                    {CONSULTORES.filter(c => Object.values(setorResponsavel).includes(c)).map(c => (
                      <button key={c}
                        title={c}
                        onClick={() => setFiltroResponsavel(filtroResponsavel === c ? '' : c)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black
                                    text-white transition-all ring-2 ring-offset-1
                                    ${filtroResponsavel === c ? 'ring-[#ecbf03]' : 'ring-transparent'}
                                    ${avatarColor(c)}`}>
                        {getInitials(c)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-3 max-h-[calc(100vh-200px)]">
                {isLoadingProcesses ? (
                  <p className="text-xs text-slate-400 text-center py-6">Carregando…</p>
                ) : (
                  Object.entries(processosPorSetor)
                  .filter(([setorNome, procs]) => {
                    if (activeSetor && setorNome !== activeSetor.nome) return false;
                    if (!filtroResponsavel) return true;
                    const sid = procs[0]?.setor_id;
                    return sid && setorResponsavel[sid] === filtroResponsavel;
                  })
                  .map(([setor, procs]) => {
                    const setorId = procs[0]?.setor_id;
                    const responsavel = setorId ? (setorResponsavel[setorId] || '') : '';
                    return (
                    <div key={setor}>
                      <div className="px-2 mb-1.5">
                        {!activeSetor && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{setor}</p>}
                        {setorId && (
                          <div className="mt-1.5 relative">
                            {/* Chip quando selecionado / botão vazio */}
                            {responsavel ? (
                              <button
                                onClick={() => setSetorDropdownOpen(setorDropdownOpen === setorId ? null : setorId)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg
                                           bg-[#ecbf03]/10 border border-[#ecbf03]/50
                                           hover:bg-[#ecbf03]/20 transition-all">
                                <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center
                                                text-[10px] font-black text-white ${avatarColor(responsavel)}`}>
                                  {getInitials(responsavel)}
                                </div>
                                <span className="flex-1 text-[11px] font-semibold text-[#16253e] truncate text-left">
                                  {responsavel}
                                </span>
                                <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24"
                                  stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round"
                                    d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                                </svg>
                              </button>
                            ) : (
                              <button
                                onClick={() => setSetorDropdownOpen(setorDropdownOpen === setorId ? null : setorId)}
                                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                                           border border-dashed border-slate-200 text-[11px] text-slate-400
                                           hover:border-[#ecbf03]/60 hover:text-[#ecbf03] transition-all">
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24"
                                  stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Atribuir responsável
                              </button>
                            )}

                            {/* Dropdown */}
                            {setorDropdownOpen === setorId && (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200
                                              rounded-xl shadow-lg overflow-hidden z-30">
                                {responsavel && (
                                  <button
                                    onClick={() => { handleResponsavelChange(setorId, ''); setSetorDropdownOpen(null); }}
                                    className="w-full text-left px-3 py-2 text-[11px] text-red-500
                                               hover:bg-red-50 border-b border-slate-100 transition-all">
                                    Remover responsável
                                  </button>
                                )}
                                {CONSULTORES.map(c => (
                                  <button key={c}
                                    onClick={() => { handleResponsavelChange(setorId, c); setSetorDropdownOpen(null); }}
                                    className={`w-full text-left px-3 py-2 flex items-center gap-2
                                               hover:bg-slate-50 transition-all
                                               ${c === responsavel ? 'bg-slate-50' : ''}`}>
                                    <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center
                                                    text-[9px] font-black text-white ${avatarColor(c)}`}>
                                      {getInitials(c)}
                                    </div>
                                    <span className={`flex-1 text-[11px] truncate
                                                     ${c === responsavel ? 'font-bold text-[#16253e]' : 'text-slate-600'}`}>
                                      {c}
                                    </span>
                                    {c === responsavel && (
                                      <svg className="w-3 h-3 text-[#ecbf03] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {procs.map(p => {
                          const pg = progresso[p.id] || { consultor: 0, cliente: 0 };
                          const cons = Math.round(pg.consultor);
                          const cli  = Math.round(pg.cliente);
                          const isActive = activeProcessId === p.id;

                          const CIRC_OUT = 2 * Math.PI * 13; // ≈ 81.68
                          const CIRC_IN  = 2 * Math.PI * 7;  // ≈ 43.98
                          const dashOut  = `${cons * CIRC_OUT / 100} ${CIRC_OUT}`;
                          const dashIn   = `${cli  * CIRC_IN  / 100} ${CIRC_IN}`;
                          const offsetOut = CIRC_OUT * 0.25;
                          const offsetIn  = CIRC_IN  * 0.25;

                          const colorOut = cons === 100 ? '#1D9E75' : cons > 0 ? '#7F77DD' : 'none';
                          const colorIn  = cli  === 100 ? '#1D9E75' : cli  > 0 ? '#EF9F27' : 'none';

                          const trackColor = isActive ? 'rgba(22,37,62,0.15)' : '#e2e8f0';

                          let statusLabel, statusColor;
                          if (cons === 100 && cli === 100) {
                            statusLabel = 'Completo'; statusColor = '#1D9E75';
                          } else if (cons === 100 && cli === 0) {
                            statusLabel = 'Cliente não iniciou'; statusColor = null;
                          } else if (cons === 100) {
                            statusLabel = `Cliente: ${cli}%`; statusColor = null;
                          } else {
                            statusLabel = `Você: ${cons}%`; statusColor = null;
                          }

                          return (
                            <button key={p.id} onClick={() => setActiveProcessId(p.id)}
                              className={`w-full text-left px-2 py-2 rounded-xl transition-all flex items-center gap-2.5
                                ${isActive ? 'bg-[#ecbf03] text-[#16253e] font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>

                              {/* Anel duplo SVG */}
                              <svg width="32" height="32" viewBox="0 0 32 32" fill="none"
                                title={`Consultor: ${cons}%\nCliente: ${cli}%`}
                                className="flex-shrink-0">
                                {/* Track externo */}
                                <circle cx="16" cy="16" r="13" stroke={trackColor} strokeWidth="3" fill="none" />
                                {/* Progresso externo (consultor) */}
                                {cons > 0 && (
                                  <circle cx="16" cy="16" r="13"
                                    stroke={colorOut} strokeWidth="3" fill="none"
                                    strokeLinecap="round"
                                    strokeDasharray={dashOut}
                                    strokeDashoffset={offsetOut} />
                                )}
                                {/* Track interno */}
                                <circle cx="16" cy="16" r="7" stroke={trackColor} strokeWidth="3" fill="none" />
                                {/* Progresso interno (cliente) */}
                                {cli > 0 && (
                                  <circle cx="16" cy="16" r="7"
                                    stroke={colorIn} strokeWidth="3" fill="none"
                                    strokeLinecap="round"
                                    strokeDasharray={dashIn}
                                    strokeDashoffset={offsetIn} />
                                )}
                              </svg>

                              {/* Nome + status */}
                              <div className="flex-1 min-w-0">
                                <p className="truncate text-xs font-semibold leading-tight">{p.name || 'Novo Processo'}</p>
                                <p className="text-[11px] leading-tight mt-0.5 truncate"
                                  style={{ color: statusColor ?? (isActive ? 'rgba(22,37,62,0.6)' : '#94a3b8') }}>
                                  {statusLabel}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })
                )}
                {mode === 'consultant' && (
                  <button
                    onClick={() => setNovoSetorModal(true)}
                    className="w-full py-2 rounded-xl border-2 border-dashed border-slate-200 text-xs font-semibold
                               text-slate-400 hover:text-[#ecbf03] hover:border-[#ecbf03]/50 transition-all mt-2">
                    + Processo
                  </button>
                )}
              </div>
            </div>
          </aside>

          {/* ── Main ── */}
          <main className="flex-1 flex flex-col min-w-0">

            {/* Tabs */}
            <div className="flex gap-1.5 mb-5">
              {[
                { id: 'sipoc',    label: 'Mapeamento SIPOC' },
                { id: 'rasci',    label: 'Matriz RASCI' },
                { id: 'bpmn',     label: 'BPMN' },
                { id: 'tokens',   label: 'Acessos' },
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all
                    ${activeTab === tab.id
                      ? 'bg-white text-[#16253e] border border-[#ecbf03] shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Card principal */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">

              {/* Process header */}
              {activeTab !== 'tokens' && activeTab !== 'bpmn' && (
                <div className="px-8 pt-7 pb-5 border-b border-slate-100">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <input
                        type="text" value={current.name}
                        onChange={e => upd('name', e.target.value)}
                        disabled={mode === 'client'}
                        placeholder="Nome do processo"
                        className="w-full text-2xl font-black text-slate-900 bg-transparent outline-none
                                   border-b-2 border-transparent focus:border-[#ecbf03] transition-all
                                   disabled:border-transparent py-0.5 placeholder:text-slate-300" />
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {isSaving && (
                        <span className="text-xs font-medium text-[#ecbf03]">↻ Salvando…</span>
                      )}
                      <button onClick={guardar} disabled={isSubmitting || isSaving}
                        className="bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] px-5 py-2 rounded-xl
                                   font-semibold text-sm transition-all disabled:opacity-50
                                   shadow-sm shadow-[#ecbf03]/30">
                        {isSubmitting || isSaving ? 'Salvando…' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: SIPOC ── */}
              {activeTab === 'sipoc' && (
                <div className="p-8 flex-1 flex flex-col">

                  {/* ── Modo Consultor: metadata + colunas ── */}
                  {mode === 'consultant' && (
                    <>
                      {/* Metadata bar: Área Executora, Tipo, Impacto */}
                      <div className="grid grid-cols-3 gap-4 mb-6 p-5 bg-slate-50 rounded-2xl border border-slate-200">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Área Executora</p>
                          <input type="text" value={current.setor}
                            onChange={e => upd('setor', e.target.value)}
                            placeholder="Ex: Financeiro"
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium
                                       text-slate-700 outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tipo do Processo</p>
                          <select value={current.tipo} onChange={e => upd('tipo', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700
                                       outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all">
                            <option value="">— selecione —</option>
                            {['Principal','Apoio','Gestão'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Impacto no Negócio</p>
                          <select value={current.impacto} onChange={e => upd('impacto', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700
                                       outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all">
                            <option value="">— selecione —</option>
                            {['Baixo','Médio','Alto'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* SIPOC grid */}
                      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1.2fr 1fr 1fr' }}>
                        {SIPOC_COLS.slice(0,2).map(col => (
                          <SIPOCColumn key={col.key} col={col} items={current[col.key]}
                            globalOutputs={globalOutputs}
                            onUpdate={(field, newArr) => upd(field, newArr)}
                            sipocId={current.supabase_id}
                            sipocItems={current}
                            vinculos={vinculos}
                            onVinculoAdd={handleVinculoAdd}
                            onVinculoRemove={handleVinculoRemove}
                            onChipRemove={handleChipRemove}
                            openPopoverKey={openPopoverKey}
                            setOpenPopoverKey={setOpenPopoverKey}
                          />
                        ))}

                        {/* Process (center) */}
                        <div className="flex flex-col rounded-xl overflow-hidden border-2 border-[#ecbf03]/40 shadow-sm">
                          <div className="bg-[#16253e] px-3 py-2.5 text-center">
                            <span className="text-white font-bold text-xs uppercase tracking-widest">Process</span>
                          </div>
                          <div className="flex-1 flex flex-col items-center justify-center bg-[#16253e]/5 min-h-[220px] p-4 gap-3">
                            <p className="font-bold text-[#16253e] text-center text-sm">{current.name || 'Novo Processo'}</p>
                            {current.tipo && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TIPO_COLORS[current.tipo] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                {current.tipo}
                              </span>
                            )}
                            {current.impacto && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${IMPACTO_COLORS[current.impacto] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                Impacto {current.impacto}
                              </span>
                            )}
                            {current.setor && current.setor !== 'Geral' && (
                              <span className="text-[10px] text-slate-500 font-medium">{current.setor}</span>
                            )}
                          </div>
                        </div>

                        {SIPOC_COLS.slice(2).map(col => (
                          <SIPOCColumn key={col.key} col={col} items={current[col.key]}
                            globalOutputs={globalOutputs}
                            onUpdate={(field, newArr) => upd(field, newArr)}
                            sipocId={current.supabase_id}
                            sipocItems={current}
                            vinculos={vinculos}
                            onVinculoAdd={handleVinculoAdd}
                            onVinculoRemove={handleVinculoRemove}
                            onChipRemove={handleChipRemove}
                            openPopoverKey={openPopoverKey}
                            setOpenPopoverKey={setOpenPopoverKey}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {/* ── Modo Cliente: formulário por item ── */}
                  {mode === 'client' && (() => {
                    const rc = getRC();
                    const inputNames  = (current.inputs  || []).filter(s => s.trim());
                    const outputNames = (current.outputs || []).filter(s => s.trim());
                    return (
                      <div className="space-y-5">

                        {/* Card 1 — Entradas */}
                        <div className="rounded-2xl border border-slate-200 p-5 space-y-3">
                          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                            <span className="text-base">📥</span>
                            <div>
                              <p className="font-bold text-slate-800 text-sm leading-tight">Entradas do processo</p>
                              <p className="text-xs text-slate-400">Como cada input chega até a equipe</p>
                            </div>
                          </div>
                          {inputNames.length === 0
                            ? <p className="text-sm text-slate-400 text-center py-3 border-2 border-dashed border-slate-200 rounded-xl">Nenhuma entrada cadastrada pelo consultor ainda.</p>
                            : inputNames.map(name => (
                              <ExpandableCard key={name}
                                isExpanded={!!clienteExpInputs[name]}
                                onToggle={() => togCI(name)}
                                badge={<span className="text-[10px] font-bold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full border border-sky-200 flex-shrink-0">Input</span>}
                                title={name}>
                                <div><CFL>Padronizado?</CFL><PillSelect value={rc.inputs[name]?.padronizado||''} onChange={v=>updCI(name,'padronizado',v)} /></div>
                                <div><CFL>Ferramentas que geram este input</CFL><TagsInput tags={rc.inputs[name]?.ferramentas||[]} onChange={v=>updCI(name,'ferramentas',v)} placeholder="Ex: SAP, Excel… (Enter para adicionar)" /></div>
                                <div><CFL>Observações</CFL><textarea rows={3} value={rc.inputs[name]?.observacoes||''} onChange={e=>updCI(name,'observacoes',e.target.value)} placeholder="Algo relevante sobre esta entrada..." className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all resize-none placeholder:text-slate-400" /></div>
                              </ExpandableCard>
                            ))
                          }
                        </div>

                        {/* Card 2 — Saídas */}
                        <div className="rounded-2xl border border-slate-200 p-5 space-y-3">
                          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                            <span className="text-base">📤</span>
                            <div>
                              <p className="font-bold text-slate-800 text-sm leading-tight">Saídas do processo</p>
                              <p className="text-xs text-slate-400">O que este processo entrega e para quem</p>
                            </div>
                          </div>
                          {outputNames.length === 0
                            ? <p className="text-sm text-slate-400 text-center py-3 border-2 border-dashed border-slate-200 rounded-xl">Nenhuma saída cadastrada pelo consultor ainda.</p>
                            : outputNames.map(name => (
                              <ExpandableCard key={name}
                                isExpanded={!!clienteExpOutputs[name]}
                                onToggle={() => togCO(name)}
                                badge={<span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 flex-shrink-0">Output</span>}
                                title={name}>
                                <div><CFL>Padronizado?</CFL><PillSelect value={rc.outputs[name]?.padronizado||''} onChange={v=>updCO(name,'padronizado',v)} /></div>
                                <div><CFL>Ferramentas que consomem este output</CFL><TagsInput tags={rc.outputs[name]?.ferramentas||[]} onChange={v=>updCO(name,'ferramentas',v)} placeholder="Ex: Tableau, Power BI… (Enter para adicionar)" /></div>
                                <div><CFL>Observações</CFL><textarea rows={3} value={rc.outputs[name]?.observacoes||''} onChange={e=>updCO(name,'observacoes',e.target.value)} placeholder="Algo relevante sobre esta saída..." className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all resize-none placeholder:text-slate-400" /></div>
                              </ExpandableCard>
                            ))
                          }
                        </div>

                        {/* Card 3 — Informações gerais */}
                        <div className="rounded-2xl border border-slate-200 p-5 space-y-4">
                          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                            <span className="text-base">⚙️</span>
                            <div>
                              <p className="font-bold text-slate-800 text-sm leading-tight">Informações gerais</p>
                              <p className="text-xs text-slate-400">Frequência e volume do processo</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <CFL>Periodicidade</CFL>
                              <select value={rc.processo.periodicidade} onChange={e=>updCP('periodicidade',e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all">
                                <option value="">— selecione —</option>
                                {['Diária','Semanal','Quinzenal','Mensal','Trimestral','Semestral','Anual','Sob demanda'].map(o=><option key={o} value={o.toLowerCase()}>{o}</option>)}
                              </select>
                            </div>
                            <div>
                              <CFL>Volume e esforço</CFL>
                              <select value={rc.processo.volume_esforco} onChange={e=>updCP('volume_esforco',e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all">
                                <option value="">— selecione —</option>
                                {[['1','1 — Muito baixo'],['2','2 — Baixo'],['3','3 — Médio'],['4','4 — Alto'],['5','5 — Muito alto']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <CFL>Observações gerais</CFL>
                            <textarea rows={5} value={rc.processo.observacoes_gerais} onChange={e=>updCP('observacoes_gerais',e.target.value)}
                              placeholder="Gargalos, dores, pontos de atenção..."
                              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all resize-none placeholder:text-slate-400" />
                          </div>
                        </div>

                        {/* Card 4 — Levantamento de processo */}
                        {current.levantamento_processo && (() => {
                          const lev = current.levantamento_processo;
                          return (
                            <div className="rounded-2xl border border-slate-200 p-5 space-y-4">
                              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                                <span className="text-base">🗺️</span>
                                <div>
                                  <p className="font-bold text-slate-800 text-sm leading-tight">Como o processo funciona</p>
                                  <p className="text-xs text-slate-400">Preenchido pelo cliente</p>
                                </div>
                              </div>

                              {/* Início */}
                              {lev.inicio && (
                                <div className="space-y-2">
                                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <span className="w-4 h-4 rounded-full bg-[#16253e] text-white text-[9px] flex items-center justify-center flex-shrink-0">1</span>
                                    Início
                                  </p>
                                  {lev.inicio.gatilho && <div><CFL>O que dá início</CFL><p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2">{lev.inicio.gatilho}</p></div>}
                                  {lev.inicio.responsavel && <div><CFL>Quem inicia</CFL><p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2">{lev.inicio.responsavel}</p></div>}
                                  {lev.inicio.condicao && <div><CFL>Pré-requisito</CFL><p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2">{lev.inicio.condicao}</p></div>}
                                </div>
                              )}

                              {/* Atividades */}
                              {lev.atividades?.length > 0 && (
                                <div className="space-y-3">
                                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Atividades</p>
                                  {lev.atividades.map((atv, i) => (
                                    <div key={i} className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100">
                                      <p className="text-xs font-bold text-[#ecbf03] uppercase tracking-wide">Atividade {i + 1}</p>
                                      {atv.descricao && <p className="text-sm text-slate-700">{atv.descricao}</p>}
                                      {atv.tem_decisao === 'sim' && atv.decisao_qual && (
                                        <div className="text-xs text-slate-500 space-y-0.5">
                                          <p><span className="font-semibold">Decisão:</span> {atv.decisao_qual}</p>
                                          {atv.consequencia_sim && <p><span className="font-semibold">Se sim:</span> {atv.consequencia_sim}</p>}
                                          {atv.consequencia_nao && <p><span className="font-semibold">Se não:</span> {atv.consequencia_nao}</p>}
                                        </div>
                                      )}
                                      {atv.volta_etapa === 'sim' && <p className="text-xs text-slate-500"><span className="font-semibold">Volta para:</span> atividade anterior</p>}
                                      {atv.encerra_processo === 'sim' && <span className="inline-block text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Pode encerrar o processo</span>}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Fim */}
                              {lev.fim && (
                                <div className="space-y-2">
                                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] flex items-center justify-center flex-shrink-0">✓</span>
                                    Fim
                                  </p>
                                  {lev.fim.resultado && <div><CFL>O que marca o fim</CFL><p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2">{lev.fim.resultado}</p></div>}
                                  {lev.fim.responsavel && <div><CFL>Quem finaliza</CFL><p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2">{lev.fim.responsavel}</p></div>}
                                  {lev.fim.registros && <div><CFL>Registros gerados</CFL><p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2">{lev.fim.registros}</p></div>}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── TAB: RASCI ── */}
              {activeTab === 'rasci' && (
                <div className="p-8 flex-1 flex flex-col">
                  {mode === 'client' && (
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-5 text-sm text-slate-500">
                      <span>ℹ</span>
                      <span className="font-medium">A Matriz RASCI é preenchida pelo consultor.</span>
                    </div>
                  )}
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                    {[
                      { key: 'r', label: 'R', title: 'Responsável', sub: 'Executa',        color: 'bg-[#16253e]' },
                      { key: 'a', label: 'A', title: 'Aprovador',   sub: 'Autoridade',     color: 'bg-violet-600' },
                      { key: 's', label: 'S', title: 'Suporte',     sub: 'Apoia',          color: 'bg-emerald-600' },
                      { key: 'c', label: 'C', title: 'Consultado',  sub: 'Opina antes',    color: 'bg-amber-500' },
                      { key: 'i', label: 'I', title: 'Informado',   sub: 'Avisado depois', color: 'bg-slate-500' },
                    ].map(r => (
                      <div key={r.key} className="flex flex-col rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                        <div className={`${r.color} px-3 py-3 text-center`}>
                          <div className="text-white font-black text-lg leading-none">{r.label}</div>
                          <div className="text-white/90 text-[11px] font-bold mt-0.5">{r.title}</div>
                          <div className="text-white/60 text-[10px] mt-0.5">{r.sub}</div>
                        </div>
                        <div className="flex-1 p-3 space-y-1.5 bg-white min-h-[220px]">
                          {(current.rasci[r.key] || []).map((person, idx) => (
                            <div key={idx} className="group flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50
                                                       rounded-lg border border-slate-200 hover:border-slate-300 transition-all">
                              <span className="flex-1 text-xs text-slate-700 font-medium truncate">{person}</span>
                              {mode === 'consultant' && (
                                <button onClick={() => updRasci(r.key, current.rasci[r.key].filter((_, i) => i !== idx))}
                                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500
                                             transition-all text-sm leading-none flex-shrink-0">×</button>
                              )}
                            </div>
                          ))}
                          {mode === 'consultant' && (
                            <RasciInlineInput onAdd={val => {
                              const cur = current.rasci[r.key] || [];
                              if (!cur.includes(val)) updRasci(r.key, [...cur, val]);
                            }} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── TAB: BPMN ── */}
              {activeTab === 'bpmn' && (
                <BpmnTab
                  clienteId={activeProject?.id}
                  consultorId={session?.user?.id}
                />
              )}

              {/* ── TAB: ACESSOS ── */}
              {activeTab === 'tokens' && (
                <div className="p-8 flex-1 space-y-8 overflow-y-auto">

                  {/* ── Seção 1: Acesso SIPOC ── */}
                  <div>
                    <div className="mb-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Acesso SIPOC
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Link para preenchimento do formulário complementar do mapeamento.
                      </p>
                    </div>
                    <TokenPanel setorId={current.setor_id} setorNome={current.setor} />
                  </div>

                  <hr className="border-slate-100" />

                  {/* ── Seção 2: Validação BPMN ── */}
                  <BpmnAcessosPanel processes={processes} />

                </div>
              )}

            </div>

            {/* ── Rodapé: excluir processo ── */}
            {mode === 'consultant' && (
              <div className="px-8 py-3 border-t border-slate-100 flex justify-end">
                <button onClick={excluirProcesso}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500
                             hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Excluir processo
                </button>
              </div>
            )}

          </main>
          </div>
        </div>
      )}

      {/* ── Modal: Agendar Reunião (ofertar disponibilidade) ── */}
      {agendarModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setAgendarModalOpen(false); }}>
          <div className="bg-[#1a2f4e] border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-white text-base">Agendar reunião</h3>
                {activeSetor && <p className="text-xs text-slate-400 mt-0.5">{activeProject?.empresa} · {activeSetor.nome}</p>}
              </div>
              <button onClick={() => setAgendarModalOpen(false)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
            </div>

            {agendarResultado ? (
              <div className="space-y-4">
                <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl p-4">
                  <p className="text-emerald-300 font-semibold text-sm mb-1">Link gerado!</p>
                  <p className="text-slate-400 text-xs mb-3">
                    {agendarResultado.slots_count} horários disponíveis · cliente escolhe {agendarResultado.qtd_escolha}
                  </p>
                  <p className="text-xs text-slate-400 mb-1">Link para o cliente:</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={agendarResultado.link}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono" />
                    <button onClick={() => { navigator.clipboard.writeText(agendarResultado.link); }}
                      className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                      Copiar
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Expira em: {new Date(agendarResultado.expira_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                <button onClick={() => setAgendarModalOpen(false)}
                  className="w-full bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] py-2 rounded-xl font-bold text-sm transition-all">
                  Fechar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Tipo */}
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-2">Tipo de reunião *</label>
                  <div className="flex flex-wrap gap-2">
                    {[['sipoc','SIPOC'],['bpmn','BPMN'],['validacao_bpmn','Validação BPMN'],['outra','Outra']].map(([v,l]) => (
                      <button key={v} onClick={() => setAgendarForm(f => ({ ...f, tipo: v, tipo_customizado: '' }))}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${agendarForm.tipo === v ? 'bg-[#ecbf03] border-[#ecbf03] text-[#16253e]' : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {agendarForm.tipo === 'outra' && (
                    <input value={agendarForm.tipo_customizado}
                      onChange={e => setAgendarForm(f => ({ ...f, tipo_customizado: e.target.value }))}
                      placeholder="Descreva o tipo…"
                      className="mt-2 w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-200" />
                  )}
                </div>

                {/* Processos */}
                {(() => {
                  const sipocOptions = activeSetor?.sipocs ?? [];
                  if (!sipocOptions.length) return null;
                  return (
                    <div>
                      <label className="text-xs text-slate-400 font-medium block mb-2">Processos relacionados</label>
                      <div className="flex flex-wrap gap-2">
                        {sipocOptions.map(s => {
                          const sel = agendarForm.sipoc_ids.includes(s.id);
                          return (
                            <button key={s.id} onClick={() => setAgendarForm(f => ({
                              ...f,
                              sipoc_ids: sel ? f.sipoc_ids.filter(id => id !== s.id) : [...f.sipoc_ids, s.id],
                            }))}
                              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${sel ? 'bg-[#ecbf03] border-[#ecbf03] text-[#16253e]' : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400'}`}>
                              {s.nomeProcesso || 'Processo'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Duração */}
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-2">Duração *</label>
                  <div className="flex gap-2">
                    {[[60,'60 min'],[120,'120 min']].map(([v,l]) => (
                      <button key={v} onClick={() => setAgendarForm(f => ({ ...f, duracao_min: v }))}
                        className={`text-xs px-4 py-1.5 rounded-lg border font-medium transition-colors ${agendarForm.duracao_min === v ? 'bg-[#ecbf03] border-[#ecbf03] text-[#16253e]' : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slots */}
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-2">Horários disponíveis * (mín. 2, máx. 5)</label>
                  <div className="space-y-2">
                    {agendarForm.slots.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="datetime-local" value={s}
                          onChange={e => setAgendarForm(f => {
                            const slots = [...f.slots]; slots[i] = e.target.value; return { ...f, slots };
                          })}
                          min={new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0,16)}
                          className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-200" />
                        {agendarForm.slots.length > 1 && (
                          <button onClick={() => setAgendarForm(f => {
                            const slots = f.slots.filter((_,j) => j !== i);
                            return { ...f, slots, qtd_escolha: Math.min(f.qtd_escolha, slots.filter(x=>x).length || 1) };
                          })} className="text-red-400 hover:text-red-300 text-lg leading-none flex-shrink-0">×</button>
                        )}
                      </div>
                    ))}
                  </div>
                  {agendarForm.slots.length < 5 && (
                    <button onClick={() => setAgendarForm(f => ({ ...f, slots: [...f.slots, ''] }))}
                      className="mt-2 text-xs text-slate-400 hover:text-[#ecbf03] transition-colors">
                      + Adicionar horário
                    </button>
                  )}
                </div>

                {/* Qtd escolha */}
                {(() => {
                  const slotsValidos = agendarForm.slots.filter(s => s.trim()).length;
                  if (slotsValidos < 2) return null;
                  return (
                    <div>
                      <label className="text-xs text-slate-400 font-medium block mb-1">O cliente confirma quantos horários? *</label>
                      <select value={agendarForm.qtd_escolha}
                        onChange={e => setAgendarForm(f => ({ ...f, qtd_escolha: Number(e.target.value) }))}
                        className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-200">
                        {Array.from({ length: slotsValidos }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>{n} horário{n > 1 ? 's' : ''}</option>
                        ))}
                      </select>
                    </div>
                  );
                })()}

                {/* Participantes sugeridos */}
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">Participantes sugeridos</label>
                  <div className="flex gap-2 mb-2">
                    <input value={agendarParticipanteInput.nome} placeholder="Nome"
                      onChange={e => setAgendarParticipanteInput(p => ({ ...p, nome: e.target.value }))}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-200" />
                    <input value={agendarParticipanteInput.email} placeholder="Email"
                      onChange={e => setAgendarParticipanteInput(p => ({ ...p, email: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && agendarParticipanteInput.email) {
                          setAgendarForm(f => ({ ...f, participantes_sugeridos: [...f.participantes_sugeridos, { ...agendarParticipanteInput }] }));
                          setAgendarParticipanteInput({ nome: '', email: '' });
                        }
                      }}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-200" />
                    <button onClick={() => {
                      if (!agendarParticipanteInput.email) return;
                      setAgendarForm(f => ({ ...f, participantes_sugeridos: [...f.participantes_sugeridos, { ...agendarParticipanteInput }] }));
                      setAgendarParticipanteInput({ nome: '', email: '' });
                    }} className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 rounded-xl transition-colors">+</button>
                  </div>
                  {agendarForm.participantes_sugeridos.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                      <span className="flex-1">{p.nome} &lt;{p.email}&gt;</span>
                      <button onClick={() => setAgendarForm(f => ({ ...f, participantes_sugeridos: f.participantes_sugeridos.filter((_,j) => j !== i) }))}
                        className="text-red-400 hover:text-red-300">×</button>
                    </div>
                  ))}
                </div>

                <button onClick={handleOfertarSubmit} disabled={agendarLoading}
                  className="w-full bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50">
                  {agendarLoading ? 'Gerando link…' : 'Gerar link de agendamento'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {criarProjetoModal && (
        <CreateProjectModal
          onClose={() => setCriarProjetoModal(false)}
          onCreated={(p) => {
            setProjetos(prev => [p, ...prev]);
            setCriarProjetoModal(false);
            selecionarProjeto(p);
          }}
        />
      )}

      {/* ── Modal: Novo Setor ── */}
      {novoSetorModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) { setNovoSetorModal(false); setNovoSetorNome(''); setNovoSetorResp(''); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            <h3 className="font-bold text-slate-800 text-lg">Novo setor</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Nome do setor / área
              </label>
              <input
                autoFocus
                type="text"
                value={novoSetorNome}
                onChange={e => setNovoSetorNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCriarSetor()}
                placeholder="Ex: Financeiro, RH, Comercial…"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
                           focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
                           placeholder:text-slate-400" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Consultor responsável
              </label>
              <div className="space-y-1">
                {CONSULTORES.map(c => (
                  <button key={c} type="button"
                    onClick={() => setNovoSetorResp(novoSetorResp === c ? '' : c)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-all
                      ${novoSetorResp === c
                        ? 'bg-[#ecbf03]/10 border-[#ecbf03]/60'
                        : 'border-slate-200 hover:bg-slate-50 hover:border-slate-300'}`}>
                    <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center
                                    text-[10px] font-black text-white ${avatarColor(c)}`}>
                      {getInitials(c)}
                    </div>
                    <span className={`flex-1 text-sm text-left ${novoSetorResp === c ? 'font-bold text-[#16253e]' : 'text-slate-600'}`}>
                      {c}
                    </span>
                    {novoSetorResp === c && (
                      <svg className="w-4 h-4 text-[#ecbf03] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setNovoSetorModal(false); setNovoSetorNome(''); setNovoSetorResp(''); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold
                           text-slate-500 hover:bg-slate-50 transition-all">
                Cancelar
              </button>
              <button
                onClick={handleCriarSetor}
                className="flex-1 py-2.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e]
                           font-bold text-sm transition-all shadow-sm shadow-[#ecbf03]/30">
                Criar setor
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Modal: Adicionar ao SIPOC (a partir de notificação) ── */}
      {notifModalData && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setNotifModalData(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Adicionar ao SIPOC</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                Arquivo detectado: <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                  {notifModalData.body?.file_name}
                </span>
              </p>
            </div>

            <AddNotifToSipocForm
              notif={notifModalData}
              activeProject={activeProject}
              processes={processes}
              onConfirm={async (novoProcesso) => {
                try {
                  const { supabase_id, setor_id } = await salvarProcesso(activeProject.id, novoProcesso);
                  const saved = { ...novoProcesso, supabase_id, setor_id, id: supabase_id };
                  setProcesses(prev => [...prev, saved]);
                  setSyncStatus(prev => ({ ...prev, [supabase_id]: 'synced' }));
                  setActiveProcessId(supabase_id);
                  await handleDismissNotif(notifModalData.id);
                  setNotifModalData(null);
                  setView('builder');
                } catch (err) { alert('❌ ' + err.message); }
              }}
              onCancel={() => setNotifModalData(null)}
            />
          </div>
        </div>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Formulário inline do modal "Adicionar ao SIPOC"
// ─────────────────────────────────────────────────────────────────

function AddNotifToSipocForm({ notif, activeProject, onConfirm, onCancel }) {
  const nomeInicial = notif.body?.file_name
    ? notif.body.file_name.replace(/\.[^.]+$/, '').trim()
    : '';
  const setorInicial = notif.body?.setor ?? '';

  const [nome,  setNome]  = useState(nomeInicial);
  const [setor, setSetor] = useState(setorInicial);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setSaving(true);
    await onConfirm({
      id: `p${Date.now()}`,
      supabase_id: null,
      setor: setor.trim() || 'Geral',
      setor_id: null,
      name: nome.trim(),
      suppliers: [], inputs: [], outputs: [], customers: [],
      ferramentas: [], periodicidade: '', tipo: '',
      inputsPadronizados: '', outputsPadronizados: '', geridoDados: '',
      tecnologia: '', maturidade: '', esforco: '', impacto: '',
      observacoes: '',
      rasci: { r: [], a: [], s: [], c: [], i: [] },
    });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Nome do processo
        </label>
        <input
          autoFocus
          type="text"
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder="Nome do processo"
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
                     focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
                     placeholder:text-slate-400"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Setor / área
        </label>
        <input
          type="text"
          value={setor}
          onChange={e => setSetor(e.target.value)}
          placeholder="Ex: Financeiro"
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
                     focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
                     placeholder:text-slate-400"
        />
        <p className="text-[10px] text-slate-400 mt-1">
          Se o setor já existir no projeto será aproveitado; caso contrário será criado.
        </p>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold
                     text-slate-500 hover:bg-slate-50 transition-all">
          Cancelar
        </button>
        <button type="submit" disabled={saving || !nome.trim()}
          className="flex-1 py-2.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e]
                     font-bold text-sm transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30">
          {saving ? 'Criando…' : 'Criar processo'}
        </button>
      </div>
    </form>
  );
}

export default App;

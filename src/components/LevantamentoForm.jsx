import { useState, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';

// ── Helpers ──────────────────────────────────────────────────────────

let _atividadeCounter = 0;
function newAtividade() {
  _atividadeCounter++;
  return {
    _key: `atv_${Date.now()}_${_atividadeCounter}`,
    descricao: '',
    tem_decisao: null,        // null | 'sim' | 'nao'
    decisao_qual: '',
    consequencia_sim: '',
    consequencia_nao: '',
    volta_etapa: null,        // null | 'sim' | 'nao'
    volta_etapa_qual: '',
    encerra_processo: null,   // null | 'sim' | 'nao'
  };
}

// ── Sub-components ───────────────────────────────────────────────────

function FieldLabel({ children, required }) {
  return (
    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function Toggle({ value, onChange, options = [{ label: 'Sim', value: 'sim' }, { label: 'Não', value: 'nao' }] }) {
  return (
    <div className="flex gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value === value ? null : opt.value)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all min-h-[44px]
            ${value === opt.value
              ? 'bg-slate-800 border-slate-800 text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Reveal({ show, children }) {
  return (
    <div
      className="overflow-hidden transition-all duration-300"
      style={{ maxHeight: show ? '600px' : '0px', opacity: show ? 1 : 0 }}
    >
      <div className="pt-3">{children}</div>
    </div>
  );
}

function TextArea({ value, onChange, placeholder, rows = 3, hasError }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`w-full px-3 py-2.5 rounded-xl border text-[16px] text-slate-700 outline-none
        focus:ring-2 focus:ring-[#ecbf03]/20 transition-all resize-none placeholder:text-slate-400
        ${hasError ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-slate-200 bg-white focus:border-[#ecbf03]'}`}
    />
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-500 font-medium">{msg}</p>;
}

// ── Bloco 1: Início ──────────────────────────────────────────────────

function BlocoInicio({ inicio, onChange, errors }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-full bg-[#16253e] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
        <div>
          <p className="text-sm font-bold text-slate-800">Início do processo</p>
          <p className="text-xs text-slate-400">O que dispara este processo?</p>
        </div>
      </div>

      <div>
        <FieldLabel required>O que dá início a este processo?</FieldLabel>
        <TextArea
          value={inicio.gatilho}
          onChange={v => onChange({ ...inicio, gatilho: v })}
          placeholder="Ex: Chegada de um pedido de compra, solicitação do cliente, prazo mensal..."
          hasError={!!errors.gatilho}
        />
        <ErrorMsg msg={errors.gatilho} />
      </div>

      <div>
        <FieldLabel required>Quem inicia o processo?</FieldLabel>
        <TextArea
          value={inicio.responsavel}
          onChange={v => onChange({ ...inicio, responsavel: v })}
          placeholder="Ex: Analista do setor financeiro, gerente de compras..."
          rows={2}
          hasError={!!errors.responsavel}
        />
        <ErrorMsg msg={errors.responsavel} />
      </div>

      <div>
        <FieldLabel>Existe alguma condição ou pré-requisito para iniciar?</FieldLabel>
        <TextArea
          value={inicio.condicao}
          onChange={v => onChange({ ...inicio, condicao: v })}
          placeholder="Ex: Aprovação prévia, documento assinado, saldo disponível..."
          rows={2}
        />
      </div>
    </div>
  );
}

// ── Bloco 2: Atividade ───────────────────────────────────────────────

function AtividadeCard({ atividade, index, total, onChange, onRemove, errors, atividadesAnteriores }) {
  const cardRef = useRef(null);

  return (
    <div ref={cardRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">

      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-[#ecbf03] text-[#16253e] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">Atividade {index + 1}</p>
        </div>
        {total > 1 && (
          <button
            type="button"
            onClick={onRemove}
            className="text-slate-400 hover:text-red-500 transition-colors p-1 -mt-1 -mr-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl"
            aria-label="Remover atividade"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Descrição */}
      <div>
        <FieldLabel required>Descreva a atividade</FieldLabel>
        <TextArea
          value={atividade.descricao}
          onChange={v => onChange({ ...atividade, descricao: v })}
          placeholder="O que acontece nesta etapa do processo?"
          hasError={!!errors.descricao}
        />
        <ErrorMsg msg={errors.descricao} />
      </div>

      {/* Decisão */}
      <div>
        <FieldLabel required>Esta atividade envolve uma decisão?</FieldLabel>
        <Toggle
          value={atividade.tem_decisao}
          onChange={v => onChange({ ...atividade, tem_decisao: v, decisao_qual: v === 'nao' ? '' : atividade.decisao_qual, consequencia_sim: v === 'nao' ? '' : atividade.consequencia_sim, consequencia_nao: v === 'nao' ? '' : atividade.consequencia_nao })}
        />
        <ErrorMsg msg={errors.tem_decisao} />
      </div>

      <Reveal show={atividade.tem_decisao === 'sim'}>
        <div className="space-y-3">
          <div>
            <FieldLabel required>Qual é a decisão?</FieldLabel>
            <TextArea
              value={atividade.decisao_qual}
              onChange={v => onChange({ ...atividade, decisao_qual: v })}
              placeholder="Ex: O pedido está dentro do limite aprovado?"
              rows={2}
              hasError={!!errors.decisao_qual}
            />
            <ErrorMsg msg={errors.decisao_qual} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Se SIM, o que acontece?</FieldLabel>
              <TextArea
                value={atividade.consequencia_sim}
                onChange={v => onChange({ ...atividade, consequencia_sim: v })}
                placeholder="Próximo passo quando a resposta é sim..."
                rows={2}
              />
            </div>
            <div>
              <FieldLabel>Se NÃO, o que acontece?</FieldLabel>
              <TextArea
                value={atividade.consequencia_nao}
                onChange={v => onChange({ ...atividade, consequencia_nao: v })}
                placeholder="Próximo passo quando a resposta é não..."
                rows={2}
              />
            </div>
          </div>
        </div>
      </Reveal>

      {/* Volta etapa */}
      <div>
        <FieldLabel required>Esta atividade pode voltar para uma etapa anterior?</FieldLabel>
        <Toggle
          value={atividade.volta_etapa}
          onChange={v => onChange({ ...atividade, volta_etapa: v, volta_etapa_qual: v === 'nao' ? '' : atividade.volta_etapa_qual })}
        />
        <ErrorMsg msg={errors.volta_etapa} />
      </div>

      <Reveal show={atividade.volta_etapa === 'sim'}>
        <div>
          <FieldLabel required>Para qual atividade volta?</FieldLabel>
          {atividadesAnteriores.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Nenhuma atividade anterior disponível.</p>
          ) : (
            <select
              value={atividade.volta_etapa_qual}
              onChange={e => onChange({ ...atividade, volta_etapa_qual: e.target.value })}
              className={`w-full px-3 py-2.5 rounded-xl border text-[16px] text-slate-700 outline-none
                focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
                ${errors.volta_etapa_qual ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white focus:border-[#ecbf03]'}`}
            >
              <option value="">— selecione —</option>
              {atividadesAnteriores.map((atv, i) => (
                <option key={atv._key} value={atv._key}>
                  Atividade {i + 1}{atv.descricao ? `: ${atv.descricao.slice(0, 50)}${atv.descricao.length > 50 ? '…' : ''}` : ''}
                </option>
              ))}
            </select>
          )}
          <ErrorMsg msg={errors.volta_etapa_qual} />
        </div>
      </Reveal>

      {/* Encerra processo */}
      <div>
        <FieldLabel required>Esta atividade pode encerrar o processo?</FieldLabel>
        <Toggle
          value={atividade.encerra_processo}
          onChange={v => onChange({ ...atividade, encerra_processo: v })}
        />
        <ErrorMsg msg={errors.encerra_processo} />
      </div>

    </div>
  );
}

// ── Bloco 3: Fim ─────────────────────────────────────────────────────

function BlocoFim({ fim, onChange, errors }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">✓</div>
        <div>
          <p className="text-sm font-bold text-slate-800">Fim do processo</p>
          <p className="text-xs text-slate-400">O que marca o encerramento?</p>
        </div>
      </div>

      <div>
        <FieldLabel required>O que marca o fim do processo?</FieldLabel>
        <TextArea
          value={fim.resultado}
          onChange={v => onChange({ ...fim, resultado: v })}
          placeholder="Ex: Pedido aprovado e enviado ao fornecedor, relatório publicado, cliente notificado..."
          hasError={!!errors.resultado}
        />
        <ErrorMsg msg={errors.resultado} />
      </div>

      <div>
        <FieldLabel required>Quem finaliza / quem recebe o resultado?</FieldLabel>
        <TextArea
          value={fim.responsavel}
          onChange={v => onChange({ ...fim, responsavel: v })}
          placeholder="Ex: Gerente de compras, cliente externo, sistema ERP..."
          rows={2}
          hasError={!!errors.responsavel}
        />
        <ErrorMsg msg={errors.responsavel} />
      </div>

      <div>
        <FieldLabel>Há algum registro, documento ou notificação gerado ao final?</FieldLabel>
        <TextArea
          value={fim.registros}
          onChange={v => onChange({ ...fim, registros: v })}
          placeholder="Ex: E-mail de confirmação, nota fiscal emitida, atualização no sistema..."
          rows={2}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

const LevantamentoForm = forwardRef(function LevantamentoForm({ processo }, ref) {
  const [inicio, setInicio] = useState({ gatilho: '', responsavel: '', condicao: '' });
  const [atividades, setAtividades] = useState([newAtividade()]);
  const [fim, setFim] = useState({ resultado: '', responsavel: '', registros: '' });
  const [errors, setErrors] = useState({});
  const addBtnRef = useRef(null);

  const updateAtividade = useCallback((index, updated) => {
    setAtividades(prev => prev.map((a, i) => i === index ? updated : a));
  }, []);

  const addAtividade = useCallback(() => {
    const nova = newAtividade();
    setAtividades(prev => [...prev, nova]);
    setTimeout(() => {
      const cards = document.querySelectorAll('[data-atividade-card]');
      const last = cards[cards.length - 1];
      if (last) last.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, []);

  const removeAtividade = useCallback((index) => {
    setAtividades(prev => prev.filter((_, i) => i !== index));
  }, []);

  useImperativeHandle(ref, () => ({
    validate() {
      const errs = {};

      // Início
      if (!inicio.gatilho.trim())     errs['inicio.gatilho']     = 'Campo obrigatório';
      if (!inicio.responsavel.trim()) errs['inicio.responsavel'] = 'Campo obrigatório';

      // Atividades
      atividades.forEach((atv, i) => {
        if (!atv.descricao.trim())      errs[`atv_${i}.descricao`]        = 'Descreva a atividade';
        if (!atv.tem_decisao)           errs[`atv_${i}.tem_decisao`]      = 'Selecione uma opção';
        if (atv.tem_decisao === 'sim' && !atv.decisao_qual.trim())
                                        errs[`atv_${i}.decisao_qual`]     = 'Descreva a decisão';
        if (!atv.volta_etapa)           errs[`atv_${i}.volta_etapa`]      = 'Selecione uma opção';
        if (atv.volta_etapa === 'sim' && !atv.volta_etapa_qual)
                                        errs[`atv_${i}.volta_etapa_qual`] = 'Selecione uma atividade';
        if (!atv.encerra_processo)      errs[`atv_${i}.encerra_processo`] = 'Selecione uma opção';
      });

      // Fim
      if (!fim.resultado.trim())    errs['fim.resultado']    = 'Campo obrigatório';
      if (!fim.responsavel.trim())  errs['fim.responsavel']  = 'Campo obrigatório';

      setErrors(errs);

      if (Object.keys(errs).length > 0) {
        // Scroll para primeiro erro
        setTimeout(() => {
          const el = document.querySelector('[data-lev-error]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
        return false;
      }
      return true;
    },

    getValue() {
      return {
        inicio: { ...inicio },
        atividades: atividades.map(a => ({ ...a })),
        fim: { ...fim },
      };
    },
  }));

  const atividadeErrors = (index) => ({
    descricao:        errors[`atv_${index}.descricao`],
    tem_decisao:      errors[`atv_${index}.tem_decisao`],
    decisao_qual:     errors[`atv_${index}.decisao_qual`],
    volta_etapa:      errors[`atv_${index}.volta_etapa`],
    volta_etapa_qual: errors[`atv_${index}.volta_etapa_qual`],
    encerra_processo: errors[`atv_${index}.encerra_processo`],
  });

  const processoNome = processo?.nome_processo || 'este processo';

  return (
    <div className="space-y-4">

      {/* Section header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#16253e] flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-[#ecbf03]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Como <em className="not-italic text-[#16253e]">{processoNome}</em> funciona?</h3>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Descreva o fluxo do processo passo a passo — início, atividades e fim.
            </p>
          </div>
        </div>
      </div>

      {/* Bloco 1 */}
      <BlocoInicio
        inicio={inicio}
        onChange={setInicio}
        errors={{
          gatilho:     errors['inicio.gatilho'],
          responsavel: errors['inicio.responsavel'],
        }}
      />

      {/* Bloco 2: atividades */}
      <div className="space-y-3">
        {/* Progress indicator */}
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
            Atividades
          </p>
          <span className="text-xs text-slate-400 block sm:hidden">
            {atividades.length} atividade{atividades.length !== 1 ? 's' : ''}
          </span>
          {/* Desktop dots */}
          <div className="hidden sm:flex items-center gap-1.5">
            {atividades.map((_, i) => (
              <div key={i} className="w-5 h-5 rounded-full bg-[#ecbf03] text-[#16253e] text-[10px] font-bold flex items-center justify-center">{i + 1}</div>
            ))}
          </div>
        </div>

        {atividades.map((atv, index) => (
          <div key={atv._key} data-atividade-card>
            <AtividadeCard
              atividade={atv}
              index={index}
              total={atividades.length}
              onChange={(updated) => updateAtividade(index, updated)}
              onRemove={() => removeAtividade(index)}
              errors={atividadeErrors(index)}
              atividadesAnteriores={atividades.slice(0, index)}
            />
          </div>
        ))}

        <button
          ref={addBtnRef}
          type="button"
          onClick={addAtividade}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 text-sm font-semibold
            hover:border-[#ecbf03] hover:text-[#16253e] hover:bg-[#ecbf03]/5 transition-all min-h-[52px]
            flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Adicionar atividade
        </button>
      </div>

      {/* Bloco 3 */}
      <BlocoFim
        fim={fim}
        onChange={setFim}
        errors={{
          resultado:    errors['fim.resultado'],
          responsavel:  errors['fim.responsavel'],
        }}
      />

    </div>
  );
});

export default LevantamentoForm;

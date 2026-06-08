import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';

/* ─── Tipos ─────────────────────────────────────────────── */

interface Colaborador {
  id: string;
  nome: string;
  cpf?: string;
  tipoContrato?: string;
  ativo?: boolean;
}

interface SaidaItem {
  id: string;
  colaboradorId: string;
  colaborador?: string;
  favorecido?: string;
  descricao?: string;
  tipo?: string;
  origem?: string;
  referencia?: string;
  valor?: number | string;
  data?: string;
  dataPagamento?: string;
  observacao?: string;
  obs?: string;
  adiantamentoId?: string;  // vínculo com o contrato
  updatedAt?: string;
  createdAt?: string;
  unitId?: string;
  formaPagamento?: string;
}

// Um "contrato" de adiantamento especial
interface ContratoAdiantamento {
  adiantamentoId: string;       // ID único do contrato
  colaboradorId: string;
  colaboradorNome: string;
  tipoContrato?: string;
  dataAbertura: string;         // data do lançamento original
  valorTotal: number;           // valor emprestado
  descricao: string;            // obs registrada ao criar
  parcelas: SaidaItem[];        // descontos vinculados
  totalAbatido: number;
  saldo: number;                // valorTotal - totalAbatido
  quitado: boolean;
  tipoAdiantamento: 'especial' | 'transporte';
  raw: SaidaItem;               // registro original do adiantamento
}

/* ─── Helpers ────────────────────────────────────────────── */

const R = (v: any) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoeda = (v: number) => `R$ ${fmt(v)}`;
const fmtDataBR = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
const hoje = () => new Date().toISOString().split('T')[0];
const inicioHistorico = (meses: number) => {
  const d = new Date(); d.setMonth(d.getMonth() - meses); d.setDate(1);
  return d.toISOString().split('T')[0];
};
const gerarAdiantamentoId = () => `adto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const badge = (bg: string, color: string, extra?: React.CSSProperties): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  padding: '3px 9px', borderRadius: '999px', fontSize: '11px',
  fontWeight: 700, backgroundColor: bg, color, ...extra,
});

/* ─── Componente ─────────────────────────────────────────── */

export const AdiantamentosSaldos: React.FC = () => {
  const navigate = useNavigate();
  const { activeUnit } = useUnit();
  const { user, email } = useAuth() as any;
  const unitId = activeUnit?.id || (user as any)?.unitId || localStorage.getItem('unit_id') || '';
  const userId = localStorage.getItem('user_id') || '';
  const responsavelEmail = email || (user as any)?.email || localStorage.getItem('user_email') || 'sistema';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
  const token = () => localStorage.getItem('auth_token') || '';

  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [saidas, setSaidas] = useState<SaidaItem[]>([]);
  const [mesesHistorico, setMesesHistorico] = useState('12');
  const [buscaColaborador, setBuscaColaborador] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'aberto' | 'quitado'>('aberto');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'especial' | 'transporte'>('todos');
  const [contratoAberto, setContratoAberto] = useState<string | null>(null); // ID do contrato expandido

  // Modal novo adiantamento
  const [modalNovoAdto, setModalNovoAdto] = useState(false);
  const [formNovoAdto, setFormNovoAdto] = useState({
    colaboradorId: '', tipo: 'especial' as 'especial' | 'transporte', valor: '', data: hoje(), formaPagamento: 'PIX' as 'PIX' | 'Dinheiro' | 'Misto', descricao: '',
  });

  // Modal editar adiantamento
  const [modalEditarAdto, setModalEditarAdto] = useState<ContratoAdiantamento | null>(null);
  const [formEditarAdto, setFormEditarAdto] = useState({ valor: '', data: '', descricao: '', formaPagamento: 'PIX' as 'PIX' | 'Dinheiro' | 'Misto', tipo: 'especial' as 'especial' | 'transporte' });

  // Modal nova parcela
  const [modalParcela, setModalParcela] = useState(false);
  const [formParcela, setFormParcela] = useState({
    colaboradorId: '', adiantamentoId: '', valor: '', data: hoje(),
    formaPagamento: 'PIX' as 'PIX' | 'Dinheiro' | 'Misto', obs: '',
  });

  /* ── Carregar dados ──────────────────────────────────── */

  const carregarDados = async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const dataInicio = inicioHistorico(parseInt(mesesHistorico, 10) || 12);
      const [rColabs, rSaidas] = await Promise.all([
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${hoje()}`, { headers: { Authorization: `Bearer ${token()}` } }),
      ]);
      if (rColabs.ok) { const d = await rColabs.json(); setColaboradores(Array.isArray(d) ? d : []); }
      if (rSaidas.ok) {
        const d = await rSaidas.json();
        const lista = (Array.isArray(d) ? d : []).filter((item: SaidaItem) => {
          const t = item.tipo || item.origem || item.referencia || '';
          return t === 'Adiantamento Especial' || t === 'Desconto Adiantamento Especial'
              || t === 'Adiantamento Transporte' || t === 'Desconto Transporte';
        });
        setSaidas(lista);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { carregarDados(); }, [unitId, mesesHistorico]);

  /* ── Processar contratos de adiantamento especial ────── */

  const { contratos } = useMemo(() => {
    const colabMap = new Map(colaboradores.map(c => [c.id, c]));

    // Tipos de adiantamento e seus descontos correspondentes
    const PARES: { adto: string; desc: string; tipo: 'especial' | 'transporte' }[] = [
      { adto: 'Adiantamento Especial',   desc: 'Desconto Adiantamento Especial', tipo: 'especial' },
      { adto: 'Adiantamento Transporte', desc: 'Desconto Transporte',            tipo: 'transporte' },
    ];

    const contratoMap = new Map<string, ContratoAdiantamento>();

    PARES.forEach(({ adto: tipoAdto, desc: tipoDesc, tipo }) => {
      const adtos    = saidas.filter(s => (s.tipo || s.origem || s.referencia || '') === tipoAdto);
      const descontos = saidas.filter(s => (s.tipo || s.origem || s.referencia || '') === tipoDesc);

      // 1. Criar contrato para cada adiantamento
      adtos.forEach(adto => {
        const aId = adto.adiantamentoId || adto.id;
        const colab = colabMap.get(adto.colaboradorId);
        const dataAdto = adto.dataPagamento || adto.data || '';
        contratoMap.set(aId, {
          adiantamentoId: aId,
          colaboradorId: adto.colaboradorId,
          colaboradorNome: colab?.nome || adto.colaborador || adto.favorecido || adto.colaboradorId,
          tipoContrato: colab?.tipoContrato,
          tipoAdiantamento: tipo,
          dataAbertura: dataAdto,
          valorTotal: R(adto.valor),
          descricao: adto.obs || adto.observacao || adto.descricao || '',
          parcelas: [],
          totalAbatido: 0,
          saldo: R(adto.valor),
          quitado: false,
          raw: adto,
        });
      });

      // 2. Vincular descontos ao contrato pelo adiantamentoId
      const semVinculo: SaidaItem[] = [];
      descontos.forEach(desc => {
        const aId = desc.adiantamentoId;
        if (aId && contratoMap.has(aId)) {
          const c = contratoMap.get(aId)!;
          c.parcelas.push(desc);
          c.totalAbatido = parseFloat((c.totalAbatido + R(desc.valor)).toFixed(2));
          c.saldo = parseFloat((c.valorTotal - c.totalAbatido).toFixed(2));
          c.quitado = c.saldo <= 0.01;
        } else {
          semVinculo.push(desc);
        }
      });

      // 3. Descontos legados (sem adiantamentoId) → contrato mais antigo em aberto do mesmo tipo
      semVinculo.forEach(desc => {
        const candidatos = [...contratoMap.values()]
          .filter(c => c.colaboradorId === desc.colaboradorId && c.tipoAdiantamento === tipo && !c.quitado)
          .sort((a, b) => a.dataAbertura.localeCompare(b.dataAbertura));
        if (candidatos.length > 0) {
          const c = candidatos[0];
          c.parcelas.push(desc);
          c.totalAbatido = parseFloat((c.totalAbatido + R(desc.valor)).toFixed(2));
          c.saldo = parseFloat((c.valorTotal - c.totalAbatido).toFixed(2));
          c.quitado = c.saldo <= 0.01;
        }
      });
    });

    // 4. Ordenar parcelas por data em cada contrato
    contratoMap.forEach(c => {
      c.parcelas.sort((a, b) => (a.dataPagamento || a.data || '').localeCompare(b.dataPagamento || b.data || ''));
    });

    const contratos = [...contratoMap.values()]
      .sort((a, b) => {
        if (a.quitado !== b.quitado) return a.quitado ? 1 : -1;
        return b.dataAbertura.localeCompare(a.dataAbertura);
      });

    return { contratos };
  }, [saidas, colaboradores]);

  /* ── Filtros ─────────────────────────────────────────── */

  const contratosFiltrados = useMemo(() => {
    const busca = buscaColaborador.trim().toLowerCase();
    return contratos.filter(c => {
      if (busca && !c.colaboradorNome.toLowerCase().includes(busca)) return false;
      if (filtroStatus === 'aberto'  && c.quitado)  return false;
      if (filtroStatus === 'quitado' && !c.quitado) return false;
      if (filtroTipo === 'especial'   && c.tipoAdiantamento !== 'especial')   return false;
      if (filtroTipo === 'transporte' && c.tipoAdiantamento !== 'transporte') return false;
      return true;
    });
  }, [contratos, buscaColaborador, filtroStatus, filtroTipo]);

  const totaisResumo = useMemo(() => ({
    totalEspecialAberto:   contratos.filter(c => !c.quitado && c.tipoAdiantamento === 'especial').reduce((s, c) => s + c.saldo, 0),
    totalTransporteAberto: contratos.filter(c => !c.quitado && c.tipoAdiantamento === 'transporte').reduce((s, c) => s + c.saldo, 0),
    qtdAbertos:    contratos.filter(c => !c.quitado).length,
    qtdQuitados:   contratos.filter(c =>  c.quitado).length,
  }), [contratos]);

  /* ── Salvar novo adiantamento ───────────────────────── */

  const salvarNovoAdiantamento = async () => {
    if (!formNovoAdto.colaboradorId || !formNovoAdto.valor || parseFloat(formNovoAdto.valor) <= 0) {
      alert('Preencha colaborador e valor.'); return;
    }
    setSalvando(true);
    const novoId = gerarAdiantamentoId();
    try {
      const tipoLabel = formNovoAdto.tipo === 'transporte' ? 'Adiantamento Transporte' : 'Adiantamento Especial';
      const payload = {
        unitId, responsavel: responsavelEmail, responsavelId: userId,
        colaboradorId: formNovoAdto.colaboradorId,
        tipo: tipoLabel, origem: tipoLabel, referencia: tipoLabel,
        descricao: formNovoAdto.descricao || tipoLabel,
        obs: formNovoAdto.descricao || '',
        valor: parseFloat(formNovoAdto.valor),
        data: formNovoAdto.data, dataPagamento: formNovoAdto.data,
        pago: true,
        formaPagamento: formNovoAdto.formaPagamento,
        adiantamentoId: novoId,
        observacao: formNovoAdto.descricao || '',
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch(`${apiUrl}/saidas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setModalNovoAdto(false);
      setFormNovoAdto({ colaboradorId: '', tipo: 'especial', valor: '', data: hoje(), formaPagamento: 'PIX', descricao: '' });
      await carregarDados();
    } catch (e: any) { alert('Erro: ' + e.message); } finally { setSalvando(false); }
  };

  /* ── Salvar parcela ──────────────────────────────────── */

  /* ── Editar adiantamento ────────────────────────────────── */

  const abrirEdicaoAdto = (contrato: ContratoAdiantamento) => {
    setFormEditarAdto({
      valor: String(contrato.valorTotal),
      data: contrato.dataAbertura,
      descricao: contrato.descricao,
      formaPagamento: (contrato.raw.formaPagamento as any) || 'PIX',
      tipo: contrato.tipoAdiantamento,
    });
    setModalEditarAdto(contrato);
  };

  const salvarEdicaoAdto = async () => {
    if (!modalEditarAdto) return;
    const novoValor = parseFloat(formEditarAdto.valor);
    if (isNaN(novoValor) || novoValor <= 0) { alert('Valor inválido.'); return; }
    setSalvando(true);
    const raw = modalEditarAdto.raw;
    const tipoLabel = formEditarAdto.tipo === 'transporte' ? 'Adiantamento Transporte' : 'Adiantamento Especial';
    try {
      const res = await fetch(`${apiUrl}/saidas/${raw.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          responsavel: responsavelEmail,
          responsavelId: userId,
          colaboradorId: raw.colaboradorId,
          tipo: tipoLabel, origem: tipoLabel, referencia: tipoLabel,
          descricao: formEditarAdto.descricao || tipoLabel,
          obs: formEditarAdto.descricao || '',
          observacao: formEditarAdto.descricao || '',
          valor: novoValor,
          data: formEditarAdto.data,
          dataPagamento: formEditarAdto.data,
          formaPagamento: formEditarAdto.formaPagamento,
          adiantamentoId: raw.adiantamentoId,
          pago: true,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setModalEditarAdto(null);
      await carregarDados();
    } catch (e: any) { alert('Erro ao salvar: ' + e.message); } finally { setSalvando(false); }
  };

  /* ── Excluir adiantamento (somente sem parcelas) ─────── */
  const excluirAdiantamento = async (contrato: ContratoAdiantamento) => {
    if (contrato.parcelas.length > 0) {
      alert('Não é possível excluir: este adiantamento já possui ' + contrato.parcelas.length + ' parcela(s) registrada(s). Quite o contrato em vez de excluir.');
      return;
    }
    if (!window.confirm(
      `Excluir adiantamento de ${fmtMoeda(contrato.valorTotal)} de ${contrato.colaboradorNome}?\n\nEsta ação será registrada nos logs de auditoria e não pode ser desfeita.`
    )) return;
    setSalvando(true);
    try {
      const res = await fetch(`${apiUrl}/saidas/${contrato.raw.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error(await res.text());
      await carregarDados();
    } catch (e: any) { alert('Erro ao excluir: ' + e.message); } finally { setSalvando(false); }
  };

    const salvarParcela = async () => {
    if (!formParcela.adiantamentoId || !formParcela.valor || parseFloat(formParcela.valor) <= 0) {
      alert('Selecione o adiantamento e informe o valor.'); return;
    }
    setSalvando(true);
    const contrato = contratos.find(c => c.adiantamentoId === formParcela.adiantamentoId);
    try {
      const payload = {
        unitId, responsavel: responsavelEmail, responsavelId: userId,
        colaboradorId: formParcela.colaboradorId || contrato?.colaboradorId,
        tipo: contrato?.tipoAdiantamento === 'transporte' ? 'Desconto Transporte' : 'Desconto Adiantamento Especial',
        origem: contrato?.tipoAdiantamento === 'transporte' ? 'Desconto Transporte' : 'Desconto Adiantamento Especial',
        referencia: contrato?.tipoAdiantamento === 'transporte' ? 'Desconto Transporte' : 'Desconto Adiantamento Especial',
        descricao: `Parcela — ${contrato?.descricao || formParcela.adiantamentoId}`,
        obs: formParcela.obs || '',
        valor: parseFloat(formParcela.valor),
        data: formParcela.data, dataPagamento: formParcela.data,
        pago: true,
        formaPagamento: formParcela.formaPagamento,
        adiantamentoId: formParcela.adiantamentoId,
        observacao: formParcela.obs || '',
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch(`${apiUrl}/saidas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setModalParcela(false);
      setFormParcela({ colaboradorId: '', adiantamentoId: '', valor: '', data: hoje(), formaPagamento: 'PIX', obs: '' });
      await carregarDados();
    } catch (e: any) { alert('Erro: ' + e.message); } finally { setSalvando(false); }
  };

  /* ── Styles ──────────────────────────────────────────── */

  const s = {
    page: { minHeight: '100vh', backgroundColor: '#f5f7fb' } as React.CSSProperties,
    wrap: { maxWidth: '1300px', margin: '0 auto', padding: '0 20px 40px' } as React.CSSProperties,
    card: { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' } as React.CSSProperties,
    label: { fontSize: '12px', fontWeight: 700 as const, color: '#475569', marginBottom: '5px', display: 'block' },
    input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' as const },
    btn: (bg: string, color = 'white') => ({ padding: '9px 14px', borderRadius: '8px', border: 'none', backgroundColor: bg, color, fontWeight: 700 as const, cursor: 'pointer', fontSize: '13px' }),
    th: { fontSize: '12px', color: '#475569', backgroundColor: '#f8fafc', padding: '9px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' as const, whiteSpace: 'nowrap' as const },
    td: { fontSize: '13px', color: '#1e293b', padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' as const },
  };

  /* ── Modal Novo Adiantamento ─────────────────────────── */

  const colabsAtivos = colaboradores.filter(c => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));

  const modalNovoAdtoJSX = !modalNovoAdto ? null : (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={() => setModalNovoAdto(false)}>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '28px', maxWidth: '500px', width: '96%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>{formNovoAdto.tipo === 'transporte' ? '🚗 Novo Adiantamento Transporte' : '💸 Novo Adiantamento Especial'}</h3>
          <button onClick={() => setModalNovoAdto(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ backgroundColor: '#ecfdf5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#065f46' }}>
          💡 Ao salvar, será criado um <strong>contrato individual</strong> com ID único. Todas as parcelas futuras serão vinculadas a este contrato.
        </div>
        {/* Tipo do adiantamento */}
        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>Tipo de adiantamento *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {([{ v: 'especial', label: '💸 Adiantamento Especial', color: '#7c3aed', bg: '#faf5ff' },
               { v: 'transporte', label: '🚗 Adiantamento Transporte', color: '#c2410c', bg: '#fff7ed' }] as const).map(opt => (
              <button key={opt.v} onClick={() => setFormNovoAdto(f => ({ ...f, tipo: opt.v }))}
                style={{ flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  border: `2px solid ${formNovoAdto.tipo === opt.v ? opt.color : '#cbd5e1'}`,
                  background: formNovoAdto.tipo === opt.v ? opt.bg : 'white',
                  color: formNovoAdto.tipo === opt.v ? opt.color : '#475569' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>Colaborador *</label>
          <select value={formNovoAdto.colaboradorId} onChange={e => setFormNovoAdto(f => ({ ...f, colaboradorId: e.target.value }))}
            style={s.input}>
            <option value="">Selecione...</option>
            {colabsAtivos.map(c => <option key={c.id} value={c.id}>{c.nome}{c.tipoContrato ? ` (${c.tipoContrato})` : ''}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={s.label}>Valor emprestado (R$) *</label>
            <input type="number" step="0.01" min="0.01" value={formNovoAdto.valor} placeholder="0,00"
              onChange={e => setFormNovoAdto(f => ({ ...f, valor: e.target.value }))} style={s.input} />
          </div>
          <div>
            <label style={s.label}>Data do empréstimo</label>
            <input type="date" value={formNovoAdto.data}
              onChange={e => setFormNovoAdto(f => ({ ...f, data: e.target.value }))} style={s.input} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>Motivo / Descrição (aparece no contrato)</label>
          <input type="text" value={formNovoAdto.descricao} placeholder="Ex: compra celular, emergência médica..."
            onChange={e => setFormNovoAdto(f => ({ ...f, descricao: e.target.value }))} style={s.input} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={s.label}>Forma de pagamento</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['PIX', 'Dinheiro', 'Misto'] as const).map(fp => (
              <button key={fp} onClick={() => setFormNovoAdto(f => ({ ...f, formaPagamento: fp }))}
                style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  border: `2px solid ${formNovoAdto.formaPagamento === fp ? '#059669' : '#cbd5e1'}`,
                  background: formNovoAdto.formaPagamento === fp ? '#ecfdf5' : 'white',
                  color: formNovoAdto.formaPagamento === fp ? '#065f46' : '#475569' }}>
                {fp === 'PIX' ? '📱 PIX' : fp === 'Dinheiro' ? '💵 Dinheiro' : '🔄 Misto'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setModalNovoAdto(false)} style={s.btn('#94a3b8')}>Cancelar</button>
          <button onClick={salvarNovoAdiantamento} disabled={salvando} style={s.btn('#059669')}>
            {salvando ? '⏳ Salvando...' : `✅ Criar ${formNovoAdto.tipo === 'transporte' ? 'Adto Transporte' : 'Adto Especial'}`}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Modal Nova Parcela ──────────────────────────────── */

  // Contratos abertos do colaborador selecionado no modal parcela
  const contratosAbertosDoColab = useMemo(() =>
    contratos.filter(c => c.colaboradorId === formParcela.colaboradorId && !c.quitado)
      .sort((a, b) => { if (a.tipoAdiantamento !== b.tipoAdiantamento) return a.tipoAdiantamento === 'transporte' ? -1 : 1; return a.dataAbertura.localeCompare(b.dataAbertura); }),
    [contratos, formParcela.colaboradorId]
  );

  const contratoSelecionado = contratos.find(c => c.adiantamentoId === formParcela.adiantamentoId) || null;

  const modalParcelaJSX = !modalParcela ? null : (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={() => setModalParcela(false)}>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '28px', maxWidth: '520px', width: '96%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>➖ Registrar Parcela / Abatimento</h3>
          <button onClick={() => setModalParcela(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Passo 1: colaborador */}
        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>1. Colaborador *</label>
          <select value={formParcela.colaboradorId}
            onChange={e => setFormParcela(f => ({ ...f, colaboradorId: e.target.value, adiantamentoId: '' }))}
            style={s.input}>
            <option value="">Selecione...</option>
            {colabsAtivos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        {/* Passo 2: qual adiantamento */}
        {formParcela.colaboradorId && (
          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>2. Adiantamento a abater *</label>
            {contratosAbertosDoColab.length === 0 ? (
              <div style={{ padding: '10px 14px', backgroundColor: '#fff7ed', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                ⚠️ Nenhum adiantamento especial em aberto para este colaborador.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {contratosAbertosDoColab.map(c => (
                  <label key={c.adiantamentoId} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                    borderRadius: 8, cursor: 'pointer', border: `2px solid ${formParcela.adiantamentoId === c.adiantamentoId ? '#7c3aed' : '#e5e7eb'}`,
                    background: formParcela.adiantamentoId === c.adiantamentoId ? '#faf5ff' : 'white' }}>
                    <input type="radio" name="adiantamentoId" value={c.adiantamentoId}
                      checked={formParcela.adiantamentoId === c.adiantamentoId}
                      onChange={() => setFormParcela(f => ({ ...f, adiantamentoId: c.adiantamentoId }))}
                      style={{ marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={badge(c.tipoAdiantamento === 'transporte' ? '#fff7ed' : '#faf5ff', c.tipoAdiantamento === 'transporte' ? '#c2410c' : '#7c3aed', { fontSize: 10, padding: '2px 7px' })}>
                        {c.tipoAdiantamento === 'transporte' ? '🚗 Transporte' : '💸 Especial'}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{c.descricao || 'Adiantamento s/ descrição'}</span>
                    </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Emprestado: <strong>{fmtMoeda(c.valorTotal)}</strong> em {fmtDataBR(c.dataAbertura)}
                        &nbsp;· Abatido: <strong style={{ color: '#059669' }}>{fmtMoeda(c.totalAbatido)}</strong>
                        &nbsp;· <strong style={{ color: '#dc2626' }}>Saldo: {fmtMoeda(c.saldo)}</strong>
                        &nbsp;· {c.parcelas.length} parcela(s)
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>ID: {c.adiantamentoId}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Passo 3: valor + data */}
        {formParcela.adiantamentoId && contratoSelecionado && (
          <>
            <div style={{ backgroundColor: '#faf5ff', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              Saldo em aberto: <strong style={{ color: '#7c3aed', fontSize: 15 }}>{fmtMoeda(contratoSelecionado.saldo)}</strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={s.label}>3. Valor da parcela (R$) *</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" step="0.01" min="0.01" value={formParcela.valor} placeholder="0,00"
                    onChange={e => setFormParcela(f => ({ ...f, valor: e.target.value }))} style={{ ...s.input, flex: 1 }} />
                  <button onClick={() => setFormParcela(f => ({ ...f, valor: contratoSelecionado.saldo.toFixed(2) }))}
                    style={{ ...s.btn('#7c3aed'), padding: '8px 10px', fontSize: 11, whiteSpace: 'nowrap' as const }} title="Preencher saldo total">
                    Total
                  </button>
                </div>
              </div>
              <div>
                <label style={s.label}>Data do abatimento</label>
                <input type="date" value={formParcela.data}
                  onChange={e => setFormParcela(f => ({ ...f, data: e.target.value }))} style={s.input} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Forma de pagamento</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['PIX', 'Dinheiro', 'Misto'] as const).map(fp => (
                  <button key={fp} onClick={() => setFormParcela(f => ({ ...f, formaPagamento: fp }))}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                      border: `2px solid ${formParcela.formaPagamento === fp ? '#7c3aed' : '#cbd5e1'}`,
                      background: formParcela.formaPagamento === fp ? '#faf5ff' : 'white',
                      color: formParcela.formaPagamento === fp ? '#6d28d9' : '#475569' }}>
                    {fp === 'PIX' ? '📱 PIX' : fp === 'Dinheiro' ? '💵 Dinheiro' : '🔄 Misto'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={s.label}>Observação (opcional)</label>
              <input type="text" value={formParcela.obs} placeholder="Ex: parcela 2/5, semana 22/05..."
                onChange={e => setFormParcela(f => ({ ...f, obs: e.target.value }))} style={s.input} />
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setModalParcela(false)} style={s.btn('#94a3b8')}>Cancelar</button>
          <button onClick={salvarParcela} disabled={salvando || !formParcela.adiantamentoId}
            style={{ ...s.btn('#7c3aed'), opacity: !formParcela.adiantamentoId ? 0.5 : 1 }}>
            {salvando ? '⏳ Salvando...' : '✅ Registrar Abatimento'}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div style={s.page}>
      <Header title="Adiantamentos e Saldos" />
      {modalNovoAdtoJSX}
      {modalParcelaJSX}

      {/* Modal editar adiantamento */}
      {modalEditarAdto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModalEditarAdto(null)}>
          <div style={{ ...s.card, maxWidth: 460, width: '95%', padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#0284c7' }}>✏️ Editar Adiantamento</h3>
              <button onClick={() => setModalEditarAdto(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16, padding: '10px 14px', backgroundColor: '#f0f9ff', borderRadius: 8, borderLeft: '4px solid #0284c7' }}>
              <strong>{modalEditarAdto.colaboradorNome}</strong><br/>
              <span style={{ fontSize: 11 }}>ID: {modalEditarAdto.adiantamentoId}</span>
            </div>

            {/* Tipo do adiantamento — editável */}
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Tipo do adiantamento</label>
              {modalEditarAdto.parcelas.length > 0 && (
                <div style={{ fontSize: 11, color: '#92400e', backgroundColor: '#fff7ed', borderRadius: 6, padding: '6px 10px', marginBottom: 8, borderLeft: '3px solid #f59e0b' }}>
                  ⚠️ Existem {modalEditarAdto.parcelas.length} parcela(s) vinculada(s). Alterar o tipo não reprocessa as parcelas já registradas.
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {([{ v: 'especial', label: '💸 Adiantamento Especial', color: '#7c3aed', bg: '#faf5ff' },
                   { v: 'transporte', label: '🚗 Adiantamento Transporte', color: '#c2410c', bg: '#fff7ed' }] as const).map(opt => (
                  <button key={opt.v} onClick={() => setFormEditarAdto(f => ({ ...f, tipo: opt.v }))}
                    style={{ flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                      border: `2px solid ${formEditarAdto.tipo === opt.v ? opt.color : '#cbd5e1'}`,
                      background: formEditarAdto.tipo === opt.v ? opt.bg : 'white',
                      color: formEditarAdto.tipo === opt.v ? opt.color : '#475569' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {modalEditarAdto.totalAbatido > 0 && (
              <div style={{ fontSize: 12, color: '#92400e', backgroundColor: '#fff7ed', borderRadius: 8, padding: '8px 14px', marginBottom: 14, borderLeft: '4px solid #f59e0b' }}>
                ⚠️ Já existem <strong>{fmtMoeda(modalEditarAdto.totalAbatido)}</strong> abatidos neste contrato.
                O novo valor deve ser maior ou igual ao total já abatido.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={s.label}>Valor do Adiantamento (R$) *</label>
                <input type="number" step="0.01" min={modalEditarAdto.totalAbatido || 0.01}
                  value={formEditarAdto.valor}
                  onChange={e => setFormEditarAdto(f => ({ ...f, valor: e.target.value }))}
                  style={{ ...s.input, width: '100%', fontSize: 15, fontWeight: 700 }}
                  autoFocus />
                {modalEditarAdto.totalAbatido > 0 && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    Mínimo: {fmtMoeda(modalEditarAdto.totalAbatido)} (já abatido)
                  </div>
                )}
              </div>
              <div>
                <label style={s.label}>Data do Adiantamento</label>
                <input type="date" value={formEditarAdto.data}
                  onChange={e => setFormEditarAdto(f => ({ ...f, data: e.target.value }))}
                  style={{ ...s.input, width: '100%' }} />
              </div>
              <div>
                <label style={s.label}>Descrição / Observação</label>
                <input type="text" placeholder="Ex: Adiantamento para despesa médica"
                  value={formEditarAdto.descricao}
                  onChange={e => setFormEditarAdto(f => ({ ...f, descricao: e.target.value }))}
                  style={{ ...s.input, width: '100%' }} />
              </div>
              <div>
                <label style={s.label}>Forma de Pagamento</label>
                <select value={formEditarAdto.formaPagamento}
                  onChange={e => setFormEditarAdto(f => ({ ...f, formaPagamento: e.target.value as any }))}
                  style={{ ...s.input, width: '100%' }}>
                  <option value="PIX">PIX</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Misto">Misto</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 22, flexWrap: 'wrap' }}>
              {/* Excluir — somente sem parcelas */}
              {modalEditarAdto.parcelas.length === 0 ? (
                <button
                  onClick={() => { setModalEditarAdto(null); excluirAdiantamento(modalEditarAdto); }}
                  disabled={salvando}
                  style={{ ...s.btn('#dc2626'), padding: '8px 16px', fontSize: 12 }}
                  title="Excluir este adiantamento (sem parcelas)">
                  🗑️ Excluir
                </button>
              ) : (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  🔒 Não excluível: {modalEditarAdto.parcelas.length} parcela(s)
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalEditarAdto(null)} style={{ ...s.btn('#94a3b8'), padding: '8px 20px' }}>Cancelar</button>
                <button onClick={salvarEdicaoAdto} disabled={salvando
                  || parseFloat(formEditarAdto.valor) < modalEditarAdto.totalAbatido}
                  style={{ ...s.btn('#0284c7'), padding: '8px 20px', fontWeight: 700 }}>
                  {salvando ? '⏳ Salvando...' : '✅ Salvar Alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={s.wrap}>

        {/* Cabeçalho */}
        <div style={{ ...s.card, padding: '18px 22px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ margin: '0 0 6px', color: '#0f172a' }}>Adiantamentos e Saldos</h2>
              <div style={{ fontSize: 13, color: '#64748b', maxWidth: 700 }}>
                Cada adiantamento especial tem um <strong>contrato individual</strong> com ID único — acompanhe o saldo, as parcelas e o histórico de cada empréstimo separadamente.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={s.btn('#059669')} onClick={() => setModalNovoAdto(true)}>➕ Novo Adiantamento</button>
              <button style={s.btn('#7c3aed')} onClick={() => { setFormParcela(f => ({ ...f, colaboradorId: '', adiantamentoId: '' })); setModalParcela(true); }}>➖ Registrar Parcela</button>
              <button style={s.btn('#0f766e')} onClick={() => navigate('/modulos/extrato')}>Ver Extrato</button>
              <button style={s.btn('#475569')} onClick={carregarDados}>🔄 Atualizar</button>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Saldo especial em aberto', value: fmtMoeda(totaisResumo.totalEspecialAberto), color: '#7c3aed', bg: '#faf5ff' },
            { label: 'Saldo transporte em aberto', value: fmtMoeda(totaisResumo.totalTransporteAberto), color: '#c2410c', bg: '#fff7ed' },
            { label: 'Contratos em aberto', value: String(totaisResumo.qtdAbertos), color: '#dc2626', bg: '#fef2f2' },
            { label: 'Contratos quitados', value: String(totaisResumo.qtdQuitados), color: '#059669', bg: '#ecfdf5' },
          ].map(k => (
            <div key={k.label} style={{ ...s.card, padding: '14px 16px', backgroundColor: k.bg }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: k.color, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ ...s.card, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={s.label}>Buscar colaborador</label>
              <input value={buscaColaborador} onChange={e => setBuscaColaborador(e.target.value)}
                placeholder="Nome..." style={s.input} />
            </div>
            <div>
              <label style={s.label}>Status</label>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} style={s.input}>
                <option value="todos">Todos</option>
                <option value="aberto">Em aberto</option>
                <option value="quitado">Quitados</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Tipo</label>
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as any)} style={s.input}>
                <option value="todos">Todos</option>
                <option value="especial">💸 Adiantamento Especial</option>
                <option value="transporte">🚗 Adiantamento Transporte</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Histórico</label>
              <select value={mesesHistorico} onChange={e => setMesesHistorico(e.target.value)} style={s.input}>
                <option value="3">3 meses</option>
                <option value="6">6 meses</option>
                <option value="12">12 meses</option>
                <option value="24">24 meses</option>
              </select>
            </div>
            <button style={s.btn('#111827')} onClick={() => { setBuscaColaborador(''); setFiltroStatus('aberto'); }}>Limpar</button>
          </div>
        </div>

        {/* Lista de contratos */}
        {loading ? (
          <div style={{ ...s.card, padding: 40, textAlign: 'center', color: '#64748b' }}>⏳ Carregando...</div>
        ) : contratosFiltrados.length === 0 ? (
          <div style={{ ...s.card, padding: 40, textAlign: 'center', color: '#64748b' }}>
            Nenhum adiantamento encontrado para os filtros selecionados.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {contratosFiltrados.map(c => {
              const aberto = contratoAberto === c.adiantamentoId;
              const progresso = c.valorTotal > 0 ? Math.min(100, (c.totalAbatido / c.valorTotal) * 100) : 0;
              return (
                <div key={c.adiantamentoId} style={{ ...s.card, overflow: 'hidden', borderLeft: `4px solid ${c.quitado ? '#10b981' : c.tipoAdiantamento === 'transporte' ? '#ef6c00' : '#7c3aed'}` }}>
                  {/* Cabeçalho do contrato */}
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                    cursor: 'pointer', backgroundColor: aberto ? (c.tipoAdiantamento === 'transporte' ? '#fff7ed' : '#faf5ff') : 'white' }}
                    onClick={() => setContratoAberto(aberto ? null : c.adiantamentoId)}>
                    {/* Tipo + Status */}
                    <span style={badge(c.tipoAdiantamento === 'transporte' ? '#fff7ed' : '#faf5ff', c.tipoAdiantamento === 'transporte' ? '#c2410c' : '#7c3aed')}>
                      {c.tipoAdiantamento === 'transporte' ? '🚗 Transporte' : '💸 Especial'}
                    </span>
                    <span style={badge(c.quitado ? '#dcfce7' : '#fef3c7', c.quitado ? '#166534' : '#92400e')}>
                      {c.quitado ? '✅ Quitado' : '🔴 Em aberto'}
                    </span>
                    {/* Nome e descrição */}
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.colaboradorNome}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {c.descricao || '—'} · aberto em {fmtDataBR(c.dataAbertura)}
                        {c.tipoContrato && <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>({c.tipoContrato})</span>}
                      </div>
                    </div>
                    {/* Números */}
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Emprestado</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtMoeda(c.valorTotal)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Abatido</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#059669' }}>{fmtMoeda(c.totalAbatido)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Saldo</div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: c.quitado ? '#059669' : '#dc2626' }}>
                          {fmtMoeda(Math.max(0, c.saldo))}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{c.parcelas.length} parcela(s)</div>
                        {/* Barra de progresso */}
                        <div style={{ width: 80, height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, marginTop: 4 }}>
                          <div style={{ width: `${progresso}%`, height: '100%', backgroundColor: c.quitado ? '#10b981' : '#7c3aed', borderRadius: 4, transition: 'width .3s' }} />
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b', textAlign: 'right', marginTop: 2 }}>{progresso.toFixed(0)}%</div>
                      </div>
                    </div>
                    {/* Botões ação */}
                    <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                      {!c.quitado && (
                        <button
                          onClick={() => {
                            setFormParcela(f => ({ ...f, colaboradorId: c.colaboradorId, adiantamentoId: c.adiantamentoId, valor: '', obs: '' }));
                            setModalParcela(true);
                          }}
                          style={{ ...s.btn(c.tipoAdiantamento === 'transporte' ? '#ef6c00' : '#7c3aed'), padding: '6px 12px', fontSize: 12 }}>
                          ➖ {c.tipoAdiantamento === 'transporte' ? 'Desconto' : 'Parcela'}
                        </button>
                      )}
                      <button onClick={() => abrirEdicaoAdto(c)}
                        style={{ ...s.btn('#0284c7'), padding: '6px 12px', fontSize: 12 }}
                        title="Editar valor, data, tipo ou descrição">
                        ✏️ Editar
                      </button>
                      {c.parcelas.length === 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); excluirAdiantamento(c); }}
                          disabled={salvando}
                          style={{ ...s.btn('#dc2626'), padding: '6px 12px', fontSize: 12 }}
                          title="Excluir (sem parcelas)">
                          🗑️
                        </button>
                      )}
                      <button onClick={() => setContratoAberto(aberto ? null : c.adiantamentoId)}
                        style={{ ...s.btn('#475569'), padding: '6px 12px', fontSize: 12 }}>
                        {aberto ? '▲ Fechar' : '▼ Detalhes'}
                      </button>
                    </div>
                  </div>

                  {/* Detalhe expandido — parcelas */}
                  {aberto && (
                    <div style={{ borderTop: '1px solid #e5e7eb', backgroundColor: '#fafafa' }}>
                      {/* Info do contrato */}
                      <div style={{ padding: '10px 18px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        <span>📋 ID: <code style={{ fontSize: 11 }}>{c.adiantamentoId}</code></span>
                        <span>📅 Abertura: {fmtDataBR(c.dataAbertura)}</span>
                        <span>💳 Forma: {c.raw.formaPagamento || '—'}</span>
                        {c.raw.observacao && <span>📝 {c.raw.observacao}</span>}
                      </div>
                      {/* Tabela de parcelas */}
                      {c.parcelas.length === 0 ? (
                        <div style={{ padding: '18px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                          Nenhuma parcela registrada ainda.
                        </div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr>
                              {['#', 'Data', 'Valor abatido', 'Saldo após', 'Forma', 'Obs'].map(h => (
                                <th key={h} style={s.th}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {c.parcelas.map((p, i) => {
                              // Calcular saldo acumulado até esta parcela
                              const saldoApos = parseFloat((c.valorTotal - c.parcelas.slice(0, i + 1).reduce((s, x) => s + R(x.valor), 0)).toFixed(2));
                              return (
                                <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                                  <td style={s.td}>{i + 1}</td>
                                  <td style={s.td}>{fmtDataBR(p.dataPagamento || p.data)}</td>
                                  <td style={{ ...s.td, fontWeight: 700, color: '#059669' }}>{fmtMoeda(R(p.valor))}</td>
                                  <td style={{ ...s.td, fontWeight: 700, color: saldoApos <= 0.01 ? '#059669' : '#dc2626' }}>
                                    {fmtMoeda(Math.max(0, saldoApos))}
                                  </td>
                                  <td style={s.td}>{p.formaPagamento || '—'}</td>
                                  <td style={{ ...s.td, color: '#64748b', fontStyle: 'italic' }}>{p.obs || p.observacao || '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 700 }}>
                              <td style={s.td} colSpan={2}>Total abatido</td>
                              <td style={{ ...s.td, color: '#059669' }}>{fmtMoeda(c.totalAbatido)}</td>
                              <td style={{ ...s.td, color: c.quitado ? '#059669' : '#dc2626' }}>{fmtMoeda(Math.max(0, c.saldo))}</td>
                              <td colSpan={2} style={s.td} />
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}



      </div>
      <Footer />
    </div>
  );
};

export default AdiantamentosSaldos;

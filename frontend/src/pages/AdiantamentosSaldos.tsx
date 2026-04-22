import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';

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
  updatedAt?: string;
  unitId?: string;
}

type Carteira = 'transporte' | 'especial';

type MovimentoDirecao = 'credito' | 'debito';

interface MovimentoConfig {
  carteira: Carteira;
  direcao: MovimentoDirecao;
  label: string;
  cor: string;
}

interface MovimentoCarteira {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  tipoContrato?: string;
  carteira: Carteira;
  direcao: MovimentoDirecao;
  tipo: string;
  descricao: string;
  valor: number;
  data: string;
  observacao: string;
  saldoAnterior: number;
  saldoPosterior: number;
  raw: SaidaItem;
}

interface ResumoColaborador {
  colaboradorId: string;
  nome: string;
  tipoContrato?: string;
  transporteSaldo: number;
  especialSaldo: number;
  totalSaldo: number;
  totalCreditosTransporte: number;
  totalDebitosTransporte: number;
  totalCreditosEspecial: number;
  totalDebitosEspecial: number;
  ultimaMovimentacao?: string;
  quantidadeMovimentos: number;
}

const MOVIMENTOS: Record<string, MovimentoConfig> = {
  'Adiantamento Transporte': {
    carteira: 'transporte', direcao: 'credito', label: 'Adiantamento Transporte', cor: '#ef6c00',
  },
  'Desconto Transporte': {
    carteira: 'transporte', direcao: 'debito', label: 'Desconto Transporte', cor: '#fb8c00',
  },
  'Adiantamento Especial': {
    carteira: 'especial', direcao: 'credito', label: 'Adiantamento Especial', cor: '#8e24aa',
  },
  'Desconto Adiantamento Especial': {
    carteira: 'especial', direcao: 'debito', label: 'Desconto Adiantamento Especial', cor: '#6a1b9a',
  },
};

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

const inicioHistorico = (meses: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setMonth(d.getMonth() - meses);
  d.setDate(1);
  return d.toISOString().split('T')[0];
};

const hoje = () => new Date().toISOString().split('T')[0];

const badge = (bg: string, color: string) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 700 as const,
  backgroundColor: bg,
  color,
});

export const AdiantamentosSaldos: React.FC = () => {
  const navigate = useNavigate();
  const { activeUnit } = useUnit();
  const { user, email } = useAuth() as any;
  const unitId = activeUnit?.id || (user as any)?.unitId || localStorage.getItem('unit_id') || '';
  const userId = localStorage.getItem('user_id') || '';
  const responsavelEmail = email || (user as any)?.email || localStorage.getItem('user_email') || 'sistema';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [saidas, setSaidas] = useState<SaidaItem[]>([]);
  const [mesesHistorico, setMesesHistorico] = useState('12');
  const [buscaColaborador, setBuscaColaborador] = useState('');
  const [filtroCarteira, setFiltroCarteira] = useState<'todas' | Carteira>('todas');
  const [somenteComSaldo, setSomenteComSaldo] = useState(false);
  const [colaboradorDetalhe, setColaboradorDetalhe] = useState('');

  /* ── Modal de lançamento rápido ───────────────────── */
  const [modalAberto, setModalAberto] = useState(false);
  const [formLanc, setFormLanc] = useState({
    colaboradorId: '',
    tipo: 'Desconto Adiantamento Especial' as string,
    valor: '',
    data: new Date().toISOString().split('T')[0],
    formaPagamento: 'PIX' as 'PIX' | 'Dinheiro' | 'Misto',
    descricao: '',
    obs: '',
  });

  const abrirModalComColab = (colabId: string, tipo = 'Desconto Adiantamento Especial') => {
    setFormLanc(f => ({ ...f, colaboradorId: colabId, tipo, data: new Date().toISOString().split('T')[0], valor: '', obs: '' }));
    setModalAberto(true);
  };

  const salvarLancamento = async () => {
    if (!formLanc.colaboradorId || !formLanc.valor || parseFloat(formLanc.valor) <= 0) {
      alert('Preencha colaborador e valor.');
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        unitId,
        responsavel: responsavelEmail,
        responsavelId: userId,
        colaboradorId: formLanc.colaboradorId,
        tipo: formLanc.tipo,
        origem: formLanc.tipo,
        referencia: formLanc.tipo,
        descricao: formLanc.descricao || formLanc.tipo,
        valor: parseFloat(formLanc.valor),
        dataPagamento: formLanc.data,
        data: formLanc.data,
        pago: true,
        formaPagamento: formLanc.formaPagamento,
        observacao: formLanc.obs || '',
        obs: formLanc.obs || '',
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch(`${apiUrl}/saidas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setModalAberto(false);
      await carregarDados();
    } catch (e: any) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const token = () => localStorage.getItem('auth_token');

  const carregarDados = async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const dataInicio = inicioHistorico(parseInt(mesesHistorico, 10) || 12);
      const dataFim = hoje();
      const [rColabs, rSaidas] = await Promise.all([
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: { Authorization: `Bearer ${token()}` } }),
      ]);

      if (rColabs.ok) {
        const d = await rColabs.json();
        setColaboradores(Array.isArray(d) ? d : []);
      }
      if (rSaidas.ok) {
        const d = await rSaidas.json();
        const lista = Array.isArray(d) ? d : [];
        setSaidas(lista.filter((item: SaidaItem) => {
          const tipo = item.tipo || item.origem || item.referencia || '';
          return Boolean(MOVIMENTOS[tipo]);
        }));
      }
    } catch (e) {
      console.error('Erro ao carregar adiantamentos/saldos', e);
      setColaboradores([]);
      setSaidas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregarDados(); }, [unitId, mesesHistorico]);

  const processado = useMemo(() => {
    const colabMap = new Map<string, Colaborador>();
    colaboradores.forEach((c) => colabMap.set(c.id, c));

    const itensOrdenados = [...saidas].sort((a, b) => {
      const nomeA = (colabMap.get(a.colaboradorId)?.nome || a.colaborador || a.favorecido || '').toLowerCase();
      const nomeB = (colabMap.get(b.colaboradorId)?.nome || b.colaborador || b.favorecido || '').toLowerCase();
      if (nomeA !== nomeB) return nomeA.localeCompare(nomeB);
      const dataA = a.dataPagamento || a.data || '';
      const dataB = b.dataPagamento || b.data || '';
      if (dataA !== dataB) return dataA.localeCompare(dataB);
      return (a.updatedAt || a.id || '').localeCompare(b.updatedAt || b.id || '');
    });

    const saldos = new Map<string, { transporte: number; especial: number }>();
    const acumulados = new Map<string, {
      nome: string;
      tipoContrato?: string;
      transporteSaldo: number;
      especialSaldo: number;
      totalCreditosTransporte: number;
      totalDebitosTransporte: number;
      totalCreditosEspecial: number;
      totalDebitosEspecial: number;
      ultimaMovimentacao?: string;
      quantidadeMovimentos: number;
    }>();

    const movimentos: MovimentoCarteira[] = [];

    const ensure = (colaboradorId: string, nome: string, tipoContrato?: string) => {
      if (!saldos.has(colaboradorId)) saldos.set(colaboradorId, { transporte: 0, especial: 0 });
      if (!acumulados.has(colaboradorId)) {
        acumulados.set(colaboradorId, {
          nome,
          tipoContrato,
          transporteSaldo: 0,
          especialSaldo: 0,
          totalCreditosTransporte: 0,
          totalDebitosTransporte: 0,
          totalCreditosEspecial: 0,
          totalDebitosEspecial: 0,
          quantidadeMovimentos: 0,
        });
      }
      return { saldo: saldos.get(colaboradorId)!, resumo: acumulados.get(colaboradorId)! };
    };

    itensOrdenados.forEach((item) => {
      const tipo = item.tipo || item.origem || item.referencia || '';
      const conf = MOVIMENTOS[tipo];
      if (!conf || !item.colaboradorId) return;
      const colab = colabMap.get(item.colaboradorId);
      const nome = colab?.nome || item.colaborador || item.favorecido || item.colaboradorId;
      const tipoContrato = colab?.tipoContrato;
      const data = item.dataPagamento || item.data || '';
      const valor = R(item.valor);
      const { saldo, resumo } = ensure(item.colaboradorId, nome, tipoContrato);
      const saldoAnterior = saldo[conf.carteira];
      const delta = conf.direcao === 'credito' ? valor : -valor;
      const saldoPosterior = parseFloat((saldoAnterior + delta).toFixed(2));
      saldo[conf.carteira] = saldoPosterior;
      resumo.transporteSaldo = parseFloat(saldo.transporte.toFixed(2));
      resumo.especialSaldo = parseFloat(saldo.especial.toFixed(2));
      resumo.quantidadeMovimentos += 1;
      resumo.ultimaMovimentacao = !resumo.ultimaMovimentacao || data > resumo.ultimaMovimentacao ? data : resumo.ultimaMovimentacao;

      if (conf.carteira === 'transporte') {
        if (conf.direcao === 'credito') resumo.totalCreditosTransporte += valor;
        else resumo.totalDebitosTransporte += valor;
      } else {
        if (conf.direcao === 'credito') resumo.totalCreditosEspecial += valor;
        else resumo.totalDebitosEspecial += valor;
      }

      movimentos.push({
        id: item.id,
        colaboradorId: item.colaboradorId,
        colaboradorNome: nome,
        tipoContrato,
        carteira: conf.carteira,
        direcao: conf.direcao,
        tipo,
        descricao: item.descricao || conf.label,
        valor,
        data,
        observacao: item.observacao || '',
        saldoAnterior,
        saldoPosterior,
        raw: item,
      });
    });

    const resumos: ResumoColaborador[] = Array.from(acumulados.entries())
      .map(([colaboradorId, item]) => ({
        colaboradorId,
        nome: item.nome,
        tipoContrato: item.tipoContrato,
        transporteSaldo: parseFloat(item.transporteSaldo.toFixed(2)),
        especialSaldo: parseFloat(item.especialSaldo.toFixed(2)),
        totalSaldo: parseFloat((item.transporteSaldo + item.especialSaldo).toFixed(2)),
        totalCreditosTransporte: parseFloat(item.totalCreditosTransporte.toFixed(2)),
        totalDebitosTransporte: parseFloat(item.totalDebitosTransporte.toFixed(2)),
        totalCreditosEspecial: parseFloat(item.totalCreditosEspecial.toFixed(2)),
        totalDebitosEspecial: parseFloat(item.totalDebitosEspecial.toFixed(2)),
        ultimaMovimentacao: item.ultimaMovimentacao,
        quantidadeMovimentos: item.quantidadeMovimentos,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    return { resumos, movimentos };
  }, [colaboradores, saidas]);

  const resumosFiltrados = useMemo(() => {
    const busca = buscaColaborador.trim().toLowerCase();
    return processado.resumos.filter((r) => {
      if (busca && !r.nome.toLowerCase().includes(busca)) return false;
      if (filtroCarteira === 'transporte' && r.transporteSaldo === 0 && r.totalCreditosTransporte === 0 && r.totalDebitosTransporte === 0) return false;
      if (filtroCarteira === 'especial' && r.especialSaldo === 0 && r.totalCreditosEspecial === 0 && r.totalDebitosEspecial === 0) return false;
      if (somenteComSaldo) {
        if (filtroCarteira === 'transporte') return r.transporteSaldo !== 0;
        if (filtroCarteira === 'especial') return r.especialSaldo !== 0;
        return r.totalSaldo !== 0;
      }
      return true;
    });
  }, [processado.resumos, buscaColaborador, filtroCarteira, somenteComSaldo]);

  useEffect(() => {
    if (!colaboradorDetalhe && resumosFiltrados.length > 0) setColaboradorDetalhe(resumosFiltrados[0].colaboradorId);
    if (colaboradorDetalhe && !resumosFiltrados.some((r) => r.colaboradorId === colaboradorDetalhe)) {
      setColaboradorDetalhe(resumosFiltrados[0]?.colaboradorId || '');
    }
  }, [resumosFiltrados, colaboradorDetalhe]);

  const movimentosFiltrados = useMemo(() => {
    const listaBase = colaboradorDetalhe
      ? processado.movimentos.filter((m) => m.colaboradorId === colaboradorDetalhe)
      : processado.movimentos;
    return listaBase
      .filter((m) => filtroCarteira === 'todas' || m.carteira === filtroCarteira)
      .sort((a, b) => {
        if (a.data !== b.data) return b.data.localeCompare(a.data);
        return (b.raw.updatedAt || b.id).localeCompare(a.raw.updatedAt || a.id);
      });
  }, [processado.movimentos, colaboradorDetalhe, filtroCarteira]);

  const totais = useMemo(() => ({
    transporte: resumosFiltrados.reduce((s, r) => s + r.transporteSaldo, 0),
    especial: resumosFiltrados.reduce((s, r) => s + r.especialSaldo, 0),
    colaboradoresComSaldo: resumosFiltrados.filter((r) => r.totalSaldo !== 0).length,
    movimentos: movimentosFiltrados.length,
  }), [resumosFiltrados, movimentosFiltrados]);

  const colaboradorSelecionado = resumosFiltrados.find((r) => r.colaboradorId === colaboradorDetalhe) || null;

  const s = {
    page: { minHeight: '100vh', backgroundColor: '#f5f7fb' },
    wrap: { maxWidth: '1400px', margin: '0 auto', padding: '0 20px 30px' },
    card: { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)' },
    section: { padding: '18px' },
    label: { fontSize: '12px', fontWeight: 700 as const, color: '#475569', marginBottom: '6px', display: 'block' },
    input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' as const },
    btn: (bg: string, color = 'white') => ({ padding: '10px 14px', borderRadius: '8px', border: 'none', backgroundColor: bg, color, fontWeight: 700 as const, cursor: 'pointer' }),
    th: { textAlign: 'left' as const, fontSize: '12px', color: '#475569', backgroundColor: '#f8fafc', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const },
    td: { fontSize: '13px', color: '#1e293b', padding: '10px 12px', borderBottom: '1px solid #eef2f7', verticalAlign: 'top' as const },
    tdNum: { fontSize: '13px', color: '#1e293b', padding: '10px 12px', borderBottom: '1px solid #eef2f7', textAlign: 'right' as const, verticalAlign: 'top' as const },
  };

  /* ── Modal JSX ────────────────────────────── */
  const TIPOS_LANCAMENTO = [
    { value: 'Desconto Adiantamento Especial', label: '➖ Desconto / Parcela abatida (quitar dívida)' },
    { value: 'Adiantamento Especial', label: '➕ Novo Adiantamento Especial (novo empréstimo)' },
    { value: 'Adiantamento Transporte', label: '🚗 Adiantamento Transporte' },
    { value: 'Desconto Transporte', label: '➖ Desconto Transporte' },
  ];
  // JSX inline — não subcomponente — para evitar remontagem que faz inputs perderem foco
  const colabSelModal = colaboradores.find(c => c.id === formLanc.colaboradorId);
  const modalLancamentoJSX = !modalAberto ? null : (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setModalAberto(false)}>
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '28px', maxWidth: '520px', width: '96%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
          onClick={e => e.stopPropagation()}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '17px' }}>💳 Lançamento Rápido</h3>
            <button onClick={() => setModalAberto(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#64748b' }}>✕</button>
          </div>

          {/* Colaborador */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '5px' }}>Colaborador *</label>
            <select value={formLanc.colaboradorId}
              onChange={e => setFormLanc(f => ({ ...f, colaboradorId: e.target.value }))}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}>
              <option value="">Selecione...</option>
              {colaboradores.filter(c => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome)).map(c => (
                <option key={c.id} value={c.id}>{c.nome} {c.tipoContrato ? `(${c.tipoContrato})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Tipo */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '5px' }}>Tipo *</label>
            <select value={formLanc.tipo}
              onChange={e => setFormLanc(f => ({ ...f, tipo: e.target.value }))}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}>
              {TIPOS_LANCAMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div style={{ marginTop: '5px', fontSize: '12px', color: formLanc.tipo.startsWith('Desconto') ? '#7c3aed' : '#059669', fontWeight: 600 }}>
              {formLanc.tipo.startsWith('Desconto') ? '➖ Abate do saldo em aberto do colaborador' : '➕ Adiciona novo saldo em aberto'}
            </div>
          </div>

          {/* Valor + Data */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '5px' }}>Valor (R$) *</label>
              <input type="number" step="0.01" min="0.01" value={formLanc.valor} placeholder="0,00"
                onChange={e => setFormLanc(f => ({ ...f, valor: e.target.value }))}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '5px' }}>Data</label>
              <input type="date" value={formLanc.data}
                onChange={e => setFormLanc(f => ({ ...f, data: e.target.value }))}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' as const }} />
            </div>
          </div>

          {/* Forma de pagamento */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '5px' }}>Forma de pagamento</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['PIX', 'Dinheiro', 'Misto'] as const).map(f => (
                <button key={f} onClick={() => setFormLanc(prev => ({ ...prev, formaPagamento: f }))}
                  style={{ flex: 1, padding: '8px', border: `2px solid ${formLanc.formaPagamento === f ? '#2563eb' : '#cbd5e1'}`, borderRadius: '8px', background: formLanc.formaPagamento === f ? '#eff6ff' : 'white', fontWeight: formLanc.formaPagamento === f ? 700 : 400, cursor: 'pointer', fontSize: '13px', color: formLanc.formaPagamento === f ? '#2563eb' : '#475569' }}>
                  {f === 'PIX' ? '📱 PIX' : f === 'Dinheiro' ? '💵 Dinheiro' : '🔄 Misto'}
                </button>
              ))}
            </div>
          </div>

          {/* Descrição / Obs */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '5px' }}>Descrição / Observação</label>
            <input type="text" value={formLanc.obs} placeholder="Ex: parcela 1/5, compra celular..."
              onChange={e => setFormLanc(f => ({ ...f, obs: e.target.value }))}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' as const }} />
          </div>

          {/* Resumo */}
          {formLanc.colaboradorId && formLanc.valor && (
            <div style={{ backgroundColor: formLanc.tipo.startsWith('Desconto') ? '#f3e8ff' : '#ecfdf5', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px' }}>
              <strong>{colabSelModal?.nome}</strong> &rarr; {formLanc.tipo.startsWith('Desconto') ? '➖ abatimento de ' : '➕ novo adiantamento de '}
              <strong>R$ {parseFloat(formLanc.valor || '0').toFixed(2).replace('.', ',')}</strong>
              &nbsp;via <strong>{formLanc.formaPagamento}</strong> em {formLanc.data}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => setModalAberto(false)}
              style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#94a3b8', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={salvarLancamento} disabled={salvando}
              style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#2563eb', color: 'white', fontWeight: 700, cursor: 'pointer', opacity: salvando ? 0.7 : 1 }}>
              {salvando ? '⏳ Salvando...' : '✅ Confirmar'}
            </button>
          </div>
        </div>
      </div>
  );

  return (
    <div style={s.page as React.CSSProperties}>
      <Header title="Antecipações e Saldos" />
      {modalLancamentoJSX}
      <div style={s.wrap as React.CSSProperties}>
        <div style={{ ...s.card, ...s.section, marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: '0 0 8px', color: '#0f172a' }}>Controle de empréstimos e abatimentos parcelados</h2>
              <div style={{ color: '#475569', fontSize: '14px', maxWidth: '980px', lineHeight: 1.5 }}>
                Use <strong>Adiantamento Especial</strong> quando o colaborador recebe o valor agora e registre cada parcela futura como
                <strong> Desconto Adiantamento Especial</strong>. O saldo em aberto é recalculado automaticamente por colaborador.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button style={s.btn('#2563eb') as React.CSSProperties} onClick={() => { setFormLanc(f => ({ ...f, colaboradorId: '', tipo: 'Desconto Adiantamento Especial' })); setModalAberto(true); }}>💳 Lançar Parcela / Abatimento</button>
              <button style={s.btn('#059669') as React.CSSProperties} onClick={() => { setFormLanc(f => ({ ...f, colaboradorId: '', tipo: 'Adiantamento Especial' })); setModalAberto(true); }}>➕ Novo Adiantamento</button>
              <button style={s.btn('#0f766e') as React.CSSProperties} onClick={() => navigate('/modulos/extrato')}>Ver Extrato</button>
              <button style={s.btn('#475569') as React.CSSProperties} onClick={carregarDados}>Atualizar</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {[
            { title: 'Saldo Transporte', value: fmtMoeda(totais.transporte), color: '#ef6c00', bg: '#fff3e0' },
            { title: 'Saldo Especial', value: fmtMoeda(totais.especial), color: '#8e24aa', bg: '#f3e5f5' },
            { title: 'Colaboradores com saldo', value: String(totais.colaboradoresComSaldo), color: '#1565c0', bg: '#e3f2fd' },
            { title: 'Movimentos exibidos', value: String(totais.movimentos), color: '#2e7d32', bg: '#e8f5e9' },
          ].map((card) => (
            <div key={card.title} style={{ ...s.card, ...s.section, backgroundColor: card.bg }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: card.color, marginBottom: '8px' }}>{card.title}</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ ...s.card, ...s.section, marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
            <div>
              <label style={s.label as React.CSSProperties}>Buscar colaborador</label>
              <input value={buscaColaborador} onChange={(e) => setBuscaColaborador(e.target.value)} placeholder="Nome do colaborador" style={s.input as React.CSSProperties} />
            </div>
            <div>
              <label style={s.label as React.CSSProperties}>Carteira</label>
              <select value={filtroCarteira} onChange={(e) => setFiltroCarteira(e.target.value as any)} style={s.input as React.CSSProperties}>
                <option value="todas">Todas</option>
                <option value="transporte">Transporte</option>
                <option value="especial">Especial</option>
              </select>
            </div>
            <div>
              <label style={s.label as React.CSSProperties}>Histórico</label>
              <select value={mesesHistorico} onChange={(e) => setMesesHistorico(e.target.value)} style={s.input as React.CSSProperties}>
                <option value="3">3 meses</option>
                <option value="6">6 meses</option>
                <option value="12">12 meses</option>
                <option value="24">24 meses</option>
              </select>
            </div>
            <label style={{ ...s.label, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } as React.CSSProperties}>
              <input type="checkbox" checked={somenteComSaldo} onChange={(e) => setSomenteComSaldo(e.target.checked)} />
              Mostrar apenas saldo aberto
            </label>
            <div>
              <button style={s.btn('#111827') as React.CSSProperties} onClick={() => { setBuscaColaborador(''); setFiltroCarteira('todas'); setSomenteComSaldo(true); }}>Limpar</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 1.1fr) minmax(420px, 1fr)', gap: '16px' }}>
          <div style={{ ...s.card, overflow: 'hidden' }}>
            <div style={{ ...s.section, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0f172a' }}>Resumo por colaborador</h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Saldo atual das carteiras Transporte e Adiantamento Especial</div>
              </div>
              {loading && <span style={badge('#fff7ed', '#c2410c')}>Carregando…</span>}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={s.th as React.CSSProperties}>Colaborador</th>
                    <th style={s.th as React.CSSProperties}>Transporte</th>
                    <th style={s.th as React.CSSProperties}>Especial</th>
                    <th style={s.th as React.CSSProperties}>Status</th>
                    <th style={s.th as React.CSSProperties}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {resumosFiltrados.length === 0 ? (
                    <tr><td colSpan={4} style={{ ...s.td, textAlign: 'center', color: '#64748b' } as React.CSSProperties}>Nenhum colaborador encontrado para os filtros selecionados.</td></tr>
                  ) : resumosFiltrados.map((r) => {
                    const ativo = r.colaboradorId === colaboradorDetalhe;
                    const status = r.totalSaldo > 0 ? { label: 'Em aberto', style: badge('#fef3c7', '#92400e') } : r.quantidadeMovimentos > 0 ? { label: 'Quitado', style: badge('#dcfce7', '#166534') } : { label: 'Sem movimento', style: badge('#e2e8f0', '#334155') };
                    return (
                      <tr key={r.colaboradorId} onClick={() => setColaboradorDetalhe(r.colaboradorId)} style={{ cursor: 'pointer', backgroundColor: ativo ? '#eff6ff' : 'white' }}>
                        <td style={s.td as React.CSSProperties}>
                          <div style={{ fontWeight: 700 }}>{r.nome}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{r.tipoContrato || '—'} · {r.quantidadeMovimentos} mov.</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Última mov.: {fmtDataBR(r.ultimaMovimentacao)}</div>
                        </td>
                        <td style={{ ...s.tdNum, color: r.transporteSaldo > 0 ? '#c2410c' : '#475569' } as React.CSSProperties}>{fmtMoeda(r.transporteSaldo)}</td>
                        <td style={{ ...s.tdNum, color: r.especialSaldo > 0 ? '#7e22ce' : '#475569' } as React.CSSProperties}>{fmtMoeda(r.especialSaldo)}</td>
                        <td style={s.td as React.CSSProperties}><span style={status.style as React.CSSProperties}>{status.label}</span></td>
                        <td style={s.td as React.CSSProperties} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {r.totalSaldo > 0 && (
                              <button
                                onClick={() => abrirModalComColab(r.colaboradorId, 'Desconto Adiantamento Especial')}
                                style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, borderRadius: '6px', border: 'none', backgroundColor: '#7c3aed', color: 'white', cursor: 'pointer', whiteSpace: 'nowrap' as const }}
                                title="Registrar parcela ou abatimento pago">
                                ➖ Parcela
                              </button>
                            )}
                            <button
                              onClick={() => abrirModalComColab(r.colaboradorId, 'Adiantamento Especial')}
                              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, borderRadius: '6px', border: 'none', backgroundColor: '#059669', color: 'white', cursor: 'pointer', whiteSpace: 'nowrap' as const }}
                              title="Lançar novo adiantamento">
                              ➕ Adto
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ ...s.card, overflow: 'hidden' }}>
            <div style={{ ...s.section, borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, color: '#0f172a' }}>Movimentação analítica</h3>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                {colaboradorSelecionado ? `${colaboradorSelecionado.nome} · saldo transporte ${fmtMoeda(colaboradorSelecionado.transporteSaldo)} · saldo especial ${fmtMoeda(colaboradorSelecionado.especialSaldo)}` : 'Selecione um colaborador no resumo para analisar as parcelas e abatimentos.'}
              </div>
            </div>
            <div style={{ ...s.section, display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={badge('#fff3e0', '#9a3412')}>Adiantamento Especial = crédito</span>
                <span style={badge('#f3e5f5', '#6b21a8')}>Desconto Adiantamento Especial = parcela abatida</span>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '760px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={s.th as React.CSSProperties}>Data</th>
                      <th style={s.th as React.CSSProperties}>Carteira</th>
                      <th style={s.th as React.CSSProperties}>Tipo</th>
                      <th style={s.th as React.CSSProperties}>Valor</th>
                      <th style={s.th as React.CSSProperties}>Saldo após</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentosFiltrados.length === 0 ? (
                      <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#64748b' } as React.CSSProperties}>Nenhum movimento encontrado.</td></tr>
                    ) : movimentosFiltrados.map((m) => (
                      <tr key={`${m.id}_${m.data}_${m.tipo}`}>
                        <td style={s.td as React.CSSProperties}>
                          <div>{fmtDataBR(m.data)}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.descricao}</div>
                        </td>
                        <td style={s.td as React.CSSProperties}>
                          <span style={badge(m.carteira === 'especial' ? '#f3e5f5' : '#fff3e0', m.carteira === 'especial' ? '#6a1b9a' : '#c2410c')}>{m.carteira === 'especial' ? 'Especial' : 'Transporte'}</span>
                        </td>
                        <td style={s.td as React.CSSProperties}>
                          <div style={{ fontWeight: 700 }}>{m.tipo}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Saldo anterior: {fmtMoeda(m.saldoAnterior)}</div>
                        </td>
                        <td style={{ ...s.tdNum, color: m.direcao === 'credito' ? '#166534' : '#b91c1c', fontWeight: 700 } as React.CSSProperties}>
                          {m.direcao === 'credito' ? '+' : '−'}{fmtMoeda(m.valor)}
                        </td>
                        <td style={{ ...s.tdNum, fontWeight: 700, color: m.saldoPosterior > 0 ? '#7c2d12' : '#334155' } as React.CSSProperties}>
                          {fmtMoeda(m.saldoPosterior)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...s.card, ...s.section, marginTop: '16px' }}>
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>Fluxo operacional para pagar o pessoal</h3>
          <ol style={{ margin: '8px 0 0 18px', color: '#334155', lineHeight: 1.7 }}>
            <li>Ao entregar o valor ao colaborador, registre em <strong>Saídas</strong> como <strong>Adiantamento Especial</strong>.</li>
            <li>Em cada semana/parcela combinada, lance em <strong>Saídas</strong> o tipo <strong>Desconto Adiantamento Especial</strong>.</li>
            <li>O módulo recalcula o saldo em aberto e mostra o histórico analítico por colaborador.</li>
            <li>No fechamento semanal, os descontos de <strong>Desconto Adiantamento Especial</strong> devem abater o líquido do freelancer automaticamente.</li>
          </ol>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AdiantamentosSaldos;

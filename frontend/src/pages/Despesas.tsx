import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';

/* ═══════════════════════════════════════════════════════════════════════════
   MÓDULO DE DESPESAS
   Gestão de despesas operacionais com:
   - Entrada via formulário ou foto/NF (upload de imagem/PDF)
   - Status: pendente / pago / vencido / cancelado / parcial
   - Formas de pagamento: cartão, boleto, PIX, dinheiro, transferência
   - Integração com Conciliação Bancária (transacaoBancariaId)
   - Vínculo com Fornecedores
═══════════════════════════════════════════════════════════════════════════ */

const API_BASE = 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

interface Despesa {
  id: string;
  unitId: string;
  fornecedorId?: string;
  fornecedorNome?: string;
  categoria: string;
  descricao: string;
  valor: number;
  dataEmissao?: string;
  dataVencimento: string;
  dataPagamento?: string;
  formaPagamento?: string;
  status: 'pendente' | 'pago' | 'vencido' | 'cancelado' | 'parcial';
  numeroNF?: string;
  anexoUrl?: string;
  anexoNome?: string;
  transacaoBancariaId?: string;
  observacoes?: string;
  createdAt?: string;
  updatedAt?: string;
  criadoPor?: string;
}

interface Fornecedor {
  id: string;
  razaoSocial: string;
  nomeFantasia?: string;
  categoria: string;
  ativo: boolean;
}

const CATEGORIAS_DESPESA = [
  'Alimentação / Matéria-prima',
  'Bebidas',
  'Descartáveis / Embalagens',
  'Limpeza / Higiene',
  'Manutenção / Serviços',
  'Gás / Combustível',
  'Transporte / Logística',
  'Tecnologia / Software',
  'Marketing / Publicidade',
  'Contabilidade / Jurídico',
  'Aluguel / Imóvel',
  'Folha de Pagamento',
  'Impostos / Taxas',
  'Energia / Água / Telefone',
  'Equipamentos / Utensílios',
  'Uniformes / EPIs',
  'Outros',
];

const FORMAS_PAGAMENTO = [
  'Cartão de Crédito',
  'Cartão de Débito',
  'Boleto Bancário',
  'PIX',
  'Dinheiro',
  'Transferência Bancária (TED/DOC)',
  'Débito Automático',
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pendente:  { label: 'Pendente',  color: '#f59e0b', bg: '#fef3c7', icon: '⏳' },
  pago:      { label: 'Pago',      color: '#10b981', bg: '#d1fae5', icon: '✅' },
  vencido:   { label: 'Vencido',   color: '#ef4444', bg: '#fee2e2', icon: '🚨' },
  cancelado: { label: 'Cancelado', color: '#6b7280', bg: '#f3f4f6', icon: '❌' },
  parcial:   { label: 'Parcial',   color: '#3b82f6', bg: '#dbeafe', icon: '🔵' },
};

const EMPTY_FORM: Omit<Despesa, 'id' | 'unitId' | 'createdAt' | 'updatedAt' | 'criadoPor'> = {
  fornecedorId: '',
  fornecedorNome: '',
  categoria: '',
  descricao: '',
  valor: 0,
  dataEmissao: '',
  dataVencimento: '',
  dataPagamento: '',
  formaPagamento: '',
  status: 'pendente',
  numeroNF: '',
  anexoUrl: '',
  anexoNome: '',
  transacaoBancariaId: '',
  observacoes: '',
};

/* ── helpers ── */
const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d?: string) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const today = () => new Date().toISOString().slice(0, 10);

const isVencido = (d: Despesa) =>
  d.status === 'pendente' && d.dataVencimento < today();

/* ──────────────────────────────────────────────────────────── */
export default function Despesas() {
  const { activeUnit } = useUnit();
  const { user } = useAuth();

  /* ── state ── */
  const [despesas, setDespesas]         = useState<Despesa[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading]           = useState(false);
  const [erro, setErro]                 = useState('');
  const [sucesso, setSucesso]           = useState('');

  // tab: 'lista' | 'form' | 'upload'
  const [tab, setTab]                   = useState<'lista' | 'form' | 'upload'>('lista');
  const [editando, setEditando]         = useState<Despesa | null>(null);
  const [form, setForm]                 = useState({ ...EMPTY_FORM });

  // upload NF / foto
  const fileRef                         = useRef<HTMLInputElement>(null);
  const [preview, setPreview]           = useState<string>('');
  const [uploadArquivo, setUploadArquivo] = useState<File | null>(null);
  const [uploadando, setUploadando]     = useState(false);

  // filtros
  const [filtroStatus,   setFiltroStatus]   = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroPeriodo,  setFiltroPeriodo]  = useState('');  // YYYY-MM
  const [filtroTexto,    setFiltroTexto]    = useState('');
  const [filtroForma,    setFiltroForma]    = useState('');

  // modal de confirmação de exclusão
  const [excluindo, setExcluindo]       = useState<Despesa | null>(null);
  const [salvando, setSalvando]         = useState(false);

  /* ── carrega dados ── */
  const carregarDespesas = useCallback(async () => {
    if (!activeUnit?.id) return;
    setLoading(true);
    setErro('');
    try {
      const r = await fetch(`${API_BASE}/despesas?unitId=${activeUnit!.id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const lista: Despesa[] = Array.isArray(data) ? data : (data.items ?? []);
      // marcar vencidos automaticamente no frontend
      const comStatus = lista.map(d => ({
        ...d,
        status: isVencido(d) ? ('vencido' as const) : d.status,
      }));
      setDespesas(comStatus.sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento)));
    } catch (e: any) {
      setErro('Erro ao carregar despesas: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [activeUnit?.id]);

  const carregarFornecedores = useCallback(async () => {
    if (!activeUnit?.id) return;
    try {
      const r = await fetch(`${API_BASE}/fornecedores?unitId=${activeUnit!.id}`);
      if (!r.ok) return;
      const data = await r.json();
      const lista: Fornecedor[] = Array.isArray(data) ? data : (data.items ?? []);
      setFornecedores(lista.filter(f => f.ativo));
    } catch { /* silencioso */ }
  }, [activeUnit?.id]);

  useEffect(() => {
    carregarDespesas();
    carregarFornecedores();
  }, [carregarDespesas, carregarFornecedores]);

  /* ── feedback helpers ── */
  const showSucesso = (msg: string) => {
    setSucesso(msg);
    setTimeout(() => setSucesso(''), 4000);
  };

  /* ── filtros aplicados ── */
  const despesasFiltradas = despesas.filter(d => {
    if (filtroStatus !== 'todos' && d.status !== filtroStatus) return false;
    if (filtroCategoria && d.categoria !== filtroCategoria) return false;
    if (filtroForma && d.formaPagamento !== filtroForma) return false;
    if (filtroPeriodo) {
      const mes = d.dataVencimento?.slice(0, 7);
      if (mes !== filtroPeriodo) return false;
    }
    if (filtroTexto) {
      const q = filtroTexto.toLowerCase();
      const campos = [
        d.descricao, d.fornecedorNome, d.categoria,
        d.numeroNF, d.observacoes,
      ].join(' ').toLowerCase();
      if (!campos.includes(q)) return false;
    }
    return true;
  });

  /* ── totais ── */
  const totais = {
    total:    despesasFiltradas.reduce((s, d) => s + d.valor, 0),
    pago:     despesasFiltradas.filter(d => d.status === 'pago').reduce((s, d) => s + d.valor, 0),
    pendente: despesasFiltradas.filter(d => d.status === 'pendente').reduce((s, d) => s + d.valor, 0),
    vencido:  despesasFiltradas.filter(d => d.status === 'vencido').reduce((s, d) => s + d.valor, 0),
  };

  /* ── formulário ── */
  const abrirNovo = () => {
    setEditando(null);
    setForm({ ...EMPTY_FORM, dataVencimento: today() });
    setPreview('');
    setUploadArquivo(null);
    setTab('form');
  };

  const abrirEdicao = (d: Despesa) => {
    setEditando(d);
    setForm({
      fornecedorId:       d.fornecedorId ?? '',
      fornecedorNome:     d.fornecedorNome ?? '',
      categoria:          d.categoria,
      descricao:          d.descricao,
      valor:              d.valor,
      dataEmissao:        d.dataEmissao ?? '',
      dataVencimento:     d.dataVencimento,
      dataPagamento:      d.dataPagamento ?? '',
      formaPagamento:     d.formaPagamento ?? '',
      status:             d.status,
      numeroNF:           d.numeroNF ?? '',
      anexoUrl:           d.anexoUrl ?? '',
      anexoNome:          d.anexoNome ?? '',
      transacaoBancariaId: d.transacaoBancariaId ?? '',
      observacoes:        d.observacoes ?? '',
    });
    setPreview(d.anexoUrl ?? '');
    setUploadArquivo(null);
    setTab('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFornecedorChange = (id: string) => {
    const f = fornecedores.find(x => x.id === id);
    setForm(prev => ({
      ...prev,
      fornecedorId: id,
      fornecedorNome: f ? (f.nomeFantasia || f.razaoSocial) : '',
    }));
  };

  /* ── upload de arquivo ── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadArquivo(file);
    setForm(prev => ({ ...prev, anexoNome: file.name }));

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview('');
    }
  };

  // Converte arquivo para base64 para envio
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /* ── salvar ── */
  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUnit?.id) return;

    if (!form.categoria) { setErro('Selecione a categoria.'); return; }
    if (!form.descricao.trim()) { setErro('Informe a descrição.'); return; }
    if (!form.valor || form.valor <= 0) { setErro('Informe o valor da despesa.'); return; }
    if (!form.dataVencimento) { setErro('Informe a data de vencimento.'); return; }

    setSalvando(true);
    setErro('');

    try {
      let anexoUrl = form.anexoUrl;
      let anexoNome = form.anexoNome;

      // Se há arquivo novo, converte para base64 (backend pode salvar ou repassar a S3)
      if (uploadArquivo) {
        setUploadando(true);
        try {
          const base64 = await fileToBase64(uploadArquivo);
          // Envia junto com a despesa; o backend deve armazenar (S3 ou inline)
          anexoUrl = base64;
          anexoNome = uploadArquivo.name;
        } finally {
          setUploadando(false);
        }
      }

      const payload: any = {
        ...form,
        anexoUrl,
        anexoNome,
        valor: Number(form.valor),
        unitId: activeUnit!.id,
        criadoPor: user?.email ?? 'sistema',
      };

      // Remove campos vazios
      Object.keys(payload).forEach(k => {
        if (payload[k] === '' || payload[k] === null) delete payload[k];
      });

      let resp: Response;
      if (editando) {
        resp = await fetch(`${API_BASE}/despesas/${editando.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        resp = await fetch(`${API_BASE}/despesas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${resp.status}`);
      }

      showSucesso(editando ? 'Despesa atualizada com sucesso!' : 'Despesa registrada com sucesso!');
      setTab('lista');
      setEditando(null);
      setForm({ ...EMPTY_FORM });
      setPreview('');
      setUploadArquivo(null);
      await carregarDespesas();
    } catch (e: any) {
      setErro('Erro ao salvar despesa: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  /* ── excluir ── */
  const confirmarExclusao = async () => {
    if (!excluindo) return;
    try {
      const resp = await fetch(`${API_BASE}/despesas/${excluindo.id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      showSucesso('Despesa excluída.');
      setExcluindo(null);
      await carregarDespesas();
    } catch (e: any) {
      setErro('Erro ao excluir: ' + e.message);
      setExcluindo(null);
    }
  };

  /* ── marcar como pago rápido ── */
  const marcarPago = async (d: Despesa) => {
    try {
      const resp = await fetch(`${API_BASE}/despesas/${d.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...d,
          status: 'pago',
          dataPagamento: today(),
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      showSucesso('Despesa marcada como paga!');
      await carregarDespesas();
    } catch (e: any) {
      setErro('Erro ao atualizar status: ' + e.message);
    }
  };

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <Header title="Despesas" />

      <main style={{ flex: 1, padding: '24px 16px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>

        {/* ── Título ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1e293b', margin: 0 }}>
              💸 Despesas
            </h1>
            <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>
              Gestão de despesas operacionais · {activeUnit?.nome ?? '—'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setTab('upload'); setEditando(null); setForm({ ...EMPTY_FORM }); setPreview(''); setUploadArquivo(null); }}
              style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              📷 Upload NF/Foto
            </button>
            <button
              onClick={abrirNovo}
              style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, cursor: 'pointer' }}
            >
              + Nova Despesa
            </button>
          </div>
        </div>

        {/* ── Feedbacks ── */}
        {erro && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#991b1b', display: 'flex', justifyContent: 'space-between' }}>
            <span>⚠️ {erro}</span>
            <button onClick={() => setErro('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
          </div>
        )}
        {sucesso && (
          <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#065f46' }}>
            ✅ {sucesso}
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 24 }}>
          {([
            { key: 'lista',  label: '📋 Lista' },
            { key: 'form',   label: editando ? '✏️ Editar' : '➕ Nova Despesa' },
            { key: 'upload', label: '📷 Upload NF' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: tab === t.key ? 700 : 400,
                color: tab === t.key ? '#dc2626' : '#64748b',
                borderBottom: tab === t.key ? '2px solid #dc2626' : '2px solid transparent',
                marginBottom: -2, fontSize: 14,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════ TAB: LISTA ══════════════════ */}
        {tab === 'lista' && (
          <>
            {/* Cards de resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Total Filtrado',  value: totais.total,    color: '#1e293b', icon: '💰' },
                { label: 'Pago',            value: totais.pago,     color: '#10b981', icon: '✅' },
                { label: 'Pendente',        value: totais.pendente, color: '#f59e0b', icon: '⏳' },
                { label: 'Vencido',         value: totais.vencido,  color: '#ef4444', icon: '🚨' },
              ].map(c => (
                <div key={c.label} style={{ background: '#fff', borderRadius: 10, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.08)', borderLeft: `4px solid ${c.color}` }}>
                  <div style={{ fontSize: 22 }}>{c.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: c.color, marginTop: 4 }}>{fmt(c.value)}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Filtros */}
            <div style={{ background: '#fff', borderRadius: 10, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <input
                  placeholder="🔍 Buscar..."
                  value={filtroTexto}
                  onChange={e => setFiltroTexto(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}
                />
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}>
                  <option value="todos">Todos os status</option>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
                <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}>
                  <option value="">Todas as categorias</option>
                  {CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filtroForma} onChange={e => setFiltroForma(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}>
                  <option value="">Todas as formas</option>
                  {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <input
                  type="month"
                  value={filtroPeriodo}
                  onChange={e => setFiltroPeriodo(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}
                />
                <button
                  onClick={() => { setFiltroStatus('todos'); setFiltroCategoria(''); setFiltroPeriodo(''); setFiltroTexto(''); setFiltroForma(''); }}
                  style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, cursor: 'pointer', color: '#475569' }}
                >
                  🗑️ Limpar filtros
                </button>
              </div>
            </div>

            {/* Tabela */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>⏳ Carregando despesas...</div>
            ) : despesasFiltradas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
                <div style={{ fontSize: 48 }}>💸</div>
                <p style={{ color: '#64748b', marginTop: 8 }}>
                  {despesas.length === 0 ? 'Nenhuma despesa cadastrada.' : 'Nenhuma despesa para os filtros selecionados.'}
                </p>
                <button onClick={abrirNovo}
                  style={{ marginTop: 12, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  + Registrar primeira despesa
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      {['Status', 'Vencimento', 'Descrição', 'Fornecedor', 'Categoria', 'Valor', 'Forma Pgto', 'NF', 'Ações'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {despesasFiltradas.map(d => {
                      const st = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.pendente;
                      return (
                        <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9', background: d.status === 'vencido' ? '#fff5f5' : '#fff' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ background: st.bg, color: st.color, borderRadius: 20, padding: '3px 10px', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {st.icon} {st.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: d.status === 'vencido' ? '#ef4444' : '#1e293b', fontWeight: d.status === 'vencido' ? 700 : 400 }}>
                            {fmtDate(d.dataVencimento)}
                            {d.dataPagamento && (
                              <div style={{ fontSize: 11, color: '#10b981' }}>Pago: {fmtDate(d.dataPagamento)}</div>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', maxWidth: 200 }}>
                            <div style={{ fontWeight: 500, color: '#1e293b' }}>{d.descricao}</div>
                            {d.observacoes && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{d.observacoes.slice(0, 60)}{d.observacoes.length > 60 ? '…' : ''}</div>}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                            {d.fornecedorNome || '—'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                              {d.categoria}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
                            {fmt(d.valor)}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>
                            {d.formaPagamento || '—'}
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: 12 }}>
                            {d.numeroNF ? (
                              <span style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 4, padding: '2px 8px' }}>
                                NF {d.numeroNF}
                              </span>
                            ) : '—'}
                            {d.anexoUrl && (
                              <a
                                href={d.anexoUrl.startsWith('data:') ? d.anexoUrl : d.anexoUrl}
                                target="_blank" rel="noreferrer"
                                style={{ display: 'block', color: '#0ea5e9', fontSize: 11, marginTop: 2 }}
                              >
                                📎 {d.anexoNome ? d.anexoNome.slice(0, 20) : 'Ver anexo'}
                              </a>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                              {(d.status === 'pendente' || d.status === 'vencido') && (
                                <button
                                  onClick={() => marcarPago(d)}
                                  title="Marcar como pago"
                                  style={{ background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
                                >
                                  ✅ Pagar
                                </button>
                              )}
                              <button
                                onClick={() => abrirEdicao(d)}
                                title="Editar"
                                style={{ background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12 }}
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => setExcluindo(d)}
                                title="Excluir"
                                style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12 }}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ padding: '10px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#64748b' }}>
                  {despesasFiltradas.length} despesa(s) · Total: <strong style={{ color: '#1e293b' }}>{fmt(totais.total)}</strong>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════════ TAB: FORMULÁRIO ══════════════════ */}
        {tab === 'form' && (
          <div style={{ background: '#fff', borderRadius: 10, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 20 }}>
              {editando ? '✏️ Editar Despesa' : '➕ Nova Despesa'}
            </h2>

            <form onSubmit={handleSalvar}>
              {/* Linha 1: Fornecedor + Categoria */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Fornecedor</label>
                  <select
                    value={form.fornecedorId}
                    onChange={e => handleFornecedorChange(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">— Selecione o fornecedor (opcional) —</option>
                    {fornecedores.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.nomeFantasia || f.razaoSocial} · {f.categoria}
                      </option>
                    ))}
                  </select>
                  {fornecedores.length === 0 && (
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      Nenhum fornecedor cadastrado. <a href="/modulos/fornecedores" style={{ color: '#0ea5e9' }}>Cadastrar fornecedor →</a>
                    </span>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Categoria *</label>
                  <select
                    value={form.categoria}
                    onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
                    required
                    style={inputStyle}
                  >
                    <option value="">— Selecione —</option>
                    {CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Linha 2: Descrição */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Descrição *</label>
                <input
                  type="text"
                  value={form.descricao}
                  onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                  required
                  placeholder="Ex: Compra de embalagens — Fornecedor X"
                  style={inputStyle}
                />
              </div>

              {/* Linha 3: Valor + Data Emissão + Data Vencimento */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.valor || ''}
                    onChange={e => setForm(p => ({ ...p, valor: parseFloat(e.target.value) || 0 }))}
                    required
                    placeholder="0,00"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Data de Emissão (NF)</label>
                  <input
                    type="date"
                    value={form.dataEmissao}
                    onChange={e => setForm(p => ({ ...p, dataEmissao: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Data de Vencimento *</label>
                  <input
                    type="date"
                    value={form.dataVencimento}
                    onChange={e => setForm(p => ({ ...p, dataVencimento: e.target.value }))}
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Linha 4: Forma de Pagamento + Status + Data Pagamento */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Forma de Pagamento</label>
                  <select
                    value={form.formaPagamento}
                    onChange={e => setForm(p => ({ ...p, formaPagamento: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">— Selecione —</option>
                    {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status *</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(p => ({ ...p, status: e.target.value as Despesa['status'] }))}
                    style={inputStyle}
                  >
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Data de Pagamento</label>
                  <input
                    type="date"
                    value={form.dataPagamento}
                    onChange={e => setForm(p => ({ ...p, dataPagamento: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Linha 5: Número NF + ID Conciliação */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Número da NF / Pedido</label>
                  <input
                    type="text"
                    value={form.numeroNF}
                    onChange={e => setForm(p => ({ ...p, numeroNF: e.target.value }))}
                    placeholder="Ex: 001234"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    🏦 Transação Bancária (Conciliação)
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>ID da transação vinculada</span>
                  </label>
                  <input
                    type="text"
                    value={form.transacaoBancariaId}
                    onChange={e => setForm(p => ({ ...p, transacaoBancariaId: e.target.value }))}
                    placeholder="Deixe em branco ou vincule manualmente"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Linha 6: Anexo (NF/Foto) */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>📎 Anexo (NF, Nota, Foto do Pedido)</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: '2px dashed #cbd5e1', borderRadius: 8, padding: '20px',
                    textAlign: 'center', cursor: 'pointer', background: '#f8fafc',
                    transition: 'border-color .2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#0ea5e9')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#cbd5e1')}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  {preview ? (
                    <img src={preview} alt="preview" style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }} />
                  ) : form.anexoNome ? (
                    <div>
                      <span style={{ fontSize: 32 }}>📄</span>
                      <p style={{ margin: '8px 0 0', color: '#0ea5e9', fontWeight: 500 }}>{form.anexoNome}</p>
                    </div>
                  ) : (
                    <div>
                      <span style={{ fontSize: 32 }}>📷</span>
                      <p style={{ margin: '8px 0 0', color: '#64748b' }}>Clique para selecionar uma imagem ou PDF da nota fiscal</p>
                      <p style={{ margin: 4, color: '#94a3b8', fontSize: 12 }}>JPG, PNG, PDF · máx. 5 MB</p>
                    </div>
                  )}
                </div>
                {(form.anexoNome || preview) && (
                  <button
                    type="button"
                    onClick={() => { setPreview(''); setUploadArquivo(null); setForm(p => ({ ...p, anexoUrl: '', anexoNome: '' })); if (fileRef.current) fileRef.current.value = ''; }}
                    style={{ marginTop: 6, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
                  >
                    🗑️ Remover anexo
                  </button>
                )}
              </div>

              {/* Linha 7: Observações */}
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Observações</label>
                <textarea
                  value={form.observacoes}
                  onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                  rows={3}
                  placeholder="Informações adicionais, condições especiais, etc."
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                />
              </div>

              {/* Botões */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setTab('lista'); setEditando(null); }}
                  style={{ padding: '10px 24px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando || uploadando}
                  style={{ padding: '10px 28px', background: salvando ? '#94a3b8' : '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: salvando ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15 }}
                >
                  {uploadando ? '⏫ Enviando arquivo...' : salvando ? '💾 Salvando...' : editando ? '💾 Salvar alterações' : '💾 Registrar Despesa'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ══════════════════ TAB: UPLOAD NF ══════════════════ */}
        {tab === 'upload' && (
          <div style={{ background: '#fff', borderRadius: 10, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
              📷 Upload Rápido de NF / Foto do Pedido
            </h2>
            <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14 }}>
              Fotografe ou selecione a nota fiscal e preencha os dados básicos para registrar a despesa rapidamente.
            </p>

            {/* Área de upload */}
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed #0ea5e9', borderRadius: 12, padding: '40px 20px',
                textAlign: 'center', cursor: 'pointer', background: '#f0f9ff',
                marginBottom: 20,
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                capture="environment"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              {preview ? (
                <img src={preview} alt="NF" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }} />
              ) : uploadArquivo ? (
                <div>
                  <span style={{ fontSize: 48 }}>📄</span>
                  <p style={{ color: '#0ea5e9', fontWeight: 500, marginTop: 8 }}>{uploadArquivo.name}</p>
                </div>
              ) : (
                <div>
                  <span style={{ fontSize: 56 }}>📷</span>
                  <p style={{ color: '#0ea5e9', fontWeight: 600, marginTop: 12, fontSize: 16 }}>
                    Clique para tirar foto ou selecionar arquivo
                  </p>
                  <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
                    Aceita JPG, PNG, PDF · Câmera do celular disponível
                  </p>
                </div>
              )}
            </div>

            {uploadArquivo && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <span style={{ fontSize: 14, color: '#10b981', fontWeight: 500 }}>
                    ✅ Arquivo selecionado: {uploadArquivo.name}
                  </span>
                  <button
                    onClick={() => { setUploadArquivo(null); setPreview(''); if (fileRef.current) fileRef.current.value = ''; }}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}
                  >
                    🗑️ Remover
                  </button>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
                  <p style={{ color: '#475569', fontWeight: 600, marginBottom: 16 }}>
                    Preencha os dados básicos da despesa:
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Categoria *</label>
                      <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} style={inputStyle}>
                        <option value="">— Selecione —</option>
                        {CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Valor (R$) *</label>
                      <input type="number" step="0.01" min="0.01" value={form.valor || ''} onChange={e => setForm(p => ({ ...p, valor: parseFloat(e.target.value) || 0 }))} placeholder="0,00" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Vencimento *</label>
                      <input type="date" value={form.dataVencimento || today()} onChange={e => setForm(p => ({ ...p, dataVencimento: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Nº NF / Pedido</label>
                      <input type="text" value={form.numeroNF} onChange={e => setForm(p => ({ ...p, numeroNF: e.target.value }))} placeholder="001234" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Forma de Pagamento</label>
                      <select value={form.formaPagamento} onChange={e => setForm(p => ({ ...p, formaPagamento: e.target.value }))} style={inputStyle}>
                        <option value="">— Selecione —</option>
                        {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Fornecedor</label>
                      <select value={form.fornecedorId} onChange={e => handleFornecedorChange(e.target.value)} style={inputStyle}>
                        <option value="">— Opcional —</option>
                        {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nomeFantasia || f.razaoSocial}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <label style={labelStyle}>Descrição *</label>
                    <input type="text" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Compra de embalagens — NF 1234" style={inputStyle} />
                  </div>

                  <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setTab('lista'); setForm({ ...EMPTY_FORM }); setPreview(''); setUploadArquivo(null); }}
                      style={{ padding: '10px 24px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSalvar as any}
                      disabled={salvando || uploadando || !form.categoria || !form.descricao || !form.valor || !form.dataVencimento}
                      style={{
                        padding: '10px 28px', background: (salvando || uploadando || !form.categoria || !form.descricao || !form.valor) ? '#94a3b8' : '#0ea5e9',
                        color: '#fff', border: 'none', borderRadius: 8,
                        cursor: (salvando || uploadando || !form.categoria || !form.descricao || !form.valor) ? 'not-allowed' : 'pointer',
                        fontWeight: 700, fontSize: 15,
                      }}
                    >
                      {uploadando ? '⏫ Enviando...' : salvando ? '💾 Salvando...' : '💾 Salvar Despesa com Anexo'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════ MODAL EXCLUSÃO ══════════════════ */}
        {excluindo && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 32, maxWidth: 420, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,.2)' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>🗑️ Confirmar Exclusão</h3>
              <p style={{ color: '#475569', marginBottom: 8 }}>
                Tem certeza que deseja excluir a despesa:
              </p>
              <div style={{ background: '#fee2e2', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
                <strong style={{ color: '#dc2626' }}>{excluindo.descricao}</strong>
                <br />
                <span style={{ color: '#64748b', fontSize: 13 }}>{fmt(excluindo.valor)} · {fmtDate(excluindo.dataVencimento)}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button onClick={() => setExcluindo(null)} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#475569' }}>
                  Cancelar
                </button>
                <button onClick={confirmarExclusao} style={{ padding: '10px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                  Sim, excluir
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}

/* ── estilos reutilizáveis ── */
const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#374151',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
  borderRadius: 6, fontSize: 14, color: '#1e293b',
  boxSizing: 'border-box', background: '#fff',
};

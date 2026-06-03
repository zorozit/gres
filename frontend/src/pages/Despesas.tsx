import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';

/* ═══════════════════════════════════════════════════════════════════════════
   GESTÃO DE DESPESAS OPERACIONAIS
   Entrada via formulário manual OU via foto/upload de pedido ou NF
   Status de pagamento: pendente / pago / vencido / cancelado / parcial
   Formas: cartão, boleto, PIX, dinheiro
   Integração com Conciliação Bancária via transacaoBancariaId
═══════════════════════════════════════════════════════════════════════════ */

const API = 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

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
  categoria?: string;
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
  'Utilidades (Água/Luz/Internet)',
  'Equipamentos / Utensílios',
  'Uniformes / EPI',
  'Outras Despesas',
];

const FORMAS_PAGAMENTO = ['Cartão de Crédito', 'Cartão de Débito', 'Boleto', 'PIX', 'Dinheiro', 'Transferência'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pendente:  { label: 'Pendente',  color: '#e65100', bg: '#fff3e0', icon: '⏳' },
  pago:      { label: 'Pago',      color: '#1b5e20', bg: '#e8f5e9', icon: '✅' },
  vencido:   { label: 'Vencido',   color: '#b71c1c', bg: '#ffebee', icon: '🚨' },
  cancelado: { label: 'Cancelado', color: '#546e7a', bg: '#eceff1', icon: '🚫' },
  parcial:   { label: 'Parcial',   color: '#1565c0', bg: '#e3f2fd', icon: '⚡' },
};

const EMPTY_FORM: Partial<Despesa> = {
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

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(iso?: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}
function today() {
  return new Date().toISOString().split('T')[0];
}
function isVencido(d: Despesa) {
  if (d.status === 'pago' || d.status === 'cancelado') return false;
  return d.dataVencimento && d.dataVencimento < today();
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function Despesas() {
  const { activeUnit: selectedUnit } = useUnit();
  const { user } = useAuth();

  // Data
  const [despesas, setDespesas]       = useState<Despesa[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  // View
  const [activeTab, setActiveTab]     = useState<'lista' | 'form' | 'upload'>('lista');
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [viewingDespesa, setViewingDespesa] = useState<Despesa | null>(null);

  // Filters
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroPeriodoInicio, setFiltroPeriodoInicio] = useState('');
  const [filtroPeriodoFim, setFiltroPeriodoFim]       = useState('');
  const [filtroBusca, setFiltroBusca]                 = useState('');
  const [filtroForma, setFiltroForma]                 = useState('todas');

  // Form
  const [form, setForm] = useState<Partial<Despesa>>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Upload / foto
  const [uploadFile, setUploadFile]   = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string>('');
  const [uploadProcessing, setUploadProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchDespesas = useCallback(async () => {
    if (!selectedUnit?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/despesas?unitId=${selectedUnit.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const lista: Despesa[] = Array.isArray(data) ? data : (data.items || data.despesas || []);
      // Auto-mark vencidos
      const updated = lista.map(d => ({ ...d, status: isVencido(d) ? 'vencido' as const : d.status }));
      setDespesas(updated);
    } catch (e: any) {
      setError('Erro ao carregar despesas: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedUnit?.id]);

  const fetchFornecedores = useCallback(async () => {
    if (!selectedUnit?.id) return;
    try {
      const res = await fetch(`${API}/fornecedores?unitId=${selectedUnit.id}`);
      if (!res.ok) return;
      const data = await res.json();
      const lista: Fornecedor[] = Array.isArray(data) ? data : (data.items || data.fornecedores || []);
      setFornecedores(lista.filter(f => (f as any).ativo !== false));
    } catch {
      // silencioso — fornecedores é opcional
    }
  }, [selectedUnit?.id]);

  useEffect(() => {
    fetchDespesas();
    fetchFornecedores();
  }, [fetchDespesas, fetchFornecedores]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const despesasFiltradas = despesas.filter(d => {
    if (filtroStatus !== 'todos' && d.status !== filtroStatus) return false;
    if (filtroCategoria !== 'todas' && d.categoria !== filtroCategoria) return false;
    if (filtroForma !== 'todas' && d.formaPagamento !== filtroForma) return false;
    if (filtroPeriodoInicio && d.dataVencimento < filtroPeriodoInicio) return false;
    if (filtroPeriodoFim   && d.dataVencimento > filtroPeriodoFim)    return false;
    if (filtroBusca) {
      const q = filtroBusca.toLowerCase();
      const match =
        d.descricao.toLowerCase().includes(q) ||
        (d.fornecedorNome || '').toLowerCase().includes(q) ||
        (d.numeroNF || '').toLowerCase().includes(q) ||
        d.categoria.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalGeral     = despesas.reduce((s, d) => s + d.valor, 0);
  const totalPago      = despesas.filter(d => d.status === 'pago').reduce((s, d) => s + d.valor, 0);
  const totalPendente  = despesas.filter(d => d.status === 'pendente').reduce((s, d) => s + d.valor, 0);
  const totalVencido   = despesas.filter(d => d.status === 'vencido').reduce((s, d) => s + d.valor, 0);

  // ── Validate ──────────────────────────────────────────────────────────────
  function validateForm() {
    const errs: Record<string, string> = {};
    if (!form.categoria)     errs.categoria     = 'Categoria obrigatória';
    if (!form.descricao?.trim()) errs.descricao = 'Descrição obrigatória';
    if (!form.valor || form.valor <= 0) errs.valor = 'Valor deve ser maior que zero';
    if (!form.dataVencimento) errs.dataVencimento = 'Data de vencimento obrigatória';
    if (form.status === 'pago' && !form.dataPagamento) errs.dataPagamento = 'Data de pagamento obrigatória para status Pago';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!validateForm()) return;
    if (!selectedUnit?.id) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        unitId: selectedUnit.id,
        valor: Number(form.valor),
        criadoPor: (user as any)?.name || user?.email || 'sistema',
        updatedAt: new Date().toISOString(),
      };
      if (!editingId) payload.createdAt = new Date().toISOString();

      const url    = editingId ? `${API}/despesas/${editingId}` : `${API}/despesas`;
      const method = editingId ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      resetForm();
      await fetchDespesas();
      setActiveTab('lista');
    } catch (e: any) {
      setError('Erro ao salvar despesa: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`${API}/despesas/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleteConfirm(null);
      await fetchDespesas();
    } catch (e: any) {
      setError('Erro ao excluir: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: string, novoStatus: Despesa['status']) {
    try {
      const despesa = despesas.find(d => d.id === id);
      if (!despesa) return;
      const payload: Partial<Despesa> = { status: novoStatus };
      if (novoStatus === 'pago' && !despesa.dataPagamento) payload.dataPagamento = today();
      await fetch(`${API}/despesas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...despesa, ...payload }),
      });
      await fetchDespesas();
    } catch (e: any) {
      setError('Erro ao atualizar status: ' + e.message);
    }
  }

  // ── Form helpers ──────────────────────────────────────────────────────────
  function startEdit(d: Despesa) {
    setForm({ ...d });
    setEditingId(d.id);
    setFormErrors({});
    setActiveTab('form');
  }
  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormErrors({});
    setUploadFile(null);
    setUploadPreview('');
  }
  function handleFormChange(field: keyof Despesa, value: any) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  }
  function handleFornecedorSelect(id: string) {
    const f = fornecedores.find(f => f.id === id);
    setForm(prev => ({
      ...prev,
      fornecedorId: id,
      fornecedorNome: f ? (f.nomeFantasia || f.razaoSocial) : '',
      categoria: prev.categoria || f?.categoria || '',
    }));
  }

  // ── File / Photo upload ───────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => setUploadPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setUploadPreview('');
    }
  }

  async function handleUploadAnexo() {
    if (!uploadFile) return;
    setUploadProcessing(true);
    try {
      // Converte para base64 e salva inline (sem S3)
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        // Salva URL como data URI (funciona para NFs pequenas, <1MB)
        // Para produção com S3, substituir aqui pelo upload ao bucket
        setForm(prev => ({
          ...prev,
          anexoUrl: base64,
          anexoNome: uploadFile.name,
        }));
        setUploadProcessing(false);
      };
      reader.readAsDataURL(uploadFile);
    } catch (e: any) {
      setError('Erro ao processar arquivo: ' + e.message);
      setUploadProcessing(false);
    }
  }

  async function handleUploadAndCreate() {
    if (!uploadFile || !selectedUnit?.id) return;
    setUploadProcessing(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        const payload: Partial<Despesa> = {
          ...form,
          unitId: selectedUnit.id,
          valor: Number(form.valor) || 0,
          categoria: form.categoria || 'Outras Despesas',
          descricao: form.descricao || uploadFile.name.replace(/\.[^.]+$/, ''),
          dataVencimento: form.dataVencimento || today(),
          status: 'pendente' as const,
          anexoUrl: base64,
          anexoNome: uploadFile.name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          criadoPor: (user as any)?.name || user?.email || 'sistema',
        };
        const res = await fetch(`${API}/despesas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setUploadFile(null);
        setUploadPreview('');
        setForm(EMPTY_FORM);
        await fetchDespesas();
        setActiveTab('lista');
        setUploadProcessing(false);
      };
      reader.readAsDataURL(uploadFile);
    } catch (e: any) {
      setError('Erro ao salvar com anexo: ' + e.message);
      setUploadProcessing(false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>
      <Header title="Despesas" />

      <main style={{ flex: 1, maxWidth: 1200, margin: '0 auto', padding: '24px 16px', width: '100%' }}>

        {/* ── Page Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#1a1a2e' }}>💸 Despesas</h1>
            <p style={{ margin: '4px 0 0', color: '#666', fontSize: 14 }}>
              Gestão de despesas operacionais — {selectedUnit?.nome || selectedUnit?.id || 'Selecione uma unidade'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { resetForm(); setActiveTab('upload'); }}
              style={{ padding: '10px 18px', background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              📷 Foto / NF
            </button>
            <button onClick={() => { resetForm(); setActiveTab('form'); }}
              style={{ padding: '10px 18px', background: '#c62828', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              ＋ Nova Despesa
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: '#ffebee', color: '#c62828', padding: '12px 16px', borderRadius: 8, marginBottom: 16, border: '1px solid #ef9a9a' }}>
            ⚠️ {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontWeight: 700 }}>✕</button>
          </div>
        )}

        {/* ── Summary Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total Geral',    value: totalGeral,    color: '#1a237e', icon: '📊' },
            { label: 'Pago',           value: totalPago,     color: '#1b5e20', icon: '✅' },
            { label: 'A Pagar',        value: totalPendente, color: '#e65100', icon: '⏳' },
            { label: 'Vencido',        value: totalVencido,  color: '#b71c1c', icon: '🚨' },
          ].map(card => (
            <div key={card.label} style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: `4px solid ${card.color}` }}>
              <div style={{ fontSize: 22 }}>{card.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.color, marginTop: 4 }}>{fmtCurrency(card.value)}</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{card.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '2px solid #e0e0e0' }}>
          {(['lista', 'form', 'upload'] as const).map(tab => (
            <button key={tab} onClick={() => { if (tab !== 'form') resetForm(); setActiveTab(tab); }}
              style={{
                padding: '10px 22px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                background: activeTab === tab ? '#fff' : 'transparent',
                color: activeTab === tab ? '#c62828' : '#666',
                borderBottom: activeTab === tab ? '2px solid #c62828' : '2px solid transparent',
                marginBottom: -2, borderRadius: '8px 8px 0 0',
              }}>
              {tab === 'lista' ? '📋 Lista' : tab === 'form' ? (editingId ? '✏️ Editar' : '➕ Formulário') : '📷 Upload / Foto'}
            </button>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: '0 0 12px 12px', padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>

          {/* ════════════════════ TAB: LISTA ════════════════════ */}
          {activeTab === 'lista' && (
            <>
              {/* Filters */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <input placeholder="🔍 Buscar…" value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }} />
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}>
                  <option value="todos">Todos os status</option>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
                <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}>
                  <option value="todas">Todas as categorias</option>
                  {CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filtroForma} onChange={e => setFiltroForma(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}>
                  <option value="todas">Todas as formas</option>
                  {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <input type="date" value={filtroPeriodoInicio} onChange={e => setFiltroPeriodoInicio(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }} />
                <input type="date" value={filtroPeriodoFim} onChange={e => setFiltroPeriodoFim(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }} />
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#666' }}>⏳ Carregando despesas…</div>
              ) : despesasFiltradas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>💸</div>
                  <div style={{ fontWeight: 600 }}>Nenhuma despesa encontrada</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Use "Nova Despesa" ou "Foto / NF" para registrar</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: '#f9f9f9' }}>
                        {['Vencimento', 'Fornecedor / Descrição', 'Categoria', 'Valor', 'Forma', 'Status', 'Ações'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', color: '#444', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {despesasFiltradas.map(d => {
                        const sc = STATUS_CONFIG[d.status] || STATUS_CONFIG.pendente;
                        return (
                          <tr key={d.id} style={{ borderBottom: '1px solid #f0f0f0', transition: 'background .15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}>
                            <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: d.status === 'vencido' ? '#b71c1c' : '#333' }}>
                              {fmtDate(d.dataVencimento)}
                              {d.dataPagamento && <div style={{ fontSize: 11, color: '#4caf50' }}>pago {fmtDate(d.dataPagamento)}</div>}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{d.fornecedorNome || '—'}</div>
                              <div style={{ fontSize: 12, color: '#666' }}>{d.descricao}</div>
                              {d.numeroNF && <div style={{ fontSize: 11, color: '#888' }}>NF {d.numeroNF}</div>}
                              {d.anexoUrl && <span style={{ fontSize: 11, color: '#7b1fa2', cursor: 'pointer' }} onClick={() => window.open(d.anexoUrl, '_blank')}>📎 {d.anexoNome || 'Anexo'}</span>}
                            </td>
                            <td style={{ padding: '10px 12px', color: '#555', fontSize: 13 }}>{d.categoria}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#c62828', whiteSpace: 'nowrap' }}>{fmtCurrency(d.valor)}</td>
                            <td style={{ padding: '10px 12px', color: '#555', fontSize: 13 }}>{d.formaPagamento || '—'}</td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 12, background: sc.bg, color: sc.color, fontWeight: 600, fontSize: 12 }}>
                                {sc.icon} {sc.label}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                {/* Quick status change */}
                                {d.status !== 'pago' && d.status !== 'cancelado' && (
                                  <button onClick={() => handleStatusChange(d.id, 'pago')}
                                    title="Marcar como Pago"
                                    style={{ padding: '4px 8px', background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                    ✅ Pagar
                                  </button>
                                )}
                                <button onClick={() => startEdit(d)} title="Editar"
                                  style={{ padding: '4px 8px', background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                                  ✏️
                                </button>
                                <button onClick={() => setViewingDespesa(d)} title="Detalhes"
                                  style={{ padding: '4px 8px', background: '#f3e5f5', color: '#7b1fa2', border: '1px solid #ce93d8', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                                  🔍
                                </button>
                                <button onClick={() => setDeleteConfirm(d.id)} title="Excluir"
                                  style={{ padding: '4px 8px', background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f5f5f5', fontWeight: 700 }}>
                        <td colSpan={3} style={{ padding: '10px 12px', textAlign: 'right' }}>Total filtrado:</td>
                        <td style={{ padding: '10px 12px', color: '#c62828' }}>
                          {fmtCurrency(despesasFiltradas.reduce((s, d) => s + d.valor, 0))}
                        </td>
                        <td colSpan={3} style={{ padding: '10px 12px', color: '#666', fontWeight: 400, fontSize: 13 }}>
                          {despesasFiltradas.length} registro(s) de {despesas.length} total
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ════════════════════ TAB: FORMULÁRIO ════════════════════ */}
          {activeTab === 'form' && (
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              <h3 style={{ margin: '0 0 20px', color: '#1a1a2e' }}>{editingId ? '✏️ Editar Despesa' : '➕ Nova Despesa'}</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                {/* Fornecedor */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Fornecedor <span style={{ color: '#999', fontSize: 12 }}>(opcional)</span></label>
                  <select value={form.fornecedorId || ''} onChange={e => handleFornecedorSelect(e.target.value)}
                    style={inputStyle}>
                    <option value="">— Sem fornecedor vinculado —</option>
                    {fornecedores.map(f => (
                      <option key={f.id} value={f.id}>{f.nomeFantasia || f.razaoSocial}</option>
                    ))}
                  </select>
                  {!form.fornecedorId && (
                    <input placeholder="Ou digite o nome do fornecedor manualmente"
                      value={form.fornecedorNome || ''}
                      onChange={e => handleFormChange('fornecedorNome', e.target.value)}
                      style={{ ...inputStyle, marginTop: 8 }} />
                  )}
                </div>

                {/* Categoria */}
                <div>
                  <label style={labelStyle}>Categoria *</label>
                  <select value={form.categoria || ''} onChange={e => handleFormChange('categoria', e.target.value)}
                    style={{ ...inputStyle, borderColor: formErrors.categoria ? '#c62828' : '#ddd' }}>
                    <option value="">Selecione a categoria</option>
                    {CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {formErrors.categoria && <span style={errorStyle}>{formErrors.categoria}</span>}
                </div>

                {/* Valor */}
                <div>
                  <label style={labelStyle}>Valor (R$) *</label>
                  <input type="number" min="0" step="0.01" placeholder="0,00"
                    value={form.valor || ''}
                    onChange={e => handleFormChange('valor', e.target.value)}
                    style={{ ...inputStyle, borderColor: formErrors.valor ? '#c62828' : '#ddd' }} />
                  {formErrors.valor && <span style={errorStyle}>{formErrors.valor}</span>}
                </div>

                {/* Descrição */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Descrição *</label>
                  <input placeholder="Descreva a despesa…"
                    value={form.descricao || ''}
                    onChange={e => handleFormChange('descricao', e.target.value)}
                    style={{ ...inputStyle, borderColor: formErrors.descricao ? '#c62828' : '#ddd' }} />
                  {formErrors.descricao && <span style={errorStyle}>{formErrors.descricao}</span>}
                </div>

                {/* NF */}
                <div>
                  <label style={labelStyle}>Número da NF</label>
                  <input placeholder="Ex: 001234"
                    value={form.numeroNF || ''}
                    onChange={e => handleFormChange('numeroNF', e.target.value)}
                    style={inputStyle} />
                </div>

                {/* Status */}
                <div>
                  <label style={labelStyle}>Status *</label>
                  <select value={form.status || 'pendente'} onChange={e => handleFormChange('status', e.target.value)}
                    style={inputStyle}>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>

                {/* Data emissão */}
                <div>
                  <label style={labelStyle}>Data de Emissão</label>
                  <input type="date"
                    value={form.dataEmissao || ''}
                    onChange={e => handleFormChange('dataEmissao', e.target.value)}
                    style={inputStyle} />
                </div>

                {/* Data vencimento */}
                <div>
                  <label style={labelStyle}>Data de Vencimento *</label>
                  <input type="date"
                    value={form.dataVencimento || ''}
                    onChange={e => handleFormChange('dataVencimento', e.target.value)}
                    style={{ ...inputStyle, borderColor: formErrors.dataVencimento ? '#c62828' : '#ddd' }} />
                  {formErrors.dataVencimento && <span style={errorStyle}>{formErrors.dataVencimento}</span>}
                </div>

                {/* Forma pagamento */}
                <div>
                  <label style={labelStyle}>Forma de Pagamento</label>
                  <select value={form.formaPagamento || ''} onChange={e => handleFormChange('formaPagamento', e.target.value)}
                    style={inputStyle}>
                    <option value="">Selecione…</option>
                    {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>

                {/* Data pagamento */}
                <div>
                  <label style={labelStyle}>Data de Pagamento {form.status === 'pago' && '*'}</label>
                  <input type="date"
                    value={form.dataPagamento || ''}
                    onChange={e => handleFormChange('dataPagamento', e.target.value)}
                    style={{ ...inputStyle, borderColor: formErrors.dataPagamento ? '#c62828' : '#ddd' }} />
                  {formErrors.dataPagamento && <span style={errorStyle}>{formErrors.dataPagamento}</span>}
                </div>

                {/* Link Conciliação */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>
                    🏦 ID Transação Bancária <span style={{ color: '#999', fontSize: 12 }}>(vínculo com Conciliação Bancária)</span>
                  </label>
                  <input placeholder="Ex: txn-1714588800000 (preenchido automaticamente pela conciliação)"
                    value={form.transacaoBancariaId || ''}
                    onChange={e => handleFormChange('transacaoBancariaId', e.target.value)}
                    style={inputStyle} />
                </div>

                {/* Anexo */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Anexo / NF <span style={{ color: '#999', fontSize: 12 }}>(imagem ou PDF)</span></label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
                      onChange={handleFileChange} style={{ display: 'none' }} />
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
                      onChange={handleFileChange} style={{ display: 'none' }} />
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      style={{ padding: '8px 14px', background: '#f3e5f5', color: '#7b1fa2', border: '1px solid #ce93d8', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                      📁 Selecionar arquivo
                    </button>
                    <button type="button" onClick={() => cameraInputRef.current?.click()}
                      style={{ padding: '8px 14px', background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                      📷 Tirar foto
                    </button>
                    {uploadFile && (
                      <button type="button" onClick={handleUploadAnexo} disabled={uploadProcessing}
                        style={{ padding: '8px 14px', background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                        {uploadProcessing ? '⏳ Processando…' : '⬆️ Anexar'}
                      </button>
                    )}
                    {form.anexoUrl && (
                      <span style={{ fontSize: 13, color: '#7b1fa2', cursor: 'pointer' }}
                        onClick={() => window.open(form.anexoUrl, '_blank')}>
                        📎 {form.anexoNome || 'Ver anexo'}
                      </span>
                    )}
                  </div>
                  {uploadPreview && (
                    <img src={uploadPreview} alt="Preview" style={{ marginTop: 10, maxHeight: 160, borderRadius: 8, border: '1px solid #ddd' }} />
                  )}
                  {uploadFile && !uploadPreview && (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>📄 {uploadFile.name}</div>
                  )}
                </div>

                {/* Observações */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Observações</label>
                  <textarea rows={3} placeholder="Observações adicionais…"
                    value={form.observacoes || ''}
                    onChange={e => handleFormChange('observacoes', e.target.value)}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                <button onClick={() => { resetForm(); setActiveTab('lista'); }}
                  style={{ padding: '10px 24px', background: '#f5f5f5', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '10px 28px', background: saving ? '#ccc' : '#c62828', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'default' : 'pointer', fontWeight: 600, fontSize: 15 }}>
                  {saving ? '⏳ Salvando…' : editingId ? '💾 Salvar Alterações' : '✅ Criar Despesa'}
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════ TAB: UPLOAD / FOTO ════════════════════ */}
          {activeTab === 'upload' && (
            <div style={{ maxWidth: 680, margin: '0 auto' }}>
              <h3 style={{ margin: '0 0 6px', color: '#1a1a2e' }}>📷 Registrar Despesa via Foto ou NF</h3>
              <p style={{ color: '#666', fontSize: 14, marginTop: 0, marginBottom: 24 }}>
                Tire uma foto do pedido / nota fiscal ou selecione um arquivo PDF. Preencha os campos básicos e salve.
              </p>

              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #ce93d8', borderRadius: 12, padding: '40px 20px', textAlign: 'center',
                  cursor: 'pointer', background: '#fdf5ff', marginBottom: 20, transition: 'border-color .2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#7b1fa2')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#ce93d8')}>
                <div style={{ fontSize: 40 }}>📄</div>
                <div style={{ fontWeight: 600, color: '#7b1fa2', marginTop: 8 }}>Clique para selecionar arquivo</div>
                <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>PDF, JPG, PNG até 2MB</div>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
                  onChange={handleFileChange} style={{ display: 'none' }} />
              </div>

              {/* Camera button */}
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <span style={{ color: '#999', fontSize: 13 }}>— ou —</span>
                <br />
                <button type="button" onClick={() => cameraInputRef.current?.click()}
                  style={{ marginTop: 10, padding: '12px 28px', background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
                  📷 Abrir câmera
                </button>
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
                  onChange={handleFileChange} style={{ display: 'none' }} />
              </div>

              {/* Preview */}
              {uploadPreview && (
                <div style={{ marginBottom: 20, textAlign: 'center' }}>
                  <img src={uploadPreview} alt="Preview NF" style={{ maxHeight: 220, borderRadius: 10, border: '1px solid #ce93d8', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                </div>
              )}
              {uploadFile && !uploadPreview && (
                <div style={{ padding: '12px 16px', background: '#f3e5f5', borderRadius: 8, marginBottom: 20, fontSize: 14, color: '#7b1fa2' }}>
                  📄 {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                </div>
              )}

              {/* Quick fields */}
              {uploadFile && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Fornecedor</label>
                    <select value={form.fornecedorId || ''} onChange={e => handleFornecedorSelect(e.target.value)}
                      style={inputStyle}>
                      <option value="">— Sem fornecedor vinculado —</option>
                      {fornecedores.map(f => (
                        <option key={f.id} value={f.id}>{f.nomeFantasia || f.razaoSocial}</option>
                      ))}
                    </select>
                    {!form.fornecedorId && (
                      <input placeholder="Ou nome do fornecedor"
                        value={form.fornecedorNome || ''}
                        onChange={e => handleFormChange('fornecedorNome', e.target.value)}
                        style={{ ...inputStyle, marginTop: 8 }} />
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Categoria</label>
                    <select value={form.categoria || ''} onChange={e => handleFormChange('categoria', e.target.value)}
                      style={inputStyle}>
                      <option value="">Selecione…</option>
                      {CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Valor (R$)</label>
                    <input type="number" min="0" step="0.01" placeholder="0,00"
                      value={form.valor || ''}
                      onChange={e => handleFormChange('valor', e.target.value)}
                      style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Descrição</label>
                    <input placeholder="Descreva a despesa…"
                      value={form.descricao || ''}
                      onChange={e => handleFormChange('descricao', e.target.value)}
                      style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Nº NF</label>
                    <input placeholder="001234"
                      value={form.numeroNF || ''}
                      onChange={e => handleFormChange('numeroNF', e.target.value)}
                      style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Vencimento</label>
                    <input type="date"
                      value={form.dataVencimento || today()}
                      onChange={e => handleFormChange('dataVencimento', e.target.value)}
                      style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Forma de Pagamento</label>
                    <select value={form.formaPagamento || ''} onChange={e => handleFormChange('formaPagamento', e.target.value)}
                      style={inputStyle}>
                      <option value="">Selecione…</option>
                      {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select value={form.status || 'pendente'} onChange={e => handleFormChange('status', e.target.value as Despesa['status'])}
                      style={inputStyle}>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                    </select>
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                    <button onClick={() => { setUploadFile(null); setUploadPreview(''); setForm(EMPTY_FORM); }}
                      style={{ padding: '10px 20px', background: '#f5f5f5', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                      Limpar
                    </button>
                    <button onClick={handleUploadAndCreate} disabled={uploadProcessing}
                      style={{ padding: '10px 28px', background: uploadProcessing ? '#ccc' : '#7b1fa2', color: '#fff', border: 'none', borderRadius: 8, cursor: uploadProcessing ? 'default' : 'pointer', fontWeight: 600, fontSize: 15 }}>
                      {uploadProcessing ? '⏳ Salvando…' : '💾 Salvar com Anexo'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>{/* end white card */}
      </main>

      {/* ════════════════════ MODAL: DETALHES ════════════════════ */}
      {viewingDespesa && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setViewingDespesa(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: '#1a1a2e' }}>🔍 Detalhes da Despesa</h3>
              <button onClick={() => setViewingDespesa(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}>✕</button>
            </div>

            {(() => {
              const d = viewingDespesa;
              const sc = STATUS_CONFIG[d.status];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <DetailRow label="Fornecedor" value={d.fornecedorNome || '—'} />
                  <DetailRow label="Categoria" value={d.categoria} />
                  <DetailRow label="Descrição" value={d.descricao} />
                  <DetailRow label="Valor" value={fmtCurrency(d.valor)} bold />
                  <DetailRow label="Nº NF" value={d.numeroNF || '—'} />
                  <DetailRow label="Emissão" value={fmtDate(d.dataEmissao)} />
                  <DetailRow label="Vencimento" value={fmtDate(d.dataVencimento)} />
                  <DetailRow label="Pagamento" value={fmtDate(d.dataPagamento)} />
                  <DetailRow label="Forma" value={d.formaPagamento || '—'} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: '#666', fontSize: 13, minWidth: 140 }}>Status:</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 12, background: sc.bg, color: sc.color, fontWeight: 600, fontSize: 13 }}>
                      {sc.icon} {sc.label}
                    </span>
                  </div>
                  {d.transacaoBancariaId && <DetailRow label="ID Conciliação" value={d.transacaoBancariaId} />}
                  {d.observacoes && <DetailRow label="Observações" value={d.observacoes} />}
                  {d.anexoUrl && (
                    <div>
                      <span style={{ color: '#666', fontSize: 13, display: 'block', marginBottom: 6 }}>Anexo:</span>
                      {d.anexoUrl.startsWith('data:image') ? (
                        <img src={d.anexoUrl} alt="NF" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #ddd' }} />
                      ) : (
                        <a href={d.anexoUrl} target="_blank" rel="noreferrer"
                          style={{ color: '#7b1fa2', fontWeight: 600 }}>📎 {d.anexoNome || 'Abrir anexo'}</a>
                      )}
                    </div>
                  )}
                  <DetailRow label="Criado em" value={d.createdAt ? fmtDate(d.createdAt) : '—'} />
                  <DetailRow label="Criado por" value={d.criadoPor || '—'} />

                  <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setViewingDespesa(null); startEdit(d); }}
                      style={{ padding: '8px 20px', background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                      ✏️ Editar
                    </button>
                    <button onClick={() => setViewingDespesa(null)}
                      style={{ padding: '8px 20px', background: '#f5f5f5', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
                      Fechar
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════ MODAL: CONFIRMAÇÃO DELETE ════════════════════ */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%' }}>
            <h3 style={{ margin: '0 0 12px', color: '#c62828' }}>⚠️ Confirmar Exclusão</h3>
            <p style={{ color: '#555', marginBottom: 24 }}>Tem certeza que deseja excluir esta despesa? Essa ação não pode ser desfeita.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ padding: '10px 20px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={saving}
                style={{ padding: '10px 20px', background: '#c62828', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {saving ? '⏳…' : '🗑️ Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ color: '#666', fontSize: 13, minWidth: 140, flexShrink: 0 }}>{label}:</span>
      <span style={{ color: '#1a1a2e', fontSize: 14, fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: 8,
  fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 5, fontWeight: 600, fontSize: 13, color: '#444',
};
const errorStyle: React.CSSProperties = {
  color: '#c62828', fontSize: 12, marginTop: 3, display: 'block',
};

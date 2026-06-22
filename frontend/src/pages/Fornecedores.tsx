import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchAuth } from '../utils/fetchAuth';


/* ═══════════════════════════════════════════════════════════════════════════
   CADASTRO DE FORNECEDORES
   Campos: razão social, nome fantasia, CNPJ/CPF, categoria, contato,
           email, telefone, endereço, banco, forma de pagamento preferida,
           prazo de pagamento, observações, status ativo/inativo
═══════════════════════════════════════════════════════════════════════════ */

interface Fornecedor {
  id: string;
  razaoSocial: string;
  nomeFantasia?: string;
  cnpjCpf: string;
  categoria: string;
  contato?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  tipoConta?: string;
  pixChave?: string;
  pixTipo?: string;
  formaPagamentoPref?: string;
  prazoPagamento?: number;      // dias
  observacoes?: string;
  ativo: boolean;
  unitId: string;
  createdAt?: string;
  updatedAt?: string;
}

const CATEGORIAS_FORNECEDOR = [
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
  'Energia / Utilities',
  'Outros',
];

const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Dinheiro', 'Cheque'];
const TIPOS_PIX = ['CPF', 'CNPJ', 'E-mail', 'Telefone', 'Chave aleatória'];
const TIPOS_CONTA = ['Corrente', 'Poupança', 'Pagamento'];

const fmtCnpj = (v: string) => {
  const d = v.replace(/\D/g, '');
  if (d.length <= 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
};

const EMPTY_FORM: Partial<Fornecedor> = {
  razaoSocial: '', nomeFantasia: '', cnpjCpf: '', categoria: '',
  contato: '', email: '', telefone: '', endereco: '',
  banco: '', agencia: '', conta: '', tipoConta: 'Corrente',
  pixChave: '', pixTipo: 'PIX', formaPagamentoPref: 'PIX',
  prazoPagamento: 30, observacoes: '', ativo: true,
};

const Fornecedores: React.FC = () => {
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
  const authToken = localStorage.getItem('auth_token') || '';

  const [lista, setLista] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<'lista' | 'form'>('lista');
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [form, setForm] = useState<Partial<Fornecedor>>(EMPTY_FORM);
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativo' | 'inativo'>('ativo');
  const [msg, setMsg] = useState<{ texto: string; tipo: 'ok' | 'erro' } | null>(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` };

  // ── Carregar ──────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const res = await fetchAuth(`${apiUrl}/fornecedores?unitId=${unitId}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (res.ok) {
        const data = await res.json();
        setLista(Array.isArray(data) ? data : []);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [apiUrl, authToken, unitId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Filtros ───────────────────────────────────────────────────────────
  const listaFiltrada = lista.filter(f => {
    if (filtroAtivo === 'ativo' && !f.ativo) return false;
    if (filtroAtivo === 'inativo' && f.ativo) return false;
    if (filtroCategoria && f.categoria !== filtroCategoria) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (
        !f.razaoSocial.toLowerCase().includes(q) &&
        !(f.nomeFantasia || '').toLowerCase().includes(q) &&
        !(f.cnpjCpf || '').includes(q) &&
        !(f.categoria || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  // ── Abrir form ────────────────────────────────────────────────────────
  const abrirNovo = () => {
    setForm({ ...EMPTY_FORM, unitId });
    setEditando(null);
    setAba('form');
    setMsg(null);
  };

  const abrirEditar = (f: Fornecedor) => {
    setForm({ ...f });
    setEditando(f);
    setAba('form');
    setMsg(null);
  };

  const cancelar = () => {
    setAba('lista');
    setForm(EMPTY_FORM);
    setEditando(null);
    setMsg(null);
  };

  // ── Salvar ────────────────────────────────────────────────────────────
  const salvar = async () => {
    if (!form.razaoSocial?.trim()) { setMsg({ texto: 'Razão social é obrigatória.', tipo: 'erro' }); return; }
    if (!form.cnpjCpf?.trim()) { setMsg({ texto: 'CNPJ/CPF é obrigatório.', tipo: 'erro' }); return; }
    if (!form.categoria) { setMsg({ texto: 'Selecione uma categoria.', tipo: 'erro' }); return; }

    setSalvando(true);
    setMsg(null);
    try {
      const payload = { ...form, unitId, responsavel: (user as any)?.email || '' };
      const url = editando ? `${apiUrl}/fornecedores/${editando.id}` : `${apiUrl}/fornecedores`;
      const method = editando ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });

      if (res.ok) {
        setMsg({ texto: `✅ Fornecedor ${editando ? 'atualizado' : 'cadastrado'} com sucesso!`, tipo: 'ok' });
        await carregar();
        setTimeout(() => { setAba('lista'); setMsg(null); }, 1200);
      } else {
        const err = await res.json().catch(() => ({}));
        setMsg({ texto: `Erro: ${err.error || res.status}`, tipo: 'erro' });
      }
    } catch (err) {
      setMsg({ texto: 'Erro de conexão ao salvar.', tipo: 'erro' });
    }
    setSalvando(false);
  };

  // ── Ativar/Desativar ──────────────────────────────────────────────────
  const toggleAtivo = async (f: Fornecedor) => {
    try {
      const res = await fetchAuth(`${apiUrl}/fornecedores/${f.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...f, ativo: !f.ativo }),
      });
      if (res.ok) carregar();
    } catch (err) { console.error(err); }
  };

  const deletar = async (f: Fornecedor) => {
    if (!window.confirm(`Excluir fornecedor "${f.razaoSocial}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await fetchAuth(`${apiUrl}/fornecedores/${f.id}`, { method: 'DELETE', headers });
      if (res.ok) carregar();
    } catch (err) { console.error(err); }
  };

  // ── Field helper ──────────────────────────────────────────────────────
  const F = (field: keyof Fornecedor) => ({
    value: (form[field] ?? '') as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [field]: e.target.value })),
  });

  // ── Styles ────────────────────────────────────────────────────────────
  const s = {
    card: { background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,.08)', border: '1px solid #e8ecf0' } as React.CSSProperties,
    label: { display: 'block', fontSize: '12px', fontWeight: 700, color: '#555', marginBottom: '4px' } as React.CSSProperties,
    input: { padding: '9px 11px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' as const },
    btn: (bg: string, col = '#fff'): React.CSSProperties => ({ padding: '9px 18px', background: bg, color: col, border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' as const }),
    th: { padding: '10px 12px', background: '#0f172a', color: '#fff', textAlign: 'left' as const, fontSize: '11px', whiteSpace: 'nowrap' as const },
    td: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const },
    grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' } as React.CSSProperties,
    grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' } as React.CSSProperties,
    section: { marginBottom: '20px', paddingBottom: '18px', borderBottom: '1px solid #f0f4f8' } as React.CSSProperties,
    sectionTitle: { fontSize: '13px', fontWeight: 700, color: '#1565c0', textTransform: 'uppercase' as const, letterSpacing: '.04em', marginBottom: '12px' } as React.CSSProperties,
  };

  const catCores: Record<string, string> = {
    'Alimentação / Matéria-prima': '#e8f5e9',
    'Bebidas': '#e3f2fd',
    'Descartáveis / Embalagens': '#fff3e0',
    'Manutenção / Serviços': '#fce4ec',
    'Outros': '#f5f5f5',
  };
  const catCor = (cat: string) => catCores[cat] || '#f3e5f5';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f4f6f9', display: 'flex', flexDirection: 'column' }}>
      <Header title="🏪 Cadastro de Fornecedores" showBack={true} />

      <div style={{ flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '20px' }}>

        {/* ── Abas ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
          {(['lista', 'form'] as const).map(a => (
            <button key={a} onClick={() => a === 'lista' ? cancelar() : abrirNovo()}
              style={{ ...s.btn(aba === a ? '#1565c0' : '#e0e0e0', aba === a ? '#fff' : '#333') }}>
              {a === 'lista' ? '📋 Lista de Fornecedores' : '➕ Novo Fornecedor'}
            </button>
          ))}
          {aba === 'lista' && (
            <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#888' }}>
              {lista.filter(f => f.ativo).length} ativos · {lista.filter(f => !f.ativo).length} inativos
            </div>
          )}
        </div>

        {/* ════════ ABA LISTA ════════ */}
        {aba === 'lista' && (
          <>
            {/* Filtros */}
            <div style={{ ...s.card, marginBottom: '14px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={s.label}>Buscar</label>
                <input type="text" placeholder="Razão social, CNPJ, categoria..." value={busca} onChange={e => setBusca(e.target.value)} style={s.input} />
              </div>
              <div style={{ minWidth: '200px' }}>
                <label style={s.label}>Categoria</label>
                <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{ ...s.input, width: 'auto' }}>
                  <option value="">Todas</option>
                  {CATEGORIAS_FORNECEDOR.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Status</label>
                <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value as any)} style={{ ...s.input, width: 'auto' }}>
                  <option value="ativo">Ativos</option>
                  <option value="inativo">Inativos</option>
                  <option value="todos">Todos</option>
                </select>
              </div>
            </div>

            {/* Tabela */}
            <div style={{ ...s.card, overflowX: 'auto' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#1f2937' }}>
                {loading ? '⏳ Carregando...' : `${listaFiltrada.length} fornecedor(es)`}
              </h3>
              {listaFiltrada.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px', color: '#aaa' }}>
                  <div style={{ fontSize: '36px', marginBottom: '10px' }}>🏪</div>
                  <p style={{ margin: 0 }}>Nenhum fornecedor cadastrado ainda.</p>
                  <button onClick={abrirNovo} style={{ ...s.btn('#1565c0'), marginTop: '16px' }}>➕ Cadastrar primeiro fornecedor</button>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                  <thead>
                    <tr>
                      {['Razão Social / Nome Fantasia', 'CNPJ/CPF', 'Categoria', 'Contato', 'PIX / Banco', 'Prazo', 'Status', 'Ações'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listaFiltrada.map((f, idx) => (
                      <tr key={f.id} style={{ background: idx % 2 === 0 ? '#fafafa' : '#fff' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fafafa' : '#fff')}>
                        <td style={s.td}>
                          <div style={{ fontWeight: 700, color: '#1f2937' }}>{f.razaoSocial}</div>
                          {f.nomeFantasia && <div style={{ fontSize: '11px', color: '#607d8b' }}>{f.nomeFantasia}</div>}
                        </td>
                        <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '11px' }}>{fmtCnpj(f.cnpjCpf)}</td>
                        <td style={s.td}>
                          <span style={{ background: catCor(f.categoria), padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                            {f.categoria}
                          </span>
                        </td>
                        <td style={s.td}>
                          {f.contato && <div style={{ fontSize: '12px' }}>{f.contato}</div>}
                          {f.telefone && <div style={{ fontSize: '11px', color: '#607d8b' }}>📞 {f.telefone}</div>}
                          {f.email && <div style={{ fontSize: '11px', color: '#1565c0' }}>✉ {f.email}</div>}
                        </td>
                        <td style={s.td}>
                          {f.pixChave && <div style={{ fontSize: '11px', color: '#1565c0' }}>🔑 {f.pixChave}</div>}
                          {f.banco && <div style={{ fontSize: '11px', color: '#607d8b' }}>🏦 {f.banco}{f.agencia ? ` / Ag.${f.agencia}` : ''}{f.conta ? ` / Cc.${f.conta}` : ''}</div>}
                          {!f.pixChave && !f.banco && <span style={{ color: '#bbb' }}>—</span>}
                        </td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          {f.prazoPagamento ? `${f.prazoPagamento}d` : '—'}
                        </td>
                        <td style={s.td}>
                          <span style={{
                            background: f.ativo ? '#e8f5e9' : '#ffebee',
                            color: f.ativo ? '#2e7d32' : '#c62828',
                            padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                          }}>
                            {f.ativo ? '✅ Ativo' : '❌ Inativo'}
                          </span>
                        </td>
                        <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                          <button onClick={() => abrirEditar(f)} style={{ ...s.btn('#1565c0'), padding: '4px 8px', fontSize: '11px', marginRight: '4px' }}>✏️</button>
                          <button onClick={() => toggleAtivo(f)} style={{ ...s.btn(f.ativo ? '#e65100' : '#2e7d32'), padding: '4px 8px', fontSize: '11px', marginRight: '4px' }}>
                            {f.ativo ? '🔕' : '✅'}
                          </button>
                          <button onClick={() => deletar(f)} style={{ ...s.btn('#c62828'), padding: '4px 8px', fontSize: '11px' }}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ════════ ABA FORMULÁRIO ════════ */}
        {aba === 'form' && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#1f2937' }}>
                {editando ? '✏️ Editar Fornecedor' : '➕ Novo Fornecedor'}
              </h2>
              <button onClick={cancelar} style={s.btn('#9e9e9e')}>✕ Cancelar</button>
            </div>

            {msg && (
              <div style={{ padding: '12px 14px', borderRadius: '7px', marginBottom: '16px', fontSize: '13px', fontWeight: 600,
                background: msg.tipo === 'ok' ? '#e8f5e9' : '#ffebee',
                color: msg.tipo === 'ok' ? '#2e7d32' : '#c62828' }}>
                {msg.texto}
              </div>
            )}

            {/* ── Identificação ── */}
            <div style={s.section}>
              <div style={s.sectionTitle}>📋 Identificação</div>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Razão Social *</label>
                  <input {...F('razaoSocial')} placeholder="Nome jurídico completo" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Nome Fantasia</label>
                  <input {...F('nomeFantasia')} placeholder="Nome comercial (opcional)" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>CNPJ / CPF *</label>
                  <input {...F('cnpjCpf')} placeholder="00.000.000/0001-00 ou 000.000.000-00" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Categoria *</label>
                  <select {...F('categoria')} style={s.input}>
                    <option value="">Selecione...</option>
                    {CATEGORIAS_FORNECEDOR.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Contato ── */}
            <div style={s.section}>
              <div style={s.sectionTitle}>📞 Contato</div>
              <div style={s.grid3}>
                <div>
                  <label style={s.label}>Nome do Contato</label>
                  <input {...F('contato')} placeholder="Nome do responsável" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Telefone / WhatsApp</label>
                  <input {...F('telefone')} placeholder="(11) 99999-9999" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>E-mail</label>
                  <input type="email" {...F('email')} placeholder="email@fornecedor.com.br" style={s.input} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={s.label}>Endereço</label>
                  <input {...F('endereco')} placeholder="Rua, número, bairro, cidade/UF" style={s.input} />
                </div>
              </div>
            </div>

            {/* ── Dados bancários ── */}
            <div style={s.section}>
              <div style={s.sectionTitle}>🏦 Dados Bancários e Pagamento</div>
              <div style={s.grid3}>
                <div>
                  <label style={s.label}>Forma de Pagamento Preferida</label>
                  <select {...F('formaPagamentoPref')} style={s.input}>
                    {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Prazo de Pagamento (dias)</label>
                  <input type="number" min="0" max="365"
                    value={form.prazoPagamento ?? 30}
                    onChange={e => setForm(p => ({ ...p, prazoPagamento: parseInt(e.target.value) || 0 }))}
                    style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Tipo da Chave PIX</label>
                  <select {...F('pixTipo')} style={s.input}>
                    {TIPOS_PIX.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Chave PIX</label>
                  <input {...F('pixChave')} placeholder="Chave PIX do fornecedor" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Banco</label>
                  <input {...F('banco')} placeholder="Ex: Bradesco, Itaú, Stone..." style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Agência</label>
                  <input {...F('agencia')} placeholder="0000" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Conta</label>
                  <input {...F('conta')} placeholder="00000-0" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Tipo de Conta</label>
                  <select {...F('tipoConta')} style={s.input}>
                    {TIPOS_CONTA.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Observações e status ── */}
            <div style={{ marginBottom: '20px' }}>
              <div style={s.sectionTitle}>📝 Observações</div>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Observações</label>
                  <textarea {...F('observacoes')} rows={3} placeholder="Informações adicionais, condições especiais, etc."
                    style={{ ...s.input, resize: 'vertical' as const }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={s.label}>Status</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[true, false].map(v => (
                      <button key={String(v)} type="button"
                        onClick={() => setForm(p => ({ ...p, ativo: v }))}
                        style={{
                          padding: '10px 20px', borderRadius: '7px', border: '2px solid',
                          cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                          borderColor: form.ativo === v ? (v ? '#2e7d32' : '#c62828') : '#ddd',
                          background: form.ativo === v ? (v ? '#e8f5e9' : '#ffebee') : '#fff',
                          color: form.ativo === v ? (v ? '#2e7d32' : '#c62828') : '#888',
                        }}>
                        {v ? '✅ Ativo' : '❌ Inativo'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={cancelar} style={s.btn('#9e9e9e')}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={s.btn(salvando ? '#aaa' : '#1565c0')}>
                {salvando ? '⏳ Salvando...' : `💾 ${editando ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}`}
              </button>
            </div>
          </div>
        )}
      </div>
      <Footer showLinks={false} />
    </div>
  );
};

export default Fornecedores;

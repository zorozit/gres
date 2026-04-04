import React, { useState, useEffect } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';

interface Motoboy {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  placa?: string;
  dataAdmissao?: string;
  dataDemissao?: string;
  comissao?: number;
  chavePix?: string;
  unitId?: string;
  vinculo: 'CLT' | 'Freelancer';
  ativo: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const emptyForm: Partial<Motoboy> = {
  nome: '',
  cpf: '',
  telefone: '',
  placa: '',
  dataAdmissao: new Date().toISOString().split('T')[0],
  dataDemissao: '',
  comissao: 0,
  chavePix: '',
  vinculo: 'Freelancer',
  ativo: true,
};

const VINCULOS = ['CLT', 'Freelancer'] as const;

export const Motoboys: React.FC = () => {
  const { activeUnit } = useUnit();

  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || '';

  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [loading, setLoading] = useState(false);
  const [abaSelecionada, setAbaSelecionada] = useState<'lista' | 'novo'>('lista');
  const [formData, setFormData] = useState<Partial<Motoboy>>({ ...emptyForm, unitId });
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [filtroVinculo, setFiltroVinculo] = useState<'Todos' | 'CLT' | 'Freelancer'>('Todos');
  const [filtroAtivo, setFiltroAtivo] = useState<'Todos' | 'Ativo' | 'Inativo'>('Ativo');
  const [busca, setBusca] = useState('');

  useEffect(() => { fetchMotoboys(); }, [unitId]);

  const fetchMotoboys = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const url = unitId ? `${apiUrl}/motoboys?unitId=${unitId}` : `${apiUrl}/motoboys`;
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await response.json();
      setMotoboys(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao buscar motoboys:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.cpf || !formData.telefone) {
      alert('Nome, CPF e Telefone são obrigatórios.');
      return;
    }
    try {
      const token = localStorage.getItem('auth_token');
      const isEdit = !!editandoId;
      const url = isEdit ? `${apiUrl}/motoboys/${editandoId}` : `${apiUrl}/motoboys`;
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...formData, unitId }),
      });

      if (response.ok) {
        alert(isEdit ? 'Motoboy atualizado com sucesso!' : 'Motoboy cadastrado com sucesso!');
        resetForm();
        setAbaSelecionada('lista');
        fetchMotoboys();
      } else {
        const err = await response.json().catch(() => ({}));
        alert('Erro ao salvar: ' + (err.error || response.status));
      }
    } catch (error) {
      console.error('Erro ao salvar motoboy:', error);
      alert('Erro ao salvar motoboy');
    }
  };

  const handleEditar = (moto: Motoboy) => {
    setFormData({ ...moto });
    setEditandoId(moto.id);
    setAbaSelecionada('novo');
  };

  const handleDeletar = async (id: string, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir ${nome}?`)) return;
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/motoboys/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        alert('Motoboy excluído com sucesso!');
        fetchMotoboys();
      } else {
        alert('Erro ao excluir motoboy');
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir motoboy');
    }
  };

  const handleToggleAtivo = async (moto: Motoboy) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/motoboys/${moto.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...moto, ativo: !moto.ativo }),
      });
      if (response.ok) { fetchMotoboys(); }
      else { alert('Erro ao atualizar status'); }
    } catch (error) { alert('Erro ao atualizar status'); }
  };

  const resetForm = () => {
    setFormData({ ...emptyForm, unitId });
    setEditandoId(null);
  };

  const exportarXLSX = () => {
    const dados = motoboysFiltrados.map(m => ({
      'Nome': m.nome, 'CPF': m.cpf, 'Telefone': m.telefone,
      'Placa': m.placa || '-', 'Vínculo': m.vinculo,
      'Comissão (%)': m.comissao ?? 0, 'Chave PIX': m.chavePix || '-',
      'Admissão': m.dataAdmissao || '-', 'Demissão': m.dataDemissao || '-',
      'Ativo': m.ativo ? 'Sim' : 'Não',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Motoboys');
    XLSX.writeFile(wb, `motoboys-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Filtros
  const motoboysFiltrados = motoboys.filter(m => {
    if (filtroVinculo !== 'Todos' && m.vinculo !== filtroVinculo) return false;
    if (filtroAtivo === 'Ativo'   && !m.ativo) return false;
    if (filtroAtivo === 'Inativo' && m.ativo)  return false;
    if (busca && !m.nome.toLowerCase().includes(busca.toLowerCase()) &&
        !m.cpf.includes(busca) && !(m.telefone || '').includes(busca)) return false;
    return true;
  });

  const cltCount       = motoboys.filter(m => m.vinculo === 'CLT' && m.ativo).length;
  const freelancerCount = motoboys.filter(m => m.vinculo === 'Freelancer' && m.ativo).length;

  const s = {
    tab: (active: boolean) => ({
      padding: '10px 20px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
      borderRadius: '4px 4px 0 0',
      backgroundColor: active ? '#1976d2' : '#e0e0e0',
      color: active ? 'white' : '#333',
    }),
    card: { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' },
    label: { fontSize: '13px', fontWeight: 'bold' as const, marginBottom: '4px', color: '#444', display: 'block' },
    input: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    select: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    btnPrimary: { padding: '10px 20px', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: '#1976d2', color: 'white' },
    btnSuccess: { padding: '10px 20px', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: '#43a047', color: 'white' },
    btnDanger:  { padding: '10px 20px', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: '#e53935', color: 'white' },
    btnSecondary: { padding: '10px 20px', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: '#9e9e9e', color: 'white' },
    th: { backgroundColor: '#1565c0', color: 'white', padding: '10px 8px', textAlign: 'left' as const, fontWeight: 'bold' as const, whiteSpace: 'nowrap' as const },
    td: { padding: '10px 8px', borderBottom: '1px solid #f0f0f0', fontSize: '13px', verticalAlign: 'middle' as const },
    badge: (bg: string, text: string) => ({ backgroundColor: bg, color: text, padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' as const, whiteSpace: 'nowrap' as const }),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="🏍️ Gestão de Motoboys" showBack={true} />

      <div style={{ flex: 1, padding: '20px', maxWidth: '1300px', margin: '0 auto', width: '100%' }}>

        {/* Resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '24px' }}>
          <div style={{ ...s.card, borderLeft: '4px solid #1976d2' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Total ativo</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1976d2' }}>{motoboys.filter(m => m.ativo).length}</div>
          </div>
          <div style={{ ...s.card, borderLeft: '4px solid #43a047' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>CLT ativos</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#43a047' }}>{cltCount}</div>
          </div>
          <div style={{ ...s.card, borderLeft: '4px solid #fb8c00' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Freelancers ativos</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#fb8c00' }}>{freelancerCount}</div>
          </div>
          <div style={{ ...s.card, borderLeft: '4px solid #9e9e9e' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Inativos</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#9e9e9e' }}>{motoboys.filter(m => !m.ativo).length}</div>
          </div>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '0', borderBottom: '2px solid #e0e0e0' }}>
          <button style={s.tab(abaSelecionada === 'lista')} onClick={() => { setAbaSelecionada('lista'); resetForm(); }}>
            📋 Lista de Motoboys
          </button>
          <button style={s.tab(abaSelecionada === 'novo')} onClick={() => { setAbaSelecionada('novo'); }}>
            {editandoId ? '✏️ Editar Motoboy' : '➕ Novo Motoboy'}
          </button>
        </div>

        {/* ABA LISTA */}
        {abaSelecionada === 'lista' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px' }}>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'flex-end' }}>
              <div>
                <label style={s.label}>Buscar:</label>
                <input type="text" placeholder="Nome, CPF ou telefone..." value={busca} onChange={e => setBusca(e.target.value)}
                  style={{ ...s.input, width: '220px' }} />
              </div>
              <div>
                <label style={s.label}>Vínculo:</label>
                <select value={filtroVinculo} onChange={e => setFiltroVinculo(e.target.value as any)} style={{ ...s.select, width: '150px' }}>
                  <option value="Todos">Todos</option>
                  <option value="CLT">CLT</option>
                  <option value="Freelancer">Freelancer</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Status:</label>
                <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
                  <option value="Todos">Todos</option>
                  <option value="Ativo">Ativos</option>
                  <option value="Inativo">Inativos</option>
                </select>
              </div>
              <button onClick={fetchMotoboys} style={s.btnPrimary}>🔄 Atualizar</button>
              <button onClick={exportarXLSX} style={s.btnSuccess}>📥 Exportar XLSX</button>
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '30px' }}>Carregando...</p>
            ) : motoboysFiltrados.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '30px' }}>
                Nenhum motoboy encontrado. {motoboys.length === 0 && <span>Cadastre o primeiro clicando em "Novo Motoboy".</span>}
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th style={s.th}>Nome</th>
                      <th style={s.th}>Vínculo</th>
                      <th style={s.th}>CPF</th>
                      <th style={s.th}>Telefone</th>
                      <th style={s.th}>Placa</th>
                      <th style={s.th}>Comissão</th>
                      <th style={s.th}>Chave PIX</th>
                      <th style={s.th}>Admissão</th>
                      <th style={s.th}>Status</th>
                      <th style={{ ...s.th, textAlign: 'center', minWidth: '140px' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {motoboysFiltrados.map(moto => (
                      <tr key={moto.id}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0f7ff')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                        <td style={{ ...s.td, fontWeight: 'bold' }}>{moto.nome}</td>
                        <td style={s.td}>
                          <span style={moto.vinculo === 'CLT'
                            ? s.badge('#e8f5e9', '#2e7d32')
                            : s.badge('#fff3e0', '#e65100')}>
                            {moto.vinculo}
                          </span>
                        </td>
                        <td style={s.td}>{moto.cpf}</td>
                        <td style={s.td}>{moto.telefone}</td>
                        <td style={s.td}>{moto.placa || '-'}</td>
                        <td style={s.td}>{moto.comissao != null ? `${moto.comissao}%` : '-'}</td>
                        <td style={s.td}>{moto.chavePix || '-'}</td>
                        <td style={s.td}>{moto.dataAdmissao || '-'}</td>
                        <td style={s.td}>
                          <span style={moto.ativo ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fce4e4', '#c62828')}>
                            {moto.ativo ? '● Ativo' : '○ Inativo'}
                          </span>
                        </td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          <button onClick={() => handleEditar(moto)}
                            style={{ padding: '4px 10px', backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '4px' }}>
                            ✏️ Editar
                          </button>
                          <button onClick={() => handleToggleAtivo(moto)}
                            style={{ padding: '4px 10px', backgroundColor: moto.ativo ? '#fb8c00' : '#43a047', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '4px' }}>
                            {moto.ativo ? '⏸' : '▶'}
                          </button>
                          <button onClick={() => handleDeletar(moto.id, moto.nome)}
                            style={{ padding: '4px 10px', backgroundColor: '#e53935', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '10px 0', color: '#666', fontSize: '13px' }}>
                  {motoboysFiltrados.length} de {motoboys.length} motoboy(s)
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA FORMULÁRIO */}
        {abaSelecionada === 'novo' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px' }}>
            <h2 style={{ marginTop: 0 }}>{editandoId ? '✏️ Editar Motoboy' : '➕ Cadastrar Motoboy'}</h2>

            <form onSubmit={handleSubmit}>
              {/* Dados Pessoais */}
              <fieldset style={{ border: '1px solid #e0e0e0', borderRadius: '6px', padding: '16px', marginBottom: '16px' }}>
                <legend style={{ fontWeight: 'bold', color: '#1976d2', padding: '0 8px' }}>👤 Dados Pessoais</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={s.label}>Nome completo *</label>
                    <input type="text" placeholder="Ex: João da Silva" value={formData.nome || ''} onChange={e => setFormData({ ...formData, nome: e.target.value })} style={s.input} required />
                  </div>
                  <div>
                    <label style={s.label}>CPF *</label>
                    <input type="text" placeholder="000.000.000-00" value={formData.cpf || ''} onChange={e => setFormData({ ...formData, cpf: e.target.value })} style={s.input} required />
                  </div>
                  <div>
                    <label style={s.label}>Telefone *</label>
                    <input type="tel" placeholder="(00) 00000-0000" value={formData.telefone || ''} onChange={e => setFormData({ ...formData, telefone: e.target.value })} style={s.input} required />
                  </div>
                </div>
              </fieldset>

              {/* Vínculo */}
              <fieldset style={{ border: '1px solid #e0e0e0', borderRadius: '6px', padding: '16px', marginBottom: '16px' }}>
                <legend style={{ fontWeight: 'bold', color: '#1976d2', padding: '0 8px' }}>📋 Vínculo Empregatício</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={s.label}>Tipo de vínculo *</label>
                    <select value={formData.vinculo || 'Freelancer'} onChange={e => setFormData({ ...formData, vinculo: e.target.value as any })} style={s.select}>
                      {VINCULOS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    {formData.vinculo === 'CLT' && (
                      <small style={{ color: '#2e7d32' }}>👔 CLT: registro em carteira, férias, 13º, FGTS</small>
                    )}
                    {formData.vinculo === 'Freelancer' && (
                      <small style={{ color: '#e65100' }}>🏍️ Freelancer: autônomo, pagamento por entrega/dia</small>
                    )}
                  </div>
                  <div>
                    <label style={s.label}>Data de admissão</label>
                    <input type="date" value={formData.dataAdmissao || ''} onChange={e => setFormData({ ...formData, dataAdmissao: e.target.value })} style={s.input} />
                  </div>
                  {formData.vinculo === 'CLT' && (
                    <div>
                      <label style={s.label}>Data de demissão</label>
                      <input type="date" value={formData.dataDemissao || ''} onChange={e => setFormData({ ...formData, dataDemissao: e.target.value })} style={s.input} />
                    </div>
                  )}
                  <div>
                    <label style={s.label}>Comissão (%)</label>
                    <input type="number" step="0.01" min="0" max="100" placeholder="Ex: 10" value={formData.comissao ?? 0} onChange={e => setFormData({ ...formData, comissao: parseFloat(e.target.value) || 0 })} style={s.input} />
                  </div>
                </div>
              </fieldset>

              {/* Operacional */}
              <fieldset style={{ border: '1px solid #e0e0e0', borderRadius: '6px', padding: '16px', marginBottom: '16px' }}>
                <legend style={{ fontWeight: 'bold', color: '#1976d2', padding: '0 8px' }}>🏍️ Dados Operacionais</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={s.label}>Placa da moto</label>
                    <input type="text" placeholder="ABC-1234 ou BRA2E19" value={formData.placa || ''} onChange={e => setFormData({ ...formData, placa: e.target.value.toUpperCase() })} style={s.input} />
                  </div>
                  <div>
                    <label style={s.label}>Chave PIX</label>
                    <input type="text" placeholder="CPF, e-mail, telefone ou chave aleatória" value={formData.chavePix || ''} onChange={e => setFormData({ ...formData, chavePix: e.target.value })} style={s.input} />
                  </div>
                  <div>
                    <label style={s.label}>Status</label>
                    <select value={formData.ativo ? 'true' : 'false'} onChange={e => setFormData({ ...formData, ativo: e.target.value === 'true' })} style={s.select}>
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" style={s.btnSuccess}>
                  {editandoId ? '💾 Salvar alterações' : '✅ Cadastrar Motoboy'}
                </button>
                {editandoId && (
                  <button type="button" onClick={resetForm} style={s.btnSecondary}>
                    ✕ Cancelar edição
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>

      <Footer showLinks={true} />
    </div>
  );
};

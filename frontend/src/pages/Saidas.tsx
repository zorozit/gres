import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';

export const Saidas: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const userId = localStorage.getItem('user_id') || '';
  const [abaSelecionada, setAbaSelecionada] = useState<'novo' | 'movimentos'>('novo');

  // ---------- helpers ----------
  const getLocalDate = () => new Date().toISOString().split('T')[0];

  const formatarData = (dataISO: string) => {
    if (!dataISO) return '-';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const toNum = (val: any): number => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  // ---------- estado: aba Novo Registro ----------
  const [dataSelecionada, setDataSelecionada] = useState(getLocalDate());
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [registroEditando, setRegistroEditando] = useState<any>(null);
  const [novoRegistro, setNovoRegistro] = useState({
    responsavel: email,
    colaboradorId: '',
    descricao: '',
    valor: 0,
    origem: 'Sangria',
    dataPagamento: '',
  });

  // ---------- estado: aba Movimentos ----------
  const [movRegistros, setMovRegistros] = useState<any[]>([]);
  const [movLoading, setMovLoading] = useState(false);

  // filtros
  const [movDateFilter, setMovDateFilter] = useState('semana-atual');
  const [movDataInicio, setMovDataInicio] = useState('');
  const [movDataFim, setMovDataFim] = useState('');
  const [movColaborador, setMovColaborador] = useState('');
  const [movReferencia, setMovReferencia] = useState('');

  const apiUrl = import.meta.env.VITE_API_ENDPOINT || '';

  // ---------- calcular datas ----------
  const calcularDatas = (filtro: string) => {
    const hoje = new Date();
    let inicio = new Date();
    let fim = new Date();

    switch (filtro) {
      case 'hoje':
        return {
          inicio: hoje.toISOString().split('T')[0],
          fim: hoje.toISOString().split('T')[0],
        };
      case 'semana-atual': {
        const first = new Date(hoje);
        first.setDate(hoje.getDate() - hoje.getDay());
        return {
          inicio: first.toISOString().split('T')[0],
          fim: hoje.toISOString().split('T')[0],
        };
      }
      case 'mes-atual':
        inicio.setDate(1);
        return {
          inicio: inicio.toISOString().split('T')[0],
          fim: hoje.toISOString().split('T')[0],
        };
      case 'mes-anterior':
        inicio.setMonth(hoje.getMonth() - 1);
        inicio.setDate(1);
        fim.setMonth(hoje.getMonth());
        fim.setDate(0);
        return {
          inicio: inicio.toISOString().split('T')[0],
          fim: fim.toISOString().split('T')[0],
        };
      default:
        return { inicio: movDataInicio, fim: movDataFim };
    }
  };

  // atualiza campos de data ao trocar o filtro
  useEffect(() => {
    if (movDateFilter !== 'customizado') {
      const { inicio, fim } = calcularDatas(movDateFilter);
      setMovDataInicio(inicio);
      setMovDataFim(fim);
    }
  }, [movDateFilter]);

  // ---------- carregamento ----------
  useEffect(() => {
    carregarColaboradores();
    setNovoRegistro(prev => ({ ...prev, responsavel: email }));
  }, [email]);

  const carregarColaboradores = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/colaboradores`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setColaboradores(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Erro ao carregar colaboradores:', err);
    }
  };

  // movimentos com filtros (aba Movimentos)
  const handleFiltrar = async () => {
    if (!movDataInicio || !movDataFim) return;
    setMovLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const unitId = localStorage.getItem('unit_id');
      let url = `${apiUrl}/saidas?dataInicio=${movDataInicio}&dataFim=${movDataFim}&unitId=${unitId}`;
      if (movColaborador) url += `&colaborador=${encodeURIComponent(movColaborador)}`;
      if (movReferencia) url += `&referencia=${encodeURIComponent(movReferencia)}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        const lista = Array.isArray(d) ? d : [];
        // filtro client-side por colaborador e referencia (caso API não suporte)
        let filtrado = lista;
        if (movColaborador) {
          filtrado = filtrado.filter((r: any) =>
            (r.colaborador || r.favorecido || '').toLowerCase().includes(movColaborador.toLowerCase())
          );
        }
        if (movReferencia) {
          filtrado = filtrado.filter((r: any) =>
            (r.referencia || r.origem || '').toLowerCase().includes(movReferencia.toLowerCase())
          );
        }
        setMovRegistros(filtrado);
      }
    } catch (err) {
      console.error('Erro ao filtrar movimentos:', err);
    }
    setMovLoading(false);
  };

  // ---------- CRUD ----------
  const handleSalvarNovoRegistro = async () => {
    if (!novoRegistro.colaboradorId || !novoRegistro.descricao || novoRegistro.valor === 0) {
      alert('Por favor, preencha todos os campos obrigatórios');
      return;
    }
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/saidas`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...novoRegistro,
          data: dataSelecionada,
          responsavel: email,
          responsavelId: userId,
          unitId: localStorage.getItem('unit_id') || ''
        }),
      });
      if (res.ok) {
        alert('Saída registrada com sucesso!');
        setNovoRegistro({ responsavel: email, colaboradorId: '', descricao: '', valor: 0, origem: 'Sangria', dataPagamento: '' });
        // recarrega a lista de movimentos do dia atual na aba Movimentos
        handleFiltrar();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert('Erro ao salvar saída: ' + (errData.error || res.status));
      }
    } catch (err) {
      console.error('Erro ao salvar:', err);
      alert('Erro ao salvar saída');
    }
  };

  const handleSalvarEdicao = async () => {
    if (!registroEditando) return;
    try {
      const token = localStorage.getItem('auth_token');
      // Garante que responsavel/responsavelId do usuário logado é enviado na edição
      const payload = {
        ...registroEditando,
        responsavel: registroEditando.responsavel || email,
        responsavelId: registroEditando.responsavelId || userId,
      };
      const res = await fetch(`${apiUrl}/saidas/${registroEditando.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => ({}));
        alert('Saída atualizada com sucesso!');
        // Atualiza o item na lista local imediatamente com os dados retornados
        if (updated.item) {
          setMovRegistros(prev => prev.map(r => r.id === registroEditando.id ? { ...r, ...updated.item } : r));
        }
        setRegistroEditando(null);
        handleFiltrar();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert('Erro ao atualizar saída: ' + (errData.error || res.status));
      }
    } catch (err) {
      console.error('Erro ao atualizar:', err);
      alert('Erro ao atualizar saída');
    }
  };

  const handleDeletar = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja deletar este registro?')) return;
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/saidas/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        alert('Saída deletada com sucesso!');
        handleFiltrar();
      } else {
        alert('Erro ao deletar saída');
      }
    } catch (err) {
      console.error('Erro ao deletar:', err);
      alert('Erro ao deletar saída');
    }
  };

  const handleMudarData = (dias: number) => {
    const d = new Date(dataSelecionada);
    d.setDate(d.getDate() + dias);
    setDataSelecionada(d.toISOString().split('T')[0]);
  };

  // ---------- export ----------
  const exportarXLSX = () => {
    const dados = movRegistros.map(r => ({
      'Data': r.data,
      'Colaborador': r.colaborador || r.favorecido || '-',
      'Descrição': r.descricao || '-',
      'Referência': r.referencia || r.origem || '-',
      'Valor': toNum(r.valor),
      'Data Pagamento': r.dataPagamento || '-',
      'Responsável': r.responsavelNome || r.responsavel || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Saídas');
    XLSX.writeFile(wb, `saidas-${movDataInicio}-${movDataFim}.xlsx`);
  };

  const exportarCSV = () => {
    const dados = movRegistros.map(r => ({
      'Data': r.data,
      'Colaborador': r.colaborador || r.favorecido || '-',
      'Descrição': r.descricao || '-',
      'Referência': r.referencia || r.origem || '-',
      'Valor': toNum(r.valor),
      'Data Pagamento': r.dataPagamento || '-',
      'Responsável': r.responsavelNome || r.responsavel || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `saidas-${movDataInicio}-${movDataFim}.csv`;
    link.click();
  };

  // total dos movimentos filtrados
  const totalMovimentos = movRegistros.reduce((acc, r) => acc + toNum(r.valor), 0);

  // ---------- estilos ----------
  const s = {
    filterSection: {
      backgroundColor: '#f5f5f5',
      padding: '20px',
      borderRadius: '8px',
      marginBottom: '20px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '15px',
    } as React.CSSProperties,
    filterGroup: { display: 'flex', flexDirection: 'column' as const },
    label: { fontSize: '14px', fontWeight: 'bold', marginBottom: '5px', color: '#333' },
    select: { padding: '10px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' },
    input: { padding: '10px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' },
    btnPrimary: { padding: '10px 20px', borderRadius: '4px', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#007bff', color: 'white' },
    btnSuccess: { padding: '10px 20px', borderRadius: '4px', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#28a745', color: 'white' },
    th: { backgroundColor: '#007bff', color: 'white', padding: '10px', textAlign: 'left' as const, border: '1px solid #ddd' },
    td: { padding: '10px', border: '1px solid #ddd' },
  };

  // ---------- render ----------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Cabeçalho */}
      <div style={{ backgroundColor: '#2c3e50', color: 'white', padding: '15px 20px', borderBottom: '3px solid #3498db', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => navigate(-1)} style={{ padding: '8px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>← Voltar</button>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>📋 Registro de Saídas</h1>
        </div>
        <button onClick={logout} style={{ padding: '8px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🚪 Sair</button>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>

          {/* Abas */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            {(['novo', 'movimentos'] as const).map(aba => (
              <button
                key={aba}
                onClick={() => setAbaSelecionada(aba)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: abaSelecionada === aba ? '#28a745' : '#e9ecef',
                  color: abaSelecionada === aba ? 'white' : 'black',
                  border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold',
                }}
              >
                {aba === 'novo' ? '➕ Novo Registro' : '📊 Movimentos'}
              </button>
            ))}
          </div>

          {/* ===== ABA: NOVO REGISTRO ===== */}
          {abaSelecionada === 'novo' && (
            <>
              {/* seletor de data */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
                <label style={{ fontWeight: 'bold' }}>📅 Data:</label>
                <button onClick={() => handleMudarData(-1)} style={{ ...s.btnPrimary, padding: '8px 12px' }}>◀ Anterior</button>
                <input type="date" value={dataSelecionada} onChange={e => setDataSelecionada(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }} />
                <button onClick={() => handleMudarData(1)} style={{ ...s.btnPrimary, padding: '8px 12px' }}>Próximo ▶</button>
                <button onClick={() => setDataSelecionada(getLocalDate())} style={{ ...s.btnSuccess, padding: '8px 12px' }}>Hoje</button>
              </div>

              <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
                <h2>➕ Nova Saída — {formatarData(dataSelecionada)}</h2>
                <div style={{ display: 'grid', gap: '15px' }}>
                  <div>
                    <label style={s.label}>Responsável:</label>
                    <input type="text" value={email} disabled style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', backgroundColor: '#e9ecef', cursor: 'not-allowed' }} />
                    <small style={{ color: '#666' }}>Registrado automaticamente como o usuário atual</small>
                  </div>
                  <div>
                    <label style={s.label}>Colaborador: *</label>
                    <select value={novoRegistro.colaboradorId} onChange={e => setNovoRegistro({ ...novoRegistro, colaboradorId: e.target.value })} style={{ width: '100%', ...s.select }}>
                      <option value="">Selecione um colaborador</option>
                      {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome || c.email}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Descrição: *</label>
                    <input type="text" placeholder="Descrição da saída" value={novoRegistro.descricao} onChange={e => setNovoRegistro({ ...novoRegistro, descricao: e.target.value })} style={{ width: '100%', ...s.input }} />
                  </div>
                  <div>
                    <label style={s.label}>Valor (R$): *</label>
                    <input type="number" placeholder="0.00" value={novoRegistro.valor} onChange={e => setNovoRegistro({ ...novoRegistro, valor: parseFloat(e.target.value) || 0 })} style={{ width: '100%', ...s.input }} />
                  </div>
                  <div>
                    <label style={s.label}>Referência:</label>
                    <select value={novoRegistro.origem} onChange={e => setNovoRegistro({ ...novoRegistro, origem: e.target.value })} style={{ width: '100%', ...s.select }}>
                      <option value="Sangria">Sangria</option>
                      <option value="PIX">PIX</option>
                      <option value="Caixa">Caixa</option>
                      <option value="A receber">A receber</option>
                      <option value="A pagar">A pagar</option>
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Data de Pagamento:</label>
                    <input type="date" value={novoRegistro.dataPagamento} onChange={e => setNovoRegistro({ ...novoRegistro, dataPagamento: e.target.value })} style={{ width: '100%', ...s.input }} />
                  </div>
                  <button onClick={handleSalvarNovoRegistro} style={s.btnSuccess}>💾 Salvar Saída</button>
                </div>
              </div>
            </>
          )}

          {/* ===== ABA: MOVIMENTOS ===== */}
          {abaSelecionada === 'movimentos' && (
            <>
              {/* Filtros */}
              <div style={s.filterSection}>
                <div style={s.filterGroup}>
                  <label style={s.label}>Período:</label>
                  <select value={movDateFilter} onChange={e => setMovDateFilter(e.target.value)} style={s.select}>
                    <option value="hoje">Hoje</option>
                    <option value="semana-atual">Essa semana</option>
                    <option value="mes-atual">Esse mês</option>
                    <option value="mes-anterior">Mês anterior</option>
                    <option value="customizado">Período customizado</option>
                  </select>
                </div>

                {movDateFilter === 'customizado' && (
                  <>
                    <div style={s.filterGroup}>
                      <label style={s.label}>Data Início:</label>
                      <input type="date" value={movDataInicio} onChange={e => setMovDataInicio(e.target.value)} style={s.input} />
                    </div>
                    <div style={s.filterGroup}>
                      <label style={s.label}>Data Fim:</label>
                      <input type="date" value={movDataFim} onChange={e => setMovDataFim(e.target.value)} style={s.input} />
                    </div>
                  </>
                )}

                <div style={s.filterGroup}>
                  <label style={s.label}>Colaborador:</label>
                  <select value={movColaborador} onChange={e => setMovColaborador(e.target.value)} style={s.select}>
                    <option value="">Todos</option>
                    {colaboradores.map(c => <option key={c.id} value={c.nome || c.email}>{c.nome || c.email}</option>)}
                  </select>
                </div>

                <div style={s.filterGroup}>
                  <label style={s.label}>Referência:</label>
                  <select value={movReferencia} onChange={e => setMovReferencia(e.target.value)} style={s.select}>
                    <option value="">Todas</option>
                    <option value="Sangria">Sangria</option>
                    <option value="PIX">PIX</option>
                    <option value="Caixa">Caixa</option>
                    <option value="A receber">A receber</option>
                    <option value="A pagar">A pagar</option>
                  </select>
                </div>
              </div>

              {/* Botões */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <button style={s.btnPrimary} onClick={handleFiltrar} disabled={movLoading}>
                  {movLoading ? '⏳ Carregando...' : '🔍 Filtrar'}
                </button>
                <button style={s.btnSuccess} onClick={exportarXLSX} disabled={movRegistros.length === 0}>
                  📥 Exportar XLSX
                </button>
                <button style={s.btnSuccess} onClick={exportarCSV} disabled={movRegistros.length === 0}>
                  📥 Exportar CSV
                </button>
              </div>

              {/* Resumo */}
              {movRegistros.length > 0 && (
                <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  <div style={{ backgroundColor: '#fff3cd', padding: '15px 25px', borderRadius: '8px', border: '1px solid #ffc107' }}>
                    <div style={{ fontSize: '13px', color: '#666' }}>Total de registros</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{movRegistros.length}</div>
                  </div>
                  <div style={{ backgroundColor: '#f8d7da', padding: '15px 25px', borderRadius: '8px', border: '1px solid #dc3545' }}>
                    <div style={{ fontSize: '13px', color: '#666' }}>Total de saídas</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#dc3545' }}>R$ {totalMovimentos.toFixed(2)}</div>
                  </div>
                </div>
              )}

              {/* Tabela */}
              <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflowX: 'auto' }}>
                <h3>📋 Saídas — {movRegistros.length} registro(s)</h3>
                {movRegistros.length === 0 ? (
                  <p style={{ color: '#666', textAlign: 'center', padding: '30px' }}>
                    {movLoading ? 'Carregando...' : 'Use os filtros acima e clique em "Filtrar" para carregar os registros.'}
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th style={s.th}>Data</th>
                        <th style={s.th}>Colaborador</th>
                        <th style={s.th}>Descrição</th>
                        <th style={s.th}>Referência</th>
                        <th style={{ ...s.th, textAlign: 'right' }}>Valor</th>
                        <th style={s.th}>Dt. Pagamento</th>
                        <th style={s.th}>Responsável</th>
                        <th style={{ ...s.th, textAlign: 'center' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movRegistros.map((r, idx) => (
                        <tr key={r.id || idx} onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9f9f9')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                          <td style={s.td}>{formatarData(r.data)}</td>
                          <td style={s.td}>{r.colaborador || r.favorecido || '-'}</td>
                          <td style={s.td}>{r.descricao || '-'}</td>
                          <td style={s.td}>{r.referencia || r.origem || '-'}</td>
                          <td style={{ ...s.td, textAlign: 'right', color: '#dc3545', fontWeight: 'bold' }}>
                            R$ {toNum(r.valor).toFixed(2)}
                          </td>
                          <td style={s.td}>{formatarData(r.dataPagamento)}</td>
                          <td style={s.td}>{r.responsavelNome || r.responsavel || '-'}</td>
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            <button onClick={() => setRegistroEditando({ ...r })} style={{ padding: '5px 10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '5px', fontSize: '12px' }}>✏️ Editar</button>
                            <button onClick={() => handleDeletar(r.id)} style={{ padding: '5px 10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>🗑️ Deletar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold' }}>
                        <td colSpan={4} style={{ ...s.td, textAlign: 'right' }}>TOTAL:</td>
                        <td style={{ ...s.td, textAlign: 'right', color: '#dc3545' }}>R$ {totalMovimentos.toFixed(2)}</td>
                        <td colSpan={3} style={s.td}></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </>
          )}

          {/* Modal de Edição */}
          {registroEditando && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', maxWidth: '500px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                <h2>✏️ Editar Saída</h2>
                <div style={{ display: 'grid', gap: '15px' }}>
                  <div>
                    <label style={s.label}>Responsável:</label>
                    <input type="text" value={registroEditando.responsavelNome || registroEditando.responsavel || 'Não informado'} disabled style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', backgroundColor: '#f0f0f0' }} />
                  </div>
                  <div>
                    <label style={s.label}>Colaborador:</label>
                    <select value={registroEditando.colaboradorId || ''} onChange={e => setRegistroEditando({ ...registroEditando, colaboradorId: e.target.value })} style={{ width: '100%', ...s.select }}>
                      <option value="">Selecione um colaborador</option>
                      {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Descrição:</label>
                    <input type="text" value={registroEditando.descricao || ''} onChange={e => setRegistroEditando({ ...registroEditando, descricao: e.target.value })} style={{ width: '100%', ...s.input }} />
                  </div>
                  <div>
                    <label style={s.label}>Valor (R$):</label>
                    <input type="number" value={registroEditando.valor || 0} onChange={e => setRegistroEditando({ ...registroEditando, valor: parseFloat(e.target.value) || 0 })} style={{ width: '100%', ...s.input }} />
                  </div>
                  <div>
                    <label style={s.label}>Referência:</label>
                    <select value={registroEditando.origem || registroEditando.referencia || 'Sangria'} onChange={e => setRegistroEditando({ ...registroEditando, origem: e.target.value, referencia: e.target.value })} style={{ width: '100%', ...s.select }}>
                      <option value="Sangria">Sangria</option>
                      <option value="PIX">PIX</option>
                      <option value="Caixa">Caixa</option>
                      <option value="A receber">A receber</option>
                      <option value="A pagar">A pagar</option>
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Data de Pagamento:</label>
                    <input type="date" value={registroEditando.dataPagamento || ''} onChange={e => setRegistroEditando({ ...registroEditando, dataPagamento: e.target.value })} style={{ width: '100%', ...s.input }} />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleSalvarEdicao} style={{ flex: 1, ...s.btnSuccess }}>💾 Salvar</button>
                    <button onClick={() => setRegistroEditando(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✕ Cancelar</button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
      <Footer />
    </div>
  );
};

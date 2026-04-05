import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import { useUnit } from '../contexts/UnitContext';

interface RegistroCaixa {
  id: string;
  unitId: string;
  data: string;
  hora: string;
  periodo: 'Dia' | 'Noite';
  responsavel: string;
  responsavelNome: string;
  abertura: number;
  maq1: number;
  maq2: number;
  maq3: number;
  maq4: number;
  maq5: number;
  maq6: number;
  ifood: number;
  dinheiro: number;
  pix: number;
  fiado: number;
  sangria: number;
  total: number;
  sistemaPdv: number;
  diferenca: number;
  referencia: number;
}

interface Usuario {
  id: string;
  nome: string;
  email: string;
}

interface GraficoData {
  data: string;
  total: number;
  sistema: number;
}

const styles = {
  container: { padding: '20px', maxWidth: '1400px', margin: '0 auto' },
  filterSection: {
    backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '20px',
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px',
  },
  filterGroup: { display: 'flex', flexDirection: 'column' as const },
  label: { fontSize: '14px', fontWeight: 'bold', marginBottom: '5px', color: '#333' },
  select: { padding: '10px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' },
  input: { padding: '10px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' },
  buttonGroup: { display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' as const },
  button: { padding: '10px 20px', borderRadius: '4px', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#007bff', color: 'white' },
  exportButton: { padding: '10px 20px', borderRadius: '4px', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#28a745', color: 'white' },
  graficoContainer: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  gridContainer: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  th: { backgroundColor: '#007bff', color: 'white', padding: '10px 8px', textAlign: 'left' as const, borderBottom: '2px solid #0056b3', whiteSpace: 'nowrap' as const },
  td: { padding: '9px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' as const },
  modal: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', borderRadius: '8px', padding: '24px', maxWidth: '700px', width: '92%', maxHeight: '90vh', overflowY: 'auto' as const, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' },
  h3: { margin: '15px 0 10px 0', fontSize: '14px', fontWeight: 'bold', color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '5px' },
  grid2Col: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } as React.CSSProperties,
  formGroup: { marginBottom: '10px', display: 'flex', flexDirection: 'column' as const, gap: '5px' },
  resumo: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '14px', backgroundColor: '#e8f5e9', borderRadius: '6px', marginTop: '14px', marginBottom: '14px' } as React.CSSProperties,
  resumoItem: { display: 'flex', flexDirection: 'column' as const, gap: '3px' },
  resumoLabel: { fontSize: '11px', color: '#555', fontWeight: 'bold' as const, textTransform: 'uppercase' as const },
  resumoValor: { fontSize: '15px', fontWeight: 'bold', color: '#388e3c' },
};

export const MovimentosCaixa: React.FC = () => {
  const { activeUnit } = useUnit();
  const [unidades, setUnidades] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [registros, setRegistros] = useState<RegistroCaixa[]>([]);
  const [graficoData, setGraficoData] = useState<GraficoData[]>([]);
  const [registroEditando, setRegistroEditando] = useState<Partial<RegistroCaixa> | null>(null);

  // Filtros
  const [selectedUnit, setSelectedUnit] = useState(activeUnit?.id || '');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedTurno, setSelectedTurno] = useState('Todos');
  const [dateFilter, setDateFilter] = useState('semana-atual');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [userRole, setUserRole] = useState('');

  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  useEffect(() => { setUserRole(localStorage.getItem('user_role') || ''); }, []);

  useEffect(() => {
    const carregarUnidades = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${apiUrl}/unidades`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (Array.isArray(data)) {
          setUnidades(data);
          if (activeUnit?.id) setSelectedUnit(activeUnit.id);
        }
      } catch (error) { console.error('Erro ao carregar unidades:', error); }
    };
    carregarUnidades();
  }, [activeUnit]);

  useEffect(() => {
    const carregarUsuarios = async () => {
      if (!selectedUnit) return;
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${apiUrl}/usuarios?unitId=${selectedUnit}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (Array.isArray(data)) setUsuarios(data);
      } catch (error) { console.error('Erro ao carregar usuários:', error); }
    };
    carregarUsuarios();
  }, [selectedUnit]);

  const calcularDatas = () => {
    const hoje = new Date();
    switch (dateFilter) {
      case 'hoje':
        setDataInicio(hoje.toISOString().split('T')[0]);
        setDataFim(hoje.toISOString().split('T')[0]);
        break;
      case 'semana-atual': {
        const first = new Date(hoje); first.setDate(hoje.getDate() - hoje.getDay());
        setDataInicio(first.toISOString().split('T')[0]);
        setDataFim(hoje.toISOString().split('T')[0]);
        break;
      }
      case 'mes-atual': {
        const ini = new Date(hoje); ini.setDate(1);
        setDataInicio(ini.toISOString().split('T')[0]);
        setDataFim(hoje.toISOString().split('T')[0]);
        break;
      }
      case 'mes-anterior': {
        const ini = new Date(hoje); ini.setMonth(hoje.getMonth() - 1); ini.setDate(1);
        const fim = new Date(hoje); fim.setMonth(hoje.getMonth()); fim.setDate(0);
        setDataInicio(ini.toISOString().split('T')[0]);
        setDataFim(fim.toISOString().split('T')[0]);
        break;
      }
    }
  };

  useEffect(() => { calcularDatas(); }, [dateFilter]);

  const toNum = (val: any): number => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };
  const fmt = (v: number) => `R$ ${toNum(v).toFixed(2)}`;

  const normalizeRegistro = (r: any): RegistroCaixa => ({
    ...r,
    abertura:   toNum(r.abertura),
    maq1:       toNum(r.maq1),
    maq2:       toNum(r.maq2),
    maq3:       toNum(r.maq3),
    maq4:       toNum(r.maq4),
    maq5:       toNum(r.maq5),
    maq6:       toNum(r.maq6),
    ifood:      toNum(r.ifood),
    dinheiro:   toNum(r.dinheiro),
    pix:        toNum(r.pix),
    fiado:      toNum(r.fiado),
    sangria:    toNum(r.sangria),
    total:      toNum(r.total),
    sistemaPdv: toNum(r.sistemaPdv ?? r.sistema),
    diferenca:  toNum(r.diferenca),
    referencia: toNum(r.referencia),
  });

  const calcularTotais = (r: Partial<RegistroCaixa>) => {
    const total =
      toNum(r.abertura) + toNum(r.maq1) + toNum(r.maq2) + toNum(r.maq3) +
      toNum(r.maq4) + toNum(r.maq5) + toNum(r.maq6) + toNum(r.ifood) +
      toNum(r.dinheiro) + toNum(r.pix) + toNum(r.fiado);
    const diferenca = toNum(r.sistemaPdv) - total;
    return { total, diferenca };
  };

  const carregarRegistros = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      let url = `${apiUrl}/caixa?unitId=${selectedUnit}&dataInicio=${dataInicio}&dataFim=${dataFim}`;
      if (selectedUser) url += `&responsavel=${selectedUser}`;
      if (selectedTurno !== 'Todos') url += `&periodo=${selectedTurno}`;

      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await response.json();
      if (Array.isArray(data)) {
        const normalized = data.map(normalizeRegistro);
        setRegistros(normalized);
        processarGraficoData(normalized);
      }
    } catch (error) { console.error('Erro ao carregar registros:', error); }
  };

  const processarGraficoData = (dados: RegistroCaixa[]) => {
    const grouped: { [key: string]: { total: number; sistema: number; count: number } } = {};
    dados.forEach(r => {
      if (!grouped[r.data]) grouped[r.data] = { total: 0, sistema: 0, count: 0 };
      grouped[r.data].total  += r.total || 0;
      grouped[r.data].sistema += r.sistemaPdv || 0;
      grouped[r.data].count  += 1;
    });
    setGraficoData(
      Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
        .map(([data, v]) => ({
          data: new Date(data + 'T12:00:00').toLocaleDateString('pt-BR'),
          total:   Math.round(v.total   / v.count),
          sistema: Math.round(v.sistema / v.count),
        }))
    );
  };

  /* ── Edit handlers ─────────────────────────────────────── */
  /** Abre modal de edição já com total/diferença recalculados a partir dos campos armazenados */
  const abrirEdicaoMovimento = (registro: RegistroCaixa) => {
    const normalizado = normalizeRegistro(registro);
    const { total, diferenca } = calcularTotais(normalizado);
    setRegistroEditando({ ...normalizado, total, diferenca });
  };

  /**
   * Atualiza campo do registro em edição.
   * rawValue pode ser string (do onChange) ou number.
   * Usa parseFloat sem fallback || 0 para não colapsar campos em branco para zero.
   */
  const handleMudarCampoEdit = (campo: string, rawValue: string | number) => {
    if (!registroEditando) return;
    const parsed = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue as string);
    const numValue = isNaN(parsed) ? 0 : parsed;
    const updated = { ...registroEditando, [campo]: numValue };
    if (['abertura','maq1','maq2','maq3','maq4','maq5','maq6','ifood','dinheiro','pix','fiado','sistemaPdv'].includes(campo)) {
      const { total, diferenca } = calcularTotais(updated);
      updated.total = total;
      updated.diferenca = diferenca;
    }
    setRegistroEditando(updated);
  };

  const handleSalvarEdicao = async () => {
    if (!registroEditando?.id) return;
    const { total, diferenca } = calcularTotais(registroEditando);
    const payload = { ...registroEditando, total, diferenca };
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/caixa/${registroEditando.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert('Registro atualizado com sucesso!');
        setRegistroEditando(null);
        carregarRegistros();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Erro ao salvar: ' + (err.error || res.status));
      }
    } catch (err) { alert('Erro ao salvar registro'); }
  };

  const handleDeletar = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja deletar este registro?')) return;
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/caixa/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) { carregarRegistros(); }
      else { alert('Erro ao deletar registro'); }
    } catch (err) { alert('Erro ao deletar registro'); }
  };

  /* ── Export ──────────────────────────────────────────────── */
  const mapExport = (r: RegistroCaixa) => ({
    'Data': r.data, 'Hora': r.hora, 'Turno': r.periodo, 'Responsável': r.responsavelNome || r.responsavel,
    'Abertura': r.abertura, 'Maq 1': r.maq1, 'Maq 2': r.maq2, 'Maq 3': r.maq3,
    'Maq 4': r.maq4, 'Maq 5': r.maq5, 'Maq 6': r.maq6, 'iFood': r.ifood,
    'Dinheiro': r.dinheiro, 'PIX': r.pix, 'Fiado': r.fiado, 'Sangria': r.sangria,
    'Total': r.total, 'Sistema PDV': r.sistemaPdv, 'Diferença': r.diferenca, 'Referência': r.referencia,
  });

  const exportarXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(registros.map(mapExport));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimentos');
    XLSX.writeFile(wb, `movimentos-caixa-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportarCSV = () => {
    const ws = XLSX.utils.json_to_sheet(registros.map(mapExport));
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `movimentos-caixa-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={styles.container}>
      <h2>📊 Movimentos de Caixa</h2>

      {/* Filtros */}
      <div style={styles.filterSection as React.CSSProperties}>
        {userRole === 'Admin' && (
          <div style={styles.filterGroup}>
            <label style={styles.label}>Unidade:</label>
            <select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)} style={styles.select}>
              <option value="">Selecione uma unidade</option>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        )}
        <div style={styles.filterGroup}>
          <label style={styles.label}>Usuário:</label>
          <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} style={styles.select}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.label}>Turno:</label>
          <select value={selectedTurno} onChange={e => setSelectedTurno(e.target.value)} style={styles.select}>
            <option value="Todos">Todos</option>
            <option value="Dia">Dia</option>
            <option value="Noite">Noite</option>
          </select>
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.label}>Período:</label>
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={styles.select}>
            <option value="hoje">Hoje</option>
            <option value="semana-atual">Essa semana</option>
            <option value="mes-atual">Esse mês</option>
            <option value="mes-anterior">Mês anterior</option>
            <option value="customizado">Período customizado</option>
          </select>
        </div>
        {dateFilter === 'customizado' && (
          <>
            <div style={styles.filterGroup}>
              <label style={styles.label}>Data Início:</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.filterGroup}>
              <label style={styles.label}>Data Fim:</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={styles.input} />
            </div>
          </>
        )}
      </div>

      {/* Botões */}
      <div style={styles.buttonGroup}>
        <button style={styles.button} onClick={carregarRegistros}>🔍 Filtrar</button>
        <button style={styles.exportButton} onClick={exportarXLSX}>📥 Exportar XLSX</button>
        <button style={styles.exportButton} onClick={exportarCSV}>📥 Exportar CSV</button>
      </div>

      {/* Gráfico */}
      {graficoData.length > 0 && (
        <div style={styles.graficoContainer}>
          <h3>Gráfico: Total vs Sistema PDV</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={graficoData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" />
              <YAxis />
              <Tooltip formatter={(value: any) => fmt(value)} />
              <Legend />
              <Line type="monotone" dataKey="total"  stroke="#8884d8" name="Total"      strokeWidth={2} />
              <Line type="monotone" dataKey="sistema" stroke="#82ca9d" name="Sistema PDV" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela */}
      <div style={styles.gridContainer as React.CSSProperties}>
        <h3>Detalhes dos Movimentos ({registros.length})</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Data</th>
              <th style={styles.th}>Hora</th>
              <th style={styles.th}>Turno</th>
              <th style={styles.th}>Responsável</th>
              <th style={styles.th}>Abertura</th>
              <th style={styles.th}>Maq 1</th>
              <th style={styles.th}>Maq 2</th>
              <th style={styles.th}>Maq 3</th>
              <th style={styles.th}>Maq 4</th>
              <th style={styles.th}>Maq 5</th>
              <th style={styles.th}>Maq 6</th>
              <th style={styles.th}>iFood</th>
              <th style={styles.th}>Dinheiro</th>
              <th style={styles.th}>PIX</th>
              <th style={styles.th}>Fiado</th>
              <th style={styles.th}>Sangria</th>
              <th style={{ ...styles.th, backgroundColor: '#0056b3' }}>Total</th>
              <th style={styles.th}>Sistema</th>
              <th style={styles.th}>Diferença</th>
              <th style={styles.th}>Referência</th>
              <th style={{ ...styles.th, textAlign: 'center', minWidth: '120px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {registros.map(registro => (
              <tr key={registro.id}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#f0f7ff'}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'white'}>
                <td style={styles.td}>{registro.data}</td>
                <td style={styles.td}>{registro.hora}</td>
                <td style={styles.td}>
                  <span style={{ backgroundColor: registro.periodo === 'Dia' ? '#fff3cd' : '#e8d5ff', padding: '2px 6px', borderRadius: '3px', fontSize: '12px', fontWeight: 'bold' }}>
                    {registro.periodo}
                  </span>
                </td>
                <td style={styles.td}>{registro.responsavelNome || registro.responsavel}</td>
                <td style={styles.td}>{fmt(registro.abertura)}</td>
                <td style={styles.td}>{fmt(registro.maq1)}</td>
                <td style={styles.td}>{fmt(registro.maq2)}</td>
                <td style={styles.td}>{fmt(registro.maq3)}</td>
                <td style={styles.td}>{fmt(registro.maq4)}</td>
                <td style={styles.td}>{fmt(registro.maq5)}</td>
                <td style={styles.td}>{fmt(registro.maq6)}</td>
                <td style={styles.td}>{fmt(registro.ifood)}</td>
                <td style={styles.td}>{fmt(registro.dinheiro)}</td>
                <td style={styles.td}>{fmt(registro.pix)}</td>
                <td style={styles.td}>{fmt(registro.fiado)}</td>
                <td style={styles.td}>{fmt(registro.sangria)}</td>
                <td style={{ ...styles.td, fontWeight: 'bold', color: '#1565c0' }}>{fmt(registro.total)}</td>
                <td style={styles.td}>{fmt(registro.sistemaPdv)}</td>
                <td style={{ ...styles.td, color: registro.diferenca < 0 ? '#c62828' : '#2e7d32', fontWeight: 'bold' }}>
                  {fmt(registro.diferenca)}
                </td>
                <td style={styles.td}>{fmt(registro.referencia)}</td>
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  <button onClick={() => abrirEdicaoMovimento(registro)}
                    style={{ padding: '4px 10px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginRight: '4px' }}>
                    ✏️ Editar
                  </button>
                  <button onClick={() => handleDeletar(registro.id)}
                    style={{ padding: '4px 10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {registros.length === 0 && (
          <p style={{ textAlign: 'center', color: '#999', padding: '30px' }}>
            Use os filtros acima e clique em "Filtrar" para carregar os registros.
          </p>
        )}
      </div>

      {/* MODAL DE EDIÇÃO */}
      {registroEditando && (
        <div style={styles.modal as React.CSSProperties}>
          <div style={styles.modalContent}>
            <h2 style={{ marginTop: 0 }}>✏️ Editar Registro de Caixa</h2>

            <div style={styles.grid2Col}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Responsável:</label>
                <select value={registroEditando.responsavel || ''} onChange={e => handleMudarCampoEdit('responsavel', e.target.value)} style={styles.input}>
                  <option value="">Selecione</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Período:</label>
                <select value={registroEditando.periodo || 'Dia'} onChange={e => handleMudarCampoEdit('periodo', e.target.value)} style={styles.input}>
                  <option>Dia</option>
                  <option>Noite</option>
                </select>
              </div>
            </div>

            <h3 style={styles.h3}>💵 Valores de Entrada</h3>
            <div style={styles.grid2Col}>
              {[
                { label: 'Abertura', campo: 'abertura' },
                { label: 'Maq 1', campo: 'maq1' }, { label: 'Maq 2', campo: 'maq2' },
                { label: 'Maq 3', campo: 'maq3' }, { label: 'Maq 4', campo: 'maq4' },
                { label: 'Maq 5', campo: 'maq5' }, { label: 'Maq 6', campo: 'maq6' },
                { label: 'iFood', campo: 'ifood' }, { label: 'Dinheiro', campo: 'dinheiro' },
                { label: 'PIX', campo: 'pix' }, { label: 'Fiado', campo: 'fiado' },
                { label: 'Sangria', campo: 'sangria' },
              ].map(({ label, campo }) => (
                <div key={campo} style={styles.formGroup}>
                  <label style={styles.label}>{label} (R$):</label>
                  <input type="number" step="0.01"
                    value={(registroEditando as any)[campo] ?? 0}
                    onChange={e => handleMudarCampoEdit(campo, e.target.value)}
                    onFocus={e => e.target.select()}
                    style={styles.input} />
                </div>
              ))}
            </div>

            <h3 style={styles.h3}>📊 Sistema PDV</h3>
            <div style={styles.grid2Col}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Sistema PDV (R$):</label>
                <input type="number" step="0.01" value={registroEditando.sistemaPdv ?? 0}
                  onChange={e => handleMudarCampoEdit('sistemaPdv', e.target.value)}
                  onFocus={e => e.target.select()}
                  style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Referência (R$):</label>
                <input type="number" step="0.01" value={registroEditando.referencia ?? 0}
                  onChange={e => handleMudarCampoEdit('referencia', e.target.value)}
                  onFocus={e => e.target.select()}
                  style={styles.input} />
              </div>
            </div>

            {/* RESUMO LIVE */}
            <div style={styles.resumo}>
              <div style={styles.resumoItem}>
                <span style={styles.resumoLabel}>Total Entradas</span>
                <span style={styles.resumoValor}>{fmt(registroEditando.total || 0)}</span>
              </div>
              <div style={styles.resumoItem}>
                <span style={styles.resumoLabel}>Sistema PDV</span>
                <span style={styles.resumoValor}>{fmt(registroEditando.sistemaPdv || 0)}</span>
              </div>
              <div style={styles.resumoItem}>
                <span style={styles.resumoLabel}>Diferença (PDV − Total)</span>
                <span style={{ ...styles.resumoValor, color: (registroEditando.diferenca || 0) !== 0 ? '#c62828' : '#388e3c' }}>
                  {fmt(registroEditando.diferenca || 0)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setRegistroEditando(null)}
                style={{ flex: 1, padding: '10px', backgroundColor: '#9e9e9e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                ✕ Cancelar
              </button>
              <button onClick={handleSalvarEdicao}
                style={{ flex: 2, padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                💾 Salvar
              </button>
              <button onClick={() => {
                if (registroEditando.id && window.confirm('Deletar este registro?')) {
                  handleDeletar(registroEditando.id);
                  setRegistroEditando(null);
                }
              }} style={{ flex: 1, padding: '10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                🗑️ Deletar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

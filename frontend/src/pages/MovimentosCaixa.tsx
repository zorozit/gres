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
  container: {
    padding: '20px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  filterSection: {
    backgroundColor: '#f5f5f5',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '15px',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  label: {
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '5px',
    color: '#333',
  },
  select: {
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '14px',
    fontFamily: 'Arial, sans-serif',
  },
  input: {
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '14px',
    fontFamily: 'Arial, sans-serif',
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
    marginTop: '20px',
    flexWrap: 'wrap' as const,
  },
  button: {
    padding: '10px 20px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    backgroundColor: '#007bff',
    color: 'white',
  },
  exportButton: {
    padding: '10px 20px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    backgroundColor: '#28a745',
    color: 'white',
  },
  graficoContainer: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  gridContainer: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  },
  th: {
    backgroundColor: '#f0f0f0',
    padding: '12px',
    textAlign: 'left' as const,
    fontWeight: 'bold',
    borderBottom: '2px solid #ddd',
    position: 'sticky' as const,
    top: 0,
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #eee',
  },
  trHover: {
    backgroundColor: '#f9f9f9',
  },
};

export const MovimentosCaixa: React.FC = () => {
  const { activeUnit } = useUnit();
  const [unidades, setUnidades] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [registros, setRegistros] = useState<RegistroCaixa[]>([]);
  const [graficoData, setGraficoData] = useState<GraficoData[]>([]);
  
  // Filtros
  const [selectedUnit, setSelectedUnit] = useState(activeUnit?.id || '');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedTurno, setSelectedTurno] = useState('Todos');
  const [dateFilter, setDateFilter] = useState('semana-atual');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  
  // User info
  const [userRole, setUserRole] = useState('');

  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  // Carregar informações do usuário
  useEffect(() => {
    const role = localStorage.getItem('user_role') || '';
    setUserRole(role);
  }, []);

  // Carregar unidades
  useEffect(() => {
    const carregarUnidades = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${apiUrl}/unidades`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (Array.isArray(data)) {
          setUnidades(data);
          if (activeUnit?.id) {
            setSelectedUnit(activeUnit.id);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar unidades:', error);
      }
    };
    carregarUnidades();
  }, [activeUnit]);

  // Carregar usuários da unidade
  useEffect(() => {
    const carregarUsuarios = async () => {
      if (!selectedUnit) return;
      
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${apiUrl}/usuarios?unitId=${selectedUnit}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (Array.isArray(data)) {
          setUsuarios(data);
        }
      } catch (error) {
        console.error('Erro ao carregar usuários:', error);
      }
    };
    carregarUsuarios();
  }, [selectedUnit]);

  // Calcular datas baseado no filtro
  const calcularDatas = () => {
    const hoje = new Date();
    const inicio = new Date();
    const fim = new Date();

    switch (dateFilter) {
      case 'hoje':
        setDataInicio(hoje.toISOString().split('T')[0]);
        setDataFim(hoje.toISOString().split('T')[0]);
        break;
      case 'semana-atual':
        const primeiroDiaSemana = new Date(hoje);
        primeiroDiaSemana.setDate(hoje.getDate() - hoje.getDay());
        setDataInicio(primeiroDiaSemana.toISOString().split('T')[0]);
        setDataFim(hoje.toISOString().split('T')[0]);
        break;
      case 'mes-atual':
        inicio.setDate(1);
        setDataInicio(inicio.toISOString().split('T')[0]);
        setDataFim(hoje.toISOString().split('T')[0]);
        break;
      case 'mes-anterior':
        inicio.setMonth(hoje.getMonth() - 1);
        inicio.setDate(1);
        fim.setMonth(hoje.getMonth());
        fim.setDate(0);
        setDataInicio(inicio.toISOString().split('T')[0]);
        setDataFim(fim.toISOString().split('T')[0]);
        break;
    }
  };

  // Carregar registros
  useEffect(() => {
    calcularDatas();
  }, [dateFilter]);

  const toNum = (val: any): number => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

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
    // banco salva como 'sistema', frontend espera 'sistemaPdv'
    sistemaPdv: toNum(r.sistemaPdv ?? r.sistema),
    diferenca:  toNum(r.diferenca),
    referencia: toNum(r.referencia),
  });

  const carregarRegistros = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      let url = `${apiUrl}/caixa?unitId=${selectedUnit}&dataInicio=${dataInicio}&dataFim=${dataFim}`;
      
      if (selectedUser) {
        url += `&responsavel=${selectedUser}`;
      }
      if (selectedTurno !== 'Todos') {
        url += `&periodo=${selectedTurno}`;
      }

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (Array.isArray(data)) {
        const normalized = data.map(normalizeRegistro);
        setRegistros(normalized);
        processarGraficoData(normalized);
      }
    } catch (error) {
      console.error('Erro ao carregar registros:', error);
    }
  };

  const processarGraficoData = (dados: RegistroCaixa[]) => {
    const grouped: { [key: string]: { total: number; sistema: number; count: number } } = {};

    dados.forEach(registro => {
      if (!grouped[registro.data]) {
        grouped[registro.data] = { total: 0, sistema: 0, count: 0 };
      }
      grouped[registro.data].total += registro.total || 0;
      grouped[registro.data].sistema += registro.sistemaPdv || 0;
      grouped[registro.data].count += 1;
    });

    const grafico = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, valores]) => ({
        data: new Date(data).toLocaleDateString('pt-BR'),
        total: Math.round(valores.total / valores.count),
        sistema: Math.round(valores.sistema / valores.count),
      }));

    setGraficoData(grafico);
  };

  const handleFiltrar = () => {
    carregarRegistros();
  };

  const exportarXLSX = () => {
    const dados = registros.map(r => ({
      'Data': r.data,
      'Hora': r.hora,
      'Turno': r.periodo,
      'Responsável': r.responsavelNome,
      'Abertura': r.abertura,
      'Maq 1': r.maq1,
      'Maq 2': r.maq2,
      'Maq 3': r.maq3,
      'Maq 4': r.maq4,
      'Maq 5': r.maq5,
      'Maq 6': r.maq6,
      'iFood': r.ifood,
      'Dinheiro': r.dinheiro,
      'PIX': r.pix,
      'Fiado': r.fiado,
      'Sangria': r.sangria,
      'Total': r.total,
      'Sistema PDV': r.sistemaPdv,
      'Diferença': r.diferenca,
      'Referência': r.referencia,
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimentos');
    XLSX.writeFile(wb, `movimentos-caixa-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportarCSV = () => {
    const dados = registros.map(r => ({
      'Data': r.data,
      'Hora': r.hora,
      'Turno': r.periodo,
      'Responsável': r.responsavelNome,
      'Abertura': r.abertura,
      'Maq 1': r.maq1,
      'Maq 2': r.maq2,
      'Maq 3': r.maq3,
      'Maq 4': r.maq4,
      'Maq 5': r.maq5,
      'Maq 6': r.maq6,
      'iFood': r.ifood,
      'Dinheiro': r.dinheiro,
      'PIX': r.pix,
      'Fiado': r.fiado,
      'Sangria': r.sangria,
      'Total': r.total,
      'Sistema PDV': r.sistemaPdv,
      'Diferença': r.diferenca,
      'Referência': r.referencia,
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `movimentos-caixa-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div style={styles.container}>
      <h2>📊 Movimentos de Caixa</h2>

      {/* Filtros */}
      <div style={styles.filterSection}>
        {userRole === 'Admin' && (
          <div style={styles.filterGroup}>
            <label style={styles.label}>Unidade:</label>
            <select 
              value={selectedUnit} 
              onChange={(e) => setSelectedUnit(e.target.value)}
              style={styles.select}
            >
              <option value="">Selecione uma unidade</option>
              {unidades.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
        )}

        <div style={styles.filterGroup}>
          <label style={styles.label}>Usuário:</label>
          <select 
            value={selectedUser} 
            onChange={(e) => setSelectedUser(e.target.value)}
            style={styles.select}
          >
            <option value="">Todos</option>
            {usuarios.map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>

        <div style={styles.filterGroup}>
          <label style={styles.label}>Turno:</label>
          <select 
            value={selectedTurno} 
            onChange={(e) => setSelectedTurno(e.target.value)}
            style={styles.select}
          >
            <option value="Todos">Todos</option>
            <option value="Dia">Dia</option>
            <option value="Noite">Noite</option>
          </select>
        </div>

        <div style={styles.filterGroup}>
          <label style={styles.label}>Período:</label>
          <select 
            value={dateFilter} 
            onChange={(e) => setDateFilter(e.target.value)}
            style={styles.select}
          >
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
              <input 
                type="date" 
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.filterGroup}>
              <label style={styles.label}>Data Fim:</label>
              <input 
                type="date" 
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                style={styles.input}
              />
            </div>
          </>
        )}
      </div>

      {/* Botões de ação */}
      <div style={styles.buttonGroup}>
        <button style={styles.button} onClick={handleFiltrar}>
          🔍 Filtrar
        </button>
        <button style={styles.exportButton} onClick={exportarXLSX}>
          📥 Exportar XLSX
        </button>
        <button style={styles.exportButton} onClick={exportarCSV}>
          📥 Exportar CSV
        </button>
      </div>

      {/* Gráfico */}
      {graficoData.length > 0 && (
        <div style={styles.graficoContainer}>
          <h3>Gráfico: Total vs Sistema PDV</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={graficoData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" />
              <YAxis />
              <Tooltip formatter={(value: any) => `R$ ${toNum(value).toFixed(2)}`} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="total" 
                stroke="#8884d8" 
                name="Total"
                strokeWidth={2}
              />
              <Line 
                type="monotone" 
                dataKey="sistema" 
                stroke="#82ca9d" 
                name="Sistema PDV"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Grid */}
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
              <th style={styles.th}>Total</th>
              <th style={styles.th}>Sistema</th>
              <th style={styles.th}>Diferença</th>
              <th style={styles.th}>Referência</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((registro) => (
              <tr key={registro.id} onMouseEnter={(e) => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#f9f9f9'} onMouseLeave={(e) => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'white'}>
                <td style={styles.td}>{registro.data}</td>
                <td style={styles.td}>{registro.hora}</td>
                <td style={styles.td}>{registro.periodo}</td>
                <td style={styles.td}>{registro.responsavelNome || registro.responsavel}</td>
                <td style={styles.td}>R$ {registro.abertura.toFixed(2)}</td>
                <td style={styles.td}>R$ {registro.maq1.toFixed(2)}</td>
                <td style={styles.td}>R$ {registro.maq2.toFixed(2)}</td>
                <td style={styles.td}>R$ {registro.maq3.toFixed(2)}</td>
                <td style={styles.td}>R$ {registro.maq4.toFixed(2)}</td>
                <td style={styles.td}>R$ {registro.maq5.toFixed(2)}</td>
                <td style={styles.td}>R$ {registro.maq6.toFixed(2)}</td>
                <td style={styles.td}>R$ {registro.ifood.toFixed(2)}</td>
                <td style={styles.td}>R$ {registro.dinheiro.toFixed(2)}</td>
                <td style={styles.td}>R$ {registro.pix.toFixed(2)}</td>
                <td style={styles.td}>R$ {registro.fiado.toFixed(2)}</td>
                <td style={styles.td}>R$ {registro.sangria.toFixed(2)}</td>
                <td style={styles.td}><strong>R$ {registro.total.toFixed(2)}</strong></td>
                <td style={styles.td}>R$ {registro.sistemaPdv.toFixed(2)}</td>
                <td style={{...styles.td, color: registro.diferenca < 0 ? 'red' : 'green'}}>
                  R$ {registro.diferenca.toFixed(2)}
                </td>
                <td style={styles.td}>R$ {registro.referencia.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
// Deploy trigger - Mon Mar 30 10:21:29 EDT 2026

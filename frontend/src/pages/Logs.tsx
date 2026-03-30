import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Footer } from '../components/Footer';

export const Logs: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroModulo, setFiltroModulo] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroAcao, setFiltroAcao] = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [logSelecionado, setLogSelecionado] = useState<any>(null);

  useEffect(() => {
    carregarLogs();
  }, []);

  const carregarLogs = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      
      const params = new URLSearchParams();
      if (filtroModulo) params.append('modulo', filtroModulo);
      if (filtroUsuario) params.append('usuario', filtroUsuario);
      if (filtroAcao) params.append('acao', filtroAcao);
      if (filtroDataInicio) params.append('dataInicio', filtroDataInicio);
      if (filtroDataFim) params.append('dataFim', filtroDataFim);

      const response = await fetch(`${apiUrl}/logs?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFiltrar = () => {
    carregarLogs();
  };

  const handleLimparFiltros = () => {
    setFiltroModulo('');
    setFiltroUsuario('');
    setFiltroAcao('');
    setFiltroDataInicio('');
    setFiltroDataFim('');
    setLogs([]);
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString('pt-BR');
  };

  const getCorAcao = (acao: string) => {
    const cores: { [key: string]: string } = {
      'CREATE': '#4CAF50',
      'READ': '#2196F3',
      'UPDATE': '#FF9800',
      'DELETE': '#f44336',
      'EXPORT': '#9C27B0'
    };
    return cores[acao] || '#666';
  };

  const styles = {
    container: { padding: '20px', maxWidth: '1400px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    filtrosSection: { 
      backgroundColor: '#f5f5f5', 
      padding: '20px', 
      borderRadius: '8px', 
      marginBottom: '20px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '15px'
    },
    filtroGroup: { display: 'flex', flexDirection: 'column' as const },
    label: { fontWeight: 'bold', marginBottom: '5px', fontSize: '14px' },
    input: { padding: '8px', border: '1px solid #ddd', borderRadius: '4px' },
    botoesAcao: { display: 'flex', gap: '10px', gridColumn: '1 / -1' },
    botao: { padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
    botaoPrimario: { backgroundColor: '#4CAF50', color: 'white' },
    botaoSecundario: { backgroundColor: '#2196F3', color: 'white' },
    botaoTerciario: { backgroundColor: '#f44336', color: 'white' },
    tabelaContainer: { overflowX: 'auto' as const, marginBottom: '20px' },
    tabela: { width: '100%', borderCollapse: 'collapse' as const, backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden' },
    th: { backgroundColor: '#333', color: 'white', padding: '12px', textAlign: 'left' as const, fontWeight: 'bold' },
    td: { padding: '12px', borderBottom: '1px solid #ddd' },
    trHover: { backgroundColor: '#f9f9f9', cursor: 'pointer' },
    acaoBadge: (acao: string) => ({
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: '4px',
      backgroundColor: getCorAcao(acao),
      color: 'white',
      fontWeight: 'bold',
      fontSize: '12px'
    }),
    statusBadge: (status: string) => ({
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: '4px',
      backgroundColor: status === 'success' ? '#4CAF50' : '#f44336',
      color: 'white',
      fontWeight: 'bold',
      fontSize: '12px'
    }),
    modal: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', maxWidth: '800px', width: '90%', maxHeight: '80vh', overflowY: 'auto' as const },
    jsonViewer: { backgroundColor: '#f5f5f5', padding: '15px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px', overflowX: 'auto' as const, marginTop: '10px', maxHeight: '300px', overflowY: 'auto' as const }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '8px 16px', marginRight: '10px' }}>← Voltar</button>
          <h1>📋 Logs de Auditoria</h1>
        </div>
        <div>
          <span style={{ marginRight: '20px' }}>Usuário: {email}</span>
          <button onClick={logout} style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🚪 Sair</button>
        </div>
      </div>

      <div style={styles.filtrosSection}>
        <div style={styles.filtroGroup}>
          <label style={styles.label}>Módulo:</label>
          <select 
            value={filtroModulo}
            onChange={(e) => setFiltroModulo(e.target.value)}
            style={styles.input}
          >
            <option value="">Todos</option>
            <option value="caixa">Caixa</option>
            <option value="saidas">Saídas</option>
            <option value="colaboradores">Colaboradores</option>
            <option value="escalas">Escalas</option>
            <option value="usuarios">Usuários</option>
          </select>
        </div>

        <div style={styles.filtroGroup}>
          <label style={styles.label}>Usuário:</label>
          <input 
            type="text"
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            placeholder="Email do usuário"
            style={styles.input}
          />
        </div>

        <div style={styles.filtroGroup}>
          <label style={styles.label}>Ação:</label>
          <select 
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value)}
            style={styles.input}
          >
            <option value="">Todas</option>
            <option value="CREATE">CREATE</option>
            <option value="READ">READ</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="EXPORT">EXPORT</option>
          </select>
        </div>

        <div style={styles.filtroGroup}>
          <label style={styles.label}>Data Início:</label>
          <input 
            type="date"
            value={filtroDataInicio}
            onChange={(e) => setFiltroDataInicio(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.filtroGroup}>
          <label style={styles.label}>Data Fim:</label>
          <input 
            type="date"
            value={filtroDataFim}
            onChange={(e) => setFiltroDataFim(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.botoesAcao}>
          <button 
            onClick={handleFiltrar}
            style={{...styles.botao, ...styles.botaoPrimario}}
          >
            🔍 Filtrar
          </button>
          <button 
            onClick={handleLimparFiltros}
            style={{...styles.botao, ...styles.botaoSecundario}}
          >
            🔄 Limpar
          </button>
        </div>
      </div>

      {loading ? (
        <p>Carregando logs...</p>
      ) : logs.length === 0 ? (
        <p>Nenhum log encontrado com os filtros selecionados</p>
      ) : (
        <div style={styles.tabelaContainer}>
          <table style={styles.tabela}>
            <thead>
              <tr style={{backgroundColor: '#333'}}>
                <th style={styles.th}>Data/Hora</th>
                <th style={styles.th}>Módulo</th>
                <th style={styles.th}>Ação</th>
                <th style={styles.th}>Usuário</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.logId} style={styles.trHover}>
                  <td style={styles.td}>{formatarData(log.timestamp)}</td>
                  <td style={styles.td}><strong>{log.modulo}</strong></td>
                  <td style={styles.td}>
                    <span style={styles.acaoBadge(log.acao)}>{log.acao}</span>
                  </td>
                  <td style={styles.td}>{log.usuario}</td>
                  <td style={styles.td}>
                    <span style={styles.statusBadge(log.status)}>{log.status}</span>
                  </td>
                  <td style={styles.td}>
                    <button 
                      onClick={() => setLogSelecionado(log)}
                      style={{padding: '4px 8px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}
                    >
                      👁️ Ver Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logSelecionado && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2>Detalhes do Log</h2>
            <div>
              <p><strong>ID:</strong> {logSelecionado.logId}</p>
              <p><strong>Data/Hora:</strong> {formatarData(logSelecionado.timestamp)}</p>
              <p><strong>Módulo:</strong> {logSelecionado.modulo}</p>
              <p><strong>Ação:</strong> <span style={styles.acaoBadge(logSelecionado.acao)}>{logSelecionado.acao}</span></p>
              <p><strong>Usuário:</strong> {logSelecionado.usuario}</p>
              <p><strong>Unidade:</strong> {logSelecionado.unitId}</p>
              <p><strong>Status:</strong> <span style={styles.statusBadge(logSelecionado.status)}>{logSelecionado.status}</span></p>
              
              {logSelecionado.erro && (
                <div>
                  <p><strong>Erro:</strong></p>
                  <div style={styles.jsonViewer}>{logSelecionado.erro}</div>
                </div>
              )}

              <p><strong>Dados da Transação:</strong></p>
              <div style={styles.jsonViewer}>
                {JSON.stringify(JSON.parse(logSelecionado.dados), null, 2)}
              </div>

              {logSelecionado.dadosAntigos && (
                <div>
                  <p><strong>Dados Anteriores (antes da alteração):</strong></p>
                  <div style={styles.jsonViewer}>
                    {JSON.stringify(JSON.parse(logSelecionado.dadosAntigos), null, 2)}
                  </div>
                </div>
              )}
            </div>

            <div style={{marginTop: '20px'}}>
              <button 
                onClick={() => setLogSelecionado(null)}
                style={{padding: '10px 20px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer showLinks={true} />
    </div>
  );
};

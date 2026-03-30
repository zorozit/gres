import React, { useState, useEffect } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

interface Colaborador {
  id: string;
  unitId: string;
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  tipoContrato: 'CLT' | 'Freelancer';
  valorDia: number;
  valorNoite: number;
  valorTransporte: number;
  valeAlimentacao: boolean;
  tipo: string;
  diasDisponiveis: string[];
  podeTrabalharDia: boolean;
  podeTrabalharNoite: boolean;
  ativo: boolean;
}

interface Transacao {
  id: string;
  favorecido: string;
  valor: number;
  referencia: string;
  data: string;
  turno: string;
  descricao: string;
}

interface FolhaPagamento {
  colaboradorId: string;
  nome: string;
  cpf: string;
  telefone: string;
  pix: string;
  tipoContrato: string;
  
  // Horas trabalhadas
  diasTrabalhados: number;
  noitesTrabalhadas: number;
  
  // Valores
  valorDia: number;
  valorNoite: number;
  valorTransporte: number;
  
  // Cálculos
  totalDias: number;
  totalNoites: number;
  totalTransporte: number;
  
  // Transações
  caixinha: number;
  adiantamentos: number;
  gastos: number;
  retiradaSangria: number;
  
  // Total
  totalBruto: number;
  totalDescontos: number;
  totalLiquido: number;
  
  // Status
  pago: boolean;
  dataPagamento?: string;
}

export default function FolhaPagamento() {
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const userUnitId = (user as any)?.unitId || '';
  const unitId = activeUnit?.id || userUnitId || '';
  
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [folhas, setFolhas] = useState<FolhaPagamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [mesAno, setMesAno] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pago' | 'pendente'>('pendente');

  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  useEffect(() => {
    if (unitId) {
      carregarDados();
    }
  }, [unitId, mesAno]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      
      // Carregar colaboradores
      const respColaboradores = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (respColaboradores.ok) {
        const data = await respColaboradores.json();
        setColaboradores(Array.isArray(data) ? data : []);
      }
      
      // Carregar transações do mês
      const respTransacoes = await fetch(`${apiUrl}/saidas?unitId=${unitId}&mes=${mesAno}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (respTransacoes.ok) {
        const data = await respTransacoes.json();
        setTransacoes(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const calcularFolhas = () => {
    const novasFolhas: FolhaPagamento[] = [];

    colaboradores.forEach(colab => {
      // Contar dias e noites trabalhadas
      let diasTrabalhados = 0;
      let noitesTrabalhadas = 0;

      // Aqui você pode adicionar lógica para contar a partir de escalas
      // Por enquanto, vamos usar um exemplo simples

      // Calcular transações do colaborador
      const transacoesColab = transacoes.filter(t => 
        t.favorecido.toLowerCase().includes(colab.nome.toLowerCase())
      );

      let caixinha = 0;
      let adiantamentos = 0;
      let gastos = 0;
      let retiradaSangria = 0;

      transacoesColab.forEach(t => {
        if (t.referencia.toLowerCase().includes('caixinha')) {
          caixinha += t.valor;
        } else if (t.referencia.toLowerCase().includes('adiantamento')) {
          adiantamentos += t.valor;
        } else if (t.referencia.toLowerCase().includes('gasto') || t.referencia.toLowerCase().includes('a pagar')) {
          gastos += t.valor;
        } else if (t.descricao.toLowerCase().includes('sangria')) {
          retiradaSangria += t.valor;
        }
      });

      const totalDias = diasTrabalhados * colab.valorDia;
      const totalNoites = noitesTrabalhadas * colab.valorNoite;
      const totalTransporte = (diasTrabalhados + noitesTrabalhadas) * (colab.valorTransporte / 2); // Ida e volta

      const totalBruto = totalDias + totalNoites + totalTransporte;
      const totalDescontos = caixinha + adiantamentos + gastos;
      const totalLiquido = totalBruto - totalDescontos + retiradaSangria;

      novasFolhas.push({
        colaboradorId: colab.id,
        nome: colab.nome,
        cpf: colab.cpf,
        telefone: colab.telefone,
        pix: colab.email, // Usar email como placeholder para PIX
        tipoContrato: colab.tipoContrato,
        diasTrabalhados,
        noitesTrabalhadas,
        valorDia: colab.valorDia,
        valorNoite: colab.valorNoite,
        valorTransporte: colab.valorTransporte,
        totalDias,
        totalNoites,
        totalTransporte,
        caixinha,
        adiantamentos,
        gastos,
        retiradaSangria,
        totalBruto,
        totalDescontos,
        totalLiquido,
        pago: false,
      });
    });

    setFolhas(novasFolhas);
  };

  useEffect(() => {
    if (colaboradores.length > 0) {
      calcularFolhas();
    }
  }, [colaboradores, transacoes, mesAno]);

  const folhasFiltradas = folhas.filter(f => {
    if (filtroStatus === 'pago') return f.pago;
    if (filtroStatus === 'pendente') return !f.pago;
    return true;
  });

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor);
  };

  const handleMarcarPago = (colaboradorId: string) => {
    setFolhas(folhas.map(f => 
      f.colaboradorId === colaboradorId 
        ? { ...f, pago: !f.pago, dataPagamento: new Date().toISOString().split('T')[0] }
        : f
    ));
  };

  const totalGeral = folhasFiltradas.reduce((sum, f) => sum + f.totalLiquido, 0);

  return (
    <div style={styles.pageWrapper}>
      <Header title="💰 Folha de Pagamento" showBack={true} />
      <div style={styles.container}>
        
        {/* FILTROS */}
        <div style={styles.filtrosContainer}>
          <div style={styles.formGroup}>
            <label>Mês/Ano:</label>
            <input 
              type="month"
              value={mesAno}
              onChange={(e) => setMesAno(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label>Status:</label>
            <select 
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as any)}
              style={styles.input}
            >
              <option value="todos">Todos</option>
              <option value="pago">Pagos</option>
              <option value="pendente">Pendentes</option>
            </select>
          </div>
        </div>

        {/* TABELA */}
        {loading ? (
          <p>Carregando dados...</p>
        ) : folhasFiltradas.length === 0 ? (
          <p>Nenhum colaborador encontrado para este período.</p>
        ) : (
          <>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.headerRow}>
                    <th style={styles.th}>Nome</th>
                    <th style={styles.th}>CPF</th>
                    <th style={styles.th}>Tipo</th>
                    <th style={styles.th}>Dias</th>
                    <th style={styles.th}>Noites</th>
                    <th style={styles.th}>Total Bruto</th>
                    <th style={styles.th}>Descontos</th>
                    <th style={styles.th}>Sangria</th>
                    <th style={styles.th}>Total Líquido</th>
                    <th style={styles.th}>PIX</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {folhasFiltradas.map((folha, idx) => (
                    <tr key={folha.colaboradorId} style={{...styles.row, backgroundColor: idx % 2 === 0 ? '#f9f9f9' : 'white'}}>
                      <td style={styles.td}>{folha.nome}</td>
                      <td style={styles.td}>{folha.cpf}</td>
                      <td style={styles.td}>{folha.tipoContrato}</td>
                      <td style={styles.td}>{folha.diasTrabalhados}</td>
                      <td style={styles.td}>{folha.noitesTrabalhadas}</td>
                      <td style={{...styles.td, fontWeight: 'bold'}}>{formatarMoeda(folha.totalBruto)}</td>
                      <td style={{...styles.td, color: '#dc3545'}}>{formatarMoeda(folha.totalDescontos)}</td>
                      <td style={{...styles.td, color: '#28a745'}}>{formatarMoeda(folha.retiradaSangria)}</td>
                      <td style={{...styles.td, fontWeight: 'bold', backgroundColor: folha.totalLiquido > 0 ? '#d4edda' : '#f8d7da'}}>{formatarMoeda(folha.totalLiquido)}</td>
                      <td style={styles.td}>
                        <button 
                          onClick={() => navigator.clipboard.writeText(folha.pix)}
                          style={styles.botaoPix}
                          title="Copiar PIX"
                        >
                          📋 Copiar
                        </button>
                      </td>
                      <td style={styles.td}>
                        <span style={{...styles.badge, backgroundColor: folha.pago ? '#28a745' : '#ffc107'}}>
                          {folha.pago ? '✅ Pago' : '⏳ Pendente'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <button 
                          onClick={() => handleMarcarPago(folha.colaboradorId)}
                          style={{...styles.botao, backgroundColor: folha.pago ? '#dc3545' : '#28a745'}}
                        >
                          {folha.pago ? 'Desfazer' : 'Marcar Pago'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* RESUMO */}
            <div style={styles.resumo}>
              <div style={styles.resumoItem}>
                <span style={styles.resumoLabel}>Total a Pagar (Mês):</span>
                <span style={{...styles.resumoValor, color: '#dc3545', fontSize: '20px', fontWeight: 'bold'}}>
                  {formatarMoeda(totalGeral)}
                </span>
              </div>
              <div style={styles.resumoItem}>
                <span style={styles.resumoLabel}>Colaboradores:</span>
                <span style={styles.resumoValor}>{folhasFiltradas.length}</span>
              </div>
            </div>
          </>
        )}
      </div>
      <Footer showLinks={true} />
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  pageWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100vh',
  } as React.CSSProperties,
  container: {
    padding: '20px',
    maxWidth: '1600px',
    margin: '0 auto',
    width: '100%',
    flex: 1,
  },
  filtrosContainer: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '5px',
  },
  input: {
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px',
    minWidth: '150px',
  },
  tableWrapper: {
    overflowX: 'auto',
    marginBottom: '20px',
    border: '1px solid #ddd',
    borderRadius: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  headerRow: {
    backgroundColor: '#007bff',
    color: 'white',
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    fontWeight: 'bold',
    borderRight: '1px solid #0056b3',
  },
  row: {
    borderBottom: '1px solid #ddd',
  },
  td: {
    padding: '12px',
    borderRight: '1px solid #eee',
  },
  botaoPix: {
    padding: '6px 12px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  badge: {
    padding: '6px 12px',
    borderRadius: '4px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 'bold',
    display: 'inline-block',
  },
  botao: {
    padding: '6px 12px',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  resumo: {
    display: 'flex',
    gap: '30px',
    padding: '20px',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    border: '2px solid #007bff',
  },
  resumoItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '5px',
  },
  resumoLabel: {
    fontSize: '14px',
    color: '#666',
    fontWeight: 'bold',
  },
  resumoValor: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#007bff',
  },
};

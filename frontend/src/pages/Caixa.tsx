import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';
import '../styles/ModuleDetail.css';

interface Movimento {
  id: string;
  tipo: 'abertura' | 'recebimento' | 'sangria' | 'reforço' | 'fechamento';
  valor: number;
  descricao: string;
  data: string;
  hora: string;
  saldoAnterior?: number;
  saldoAtual?: number;
}

export const Caixa: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout, token } = useAuth();
  const { activeUnit } = useUnit();
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [caixaAberto, setCaixaAberto] = useState(false);
  const [saldoAtual, setSaldoAtual] = useState(0);
  const [formData, setFormData] = useState({
    tipo: 'recebimento',
    valor: '',
    descricao: ''
  });

  useEffect(() => {
    if (token && activeUnit) {
      fetchMovimentos();
      verificarCaixaAberto();
    }
  }, [activeUnit, token]);

  const fetchMovimentos = async () => {
    if (!token || !activeUnit) return;
    setLoading(true);
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/caixa?unitId=${activeUnit.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      const movs = Array.isArray(data) ? data : [];
      setMovimentos(movs);
      
      // Calcular saldo atual
      if (movs.length > 0) {
        const ultimoMovimento = movs[movs.length - 1];
        setSaldoAtual(ultimoMovimento.saldoAtual || 0);
        setCaixaAberto(ultimoMovimento.tipo !== 'fechamento');
      }
    } catch (error) {
      console.error('Erro ao buscar movimentos:', error);
    } finally {
      setLoading(false);
    }
  };

  const verificarCaixaAberto = async () => {
    if (!token || !activeUnit) return;
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/caixa?unitId=${activeUnit.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      const movs = Array.isArray(data) ? data : [];
      
      if (movs.length > 0) {
        const ultimoMovimento = movs[movs.length - 1];
        setCaixaAberto(ultimoMovimento.tipo !== 'fechamento');
      }
    } catch (error) {
      console.error('Erro ao verificar caixa:', error);
    }
  };

  const handleAbertura = async () => {
    if (!token || !activeUnit) {
      alert('Selecione uma unidade primeiro');
      return;
    }

    const saldoInicial = prompt('Informe o saldo inicial do caixa:');
    if (saldoInicial === null) return;

    const valor = parseFloat(saldoInicial);
    if (isNaN(valor)) {
      alert('Valor inválido');
      return;
    }

    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const agora = new Date();
      const response = await fetch(`${apiEndpoint}/caixa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tipo: 'abertura',
          valor: valor,
          descricao: 'Abertura de caixa',
          unitId: activeUnit.id,
          data: agora.toISOString().split('T')[0],
          hora: agora.toTimeString().split(' ')[0],
          saldoAnterior: 0,
          saldoAtual: valor
        })
      });

      if (response.ok) {
        setCaixaAberto(true);
        setSaldoAtual(valor);
        fetchMovimentos();
        alert('Caixa aberto com sucesso!');
      } else {
        alert('Erro ao abrir caixa');
      }
    } catch (error) {
      console.error('Erro ao abrir caixa:', error);
      alert('Erro ao abrir caixa');
    }
  };

  const handleLancamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !activeUnit || !caixaAberto) {
      alert('Abra o caixa primeiro');
      return;
    }

    const valor = parseFloat(formData.valor);
    if (isNaN(valor) || valor <= 0) {
      alert('Valor inválido');
      return;
    }

    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const agora = new Date();
      
      // Calcular novo saldo
      let novoSaldo = saldoAtual;
      if (formData.tipo === 'recebimento' || formData.tipo === 'reforço') {
        novoSaldo += valor;
      } else if (formData.tipo === 'sangria') {
        novoSaldo -= valor;
      }

      const response = await fetch(`${apiEndpoint}/caixa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tipo: formData.tipo,
          valor: valor,
          descricao: formData.descricao,
          unitId: activeUnit.id,
          data: agora.toISOString().split('T')[0],
          hora: agora.toTimeString().split(' ')[0],
          saldoAnterior: saldoAtual,
          saldoAtual: novoSaldo
        })
      });

      if (response.ok) {
        setSaldoAtual(novoSaldo);
        setFormData({
          tipo: 'recebimento',
          valor: '',
          descricao: ''
        });
        fetchMovimentos();
        alert('Lançamento registrado com sucesso!');
      } else {
        alert('Erro ao registrar lançamento');
      }
    } catch (error) {
      console.error('Erro ao lançar:', error);
      alert('Erro ao registrar lançamento');
    }
  };

  const handleFechamento = async () => {
    if (!token || !activeUnit || !caixaAberto) {
      alert('Caixa não está aberto');
      return;
    }

    const saldoFinal = prompt('Informe o saldo final do caixa:');
    if (saldoFinal === null) return;

    const valor = parseFloat(saldoFinal);
    if (isNaN(valor)) {
      alert('Valor inválido');
      return;
    }

    const diferenca = valor - saldoAtual;

    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const agora = new Date();
      const response = await fetch(`${apiEndpoint}/caixa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tipo: 'fechamento',
          valor: valor,
          descricao: `Fechamento de caixa - Diferença: R$ ${diferenca.toFixed(2)}`,
          unitId: activeUnit.id,
          data: agora.toISOString().split('T')[0],
          hora: agora.toTimeString().split(' ')[0],
          saldoAnterior: saldoAtual,
          saldoAtual: valor
        })
      });

      if (response.ok) {
        setCaixaAberto(false);
        setSaldoAtual(0);
        fetchMovimentos();
        alert(`Caixa fechado com sucesso!\nDiferença: R$ ${diferenca.toFixed(2)}`);
      } else {
        alert('Erro ao fechar caixa');
      }
    } catch (error) {
      console.error('Erro ao fechar caixa:', error);
      alert('Erro ao fechar caixa');
    }
  };

  // Calcular totais
  const totais = movimentos.reduce((acc, mov) => {
    if (mov.tipo === 'recebimento' || mov.tipo === 'reforço') {
      acc.entradas += mov.valor;
    } else if (mov.tipo === 'sangria') {
      acc.saidas += mov.valor;
    }
    return acc;
  }, { entradas: 0, saidas: 0 });

  return (
    <div className="module-detail-container">
      <header className="module-header">
        <div className="header-left">
          <button onClick={() => navigate('/modulos')} className="back-button">← Voltar</button>
          <h1>💰 Controle de Caixa</h1>
          {activeUnit && <span className="unit-badge">Unidade: {activeUnit.nome}</span>}
        </div>
        <div className="header-right">
          <span className="user-info">👤 {email}</span>
          <button onClick={logout} className="logout-button">Sair</button>
        </div>
      </header>

      <main className="module-main">
        <div className="module-content">
          {/* Status do Caixa */}
          <section className="status-section">
            <div className="status-card">
              <h3>Status do Caixa</h3>
              <p className={`status-badge ${caixaAberto ? 'aberto' : 'fechado'}`}>
                {caixaAberto ? '🟢 ABERTO' : '🔴 FECHADO'}
              </p>
              <p className="saldo">Saldo Atual: <strong>R$ {saldoAtual.toFixed(2)}</strong></p>
              <div className="button-group">
                <button 
                  onClick={handleAbertura} 
                  disabled={caixaAberto}
                  className="open-button"
                >
                  Abrir Caixa
                </button>
                <button 
                  onClick={handleFechamento} 
                  disabled={!caixaAberto}
                  className="close-button"
                >
                  Fechar Caixa
                </button>
              </div>
            </div>

            <div className="totais-card">
              <h3>Resumo do Dia</h3>
              <div className="totais-grid">
                <div className="total-item">
                  <span>Entradas:</span>
                  <strong className="entrada">R$ {totais.entradas.toFixed(2)}</strong>
                </div>
                <div className="total-item">
                  <span>Saídas:</span>
                  <strong className="saida">R$ {totais.saidas.toFixed(2)}</strong>
                </div>
                <div className="total-item">
                  <span>Líquido:</span>
                  <strong className="liquido">R$ {(totais.entradas - totais.saidas).toFixed(2)}</strong>
                </div>
              </div>
            </div>
          </section>

          {/* Formulário de Lançamento */}
          {caixaAberto && (
            <section className="form-section">
              <h2>Registrar Lançamento</h2>
              <form onSubmit={handleLancamento} className="data-form">
                <div className="form-group">
                  <label>Tipo de Lançamento *</label>
                  <select
                    value={formData.tipo}
                    onChange={(e) => setFormData({...formData, tipo: e.target.value as any})}
                  >
                    <option value="recebimento">Recebimento</option>
                    <option value="sangria">Sangria</option>
                    <option value="reforço">Reforço</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Valor *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.valor}
                    onChange={(e) => setFormData({...formData, valor: e.target.value})}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Descrição</label>
                  <input
                    type="text"
                    value={formData.descricao}
                    onChange={(e) => setFormData({...formData, descricao: e.target.value})}
                    placeholder="Descrição do lançamento"
                  />
                </div>

                <button type="submit" className="submit-button">Registrar Lançamento</button>
              </form>
            </section>
          )}

          {/* Grid de Movimentos */}
          <section className="list-section">
            <h2>Movimentos do Mês</h2>
            {loading ? (
              <p>Carregando...</p>
            ) : movimentos.length === 0 ? (
              <p>Nenhum movimento registrado</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Hora</th>
                    <th>Tipo</th>
                    <th>Descrição</th>
                    <th>Valor</th>
                    <th>Saldo Anterior</th>
                    <th>Saldo Atual</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((mov) => (
                    <tr key={mov.id} className={`tipo-${mov.tipo}`}>
                      <td>{mov.data}</td>
                      <td>{mov.hora}</td>
                      <td>
                        <span className={`tipo-badge ${mov.tipo}`}>
                          {mov.tipo === 'abertura' && '🟢 Abertura'}
                          {mov.tipo === 'recebimento' && '⬆️ Recebimento'}
                          {mov.tipo === 'sangria' && '⬇️ Sangria'}
                          {mov.tipo === 'reforço' && '⬆️ Reforço'}
                          {mov.tipo === 'fechamento' && '🔴 Fechamento'}
                        </span>
                      </td>
                      <td>{mov.descricao}</td>
                      <td className={mov.tipo === 'sangria' ? 'valor-negativo' : 'valor-positivo'}>
                        {mov.tipo === 'sangria' ? '-' : '+'} R$ {mov.valor.toFixed(2)}
                      </td>
                      <td>R$ {(mov.saldoAnterior || 0).toFixed(2)}</td>
                      <td><strong>R$ {(mov.saldoAtual || 0).toFixed(2)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </main>

      <style>{`
        .status-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
        }

        .status-card, .totais-card {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .status-badge {
          font-size: 18px;
          font-weight: bold;
          padding: 10px;
          border-radius: 4px;
          margin: 10px 0;
          display: inline-block;
        }

        .status-badge.aberto {
          background: #d4edda;
          color: #155724;
        }

        .status-badge.fechado {
          background: #f8d7da;
          color: #721c24;
        }

        .saldo {
          font-size: 16px;
          margin: 15px 0;
        }

        .button-group {
          display: flex;
          gap: 10px;
          margin-top: 15px;
        }

        .open-button, .close-button {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          transition: opacity 0.3s;
        }

        .open-button {
          background: #28a745;
          color: white;
        }

        .open-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .close-button {
          background: #dc3545;
          color: white;
        }

        .close-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .totais-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .total-item {
          display: flex;
          justify-content: space-between;
          padding: 10px;
          background: #f5f5f5;
          border-radius: 4px;
        }

        .entrada { color: #28a745; }
        .saida { color: #dc3545; }
        .liquido { color: #007bff; }

        .tipo-badge {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
        }

        .tipo-badge.abertura { background: #d4edda; color: #155724; }
        .tipo-badge.recebimento { background: #cfe2ff; color: #084298; }
        .tipo-badge.sangria { background: #f8d7da; color: #721c24; }
        .tipo-badge.reforço { background: #fff3cd; color: #664d03; }
        .tipo-badge.fechamento { background: #e2e3e5; color: #383d41; }

        .valor-positivo { color: #28a745; font-weight: bold; }
        .valor-negativo { color: #dc3545; font-weight: bold; }

        @media (max-width: 768px) {
          .status-section {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';
import '../styles/ModuleDetail.css';

interface CaixaMovimento {
  id: string;
  tipo: 'abertura' | 'recebimento' | 'sangria' | 'reforço' | 'fechamento';
  tipoRecebimento?: string;
  valor: number;
  descricao: string;
  data: string;
  turno: string;
  saldoAnterior?: number;
  saldoAtual: number;
}

const TIPOS_RECEBIMENTO = [
  { value: 'dinheiro', label: '💵 Dinheiro' },
  { value: 'pix', label: '📱 PIX' },
  { value: 'ifood', label: '🍔 iFood' },
  { value: 'cartao_1', label: '💳 Máquina 1' },
  { value: 'cartao_2', label: '💳 Máquina 2' },
  { value: 'cartao_3', label: '💳 Máquina 3' },
  { value: 'cartao_4', label: '💳 Máquina 4' },
  { value: 'cartao_5', label: '💳 Máquina 5' },
  { value: 'cartao_6', label: '💳 Máquina 6' },
  { value: 'outros', label: '📦 Outros' }
];

export const Caixa: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout, token } = useAuth();
  const { activeUnit } = useUnit();
  const [movimentos, setMovimentos] = useState<CaixaMovimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [caixaAberto, setCaixaAberto] = useState(false);
  const [saldoAtual, setSaldoAtual] = useState(0);
  const [turnoAtivo, setTurnoAtivo] = useState('manhã');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<CaixaMovimento>>({});
  const [dataSelecionada, setDataSelecionada] = useState(new Date().toISOString().split('T')[0]);
  const [formData, setFormData] = useState({
    tipo: 'recebimento',
    tipoRecebimento: 'dinheiro',
    valor: '',
    descricao: ''
  });

  useEffect(() => {
    if (token && activeUnit) {
      fetchMovimentos();
    }
  }, [activeUnit, token, dataSelecionada]);

  const fetchMovimentos = async () => {
    if (!token || !activeUnit) return;
    setLoading(true);
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/caixa?unitId=${activeUnit.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        console.error('Erro na resposta:', response.status);
        return;
      }

      const data = await response.json();
      console.log('Dados recebidos:', data);
      
      let movs: CaixaMovimento[] = [];
      if (Array.isArray(data)) {
        movs = data;
      } else if (data && Array.isArray(data.data)) {
        movs = data.data;
      } else if (data && typeof data === 'object') {
        const valores = Object.values(data);
        if (Array.isArray(valores[0])) {
          movs = valores[0];
        }
      }

      // Filtrar por data selecionada
      const movsFiltrados = movs.filter(m => m.data === dataSelecionada);
      console.log('Movimentos filtrados:', movsFiltrados);
      setMovimentos(movsFiltrados);
      
      // Calcular saldo atual
      if (movsFiltrados.length > 0) {
        const ultimoMovimento = movsFiltrados[movsFiltrados.length - 1];
        setSaldoAtual(ultimoMovimento.saldoAtual || 0);
        setCaixaAberto(ultimoMovimento.tipo !== 'fechamento');
        setTurnoAtivo(ultimoMovimento.turno || 'manhã');
      } else {
        setCaixaAberto(false);
        setSaldoAtual(0);
      }
    } catch (error) {
      console.error('Erro ao buscar movimentos:', error);
    } finally {
      setLoading(false);
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
          data: dataSelecionada,
          turno: turnoAtivo,
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
      
      // Calcular novo saldo
      let novoSaldo = saldoAtual;
      if (formData.tipo === 'recebimento' || formData.tipo === 'reforço') {
        novoSaldo += valor;
      } else if (formData.tipo === 'sangria') {
        novoSaldo -= valor;
      }

      // Preparar descrição
      let descricao = formData.descricao;
      if (formData.tipo === 'recebimento') {
        const tipoLabel = TIPOS_RECEBIMENTO.find(t => t.value === formData.tipoRecebimento)?.label || formData.tipoRecebimento;
        descricao = `${tipoLabel} - ${formData.descricao}`;
      }

      const response = await fetch(`${apiEndpoint}/caixa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tipo: formData.tipo,
          tipoRecebimento: formData.tipo === 'recebimento' ? formData.tipoRecebimento : undefined,
          valor: valor,
          descricao: descricao,
          unitId: activeUnit.id,
          data: dataSelecionada,
          turno: turnoAtivo,
          saldoAnterior: saldoAtual,
          saldoAtual: novoSaldo
        })
      });

      if (response.ok) {
        setSaldoAtual(novoSaldo);
        setFormData({
          tipo: 'recebimento',
          tipoRecebimento: 'dinheiro',
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
          data: dataSelecionada,
          turno: turnoAtivo,
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

  const handleEditar = (movimento: CaixaMovimento) => {
    setEditandoId(movimento.id);
    setEditData({ ...movimento });
  };

  const handleSalvarEdicao = async () => {
    if (!token || !editandoId) return;

    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
      const response = await fetch(`${apiEndpoint}/caixa/${editandoId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          valor: editData.valor,
          descricao: editData.descricao,
          saldoAtual: editData.saldoAtual
        })
      });

      if (response.ok) {
        setEditandoId(null);
        setEditData({});
        fetchMovimentos();
        alert('Movimento atualizado com sucesso!');
      } else {
        const errorData = await response.json();
        console.error('Erro:', errorData);
        alert('Erro ao atualizar movimento: ' + (errorData.error || 'Desconhecido'));
      }
    } catch (error) {
      console.error('Erro ao salvar edição:', error);
      alert('Erro ao atualizar movimento');
    }
  };

  const handleCancelarEdicao = () => {
    setEditandoId(null);
    setEditData({});
  };

  // Calcular totais por tipo de recebimento
  const totaisPorTipo = movimentos
    .filter(m => m.tipo === 'recebimento')
    .reduce((acc, mov) => {
      const tipo = mov.tipoRecebimento || 'outros';
      acc[tipo] = (acc[tipo] || 0) + mov.valor;
      return acc;
    }, {} as Record<string, number>);

  // Calcular totais gerais
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
          {/* Seletor de Data */}
          <section className="date-selector">
            <label>Selecione a Data:</label>
            <input
              type="date"
              value={dataSelecionada}
              onChange={(e) => setDataSelecionada(e.target.value)}
              className="date-input"
            />
          </section>

          {/* Status do Caixa */}
          <section className="status-section">
            <div className="status-card">
              <h3>Status do Caixa</h3>
              <p className={`status-badge ${caixaAberto ? 'aberto' : 'fechado'}`}>
                {caixaAberto ? '🟢 ABERTO' : '🔴 FECHADO'}
              </p>
              <p className="turno">Turno: <strong>{turnoAtivo.toUpperCase()}</strong></p>
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

          {/* Resumo por Tipo de Recebimento */}
          {Object.keys(totaisPorTipo).length > 0 && (
            <section className="resumo-tipos">
              <h3>Recebimentos por Tipo</h3>
              <div className="tipos-grid">
                {TIPOS_RECEBIMENTO.map(tipo => (
                  totaisPorTipo[tipo.value] && (
                    <div key={tipo.value} className="tipo-item">
                      <span>{tipo.label}</span>
                      <strong>R$ {totaisPorTipo[tipo.value].toFixed(2)}</strong>
                    </div>
                  )
                ))}
              </div>
            </section>
          )}

          {/* Formulário de Lançamento */}
          {caixaAberto && (
            <section className="form-section">
              <h2>Registrar Lançamento</h2>
              <form onSubmit={handleLancamento} className="data-form">
                <div className="form-group">
                  <label>Tipo de Lançamento *</label>
                  <select
                    value={formData.tipo}
                    onChange={(e) => {
                      setFormData({...formData, tipo: e.target.value});
                      if (e.target.value !== 'recebimento') {
                        setFormData(prev => ({...prev, tipoRecebimento: 'dinheiro'}));
                      }
                    }}
                  >
                    <option value="recebimento">Recebimento</option>
                    <option value="sangria">Sangria</option>
                    <option value="reforço">Reforço</option>
                  </select>
                </div>

                {formData.tipo === 'recebimento' && (
                  <div className="form-group">
                    <label>Tipo de Recebimento *</label>
                    <select
                      value={formData.tipoRecebimento}
                      onChange={(e) => setFormData({...formData, tipoRecebimento: e.target.value})}
                    >
                      {TIPOS_RECEBIMENTO.map(tipo => (
                        <option key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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
            <h2>Movimentos de {dataSelecionada} ({movimentos.length})</h2>
            {loading ? (
              <p>Carregando...</p>
            ) : movimentos.length === 0 ? (
              <p>Nenhum movimento registrado para esta data</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Descrição</th>
                    <th>Valor</th>
                    <th>Saldo Anterior</th>
                    <th>Saldo Atual</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((mov) => (
                    <tr key={mov.id} className={`tipo-${mov.tipo}`}>
                      {editandoId === mov.id ? (
                        <>
                          <td>
                            <input
                              type="text"
                              value={editData.tipo || ''}
                              disabled
                              className="edit-input"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={editData.descricao || ''}
                              onChange={(e) => setEditData({...editData, descricao: e.target.value})}
                              className="edit-input"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              value={editData.valor || ''}
                              onChange={(e) => setEditData({...editData, valor: parseFloat(e.target.value)})}
                              className="edit-input"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              value={editData.saldoAnterior || ''}
                              disabled
                              className="edit-input"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              value={editData.saldoAtual || ''}
                              onChange={(e) => setEditData({...editData, saldoAtual: parseFloat(e.target.value)})}
                              className="edit-input"
                            />
                          </td>
                          <td className="acoes">
                            <button onClick={handleSalvarEdicao} className="btn-salvar">✓</button>
                            <button onClick={handleCancelarEdicao} className="btn-cancelar">✗</button>
                          </td>
                        </>
                      ) : (
                        <>
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
                          <td className="acoes">
                            <button onClick={() => handleEditar(mov)} className="btn-editar">✏️ Editar</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </main>

      <style>{`
        .date-selector {
          background: white;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .date-input {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .status-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
        }

        .status-card, .totais-card, .resumo-tipos {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .resumo-tipos {
          grid-column: 1 / -1;
          margin-bottom: 30px;
        }

        .tipos-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
          margin-top: 15px;
        }

        .tipo-item {
          background: #f5f5f5;
          padding: 10px;
          border-radius: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .tipo-item strong {
          color: #007bff;
          font-weight: bold;
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

        .turno {
          font-size: 14px;
          margin: 10px 0;
          color: #666;
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

        .acoes {
          display: flex;
          gap: 5px;
        }

        .btn-editar, .btn-salvar, .btn-cancelar {
          padding: 5px 10px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
        }

        .btn-editar {
          background: #007bff;
          color: white;
        }

        .btn-salvar {
          background: #28a745;
          color: white;
        }

        .btn-cancelar {
          background: #dc3545;
          color: white;
        }

        .edit-input {
          width: 100%;
          padding: 5px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 12px;
        }

        .edit-input:disabled {
          background: #f5f5f5;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .status-section {
            grid-template-columns: 1fr;
          }
          .tipos-grid {
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          }
          .data-table {
            font-size: 12px;
          }
        }
      `}</style>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useUnit } from '../contexts/UnitContext';

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
  { value: 'outros', label: '📦 Outros' },
];

interface Movimento {
  id: string;
  tipo: 'abertura' | 'recebimento' | 'sangria' | 'reforço' | 'fechamento';
  tipoRecebimento?: string;
  descricao: string;
  valor: number;
  saldoAnterior: number;
  saldoAtual: number;
  data: string;
  unitId: string;
}

export default function Caixa() {
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || '';
  const unitName = activeUnit?.nome || 'Unidade não selecionada';
  const [dataSelecionada, setDataSelecionada] = useState(new Date().toISOString().split('T')[0]);
  const [caixaAberto, setCaixaAberto] = useState(false);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Movimento>>({});
  
  const [formData, setFormData] = useState({
    tipoLancamento: 'recebimento',
    tipoRecebimento: 'dinheiro',
    valor: '',
    descricao: '',
  });

  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://xmv7n047i6.execute-api.us-east-1.amazonaws.com';

  // Carregar movimentos ao mudar data ou unidade
  useEffect(() => {
    if (unitId) {
      carregarMovimentos();
    }
  }, [dataSelecionada, unitId]);

  const carregarMovimentos = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/caixa?unitId=${unitId}&data=${dataSelecionada}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const movimentosArray = (Array.isArray(data) ? data : data.movimentos || []) as Movimento[];
        setMovimentos(movimentosArray);
        
        // Verificar se caixa está aberto
        const abertura = movimentosArray.find(m => m.tipo === 'abertura');
        const fechamento = movimentosArray.find(m => m.tipo === 'fechamento');
        setCaixaAberto(!!abertura && !fechamento);
      }
    } catch (error) {
      console.error('Erro ao carregar movimentos:', error);
    }
    setLoading(false);
  };

  const abrirCaixa = async () => {
    const valor = prompt('Informe o saldo inicial do caixa:');
    if (!valor) return;

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/caixa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tipo: 'abertura',
          descricao: 'Abertura de caixa',
          valor: parseFloat(valor),
          saldoAnterior: 0,
          saldoAtual: parseFloat(valor),
          data: dataSelecionada,
          unitId
        })
      });

      if (response.ok) {
        await carregarMovimentos();
        alert('Caixa aberto com sucesso!');
      }
    } catch (error) {
      console.error('Erro ao abrir caixa:', error);
      alert('Erro ao abrir caixa');
    }
  };

  const registrarLancamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.valor) return;

    try {
      const token = localStorage.getItem('auth_token');
      const saldoAtualAnterior = movimentos.length > 0 
        ? movimentos[movimentos.length - 1].saldoAtual 
        : 0;

      const novoSaldo = formData.tipoLancamento === 'sangria'
        ? saldoAtualAnterior - parseFloat(formData.valor)
        : saldoAtualAnterior + parseFloat(formData.valor);

      const response = await fetch(`${apiUrl}/caixa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tipo: formData.tipoLancamento,
          tipoRecebimento: formData.tipoRecebimento,
          descricao: formData.descricao,
          valor: parseFloat(formData.valor),
          saldoAnterior: saldoAtualAnterior,
          saldoAtual: novoSaldo,
          data: dataSelecionada,
          unitId
        })
      });

      if (response.ok) {
        setFormData({ tipoLancamento: 'recebimento', tipoRecebimento: 'dinheiro', valor: '', descricao: '' });
        await carregarMovimentos();
      }
    } catch (error) {
      console.error('Erro ao registrar lançamento:', error);
    }
  };

  const fecharCaixa = async () => {
    const valor = prompt('Informe o saldo final do caixa:');
    if (!valor) return;

    try {
      const token = localStorage.getItem('auth_token');
      const saldoFinal = parseFloat(valor);
      const saldoCalculado = movimentos.length > 0 ? movimentos[movimentos.length - 1].saldoAtual : 0;
      const diferenca = saldoFinal - saldoCalculado;

      const response = await fetch(`${apiUrl}/caixa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tipo: 'fechamento',
          descricao: `Fechamento - Diferença: R$ ${diferenca.toFixed(2)}`,
          valor: saldoFinal,
          saldoAnterior: saldoCalculado,
          saldoAtual: saldoFinal,
          data: dataSelecionada,
          unitId
        })
      });

      if (response.ok) {
        await carregarMovimentos();
        alert(`Caixa fechado! Diferença: R$ ${diferenca.toFixed(2)}`);
      }
    } catch (error) {
      console.error('Erro ao fechar caixa:', error);
    }
  };

  const handleEditar = (mov: Movimento) => {
    setEditandoId(mov.id);
    setEditData(mov);
  };

  const handleSalvarEdicao = async () => {
    if (!editandoId) return;

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/caixa/${editandoId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editData)
      });

      if (response.ok) {
        setEditandoId(null);
        await carregarMovimentos();
      }
    } catch (error) {
      console.error('Erro ao salvar edição:', error);
    }
  };

  const handleCancelarEdicao = () => {
    setEditandoId(null);
    setEditData({});
  };

  const saldoAtual = movimentos.length > 0 ? movimentos[movimentos.length - 1].saldoAtual : 0;

  // Agrupar movimentos por tipo
  const movimentosPorTipo: { [key: string]: Movimento[] } = {};
  movimentos.forEach((mov: Movimento) => {
    if (mov.tipo === 'recebimento') {
      const chave = mov.tipoRecebimento || 'outros';
      if (!movimentosPorTipo[chave]) movimentosPorTipo[chave] = [];
      movimentosPorTipo[chave].push(mov);
    } else {
      if (!movimentosPorTipo[mov.tipo]) movimentosPorTipo[mov.tipo] = [];
      movimentosPorTipo[mov.tipo].push(mov);
    }
  });

  return (
    <div className="caixa-container">
      <main className="main-content">
        <h1>💰 Controle de Caixa - {unitName}</h1>

        {/* Seletor de Data */}
        <div className="date-selector">
          <label>Data:</label>
          <input
            type="date"
            value={dataSelecionada}
            onChange={(e) => setDataSelecionada(e.target.value)}
            className="date-input"
          />
        </div>

        {/* Status do Caixa */}
        <div className="status-section">
          <div className="status-card">
            <h3>Status do Caixa</h3>
            <div className={`status-badge ${caixaAberto ? 'aberto' : 'fechado'}`}>
              {caixaAberto ? '🟢 ABERTO' : '🔴 FECHADO'}
            </div>
            <div className="saldo">
              <strong>Saldo Atual:</strong> R$ {saldoAtual.toFixed(2)}
            </div>
            <div className="button-group">
              <button onClick={abrirCaixa} disabled={caixaAberto} className="open-button">
                Abrir Caixa
              </button>
              <button onClick={fecharCaixa} disabled={!caixaAberto} className="close-button">
                Fechar Caixa
              </button>
            </div>
          </div>
        </div>

        {/* Formulário de Lançamento */}
        {caixaAberto && (
          <section className="form-section">
            <h2>Registrar Lançamento</h2>
            <form onSubmit={registrarLancamento}>
              <div className="form-group">
                <label>Tipo de Lançamento *</label>
                <select
                  value={formData.tipoLancamento}
                  onChange={(e) => setFormData({...formData, tipoLancamento: e.target.value})}
                >
                  <option value="recebimento">Recebimento</option>
                  <option value="sangria">Sangria</option>
                  <option value="reforço">Reforço</option>
                </select>
              </div>

              {formData.tipoLancamento === 'recebimento' && (
                <div className="form-group">
                  <label>Tipo de Recebimento *</label>
                  <select
                    value={formData.tipoRecebimento}
                    onChange={(e) => setFormData({...formData, tipoRecebimento: e.target.value})}
                  >
                    {TIPOS_RECEBIMENTO.map(tipo => (
                      <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
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

        {/* Grid de Movimentos Agrupados por Tipo */}
        <section className="list-section">
          <h2>Movimentos de {dataSelecionada} ({movimentos.length})</h2>
          {loading ? (
            <p>Carregando...</p>
          ) : movimentos.length === 0 ? (
            <p>Nenhum movimento registrado para esta data</p>
          ) : (
            <div className="movimentos-agrupados">
              {/* Abertura */}
              {movimentosPorTipo['abertura'] && (
                <div className="grupo-movimento">
                  <h4 className="grupo-titulo">🟢 Abertura de Caixa</h4>
                  <table className="data-table">
                    <tbody>
                      {movimentosPorTipo['abertura'].map(mov => (
                        <tr key={mov.id} className="tipo-abertura">
                          {editandoId === mov.id ? (
                            <>
                              <td><input type="text" value={editData.descricao} onChange={(e) => setEditData({...editData, descricao: e.target.value})} className="edit-input" /></td>
                              <td><input type="number" step="0.01" value={editData.valor} onChange={(e) => setEditData({...editData, valor: parseFloat(e.target.value)})} className="edit-input" /></td>
                              <td><button onClick={handleSalvarEdicao} className="btn-salvar">✓</button><button onClick={handleCancelarEdicao} className="btn-cancelar">✗</button></td>
                            </>
                          ) : (
                            <>
                              <td>{mov.descricao}</td>
                              <td className="valor-positivo">R$ {mov.valor.toFixed(2)}</td>
                              <td><button onClick={() => handleEditar(mov)} className="btn-editar">✏️</button></td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Recebimentos por Tipo */}
              {TIPOS_RECEBIMENTO.map(tipo => {
                const recebimentos = movimentosPorTipo[tipo.value];
                if (!recebimentos || recebimentos.length === 0) return null;
                const total = recebimentos.reduce((sum, m) => sum + m.valor, 0);
                return (
                  <div key={tipo.value} className="grupo-movimento">
                    <h4 className="grupo-titulo">{tipo.label} - Total: R$ {total.toFixed(2)}</h4>
                    <table className="data-table">
                      <tbody>
                        {recebimentos.map(mov => (
                          <tr key={mov.id} className="tipo-recebimento">
                            {editandoId === mov.id ? (
                              <>
                                <td><input type="text" value={editData.descricao} onChange={(e) => setEditData({...editData, descricao: e.target.value})} className="edit-input" /></td>
                                <td><input type="number" step="0.01" value={editData.valor} onChange={(e) => setEditData({...editData, valor: parseFloat(e.target.value)})} className="edit-input" /></td>
                                <td><button onClick={handleSalvarEdicao} className="btn-salvar">✓</button><button onClick={handleCancelarEdicao} className="btn-cancelar">✗</button></td>
                              </>
                            ) : (
                              <>
                                <td>{mov.descricao}</td>
                                <td className="valor-positivo">R$ {mov.valor.toFixed(2)}</td>
                                <td><button onClick={() => handleEditar(mov)} className="btn-editar">✏️</button></td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {/* Sangrias */}
              {movimentosPorTipo['sangria'] && (
                <div className="grupo-movimento">
                  <h4 className="grupo-titulo">⬇️ Sangrias - Total: R$ {movimentosPorTipo['sangria'].reduce((sum, m) => sum + m.valor, 0).toFixed(2)}</h4>
                  <table className="data-table">
                    <tbody>
                      {movimentosPorTipo['sangria'].map(mov => (
                        <tr key={mov.id} className="tipo-sangria">
                          {editandoId === mov.id ? (
                            <>
                              <td><input type="text" value={editData.descricao} onChange={(e) => setEditData({...editData, descricao: e.target.value})} className="edit-input" /></td>
                              <td><input type="number" step="0.01" value={editData.valor} onChange={(e) => setEditData({...editData, valor: parseFloat(e.target.value)})} className="edit-input" /></td>
                              <td><button onClick={handleSalvarEdicao} className="btn-salvar">✓</button><button onClick={handleCancelarEdicao} className="btn-cancelar">✗</button></td>
                            </>
                          ) : (
                            <>
                              <td>{mov.descricao}</td>
                              <td className="valor-negativo">R$ {mov.valor.toFixed(2)}</td>
                              <td><button onClick={() => handleEditar(mov)} className="btn-editar">✏️</button></td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Reforços */}
              {movimentosPorTipo['reforço'] && (
                <div className="grupo-movimento">
                  <h4 className="grupo-titulo">⬆️ Reforços - Total: R$ {movimentosPorTipo['reforço'].reduce((sum, m) => sum + m.valor, 0).toFixed(2)}</h4>
                  <table className="data-table">
                    <tbody>
                      {movimentosPorTipo['reforço'].map(mov => (
                        <tr key={mov.id} className="tipo-reforço">
                          {editandoId === mov.id ? (
                            <>
                              <td><input type="text" value={editData.descricao} onChange={(e) => setEditData({...editData, descricao: e.target.value})} className="edit-input" /></td>
                              <td><input type="number" step="0.01" value={editData.valor} onChange={(e) => setEditData({...editData, valor: parseFloat(e.target.value)})} className="edit-input" /></td>
                              <td><button onClick={handleSalvarEdicao} className="btn-salvar">✓</button><button onClick={handleCancelarEdicao} className="btn-cancelar">✗</button></td>
                            </>
                          ) : (
                            <>
                              <td>{mov.descricao}</td>
                              <td className="valor-positivo">R$ {mov.valor.toFixed(2)}</td>
                              <td><button onClick={() => handleEditar(mov)} className="btn-editar">✏️</button></td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Fechamento */}
              {movimentosPorTipo['fechamento'] && (
                <div className="grupo-movimento">
                  <h4 className="grupo-titulo">🔴 Fechamento de Caixa</h4>
                  <table className="data-table">
                    <tbody>
                      {movimentosPorTipo['fechamento'].map(mov => (
                        <tr key={mov.id} className="tipo-fechamento">
                          {editandoId === mov.id ? (
                            <>
                              <td><input type="text" value={editData.descricao} onChange={(e) => setEditData({...editData, descricao: e.target.value})} className="edit-input" /></td>
                              <td><input type="number" step="0.01" value={editData.valor} onChange={(e) => setEditData({...editData, valor: parseFloat(e.target.value)})} className="edit-input" /></td>
                              <td><button onClick={handleSalvarEdicao} className="btn-salvar">✓</button><button onClick={handleCancelarEdicao} className="btn-cancelar">✗</button></td>
                            </>
                          ) : (
                            <>
                              <td>{mov.descricao}</td>
                              <td className="valor-positivo">R$ {mov.valor.toFixed(2)}</td>
                              <td><button onClick={() => handleEditar(mov)} className="btn-editar">✏️</button></td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <style>{`
        .caixa-container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .main-content h1 {
          color: #333;
          margin-bottom: 20px;
        }

        .date-selector {
          background: white;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .date-input {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .status-section {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          margin-bottom: 30px;
        }

        .status-card {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .status-badge {
          font-size: 20px;
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

        .form-section {
          background: white;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .form-group {
          margin-bottom: 15px;
        }

        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
          color: #333;
        }

        .form-group input, .form-group select {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .submit-button {
          background: #007bff;
          color: white;
          padding: 12px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          width: 100%;
        }

        .submit-button:hover {
          background: #0056b3;
        }

        .list-section {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .movimentos-agrupados {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .grupo-movimento {
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 15px;
          background: #f9f9f9;
        }

        .grupo-titulo {
          margin: 0 0 15px 0;
          padding: 10px;
          background: white;
          border-radius: 4px;
          font-size: 14px;
          font-weight: bold;
          color: #333;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .data-table tbody tr {
          border-bottom: 1px solid #eee;
        }

        .data-table tbody tr:hover {
          background: #f5f5f5;
        }

        .data-table td {
          padding: 10px;
        }

        .tipo-abertura { background: #d4edda; }
        .tipo-recebimento { background: #cfe2ff; }
        .tipo-sangria { background: #f8d7da; }
        .tipo-reforço { background: #fff3cd; }
        .tipo-fechamento { background: #e2e3e5; }

        .valor-positivo { color: #28a745; font-weight: bold; }
        .valor-negativo { color: #dc3545; font-weight: bold; }

        .btn-editar, .btn-salvar, .btn-cancelar {
          padding: 5px 10px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          font-weight: bold;
          margin-right: 5px;
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

        @media (max-width: 768px) {
          .button-group {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}

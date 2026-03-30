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
  dataNascimento: string;
  endereco: string;
  numero: string;
  complemento: string;
  cidade: string;
  estado: string;
  cep: string;
  
  // Contratação
  tipoContrato: 'CLT' | 'Freelancer';
  valorDia: number;
  valorNoite: number;
  valorTransporte: number;
  valeAlimentacao: boolean;
  
  // Função
  tipo: string;
  
  // Jornada
  diasDisponiveis: string[];
  podeTrabalharDia: boolean;
  podeTrabalharNoite: boolean;
  
  // Metadata
  dataCadastro: string;
  ativo: boolean;
}

const TIPOS_COLABORADOR = [
  'Caixa',
  'Garçom',
  'Ajudante de Cozinha',
  'Cozinheiro',
  'Pizzaiolo',
  'Ajudante de Pizzaiolo',
  'Bartender',
  'Gerente',
  'Supervisor',
  'Entregador',
  'Motoboy',
  'Outro'
];

const DIAS_SEMANA = [
  { valor: 'segunda', label: 'Segunda' },
  { valor: 'terça', label: 'Terça' },
  { valor: 'quarta', label: 'Quarta' },
  { valor: 'quinta', label: 'Quinta' },
  { valor: 'sexta', label: 'Sexta' },
  { valor: 'sábado', label: 'Sábado' },
  { valor: 'domingo', label: 'Domingo' }
];

export default function Colaboradores() {
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const userUnitId = (user as any)?.unitId || '';
  const unitId = activeUnit?.id || userUnitId || '';
  
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(false);
  const [abaSelecionada, setAbaSelecionada] = useState<'lista' | 'novo'>('lista');
  const [colaboradorEditando, setColaboradorEditando] = useState<Colaborador | null>(null);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState(true);
  const [busca, setBusca] = useState('');

  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  const [novoColaborador, setNovoColaborador] = useState<Partial<Colaborador>>({
    tipoContrato: 'CLT',
    valorDia: 0,
    valorNoite: 0,
    valorTransporte: 0,
    valeAlimentacao: false,
    tipo: 'Garçom',
    diasDisponiveis: ['segunda', 'terça', 'quarta', 'quinta', 'sexta'],
    podeTrabalharDia: true,
    podeTrabalharNoite: false,
    ativo: true,
  });

  useEffect(() => {
    if (unitId) {
      carregarColaboradores();
    }
  }, [unitId]);

  const carregarColaboradores = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setColaboradores(Array.isArray(data) ? data : data.colaboradores || []);
      }
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCriarColaborador = async () => {
    if (!novoColaborador.cpf || !novoColaborador.telefone || !novoColaborador.tipo) {
      alert('CPF, Celular e Tipo são obrigatórios!');
      return;
    }

    const colaboradorCompleto: Colaborador = {
      id: `${unitId}-${Date.now()}`,
      unitId,
      nome: novoColaborador.nome || '',
      email: novoColaborador.email || '',
      telefone: novoColaborador.telefone || '',
      cpf: novoColaborador.cpf || '',
      dataNascimento: novoColaborador.dataNascimento || '',
      endereco: novoColaborador.endereco || '',
      numero: novoColaborador.numero || '',
      complemento: novoColaborador.complemento || '',
      cidade: novoColaborador.cidade || '',
      estado: novoColaborador.estado || '',
      cep: novoColaborador.cep || '',
      tipoContrato: novoColaborador.tipoContrato as 'CLT' | 'Freelancer',
      valorDia: novoColaborador.valorDia || 0,
      valorNoite: novoColaborador.valorNoite || 0,
      valorTransporte: novoColaborador.valorTransporte || 0,
      valeAlimentacao: novoColaborador.valeAlimentacao || false,
      tipo: novoColaborador.tipo || '',
      diasDisponiveis: novoColaborador.diasDisponiveis || [],
      podeTrabalharDia: novoColaborador.podeTrabalharDia || true,
      podeTrabalharNoite: novoColaborador.podeTrabalharNoite || false,
      dataCadastro: new Date().toISOString().split('T')[0],
      ativo: true,
    };

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/colaboradores`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(colaboradorCompleto)
      });

      if (response.ok) {
        alert('Colaborador cadastrado com sucesso!');
        setNovoColaborador({
          tipoContrato: 'CLT',
          valorDia: 0,
          valorNoite: 0,
          valorTransporte: 0,
          valeAlimentacao: false,
          tipo: 'Garçom',
          diasDisponiveis: ['segunda', 'terça', 'quarta', 'quinta', 'sexta'],
          podeTrabalharDia: true,
          podeTrabalharNoite: false,
          ativo: true,
        });
        setAbaSelecionada('lista');
        carregarColaboradores();
      } else {
        const erro = await response.json();
        alert(`Erro ao salvar: ${erro.error}`);
      }
    } catch (error) {
      console.error('Erro ao criar colaborador:', error);
      alert('Erro ao salvar colaborador');
    }
  };

  const handleEditarColaborador = async () => {
    if (!colaboradorEditando) return;

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/colaboradores/${colaboradorEditando.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(colaboradorEditando)
      });

      if (response.ok) {
        alert('Colaborador atualizado com sucesso!');
        setColaboradorEditando(null);
        carregarColaboradores();
      } else {
        const erro = await response.json();
        alert(`Erro ao atualizar: ${erro.error}`);
      }
    } catch (error) {
      console.error('Erro ao atualizar colaborador:', error);
      alert('Erro ao atualizar colaborador');
    }
  };

  const handleDeletarColaborador = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja deletar este colaborador?')) return;

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/colaboradores/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        alert('Colaborador deletado com sucesso!');
        carregarColaboradores();
      }
    } catch (error) {
      console.error('Erro ao deletar:', error);
      alert('Erro ao deletar colaborador');
    }
  };

  const colaboradoresFiltrados = colaboradores.filter(c => {
    const matchTipo = !filtroTipo || c.tipo === filtroTipo;
    const matchAtivo = c.ativo === filtroAtivo;
    const matchBusca = !busca || c.nome.toLowerCase().includes(busca.toLowerCase()) || c.email.toLowerCase().includes(busca.toLowerCase());
    return matchTipo && matchAtivo && matchBusca;
  });

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor);
  };

  return (
    <div style={styles.pageWrapper}>
      <Header title="👥 Cadastro de Colaboradores" showBack={true} />
      <div style={styles.container}>
        
        {/* ABAS */}
            <div style={{display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ddd'} as React.CSSProperties}>
          <button 
            onClick={() => setAbaSelecionada('lista')}
            style={{
              padding: '10px 20px',
              border: 'none',
              backgroundColor: abaSelecionada === 'lista' ? '#007bff' : '#f0f0f0',
              color: abaSelecionada === 'lista' ? 'white' : '#333',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              fontWeight: 'bold',
            }}
          >
            📋 Lista de Colaboradores ({colaboradores.length})
          </button>
          <button 
            onClick={() => setAbaSelecionada('novo')}
            style={{
              padding: '10px 20px',
              border: 'none',
              backgroundColor: abaSelecionada === 'novo' ? '#007bff' : '#f0f0f0',
              color: abaSelecionada === 'novo' ? 'white' : '#333',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              fontWeight: 'bold',
            }}
          >
            ➕ Novo Colaborador
          </button>
        </div>

        {/* ABA: LISTA */}
        {abaSelecionada === 'lista' && (
          <>
            {/* FILTROS */}
            <div style={styles.filtrosContainer}>
              <input 
                type="text"
                placeholder="🔍 Buscar por nome ou email..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={styles.inputBusca}
              />
              <select 
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                style={styles.select}
              >
                <option value="">Todos os Tipos</option>
                {TIPOS_COLABORADOR.map(tipo => (
                  <option key={tipo} value={tipo}>{tipo}</option>
                ))}
              </select>
              <select 
                value={filtroAtivo ? 'ativo' : 'inativo'}
                onChange={(e) => setFiltroAtivo(e.target.value === 'ativo')}
                style={styles.select}
              >
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
              </select>
            </div>

            {/* GRID */}
            {loading ? (
              <p>Carregando colaboradores...</p>
            ) : colaboradoresFiltrados.length === 0 ? (
              <p>Nenhum colaborador encontrado.</p>
            ) : (
              <div style={styles.gridContainer}>
                {colaboradoresFiltrados.map(colab => (
                  <div key={colab.id} style={styles.card}>
                    <div style={styles.cardHeader}>
                      <h3>{colab.nome}</h3>
                      <span style={{...styles.badge, backgroundColor: colab.tipoContrato === 'CLT' ? '#28a745' : '#ffc107'}}>
                        {colab.tipoContrato}
                      </span>
                    </div>
                    <div style={styles.cardBody}>
                      <p><strong>Tipo:</strong> {colab.tipo}</p>
                      <p><strong>Email:</strong> {colab.email}</p>
                      <p><strong>Telefone:</strong> {colab.telefone}</p>
                      <p><strong>Valor Dia:</strong> {formatarMoeda(colab.valorDia)}</p>
                      <p><strong>Valor Noite:</strong> {formatarMoeda(colab.valorNoite)}</p>
                      <p><strong>Transporte (Ida e Volta):</strong> {formatarMoeda(colab.valorTransporte)}</p>
                      <p><strong>Vale Alimentação:</strong> {colab.valeAlimentacao ? 'Sim' : 'Não'}</p>
                      <p><strong>Dias Disponíveis:</strong> {colab.diasDisponiveis.join(', ')}</p>
                      <p><strong>Dia:</strong> {colab.podeTrabalharDia ? '✅' : '❌'} | <strong>Noite:</strong> {colab.podeTrabalharNoite ? '✅' : '❌'}</p>
                    </div>
                    <div style={styles.cardActions}>
                      <button onClick={() => setColaboradorEditando(colab)} style={styles.botaoEditar}>✏️ Editar</button>
                      <button onClick={() => handleDeletarColaborador(colab.id)} style={styles.botaoDeletar}>🗑️ Deletar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ABA: NOVO COLABORADOR */}
        {abaSelecionada === 'novo' && (
          <div style={styles.formularioContainer}>
            <h2>Novo Colaborador</h2>
            
            <div style={styles.secao}>
              <h3>📋 Informações Básicas</h3>
              <div style={styles.grid2Col}>
                <div style={styles.formGroup}>
                  <label>Nome *</label>
                  <input 
                    type="text"
                    value={novoColaborador.nome || ''}
                    onChange={(e) => setNovoColaborador({...novoColaborador, nome: e.target.value})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>Email *</label>
                  <input 
                    type="email"
                    value={novoColaborador.email || ''}
                    onChange={(e) => setNovoColaborador({...novoColaborador, email: e.target.value})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>Telefone</label>
                  <input 
                    type="tel"
                    value={novoColaborador.telefone || ''}
                    onChange={(e) => setNovoColaborador({...novoColaborador, telefone: e.target.value})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>CPF</label>
                  <input 
                    type="text"
                    value={novoColaborador.cpf || ''}
                    onChange={(e) => setNovoColaborador({...novoColaborador, cpf: e.target.value})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>Data de Nascimento</label>
                  <input 
                    type="date"
                    value={novoColaborador.dataNascimento || ''}
                    onChange={(e) => setNovoColaborador({...novoColaborador, dataNascimento: e.target.value})}
                    style={styles.input}
                  />
                </div>
              </div>
            </div>

            <div style={styles.secao}>
              <h3>🏠 Endereço</h3>
              <div style={styles.grid2Col}>
                <div style={styles.formGroup}>
                  <label>Endereço</label>
                  <input 
                    type="text"
                    value={novoColaborador.endereco || ''}
                    onChange={(e) => setNovoColaborador({...novoColaborador, endereco: e.target.value})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>Número</label>
                  <input 
                    type="text"
                    value={novoColaborador.numero || ''}
                    onChange={(e) => setNovoColaborador({...novoColaborador, numero: e.target.value})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>Complemento</label>
                  <input 
                    type="text"
                    value={novoColaborador.complemento || ''}
                    onChange={(e) => setNovoColaborador({...novoColaborador, complemento: e.target.value})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>Cidade</label>
                  <input 
                    type="text"
                    value={novoColaborador.cidade || ''}
                    onChange={(e) => setNovoColaborador({...novoColaborador, cidade: e.target.value})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>Estado</label>
                  <input 
                    type="text"
                    value={novoColaborador.estado || ''}
                    onChange={(e) => setNovoColaborador({...novoColaborador, estado: e.target.value})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>CEP</label>
                  <input 
                    type="text"
                    value={novoColaborador.cep || ''}
                    onChange={(e) => setNovoColaborador({...novoColaborador, cep: e.target.value})}
                    style={styles.input}
                  />
                </div>
              </div>
            </div>

            <div style={styles.secao}>
              <h3>💼 Contratação</h3>
              <div style={styles.grid2Col}>
                <div style={styles.formGroup}>
                  <label>Tipo de Contrato *</label>
                  <select 
                    value={novoColaborador.tipoContrato || 'CLT'}
                    onChange={(e) => setNovoColaborador({...novoColaborador, tipoContrato: e.target.value as 'CLT' | 'Freelancer'})}
                    style={styles.input}
                  >
                    <option value="CLT">CLT</option>
                    <option value="Freelancer">Freelancer</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label>Tipo de Função *</label>
                  <select 
                    value={novoColaborador.tipo || 'Garçom'}
                    onChange={(e) => setNovoColaborador({...novoColaborador, tipo: e.target.value})}
                    style={styles.input}
                  >
                    {TIPOS_COLABORADOR.map(tipo => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label>Valor Dia (R$)</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={novoColaborador.valorDia || 0}
                    onChange={(e) => setNovoColaborador({...novoColaborador, valorDia: parseFloat(e.target.value) || 0})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>Valor Noite (R$)</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={novoColaborador.valorNoite || 0}
                    onChange={(e) => setNovoColaborador({...novoColaborador, valorNoite: parseFloat(e.target.value) || 0})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>Valor Transporte (Ida e Volta) (R$)</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={novoColaborador.valorTransporte || 0}
                    onChange={(e) => setNovoColaborador({...novoColaborador, valorTransporte: parseFloat(e.target.value) || 0})}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>
                    <input 
                      type="checkbox"
                      checked={novoColaborador.valeAlimentacao || false}
                      onChange={(e) => setNovoColaborador({...novoColaborador, valeAlimentacao: e.target.checked})}
                    />
                    {' '}Vale Alimentação
                  </label>
                </div>
              </div>
            </div>

            <div style={styles.secao}>
              <h3>📅 Jornada</h3>
              <div style={styles.formGroup}>
                <label>Dias Disponíveis:</label>
                <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                  {DIAS_SEMANA.map(dia => (
                    <label key={dia.valor} style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                      <input 
                        type="checkbox"
                        checked={(novoColaborador.diasDisponiveis || []).includes(dia.valor)}
                        onChange={(e) => {
                          const dias = novoColaborador.diasDisponiveis || [];
                          if (e.target.checked) {
                            setNovoColaborador({...novoColaborador, diasDisponiveis: [...dias, dia.valor]});
                          } else {
                            setNovoColaborador({...novoColaborador, diasDisponiveis: dias.filter(d => d !== dia.valor)});
                          }
                        }}
                      />
                      {dia.label}
                    </label>
                  ))}
                </div>
              </div>
              <div style={styles.grid2Col}>
                <div style={styles.formGroup}>
                  <label>
                    <input 
                      type="checkbox"
                      checked={novoColaborador.podeTrabalharDia || false}
                      onChange={(e) => setNovoColaborador({...novoColaborador, podeTrabalharDia: e.target.checked})}
                    />
                    {' '}Pode trabalhar Dia
                  </label>
                </div>
                <div style={styles.formGroup}>
                  <label>
                    <input 
                      type="checkbox"
                      checked={novoColaborador.podeTrabalharNoite || false}
                      onChange={(e) => setNovoColaborador({...novoColaborador, podeTrabalharNoite: e.target.checked})}
                    />
                    {' '}Pode trabalhar Noite
                  </label>
                </div>
              </div>
            </div>

            <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
              <button onClick={() => setAbaSelecionada('lista')} style={{flex: 1, padding: '10px', backgroundColor: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Cancelar</button>
              <button onClick={handleCriarColaborador} style={{flex: 1, padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Salvar Colaborador</button>
            </div>
          </div>
        )}

        {/* MODAL DE EDIÇÃO */}
        {colaboradorEditando && (
          <div style={styles.modal}>
            <div style={styles.modalContent}>
              <h2>Editar Colaborador</h2>
              <div style={styles.secao}>
                <h3>📋 Informações Básicas</h3>
                <div style={styles.grid2Col}>
                  <div style={styles.formGroup}>
                    <label>Nome</label>
                    <input 
                      type="text"
                      value={colaboradorEditando.nome || ''}
                      onChange={(e) => setColaboradorEditando({...colaboradorEditando, nome: e.target.value})}
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Email</label>
                    <input 
                      type="email"
                      value={colaboradorEditando.email || ''}
                      onChange={(e) => setColaboradorEditando({...colaboradorEditando, email: e.target.value})}
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Telefone</label>
                    <input 
                      type="tel"
                      value={colaboradorEditando.telefone || ''}
                      onChange={(e) => setColaboradorEditando({...colaboradorEditando, telefone: e.target.value})}
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Tipo</label>
                    <select 
                      value={colaboradorEditando.tipo || ''}
                      onChange={(e) => setColaboradorEditando({...colaboradorEditando, tipo: e.target.value})}
                      style={styles.input}
                    >
                      {TIPOS_COLABORADOR.map(tipo => (
                        <option key={tipo} value={tipo}>{tipo}</option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label>Valor Transporte (Ida e Volta) (R$)</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={colaboradorEditando.valorTransporte || 0}
                      onChange={(e) => setColaboradorEditando({...colaboradorEditando, valorTransporte: parseFloat(e.target.value) || 0})}
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label>Valor Noite (R$)</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={colaboradorEditando.valorNoite || 0}
                      onChange={(e) => setColaboradorEditando({...colaboradorEditando, valorNoite: parseFloat(e.target.value) || 0})}
                      style={styles.input}
                    />
                  </div>
                </div>
              </div>
              <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
                <button onClick={() => setColaboradorEditando(null)} style={{flex: 1, padding: '10px', backgroundColor: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Cancelar</button>
                <button onClick={handleEditarColaborador} style={{flex: 1, padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Salvar Alterações</button>
              </div>
            </div>
          </div>
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
  },
  container: {
    padding: '20px',
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%',
    flex: 1,
  },
  filtrosContainer: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  } as React.CSSProperties,
  inputBusca: {
    flex: 1,
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    minWidth: '200px',
  },
  select: {
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '20px',
  },
  card: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '15px',
    backgroundColor: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    borderBottom: '1px solid #eee',
    paddingBottom: '10px',
  },
  badge: {
    padding: '4px 8px',
    borderRadius: '4px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  cardBody: {
    marginBottom: '10px',
    fontSize: '14px',
  },
  cardActions: {
    display: 'flex',
    gap: '10px',
  },
  botaoEditar: {
    flex: 1,
    padding: '8px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  botaoDeletar: {
    flex: 1,
    padding: '8px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  formularioContainer: {
    backgroundColor: '#f9f9f9',
    padding: '20px',
    borderRadius: '8px',
  },
  secao: {
    marginBottom: '30px',
    paddingBottom: '20px',
    borderBottom: '1px solid #ddd',
  },
  grid2Col: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '15px',
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
  },
  modal: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: '30px',
    borderRadius: '8px',
    maxWidth: '600px',
    maxHeight: '80vh',
    overflowY: 'auto' as const,
    width: '90%',
  },
};

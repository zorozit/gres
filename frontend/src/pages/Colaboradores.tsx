import React, { useState, useEffect } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

interface Colaborador {
  id: string;
  unitId: string;
  nome: string;
  cpf: string;
  celular: string;     // campo principal de contato (era "telefone")
  telefone: string;    // mantido para retrocompatibilidade
  email?: string;      // opcional
  dataNascimento: string;
  endereco: string;
  numero: string;
  complemento: string;
  cidade: string;
  estado: string;
  cep: string;

  // Contratação
  tipoContrato: 'CLT' | 'Freelancer';
  cargo: string;       // era "tipo" no Lambda
  tipo: string;        // mantido para retrocompatibilidade
  valorDia: number;
  valorNoite: number;
  valorTransporte: number;
  valeAlimentacao: boolean;
  salario: number;
  chavePix: string;
  dataAdmissao: string;

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
  'Outro',
];

const DIAS_SEMANA = [
  { valor: 'segunda', label: 'Seg' },
  { valor: 'terça',   label: 'Ter' },
  { valor: 'quarta',  label: 'Qua' },
  { valor: 'quinta',  label: 'Qui' },
  { valor: 'sexta',   label: 'Sex' },
  { valor: 'sábado',  label: 'Sáb' },
  { valor: 'domingo', label: 'Dom' },
];

const ESTADO_INICIAL: Partial<Colaborador> = {
  tipoContrato: 'CLT',
  cargo: 'Garçom',
  tipo: 'Garçom',
  valorDia: 0,
  valorNoite: 0,
  valorTransporte: 0,
  valeAlimentacao: false,
  salario: 0,
  diasDisponiveis: ['segunda', 'terça', 'quarta', 'quinta', 'sexta'],
  podeTrabalharDia: true,
  podeTrabalharNoite: false,
  ativo: true,
};

/** Formata CPF: 000.000.000-00 */
const formatarCPF = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
};

/** Formata celular: (00) 00000-0000 */
const formatarCelular = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};

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
  const [novoColaborador, setNovoColaborador] = useState<Partial<Colaborador>>(ESTADO_INICIAL);

  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  useEffect(() => {
    if (unitId) carregarColaboradores();
  }, [unitId]);

  const carregarColaboradores = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setColaboradores(Array.isArray(data) ? data : data.colaboradores || []);
      }
    } catch (e) {
      console.error('Erro ao carregar colaboradores:', e);
    } finally {
      setLoading(false);
    }
  };

  /* ── Helpers ────────────────────────────────────────── */
  const celularDe = (c: Partial<Colaborador>) => c.celular || c.telefone || '';
  const cargoDe   = (c: Partial<Colaborador>) => c.cargo   || c.tipo     || 'Outro';

  /* ── Criar ──────────────────────────────────────────── */
  const handleCriarColaborador = async () => {
    const cpfLimpo     = (novoColaborador.cpf     || '').replace(/\D/g, '');
    const celularLimpo = (novoColaborador.celular || novoColaborador.telefone || '').replace(/\D/g, '');

    if (!novoColaborador.nome?.trim()) { alert('Nome é obrigatório!'); return; }
    if (cpfLimpo.length !== 11)        { alert('CPF inválido — informe os 11 dígitos!'); return; }
    if (celularLimpo.length < 10)      { alert('Celular inválido!'); return; }

    const cargo = cargoDe(novoColaborador);
    const payload: Colaborador = {
      id:               `${unitId}-${Date.now()}`,
      unitId,
      nome:             novoColaborador.nome || '',
      cpf:              novoColaborador.cpf  || '',
      celular:          novoColaborador.celular || '',
      telefone:         novoColaborador.celular || '',   // retrocompat
      email:            novoColaborador.email  || '',
      dataNascimento:   novoColaborador.dataNascimento || '',
      endereco:         novoColaborador.endereco  || '',
      numero:           novoColaborador.numero    || '',
      complemento:      novoColaborador.complemento || '',
      cidade:           novoColaborador.cidade  || '',
      estado:           novoColaborador.estado  || '',
      cep:              novoColaborador.cep     || '',
      tipoContrato:     novoColaborador.tipoContrato as 'CLT' | 'Freelancer',
      cargo,
      tipo:             cargo,
      valorDia:         novoColaborador.valorDia         || 0,
      valorNoite:       novoColaborador.valorNoite       || 0,
      valorTransporte:  novoColaborador.valorTransporte  || 0,
      valeAlimentacao:  novoColaborador.valeAlimentacao  || false,
      salario:          novoColaborador.salario          || 0,
      chavePix:         novoColaborador.chavePix         || '',
      dataAdmissao:     novoColaborador.dataAdmissao     || new Date().toISOString().split('T')[0],
      diasDisponiveis:  novoColaborador.diasDisponiveis  || [],
      podeTrabalharDia:    novoColaborador.podeTrabalharDia    ?? true,
      podeTrabalharNoite:  novoColaborador.podeTrabalharNoite  ?? false,
      dataCadastro:     new Date().toISOString().split('T')[0],
      ativo:            true,
    };

    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/colaboradores`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert('Colaborador cadastrado com sucesso!');
        setNovoColaborador(ESTADO_INICIAL);
        setAbaSelecionada('lista');
        carregarColaboradores();
      } else {
        const err = await res.json();
        alert(`Erro ao salvar: ${err.error}`);
      }
    } catch (e) {
      console.error('Erro ao criar colaborador:', e);
      alert('Erro ao salvar colaborador');
    }
  };

  /* ── Editar ─────────────────────────────────────────── */
  const handleEditarColaborador = async () => {
    if (!colaboradorEditando) return;
    const cargo = cargoDe(colaboradorEditando);
    const payload = {
      ...colaboradorEditando,
      cargo,
      tipo: cargo,
      telefone: colaboradorEditando.celular || colaboradorEditando.telefone || '',
    };
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/colaboradores/${colaboradorEditando.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert('Colaborador atualizado com sucesso!');
        setColaboradorEditando(null);
        carregarColaboradores();
      } else {
        const err = await res.json();
        alert(`Erro ao atualizar: ${err.error}`);
      }
    } catch (e) {
      console.error('Erro ao atualizar colaborador:', e);
      alert('Erro ao atualizar colaborador');
    }
  };

  /* ── Deletar ────────────────────────────────────────── */
  const handleDeletarColaborador = async (id: string) => {
    if (!window.confirm('Deletar este colaborador?')) return;
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/colaboradores/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) { carregarColaboradores(); }
      else { alert('Erro ao deletar colaborador'); }
    } catch (e) {
      alert('Erro ao deletar colaborador');
    }
  };

  /* ── Filtro ─────────────────────────────────────────── */
  const colaboradoresFiltrados = colaboradores.filter(c => {
    const matchTipo  = !filtroTipo || cargoDe(c) === filtroTipo;
    const matchAtivo = c.ativo === filtroAtivo;
    const q = busca.toLowerCase();
    const matchBusca = !busca ||
      (c.nome     || '').toLowerCase().includes(q) ||
      (c.cpf      || '').replace(/\D/g,'').includes(q.replace(/\D/g,'')) ||
      (celularDe(c)).replace(/\D/g,'').includes(q.replace(/\D/g,''));
    return matchTipo && matchAtivo && matchBusca;
  });

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  /* ── Sub-componente: campos básicos (reutilizado em novo + modal) ── */
  const CamposBasicos = ({
    data,
    onChange,
  }: {
    data: Partial<Colaborador>;
    onChange: (patch: Partial<Colaborador>) => void;
  }) => (
    <div style={styles.secao}>
      <h3 style={styles.secaoTitulo}>📋 Identificação</h3>
      <div style={styles.grid2Col}>
        {/* Nome — linha inteira */}
        <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
          <label style={styles.label}>Nome completo *</label>
          <input type="text" value={data.nome || ''} style={styles.input}
            onChange={e => onChange({ nome: e.target.value })} />
        </div>

        {/* CPF */}
        <div style={styles.formGroup}>
          <label style={styles.label}>CPF *</label>
          <input type="text" inputMode="numeric" placeholder="000.000.000-00"
            value={data.cpf || ''} style={styles.input}
            onChange={e => onChange({ cpf: formatarCPF(e.target.value) })} />
        </div>

        {/* Celular */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Celular / WhatsApp *</label>
          <input type="tel" inputMode="numeric" placeholder="(00) 00000-0000"
            value={data.celular || data.telefone || ''} style={styles.input}
            onChange={e => {
              const f = formatarCelular(e.target.value);
              onChange({ celular: f, telefone: f });
            }} />
        </div>

        {/* Data nascimento */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Data de Nascimento</label>
          <input type="date" value={data.dataNascimento || ''} style={styles.input}
            onChange={e => onChange({ dataNascimento: e.target.value })} />
        </div>

        {/* Email — opcional, discreto */}
        <div style={styles.formGroup}>
          <label style={{ ...styles.label, color: '#999' }}>E-mail (opcional)</label>
          <input type="email" value={data.email || ''} style={{ ...styles.input, borderColor: '#ddd', color: '#666' }}
            placeholder="apenas se necessário"
            onChange={e => onChange({ email: e.target.value })} />
        </div>
      </div>
    </div>
  );

  const CamposEndereco = ({
    data,
    onChange,
  }: {
    data: Partial<Colaborador>;
    onChange: (patch: Partial<Colaborador>) => void;
  }) => (
    <div style={styles.secao}>
      <h3 style={styles.secaoTitulo}>🏠 Endereço</h3>
      <div style={styles.grid2Col}>
        <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
          <label style={styles.label}>Logradouro</label>
          <input type="text" value={data.endereco || ''} style={styles.input}
            onChange={e => onChange({ endereco: e.target.value })} />
        </div>
        {[
          { label: 'Número', key: 'numero' },
          { label: 'Complemento', key: 'complemento' },
          { label: 'Cidade', key: 'cidade' },
          { label: 'Estado', key: 'estado' },
          { label: 'CEP', key: 'cep' },
        ].map(({ label, key }) => (
          <div key={key} style={styles.formGroup}>
            <label style={styles.label}>{label}</label>
            <input type="text" value={(data as any)[key] || ''} style={styles.input}
              onChange={e => onChange({ [key]: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );

  const CamposContratacao = ({
    data,
    onChange,
  }: {
    data: Partial<Colaborador>;
    onChange: (patch: Partial<Colaborador>) => void;
  }) => (
    <div style={styles.secao}>
      <h3 style={styles.secaoTitulo}>💼 Contratação</h3>
      <div style={styles.grid2Col}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Tipo de Contrato *</label>
          <select value={data.tipoContrato || 'CLT'} style={styles.input}
            onChange={e => onChange({ tipoContrato: e.target.value as 'CLT' | 'Freelancer' })}>
            <option value="CLT">CLT</option>
            <option value="Freelancer">Freelancer</option>
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Cargo / Função *</label>
          <select value={cargoDe(data)} style={styles.input}
            onChange={e => onChange({ cargo: e.target.value, tipo: e.target.value })}>
            {TIPOS_COLABORADOR.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Data de Admissão</label>
          <input type="date" value={data.dataAdmissao || ''} style={styles.input}
            onChange={e => onChange({ dataAdmissao: e.target.value })} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Salário (R$)</label>
          <input type="number" step="0.01" value={data.salario || 0} style={styles.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ salario: parseFloat(e.target.value) || 0 })} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Valor Dia (R$)</label>
          <input type="number" step="0.01" value={data.valorDia || 0} style={styles.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ valorDia: parseFloat(e.target.value) || 0 })} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Valor Noite (R$)</label>
          <input type="number" step="0.01" value={data.valorNoite || 0} style={styles.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ valorNoite: parseFloat(e.target.value) || 0 })} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Transporte Ida+Volta (R$)</label>
          <input type="number" step="0.01" value={data.valorTransporte || 0} style={styles.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ valorTransporte: parseFloat(e.target.value) || 0 })} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Chave PIX</label>
          <input type="text" value={data.chavePix || ''} style={styles.input}
            onChange={e => onChange({ chavePix: e.target.value })} />
        </div>
        <div style={{ ...styles.formGroup, justifyContent: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '22px' }}>
            <input type="checkbox" checked={data.valeAlimentacao || false}
              onChange={e => onChange({ valeAlimentacao: e.target.checked })} />
            <span style={styles.label}>Vale Alimentação</span>
          </label>
        </div>
      </div>
    </div>
  );

  const CamposJornada = ({
    data,
    onChange,
  }: {
    data: Partial<Colaborador>;
    onChange: (patch: Partial<Colaborador>) => void;
  }) => (
    <div style={styles.secao}>
      <h3 style={styles.secaoTitulo}>📅 Jornada</h3>
      <div style={styles.formGroup}>
        <label style={styles.label}>Dias disponíveis:</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
          {DIAS_SEMANA.map(dia => {
            const ativo = (data.diasDisponiveis || []).includes(dia.valor);
            return (
              <label key={dia.valor} style={{
                display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer',
                padding: '4px 10px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold',
                backgroundColor: ativo ? '#1976d2' : '#f0f0f0',
                color: ativo ? 'white' : '#555',
                border: `1px solid ${ativo ? '#1565c0' : '#ddd'}`,
              }}>
                <input type="checkbox" style={{ display: 'none' }} checked={ativo}
                  onChange={e => {
                    const dias = data.diasDisponiveis || [];
                    onChange({ diasDisponiveis: e.target.checked
                      ? [...dias, dia.valor]
                      : dias.filter(d => d !== dia.valor) });
                  }} />
                {dia.label}
              </label>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
        {[
          { label: '☀️ Pode trabalhar Dia',   key: 'podeTrabalharDia' },
          { label: '🌙 Pode trabalhar Noite', key: 'podeTrabalharNoite' },
        ].map(({ label, key }) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={(data as any)[key] || false}
              onChange={e => onChange({ [key]: e.target.checked })} />
            <span style={styles.label}>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div style={styles.pageWrapper}>
      <Header title="👥 Cadastro de Colaboradores" showBack={true} />
      <div style={styles.container}>

        {/* ABAS */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ddd' }}>
          {[
            { key: 'lista', label: `📋 Lista (${colaboradores.length})` },
            { key: 'novo',  label: '➕ Novo Colaborador' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setAbaSelecionada(key as any)} style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
              borderRadius: '4px 4px 0 0',
              backgroundColor: abaSelecionada === key ? '#007bff' : '#f0f0f0',
              color: abaSelecionada === key ? 'white' : '#333',
            }}>{label}</button>
          ))}
        </div>

        {/* ── LISTA ── */}
        {abaSelecionada === 'lista' && (
          <>
            <div style={styles.filtrosContainer}>
              <input type="text" placeholder="🔍 Buscar por nome, CPF ou celular..."
                value={busca} onChange={e => setBusca(e.target.value)} style={styles.inputBusca} />
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={styles.select}>
                <option value="">Todos os cargos</option>
                {TIPOS_COLABORADOR.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filtroAtivo ? 'ativo' : 'inativo'}
                onChange={e => setFiltroAtivo(e.target.value === 'ativo')} style={styles.select}>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
              </select>
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', color: '#999' }}>Carregando colaboradores...</p>
            ) : colaboradoresFiltrados.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999' }}>Nenhum colaborador encontrado.</p>
            ) : (
              <div style={styles.gridContainer}>
                {colaboradoresFiltrados.map(colab => (
                  <div key={colab.id} style={styles.card}>
                    <div style={styles.cardHeader}>
                      <h3 style={{ margin: 0, fontSize: '15px' }}>{colab.nome}</h3>
                      <span style={{
                        ...styles.badge,
                        backgroundColor: colab.tipoContrato === 'CLT' ? '#28a745' : '#fd7e14',
                      }}>{colab.tipoContrato}</span>
                    </div>
                    <div style={styles.cardBody}>
                      <div style={styles.cardRow}>
                        <span style={styles.cardLabel}>Cargo:</span>
                        <span>{cargoDe(colab)}</span>
                      </div>
                      <div style={styles.cardRow}>
                        <span style={styles.cardLabel}>CPF:</span>
                        <span>{colab.cpf || '—'}</span>
                      </div>
                      <div style={styles.cardRow}>
                        <span style={styles.cardLabel}>Celular:</span>
                        <span>{celularDe(colab) || '—'}</span>
                      </div>
                      {colab.chavePix && (
                        <div style={styles.cardRow}>
                          <span style={styles.cardLabel}>PIX:</span>
                          <span style={{ color: '#666', fontSize: '12px' }}>{colab.chavePix}</span>
                        </div>
                      )}
                      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '8px', paddingTop: '8px' }}>
                        <div style={styles.cardRow}>
                          <span style={styles.cardLabel}>Dia:</span>
                          <span style={{ fontWeight: 'bold', color: '#1976d2' }}>{fmt(colab.valorDia)}</span>
                          <span style={{ ...styles.cardLabel, marginLeft: '12px' }}>Noite:</span>
                          <span style={{ fontWeight: 'bold', color: '#7b1fa2' }}>{fmt(colab.valorNoite)}</span>
                        </div>
                        <div style={styles.cardRow}>
                          <span style={styles.cardLabel}>Transp.:</span>
                          <span>{fmt(colab.valorTransporte)}</span>
                          <span style={{ marginLeft: '10px', fontSize: '12px', color: colab.valeAlimentacao ? '#388e3c' : '#999' }}>
                            {colab.valeAlimentacao ? '✅ VA' : '✗ VA'}
                          </span>
                        </div>
                      </div>
                      {(colab.diasDisponiveis || []).length > 0 && (
                        <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {(colab.diasDisponiveis || []).map(d => (
                            <span key={d} style={{ padding: '2px 6px', backgroundColor: '#e3f2fd', borderRadius: '3px', fontSize: '11px', color: '#1565c0' }}>
                              {DIAS_SEMANA.find(x => x.valor === d)?.label || d}
                            </span>
                          ))}
                          {colab.podeTrabalharDia   && <span style={{ padding: '2px 6px', backgroundColor: '#fff9c4', borderRadius: '3px', fontSize: '11px' }}>☀️</span>}
                          {colab.podeTrabalharNoite && <span style={{ padding: '2px 6px', backgroundColor: '#e8eaf6', borderRadius: '3px', fontSize: '11px' }}>🌙</span>}
                        </div>
                      )}
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

        {/* ── NOVO ── */}
        {abaSelecionada === 'novo' && (
          <div style={styles.formularioContainer}>
            <h2 style={{ marginTop: 0 }}>Novo Colaborador</h2>
            <CamposBasicos    data={novoColaborador} onChange={p => setNovoColaborador(prev => ({ ...prev, ...p }))} />
            <CamposEndereco   data={novoColaborador} onChange={p => setNovoColaborador(prev => ({ ...prev, ...p }))} />
            <CamposContratacao data={novoColaborador} onChange={p => setNovoColaborador(prev => ({ ...prev, ...p }))} />
            <CamposJornada    data={novoColaborador} onChange={p => setNovoColaborador(prev => ({ ...prev, ...p }))} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button onClick={() => setAbaSelecionada('lista')} style={styles.botaoCancelar}>Cancelar</button>
              <button onClick={handleCriarColaborador} style={styles.botaoSalvar}>💾 Salvar Colaborador</button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL EDIÇÃO ── */}
      {colaboradorEditando && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2 style={{ marginTop: 0 }}>✏️ Editar Colaborador</h2>
            <CamposBasicos
              data={colaboradorEditando}
              onChange={p => setColaboradorEditando(prev => prev ? { ...prev, ...p } : prev)} />
            <CamposEndereco
              data={colaboradorEditando}
              onChange={p => setColaboradorEditando(prev => prev ? { ...prev, ...p } : prev)} />
            <CamposContratacao
              data={colaboradorEditando}
              onChange={p => setColaboradorEditando(prev => prev ? { ...prev, ...p } : prev)} />
            <CamposJornada
              data={colaboradorEditando}
              onChange={p => setColaboradorEditando(prev => prev ? { ...prev, ...p } : prev)} />

            {/* Status ativo */}
            <div style={{ marginTop: '12px', marginBottom: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={colaboradorEditando.ativo}
                  onChange={e => setColaboradorEditando({ ...colaboradorEditando, ativo: e.target.checked })} />
                <span style={styles.label}>Colaborador ativo</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={() => setColaboradorEditando(null)} style={styles.botaoCancelar}>Cancelar</button>
              <button onClick={handleEditarColaborador} style={styles.botaoSalvar}>💾 Salvar Alterações</button>
              <button onClick={() => {
                if (window.confirm('Deletar este colaborador?')) {
                  handleDeletarColaborador(colaboradorEditando.id);
                  setColaboradorEditando(null);
                }
              }} style={{ ...styles.botaoCancelar, backgroundColor: '#dc3545', color: 'white', flex: 0.6 }}>
                🗑️
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer showLinks={true} />
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  pageWrapper:        { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  container:          { padding: '20px', maxWidth: '1400px', margin: '0 auto', width: '100%', flex: 1 },
  filtrosContainer:   { display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' },
  inputBusca:         { flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '220px' },
  select:             { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: 'white', cursor: 'pointer' },
  gridContainer:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' },
  card:               { border: '1px solid #ddd', borderRadius: '8px', padding: '14px', backgroundColor: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' },
  cardHeader:         { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '8px' },
  cardBody:           { marginBottom: '10px', fontSize: '13px' },
  cardRow:            { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' },
  cardLabel:          { color: '#888', fontWeight: 600, fontSize: '12px', minWidth: '52px' },
  cardActions:        { display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid #eee' },
  badge:              { padding: '3px 8px', borderRadius: '4px', color: 'white', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' },
  botaoEditar:        { flex: 1, padding: '7px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  botaoDeletar:       { flex: 1, padding: '7px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  formularioContainer:{ backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '8px' },
  secao:              { marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e0e0e0' },
  secaoTitulo:        { margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold', color: '#555' },
  grid2Col:           { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' },
  formGroup:          { display: 'flex', flexDirection: 'column', gap: '4px' },
  label:              { fontWeight: 'bold', fontSize: '13px', color: '#444' },
  input:              { padding: '9px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' },
  botaoSalvar:        { flex: 1, padding: '11px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
  botaoCancelar:      { flex: 1, padding: '11px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
  modal:              { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent:       { backgroundColor: 'white', padding: '24px', borderRadius: '8px', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', width: '94%', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' },
};

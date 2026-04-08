import React, { useState, useEffect } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { MovimentosCaixa } from './MovimentosCaixa';
import { ImportarCaixaCSV } from '../components/ImportarCaixaCSV';

interface RegistroCaixa {
  id: string;
  unitId: string;
  data: string;
  hora: string;
  periodo: 'Dia' | 'Noite';
  responsavel: string;
  responsavelNome?: string;
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
  editando?: boolean;
}

interface Usuario {
  id: string;
  nome: string;
  email: string;
}

export default function Caixa() {
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const userUnitId = (user as any)?.unitId || '';
  const unitId = activeUnit?.id || userUnitId || '';
  
  const [dataSelecionada, setDataSelecionada] = useState(new Date().toISOString().split('T')[0]);
  const [registros, setRegistros] = useState<RegistroCaixa[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [registroEditando, setRegistroEditando] = useState<Partial<RegistroCaixa> | null>(null);
  const [abaSelecionada, setAbaSelecionada] = useState<'novo' | 'movimentos'>('novo');
  const [modalImportarAberto, setModalImportarAberto] = useState(false);
  const [novoRegistro, setNovoRegistro] = useState<Partial<RegistroCaixa>>({
    periodo: 'Dia',
    abertura: 0,
    maq1: 0,
    maq2: 0,
    maq3: 0,
    maq4: 0,
    maq5: 0,
    maq6: 0,
    ifood: 0,
    dinheiro: 0,
    pix: 0,
    fiado: 0,
    sangria: 0,
    sistemaPdv: 0,
    referencia: 0,
    responsavel: (user as any)?.id || '',
  });

  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  useEffect(() => {
    const handleUnitChange = () => { carregarRegistros(); };
    window.addEventListener('unitChanged', handleUnitChange);
    return () => window.removeEventListener('unitChanged', handleUnitChange);
  }, [unitId]);

  useEffect(() => {
    if (unitId) carregarUsuarios();
  }, [unitId]);

  useEffect(() => {
    if (unitId) carregarRegistros();
  }, [dataSelecionada, unitId]);

  const carregarUsuarios = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/usuarios?unitId=${unitId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsuarios(Array.isArray(data) ? data : data.usuarios || []);
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const carregarRegistros = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const url = `${apiUrl}/caixa?unitId=${unitId}&data=${dataSelecionada}`;
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        const registrosArray = (Array.isArray(data) ? data : data.registros || []) as RegistroCaixa[];
        setRegistros(registrosArray.map(normalizeRegistro));
      } else {
        setRegistros([]);
      }
    } catch (error) {
      console.error('Erro ao carregar registros:', error);
      setRegistros([]);
    } finally {
      setLoading(false);
    }
  };

  const toNum = (val: any): number => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };

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

  // Campos que compõem o TOTAL (sangria NÃO entra no total - é retirada separada)
  const CAMPOS_TOTAL = ['abertura','maq1','maq2','maq3','maq4','maq5','maq6','ifood','dinheiro','pix','fiado'] as const;
  // Campos que disparam recálculo quando alterados
  const CAMPOS_RECALCULO = [...CAMPOS_TOTAL, 'sistemaPdv'] as const;

  const calcularTotais = (registro: Partial<RegistroCaixa>) => {
    const total = CAMPOS_TOTAL.reduce((acc, campo) => acc + toNum((registro as any)[campo]), 0);
    const diferenca = toNum(registro.sistemaPdv) - total;
    return { total, diferenca };
  };

  /** Abre modal de edição já com total/diferenca recalculados a partir dos valores armazenados */
  const abrirEdicao = (registro: RegistroCaixa) => {
    const normalizado = normalizeRegistro(registro);
    // Força recálculo para garantir que o total exibido bate com os campos individuais
    const { total, diferenca } = calcularTotais(normalizado);
    setRegistroEditando({ ...normalizado, total, diferenca });
  };

  const handleCriarRegistro = async () => {
    if (!unitId) { alert('Selecione uma unidade primeiro!'); return; }
    if (!novoRegistro.responsavel) { alert('Selecione um responsável!'); return; }

    const { total, diferenca } = calcularTotais(novoRegistro);
    const agora = new Date();
    const hora = agora.toTimeString().split(' ')[0];
    const responsavelNome = usuarios.find(u => u.id === novoRegistro.responsavel)?.nome || '';

    const registroCompleto: RegistroCaixa = {
      id: `${unitId}-${dataSelecionada}-${novoRegistro.periodo}-${Date.now()}`,
      unitId,
      data: dataSelecionada,
      hora,
      periodo: novoRegistro.periodo as 'Dia' | 'Noite',
      responsavel: novoRegistro.responsavel || '',
      responsavelNome,
      abertura:   toNum(novoRegistro.abertura),
      maq1:       toNum(novoRegistro.maq1),
      maq2:       toNum(novoRegistro.maq2),
      maq3:       toNum(novoRegistro.maq3),
      maq4:       toNum(novoRegistro.maq4),
      maq5:       toNum(novoRegistro.maq5),
      maq6:       toNum(novoRegistro.maq6),
      ifood:      toNum(novoRegistro.ifood),
      dinheiro:   toNum(novoRegistro.dinheiro),
      pix:        toNum(novoRegistro.pix),
      fiado:      toNum(novoRegistro.fiado),
      sangria:    toNum(novoRegistro.sangria),
      total,
      sistemaPdv: toNum(novoRegistro.sistemaPdv),
      diferenca,
      referencia: toNum(novoRegistro.referencia),
    };

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/caixa`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(registroCompleto)
      });

      if (response.ok) {
        alert('Registro salvo com sucesso!');
        setNovoRegistro({
          periodo: 'Dia', abertura: 0, maq1: 0, maq2: 0, maq3: 0, maq4: 0, maq5: 0,
          maq6: 0, ifood: 0, dinheiro: 0, pix: 0, fiado: 0, sangria: 0,
          sistemaPdv: 0, referencia: 0, responsavel: (user as any)?.id || '',
        });
        carregarRegistros();
      } else {
        const erro = await response.json();
        alert(`Erro ao salvar: ${erro.error}`);
      }
    } catch (error) {
      console.error('Erro ao criar registro:', error);
      alert('Erro ao salvar registro');
    }
  };

  const handleMudarCampoNovo = (campo: string, valor: any) => {
    const novoValor = { ...novoRegistro, [campo]: valor };
    if (['abertura','maq1','maq2','maq3','maq4','maq5','maq6','ifood','dinheiro','pix','fiado','sistemaPdv'].includes(campo)) {
      const { total, diferenca } = calcularTotais(novoValor);
      novoValor.total = total;
      novoValor.diferenca = diferenca;
    }
    setNovoRegistro(novoValor);
  };

  /* ── Modal Edit helpers ────────────────────────────────── */
  /**
   * Atualiza campo do registro em edição.
   * Aceita rawValue como string (vindo do onChange) ou number.
   * Para campos numéricos: preserva o valor digitado no estado como número;
   * se a string for vazia/inválida usa 0 apenas para o cálculo mas não
   * sobrescreve o input (o input usa seu próprio valor via `value` → number).
   */
  const handleMudarCampoEdit = (campo: string, rawValue: string | number) => {
    if (!registroEditando) return;
    // Converte para número: se vazio ou inválido, usa 0
    const parsed = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue as string);
    const numValue = isNaN(parsed) ? 0 : parsed;
    const updated = { ...registroEditando, [campo]: numValue };
    // Recalcula sempre que qualquer campo numérico relevante muda
    if ((CAMPOS_RECALCULO as readonly string[]).includes(campo)) {
      const { total, diferenca } = calcularTotais(updated);
      updated.total = total;
      updated.diferenca = diferenca;
    }
    setRegistroEditando(updated);
  };

  const handleSalvarEdicao = async () => {
    if (!registroEditando?.id) return;
    // Recalculate one final time before sending to guarantee consistency
    const { total, diferenca } = calcularTotais(registroEditando);
    const payload = { ...registroEditando, total, diferenca };
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/caixa/${registroEditando.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('Registro atualizado com sucesso!');
        setRegistroEditando(null);
        carregarRegistros();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Erro ao salvar: ' + (err.error || res.status));
      }
    } catch (err) {
      console.error('Erro ao salvar:', err);
      alert('Erro ao salvar registro');
    }
  };

  const handleDeletarRegistro = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja deletar este registro?')) return;
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/caixa/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) { carregarRegistros(); }
      else { alert('Erro ao deletar registro'); }
    } catch (error) {
      console.error('Erro ao deletar:', error);
    }
  };

  const formatarMoeda = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={styles.pageWrapper}>
      <Header title="💰 Controle de Caixa" showBack={true} />
      <div style={styles.container}>

        {/* ABAS */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ddd', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            {(['novo', 'movimentos'] as const).map(aba => (
              <button key={aba} onClick={() => setAbaSelecionada(aba)} style={{
                padding: '10px 20px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
                borderRadius: '4px 4px 0 0',
                backgroundColor: abaSelecionada === aba ? '#007bff' : '#f0f0f0',
                color: abaSelecionada === aba ? 'white' : '#333',
              }}>
                {aba === 'novo' ? '📝 Novo Registro' : '📊 Movimentos'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setModalImportarAberto(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              transition: 'all 0.3s'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            📥 Importar CSV
          </button>
        </div>

        {abaSelecionada === 'movimentos' && <MovimentosCaixa />}

        {abaSelecionada === 'novo' && (
          <>
            {/* FILTRO DE DATA */}
            <div style={{ ...styles.filtroSection, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={styles.label}>📅 Data:</label>
              {[{ label: '◀ Anterior', days: -1, color: '#2196F3' }, { label: 'Próximo ▶', days: 1, color: '#2196F3' }].map(btn => (
                <button key={btn.label} onClick={() => {
                  const d = new Date(dataSelecionada); d.setDate(d.getDate() + btn.days);
                  setDataSelecionada(d.toISOString().split('T')[0]);
                }} style={{ padding: '8px 12px', backgroundColor: btn.color, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                  {btn.label}
                </button>
              ))}
              <input type="date" value={dataSelecionada} onChange={e => setDataSelecionada(e.target.value)} style={styles.inputData} />
              <button onClick={() => setDataSelecionada(new Date().toISOString().split('T')[0])} style={{ padding: '8px 12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                Hoje
              </button>
            </div>

            {/* LAYOUT 2 COLUNAS */}
            <div style={styles.mainLayout}>

              {/* COLUNA 1: FORMULÁRIO */}
              <div style={styles.coluna1}>
                <div style={styles.formulario}>
                  <h2 style={styles.h2}>📝 Novo Registro</h2>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Responsável:</label>
                    <select value={novoRegistro.responsavel || ''} onChange={e => handleMudarCampoNovo('responsavel', e.target.value)} style={styles.input}>
                      <option value="">Selecione um responsável</option>
                      {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Período:</label>
                    <select value={novoRegistro.periodo} onChange={e => handleMudarCampoNovo('periodo', e.target.value)} style={styles.input}>
                      <option>Dia</option>
                      <option>Noite</option>
                    </select>
                  </div>

                  <h3 style={styles.h3}>💵 Valores de Entrada</h3>
                  <div style={styles.grid2Col}>
                    {[
                      { label: 'Abertura', campo: 'abertura' },
                      { label: 'Maq 1', campo: 'maq1' },
                      { label: 'Maq 2', campo: 'maq2' },
                      { label: 'Maq 3', campo: 'maq3' },
                      { label: 'Maq 4', campo: 'maq4' },
                      { label: 'Maq 5', campo: 'maq5' },
                      { label: 'Maq 6', campo: 'maq6' },
                      { label: 'iFood', campo: 'ifood' },
                      { label: 'Dinheiro', campo: 'dinheiro' },
                      { label: 'PIX', campo: 'pix' },
                      { label: 'Fiado', campo: 'fiado' },
                      { label: 'Sangria', campo: 'sangria' },
                    ].map(({ label, campo }) => (
                      <div key={campo} style={styles.formGroup}>
                        <label style={styles.label}>{label} (R$):</label>
                        <input type="number" step="0.01" value={(novoRegistro as any)[campo] || 0}
                          onChange={e => handleMudarCampoNovo(campo, parseFloat(e.target.value) || 0)} style={styles.input} />
                      </div>
                    ))}
                  </div>

                  <h3 style={styles.h3}>📊 Sistema PDV</h3>
                  <div style={styles.grid2Col}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Sistema PDV (R$):</label>
                      <input type="number" step="0.01" value={novoRegistro.sistemaPdv || 0} onChange={e => handleMudarCampoNovo('sistemaPdv', parseFloat(e.target.value) || 0)} style={styles.input} />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Referência (R$):</label>
                      <input type="number" step="0.01" value={novoRegistro.referencia || 0} onChange={e => handleMudarCampoNovo('referencia', parseFloat(e.target.value) || 0)} style={styles.input} />
                    </div>
                  </div>

                  {/* RESUMO AO VIVO */}
                  <div style={styles.resumo}>
                    <div style={styles.resumoItem}>
                      <span style={styles.resumoLabel}>Total (Entradas):</span>
                      <span style={styles.resumoValor}>{formatarMoeda(novoRegistro.total || 0)}</span>
                    </div>
                    <div style={styles.resumoItem}>
                      <span style={styles.resumoLabel}>Sistema PDV:</span>
                      <span style={styles.resumoValor}>{formatarMoeda(novoRegistro.sistemaPdv || 0)}</span>
                    </div>
                    <div style={styles.resumoItem}>
                      <span style={styles.resumoLabel}>Diferença (PDV − Total):</span>
                      <span style={{ ...styles.resumoValor, color: (novoRegistro.diferenca || 0) !== 0 ? '#d32f2f' : '#388e3c' }}>
                        {formatarMoeda(novoRegistro.diferenca || 0)}
                      </span>
                    </div>
                  </div>

                  <button onClick={handleCriarRegistro} style={styles.botaoSalvar}>
                    💾 Salvar Registro
                  </button>
                </div>
              </div>

              {/* COLUNA 2: REGISTROS DO DIA */}
              <div style={styles.coluna2}>
                <div style={styles.registrosBox}>
                  <h2 style={styles.h2}>📋 Registros do Dia — {dataSelecionada}</h2>
                  {loading ? (
                    <p style={styles.mensagem}>Carregando...</p>
                  ) : registros.length === 0 ? (
                    <p style={styles.mensagem}>Nenhum registro para esta data</p>
                  ) : (
                    <div style={styles.registrosList}>
                      {registros.map((registro, idx) => (
                        <div key={registro.id} style={styles.registroCard}>
                          <div style={styles.registroHeader}>
                            <span style={styles.registroIndex}>#{idx + 1}</span>
                            <span style={styles.registroPeriodo}>{registro.periodo}</span>
                            <span style={styles.registroHora}>{registro.hora}</span>
                          </div>
                          <div style={styles.registroContent}>
                            <div style={styles.registroRow}>
                              <span style={styles.registroLabel}>Responsável:</span>
                              <span style={styles.registroValue}>{registro.responsavelNome || registro.responsavel}</span>
                            </div>
                            {/* Breakdown */}
                            {[
                              { l: 'Abertura', v: registro.abertura },
                              { l: 'Maq 1', v: registro.maq1 },
                              { l: 'Maq 2', v: registro.maq2 },
                              { l: 'Maq 3', v: registro.maq3 },
                              { l: 'Maq 4', v: registro.maq4 },
                              { l: 'Maq 5', v: registro.maq5 },
                              { l: 'Maq 6', v: registro.maq6 },
                              { l: 'iFood', v: registro.ifood },
                              { l: 'Dinheiro', v: registro.dinheiro },
                              { l: 'PIX', v: registro.pix },
                              { l: 'Fiado', v: registro.fiado },
                              { l: 'Sangria', v: registro.sangria },
                            ].filter(x => x.v > 0).map(({ l, v }) => (
                              <div key={l} style={{ ...styles.registroRow, fontSize: '12px' }}>
                                <span style={{ color: '#888' }}>{l}:</span>
                                <span style={{ color: '#555' }}>{formatarMoeda(v)}</span>
                              </div>
                            ))}
                            <div style={{ borderTop: '1px solid #eee', paddingTop: '6px', marginTop: '4px' }}>
                              <div style={styles.registroRow}>
                                <span style={styles.registroLabel}>Total Entradas:</span>
                                <span style={{ ...styles.registroValue, fontWeight: 'bold', color: '#1976d2' }}>{formatarMoeda(registro.total)}</span>
                              </div>
                              <div style={styles.registroRow}>
                                <span style={styles.registroLabel}>Sistema PDV:</span>
                                <span style={styles.registroValue}>{formatarMoeda(registro.sistemaPdv)}</span>
                              </div>
                              <div style={styles.registroRow}>
                                <span style={styles.registroLabel}>Diferença:</span>
                                <span style={{ ...styles.registroValue, color: registro.diferenca !== 0 ? '#d32f2f' : '#388e3c', fontWeight: 'bold' }}>{formatarMoeda(registro.diferenca)}</span>
                              </div>
                              <div style={styles.registroRow}>
                                <span style={styles.registroLabel}>Referência:</span>
                                <span style={styles.registroValue}>{formatarMoeda(registro.referencia)}</span>
                              </div>
                            </div>
                          </div>
                          <div style={styles.registroActions}>
                            <button onClick={() => abrirEdicao(registro)} style={styles.botaoEditar}>✏️ Editar</button>
                            <button onClick={() => handleDeletarRegistro(registro.id)} style={styles.botaoDeletar}>🗑️ Deletar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODAL DE EDIÇÃO */}
      {registroEditando && (
        <div style={styles.modal}>
          <div style={{ ...styles.modalContent, maxHeight: '90vh', overflowY: 'auto' }}>
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
                { label: 'Maq 1', campo: 'maq1' },
                { label: 'Maq 2', campo: 'maq2' },
                { label: 'Maq 3', campo: 'maq3' },
                { label: 'Maq 4', campo: 'maq4' },
                { label: 'Maq 5', campo: 'maq5' },
                { label: 'Maq 6', campo: 'maq6' },
                { label: 'iFood', campo: 'ifood' },
                { label: 'Dinheiro', campo: 'dinheiro' },
                { label: 'PIX', campo: 'pix' },
                { label: 'Fiado', campo: 'fiado' },
                { label: 'Sangria *', campo: 'sangria' },
              ].map(({ label, campo }) => (
                <div key={campo} style={styles.formGroup}>
                  <label style={styles.label}>{label} (R$):</label>
                  <input
                    type="number" step="0.01"
                    value={(registroEditando as any)[campo] ?? 0}
                    onChange={e => handleMudarCampoEdit(campo, e.target.value)}
                    onFocus={e => e.target.select()}
                    style={styles.input}
                  />
                </div>
              ))}
            </div>

            <h3 style={styles.h3}>📊 Sistema PDV</h3>
            <div style={styles.grid2Col}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Sistema PDV (R$):</label>
                <input type="number" step="0.01"
                  value={registroEditando.sistemaPdv ?? 0}
                  onChange={e => handleMudarCampoEdit('sistemaPdv', e.target.value)}
                  onFocus={e => e.target.select()}
                  style={styles.input} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Referência (R$):</label>
                <input type="number" step="0.01"
                  value={registroEditando.referencia ?? 0}
                  onChange={e => handleMudarCampoEdit('referencia', e.target.value)}
                  onFocus={e => e.target.select()}
                  style={styles.input} />
              </div>
              <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                <small style={{ color: '#888', fontSize: '11px' }}>* Sangria = retirada do caixa físico. Não soma no Total de Entradas.</small>
              </div>
            </div>

            {/* RESUMO LIVE NO MODAL — recalculado automaticamente */}
            <div style={{ ...styles.resumo, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              <div style={styles.resumoItem}>
                <span style={styles.resumoLabel}>Total (Entradas):</span>
                <span style={styles.resumoValor}>{formatarMoeda(registroEditando.total || 0)}</span>
              </div>
              <div style={styles.resumoItem}>
                <span style={styles.resumoLabel}>Sistema PDV:</span>
                <span style={styles.resumoValor}>{formatarMoeda(registroEditando.sistemaPdv || 0)}</span>
              </div>
              <div style={styles.resumoItem}>
                <span style={styles.resumoLabel}>Diferença (PDV−Total):</span>
                <span style={{ ...styles.resumoValor, color: (registroEditando.diferenca || 0) !== 0 ? '#d32f2f' : '#388e3c' }}>
                  {formatarMoeda(registroEditando.diferenca || 0)}
                </span>
              </div>
              <div style={styles.resumoItem}>
                <span style={styles.resumoLabel}>Sangria (retirada):</span>
                <span style={{ ...styles.resumoValor, color: '#e65100' }}>
                  {formatarMoeda(toNum(registroEditando.sangria))}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button onClick={() => setRegistroEditando(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#9e9e9e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                ✕ Cancelar
              </button>
              <button onClick={handleSalvarEdicao} style={{ flex: 2, padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                💾 Salvar Alterações
              </button>
              <button onClick={() => {
                if (registroEditando.id && window.confirm('Deletar este registro?')) {
                  handleDeletarRegistro(registroEditando.id);
                  setRegistroEditando(null);
                }
              }} style={{ flex: 1, padding: '10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                🗑️ Deletar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importação CSV */}
      {modalImportarAberto && (
        <ImportarCaixaCSV
          unitId={unitId}
          onImportSuccess={() => {
            setModalImportarAberto(false);
            carregarRegistros();
            alert('✅ Dados importados! Atualizando lista...');
          }}
          onClose={() => setModalImportarAberto(false)}
        />
      )}

      <Footer showLinks={true} />
    </div>
  );
}

const styles = {
  pageWrapper: { display: 'flex', flexDirection: 'column' as const, minHeight: '100vh' },
  container: { padding: '20px', maxWidth: '1600px', margin: '0 auto', width: '100%', flex: 1 },
  filtroSection: { marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' },
  label: { fontWeight: 'bold' as const, fontSize: '14px', color: '#333' },
  inputData: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', minWidth: '150px' },
  mainLayout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' } as React.CSSProperties,
  coluna1: { display: 'flex', flexDirection: 'column' as const },
  coluna2: { display: 'flex', flexDirection: 'column' as const },
  formulario: { backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  h2: { margin: '0 0 15px 0', fontSize: '18px', fontWeight: 'bold', color: '#333' },
  h3: { margin: '15px 0 10px 0', fontSize: '14px', fontWeight: 'bold', color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '5px' },
  formGroup: { marginBottom: '12px', display: 'flex', flexDirection: 'column' as const, gap: '5px' },
  input: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' },
  grid2Col: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } as React.CSSProperties,
  resumo: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '6px', marginTop: '15px', marginBottom: '15px' } as React.CSSProperties,
  resumoItem: { display: 'flex', flexDirection: 'column' as const, gap: '3px' },
  resumoLabel: { fontSize: '11px', color: '#555', fontWeight: 'bold' as const, textTransform: 'uppercase' as const },
  resumoValor: { fontSize: '16px', fontWeight: 'bold', color: '#388e3c' },
  botaoSalvar: { width: '100%', padding: '12px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' as const },
  registrosBox: { backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  registrosList: { display: 'flex', flexDirection: 'column' as const, gap: '12px', maxHeight: '850px', overflowY: 'auto' as const },
  registroCard: { backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '6px', padding: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  registroHeader: { display: 'flex', gap: '10px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #eee' } as React.CSSProperties,
  registroIndex: { fontWeight: 'bold', color: '#1976d2', fontSize: '12px' },
  registroPeriodo: { backgroundColor: '#fff3cd', padding: '2px 8px', borderRadius: '3px', fontSize: '12px', fontWeight: 'bold' },
  registroHora: { color: '#666', fontSize: '12px', marginLeft: 'auto' },
  registroContent: { display: 'flex', flexDirection: 'column' as const, gap: '4px', marginBottom: '10px' },
  registroActions: { display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid #eee' } as React.CSSProperties,
  botaoEditar: { flex: 1, padding: '6px 10px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' } as React.CSSProperties,
  botaoDeletar: { flex: 1, padding: '6px 10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' } as React.CSSProperties,
  registroRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' } as React.CSSProperties,
  registroLabel: { color: '#666', fontWeight: '600' as const },
  registroValue: { color: '#333', fontWeight: '500' as const },
  mensagem: { textAlign: 'center' as const, color: '#999', padding: '20px', fontSize: '14px' },
  modal: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 } as React.CSSProperties,
  modalContent: { backgroundColor: 'white', borderRadius: '8px', padding: '24px', maxWidth: '700px', width: '92%', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' } as React.CSSProperties,
};

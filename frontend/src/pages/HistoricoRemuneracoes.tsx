import React, { useState, useEffect } from 'react';
import { useUnit } from '../contexts/UnitContext';
// import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { fetchAuth } from '../utils/fetchAuth';

const apiUrl = (import.meta as any).env?.VITE_API_ENDPOINT || '';
const fmtMoeda = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0,00';
const fmtData = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '-';

const DIAS_PT: Record<string, string> = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };

interface Remuneracao {
  id: string;
  colaboradorId: string;
  unitId: string;
  tipoAcordo: string | null;
  acordo: any;
  valorDia: number;
  valorNoite: number;
  valorTransporte: number;
  effectiveDate: string;
  endDate?: string;
  criadoPor: string;
  criadoEm: string;
  observacao: string;
}

interface Colaborador {
  id: string;
  nome: string;
  tipoContrato?: string;
  ativo?: boolean;
}

export default function HistoricoRemuneracoes() {
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || '';
  const token = () => localStorage.getItem('auth_token') || '';

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedColab, setSelectedColab] = useState<string>('');
  const [remuneracoes, setRemuneracoes] = useState<Remuneracao[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');

  // Carregar colaboradores
  useEffect(() => {
    if (!unitId) return;
    fetchAuth(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => {
        const lista = (Array.isArray(d) ? d : d.data || []).filter((c: any) => c.ativo !== false);
        lista.sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''));
        setColaboradores(lista);
      })
      .catch(err => console.error('Erro colabs:', err));
  }, [unitId]);

  // Carregar remunerações quando selecionar colaborador
  useEffect(() => {
    if (!selectedColab) { setRemuneracoes([]); return; }
    setLoading(true);
    fetchAuth(`${apiUrl}/remuneracoes?colaboradorId=${selectedColab}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => {
        const lista = Array.isArray(d) ? d : d.data || [];
        lista.sort((a: any, b: any) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''));
        setRemuneracoes(lista);
      })
      .catch(err => console.error('Erro remuneracoes:', err))
      .finally(() => setLoading(false));
  }, [selectedColab]);

  const colabsFiltrados = busca
    ? colaboradores.filter(c => (c.nome || '').toLowerCase().includes(busca.toLowerCase()))
    : colaboradores;

  const colabSelecionado = colaboradores.find(c => c.id === selectedColab);

  const renderTabela = (acordo: any) => {
    if (!acordo?.tabela) return null;
    const tab = acordo.tabela;
    const dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
    return (
      <table style={{ borderCollapse: 'collapse', fontSize: '11px', marginTop: '6px', width: '100%' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={{ padding: '4px 6px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Dia</th>
            <th style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>☀️ Dia</th>
            <th style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>🌙 Noite</th>
          </tr>
        </thead>
        <tbody>
          {dias.map(dia => {
            const d = tab[dia];
            if (!d) return null;
            return (
              <tr key={dia} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '3px 6px' }}>{DIAS_PT[dia] || dia}</td>
                <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 'bold' }}>{fmtMoeda(d.D || 0)}</td>
                <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 'bold' }}>{fmtMoeda(d.N || 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const s = {
    card: { background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } as React.CSSProperties,
    input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' } as React.CSSProperties,
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <Header title="📊 Histórico de Remunerações" showBack={true} />

      {/* Seletor de colaborador */}
      <div style={{ ...s.card, display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>Buscar colaborador</label>
          <input type="text" placeholder="Filtrar por nome..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...s.input, width: '100%' }} />
        </div>
        <div style={{ flex: 2, minWidth: '250px' }}>
          <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>Colaborador</label>
          <select value={selectedColab} onChange={e => setSelectedColab(e.target.value)}
            style={{ ...s.input, width: '100%' }}>
            <option value="">— Selecione um colaborador —</option>
            {colabsFiltrados.map(c => (
              <option key={c.id} value={c.id}>
                {c.nome} {c.tipoContrato === 'Freelancer' ? '🎯' : '💳'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sem seleção */}
      {!selectedColab && (
        <div style={{ ...s.card, textAlign: 'center', color: '#999', padding: '40px' }}>
          <div style={{ fontSize: '50px', marginBottom: '12px' }}>📊</div>
          <div style={{ fontSize: '16px' }}>Selecione um colaborador para ver o histórico de remunerações</div>
          <div style={{ fontSize: '12px', marginTop: '8px' }}>
            O sistema registra automaticamente cada mudança de valor/acordo.<br />
            Aqui você consulta quanto cada pessoa ganhava em cada período.
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>⏳ Carregando...</div>}

      {/* Resultado */}
      {selectedColab && !loading && (
        <>
          <div style={{ ...s.card, background: '#e3f2fd', borderLeft: '4px solid #1976d2' }}>
            <strong>👤 {colabSelecionado?.nome}</strong>
            <span style={{ marginLeft: '12px', fontSize: '12px', color: '#666' }}>
              {remuneracoes.length} registro(s) de remuneração
            </span>
          </div>

          {remuneracoes.length === 0 && (
            <div style={{ ...s.card, textAlign: 'center', color: '#999' }}>
              Nenhuma remuneração registrada para este colaborador.
            </div>
          )}

          {/* Timeline */}
          {remuneracoes.map((rem) => {
            const isVigente = !rem.endDate;
            return (
              <div key={rem.id} style={{
                ...s.card,
                borderLeft: `4px solid ${isVigente ? '#2e7d32' : '#bdbdbd'}`,
                opacity: isVigente ? 1 : 0.85,
              }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div>
                    <span style={{
                      background: isVigente ? '#e8f5e9' : '#f5f5f5',
                      color: isVigente ? '#2e7d32' : '#757575',
                      padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold',
                    }}>
                      {isVigente ? '🟢 VIGENTE' : '⚪ ENCERRADO'}
                    </span>
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#666' }}>
                      {fmtData(rem.effectiveDate)} → {rem.endDate ? fmtData(rem.endDate) : 'atual'}
                    </span>
                  </div>
                  {rem.tipoAcordo === 'valor_turno' && (
                    <span style={{ background: '#fff3e0', color: '#e65100', padding: '2px 8px', borderRadius: '8px', fontSize: '10px' }}>
                      📅 Tabela variável
                    </span>
                  )}
                </div>

                {/* Valores */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: '#666', fontSize: '11px' }}>☀️ Dia</span><br />
                    <strong>{fmtMoeda(rem.valorDia)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#666', fontSize: '11px' }}>🌙 Noite</span><br />
                    <strong>{fmtMoeda(rem.valorNoite)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#666', fontSize: '11px' }}>🚗 Transporte</span><br />
                    <strong>{fmtMoeda(rem.valorTransporte)}</strong>
                  </div>
                </div>

                {/* Tabela variável */}
                {rem.acordo?.tabela && renderTabela(rem.acordo)}

                {/* Footer */}
                <div style={{ marginTop: '10px', fontSize: '10px', color: '#999', display: 'flex', gap: '16px' }}>
                  <span>👤 {rem.criadoPor}</span>
                  <span>📅 {rem.criadoEm ? new Date(rem.criadoEm).toLocaleString('pt-BR') : '-'}</span>
                  {rem.observacao && <span>📝 {rem.observacao}</span>}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

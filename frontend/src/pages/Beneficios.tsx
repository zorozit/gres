/**
 * Módulo de Benefícios — Controle de benefício transporte mensal
 *
 * Separado do módulo Adiantamentos:
 * - Adiantamentos = empréstimos pontuais (Especial, Salário)
 * - Benefícios = recorrente mensal (Transporte CLT)
 *
 * NÃO altera registros em gres-prod-saidas ou gres-prod-folha-pagamento.
 * Usa tabela própria gres-prod-beneficios.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUnit } from '../contexts/UnitContext';

const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
const getToken = () => localStorage.getItem('auth_token') || '';
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Beneficio {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  unitId: string;
  mes: string;
  tipo: string;
  valorCreditado: number;
  valorConsumido: number;
  diasConsumidos: number;
  valorDiario: number;
  saldo: number;
  status: 'ativo' | 'zerado' | 'excedido';
  createdAt: string;
  updatedAt: string;
}

interface Colaborador {
  id: string;
  nome: string;
  tipoContrato: string;
  beneficioTransporte?: {
    tipo: string;
    valorMensal: number;
    valorDiario: number;
    diaCredito: number;
  };
  valorTransporte: number;
  ativo: boolean;
}

export default function Beneficios() {
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';

  const hoje = new Date();
  const mesAtualDefault = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  const [mes, setMes] = useState(mesAtualDefault);
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(false);
  const [creditando, setCreditando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchAuth = useCallback(async (url: string, opts: any = {}) => {
    return fetch(url, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${getToken()}` } });
  }, []);

  const carregar = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const [rBen, rCol] = await Promise.all([
        fetchAuth(`${apiUrl}/beneficios?unitId=${unitId}&mes=${mes}`),
        fetchAuth(`${apiUrl}/colaboradores?unitId=${unitId}&incluirInativos=true`),
      ]);
      if (rBen.ok) setBeneficios(await rBen.json());
      if (rCol.ok) setColaboradores(await rCol.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [unitId, mes, apiUrl, fetchAuth]);

  useEffect(() => { carregar(); }, [carregar]);

  // Colaboradores CLT com benefício configurado
  const colabsComBeneficio = useMemo(() =>
    colaboradores.filter(c =>
      c.ativo !== false &&
      c.beneficioTransporte &&
      c.beneficioTransporte.tipo !== 'nenhum'
    ).sort((a, b) => a.nome.localeCompare(b.nome)),
    [colaboradores]
  );

  // Map benefício por colaboradorId
  const benMap = useMemo(() => {
    const m = new Map<string, Beneficio>();
    beneficios.forEach(b => m.set(b.colaboradorId, b));
    return m;
  }, [beneficios]);

  // Totais
  const totais = useMemo(() => {
    const creditado = beneficios.reduce((s, b) => s + b.valorCreditado, 0);
    const consumido = beneficios.reduce((s, b) => s + b.valorConsumido, 0);
    const saldo = beneficios.reduce((s, b) => s + b.saldo, 0);
    const dias = beneficios.reduce((s, b) => s + b.diasConsumidos, 0);
    return { creditado, consumido, saldo, dias };
  }, [beneficios]);

  const creditar = async () => {
    setCreditando(true);
    setMsg('');
    try {
      const r = await fetchAuth(`${apiUrl}/beneficios/creditar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, mes }),
      });
      const data = await r.json();
      if (r.ok) {
        setMsg(`✅ ${data.creditados} benefício(s) creditado(s)${data.jaExistentes > 0 ? ` (${data.jaExistentes} já existiam)` : ''}`);
        await carregar();
      } else {
        setMsg(`❌ ${data.error}`);
      }
    } catch (e) { setMsg('❌ Erro ao creditar'); }
    finally { setCreditando(false); }
  };

  const recalcular = async () => {
    setRecalculando(true);
    setMsg('');
    try {
      const r = await fetchAuth(`${apiUrl}/beneficios/recalcular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, mes }),
      });
      const data = await r.json();
      if (r.ok) {
        setMsg(`🔄 ${data.recalculados} benefício(s) recalculado(s)`);
        await carregar();
      } else {
        setMsg(`❌ ${data.error}`);
      }
    } catch (e) { setMsg('❌ Erro ao recalcular'); }
    finally { setRecalculando(false); }
  };

  const mesLabel = (m: string) => {
    const [y, mm] = m.split('-');
    const nomes = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${nomes[parseInt(mm)]} ${y}`;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>🎁 Benefícios</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: '14px' }}>
            Controle de benefício transporte mensal — {mesLabel(mes)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="month" value={mes} onChange={e => setMes(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
          <button onClick={creditar} disabled={creditando}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#4caf50', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', opacity: creditando ? 0.6 : 1 }}>
            {creditando ? '⏳ Creditando...' : '💳 Creditar Mês'}
          </button>
          <button onClick={recalcular} disabled={recalculando}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#1976d2', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', opacity: recalculando ? 0.6 : 1 }}>
            {recalculando ? '⏳...' : '🔄 Recalcular'}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ padding: '10px 16px', marginBottom: '16px', borderRadius: '6px', background: msg.startsWith('✅') || msg.startsWith('🔄') ? '#e8f5e9' : '#ffebee', color: msg.startsWith('✅') || msg.startsWith('🔄') ? '#2e7d32' : '#c62828', fontSize: '14px' }}>
          {msg}
        </div>
      )}

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Colaboradores', value: beneficios.length.toString(), color: '#1565c0', bg: '#e3f2fd', prefix: '' },
          { label: 'Creditado', value: fmt(totais.creditado), color: '#2e7d32', bg: '#e8f5e9', prefix: '' },
          { label: 'Consumido', value: fmt(totais.consumido), color: '#e65100', bg: '#fff3e0', prefix: '' },
          { label: 'Saldo', value: fmt(totais.saldo), color: totais.saldo >= 0 ? '#2e7d32' : '#c62828', bg: totais.saldo >= 0 ? '#e8f5e9' : '#ffebee', prefix: '' },
          { label: 'Dias totais', value: totais.dias.toString(), color: '#6a1b9a', bg: '#f3e5f5', prefix: '' },
        ].map(card => (
          <div key={card.label} style={{ padding: '14px', borderRadius: '10px', background: card.bg, textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: card.color, fontWeight: 600, textTransform: 'uppercase' as const }}>{card.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: card.color, marginTop: '4px' }}>{card.prefix}{card.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>⏳ Carregando...</div>
      ) : beneficios.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#f9f9f9', borderRadius: '10px', border: '1px solid #eee' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>📋</div>
          <div style={{ fontSize: '16px', color: '#666', fontWeight: 600 }}>Nenhum benefício creditado para {mesLabel(mes)}</div>
          <div style={{ fontSize: '13px', color: '#999', marginTop: '8px' }}>
            {colabsComBeneficio.length > 0
              ? `${colabsComBeneficio.length} colaborador(es) com benefício configurado. Clique "💳 Creditar Mês" para gerar.`
              : 'Configure o benefício transporte no cadastro dos colaboradores CLT primeiro.'}
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                <th style={thStyle}>Colaborador</th>
                <th style={{ ...thStyle, textAlign: 'right' as const }}>Creditado</th>
                <th style={{ ...thStyle, textAlign: 'right' as const }}>Consumido</th>
                <th style={{ ...thStyle, textAlign: 'center' as const }}>Dias</th>
                <th style={{ ...thStyle, textAlign: 'right' as const }}>R$/dia</th>
                <th style={{ ...thStyle, textAlign: 'right' as const }}>Saldo</th>
                <th style={{ ...thStyle, textAlign: 'center' as const }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {beneficios
                .sort((a, b) => (a.colaboradorNome || '').localeCompare(b.colaboradorNome || ''))
                .map(b => {
                  const statusBadge = b.status === 'excedido'
                    ? { emoji: '🔴', text: 'Excedido', color: '#c62828', bg: '#ffebee' }
                    : b.status === 'zerado'
                    ? { emoji: '✅', text: 'Zerado', color: '#2e7d32', bg: '#e8f5e9' }
                    : { emoji: '🟢', text: 'Ativo', color: '#1565c0', bg: '#e3f2fd' };

                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{b.colaboradorNome}</div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' as const, color: '#2e7d32', fontWeight: 600 }}>{fmt(b.valorCreditado)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' as const, color: '#e65100' }}>{fmt(b.valorConsumido)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' as const }}>{b.diasConsumidos}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' as const, color: '#666' }}>{fmt(b.valorDiario)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' as const, fontWeight: 700, color: b.saldo >= 0 ? '#2e7d32' : '#c62828' }}>{fmt(b.saldo)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' as const }}>
                        <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: statusBadge.bg, color: statusBadge.color }}>
                          {statusBadge.emoji} {statusBadge.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #ddd', fontWeight: 700, background: '#fafafa' }}>
                <td style={tdStyle}>TOTAL</td>
                <td style={{ ...tdStyle, textAlign: 'right' as const, color: '#2e7d32' }}>{fmt(totais.creditado)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' as const, color: '#e65100' }}>{fmt(totais.consumido)}</td>
                <td style={{ ...tdStyle, textAlign: 'center' as const }}>{totais.dias}</td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, textAlign: 'right' as const, color: totais.saldo >= 0 ? '#2e7d32' : '#c62828' }}>{fmt(totais.saldo)}</td>
                <td style={tdStyle}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Info: colaboradores sem benefício configurado */}
      {colabsComBeneficio.length === 0 && colaboradores.filter(c => c.tipoContrato === 'CLT' && c.ativo !== false).length > 0 && (
        <div style={{ marginTop: '20px', padding: '16px', background: '#fff8e1', borderRadius: '8px', border: '1px solid #ffe082' }}>
          <div style={{ fontWeight: 600, color: '#f57f17', marginBottom: '6px' }}>⚠️ Nenhum CLT tem benefício transporte configurado</div>
          <div style={{ fontSize: '13px', color: '#666' }}>
            Para usar este módulo, configure o benefício no cadastro de cada colaborador CLT:
            Colaboradores → Editar → seção "🎁 Benefício Transporte Mensal" → selecionar "Mensal fixo" e informar valor.
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#555', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '10px 12px' };

import { useEffect, useState } from 'react';

export type AbaModal = 'cadastro' | 'historico' | 'pagamentos' | 'escalas' | 'saidas' | 'motoboy';

interface Props {
  colaboradorId: string;
  apiUrl: string;
  token: string | null;
}

interface PropsComUnit extends Props {
  unitId: string;
}

const fmt = (v: any) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (typeof v === 'boolean') return v ? '✅ sim' : '❌ não';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const fmtMoeda = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDataHora = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const EVENTO_LABEL: Record<string, { icon: string; label: string; cor: string }> = {
  criado:                { icon: '🆕', label: 'Cadastro criado',          cor: '#2e7d32' },
  alterado:              { icon: '✏️', label: 'Alteração genérica',       cor: '#1565c0' },
  remuneracao_alterada:  { icon: '💰', label: 'Remuneração alterada',     cor: '#e65100' },
  cargo_alterado:        { icon: '👔', label: 'Cargo / função alterado',  cor: '#6a1b9a' },
  contrato_alterado:     { icon: '📜', label: 'Tipo de contrato alterado', cor: '#c62828' },
  transferido:           { icon: '🔄', label: 'Transferido de unidade',   cor: '#f57f17' },
  desativado:            { icon: '🚪', label: 'Desligamento',             cor: '#c62828' },
  reativado:             { icon: '♻️', label: 'Reativação',                cor: '#2e7d32' },
  deletado:              { icon: '🗑️', label: 'Deletado',                  cor: '#888' },
};

const CAMPO_LABEL: Record<string, string> = {
  nome: 'Nome', cpf: 'CPF', celular: 'Celular', telefone: 'Telefone', email: 'E-mail',
  tipoContrato: 'Tipo de contrato', cargo: 'Cargo', tipo: 'Tipo', funcao: 'Função', area: 'Área',
  salario: 'Salário base', periculosidade: 'Periculosidade %',
  valorDia: 'Adic. Dobra-Dia', valorNoite: 'Adic. Dobra-Noite',
  valorTransporte: 'Transporte/dia',
  valorChegadaDia: 'Chegada Dia', valorChegadaNoite: 'Chegada Noite', valorEntrega: 'Valor/Entrega',
  chavePix: 'Chave PIX', dataAdmissao: 'Admissão', dataDemissao: 'Demissão',
  unitId: 'Unidade', ativo: 'Ativo',
  horarioEntrada: 'Horário entrada', horarioSaida: 'Horário saída',
  isMotoboy: 'É motoboy', tipoAcordo: 'Tipo de acordo', valeAlimentacao: 'Vale alimentação',
  podeTrabalharDia: 'Pode trabalhar dia', podeTrabalharNoite: 'Pode trabalhar noite',
};

/* ─────────── HISTÓRICO DE CADASTRO (logs de alteração) ─────────── */
export const HistoricoColaborador: React.FC<Props> = ({ colaboradorId, apiUrl, token }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!colaboradorId) return;
    setLoading(true);
    fetch(`${apiUrl}/colaboradores-log/${colaboradorId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setLogs(Array.isArray(d) ? d : []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [colaboradorId, apiUrl, token]);

  if (loading) return <div style={{ padding: 20, color: '#666' }}>Carregando histórico…</div>;
  if (logs.length === 0) {
    return (
      <div style={{ padding: 20, color: '#888', textAlign: 'center', backgroundColor: '#f5f5f5', borderRadius: 6 }}>
        ℹ️ Sem alterações registradas para este colaborador.
        <div style={{ fontSize: 11, marginTop: 6 }}>Mudanças feitas a partir de agora ficarão registradas aqui (data, usuário, antes/depois).</div>
      </div>
    );
  }

  return (
    <div style={{ maxHeight: 480, overflowY: 'auto' }}>
      <div style={{ marginBottom: 10, fontSize: 12, color: '#666' }}>
        📋 {logs.length} alteração{logs.length > 1 ? 'ões' : ''} registrada{logs.length > 1 ? 's' : ''}
      </div>
      {logs.map(log => {
        const meta = EVENTO_LABEL[log.evento] || EVENTO_LABEL.alterado;
        // Identificar campos modificados comparando antes/depois
        const antes = log.valoresAntes || {};
        const depois = log.valoresDepois || {};
        const campos = new Set([...Object.keys(antes), ...Object.keys(depois)]);
        const diffs: Array<{ campo: string; antes: any; depois: any }> = [];
        for (const c of campos) {
          if (!CAMPO_LABEL[c]) continue;
          const a = antes[c];
          const d = depois[c];
          if (JSON.stringify(a) !== JSON.stringify(d)) diffs.push({ campo: c, antes: a, depois: d });
        }

        return (
          <div key={log.id} style={{
            border: '1px solid #e0e0e0', borderRadius: 6, padding: 12, marginBottom: 8,
            backgroundColor: '#fafafa',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: meta.cor }}>{meta.icon} {meta.label}</span>
                {log.observacao && <span style={{ marginLeft: 8, fontSize: 11, color: '#888', fontStyle: 'italic' }}>"{log.observacao}"</span>}
              </div>
              <div style={{ fontSize: 11, color: '#666', textAlign: 'right' }}>
                <div>🕒 {fmtDataHora(log.timestamp)}</div>
                <div>👤 {log.usuarioNome || log.usuarioId || 'desconhecido'}</div>
                {log.unitId && <div>🏢 {log.unitId}</div>}
              </div>
            </div>
            {diffs.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: '#eeeeee' }}>
                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>Campo</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', color: '#c62828' }}>Antes</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', color: '#2e7d32' }}>Depois</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.map(d => (
                    <tr key={d.campo} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '4px 8px', fontWeight: 600 }}>{CAMPO_LABEL[d.campo] || d.campo}</td>
                      <td style={{ padding: '4px 8px', color: '#c62828', textDecoration: 'line-through' }}>{fmt(d.antes)}</td>
                      <td style={{ padding: '4px 8px', color: '#2e7d32', fontWeight: 600 }}>{fmt(d.depois)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {log.evento === 'criado' && diffs.length === 0 && (
              <div style={{ fontSize: 11, color: '#888' }}>Cadastro inicial.</div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ─────────── HISTÓRICO DE PAGAMENTOS ─────────── */
export const HistoricoPagamentos: React.FC<PropsComUnit> = ({ colaboradorId, unitId, apiUrl, token }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!colaboradorId) return;
    setLoading(true);
    Promise.all([
      fetch(`${apiUrl}/folha-pagamento?unitId=${unitId}&colaboradorId=${colaboradorId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
    ]).then(([folha]) => {
      const lista = Array.isArray(folha) ? folha : [];
      lista.sort((a: any, b: any) => (b.dataPagamento || b.updatedAt || '').localeCompare(a.dataPagamento || a.updatedAt || ''));
      setItems(lista);
    }).finally(() => setLoading(false));
  }, [colaboradorId, unitId, apiUrl, token]);

  if (loading) return <div style={{ padding: 20, color: '#666' }}>Carregando pagamentos…</div>;
  if (items.length === 0) return <div style={{ padding: 20, color: '#888', textAlign: 'center' }}>Nenhum pagamento registrado.</div>;

  return (
    <div style={{ maxHeight: 480, overflowY: 'auto' }}>
      <div style={{ marginBottom: 10, fontSize: 12, color: '#666' }}>
        💰 {items.length} pagamento{items.length > 1 ? 's' : ''}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Mês/Semana</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Pago em</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Bruto</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Líquido</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Forma</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Obs</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p: any) => (
            <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px 8px' }}>{p.mes}{p.semana ? ` / ${p.semana}` : ''}</td>
              <td style={{ padding: '6px 8px' }}>{p.dataPagamento || '—'}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtMoeda(parseFloat(p.totalBruto || p.valorBruto || 0))}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1b5e20', fontWeight: 600 }}>{fmtMoeda(parseFloat(p.totalLiquido || p.totalFinal || 0))}</td>
              <td style={{ padding: '6px 8px' }}>{p.formaPagamento || '—'}</td>
              <td style={{ padding: '6px 8px' }}>
                {p.pago
                  ? <span style={{ color: '#2e7d32', fontWeight: 600 }}>✅ Pago</span>
                  : <span style={{ color: '#e65100' }}>⏳ Pendente</span>}
              </td>
              <td style={{ padding: '6px 8px', fontSize: 11, color: '#666' }}>{p.obs || p.observacao || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ─────────── HISTÓRICO DE ESCALAS ─────────── */
export const HistoricoEscalas: React.FC<PropsComUnit> = ({ colaboradorId, unitId, apiUrl, token }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!colaboradorId) return;
    setLoading(true);
    fetch(`${apiUrl}/escalas?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const todas = Array.isArray(d) ? d : [];
        const minhas = todas.filter((e: any) => e.colaboradorId === colaboradorId);
        minhas.sort((a: any, b: any) => (b.data || '').localeCompare(a.data || ''));
        setItems(minhas);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [colaboradorId, unitId, apiUrl, token]);

  if (loading) return <div style={{ padding: 20, color: '#666' }}>Carregando escalas…</div>;
  if (items.length === 0) return <div style={{ padding: 20, color: '#888', textAlign: 'center' }}>Nenhuma escala registrada.</div>;

  const presBadge = (p: string) => {
    if (p === 'presente') return <span style={{ color: '#2e7d32' }}>✅ Presente</span>;
    if (p === 'falta') return <span style={{ color: '#c62828' }}>❌ Falta</span>;
    if (p === 'falta_justificada') return <span style={{ color: '#e65100' }}>⚠️ Justif.</span>;
    if (p === 'folga') return <span style={{ color: '#1565c0' }}>🛌 Folga</span>;
    return <span style={{ color: '#aaa' }}>—</span>;
  };

  return (
    <div style={{ maxHeight: 480, overflowY: 'auto' }}>
      <div style={{ marginBottom: 10, fontSize: 12, color: '#666' }}>
        📅 {items.length} dia(s) escalado(s) • mostrando os mais recentes
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Data</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Turno</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Presença Dia</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Presença Noite</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Observação</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 200).map((e: any) => (
            <tr key={e.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{(e.data || '').split('-').reverse().join('/')}</td>
              <td style={{ padding: '6px 8px' }}>{e.turno || '—'}</td>
              <td style={{ padding: '6px 8px' }}>{presBadge(e.presenca)}</td>
              <td style={{ padding: '6px 8px' }}>{presBadge(e.presencaNoite)}</td>
              <td style={{ padding: '6px 8px', fontSize: 11, color: '#666' }}>{e.observacao || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ─────────── HISTÓRICO DE SAÍDAS ─────────── */
export const HistoricoSaidas: React.FC<PropsComUnit> = ({ colaboradorId, unitId, apiUrl, token }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!colaboradorId) return;
    setLoading(true);
    // Busca saidas dos últimos 12 meses
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1).toISOString().split('T')[0];
    const fim = hoje.toISOString().split('T')[0];
    fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${inicio}&dataFim=${fim}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const todas = Array.isArray(d) ? d : [];
        const minhas = todas.filter((s: any) => s.colaboradorId === colaboradorId);
        minhas.sort((a: any, b: any) => (b.data || b.dataPagamento || '').localeCompare(a.data || a.dataPagamento || ''));
        setItems(minhas);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [colaboradorId, unitId, apiUrl, token]);

  if (loading) return <div style={{ padding: 20, color: '#666' }}>Carregando saídas…</div>;
  if (items.length === 0) return <div style={{ padding: 20, color: '#888', textAlign: 'center' }}>Nenhum lançamento de saída para este colaborador (últimos 12 meses).</div>;

  return (
    <div style={{ maxHeight: 480, overflowY: 'auto' }}>
      <div style={{ marginBottom: 10, fontSize: 12, color: '#666' }}>
        💸 {items.length} lançamento(s) — últimos 12 meses
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Data</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tipo</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Descrição</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Valor</th>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 200).map((s: any) => (
            <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px 8px' }}>{(s.data || s.dataPagamento || '').split('-').reverse().join('/') || '—'}</td>
              <td style={{ padding: '6px 8px' }}>{s.tipo || s.origem || '—'}</td>
              <td style={{ padding: '6px 8px', fontSize: 11 }}>{s.descricao || '—'}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtMoeda(parseFloat(s.valor || 0))}</td>
              <td style={{ padding: '6px 8px' }}>
                {s.pago
                  ? <span style={{ color: '#2e7d32' }}>✅ Pago</span>
                  : <span style={{ color: '#e65100' }}>⏳ Pendente</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ─────────── HISTÓRICO MOTOBOY (controle diário) ─────────── */
export const HistoricoMotoboy: React.FC<PropsComUnit> = ({ colaboradorId, apiUrl, token }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!colaboradorId) return;
    setLoading(true);
    // Busca os últimos 6 meses de controle-motoboy
    const hoje = new Date();
    const meses: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    Promise.all(meses.map(mm =>
      fetch(`${apiUrl}/controle-motoboy?motoboyId=${colaboradorId}&mes=${mm}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
    )).then(partes => {
      const todas: any[] = partes.flat();
      todas.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
      setItems(todas);
    }).finally(() => setLoading(false));
  }, [colaboradorId, apiUrl, token]);

  if (loading) return <div style={{ padding: 20, color: '#666' }}>Carregando controle motoboy…</div>;
  if (items.length === 0) return <div style={{ padding: 20, color: '#888', textAlign: 'center' }}>Sem registros de controle motoboy nos últimos 6 meses.</div>;

  return (
    <div style={{ maxHeight: 480, overflowY: 'auto' }}>
      <div style={{ marginBottom: 10, fontSize: 12, color: '#666' }}>
        🛵 {items.length} dia(s) de controle — últimos 6 meses
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Data</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Ent.Dia</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Ent.Noite</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Chegada Dia</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Chegada Noite</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Caixinha</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Vl.Variável</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 200).map((l: any) => (
            <tr key={l.id || `${l.motoboyId}_${l.data}`} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{(l.data || '').split('-').reverse().join('/')}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{l.entDia || '—'}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{l.entNoite || '—'}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e65100' }}>{l.chegadaDia ? fmtMoeda(l.chegadaDia) : '—'}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#7b1fa2' }}>{l.chegadaNoite ? fmtMoeda(l.chegadaNoite) : '—'}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#00838f' }}>{((l.caixinhaDia || 0) + (l.caixinhaNoite || 0)) ? fmtMoeda((l.caixinhaDia || 0) + (l.caixinhaNoite || 0)) : '—'}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: '#43a047' }}>{l.vlVariavel ? fmtMoeda(l.vlVariavel) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

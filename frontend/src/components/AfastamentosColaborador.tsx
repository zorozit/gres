import { useEffect, useState } from 'react';
import { fetchAuth } from '../utils/fetchAuth';

interface Props {
  colaboradorId: string;
  unitId: string;
  apiUrl: string;
  token: string | null;
  onStatusChange?: () => void; // callback p/ recarregar dados do colaborador
}

interface Afastamento {
  id: string;
  colaboradorId: string;
  tipo: string;
  motivo: string;
  dataInicio: string;
  dataFimPrevista: string;
  dataFimReal: string;
  ativo: boolean;
  observacao: string;
  cidMedico: string;
  crm: string;
  responsavelNome: string;
  responsavelEmail: string;
  createdAt: string;
}

const TIPOS_AFASTAMENTO: { valor: string; label: string; icon: string; cor: string; diasPadrao?: number }[] = [
  { valor: 'licenca_medica',       label: 'Licença Médica',            icon: '🏥', cor: '#e65100', diasPadrao: 15 },
  { valor: 'licenca_maternidade',  label: 'Licença Maternidade',       icon: '🤰', cor: '#ad1457', diasPadrao: 120 },
  { valor: 'licenca_paternidade',  label: 'Licença Paternidade',       icon: '👶', cor: '#1565c0', diasPadrao: 20 },
  { valor: 'ferias',               label: 'Férias',                    icon: '🏖️', cor: '#2e7d32', diasPadrao: 30 },
  { valor: 'acidente_trabalho',    label: 'Acidente de Trabalho',      icon: '⚠️', cor: '#c62828' },
  { valor: 'auxilio_doenca',       label: 'Auxílio-Doença (INSS)',     icon: '📋', cor: '#6a1b9a' },
  { valor: 'suspensao',            label: 'Suspensão Disciplinar',     icon: '🚫', cor: '#b71c1c', diasPadrao: 3 },
  { valor: 'licenca_nupcias',      label: 'Licença Casamento',         icon: '💍', cor: '#f06292', diasPadrao: 3 },
  { valor: 'licenca_obito',        label: 'Licença Óbito (Nojo)',      icon: '🕊️', cor: '#455a64', diasPadrao: 2 },
  { valor: 'servico_militar',      label: 'Serviço Militar',           icon: '🎖️', cor: '#33691e' },
  { valor: 'outros',               label: 'Outros',                    icon: '📝', cor: '#757575' },
];

const tipoInfo = (tipo: string) => TIPOS_AFASTAMENTO.find(t => t.valor === tipo) || TIPOS_AFASTAMENTO[TIPOS_AFASTAMENTO.length - 1];

const fmtData = (iso: string) => {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

const fmtDataHora = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const diasEntre = (ini: string, fim: string) => {
  if (!ini || !fim) return null;
  const d1 = new Date(ini + 'T12:00:00');
  const d2 = new Date(fim + 'T12:00:00');
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
};

const somarDias = (iso: string, dias: number): string => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
};

export const AfastamentosColaborador: React.FC<Props> = ({ colaboradorId, unitId, apiUrl, token, onStatusChange }) => {
  const [lista, setLista] = useState<Afastamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    tipo: '', motivo: '', dataInicio: new Date().toISOString().split('T')[0],
    dataFimPrevista: '', observacao: '', cidMedico: '', crm: '',
  });

  const carregar = () => {
    if (!colaboradorId) return;
    setLoading(true);
    fetchAuth(`${apiUrl}/afastamentos?colaboradorId=${colaboradorId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setLista(Array.isArray(d) ? d.sort((a: any, b: any) => (b.dataInicio || '').localeCompare(a.dataInicio || '')) : []))
      .catch(() => setLista([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { carregar(); }, [colaboradorId]);

  const salvar = async () => {
    if (!form.tipo || !form.dataInicio) { alert('Tipo e data de início são obrigatórios'); return; }
    setSalvando(true);
    try {
      const res = await fetchAuth(`${apiUrl}/afastamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          colaboradorId, unitId,
          ...form,
          responsavelId: localStorage.getItem('user_id') || '',
          responsavelNome: localStorage.getItem('user_name') || localStorage.getItem('user_email') || '',
          responsavelEmail: localStorage.getItem('user_email') || '',
        }),
      });
      if (res.ok) {
        setModal(false);
        setForm({ tipo: '', motivo: '', dataInicio: new Date().toISOString().split('T')[0], dataFimPrevista: '', observacao: '', cidMedico: '', crm: '' });
        carregar();
        onStatusChange?.();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Erro: ' + ((err as any).error || res.status));
      }
    } catch { alert('Erro ao salvar afastamento'); }
    finally { setSalvando(false); }
  };

  const encerrar = async (afst: Afastamento) => {
    const dataFim = window.prompt('Data de encerramento (AAAA-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!dataFim) return;
    try {
      const res = await fetchAuth(`${apiUrl}/afastamentos/${afst.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ativo: false, dataFimReal: dataFim }),
      });
      if (res.ok) { carregar(); onStatusChange?.(); }
      else alert('Erro ao encerrar');
    } catch { alert('Erro ao encerrar afastamento'); }
  };

  const excluir = async (id: string) => {
    if (!window.confirm('Excluir este afastamento?')) return;
    try {
      await fetchAuth(`${apiUrl}/afastamentos/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      carregar();
      onStatusChange?.();
    } catch { alert('Erro ao excluir'); }
  };

  const ativos = lista.filter(a => a.ativo);
  const encerrados = lista.filter(a => !a.ativo);

  if (loading) return <div style={{ padding: 20, color: '#666' }}>Carregando afastamentos…</div>;

  return (
    <div style={{ maxHeight: 520, overflowY: 'auto' }}>
      {/* Botão novo afastamento */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#666' }}>
          🏥 {lista.length} registro(s) • {ativos.length} ativo(s)
        </div>
        <button onClick={() => setModal(true)}
          style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 6,
            backgroundColor: '#e65100', color: 'white', cursor: 'pointer' }}>
          ➕ Registrar Afastamento
        </button>
      </div>

      {/* Afastamentos ativos */}
      {ativos.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e65100', marginBottom: 6 }}>⚡ Em andamento</div>
          {ativos.map(a => {
            const info = tipoInfo(a.tipo);
            const dias = diasEntre(a.dataInicio, new Date().toISOString().split('T')[0]);
            const diasPrevistos = a.dataFimPrevista ? diasEntre(a.dataInicio, a.dataFimPrevista) : null;
            return (
              <div key={a.id} style={{
                border: `1px solid ${info.cor}33`, borderLeft: `4px solid ${info.cor}`,
                borderRadius: 8, padding: 12, marginBottom: 8, backgroundColor: `${info.cor}08`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: info.cor }}>{info.icon} {info.label}</span>
                    {a.motivo && <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>— {a.motivo}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => encerrar(a)}
                      style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #4caf50', borderRadius: 4,
                        backgroundColor: '#e8f5e9', color: '#2e7d32', cursor: 'pointer', fontWeight: 600 }}>
                      ✅ Encerrar
                    </button>
                    <button onClick={() => excluir(a.id)}
                      style={{ padding: '4px 8px', fontSize: 11, border: '1px solid #ccc', borderRadius: 4,
                        backgroundColor: '#fafafa', color: '#999', cursor: 'pointer' }}>
                      🗑️
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#555', flexWrap: 'wrap' }}>
                  <span>📅 Início: <strong>{fmtData(a.dataInicio)}</strong></span>
                  {a.dataFimPrevista && <span>📅 Previsão: <strong>{fmtData(a.dataFimPrevista)}</strong></span>}
                  {dias !== null && <span>⏱️ <strong>{dias} dia(s)</strong> corridos</span>}
                  {diasPrevistos !== null && dias !== null && <span style={{ color: dias > diasPrevistos ? '#c62828' : '#2e7d32' }}>
                    ({dias > diasPrevistos ? `${dias - diasPrevistos}d além` : `${diasPrevistos - dias}d restantes`})
                  </span>}
                </div>
                {(a.cidMedico || a.crm) && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                    {a.cidMedico && <span>CID: {a.cidMedico} </span>}
                    {a.crm && <span>• CRM: {a.crm}</span>}
                  </div>
                )}
                {a.observacao && <div style={{ fontSize: 11, color: '#666', marginTop: 4, fontStyle: 'italic' }}>📝 {a.observacao}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Histórico encerrado */}
      {encerrados.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 6 }}>📋 Histórico</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tipo</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Motivo</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Início</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Fim</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Dias</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Registrado por</th>
                <th style={{ padding: '6px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {encerrados.map(a => {
                const info = tipoInfo(a.tipo);
                const dias = diasEntre(a.dataInicio, a.dataFimReal || a.dataFimPrevista || '');
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px 8px' }}><span style={{ color: info.cor }}>{info.icon}</span> {info.label}</td>
                    <td style={{ padding: '6px 8px', color: '#666' }}>{a.motivo || '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{fmtData(a.dataInicio)}</td>
                    <td style={{ padding: '6px 8px' }}>{fmtData(a.dataFimReal || a.dataFimPrevista)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{dias ?? '—'}</td>
                    <td style={{ padding: '6px 8px', fontSize: 11, color: '#888' }}>{a.responsavelNome || '—'}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <button onClick={() => excluir(a.id)}
                        style={{ padding: '2px 6px', fontSize: 10, border: '1px solid #eee', borderRadius: 3,
                          backgroundColor: 'white', color: '#ccc', cursor: 'pointer' }}>🗑️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {lista.length === 0 && (
        <div style={{ padding: 20, color: '#888', textAlign: 'center', backgroundColor: '#f9f9f9', borderRadius: 6 }}>
          ✅ Nenhum afastamento registrado — colaborador ativo sem restrições.
        </div>
      )}

      {/* Modal novo afastamento */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10010, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal(false)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 480, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#e65100' }}>🏥 Registrar Afastamento</h3>

            {/* Tipo */}
            <label style={{ fontWeight: 700, fontSize: 12, color: '#333', display: 'block', marginBottom: 6 }}>Tipo *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6, marginBottom: 14 }}>
              {TIPOS_AFASTAMENTO.map(t => (
                <button key={t.valor} onClick={() => {
                  setForm(f => {
                    const newForm = { ...f, tipo: t.valor };
                    // Auto-preencher data fim se há dias padrão
                    if (t.diasPadrao && f.dataInicio && !f.dataFimPrevista) {
                      newForm.dataFimPrevista = somarDias(f.dataInicio, t.diasPadrao);
                    }
                    return newForm;
                  });
                }}
                  style={{
                    padding: '8px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', textAlign: 'left',
                    border: form.tipo === t.valor ? `2px solid ${t.cor}` : '1px solid #ddd',
                    backgroundColor: form.tipo === t.valor ? `${t.cor}15` : 'white',
                    fontWeight: form.tipo === t.valor ? 700 : 400,
                    color: form.tipo === t.valor ? t.cor : '#555',
                  }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Datas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: 12, color: '#333' }}>Data início *</label>
                <input type="date" value={form.dataInicio}
                  onChange={e => {
                    const newIni = e.target.value;
                    setForm(f => {
                      const t = TIPOS_AFASTAMENTO.find(tt => tt.valor === f.tipo);
                      return { ...f, dataInicio: newIni,
                        dataFimPrevista: t?.diasPadrao && !f.dataFimPrevista ? somarDias(newIni, t.diasPadrao) : f.dataFimPrevista };
                    });
                  }}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 12, color: '#333' }}>Previsão de retorno</label>
                <input type="date" value={form.dataFimPrevista}
                  onChange={e => setForm(f => ({ ...f, dataFimPrevista: e.target.value }))}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }} />
                {form.dataInicio && form.dataFimPrevista && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    ⏱️ {diasEntre(form.dataInicio, form.dataFimPrevista)} dia(s)
                  </div>
                )}
              </div>
            </div>

            {/* Motivo */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: '#333' }}>Motivo / Descrição</label>
              <input type="text" value={form.motivo} placeholder="Ex: Cirurgia no joelho, Gestação..."
                onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            {/* CID + CRM (médico) */}
            {(form.tipo === 'licenca_medica' || form.tipo === 'acidente_trabalho' || form.tipo === 'auxilio_doenca') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontWeight: 600, fontSize: 12, color: '#333' }}>CID (código doença)</label>
                  <input type="text" value={form.cidMedico} placeholder="Ex: M17.1"
                    onChange={e => setForm(f => ({ ...f, cidMedico: e.target.value }))}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontWeight: 600, fontSize: 12, color: '#333' }}>CRM do médico</label>
                  <input type="text" value={form.crm} placeholder="Ex: CRM/SP 12345"
                    onChange={e => setForm(f => ({ ...f, crm: e.target.value }))}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
            )}

            {/* Observação */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: '#333' }}>Observação</label>
              <textarea value={form.observacao} placeholder="Detalhes adicionais..."
                onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                rows={2} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)}
                style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: 6, backgroundColor: 'white', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando || !form.tipo || !form.dataInicio}
                style={{ padding: '8px 20px', border: 'none', borderRadius: 6, backgroundColor: '#e65100',
                  color: 'white', fontWeight: 700, cursor: 'pointer', opacity: (!form.tipo || !form.dataInicio) ? 0.5 : 1 }}>
                {salvando ? '⏳ Salvando...' : '✅ Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

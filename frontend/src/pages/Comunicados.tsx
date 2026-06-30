import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { fetchAuth } from '../utils/fetchAuth';
// useUnit não necessário aqui — comunicados admin não depende de unidade selecionada

const apiUrl = (import.meta as any).env?.VITE_API_ENDPOINT || '';
const fmtData = (d: string) => { try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return d; } };

interface Comunicado {
  id: string;
  titulo: string;
  conteudo: string;
  destinatarios: string; // 'todos' | 'CLT' | 'Freelancer'
  unitIds: string[];
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  criadoPor: string;
}

const DEST_OPTIONS = [
  { value: 'todos', label: 'Todos os colaboradores' },
  { value: 'CLT', label: 'Apenas CLT' },
  { value: 'Freelancer', label: 'Apenas Freelancers' },
];

export default function Comunicados() {

  const [items, setItems] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<Comunicado> | null>(null);
  const [saving, setSaving] = useState(false);
  const [unidades, setUnidades] = useState<any[]>([]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetchAuth(`${apiUrl}/comunicados`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setItems(Array.isArray(data) ? data : data.items || []); }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const fetchUnidades = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetchAuth(`${apiUrl}/unidades`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { setUnidades(await res.json()); }
    } catch {}
  };

  useEffect(() => { fetchList(); fetchUnidades(); }, []);

  const handleSave = async () => {
    if (!modal?.titulo?.trim() || !modal?.conteudo?.trim()) { alert('Preencha título e conteúdo'); return; }
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const isEdit = modal.id;
      const url = isEdit ? `${apiUrl}/comunicados/${modal.id}` : `${apiUrl}/comunicados`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetchAuth(url, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: modal.titulo,
          conteudo: modal.conteudo,
          destinatarios: modal.destinatarios || 'todos',
          unitIds: modal.unitIds || [],
          ativo: modal.ativo !== false,
        }),
      });
      if (res.ok) { setModal(null); fetchList(); }
      else { alert('Erro ao salvar comunicado'); }
    } catch { alert('Erro ao salvar'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este comunicado?')) return;
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetchAuth(`${apiUrl}/comunicados/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) fetchList();
    } catch { alert('Erro ao excluir'); }
  };

  const handleToggleAtivo = async (item: Comunicado) => {
    try {
      const token = localStorage.getItem('auth_token');
      await fetchAuth(`${apiUrl}/comunicados/${item.id}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, ativo: !item.ativo }),
      });
      fetchList();
    } catch { alert('Erro ao atualizar'); }
  };

  const s = {
    page: { padding: '20px', maxWidth: '1100px', margin: '0 auto' } as React.CSSProperties,
    topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' as const, gap: '10px' },
    title: { fontSize: '22px', fontWeight: 'bold' as const, color: '#1a237e' },
    btnNew: { padding: '10px 20px', backgroundColor: '#1565c0', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' as const, fontSize: '14px' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
    th: { padding: '10px 12px', backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd', textAlign: 'left' as const, fontWeight: 'bold' as const },
    td: { padding: '10px 12px', borderBottom: '1px solid #eee' },
    badge: (active: boolean) => ({
      display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' as const,
      backgroundColor: active ? '#e8f5e9' : '#ffebee', color: active ? '#2e7d32' : '#c62828',
    }),
    btnAction: (bg: string) => ({ padding: '4px 10px', backgroundColor: bg, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', marginRight: '4px' }),
    overlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
    modal: { backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '520px', maxHeight: '90vh', overflow: 'auto' as const },
    label: { display: 'block', fontWeight: 'bold' as const, marginBottom: '4px', marginTop: '14px', fontSize: '13px' },
    input: { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', boxSizing: 'border-box' as const },
    textarea: { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', minHeight: '100px', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
    select: { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', boxSizing: 'border-box' as const },
    btnSave: { padding: '10px 24px', backgroundColor: '#43a047', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' as const, fontSize: '14px', marginRight: '8px' },
    btnCancel: { padding: '10px 24px', backgroundColor: '#9e9e9e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  };

  return (
    <>
      <Header title="📢 Comunicados" />
      <div style={s.page}>
        <div style={s.topBar}>
          <span style={s.title}>📢 Comunicados</span>
          <button onClick={() => setModal({ titulo: '', conteudo: '', destinatarios: 'todos', unitIds: [], ativo: true })} style={s.btnNew}>➕ Novo Comunicado</button>
        </div>

        {loading ? <p>Carregando...</p> : items.length === 0 ? <p style={{ color: '#777' }}>Nenhum comunicado cadastrado.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Título</th>
                  <th style={s.th}>Destinatários</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Criado em</th>
                  <th style={s.th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || '')).map(item => (
                  <tr key={item.id}>
                    <td style={s.td}>{item.titulo}</td>
                    <td style={s.td}>{DEST_OPTIONS.find(d => d.value === item.destinatarios)?.label || item.destinatarios}</td>
                    <td style={s.td}><span style={s.badge(item.ativo)}>{item.ativo ? '✅ Ativo' : '❌ Inativo'}</span></td>
                    <td style={s.td}>{fmtData(item.criadoEm)}</td>
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => setModal(item)} style={s.btnAction('#1976d2')}>✏️</button>
                      <button onClick={() => handleToggleAtivo(item)} style={s.btnAction(item.ativo ? '#ff9800' : '#43a047')}>{item.ativo ? '⏸️' : '▶️'}</button>
                      <button onClick={() => handleDelete(item.id)} style={s.btnAction('#e53935')}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal criar/editar */}
        {modal && (
          <div style={s.overlay} onClick={() => setModal(null)}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 10px', color: '#1a237e' }}>{modal.id ? '✏️ Editar Comunicado' : '➕ Novo Comunicado'}</h3>

              <label style={s.label}>Título:</label>
              <input type="text" value={modal.titulo || ''} onChange={e => setModal({ ...modal, titulo: e.target.value })} style={s.input} placeholder="Ex: Aviso de feriado" />

              <label style={s.label}>Conteúdo:</label>
              <textarea value={modal.conteudo || ''} onChange={e => setModal({ ...modal, conteudo: e.target.value })} style={s.textarea} placeholder="Escreva o comunicado aqui..." />

              <label style={s.label}>Destinatários:</label>
              <select value={modal.destinatarios || 'todos'} onChange={e => setModal({ ...modal, destinatarios: e.target.value })} style={s.select}>
                {DEST_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>

              <label style={s.label}>Unidades (vazio = todas):</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                {unidades.map((u: any) => {
                  const uid = u.id || u.cnpj || '';
                  const checked = (modal.unitIds || []).includes(uid);
                  return (
                    <label key={uid} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="checkbox" checked={checked} onChange={() => {
                        const ids = modal.unitIds || [];
                        setModal({ ...modal, unitIds: checked ? ids.filter((i: string) => i !== uid) : [...ids, uid] });
                      }} />
                      {u.nome || u.nomeFantasia || uid}
                    </label>
                  );
                })}
              </div>

              <label style={{ ...s.label, display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                <input type="checkbox" checked={modal.ativo !== false} onChange={e => setModal({ ...modal, ativo: e.target.checked })} />
                Ativo (visível no portal)
              </label>

              <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
                <button onClick={handleSave} disabled={saving} style={s.btnSave}>{saving ? 'Salvando...' : '💾 Salvar'}</button>
                <button onClick={() => setModal(null)} style={s.btnCancel}>✕ Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Footer } from '../components/Footer';

// Perfis para badge visual
const PERFIS_SISTEMA = [
  { key: 'admin',    label: 'Administrador', icon: '👑', color: '#7b1fa2', bg: '#f3e5f5', aliases: ['admin', 'Administrador', 'ADMIN'] },
  { key: 'gerente',  label: 'Gerente',       icon: '🏅', color: '#1565c0', bg: '#e3f2fd', aliases: ['gerente', 'Gerente', 'GERENTE', 'Manager'] },
  { key: 'operador', label: 'Operador',       icon: '👤', color: '#2e7d32', bg: '#e8f5e9', aliases: ['operador', 'Operador', 'OPERADOR'] },
];

interface Usuario {
  id: string;
  nome: string;
  cpf: string;
  celular: string;
  email?: string;
  perfil: string;
  unitId: string | string[];
  unitIds?: string[];
  ativo: boolean;
  senha?: string;
}

// ─── Componente principal ────────────────────────────────────────────────────
export const Usuarios: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [aba, setAba] = useState<'usuarios' | 'novo'>('usuarios');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [novoUsuario, setNovoUsuario] = useState({
    nome: '',
    cpf: '',
    celular: '',
    email: '',
    perfil: 'operador',
    unitId: '',
    unitIds: [] as string[],
    ativo: true,
    senha: '',
    senhaConfirmacao: ''
  });
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaNovaSenha, setConfirmaNovaSenha] = useState('');
  const [loading, setLoading] = useState(true);
  const [unidades, setUnidades] = useState<any[]>([]);

  useEffect(() => {
    carregarUsuarios();
    carregarUnidades();
  }, []);

  const carregarUsuarios = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/usuarios`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsuarios(Array.isArray(data) ? data : []);
      } else {
        console.error('Erro ao carregar usuários:', response.status);
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarUnidades = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/unidades`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUnidades(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Erro ao carregar unidades:', error);
    }
  };

  const handleSalvarNovoUsuario = async () => {
    if (!novoUsuario.nome || !novoUsuario.cpf || !novoUsuario.celular) {
      alert('Preencha os campos obrigatórios: Nome, CPF e Celular');
      return;
    }
    if (novoUsuario.unitIds.length === 0) {
      alert('Selecione ao menos uma unidade');
      return;
    }
    if (novoUsuario.senha && novoUsuario.senha !== novoUsuario.senhaConfirmacao) {
      alert('As senhas não coincidem');
      return;
    }
    if (novoUsuario.senha && novoUsuario.senha.length < 6) {
      alert('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const senhaFinal = novoUsuario.senha || gerarSenhaAleatoria();
      const payload = {
        nome: novoUsuario.nome,
        cpf: novoUsuario.cpf,
        celular: novoUsuario.celular,
        email: novoUsuario.email || `${novoUsuario.cpf.replace(/\D/g, '')}@temp.com`,
        perfil: novoUsuario.perfil,
        unitId: novoUsuario.unitIds[0] || '',
        unitIds: novoUsuario.unitIds,
        ativo: novoUsuario.ativo,
        senha: senhaFinal
      };
      const response = await fetch(`${apiUrl}/usuarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        setNovoUsuario({ nome: '', cpf: '', celular: '', email: '', perfil: 'operador', unitId: '', unitIds: [], ativo: true, senha: '', senhaConfirmacao: '' });
        carregarUsuarios();
        setAba('usuarios');
        alert(`✅ Usuário criado com sucesso!\n\n📧 Email: ${payload.email}\n🔑 Senha: ${senhaFinal}\n\n⚠️ Anote a senha e envie ao usuário!`);
      } else {
        const erro = await response.text();
        alert('Erro ao criar usuário: ' + erro);
      }
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      alert('Erro ao criar usuário');
    }
  };

  const gerarSenhaAleatoria = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let senha = '';
    for (let i = 0; i < 8; i++) senha += chars.charAt(Math.floor(Math.random() * chars.length));
    return senha;
  };

  const handleSalvarEdicao = async () => {
    if (!usuarioEditando || !usuarioEditando.nome || !usuarioEditando.cpf || !usuarioEditando.celular) {
      alert('Preencha os campos obrigatórios: Nome, CPF e Celular');
      return;
    }
    const unitIds: string[] = Array.isArray(usuarioEditando.unitIds)
      ? usuarioEditando.unitIds
      : (usuarioEditando.unitId ? [usuarioEditando.unitId as string] : []);
    if (unitIds.length === 0) {
      alert('Selecione ao menos uma unidade');
      return;
    }
    if (novaSenha && novaSenha !== confirmaNovaSenha) {
      alert('As senhas não coincidem');
      return;
    }
    if (novaSenha && novaSenha.length < 6) {
      alert('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const payload: any = {
        nome: usuarioEditando.nome,
        cpf: usuarioEditando.cpf,
        celular: usuarioEditando.celular,
        email: usuarioEditando.email || `${usuarioEditando.cpf.replace(/\D/g, '')}@temp.com`,
        perfil: usuarioEditando.perfil,
        unitId: unitIds[0] || '',
        unitIds,
        ativo: usuarioEditando.ativo
      };
      if (novaSenha) payload.senha = novaSenha;
      const response = await fetch(`${apiUrl}/usuarios/${usuarioEditando.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const mensagem = novaSenha
          ? `✅ Usuário atualizado!\n\n🔑 Nova senha: ${novaSenha}\n\n⚠️ Anote e envie ao usuário!`
          : 'Usuário atualizado com sucesso!';
        setUsuarioEditando(null);
        setNovaSenha('');
        setConfirmaNovaSenha('');
        carregarUsuarios();
        alert(mensagem);
      } else {
        const erro = await response.text();
        alert('Erro ao atualizar usuário: ' + erro);
      }
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      alert('Erro ao atualizar usuário');
    }
  };

  const handleDeletarUsuario = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja deletar este usuário?')) return;
    try {
      const apiUrl = import.meta.env.VITE_API_ENDPOINT;
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/usuarios/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        carregarUsuarios();
        alert('Usuário deletado com sucesso!');
      } else {
        alert('Erro ao deletar usuário');
      }
    } catch (error) {
      console.error('Erro ao deletar usuário:', error);
      alert('Erro ao deletar usuário');
    }
  };

  // ─── helper: badge de perfil ─────────────────────────────────────────────
  const getPerfilInfo = (perfil: string) => {
    const p = PERFIS_SISTEMA.find(ps => ps.aliases.some(a => a.toLowerCase() === perfil.toLowerCase()));
    return p || { label: perfil, icon: '👤', color: '#555', bg: '#eee' };
  };

  // ─── Styles ──────────────────────────────────────────────────────────────
  const s = {
    page: { minHeight: '100vh', backgroundColor: '#f5f7fa', fontFamily: 'Segoe UI, sans-serif' },
    header: { background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { margin: 0, fontSize: '20px' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' },
    logoutBtn: { padding: '6px 14px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
    backBtn: { padding: '6px 14px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
    // tabs
    tabBar: { display: 'flex', gap: 0, borderBottom: '2px solid #e0e0e0', background: '#fff', padding: '0 28px' },
    tab: (active: boolean): React.CSSProperties => ({
      padding: '12px 24px', cursor: 'pointer', fontWeight: active ? 700 : 400,
      color: active ? '#667eea' : '#666', borderBottom: active ? '3px solid #667eea' : '3px solid transparent',
      fontSize: '14px', background: 'none', border: 'none', outline: 'none', transition: 'all .2s',
    }),
    body: { padding: '28px', maxWidth: '1300px', margin: '0 auto' },
    // cards grid
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '16px' },
    card: { background: '#fff', borderRadius: '10px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,.08)', borderLeft: '4px solid #667eea' },
    // form
    formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#fff', padding: '24px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,.08)' },
    formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
    label: { fontSize: '13px', fontWeight: 600, color: '#444' },
    input: { padding: '9px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', outline: 'none' } as React.CSSProperties,
    // modal
    overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modal: { background: '#fff', borderRadius: '12px', padding: '28px', width: '90%', maxWidth: '540px', maxHeight: '88vh', overflowY: 'auto' as const },
  };

  // ─── Aba Lista de Usuários ──────────────────────────────────────────────
  const renderUsuarios = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#333' }}>📋 Usuários Cadastrados</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#888' }}>{usuarios.length} usuário(s) no sistema</p>
        </div>
        <button
          onClick={() => setAba('novo')}
          style={{ padding: '9px 20px', background: '#667eea', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
        >
          ➕ Novo Usuário
        </button>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : usuarios.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', padding: '40px' }}>Nenhum usuário cadastrado</p>
      ) : (
        <div style={s.grid}>
          {usuarios.map(u => {
            const pi = getPerfilInfo(u.perfil);
            return (
              <div key={u.id} style={{ ...s.card, borderLeftColor: pi.color, opacity: u.ativo ? 1 : 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: '#222' }}>{u.nome}</div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{u.cpf}</div>
                  </div>
                  <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: pi.bg, color: pi.color, fontWeight: 600 }}>
                    {pi.icon} {pi.label}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#555', marginBottom: '4px' }}>📱 {u.celular}</div>
                {u.email && <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>✉️ {u.email}</div>}
                <div style={{ fontSize: '12px', marginTop: '8px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '10px', background: u.ativo ? '#e8f5e9' : '#ffebee', color: u.ativo ? '#2e7d32' : '#c62828', fontWeight: 600 }}>
                    {u.ativo ? '● Ativo' : '● Inativo'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                  <button
                    onClick={() => setUsuarioEditando(u)}
                    style={{ flex: 1, padding: '7px', background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                  >✏️ Editar</button>
                  <button
                    onClick={() => handleDeletarUsuario(u.id)}
                    style={{ flex: 1, padding: '7px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                  >🗑️ Deletar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─── Aba Novo Usuário ──────────────────────────────────────────────────
  const renderNovoUsuario = () => (
    <div>
      <h2 style={{ marginBottom: '20px', fontSize: '18px', color: '#333' }}>➕ Novo Usuário</h2>
      <div style={s.formGrid}>
        <div style={s.formGroup}>
          <label style={s.label}>Nome *</label>
          <input style={s.input} value={novoUsuario.nome} onChange={e => setNovoUsuario({ ...novoUsuario, nome: e.target.value })} placeholder="Nome completo" />
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>CPF *</label>
          <input style={s.input} value={novoUsuario.cpf} onChange={e => setNovoUsuario({ ...novoUsuario, cpf: e.target.value })} placeholder="000.000.000-00" />
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Celular *</label>
          <input style={s.input} type="tel" value={novoUsuario.celular} onChange={e => setNovoUsuario({ ...novoUsuario, celular: e.target.value })} placeholder="(11) 99999-9999" />
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Email (opcional)</label>
          <input style={s.input} type="email" value={novoUsuario.email} onChange={e => setNovoUsuario({ ...novoUsuario, email: e.target.value })} placeholder="usuario@email.com" />
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Perfil</label>
          <select style={s.input} value={novoUsuario.perfil} onChange={e => setNovoUsuario({ ...novoUsuario, perfil: e.target.value })}>
            <option value="operador">👤 Operador</option>
            <option value="gerente">🏅 Gerente</option>
            <option value="admin">👑 Administrador</option>
          </select>
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Status</label>
          <select style={s.input} value={novoUsuario.ativo ? 'true' : 'false'} onChange={e => setNovoUsuario({ ...novoUsuario, ativo: e.target.value === 'true' })}>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </div>
        <div style={{ ...s.formGroup, gridColumn: '1 / -1' }}>
          <label style={s.label}>Unidades * (selecione uma ou mais)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
            {unidades.map((unit: any) => (
              <label key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: `1px solid ${novoUsuario.unitIds.includes(unit.id) ? '#667eea' : '#ddd'}`, background: novoUsuario.unitIds.includes(unit.id) ? '#ede7f6' : '#fafafa', cursor: 'pointer', fontSize: '13px' }}>
                <input type="checkbox" checked={novoUsuario.unitIds.includes(unit.id)} onChange={e => {
                  const ids = e.target.checked ? [...novoUsuario.unitIds, unit.id] : novoUsuario.unitIds.filter(id => id !== unit.id);
                  setNovoUsuario({ ...novoUsuario, unitIds: ids });
                }} />
                {unit.nome}
              </label>
            ))}
          </div>
          {novoUsuario.unitIds.length > 0 && (
            <small style={{ color: '#667eea', marginTop: '4px' }}>✅ {novoUsuario.unitIds.length} unidade(s) selecionada(s)</small>
          )}
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Senha (opcional — gerada automaticamente se vazia)</label>
          <input style={s.input} type={mostrarSenha ? 'text' : 'password'} value={novoUsuario.senha} onChange={e => setNovoUsuario({ ...novoUsuario, senha: e.target.value })} placeholder="Mínimo 6 caracteres" />
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Confirmar Senha</label>
          <input style={s.input} type={mostrarSenha ? 'text' : 'password'} value={novoUsuario.senhaConfirmacao} onChange={e => setNovoUsuario({ ...novoUsuario, senhaConfirmacao: e.target.value })} placeholder="Repita a senha" />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={mostrarSenha} onChange={e => setMostrarSenha(e.target.checked)} />
          <label style={{ fontSize: '13px', color: '#555' }}>👁️ Mostrar senha</label>
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            onClick={() => setAba('usuarios')}
            style={{ flex: 1, padding: '11px', background: '#eee', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
          >Cancelar</button>
          <button
            onClick={handleSalvarNovoUsuario}
            style={{ flex: 2, padding: '11px', background: '#667eea', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}
          >💾 Criar Usuário</button>
        </div>
      </div>
    </div>
  );


    // ─── Modal edição ─────────────────────────────────────────────────────
  const renderModalEdicao = () => {
    if (!usuarioEditando) return null;
    const unitIds: string[] = Array.isArray(usuarioEditando.unitIds)
      ? usuarioEditando.unitIds
      : (usuarioEditando.unitId ? [usuarioEditando.unitId as string] : []);

    return (
      <div style={s.overlay}>
        <div style={s.modal}>
          <h2 style={{ margin: '0 0 20px', fontSize: '18px' }}>✏️ Editar Usuário</h2>

          {([
            ['Nome *', 'text', usuarioEditando.nome, (v: string) => setUsuarioEditando({ ...usuarioEditando, nome: v })],
            ['CPF *', 'text', usuarioEditando.cpf, (v: string) => setUsuarioEditando({ ...usuarioEditando, cpf: v })],
            ['Celular *', 'tel', usuarioEditando.celular, (v: string) => setUsuarioEditando({ ...usuarioEditando, celular: v })],
            ['Email', 'email', usuarioEditando.email || '', (v: string) => setUsuarioEditando({ ...usuarioEditando, email: v })],
          ] as [string, string, string, (v: string) => void][]).map(([lbl, type, val, fn]) => (
            <div key={lbl} style={{ ...s.formGroup, marginBottom: '14px' }}>
              <label style={s.label}>{lbl}</label>
              <input style={s.input} type={type} value={val} onChange={e => fn(e.target.value)} />
            </div>
          ))}

          <div style={{ ...s.formGroup, marginBottom: '14px' }}>
            <label style={s.label}>Perfil</label>
            <select style={s.input} value={usuarioEditando.perfil} onChange={e => setUsuarioEditando({ ...usuarioEditando, perfil: e.target.value })}>
              <option value="operador">👤 Operador</option>
              <option value="gerente">🏅 Gerente</option>
              <option value="admin">👑 Administrador</option>
            </select>
          </div>

          <div style={{ ...s.formGroup, marginBottom: '14px' }}>
            <label style={s.label}>Unidades *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
              {unidades.map((unit: any) => (
                <label key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '6px', border: `1px solid ${unitIds.includes(unit.id) ? '#667eea' : '#ddd'}`, background: unitIds.includes(unit.id) ? '#ede7f6' : '#fafafa', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" checked={unitIds.includes(unit.id)} onChange={e => {
                    const newIds = e.target.checked ? [...unitIds, unit.id] : unitIds.filter(id => id !== unit.id);
                    setUsuarioEditando({ ...usuarioEditando, unitIds: newIds, unitId: newIds[0] || '' });
                  }} />
                  {unit.nome}
                </label>
              ))}
            </div>
          </div>

          <div style={{ ...s.formGroup, marginBottom: '14px' }}>
            <label style={s.label}>Status</label>
            <select style={s.input} value={usuarioEditando.ativo ? 'true' : 'false'} onChange={e => setUsuarioEditando({ ...usuarioEditando, ativo: e.target.value === 'true' })}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>

          <div style={{ ...s.formGroup, marginBottom: '8px' }}>
            <label style={s.label}>🔑 Nova Senha (opcional)</label>
            <input style={s.input} type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <div style={{ ...s.formGroup, marginBottom: '20px' }}>
            <label style={s.label}>Confirmar Nova Senha</label>
            <input style={s.input} type="password" value={confirmaNovaSenha} onChange={e => setConfirmaNovaSenha(e.target.value)} placeholder="Repita a nova senha" />
            {novaSenha && novaSenha === confirmaNovaSenha && novaSenha.length >= 6 && <small style={{ color: 'green' }}>✅ Senhas coincidem</small>}
            {novaSenha && novaSenha !== confirmaNovaSenha && <small style={{ color: 'red' }}>❌ Senhas não coincidem</small>}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setUsuarioEditando(null); setNovaSenha(''); setConfirmaNovaSenha(''); }} style={{ flex: 1, padding: '10px', background: '#eee', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleSalvarEdicao} style={{ flex: 2, padding: '10px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>💾 Salvar</button>
            <button onClick={() => { if (usuarioEditando.id && window.confirm('Deletar este usuário?')) { handleDeletarUsuario(usuarioEditando.id); setUsuarioEditando(null); setNovaSenha(''); setConfirmaNovaSenha(''); } }} style={{ flex: 1, padding: '10px', background: '#f44336', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>🗑️</button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Render principal ─────────────────────────────────────────────────
  return (
    <div style={s.page}>
      {/* header */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/modulos')} style={s.backBtn}>← Módulos</button>
          <h1 style={s.headerTitle}>🔐 Gestão de Usuários</h1>
        </div>
        <div style={s.headerRight}>
          <span>{email}</span>
          <button onClick={logout} style={s.logoutBtn}>🚪 Sair</button>
        </div>
      </div>

      {/* tab bar */}
      <div style={s.tabBar}>
        <button style={s.tab(aba === 'usuarios')} onClick={() => setAba('usuarios')}>👥 Usuários</button>
        <button style={s.tab(aba === 'novo')} onClick={() => setAba('novo')}>➕ Novo</button>
      </div>

      {/* conteúdo */}
      <div style={s.body}>
        {aba === 'usuarios' && renderUsuarios()}
        {aba === 'novo' && renderNovoUsuario()}
      </div>

      {renderModalEdicao()}
      <Footer showLinks={true} />
    </div>
  );
};

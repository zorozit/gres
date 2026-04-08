import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Footer } from '../components/Footer';

interface Usuario {
  id: string;
  nome: string;
  cpf: string;
  celular: string;
  email?: string;
  perfil: string;
  unitId: string | string[]; // Pode ser uma unidade ou múltiplas
  unitIds?: string[]; // Lista de unidades
  ativo: boolean;
  senha?: string;
}

export const Usuarios: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
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
        console.log('Usuários carregados:', data);
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
      const response = await fetch(`${apiUrl}/usuarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(novoUsuario)
      });
      if (response.ok) {
        const senhaGerada = novoUsuario.senha || gerarSenhaAleatoria();
        setNovoUsuario({
          nome: '',
          cpf: '',
          celular: '',
          email: '',
          perfil: 'operador',
          unitId: '',
          unitIds: [],
          ativo: true,
          senha: '',
          senhaConfirmacao: ''
        });
        carregarUsuarios();
        alert(`✅ Usuário criado com sucesso!\n\n📧 Email: ${novoUsuario.email || 'N/A'}\n🔑 Senha: ${senhaGerada}\n\n⚠️ Anote a senha e envie ao usuário!`);
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
    for (let i = 0; i < 8; i++) {
      senha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return senha;
  };

  const handleSalvarEdicao = async () => {
    if (!usuarioEditando || !usuarioEditando.nome || !usuarioEditando.cpf || !usuarioEditando.celular) {
      alert('Preencha os campos obrigatórios: Nome, CPF e Celular');
      return;
    }

    const unitIds = usuarioEditando.unitIds || (usuarioEditando.unitId ? [usuarioEditando.unitId] : []);
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
      const payload = { ...usuarioEditando };
      if (novaSenha) {
        payload.senha = novaSenha;
      }
      const response = await fetch(`${apiUrl}/usuarios/${usuarioEditando.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const mensagem = novaSenha 
          ? `✅ Usuário atualizado com sucesso!\n\n🔑 Nova senha: ${novaSenha}\n\n⚠️ Anote e envie ao usuário!`
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

  const styles = {
    container: { padding: '20px', maxWidth: '1400px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    mainLayout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    coluna: { backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '4px' },
    formulario: { padding: '15px' },
    formGroup: { marginBottom: '15px' },
    label: { display: 'block', marginBottom: '5px', fontWeight: 'bold' },
    input: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' as const },
    h2: { marginTop: 0 },
    botaoSalvar: { padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '20px', width: '100%' },
    botaoEditar: { padding: '8px 12px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '5px' },
    botaoDeletar: { padding: '8px 12px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    modal: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', maxWidth: '500px', width: '90%', maxHeight: '80vh', overflowY: 'auto' as const },
    tabela: { width: '100%', borderCollapse: 'collapse' as const, marginTop: '20px' },
    th: { padding: '10px', textAlign: 'left' as const, borderBottom: '2px solid #ddd', backgroundColor: '#f0f0f0' },
    td: { padding: '10px', borderBottom: '1px solid #ddd' },
    checkboxGroup: { display: 'flex', flexDirection: 'column' as const, gap: '8px', marginTop: '8px' },
    checkbox: { display: 'flex', alignItems: 'center', gap: '8px' }
  };

  if (loading) {
    return <div style={styles.container}><p>Carregando...</p></div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '8px 16px', marginRight: '10px' }}>← Voltar</button>
          <h1>👨‍💼 Gestão de Usuários</h1>
        </div>
        <div>
          <span style={{ marginRight: '20px' }}>Usuário: {email}</span>
          <button onClick={logout} style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🚪 Sair</button>
        </div>
      </div>

      <div style={styles.mainLayout}>
        <div style={styles.coluna}>
          <div style={styles.formulario}>
            <h2 style={styles.h2}>➕ Novo Usuário</h2>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Nome: * (obrigatório)</label>
              <input 
                type="text"
                value={novoUsuario.nome}
                onChange={(e) => setNovoUsuario({...novoUsuario, nome: e.target.value})}
                style={styles.input}
                placeholder="Nome completo"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>CPF: * (obrigatório)</label>
              <input 
                type="text"
                value={novoUsuario.cpf}
                onChange={(e) => setNovoUsuario({...novoUsuario, cpf: e.target.value})}
                style={styles.input}
                placeholder="000.000.000-00"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Celular: * (obrigatório)</label>
              <input 
                type="tel"
                value={novoUsuario.celular}
                onChange={(e) => setNovoUsuario({...novoUsuario, celular: e.target.value})}
                style={styles.input}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Email: (opcional)</label>
              <input 
                type="email"
                value={novoUsuario.email}
                onChange={(e) => setNovoUsuario({...novoUsuario, email: e.target.value})}
                style={styles.input}
                placeholder="usuario@email.com"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Perfil:</label>
              <select 
                value={novoUsuario.perfil}
                onChange={(e) => setNovoUsuario({...novoUsuario, perfil: e.target.value})}
                style={styles.input}
              >
                <option value="operador">Operador</option>
                <option value="gerente">Gerente</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Unidades: * (selecione uma ou mais)</label>
              <div style={styles.checkboxGroup}>
                {unidades.map((unit: any) => (
                  <div key={unit.id} style={styles.checkbox}>
                    <input 
                      type="checkbox"
                      checked={novoUsuario.unitIds.includes(unit.id)}
                      onChange={(e) => {
                        const newUnitIds = e.target.checked 
                          ? [...novoUsuario.unitIds, unit.id]
                          : novoUsuario.unitIds.filter(id => id !== unit.id);
                        setNovoUsuario({...novoUsuario, unitIds: newUnitIds});
                      }}
                    />
                    <label>{unit.nome}</label>
                  </div>
                ))}
              </div>
              {novoUsuario.unitIds.length > 0 && (
                <small style={{color: '#666', marginTop: '4px', display: 'block'}}>
                  ✅ {novoUsuario.unitIds.length} unidade(s) selecionada(s)
                </small>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Senha: (opcional - se não informada, será gerada automaticamente)</label>
              <input 
                type={mostrarSenha ? "text" : "password"}
                value={novoUsuario.senha}
                onChange={(e) => setNovoUsuario({...novoUsuario, senha: e.target.value})}
                style={styles.input}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Confirmar Senha:</label>
              <input 
                type={mostrarSenha ? "text" : "password"}
                value={novoUsuario.senhaConfirmacao}
                onChange={(e) => setNovoUsuario({...novoUsuario, senhaConfirmacao: e.target.value})}
                style={styles.input}
                placeholder="Digite a senha novamente"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.checkbox}>
                <input 
                  type="checkbox"
                  checked={mostrarSenha}
                  onChange={(e) => setMostrarSenha(e.target.checked)}
                />
                <span style={{marginLeft: '8px'}}>👁️ Mostrar senha</span>
              </label>
            </div>

            <button onClick={handleSalvarNovoUsuario} style={styles.botaoSalvar}>💾 Criar Usuário</button>
          </div>
        </div>

        <div style={styles.coluna}>
          <h2>📋 Usuários Cadastrados ({usuarios.length})</h2>
          {usuarios.length === 0 ? (
            <p>Nenhum usuário cadastrado</p>
          ) : (
            <div style={{overflowX: 'auto'}}>
              <table style={styles.tabela}>
                <thead>
                  <tr>
                    <th style={styles.th}>Nome</th>
                    <th style={styles.th}>CPF</th>
                    <th style={styles.th}>Celular</th>
                    <th style={styles.th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => (
                    <tr key={usuario.id}>
                      <td style={styles.td}>{usuario.nome}</td>
                      <td style={styles.td}>{usuario.cpf}</td>
                      <td style={styles.td}>{usuario.celular}</td>
                      <td style={styles.td}>
                        <button onClick={() => setUsuarioEditando(usuario)} style={styles.botaoEditar}>✏️ Editar</button>
                        <button onClick={() => handleDeletarUsuario(usuario.id)} style={{...styles.botaoDeletar, marginLeft: '5px'}}>🗑️ Deletar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {usuarioEditando && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2>Editar Usuário</h2>
            <div style={styles.formGroup}>
              <label style={styles.label}>Nome: * (obrigatório)</label>
              <input 
                type="text"
                value={usuarioEditando.nome}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, nome: e.target.value})}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>CPF: * (obrigatório)</label>
              <input 
                type="text"
                value={usuarioEditando.cpf}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, cpf: e.target.value})}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Celular: * (obrigatório)</label>
              <input 
                type="tel"
                value={usuarioEditando.celular}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, celular: e.target.value})}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email: (opcional)</label>
              <input 
                type="email"
                value={usuarioEditando.email || ''}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, email: e.target.value})}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Perfil:</label>
              <select 
                value={usuarioEditando.perfil}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, perfil: e.target.value})}
                style={styles.input}
              >
                <option value="operador">Operador</option>
                <option value="gerente">Gerente</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Unidades: * (selecione uma ou mais)</label>
              <div style={styles.checkboxGroup}>
                {unidades.map((unit: any) => {
                  const unitIds: string[] = Array.isArray(usuarioEditando.unitIds) 
                    ? usuarioEditando.unitIds 
                    : (usuarioEditando.unitId ? [usuarioEditando.unitId as string] : []);
                  return (
                    <div key={unit.id} style={styles.checkbox}>
                      <input 
                        type="checkbox"
                        checked={unitIds.includes(unit.id)}
                        onChange={(e) => {
                          const newUnitIds: string[] = e.target.checked 
                            ? [...unitIds, unit.id]
                            : unitIds.filter((id) => id !== unit.id);
                          setUsuarioEditando({...usuarioEditando, unitIds: newUnitIds, unitId: newUnitIds[0] || ''});
                        }}
                      />
                      <label>{unit.nome}</label>
                    </div>
                  );
                })}
              </div>
              {(usuarioEditando.unitIds?.length || 0) > 0 && (
                <small style={{color: '#666', marginTop: '4px', display: 'block'}}>
                  ✅ {usuarioEditando.unitIds?.length || 0} unidade(s) selecionada(s)
                </small>
              )}
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>🔑 Redefinir Senha: (deixe em branco para manter a atual)</label>
              <input 
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                style={styles.input}
                placeholder="Nova senha (mínimo 6 caracteres)"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Confirmar Nova Senha:</label>
              <input 
                type="password"
                value={confirmaNovaSenha}
                onChange={(e) => setConfirmaNovaSenha(e.target.value)}
                style={styles.input}
                placeholder="Digite a senha novamente"
              />
              {novaSenha && novaSenha === confirmaNovaSenha && novaSenha.length >= 6 && (
                <small style={{color: 'green', marginTop: '4px', display: 'block'}}>
                  ✅ Senhas coincidem
                </small>
              )}
              {novaSenha && novaSenha !== confirmaNovaSenha && (
                <small style={{color: 'red', marginTop: '4px', display: 'block'}}>
                  ❌ Senhas não coincidem
                </small>
              )}
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Ativo:</label>
              <select 
                value={usuarioEditando.ativo ? 'true' : 'false'}
                onChange={(e) => setUsuarioEditando({...usuarioEditando, ativo: e.target.value === 'true'})}
                style={styles.input}
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>
            <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
              <button onClick={() => {
                setUsuarioEditando(null);
                setNovaSenha('');
                setConfirmaNovaSenha('');
              }} style={{flex: 1, padding: '10px', backgroundColor: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Cancelar</button>
              <button onClick={handleSalvarEdicao} style={{flex: 1, padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Salvar</button>
              <button onClick={() => {
                if (usuarioEditando.id && window.confirm('Tem certeza que deseja deletar este usuário?')) {
                  handleDeletarUsuario(usuarioEditando.id);
                  setUsuarioEditando(null);
                  setNovaSenha('');
                  setConfirmaNovaSenha('');
                }
              }} style={{flex: 1, padding: '10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Deletar</button>
            </div>
          </div>
        </div>
      )}

      <Footer showLinks={true} />
    </div>
  );
};

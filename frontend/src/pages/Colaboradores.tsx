import React, { useState, useEffect, useMemo } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface Colaborador {
  id: string;
  unitId: string;
  nome: string;
  cpf: string;
  celular: string;
  telefone: string;
  email?: string;
  dataNascimento: string;
  endereco: string;
  numero: string;
  complemento: string;
  cidade: string;
  estado: string;
  cep: string;
  tipoContrato: 'CLT' | 'Freelancer';
  cargo: string;           // cargo administrativo — exibido apenas no cadastro
  tipo: string;            // retrocompat
  funcao: string;          // função exibida na escala (personalizável)
  area: string;            // área: Salão, Cozinha, Operações, Gerência, Bar...
  valorDia: number;
  valorNoite: number;
  valorTransporte: number; // R$ por dia trabalhado (ida+volta)
  valeAlimentacao: boolean;
  salario: number;
  chavePix: string;
  dataAdmissao: string;
  dataDemissao?: string;   // preenchido quando desligado
  diasDisponiveis: string[];
  podeTrabalharDia: boolean;
  podeTrabalharNoite: boolean;
  dataCadastro: string;
  ativo: boolean;
}

interface Freelancer {
  id: string;
  nome: string;
  chavePix?: string;
  telefone?: string;
  valorDobra?: number;
  cargo?: string;
  funcao?: string;
  area?: string;
  ativo: boolean;
  unitId?: string;
}

interface FuncaoEscala {
  id: string;
  nome: string;
  area: string;
  cor: string;
  diasTrabalho: number[];   // 0=Dom…6=Sáb
  turnoNoite: number[];
  unitId: string;
}

/* ─── Constantes ──────────────────────────────────────────────────────────── */
const TIPOS_CARGO = [
  'Administrador', 'Caixa', 'Garçom', 'Garçonete', 'Ajudante de Cozinha', 'Cozinheiro',
  'Pizzaiolo', 'Ajudante de Pizzaiolo', 'Bartender', 'Gerente', 'Supervisor',
  'Entregador', 'Motoboy', 'Porteiro', 'Segurança', 'Limpeza', 'Outro',
];

const AREAS_PADRAO = ['Salão', 'Cozinha', 'Operações', 'Gerência', 'Bar', 'Pizzaria', 'Caixa', 'Outro'];

const FUNCOES_LISTA = [
  'Pizzaiolo', 'Motoboy', 'Cozinheiro', 'Auxiliar de Cozinha', 'Garçom', 'Garçonete',
  'Caixa', 'Bartender', 'Gerente', 'Atendente', 'Freelancer',
];

const DIAS_SEMANA_PT = [
  { valor: 'segunda', label: 'Seg', dow: 1 },
  { valor: 'terça',   label: 'Ter', dow: 2 },
  { valor: 'quarta',  label: 'Qua', dow: 3 },
  { valor: 'quinta',  label: 'Qui', dow: 4 },
  { valor: 'sexta',   label: 'Sex', dow: 5 },
  { valor: 'sábado',  label: 'Sáb', dow: 6 },
  { valor: 'domingo', label: 'Dom', dow: 0 },
];

const DIAS_SEMANA_FULL = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

const FUNCOES_ESCALA_PADRAO: Omit<FuncaoEscala, 'id' | 'unitId'>[] = [
  { nome: 'Pizzaiolo',          area: 'Pizzaria',   cor: '#e65100', diasTrabalho: [2,3,4,5,6,0], turnoNoite: [2,3,4,5,6,0] },
  { nome: 'Motoboy',            area: 'Operações',  cor: '#1565c0', diasTrabalho: [2,3,4,5,6,0], turnoNoite: [4,5,6,0] },
  { nome: 'Cozinheiro',         area: 'Cozinha',    cor: '#6a1b9a', diasTrabalho: [2,3,4,5,6,0], turnoNoite: [4,5,6,0] },
  { nome: 'Auxiliar de Cozinha',area: 'Cozinha',    cor: '#8e24aa', diasTrabalho: [2,3,4,5,6,0], turnoNoite: [4,5,6,0] },
  { nome: 'Garçom',             area: 'Salão',      cor: '#2e7d32', diasTrabalho: [2,3,4,5,6,0], turnoNoite: [4,5,6,0] },
  { nome: 'Garçonete',          area: 'Salão',      cor: '#00838f', diasTrabalho: [2,3,4,5,6,0], turnoNoite: [4,5,6,0] },
  { nome: 'Caixa',              area: 'Caixa',      cor: '#558b2f', diasTrabalho: [2,3,4,5,6,0], turnoNoite: [] },
  { nome: 'Bartender',          area: 'Bar',        cor: '#ad1457', diasTrabalho: [4,5,6,0],      turnoNoite: [4,5,6,0] },
  { nome: 'Atendente',          area: 'Salão',      cor: '#0277bd', diasTrabalho: [2,3,4,5,6,0], turnoNoite: [] },
  { nome: 'Gerente',            area: 'Gerência',   cor: '#37474f', diasTrabalho: [2,3,4,5,6],    turnoNoite: [4,5,6] },
  // CLT final de semana
  { nome: 'Bartender FDS',      area: 'Bar',        cor: '#c2185b', diasTrabalho: [5,6,0],        turnoNoite: [5,6,0] },
  // Freelancer genérico
  { nome: 'Freelancer',         area: 'Salão',      cor: '#f06292', diasTrabalho: [4,5,6,0],      turnoNoite: [4,5,6,0] },
];

const ESTADO_INICIAL: Partial<Colaborador> = {
  tipoContrato: 'CLT',
  cargo: 'Garçom',
  tipo: 'Garçom',
  funcao: '',
  area: 'Salão',
  valorDia: 0,
  valorNoite: 0,
  valorTransporte: 0,
  valeAlimentacao: false,
  salario: 0,
  diasDisponiveis: ['segunda','terça','quarta','quinta','sexta'],
  podeTrabalharDia: true,
  podeTrabalharNoite: false,
  ativo: true,
};

const FREELANCER_INICIAL: Partial<Freelancer> = {
  nome: '', chavePix: '', telefone: '', valorDobra: 120,
  cargo: '', funcao: '', area: 'Salão', ativo: true,
};

/* ─── Formatadores ────────────────────────────────────────────────────────── */
const formatarCPF = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
};

const formatarCelular = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

/* Converte YYYY-MM-DD → DD/MM/YYYY para exibição */
const dataISOParaPt = (iso: string): string => {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso; // já está em outro formato, devolve como está
};

/* Auto-formata enquanto o usuário digita → DD/MM/YYYY */
const formatarData = (v: string): string => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

/* Converte DD/MM/YYYY → YYYY-MM-DD para persistência; retorna '' se inválido */
const dataPtParaISO = (pt: string): string => {
  const m = pt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}`);
  if (isNaN(d.getTime())) return '';
  return `${yyyy}-${mm}-${dd}`;
};

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function Colaboradores() {
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const userUnitId = (user as any)?.unitId || '';
  const unitId = activeUnit?.id || userUnitId || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  /* ── State ─────────────────────────────────────────────────── */
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [funcoes, setFuncoes]           = useState<FuncaoEscala[]>([]);
  const [loading, setLoading]           = useState(false);
  const [salvando, setSalvando]         = useState(false);
  const [msg, setMsg]                   = useState('');

  type AbaType = 'lista' | 'novo' | 'freelancers' | 'regras';
  const [aba, setAba] = useState<AbaType>('lista');

  // Colaborador
  const [colaboradorEditando, setColaboradorEditando] = useState<Colaborador | null>(null);
  const [filtroTipo, setFiltroTipo]   = useState('');
  const [filtroArea, setFiltroArea]   = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState(true);
  const [busca, setBusca]             = useState('');
  const [novoColab, setNovoColab]     = useState<Partial<Colaborador>>(ESTADO_INICIAL);

  // Freelancer editing (using same Colaborador form)
  const [freelancerEditando, setFreelancerEditando] = useState<string | null>(null);
  const [formFree, setFormFree]       = useState<Partial<Freelancer>>(FREELANCER_INICIAL);

  // Regras de função
  const [funcaoEditando, setFuncaoEditando] = useState<FuncaoEscala | null>(null);
  const [formFuncao, setFormFuncao]   = useState<Partial<FuncaoEscala>>({
    nome: '', area: 'Salão', cor: '#1976d2', diasTrabalho: [2,3,4,5,6], turnoNoite: [],
  });

  /* ── Load ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (unitId) {
      carregarColaboradores();
      carregarFuncoes();
    }
  }, [unitId]);

  const token = () => localStorage.getItem('auth_token');

  const mostrarMsg = (texto: string) => {
    setMsg(texto);
    setTimeout(() => setMsg(''), 3500);
  };

  const carregarColaboradores = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) {
        const d = await r.json();
        // Retorna todos (ativos e inativos) para poder filtrar no front
        setColaboradores(Array.isArray(d) ? d : d.colaboradores || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const carregarFuncoes = async () => {
    try {
      const r = await fetch(`${apiUrl}/funcoes-escala?unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) { const d = await r.json(); setFuncoes(Array.isArray(d) ? d : []); }
    } catch (e) { console.error(e); }
  };

  /* ── Helpers ────────────────────────────────────────────────── */
  const celularDe = (c: Partial<Colaborador>) => c.celular || c.telefone || '';
  const cargoDe   = (c: Partial<Colaborador>) => c.cargo   || c.tipo     || 'Outro';
  const funcaoDe  = (c: Partial<Colaborador>) => c.funcao  || '';
  const areaDe    = (c: Partial<Colaborador>) => c.area    || '';

  // Todas as opções de função disponíveis
  const funcoesOpcoes = useMemo(() => {
    const fromDB = funcoes.map(f => f.nome);
    const all = [...new Set([...fromDB, ...FUNCOES_LISTA])].sort();
    return all;
  }, [funcoes]);

  /* ── CRUD Colaborador ─────────────────────────────────────── */
  const handleCriarColaborador = async () => {
    const cpfLimpo     = (novoColab.cpf     || '').replace(/\D/g, '');
    const celularLimpo = celularDe(novoColab).replace(/\D/g, '');
    if (!novoColab.nome?.trim()) { alert('Nome é obrigatório!'); return; }
    if (cpfLimpo.length !== 11)  { alert('CPF inválido — informe 11 dígitos!'); return; }
    if (celularLimpo.length < 10){ alert('Celular inválido!'); return; }
    const cargo = cargoDe(novoColab);
    const payload: Partial<Colaborador> = {
      ...novoColab,
      unitId,
      cargo,
      tipo: cargo,
      funcao:  novoColab.funcao  || '',
      area:    novoColab.area    || '',
      celular: novoColab.celular || '',
      telefone: novoColab.celular || '',
    };
    setSalvando(true);
    try {
      const res = await fetch(`${apiUrl}/colaboradores`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        mostrarMsg('✅ Colaborador cadastrado com sucesso!');
        setNovoColab(ESTADO_INICIAL);
        setAba('lista');
        carregarColaboradores();
      } else {
        const err = await res.json();
        alert(`Erro ao salvar: ${err.error}`);
      }
    } catch { alert('Erro ao salvar colaborador'); }
    finally { setSalvando(false); }
  };

  const handleEditarColaborador = async () => {
    if (!colaboradorEditando) return;
    const cargo = cargoDe(colaboradorEditando);
    const payload = {
      ...colaboradorEditando,
      cargo,
      tipo: cargo,
      funcao: colaboradorEditando.funcao || '',
      area:   colaboradorEditando.area   || '',
      telefone: colaboradorEditando.celular || colaboradorEditando.telefone || '',
    };
    setSalvando(true);
    try {
      const res = await fetch(`${apiUrl}/colaboradores/${colaboradorEditando.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        mostrarMsg('✅ Colaborador atualizado com sucesso!');
        setColaboradorEditando(null);
        carregarColaboradores();
      } else {
        const err = await res.json();
        alert(`Erro ao atualizar: ${err.error}`);
      }
    } catch { alert('Erro ao atualizar colaborador'); }
    finally { setSalvando(false); }
  };

  const handleDeletarColaborador = async (id: string) => {
    if (!window.confirm('Deletar este colaborador permanentemente?')) return;
    try {
      const res = await fetch(`${apiUrl}/colaboradores/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) { mostrarMsg('🗑️ Colaborador removido.'); carregarColaboradores(); }
      else alert('Erro ao deletar colaborador');
    } catch { alert('Erro ao deletar colaborador'); }
  };

  const handleDesligar = async (colab: Colaborador) => {
    const dataDemissao = window.prompt('Data de demissão (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!dataDemissao) return;
    setSalvando(true);
    try {
      await fetch(`${apiUrl}/colaboradores/${colab.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...colab, ativo: false, dataDemissao }),
      });
      mostrarMsg('✅ Colaborador desligado.');
      setColaboradorEditando(null);
      carregarColaboradores();
    } catch { alert('Erro ao desligar'); }
    finally { setSalvando(false); }
  };

  const handleReativar = async (colab: Colaborador) => {
    if (!window.confirm(`Reativar ${colab.nome}?`)) return;
    setSalvando(true);
    try {
      await fetch(`${apiUrl}/colaboradores/${colab.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...colab, ativo: true, dataDemissao: '' }),
      });
      mostrarMsg('✅ Colaborador reativado.');
      setColaboradorEditando(null);
      carregarColaboradores();
    } catch { alert('Erro ao reativar'); }
    finally { setSalvando(false); }
  };

  /* ── CRUD Freelancers (via /colaboradores com tipoContrato=Freelancer) ─── */
  const handleSalvarFreelancer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFree.nome?.trim()) { alert('Nome é obrigatório.'); return; }
    setSalvando(true);
    try {
      const isEdit = !!freelancerEditando;
      const payload = {
        ...formFree,
        unitId,
        tipoContrato: 'Freelancer',
        cargo: formFree.funcao || formFree.cargo || 'Freelancer',
        tipo:  formFree.funcao || formFree.cargo || 'Freelancer',
        cpf:   (formFree as any).cpf || '00000000000',
        celular: formFree.telefone || '',
        telefone: formFree.telefone || '',
        ativo: formFree.ativo !== false,
      };
      const url = isEdit
        ? `${apiUrl}/colaboradores/${freelancerEditando}`
        : `${apiUrl}/colaboradores`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        mostrarMsg(isEdit ? '✅ Freelancer atualizado!' : '✅ Freelancer cadastrado!');
        setFormFree(FREELANCER_INICIAL);
        setFreelancerEditando(null);
        carregarColaboradores();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Erro: ' + ((err as any).error || res.status));
      }
    } catch { alert('Erro ao salvar freelancer'); }
    finally { setSalvando(false); }
  };

  const handleDeletarFreelancer = async (id: string, nome: string) => {
    if (!window.confirm(`Excluir ${nome}?`)) return;
    await fetch(`${apiUrl}/colaboradores/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
    });
    mostrarMsg('🗑️ Freelancer removido.');
    carregarColaboradores();
  };

  /* ── CRUD Funções de Escala ───────────────────────────────── */
  const handleSalvarFuncao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFuncao.nome?.trim()) { alert('Nome da função é obrigatório.'); return; }
    setSalvando(true);
    try {
      const isEdit = !!funcaoEditando;
      const payload = {
        ...formFuncao,
        unitId,
        ...(isEdit ? { id: funcaoEditando!.id } : {}),
      };
      const res = await fetch(`${apiUrl}/funcoes-escala`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        mostrarMsg(isEdit ? '✅ Função atualizada!' : '✅ Função criada!');
        setFormFuncao({ nome: '', area: 'Salão', cor: '#1976d2', diasTrabalho: [2,3,4,5,6], turnoNoite: [] });
        setFuncaoEditando(null);
        carregarFuncoes();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Erro: ' + ((err as any).error || res.status));
      }
    } catch { alert('Erro ao salvar função'); }
    finally { setSalvando(false); }
  };

  const handleDeletarFuncao = async (id: string, nome: string) => {
    if (!window.confirm(`Excluir função "${nome}"?`)) return;
    await fetch(`${apiUrl}/funcoes-escala/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
    });
    mostrarMsg('🗑️ Função removida.');
    carregarFuncoes();
  };

  const handleImportarFuncoesPadrao = async () => {
    if (!window.confirm(`Importar ${FUNCOES_ESCALA_PADRAO.length} funções padrão? Funções existentes com mesmo nome serão atualizadas.`)) return;
    setSalvando(true);
    let criados = 0;
    for (const f of FUNCOES_ESCALA_PADRAO) {
      try {
        const existe = funcoes.find(x => x.nome.toLowerCase() === f.nome.toLowerCase());
        await fetch(`${apiUrl}/funcoes-escala`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...f, unitId, ...(existe ? { id: existe.id } : {}) }),
        });
        criados++;
      } catch { /* skip */ }
    }
    setSalvando(false);
    mostrarMsg(`✅ ${criados} funções importadas!`);
    carregarFuncoes();
  };

  /* ── Derivados ───────────────────────────────────────────── */
  // Freelancers são colaboradores com tipoContrato='Freelancer'
  const freelancers = useMemo(() =>
    colaboradores.filter(c => c.tipoContrato === 'Freelancer'),
  [colaboradores]);

  // CLTs (exibidos na aba lista)
  const colaboradoresCLT = useMemo(() =>
    colaboradores.filter(c => c.tipoContrato !== 'Freelancer'),
  [colaboradores]);

  /* ── Filtros ──────────────────────────────────────────────── */
  const colaboradoresFiltrados = useMemo(() => {
    return colaboradoresCLT.filter(c => {
      const matchTipo  = !filtroTipo || cargoDe(c) === filtroTipo || (c.funcao||'') === filtroTipo;
      const matchArea  = !filtroArea || (c.area || '') === filtroArea;
      const matchAtivo = filtroAtivo ? c.ativo !== false : c.ativo === false;
      const q = busca.toLowerCase();
      const matchBusca = !busca ||
        (c.nome || '').toLowerCase().includes(q) ||
        (c.cpf  || '').replace(/\D/g,'').includes(q.replace(/\D/g,'')) ||
        celularDe(c).replace(/\D/g,'').includes(q.replace(/\D/g,'')) ||
        (c.funcao || '').toLowerCase().includes(q);
      return matchTipo && matchArea && matchAtivo && matchBusca;
    });
  }, [colaboradores, filtroTipo, filtroArea, filtroAtivo, busca]);

  const areasUnicas = useMemo(() => {
    const s = new Set(colaboradoresCLT.map(c => c.area || '').filter(Boolean));
    return Array.from(s).sort();
  }, [colaboradoresCLT]);

  /* ── Estilos ──────────────────────────────────────────────── */
  const S = styles;

  /* ── Sub-forms ────────────────────────────────────────────── */
  const CamposBasicos = ({ data, onChange }: { data: Partial<Colaborador>; onChange: (p: Partial<Colaborador>) => void }) => (
    <div style={S.secao}>
      <h3 style={S.secaoTitulo}>📋 Identificação</h3>
      <div style={S.grid2Col}>
        <div style={{ ...S.formGroup, gridColumn: '1 / -1' }}>
          <label style={S.label}>Nome completo *</label>
          <input type="text" value={data.nome || ''} style={S.input}
            onChange={e => onChange({ nome: e.target.value })} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>CPF *</label>
          <input type="text" inputMode="numeric" placeholder="000.000.000-00"
            value={data.cpf || ''} style={S.input}
            onChange={e => onChange({ cpf: formatarCPF(e.target.value) })} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Celular / WhatsApp *</label>
          <input type="tel" inputMode="numeric" placeholder="(00) 00000-0000"
            value={data.celular || data.telefone || ''} style={S.input}
            onChange={e => { const f = formatarCelular(e.target.value); onChange({ celular: f, telefone: f }); }} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Data de Nascimento</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/AAAA"
            value={dataISOParaPt(data.dataNascimento || '')}
            style={S.input}
            maxLength={10}
            onChange={e => {
              const fmt2 = formatarData(e.target.value);
              const iso = dataPtParaISO(fmt2);
              onChange({ dataNascimento: iso || fmt2 });
            }}
          />
        </div>
        <div style={S.formGroup}>
          <label style={{ ...S.label, color: '#999' }}>E-mail (opcional)</label>
          <input type="email" value={data.email || ''} style={{ ...S.input, borderColor: '#ddd' }}
            onChange={e => onChange({ email: e.target.value })} />
        </div>
      </div>
    </div>
  );

  const CamposEndereco = ({ data, onChange }: { data: Partial<Colaborador>; onChange: (p: Partial<Colaborador>) => void }) => (
    <div style={S.secao}>
      <h3 style={S.secaoTitulo}>🏠 Endereço</h3>
      <div style={S.grid2Col}>
        <div style={{ ...S.formGroup, gridColumn: '1 / -1' }}>
          <label style={S.label}>Logradouro</label>
          <input type="text" value={data.endereco || ''} style={S.input}
            onChange={e => onChange({ endereco: e.target.value })} />
        </div>
        {[
          { label: 'Número', key: 'numero' }, { label: 'Complemento', key: 'complemento' },
          { label: 'Cidade', key: 'cidade' }, { label: 'Estado', key: 'estado' }, { label: 'CEP', key: 'cep' },
        ].map(({ label, key }) => (
          <div key={key} style={S.formGroup}>
            <label style={S.label}>{label}</label>
            <input type="text" value={(data as any)[key] || ''} style={S.input}
              onChange={e => onChange({ [key]: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );

  const CamposContratacao = ({ data, onChange }: { data: Partial<Colaborador>; onChange: (p: Partial<Colaborador>) => void }) => (
    <div style={S.secao}>
      <h3 style={S.secaoTitulo}>💼 Contratação</h3>
      <div style={S.grid2Col}>
        {/* Tipo de contrato */}
        <div style={S.formGroup}>
          <label style={S.label}>Tipo de Contrato *</label>
          <select value={data.tipoContrato || 'CLT'} style={S.input}
            onChange={e => onChange({ tipoContrato: e.target.value as 'CLT' | 'Freelancer' })}>
            <option value="CLT">CLT</option>
            <option value="Freelancer">Freelancer</option>
          </select>
        </div>
        {/* Cargo (admin only) */}
        <div style={S.formGroup}>
          <label style={S.label}>Cargo <span style={{ color:'#888', fontWeight:'normal', fontSize:'11px' }}>(administrativo — não aparece na escala)</span></label>
          <select value={cargoDe(data)} style={S.input}
            onChange={e => onChange({ cargo: e.target.value, tipo: e.target.value })}>
            {TIPOS_CARGO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {/* Função (exibida na escala) — SELECT com opções */}
        <div style={S.formGroup}>
          <label style={S.label}>Função na Escala <span style={{ color:'#1976d2', fontSize:'11px' }}>(exibida no grid de escalas)</span></label>
          <select value={funcaoDe(data)} style={S.input}
            onChange={e => onChange({ funcao: e.target.value })}>
            <option value="">— Selecione a função —</option>
            {funcoesOpcoes.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <small style={{ color: '#888', fontSize: '11px' }}>
            Diferente do cargo. Personalizada por colaborador. Cadastre mais em <em>Funções/Regras</em>.
          </small>
        </div>
        {/* Área — SELECT com opções */}
        <div style={S.formGroup}>
          <label style={S.label}>Área de Trabalho <span style={{ color:'#1976d2', fontSize:'11px' }}>(agrupamento na escala)</span></label>
          <select value={areaDe(data)} style={S.input}
            onChange={e => onChange({ area: e.target.value })}>
            <option value="">— Selecione a área —</option>
            {AREAS_PADRAO.map(a => <option key={a} value={a}>{a}</option>)}
            {/* Áreas customizadas do cadastro de funções */}
            {funcoes.map(f => f.area).filter(a => a && !AREAS_PADRAO.includes(a))
              .filter((v,i,arr) => arr.indexOf(v) === i)
              .map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {/* Datas */}
        <div style={S.formGroup}>
          <label style={S.label}>Data de Admissão</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/AAAA"
            value={dataISOParaPt(data.dataAdmissao || '')}
            style={S.input}
            maxLength={10}
            onChange={e => {
              const fmt2 = formatarData(e.target.value);
              const iso = dataPtParaISO(fmt2);
              onChange({ dataAdmissao: iso || fmt2 });
            }}
          />
        </div>
        <div style={S.formGroup}>
          <label style={{ ...S.label, color: data.ativo === false ? '#c62828' : '#444' }}>
            Data de Demissão {data.ativo === false && <span style={{ color:'#c62828' }}>● Desligado</span>}
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/AAAA"
            value={dataISOParaPt(data.dataDemissao || '')}
            style={{ ...S.input, borderColor: data.dataDemissao ? '#c62828' : '#ccc' }}
            maxLength={10}
            onChange={e => {
              const fmt2 = formatarData(e.target.value);
              const iso = dataPtParaISO(fmt2);
              onChange({ dataDemissao: iso || fmt2 });
            }}
          />
        </div>
        {/* Status */}
        <div style={S.formGroup}>
          <label style={S.label}>Status</label>
          <select value={data.ativo === false ? 'inativo' : 'ativo'} style={S.input}
            onChange={e => onChange({ ativo: e.target.value === 'ativo' })}>
            <option value="ativo">● Ativo</option>
            <option value="inativo">○ Inativo / Desligado</option>
          </select>
        </div>
        {/* Financeiro */}
        <div style={S.formGroup}>
          <label style={S.label}>Salário Base (R$)</label>
          <input type="number" step="0.01" value={data.salario || 0} style={S.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ salario: parseFloat(e.target.value) || 0 })} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Valor Dia / Dobra-Dia (R$)</label>
          <input type="number" step="0.01" value={data.valorDia || 0} style={S.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ valorDia: parseFloat(e.target.value) || 0 })} />
          <small style={{ color:'#888', fontSize:'11px' }}>Pago nas dobras (além do salário)</small>
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Valor Noite / Dobra-Noite (R$)</label>
          <input type="number" step="0.01" value={data.valorNoite || 0} style={S.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ valorNoite: parseFloat(e.target.value) || 0 })} />
          <small style={{ color:'#888', fontSize:'11px' }}>Pago nas dobras (além do salário)</small>
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Transporte Ida+Volta por dia (R$)</label>
          <input type="number" step="0.50" value={data.valorTransporte || 0} style={S.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ valorTransporte: parseFloat(e.target.value) || 0 })} />
          <small style={{ color:'#888', fontSize:'11px' }}>Multiplicado pelos dias trabalhados na semana</small>
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Chave PIX</label>
          <input type="text" value={data.chavePix || ''} style={S.input}
            onChange={e => onChange({ chavePix: e.target.value })} />
        </div>
        <div style={{ ...S.formGroup, justifyContent: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '22px' }}>
            <input type="checkbox" checked={data.valeAlimentacao || false}
              onChange={e => onChange({ valeAlimentacao: e.target.checked })} />
            <span style={S.label}>Vale Alimentação</span>
          </label>
        </div>
      </div>
    </div>
  );

  const CamposJornada = ({ data, onChange }: { data: Partial<Colaborador>; onChange: (p: Partial<Colaborador>) => void }) => (
    <div style={S.secao}>
      <h3 style={S.secaoTitulo}>📅 Jornada</h3>
      <div style={S.formGroup}>
        <label style={S.label}>Dias disponíveis:</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
          {DIAS_SEMANA_PT.map(dia => {
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
          { label: '☀️ Pode trabalhar Dia', key: 'podeTrabalharDia' },
          { label: '🌙 Pode trabalhar Noite', key: 'podeTrabalharNoite' },
        ].map(({ label, key }) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={(data as any)[key] || false}
              onChange={e => onChange({ [key]: e.target.checked })} />
            <span style={S.label}>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={S.pageWrapper}>
      <Header title="👥 Gestão de Colaboradores" showBack={true} />
      <div style={S.container}>

        {/* Toast */}
        {msg && (
          <div style={{ position:'fixed', top:'70px', right:'20px', backgroundColor:'#2e7d32', color:'white',
            padding:'12px 20px', borderRadius:'8px', fontWeight:'bold', fontSize:'14px', zIndex:9999,
            boxShadow:'0 4px 12px rgba(0,0,0,0.3)' }}>
            {msg}
          </div>
        )}

        {/* ABAS */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '0', borderBottom: '2px solid #ddd', flexWrap: 'wrap' }}>
          {([
            { key: 'lista',       label: `📋 CLT (${colaboradoresCLT.length})` },
            { key: 'novo',        label: '➕ Novo' },
            { key: 'freelancers', label: `🎯 Freelancers (${freelancers.length})` },
            { key: 'regras',      label: `📖 Funções/Regras (${funcoes.length})` },
          ] as { key: AbaType; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setAba(key)} style={{
              padding: '10px 18px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
              borderRadius: '4px 4px 0 0',
              backgroundColor: aba === key ? '#1976d2' : '#f0f0f0',
              color: aba === key ? 'white' : '#333',
              fontSize: '13px',
            }}>{label}</button>
          ))}
        </div>

        {/* ── ABA LISTA ─────────────────────────────────────────── */}
        {aba === 'lista' && (
          <div style={S.tabContent}>
            <div style={S.filtrosContainer}>
              <input type="text" placeholder="🔍 Buscar por nome, CPF, celular ou função..."
                value={busca} onChange={e => setBusca(e.target.value)} style={S.inputBusca} />
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={S.select}>
                <option value="">Todos os cargos</option>
                {TIPOS_CARGO.map(t => <option key={t} value={t}>{t}</option>)}
                {funcoesOpcoes.filter(f => !TIPOS_CARGO.includes(f)).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={S.select}>
                <option value="">Todas as áreas</option>
                {areasUnicas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={filtroAtivo ? 'ativo' : 'inativo'}
                onChange={e => setFiltroAtivo(e.target.value === 'ativo')} style={S.select}>
                <option value="ativo">● Ativos</option>
                <option value="inativo">○ Desligados</option>
              </select>
            </div>

            {/* Legenda rápida */}
            <div style={{ display:'flex', gap:'8px', marginBottom:'12px', fontSize:'11px', color:'#666', flexWrap:'wrap' }}>
              <span>Total CLT: <strong>{colaboradoresFiltrados.length}</strong></span>
              <span style={{ color:'#e65100' }}>Freelancers (separado): <strong>{freelancers.length}</strong></span>
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '30px' }}>Carregando colaboradores...</p>
            ) : colaboradoresFiltrados.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '30px' }}>Nenhum colaborador encontrado.</p>
            ) : (
              <div style={S.gridContainer}>
                {colaboradoresFiltrados.map(colab => (
                  <div key={colab.id} style={{ ...S.card, opacity: colab.ativo === false ? 0.7 : 1, borderLeft: colab.ativo === false ? '4px solid #c62828' : undefined }}>
                    <div style={S.cardHeader}>
                      <h3 style={{ margin: 0, fontSize: '14px' }}>{colab.nome}</h3>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ ...S.badge, backgroundColor: colab.tipoContrato === 'CLT' ? '#28a745' : '#fd7e14' }}>
                          {colab.tipoContrato}
                        </span>
                        {colab.area && (
                          <span style={{ ...S.badge, backgroundColor: '#1565c0', fontSize: '10px' }}>
                            {colab.area}
                          </span>
                        )}
                        {colab.ativo === false && (
                          <span style={{ ...S.badge, backgroundColor: '#c62828', fontSize: '10px' }}>
                            Desligado
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={S.cardBody}>
                      {/* Função na escala — destaque */}
                      {colab.funcao && (
                        <div style={{ backgroundColor:'#e3f2fd', borderRadius:'4px', padding:'4px 8px', marginBottom:'6px', fontSize:'12px' }}>
                          <span style={{ color:'#888', fontSize:'11px' }}>Função: </span>
                          <strong style={{ color:'#1565c0' }}>{colab.funcao}</strong>
                        </div>
                      )}
                      <div style={S.cardRow}>
                        <span style={S.cardLabel}>Cargo:</span>
                        <span style={{ fontSize: '12px', color:'#666' }}>{cargoDe(colab)}</span>
                      </div>
                      <div style={S.cardRow}>
                        <span style={S.cardLabel}>CPF:</span>
                        <span style={{ fontSize:'12px' }}>{colab.cpf || '—'}</span>
                      </div>
                      <div style={S.cardRow}>
                        <span style={S.cardLabel}>Celular:</span>
                        <span style={{ fontSize:'12px' }}>{(colab.celular || colab.telefone) || '—'}</span>
                      </div>
                      {colab.chavePix && (
                        <div style={S.cardRow}>
                          <span style={S.cardLabel}>PIX:</span>
                          <span style={{ color: '#1976d2', fontSize: '12px' }}>{colab.chavePix}</span>
                        </div>
                      )}
                      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '6px', paddingTop: '6px' }}>
                        {(colab.valorDia > 0 || colab.valorNoite > 0) && (
                          <div style={S.cardRow}>
                            <span style={S.cardLabel}>Dobra:</span>
                            <span style={{ fontSize:'12px', color:'#1976d2' }}>D={fmt(colab.valorDia)}</span>
                            <span style={{ fontSize:'12px', color:'#7b1fa2', marginLeft:'6px' }}>N={fmt(colab.valorNoite)}</span>
                          </div>
                        )}
                        {colab.valorTransporte > 0 && (
                          <div style={S.cardRow}>
                            <span style={S.cardLabel}>Transp:</span>
                            <span style={{ fontSize:'12px', color:'#666' }}>{fmt(colab.valorTransporte)}/dia</span>
                          </div>
                        )}
                        {colab.dataAdmissao && (
                          <div style={S.cardRow}>
                            <span style={S.cardLabel}>Admissão:</span>
                            <span style={{ fontSize:'11px', color:'#888' }}>{colab.dataAdmissao}</span>
                          </div>
                        )}
                        {colab.dataDemissao && (
                          <div style={S.cardRow}>
                            <span style={{ ...S.cardLabel, color:'#c62828' }}>Demissão:</span>
                            <span style={{ fontSize:'11px', color:'#c62828' }}>{colab.dataDemissao}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={S.cardActions}>
                      <button onClick={() => setColaboradorEditando(colab)} style={S.botaoEditar}>✏️ Editar</button>
                      {colab.ativo !== false
                        ? <button onClick={() => handleDesligar(colab)} style={{ ...S.botaoDeletar, backgroundColor:'#e65100', fontSize:'11px' }}>Desligar</button>
                        : <button onClick={() => handleReativar(colab)} style={{ ...S.botaoDeletar, backgroundColor:'#2e7d32', fontSize:'11px' }}>Reativar</button>
                      }
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ABA NOVO COLABORADOR ──────────────────────────────── */}
        {aba === 'novo' && (
          <div style={{ ...S.tabContent, ...S.formularioContainer }}>
            <h2 style={{ marginTop: 0, color:'#1565c0' }}>➕ Novo Colaborador</h2>
            <CamposBasicos    data={novoColab} onChange={p => setNovoColab(prev => ({ ...prev, ...p }))} />
            <CamposEndereco   data={novoColab} onChange={p => setNovoColab(prev => ({ ...prev, ...p }))} />
            <CamposContratacao data={novoColab} onChange={p => setNovoColab(prev => ({ ...prev, ...p }))} />
            <CamposJornada    data={novoColab} onChange={p => setNovoColab(prev => ({ ...prev, ...p }))} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button onClick={() => { setNovoColab(ESTADO_INICIAL); setAba('lista'); }} style={S.botaoCancelar}>Cancelar</button>
              <button onClick={handleCriarColaborador} disabled={salvando} style={S.botaoSalvar}>
                {salvando ? '⏳ Salvando...' : '💾 Salvar Colaborador'}
              </button>
            </div>
          </div>
        )}

        {/* ── ABA FREELANCERS ───────────────────────────────────── */}
        {aba === 'freelancers' && (
          <div style={S.tabContent}>
            <div style={{ padding:'10px 14px', backgroundColor:'#fff3e0', borderRadius:'6px', borderLeft:'4px solid #e65100', marginBottom:'16px', fontSize:'13px' }}>
              <strong style={{ color:'#e65100' }}>ℹ️ Freelancers</strong> — cadastrados como colaboradores com tipo <strong>Freelancer</strong>. Aparecem na escala agrupados por área. Os valores de dobra só são visíveis em <strong>Folha de Pagamento</strong>.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>🎯 Freelancers Cadastrados ({freelancers.length})</h3>
              <button onClick={() => { setFormFree(FREELANCER_INICIAL); setFreelancerEditando(null); }}
                style={S.btnPrimary}>➕ Novo Freelancer</button>
            </div>

            {freelancers.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                      {['Nome', 'Função', 'Área', 'PIX', 'Telefone', 'R$/Dobra', 'Transp/dia', 'Status', ''].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {freelancers.map((f, i) => (
                      <tr key={f.id} style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{f.nome}</td>
                        <td style={{ padding: '8px 10px', color: '#1976d2' }}>{f.funcao || f.cargo || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#555', fontSize: '12px' }}>{f.area || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: '12px' }}>{f.chavePix || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: '12px' }}>{(f.celular || f.telefone) || '—'}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#2e7d32' }}>{fmt(f.valorDia || 0)}<span style={{fontSize:'10px',color:'#888'}}>/dobra</span></td>
                        <td style={{ padding: '8px 10px', fontSize: '12px', color: '#1565c0' }}>{f.valorTransporte > 0 ? fmt(f.valorTransporte) : '—'}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                            backgroundColor: f.ativo !== false ? '#e8f5e9' : '#fce4ec',
                            color: f.ativo !== false ? '#2e7d32' : '#c62828' }}>
                            {f.ativo !== false ? '● Ativo' : '○ Inativo'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => setColaboradorEditando(f as Colaborador)}
                              style={{ padding: '3px 8px', border: 'none', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#1976d2', color: 'white', fontSize: '12px' }}>✏️</button>
                            <button onClick={() => handleDeletarFreelancer(f.id, f.nome)}
                              style={{ padding: '3px 8px', border: 'none', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#e53935', color: 'white', fontSize: '12px' }}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Formulário para novo freelancer */}
            <div style={{ backgroundColor: '#f9f9f9', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', borderTop: '3px solid #e65100' }}>
              <h4 style={{ marginTop: 0, color: '#e65100' }}>➕ Novo Freelancer</h4>
              <p style={{ fontSize: '12px', color: '#888', margin: '0 0 12px 0' }}>Preencha os campos abaixo. O colaborador será salvo como <strong>Freelancer</strong>.</p>
              <form onSubmit={handleSalvarFreelancer}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={S.formGroup}>
                    <label style={S.label}>Nome *</label>
                    <input type="text" value={formFree.nome || ''} style={S.input} required
                      onChange={e => setFormFree({ ...formFree, nome: e.target.value })} />
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Função <span style={{ color: '#1976d2', fontSize:'11px' }}>(escala)</span></label>
                    <select value={formFree.funcao || formFree.cargo || ''} style={S.input}
                      onChange={e => setFormFree({ ...formFree, funcao: e.target.value, cargo: e.target.value })}>
                      <option value="">— Selecione —</option>
                      {funcoesOpcoes.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Área</label>
                    <select value={(formFree as any).area || ''} style={S.input}
                      onChange={e => setFormFree({ ...formFree, area: e.target.value } as any)}>
                      <option value="">— Selecione —</option>
                      {AREAS_PADRAO.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Chave PIX</label>
                    <input type="text" value={formFree.chavePix || ''} style={S.input}
                      onChange={e => setFormFree({ ...formFree, chavePix: e.target.value })} />
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Telefone / WhatsApp</label>
                    <input type="tel" value={formFree.telefone || ''} style={S.input}
                      onChange={e => setFormFree({ ...formFree, telefone: e.target.value })} />
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Valor por Dobra (R$) <span style={{fontSize:'11px',color:'#888'}}>(usado na folha)</span></label>
                    <input type="number" step="10" min="0" value={(formFree as any).valorDia ?? 120} style={S.input}
                      onChange={e => setFormFree({ ...formFree, valorDia: parseFloat(e.target.value) || 0 } as any)} />
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Transporte por dia (R$)</label>
                    <input type="number" step="0.50" min="0" value={(formFree as any).valorTransporte ?? 0} style={S.input}
                      onChange={e => setFormFree({ ...formFree, valorTransporte: parseFloat(e.target.value) || 0 } as any)} />
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Status</label>
                    <select value={formFree.ativo !== false ? 'true' : 'false'} style={S.input}
                      onChange={e => setFormFree({ ...formFree, ativo: e.target.value === 'true' })}>
                      <option value="true">● Ativo</option>
                      <option value="false">○ Inativo</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
                  <button type="submit" disabled={salvando} style={S.botaoSalvar}>
                    {salvando ? '⏳...' : '✅ Cadastrar Freelancer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── ABA REGRAS / FUNÇÕES DE ESCALA ────────────────────── */}
        {aba === 'regras' && (
          <div style={S.tabContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>📖 Funções de Escala — Regras por Função</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleImportarFuncoesPadrao} disabled={salvando} style={{ ...S.btnPrimary, backgroundColor: '#43a047' }}>
                  {salvando ? '⏳...' : `📥 Importar ${FUNCOES_ESCALA_PADRAO.length} Padrões`}
                </button>
                <button onClick={() => { setFormFuncao({ nome: '', area: 'Salão', cor: '#1976d2', diasTrabalho: [2,3,4,5,6], turnoNoite: [] }); setFuncaoEditando(null); }}
                  style={S.btnPrimary}>➕ Nova Função</button>
              </div>
            </div>

            <div style={{ padding:'10px 14px', backgroundColor:'#e8f5e9', borderRadius:'6px', marginBottom:'16px', fontSize:'13px', lineHeight:1.7 }}>
              <strong style={{ color:'#1b5e20' }}>ℹ️ Como funciona:</strong><br/>
              • <strong>Função</strong> = o que aparece na escala (ex: Pizzaiolo, Bartender). Diferente do cargo administrativo.<br/>
              • <strong>Dias de trabalho</strong> definem quando a geração automática de escala cria turnos.<br/>
              • <strong>Turno noite</strong> nos dias marcados = dobra (D+N) na geração automática.<br/>
              • Cargos só de final de semana (Bartender FDS): marque apenas Sáb e Dom.
            </div>

            {/* Tabela de funções */}
            {funcoes.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Função</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Área</th>
                      {DIAS_SEMANA_FULL.map(d => (
                        <th key={d} style={{ padding: '8px 6px', textAlign: 'center', minWidth: '60px', fontSize:'11px' }}>{d.slice(0, 3)}</th>
                      ))}
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funcoes.map((f, i) => (
                      <tr key={f.id} style={{ backgroundColor: i % 2 === 0 ? '#f5f5f5' : 'white' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 'bold', borderLeft: `4px solid ${f.cor}` }}>
                          {f.nome}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#555', fontSize: '12px' }}>{f.area || '—'}</td>
                        {[0,1,2,3,4,5,6].map(dow => {
                          const trabalha = (f.diasTrabalho || []).includes(dow);
                          const noite    = (f.turnoNoite   || []).includes(dow);
                          const turno    = !trabalha ? '' : noite ? 'DiaNoite' : 'Dia';
                          const colors: Record<string, { bg: string; color: string; label: string }> = {
                            '':       { bg: '#f5f5f5', color: '#ccc', label: '—' },
                            Dia:      { bg: '#fff9c4', color: '#f57f17', label: '☀️D' },
                            DiaNoite: { bg: '#e8f5e9', color: '#2e7d32', label: 'DN' },
                          };
                          const b = colors[turno] || colors[''];
                          return (
                            <td key={dow} style={{ padding: '5px', textAlign: 'center' }}>
                              <span style={{ backgroundColor: b.bg, color: b.color, padding: '2px 5px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                                {b.label}
                              </span>
                            </td>
                          );
                        })}
                        <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={() => { setFuncaoEditando(f); setFormFuncao({ ...f }); }}
                              style={{ padding: '4px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#1976d2', color: 'white', fontSize: '12px' }}>✏️</button>
                            <button onClick={() => handleDeletarFuncao(f.id, f.nome)}
                              style={{ padding: '4px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#e53935', color: 'white', fontSize: '12px' }}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {funcoes.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#fff3e0', borderRadius: '8px', marginBottom: '20px' }}>
                <p style={{ color: '#e65100', margin: 0 }}>
                  Nenhuma função cadastrada. Clique em <strong>"Importar Padrões"</strong> para importar 12 funções padrão (CLT + Freelancer), ou cadastre manualmente.
                </p>
              </div>
            )}

            {/* Formulário de função */}
            <div style={{ backgroundColor: '#f9f9f9', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', borderTop: '3px solid #1976d2' }}>
              <h4 style={{ marginTop: 0, color: '#1976d2' }}>
                {funcaoEditando ? `✏️ Editando: ${funcaoEditando.nome}` : '➕ Nova Função de Escala'}
              </h4>
              <form onSubmit={handleSalvarFuncao}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div style={S.formGroup}>
                    <label style={S.label}>Nome da Função *</label>
                    <input type="text" value={formFuncao.nome || ''} style={S.input} required
                      onChange={e => setFormFuncao({ ...formFuncao, nome: e.target.value })} />
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Área</label>
                    <select value={formFuncao.area || 'Salão'} style={S.input}
                      onChange={e => setFormFuncao({ ...formFuncao, area: e.target.value })}>
                      {AREAS_PADRAO.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Cor (calendário)</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="color" value={formFuncao.cor || '#1976d2'} style={{ width: '40px', height: '36px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                        onChange={e => setFormFuncao({ ...formFuncao, cor: e.target.value })} />
                      <input type="text" value={formFuncao.cor || '#1976d2'} style={{ ...S.input, flex: 1 }}
                        onChange={e => setFormFuncao({ ...formFuncao, cor: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={S.label}>Dias que trabalha (clique para alternar):</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {DIAS_SEMANA_FULL.map((d, dow) => {
                      const ativo = (formFuncao.diasTrabalho || []).includes(dow);
                      return (
                        <button key={dow} type="button" onClick={() => {
                          const dt = ativo
                            ? (formFuncao.diasTrabalho || []).filter(x => x !== dow)
                            : [...(formFuncao.diasTrabalho || []), dow].sort();
                          setFormFuncao({ ...formFuncao, diasTrabalho: dt });
                        }} style={{
                          padding: '6px 12px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 'bold',
                          backgroundColor: ativo ? '#1976d2' : '#f5f5f5',
                          color: ativo ? 'white' : '#666',
                        }}>
                          {d.slice(0,3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={S.label}>Dias com turno noite / dobra <span style={{ color:'#3949ab', fontSize:'11px' }}>(D+N = dobra no lançamento automático)</span>:</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {DIAS_SEMANA_FULL.map((d, dow) => {
                      const ativo = (formFuncao.turnoNoite || []).includes(dow);
                      return (
                        <button key={dow} type="button" onClick={() => {
                          const tn = ativo
                            ? (formFuncao.turnoNoite || []).filter(x => x !== dow)
                            : [...(formFuncao.turnoNoite || []), dow].sort();
                          setFormFuncao({ ...formFuncao, turnoNoite: tn });
                        }} style={{
                          padding: '6px 12px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 'bold',
                          backgroundColor: ativo ? '#3949ab' : '#f5f5f5',
                          color: ativo ? 'white' : '#666',
                        }}>
                          {d.slice(0,3)} 🌙
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="submit" disabled={salvando} style={S.botaoSalvar}>
                    {salvando ? '⏳...' : (funcaoEditando ? '💾 Atualizar' : '✅ Criar Função')}
                  </button>
                  {funcaoEditando && (
                    <button type="button" onClick={() => { setFuncaoEditando(null); setFormFuncao({ nome: '', area: 'Salão', cor: '#1976d2', diasTrabalho: [2,3,4,5,6], turnoNoite: [] }); }}
                      style={S.botaoCancelar}>✕ Cancelar</button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL EDIÇÃO ── */}
      {colaboradorEditando && (
        <div style={S.modal}>
          <div style={S.modalContent}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
              <h2 style={{ margin: 0 }}>✏️ Editar Colaborador</h2>
              <button onClick={() => setColaboradorEditando(null)} style={{ background:'none', border:'none', fontSize:'22px', cursor:'pointer', color:'#666' }}>✕</button>
            </div>
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
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap:'wrap' }}>
              <button onClick={() => setColaboradorEditando(null)} style={{ ...S.botaoCancelar, flex:'none', padding:'10px 16px' }}>Cancelar</button>
              <button onClick={handleEditarColaborador} disabled={salvando} style={{ ...S.botaoSalvar, flex:1 }}>
                {salvando ? '⏳ Salvando...' : '💾 Salvar Alterações'}
              </button>
              {colaboradorEditando.ativo !== false ? (
                <button onClick={() => handleDesligar(colaboradorEditando)} disabled={salvando}
                  style={{ ...S.botaoCancelar, backgroundColor:'#e65100', flex:'none', padding:'10px 14px', fontSize:'13px' }}>
                  🚪 Desligar
                </button>
              ) : (
                <button onClick={() => handleReativar(colaboradorEditando)} disabled={salvando}
                  style={{ ...S.botaoCancelar, backgroundColor:'#2e7d32', flex:'none', padding:'10px 14px', fontSize:'13px' }}>
                  ♻️ Reativar
                </button>
              )}
              <button onClick={() => {
                if (window.confirm('Deletar este colaborador permanentemente?')) {
                  handleDeletarColaborador(colaboradorEditando.id);
                  setColaboradorEditando(null);
                }
              }} style={{ ...S.botaoCancelar, backgroundColor: '#dc3545', flex:'none', padding:'10px 14px' }}>
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

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const styles: { [key: string]: React.CSSProperties } = {
  pageWrapper:        { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  container:          { padding: '20px', maxWidth: '1400px', margin: '0 auto', width: '100%', flex: 1 },
  tabContent:         { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '0 8px 8px 8px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
  filtrosContainer:   { display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' },
  inputBusca:         { flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '220px' },
  select:             { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: 'white', cursor: 'pointer' },
  gridContainer:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' },
  card:               { border: '1px solid #ddd', borderRadius: '8px', padding: '14px', backgroundColor: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' },
  cardHeader:         { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '8px', gap: '8px' },
  cardBody:           { marginBottom: '10px', fontSize: '13px' },
  cardRow:            { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' },
  cardLabel:          { color: '#888', fontWeight: 600, fontSize: '11px', minWidth: '56px' },
  cardActions:        { display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid #eee' },
  badge:              { padding: '3px 8px', borderRadius: '4px', color: 'white', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' },
  botaoEditar:        { flex: 1, padding: '7px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  botaoDeletar:       { padding: '7px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  formularioContainer:{ backgroundColor: '#f9f9f9', borderRadius: '8px' },
  secao:              { marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e0e0e0' },
  secaoTitulo:        { margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold', color: '#555' },
  grid2Col:           { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' },
  formGroup:          { display: 'flex', flexDirection: 'column', gap: '4px' },
  label:              { fontWeight: 'bold', fontSize: '13px', color: '#444' },
  input:              { padding: '9px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' },
  botaoSalvar:        { flex: 1, padding: '11px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
  botaoCancelar:      { flex: 1, padding: '11px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
  btnPrimary:         { padding: '9px 18px', backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  modal:              { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent:       { backgroundColor: 'white', padding: '24px', borderRadius: '8px', maxWidth: '760px', maxHeight: '92vh', overflowY: 'auto', width: '96%', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' },
};

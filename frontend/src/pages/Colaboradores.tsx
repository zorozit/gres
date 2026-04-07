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
  cargo: string;        // cargo administrativo (mantido só no cadastro)
  tipo: string;         // retrocompat
  funcao: string;       // função exibida na escala (personalizável por colaborador)
  area: string;         // área de trabalho: Salão, Cozinha, Operações, Gerência...
  valorDia: number;
  valorNoite: number;
  valorTransporte: number;
  valeAlimentacao: boolean;
  salario: number;
  chavePix: string;
  dataAdmissao: string;
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
  'Caixa', 'Garçom', 'Garçonete', 'Ajudante de Cozinha', 'Cozinheiro',
  'Pizzaiolo', 'Ajudante de Pizzaiolo', 'Bartender', 'Gerente', 'Supervisor',
  'Entregador', 'Motoboy', 'Porteiro', 'Segurança', 'Limpeza', 'Outro',
];

const AREAS_PADRAO = ['Salão', 'Cozinha', 'Operações', 'Gerência', 'Bar', 'Outro'];

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
  { nome: 'Pizzaiolo',    area: 'Cozinha',    cor: '#e65100', diasTrabalho: [2,3,4,5,6], turnoNoite: [2,3,4,5,6] },
  { nome: 'Motoboy',      area: 'Operações',  cor: '#1565c0', diasTrabalho: [2,3,4,5,6], turnoNoite: [4,5,6] },
  { nome: 'Cozinheiro',   area: 'Cozinha',    cor: '#6a1b9a', diasTrabalho: [2,3,4,5,6], turnoNoite: [4,5,6] },
  { nome: 'Garçom',       area: 'Salão',      cor: '#2e7d32', diasTrabalho: [2,3,4,5,6], turnoNoite: [] },
  { nome: 'Garçonete',    area: 'Salão',      cor: '#00838f', diasTrabalho: [2,3,4,5,6], turnoNoite: [] },
  { nome: 'Caixa',        area: 'Salão',      cor: '#558b2f', diasTrabalho: [2,3,4,5,6], turnoNoite: [] },
  { nome: 'Bartender',    area: 'Bar',        cor: '#ad1457', diasTrabalho: [4,5,6,0],   turnoNoite: [4,5,6,0] },
  { nome: 'Gerente',      area: 'Gerência',   cor: '#37474f', diasTrabalho: [2,3,4,5,6], turnoNoite: [4,5,6] },
  { nome: 'Freelancer',   area: 'Salão',      cor: '#c2185b', diasTrabalho: [4,5,6,0],   turnoNoite: [4,5,6,0] },
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

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function Colaboradores() {
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const userUnitId = (user as any)?.unitId || '';
  const unitId = activeUnit?.id || userUnitId || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  /* ── State ─────────────────────────────────────────────────── */
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [freelancers, setFreelancers]   = useState<Freelancer[]>([]);
  const [funcoes, setFuncoes]           = useState<FuncaoEscala[]>([]);
  const [loading, setLoading]           = useState(false);
  const [salvando, setSalvando]         = useState(false);

  type AbaType = 'lista' | 'novo' | 'freelancers' | 'regras';
  const [aba, setAba] = useState<AbaType>('lista');

  // Colaborador
  const [colaboradorEditando, setColaboradorEditando] = useState<Colaborador | null>(null);
  const [filtroTipo, setFiltroTipo]   = useState('');
  const [filtroArea, setFiltroArea]   = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState(true);
  const [busca, setBusca]             = useState('');
  const [novoColab, setNovoColab]     = useState<Partial<Colaborador>>(ESTADO_INICIAL);

  // Freelancer
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
      carregarFreelancers();
      carregarFuncoes();
    }
  }, [unitId]);

  const token = () => localStorage.getItem('auth_token');

  const carregarColaboradores = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) {
        const d = await r.json();
        setColaboradores(Array.isArray(d) ? d : d.colaboradores || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const carregarFreelancers = async () => {
    try {
      const r = await fetch(`${apiUrl}/freelancers?unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) { const d = await r.json(); setFreelancers(Array.isArray(d) ? d : []); }
    } catch (e) { console.error(e); }
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
  const funcaoDe  = (c: Partial<Colaborador>) => c.funcao  || cargoDe(c);
  const areaDe    = (c: Partial<Colaborador>) => c.area    || '';

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
      funcao:  novoColab.funcao  || cargo,
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
        alert('Colaborador cadastrado com sucesso!');
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
      funcao: colaboradorEditando.funcao || cargo,
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
        alert('Colaborador atualizado com sucesso!');
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
    if (!window.confirm('Deletar este colaborador?')) return;
    try {
      const res = await fetch(`${apiUrl}/colaboradores/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) carregarColaboradores();
      else alert('Erro ao deletar colaborador');
    } catch { alert('Erro ao deletar colaborador'); }
  };

  /* ── CRUD Freelancers ─────────────────────────────────────── */
  const handleSalvarFreelancer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFree.nome?.trim()) { alert('Nome é obrigatório.'); return; }
    setSalvando(true);
    try {
      const isEdit = !!freelancerEditando;
      const url    = isEdit ? `${apiUrl}/freelancers/${freelancerEditando}` : `${apiUrl}/freelancers`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formFree, unitId }),
      });
      if (res.ok) {
        alert(isEdit ? 'Freelancer atualizado!' : 'Freelancer cadastrado!');
        setFormFree(FREELANCER_INICIAL);
        setFreelancerEditando(null);
        carregarFreelancers();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Erro: ' + ((err as any).error || res.status));
      }
    } catch { alert('Erro ao salvar freelancer'); }
    finally { setSalvando(false); }
  };

  const handleDeletarFreelancer = async (id: string, nome: string) => {
    if (!window.confirm(`Excluir ${nome}?`)) return;
    await fetch(`${apiUrl}/freelancers/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
    });
    carregarFreelancers();
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
      const url = isEdit
        ? `${apiUrl}/funcoes-escala`   // PUT não existe, reutiliza POST com id
        : `${apiUrl}/funcoes-escala`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert(isEdit ? 'Função atualizada!' : 'Função criada!');
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
    carregarFuncoes();
  };

  const handleImportarFuncoesPadrao = async () => {
    if (!window.confirm('Importar funções padrão para esta unidade? Funções com mesmo nome serão atualizadas.')) return;
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
    alert(`✅ ${criados} funções importadas!`);
    carregarFuncoes();
  };

  /* ── Filtros ──────────────────────────────────────────────── */
  const colaboradoresFiltrados = useMemo(() => {
    return colaboradores.filter(c => {
      const matchTipo  = !filtroTipo || cargoDe(c) === filtroTipo;
      const matchArea  = !filtroArea || (c.area || '') === filtroArea;
      const matchAtivo = c.ativo === filtroAtivo;
      const q = busca.toLowerCase();
      const matchBusca = !busca ||
        (c.nome || '').toLowerCase().includes(q) ||
        (c.cpf  || '').replace(/\D/g,'').includes(q.replace(/\D/g,'')) ||
        celularDe(c).replace(/\D/g,'').includes(q.replace(/\D/g,''));
      return matchTipo && matchArea && matchAtivo && matchBusca;
    });
  }, [colaboradores, filtroTipo, filtroArea, filtroAtivo, busca]);

  const areasUnicas = useMemo(() => {
    const s = new Set(colaboradores.map(c => c.area || '').filter(Boolean));
    return Array.from(s).sort();
  }, [colaboradores]);

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
          <input type="date" value={data.dataNascimento || ''} style={S.input}
            onChange={e => onChange({ dataNascimento: e.target.value })} />
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
        {/* Cargo (admin, mantido só no cadastro) */}
        <div style={S.formGroup}>
          <label style={S.label}>Cargo (administrativo)</label>
          <select value={cargoDe(data)} style={S.input}
            onChange={e => onChange({ cargo: e.target.value, tipo: e.target.value })}>
            {TIPOS_CARGO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {/* Função (exibida na escala) */}
        <div style={S.formGroup}>
          <label style={S.label}>Função na Escala <span style={{ color: '#1976d2' }}>(exibida no grid)</span></label>
          <input type="text" list="funcoes-list" value={funcaoDe(data)} style={S.input}
            placeholder="Ex: Garçom, Pizzaiolo, Caixa..."
            onChange={e => onChange({ funcao: e.target.value })} />
          <datalist id="funcoes-list">
            {funcoes.map(f => <option key={f.id} value={f.nome} />)}
            {FUNCOES_ESCALA_PADRAO.map(f => <option key={f.nome} value={f.nome} />)}
          </datalist>
          <small style={{ color: '#888', fontSize: '11px' }}>Pode ser diferente do cargo. Personalizada por colaborador.</small>
        </div>
        {/* Área */}
        <div style={S.formGroup}>
          <label style={S.label}>Área de Trabalho</label>
          <input type="text" list="areas-list" value={areaDe(data)} style={S.input}
            placeholder="Ex: Salão, Cozinha, Operações..."
            onChange={e => onChange({ area: e.target.value })} />
          <datalist id="areas-list">
            {AREAS_PADRAO.map(a => <option key={a} value={a} />)}
          </datalist>
        </div>
        {/* Financeiro */}
        <div style={S.formGroup}>
          <label style={S.label}>Data de Admissão</label>
          <input type="date" value={data.dataAdmissao || ''} style={S.input}
            onChange={e => onChange({ dataAdmissao: e.target.value })} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Salário (R$)</label>
          <input type="number" step="0.01" value={data.salario || 0} style={S.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ salario: parseFloat(e.target.value) || 0 })} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Valor Dia (R$)</label>
          <input type="number" step="0.01" value={data.valorDia || 0} style={S.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ valorDia: parseFloat(e.target.value) || 0 })} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Valor Noite (R$)</label>
          <input type="number" step="0.01" value={data.valorNoite || 0} style={S.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ valorNoite: parseFloat(e.target.value) || 0 })} />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Transporte Ida+Volta (R$)</label>
          <input type="number" step="0.01" value={data.valorTransporte || 0} style={S.input}
            onFocus={e => e.target.select()}
            onChange={e => onChange({ valorTransporte: parseFloat(e.target.value) || 0 })} />
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

        {/* ABAS */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '0', borderBottom: '2px solid #ddd', flexWrap: 'wrap' }}>
          {([
            { key: 'lista',       label: `📋 Colaboradores (${colaboradores.length})` },
            { key: 'novo',        label: '➕ Novo Colaborador' },
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
              <input type="text" placeholder="🔍 Buscar por nome, CPF ou celular..."
                value={busca} onChange={e => setBusca(e.target.value)} style={S.inputBusca} />
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={S.select}>
                <option value="">Todos os cargos</option>
                {TIPOS_CARGO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={S.select}>
                <option value="">Todas as áreas</option>
                {areasUnicas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={filtroAtivo ? 'ativo' : 'inativo'}
                onChange={e => setFiltroAtivo(e.target.value === 'ativo')} style={S.select}>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
              </select>
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '30px' }}>Carregando colaboradores...</p>
            ) : colaboradoresFiltrados.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '30px' }}>Nenhum colaborador encontrado.</p>
            ) : (
              <div style={S.gridContainer}>
                {colaboradoresFiltrados.map(colab => (
                  <div key={colab.id} style={S.card}>
                    <div style={S.cardHeader}>
                      <h3 style={{ margin: 0, fontSize: '15px' }}>{colab.nome}</h3>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <span style={{ ...S.badge, backgroundColor: colab.tipoContrato === 'CLT' ? '#28a745' : '#fd7e14' }}>
                          {colab.tipoContrato}
                        </span>
                        {colab.area && (
                          <span style={{ ...S.badge, backgroundColor: '#1565c0', fontSize: '10px' }}>
                            {colab.area}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={S.cardBody}>
                      <div style={S.cardRow}>
                        <span style={S.cardLabel}>Cargo:</span>
                        <span style={{ fontSize: '12px' }}>{cargoDe(colab)}</span>
                      </div>
                      {colab.funcao && colab.funcao !== cargoDe(colab) && (
                        <div style={S.cardRow}>
                          <span style={S.cardLabel}>Função:</span>
                          <span style={{ fontSize: '12px', color: '#1976d2', fontWeight: 'bold' }}>{colab.funcao}</span>
                        </div>
                      )}
                      <div style={S.cardRow}>
                        <span style={S.cardLabel}>CPF:</span>
                        <span>{colab.cpf || '—'}</span>
                      </div>
                      <div style={S.cardRow}>
                        <span style={S.cardLabel}>Celular:</span>
                        <span>{celularDe(colab) || '—'}</span>
                      </div>
                      {colab.chavePix && (
                        <div style={S.cardRow}>
                          <span style={S.cardLabel}>PIX:</span>
                          <span style={{ color: '#666', fontSize: '12px' }}>{colab.chavePix}</span>
                        </div>
                      )}
                      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '8px', paddingTop: '8px' }}>
                        <div style={S.cardRow}>
                          <span style={S.cardLabel}>Dia:</span>
                          <span style={{ fontWeight: 'bold', color: '#1976d2' }}>{fmt(colab.valorDia)}</span>
                          <span style={{ ...S.cardLabel, marginLeft: '12px' }}>Noite:</span>
                          <span style={{ fontWeight: 'bold', color: '#7b1fa2' }}>{fmt(colab.valorNoite)}</span>
                        </div>
                      </div>
                    </div>
                    <div style={S.cardActions}>
                      <button onClick={() => setColaboradorEditando(colab)} style={S.botaoEditar}>✏️ Editar</button>
                      <button onClick={() => handleDeletarColaborador(colab.id)} style={S.botaoDeletar}>🗑️</button>
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
            <h2 style={{ marginTop: 0 }}>Novo Colaborador</h2>
            <CamposBasicos    data={novoColab} onChange={p => setNovoColab(prev => ({ ...prev, ...p }))} />
            <CamposEndereco   data={novoColab} onChange={p => setNovoColab(prev => ({ ...prev, ...p }))} />
            <CamposContratacao data={novoColab} onChange={p => setNovoColab(prev => ({ ...prev, ...p }))} />
            <CamposJornada    data={novoColab} onChange={p => setNovoColab(prev => ({ ...prev, ...p }))} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button onClick={() => setAba('lista')} style={S.botaoCancelar}>Cancelar</button>
              <button onClick={handleCriarColaborador} disabled={salvando} style={S.botaoSalvar}>
                {salvando ? '⏳...' : '💾 Salvar Colaborador'}
              </button>
            </div>
          </div>
        )}

        {/* ── ABA FREELANCERS ───────────────────────────────────── */}
        {aba === 'freelancers' && (
          <div style={S.tabContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>🎯 Freelancers Cadastrados</h3>
              <button onClick={() => { setFormFree(FREELANCER_INICIAL); setFreelancerEditando(null); }}
                style={S.btnPrimary}>➕ Novo Freelancer</button>
            </div>

            {freelancers.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                      {['Nome', 'Função', 'Área', 'PIX', 'Telefone', 'R$/Dobra', 'Status', ''].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {freelancers.map((f, i) => (
                      <tr key={f.id} style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{f.nome}</td>
                        <td style={{ padding: '8px 10px', color: '#1976d2' }}>{f.funcao || f.cargo || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#555', fontSize: '12px' }}>{(f as any).area || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: '12px' }}>{f.chavePix || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: '12px' }}>{f.telefone || '—'}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#2e7d32' }}>R$ {(f.valorDobra || 0).toFixed(2)}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                            backgroundColor: f.ativo ? '#e8f5e9' : '#fce4ec',
                            color: f.ativo ? '#2e7d32' : '#c62828' }}>
                            {f.ativo ? '● Ativo' : '○ Inativo'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => { setFormFree({ ...f }); setFreelancerEditando(f.id); }}
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

            {/* Formulário */}
            <div style={{ backgroundColor: '#f9f9f9', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', borderTop: '3px solid #1976d2' }}>
              <h4 style={{ marginTop: 0, color: '#1976d2' }}>
                {freelancerEditando ? '✏️ Editar' : '➕ Cadastrar'} Freelancer
              </h4>
              <form onSubmit={handleSalvarFreelancer}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={S.formGroup}>
                    <label style={S.label}>Nome *</label>
                    <input type="text" value={formFree.nome || ''} style={S.input} required
                      onChange={e => setFormFree({ ...formFree, nome: e.target.value })} />
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Função <span style={{ color: '#1976d2' }}>(escala)</span></label>
                    <input type="text" list="funcoes-free-list" value={formFree.funcao || formFree.cargo || ''} style={S.input}
                      placeholder="Ex: Garçom, Bartender..."
                      onChange={e => setFormFree({ ...formFree, funcao: e.target.value, cargo: e.target.value })} />
                    <datalist id="funcoes-free-list">
                      {funcoes.map(f => <option key={f.id} value={f.nome} />)}
                    </datalist>
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Área</label>
                    <input type="text" list="areas-free-list" value={(formFree as any).area || ''} style={S.input}
                      onChange={e => setFormFree({ ...formFree, area: e.target.value } as any)} />
                    <datalist id="areas-free-list">
                      {AREAS_PADRAO.map(a => <option key={a} value={a} />)}
                    </datalist>
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
                    <label style={S.label}>Valor por Dobra (R$)</label>
                    <input type="number" step="10" min="0" value={formFree.valorDobra ?? 120} style={S.input}
                      onChange={e => setFormFree({ ...formFree, valorDobra: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Status</label>
                    <select value={formFree.ativo ? 'true' : 'false'} style={S.input}
                      onChange={e => setFormFree({ ...formFree, ativo: e.target.value === 'true' })}>
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
                  <button type="submit" disabled={salvando} style={S.botaoSalvar}>
                    {salvando ? '⏳...' : (freelancerEditando ? '💾 Salvar' : '✅ Cadastrar')}
                  </button>
                  {freelancerEditando && (
                    <button type="button" onClick={() => { setFormFree(FREELANCER_INICIAL); setFreelancerEditando(null); }}
                      style={S.botaoCancelar}>✕ Cancelar</button>
                  )}
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
                  {salvando ? '⏳...' : '📥 Importar Padrões'}
                </button>
                <button onClick={() => { setFormFuncao({ nome: '', area: 'Salão', cor: '#1976d2', diasTrabalho: [2,3,4,5,6], turnoNoite: [] }); setFuncaoEditando(null); }}
                  style={S.btnPrimary}>➕ Nova Função</button>
              </div>
            </div>

            <p style={{ color: '#666', fontSize: '13px', margin: '0 0 16px 0', lineHeight: 1.6 }}>
              Define <strong>dias de trabalho</strong> e <strong>turnos padrão</strong> para cada função.
              A geração automática de escalas usa essas regras. Cada colaborador pode ter uma função personalizada
              diferente do cargo cadastrado.
            </p>

            {/* Tabela de funções */}
            {funcoes.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Função</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Área</th>
                      {DIAS_SEMANA_FULL.map(d => (
                        <th key={d} style={{ padding: '8px 6px', textAlign: 'center', minWidth: '64px' }}>{d.slice(0, 3)}</th>
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
                            '': { bg: '#f5f5f5', color: '#bbb', label: '🏖' },
                            Dia: { bg: '#fff9c4', color: '#f57f17', label: '☀️' },
                            DiaNoite: { bg: '#e8f5e9', color: '#2e7d32', label: '2x' },
                          };
                          const b = colors[turno] || colors[''];
                          return (
                            <td key={dow} style={{ padding: '6px', textAlign: 'center' }}>
                              <span style={{ backgroundColor: b.bg, color: b.color, padding: '2px 6px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>
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
                  Nenhuma função cadastrada. Clique em <strong>"Importar Padrões"</strong> para importar as funções padrão, ou cadastre manualmente.
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
                    <input type="text" list="areas-funcao-list" value={formFuncao.area || ''} style={S.input}
                      onChange={e => setFormFuncao({ ...formFuncao, area: e.target.value })} />
                    <datalist id="areas-funcao-list">
                      {AREAS_PADRAO.map(a => <option key={a} value={a} />)}
                    </datalist>
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
                  <label style={S.label}>Dias com turno noite / dobra:</label>
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

            {/* Info de uso */}
            <div style={{ marginTop: '20px', padding: '14px', backgroundColor: '#e3f2fd', borderRadius: '8px', borderLeft: '4px solid #1976d2' }}>
              <strong style={{ color: '#1565c0' }}>ℹ️ Como funciona:</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '13px', lineHeight: 1.8, color: '#444' }}>
                <li>Cada função define os <strong>dias padrão de trabalho</strong> e se faz <strong>turno noite</strong> (dobra).</li>
                <li>No cadastro do colaborador, atribua uma <strong>Função na Escala</strong> — pode ser diferente do cargo.</li>
                <li>A <strong>geração automática de escala</strong> usa essas regras para criar os turnos do mês.</li>
                <li>Freelancers podem ter qualquer função — útil para cargos de <strong>final de semana apenas</strong>.</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL EDIÇÃO ── */}
      {colaboradorEditando && (
        <div style={S.modal}>
          <div style={S.modalContent}>
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
            <div style={{ marginTop: '12px', marginBottom: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={colaboradorEditando.ativo}
                  onChange={e => setColaboradorEditando({ ...colaboradorEditando, ativo: e.target.checked })} />
                <span style={S.label}>Colaborador ativo</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={() => setColaboradorEditando(null)} style={S.botaoCancelar}>Cancelar</button>
              <button onClick={handleEditarColaborador} disabled={salvando} style={S.botaoSalvar}>
                {salvando ? '⏳...' : '💾 Salvar Alterações'}
              </button>
              <button onClick={() => {
                if (window.confirm('Deletar este colaborador?')) {
                  handleDeletarColaborador(colaboradorEditando.id);
                  setColaboradorEditando(null);
                }
              }} style={{ ...S.botaoCancelar, backgroundColor: '#dc3545', color: 'white', flex: 0.4 }}>
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
  filtrosContainer:   { display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' },
  inputBusca:         { flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '220px' },
  select:             { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: 'white', cursor: 'pointer' },
  gridContainer:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  card:               { border: '1px solid #ddd', borderRadius: '8px', padding: '14px', backgroundColor: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' },
  cardHeader:         { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '8px', gap: '8px' },
  cardBody:           { marginBottom: '10px', fontSize: '13px' },
  cardRow:            { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' },
  cardLabel:          { color: '#888', fontWeight: 600, fontSize: '12px', minWidth: '52px' },
  cardActions:        { display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid #eee' },
  badge:              { padding: '3px 8px', borderRadius: '4px', color: 'white', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' },
  botaoEditar:        { flex: 1, padding: '7px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
  botaoDeletar:       { padding: '7px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
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
  modalContent:       { backgroundColor: 'white', padding: '24px', borderRadius: '8px', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', width: '96%', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' },
};

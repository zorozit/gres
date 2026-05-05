import React, { useState, useEffect, useMemo } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import {
  HistoricoColaborador,
  HistoricoPagamentos,
  HistoricoEscalas,
  HistoricoSaidas,
  HistoricoMotoboy,
  type AbaModal,
} from '../components/HistoricoColaborador';

/* ─── Interfaces ──────────────────────────────────────────────────────────── */
interface AcordoTurno {
  seg?: { D?: number; N?: number; DN?: number };
  ter?: { D?: number; N?: number; DN?: number };
  qua?: { D?: number; N?: number; DN?: number };
  qui?: { D?: number; N?: number; DN?: number };
  sex?: { D?: number; N?: number; DN?: number };
  sab?: { D?: number; N?: number; DN?: number };
  dom?: { D?: number; N?: number; DN?: number };
}

interface Acordo {
  // motoboy
  chegadaDia?: number;
  chegadaNoite?: number;
  valorEntrega?: number;
  // valor_turno
  tabela?: AcordoTurno;
  // valor_dia_noite
  valorDia?: number;
  valorNoite?: number;
}

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
  cargo: string;           // cargo administrativo
  tipo: string;            // retrocompat
  funcao: string;          // função exibida na escala
  area: string;
  valorDia: number;
  valorNoite: number;
  valorTransporte: number;
  valeAlimentacao: boolean;
  salario: number;
  chavePix: string;
  dataAdmissao: string;
  dataDemissao?: string;
  diasDisponiveis: string[];
  podeTrabalharDia: boolean;
  podeTrabalharNoite: boolean;
  dataCadastro: string;
  ativo: boolean;
  // Horário de trabalho (CLT)
  horarioEntrada?: string;
  horarioSaida?: string;
  // Periculosidade (CLT motoboy ou cargos com risco)
  periculosidade?: number;
  // Novos campos para tipos de acordo freelancer
  isMotoboy?: boolean;
  tipoAcordo?: 'motoboy' | 'valor_turno' | 'valor_dia_noite';
  acordo?: Acordo;
}

interface FuncaoEscala {
  id: string;
  nome: string;
  area: string;
  cor: string;
  diasTrabalho: number[];
  turnoNoite: number[];
  unitId: string;
}

/* ─── Constantes ──────────────────────────────────────────────────────────── */
const TIPOS_CARGO = [
  'Administrador', 'Caixa', 'Garçom', 'Garçonete', 'Ajudante de Cozinha', 'Cozinheiro',
  'Pizzaiolo', 'Ajudante de Pizzaiolo', 'Bartender', 'Gerente', 'Supervisor',
  'Entregador', 'Motoboy', 'Porteiro', 'Segurança', 'Limpeza', 'Outro',
];

const AREAS_PADRAO = ['Salão', 'Cozinha', 'Operações', 'Gerência', 'Bar', 'Pizzaria', 'Caixa', 'Delivery', 'Outro'];

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
  { nome: 'Bartender FDS',      area: 'Bar',        cor: '#c2185b', diasTrabalho: [5,6,0],        turnoNoite: [5,6,0] },
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
  periculosidade: 0,
  horarioEntrada: '',
  horarioSaida: '',
  diasDisponiveis: ['segunda','terça','quarta','quinta','sexta'],
  podeTrabalharDia: true,
  podeTrabalharNoite: false,
  ativo: true,
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

const numParaBR = (v: number | undefined): string => {
  if (v === undefined || v === null || isNaN(v as number)) return '';
  if (v === 0) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
};

const brParaNum = (s: string): number => {
  if (!s || s.trim() === '') return 0;
  const limpo = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
};

const dataISOParaPt = (iso: string): string => {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return '';
};

const formatarData = (v: string): string => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

const dataPtParaISO = (pt: string): string => {
  const m = pt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}`);
  if (isNaN(d.getTime())) return '';
  return `${yyyy}-${mm}-${dd}`;
};

/* ─── Sub-form prop types ─────────────────────────────────────────────────── */
interface CamposBasicosProps {
  data: Partial<Colaborador>;
  onChange: (p: Partial<Colaborador>) => void;
}
interface CamposEnderecoProps {
  data: Partial<Colaborador>;
  onChange: (p: Partial<Colaborador>) => void;
}
interface CamposContratacaoProps {
  data: Partial<Colaborador>;
  onChange: (p: Partial<Colaborador>) => void;
  funcoesOpcoes: string[];
  funcoes: FuncaoEscala[];
}
interface CamposJornadaProps {
  data: Partial<Colaborador>;
  onChange: (p: Partial<Colaborador>) => void;
}

/* ─── Sub-forms (fora do componente pai para evitar perda de foco) ─────────── */
const CamposBasicos = ({ data, onChange }: CamposBasicosProps) => (
  <div style={styles.secao}>
    <h3 style={styles.secaoTitulo}>📋 Identificação</h3>
    <div style={styles.grid2Col}>
      <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
        <label style={styles.label}>Nome completo *</label>
        <input type="text" value={data.nome || ''} style={styles.input}
          onChange={e => onChange({ nome: e.target.value })} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>CPF</label>
        <input type="text" inputMode="numeric" placeholder="000.000.000-00"
          value={data.cpf || ''} style={styles.input}
          onChange={e => onChange({ cpf: formatarCPF(e.target.value) })} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Celular / WhatsApp *</label>
        <input type="tel" inputMode="numeric" placeholder="(00) 00000-0000"
          value={data.celular || data.telefone || ''} style={styles.input}
          onChange={e => { const f = formatarCelular(e.target.value); onChange({ celular: f, telefone: f }); }} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Data de Nascimento</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="DD/MM/AAAA"
          value={dataISOParaPt(data.dataNascimento || '')}
          style={styles.input}
          maxLength={10}
          onChange={e => {
            const fmt2 = formatarData(e.target.value);
            const iso = dataPtParaISO(fmt2);
            onChange({ dataNascimento: iso || fmt2 });
          }}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={{ ...styles.label, color: '#999' }}>E-mail (opcional)</label>
        <input type="email" value={data.email || ''} style={{ ...styles.input, borderColor: '#ddd' }}
          onChange={e => onChange({ email: e.target.value })} />
      </div>
    </div>
  </div>
);

const CamposEndereco = ({ data, onChange }: CamposEnderecoProps) => (
  <div style={styles.secao}>
    <h3 style={styles.secaoTitulo}>🏠 Endereço</h3>
    <div style={styles.grid2Col}>
      <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
        <label style={styles.label}>Logradouro</label>
        <input type="text" value={data.endereco || ''} style={styles.input}
          onChange={e => onChange({ endereco: e.target.value })} />
      </div>
      {[
        { label: 'Número', key: 'numero' }, { label: 'Complemento', key: 'complemento' },
        { label: 'Cidade', key: 'cidade' }, { label: 'Estado', key: 'estado' }, { label: 'CEP', key: 'cep' },
      ].map(({ label, key }) => (
        <div key={key} style={styles.formGroup}>
          <label style={styles.label}>{label}</label>
          <input type="text" value={(data as any)[key] || ''} style={styles.input}
            onChange={e => onChange({ [key]: e.target.value })} />
        </div>
      ))}
    </div>
  </div>
);

/* ─── Formulário dinâmico por tipo de acordo (Freelancer) ────────────────── */
const DIAS_ACORDO = [
  { key: 'seg', label: 'Seg' }, { key: 'ter', label: 'Ter' }, { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' }, { key: 'sex', label: 'Sex' }, { key: 'sab', label: 'Sáb' }, { key: 'dom', label: 'Dom' },
];

const buildAcordoCompatFields = (tipoAcordo: string, acordo: any) => {
  if (tipoAcordo === 'motoboy') {
    return { valorDia: acordo?.chegadaDia || 0, valorNoite: acordo?.chegadaNoite || 0, isMotoboy: true };
  }
  if (tipoAcordo === 'valor_turno') {
    const tab = acordo?.tabela || {};
    const dias = Object.values(tab) as any[];
    const dsArr = dias.map((d: any) => d?.D || 0).filter(Boolean);
    const nsArr = dias.map((d: any) => d?.N || 0).filter(Boolean);
    const avgD = dsArr.length ? Math.round(dsArr.reduce((a: number, b: number) => a + b, 0) / dsArr.length) : 0;
    const avgN = nsArr.length ? Math.round(nsArr.reduce((a: number, b: number) => a + b, 0) / nsArr.length) : 0;
    return { valorDia: avgD, valorNoite: avgN, isMotoboy: false };
  }
  if (tipoAcordo === 'valor_dia_noite') {
    return { valorDia: acordo?.valorDia || 0, valorNoite: acordo?.valorNoite || 0, isMotoboy: false };
  }
  return {};
};

const AcordoFreelancerForm = ({ data, onChange }: { data: Partial<Colaborador>; onChange: (p: Partial<Colaborador>) => void }) => {
  const tipoAcordo = data.tipoAcordo || (data.isMotoboy ? 'motoboy' : 'valor_dia_noite');
  // Compatibilidade: colaboradores antigos sem campo `acordo` — usar campos raiz como fallback
  const acordo: Acordo = data.acordo || {
    valorDia:      data.valorDia      || 0,
    valorNoite:    data.valorNoite    || 0,
    chegadaDia:    (data as any).valorChegadaDia   || data.valorDia    || 0,
    chegadaNoite:  (data as any).valorChegadaNoite || data.valorNoite  || 0,
    valorEntrega:  (data as any).valorEntrega       || 0,
    tabela:        undefined,
  };

  const setAcordo = (patch: any) => {
    const novoAcordo = { ...acordo, ...patch };
    const compat = buildAcordoCompatFields(tipoAcordo, novoAcordo);
    onChange({ acordo: novoAcordo, ...compat });
  };

  const setTipo = (tipo: string) => {
    // Preserva valores existentes ao mudar tipo
    const vDia   = acordo.valorDia   || data.valorDia   || 0;
    const vNoite = acordo.valorNoite || data.valorNoite || 0;
    const novoAcordo = tipo === 'motoboy'
      ? { chegadaDia: acordo.chegadaDia || vDia, chegadaNoite: acordo.chegadaNoite || vNoite, valorEntrega: acordo.valorEntrega || 0 }
      : tipo === 'valor_turno'
      ? { tabela: acordo.tabela || {} }
      : { valorDia: vDia, valorNoite: vNoite };
    const compat = buildAcordoCompatFields(tipo, novoAcordo);
    onChange({ tipoAcordo: tipo as any, acordo: novoAcordo, isMotoboy: tipo === 'motoboy', ...compat });
  };

  const inputSt: React.CSSProperties = { border: '1px solid #ccc', borderRadius: '4px', padding: '6px 8px', fontSize: '13px', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ gridColumn: '1 / -1', background: '#fff8e1', borderRadius: '8px', padding: '16px', border: '1px solid #ffe082', marginBottom: '8px' }}>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontWeight: 600, fontSize: '13px', color: '#e65100', display: 'block', marginBottom: '6px' }}>⚖️ Tipo de Acordo</label>
        <select value={tipoAcordo} style={{ ...inputSt, background: '#fff' }}
          onChange={e => setTipo(e.target.value)}>
          <option value="valor_dia_noite">⏰ Valor Dia/Noite Fixo</option>
          <option value="valor_turno">📅 Valor por Turno/Dia da Semana</option>
          <option value="motoboy">🏍️ Motoboy (chegada + entregas)</option>
        </select>
      </div>

      {tipoAcordo === 'motoboy' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Chegada Dia (R$)</label>
            <input type="text" inputMode="decimal" placeholder="0,00"
              defaultValue={numParaBR(acordo.chegadaDia || 0)} style={inputSt}
              onFocus={e => e.target.select()}
              onBlur={e => setAcordo({ chegadaDia: brParaNum(e.target.value) })} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Chegada Noite (R$)</label>
            <input type="text" inputMode="decimal" placeholder="0,00"
              defaultValue={numParaBR(acordo.chegadaNoite || 0)} style={inputSt}
              onFocus={e => e.target.select()}
              onBlur={e => setAcordo({ chegadaNoite: brParaNum(e.target.value) })} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Valor por Entrega (R$)</label>
            <input type="text" inputMode="decimal" placeholder="0,00"
              defaultValue={numParaBR(acordo.valorEntrega || 0)} style={inputSt}
              onFocus={e => e.target.select()}
              onBlur={e => setAcordo({ valorEntrega: brParaNum(e.target.value) })} />
          </div>
        </div>
      )}

      {tipoAcordo === 'valor_dia_noite' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Valor Turno Dia (R$)</label>
            <input type="text" inputMode="decimal" placeholder="0,00"
              defaultValue={numParaBR(acordo.valorDia || 0)} style={inputSt}
              onFocus={e => e.target.select()}
              onBlur={e => setAcordo({ valorDia: brParaNum(e.target.value) })} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>Valor Turno Noite (R$)</label>
            <input type="text" inputMode="decimal" placeholder="0,00"
              defaultValue={numParaBR(acordo.valorNoite || 0)} style={inputSt}
              onFocus={e => e.target.select()}
              onBlur={e => setAcordo({ valorNoite: brParaNum(e.target.value) })} />
          </div>
        </div>
      )}

      {tipoAcordo === 'valor_turno' && (
        <div>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 8px' }}>Preencha os valores por turno para cada dia da semana (deixe 0 para dias não trabalhados).</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: '#666', fontWeight: 600, borderBottom: '2px solid #ffe082' }}>Dia</th>
                  {['D (Dia)', 'N (Noite)', 'DN (Dia+Noite)'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'center', color: '#666', fontWeight: 600, borderBottom: '2px solid #ffe082', minWidth: '90px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIAS_ACORDO.map(({ key, label }) => {
                  const tab = (acordo.tabela || {}) as any;
                  const vals = tab[key] || {};
                  return (
                    <tr key={key} style={{ borderBottom: '1px solid #fff3cd' }}>
                      <td style={{ padding: '4px 8px', fontWeight: 600, color: '#555' }}>{label}</td>
                      {(['D', 'N', 'DN'] as const).map(turno => (
                        <td key={turno} style={{ padding: '4px 6px' }}>
                          <input type="text" inputMode="decimal" placeholder="0"
                            defaultValue={vals[turno] || ''} style={{ ...inputSt, textAlign: 'center', padding: '4px 6px' }}
                            onFocus={e => e.target.select()}
                            onBlur={e => {
                              const v = brParaNum(e.target.value);
                              const novaTab = { ...(acordo.tabela || {}), [key]: { ...vals, [turno]: v } };
                              setAcordo({ tabela: novaTab });
                            }} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const CamposContratacao = ({ data, onChange, funcoesOpcoes, funcoes }: CamposContratacaoProps) => {
  const isFreelancer = data.tipoContrato === 'Freelancer';
  return (
    <div style={styles.secao}>
      <h3 style={styles.secaoTitulo}>💼 Contratação</h3>
      <div style={styles.grid2Col}>
        {/* Tipo de contrato */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Tipo de Contrato *</label>
          <select value={data.tipoContrato || 'CLT'} style={styles.input}
            onChange={e => onChange({ tipoContrato: e.target.value as 'CLT' | 'Freelancer' })}>
            <option value="CLT">CLT</option>
            <option value="Freelancer">Freelancer</option>
          </select>
        </div>
        {/* Cargo (admin only) — hide for freelancer */}
        {!isFreelancer && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Cargo <span style={{ color:'#888', fontWeight:'normal', fontSize:'11px' }}>(administrativo)</span></label>
            <select value={data.cargo || data.tipo || 'Outro'} style={styles.input}
              onChange={e => onChange({ cargo: e.target.value, tipo: e.target.value })}>
              {TIPOS_CARGO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        {/* Função na escala */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Função na Escala <span style={{ color:'#1976d2', fontSize:'11px' }}>(exibida no grid)</span></label>
          <select value={data.funcao || ''} style={styles.input}
            onChange={e => onChange({ funcao: e.target.value })}>
            <option value="">— Selecione a função —</option>
            {funcoesOpcoes.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        {/* Área */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Área de Trabalho <span style={{ color:'#1976d2', fontSize:'11px' }}>(agrupamento)</span></label>
          <select value={data.area || ''} style={styles.input}
            onChange={e => onChange({ area: e.target.value })}>
            <option value="">— Selecione a área —</option>
            {AREAS_PADRAO.map(a => <option key={a} value={a}>{a}</option>)}
            {funcoes.map(f => f.area).filter(a => a && !AREAS_PADRAO.includes(a))
              .filter((v,i,arr) => arr.indexOf(v) === i)
              .map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {/* Datas */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Data de Admissão</label>
          <input
            type="text" inputMode="numeric" placeholder="DD/MM/AAAA"
            value={dataISOParaPt(data.dataAdmissao || '')} style={styles.input} maxLength={10}
            onChange={e => {
              const fmt2 = formatarData(e.target.value);
              const iso = dataPtParaISO(fmt2);
              onChange({ dataAdmissao: iso || fmt2 });
            }}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={{ ...styles.label, color: data.ativo === false ? '#c62828' : '#444' }}>
            Data de Demissão {data.ativo === false && <span style={{ color:'#c62828' }}>● Desligado</span>}
          </label>
          <input
            type="text" inputMode="numeric" placeholder="DD/MM/AAAA"
            value={dataISOParaPt(data.dataDemissao || '')}
            style={{ ...styles.input, borderColor: data.dataDemissao ? '#c62828' : '#ccc' }}
            maxLength={10}
            onChange={e => {
              const fmt2 = formatarData(e.target.value);
              const iso = dataPtParaISO(fmt2);
              onChange({ dataDemissao: iso || fmt2 });
            }}
          />
        </div>
        {/* Status */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Status</label>
          <select value={data.ativo === false ? 'inativo' : 'ativo'} style={styles.input}
            onChange={e => onChange({ ativo: e.target.value === 'ativo' })}>
            <option value="ativo">● Ativo</option>
            <option value="inativo">○ Inativo / Desligado</option>
          </select>
        </div>
        {/* Financeiro — Salário (CLT only) */}
        {!isFreelancer && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Salário Base (R$)</label>
            <input
              type="text" inputMode="decimal" placeholder="0,00"
              defaultValue={numParaBR(data.salario)} style={styles.input}
              onFocus={e => e.target.select()}
              onBlur={e => onChange({ salario: brParaNum(e.target.value) })}
            />
          </div>
        )}
        {/* Periculosidade (CLT, opcional) */}
        {!isFreelancer && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Periculosidade (%)</label>
            <input
              type="text" inputMode="decimal" placeholder="0"
              defaultValue={String((data as any).periculosidade ?? 0)}
              style={styles.input}
              onFocus={e => e.target.select()}
              onBlur={e => onChange({ periculosidade: parseFloat(e.target.value.replace(',', '.')) || 0 } as any)}
            />
            <small style={{ color:'#888', fontSize:'11px' }}>Ex: 30 (motoboy). Aplicado sobre salário base.</small>
          </div>
        )}
        {/* Horário de trabalho (CLT) */}
        {!isFreelancer && (
          <>
            <div style={styles.formGroup}>
              <label style={styles.label}>Horário entrada</label>
              <input
                type="time"
                defaultValue={(data as any).horarioEntrada || ''}
                style={styles.input}
                onBlur={e => onChange({ horarioEntrada: e.target.value } as any)}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Horário saída</label>
              <input
                type="time"
                defaultValue={(data as any).horarioSaida || ''}
                style={styles.input}
                onBlur={e => onChange({ horarioSaida: e.target.value } as any)}
              />
            </div>
          </>
        )}
        {/* Acordo Freelancer — formulário dinâmico; key força remontagem ao trocar colaborador ou tipo de acordo */}
        {isFreelancer && (
          <AcordoFreelancerForm key={`${(data as any).id || 'novo'}-${data.tipoAcordo || 'default'}`} data={data} onChange={onChange} />
        )}
        {/* Valor Dia / Noite — só CLT (dobras) */}
        {!isFreelancer && (
          <>
            <div style={styles.formGroup}>
              <label style={styles.label}>
                Adicional Dobra-Dia (R$)
                <span style={{fontSize:'10px',color:'#888',fontWeight:'normal',display:'block'}}>Adicional sobre salário</span>
              </label>
              <input type="text" inputMode="decimal" placeholder="0,00"
                defaultValue={numParaBR(data.valorDia)} style={styles.input}
                onFocus={e => e.target.select()}
                onBlur={e => onChange({ valorDia: brParaNum(e.target.value) })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>
                Adicional Dobra-Noite (R$)
                <span style={{fontSize:'10px',color:'#888',fontWeight:'normal',display:'block'}}>Adicional sobre salário</span>
              </label>
              <input type="text" inputMode="decimal" placeholder="0,00"
                defaultValue={numParaBR(data.valorNoite)} style={styles.input}
                onFocus={e => e.target.select()}
                onBlur={e => onChange({ valorNoite: brParaNum(e.target.value) })} />
            </div>
          </>
        )}
        {/* Transporte */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Transporte Ida+Volta por dia (R$)</label>
          <input
            type="text" inputMode="decimal" placeholder="0,00"
            defaultValue={numParaBR(data.valorTransporte)} style={styles.input}
            onFocus={e => e.target.select()}
            onBlur={e => onChange({ valorTransporte: brParaNum(e.target.value) })}
          />
          <small style={{ color:'#888', fontSize:'11px' }}>Multiplicado pelos dias trabalhados</small>
        </div>
        {/* PIX */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Chave PIX</label>
          <input type="text" value={data.chavePix || ''} style={styles.input}
            onChange={e => onChange({ chavePix: e.target.value })} />
        </div>
        {/* Vale Alimentação (CLT only) */}
        {!isFreelancer && (
          <div style={{ ...styles.formGroup, justifyContent: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '22px' }}>
              <input type="checkbox" checked={data.valeAlimentacao || false}
                onChange={e => onChange({ valeAlimentacao: e.target.checked })} />
              <span style={styles.label}>Vale Alimentação</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

const CamposJornada = ({ data, onChange }: CamposJornadaProps) => (
  <div style={styles.secao}>
    <h3 style={styles.secaoTitulo}>📅 Jornada</h3>
    <div style={styles.formGroup}>
      <label style={styles.label}>Dias disponíveis:</label>
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
          <span style={styles.label}>{label}</span>
        </label>
      ))}
    </div>
  </div>
);

/* ─── Card de Colaborador (unificado para CLT e Freelancer) ─────────────── */
interface CardColaboradorProps {
  colab: Colaborador;
  onEditar: (c: Colaborador) => void;
  onDesligar: (c: Colaborador) => void;
  onReativar: (c: Colaborador) => void;
}

const CardColaborador = ({ colab, onEditar, onDesligar, onReativar }: CardColaboradorProps) => {
  const isFreelancer = colab.tipoContrato === 'Freelancer';
  const celular = colab.celular || colab.telefone || '';
  const cargo = colab.cargo || colab.tipo || '';
  return (
    <div style={{
      ...styles.card,
      opacity: colab.ativo === false ? 0.75 : 1,
      borderLeft: colab.ativo === false
        ? '4px solid #c62828'
        : isFreelancer
          ? '4px solid #e65100'
          : '4px solid #1976d2',
    }}>
      <div style={styles.cardHeader}>
        <h3 style={{ margin: 0, fontSize: '14px', flex: 1 }}>{colab.nome}</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            ...styles.badge,
            backgroundColor: isFreelancer ? '#e65100' : '#1976d2',
          }}>
            {colab.tipoContrato}
          </span>
          {isFreelancer && colab.tipoAcordo && (
            <span style={{
              ...styles.badge,
              backgroundColor: colab.tipoAcordo === 'motoboy' ? '#1565c0' : colab.tipoAcordo === 'valor_turno' ? '#e65100' : '#2e7d32',
              fontSize: '10px',
            }}>
              {colab.tipoAcordo === 'motoboy' ? '🏍️ Motoboy' : colab.tipoAcordo === 'valor_turno' ? '📅 Turno/Dia' : '⏰ Dia/Noite'}
            </span>
          )}
          {colab.area && (
            <span style={{ ...styles.badge, backgroundColor: '#546e7a', fontSize: '10px' }}>
              {colab.area}
            </span>
          )}
          {colab.ativo === false && (
            <span style={{ ...styles.badge, backgroundColor: '#c62828', fontSize: '10px' }}>
              Desligado
            </span>
          )}
        </div>
      </div>

      <div style={styles.cardBody}>
        {/* Função na escala — destaque */}
        {colab.funcao && (
          <div style={{
            backgroundColor: isFreelancer ? '#fff3e0' : '#e3f2fd',
            borderRadius: '4px', padding: '4px 8px', marginBottom: '6px', fontSize: '12px'
          }}>
            <span style={{ color: '#888', fontSize: '11px' }}>Função: </span>
            <strong style={{ color: isFreelancer ? '#e65100' : '#1565c0' }}>{colab.funcao}</strong>
          </div>
        )}

        {/* Cargo (CLT) */}
        {!isFreelancer && cargo && (
          <div style={styles.cardRow}>
            <span style={styles.cardLabel}>Cargo:</span>
            <span style={{ fontSize: '12px', color: '#666' }}>{cargo}</span>
          </div>
        )}

        {/* CPF — CLT ou freelancer se preenchido */}
        {colab.cpf && colab.cpf !== '00000000000' && (
          <div style={styles.cardRow}>
            <span style={styles.cardLabel}>CPF:</span>
            <span style={{ fontSize: '12px' }}>{colab.cpf}</span>
          </div>
        )}

        {celular && (
          <div style={styles.cardRow}>
            <span style={styles.cardLabel}>Celular:</span>
            <span style={{ fontSize: '12px' }}>{celular}</span>
          </div>
        )}

        {colab.chavePix && (
          <div style={styles.cardRow}>
            <span style={styles.cardLabel}>PIX:</span>
            <span style={{ color: '#1976d2', fontSize: '12px', wordBreak: 'break-all' }}>{colab.chavePix}</span>
          </div>
        )}

        <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '6px', paddingTop: '6px' }}>
          {/* Valores financeiros */}
          {(colab.valorDia > 0 || colab.valorNoite > 0) && (
            <div style={styles.cardRow}>
              <span style={styles.cardLabel}>{isFreelancer ? 'Dobra:' : 'Adicional:'}</span>
              {colab.valorDia > 0 && <span style={{ fontSize: '12px', color: '#1976d2' }}>D={fmt(colab.valorDia)}</span>}
              {colab.valorNoite > 0 && <span style={{ fontSize: '12px', color: '#7b1fa2', marginLeft: '6px' }}>N={fmt(colab.valorNoite)}</span>}
            </div>
          )}
          {!isFreelancer && colab.salario > 0 && (
            <div style={styles.cardRow}>
              <span style={styles.cardLabel}>Salário:</span>
              <span style={{ fontSize: '12px', color: '#2e7d32', fontWeight: 'bold' }}>{fmt(colab.salario)}</span>
            </div>
          )}
          {colab.valorTransporte > 0 && (
            <div style={styles.cardRow}>
              <span style={styles.cardLabel}>Transp:</span>
              <span style={{ fontSize: '12px', color: '#666' }}>{fmt(colab.valorTransporte)}/dia</span>
            </div>
          )}
          {colab.dataAdmissao && (
            <div style={styles.cardRow}>
              <span style={styles.cardLabel}>Admissão:</span>
              <span style={{ fontSize: '11px', color: '#888' }}>{dataISOParaPt(colab.dataAdmissao)}</span>
            </div>
          )}
          {colab.dataDemissao && (
            <div style={styles.cardRow}>
              <span style={{ ...styles.cardLabel, color: '#c62828' }}>Demissão:</span>
              <span style={{ fontSize: '11px', color: '#c62828' }}>{dataISOParaPt(colab.dataDemissao)}</span>
            </div>
          )}
        </div>
      </div>

      <div style={styles.cardActions}>
        <button onClick={() => onEditar(colab)} style={styles.botaoEditar}>✏️ Editar</button>
        {colab.ativo !== false
          ? <button onClick={() => onDesligar(colab)} style={{ ...styles.botaoDeletar, backgroundColor: '#e65100', fontSize: '11px' }}>Desligar</button>
          : <button onClick={() => onReativar(colab)} style={{ ...styles.botaoDeletar, backgroundColor: '#2e7d32', fontSize: '11px' }}>Reativar</button>
        }
      </div>
    </div>
  );
};

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function Colaboradores() {
  const { activeUnit } = useUnit();
  const { user, email: authEmail } = useAuth() as any;
  const userUnitId = (user as any)?.unitId || '';
  const unitId = activeUnit?.id || userUnitId || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  // Auditoria: campos enviados em todos os POST/PUT para que o backend possa logar quem fez a ação
  const responsavelId    = (user as any)?.id || localStorage.getItem('user_id') || '';
  const responsavelNome  = (user as any)?.nome || (user as any)?.name || (user as any)?.displayName || authEmail || 'desconhecido';
  const responsavelEmail = authEmail || (user as any)?.email || localStorage.getItem('user_email') || '';
  const auditoria = () => ({ responsavelId, responsavelNome, responsavelEmail });

  /* ── State ─────────────────────────────────────────────────── */
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [funcoes, setFuncoes]           = useState<FuncaoEscala[]>([]);
  const [loading, setLoading]           = useState(false);
  const [salvando, setSalvando]         = useState(false);
  const [msg, setMsg]                   = useState('');

  type AbaType = 'lista' | 'novo' | 'regras';
  const [aba, setAba] = useState<AbaType>('lista');

  // Colaborador editing
  const [colaboradorEditando, setColaboradorEditando] = useState<Colaborador | null>(null);
  const [abaModal, setAbaModal] = useState<AbaModal>('cadastro');
  // Reset aba ao abrir/trocar colaborador
  useEffect(() => { if (colaboradorEditando) setAbaModal('cadastro'); }, [colaboradorEditando?.id]);

  // Filters
  const [filtroContrato, setFiltroContrato] = useState<'todos' | 'CLT' | 'Freelancer'>('todos');
  const [filtroArea, setFiltroArea]         = useState('');
  const [filtroAtivo, setFiltroAtivo]       = useState(true);
  const [busca, setBusca]                   = useState('');

  // New colaborador form (unified)
  const [novoColab, setNovoColab] = useState<Partial<Colaborador>>(ESTADO_INICIAL);

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

  const funcoesOpcoes = useMemo(() => {
    const fromDB = funcoes.map(f => f.nome);
    const all = [...new Set([...fromDB, ...FUNCOES_LISTA])].sort();
    return all;
  }, [funcoes]);

  /* ── CRUD Colaborador (unificado CLT + Freelancer) ─────────── */
  const handleCriarColaborador = async () => {
    const isFreelancer = novoColab.tipoContrato === 'Freelancer';
    const celularLimpo = celularDe(novoColab).replace(/\D/g, '');
    if (!novoColab.nome?.trim()) { alert('Nome é obrigatório!'); return; }
    if (celularLimpo.length < 10) { alert('Celular inválido!'); return; }

    // CPF only required for CLT
    if (!isFreelancer) {
      const cpfLimpo = (novoColab.cpf || '').replace(/\D/g, '');
      if (cpfLimpo.length !== 11) { alert('CPF inválido — informe 11 dígitos!'); return; }
    }

    const cargo = isFreelancer
      ? (novoColab.funcao || novoColab.cargo || 'Freelancer')
      : cargoDe(novoColab);

    const payload: any = {
      ...novoColab,
      unitId,
      cargo,
      tipo: cargo,
      funcao:  novoColab.funcao  || '',
      area:    novoColab.area    || '',
      celular: novoColab.celular || '',
      telefone: novoColab.celular || '',
      // For freelancers without CPF, use placeholder
      cpf: isFreelancer && !(novoColab.cpf || '').replace(/\D/g,'').length
        ? '00000000000'
        : novoColab.cpf,
      ...auditoria(),
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
    const isFreelancer = colaboradorEditando.tipoContrato === 'Freelancer';
    const cargo = isFreelancer
      ? (colaboradorEditando.funcao || colaboradorEditando.cargo || 'Freelancer')
      : cargoDe(colaboradorEditando);
    const payload: any = {
      ...colaboradorEditando,
      cargo,
      tipo: cargo,
      funcao: colaboradorEditando.funcao || '',
      area:   colaboradorEditando.area   || '',
      telefone: colaboradorEditando.celular || colaboradorEditando.telefone || '',
      ...auditoria(),
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
        body: JSON.stringify({ ...colab, ativo: false, dataDemissao, ...auditoria(), observacaoAlteracao: `Desligamento manual em ${dataDemissao}` }),
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
        body: JSON.stringify({ ...colab, ativo: true, dataDemissao: '', ...auditoria(), observacaoAlteracao: 'Reativacao manual' }),
      });
      mostrarMsg('✅ Colaborador reativado.');
      setColaboradorEditando(null);
      carregarColaboradores();
    } catch { alert('Erro ao reativar'); }
    finally { setSalvando(false); }
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
    if (!window.confirm(`Importar ${FUNCOES_ESCALA_PADRAO.length} funções padrão?`)) return;
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
  const totalCLT = useMemo(() => colaboradores.filter(c => c.tipoContrato !== 'Freelancer').length, [colaboradores]);
  const totalFreelancer = useMemo(() => colaboradores.filter(c => c.tipoContrato === 'Freelancer').length, [colaboradores]);

  /* ── Filtros ──────────────────────────────────────────────── */
  const colaboradoresFiltrados = useMemo(() => {
    return colaboradores.filter(c => {
      const matchContrato = filtroContrato === 'todos' || c.tipoContrato === filtroContrato;
      const matchArea     = !filtroArea || (c.area || '') === filtroArea;
      const matchAtivo    = filtroAtivo ? c.ativo !== false : c.ativo === false;
      const q = busca.toLowerCase();
      const matchBusca = !busca ||
        (c.nome || '').toLowerCase().includes(q) ||
        (c.cpf  || '').replace(/\D/g,'').includes(q.replace(/\D/g,'')) ||
        celularDe(c).replace(/\D/g,'').includes(q.replace(/\D/g,'')) ||
        (c.funcao || '').toLowerCase().includes(q);
      return matchContrato && matchArea && matchAtivo && matchBusca;
    });
  }, [colaboradores, filtroContrato, filtroArea, filtroAtivo, busca]);

  const areasUnicas = useMemo(() => {
    const s = new Set(colaboradores.map(c => c.area || '').filter(Boolean));
    return Array.from(s).sort();
  }, [colaboradores]);

  /* ── Alias de estilos ─────────────────────────────────────── */
  const S = styles;

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={styles.pageWrapper}>
      <Header title="👥 Gestão de Colaboradores" showBack={true} />
      <div style={styles.container}>

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
            { key: 'lista',  label: `📋 Colaboradores (${colaboradores.length})` },
            { key: 'novo',   label: '➕ Novo Cadastro' },
            { key: 'regras', label: `📖 Funções/Regras (${funcoes.length})` },
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

        {/* ── ABA LISTA (CLT + Freelancers unificados em grid) ─── */}
        {aba === 'lista' && (
          <div style={S.tabContent}>

            {/* Resumo */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {[
                { label: 'Total', value: colaboradores.length, color: '#1565c0', bg: '#e3f2fd' },
                { label: 'CLT', value: totalCLT, color: '#1b5e20', bg: '#e8f5e9' },
                { label: 'Freelancer', value: totalFreelancer, color: '#e65100', bg: '#fff3e0' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} style={{ backgroundColor: bg, borderRadius: '8px', padding: '10px 18px', textAlign: 'center', minWidth: '80px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color }}>{value}</div>
                  <div style={{ fontSize: '11px', color, fontWeight: 'bold' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Filtros */}
            <div style={S.filtrosContainer}>
              <input type="text" placeholder="🔍 Buscar por nome, CPF, celular ou função..."
                value={busca} onChange={e => setBusca(e.target.value)} style={S.inputBusca} />

              {/* Filtro por tipo de contrato — botões pill */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {(['todos', 'CLT', 'Freelancer'] as const).map(tipo => (
                  <button key={tipo} onClick={() => setFiltroContrato(tipo)} style={{
                    padding: '8px 14px', border: 'none', borderRadius: '20px', cursor: 'pointer',
                    fontWeight: 'bold', fontSize: '12px',
                    backgroundColor: filtroContrato === tipo
                      ? (tipo === 'Freelancer' ? '#e65100' : tipo === 'CLT' ? '#1976d2' : '#37474f')
                      : '#f0f0f0',
                    color: filtroContrato === tipo ? 'white' : '#555',
                  }}>
                    {tipo === 'todos' ? 'Todos' : tipo}
                  </button>
                ))}
              </div>

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

            <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
              Exibindo <strong>{colaboradoresFiltrados.length}</strong> colaborador(es)
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '30px' }}>Carregando colaboradores...</p>
            ) : colaboradoresFiltrados.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '30px' }}>Nenhum colaborador encontrado.</p>
            ) : (
              <div style={S.gridContainer}>
                {colaboradoresFiltrados.map(colab => (
                  <CardColaborador
                    key={colab.id}
                    colab={colab}
                    onEditar={setColaboradorEditando}
                    onDesligar={handleDesligar}
                    onReativar={handleReativar}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ABA NOVO CADASTRO (formulário único) ──────────────── */}
        {aba === 'novo' && (
          <div style={{ ...S.tabContent, ...S.formularioContainer }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h2 style={{ margin: 0, color:'#1565c0' }}>➕ Novo Colaborador</h2>
              {/* Quick tipo badge */}
              <span style={{
                padding: '6px 16px', borderRadius: '20px', fontWeight: 'bold', fontSize: '13px',
                backgroundColor: novoColab.tipoContrato === 'Freelancer' ? '#fff3e0' : '#e3f2fd',
                color: novoColab.tipoContrato === 'Freelancer' ? '#e65100' : '#1565c0',
                border: `1px solid ${novoColab.tipoContrato === 'Freelancer' ? '#e65100' : '#1565c0'}`,
              }}>
                {novoColab.tipoContrato || 'CLT'}
              </span>
            </div>

            <CamposBasicos    data={novoColab} onChange={p => setNovoColab(prev => ({ ...prev, ...p }))} />
            <CamposEndereco   data={novoColab} onChange={p => setNovoColab(prev => ({ ...prev, ...p }))} />
            <CamposContratacao
              data={novoColab}
              onChange={p => setNovoColab(prev => ({ ...prev, ...p }))}
              funcoesOpcoes={funcoesOpcoes}
              funcoes={funcoes}
            />
            {/* Jornada only for CLT */}
            {novoColab.tipoContrato !== 'Freelancer' && (
              <CamposJornada data={novoColab} onChange={p => setNovoColab(prev => ({ ...prev, ...p }))} />
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button onClick={() => { setNovoColab(ESTADO_INICIAL); setAba('lista'); }} style={S.botaoCancelar}>Cancelar</button>
              <button onClick={handleCriarColaborador} disabled={salvando} style={S.botaoSalvar}>
                {salvando ? '⏳ Salvando...' : `💾 Salvar ${novoColab.tipoContrato || 'Colaborador'}`}
              </button>
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
                  Nenhuma função cadastrada. Clique em <strong>"Importar Padrões"</strong> para importar {FUNCOES_ESCALA_PADRAO.length} funções padrão, ou cadastre manualmente.
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
              <div>
                <h2 style={{ margin: 0 }}>✏️ Editar Colaborador — {colaboradorEditando.nome}</h2>
                <span style={{
                  display: 'inline-block', marginTop: '4px',
                  padding: '3px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '12px',
                  backgroundColor: colaboradorEditando.tipoContrato === 'Freelancer' ? '#fff3e0' : '#e3f2fd',
                  color: colaboradorEditando.tipoContrato === 'Freelancer' ? '#e65100' : '#1565c0',
                }}>
                  {colaboradorEditando.tipoContrato}
                </span>
              </div>
              <button onClick={() => setColaboradorEditando(null)} style={{ background:'none', border:'none', fontSize:'22px', cursor:'pointer', color:'#666' }}>✕</button>
            </div>

            {/* Tabs do modal de edição */}
            <div style={{ display:'flex', borderBottom:'2px solid #e0e0e0', marginBottom:'14px', flexWrap:'wrap', gap:'4px' }}>
              {([
                { id:'cadastro',   label:'✏️ Cadastro' },
                { id:'historico',  label:'📜 Histórico' },
                { id:'pagamentos', label:'💰 Pagamentos' },
                { id:'escalas',    label:'📅 Escalas' },
                { id:'saidas',     label:'💸 Saídas' },
                ...((colaboradorEditando.isMotoboy || (colaboradorEditando.cargo || '').toLowerCase()==='motoboy') ? [{ id:'motoboy', label:'🛥️ Motoboy' }] : []),
              ] as { id: AbaModal; label: string }[]).map(t => (
                <button key={t.id} onClick={() => setAbaModal(t.id)}
                  style={{
                    padding:'8px 14px',
                    border:'none',
                    borderBottom: abaModal === t.id ? '3px solid #1565c0' : '3px solid transparent',
                    background:'transparent',
                    cursor:'pointer',
                    fontSize:'13px',
                    fontWeight: abaModal === t.id ? 700 : 500,
                    color: abaModal === t.id ? '#1565c0' : '#666',
                    marginBottom:'-2px',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {abaModal === 'cadastro' && <>
              <CamposBasicos
                data={colaboradorEditando}
                onChange={p => setColaboradorEditando(prev => prev ? { ...prev, ...p } : prev)} />
              <CamposEndereco
                data={colaboradorEditando}
                onChange={p => setColaboradorEditando(prev => prev ? { ...prev, ...p } : prev)} />
              <CamposContratacao
                data={colaboradorEditando}
                onChange={p => setColaboradorEditando(prev => prev ? { ...prev, ...p } : prev)}
                funcoesOpcoes={funcoesOpcoes}
                funcoes={funcoes} />
              {/* Jornada only for CLT */}
              {colaboradorEditando.tipoContrato !== 'Freelancer' && (
                <CamposJornada
                  data={colaboradorEditando}
                  onChange={p => setColaboradorEditando(prev => prev ? { ...prev, ...p } : prev)} />
              )}
            </>}

            {abaModal === 'historico' && (
              <HistoricoColaborador colaboradorId={colaboradorEditando.id} apiUrl={apiUrl} token={token()} />
            )}

            {abaModal === 'pagamentos' && (
              <HistoricoPagamentos colaboradorId={colaboradorEditando.id} unitId={unitId} apiUrl={apiUrl} token={token()} />
            )}

            {abaModal === 'escalas' && (
              <HistoricoEscalas colaboradorId={colaboradorEditando.id} unitId={unitId} apiUrl={apiUrl} token={token()} />
            )}

            {abaModal === 'saidas' && (
              <HistoricoSaidas colaboradorId={colaboradorEditando.id} unitId={unitId} apiUrl={apiUrl} token={token()} />
            )}

            {abaModal === 'motoboy' && (
              <HistoricoMotoboy colaboradorId={colaboradorEditando.id} unitId={unitId} apiUrl={apiUrl} token={token()} />
            )}

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
  filtrosContainer:   { display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' },
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

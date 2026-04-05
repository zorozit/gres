import { useState, useEffect, useMemo } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface Colaborador {
  id: string;
  nome: string;
  cpf: string;
  telefone?: string;
  chavePix?: string;
  cargo?: string;
  tipoContrato?: 'CLT' | 'Freelancer';
  salario?: number;
  valorDia?: number;
  periculosidade?: number;
  unitId?: string;
  ativo?: boolean;
}

interface Motoboy extends Colaborador {
  placa?: string;
  vinculo?: 'CLT' | 'Freelancer';
  comissao?: number;
}

interface Freelancer {
  id: string;
  nome: string;
  chavePix?: string;
  telefone?: string;
  valorDobra?: number;
  cargo?: string;
  ativo: boolean;
  unitId?: string;
}

interface ControleDia {
  motoboyId: string;
  data: string;
  entDia: number;
  caixinhaDia: number;
  entNoite: number;
  caixinhaNoite: number;
  vlVariavel: number;
  pgto: number;
  variavel: number;
}

/** Escala de um colaborador/freelancer em um dia */
interface EscalaItem {
  colaboradorId: string;
  data: string;
  turno: 'Dia' | 'Noite' | 'DiaNoite' | 'Folga';
}

/** Resumo mensal para cada colaborador CLT */
interface FolhaMensal {
  colaboradorId: string;
  nome: string;
  cpf: string;
  chavePix?: string;
  cargo?: string;
  tipoContrato: string;
  vinculo?: string;
  salarioBase: number;
  periculosidade: number;
  inss: number;
  contrAssistencial: number;
  adiantamentoSalario: number;
  adiantamentoValor: number;
  diferencaSalario: number;
  variavelAte19: number;
  variavelDe20a31: number;
  totalVariavel: number;
  pgtosDia20: number;
  pgtosDia05: number;
  outrosPgtos: number;
  saldoFinal: number;
  pago: boolean;
  dataPagamento?: string;
  raw?: any;
}

/** Resumo semanal de fechamento para freelancers */
interface FechamentoSemanalFreelancer {
  semanaLabel: string;           // Ex: "01/03 – 07/03"
  dataFechamento: string;        // YYYY-MM-DD
  freelancers: {
    id: string;
    nome: string;
    chavePix?: string;
    telefone?: string;
    dobras: number;
    valorDobra: number;
    total: number;
    diasCodigo: string;          // Ex: "Ter D | Qui DN | Sex DN | Sáb D"
    pago?: boolean;
  }[];
  totalSemana: number;
  totalCombustivel: number;
  totalExtra: number;
  totalDesconto: number;
  totalLiquido: number;
  observacao?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const R = (v: any) => parseFloat(v) || 0;
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoeda = (v: number) => 'R$ ' + fmt(v);

const DIAS_SEMANA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function calcINSS(salarioBruto: number): number {
  const tabela = [
    { ate: 1518.00, aliq: 0.075 },
    { ate: 2793.88, aliq: 0.09 },
    { ate: 4190.83, aliq: 0.12 },
    { ate: 8157.41, aliq: 0.14 },
  ];
  let inss = 0;
  let base = salarioBruto;
  let anterior = 0;
  for (const faixa of tabela) {
    if (base <= 0) break;
    const faixaVal = Math.min(base, faixa.ate - anterior);
    inss += faixaVal * faixa.aliq;
    base -= faixaVal;
    anterior = faixa.ate;
    if (salarioBruto <= faixa.ate) break;
  }
  return parseFloat(inss.toFixed(2));
}

/** Calcula as semanas de fechamento de um mês (domingo = final de semana) */
function semanasFechamento(ano: number, mes: number): { inicio: Date; fim: Date }[] {
  const semanas: { inicio: Date; fim: Date }[] = [];
  const primeiro = new Date(ano, mes - 1, 1);
  const ultimo = new Date(ano, mes, 0);

  let cur = new Date(primeiro);
  while (cur <= ultimo) {
    const inicio = new Date(cur);
    // Fim = próximo domingo (ou fim do mês)
    const fim = new Date(cur);
    while (fim.getDay() !== 0 && fim < ultimo) {
      fim.setDate(fim.getDate() + 1);
    }
    semanas.push({ inicio, fim: new Date(Math.min(fim.getTime(), ultimo.getTime())) });
    cur = new Date(fim);
    cur.setDate(cur.getDate() + 1);
  }
  return semanas;
}

function fmtDataBR(d: Date) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDataISO(d: Date) {
  return d.toISOString().split('T')[0];
}

/** Conta dobras de um freelancer em um conjunto de escalas */
function contarDobras(escalas: EscalaItem[], freelancerId: string): { dobras: number; diasCodigo: string } {
  const linhas: string[] = [];
  let dobras = 0;
  const dias = escalas.filter(e => e.colaboradorId === freelancerId);
  for (const esc of dias) {
    const dow = new Date(esc.data + 'T12:00:00').getDay();
    const label = `${DIAS_SEMANA_ABREV[dow]} ${esc.turno === 'DiaNoite' ? 'DN' : esc.turno === 'Dia' ? 'D' : esc.turno === 'Noite' ? 'N' : 'F'}`;
    linhas.push(label);
    if (esc.turno === 'DiaNoite') dobras += 1;
    else if (esc.turno === 'Dia' || esc.turno === 'Noite') dobras += 0.5;
  }
  return { dobras, diasCodigo: linhas.join(' | ') };
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function FolhaPagamento() {
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const unitId = activeUnit?.id || (user as any)?.unitId || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  const hoje = new Date();
  const [mesAno, setMesAno] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [loading, setLoading] = useState(false);
  const [aba, setAba] = useState<'clt' | 'freelancers'>('clt');

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [controlesMap, setControlesMap] = useState<Record<string, ControleDia[]>>({});
  const [escalas, setEscalas] = useState<EscalaItem[]>([]);
  const [folhasDB, setFolhasDB] = useState<any[]>([]);
  const [folhasLocais, setFolhasLocais] = useState<FolhaMensal[]>([]);
  const [fechamentosFreelancer, setFechamentosFreelancer] = useState<FechamentoSemanalFreelancer[]>([]);

  const [detalheSelecionado, setDetalheSelecionado] = useState<FolhaMensal | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pago' | 'pendente'>('todos');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'CLT' | 'Freelancer'>('todos');
  const [salvando, setSalvando] = useState(false);

  // Campos editáveis do fechamento semanal (combustível, extra, desconto, obs)
  const [editFechamento, setEditFechamento] = useState<Record<string, { combustivel: string; extra: string; desconto: string; obs: string }>>({});

  useEffect(() => { if (unitId) carregarDados(); }, [unitId, mesAno]);

  const token = () => localStorage.getItem('auth_token');

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [rC, rM, rF, rFr, rE] = await Promise.all([
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${apiUrl}/motoboys?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mesAno}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
        fetch(`${apiUrl}/freelancers?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
        fetch(`${apiUrl}/escalas?unitId=${unitId}&mes=${mesAno}`, { headers: { Authorization: `Bearer ${token()}` } }).catch(() => null),
      ]);

      const dC = await rC.json();
      const colabs: Colaborador[] = (Array.isArray(dC) ? dC : []).filter((c: Colaborador) => c.ativo !== false);
      setColaboradores(colabs);

      const dM = await rM.json();
      const motos: Motoboy[] = Array.isArray(dM) ? dM.filter((m: Motoboy) => m.ativo !== false) : [];
      setMotoboys(motos);

      if (rFr?.ok) {
        const dFr = await rFr.json();
        setFreelancers(Array.isArray(dFr) ? dFr.filter((f: Freelancer) => f.ativo !== false) : []);
      }

      if (rE?.ok) {
        const dE = await rE.json();
        setEscalas(Array.isArray(dE) ? dE : []);
      }

      const ctrlMap: Record<string, ControleDia[]> = {};
      await Promise.all(motos.map(async m => {
        try {
          const r = await fetch(`${apiUrl}/controle-motoboy?motoboyId=${m.id}&mes=${mesAno}&unitId=${unitId}`, {
            headers: { Authorization: `Bearer ${token()}` },
          });
          const d = await r.json();
          if (Array.isArray(d)) ctrlMap[m.id] = d;
        } catch { ctrlMap[m.id] = []; }
      }));
      setControlesMap(ctrlMap);

      if (rF?.ok) {
        const dF = await rF.json();
        setFolhasDB(Array.isArray(dF) ? dF : []);
      } else {
        setFolhasDB([]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Recalcular folhas CLT
  useEffect(() => {
    setFolhasLocais(calcularTodasFolhas());
  }, [colaboradores, motoboys, controlesMap, folhasDB, mesAno]);

  // Recalcular fechamentos freelancer
  useEffect(() => {
    if (freelancers.length > 0) {
      calcularFechamentosFreelancer();
    }
  }, [freelancers, escalas, mesAno]);

  /* ── Cálculo CLT ─────────────────────────────────────────── */
  const calcularTodasFolhas = (): FolhaMensal[] => {
    const folhas: FolhaMensal[] = [];

    for (const c of colaboradores) {
      const isMotoboy = motoboys.some(m => m.id === c.id || m.cpf === c.cpf);
      if (isMotoboy) continue;
      const salBase = R(c.salario);
      const peri = R(c.periculosidade) / 100;
      const salBruto = salBase * (1 + peri);
      const inss = calcINSS(salBruto);
      const contrAssist = 0;
      const adiantPct = 0.40;
      const adiantValor = parseFloat((salBruto * adiantPct).toFixed(2));
      const difSal = parseFloat((salBruto - adiantValor).toFixed(2));
      const saldoFinal = difSal - inss - contrAssist;
      const salva = folhasDB.find(f => f.colaboradorId === c.id);
      folhas.push({
        colaboradorId: c.id, nome: c.nome, cpf: c.cpf, chavePix: c.chavePix, cargo: c.cargo,
        tipoContrato: c.tipoContrato || 'CLT',
        salarioBase: salBase, periculosidade: salBase * peri, inss, contrAssistencial: contrAssist,
        adiantamentoSalario: adiantPct * 100, adiantamentoValor: adiantValor,
        diferencaSalario: difSal, variavelAte19: 0, variavelDe20a31: 0, totalVariavel: 0,
        pgtosDia20: adiantValor, pgtosDia05: parseFloat(Math.max(0, saldoFinal).toFixed(2)),
        outrosPgtos: 0, saldoFinal: parseFloat(saldoFinal.toFixed(2)),
        pago: salva?.pago || false, dataPagamento: salva?.dataPagamento, raw: c,
      });
    }

    for (const m of motoboys) {
      const controle: ControleDia[] = controlesMap[m.id] || [];
      const salBase = R(m.salario);
      const peri = R(m.periculosidade ?? 30) / 100;
      const salBruto = salBase * (1 + peri);
      const periculosidadeValor = salBase * peri;
      const inss = calcINSS(salBruto);
      const contrAssist = 32.62;
      const dia19 = `${mesAno}-19`;
      let varAte19 = 0, varDe20a31 = 0;
      for (const linha of controle) {
        if (linha.data <= dia19) varAte19 += R(linha.vlVariavel);
        else varDe20a31 += R(linha.vlVariavel);
      }
      varAte19 = parseFloat(varAte19.toFixed(2));
      varDe20a31 = parseFloat(varDe20a31.toFixed(2));
      const totalVariavel = parseFloat((varAte19 + varDe20a31).toFixed(2));
      const adiantValor = parseFloat((salBruto * 0.40).toFixed(2));
      const difSal = parseFloat((salBruto * 0.60).toFixed(2));
      const descontos = inss + contrAssist;
      const saldoFinal = parseFloat((totalVariavel + salBruto - descontos).toFixed(2));
      const pgtosDia05 = parseFloat(Math.max(0, varDe20a31 + difSal - descontos).toFixed(2));
      const salva = folhasDB.find(f => f.colaboradorId === m.id);
      folhas.push({
        colaboradorId: m.id, nome: m.nome, cpf: m.cpf, chavePix: m.chavePix, cargo: m.cargo || 'Motoboy',
        tipoContrato: 'CLT', vinculo: m.vinculo,
        salarioBase: salBase, periculosidade: periculosidadeValor, inss, contrAssistencial: contrAssist,
        adiantamentoSalario: 40, adiantamentoValor: adiantValor, diferencaSalario: difSal,
        variavelAte19: varAte19, variavelDe20a31: varDe20a31, totalVariavel,
        pgtosDia20: varAte19 + adiantValor, pgtosDia05,
        outrosPgtos: 0, saldoFinal,
        pago: salva?.pago || false, dataPagamento: salva?.dataPagamento, raw: m,
      });
    }
    return folhas.sort((a, b) => a.nome.localeCompare(b.nome));
  };

  /* ── Cálculo Freelancers ─────────────────────────────────── */
  const calcularFechamentosFreelancer = () => {
    const [ano, mes] = mesAno.split('-').map(Number);
    const semanas = semanasFechamento(ano, mes);

    const fechamentos: FechamentoSemanalFreelancer[] = semanas.map(({ inicio, fim }) => {
      const isoInicio = fmtDataISO(inicio);
      const isoFim = fmtDataISO(fim);

      const frList = freelancers.map(f => {
        const escalasSemana = escalas.filter(e =>
          e.colaboradorId === f.id && e.data >= isoInicio && e.data <= isoFim
        );
        const { dobras, diasCodigo } = contarDobras(escalasSemana, f.id);
        const total = parseFloat((dobras * (f.valorDobra || 120)).toFixed(2));
        return {
          id: f.id, nome: f.nome, chavePix: f.chavePix, telefone: f.telefone,
          dobras, valorDobra: f.valorDobra || 120, total, diasCodigo,
          pago: false,
        };
      }).filter(fr => fr.dobras > 0);

      const key = isoFim;
      const ef = editFechamento[key] || {};
      const combustivel = parseFloat(ef.combustivel || '0') || 0;
      const extra = parseFloat(ef.extra || '0') || 0;
      const desconto = parseFloat(ef.desconto || '0') || 0;
      const totalSemana = frList.reduce((s, fr) => s + fr.total, 0);

      return {
        semanaLabel: `${fmtDataBR(inicio)} – ${fmtDataBR(fim)}`,
        dataFechamento: isoFim,
        freelancers: frList,
        totalSemana,
        totalCombustivel: combustivel,
        totalExtra: extra,
        totalDesconto: desconto,
        totalLiquido: totalSemana + extra - desconto,
        observacao: ef.obs,
      };
    });

    setFechamentosFreelancer(fechamentos.filter(f => f.freelancers.length > 0));
  };

  // Recalcular fechamentos quando editFechamento muda
  useEffect(() => {
    if (freelancers.length > 0 && escalas.length >= 0) calcularFechamentosFreelancer();
  }, [editFechamento, freelancers, escalas]);

  /* ── Toggle pago CLT ─────────────────────────────────────── */
  const handleTogglePago = async (folha: FolhaMensal) => {
    const novoPago = !folha.pago;
    setSalvando(true);
    try {
      const payload = {
        colaboradorId: folha.colaboradorId, mes: mesAno, unitId,
        pago: novoPago, dataPagamento: novoPago ? new Date().toISOString().split('T')[0] : null,
        saldoFinal: folha.saldoFinal,
      };
      await fetch(`${apiUrl}/folha-pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      setFolhasLocais(prev => prev.map(f =>
        f.colaboradorId === folha.colaboradorId
          ? { ...f, pago: novoPago, dataPagamento: novoPago ? new Date().toISOString().split('T')[0] : undefined }
          : f
      ));
    } catch { alert('Erro ao salvar status'); }
    finally { setSalvando(false); }
  };

  /* ── Export XLSX ─────────────────────────────────────────── */
  const exportarXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(folhasFiltradas.map(f => ({
      'Nome': f.nome, 'CPF': f.cpf, 'Cargo': f.cargo, 'Tipo': f.tipoContrato,
      'Salário Base': f.salarioBase, 'Periculosidade': f.periculosidade,
      'Variável até 19': f.variavelAte19, 'Pgto dia 20': f.pgtosDia20,
      'Diferença Sal.': f.diferencaSalario, 'Variável 20-31': f.variavelDe20a31,
      'INSS': f.inss, 'Contr. Assist.': f.contrAssistencial,
      'Pgto dia 05': f.pgtosDia05, 'Total Variável': f.totalVariavel,
      'Saldo Final': f.saldoFinal, 'Pago': f.pago ? 'Sim' : 'Não',
      'Data Pgto': f.dataPagamento || '', 'PIX': f.chavePix || '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `CLT ${mesAno}`);

    // Aba freelancers
    const wsF: any[] = [];
    for (const fech of fechamentosFreelancer) {
      for (const fr of fech.freelancers) {
        wsF.push({
          'Semana': fech.semanaLabel, 'Nome': fr.nome, 'PIX': fr.chavePix || '',
          'Dobras': fr.dobras, 'Valor/Dobra': fr.valorDobra, 'Total': fr.total,
          'Dias': fr.diasCodigo,
        });
      }
    }
    if (wsF.length > 0) {
      const wsFreel = XLSX.utils.json_to_sheet(wsF);
      XLSX.utils.book_append_sheet(wb, wsFreel, `Freelancers ${mesAno}`);
    }
    XLSX.writeFile(wb, `folha-pagamento-${mesAno}.xlsx`);
  };

  const folhasFiltradas = useMemo(() => folhasLocais.filter(f => {
    if (filtroStatus === 'pago' && !f.pago) return false;
    if (filtroStatus === 'pendente' && f.pago) return false;
    if (filtroTipo === 'CLT' && f.tipoContrato !== 'CLT') return false;
    if (filtroTipo === 'Freelancer' && f.tipoContrato !== 'Freelancer') return false;
    return true;
  }), [folhasLocais, filtroStatus, filtroTipo]);

  const totais = useMemo(() => ({
    saldo: folhasFiltradas.reduce((s, f) => s + f.saldoFinal, 0),
    variavel: folhasFiltradas.reduce((s, f) => s + f.totalVariavel, 0),
    salarios: folhasFiltradas.reduce((s, f) => s + f.salarioBase + f.periculosidade, 0),
    pgto20: folhasFiltradas.reduce((s, f) => s + f.pgtosDia20, 0),
    pgto05: folhasFiltradas.reduce((s, f) => s + f.pgtosDia05, 0),
  }), [folhasFiltradas]);

  const totalFreelancerMes = useMemo(() =>
    fechamentosFreelancer.reduce((s, f) => s + f.totalSemana, 0),
    [fechamentosFreelancer]);

  /* ── Styles ──────────────────────────────────────────────── */
  const s = {
    card: { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
    label: { fontSize: '13px', fontWeight: 'bold' as const, marginBottom: '4px', color: '#444', display: 'block' },
    input: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    select: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    btn: (bg: string) => ({ padding: '8px 16px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: 'white' }),
    tab: (a: boolean) => ({
      padding: '10px 18px', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const,
      borderRadius: '4px 4px 0 0',
      backgroundColor: a ? '#1976d2' : '#e0e0e0',
      color: a ? 'white' : '#333',
    }),
    th: { backgroundColor: '#1565c0', color: 'white', padding: '8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
    thC: { backgroundColor: '#1565c0', color: 'white', padding: '8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'center' as const },
    td: { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const },
    tdR: { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const, textAlign: 'right' as const },
    badge: (bg: string, color: string) => ({ backgroundColor: bg, color, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' as const }),
  };

  /* ── Modal detalhe CLT ───────────────────────────────────── */
  const ModalDetalhe = ({ f, onClose }: { f: FolhaMensal; onClose: () => void }) => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ ...s.card, maxWidth: '520px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>💰 Resumo Mensal — {f.nome.split(' ')[0]}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
          {f.cargo} · {f.tipoContrato} · {mesAno}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <colgroup><col style={{ width: '60%' }} /><col style={{ width: '20%' }} /><col style={{ width: '20%' }} /></colgroup>
          <thead>
            <tr style={{ backgroundColor: '#e8f5e9' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Descrição</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', color: '#2e7d32' }}>Crédito</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', color: '#c62828' }}>Débito</th>
            </tr>
          </thead>
          <tbody>
            {[
              { desc: `Variável até dia 19`, cred: f.variavelAte19, deb: 0 },
              { desc: `Adiantamento Sal. ${f.adiantamentoSalario}%`, cred: 0, deb: f.adiantamentoValor, note: 'Pgto dia 20' },
              { desc: `Pgto dia 20`, cred: f.pgtosDia20, deb: 0, italic: true },
              { desc: `Diferença de Salário (60%)`, cred: f.diferencaSalario, deb: 0 },
              { desc: `Adicional Periculosidade`, cred: f.periculosidade, deb: 0 },
              { desc: `INSS sobre Salário`, cred: 0, deb: f.inss },
              ...(f.contrAssistencial > 0 ? [{ desc: 'Contr. Assistencial', cred: 0, deb: f.contrAssistencial }] : []),
              { desc: `Variável 20 a 31`, cred: f.variavelDe20a31, deb: 0 },
              { desc: `Pgto dia 05`, cred: 0, deb: f.pgtosDia05, italic: true },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}>
                <td style={{ padding: '6px 8px', fontStyle: (row as any).italic ? 'italic' : 'normal', color: (row as any).italic ? '#c62828' : 'inherit' }}>{row.desc}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.cred > 0 ? '#2e7d32' : '#bbb' }}>
                  {row.cred > 0 ? fmtMoeda(row.cred) : '—'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.deb > 0 ? '#c62828' : '#bbb' }}>
                  {row.deb > 0 ? fmtMoeda(row.deb) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
              <td style={{ padding: '8px' }}>Saldo Final</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{fmtMoeda(f.saldoFinal)}</td>
              <td style={{ padding: '8px' }} />
            </tr>
          </tfoot>
        </table>

        {f.chavePix && (
          <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '6px', fontSize: '13px' }}>
            <strong>PIX:</strong> {f.chavePix}
            <button onClick={() => navigator.clipboard.writeText(f.chavePix!)}
              style={{ marginLeft: '8px', ...s.btn('#43a047'), padding: '4px 10px', fontSize: '11px' }}>
              📋 Copiar
            </button>
          </div>
        )}

        <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
          <button onClick={() => { handleTogglePago(f); onClose(); }} style={s.btn(f.pago ? '#e53935' : '#43a047')}>
            {f.pago ? '↩ Desfazer' : '✅ Marcar pago'}
          </button>
          <button onClick={onClose} style={s.btn('#9e9e9e')}>Fechar</button>
        </div>
      </div>
    </div>
  );

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="💰 Folha de Pagamento" showBack={true} />
      {detalheSelecionado && <ModalDetalhe f={detalheSelecionado} onClose={() => setDetalheSelecionado(null)} />}

      <div style={{ flex: 1, padding: '20px', maxWidth: '1500px', margin: '0 auto', width: '100%' }}>

        {/* Filtros globais */}
        <div style={{ ...s.card, marginBottom: '16px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={s.label}>Mês / Ano</label>
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...s.input, width: '150px' }} />
          </div>
          <button onClick={carregarDados} style={s.btn('#1976d2')}>🔄 Atualizar</button>
          <button onClick={exportarXLSX} disabled={folhasFiltradas.length === 0 && fechamentosFreelancer.length === 0} style={s.btn('#7b1fa2')}>
            📥 XLSX
          </button>
        </div>

        {/* Cards resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          {[
            { label: 'CLT', val: `${folhasLocais.length}`, cor: '#1976d2' },
            { label: 'Total Salários CLT', val: fmtMoeda(totais.salarios), cor: '#6a1b9a' },
            { label: 'Pgto dia 20', val: fmtMoeda(totais.pgto20), cor: '#fb8c00' },
            { label: 'Pgto dia 05', val: fmtMoeda(totais.pgto05), cor: '#0288d1' },
            { label: 'Freelancers (mês)', val: fmtMoeda(totalFreelancerMes), cor: '#c2185b' },
            { label: 'Total Mês', val: fmtMoeda(totais.saldo + totalFreelancerMes), cor: '#2e7d32' },
          ].map(c => (
            <div key={c.label} style={{ ...s.card, borderLeft: `4px solid ${c.cor}` }}>
              <div style={{ fontSize: '11px', color: '#666' }}>{c.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: c.cor }}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '2px solid #e0e0e0' }}>
          <button style={s.tab(aba === 'clt')} onClick={() => setAba('clt')}>🧾 Colaboradores CLT</button>
          <button style={s.tab(aba === 'freelancers')} onClick={() => setAba('freelancers')}>
            🎯 Freelancers {fechamentosFreelancer.length > 0 ? `(${fechamentosFreelancer.length} semana${fechamentosFreelancer.length > 1 ? 's' : ''})` : ''}
          </button>
        </div>

        {/* ── ABA CLT ─────────────────────────────────────────── */}
        {aba === 'clt' && (
          <>
            {/* Filtros CLT */}
            <div style={{ ...s.card, borderRadius: '0 8px 0 0', borderBottom: 'none', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', padding: '12px 16px' }}>
              <div>
                <label style={s.label}>Tipo</label>
                <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
                  <option value="todos">Todos</option><option value="CLT">CLT</option><option value="Freelancer">Freelancer</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Status</label>
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
                  <option value="todos">Todos</option><option value="pago">Pagos</option><option value="pendente">Pendentes</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999', borderRadius: '0 8px 8px 8px' }}>Carregando dados...</div>
            ) : folhasFiltradas.length === 0 ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999', borderRadius: '0 8px 8px 8px' }}>Nenhum colaborador CLT para este período.</div>
            ) : (
              <div style={{ ...s.card, overflowX: 'auto', borderRadius: '0 8px 8px 8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={s.th}>Nome</th>
                      <th style={s.th}>Cargo</th>
                      <th style={s.thC}>Tipo</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Sal. Base</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>+ Periculosidade</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#43a047' }}>Variável ≤19</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#fb8c00' }}>Pgto dia 20</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Dif. Sal.</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#43a047' }}>Variável 20–31</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#c62828' }}>INSS</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#c62828' }}>Contr. Assist.</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#0288d1' }}>Pgto dia 05</th>
                      <th style={{ ...s.th, textAlign: 'right', backgroundColor: '#0d47a1' }}>Saldo Final</th>
                      <th style={s.thC}>Status</th>
                      <th style={s.thC}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folhasFiltradas.map((f, idx) => (
                      <tr key={f.colaboradorId}
                        style={{ backgroundColor: idx % 2 === 0 ? '#fafafa' : 'white' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e8f0fe')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fafafa' : 'white')}>
                        <td style={{ ...s.td, fontWeight: 'bold' }}>{f.nome}</td>
                        <td style={{ ...s.td, fontSize: '11px', color: '#666' }}>{f.cargo}</td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          <span style={f.tipoContrato === 'CLT' ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff3e0', '#e65100')}>
                            {f.tipoContrato}
                          </span>
                        </td>
                        <td style={s.tdR}>{fmtMoeda(f.salarioBase)}</td>
                        <td style={{ ...s.tdR, color: '#e65100' }}>{f.periculosidade > 0 ? fmtMoeda(f.periculosidade) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{f.variavelAte19 > 0 ? fmtMoeda(f.variavelAte19) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#fb8c00', fontWeight: 'bold' }}>{fmtMoeda(f.pgtosDia20)}</td>
                        <td style={s.tdR}>{fmtMoeda(f.diferencaSalario)}</td>
                        <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{f.variavelDe20a31 > 0 ? fmtMoeda(f.variavelDe20a31) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#c62828' }}>{fmtMoeda(f.inss)}</td>
                        <td style={{ ...s.tdR, color: '#c62828' }}>{f.contrAssistencial > 0 ? fmtMoeda(f.contrAssistencial) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#0288d1', fontWeight: 'bold' }}>{fmtMoeda(f.pgtosDia05)}</td>
                        <td style={{ ...s.tdR, fontWeight: 'bold', color: f.saldoFinal >= 0 ? '#2e7d32' : '#c62828' }}>
                          {fmtMoeda(f.saldoFinal)}
                        </td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          <span style={f.pago ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff9c4', '#f57f17')}>
                            {f.pago ? '✅ Pago' : '⏳ Pendente'}
                          </span>
                          {f.pago && f.dataPagamento && (
                            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{f.dataPagamento}</div>
                          )}
                        </td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={() => setDetalheSelecionado(f)} style={{ ...s.btn('#1976d2'), padding: '4px 10px', fontSize: '11px' }}>
                              📋
                            </button>
                            <button onClick={() => handleTogglePago(f)} disabled={salvando}
                              style={{ ...s.btn(f.pago ? '#e53935' : '#43a047'), padding: '4px 10px', fontSize: '11px' }}>
                              {f.pago ? '↩' : '✅'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold' }}>
                      <td style={{ padding: '8px', fontSize: '13px' }} colSpan={3}>TOTAIS</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.salarioBase, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.periculosidade, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{fmtMoeda(totais.variavel - folhasFiltradas.reduce((s, f) => s + f.variavelDe20a31, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#ffcc80' }}>{fmtMoeda(totais.pgto20)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.diferencaSalario, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.variavelDe20a31, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#ef9a9a' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.inss, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#ef9a9a' }}>{fmtMoeda(folhasFiltradas.reduce((s, f) => s + f.contrAssistencial, 0))}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#b3e5fc' }}>{fmtMoeda(totais.pgto05)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#a5d6a7' }}>{fmtMoeda(totais.saldo)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span>🟠 <strong>Pgto dia 20</strong> = variável até 19 + adiantamento 40% sal.</span>
                  <span>🔵 <strong>Pgto dia 05</strong> = variável 20–31 + diferença sal. (60%) − INSS − contr. assist.</span>
                  <span>🟣 <strong>Periculosidade</strong>: CLT motoboy = 30% sobre salário base</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── ABA FREELANCERS ──────────────────────────────────── */}
        {aba === 'freelancers' && (
          <div style={{ borderRadius: '0 8px 8px 8px' }}>
            {loading ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
            ) : freelancers.length === 0 ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>
                <p>Nenhum freelancer cadastrado.</p>
                <p style={{ fontSize: '13px' }}>Cadastre freelancers na aba <strong>Escalas → Freelancers</strong>.</p>
              </div>
            ) : fechamentosFreelancer.length === 0 ? (
              <div style={{ ...s.card, textAlign: 'center', padding: '40px', color: '#999' }}>
                <p>Nenhuma escala de freelancer lançada em {mesAno}.</p>
                <p style={{ fontSize: '13px' }}>Lance as escalas na aba <strong>Escalas → Editar Turno</strong>.</p>
              </div>
            ) : (
              <>
                {/* Total do mês */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px', paddingTop: '12px' }}>
                  <div style={{ ...s.card, borderLeft: '4px solid #c2185b' }}>
                    <div style={{ fontSize: '11px', color: '#666' }}>Total Freelancers</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#c2185b' }}>{fmtMoeda(totalFreelancerMes)}</div>
                  </div>
                  <div style={{ ...s.card, borderLeft: '4px solid #1976d2' }}>
                    <div style={{ fontSize: '11px', color: '#666' }}>Semanas com escala</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1976d2' }}>{fechamentosFreelancer.length}</div>
                  </div>
                  <div style={{ ...s.card, borderLeft: '4px solid #43a047' }}>
                    <div style={{ fontSize: '11px', color: '#666' }}>Freelancers ativos</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#43a047' }}>{freelancers.length}</div>
                  </div>
                </div>

                {/* Fechamento por semana */}
                {fechamentosFreelancer.map((fech) => {
                  const key = fech.dataFechamento;
                  const ef = editFechamento[key] || { combustivel: '0', extra: '0', desconto: '0', obs: '' };
                  const updateEf = (campo: string, val: string) => setEditFechamento(prev => ({
                    ...prev, [key]: { ...ef, [campo]: val }
                  }));
                  return (
                    <div key={key} style={{ ...s.card, marginBottom: '16px', borderTop: '3px solid #c2185b' }}>
                      {/* Cabeçalho da semana */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ margin: 0, color: '#c2185b', fontSize: '15px' }}>
                          📅 Semana {fech.semanaLabel}
                        </h4>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', color: '#666' }}>Combustível:</span>
                          <input type="number" step="10" min="0" value={ef.combustivel || '0'}
                            onChange={e => updateEf('combustivel', e.target.value)}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} />
                          <span style={{ fontSize: '13px', color: '#666' }}>Extra:</span>
                          <input type="number" step="10" min="0" value={ef.extra || '0'}
                            onChange={e => updateEf('extra', e.target.value)}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} />
                          <span style={{ fontSize: '13px', color: '#666' }}>Desconto:</span>
                          <input type="number" step="10" min="0" value={ef.desconto || '0'}
                            onChange={e => updateEf('desconto', e.target.value)}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} />
                        </div>
                      </div>

                      {/* Tabela da semana */}
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr>
                              {['Freelancer', 'PIX / Tel', 'Dias (código)', 'Dobras', 'Valor/Dobra', 'Total', 'Ações'].map(h => (
                                <th key={h} style={s.th}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {fech.freelancers.map((fr, fi) => (
                              <tr key={fr.id} style={{ backgroundColor: fi % 2 === 0 ? '#fafafa' : 'white' }}>
                                <td style={{ ...s.td, fontWeight: 'bold' }}>{fr.nome}</td>
                                <td style={{ ...s.td, fontSize: '11px' }}>
                                  {fr.chavePix && <div>💳 {fr.chavePix}</div>}
                                  {fr.telefone && <div>📱 {fr.telefone}</div>}
                                </td>
                                <td style={{ ...s.td, fontSize: '11px', color: '#555', maxWidth: '200px' }}>
                                  {fr.diasCodigo || '—'}
                                </td>
                                <td style={{ ...s.td, textAlign: 'center', fontWeight: 'bold', color: '#2e7d32' }}>
                                  {fr.dobras}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right' }}>
                                  R$ {fmt(fr.valorDobra)}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', color: '#1976d2', fontSize: '13px' }}>
                                  {fmtMoeda(fr.total)}
                                </td>
                                <td style={s.td}>
                                  {fr.chavePix && (
                                    <button onClick={() => navigator.clipboard.writeText(fr.chavePix!)}
                                      style={{ ...s.btn('#43a047'), padding: '3px 8px', fontSize: '11px' }}>
                                      📋 PIX
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ backgroundColor: '#880e4f', color: 'white', fontWeight: 'bold' }}>
                              <td style={{ padding: '8px' }} colSpan={5}>SEMANA {fech.semanaLabel}</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#f48fb1' }}>
                                {fmtMoeda(fech.totalSemana)}
                              </td>
                              <td style={{ padding: '8px' }} />
                            </tr>
                            {(parseFloat(ef.combustivel || '0') > 0 || parseFloat(ef.extra || '0') > 0 || parseFloat(ef.desconto || '0') > 0) && (
                              <>
                                {parseFloat(ef.combustivel || '0') > 0 && (
                                  <tr style={{ backgroundColor: '#fff3e0' }}>
                                    <td style={{ padding: '6px 8px', fontStyle: 'italic', color: '#e65100' }} colSpan={5}>⛽ Combustível</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c62828' }}>−{fmtMoeda(parseFloat(ef.combustivel || '0'))}</td>
                                    <td />
                                  </tr>
                                )}
                                {parseFloat(ef.extra || '0') > 0 && (
                                  <tr style={{ backgroundColor: '#e8f5e9' }}>
                                    <td style={{ padding: '6px 8px', fontStyle: 'italic', color: '#2e7d32' }} colSpan={5}>➕ Extra</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#2e7d32' }}>+{fmtMoeda(parseFloat(ef.extra || '0'))}</td>
                                    <td />
                                  </tr>
                                )}
                                {parseFloat(ef.desconto || '0') > 0 && (
                                  <tr style={{ backgroundColor: '#fce4ec' }}>
                                    <td style={{ padding: '6px 8px', fontStyle: 'italic', color: '#c62828' }} colSpan={5}>➖ Desconto</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c62828' }}>−{fmtMoeda(parseFloat(ef.desconto || '0'))}</td>
                                    <td />
                                  </tr>
                                )}
                                <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                                  <td style={{ padding: '8px' }} colSpan={5}>TOTAL LÍQUIDO</td>
                                  <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>
                                    {fmtMoeda(fech.totalSemana + parseFloat(ef.extra || '0') - parseFloat(ef.combustivel || '0') - parseFloat(ef.desconto || '0'))}
                                  </td>
                                  <td />
                                </tr>
                              </>
                            )}
                          </tfoot>
                        </table>
                      </div>

                      {/* Observação */}
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>📝 Obs:</span>
                        <input type="text" placeholder="Ex: Sangria, adiantamento, pendência..." value={ef.obs || ''}
                          onChange={e => updateEf('obs', e.target.value)}
                          style={{ flex: 1, padding: '5px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px' }} />
                      </div>
                    </div>
                  );
                })}

                {/* Resumo mensal de freelancers */}
                <div style={{ ...s.card, borderTop: '3px solid #1976d2' }}>
                  <h4 style={{ marginTop: 0, color: '#1976d2' }}>📊 Consolidado do Mês</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        {['Freelancer', 'PIX', 'Total Dobras', 'Total R$'].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {freelancers.map((fr, fi) => {
                        let totalDobras = 0;
                        for (const fech of fechamentosFreelancer) {
                          const frSem = fech.freelancers.find(x => x.id === fr.id);
                          if (frSem) totalDobras += frSem.dobras;
                        }
                        const totalMes = totalDobras * (fr.valorDobra || 120);
                        if (totalDobras === 0) return null;
                        return (
                          <tr key={fr.id} style={{ backgroundColor: fi % 2 === 0 ? '#fafafa' : 'white' }}>
                            <td style={{ ...s.td, fontWeight: 'bold' }}>{fr.nome}</td>
                            <td style={{ ...s.td, fontSize: '11px' }}>{fr.chavePix || '—'}</td>
                            <td style={{ ...s.td, textAlign: 'center', fontWeight: 'bold', color: '#2e7d32' }}>{totalDobras}</td>
                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', color: '#c2185b', fontSize: '13px' }}>
                              {fmtMoeda(totalMes)}
                            </td>
                          </tr>
                        );
                      }).filter(Boolean)}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                        <td style={{ padding: '8px' }} colSpan={3}>TOTAL FREELANCERS DO MÊS</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontSize: '14px' }}>{fmtMoeda(totalFreelancerMes)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <Footer showLinks={true} />
    </div>
  );
}

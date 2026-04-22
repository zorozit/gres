import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';

/* ─── Interfaces ─────────────────────────────────────────────────────────── */

interface Motoboy {
  id: string;
  /** ID do registro em /colaboradores (pode diferir do id de /motoboys) */
  colaboradorId?: string;
  nome: string;
  cpf: string;
  telefone: string;
  placa?: string;
  dataAdmissao?: string;
  dataDemissao?: string;
  comissao?: number;
  chavePix?: string;
  unitId?: string;
  vinculo: 'CLT' | 'Freelancer';
  salario?: number;
  periculosidade?: number;
  /** Freelancer: valor fixo por dia — turno Dia */
  valorChegadaDia?: number;
  /** Freelancer: valor fixo por dia — turno Noite */
  valorChegadaNoite?: number;
  /** @deprecated use valorChegadaDia — mantido para compatibilidade */
  valorChegada?: number;
  /** Freelancer: valor pago por entrega realizada */
  valorEntrega?: number;
  ativo: boolean;
}

/** Escala / turno + presença de um colaborador em um dia */
interface EscalaMotoboy {
  id: string;
  colaboradorId: string;
  data: string;
  turno: 'Dia' | 'Noite' | 'DiaNoite' | 'Folga';
  presenca?: 'presente' | 'falta' | 'falta_justificada';
  presencaNoite?: 'presente' | 'falta' | 'falta_justificada';
}

/** Saída lançada no módulo de controle financeiro */
interface Saida {
  id: string;
  colaboradorId: string;
  favorecido?: string;
  colaborador?: string;
  valor: number;
  data: string;
  turno?: string;
  viagens?: number;
  caixinha?: number;
  tipo?: string;
  descricao?: string;
  dataPagamento?: string;
  unitId?: string;
}

/** Linha do controle diário (base de dados + dados de saídas) */
interface ControleDia {
  id?: string;
  motoboyId: string;
  data: string;
  diaSemana?: number;
  salDia: number;
  // Turno dia — populados de saídas
  entDia: number;
  caixinhaDia: number;
  chegadaDia: number;     // Freelancer: valorChegadaDia se trabalhou no turno dia
  // Turno noite — populados de saídas
  entNoite: number;
  caixinhaNoite: number;
  chegadaNoite: number;   // Freelancer: valorChegadaNoite se trabalhou no turno noite
  vlVariavel: number;
  pgto: number;
  variavel: number;
  unitId?: string;
  // Referência às saídas que geraram os valores
  saidasDia?: Saida[];
  saidasNoite?: Saida[];
}

/* ─── helpers ────────────────────────────────────────────────────────────── */

const R = (v: any) => parseFloat(v) || 0;
const fmt = (v: number) => v ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

function diasDoMes(ano: number, mes: number) {
  const dias: string[] = [];
  const d = new Date(ano, mes - 1, 1);
  while (d.getMonth() === mes - 1) {
    dias.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

function diaSemana(dataStr: string) {
  return new Date(dataStr + 'T12:00:00').getDay();
}

const DIAS_SEMANA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Normaliza turno para comparação */
function normalizeTurno(t?: string): 'dia' | 'noite' | '' {
  const s = (t || '').toLowerCase().trim();
  if (s === 'dia' || s === 'd') return 'dia';
  if (s === 'noite' || s === 'n') return 'noite';
  return '';
}

/** Retorna semanas do mês: cada semana vai de segunda a domingo */
function semanasMes(mesAno: string): { inicio: string; fim: string; label: string }[] {
  const [ano, mes] = mesAno.split('-').map(Number);
  const d1 = new Date(ano, mes - 1, 1);
  const d2 = new Date(ano, mes, 0);
  const semanas: { inicio: string; fim: string; label: string }[] = [];
  let cur = new Date(d1);
  // Avança para segunda-feira da primeira semana do mês (ou mantém se já for 2ª)
  const dow0 = cur.getDay(); // 0=Dom,1=Seg,...
  if (dow0 !== 1) {
    // Começa na segunda anterior (pode ser antes do mês)
    const diff = dow0 === 0 ? -6 : 1 - dow0;
    cur.setDate(cur.getDate() + diff);
  }
  while (cur <= d2) {
    const ini = new Date(cur);
    const fim = new Date(cur);
    fim.setDate(fim.getDate() + 6); // domingo
    // limita ao mês
    const inicioStr = ini.toISOString().split('T')[0];
    const fimStr = fim.toISOString().split('T')[0];
    semanas.push({
      inicio: inicioStr,
      fim: fimStr,
      label: `${String(ini.getDate()).padStart(2,'0')}/${String(mes).padStart(2,'0')} – ${String(Math.min(fim.getDate(), d2.getDate())).padStart(2,'0')}/${String(mes).padStart(2,'0')}`,
    });
    cur.setDate(cur.getDate() + 7);
  }
  return semanas;
}

/**
 * Preenche o controle diário de um motoboy com base nas saídas e escalas do período.
 *
 * Regras:
 * - Chegada (Ch.Dia / Ch.Noite) é aplicada quando:
 *   1. Há saídas no turno, OU
 *   2. O motoboy tem presença confirmada (presenca='presente') no turno via escalas
 * - Viagens (entDia/entNoite) vêm exclusivamente das saídas.
 * - Para Freelancers: vlVariavel = chegadaDia + chegadaNoite + (valorEntrega × viagens) + caixinha
 * - Para CLT: vlVariavel = caixinha (bônus extra sobre o salário fixo)
 */
/**
 * Modos de integração:
 *  'integrado'  – recalcula chegadaDia/Noite/vlVariavel a partir do cadastro atual + saídas + escalas.
 *                 Usado apenas quando NÃO há dados salvos no banco (primeiro carregamento do mês).
 *  'merge'      – preserva chegadaDia/Noite/vlVariavel já salvos; apenas atualiza entDia/Noite,
 *                 caixinha e pgto das saídas lançadas. Evita que mudanças no cadastro alterem
 *                 semanas pagas.
 */
function preencherControleComSaidas(
  linhasBase: ControleDia[],
  saidas: Saida[],
  motoboyId: string,
  motoboy?: Motoboy,
  escalas?: EscalaMotoboy[],
  modo: 'integrado' | 'merge' = 'integrado'
): ControleDia[] {
  const isFreelancer = motoboy?.vinculo === 'Freelancer';
  const valorEntrega    = R(motoboy?.valorEntrega);
  const vChegadaDia   = R(motoboy?.valorChegadaDia   ?? motoboy?.valorChegada);
  const vChegadaNoite = R(motoboy?.valorChegadaNoite ?? motoboy?.valorChegada);

  const colabId = motoboy?.colaboradorId;
  const idSet = new Set([motoboyId, colabId].filter(Boolean) as string[]);
  const saidasMoto = saidas.filter(s => idSet.has(s.colaboradorId));
  const escalasMoto = escalas || [];

  return linhasBase.map(linha => {
    const saidasDoDia = saidasMoto.filter(s => s.data === linha.data);
    const escalaDoDia = escalasMoto.find(e => e.data === linha.data);

    const saidasDia      = saidasDoDia.filter(s => normalizeTurno(s.turno) === 'dia');
    const saidasNoite    = saidasDoDia.filter(s => normalizeTurno(s.turno) === 'noite');
    const saidasSemTurno = saidasDoDia.filter(s => normalizeTurno(s.turno) === '');

    const entDia   = saidasDia.reduce((sum, s) => sum + R(s.viagens), 0);
    const entNoite = saidasNoite.reduce((sum, s) => sum + R(s.viagens), 0);
    const totalViagens = entDia + entNoite;

    const caixinhaDia   = saidasDia.reduce((sum, s) => sum + R(s.caixinha), 0);
    const caixinhaNoite = saidasNoite.reduce((sum, s) => sum + R(s.caixinha), 0);
    const caixinhaExtra = saidasSemTurno.reduce((sum, s) => sum + R(s.caixinha), 0);
    const totalCaixinha = caixinhaDia + caixinhaNoite + caixinhaExtra;

    const pgto = saidasDoDia
      .filter(s => R(s.valor) > 0)
      .reduce((sum, s) => sum + R(s.valor), 0);

    const hasSaidas = saidasDoDia.length > 0;

    if (modo === 'merge') {
      // Modo MERGE: preserva chegada/vlVariavel salvos; só atualiza viagens/caixinha/pgto de saídas
      // Recalcula vlVariavel a partir dos valores salvos de chegada (não do cadastro atual)
      const savedChegadaDia   = linha.chegadaDia   ?? 0;
      const savedChegadaNoite = linha.chegadaNoite ?? 0;
      const vlVariavel = hasSaidas
        ? parseFloat((savedChegadaDia + savedChegadaNoite + (valorEntrega * totalViagens) + totalCaixinha).toFixed(2))
        : linha.vlVariavel;
      return {
        ...linha,
        entDia:         hasSaidas ? entDia         : linha.entDia,
        entNoite:       hasSaidas ? entNoite       : linha.entNoite,
        caixinhaDia:    hasSaidas ? caixinhaDia    : linha.caixinhaDia,
        caixinhaNoite:  hasSaidas ? caixinhaNoite  : linha.caixinhaNoite,
        pgto:           hasSaidas ? pgto           : linha.pgto,
        vlVariavel,
        saidasDia,
        saidasNoite,
      };
    }

    // Modo INTEGRADO: calcula chegada do cadastro atual + presença de escalas
    const turnoEscala = escalaDoDia?.turno;
    const presencaConfirmadaDia   = escalaDoDia?.presenca === 'presente' &&
      (turnoEscala === 'Dia' || turnoEscala === 'DiaNoite');
    const presencaConfirmadaNoite = (escalaDoDia?.presencaNoite === 'presente' ||
      (escalaDoDia?.presenca === 'presente' && turnoEscala === 'Noite')) &&
      (turnoEscala === 'Noite' || turnoEscala === 'DiaNoite');
    const presencaConfirmada = presencaConfirmadaDia || presencaConfirmadaNoite;

    const hasData = hasSaidas || presencaConfirmada;
    const hasDia  = saidasDia.length > 0 || saidasSemTurno.length > 0 || presencaConfirmadaDia;
    const hasNoite= saidasNoite.length > 0 || presencaConfirmadaNoite;

    const chegadaDia   = isFreelancer && hasDia   && vChegadaDia   > 0 ? vChegadaDia   : 0;
    const chegadaNoite = isFreelancer && hasNoite && vChegadaNoite > 0 ? vChegadaNoite : 0;

    let vlVariavel: number;
    if (hasData) {
      if (isFreelancer) {
        vlVariavel = parseFloat((chegadaDia + chegadaNoite + (valorEntrega * totalViagens) + totalCaixinha).toFixed(2));
      } else {
        vlVariavel = totalCaixinha > 0 ? totalCaixinha : linha.vlVariavel;
      }
    } else {
      vlVariavel = linha.vlVariavel;
    }

    return {
      ...linha,
      entDia:         hasData ? entDia         : linha.entDia,
      entNoite:       hasData ? entNoite       : linha.entNoite,
      caixinhaDia:    hasData ? caixinhaDia    : linha.caixinhaDia,
      caixinhaNoite:  hasData ? caixinhaNoite  : linha.caixinhaNoite,
      chegadaDia:     hasData ? chegadaDia     : (linha.chegadaDia  ?? 0),
      chegadaNoite:   hasData ? chegadaNoite   : (linha.chegadaNoite ?? 0),
      pgto:           hasData ? pgto           : linha.pgto,
      vlVariavel,
      saidasDia,
      saidasNoite,
    };
  });
}

const emptyForm: Partial<Motoboy> = {
  nome: '', cpf: '', telefone: '', placa: '', dataAdmissao: new Date().toISOString().split('T')[0],
  comissao: 0, chavePix: '', vinculo: 'Freelancer', salario: 0, periculosidade: 30,
  valorChegadaDia: 0, valorChegadaNoite: 0, valorEntrega: 0, ativo: true,
};

/* ─── Component ─────────────────────────────────────────────────────────── */

export const Motoboys: React.FC = () => {
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || '';

  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [loading, setLoading] = useState(false);
  const [aba, setAba] = useState<'lista' | 'controle' | 'novo'>('lista');
  const [formData, setFormData] = useState<Partial<Motoboy>>({ ...emptyForm, unitId });
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [filtroVinculo, setFiltroVinculo] = useState<'Todos' | 'CLT' | 'Freelancer'>('Todos');
  const [filtroAtivo, setFiltroAtivo] = useState<'Todos' | 'Ativo' | 'Inativo'>('Ativo');
  const [busca, setBusca] = useState('');

  // Controle diário
  const hoje = new Date();
  const [ctrlMesAno, setCtrlMesAno] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [ctrlMotoboyId, setCtrlMotoboyId] = useState('');
  const [controle, setControle] = useState<ControleDia[]>([]);
  const [loadingCtrl, setLoadingCtrl] = useState(false);
  const [salvandoCtrl, setSalvandoCtrl] = useState(false);

  // Saídas carregadas para o período
  const [saidas, setSaidas] = useState<Saida[]>([]);
  const [loadingSaidas, setLoadingSaidas] = useState(false);

  // Escalas do motoboy selecionado no mês (para confirmar presença e calcular chegadas)
  const [escalasControle, setEscalasControle] = useState<EscalaMotoboy[]>([]);

  // Modo de visualização do controle — padrão sempre Manual
  const [modoVisualizacao, setModoVisualizacao] = useState<'integrado' | 'manual'>('manual');
  const [mostrarSaidas, setMostrarSaidas] = useState(false);

  // Status de pagamento semanal (folha-pagamento)
  const [pagamentosSemana, setPagamentosSemana] = useState<any[]>([]);
  const [salvandoPgtoSemana, setSalvandoPgtoSemana] = useState<string | null>(null);

  useEffect(() => { fetchMotoboys(); }, [unitId]);

  const fetchMotoboys = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      // Buscar motoboys e colaboradores em paralelo
      const [rM, rC] = await Promise.all([
        fetch(unitId ? `${apiUrl}/motoboys?unitId=${unitId}` : `${apiUrl}/motoboys`,
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`,
          { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      const dM = await rM.json();
      const motosRaw: any[] = Array.isArray(dM) ? dM : [];

      // Colaboradores — fonte de verdade para campos de pagamento (valorDia/Noite/Transporte)
      let colabsMap: Record<string, any> = {};
      if (rC?.ok) {
        const dC = await rC.json();
        const colabs: any[] = Array.isArray(dC) ? dC : [];
        for (const c of colabs) {
          if (c.cpf) colabsMap[c.cpf] = c;
          colabsMap[c.id] = c;
        }
      }

      // Mapear cada motoboy, enriquecendo com dados de colaboradores
      const motosDB: Motoboy[] = motosRaw.map((m: any) => {
        // Encontrar colaborador correspondente por CPF (mais confiável) ou ID
        const colab = (m.cpf && colabsMap[m.cpf]) || colabsMap[m.id] || m;
        return {
          id: m.id,
          colaboradorId: colab.id || m.colaboradorId || m.id,
          nome: m.nome,
          cpf: m.cpf || '',
          telefone: m.telefone || m.celular || '',
          placa: m.placa || '',
          dataAdmissao: m.dataAdmissao || colab.dataAdmissao || '',
          dataDemissao: m.dataDemissao || colab.dataDemissao || '',
          comissao: R(m.comissao) || 0,
          chavePix: m.chavePix || colab.chavePix || '',
          unitId: m.unitId || '',
          vinculo: m.vinculo === 'CLT' ? 'CLT' : 'Freelancer',
          salario: R(m.salario) || 0,
          periculosidade: R(m.periculosidade) || 0,
          // Campos de pagamento: colaboradores é a fonte de verdade
          valorChegadaDia:   R(colab.valorDia)        || R(m.valorChegadaDia)   || R(m.valorDia)   || 0,
          valorChegadaNoite: R(colab.valorNoite)      || R(m.valorChegadaNoite) || R(m.valorNoite) || 0,
          valorEntrega:      R(colab.valorTransporte) || R(m.valorEntrega)       || 0,
          ativo: m.ativo !== false,
        };
      });

      setMotoboys(motosDB);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  /* ── Buscar saídas e escalas do período ─────────────── */
  const fetchSaidas = useCallback(async (mesAno: string) => {
    if (!unitId || !mesAno) return;
    setLoadingSaidas(true);
    try {
      const token = localStorage.getItem('auth_token');
      const [ano, mes] = mesAno.split('-').map(Number);
      const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const fim = new Date(ano, mes, 0).toISOString().split('T')[0];
      // Busca saídas e escalas em paralelo para ter presença confirmada
      const [rS, rE] = await Promise.all([
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${inicio}&dataFim=${fim}`,
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/escalas?unitId=${unitId}&mes=${mesAno}`,
          { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      const dS = await rS.json();
      setSaidas(Array.isArray(dS) ? dS : []);
      if (rE?.ok) {
        const dE = await rE.json();
        setEscalasControle(Array.isArray(dE) ? dE : []);
      }
    } catch (e) { console.error(e); setSaidas([]); }
    finally { setLoadingSaidas(false); }
  }, [apiUrl, unitId]);

  /* ── Controle diário ─────────────────────────────────── */

  const fetchControle = useCallback(async () => {
    if (!ctrlMotoboyId || !ctrlMesAno) return;
    setLoadingCtrl(true);
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`${apiUrl}/controle-motoboy?motoboyId=${ctrlMotoboyId}&mes=${ctrlMesAno}&unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();

      const motoboy = motoboys.find(m => m.id === ctrlMotoboyId);
      const salBase = R(motoboy?.salario);
      const peri = R(motoboy?.periculosidade) / 100;
      const salDia = salBase > 0 ? parseFloat(((salBase * (1 + peri)) / 30).toFixed(2)) : 0;
      const [ano, mes] = ctrlMesAno.split('-').map(Number);
      const dias = diasDoMes(ano, mes);

      let linhasBase: ControleDia[];
      let temDadosSalvos = false;
      if (Array.isArray(d) && d.length > 0) {
        // Dados salvos no banco → usa como base (valores de chegada são preservados)
        temDadosSalvos = true;
        const dbMap = new Map(d.map((l: any) => [l.data, l]));
        linhasBase = dias.map(data => {
          const db = dbMap.get(data) as any;
          return db ? { ...db, motoboyId: ctrlMotoboyId, chegadaDia: db.chegadaDia ?? 0, chegadaNoite: db.chegadaNoite ?? 0 } : {
            motoboyId: ctrlMotoboyId, data,
            diaSemana: diaSemana(data), salDia,
            entDia: 0, caixinhaDia: 0, chegadaDia: 0, entNoite: 0, caixinhaNoite: 0, chegadaNoite: 0,
            vlVariavel: 0, pgto: 0, variavel: 0, unitId,
          };
        });
      } else {
        // Sem dados salvos → cálculo integrado do zero
        linhasBase = dias.map(data => ({
          motoboyId: ctrlMotoboyId, data,
          diaSemana: diaSemana(data), salDia,
          entDia: 0, caixinhaDia: 0, chegadaDia: 0, entNoite: 0, caixinhaNoite: 0, chegadaNoite: 0,
          vlVariavel: 0, pgto: 0, variavel: 0, unitId,
        }));
      }

      // Integrar com saídas e escalas
      // Modo MERGE quando há dados salvos (preserva chegada já calculada/editada)
      // Modo INTEGRADO quando é primeira carga do mês (sem dados)
      const colabId = motoboy?.colaboradorId;
      const escalasDoMotoboy = escalasControle.filter(e =>
        e.colaboradorId === ctrlMotoboyId ||
        (colabId && e.colaboradorId === colabId)
      );
      const modoIntegracao = temDadosSalvos ? 'merge' : 'integrado';
      const linhasIntegradas = preencherControleComSaidas(linhasBase, saidas, ctrlMotoboyId, motoboy, escalasDoMotoboy, modoIntegracao);
      setControle(linhasIntegradas);
    } catch (e) { console.error(e); setControle([]); }
    finally { setLoadingCtrl(false); }
  }, [ctrlMotoboyId, ctrlMesAno, unitId, apiUrl, motoboys, saidas, escalasControle]);

  /* ── Pagamentos semanais (folha-pagamento) ───────────────── */
  const fetchPagamentosSemana = useCallback(async () => {
    if (!ctrlMotoboyId || !ctrlMesAno || !unitId) return;
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(
        `${apiUrl}/folha-pagamento?colaboradorId=${ctrlMotoboyId}&mes=${ctrlMesAno}&unitId=${unitId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (r.ok) {
        const d = await r.json();
        setPagamentosSemana(Array.isArray(d) ? d : []);
      }
    } catch (e) { console.error(e); }
  }, [ctrlMotoboyId, ctrlMesAno, unitId, apiUrl]);

  const marcarPagamentoSemana = async (semanaFim: string, pago: boolean, dataPgto?: string) => {
    if (!ctrlMotoboyId) return;
    setSalvandoPgtoSemana(semanaFim);
    try {
      const token = localStorage.getItem('auth_token');
      // Calcula o total da semana a partir das linhas do controle
      const semanas = semanasMes(ctrlMesAno);
      const sem = semanas.find(s => s.fim === semanaFim);
      if (!sem) return;
      const linhasSemana = controleComAcumulado.filter(l => l.data >= sem.inicio && l.data <= sem.fim);
      const totalSemana = parseFloat(linhasSemana.reduce((s, l) => s + R(l.vlVariavel), 0).toFixed(2));
      const motoboy = motoboys.find(m => m.id === ctrlMotoboyId);
      const payload = {
        colaboradorId: ctrlMotoboyId,
        mes: ctrlMesAno,
        semana: semanaFim,
        unitId,
        pago,
        dataPagamento: pago ? (dataPgto || new Date().toISOString().split('T')[0]) : null,
        totalBruto: totalSemana,
        totalLiquido: totalSemana,
        obs: `Semana ${sem.label} — Controle Motoboy ${motoboy?.nome || ''}`,
      };
      const r = await fetch(`${apiUrl}/folha-pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      await fetchPagamentosSemana();
    } catch (e) { console.error(e); alert('Erro ao salvar pagamento'); }
    finally { setSalvandoPgtoSemana(null); }
  };

  // Carregar saídas ao mudar mês
  useEffect(() => {
    if (aba === 'controle') fetchSaidas(ctrlMesAno);
  }, [ctrlMesAno, aba, fetchSaidas]);

  // Carregar controle quando motoboy ou saídas mudam
  useEffect(() => {
    if (aba === 'controle' && ctrlMotoboyId && !loadingSaidas) fetchControle();
  }, [ctrlMotoboyId, ctrlMesAno, aba, loadingSaidas]);

  // Carregar status de pagamentos semanais
  useEffect(() => {
    if (aba === 'controle' && ctrlMotoboyId) fetchPagamentosSemana();
  }, [ctrlMotoboyId, ctrlMesAno, aba, fetchPagamentosSemana]);

  // Recalcular variavel acumulado
  const controleComAcumulado = useMemo(() => {
    let acumulado = 0;
    return controle.map(linha => {
      acumulado += R(linha.vlVariavel);
      return { ...linha, variavel: parseFloat(acumulado.toFixed(2)) };
    });
  }, [controle]);

  const handleCampoControle = (idx: number, campo: keyof ControleDia, valor: string) => {
    setControle(prev => {
      const next = [...prev];
      (next[idx] as any)[campo] = valor === '' ? 0 : parseFloat(valor) || 0;
      return next;
    });
  };

  const salvarControle = async () => {
    if (!ctrlMotoboyId) return;
    setSalvandoCtrl(true);
    try {
      const token = localStorage.getItem('auth_token');
      const payload = { motoboyId: ctrlMotoboyId, mes: ctrlMesAno, unitId, linhas: controleComAcumulado };
      const r = await fetch(`${apiUrl}/controle-motoboy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (r.ok) alert('✅ Controle salvo com sucesso!');
      else {
        const err = await r.json().catch(() => ({}));
        alert('Erro ao salvar: ' + (err.error || r.status));
      }
    } catch (e) { alert('Erro ao salvar controle'); }
    finally { setSalvandoCtrl(false); }
  };

  const recarregarDeSaidas = () => {
    const motoboy = motoboys.find(m => m.id === ctrlMotoboyId);
    const salBase = R(motoboy?.salario);
    const peri = R(motoboy?.periculosidade) / 100;
    const salDia = salBase > 0 ? parseFloat(((salBase * (1 + peri)) / 30).toFixed(2)) : 0;
    const [ano, mes] = ctrlMesAno.split('-').map(Number);
    const dias = diasDoMes(ano, mes);
    const linhasBase = dias.map(data => ({
      motoboyId: ctrlMotoboyId, data,
      diaSemana: diaSemana(data), salDia,
      entDia: 0, caixinhaDia: 0, chegadaDia: 0, entNoite: 0, caixinhaNoite: 0, chegadaNoite: 0,
      vlVariavel: 0, pgto: 0, variavel: 0, unitId,
    }));
    const motoboyObj = motoboys.find(m => m.id === ctrlMotoboyId);
    const colabIdRec = motoboyObj?.colaboradorId;
    const escalasDoMotoboy = escalasControle.filter(e =>
      e.colaboradorId === ctrlMotoboyId ||
      (colabIdRec && e.colaboradorId === colabIdRec)
    );
    const linhasIntegradas = preencherControleComSaidas(linhasBase, saidas, ctrlMotoboyId, motoboyObj, escalasDoMotoboy, 'integrado');
    setControle(linhasIntegradas);
  };

  const exportarControleXLSX = () => {
    const motoboy = motoboys.find(m => m.id === ctrlMotoboyId);
    const ws = XLSX.utils.json_to_sheet(controleComAcumulado.map(l => ({
      'Data': l.data,
      'Dia Sem': DIAS_SEMANA_ABREV[l.diaSemana ?? diaSemana(l.data)],
      'Sal.+Per.': l.salDia,
      'Ent. Dia': l.entDia || '',
      'Caixinha Dia': l.caixinhaDia || '',
      'Ent. Noite': l.entNoite || '',
      'Caixinha Noite': l.caixinhaNoite || '',
      'Vl. Variável': l.vlVariavel || '',
      'Pgto': l.pgto || '',
      'Variável Acum.': l.variavel,
      'Saídas Dia': (l.saidasDia || []).map(s => `${s.viagens}viag R$${s.valor}`).join('; '),
      'Saídas Noite': (l.saidasNoite || []).map(s => `${s.viagens}viag R$${s.valor}`).join('; '),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Controle');
    XLSX.writeFile(wb, `controle-${motoboy?.nome.split(' ')[0] || 'motoboy'}-${ctrlMesAno}.xlsx`);
  };

  /* ── Resumo do controle ──────────────────────────────── */
  const resumoCtrl = useMemo(() => {
    const motoboy = motoboys.find(m => m.id === ctrlMotoboyId);
    const isFreelancer = motoboy?.vinculo === 'Freelancer';

    // Totais diretos das linhas do controle
    const totalVariavel = controleComAcumulado.reduce((s, l) => s + R(l.vlVariavel), 0);
    const totalPgto     = controleComAcumulado.reduce((s, l) => s + R(l.pgto), 0);
    const totalViagens  = controleComAcumulado.reduce((s, l) => s + R(l.entDia) + R(l.entNoite), 0);
    // Caixinha total = caixinhaDia + caixinhaNoite (já consolidados por preencherControleComSaidas)
    const totalCaixinha = controleComAcumulado.reduce((s, l) => s + R(l.caixinhaDia) + R(l.caixinhaNoite), 0);
    // Dias trabalhados = dias com ao menos uma entrega ou variável
    const diasTrab = controleComAcumulado.filter(
      l => R(l.entDia) > 0 || R(l.entNoite) > 0 || R(l.vlVariavel) > 0
    ).length;

    // CLT: salário e periculosidade
    const salBase = R(motoboy?.salario);
    const peri = R(motoboy?.periculosidade) / 100;
    const periculosidadeValor = salBase * peri;

    // Freelancer-specific: chegada (dia + noite) a partir das linhas
    const vChegadaDia   = R(motoboy?.valorChegadaDia   ?? motoboy?.valorChegada);
    const vChegadaNoite = R(motoboy?.valorChegadaNoite ?? motoboy?.valorChegada);
    const vEntrega = R(motoboy?.valorEntrega);

    // Soma de chegadas reais calculadas por preencherControleComSaidas
    const totalChegadaDia   = controleComAcumulado.reduce((s, l) => s + R(l.chegadaDia),   0);
    const totalChegadaNoite = controleComAcumulado.reduce((s, l) => s + R(l.chegadaNoite), 0);
    const totalChegada = parseFloat((totalChegadaDia + totalChegadaNoite).toFixed(2));

    const totalEntregas = vEntrega > 0 ? parseFloat((vEntrega * totalViagens).toFixed(2)) : 0;

    // Bruto Freelancer = chegadas + entregas + caixinha
    const totalBrutoFreelancer = isFreelancer
      ? parseFloat((totalChegada + totalEntregas + totalCaixinha).toFixed(2))
      : 0;

    // Para Freelancer, o "Total variável" exibido é o bruto se configurado e há dados;
    // se bruto for 0 mas houver vlVariavel manual, usa vlVariavel para não ocultar valores
    const totalVariavelExibido = isFreelancer && (vChegadaDia > 0 || vChegadaNoite > 0 || vEntrega > 0) && totalBrutoFreelancer > 0
      ? totalBrutoFreelancer
      : totalVariavel;

    return {
      totalVariavel: totalVariavelExibido, totalPgto, totalViagens, totalCaixinha, diasTrab,
      salBase, periculosidadeValor,
      vChegadaDia, vChegadaNoite, vEntrega,
      totalChegadaDia, totalChegadaNoite, totalChegada, totalEntregas, totalBrutoFreelancer,
    };
  }, [controleComAcumulado, ctrlMotoboyId, motoboys]);

  /* ── Saídas do motoboy selecionado no período ─────────── */
  const saidasDoMotoboy = useMemo(() => {
    if (!ctrlMotoboyId) return [];
    const motoboy = motoboys.find(m => m.id === ctrlMotoboyId);
    const colabId = motoboy?.colaboradorId;
    const idSet = new Set([ctrlMotoboyId, colabId].filter(Boolean) as string[]);
    return saidas
      .filter(s => idSet.has(s.colaboradorId))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [saidas, ctrlMotoboyId, motoboys]);

  /* ── CRUD motoboys ───────────────────────────────────── */

  /**
   * Payload para /colaboradores:
   * - valorDia      = valorChegadaDia  (chegada turno dia)
   * - valorNoite    = valorChegadaNoite (chegada turno noite)
   * - valorTransporte = valorEntrega   (valor por corrida/entrega para freelancers)
   * A API /colaboradores persiste esses campos; /motoboys NÃO persiste campos de pagamento.
   */
  const buildColabPayload = () => ({
    nome: formData.nome,
    cpf: formData.cpf,
    celular: formData.telefone,
    telefone: formData.telefone,
    chavePix: formData.chavePix,
    salario: formData.vinculo !== 'Freelancer' ? (formData.salario ?? 0) : 0,
    periculosidade: formData.periculosidade ?? 0,
    dataAdmissao: formData.dataAdmissao,
    dataDemissao: formData.dataDemissao,
    ativo: formData.ativo,
    unitId,
    tipoContrato: formData.vinculo === 'Freelancer' ? 'Freelancer' : 'CLT',
    cargo: 'Motoboy',
    funcao: 'Motoboy',
    area: 'Delivery',
    // Mapeamento correto para os campos da API /colaboradores
    valorDia: formData.vinculo === 'Freelancer' ? (formData.valorChegadaDia ?? 0) : 0,
    valorNoite: formData.vinculo === 'Freelancer' ? (formData.valorChegadaNoite ?? 0) : 0,
    valorTransporte: formData.vinculo === 'Freelancer' ? (formData.valorEntrega ?? 0) : 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.cpf || !formData.telefone) { alert('Nome, CPF e Telefone são obrigatórios.'); return; }
    try {
      const token = localStorage.getItem('auth_token');
      const isEdit = !!editandoId;
      const colabPayload = buildColabPayload();

      // Fonte de verdade: /colaboradores
      // Buscar por CPF para garantir o ID correto independente de como foi criado
      let colabId = editandoId || '';
      try {
        const rc = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (rc.ok) {
          const dc = await rc.json();
          const colabs: any[] = Array.isArray(dc) ? dc : [];
          // Tentar por CPF primeiro (mais confiável), depois por ID
          const match = colabs.find((c: any) => formData.cpf && c.cpf === formData.cpf)
                     || colabs.find((c: any) => c.id === editandoId);
          if (match) colabId = match.id;
        }
      } catch {}

      // 1. Salvar em /colaboradores (fonte de verdade para valorDia/Noite/Transporte)
      //    PUT se existe, POST se ainda não tem colaborador (novo cadastro)
      if (colabId) {
        const rColab = await fetch(`${apiUrl}/colaboradores/${colabId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(colabPayload),
        });
        if (!rColab.ok) console.warn('Falha ao atualizar colaborador:', await rColab.text());
      } else if (!isEdit) {
        // Novo motoboy: criar colaborador primeiro
        const rColab = await fetch(`${apiUrl}/colaboradores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(colabPayload),
        });
        if (rColab.ok) {
          const dColab = await rColab.json();
          colabId = dColab.id || colabId;
        }
      }

      // 2. Salvar dados operacionais em /motoboys (vinculo, placa, datas)
      const motoboyPayload = {
        nome: formData.nome,
        cpf: formData.cpf,
        telefone: formData.telefone,
        chavePix: formData.chavePix,
        vinculo: formData.vinculo,
        placa: formData.placa,
        dataAdmissao: formData.dataAdmissao,
        dataDemissao: formData.dataDemissao,
        comissao: formData.comissao ?? 0,
        salario: formData.salario ?? 0,
        periculosidade: formData.periculosidade ?? 0,
        ativo: formData.ativo,
        unitId,
      };

      // Tentar salvar em /motoboys (pode não existir ainda se o motoboy veio só de /colaboradores)
      if (isEdit) {
        const rM = await fetch(`${apiUrl}/motoboys/${editandoId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(motoboyPayload),
        });
        if (!rM.ok && rM.status === 404) {
          // Criar em /motoboys se não existia
          await fetch(`${apiUrl}/motoboys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ...motoboyPayload, id: editandoId }),
          });
        }
      } else {
        // Novo cadastro
        await fetch(`${apiUrl}/motoboys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(motoboyPayload),
        });
      }

      alert(isEdit ? '✅ Motoboy atualizado!' : '✅ Motoboy cadastrado!');
      resetForm(); setAba('lista'); fetchMotoboys();
    } catch (e) { alert('Erro ao salvar: ' + e); }
  };

  const handleEditar = (m: Motoboy) => { setFormData({ ...m }); setEditandoId(m.id); setAba('novo'); };

  const handleDeletar = async (id: string, nome: string) => {
    if (!window.confirm(`Excluir ${nome}?`)) return;
    const token = localStorage.getItem('auth_token');
    const r = await fetch(`${apiUrl}/motoboys/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) { alert('Excluído!'); fetchMotoboys(); } else alert('Erro ao excluir');
  };

  const handleToggleAtivo = async (m: Motoboy) => {
    const token = localStorage.getItem('auth_token');
    const r = await fetch(`${apiUrl}/motoboys/${m.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...m, ativo: !m.ativo }),
    });
    if (r.ok) fetchMotoboys(); else alert('Erro ao atualizar status');
  };

  const resetForm = () => { setFormData({ ...emptyForm, unitId }); setEditandoId(null); };

  const motoboysFiltrados = motoboys.filter(m => {
    if (filtroVinculo !== 'Todos' && m.vinculo !== filtroVinculo) return false;
    if (filtroAtivo === 'Ativo' && !m.ativo) return false;
    if (filtroAtivo === 'Inativo' && m.ativo) return false;
    const q = busca.toLowerCase();
    if (q && !m.nome.toLowerCase().includes(q) && !m.cpf.includes(q) && !(m.telefone || '').includes(q)) return false;
    return true;
  });

  const exportarXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(motoboysFiltrados.map(m => ({
      Nome: m.nome, CPF: m.cpf, Telefone: m.telefone, Placa: m.placa || '-',
      Vínculo: m.vinculo, 'Salário': m.salario ?? 0, 'Periculosidade (%)': m.periculosidade ?? 0,
      'Ch.Dia (R$)': m.valorChegadaDia ?? m.valorChegada ?? 0,
      'Ch.Noite (R$)': m.valorChegadaNoite ?? m.valorChegada ?? 0,
      'Valor/Entrega (R$)': m.valorEntrega ?? 0,
      'Diária': m.salario ? ((m.salario * (1 + R(m.periculosidade) / 100)) / 30).toFixed(2) : '-',
      'Chave PIX': m.chavePix || '-', Admissão: m.dataAdmissao || '-', Ativo: m.ativo ? 'Sim' : 'Não',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Motoboys');
    XLSX.writeFile(wb, `motoboys-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  /* ── Styles ──────────────────────────────────────────── */
  const s = {
    tab: (a: boolean) => ({
      padding: '10px 18px', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const,
      borderRadius: '4px 4px 0 0',
      backgroundColor: a ? '#1976d2' : '#e0e0e0', color: a ? 'white' : '#333',
    }),
    card: { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' },
    label: { fontSize: '13px', fontWeight: 'bold' as const, marginBottom: '4px', color: '#444', display: 'block' },
    input: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    select: { padding: '9px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', width: '100%' },
    btn: (bg: string) => ({ padding: '8px 16px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: 'white' }),
    th: { backgroundColor: '#1565c0', color: 'white', padding: '8px 6px', textAlign: 'left' as const, fontWeight: 'bold' as const, whiteSpace: 'nowrap' as const, fontSize: '12px' },
    td: { padding: '7px 6px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const },
    badge: (bg: string, color: string) => ({ backgroundColor: bg, color, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' as const }),
    numInput: {
      width: '54px', padding: '3px 4px', border: '1px solid #ccc', borderRadius: '3px',
      fontSize: '12px', textAlign: 'right' as const, backgroundColor: '#fff',
    },
  };

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="🏍️ Gestão de Motoboys" showBack={true} />
      <div style={{ flex: 1, padding: '20px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>

        {/* Cards resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Total ativos', val: motoboys.filter(m => m.ativo).length, cor: '#1976d2' },
            { label: 'CLT ativos', val: motoboys.filter(m => m.ativo && m.vinculo === 'CLT').length, cor: '#43a047' },
            { label: 'Freelancers', val: motoboys.filter(m => m.ativo && m.vinculo === 'Freelancer').length, cor: '#fb8c00' },
            { label: 'Inativos', val: motoboys.filter(m => !m.ativo).length, cor: '#9e9e9e' },
          ].map(c => (
            <div key={c.label} style={{ ...s.card, borderLeft: `4px solid ${c.cor}` }}>
              <div style={{ fontSize: '11px', color: '#666' }}>{c.label}</div>
              <div style={{ fontSize: '26px', fontWeight: 'bold', color: c.cor }}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '2px solid #e0e0e0' }}>
          <button style={s.tab(aba === 'lista')} onClick={() => { setAba('lista'); resetForm(); }}>📋 Lista</button>
          <button style={s.tab(aba === 'controle')} onClick={() => setAba('controle')}>📊 Controle Diário</button>
          <button style={s.tab(aba === 'novo')} onClick={() => setAba('novo')}>
            {editandoId ? '✏️ Editar' : '➕ Novo'}
          </button>
        </div>

        {/* ─── LISTA ─────────────────────────────────────────────── */}
        {aba === 'lista' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'flex-end' }}>
              <div>
                <label style={s.label}>Buscar</label>
                <input type="text" placeholder="Nome, CPF, tel..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...s.input, width: '200px' }} />
              </div>
              <div>
                <label style={s.label}>Vínculo</label>
                <select value={filtroVinculo} onChange={e => setFiltroVinculo(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
                  <option value="Todos">Todos</option><option value="CLT">CLT</option><option value="Freelancer">Freelancer</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Status</label>
                <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value as any)} style={{ ...s.select, width: '110px' }}>
                  <option value="Todos">Todos</option><option value="Ativo">Ativos</option><option value="Inativo">Inativos</option>
                </select>
              </div>
              <button onClick={fetchMotoboys} style={s.btn('#1976d2')}>🔄</button>
              <button onClick={exportarXLSX} style={s.btn('#43a047')}>📥 XLSX</button>
            </div>

            {loading ? <p style={{ color: '#999', textAlign: 'center', padding: '30px' }}>Carregando...</p>
              : motoboysFiltrados.length === 0 ? <p style={{ color: '#999', textAlign: 'center', padding: '30px' }}>Nenhum motoboy encontrado.</p>
              : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Nome', 'Vínculo', 'CPF', 'Telefone', 'Placa', 'Salário / Ch.Dia', 'Diária / Ch.Noite', 'Vl.Entrega', 'Periculosidade', 'PIX', 'Admissão', 'Status', 'Ações'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {motoboysFiltrados.map(m => {
                      const peri = R(m.periculosidade) / 100;
                      const salComPeri = R(m.salario) * (1 + peri);
                      const isFreelancer = m.vinculo === 'Freelancer';
                      // CLT: salário + diária | Freelancer: chegadaDia / chegadaNoite / valorEntrega
                      const vCD = R(m.valorChegadaDia   ?? m.valorChegada);
                      const vCN = R(m.valorChegadaNoite ?? m.valorChegada);
                      const vEnt = R(m.valorEntrega);
                      const colSalario = isFreelancer
                        ? (vCD ? `R$ ${fmt(vCD)}/dia` : '—')
                        : (m.salario ? `R$ ${fmt(m.salario)}` : '—');
                      const colDiaria = isFreelancer
                        ? (vCN ? `R$ ${fmt(vCN)}/noite` : '—')
                        : (m.salario ? `R$ ${(salComPeri / 30).toFixed(2)}/dia` : '—');
                      const colEntrega = isFreelancer
                        ? (vEnt ? `R$ ${fmt(vEnt)}/ent.` : '—')
                        : '—';
                      return (
                        <tr key={m.id}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0f7ff')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                          <td style={{ ...s.td, fontWeight: 'bold' }}>{m.nome}</td>
                          <td style={s.td}>
                            <span style={m.vinculo === 'CLT' ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fff3e0', '#e65100')}>{m.vinculo}</span>
                          </td>
                          <td style={s.td}>{m.cpf}</td>
                          <td style={s.td}>{m.telefone}</td>
                          <td style={s.td}>{m.placa || '-'}</td>
                          <td style={{ ...s.td, fontWeight: 'bold', color: isFreelancer ? '#e65100' : '#6a1b9a' }}>{colSalario}</td>
                          <td style={{ ...s.td, fontWeight: 'bold', color: isFreelancer ? '#7b1fa2' : '#1976d2' }}>{colDiaria}</td>
                          <td style={{ ...s.td, fontWeight: 'bold', color: isFreelancer ? '#0288d1' : '#777' }}>{colEntrega}</td>
                          <td style={s.td}>{!isFreelancer && m.periculosidade != null ? `${m.periculosidade}%` : '—'}</td>
                          <td style={s.td}>{m.chavePix || '-'}</td>
                          <td style={s.td}>{m.dataAdmissao || '-'}</td>
                          <td style={s.td}>
                            <span style={m.ativo ? s.badge('#e8f5e9', '#2e7d32') : s.badge('#fce4e4', '#c62828')}>
                              {m.ativo ? '● Ativo' : '○ Inativo'}
                            </span>
                          </td>
                          <td style={{ ...s.td }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => { setCtrlMotoboyId(m.id); setAba('controle'); }} style={{ ...s.btn('#0288d1'), fontSize: '11px', padding: '3px 8px' }}>📊</button>
                              <button onClick={() => handleEditar(m)} style={{ ...s.btn('#1976d2'), fontSize: '11px', padding: '3px 8px' }}>✏️</button>
                              <button onClick={() => handleToggleAtivo(m)} style={{ ...s.btn(m.ativo ? '#fb8c00' : '#43a047'), fontSize: '11px', padding: '3px 8px' }}>{m.ativo ? '⏸' : '▶'}</button>
                              <button onClick={() => handleDeletar(m.id, m.nome)} style={{ ...s.btn('#e53935'), fontSize: '11px', padding: '3px 8px' }}>🗑</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ padding: '8px 0', color: '#666', fontSize: '12px' }}>{motoboysFiltrados.length} de {motoboys.length} motoboy(s)</div>
              </div>
            )}
          </div>
        )}

        {/* ─── CONTROLE DIÁRIO ────────────────────────────────────── */}
        {aba === 'controle' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px' }}>
            {/* Seleção */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '16px' }}>
              <div>
                <label style={s.label}>Motoboy</label>
                <select value={ctrlMotoboyId} onChange={e => setCtrlMotoboyId(e.target.value)} style={{ ...s.select, width: '240px' }}>
                  <option value="">Selecione...</option>
                  {motoboys.filter(m => m.ativo).map(m => (
                    <option key={m.id} value={m.id}>{m.nome} ({m.vinculo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={s.label}>Mês</label>
                <input type="month" value={ctrlMesAno} onChange={e => setCtrlMesAno(e.target.value)} style={{ ...s.input, width: '150px' }} />
              </div>
              <div>
                <label style={s.label}>Modo</label>
                <select value={modoVisualizacao} onChange={e => setModoVisualizacao(e.target.value as any)} style={{ ...s.select, width: '150px' }}>
                  <option value="integrado">🔗 Integrado (Saídas)</option>
                  <option value="manual">✏️ Manual</option>
                </select>
              </div>
              <button onClick={fetchControle} disabled={!ctrlMotoboyId || loadingCtrl} style={s.btn('#1976d2')}>
                {loadingCtrl || loadingSaidas ? '⏳' : '🔄'} Carregar
              </button>
              {modoVisualizacao === 'integrado' && ctrlMotoboyId && (
                <button onClick={recarregarDeSaidas} style={s.btn('#0288d1')}>⚡ Reimportar Saídas</button>
              )}
              <button onClick={salvarControle} disabled={!ctrlMotoboyId || salvandoCtrl} style={s.btn('#43a047')}>
                {salvandoCtrl ? '⏳ Salvando...' : '💾 Salvar'}
              </button>
              <button onClick={exportarControleXLSX} disabled={!ctrlMotoboyId || controle.length === 0} style={s.btn('#7b1fa2')}>📥 XLSX</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', marginLeft: '4px' }}>
                <input type="checkbox" checked={mostrarSaidas} onChange={e => setMostrarSaidas(e.target.checked)} />
                Ver saídas
              </label>
            </div>

            {/* Banner de modo integrado */}
            {modoVisualizacao === 'integrado' && ctrlMotoboyId && (
              <div style={{ backgroundColor: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#1565c0' }}>
                <strong>🔗 Modo Integrado:</strong> Viagens, pagamentos e caixinhas são preenchidos automaticamente a partir das <strong>saídas lançadas</strong> no período.
                {loadingSaidas && <span style={{ marginLeft: '8px' }}>⏳ Carregando saídas...</span>}
                {!loadingSaidas && <span style={{ marginLeft: '8px' }}>✅ {saidas.filter(s => s.colaboradorId === ctrlMotoboyId).length} saída(s) encontrada(s) para este motoboy.</span>}
              </div>
            )}

            {!ctrlMotoboyId ? (
              <p style={{ color: '#999', textAlign: 'center', padding: '30px' }}>Selecione um motoboy para ver o controle diário.</p>
            ) : loadingCtrl ? (
              <p style={{ color: '#999', textAlign: 'center', padding: '30px' }}>Carregando...</p>
            ) : (
              <>
                {/* Cards resumo do mês */}
                {(() => {
                  const motoboy = motoboys.find(m => m.id === ctrlMotoboyId);
                  const isFreelancer = motoboy?.vinculo === 'Freelancer';
                  const saldo = resumoCtrl.totalVariavel - resumoCtrl.totalPgto;
                  const cardsBase = [
                    { label: 'Dias trabalhados', val: String(resumoCtrl.diasTrab), cor: '#1976d2' },
                    { label: 'Total viagens', val: String(resumoCtrl.totalViagens), cor: '#0288d1' },
                    { label: 'Caixinha', val: `R$ ${fmt(resumoCtrl.totalCaixinha)}`, cor: '#00838f' },
                    { label: 'Total variável', val: `R$ ${fmt(resumoCtrl.totalVariavel)}`, cor: '#43a047' },
                    { label: 'Total pago', val: `R$ ${fmt(resumoCtrl.totalPgto)}`, cor: '#fb8c00' },
                    { label: 'Saldo variável', val: `R$ ${fmt(saldo)}`, cor: saldo >= 0 ? '#2e7d32' : '#c62828' },
                  ];
                  // Para freelancer: sempre mostra cards de chegada/entrega (mesmo que 0), para ficar visível
                  const cardsFreelancer = isFreelancer ? [
                    { label: `Ch.Dia${resumoCtrl.vChegadaDia > 0 ? ` (R$${fmt(resumoCtrl.vChegadaDia)}/turno)` : ' (não configurado)'}`, val: resumoCtrl.vChegadaDia > 0 ? `R$ ${fmt(resumoCtrl.totalChegadaDia)}` : '—', cor: '#e65100' },
                    { label: `Ch.Noite${resumoCtrl.vChegadaNoite > 0 ? ` (R$${fmt(resumoCtrl.vChegadaNoite)}/turno)` : ' (não configurado)'}`, val: resumoCtrl.vChegadaNoite > 0 ? `R$ ${fmt(resumoCtrl.totalChegadaNoite)}` : '—', cor: '#7b1fa2' },
                    { label: resumoCtrl.vEntrega > 0 ? `Entregas (${resumoCtrl.totalViagens}× R$${fmt(resumoCtrl.vEntrega)})` : 'Vl. Entrega (não configurado)', val: resumoCtrl.vEntrega > 0 ? `R$ ${fmt(resumoCtrl.totalEntregas)}` : '—', cor: '#0288d1' },
                    { label: 'Bruto (chegada+ent.+caix.)', val: `R$ ${fmt(resumoCtrl.totalBrutoFreelancer)}`, cor: '#2e7d32' },
                  ] : [];
                  const cardsCLT = !isFreelancer ? [
                    { label: 'Salário base', val: `R$ ${fmt(resumoCtrl.salBase)}`, cor: '#6a1b9a' },
                    { label: 'Periculosidade', val: `R$ ${fmt(resumoCtrl.periculosidadeValor)}`, cor: '#e65100' },
                  ] : [];
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                      {[...cardsBase, ...cardsFreelancer, ...cardsCLT].map(c => (
                        <div key={c.label} style={{ ...s.card, padding: '10px', borderLeft: `3px solid ${c.cor}` }}>
                          <div style={{ fontSize: '11px', color: '#666' }}>{c.label}</div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: c.cor }}>{c.val}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Tabela diária — agrupada por semana */}
                {(() => {
                  const motoboyCtrl = motoboys.find(m => m.id === ctrlMotoboyId);
                  const isFreelancerCtrl = motoboyCtrl?.vinculo === 'Freelancer';
                  const showChegada = isFreelancerCtrl;
                  const semanas = semanasMes(ctrlMesAno);

                  // Detecta quais dias já foram pagos (pgto > 0 ou semana marcada paga)
                  const semanasPagas = new Set(
                    pagamentosSemana.filter((p: any) => p.pago === true).map((p: any) => p.semana || p.dataFechamento)
                  );

                  const headers = [
                    'Data', 'DS', 'Sal.+Per.',
                    'Ent.Dia', 'Caix.Dia',
                    ...(showChegada ? ['Ch.Dia'] : []),
                    'Ent.Noite', 'Caix.Noite',
                    ...(showChegada ? ['Ch.Noite'] : []),
                    'Caixa Total', 'Vl.Variável', 'Pgto', 'Status', 'Var.Acum.',
                    ...(mostrarSaidas ? ['Saídas Dia', 'Saídas Noite'] : [])
                  ];

                  return (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          {headers.map(h => <th key={h} style={s.th}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {semanas.map((sem) => {
                          const linhasSem = controleComAcumulado.filter(l => l.data >= sem.inicio && l.data <= sem.fim);
                          if (linhasSem.length === 0) return null;

                          const semPaga = semanasPagas.has(sem.fim);
                          const subEntDia   = linhasSem.reduce((s, l) => s + R(l.entDia), 0);
                          const subCaixDia  = linhasSem.reduce((s, l) => s + R(l.caixinhaDia), 0);
                          const subChDia    = linhasSem.reduce((s, l) => s + R(l.chegadaDia), 0);
                          const subEntNoite = linhasSem.reduce((s, l) => s + R(l.entNoite), 0);
                          const subCaixNoite= linhasSem.reduce((s, l) => s + R(l.caixinhaNoite), 0);
                          const subChNoite  = linhasSem.reduce((s, l) => s + R(l.chegadaNoite), 0);
                          const subCaixTotal= subCaixDia + subCaixNoite;
                          const subVar      = linhasSem.reduce((s, l) => s + R(l.vlVariavel), 0);
                          const subPgto     = linhasSem.reduce((s, l) => s + R(l.pgto), 0);

                          return (
                            <React.Fragment key={sem.fim}>
                              {/* Cabeçalho da semana */}
                              <tr style={{ backgroundColor: semPaga ? '#e8f5e9' : '#e3f2fd' }}>
                                <td colSpan={headers.length} style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: '12px', color: semPaga ? '#2e7d32' : '#1565c0', borderTop: '2px solid #90caf9' }}>
                                  📅 {sem.label} &nbsp;
                                  {semPaga
                                    ? <span style={{ backgroundColor: '#c8e6c9', color: '#1b5e20', padding: '1px 8px', borderRadius: '10px', fontSize: '11px' }}>✅ Pago</span>
                                    : <span style={{ backgroundColor: '#fff3e0', color: '#e65100', padding: '1px 8px', borderRadius: '10px', fontSize: '11px' }}>⏳ Em aberto</span>
                                  }
                                </td>
                              </tr>

                              {/* Linhas dos dias */}
                              {linhasSem.map((l) => {
                                const idx = controleComAcumulado.findIndex(c => c.data === l.data);
                                const dow = l.diaSemana ?? diaSemana(l.data);
                                const folga = dow === 0 || dow === 1;
                                const temDados = R(l.vlVariavel) > 0 || R(l.entDia) > 0 || R(l.entNoite) > 0 || R(l.caixinhaDia) > 0 || R(l.caixinhaNoite) > 0;
                                const diaPago = R(l.pgto) > 0 || semPaga;
                                const caixaTotalDia = R(l.caixinhaDia) + R(l.caixinhaNoite);
                                const rowBg = diaPago ? '#f1f8e9' : folga ? '#f5f5f5' : temDados ? '#fafff8' : idx % 2 === 0 ? '#fdfdfd' : 'white';

                                return (
                                  <tr key={l.data} style={{ backgroundColor: rowBg }}>
                                    <td style={{ ...s.td, fontWeight: 'bold' }}>
                                      {l.data.split('-').reverse().join('/')}
                                      {temDados && <span style={{ marginLeft: '4px', color: '#2e7d32', fontSize: '10px' }}>●</span>}
                                    </td>
                                    <td style={{ ...s.td, color: folga ? '#9e9e9e' : '#1976d2', fontWeight: 'bold' }}>
                                      {DIAS_SEMANA_ABREV[dow]}
                                    </td>
                                    <td style={{ ...s.td, color: '#6a1b9a', fontWeight: 'bold' }}>{fmt(l.salDia)}</td>

                                    {/* Campos editáveis modo manual */}
                                    {(['entDia', 'caixinhaDia'] as const).map(campo => (
                                      <td key={campo} style={s.td}>
                                        <input type="number" step="0.01" min="0" style={s.numInput}
                                          value={(l as any)[campo] || ''}
                                          onChange={e => handleCampoControle(idx, campo, e.target.value)}
                                          onFocus={e => e.target.select()} placeholder="0" />
                                      </td>
                                    ))}
                                    {showChegada && (
                                      <td key="chegadaDia" style={s.td}>
                                        <input type="number" step="0.01" min="0" style={s.numInput}
                                          value={R(l.chegadaDia) || ''}
                                          onChange={e => handleCampoControle(idx, 'chegadaDia', e.target.value)}
                                          onFocus={e => e.target.select()} placeholder="0" />
                                      </td>
                                    )}
                                    {(['entNoite', 'caixinhaNoite'] as const).map(campo => (
                                      <td key={campo} style={s.td}>
                                        <input type="number" step="0.01" min="0" style={s.numInput}
                                          value={(l as any)[campo] || ''}
                                          onChange={e => handleCampoControle(idx, campo, e.target.value)}
                                          onFocus={e => e.target.select()} placeholder="0" />
                                      </td>
                                    ))}
                                    {showChegada && (
                                      <td key="chegadaNoite" style={s.td}>
                                        <input type="number" step="0.01" min="0" style={s.numInput}
                                          value={R(l.chegadaNoite) || ''}
                                          onChange={e => handleCampoControle(idx, 'chegadaNoite', e.target.value)}
                                          onFocus={e => e.target.select()} placeholder="0" />
                                      </td>
                                    )}

                                    {/* Caixa Total (dia + noite) — só leitura */}
                                    <td style={{ ...s.td, textAlign: 'center' as const, fontWeight: 'bold', color: '#00838f' }}>
                                      {caixaTotalDia > 0 ? fmt(caixaTotalDia) : <span style={{ color: '#ccc' }}>-</span>}
                                    </td>

                                    {(['vlVariavel', 'pgto'] as const).map(campo => (
                                      <td key={campo} style={s.td}>
                                        <input type="number" step="0.01" min="0" style={s.numInput}
                                          value={(l as any)[campo] || ''}
                                          onChange={e => handleCampoControle(idx, campo, e.target.value)}
                                          onFocus={e => e.target.select()} placeholder="0" />
                                      </td>
                                    ))}

                                    {/* Status do dia */}
                                    <td style={{ ...s.td, textAlign: 'center' as const, whiteSpace: 'nowrap' as const }}>
                                      {diaPago
                                        ? <span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' }}>✅ Pago</span>
                                        : temDados
                                          ? <span style={{ backgroundColor: '#fff3e0', color: '#e65100', padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' }}>⏳ Aberto</span>
                                          : <span style={{ color: '#ccc', fontSize: '10px' }}>—</span>
                                      }
                                    </td>

                                    <td style={{ ...s.td, textAlign: 'right' as const, color: R(l.variavel) < 0 ? '#c62828' : '#2e7d32', fontWeight: 'bold' }}>
                                      {R(l.variavel) !== 0 ? fmt(R(l.variavel)) : <span style={{ color: '#ccc' }}>-</span>}
                                    </td>

                                    {mostrarSaidas && (
                                      <>
                                        <td style={s.td}>{l.saidasDia?.map(s2 => `${s2.descricao || s2.tipo}(R$${fmt(R(s2.valor))})`).join(', ') || ''}</td>
                                        <td style={s.td}>{l.saidasNoite?.map(s2 => `${s2.descricao || s2.tipo}(R$${fmt(R(s2.valor))})`).join(', ') || ''}</td>
                                      </>
                                    )}
                                  </tr>
                                );
                              })}

                              {/* Subtotal da semana */}
                              <tr style={{ backgroundColor: semPaga ? '#c8e6c9' : '#bbdefb', fontWeight: 'bold', fontSize: '12px' }}>
                                <td style={{ padding: '5px 6px' }} colSpan={3}>Subtotal {sem.label}</td>
                                <td style={{ padding: '5px 6px' }}>{subEntDia}</td>
                                <td style={{ padding: '5px 6px' }}>{fmt(subCaixDia)}</td>
                                {showChegada && <td style={{ padding: '5px 6px', color: '#e65100' }}>{fmt(subChDia)}</td>}
                                <td style={{ padding: '5px 6px' }}>{subEntNoite}</td>
                                <td style={{ padding: '5px 6px' }}>{fmt(subCaixNoite)}</td>
                                {showChegada && <td style={{ padding: '5px 6px', color: '#7b1fa2' }}>{fmt(subChNoite)}</td>}
                                <td style={{ padding: '5px 6px', color: '#00838f' }}>{fmt(subCaixTotal)}</td>
                                <td style={{ padding: '5px 6px', color: '#2e7d32' }}>R$ {fmt(subVar)}</td>
                                <td style={{ padding: '5px 6px', color: '#fb8c00' }}>{subPgto > 0 ? `R$ ${fmt(subPgto)}` : '—'}</td>
                                <td style={{ padding: '5px 6px' }}>
                                  {semPaga
                                    ? <span style={{ color: '#1b5e20' }}>✅ Pago</span>
                                    : <span style={{ color: '#e65100' }}>⏳ Aberto</span>}
                                </td>
                                <td style={{ padding: '5px 6px' }} colSpan={mostrarSaidas ? 3 : 1} />
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                          <td style={{ padding: '8px 6px', fontSize: '12px' }} colSpan={3}>TOTAL GERAL</td>
                          <td style={{ padding: '8px 6px', fontSize: '12px' }}>{controleComAcumulado.reduce((s, l) => s + R(l.entDia), 0)}</td>
                          <td style={{ padding: '8px 6px', fontSize: '12px' }}>{fmt(controleComAcumulado.reduce((s, l) => s + R(l.caixinhaDia), 0))}</td>
                          {showChegada && <td style={{ padding: '8px 6px', fontSize: '12px', color: '#ffcc80' }}>{fmt(resumoCtrl.totalChegadaDia)}</td>}
                          <td style={{ padding: '8px 6px', fontSize: '12px' }}>{controleComAcumulado.reduce((s, l) => s + R(l.entNoite), 0)}</td>
                          <td style={{ padding: '8px 6px', fontSize: '12px' }}>{fmt(controleComAcumulado.reduce((s, l) => s + R(l.caixinhaNoite), 0))}</td>
                          {showChegada && <td style={{ padding: '8px 6px', fontSize: '12px', color: '#ffcc80' }}>{fmt(resumoCtrl.totalChegadaNoite)}</td>}
                          <td style={{ padding: '8px 6px', fontSize: '12px', color: '#80deea' }}>{fmt(controleComAcumulado.reduce((s, l) => s + R(l.caixinhaDia) + R(l.caixinhaNoite), 0))}</td>
                          <td style={{ padding: '8px 6px', fontSize: '12px', color: '#a5d6a7' }}>{fmt(resumoCtrl.totalVariavel)}</td>
                          <td style={{ padding: '8px 6px', fontSize: '12px', color: '#ffcc80' }}>{fmt(resumoCtrl.totalPgto)}</td>
                          <td style={{ padding: '8px 6px', fontSize: '12px' }} />
                          <td style={{ padding: '8px 6px', fontSize: '12px', color: '#a5d6a7' }}>{fmt(controleComAcumulado[controleComAcumulado.length - 1]?.variavel || 0)}</td>
                          {mostrarSaidas && <td colSpan={2} />}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  );
                })()}



                {/* ── Resumo semanal com status de pagamento ──────── */}
                {controleComAcumulado.length > 0 && (() => {
                  const semanas = semanasMes(ctrlMesAno);
                  const motoboy = motoboys.find(m => m.id === ctrlMotoboyId);
                  return (
                    <div style={{ marginTop: '20px', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ backgroundColor: '#37474f', color: 'white', padding: '8px 12px', fontSize: '13px', fontWeight: 'bold' }}>
                        📅 Resumo Semanal — {motoboy?.nome}
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f5f5f5' }}>
                            {['Semana', 'Vl. Variável', 'Total Pago', 'Saldo', 'Status', 'Ação'].map(h => (
                              <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Semana' ? 'left' : 'right', fontWeight: 'bold', color: '#555', borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap' as const }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {semanas.map((sem, idx) => {
                            const linhasSem = controleComAcumulado.filter(l => l.data >= sem.inicio && l.data <= sem.fim);
                            const totalVar = parseFloat(linhasSem.reduce((s, l) => s + R(l.vlVariavel), 0).toFixed(2));
                            const totalPgtoSem = parseFloat(linhasSem.reduce((s, l) => s + R(l.pgto), 0).toFixed(2));
                            if (totalVar === 0 && totalPgtoSem === 0) return null;
                            const pgDB = pagamentosSemana.find((p: any) => p.semana === sem.fim || p.dataFechamento === sem.fim);
                            const pago = pgDB?.pago === true;
                            const dataPgto = pgDB?.dataPagamento;
                            const saldo = parseFloat((totalVar - totalPgtoSem).toFixed(2));
                            const salvando = salvandoPgtoSemana === sem.fim;
                            return (
                              <tr key={sem.fim} style={{ backgroundColor: idx % 2 === 0 ? '#fafafa' : 'white', borderBottom: '1px solid #f0f0f0' }}>
                                <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#333' }}>{sem.label}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#2e7d32', fontWeight: 'bold' }}>R$ {fmt(totalVar)}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#fb8c00' }}>
                                  {totalPgtoSem > 0 ? `R$ ${fmt(totalPgtoSem)}` : <span style={{ color: '#ccc' }}>—</span>}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: saldo > 0 ? '#c62828' : '#2e7d32', fontWeight: 'bold' }}>
                                  R$ {fmt(saldo)}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                  {pago ? (
                                    <span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>
                                      ✅ Pago {dataPgto ? `em ${dataPgto.split('-').reverse().join('/')}` : ''}
                                    </span>
                                  ) : (
                                    <span style={{ backgroundColor: '#fff3e0', color: '#e65100', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>
                                      ⏳ Pendente
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                  {pago ? (
                                    <button
                                      style={{ padding: '3px 10px', fontSize: '11px', backgroundColor: '#f5f5f5', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                                      disabled={salvando}
                                      onClick={() => { if (window.confirm('Desfazer pagamento desta semana?')) marcarPagamentoSemana(sem.fim, false); }}
                                    >↩ Desfazer</button>
                                  ) : (
                                    <button
                                      style={{ padding: '3px 10px', fontSize: '11px', backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                      disabled={salvando}
                                      onClick={() => {
                                        const dt = window.prompt('Data do pagamento (AAAA-MM-DD):', new Date().toISOString().split('T')[0]);
                                        if (dt !== null) marcarPagamentoSemana(sem.fim, true, dt || undefined);
                                      }}
                                    >{salvando ? '...' : '✅ Pagar'}</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Painel de saídas detalhado */}
                {mostrarSaidas && saidasDoMotoboy.length > 0 && (
                  <div style={{ marginTop: '20px' }}>
                    <h3 style={{ color: '#1565c0', marginBottom: '10px', fontSize: '14px' }}>
                      📋 Saídas lançadas – {motoboys.find(m => m.id === ctrlMotoboyId)?.nome} – {ctrlMesAno}
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr>
                            {['Data', 'Turno', 'Viagens', 'Caixinha', 'Valor (Pgto)', 'Tipo', 'Dt. Pgto', 'Descrição'].map(h => (
                              <th key={h} style={{ ...s.th, backgroundColor: '#37474f' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {saidasDoMotoboy.map(s => (
                            <tr key={s.id}
                              style={{ backgroundColor: normalizeTurno(s.turno) === 'noite' ? '#f3e5f5' : normalizeTurno(s.turno) === 'dia' ? '#e3f2fd' : '#fafafa' }}>
                              <td style={{ ...s as any, padding: '6px', borderBottom: '1px solid #eee' }}>{(s.data || '').split('-').reverse().join('/')}</td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee', fontSize: '12px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                                  backgroundColor: normalizeTurno(s.turno) === 'noite' ? '#ce93d8' : normalizeTurno(s.turno) === 'dia' ? '#90caf9' : '#e0e0e0',
                                  color: '#333' }}>
                                  {s.turno || '-'}
                                </span>
                              </td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: '#0288d1' }}>{s.viagens || '-'}</td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee', textAlign: 'right', fontSize: '12px', color: '#00838f' }}>{s.caixinha ? `R$ ${R(s.caixinha).toFixed(2)}` : '-'}</td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee', textAlign: 'right', fontSize: '12px', fontWeight: 'bold', color: '#fb8c00' }}>{s.valor ? `R$ ${R(s.valor).toFixed(2)}` : '-'}</td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee', fontSize: '12px' }}>{s.tipo || '-'}</td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee', fontSize: '12px' }}>{s.dataPagamento ? (s.dataPagamento as string).split('-').reverse().join('/') : '-'}</td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee', fontSize: '12px', color: '#555' }}>{s.descricao || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ backgroundColor: '#37474f', color: 'white', fontWeight: 'bold' }}>
                            <td style={{ padding: '8px 6px', fontSize: '12px' }} colSpan={2}>TOTAL</td>
                            <td style={{ padding: '8px 6px', fontSize: '12px', textAlign: 'center' }}>
                              {saidasDoMotoboy.reduce((sum, s) => sum + R(s.viagens), 0)} viag
                            </td>
                            <td style={{ padding: '8px 6px', fontSize: '12px', textAlign: 'right' }}>
                              R$ {saidasDoMotoboy.reduce((sum, s) => sum + R(s.caixinha), 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '8px 6px', fontSize: '12px', textAlign: 'right' }}>
                              R$ {saidasDoMotoboy.reduce((sum, s) => sum + R(s.valor), 0).toFixed(2)}
                            </td>
                            <td colSpan={3} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
                  <button onClick={salvarControle} disabled={salvandoCtrl} style={s.btn('#43a047')}>
                    {salvandoCtrl ? '⏳ Salvando...' : '💾 Salvar Controle'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── FORMULÁRIO CADASTRO/EDIÇÃO ──────────────────────────── */}
        {aba === 'novo' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px' }}>
            <h2 style={{ marginTop: 0 }}>{editandoId ? '✏️ Editar Motoboy' : '➕ Cadastrar Motoboy'}</h2>
            <form onSubmit={handleSubmit}>
              <fieldset style={{ border: '1px solid #e0e0e0', borderRadius: '6px', padding: '16px', marginBottom: '14px' }}>
                <legend style={{ fontWeight: 'bold', color: '#1976d2', padding: '0 8px' }}>👤 Dados Pessoais</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div><label style={s.label}>Nome *</label><input type="text" value={formData.nome || ''} onChange={e => setFormData({ ...formData, nome: e.target.value })} style={s.input} required /></div>
                  <div><label style={s.label}>CPF *</label><input type="text" placeholder="000.000.000-00" value={formData.cpf || ''} onChange={e => setFormData({ ...formData, cpf: e.target.value })} style={s.input} required /></div>
                  <div><label style={s.label}>Celular *</label><input type="tel" placeholder="(00) 00000-0000" value={formData.telefone || ''} onChange={e => setFormData({ ...formData, telefone: e.target.value })} style={s.input} required /></div>
                  <div><label style={s.label}>Chave PIX</label><input type="text" value={formData.chavePix || ''} onChange={e => setFormData({ ...formData, chavePix: e.target.value })} style={s.input} /></div>
                </div>
              </fieldset>

              <fieldset style={{ border: '1px solid #e0e0e0', borderRadius: '6px', padding: '16px', marginBottom: '14px' }}>
                <legend style={{ fontWeight: 'bold', color: '#1976d2', padding: '0 8px' }}>📋 Vínculo e Salário</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={s.label}>Vínculo *</label>
                    <select value={formData.vinculo || 'Freelancer'} onChange={e => setFormData({ ...formData, vinculo: e.target.value as any })} style={s.select}>
                      <option value="CLT">CLT</option><option value="Freelancer">Freelancer</option>
                    </select>
                  </div>
                  {/* CLT: salário base */}
                  {formData.vinculo !== 'Freelancer' && (
                    <div>
                      <label style={s.label}>Salário Base (R$) <span style={{ color: '#6a1b9a', fontSize: '11px' }}>(CLT)</span></label>
                      <input type="number" step="0.01" min="0" value={formData.salario ?? ''} onChange={e => setFormData({ ...formData, salario: parseFloat(e.target.value) || 0 })} style={s.input} />
                    </div>
                  )}
                  {/* CLT: periculosidade */}
                  {formData.vinculo !== 'Freelancer' && (
                    <div>
                      <label style={s.label}>Periculosidade (%) <span style={{ color: '#e65100', fontSize: '11px' }}>(CLT — padrão 30%)</span></label>
                      <input type="number" step="1" min="0" max="100" placeholder="30" value={formData.periculosidade ?? ''} onChange={e => setFormData({ ...formData, periculosidade: parseFloat(e.target.value) || 0 })} style={s.input} />
                      {formData.salario && formData.periculosidade ? (
                        <small style={{ color: '#2e7d32' }}>
                          Diária: R$ {(R(formData.salario) * (1 + R(formData.periculosidade) / 100) / 30).toFixed(2)}
                        </small>
                      ) : null}
                    </div>
                  )}
                  {/* Freelancer: chegada turno Dia */}
                  {formData.vinculo === 'Freelancer' && (
                    <div>
                      <label style={s.label}>Chegada Turno Dia (R$) <span style={{ color: '#e65100', fontSize: '11px' }}>(fixo p/ turno dia trabalhado)</span></label>
                      <input type="number" step="0.01" min="0" placeholder="Ex: 100.00" value={formData.valorChegadaDia ?? ''} onChange={e => setFormData({ ...formData, valorChegadaDia: parseFloat(e.target.value) || 0 })} style={s.input} />
                      <small style={{ color: '#888' }}>Pago por dia que trabalhou no turno Dia</small>
                    </div>
                  )}
                  {/* Freelancer: chegada turno Noite */}
                  {formData.vinculo === 'Freelancer' && (
                    <div>
                      <label style={s.label}>Chegada Turno Noite (R$) <span style={{ color: '#7b1fa2', fontSize: '11px' }}>(fixo p/ turno noite trabalhado)</span></label>
                      <input type="number" step="0.01" min="0" placeholder="Ex: 100.00" value={formData.valorChegadaNoite ?? ''} onChange={e => setFormData({ ...formData, valorChegadaNoite: parseFloat(e.target.value) || 0 })} style={s.input} />
                      <small style={{ color: '#888' }}>Pago por dia que trabalhou no turno Noite</small>
                    </div>
                  )}
                  {/* Freelancer: valor por entrega */}
                  {formData.vinculo === 'Freelancer' && (
                    <div>
                      <label style={s.label}>Valor por Entrega (R$) <span style={{ color: '#0288d1', fontSize: '11px' }}>(por corrida/entrega)</span></label>
                      <input type="number" step="0.01" min="0" placeholder="Ex: 8.00" value={formData.valorEntrega ?? ''} onChange={e => setFormData({ ...formData, valorEntrega: parseFloat(e.target.value) || 0 })} style={s.input} />
                      <small style={{ color: '#888' }}>Multiplicado pela quantidade de entregas do período</small>
                    </div>
                  )}
                  {/* Comissão % — opcional para CLT */}
                  {formData.vinculo !== 'Freelancer' && (
                    <div><label style={s.label}>Comissão por entrega (%)</label><input type="number" step="0.01" min="0" value={formData.comissao ?? ''} onChange={e => setFormData({ ...formData, comissao: parseFloat(e.target.value) || 0 })} style={s.input} /></div>
                  )}
                  <div><label style={s.label}>Admissão</label><input type="date" value={formData.dataAdmissao || ''} onChange={e => setFormData({ ...formData, dataAdmissao: e.target.value })} style={s.input} /></div>
                  {formData.vinculo === 'CLT' && (
                    <div><label style={s.label}>Demissão</label><input type="date" value={formData.dataDemissao || ''} onChange={e => setFormData({ ...formData, dataDemissao: e.target.value })} style={s.input} /></div>
                  )}
                </div>
              </fieldset>

              <fieldset style={{ border: '1px solid #e0e0e0', borderRadius: '6px', padding: '16px', marginBottom: '14px' }}>
                <legend style={{ fontWeight: 'bold', color: '#1976d2', padding: '0 8px' }}>🏍️ Operacional</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div><label style={s.label}>Placa</label><input type="text" placeholder="ABC-1234" value={formData.placa || ''} onChange={e => setFormData({ ...formData, placa: e.target.value.toUpperCase() })} style={s.input} /></div>
                  <div>
                    <label style={s.label}>Status</label>
                    <select value={formData.ativo ? 'true' : 'false'} onChange={e => setFormData({ ...formData, ativo: e.target.value === 'true' })} style={s.select}>
                      <option value="true">Ativo</option><option value="false">Inativo</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={s.btn('#43a047')}>{editandoId ? '💾 Salvar' : '✅ Cadastrar'}</button>
                {editandoId && <button type="button" onClick={resetForm} style={s.btn('#9e9e9e')}>✕ Cancelar</button>}
              </div>
            </form>
          </div>
        )}

      </div>
      <Footer showLinks={true} />
    </div>
  );
};

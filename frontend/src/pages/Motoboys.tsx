import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';

/* ─── Interfaces ─────────────────────────────────────────────────────────── */

interface Motoboy {
  id: string;
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

/**
 * Preenche o controle diário de um motoboy com base nas saídas do período.
 * - Saídas com viagens > 0 alimentam entDia/entNoite.
 * - Saídas com valor > 0 (pagamento) alimentam pgto.
 * - Saídas com caixinha > 0 alimentam caixinhaDia/caixinhaNoite.
 * - Para Freelancers: vlVariavel = (valorEntrega × totalViagens) + totalCaixinha
 * - Para CLT: vlVariavel preserva o valor manual se não houver saídas no dia
 */
function preencherControleComSaidas(
  linhasBase: ControleDia[],
  saidas: Saida[],
  motoboyId: string,
  motoboy?: Motoboy
): ControleDia[] {
  const isFreelancer = motoboy?.vinculo === 'Freelancer';
  const valorEntrega    = R(motoboy?.valorEntrega);
  // Chegada por turno (usa valorChegadaDia/Noite; fallback em valorChegada p/ retrocompat)
  const vChegadaDia   = R(motoboy?.valorChegadaDia   ?? motoboy?.valorChegada);
  const vChegadaNoite = R(motoboy?.valorChegadaNoite ?? motoboy?.valorChegada);

  // Saídas do motoboy
  const saidasMoto = saidas.filter(s => s.colaboradorId === motoboyId);

  return linhasBase.map(linha => {
    const saidasDoDia = saidasMoto.filter(s => s.data === linha.data);

    const saidasDia      = saidasDoDia.filter(s => normalizeTurno(s.turno) === 'dia');
    const saidasNoite    = saidasDoDia.filter(s => normalizeTurno(s.turno) === 'noite');
    const saidasSemTurno = saidasDoDia.filter(s => normalizeTurno(s.turno) === '');

    // Viagens por turno
    const entDia   = saidasDia.reduce((sum, s) => sum + R(s.viagens), 0);
    const entNoite = saidasNoite.reduce((sum, s) => sum + R(s.viagens), 0);
    const totalViagens = entDia + entNoite;

    // Caixinha por turno + extras sem turno
    const caixinhaDia   = saidasDia.reduce((sum, s) => sum + R(s.caixinha), 0);
    const caixinhaNoite = saidasNoite.reduce((sum, s) => sum + R(s.caixinha), 0);
    const caixinhaExtra = saidasSemTurno.reduce((sum, s) => sum + R(s.caixinha), 0);
    const totalCaixinha = caixinhaDia + caixinhaNoite + caixinhaExtra;

    // Pagamentos (valor em dinheiro/pix) — soma de todos os turnos
    const pgto = saidasDoDia
      .filter(s => R(s.valor) > 0)
      .reduce((sum, s) => sum + R(s.valor), 0);

    const hasData    = saidasDoDia.length > 0;
    const hasDia     = saidasDia.length > 0 || saidasSemTurno.length > 0;
    const hasNoite   = saidasNoite.length > 0;

    // Chegada fixa por turno (Freelancer)
    const chegadaDia   = isFreelancer && hasDia   && vChegadaDia   > 0 ? vChegadaDia   : 0;
    const chegadaNoite = isFreelancer && hasNoite && vChegadaNoite > 0 ? vChegadaNoite : 0;

    // vlVariavel:
    //  • Freelancer: chegadas + (valorEntrega × viagens) + caixinha do dia
    //  • CLT: caixinha do dia (bônus extra sobre o salário fixo)
    let vlVariavel: number;
    if (hasData) {
      if (isFreelancer) {
        vlVariavel = parseFloat((
          chegadaDia + chegadaNoite + (valorEntrega * totalViagens) + totalCaixinha
        ).toFixed(2));
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

  // Modo de visualização do controle
  const [modoVisualizacao, setModoVisualizacao] = useState<'integrado' | 'manual'>('integrado');
  const [mostrarSaidas, setMostrarSaidas] = useState(false);

  useEffect(() => { fetchMotoboys(); }, [unitId]);

  const fetchMotoboys = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      // Load from both /motoboys table AND from /colaboradores (funcao=Motoboy)
      const [rM, rC] = await Promise.all([
        fetch(unitId ? `${apiUrl}/motoboys?unitId=${unitId}` : `${apiUrl}/motoboys`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      const dM = await rM.json();
      const motosDB: Motoboy[] = Array.isArray(dM) ? dM : [];
      // Also get motoboys from colaboradores table (funcao or cargo = Motoboy/Entregador)
      let motosFromColabs: Motoboy[] = [];
      if (rC?.ok) {
        const dC = await rC.json();
        const colabs = Array.isArray(dC) ? dC : [];
        motosFromColabs = colabs
          .filter((c: any) => {
            const fn = (c.funcao || c.cargo || '').toLowerCase();
            return fn.includes('motoboy') || fn.includes('entregador');
          })
          .filter((c: any) => !motosDB.some(m => m.id === c.id || m.cpf === c.cpf))
          .map((c: any): Motoboy => ({
            id: c.id, nome: c.nome, cpf: c.cpf,
            telefone: c.celular || c.telefone || '',
            placa: c.placa || '',
            dataAdmissao: c.dataAdmissao,
            dataDemissao: c.dataDemissao,
            comissao: c.comissao || 0,
            chavePix: c.chavePix || '',
            unitId: c.unitId,
            vinculo: c.tipoContrato === 'Freelancer' ? 'Freelancer' : 'CLT',
            salario: c.salario || 0,
            periculosidade: c.periculosidade || 30,
            valorChegadaDia:   R(c.valorChegadaDia)   || R(c.valorChegada) || 0,
            valorChegadaNoite: R(c.valorChegadaNoite) || R(c.valorChegada) || 0,
            valorEntrega: R(c.valorEntrega) || 0,
            ativo: c.ativo !== false,
          }));
      }
      setMotoboys([...motosDB, ...motosFromColabs]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  /* ── Buscar saídas do período ─────────────────────────── */
  const fetchSaidas = useCallback(async (mesAno: string) => {
    if (!unitId || !mesAno) return;
    setLoadingSaidas(true);
    try {
      const token = localStorage.getItem('auth_token');
      const [ano, mes] = mesAno.split('-').map(Number);
      const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const fim = new Date(ano, mes, 0).toISOString().split('T')[0];
      const r = await fetch(
        `${apiUrl}/saidas?unitId=${unitId}&dataInicio=${inicio}&dataFim=${fim}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const d = await r.json();
      setSaidas(Array.isArray(d) ? d : []);
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
      if (Array.isArray(d) && d.length > 0) {
        // Usa dados salvos como base
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
        linhasBase = dias.map(data => ({
          motoboyId: ctrlMotoboyId, data,
          diaSemana: diaSemana(data), salDia,
          entDia: 0, caixinhaDia: 0, chegadaDia: 0, entNoite: 0, caixinhaNoite: 0, chegadaNoite: 0,
          vlVariavel: 0, pgto: 0, variavel: 0, unitId,
        }));
      }

      // Integrar com saídas (passa motoboy para calcular vlVariavel correto por vínculo)
      const linhasIntegradas = preencherControleComSaidas(linhasBase, saidas, ctrlMotoboyId, motoboy);
      setControle(linhasIntegradas);
    } catch (e) { console.error(e); setControle([]); }
    finally { setLoadingCtrl(false); }
  }, [ctrlMotoboyId, ctrlMesAno, unitId, apiUrl, motoboys, saidas]);

  // Carregar saídas ao mudar mês
  useEffect(() => {
    if (aba === 'controle') fetchSaidas(ctrlMesAno);
  }, [ctrlMesAno, aba, fetchSaidas]);

  // Carregar controle quando motoboy ou saídas mudam
  useEffect(() => {
    if (aba === 'controle' && ctrlMotoboyId && !loadingSaidas) fetchControle();
  }, [ctrlMotoboyId, ctrlMesAno, aba, loadingSaidas]);

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
    const linhasIntegradas = preencherControleComSaidas(linhasBase, saidas, ctrlMotoboyId, motoboyObj);
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
    const totalChegadaDia   = controleComAcumulado.reduce((s, l) => s + R((l as any).chegadaDia),   0);
    const totalChegadaNoite = controleComAcumulado.reduce((s, l) => s + R((l as any).chegadaNoite), 0);
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
    return saidas
      .filter(s => s.colaboradorId === ctrlMotoboyId)
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [saidas, ctrlMotoboyId]);

  /* ── CRUD motoboys ───────────────────────────────────── */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.cpf || !formData.telefone) { alert('Nome, CPF e Telefone são obrigatórios.'); return; }
    try {
      const token = localStorage.getItem('auth_token');
      const isEdit = !!editandoId;
      const payload = { ...formData, unitId };
      let url = isEdit ? `${apiUrl}/motoboys/${editandoId}` : `${apiUrl}/motoboys`;
      let method: string = isEdit ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        alert(isEdit ? 'Motoboy atualizado!' : 'Motoboy cadastrado!');
        resetForm(); setAba('lista'); fetchMotoboys();
      } else {
        const err = await r.json().catch(() => ({}));
        // Se PUT retornou 404 (motoboy veio de /colaboradores, não existe em /motoboys)
        // recria como novo registro preservando o id original
        if (isEdit && r.status === 404) {
          const r2 = await fetch(`${apiUrl}/motoboys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ...payload, id: editandoId }),
          });
          if (r2.ok) {
            alert('Motoboy salvo com sucesso!');
            resetForm(); setAba('lista'); fetchMotoboys();
            return;
          }
          const err2 = await r2.json().catch(() => ({}));
          alert('Erro ao salvar: ' + (err2.error || r2.status));
        } else {
          alert('Erro: ' + (err.error || r.status));
        }
      }
    } catch (e) { alert('Erro ao salvar'); }
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
                  const hasChegada = resumoCtrl.vChegadaDia > 0 || resumoCtrl.vChegadaNoite > 0;
                  const cardsFreelancer = isFreelancer && (hasChegada || resumoCtrl.vEntrega > 0) ? [
                    ...(resumoCtrl.vChegadaDia > 0 ? [{ label: `Ch.Dia (R$${fmt(resumoCtrl.vChegadaDia)}/turno)`, val: `R$ ${fmt(resumoCtrl.totalChegadaDia)}`, cor: '#e65100' }] : []),
                    ...(resumoCtrl.vChegadaNoite > 0 ? [{ label: `Ch.Noite (R$${fmt(resumoCtrl.vChegadaNoite)}/turno)`, val: `R$ ${fmt(resumoCtrl.totalChegadaNoite)}`, cor: '#7b1fa2' }] : []),
                    ...(resumoCtrl.vEntrega > 0 ? [{ label: `Entregas (${resumoCtrl.totalViagens}× R$${fmt(resumoCtrl.vEntrega)})`, val: `R$ ${fmt(resumoCtrl.totalEntregas)}`, cor: '#0288d1' }] : []),
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

                {/* Tabela diária */}
                {(() => {
                  const motoboyCtrl = motoboys.find(m => m.id === ctrlMotoboyId);
                  const isFreelancerCtrl = motoboyCtrl?.vinculo === 'Freelancer';
                  const showChegada = isFreelancerCtrl && (
                    R(motoboyCtrl?.valorChegadaDia ?? motoboyCtrl?.valorChegada) > 0 ||
                    R(motoboyCtrl?.valorChegadaNoite ?? motoboyCtrl?.valorChegada) > 0
                  );
                  return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        {[
                          'Data', 'Dia', 'Sal.+Per.',
                          'Ent. Dia', 'Caix. Dia',
                          ...(showChegada ? ['Ch. Dia'] : []),
                          'Ent. Noite', 'Caix. Noite',
                          ...(showChegada ? ['Ch. Noite'] : []),
                          'Vl. Variável', 'Pgto', 'Var. Acum.',
                          ...(mostrarSaidas ? ['Saídas Dia', 'Saídas Noite'] : [])
                        ].map(h => <th key={h} style={s.th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {controleComAcumulado.map((l, idx) => {
                        const dow = l.diaSemana ?? diaSemana(l.data);
                        const folga = dow === 0 || dow === 1;
                        const temDados = (l.saidasDia && l.saidasDia.length > 0) || (l.saidasNoite && l.saidasNoite.length > 0);
                        const rowBg = temDados ? '#f0fff4' : folga ? '#f5f5f5' : idx % 2 === 0 ? '#fafff8' : 'white';
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
                            {/* Campos editáveis ou só-leitura conforme modo */}
                            {modoVisualizacao === 'manual' ? (
                              (['entDia', 'caixinhaDia', 'entNoite', 'caixinhaNoite', 'vlVariavel', 'pgto'] as const).map(campo => (
                                <td key={campo} style={s.td}>
                                  <input
                                    type="number" step="0.01" min="0"
                                    style={s.numInput}
                                    value={(l as any)[campo] || ''}
                                    onChange={e => handleCampoControle(idx, campo, e.target.value)}
                                    onFocus={e => e.target.select()}
                                    placeholder="0"
                                  />
                                </td>
                              ))
                            ) : (
                              <>
                                <td style={{ ...s.td, textAlign: 'center' as const }}>
                                  {R(l.entDia) > 0 ? <strong style={{ color: '#0288d1' }}>{l.entDia}</strong> : <span style={{ color: '#ccc' }}>-</span>}
                                </td>
                                <td style={{ ...s.td, textAlign: 'center' as const }}>
                                  {R(l.caixinhaDia) > 0 ? <strong style={{ color: '#00838f' }}>{fmt(l.caixinhaDia)}</strong> : <span style={{ color: '#ccc' }}>-</span>}
                                </td>
                                {showChegada && (
                                  <td style={{ ...s.td, textAlign: 'center' as const }}>
                                    {R((l as any).chegadaDia) > 0 ? <strong style={{ color: '#e65100' }}>R${fmt(R((l as any).chegadaDia))}</strong> : <span style={{ color: '#ccc' }}>-</span>}
                                  </td>
                                )}
                                <td style={{ ...s.td, textAlign: 'center' as const }}>
                                  {R(l.entNoite) > 0 ? <strong style={{ color: '#7b1fa2' }}>{l.entNoite}</strong> : <span style={{ color: '#ccc' }}>-</span>}
                                </td>
                                <td style={{ ...s.td, textAlign: 'center' as const }}>
                                  {R(l.caixinhaNoite) > 0 ? <strong style={{ color: '#00838f' }}>{fmt(l.caixinhaNoite)}</strong> : <span style={{ color: '#ccc' }}>-</span>}
                                </td>
                                {showChegada && (
                                  <td style={{ ...s.td, textAlign: 'center' as const }}>
                                    {R((l as any).chegadaNoite) > 0 ? <strong style={{ color: '#7b1fa2' }}>R${fmt(R((l as any).chegadaNoite))}</strong> : <span style={{ color: '#ccc' }}>-</span>}
                                  </td>
                                )}
                                <td style={s.td}>
                                  <input
                                    type="number" step="0.01" min="0"
                                    style={s.numInput}
                                    value={R(l.vlVariavel) || ''}
                                    onChange={e => handleCampoControle(idx, 'vlVariavel', e.target.value)}
                                    onFocus={e => e.target.select()}
                                    placeholder="0"
                                  />
                                </td>
                                <td style={{ ...s.td }}>
                                  {R(l.pgto) > 0 ? (
                                    <span style={{ color: '#fb8c00', fontWeight: 'bold' }}>R$ {fmt(l.pgto)}</span>
                                  ) : <span style={{ color: '#ccc' }}>-</span>}
                                </td>
                              </>
                            )}
                            <td style={{ ...s.td, fontWeight: 'bold', color: '#2e7d32' }}>{fmt(l.variavel)}</td>
                            {mostrarSaidas && (
                              <>
                                <td style={{ ...s.td, fontSize: '11px', color: '#0288d1', maxWidth: '200px' }}>
                                  {(l.saidasDia || []).map(s => (
                                    <div key={s.id}>{s.viagens ? `${s.viagens}viag` : ''} {s.valor ? `R$${s.valor.toFixed(2)}` : ''} {s.descricao || ''}</div>
                                  ))}
                                </td>
                                <td style={{ ...s.td, fontSize: '11px', color: '#7b1fa2', maxWidth: '200px' }}>
                                  {(l.saidasNoite || []).map(s => (
                                    <div key={s.id}>{s.viagens ? `${s.viagens}viag` : ''} {s.valor ? `R$${s.valor.toFixed(2)}` : ''} {s.descricao || ''}</div>
                                  ))}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                        <td style={{ padding: '8px 6px', fontSize: '12px' }} colSpan={3}>TOTAL</td>
                        <td style={{ padding: '8px 6px', fontSize: '12px' }}>{controleComAcumulado.reduce((s, l) => s + R(l.entDia), 0)}</td>
                        <td style={{ padding: '8px 6px', fontSize: '12px' }}>{fmt(controleComAcumulado.reduce((s, l) => s + R(l.caixinhaDia), 0))}</td>
                        {showChegada && <td style={{ padding: '8px 6px', fontSize: '12px', color: '#ffcc80' }}>{fmt(resumoCtrl.totalChegadaDia)}</td>}
                        <td style={{ padding: '8px 6px', fontSize: '12px' }}>{controleComAcumulado.reduce((s, l) => s + R(l.entNoite), 0)}</td>
                        <td style={{ padding: '8px 6px', fontSize: '12px' }}>{fmt(controleComAcumulado.reduce((s, l) => s + R(l.caixinhaNoite), 0))}</td>
                        {showChegada && <td style={{ padding: '8px 6px', fontSize: '12px', color: '#ffcc80' }}>{fmt(resumoCtrl.totalChegadaNoite)}</td>}
                        <td style={{ padding: '8px 6px', fontSize: '12px', color: '#a5d6a7' }}>{fmt(resumoCtrl.totalVariavel)}</td>
                        <td style={{ padding: '8px 6px', fontSize: '12px', color: '#ffcc80' }}>{fmt(resumoCtrl.totalPgto)}</td>
                        <td style={{ padding: '8px 6px', fontSize: '12px', color: '#a5d6a7' }}>{fmt(controleComAcumulado[controleComAcumulado.length - 1]?.variavel || 0)}</td>
                        {mostrarSaidas && <td colSpan={2} />}
                      </tr>
                    </tfoot>
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

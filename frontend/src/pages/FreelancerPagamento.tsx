/**
 * FreelancerPagamento.tsx
 *
 * Módulo dedicado ao pagamento e auditoria de Freelancers.
 * Separado da FolhaPagamento (que agora trata apenas CLT).
 *
 * Visão em dois modos:
 *  - "Pagar" (default): grade de fechamentos semanais com ação de confirmar pagamento
 *  - "Auditoria": tabela estilo Extrato com grupos expansíveis + sub-linhas de turnos,
 *                 descontos, adiantamento especial e log de PIX
 *
 * Rota: /modulos/freelancer-pagamento
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

/* ─── Helpers ───────────────────────────────────────────────────────────── */
const R = (v: any): number => {
  const n = parseFloat(String(v ?? 0).replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
const fmtMoeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDataBR = (iso: string): string => {
  if (!iso) return '—';
  try {
    return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
      .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
};
const fmtDiaMes = (iso: string): string => {
  if (!iso || iso.length < 10) return iso;
  return `${iso.substring(8, 10)}/${iso.substring(5, 7)}`;
};
const fmtDiaSemana = (iso: string): string => {
  if (!iso) return '';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' });
  } catch { return ''; }
};

/* ─── extrairAuditoria: Opção B (campo estruturado) ou A (regex no obs) ── */
const extrairAuditoria = (raw: any, totalBruto: number): {
  bruto: number; descSaidas: number; abatEsp: number; liquido: number; temCampoEstruturado: boolean;
} => {
  if (raw?.valorLiquido !== undefined && raw.valorLiquido !== null) {
    return {
      bruto:      R(raw.valorBruto)      || totalBruto,
      descSaidas: R(raw.valorDescSaidas) || 0,
      abatEsp:    R(raw.valorAbatEsp)    || 0,
      liquido:    R(raw.valorLiquido),
      temCampoEstruturado: true,
    };
  }
  const obs: string = raw?.obsAudit || raw?.obs || '';
  const matchDesc = obs.match(/Desc\. sa[íi]das:\s*R[$]\s*([\d.,]+)/i);
  const matchAbat = obs.match(/Abat\. adto\.esp\.:\s*R[$]\s*([\d.,]+)/i);
  const matchLiq  = obs.match(/L[íi]quido:\s*R[$]\s*([\d.,]+)/i);
  const pBR = (s: string) => R(s.replace(/\./g, '').replace(',', '.'));
  const descSaidas = matchDesc ? pBR(matchDesc[1]) : 0;
  const abatEsp    = matchAbat ? pBR(matchAbat[1]) : 0;
  const liquido    = matchLiq  ? pBR(matchLiq[1])  : Math.max(0, totalBruto - descSaidas - abatEsp);
  return { bruto: totalBruto, descSaidas, abatEsp, liquido, temCampoEstruturado: false };
};

/* ─── Interfaces ─────────────────────────────────────────────────────────── */
interface PagamentoLog {
  id: string;
  data: string;
  valor: number;
  forma: 'PIX' | 'Dinheiro' | 'Misto';
  valorPix?: number;
  valorDinheiro?: number;
  tipo: 'Adiantamento' | 'Variável' | 'Outro';
  obs?: string;
}

interface GrupoFreelancer {
  /** id do grupo: grp__{colabId}__{semana}__{pagamentoId} */
  id: string;
  colaboradorId: string;
  nomeColaborador: string;
  chavePix?: string;
  telefone?: string;
  semana: string;                     // YYYY-MM-DD fim de semana
  semanaLabel: string;                // "19/05 – 25/05"
  mes: string;
  pagamentoId: string | null;
  pago: boolean;
  pagoParcial: boolean;
  diasDobras: any[];                  // registros individuais Dia/Noite
  diasTransp: any[];                  // registros transporte-freelancer
  totalDobras: number;
  totalTransp: number;
  totalGrupo: number;
  dataPagamento: string | null;
  formaPagamento: string;
  confiabilidade: 'real' | 'recalculado' | 'legado';
  // Campos Opção B (propagados do POST)
  valorLiquido: number | null;
  valorDescSaidas: number | null;
  valorAbatEsp: number | null;
  obsAudit: string;
  logPagamentos: PagamentoLog[];
  raw: any;
}

/* ─── Component ──────────────────────────────────────────────────────────── */
const FreelancerPagamento: React.FC = () => {
  const navigate = useNavigate();
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const unitId   = activeUnit?.id || (user as any)?.unitId || localStorage.getItem('unit_id') || '';
  const apiUrl   = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
  const token    = () => localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
  const auth     = { headers: { Authorization: `Bearer ${token()}` } };

  /* ── State ── */
  const hoje = new Date();
  const [mesAno, setMesAno]       = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [aba, setAba]             = useState<'pagar' | 'auditoria'>('pagar');
  const [loading, setLoading]     = useState(false);
  const [grupos, setGrupos]       = useState<GrupoFreelancer[]>([]);
  const [saidasAll, setSaidasAll] = useState<any[]>([]);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [filtroPago, setFiltroPago] = useState<'todos' | 'pago' | 'pendente'>('todos');
  const [filtroColab, setFiltroColab] = useState('');

  /* ── Helpers de semana ── */
  const semanasFechamento = (ano: number, mes: number): { inicio: Date; fim: Date }[] => {
    const semanas: { inicio: Date; fim: Date }[] = [];
    const primeiro = new Date(ano, mes - 1, 1);
    const ultimo   = new Date(ano, mes, 0);
    let cur = new Date(primeiro);
    while (cur <= ultimo) {
      const inicio = new Date(cur);
      const fim    = new Date(cur);
      while (fim.getDay() !== 0 && fim < ultimo) fim.setDate(fim.getDate() + 1);
      semanas.push({ inicio, fim: new Date(Math.min(fim.getTime(), ultimo.getTime())) });
      cur = new Date(fim);
      cur.setDate(cur.getDate() + 1);
    }
    return semanas;
  };
  const isoDate = (d: Date) => d.toISOString().split('T')[0];

  /* ── Fetch ── */
  const carregar = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setExpandidos(new Set());
    try {
      const [ano, mes] = mesAno.split('-').map(Number);
      const dataInicio = `${mesAno}-01`;
      const dataFim    = new Date(ano, mes, 0).toISOString().split('T')[0];

      /* Mês anterior para saídas pendentes */
      const mesAnt = mes === 1
        ? `${ano - 1}-12`
        : `${ano}-${String(mes - 1).padStart(2, '0')}`;
      const dataInicioAnt = `${mesAnt}-01`;
      const dataFimAnt    = new Date(ano, mes - 1, 0).toISOString().split('T')[0];

      /* ── Fetches paralelos ── */
      const [rFolha, rEscalas, rColabs, rSaidas, rSaidasAnt] = await Promise.all([
        fetch(`${apiUrl}/folha-pagamento?mes=${mesAno}&unitId=${unitId}`, auth).catch(() => null),
        fetch(`${apiUrl}/escalas?unitId=${unitId}&mes=${mesAno}`, auth).catch(() => null),
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, auth).catch(() => null),
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataInicio}&dataFim=${dataFim}`, auth).catch(() => null),
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataInicioAnt}&dataFim=${dataFimAnt}`, auth).catch(() => null),
      ]);

      const rawFolha:   any[] = (rFolha   && rFolha.ok)   ? await rFolha.json()   : [];
      const rawEscalas: any[] = (rEscalas && rEscalas.ok) ? await rEscalas.json() : [];
      const rawColabs:  any[] = (rColabs  && rColabs.ok)  ? await rColabs.json()  : [];
      const rawSaidas:  any[] = (rSaidas  && rSaidas.ok)  ? await rSaidas.json()  : [];
      const rawSaidasAnt: any[] = (rSaidasAnt && rSaidasAnt.ok) ? await rSaidasAnt.json() : [];

      setSaidasAll([...rawSaidas, ...rawSaidasAnt]);

      /* ── Filtros base ── */
      const isMigrado   = (i: any) => i.migrado   === true || i.migrado   === 'True'   || i.migrado   === 'true';
      const isEstornado = (i: any) => i.estornado === true || i.estornado === 'True'   || i.estornado === 'true';

      /* ── Registros granulares JÁ SALVOS no DB ── */
      const granulares = rawFolha.filter(i =>
        i.tipo === 'freelancer-dia' && i.data && !isEstornado(i) && !isMigrado(i)
      );

      /* ── Index: colabId → Set<"data-turno"> já pago ── */
      const turnosPagosPorColab: Record<string, Set<string>> = {};
      for (const reg of granulares) {
        if (!reg.colaboradorId || !reg.data) continue;
        const cid = reg.colaboradorId;
        if (!turnosPagosPorColab[cid]) turnosPagosPorColab[cid] = new Set();
        if (reg.pago) {
          const turnos = reg.turno === 'DiaNoite'
            ? ['Dia', 'Noite']
            : [reg.turno || 'Dia'];
          for (const t of turnos) turnosPagosPorColab[cid].add(`${reg.data}-${t}`);
        }
      }

      /* ── Index: colabId → Set<"data-turno"> pendente (salvo no DB mas não pago) ── */
      const turnosPendentesPorColab: Record<string, Set<string>> = {};
      for (const reg of granulares) {
        if (!reg.colaboradorId || !reg.data || reg.pago) continue;
        const cid = reg.colaboradorId;
        if (!turnosPendentesPorColab[cid]) turnosPendentesPorColab[cid] = new Set();
        const turnos = reg.turno === 'DiaNoite'
          ? ['Dia', 'Noite']
          : [reg.turno || 'Dia'];
        for (const t of turnos) turnosPendentesPorColab[cid].add(`${reg.data}-${t}`);
      }

      /* ── Freelancers: colaboradores com tipoContrato = 'freelancer' ── */
      const freelancersColabs = rawColabs.filter((c: any) =>
        (c.tipoContrato || '').toLowerCase() === 'freelancer'
      );

      /* ── Calcular semanas do mês ── */
      const semanas = semanasFechamento(ano, mes);

      /* ── Para cada freelancer × semana, gerar grupo a partir das escalas ── */
      const result: GrupoFreelancer[] = [];

      for (const colab of freelancersColabs) {
        const cid = colab.id;
        const isTurnoPago   = (data: string, turno: string) =>
          (turnosPagosPorColab[cid]   || new Set()).has(`${data}-${turno}`);
        const isTurnoPendDB = (data: string, turno: string) =>
          (turnosPendentesPorColab[cid] || new Set()).has(`${data}-${turno}`);

        for (const { inicio, fim } of semanas) {
          const isoIni = isoDate(inicio);
          const isoFim = isoDate(fim);

          /* Escalas desta semana para este freelancer */
          const escsSemana = rawEscalas.filter((e: any) =>
            e.colaboradorId === cid &&
            e.data >= isoIni && e.data <= isoFim
          );

          /* Turnos confirmados (presença = 'presente') */
          const turnosPresentes: { data: string; turno: string; valor: number }[] = [];
          for (const esc of escsSemana) {
            const vDia   = parseFloat(colab.valorDia   || '0') || 0;
            const vNoite = parseFloat(colab.valorNoite || '0') || 0;

            if (esc.turno === 'DiaNoite') {
              const pDia   = esc.presenca       === 'presente';
              const pNoite = esc.presencaNoite  === 'presente';
              if (pDia)   turnosPresentes.push({ data: esc.data, turno: 'Dia',   valor: vDia   || 120 });
              if (pNoite) turnosPresentes.push({ data: esc.data, turno: 'Noite', valor: vNoite || 120 });
            } else if (esc.turno === 'Noite') {
              const p = esc.presencaNoite === 'presente' || esc.presenca === 'presente';
              if (p) turnosPresentes.push({ data: esc.data, turno: 'Noite', valor: vNoite || 120 });
            } else {
              /* Dia ou genérico */
              if (esc.presenca === 'presente') {
                turnosPresentes.push({ data: esc.data, turno: esc.turno || 'Dia', valor: vDia || 120 });
              }
            }
          }

          /* Turno pendentes = confirmados e NÃO pagos */
          const turnosPendentes = turnosPresentes.filter(t => !isTurnoPago(t.data, t.turno));

          /* Registros do DB para esta semana (para campos Opção B e pagamentoId) */
          const regsSemana = granulares.filter((r: any) =>
            r.colaboradorId === cid &&
            r.data >= isoIni && r.data <= isoFim
          );
          const regsPagos = regsSemana.filter((r: any) => r.pago);
          const regsPendentes = regsSemana.filter((r: any) => !r.pago);

          /* Transporte: soma registros com tipoCodigo = 'transporte-freelancer' */
          const diasTranspDB = granulares.filter((r: any) =>
            r.colaboradorId === cid &&
            r.data >= isoIni && r.data <= isoFim &&
            r.tipoCodigo === 'transporte-freelancer'
          );
          const totalTransp = diasTranspDB.reduce((s: number, d: any) => s + (parseFloat(d.valor) || 0), 0);

          /* Montar diasDobras: prioridade DB, fallback escalas */
          let diasDobrasFinais: any[];
          if (regsSemana.filter((r: any) => r.tipoCodigo !== 'transporte-freelancer').length > 0) {
            /* DB tem dados → usar DB */
            diasDobrasFinais = regsSemana.filter((r: any) => r.tipoCodigo !== 'transporte-freelancer');
          } else {
            /* Sem dados no DB → usar escalas calculadas */
            diasDobrasFinais = turnosPresentes.map(t => ({
              id: `esc_${cid}_${t.data}_${t.turno}`,
              colaboradorId: cid,
              nomeColaborador: colab.nome,
              data: t.data,
              turno: t.turno,
              valor: t.valor,
              pago: false,
              semana: isoFim,
              confiabilidade: 'estimado',
              _deEscala: true,
            }));
          }

          /* Pular semanas sem dados (nem DB nem escalas confirmadas) */
          if (diasDobrasFinais.length === 0 && diasTranspDB.length === 0) continue;

          /* Status de pagamento */
          const algumPago  = regsPagos.length > 0 || turnosPresentes.some(t => isTurnoPago(t.data, t.turno));
          const todosPagos = turnosPendentes.length === 0 && !turnosPendentes.some(t => isTurnoPendDB(t.data, t.turno));
          const pago = todosPagos && algumPago && diasDobrasFinais.length > 0;
          const pagoParcial = algumPago && !todosPagos;

          /* Valores */
          const totalDobras = diasDobrasFinais
            .filter((d: any) => d.tipoCodigo !== 'transporte-freelancer')
            .reduce((s: number, d: any) => s + (parseFloat(d.valor) || 0), 0);
          const totalGrupo = totalDobras + totalTransp;

          /* Campos Opção B: pegar do registro com valorLiquido */
          const refComAudit = [...regsPagos, ...regsPendentes].find((r: any) =>
            r.valorLiquido !== undefined && r.valorLiquido !== null
          ) || regsPagos[0] || regsPendentes[0] || null;

          /* pagamentoId do lote */
          const refPgtoId = regsPagos[0]?.pagamentoId || regsPendentes[0]?.pagamentoId || null;
          const dataPgto  = regsPagos[0]?.dataPagamento || null;

          /* Semana label */
          const semLabel = `${fmtDiaMes(isoIni)} – ${fmtDiaMes(isoFim)}`;
          const confiab: 'real' | 'recalculado' | 'legado' =
            regsSemana.some((r: any) => r.reconstituido) ? 'recalculado'
            : regsSemana.length > 0 ? 'real'
            : 'legado';

          result.push({
            id: `grp__${cid}__${isoFim}`,
            colaboradorId: cid,
            nomeColaborador: colab.nome || cid,
            chavePix: colab.chavePix,
            telefone: colab.telefone || colab.celular,
            semana: isoFim,
            semanaLabel: semLabel,
            mes: mesAno,
            pagamentoId: refPgtoId,
            pago,
            pagoParcial,
            diasDobras: diasDobrasFinais,
            diasTransp: diasTranspDB,
            totalDobras,
            totalTransp,
            totalGrupo,
            dataPagamento: dataPgto,
            formaPagamento: refComAudit?.formaPagamento || colab.formaPagamento || 'PIX',
            confiabilidade: confiab,
            valorLiquido:    refComAudit?.valorLiquido    ?? null,
            valorDescSaidas: refComAudit?.valorDescSaidas ?? null,
            valorAbatEsp:    refComAudit?.valorAbatEsp    ?? null,
            obsAudit:        refComAudit?.obs             || '',
            logPagamentos:   refComAudit?.logPagamentos   || [],
            raw: {
              diasDobras: diasDobrasFinais,
              diasTransp: diasTranspDB,
              valorLiquido:    refComAudit?.valorLiquido    ?? null,
              valorDescSaidas: refComAudit?.valorDescSaidas ?? null,
              valorAbatEsp:    refComAudit?.valorAbatEsp    ?? null,
              obsAudit:        refComAudit?.obs             || '',
            },
          } as GrupoFreelancer);
        }
      }

      /* ── Grupos do DB com pagamentoId explícito (lotes granulares processados) ── */
      /* Mesclar: se já existe grupo da escala para mesma semana+colab, atualizar com dados do DB */
      const grpPorChave: Record<string, GrupoFreelancer> = {};
      for (const g of result) grpPorChave[g.id] = g;

      /* Adicionar grupos do DB que não vieram de escalas (freelancers sem tipoContrato='freelancer' no colab) */
      const grpMap: Record<string, any[]> = {};
      for (const reg of granulares) {
        const semFim = reg.semana || reg.data?.substring(0, 10) || '';
        const key = reg.pagamentoId
          ? `pgto__${reg.pagamentoId}`
          : `sem__${reg.colaboradorId}__${semFim}`;
        if (!grpMap[key]) grpMap[key] = [];
        grpMap[key].push(reg);
      }

      for (const [, dias] of Object.entries(grpMap)) {
        const ref = dias[0];
        const cid = ref.colaboradorId;
        const semFim = ref.semana || ref.data?.substring(0, 10) || '';
        const grpKey = `grp__${cid}__${semFim}`;

        /* Se já existe grupo calculado das escalas, pular (já tem os dados) */
        if (grpPorChave[grpKey]) continue;
        /* Se o colaborador é freelancer mas a semana caiu fora do mês atual, incluir */

        const pagos = dias.filter(d => d.pago === true);
        const pends = dias.filter(d => d.pago !== true);
        const algumPago  = pagos.length > 0;
        const todosPagos = pends.length === 0;
        const diasDobras = dias.filter(d =>
          !d.tipoCodigo || d.tipoCodigo === 'freelancer-dia' || d.tipoCodigo === 'freelancer-noite'
        );
        const diasTransp = dias.filter(d => d.tipoCodigo === 'transporte-freelancer');
        const totalDobras = diasDobras.reduce((s, d) => s + (parseFloat(d.valor) || 0), 0);
        const totalTransp = diasTransp.reduce((s, d) => s + (parseFloat(d.valor) || 0), 0);
        const totalGrupo  = totalDobras + totalTransp;
        const refComAudit = dias.find((d: any) => d.valorLiquido !== undefined && d.valorLiquido !== null)
          || dias.find((d: any) => /L[íi]quido/i.test(d.obs || ''))
          || ref;

        const semFimD = semFim ? new Date(semFim + 'T12:00:00') : null;
        const semIniD = semFimD ? new Date(semFimD) : null;
        if (semIniD) semIniD.setDate(semIniD.getDate() - 6);
        const semLabel = semIniD
          ? `${fmtDiaMes(semIniD.toISOString().split('T')[0])} – ${fmtDiaMes(semFim)}`
          : semFim;

        /* Buscar nome no colab */
        const colab = rawColabs.find((c: any) => c.id === cid);

        result.push({
          id: grpKey,
          colaboradorId: cid,
          nomeColaborador: colab?.nome || ref.nomeColaborador || cid,
          chavePix: colab?.chavePix || ref.chavePix,
          telefone: colab?.telefone || colab?.celular || ref.telefone,
          semana: semFim,
          semanaLabel: semLabel,
          mes: ref.mes || mesAno,
          pagamentoId: ref.pagamentoId || null,
          pago: todosPagos && algumPago,
          pagoParcial: algumPago && !todosPagos,
          diasDobras,
          diasTransp,
          totalDobras,
          totalTransp,
          totalGrupo,
          dataPagamento: pagos[0]?.dataPagamento || null,
          formaPagamento: ref.formaPagamento || 'PIX',
          confiabilidade: dias.some((d: any) => d.reconstituido) ? 'recalculado' : 'real',
          valorLiquido:    refComAudit.valorLiquido    ?? null,
          valorDescSaidas: refComAudit.valorDescSaidas ?? null,
          valorAbatEsp:    refComAudit.valorAbatEsp    ?? null,
          obsAudit:        refComAudit.obs             || '',
          logPagamentos:   ref.logPagamentos           || [],
          raw: {
            diasDobras, diasTransp,
            valorLiquido: refComAudit.valorLiquido ?? null,
            valorDescSaidas: refComAudit.valorDescSaidas ?? null,
            valorAbatEsp: refComAudit.valorAbatEsp ?? null,
            obsAudit: refComAudit.obs || '',
          },
        } as GrupoFreelancer);
      }

      result.sort((a, b) => {
        const nc = a.nomeColaborador.localeCompare(b.nomeColaborador);
        return nc !== 0 ? nc : (b.semana || '').localeCompare(a.semana || '');
      });
      setGrupos(result);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [mesAno, unitId]);

  useEffect(() => { carregar(); }, [carregar]);

  /* ── Toggle expand ── */
  const toggleExp = (id: string) =>
    setExpandidos(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* ── Filtrar grupos ── */
  const gruposFiltrados = grupos.filter(g => {
    if (filtroPago === 'pago'     && !g.pago)  return false;
    if (filtroPago === 'pendente' && g.pago)   return false;
    if (filtroColab && !g.nomeColaborador.toLowerCase().includes(filtroColab.toLowerCase())) return false;
    return true;
  });

  /* ── Saídas de consumo ligadas a um grupo ── */
  const EXCLUIR_DO_PIX = new Set(['Desconto Transporte', 'Desconto Adiantamento Especial']);
  const saidasDoGrupo = (g: GrupoFreelancer) => {
    const semFim = g.semana || '';
    const semFimD = semFim ? new Date(semFim + 'T12:00:00') : null;
    const semIniD = semFimD ? new Date(semFimD) : null;
    if (semIniD) semIniD.setDate(semIniD.getDate() - 7);
    const semIni = semIniD ? semIniD.toISOString().split('T')[0] : '';
    return saidasAll.filter(s => {
      if (s.colaboradorId !== g.colaboradorId) return false;
      if (EXCLUIR_DO_PIX.has(s.tipo || s.origem || '')) return false;
      if (g.pagamentoId && s.pagamentoIdLigado) return s.pagamentoIdLigado === g.pagamentoId;
      return (s.dataPagamento ?? '') >= semIni && (s.dataPagamento ?? '') <= semFim;
    });
  };
  const abatDoGrupo = (g: GrupoFreelancer) => {
    const semFim = g.semana || '';
    const semFimD = semFim ? new Date(semFim + 'T12:00:00') : null;
    const semIniD = semFimD ? new Date(semFimD) : null;
    if (semIniD) semIniD.setDate(semIniD.getDate() - 7);
    const semIni = semIniD ? semIniD.toISOString().split('T')[0] : '';
    return saidasAll.filter(s => {
      if (s.colaboradorId !== g.colaboradorId) return false;
      if ((s.tipo || s.origem || '') !== 'Desconto Adiantamento Especial') return false;
      if (g.pagamentoId && s.pagamentoIdLigado) return s.pagamentoIdLigado === g.pagamentoId;
      return (s.dataPagamento ?? '') >= semIni && (s.dataPagamento ?? '') <= semFim;
    });
  };

  /* ── Styles ── */
  const s = {
    card:  { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,.06)' },
    th:    { backgroundColor: '#1565c0', color: 'white', padding: '9px 8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
    thC:   { backgroundColor: '#1565c0', color: 'white', padding: '9px 8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'center' as const },
    thR:   { backgroundColor: '#1565c0', color: 'white', padding: '9px 8px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'right' as const },
    td:    { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const },
    tdC:   { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const, textAlign: 'center' as const },
    tdR:   { padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const, textAlign: 'right' as const },
    tab:   (a: boolean) => ({
      padding: '10px 18px', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const,
      borderRadius: '4px 4px 0 0',
      backgroundColor: a ? '#1976d2' : '#e0e0e0',
      color: a ? 'white' : '#333',
    }),
    input: { padding: '8px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px' },
    select:{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px' },
    btn:   (bg: string) => ({ padding: '7px 14px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: 'white' }),
  };

  /* ── Totais ── */
  const totalGrupos   = gruposFiltrados.length;
  const totalBruto    = gruposFiltrados.reduce((s, g) => s + g.totalGrupo, 0);
  const totalPendente = gruposFiltrados.filter(g => !g.pago).reduce((s, g) => s + g.totalGrupo, 0);
  const qtdPago       = gruposFiltrados.filter(g => g.pago).length;
  const qtdPendente   = gruposFiltrados.filter(g => !g.pago).length;

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* RENDER                                                                  */
  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>
      <Header title="Pagamento de Freelancers" />
      <main style={{ flex: 1, maxWidth: '1400px', margin: '0 auto', padding: '20px 16px', width: '100%' }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/modulos')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1976d2', fontSize: '20px' }} title="Voltar">←</button>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#1565c0' }}>🎯 Pagamento de Freelancers</h2>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
              Auditoria, descontos e confirmação de pagamento PIX/Dinheiro
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)}
              style={{ ...s.input, fontWeight: 'bold', color: '#1565c0' }} />
            <button onClick={() => navigate('/modulos/extrato')}
              style={{ ...s.btn('#455a64') }}>📊 Extrato completo</button>
            <button onClick={() => navigate('/modulos/folha-pagamento')}
              style={{ ...s.btn('#1976d2') }}>🧾 Folha CLT</button>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {[
            { label: 'Grupos / Semanas', val: totalGrupos, cor: '#1976d2' },
            { label: 'Total Bruto', val: fmtMoeda(totalBruto), cor: '#2e7d32' },
            { label: 'A Pagar', val: fmtMoeda(totalPendente), cor: '#e65100' },
            { label: '✅ Pagos', val: qtdPago, cor: '#00897b' },
            { label: '⏳ Pendentes', val: qtdPendente, cor: '#f57f17' },
          ].map(c => (
            <div key={c.label} style={{ ...s.card, borderLeft: `4px solid ${c.cor}`, minWidth: '140px', flex: '1' }}>
              <div style={{ fontSize: '11px', color: '#666' }}>{c.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: c.cor }}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* ── Filtros ── */}
        <div style={{ ...s.card, marginBottom: '0', borderRadius: '8px 8px 0 0', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', padding: '10px 14px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '3px' }}>Buscar colaborador</div>
            <input placeholder="Nome..." value={filtroColab} onChange={e => setFiltroColab(e.target.value)}
              style={{ ...s.input, width: '200px' }} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '3px' }}>Status</div>
            <select value={filtroPago} onChange={e => setFiltroPago(e.target.value as any)} style={s.select}>
              <option value="todos">Todos</option>
              <option value="pendente">⏳ Pendentes</option>
              <option value="pago">✅ Pagos</option>
            </select>
          </div>
          <button onClick={carregar} style={{ ...s.btn('#1976d2'), marginBottom: '1px' }}>🔄 Atualizar</button>
          {filtroColab && (
            <button onClick={() => setFiltroColab('')}
              style={{ ...s.btn('#757575'), marginBottom: '1px' }}>✕ Limpar</button>
          )}
        </div>

        {/* ── Abas ── */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '2px solid #e0e0e0', paddingTop: '4px' }}>
          <button style={s.tab(aba === 'pagar')}     onClick={() => setAba('pagar')}>💸 Pagamentos por Semana</button>
          <button style={s.tab(aba === 'auditoria')} onClick={() => setAba('auditoria')}>🔍 Auditoria Detalhada</button>
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* ABA PAGAMENTOS POR SEMANA                                        */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {aba === 'pagar' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', overflowX: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
            ) : gruposFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎯</div>
                <p>Nenhum registro de freelancer em {mesAno}.</p>
                <p style={{ fontSize: '12px', marginTop: '8px' }}>
                  Verifique se os colaboradores freelancers têm <strong>Tipo de Contrato = Freelancer</strong> no cadastro,
                  e se as presenças estão marcadas como <strong>"Presente"</strong> nas Escalas.
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={s.th}>Colaborador</th>
                    <th style={s.thC}>Semana</th>
                    <th style={s.thC}>Turnos</th>
                    <th style={s.thC}>Dias</th>
                    <th style={s.thR}>Bruto Dobras</th>
                    <th style={s.thR}>Transporte</th>
                    <th style={s.thR}>Descontos</th>
                    <th style={s.thR}>💳 Líquido PIX</th>
                    <th style={s.thC}>Forma</th>
                    <th style={s.thC}>Status</th>
                    <th style={s.thC}>Data Pag.</th>
                    <th style={s.thC}>PIX</th>
                    <th style={s.thC}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {gruposFiltrados.map((g, i) => {
                    const audit = extrairAuditoria(g.raw, g.totalGrupo);
                    const descGrupo = saidasDoGrupo(g).reduce((s, x) => s + R(x.valor), 0);
                    const abatGrupo = abatDoGrupo(g).reduce((s, x) => s + R(x.valor), 0);
                    const liquidoEfetivo = audit.temCampoEstruturado && audit.liquido > 0
                      ? audit.liquido
                      : (descGrupo > 0 || abatGrupo > 0
                        ? Math.max(0, g.totalGrupo - descGrupo - abatGrupo)
                        : g.totalGrupo);
                    const diasUnicos = Array.from(new Set(g.diasDobras.map((d: any) => d.data).filter(Boolean))).sort() as string[];
                    const bgRow = g.pago ? (i % 2 === 0 ? '#f0fdf4' : '#f9fbe7') : '#fffde7';
                    return (
                      <tr key={g.id} style={{ backgroundColor: bgRow, borderLeft: `3px solid ${g.pago ? '#43a047' : '#ffa000'}` }}>
                        <td style={{ ...s.td, fontWeight: 'bold', minWidth: '150px' }}>
                          <div>{g.nomeColaborador}</div>
                          {g.chavePix && (
                            <div style={{ fontSize: '10px', color: '#1976d2', marginTop: '2px' }}>
                              📱 {g.chavePix}
                            </div>
                          )}
                        </td>
                        <td style={{ ...s.tdC, whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 'bold', color: '#1565c0' }}>{g.semanaLabel}</div>
                          <div style={{ fontSize: '10px', color: '#888' }}>{g.mes}</div>
                        </td>
                        <td style={s.tdC}>{g.diasDobras.length}</td>
                        <td style={{ ...s.tdC, fontSize: '11px', maxWidth: '100px' }}>
                          {diasUnicos.map(d => (
                            <span key={d} style={{ display: 'inline-block', margin: '1px', backgroundColor: '#e3f2fd', color: '#1565c0', padding: '1px 5px', borderRadius: '6px', fontSize: '10px' }}>
                              {fmtDiaSemana(d)} {fmtDiaMes(d)}
                            </span>
                          ))}
                        </td>
                        <td style={{ ...s.tdR, fontWeight: 'bold' }}>{fmtMoeda(g.totalDobras)}</td>
                        <td style={{ ...s.tdR, color: '#2e7d32' }}>
                          {g.totalTransp > 0 ? `+${fmtMoeda(g.totalTransp)}` : '—'}
                        </td>
                        <td style={{ ...s.tdR, color: '#c62828' }}>
                          {(descGrupo + abatGrupo) > 0 ? `−${fmtMoeda(descGrupo + abatGrupo)}` : '—'}
                        </td>
                        <td style={{ ...s.tdR }}>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1b5e20' }}>
                            {g.formaPagamento === 'PIX' ? '📱 ' : '💵 '}{fmtMoeda(liquidoEfetivo)}
                          </div>
                          {!audit.temCampoEstruturado && (
                            <div style={{ fontSize: '9px', color: '#9e9e9e', fontStyle: 'italic' }}>legado / estimado</div>
                          )}
                        </td>
                        <td style={s.tdC}>
                          <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold',
                            backgroundColor: g.formaPagamento === 'PIX' ? '#e3f2fd' : '#f3e5f5',
                            color: g.formaPagamento === 'PIX' ? '#1565c0' : '#7b1fa2' }}>
                            {g.formaPagamento === 'PIX' ? '📱 PIX' : g.formaPagamento === 'Dinheiro' ? '💵 Dinheiro' : g.formaPagamento}
                          </span>
                        </td>
                        <td style={s.tdC}>
                          <span style={{ padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                            backgroundColor: g.pago ? '#e8f5e9' : '#fff9c4',
                            color: g.pago ? '#2e7d32' : '#f57f17' }}>
                            {g.pago ? '✅ Pago' : g.pagoParcial ? '⚡ Parcial' : '⏳ Pendente'}
                          </span>
                        </td>
                        <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px' }}>
                          {g.dataPagamento ? fmtDataBR(g.dataPagamento) : '—'}
                        </td>
                        <td style={{ ...s.tdC, fontSize: '11px', color: '#1565c0' }}>
                          {g.chavePix || '—'}
                        </td>
                        <td style={s.tdC}>
                          <button onClick={() => { setAba('auditoria'); setTimeout(() => setExpandidos(new Set([g.id])), 100); }}
                            style={{ ...s.btn('#1565c0'), padding: '4px 8px', fontSize: '11px' }}
                            title="Ver detalhes de auditoria">🔍</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#1b5e20' }}>
                    <td colSpan={4} style={{ padding: '10px 8px', color: 'white', fontWeight: 'bold', fontSize: '12px' }}>
                      TOTAIS ({totalGrupos} grupos)
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: 'white', fontWeight: 'bold' }}>
                      {fmtMoeda(gruposFiltrados.reduce((s, g) => s + g.totalDobras, 0))}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#a5d6a7', fontWeight: 'bold' }}>
                      +{fmtMoeda(gruposFiltrados.reduce((s, g) => s + g.totalTransp, 0))}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#ef9a9a', fontWeight: 'bold' }}>
                      —
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#a5d6a7', fontWeight: 'bold', fontSize: '14px' }}>
                      {fmtMoeda(totalBruto)}
                    </td>
                    <td colSpan={5} style={{ padding: '10px 8px', color: '#aaa' }}>
                      {qtdPago} pagos · {qtdPendente} pendentes · A pagar: {fmtMoeda(totalPendente)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* ABA AUDITORIA DETALHADA — grupos expansíveis estilo Extrato      */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {aba === 'auditoria' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', overflowX: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
            ) : gruposFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Nenhum registro encontrado.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={s.th}>▶</th>
                    <th style={s.th}>Colaborador</th>
                    <th style={s.thC}>Semana</th>
                    <th style={s.thC}>Turnos / Dias</th>
                    <th style={s.thR}>Bruto</th>
                    <th style={s.thR}>Desc.</th>
                    <th style={s.thR}>Abat. Esp.</th>
                    <th style={s.thR}>💳 Líquido</th>
                    <th style={s.thC}>Status</th>
                    <th style={s.thC}>Confiab.</th>
                  </tr>
                </thead>
                <tbody>
                  {gruposFiltrados.flatMap(g => {
                    const exp = expandidos.has(g.id);
                    const audit = extrairAuditoria(g.raw, g.totalGrupo);
                    const saidasG = saidasDoGrupo(g);
                    const abatG   = abatDoGrupo(g);
                    const descTotal = saidasG.reduce((s, x) => s + R(x.valor), 0);
                    const abatTotal = abatG.reduce((s, x) => s + R(x.valor), 0);
                    const liquidoEfetivo = audit.temCampoEstruturado && audit.liquido > 0
                      ? audit.liquido
                      : (descTotal > 0 || abatTotal > 0
                        ? Math.max(0, g.totalGrupo - descTotal - abatTotal)
                        : g.totalGrupo);
                    const diasUnicos = Array.from(new Set(g.diasDobras.map((d: any) => d.data).filter(Boolean))).sort() as string[];
                    const bgMae = g.pago ? '#f0fdf4' : '#fffde7';
                    const rows: React.ReactElement[] = [];

                    /* ── Linha-mãe ── */
                    rows.push(
                      <tr key={g.id} style={{ backgroundColor: bgMae, borderLeft: '3px solid #43a047', borderBottom: exp ? 'none' : '1px solid #c8e6c9' }}>
                        <td style={{ ...s.td, width: '32px', textAlign: 'center' }}>
                          <button onClick={() => toggleExp(g.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1b5e20', fontWeight: 'bold', padding: '0 2px' }}
                            title={exp ? 'Recolher' : 'Ver linha a linha'}>
                            {exp ? '▼' : '▶'}
                          </button>
                        </td>
                        <td style={{ ...s.td, fontWeight: 'bold', minWidth: '150px' }}>
                          <div>{g.nomeColaborador}</div>
                          {g.chavePix && (
                            <div style={{ fontSize: '10px', color: '#1976d2' }}>📱 {g.chavePix}</div>
                          )}
                        </td>
                        <td style={{ ...s.tdC, whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 'bold', color: '#1565c0' }}>{g.semanaLabel}</div>
                          {g.dataPagamento && (
                            <div style={{ fontSize: '10px', color: '#666' }}>pago em {fmtDataBR(g.dataPagamento)}</div>
                          )}
                        </td>
                        <td style={{ ...s.tdC, maxWidth: '160px' }}>
                          <div style={{ fontWeight: 'bold', color: '#1b5e20', marginBottom: '4px' }}>
                            {g.diasDobras.length} turno(s)
                            {g.diasTransp.length > 0 && <span style={{ color: '#2e7d32', marginLeft: 4 }}>+ 🚗</span>}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>
                            {diasUnicos.map(d => (
                              <span key={d} style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '1px 5px', borderRadius: '6px', fontSize: '10px', whiteSpace: 'nowrap' }}>
                                {fmtDiaSemana(d)} {fmtDiaMes(d)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ ...s.tdR, fontWeight: 'bold' }}>
                          {fmtMoeda(g.totalGrupo)}
                          {audit.descSaidas > 0 && (
                            <div style={{ fontSize: '10px', color: '#c62828' }}>desc.obs: −{fmtMoeda(audit.descSaidas)}</div>
                          )}
                        </td>
                        <td style={{ ...s.tdR, color: '#c62828' }}>
                          {descTotal > 0 ? `−${fmtMoeda(descTotal)}` : '—'}
                        </td>
                        <td style={{ ...s.tdR, color: '#7b1fa2' }}>
                          {abatTotal > 0 ? `−${fmtMoeda(abatTotal)}` : '—'}
                        </td>
                        <td style={{ ...s.tdR }}>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1b5e20' }}>
                            {g.formaPagamento === 'PIX' ? '📱 ' : '💵 '}{fmtMoeda(liquidoEfetivo)}
                          </div>
                          {!audit.temCampoEstruturado && (
                            <div style={{ fontSize: '9px', color: '#9e9e9e', fontStyle: 'italic' }}>estimado (legado)</div>
                          )}
                        </td>
                        <td style={s.tdC}>
                          <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                            backgroundColor: g.pago ? '#e8f5e9' : '#fff9c4',
                            color: g.pago ? '#2e7d32' : '#f57f17' }}>
                            {g.pago ? '✅ Pago' : '⏳ Pendente'}
                          </span>
                        </td>
                        <td style={s.tdC}>
                          <span style={{ padding: '2px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold',
                            backgroundColor: g.confiabilidade === 'real' ? '#e8f5e9' : g.confiabilidade === 'recalculado' ? '#fff8e1' : '#f3e5f5',
                            color: g.confiabilidade === 'real' ? '#2e7d32' : g.confiabilidade === 'recalculado' ? '#f57f17' : '#7b1fa2' }}>
                            {g.confiabilidade === 'real' ? '✅ real' : g.confiabilidade === 'recalculado' ? '🔄 reconst.' : '📜 legado'}
                          </span>
                        </td>
                      </tr>
                    );

                    if (!exp) return rows;

                    /* ── [1] Sub-linhas: Turnos individuais (verde claro) ── */
                    for (const d of g.diasDobras) {
                      const turnoLabel = d.turno === 'Dia' ? '☀️ Dia' : d.turno === 'Noite' ? '🌙 Noite' : d.turno || '?';
                      const diaBR = d.data
                        ? new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                        : '—';
                      rows.push(
                        <tr key={`${g.id}_t_${d.id || d.data}_${d.turno}`}
                          style={{ backgroundColor: d.pago ? '#f1f8e9' : '#fffde7', borderBottom: '1px dashed #dcedc8', borderLeft: '6px solid #81c784' }}>
                          <td colSpan={2} style={{ ...s.td, paddingLeft: '28px', fontSize: '11px', color: '#555' }}>
                            ↳ <span style={{ color: '#888', marginRight: 4 }}>turno</span>
                            <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#f1f8e9', color: '#2e7d32', fontWeight: 'bold' }}>
                              {turnoLabel}
                            </span>
                          </td>
                          <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>{diaBR}</td>
                          <td style={{ ...s.tdC, fontSize: '11px' }}>
                            {d.pago
                              ? <span style={{ color: '#388e3c' }}>✅ pago {d.dataPagamento ? fmtDiaMes(d.dataPagamento) : ''}</span>
                              : <span style={{ color: '#f57f17' }}>⏳ pendente</span>}
                          </td>
                          <td colSpan={4} style={{ ...s.tdR, fontWeight: 'bold', color: '#2e7d32' }}>+{fmtMoeda(R(d.valor))}</td>
                          <td colSpan={2} style={s.tdC} />
                        </tr>
                      );
                    }

                    /* ── [2] Transporte dia a dia (verde médio) ── */
                    const vtUnit = g.diasTransp.length === 1 && diasUnicos.length > 0
                      ? R(g.diasTransp[0].valor) / diasUnicos.length
                      : (g.diasTransp.length > 0 ? R(g.diasTransp[0].valor) : 0);
                    const usarDiaADia = g.diasTransp.length === 1 && diasUnicos.length > 0;

                    if (usarDiaADia) {
                      diasUnicos.forEach(data => {
                        const diaBR = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
                        rows.push(
                          <tr key={`${g.id}_tr_${data}`}
                            style={{ backgroundColor: '#e8f5e9', borderBottom: '1px dashed #a5d6a7', borderLeft: '6px solid #66bb6a' }}>
                            <td colSpan={2} style={{ ...s.td, paddingLeft: '28px', fontSize: '11px', color: '#2e7d32' }}>
                              ↳ <span style={{ marginRight: 4 }}>🚗</span>
                              <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#c8e6c9', color: '#1b5e20', fontWeight: 'bold' }}>
                                Transporte
                              </span>
                            </td>
                            <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>{diaBR}</td>
                            <td style={{ ...s.tdC, fontSize: '11px', color: '#555' }}>
                              {fmtDiaMes(data)} · vale-transporte
                            </td>
                            <td colSpan={4} style={{ ...s.tdR, fontWeight: 'bold', color: '#2e7d32' }}>+{fmtMoeda(vtUnit)}</td>
                            <td colSpan={2} style={s.tdC} />
                          </tr>
                        );
                      });
                    } else {
                      g.diasTransp.forEach(d => {
                        rows.push(
                          <tr key={`${g.id}_tc_${d.id || d.data}`}
                            style={{ backgroundColor: '#e8f5e9', borderBottom: '1px dashed #a5d6a7', borderLeft: '6px solid #66bb6a' }}>
                            <td colSpan={2} style={{ ...s.td, paddingLeft: '28px', fontSize: '11px', color: '#2e7d32' }}>
                              ↳ 🚗 <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#c8e6c9', color: '#1b5e20', fontWeight: 'bold' }}>Transporte</span>
                            </td>
                            <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px' }}>{d.data ? fmtDiaMes(d.data) : '—'}</td>
                            <td style={{ ...s.tdC, fontSize: '11px' }}>Vale-transporte consolidado</td>
                            <td colSpan={4} style={{ ...s.tdR, fontWeight: 'bold', color: '#2e7d32' }}>+{fmtMoeda(R(d.valor))}</td>
                            <td colSpan={2} style={s.tdC} />
                          </tr>
                        );
                      });
                    }

                    /* ── [3] Descontos de consumo (vermelho) ── */
                    saidasG.forEach(saida => {
                      rows.push(
                        <tr key={`${g.id}_desc_${saida.id}`}
                          style={{ backgroundColor: '#fff8f8', borderBottom: '1px dashed #ffcdd2', borderLeft: '6px solid #ef9a9a' }}>
                          <td colSpan={2} style={{ ...s.td, paddingLeft: '28px', fontSize: '11px', color: '#c62828' }}>
                            ↳ <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#ffebee', color: '#c62828', fontWeight: 'bold' }}>📉 desc.</span>
                          </td>
                          <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
                            {saida.dataPagamento ? fmtDataBR(saida.dataPagamento) : '—'}
                          </td>
                          <td style={{ ...s.td, fontSize: '11px' }}>
                            <div style={{ color: '#c62828', fontWeight: 'bold' }}>{saida.descricao || saida.tipo || 'Desconto'}</div>
                            {saida.obs && <div style={{ color: '#999', fontSize: '10px', fontStyle: 'italic' }}>📝 {saida.obs}</div>}
                          </td>
                          <td colSpan={4} style={{ ...s.tdR, fontWeight: 'bold', color: '#c62828' }}>
                            −{fmtMoeda(R(saida.valor))}
                          </td>
                          <td style={s.tdC}>
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
                              backgroundColor: saida.pago ? '#e8f5e9' : '#fff9c4',
                              color: saida.pago ? '#2e7d32' : '#f57f17' }}>
                              {saida.pago ? '✅' : '⏳'}
                            </span>
                          </td>
                          <td style={s.tdC} />
                        </tr>
                      );
                    });

                    /* ── [3b] Abatimento Adiantamento Especial (roxo) ── */
                    abatG.forEach(saida => {
                      rows.push(
                        <tr key={`${g.id}_abat_${saida.id}`}
                          style={{ backgroundColor: '#f3e5f5', borderBottom: '1px dashed #ce93d8', borderLeft: '6px solid #9c27b0' }}>
                          <td colSpan={2} style={{ ...s.td, paddingLeft: '28px', fontSize: '11px', color: '#6a1b9a' }}>
                            ↳ <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#9c27b0', color: 'white', fontWeight: 'bold' }}>⏩ adto.esp.</span>
                          </td>
                          <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
                            {saida.dataPagamento ? fmtDataBR(saida.dataPagamento) : '—'}
                          </td>
                          <td style={{ ...s.td, fontSize: '11px' }}>
                            <div style={{ color: '#6a1b9a', fontWeight: 'bold' }}>{saida.descricao || 'Abatimento Adiantamento Especial'}</div>
                            {saida.obs && <div style={{ color: '#ab47bc', fontSize: '10px', fontStyle: 'italic' }}>📝 {saida.obs}</div>}
                          </td>
                          <td colSpan={4} style={{ ...s.tdR, fontWeight: 'bold', color: '#6a1b9a' }}>
                            −{fmtMoeda(R(saida.valor))}
                          </td>
                          <td style={s.tdC}>
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
                              backgroundColor: saida.pago ? '#e8f5e9' : '#fff9c4',
                              color: saida.pago ? '#2e7d32' : '#f57f17' }}>
                              {saida.pago ? '✅' : '⏳'}
                            </span>
                          </td>
                          <td style={s.tdC} />
                        </tr>
                      );
                    });

                    /* ── [3c] Log de Pagamento PIX (azul royal) ── */
                    const logs: PagamentoLog[] = Array.isArray(g.logPagamentos) ? g.logPagamentos : [];
                    logs.forEach((log, idx) => {
                      const dataLog = log.data
                        ? new Date(log.data.length === 10 ? log.data + 'T12:00:00' : log.data)
                            .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : '—';
                      const valorLog = log.valor ?? (log as any).value ?? 0;
                      rows.push(
                        <tr key={`${g.id}_pix_${idx}`}
                          style={{ backgroundColor: '#e3f2fd', borderBottom: '1px dashed #90caf9', borderLeft: '6px solid #1565c0' }}>
                          <td colSpan={2} style={{ ...s.td, paddingLeft: '28px', fontSize: '11px', color: '#1565c0' }}>
                            ↳ <span style={{ padding: '1px 5px', borderRadius: '5px', fontSize: '10px', backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>📱 pgto.</span>
                          </td>
                          <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>{dataLog}</td>
                          <td style={{ ...s.td, fontSize: '11px', color: '#1565c0' }}>
                            {log.forma === 'Misto'
                              ? `📱 PIX ${fmtMoeda(log.valorPix || 0)} + 💵 Dinheiro ${fmtMoeda(log.valorDinheiro || 0)}`
                              : log.forma === 'Dinheiro'
                              ? '💵 Dinheiro — registro de pagamento'
                              : '📱 PIX — registro de pagamento'}
                          </td>
                          <td colSpan={4} style={{ ...s.tdR, fontWeight: 'bold', color: '#1565c0' }}>
                            📱 {fmtMoeda(valorLog)}
                          </td>
                          <td colSpan={2} style={s.tdC} />
                        </tr>
                      );
                    });

                    /* ── [4] Subtotal (fundo verde escuro) ── */
                    const abatEfetivo = audit.abatEsp > 0 ? audit.abatEsp : abatTotal;
                    const descEfetiva = descTotal > 0 ? descTotal : (audit.descSaidas > 0 ? audit.descSaidas : 0);
                    rows.push(
                      <tr key={`${g.id}_sub`}
                        style={{ backgroundColor: '#1b5e20', borderBottom: '2px solid #43a047' }}>
                        <td colSpan={10} style={{ padding: '0' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', color: 'white' }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: '6px 14px', width: '50%' }}>
                                  {/* Turnos */}
                                  {g.diasDobras.map((d: any, i: number) => {
                                    const t = d.turno === 'Dia' ? '☀️' : '🌙';
                                    return (
                                      <span key={i} style={{ marginRight: '8px', color: '#a5d6a7' }}>
                                        {t} {fmtDiaMes(d.data)} +{fmtMoeda(R(d.valor))}
                                      </span>
                                    );
                                  })}
                                  {/* Transporte */}
                                  {usarDiaADia
                                    ? diasUnicos.map(data => (
                                        <span key={`ts_${data}`} style={{ marginRight: '8px', color: '#80cbc4' }}>
                                          🚗 {fmtDiaMes(data)} +{fmtMoeda(vtUnit)}
                                        </span>
                                      ))
                                    : g.diasTransp.map((d: any, i: number) => (
                                        <span key={i} style={{ marginRight: '8px', color: '#80cbc4' }}>
                                          🚗 +{fmtMoeda(R(d.valor))}
                                        </span>
                                      ))
                                  }
                                </td>
                                <td style={{ padding: '6px 14px', textAlign: 'right', width: '50%' }}>
                                  <span style={{ color: '#a5d6a7' }}>= Bruto </span>
                                  <strong>{fmtMoeda(g.totalGrupo)}</strong>
                                  {descEfetiva > 0 && (
                                    <span style={{ marginLeft: '12px', color: '#ef9a9a' }}>
                                      📉 Descontos −{fmtMoeda(descEfetiva)}
                                    </span>
                                  )}
                                  {abatEfetivo > 0 && (
                                    <span style={{ marginLeft: '12px', color: '#ce93d8' }}>
                                      ⏩ Adto.esp. −{fmtMoeda(abatEfetivo)}
                                    </span>
                                  )}
                                  {logs.length > 0 ? (
                                    <>
                                      <span style={{ marginLeft: '12px', borderLeft: '1px dashed #1976d2', paddingLeft: '12px', color: '#90caf9' }}>
                                        📱 Pago: {fmtMoeda(logs.reduce((s, l) => s + R(l.valor ?? (l as any).value ?? 0), 0))}
                                      </span>
                                      {Math.abs(logs.reduce((s, l) => s + R(l.valor ?? (l as any).value ?? 0), 0) - liquidoEfetivo) > 0.01 && (
                                        <span style={{ marginLeft: '8px', color: '#ffcc02', fontWeight: 'bold' }}>
                                          ⚠️ Divergência {fmtMoeda(Math.abs(logs.reduce((s, l) => s + R(l.valor ?? (l as any).value ?? 0), 0) - liquidoEfetivo))}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span style={{ marginLeft: '12px', color: '#90caf9', fontWeight: 'bold', fontSize: '13px' }}>
                                      {g.formaPagamento === 'PIX' ? '📱' : '💵'} Líquido: {fmtMoeda(liquidoEfetivo)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    );

                    return rows;
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
};

export default FreelancerPagamento;

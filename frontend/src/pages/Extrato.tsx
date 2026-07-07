import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';
import { fetchAuth } from '../utils/fetchAuth';
import { calcularFolhaCLT } from '../engine';


/* ─── Types ──────────────────────────────────────────────────────────────── */
interface PagamentoLog {
  id?: string;
  data: string;
  valor: number;
  forma: 'PIX' | 'Dinheiro' | 'Misto';
  valorPix?: number;
  valorDinheiro?: number;
  tipo?: string;
  obs?: string;
}

interface ExtratoItem {
  id: string;
  colaboradorId: string;
  nomeColaborador?: string;
  tipoContrato?: string;
  origem: 'folha' | 'saida';
  mes: string;
  semana?: string;
  tipo: 'credito' | 'debito';
  descricao: string;
  valor: number;
  pago: boolean;
  dataPagamento?: string;
  valorBruto?: number;
  valorTransporte?: number;
  desconto?: number;
  totalFinal?: number;
  saldoFinal?: number;
  obs?: string;
  updatedAt?: string;
  unitId?: string;
  tipoSaida?: string;
  // Forma de pagamento
  formaPagamento?: 'PIX' | 'Dinheiro' | 'Misto';
  logPagamentos?: PagamentoLog[];
  // Integridade de período (freelancers)
  periodoInicio?: string;
  periodoFim?: string;
  diasPagos?: { data: string; turno: string; valor: number }[];
  // Conta-corrente
  pagamentoId?: string;           // amarra turnos do mesmo ato de pagamento
  pagamentoIdLigado?: string;      // para saídas auto-geradas: referencia o lote de pagamento
  confiabilidade?: 'real' | 'recalculado' | 'legado'; // qualidade do dado
  transacaoBancariaId?: string;   // reservado para conciliação bancária (fase 3 MVP)
  raw?: any;
}

// Categorias de saída — créditos (a receber pelo colaborador) primeiro, depois débitos (descontos)
const TIPOS_SAIDA = [
  // ── Créditos (valor pago AO colaborador) ──
  'A pagar',
  'Adiantamento Salário',
  'Adiantamento Transporte',
  'Adiantamento Especial',
  'Caixinha',
  'PIX',
  'Caixa',
  // ── Débitos (desconto DO colaborador) ──
  'A receber',
  'Consumo Interno',
  'Desconto',
  'Desconto Transporte',
  'Desconto Adiantamento Especial',
  'Sangria',
];
// Categorias que representam DÉBITO (descontado do colaborador — valor negativo)
const TIPOS_DEBITO = ['A receber', 'A pagar', 'Consumo Interno', 'Desconto', 'Desconto Transporte', 'Desconto Adiantamento Especial', 'Sangria'];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const R = (v: any) => parseFloat(v) || 0;
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoeda = (v: number) => 'R$ ' + fmt(v);

// calcINSS: usado internamente pelo engine (calcularFolhaCLT). Não é necessário importar aqui.
const fmtDataBR = (iso: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const hoje = () => new Date().toISOString().split('T')[0];

/**
 * Extrai valores de auditoria do lote de pagamento freelancer.
 * Opção B (campo estruturado): usa valorLiquido/valorDescSaidas/valorAbatEsp direto do raw.
 * Opção A (fallback legado): parseia o campo `obs` para extrair os valores.
 *
 * Formato do obs legado:
 *   "Freelancer sem. ... - Desc. saídas: R$66,00 - Abat. adto.esp.: R$150,00 - Líquido: R$619,00"
 */
const extrairAuditoria = (raw: any, totalBruto: number): {
  bruto: number; descSaidas: number; abatEsp: number; liquido: number; temCampoEstruturado: boolean;
} => {
  // Opção B — campo estruturado (novos registros).
  // raw pode ser o granularesAgrupados (que propaga valorLiquido do refComAudit)
  // ou um registro individual da API com os campos diretos.
  if (raw?.valorLiquido !== undefined && raw.valorLiquido !== null) {
    return {
      bruto:      R(raw.valorBruto)      || totalBruto,
      descSaidas: R(raw.valorDescSaidas) || 0,
      abatEsp:    R(raw.valorAbatEsp)    || 0,
      liquido:    R(raw.valorLiquido),
      temCampoEstruturado: true,
    };
  }
  // Opção A — parsear obs (registros legados).
  // Tenta obsAudit (campo propagado do registro individual) e depois obs genérico.
  // IMPORTANTE: usar [$] em vez de \$ para capturar o símbolo $ literal em JS regex.
  // /R\$/ trata \$ como âncora de fim de linha e não captura o valor numérico.
  const obs: string = raw?.obsAudit || raw?.obs || '';
  const matchDesc   = obs.match(/Desc\. sa[íi]das:\s*R[$]\s*([\d.,]+)/i);
  const matchAbat   = obs.match(/Abat\. adto\.esp\.:\s*R[$]\s*([\d.,]+)/i);
  const matchLiq    = obs.match(/L[íi]quido:\s*R[$]\s*([\d.,]+)/i);
  const pBR = (s: string) => R(s.replace(/\./g, '').replace(',', '.'));
  const descSaidas  = matchDesc  ? pBR(matchDesc[1]) : 0;
  const abatEsp     = matchAbat  ? pBR(matchAbat[1]) : 0;
  const liquido     = matchLiq   ? pBR(matchLiq[1])  : Math.max(0, totalBruto - descSaidas - abatEsp);
  return { bruto: totalBruto, descSaidas, abatEsp, liquido, temCampoEstruturado: false };
};

/* ─── Component ──────────────────────────────────────────────────────────── */
export const Extrato: React.FC = () => {
  const navigate = useNavigate();
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const unitId = activeUnit?.id || (user as any)?.unitId || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

  const now = new Date();
  const [mesAno, setMesAno] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [items, setItems] = useState<ExtratoItem[]>([]);
  const [itemsExcluidos, setItemsExcluidos] = useState<any[]>([]);
  const [colabsState, setColabsState] = useState<any[]>([]);

  // Modals
  const [detalheItem, setDetalheItem]   = useState<ExtratoItem | null>(null);
  const [editItem, setEditItem]         = useState<ExtratoItem | null>(null);
  const [editForm, setEditForm]         = useState<any>({});
  // Modal de ajuste manual — cria uma saída de crédito/débito avulsa vinculada ao colaborador
  const [modalAjuste, setModalAjuste]   = useState<ExtratoItem | null>(null);
  const [ajusteForm, setAjusteForm]     = useState({ tipo: 'credito' as 'credito'|'debito', valor: '', descricao: '', data: new Date().toISOString().split('T')[0], obs: '' });
  // Exclusão lógica com audit trail
  const [modalExcluir, setModalExcluir] = useState<ExtratoItem | null>(null);
  const [excluirMotivo, setExcluirMotivo] = useState('');
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState<string | null>(null);

  // Filters
  const [filtroColaborador, setFiltroColaborador] = useState('');
  const [filtroTipo,        setFiltroTipo]        = useState<'todos'|'credito'|'debito'>('todos');
  const [filtroContrato,    setFiltroContrato]    = useState<'todos'|'CLT'|'Freelancer'>('todos');
  const [filtroStatus,      setFiltroStatus]      = useState<'todos'|'pago'|'pendente'>('todos');
  const [filtroOrigem,      setFiltroOrigem]      = useState<'todos'|'folha'|'saida'>('todos');

  const [viewMode, setViewMode] = useState<'resumo'|'detalhado'|'excluidos'>('resumo');
  // Controle de expansão das linhas granulares na tabela Detalhada
  const [expandidosDetalhado, setExpandidosDetalhado] = useState<Set<string>>(new Set());

  const token = () => localStorage.getItem('auth_token');

  useEffect(() => { if (unitId) carregarDados(); }, [unitId, mesAno]);

  /* ── Load data ──────────────────────────────────────────────────────────── */
  const carregarDados = async () => {
    setLoading(true);
    try {
      const [ano, mes] = mesAno.split('-');
      const dataIni  = `${mesAno}-01`;
      const lastDay  = new Date(parseInt(ano), parseInt(mes), 0).getDate();
      const dataFim  = `${mesAno}-${String(lastDay).padStart(2, '0')}`;

      // Also fetch previous 3 months to catch pending items
      const prevDate = new Date(parseInt(ano), parseInt(mes) - 4, 1);
      const prevIni  = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;

      const [rF, rC, rS, rSPend, rPS] = await Promise.all([
        fetchAuth(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mesAno}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
        fetchAuth(`${apiUrl}/colaboradores?unitId=${unitId}&incluirInativos=true`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
        // Current month saidas
        fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataIni}&dataFim=${dataFim}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
        // Older pending saidas (last 3 months)
        fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${prevIni}&dataFim=${dataIni}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
        // Payslips — fonte de verdade dos valores pagos
        fetchAuth(`${apiUrl}/payslips?unitId=${unitId}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
      ]);

      let colabs: any[] = [];
      if (rC?.ok) { const d = await rC.json(); colabs = Array.isArray(d) ? d : []; }
      setColabsState(colabs);

      // ── Payslips (comprovantes reais de pagamento) ───────────────────────
      let payslipsAll: any[] = [];
      if (rPS?.ok) { const d = await rPS.json(); payslipsAll = Array.isArray(d) ? d : []; }
      // Filtrar payslips do mês selecionado e indexar por colaboradorId
      const payslipsMes = payslipsAll.filter((ps: any) => (ps.mes || ps.periodoInicio?.slice(0,7)) === mesAno);
      const payslipsMap: Record<string, any[]> = {};
      for (const ps of payslipsMes) {
        if (!ps.colaboradorId) continue;
        if (!payslipsMap[ps.colaboradorId]) payslipsMap[ps.colaboradorId] = [];
        payslipsMap[ps.colaboradorId].push(ps);
      }

      const allItems: ExtratoItem[] = [];
      const excluidosList: any[] = [];

      // ── Folha ──────────────────────────────────────────────────────────────
      if (rF?.ok) {
        const dF = await rF.json();
        const rawFolha: any[] = Array.isArray(dF) ? dF : [];

        // migrado pode ser booleano true ou string 'True' (DynamoDB serialization quirk)
        const isMigrado   = (i: any) => i.migrado   === true || i.migrado   === 'True' || i.migrado   === 'true';
        // estornado: registro vazio/cancelado criado ao tentar desfazer — deve ser ignorado
        const isEstornado = (i: any) => i.estornado === true || i.estornado === 'True' || i.estornado === 'true';
        // ─ Separar granulares (tipo='freelancer-dia') dos legados
        const granulares  = rawFolha.filter((i: any) => i.tipo === 'freelancer-dia' && i.data && !isEstornado(i));
        // Coletar colaboradores que têm granulares para excluir fechamentos legados duplicados
        const colabsComGranulares = new Set(granulares.map((g: any) => g.colaboradorId));
        const legadoFolha = rawFolha.filter((i: any) => {
          if (i.tipo === 'freelancer-dia') return false;
          if (isMigrado(i) || isEstornado(i)) return false;
          // Excluir registros de fechamento semanal (col-xxx_mes_semana) quando já temos granulares
          // Esses registros são criados pelo FreelancerPagamento como marcadores, sem valores reais
          if (i.id && i.id.match(/^col-[^_]+_\d{4}-\d{2}_\d{4}-\d{2}-\d{2}$/) && colabsComGranulares.has(i.colaboradorId)) return false;
          return true;
        });

        // ─ Agrupar granulares por lote de pagamento:
        //   1º preferência: pagamentoId (registros novos — amarra turnos do mesmo ato de pagar)
        //   2º fallback:    colaboradorId + semana (registros legados sem pagamentoId)
        const grpMap: Record<string, any[]> = {};
        for (const g of granulares) {
          const key = g.pagamentoId
            ? `pgto__${g.pagamentoId}`                                       // lote real
            : `sem__${g.colaboradorId}__${g.semana || g.data?.substring(0,7)}`; // fallback legado
          if (!grpMap[key]) grpMap[key] = [];
          grpMap[key].push(g);
        }

        // Converter grupos em itens sintéticos
        const granularesAgrupados = Object.values(grpMap).map((dias: any[]) => {
          const pagos = dias.filter(d => d.pago === true);
          const pends = dias.filter(d => d.pago !== true);
          const totalPago = pagos.reduce((s, d) => s + R(d.valor), 0);
          const totalPend = pends.reduce((s, d) => s + R(d.valor), 0);
          const algumPago  = pagos.length > 0;
          const todosPagos = pends.length === 0;
          const ref = pagos[0] || dias[0];
          // Detectar se algum turno é recalculado (migração) ou real
          const temRecalculado = dias.some(d => d.reconstituido === true || d.reconstituido === 'True' || d.reconstituido === 'true');
          const confiabilidade = temRecalculado ? 'recalculado' : (dias.every(d => d.confiabilidade === 'real') ? 'real' : 'legado');
          // Turnos: só dobras (Dia/Noite) — transporte tem tipoCodigo diferente
          const diasDobras = dias.filter(d => !d.tipoCodigo || d.tipoCodigo === 'freelancer-dia' || d.tipoCodigo === 'freelancer-noite');
          const diasTransp = dias.filter(d => d.tipoCodigo === 'transporte-freelancer');

          // ── Campos de auditoria: busca no registro de referência (Opção B) ──
          // O ref pode ser uma dobra individual que recebeu os campos estruturados do POST.
          // Fallback: obs do primeiro registro com obs que contenha "Desc. saídas" ou "Líquido"
          const refComAudit = dias.find((d: any) => d.valorLiquido !== undefined && d.valorLiquido !== null)
            || dias.find((d: any) => /L[íi]quido/i.test(d.obs || '') || /Desc\. sa/i.test(d.obs || ''))
            || ref;

          // ── Buscar payslip correspondente (fonte de verdade dos valores pagos) ──
          const colPayslips = payslipsMap[ref.colaboradorId] || [];
          const matchPayslip = colPayslips.find((ps: any) => {
            if (ref.pagamentoId && Array.isArray(ps.pagamentos) && ps.pagamentos.includes(ref.pagamentoId)) return true;
            if (ref.semana && ps.periodoInicio && ps.periodoFim) {
              return ref.semana >= ps.periodoInicio && ref.semana <= ps.periodoFim;
            }
            return false;
          });
          const psLiquido   = matchPayslip ? parseFloat(matchPayslip.liquido)   || 0 : 0;
          const psBruto     = matchPayslip ? parseFloat(matchPayslip.bruto)     || 0 : 0;
          const psDescontos = matchPayslip ? parseFloat(matchPayslip.descontos) || 0 : 0;
          const psTransp    = matchPayslip ? parseFloat(matchPayslip.transporte)|| 0 : 0;

          return {
            id: `grp__${ref.colaboradorId}__${ref.semana}__${ref.pagamentoId || 'legado'}`,
            colaboradorId: ref.colaboradorId,
            mes: ref.mes,
            semana: ref.semana,
            pagamentoId: ref.pagamentoId || null,
            pago: todosPagos && algumPago,
            pagoParcial: algumPago && !todosPagos,
            valorBruto: matchPayslip ? psBruto : (totalPago + totalPend),
            totalFinal: matchPayslip ? psLiquido : totalPago,
            totalPendente: matchPayslip ? 0 : totalPend,
            desconto: matchPayslip ? psDescontos : 0,
            valorTransporte: matchPayslip ? psTransp : diasTransp.reduce((s: number, d: any) => s + R(d.valor), 0),
            dataPagamento: (matchPayslip?.dataPagamento) || pagos[0]?.dataPagamento || pagos[0]?.pagamentoData || null,
            formaPagamento: ref.formaPagamento || 'PIX',
            unitId: ref.unitId,
            confiabilidade: matchPayslip ? 'real' : confiabilidade,
            payslip: matchPayslip || null,
            valorLiquido:    matchPayslip ? psLiquido : (refComAudit.valorLiquido    ?? null),
            valorDescSaidas: matchPayslip ? psDescontos : (refComAudit.valorDescSaidas ?? null),
            valorAbatEsp:    refComAudit.valorAbatEsp    ?? null,
            obsAudit:        refComAudit.obs             || '',
            obs: diasDobras.map((d: any) => `${d.data?.substring(8)}/${d.turno?.[0] || '?'}`).join(' · ')
              + (diasTransp.length > 0 ? ` + Transp. R$${diasTransp.reduce((s: number,d: any)=>s+R(d.valor),0).toFixed(2)}` : '')
              + (matchPayslip ? ` — Líq. R$${psLiquido.toFixed(2)}` : ''),
            tipo: 'freelancer-dia-grupo',
            diasDetalhe: dias,
            diasDobras,
            diasTransp,
          };
        });

        // Processar todos os itens: granulares agrupados + legados
        for (const item of [...granularesAgrupados, ...legadoFolha]) {
          const colab = colabs.find((c: any) => c.id === item.colaboradorId);
          const nome  = colab?.nome || item.colaboradorId;
          const tc    = colab?.tipoContrato || (item.semana ? 'Freelancer' : 'CLT');
          const isCLT = !item.semana || item.semana === true;
          // Para granulares agrupados: totalFinal = soma dos pagos, valorBruto = total semana
          // Para legados freelancer: valorBruto (dobras), para CLT: totalFinal
          const isGranular = item.tipo === 'freelancer-dia-grupo';
          // Valor do item:
          // - Granulares freelancer: totalFinal (soma dos pagos)
          // - Freelancer legado: valorBruto (dobras)
          // - CLT: soma dos logPagamentos (total real pago) — NÃO usar saldoFinal/totalFinal
          //   que podem estar corrompidos pelo EMS importer
          const cltLogTotal = isCLT && Array.isArray(item.logPagamentos)
            ? item.logPagamentos.reduce((s: number, l: any) => s + (parseFloat(l.valor) || 0), 0)
            : 0;
          const val = isGranular
            ? R(item.totalFinal)
            : isCLT
              ? (cltLogTotal > 0 ? cltLogTotal : R(item.totalFinal) || R(item.saldoFinal) || 0)
              : (R(item.valorBruto) > 0 ? R(item.valorBruto) : R(item.totalFinal) || R(item.saldoFinal) || 0);

          // Para CLT com logPagamentos: gerar 1 item POR logPagamento (cada PIX separado)
          // Assim os lançamentos detalhados mostram cada depósito individual
          if (isCLT && Array.isArray(item.logPagamentos) && item.logPagamentos.length > 0) {
            for (const lp of item.logPagamentos) {
              const lpVal = parseFloat(lp.valor) || 0;
              if (lpVal <= 0) continue;
              allItems.push({
                id: `${item.id}_lp_${lp.id || Date.now()}`,
                colaboradorId: item.colaboradorId,
                nomeColaborador: nome, tipoContrato: tc,
                origem: 'folha', mes: item.mes, semana: undefined,
                tipo: 'credito',
                descricao: `PIX ${lp.tipo || 'Pagamento'} CLT – ${item.mes}`,
                valor: lpVal,
                pago: true,
                dataPagamento: lp.data || item.dataPagamento,
                formaPagamento: lp.forma || 'PIX',
                logPagamentos: item.logPagamentos,
                obs: item.obs || '', updatedAt: item.updatedAt, unitId: item.unitId,
                raw: item,
              });
            }
            continue; // pula a criação do item principal — já criou os PIXs individuais
          }

          // Linha principal: salário mensal CLT (sem logPagamentos) ou dobras freelancer
          const confBadge = isGranular
            ? (item.confiabilidade === 'recalculado' ? ' ⚠️' : item.confiabilidade === 'real' ? '' : '')
            : '';
          const descricaoPrincipal = isGranular
            ? `Dobras semanais ${fmtDataBR(item.semana)} – ${item.obs}${confBadge}${item.pagoParcial ? ` — +R$${R(item.totalPendente).toFixed(2)} pend.` : ''}`
            : (item.semana && item.semana !== true
                ? `Dobras semanais ${fmtDataBR(item.semana)} (${tc})`
                : `Folha CLT – ${item.mes}`);

          // Turnos pendentes: só existem como escalas confirmadas sem lançamento
          // NÃO gerar linha de pendente para recalculados (não sabemos se foram realmente pagos)
          if (isGranular && item.pagoParcial && R(item.totalPendente) > 0 && item.confiabilidade !== 'recalculado') {
            const turnosPend = (item.diasDetalhe || [])
              .filter((d: any) => d.pago !== true)
              .map((d: any) => `${d.data?.substring(8)}/${d.turno?.[0] || '?'}`);
            allItems.push({
              id: `${item.id}_pend`,
              colaboradorId: item.colaboradorId,
              nomeColaborador: nome, tipoContrato: tc,
              origem: 'folha', mes: item.mes, semana: item.semana,
              tipo: 'credito',
              descricao: `⏳ Pendente – Dobras semanais ${fmtDataBR(item.semana)} – Turnos: ${turnosPend.join(' · ')}`,
              valor: R(item.totalPendente), pago: false,
              dataPagamento: undefined,
              valorBruto: R(item.totalPendente), valorTransporte: 0,
              desconto: 0, totalFinal: R(item.totalPendente), saldoFinal: 0,
              obs: `Turnos pendentes: ${turnosPend.join(' · ')}`,
              updatedAt: '', unitId: item.unitId,
              formaPagamento: undefined, logPagamentos: [],
              raw: item,
            });
          }

          // Suprimir itens com valor=0 que são granulares individuais não agrupados corretamente
          // (ocorre quando um lote migrado é exibido junto com o legado que também o representa)
          if (isGranular && val === 0 && item.pago === true && !item.pagoParcial) continue;
          // Suprimir legados com valor=0 e pago=False (registros vazios que escorregaram pelo filtro)
          if (!isGranular && val === 0 && item.pago !== true && !item.semana?.startsWith('202')) continue;

          allItems.push({
            id: item.id || `folha_${item.colaboradorId}_${item.mes}_${item.semana || ''}`,
            colaboradorId: item.colaboradorId,
            nomeColaborador: nome, tipoContrato: tc,
            origem: 'folha', mes: item.mes, semana: item.semana || undefined,
            tipo: 'credito',
            descricao: descricaoPrincipal,
            valor: val, pago: isGranular ? (item.pago || item.pagoParcial) : item.pago === true,
            dataPagamento: item.dataPagamento || undefined,
            valorBruto: R(item.valorBruto), valorTransporte: R(item.valorTransporte),
            desconto: R(item.desconto), totalFinal: R(item.totalFinal), saldoFinal: R(item.saldoFinal),
            obs: item.obs || '', updatedAt: item.updatedAt || '', unitId: item.unitId,
            formaPagamento: item.formaPagamento || (Array.isArray(item.logPagamentos) && item.logPagamentos.length > 0 ? item.logPagamentos[item.logPagamentos.length - 1].forma : undefined),
            logPagamentos: item.logPagamentos || [],
            periodoInicio: item.periodoInicio || undefined,
            periodoFim:    item.periodoFim    || undefined,
            diasPagos:     Array.isArray(item.diasPagos) ? item.diasPagos : [],
            // Conta-corrente: rastreabilidade e integridade
            pagamentoId:   isGranular ? (item.pagamentoId || undefined) : undefined,
            confiabilidade: isGranular ? (item.confiabilidade as any) : undefined,
            transacaoBancariaId: undefined, // reservado fase 3 MVP
            raw: item,
          });
        }
      }

      // ── Saídas helper ──────────────────────────────────────────────────────
      const processarSaidas = (rawList: any[], incluirPendentesAntigos = false) => {
        for (const saida of rawList) {
          if (!saida.colaboradorId && !saida.colabId) continue;
          const colabId = saida.colaboradorId || saida.colabId;
          const colab   = colabs.find((c: any) => c.id === colabId);
          const nome    = colab?.nome || saida.colaborador || saida.favorecido || colabId;
          const tc      = colab?.tipoContrato || '—';
          const tipo    = saida.tipo || saida.origem || saida.referencia || 'A pagar';
          const dataEfetiva = saida.dataPagamento || saida.data || '';
          const saidaMes    = dataEfetiva.substring(0, 7);

          // pago field: explicit false (or string 'false') = pendente; default (true or missing) = pago
          const isPago = saida.pago !== false && saida.pago !== 'false';
          // Excluídos logicamente — não aparecem no extrato normal (aparecem na aba Excluídos)
          const isExcluido = saida.excluido === true || saida.excluido === 'true' || saida.excluido === 'True';
          if (isExcluido) { excluidosList.push(saida); continue; }

          // If processing older saidas, only include truly pending ones
          if (incluirPendentesAntigos && isPago) continue;
          // If processing current month, skip if not this month (unless pending)
          if (!incluirPendentesAntigos && saidaMes !== mesAno) continue;

          const isDebito = TIPOS_DEBITO.includes(tipo);
          // Para CLT: 'Adiantamento Salário' é registro interno (já incluído no logPagamentos do dia 20)
          // Não criar item separado pra não duplicar no resumo
          if (tc === 'CLT' && tipo === 'Adiantamento Salário') continue;
          // Avoid duplicates (same id already added)
          if (allItems.find(x => x.id === (saida.id || ''))) continue;

          allItems.push({
            id: saida.id || `saida_${colabId}_${dataEfetiva}`,
            colaboradorId: colabId, nomeColaborador: nome, tipoContrato: tc,
            origem: 'saida',
            mes: isPago ? (saidaMes || mesAno) : mesAno, // pending → show in current month
            semana: undefined,
            tipo: isDebito ? 'debito' : 'credito',
            descricao: saida.descricao || tipo || 'Saída',
            valor: R(saida.valor),
            pago: isPago,
            dataPagamento: dataEfetiva,
            tipoSaida: tipo,
            obs: saida.observacao || saida.obs || '',
            updatedAt: saida.updatedAt || dataEfetiva,
            unitId: saida.unitId,
            formaPagamento: saida.formaPagamento,
            logPagamentos: saida.logPagamentos || [],
            pagamentoIdLigado: saida.pagamentoIdLigado || null,
            raw: saida,
          });
        }
      };

      if (rS?.ok)     { const d = await rS.json();     processarSaidas(Array.isArray(d) ? d : [], false); }
      if (rSPend?.ok) { const d = await rSPend.json(); processarSaidas(Array.isArray(d) ? d : [], true);  }

      // ── Suprimir da lista geral saídas que pertencem a um lote granular ─────
      // Saídas com pagamentoIdLigado apontando para um pagamentoId de folha granular
      // já são exibidas como sub-linhas dentro do grupo expandido → não devem duplicar
      // na lista geral. Isso elimina os "Desconto Transporte" e "Desconto Adtamt. Especial"
      // que apareciam soltos na lista quando já estavam rastreados dentro do lote.
      const pgtoIdsGranulares = new Set(
        allItems
          .filter(it => it.origem === 'folha' && it.semana && it.pagamentoId)
          .map(it => it.pagamentoId!)
      );
      const allItemsFiltrados = allItems.filter(it => {
        if (it.origem !== 'saida') return true;              // folhas: sempre exibir
        const ligado = (it as any).pagamentoIdLigado as string | null | undefined;
        if (!ligado) return true;                            // sem vínculo: exibir normalmente
        return !pgtoIdsGranulares.has(ligado);               // ligado a granular ativo: suprimir
      });

      allItemsFiltrados.sort((a, b) => {
        const nc = (a.nomeColaborador || '').localeCompare(b.nomeColaborador || '');
        if (nc !== 0) return nc;
        const dA = a.dataPagamento || a.semana || a.mes || '';
        const dB = b.dataPagamento || b.semana || b.mes || '';
        return dB.localeCompare(dA);
      });

      setItems(allItemsFiltrados);
      setItemsExcluidos(excluidosList);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  /* ── Save saida edit ────────────────────────────────────────────────────── */
  const salvarEdicaoSaida = async () => {
    if (!editItem || editItem.origem !== 'saida') return;
    setSalvando(true);
    // Explicit boolean — never rely on coercion
    const novoPago: boolean = editForm.pago === true || editForm.pago === 'true';
    try {
      const raw = editItem.raw || {};
      const payload = {
        ...raw,
        id:             editItem.id,
        unitId:         raw.unitId || editItem.unitId,
        colaboradorId:  raw.colaboradorId || editItem.colaboradorId,
        descricao:      editForm.descricao,
        valor:          parseFloat(editForm.valor) || 0,
        tipo:           editForm.tipoSaida,
        origem:         editForm.tipoSaida,
        referencia:     editForm.tipoSaida,
        dataPagamento:  editForm.dataPagamento,
        data:           raw.data || editForm.dataPagamento,
        pago:           novoPago,   // explicit boolean
        formaPagamento: editForm.formaPagamento || undefined,
        observacao:     editForm.obs,
        obs:            editForm.obs,
        updatedAt:      new Date().toISOString(),
      };

      const res = await fetchAuth(`${apiUrl}/saidas/${editItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // Optimistic local update: reflect change immediately in UI
        // NOTE: We do NOT reload from server here because the API may return
        // pago: undefined (which gets coerced to true), overriding the edit.
        // The optimistic update is the source of truth until the next full reload.
        setItems(prev => prev.map(it => {
          if (it.id !== editItem.id) return it;
          const isDebito = TIPOS_DEBITO.includes(editForm.tipoSaida);
          return {
            ...it,
            descricao:    editForm.descricao,
            valor:        parseFloat(editForm.valor) || 0,
            tipo:         isDebito ? 'debito' : 'credito',
            tipoSaida:      editForm.tipoSaida,
            dataPagamento:  editForm.dataPagamento,
            pago:           novoPago,  // explicit boolean — guaranteed to be true or false
            obs:            editForm.obs,
            formaPagamento: editForm.formaPagamento || undefined,
            raw:            { ...payload, pago: novoPago },  // keep pago explicit in raw too
          };
        }));
        setEditItem(null);
        // Schedule background reload after a short delay so the API has time
        // to persist the change before we fetch fresh data
        setTimeout(() => carregarDados(), 1500);
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Erro ao salvar: ' + (err.error || res.status));
      }
    } catch (e) { alert('Erro ao salvar edição'); }
    finally { setSalvando(false); }
  };

  /* ── Open edit modal ────────────────────────────────────────────────────── */
  const abrirEdicao = (item: ExtratoItem) => {
    setEditItem(item);
    setEditForm({
      descricao:      item.descricao,
      valor:          String(item.valor),
      tipoSaida:      item.tipoSaida || 'A pagar',
      dataPagamento:  item.dataPagamento || hoje(),
      pago:           item.pago,
      obs:            item.obs || '',
      formaPagamento: item.formaPagamento || '',
    });
  };

  /* Excluir saída (somente origem='saida') */
  const excluirSaida = async (item: ExtratoItem) => {
    if (item.origem !== 'saida') {
      alert('Apenas lançamentos de Saída podem ser excluídos por aqui. Para folha, use a tela Folha de Pagamento.');
      return;
    }
    if (!window.confirm(`Excluir lançamento "${item.tipoSaida || ''} — ${item.descricao}" no valor de ${fmtMoeda(item.valor)}?\n\nEssa ação não pode ser desfeita.`)) return;
    try {
      const tk = localStorage.getItem('auth_token');
      const res = await fetchAuth(`${apiUrl}/saidas/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tk}` } });
      if (res.ok) {
        alert('✅ Lançamento excluído.');
        setItems(prev => prev.filter(it => it.id !== item.id));
      } else {
        alert('Erro ao excluir lançamento.');
      }
    } catch { alert('Erro de rede ao excluir.'); }
  };

  /* Classificação contábil em 3 contas separadas */
  const TIPOS_TRANSPORTE_EXT = new Set(['Adiantamento Transporte', 'Desconto Transporte']);
  const TIPOS_ESPECIAL_EXT   = new Set(['Adiantamento Especial', 'Desconto Adiantamento Especial']);
  // Créditos avulsos a RECEBER (não adiantamento já pago) — aumentam o líquido
  const TIPOS_CREDITO_RECEBER_EXT = new Set(['A pagar', 'Caixinha']);
  const contaDoItem = (it: ExtratoItem): 'transporte' | 'especial' | 'semana' => {
    if (it.origem !== 'saida') return 'semana';
    if (TIPOS_TRANSPORTE_EXT.has(it.tipoSaida || '')) return 'transporte';
    if (TIPOS_ESPECIAL_EXT.has(it.tipoSaida || ''))   return 'especial';
    return 'semana';
  };
  const isCreditoAReceber = (it: ExtratoItem) =>
    it.origem === 'saida' && it.tipo === 'credito' && TIPOS_CREDITO_RECEBER_EXT.has(it.tipoSaida || '');
  const isAdiantamentoPago = (it: ExtratoItem) =>
    it.origem === 'saida' && it.tipo === 'credito' && !TIPOS_CREDITO_RECEBER_EXT.has(it.tipoSaida || '');

  /* ── Filtered items ─────────────────────────────────────────────────────── */
  const filteredItems = useMemo(() => items.filter(item => {
    if (filtroColaborador && !item.nomeColaborador?.toLowerCase().includes(filtroColaborador.toLowerCase())) return false;
    if (filtroTipo     !== 'todos' && item.tipo          !== filtroTipo)     return false;
    if (filtroContrato !== 'todos' && item.tipoContrato  !== filtroContrato) return false;
    if (filtroStatus   === 'pago'     && !item.pago)  return false;
    if (filtroStatus   === 'pendente' &&  item.pago)  return false;
    if (filtroOrigem   !== 'todos' && item.origem !== filtroOrigem) return false;
    return true;
  }), [items, filtroColaborador, filtroTipo, filtroContrato, filtroStatus, filtroOrigem]);

  /* ── Summary ────────────────────────────────────────────────────────────── */
  const summaryByColab = useMemo(() => {
    const map: Record<string, {
      id: string; nome: string; tipoContrato: string;
      creditos: number; debitos: number; saldo: number;
      pago: number; pendente: number; count: number;
      folhaItems: ExtratoItem[]; saidaItems: ExtratoItem[];
    }> = {};
    for (const item of filteredItems) {
      const id = item.colaboradorId;
      if (!map[id]) map[id] = {
        id, nome: item.nomeColaborador || id, tipoContrato: item.tipoContrato || '—',
        creditos: 0, debitos: 0, saldo: 0, pago: 0, pendente: 0, count: 0,
        folhaItems: [], saidaItems: [],
      };
      const v = item.valor;
      if (item.tipo === 'credito') { map[id].creditos += v; map[id].saldo += v; }
      else                         { map[id].debitos  += v; map[id].saldo -= v; }
      // Pago e pendente: apenas créditos (débitos não são "pagos" ao colaborador)
      if (item.tipo === 'credito') {
        if (item.pago) map[id].pago += v; else map[id].pendente += v;
      }
      map[id].count++;
      if (item.origem === 'folha') map[id].folhaItems.push(item);
      else                         map[id].saidaItems.push(item);
    }
    return Object.values(map).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filteredItems]);

  /* ── Totals ─────────────────────────────────────────────────────────────── */
  const totals = useMemo(() => ({
    totalFolha:    filteredItems.filter(i => i.origem === 'folha').reduce((s, i) => s + i.valor, 0),
    totalSaidas:   filteredItems.filter(i => i.origem === 'saida' && i.tipo === 'credito').reduce((s, i) => s + i.valor, 0),
    totalDescontos:filteredItems.filter(i => i.tipo === 'debito').reduce((s, i) => s + i.valor, 0),
    totalPago:     filteredItems.filter(i => i.pago  && i.tipo === 'credito').reduce((s, i) => s + i.valor, 0),
    totalPendente: filteredItems.filter(i => !i.pago && i.tipo === 'credito').reduce((s, i) => s + i.valor, 0),
    totalCreditos: filteredItems.filter(i => i.tipo === 'credito').reduce((s, i) => s + i.valor, 0),
    totalDebitos:  filteredItems.filter(i => i.tipo === 'debito').reduce((s, i) => s + i.valor, 0),
    pendentesAntigos: filteredItems.filter(i => i.origem === 'saida' && !i.pago && (i.dataPagamento || '').substring(0,7) !== mesAno).length,
  }), [filteredItems, mesAno]);

  /* ── Export ─────────────────────────────────────────────────────────────── */
  const exportarXLSX = () => {
    const data = filteredItems.map(i => ({
      'Colaborador': i.nomeColaborador, 'Tipo Contrato': i.tipoContrato,
      'Origem': i.origem === 'folha' ? 'Folha Pagamento' : 'Saída',
      'Mês': i.mes, 'Semana': i.semana || '—',
      'Tipo': i.tipo === 'credito' ? 'Crédito' : 'Débito',
      'Tipo Saída': i.tipoSaida || '—', 'Descrição': i.descricao,
      'Valor (R$)': i.valor, 'Bruto (R$)': i.valorBruto || 0,
      'Transporte (R$)': i.valorTransporte || 0, 'Desconto (R$)': i.desconto || 0,
      'Status': i.pago ? 'Pago' : 'Pendente',
      'Data Pgto': i.dataPagamento || '—', 'Observação': i.obs || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Extrato ${mesAno}`);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryByColab.map(s => ({
      'Colaborador': s.nome, 'Tipo Contrato': s.tipoContrato,
      'Total Créditos': s.creditos, 'Total Débitos': s.debitos,
      'Saldo': s.saldo, 'Pago': s.pago, 'Pendente': s.pendente, 'Lançamentos': s.count,
    }))), 'Resumo');
    XLSX.writeFile(wb, `extrato-pagamentos-${mesAno}.xlsx`);
  };

  /* ── Styles ─────────────────────────────────────────────────────────────── */
  const s = {
    card:  { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
    label: { fontSize: '13px', fontWeight: 'bold' as const, marginBottom: '4px', color: '#444', display: 'block' },
    input: { padding: '8px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', width: '100%', boxSizing: 'border-box' as const },
    select:{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', width: '100%', boxSizing: 'border-box' as const },
    btn:   (bg: string, col = 'white') => ({ padding: '8px 16px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: col }),
    tab:   (a: boolean) => ({ padding: '8px 16px', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const, borderRadius: '4px 4px 0 0', backgroundColor: a ? '#1976d2' : '#e0e0e0', color: a ? 'white' : '#333', fontSize: '13px' }),
    th:    { backgroundColor: '#1565c0', color: 'white', padding: '8px 10px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'left'   as const },
    thC:   { backgroundColor: '#1565c0', color: 'white', padding: '8px 10px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'center' as const },
    thR:   { backgroundColor: '#1565c0', color: 'white', padding: '8px 10px', fontSize: '12px', whiteSpace: 'nowrap' as const, textAlign: 'right'  as const },
    td:    { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const },
    tdR:   { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const, textAlign: 'right'  as const },
    tdC:   { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const, textAlign: 'center' as const },
    badge: (bg: string, color: string) => ({ backgroundColor: bg, color, padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' as const }),
  };

  /* ══════════════════════════════════════════════════════════════════════════
     MODAL — Detalhe (read-only)
  ══════════════════════════════════════════════════════════════════════════ */
  const ModalDetalhe = ({ item, onClose }: { item: ExtratoItem; onClose: () => void }) => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ ...s.card, maxWidth: '520px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, color: '#1565c0' }}>📋 Detalhes do Lançamento</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <tbody>
            {[
              { label: 'Colaborador',     value: item.nomeColaborador },
              { label: 'Tipo Contrato',   value: item.tipoContrato },
              { label: 'Origem',          value: item.origem === 'folha' ? '💰 Folha de Pagamento' : '📤 Saída' },
              { label: 'Mês',             value: item.mes },
              { label: 'Semana',          value: item.semana ? fmtDataBR(item.semana) : 'Mensal' },
              ...(item.periodoInicio ? [{ label: 'Período pago', value: `${fmtDataBR(item.periodoInicio)} – ${fmtDataBR(item.periodoFim || '')}` }] : []),
              { label: 'Tipo',            value: item.tipo === 'credito' ? '📈 Crédito' : '📉 Débito' },
              ...(item.tipoSaida ? [{ label: 'Tipo Saída', value: item.tipoSaida }] : []),
              { label: 'Descrição',       value: item.descricao },
              { label: 'Valor Total',     value: fmtMoeda(item.valor) },
              ...(item.valorBruto    ? [{ label: item.tipoContrato === 'CLT' ? 'Salário Bruto' : 'Bruto (dobras)',   value: fmtMoeda(item.valorBruto) }]    : []),
              ...(item.valorTransporte ? [{ label: 'Transporte',    value: fmtMoeda(item.valorTransporte!) }] : []),
              ...(item.desconto      ? [{ label: 'Desconto saídas', value: fmtMoeda(item.desconto) }]      : []),
              { label: 'Forma de Pagamento', value: item.formaPagamento ? (item.formaPagamento === 'PIX' ? '📱 PIX' : item.formaPagamento === 'Dinheiro' ? '💵 Dinheiro' : '🔄 Misto') : '—' },
              { label: 'Status',          value: item.pago ? '✅ Pago' : '⏳ Pendente' },
              { label: 'Data Pagamento',  value: item.dataPagamento ? fmtDataBR(item.dataPagamento) : '—' },
              { label: 'Observação',      value: item.obs || '—' },
              { label: 'Atualizado em',   value: item.updatedAt ? new Date(item.updatedAt).toLocaleString('pt-BR') : '—' },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fafafa' : 'white' }}>
                <td style={{ padding: '7px 10px', fontWeight: 'bold', color: '#555', width: '40%' }}>{row.label}</td>
                <td style={{ padding: '7px 10px', color: '#333' }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Log de pagamentos (para itens de folha com múltiplos lançamentos) */}
        {(item.logPagamentos || []).length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#1565c0', marginBottom: '6px' }}>📜 Histórico de Pagamentos</div>
            {(item.logPagamentos || []).map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', padding: '6px 10px', backgroundColor: i % 2 === 0 ? '#f5f5f5' : 'white', borderRadius: '4px', fontSize: '12px', alignItems: 'center', marginBottom: '2px' }}>
                <span style={{ fontWeight: 'bold', color: '#2e7d32', minWidth: '80px' }}>{fmtMoeda(p.valor)}</span>
                <span style={{ color: p.forma === 'PIX' ? '#1565c0' : p.forma === 'Dinheiro' ? '#2e7d32' : '#e65100', fontWeight: 'bold' }}>
                  {p.forma === 'PIX' ? '📱 PIX' : p.forma === 'Dinheiro' ? '💵 Dinheiro' : '🔄 Misto'}
                </span>
                {p.forma === 'Misto' && p.valorPix !== undefined && (
                  <span style={{ color: '#666', fontSize: '11px' }}>PIX {fmtMoeda(p.valorPix)} + Din. {fmtMoeda(p.valorDinheiro || 0)}</span>
                )}
                <span style={{ color: '#888' }}>{p.data}</span>
                {p.tipo && <span style={{ color: '#9e9e9e', fontSize: '11px', backgroundColor: '#f0f0f0', padding: '1px 6px', borderRadius: '8px' }}>{p.tipo}</span>}
                {p.obs && <span style={{ color: '#aaa', fontStyle: 'italic' }}>{p.obs}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Analítico por dia/turno (freelancers) */}
        {(item.diasPagos || []).length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#2e7d32', marginBottom: '6px' }}>📅 Analítico por Dia/Turno</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#e8f5e9' }}>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 'bold', color: '#1b5e20' }}>Data</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 'bold', color: '#1b5e20' }}>Turno</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 'bold', color: '#1b5e20' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {(item.diasPagos || []).map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#f9fbe7' : 'white' }}>
                    <td style={{ padding: '5px 8px', color: '#333' }}>
                      {new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </td>
                    <td style={{ padding: '5px 8px' }}>
                      <span style={{ backgroundColor: d.turno === 'DiaNoite' ? '#fff3e0' : d.turno === 'Dia' ? '#e3f2fd' : '#fce4ec', color: d.turno === 'DiaNoite' ? '#e65100' : d.turno === 'Dia' ? '#1565c0' : '#880e4f', padding: '1px 6px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                        {d.turno === 'DiaNoite' ? '☀️🌙 DN' : d.turno === 'Dia' ? '☀️ D' : '🌙 N'}
                      </span>
                    </td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 'bold', color: '#2e7d32' }}>{fmtMoeda(d.valor)}</td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: '#e8f5e9', fontWeight: 'bold' }}>
                  <td colSpan={2} style={{ padding: '5px 8px', color: '#1b5e20' }}>Total</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#1b5e20' }}>
                    {fmtMoeda((item.diasPagos || []).reduce((s, d) => s + d.valor, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          {item.origem === 'saida' && (
            <button onClick={() => { onClose(); abrirEdicao(item); }}
              style={s.btn('#f57c00')}>✏️ Editar</button>
          )}
          {item.origem === 'saida' && (
            <button onClick={() => { onClose(); setExcluirMotivo(''); setModalExcluir(item); }}
              style={s.btn('#b71c1c')}>🗑️ Excluir</button>
          )}
          <button onClick={() => { onClose(); setAjusteForm({ tipo: 'credito', valor: '', descricao: '', data: new Date().toISOString().split('T')[0], obs: '' }); setModalAjuste(item); }}
            style={s.btn('#1565c0')}>⚖️ Ajuste Manual</button>
          <button onClick={onClose} style={s.btn('#9e9e9e')}>Fechar</button>
        </div>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════════════
     MODAL — Edição de Saída
     Permite: alterar valor, descrição, tipo, data, status (pago/pendente), obs
     Caso de uso: "chopp IPA de R$50 foi pago mas não descontei → marcar como
     Pendente e ajustar dataPagamento para o próximo mês"
  ══════════════════════════════════════════════════════════════════════════ */
  /* ═══ Exclusão lógica com audit trail ═══ */
  const confirmarExclusao = async () => {
    if (!modalExcluir) return;
    if (!excluirMotivo.trim()) { alert('Informe o motivo da exclusão'); return; }
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      const usuario = 'admin'; // TODO: puxar do contexto de auth
      const body = {
        excluido: true,
        excluidoPor: usuario,
        excluidoEm: agora,
        motivoExclusao: excluirMotivo.trim(),
        updatedAt: agora,
      };
      const res = await fetchAuth(`${apiUrl}/saidas/${modalExcluir.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setModalExcluir(null);
      setExcluirMotivo('');
      await carregarDados();
    } catch (e: any) {
      alert('Erro ao excluir: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  /* ═══ Modal: Confirmar Exclusão ═══ */
  const ModalExcluir = () => {
    if (!modalExcluir) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setModalExcluir(null)}>
        <div style={{ ...s.card, maxWidth: '440px', width: '96%' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, color: '#b71c1c' }}>🗑️ Excluir Lançamento</h3>
            <button onClick={() => setModalExcluir(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ backgroundColor: '#ffebee', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px' }}>
            <strong>{modalExcluir.nomeColaborador}</strong><br/>
            {modalExcluir.descricao} &bull; <strong style={{color:'#c62828'}}>R$ {(modalExcluir.valor||0).toFixed(2)}</strong>
          </div>
          <p style={{ fontSize: '12px', color: '#555', margin: '0 0 10px' }}>
            O lançamento será <strong>ocultado</strong> do extrato mas mantido no banco com registro de quem excluiu e quando. Visível na aba “Excluídos”.
          </p>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>Motivo da exclusão <span style={{color:'red'}}>*</span></label>
            <input type="text" value={excluirMotivo}
              onChange={e => setExcluirMotivo(e.target.value)}
              placeholder="Ex: Lançamento duplicado, valor incorreto..."
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid #ef9a9a', borderRadius: '6px', fontSize: '13px' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setModalExcluir(null)} style={s.btn('#9e9e9e')}>Cancelar</button>
            <button onClick={confirmarExclusao} disabled={salvando || !excluirMotivo.trim()}
              style={s.btn('#b71c1c')}>{salvando ? 'Excluindo...' : '🗑️ Confirmar Exclusão'}</button>
          </div>
        </div>
      </div>
    );
  };

  /* ═══ Saída: salvar ajuste manual ═══ */
  const salvarAjusteManual = async () => {
    if (!modalAjuste) return;
    const val = parseFloat(ajusteForm.valor);
    if (!val || val <= 0) { alert('Informe um valor válido'); return; }
    if (!ajusteForm.descricao.trim()) { alert('Informe uma descrição'); return; }
    setSalvando(true);
    try {
      const tipo = ajusteForm.tipo === 'credito' ? 'A pagar' : 'Consumo Interno';
      const body = {
        colaboradorId: modalAjuste.colaboradorId,
        unitId:        modalAjuste.unitId || unitId,
        data:          ajusteForm.data,
        tipo,
        origem:        tipo,
        referencia:    tipo,
        valor:         val,
        descricao:     ajusteForm.descricao.trim(),
        observacao:    ajusteForm.obs.trim() || `Ajuste manual via Extrato — ${ajusteForm.tipo === 'credito' ? 'crédito' : 'débito'} de R$${val.toFixed(2)}`,
        pago:          false,
      };
      const res = await fetchAuth(`${apiUrl}/saidas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setModalAjuste(null);
      setAjusteForm({ tipo: 'credito', valor: '', descricao: '', data: new Date().toISOString().split('T')[0], obs: '' });
      await carregarDados();
    } catch (e: any) {
      alert('Erro ao salvar ajuste: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  /* ═══ Modal: Ajuste Manual ═══ */
  const ModalAjusteManual = () => {
    if (!modalAjuste) return null;
    const isCred = ajusteForm.tipo === 'credito';
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setModalAjuste(null)}>
        <div style={{ ...s.card, maxWidth: '480px', width: '96%', maxHeight: '92vh', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: '#1565c0' }}>⚖️ Ajuste Manual</h3>
            <button onClick={() => setModalAjuste(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ backgroundColor: '#e3f2fd', borderRadius: '6px', padding: '8px 12px', marginBottom: '14px', fontSize: '13px', color: '#1565c0' }}>
            <strong>{modalAjuste.nomeColaborador}</strong> · {mesAno}
          </div>
          {/* Tipo */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>Tipo de ajuste</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              {(['credito','debito'] as const).map(t => (
                <button key={t} onClick={() => setAjusteForm(f => ({...f, tipo: t}))}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', border: `2px solid ${ajusteForm.tipo===t ? (t==='credito'?'#2e7d32':'#c62828') : '#ddd'}`, background: ajusteForm.tipo===t ? (t==='credito'?'#e8f5e9':'#fce4ec') : 'white', fontWeight: 600, cursor: 'pointer', color: t==='credito'?'#2e7d32':'#c62828' }}>
                  {t === 'credito' ? '➕ Crédito (a pagar ao colaborador)' : '➖ Débito (desconto do colaborador)'}
                </button>
              ))}
            </div>
          </div>
          {/* Valor */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>Valor (R$)</label>
            <input type="number" step="0.01" min="0.01" value={ajusteForm.valor}
              onChange={e => setAjusteForm(f => ({...f, valor: e.target.value}))}
              placeholder="0,00"
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '8px 10px', border: `1px solid ${isCred?'#a5d6a7':'#ef9a9a'}`, borderRadius: '6px', fontSize: '14px', fontWeight: 600, color: isCred?'#2e7d32':'#c62828' }} />
          </div>
          {/* Descrição */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>Descrição <span style={{color:'red'}}>*</span></label>
            <input type="text" value={ajusteForm.descricao}
              onChange={e => setAjusteForm(f => ({...f, descricao: e.target.value}))}
              placeholder="Ex: Correção desconto indevido em 27/04"
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
          </div>
          {/* Data */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>Data de referência</label>
            <input type="date" value={ajusteForm.data}
              onChange={e => setAjusteForm(f => ({...f, data: e.target.value}))}
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }} />
          </div>
          {/* Obs */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>Observação (opcional)</label>
            <textarea value={ajusteForm.obs} rows={2}
              onChange={e => setAjusteForm(f => ({...f, obs: e.target.value}))}
              placeholder="Motivo do ajuste, referência ao lançamento original..."
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', resize: 'vertical' }} />
          </div>
          {/* Preview */}
          {ajusteForm.valor && parseFloat(ajusteForm.valor) > 0 && (
            <div style={{ backgroundColor: isCred?'#e8f5e9':'#fce4ec', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px' }}>
              <strong>Preview:</strong> {isCred ? '➕ Crédito' : '➖ Débito'} de{' '}
              <strong style={{color: isCred?'#2e7d32':'#c62828'}}>R$ {parseFloat(ajusteForm.valor||'0').toFixed(2)}</strong>{' '}
              para <strong>{modalAjuste.nomeColaborador}</strong> em {ajusteForm.data}<br/>
              <span style={{fontSize:'11px',color:'#666'}}>Aparecerá automaticamente no próximo modal de pagamento</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setModalAjuste(null)} style={s.btn('#9e9e9e')}>Cancelar</button>
            <button onClick={salvarAjusteManual} disabled={salvando}
              style={s.btn(isCred?'#2e7d32':'#c62828')}>{salvando ? 'Salvando...' : '✔ Confirmar Ajuste'}</button>
          </div>
        </div>
      </div>
    );
  };

  const ModalEdicaoSaida = () => {
    if (!editItem) return null;
    const isPendente = editForm.pago === false || editForm.pago === 'false';
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setEditItem(null)}>
        <div style={{ ...s.card, maxWidth: '540px', width: '96%', maxHeight: '92vh', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: '#f57c00' }}>✏️ Editar Lançamento</h3>
            <button onClick={() => setEditItem(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Info header */}
          <div style={{ backgroundColor: '#fff3e0', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', borderLeft: '4px solid #f57c00' }}>
            <strong>{editItem.nomeColaborador}</strong> · {editItem.tipoSaida || editItem.descricao}
            {!editItem.pago && (
              <div style={{ marginTop: '4px', color: '#e65100' }}>
                ⚠️ Este lançamento está <strong>pendente</strong> — aparecerá automaticamente no extrato do mês atual.
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: '14px' }}>

            {/* Tipo */}
            <div>
              <label style={s.label}>Categoria / Tipo *</label>
              <select value={editForm.tipoSaida} onChange={e => setEditForm({ ...editForm, tipoSaida: e.target.value })} style={s.select}>
                <optgroup label="➕ Crédito (pago ao colaborador)">
                  {TIPOS_SAIDA.filter(t => !TIPOS_DEBITO.includes(t)).map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
                <optgroup label="➖ Débito (desconto do colaborador)">
                  {TIPOS_SAIDA.filter(t => TIPOS_DEBITO.includes(t)).map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              </select>
              {/* Visual hint: show if selected category is credit or debit */}
              <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: 'bold',
                color: TIPOS_DEBITO.includes(editForm.tipoSaida) ? '#c62828' : '#2e7d32' }}>
                {TIPOS_DEBITO.includes(editForm.tipoSaida)
                  ? '➖ Débito — será descontado do colaborador'
                  : '➕ Crédito — será pago ao colaborador'}
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label style={s.label}>Descrição *</label>
              <input type="text" value={editForm.descricao}
                onChange={e => setEditForm({ ...editForm, descricao: e.target.value })} style={s.input} />
            </div>

            {/* Valor */}
            <div>
              <label style={s.label}>Valor (R$) *</label>
              <input type="number" step="0.01" min="0" value={editForm.valor}
                onChange={e => setEditForm({ ...editForm, valor: e.target.value })} style={s.input} />
            </div>

            {/* Status + Data */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={s.label}>Status *</label>
                <select value={String(editForm.pago)}
                  onChange={e => setEditForm({ ...editForm, pago: e.target.value === 'true' })} style={s.select}>
                  <option value="true">✅ Pago</option>
                  <option value="false">⏳ Pendente (cobrar no próximo pagamento)</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Data de referência</label>
                <input type="date" value={editForm.dataPagamento}
                  onChange={e => setEditForm({ ...editForm, dataPagamento: e.target.value })} style={s.input} />
              </div>
            </div>

            {/* Aviso pendente */}
            {isPendente && (
              <div style={{ backgroundColor: '#fff9c4', borderRadius: '6px', padding: '10px 14px', fontSize: '12px', borderLeft: '4px solid #f9a825', color: '#5d4037' }}>
                <strong>⏳ Lançamento ficará em aberto.</strong> Ele continuará aparecendo no extrato do mês atual (
                <strong>{mesAno}</strong>) mesmo com data de referência em outro mês.
                Quando for descontado, edite novamente e marque como <strong>Pago</strong>.
              </div>
            )}

            {/* Forma de Pagamento */}
            <div>
              <label style={s.label}>💳 Forma de Pagamento</label>
              <select value={editForm.formaPagamento || ''}
                onChange={e => setEditForm({ ...editForm, formaPagamento: e.target.value || undefined })}
                style={s.select}>
                <option value="">— Não informada</option>
                <option value="PIX">📱 PIX</option>
                <option value="Dinheiro">💵 Dinheiro</option>
                <option value="Misto">🔄 Misto (parte PIX + parte Dinheiro)</option>
              </select>
            </div>

            {/* Observação */}
            <div>
              <label style={s.label}>Observação</label>
              <textarea value={editForm.obs} rows={3}
                onChange={e => setEditForm({ ...editForm, obs: e.target.value })}
                style={{ ...s.input, resize: 'vertical' as const }}
                placeholder="Ex: não descontado em abr/26 — cobrar em mai/26" />
            </div>

          </div>

          <div style={{ marginTop: '18px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => setEditItem(null)} disabled={salvando} style={s.btn('#9e9e9e')}>Cancelar</button>
            <button onClick={salvarEdicaoSaida} disabled={salvando} style={s.btn('#43a047')}>
              {salvando ? '⏳ Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════════════
     MODAL — Analítico por colaborador (com edição inline)
  ══════════════════════════════════════════════════════════════════════════ */
  const ModalColaborador = ({ colabId, onClose }: { colabId: string; onClose: () => void }) => {
    const [expandidos, setExpandidos] = React.useState<Set<string>>(new Set());
    const toggleExpandido = (id: string) => setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

    // --- Dados do motoboy (fetch assíncrono) ---
    const [motoboyData, setMotoboyData] = React.useState<any[] | null>(null);
    React.useEffect(() => {
      // Buscar dados do controle-motoboy se CLT
      const fetchMotoboy = async () => {
        try {
          const tk = localStorage.getItem('auth_token');
          const r = await fetchAuth(`${apiUrl}/controle-motoboy?motoboyId=${colabId}&mes=${mesAno}&unitId=${unitId}`, {
            headers: tk ? { Authorization: `Bearer ${tk}` } : {},
          });
          if (r?.ok) {
            const d = await r.json();
            setMotoboyData(Array.isArray(d) ? d : []);
          } else { setMotoboyData([]); }
        } catch { setMotoboyData([]); }
      };
      fetchMotoboy();
    }, [colabId, mesAno, unitId]);

    const colabItems = items.filter(i => i.colaboradorId === colabId).sort((a, b) => {
      const dA = a.dataPagamento || a.semana || a.mes || '';
      const dB = b.dataPagamento || b.semana || b.mes || '';
      return dB.localeCompare(dA);
    });
    const nome = colabItems[0]?.nomeColaborador || colabId;

    // Detectar CLT: tipoContrato === 'CLT' ou existência de folha sem semana
    const folhaCLT = colabItems.find(i => i.origem === 'folha' && (!i.semana || i.semana === undefined) && (i.tipoContrato === 'CLT' || i.descricao?.includes('CLT')));
    const isCLT = colabItems.some(i => i.tipoContrato === 'CLT') || !!folhaCLT;

    // ═══════════════════════════════════════════════════════
    // CLT: Demonstrativo Mensal (reescrito 2026-06-25)
    // ═══════════════════════════════════════════════════════
    if (isCLT) {
      // --- Dados da folha (raw = registro do backend) ---
      const folhaItem = colabItems.find(i => i.origem === 'folha' && (!i.semana || i.semana === undefined) && !i.id?.endsWith('_adto') && !i.id?.endsWith('_var'));
      const raw = folhaItem?.raw || {} as any;
      const logPgtos: any[] = raw.logPagamentos || [];

      // --- Dados do colaborador + cálculo via ENGINE CENTRALIZADO ---
      const colab = colabsState.find((c: any) => c.id === colabId) || {} as any;
      const isMotoboy = motoboyData && motoboyData.length > 0;
      const feriado = R(raw.feriadoContabil) || R(raw.feriado) || 0;
      const feriadosTrab = feriado > 0 ? Math.round(feriado / ((R(colab.salario) || 1) / 30)) || 1 : 0;

      // Chamar engine centralizado (FONTE ÚNICA de cálculo)
      const engineResult = calcularFolhaCLT({
        colaborador: {
          id: colabId,
          nome: nome,
          salario: R(colab.salario) || R(raw.valorBruto) || 0,
          periculosidade: R(colab.periculosidade) || 0,
          contribuicaoAssistencial: R(raw.contrAssist) || R(colab.contribuicaoAssistencial) || 0,
          valorTransporte: R(colab.valorTransporte),
          isMotoboy: !!isMotoboy,
        },
        mesAno,
        feriadosTrab,
        folhaSalva: raw.id ? raw : null,
      });

      // Extrair variáveis para compat com render existente
      const salarioBase = engineResult.salarioBase;
      const percPericulosidade = R(colab.periculosidade) || 0;
      const valorPericulosidade = engineResult.periculosidadeValor;
      const brutoHolerite = engineResult.holerite.bruto;
      const inssValor = engineResult.inss;
      const contrAssist = engineResult.contrAssistencial;
      const vtDesconto = engineResult.valeTransporte;
      const descontosLegais = inssValor + contrAssist + vtDesconto;
      const liquidoHolerite = engineResult.holerite.liquido;
      const fonteHolerite = engineResult.holerite.fonte;

      // --- Motoboy data ---
      const mbEntD = motoboyData ? motoboyData.reduce((s: number, d: any) => s + (parseFloat(d.entDia) || 0), 0) : 0;
      const mbEntN = motoboyData ? motoboyData.reduce((s: number, d: any) => s + (parseFloat(d.entNoite) || 0), 0) : 0;
      const mbCaixD = motoboyData ? motoboyData.reduce((s: number, d: any) => s + (parseFloat(d.caixinhaDia) || 0), 0) : 0;
      const mbCaixN = motoboyData ? motoboyData.reduce((s: number, d: any) => s + (parseFloat(d.caixinhaNoite) || 0), 0) : 0;
      const mbVlVar = motoboyData ? motoboyData.reduce((s: number, d: any) => s + (parseFloat(d.vlVariavel) || 0), 0) : 0;
      const mbDias = motoboyData ? motoboyData.filter((d: any) => (parseFloat(d.entDia) || 0) + (parseFloat(d.entNoite) || 0) > 0).length : 0;
      const temMotoboy = motoboyData && motoboyData.length > 0 && mbVlVar > 0;
      const totalEntregas = mbEntD + mbEntN;
      const totalCaixinhas = mbCaixD + mbCaixN;
      const valorEntrega = R(colab.valorEntrega) || (totalEntregas > 0 ? Math.round((mbVlVar - totalCaixinhas) / totalEntregas * 100) / 100 : 0);

      // --- Saídas do mês (categorizadas) ---
      const saidas = colabItems.filter(i => i.origem === 'saida');

      // Separar: PAGAMENTOS (dinheiro que foi pro colaborador) vs DESCONTOS (abatidos da remuneração)
      // Adiantamento Salário NÃO é pagamento separado — é parte do adiantamento dia 20 (já no logPagamentos)
      const TIPOS_PAGAMENTO = ['Adiantamento Transporte', 'Adiantamento Especial'];
      const TIPOS_INTERNOS = ['Adiantamento Salário'];  // registros internos, não são PIXs separados
      const saidasPagamento: { cat: string; items: ExtratoItem[]; total: number }[] = [];
      const saidasDesconto: { cat: string; items: ExtratoItem[]; total: number }[] = [];
      const saidasPorCat: Record<string, { items: ExtratoItem[]; total: number }> = {};

      for (const sa of saidas) {
        const cat = sa.tipoSaida || sa.descricao || 'Outros';
        if (!saidasPorCat[cat]) saidasPorCat[cat] = { items: [], total: 0 };
        saidasPorCat[cat].items.push(sa);
        saidasPorCat[cat].total += R(sa.valor);
      }

      for (const [cat, data] of Object.entries(saidasPorCat)) {
        if (TIPOS_PAGAMENTO.includes(cat)) {
          saidasPagamento.push({ cat, items: data.items, total: data.total });
        } else if (!TIPOS_INTERNOS.includes(cat)) {
          // Registros internos (Adiantamento Salário) não aparecem nem como pagamento nem como desconto
          saidasDesconto.push({ cat, items: data.items, total: data.total });
        }
      }

      const totalDescontos = saidasDesconto.reduce((s, c) => s + c.total, 0);
      const totalPagamentosSaidas = saidasPagamento.reduce((s, c) => s + c.total, 0);

      // --- Cálculos finais ---
      // Lógica de conciliação:
      //   BRUTO = holerite vencimentos + variável bruto (entregas + caixinhas)
      //   DESCONTOS = tudo que ele NÃO recebe (INSS, faltas, contrib, consumo operacional)
      //   TOTAL PAGO = tudo que ele RECEBEU (PIXs + transporte + caixinha dinheiro)
      //   SALDO = BRUTO - DESCONTOS - TOTAL PAGO

      // Adiantamento transporte (saídas)
      const adtoTransporte = saidasPagamento
        .filter(sp => sp.cat === 'Adiantamento Transporte')
        .reduce((s, sp) => s + sp.total, 0);


      // BRUTO do mês
      // Se conferido: vencimentos do holerite (soma de rubricas de vencimento)
      // Senão: holerite líquido padrão
      const vencimentosHolerite = engineResult.conferido && engineResult.holerite.rubricas
        ? engineResult.holerite.rubricas
            .filter((r: any) => parseFloat(r.vencimento) > 0)
            .reduce((s: number, r: any) => s + (parseFloat(r.vencimento) || 0), 0)
        : liquidoHolerite;

      // Descontos do holerite (INSS, faltas, contribuição sindical, etc.)
      // EXCLUI "Adiantamento Anterior" e "Arredondamento Anterior" (são pagamentos, não descontos reais)
      const descontosHoleriteReais = engineResult.conferido && engineResult.holerite.rubricas
        ? engineResult.holerite.rubricas
            .filter((r: any) => {
              const d = (r.descricao || '').toLowerCase();
              const isAdto = d.includes('adiantamento') || d.includes('arredondamento anterior');
              return parseFloat(r.desconto) > 0 && !isAdto;
            })
            .reduce((s: number, r: any) => s + (parseFloat(r.desconto) || 0), 0)
        : 0;

      // Bruto total = vencimentos do holerite + variável bruto
      const brutoRealMes = vencimentosHolerite + (temMotoboy ? mbVlVar : 0);


      // PIXs reais do logPagamentos
      const totalPIXs = logPgtos.reduce((s: number, lp: any) => s + (parseFloat(lp.valor) || 0), 0);

      // Total pago = PIXs + TODAS as saídas tipo pagamento (incluindo transporte)
      // Caixinha (saída operacional) conta como paga também — é dinheiro recebido em mãos
      // Buscar caixinha nas saídas desconto (foi categorizada como desconto, mas é pagamento)
      const caixinhaSaida = saidasDesconto
        .filter(sd => sd.cat.toLowerCase().includes('caixinha'))
        .reduce((s, sd) => s + sd.total, 0);
      const descontosSemCaixinha = saidasDesconto
        .filter(sd => !sd.cat.toLowerCase().includes('caixinha'));
      const totalDescontosSemCaixinha = descontosSemCaixinha.reduce((s, sd) => s + sd.total, 0);

      const totalPagoGeral = totalPIXs + totalPagamentosSaidas + caixinhaSaida;

      // Descontos totais reais = holerite reais + operacionais sem caixinha
      const descontosFinais = descontosHoleriteReais + totalDescontosSemCaixinha;

      const saldo = brutoRealMes - descontosFinais - totalPagoGeral;
      // Tolerância de arredondamento: até 0.5% do bruto ou R$20 (o menor)
      const tolerancia = Math.min(brutoRealMes * 0.005, 20);
      const quitado = Math.abs(saldo) <= Math.max(tolerancia, 1);

      // Compat com variáveis usadas no render
      const liquidoMes = brutoRealMes - descontosFinais;

      const [anoStr, mesStr] = mesAno.split('-');
      const nomeMes = new Date(parseInt(anoStr), parseInt(mesStr) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

      return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={onClose}>
          <div style={{ ...s.card, maxWidth: '820px', width: '97%', maxHeight: '93vh', overflowY: 'auto', padding: '20px' }}
            onClick={e => e.stopPropagation()}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#1565c0', fontSize: '16px' }}>📋 Demonstrativo — {nome}</h3>
                <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', backgroundColor: '#e3f2fd', color: '#1565c0' }}>
                    📅 {nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}
                  </span>
                  <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', backgroundColor: '#e8f5e9', color: '#2e7d32' }}>
                    💼 CLT {temMotoboy ? '+ Motoboy' : ''}
                  </span>
                  {quitado && <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', backgroundColor: '#e8f5e9', color: '#2e7d32' }}>✅ Quitado</span>}
                  {!quitado && saldo > 0 && <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', backgroundColor: '#fff9c4', color: '#f57f17' }}>⏳ Saldo pendente</span>}
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            {/* ═══ CARD RESUMO NO TOPO ═══ */}
            <div style={{ padding: '16px', borderRadius: '12px', background: quitado ? 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)' : 'linear-gradient(135deg, #fff9c4 0%, #fff176 100%)', borderLeft: `5px solid ${quitado ? '#2e7d32' : '#f9a825'}`, marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    {engineResult.conferido ? 'Bruto do Mês' : 'Líquido do Mês'}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1565c0' }}>
                    {fmtMoeda(engineResult.conferido ? brutoRealMes : liquidoMes)}
                  </div>
                  {engineResult.conferido && (
                    <div style={{ fontSize: '9px', color: '#888' }}>venc {fmtMoeda(vencimentosHolerite)} + var {fmtMoeda(mbVlVar)}</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Pago</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2e7d32' }}>{fmtMoeda(totalPagoGeral)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', fontWeight: 'bold' }}>Saldo</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: quitado ? '#2e7d32' : saldo > 0 ? '#f57f17' : '#c62828' }}>
                    {quitado ? '✅ R$ 0,00' : fmtMoeda(saldo)}
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ BLOCO 1: REMUNERAÇÃO (HOLERITE) ═══ */}
            <div style={{ marginBottom: '14px', padding: '16px 18px', borderRadius: '12px', background: 'linear-gradient(135deg, #1a2236 0%, #243044 100%)', color: '#e8f0fe' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#90caf9', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                💼 HOLERITE — SALÁRIO
                {fonteHolerite === 'contabil' && <span style={{ fontSize: '9px', color: '#81c784', marginLeft: '8px' }}>✅ Conferido (contabilidade)</span>}
              </div>

              {/* Se tem rubricas e é conferido, mostrar rubricas reais */}
              {fonteHolerite === 'contabil' && Array.isArray(raw.rubricas) && raw.rubricas.length > 0 ? (
                <>
                  {/* Vencimentos */}
                  {raw.rubricas.filter((r: any) => parseFloat(r.vencimento) > 0).map((r: any, i: number) => (
                    <div key={`v${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '12px' }}>
                      <span style={{ color: '#bbdefb' }}>{r.descricao}{r.referencia ? ` (ref: ${r.referencia})` : ''}</span>
                      <span style={{ color: '#a5d6a7', fontWeight: 'bold' }}>+{fmtMoeda(parseFloat(r.vencimento))}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: '6px', paddingTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                      <span style={{ color: '#bbdefb', fontWeight: 'bold' }}>Total Vencimentos</span>
                      <span style={{ color: '#fff', fontWeight: 'bold' }}>{fmtMoeda(raw.rubricas.reduce((s: number, r: any) => s + (parseFloat(r.vencimento) || 0), 0))}</span>
                    </div>
                  </div>
                  {/* Descontos */}
                  <div style={{ borderTop: '1px dashed rgba(255,255,255,0.12)', marginTop: '6px', paddingTop: '6px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#ef9a9a', marginBottom: '4px' }}>DESCONTOS:</div>
                    {raw.rubricas.filter((r: any) => parseFloat(r.desconto) > 0).map((r: any, i: number) => (
                      <div key={`d${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '12px' }}>
                        <span style={{ color: '#ef9a9a' }}>{r.descricao}{r.referencia ? ` (ref: ${r.referencia})` : ''}</span>
                        <span style={{ color: '#ef9a9a', fontWeight: 'bold' }}>−{fmtMoeda(parseFloat(r.desconto))}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 0', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ fontSize: '11px', color: '#ef9a9a', fontWeight: 'bold' }}>Total Descontos</span>
                      <span style={{ fontSize: '11px', color: '#ef9a9a', fontWeight: 'bold' }}>−{fmtMoeda(raw.rubricas.reduce((s: number, r: any) => s + (parseFloat(r.desconto) || 0), 0))}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                    <span style={{ color: '#bbdefb' }}>Salário base</span>
                    <span style={{ color: '#fff', fontWeight: 'bold' }}>{fmtMoeda(salarioBase)}</span>
                  </div>
                  {valorPericulosidade > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                      <span style={{ color: '#bbdefb' }}>Periculosidade ({percPericulosidade}%)</span>
                      <span style={{ color: '#a5d6a7', fontWeight: 'bold' }}>+{fmtMoeda(valorPericulosidade)}</span>
                    </div>
                  )}
                  {feriado > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                      <span style={{ color: '#bbdefb' }}>Feriado trabalhado</span>
                      <span style={{ color: '#a5d6a7', fontWeight: 'bold' }}>+{fmtMoeda(feriado)}</span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: '6px', paddingTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                      <span style={{ color: '#bbdefb', fontWeight: 'bold' }}>Bruto</span>
                      <span style={{ color: '#fff', fontWeight: 'bold' }}>{fmtMoeda(brutoHolerite)}</span>
                    </div>
                  </div>
                  {descontosLegais > 0 && (
                    <div style={{ borderTop: '1px dashed rgba(255,255,255,0.12)', marginTop: '6px', paddingTop: '6px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#ef9a9a', marginBottom: '4px' }}>DESCONTOS LEGAIS:</div>
                      {inssValor > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '12px' }}>
                          <span style={{ color: '#ef9a9a' }}>INSS</span>
                          <span style={{ color: '#ef9a9a', fontWeight: 'bold' }}>−{fmtMoeda(inssValor)}</span>
                        </div>
                      )}
                      {contrAssist > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '12px' }}>
                          <span style={{ color: '#ef9a9a' }}>Contr. Assistencial</span>
                          <span style={{ color: '#ef9a9a', fontWeight: 'bold' }}>−{fmtMoeda(contrAssist)}</span>
                        </div>
                      )}
                      {vtDesconto > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '12px' }}>
                          <span style={{ color: '#ef9a9a' }}>Vale Transporte (6%)</span>
                          <span style={{ color: '#ef9a9a', fontWeight: 'bold' }}>−{fmtMoeda(vtDesconto)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Líquido holerite */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '2px solid rgba(255,255,255,0.25)', marginTop: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>Líquido Holerite</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#69f0ae' }}>{fmtMoeda(liquidoHolerite)}</span>
              </div>
            </div>

            {/* ═══ BLOCO 2: VARIÁVEL MOTOBOY ═══ */}
            {temMotoboy && (
              <div style={{ marginBottom: '14px', padding: '16px 18px', borderRadius: '12px', background: 'linear-gradient(135deg, #3e2723 0%, #4e342e 100%)', color: '#efebe9' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#ffcc80', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                  🏍️ VARIÁVEL MOTOBOY — CORRIDAS
                </div>

                {/* Resumo cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ padding: '8px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#ffcc80' }}>Entregas</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>{totalEntregas.toFixed(0)}</div>
                    <div style={{ fontSize: '9px', color: '#bcaaa4' }}>☀️{mbEntD.toFixed(0)} · 🌙{mbEntN.toFixed(0)}</div>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#ffcc80' }}>Caixinhas</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#a5d6a7' }}>{fmtMoeda(totalCaixinhas)}</div>
                    <div style={{ fontSize: '9px', color: '#bcaaa4' }}>☀️R${fmt(mbCaixD)} · 🌙R${fmt(mbCaixN)}</div>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#ffcc80' }}>Valor/entrega</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#90caf9' }}>{fmtMoeda(valorEntrega)}</div>
                    <div style={{ fontSize: '9px', color: '#bcaaa4' }}>{mbDias} dias trabalhados</div>
                  </div>
                </div>

                {/* Total variável */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '2px solid rgba(255,255,255,0.25)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>Total Variável</span>
                  <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffcc80' }}>{fmtMoeda(mbVlVar)}</span>
                </div>

                {/* Tabela diária expansível */}
                <div style={{ cursor: 'pointer', padding: '6px 10px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '11px', color: '#ffcc80', fontWeight: 'bold', marginTop: '10px' }}
                  onClick={() => toggleExpandido('motoboy_diario')}>
                  {expandidos.has('motoboy_diario') ? '▼' : '▶'} Ver detalhamento diário
                </div>
                {expandidos.has('motoboy_diario') && (
                  <div style={{ maxHeight: '280px', overflowY: 'auto', marginTop: '6px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#5d4037', color: '#ffcc80' }}>
                          <th style={{ padding: '4px 6px', textAlign: 'left' }}>Data</th>
                          <th style={{ padding: '4px 6px', textAlign: 'center' }}>☀️</th>
                          <th style={{ padding: '4px 6px', textAlign: 'center' }}>🌙</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>Caix.</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>Variável</th>
                        </tr>
                      </thead>
                      <tbody>
                        {motoboyData!
                          .sort((a: any, b: any) => (a.data || '').localeCompare(b.data || ''))
                          .filter((d: any) => (parseFloat(d.entDia) || 0) + (parseFloat(d.entNoite) || 0) + (parseFloat(d.vlVariavel) || 0) > 0)
                          .map((d: any, idx: number) => (
                          <tr key={d.id || idx} style={{ backgroundColor: idx % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <td style={{ padding: '3px 6px', color: '#efebe9' }}>{d.data ? fmtDataBR(d.data) : '—'}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'center', color: '#ffcc80', fontWeight: 'bold' }}>{parseFloat(d.entDia) || '—'}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'center', color: '#ce93d8', fontWeight: 'bold' }}>{parseFloat(d.entNoite) || '—'}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'right', color: '#a5d6a7' }}>
                              {((parseFloat(d.caixinhaDia) || 0) + (parseFloat(d.caixinhaNoite) || 0)) > 0
                                ? fmtMoeda((parseFloat(d.caixinhaDia) || 0) + (parseFloat(d.caixinhaNoite) || 0)) : '—'}
                            </td>
                            <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 'bold', color: '#90caf9' }}>
                              {(parseFloat(d.vlVariavel) || 0) > 0 ? fmtMoeda(parseFloat(d.vlVariavel)) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: '#5d4037', color: '#fff', fontWeight: 'bold' }}>
                          <td style={{ padding: '4px 6px' }}>TOTAL</td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>{mbEntD.toFixed(0)}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>{mbEntN.toFixed(0)}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmtMoeda(totalCaixinhas)}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmtMoeda(mbVlVar)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ═══ BLOCO 3: DESCONTOS OPERACIONAIS ═══ */}
            {descontosSemCaixinha.length > 0 && (
              <div style={{ marginBottom: '14px', padding: '16px 18px', borderRadius: '12px', background: 'linear-gradient(135deg, #fbe9e7 0%, #ffccbc 100%)', border: '1px solid #ef9a9a' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#c62828', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                  📤 DESCONTOS — Abatidos da remuneração
                </div>

                {saidasDesconto.filter(sd => !sd.cat.toLowerCase().includes('caixinha')).map(({ cat, items: catItems, total }) => (
                  <div key={cat} style={{ marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', backgroundColor: 'rgba(198,40,40,0.06)', borderRadius: '6px', cursor: 'pointer' }}
                      onClick={() => toggleExpandido(`desc_${cat}`)}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#c62828' }}>
                        {expandidos.has(`desc_${cat}`) ? '▼' : '▶'} {cat} ({catItems.length}x)
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#c62828' }}>−{fmtMoeda(total)}</span>
                    </div>
                    {expandidos.has(`desc_${cat}`) && catItems.map(di => (
                      <div key={di.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px 4px 24px', borderBottom: '1px dashed #ffcdd2', fontSize: '11px' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ color: '#333' }}>{di.descricao || cat}</span>
                          <span style={{ color: '#999', marginLeft: '8px' }}>{di.dataPagamento ? fmtDataBR(di.dataPagamento) : '—'}</span>
                          {di.obs && di.obs !== di.descricao && <span style={{ color: '#bbb', marginLeft: '4px', fontStyle: 'italic' }}>({di.obs})</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 'bold', color: '#c62828' }}>−{fmtMoeda(R(di.valor))}</span>
                          <span style={{ padding: '1px 5px', borderRadius: '8px', fontSize: '9px', fontWeight: 'bold',
                            backgroundColor: di.pago ? '#e8f5e9' : '#fff9c4', color: di.pago ? '#2e7d32' : '#f57f17' }}>
                            {di.pago ? '✅' : '⏳'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', borderTop: '2px solid #ef9a9a', marginTop: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#c62828' }}>Total Descontos</span>
                  <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#c62828' }}>−{fmtMoeda(totalDescontosSemCaixinha)}</span>
                </div>
              </div>
            )}

            {/* ═══ BLOCO RESUMO DO MÊS ═══ */}
            <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)', color: '#fff', marginBottom: '14px' }}>
              {engineResult.conferido ? (
                /* Modo conferido: mostra vencimentos + variável - descontos reais */
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: temMotoboy ? '1fr 1fr 1fr' : '1fr 1fr', gap: '12px', textAlign: 'center', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: '#bbdefb', textTransform: 'uppercase' }}>Vencimentos Holerite</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{fmtMoeda(vencimentosHolerite)}</div>
                    </div>
                    {temMotoboy && (
                      <div>
                        <div style={{ fontSize: '10px', color: '#ffcc80', textTransform: 'uppercase' }}>Variável Motoboy</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ffcc80' }}>{fmtMoeda(mbVlVar)}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '10px', color: '#ef9a9a', textTransform: 'uppercase' }}>Descontos Reais</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef9a9a' }}>−{fmtMoeda(descontosFinais)}</div>
                      <div style={{ fontSize: '9px', color: '#bcaaa4' }}>
                        holerite {fmtMoeda(descontosHoleriteReais)} + op {fmtMoeda(totalDescontosSemCaixinha)}
                      </div>
                    </div>
                  </div>
                  <div style={{ borderTop: '2px solid rgba(255,255,255,0.3)', paddingTop: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#69f0ae', textTransform: 'uppercase', fontWeight: 'bold' }}>💵 Bruto do Mês</div>
                    <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#69f0ae' }}>{fmtMoeda(brutoRealMes)}</div>
                    <div style={{ fontSize: '10px', color: '#b2dfdb', marginTop: '2px' }}>
                      venc {fmtMoeda(vencimentosHolerite)}{temMotoboy ? ` + var ${fmtMoeda(mbVlVar)}` : ''}
                    </div>
                  </div>
                </>
              ) : (
                /* Modo não-conferido: mostra líquido holerite + variável - descontos */
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: temMotoboy ? '1fr 1fr 1fr' : '1fr 1fr', gap: '12px', textAlign: 'center', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: '#bbdefb', textTransform: 'uppercase' }}>Líquido Holerite</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{fmtMoeda(liquidoHolerite)}</div>
                    </div>
                    {temMotoboy && (
                      <div>
                        <div style={{ fontSize: '10px', color: '#ffcc80', textTransform: 'uppercase' }}>Variável Motoboy</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ffcc80' }}>{fmtMoeda(mbVlVar)}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '10px', color: '#ef9a9a', textTransform: 'uppercase' }}>Descontos</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef9a9a' }}>−{fmtMoeda(totalDescontos)}</div>
                    </div>
                  </div>
                  <div style={{ borderTop: '2px solid rgba(255,255,255,0.3)', paddingTop: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#69f0ae', textTransform: 'uppercase', fontWeight: 'bold' }}>💵 Líquido do Mês</div>
                    <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#69f0ae' }}>{fmtMoeda(liquidoMes)}</div>
                  </div>
                </>
              )}
            </div>

            {/* ═══ BLOCO 4: PAGAMENTOS REALIZADOS ═══ */}
            <div style={{ marginBottom: '14px', padding: '16px 18px', borderRadius: '12px', background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)', border: '1px solid #a5d6a7' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#2e7d32', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                📱 PAGAMENTOS REALIZADOS
              </div>

              {/* PIXs do logPagamentos com detalhamento do cálculo */}
              {logPgtos.length > 0 && (<>
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#1b5e20', marginBottom: '4px' }}>Depósitos (Folha):</div>
                {logPgtos.map((lp: any, idx: number) => {
                  const lpVal = parseFloat(lp.valor) || 0;
                  const isAdto = (lp.tipo || '').toLowerCase().includes('adiantamento');
                  const isLast = idx === logPgtos.length - 1 && logPgtos.length >= 2;
                  // Montar linhas de explicação do cálculo
                  const explicacaoLinhas: string[] = [];
                  if (isAdto) {
                    explicacaoLinhas.push('Adiantamento salarial + variável até dia 19');
                  } else if (isLast) {
                    // PIX dia 05 = Bruto - Descontos - Já pago (PIXs anteriores + transporte + caixinha)
                    const pixsAnteriores = logPgtos.slice(0, idx).reduce((s: number, l: any) => s + (parseFloat(l.valor) || 0), 0);
                    const base = engineResult.conferido ? brutoRealMes : liquidoMes;
                    const baseLabel = engineResult.conferido ? 'Bruto do mês' : 'Líquido do mês';
                    explicacaoLinhas.push(`${baseLabel}: ${fmtMoeda(base)}`);
                    if (descontosFinais > 0) explicacaoLinhas.push(`(-) Descontos: ${fmtMoeda(descontosFinais)}`);
                    explicacaoLinhas.push(`(-) Já recebido dia 20: ${fmtMoeda(pixsAnteriores)}`);
                    if (adtoTransporte > 0) explicacaoLinhas.push(`(-) Transporte recebido: ${fmtMoeda(adtoTransporte)}`);
                    if (caixinhaSaida > 0) explicacaoLinhas.push(`(-) Caixinha (dinheiro): ${fmtMoeda(caixinhaSaida)}`);
                    const calc = base - descontosFinais - pixsAnteriores - adtoTransporte - caixinhaSaida;
                    explicacaoLinhas.push(`(=) Esperado dia 05: ${fmtMoeda(calc)}`);
                    if (Math.abs(calc - lpVal) >= 0.01) {
                      explicacaoLinhas.push(`Pago: ${fmtMoeda(lpVal)} (dif: ${fmtMoeda(Math.abs(calc - lpVal))})`);
                    }
                  }
                  return (
                    <div key={lp.id || idx} style={{ padding: '8px 10px', fontSize: '12px', backgroundColor: 'rgba(46,125,50,0.06)', borderRadius: '8px', marginBottom: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#333', fontWeight: 600 }}>
                          {lp.data ? fmtDataBR(lp.data) : '—'} • {lp.forma || 'PIX'} • {lp.tipo || 'Pagamento'}
                        </span>
                        <span style={{ fontWeight: 'bold', color: '#2e7d32', fontSize: '14px' }}>{fmtMoeda(lpVal)}</span>
                      </div>
                      {lp.obs && <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic', marginTop: '2px' }}>{lp.obs}</div>}
                      {explicacaoLinhas.length > 0 && (
                        <div style={{ marginTop: '6px', padding: '6px 8px', backgroundColor: 'rgba(27,94,32,0.05)', borderRadius: '6px', borderLeft: '3px solid #4caf50' }}>
                          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#1b5e20', marginBottom: '3px' }}>📁 Como foi calculado:</div>
                          {explicacaoLinhas.map((ln, i) => (
                            <div key={i} style={{ fontSize: '11px', color: ln.startsWith('(=)') ? '#1b5e20' : '#555', fontWeight: ln.startsWith('(=)') ? 'bold' : 'normal', padding: '1px 0' }}>{ln}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>)}

              {/* Pagamentos via saídas (transporte, adiantamentos) */}
              {saidasPagamento.length > 0 && saidasPagamento.map(({ cat, items: catItems, total }) => (
                <div key={cat} style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', backgroundColor: 'rgba(46,125,50,0.06)', borderRadius: '6px', cursor: 'pointer' }}
                    onClick={() => toggleExpandido(`pgto_${cat}`)}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#2e7d32' }}>
                      {expandidos.has(`pgto_${cat}`) ? '▼' : '▶'} {cat} ({catItems.length}x)
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#2e7d32' }}>{fmtMoeda(total)}</span>
                  </div>
                  {expandidos.has(`pgto_${cat}`) && catItems.map(di => (
                    <div key={di.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px 4px 24px', borderBottom: '1px dashed #c8e6c9', fontSize: '11px' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ color: '#333' }}>{di.descricao || cat}</span>
                        <span style={{ color: '#999', marginLeft: '8px' }}>{di.dataPagamento ? fmtDataBR(di.dataPagamento) : '—'}</span>
                      </div>
                      <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>{fmtMoeda(R(di.valor))}</span>
                    </div>
                  ))}
                </div>
              ))}

              {/* Caixinha (dinheiro recebido em mãos) */}
              {caixinhaSaida > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', backgroundColor: 'rgba(46,125,50,0.06)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#2e7d32' }}>
                      💵 Caixinha (dinheiro)
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#2e7d32' }}>{fmtMoeda(caixinhaSaida)}</span>
                  </div>
                </div>
              )}

              {logPgtos.length === 0 && saidasPagamento.length === 0 && caixinhaSaida === 0 && (
                <div style={{ fontSize: '11px', color: '#888', padding: '6px 0' }}>Nenhum pagamento registrado neste mês.</div>
              )}

              {/* Total pago */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '2px solid #a5d6a7', marginTop: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1b5e20' }}>Total Pago</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#2e7d32' }}>{fmtMoeda(totalPagoGeral)}</span>
              </div>
            </div>

            {/* ═══ SALDO FINAL ═══ */}
            <div style={{ padding: '12px 16px', borderRadius: '10px', marginBottom: '14px',
              background: quitado ? '#e8f5e9' : saldo > 0 ? '#fff9c4' : '#ffebee',
              border: `2px solid ${quitado ? '#4caf50' : saldo > 0 ? '#f9a825' : '#ef5350'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#555', textTransform: 'uppercase' }}>⚖️ Saldo</div>
                  <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                    {engineResult.conferido ? 'Bruto' : 'Líquido'} {fmtMoeda(engineResult.conferido ? brutoRealMes : liquidoMes)} − Desc {fmtMoeda(descontosFinais)} − Pago {fmtMoeda(totalPagoGeral)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: quitado ? '#2e7d32' : saldo > 0 ? '#f57f17' : '#c62828' }}>
                    {quitado ? '✅ Quitado' : saldo > 0 ? `⏳ ${fmtMoeda(saldo)}` : fmtMoeda(saldo)}
                  </div>
                  {quitado && Math.abs(saldo) > 0 && (
                    <div style={{ fontSize: '10px', color: '#888' }}>diferença de {fmtMoeda(Math.abs(saldo))} (arredondamento)</div>
                  )}
                </div>
              </div>
            </div>

            {/* Glossário */}
            <div style={{ padding: '8px 10px', backgroundColor: '#f5f5f5', borderRadius: '6px', fontSize: '10px', color: '#555', lineHeight: '1.6', marginBottom: '10px' }}>
              <strong>📖 Como ler:</strong>{' '}
              <strong>Holerite</strong> = salário CLT (base + periculosidade + feriados − INSS − contribuições).{' '}
              {temMotoboy && <><strong>Variável Motoboy</strong> = comissão por entregas + caixinhas do mês. </>}
              <strong>Descontos</strong> = consumo interno, compras, etc — abatidos do valor a receber.{' '}
              <strong>Pagamentos</strong> = PIXs e adiantamentos efetivamente depositados.{' '}
              <strong>Saldo</strong> = diferença entre líquido e total pago.
            </div>

            <div style={{ textAlign: 'right' }}>
              <button onClick={onClose} style={s.btn('#9e9e9e')}>Fechar</button>
            </div>
          </div>
        </div>

      );
    }

    // ═══════════════════════════════════════════════════════
    // FREELANCER: Lógica original (inalterada)
    // ═══════════════════════════════════════════════════════

    // Conta SEMANA: folha (crédito) + créditos a receber − débitos da semana − adiantamentos já pagos
    const folhaTotal       = colabItems.filter(i => i.origem === 'folha').reduce((s, i) => s + i.valor, 0);
    const semanaItens      = colabItems.filter(i => contaDoItem(i) === 'semana');
    const transporteItens  = colabItems.filter(i => contaDoItem(i) === 'transporte');
    const especialItens    = colabItems.filter(i => contaDoItem(i) === 'especial');

    const creditosAReceber = semanaItens.filter(isCreditoAReceber).reduce((s, i) => s + i.valor, 0);
    const adiantamentosPagos = semanaItens.filter(isAdiantamentoPago).reduce((s, i) => s + i.valor, 0);
    const descontosSemana    = semanaItens.filter(i => i.origem === 'saida' && i.tipo === 'debito').reduce((s, i) => s + i.valor, 0);

    // Conta TRANSPORTE: adiantamentos transp. − descontos transp. (saldo separado)
    const transporteAdiantado  = transporteItens.filter(i => i.tipo === 'credito').reduce((s, i) => s + i.valor, 0);
    const transporteDescontado = transporteItens.filter(i => i.tipo === 'debito').reduce((s, i) => s + i.valor, 0);

    // Conta ESPECIAL: adiantamentos esp. − abatimentos (saldo separado)
    const especialAdiantado = especialItens.filter(i => i.tipo === 'credito').reduce((s, i) => s + i.valor, 0);
    const especialAbatido   = especialItens.filter(i => i.tipo === 'debito').reduce((s, i) => s + i.valor, 0);

    // Líquido a receber = Folha + Créditos a receber − Descontos da semana − Adiant. já pagos
    const liquidoAReceber = folhaTotal + creditosAReceber - descontosSemana - adiantamentosPagos;
    const pendentes       = colabItems.filter(i => !i.pago);

    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={onClose}>
        <div style={{ ...s.card, maxWidth: '780px', width: '97%', maxHeight: '93vh', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, color: '#1565c0' }}>📊 Analítico — {nome} ({mesAno})</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ marginBottom: '12px', padding: '14px 16px', borderRadius: '10px',
            background: liquidoAReceber >= 0 ? 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)' : 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)',
            borderLeft: `5px solid ${liquidoAReceber >= 0 ? '#1565c0' : '#c62828'}` }}>
            <div style={{ fontSize: '11px', color: liquidoAReceber >= 0 ? '#1565c0' : '#c62828', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {liquidoAReceber >= 0 ? '💰 Líquido a Receber (Conta da Semana)' : '⚠️ Saldo devedor (a abater)'}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: liquidoAReceber >= 0 ? '#0d47a1' : '#b71c1c', marginTop: '2px' }}>
              {liquidoAReceber < 0 ? '−' : ''}{fmtMoeda(Math.abs(liquidoAReceber))}
            </div>
            <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>
              = Folha {fmtMoeda(folhaTotal)} {creditosAReceber > 0 ? `+ Créd. a receber ${fmtMoeda(creditosAReceber)}` : ''} {descontosSemana > 0 ? `− Descontos ${fmtMoeda(descontosSemana)}` : ''} {adiantamentosPagos > 0 ? `− Adiant. já pagos ${fmtMoeda(adiantamentosPagos)}` : ''}
            </div>
          </div>

          {/* Summary chips: 3 contas separadas */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <div style={{ flex: 1, minWidth: '180px', padding: '10px 12px', backgroundColor: '#e3f2fd', borderRadius: '8px', borderLeft: '3px solid #1565c0' }}>
              <div style={{ fontSize: '10px', color: '#1565c0', fontWeight: 'bold' }}>💼 CONTA DA SEMANA</div>
              <div style={{ fontSize: '11px', color: '#333', lineHeight: '1.5', marginTop: '4px' }}>
                Folha: <strong>{fmtMoeda(folhaTotal)}</strong><br/>
                {creditosAReceber > 0 && <>Créd. a receber: <strong style={{color:'#2e7d32'}}>+{fmtMoeda(creditosAReceber)}</strong><br/></>}
                {descontosSemana > 0 && <>Descontos: <strong style={{color:'#c62828'}}>−{fmtMoeda(descontosSemana)}</strong><br/></>}
                {adiantamentosPagos > 0 && <>Adiant. já pagos: <strong style={{color:'#e65100'}}>−{fmtMoeda(adiantamentosPagos)}</strong><br/></>}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '180px', padding: '10px 12px', backgroundColor: '#e8f5e9', borderRadius: '8px', borderLeft: '3px solid #388e3c' }}>
              <div style={{ fontSize: '10px', color: '#388e3c', fontWeight: 'bold' }}>🚗 CONTA TRANSPORTE</div>
              <div style={{ fontSize: '11px', color: '#333', lineHeight: '1.5', marginTop: '4px' }}>
                Adiantado: <strong>{fmtMoeda(transporteAdiantado)}</strong><br/>
                Descontado: <strong>{fmtMoeda(transporteDescontado)}</strong><br/>
                <span style={{ color: '#666', fontStyle: 'italic', fontSize: '10px' }}>Saldo próprio — não entra na semana</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '180px', padding: '10px 12px', backgroundColor: '#f3e5f5', borderRadius: '8px', borderLeft: '3px solid #7b1fa2' }}>
              <div style={{ fontSize: '10px', color: '#7b1fa2', fontWeight: 'bold' }}>💰 ADTO. ESPECIAL</div>
              <div style={{ fontSize: '11px', color: '#333', lineHeight: '1.5', marginTop: '4px' }}>
                Adiantado: <strong>{fmtMoeda(especialAdiantado)}</strong><br/>
                Abatido: <strong>{fmtMoeda(especialAbatido)}</strong><br/>
                Saldo aberto: <strong style={{color:'#7b1fa2'}}>{fmtMoeda(Math.max(0, especialAdiantado - especialAbatido))}</strong>
              </div>
            </div>
            {pendentes.length > 0 && (
              <div style={{ flex: 1, minWidth: '160px', padding: '10px 12px', backgroundColor: '#fff9c4', borderRadius: '8px', borderLeft: '3px solid #f9a825' }}>
                <div style={{ fontSize: '10px', color: '#f57f17', fontWeight: 'bold' }}>⏳ PENDENTES ({pendentes.length})</div>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#f57f17', marginTop: '4px' }}>{fmtMoeda(pendentes.reduce((s,i)=>s+i.valor,0))}</div>
                <div style={{ fontSize: '10px', color: '#666', fontStyle: 'italic' }}>aguardando pagamento</div>
              </div>
            )}
          </div>

          {/* Pending alert */}
          {pendentes.length > 0 && (
            <div style={{ backgroundColor: '#fff9c4', borderRadius: '6px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', borderLeft: '4px solid #f9a825', color: '#5d4037' }}>
              <strong>⏳ {pendentes.length} lançamento(s) pendente(s)</strong> — serão descontados no próximo pagamento.
              Clique em ✏️ para editar ou marcar como pago.
            </div>
          )}

          {colabItems.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999' }}>Nenhum lançamento encontrado.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1565c0', color: 'white' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Origem</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Conta</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Data</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tipo / Descrição</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Valor</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {colabItems.flatMap((item, i) => {
                    const conta = contaDoItem(item);
                    const contaCfg = conta === 'transporte' ? { lbl: '🚗', tip: 'Transporte', bg: '#e8f5e9', fg: '#2e7d32' }
                                  : conta === 'especial'   ? { lbl: '💰', tip: 'Adto. Especial', bg: '#f3e5f5', fg: '#7b1fa2' }
                                  :                          { lbl: '💼', tip: 'Semana', bg: '#e3f2fd', fg: '#1565c0' };
                    const showObs = item.origem === 'saida' && item.obs && item.obs !== item.descricao;

                    // ── Folha granular freelancer: linha-mãe expansível + sub-linhas por turno ──
                    const raw = (item as any).raw;
                    const diasDobras: any[] = raw?.diasDobras || [];
                    const diasTransp: any[] = raw?.diasTransp || [];
                    const ehFolhaGranular = item.origem === 'folha' && item.semana && diasDobras.length > 0;
                    const expandido = expandidos.has(item.id);

                    if (ehFolhaGranular) {
                      const totalDobras = diasDobras.reduce((s: number, d: any) => s + R(d.valor), 0);
                      const totalTransp = diasTransp.reduce((s: number, d: any) => s + R(d.valor), 0);
                      const totalGrupo = totalDobras + totalTransp;
                      const bgMae = !item.pago ? '#fffde7' : '#f0fdf4';

                      // ── Auditoria: opção B (campo estruturado) ou A (parsear obs) ──
                      const audit = extrairAuditoria(raw, totalGrupo);

                      const rows: React.ReactElement[] = [];

                      // Linha-mãe (cabeçalho expansível)
                      rows.push(
                        <tr key={item.id} style={{ backgroundColor: bgMae, borderBottom: expandido ? 'none' : '1px solid #e0e0e0', borderLeft: '3px solid #43a047' }}>
                          <td style={{ padding: '6px 8px' }}>
                            <button onClick={() => toggleExpandido(item.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '0 4px', color: '#1b5e20', fontWeight: 'bold' }}
                              title={expandido ? 'Recolher turnos' : 'Ver turnos detalhados'}>
                              {expandido ? '▼' : '▶'}
                            </button>
                            <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#e8f5e9', color: '#2e7d32' }}>💰 Folha</span>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#e3f2fd', color: '#1565c0' }}>💼 Semana</span>
                          </td>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                            {item.dataPagamento ? fmtDataBR(item.dataPagamento) : (item.mes || '—')}
                            {item.semana && <div style={{ color: '#999', fontSize: '10px' }}>sem. {fmtDataBR(item.semana)}</div>}
                          </td>
                          <td style={{ padding: '6px 8px', maxWidth: '240px' }}>
                            <div style={{ fontSize: '11px', color: '#1b5e20', fontWeight: 'bold' }}>
                              {diasDobras.length} turno(s){diasTransp.length > 0 && ` + 🚗 Transp.`}
                            </div>
                            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                              {diasDobras.map((d: any) => `${d.data?.substring(8)}/${d.turno?.[0] || '?'}`).join(' · ')}
                            </div>
                            {item.formaPagamento && (
                              <div style={{ fontSize: '10px', color: '#1565c0', marginTop: '1px' }}>
                                {item.formaPagamento === 'PIX' ? '📱' : '💵'} {item.formaPagamento}
                                {!audit.temCampoEstruturado && audit.descSaidas === 0 && <span style={{ color: '#bbb', marginLeft: 4 }}>(obs s/ desc)</span>}
                              </div>
                            )}
                          </td>
                          {/* Valor: mostra PIX líquido com bruto em subscript */}
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <div style={{ fontWeight: 'bold', color: '#1b5e20', fontSize: '13px' }}>
                              📱 {fmtMoeda(audit.liquido)}
                            </div>
                            {(audit.descSaidas > 0 || audit.abatEsp > 0) && (
                              <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                                bruto {fmtMoeda(totalGrupo)}
                                {audit.descSaidas > 0 && <span style={{ color: '#c62828' }}> −{fmtMoeda(audit.descSaidas)}</span>}
                                {audit.abatEsp    > 0 && <span style={{ color: '#7b1fa2' }}> −{fmtMoeda(audit.abatEsp)}</span>}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                              backgroundColor: item.pago ? '#e8f5e9' : '#fff9c4',
                              color: item.pago ? '#2e7d32' : '#f57f17' }}>
                              {item.pago ? '✅ Pago' : '⏳ Pendente'}
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <button onClick={() => setDetalheItem(item)}
                              style={{ ...s.btn('#1976d2'), padding: '3px 7px', fontSize: '11px' }} title="Ver detalhes">📋</button>
                          </td>
                        </tr>
                      );

                      // Sub-linhas — visíveis quando expandido
                      if (expandido) {
                        // Créditos: 1 linha por turno
                        for (const d of diasDobras) {
                          const turnoLabel = d.turno === 'Dia' ? '☀️ Dia' : d.turno === 'Noite' ? '🌙 Noite' : d.turno || '?';
                          const isPagoTurno = d.pago === true;
                          rows.push(
                            <tr key={`${item.id}_turno_${d.id || d.data}_${d.turno}`}
                              style={{ backgroundColor: isPagoTurno ? '#f9fbe7' : '#fffde7', borderBottom: '1px dashed #e0e0e0', borderLeft: '6px solid #a5d6a7' }}>
                              <td style={{ padding: '4px 8px', paddingLeft: '28px' }}>
                                <span style={{ fontSize: '10px', color: '#888' }}>↳ turno</span>
                              </td>
                              <td style={{ padding: '4px 8px' }}>
                                <span style={{ padding: '1px 5px', borderRadius: '6px', fontSize: '10px', backgroundColor: '#e3f2fd', color: '#1565c0' }}>💼 Semana</span>
                              </td>
                              <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                                {d.data ? new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—'}
                              </td>
                              <td style={{ padding: '4px 8px', maxWidth: '240px', fontSize: '11px', color: '#333' }}>
                                <strong>{turnoLabel}</strong> — dobra individual
                              </td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 'bold', color: '#2e7d32', fontSize: '12px' }}>
                                +{fmtMoeda(R(d.valor))}
                              </td>
                              <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                                  backgroundColor: isPagoTurno ? '#e8f5e9' : '#fff9c4',
                                  color: isPagoTurno ? '#2e7d32' : '#f57f17' }}>
                                  {isPagoTurno ? '✅ Pago' : '⏳ Pend.'}
                                </span>
                              </td>
                              <td />
                            </tr>
                          );
                        }
                        // Créditos: transporte (com detalhamento do obs)
                        for (const d of diasTransp) {
                          const transpObs: string = d.obs || '';
                          const matchDias = transpObs.match(/(\d+)\s*dias?\s*-\s*R\$([\d.,]+)/i);
                          const nDias   = matchDias ? parseInt(matchDias[1]) : null;
                          const vDia    = (nDias && R(d.valor) > 0) ? R(d.valor) / nDias : null;
                          rows.push(
                            <tr key={`${item.id}_transp_${d.id || d.data}`}
                              style={{ backgroundColor: '#e8f5e9', borderBottom: '1px dashed #c8e6c9', borderLeft: '6px solid #81c784' }}>
                              <td style={{ padding: '4px 8px', paddingLeft: '28px' }}>
                                <span style={{ fontSize: '10px', color: '#888' }}>↳ transp.</span>
                              </td>
                              <td style={{ padding: '4px 8px' }}>
                                <span style={{ padding: '1px 5px', borderRadius: '6px', fontSize: '10px', backgroundColor: '#e8f5e9', color: '#2e7d32' }}>🚗 Transporte</span>
                              </td>
                              <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                                sem. {fmtDataBR(item.semana || '')}
                              </td>
                              <td style={{ padding: '4px 8px', maxWidth: '240px', fontSize: '11px', color: '#333' }}>
                                🚗 <strong>Transporte</strong> — {nDias ? `${nDias} dias × ${fmtMoeda(vDia!)}` : 'saldo semanal'}
                              </td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 'bold', color: '#2e7d32', fontSize: '12px' }}>
                                +{fmtMoeda(R(d.valor))}
                              </td>
                              <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                                  backgroundColor: d.pago ? '#e8f5e9' : '#fff9c4', color: d.pago ? '#2e7d32' : '#f57f17' }}>
                                  {d.pago ? '✅ Pago' : '⏳ Pend.'}
                                </span>
                              </td>
                              <td />
                            </tr>
                          );
                        }
                        // Linha de subtotal com PIX líquido destacado
                        rows.push(
                          <tr key={`${item.id}_subtotal`} style={{ backgroundColor: '#1b5e20', borderBottom: '2px solid #43a047', borderLeft: '6px solid #43a047' }}>
                            <td colSpan={3} style={{ padding: '6px 8px 6px 28px', fontSize: '11px', color: '#a5d6a7', fontWeight: 'bold' }}>
                              📊 Resumo do lote · {diasDobras.length} turno(s){diasTransp.length > 0 ? ` + 🚗 transp.` : ''}
                              {!audit.temCampoEstruturado && <span style={{ fontSize: '9px', color: '#81c784', marginLeft: 4 }}>(legado)</span>}
                            </td>
                            <td style={{ padding: '6px 8px', fontSize: '11px', color: '#e8f5e9' }}>
                              {audit.descSaidas > 0 && <span>−{fmtMoeda(audit.descSaidas)} descontos</span>}
                              {audit.abatEsp    > 0 && <span style={{ marginLeft: 6 }}>−{fmtMoeda(audit.abatEsp)} adto.esp.</span>}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#ffffff', fontSize: '14px' }}>
                              📱 {fmtMoeda(audit.liquido)}
                            </td>
                            <td colSpan={2} style={{ padding: '6px 8px', fontSize: '10px', color: '#a5d6a7', textAlign: 'center' }}>
                              {item.formaPagamento || 'PIX'}
                            </td>
                          </tr>
                        );
                      }

                      return rows;
                    }

                    // ── Linha normal (saída ou folha CLT) ──
                    return [
                    <tr key={item.id} style={{
                      backgroundColor: !item.pago ? '#fffde7' : i % 2 === 0 ? '#f9f9f9' : 'white',
                      borderBottom: '1px solid #eee',
                      borderLeft: !item.pago ? '3px solid #f9a825' : '3px solid transparent',
                    }}>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                          backgroundColor: item.origem === 'folha' ? '#e8f5e9' : '#fff3e0',
                          color: item.origem === 'folha' ? '#2e7d32' : '#e65100' }}>
                          {item.origem === 'folha' ? '💰 Folha' : '📤 Saída'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span title={contaCfg.tip} style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', backgroundColor: contaCfg.bg, color: contaCfg.fg }}>
                          {contaCfg.lbl} {contaCfg.tip}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                        {item.dataPagamento ? fmtDataBR(item.dataPagamento) : (item.mes || '—')}
                        {item.semana && <div style={{ color: '#999', fontSize: '10px' }}>sem. {fmtDataBR(item.semana)}</div>}
                      </td>
                      <td style={{ padding: '6px 8px', maxWidth: '240px' }}>
                        <div style={{ fontSize: '11px', color: '#333' }}>
                          {item.tipoSaida && <span style={{ padding: '1px 5px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold',
                            backgroundColor: TIPOS_DEBITO.includes(item.tipoSaida) ? '#fce4ec' : '#fff3e0',
                            color: TIPOS_DEBITO.includes(item.tipoSaida) ? '#c62828' : '#e65100',
                            marginRight: '4px' }}>{item.tipoSaida}</span>}
                          {item.descricao}
                        </div>
                        {showObs && <div style={{ color: '#888', fontSize: '10px', fontStyle: 'italic' }}>📝 {item.obs}</div>}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold',
                        color: item.tipo === 'credito' ? '#2e7d32' : '#c62828', fontSize: '13px' }}>
                        {item.tipo === 'debito' ? '−' : '+'}{fmtMoeda(item.valor)}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                          backgroundColor: item.pago ? '#e8f5e9' : '#fff9c4',
                          color: item.pago ? '#2e7d32' : '#f57f17' }}>
                          {item.pago ? '✅ Pago' : '⏳ Pendente'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button onClick={() => setDetalheItem(item)}
                            style={{ ...s.btn('#1976d2'), padding: '3px 7px', fontSize: '11px' }} title="Ver detalhes">📋</button>
                          {item.origem === 'saida' && (
                            <>
                              <button onClick={() => { onClose(); abrirEdicao(item); }}
                                style={{ ...s.btn('#f57c00'), padding: '3px 7px', fontSize: '11px' }} title="Editar lançamento">✏️</button>
                              <button onClick={() => excluirSaida(item)}
                                style={{ ...s.btn('#c62828'), padding: '3px 7px', fontSize: '11px' }} title="Excluir lançamento">🗑️</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    ];
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                    <td colSpan={4} style={{ padding: '8px' }}>LÍQUIDO A RECEBER (Conta da Semana)</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: liquidoAReceber >= 0 ? '#a5d6a7' : '#ffcdd2', fontSize: '13px' }}>
                      {liquidoAReceber < 0 ? '−' : ''}{fmtMoeda(Math.abs(liquidoAReceber))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
              <div style={{ marginTop: '8px', padding: '8px 10px', backgroundColor: '#f5f5f5', borderRadius: '6px', fontSize: '10px', color: '#555', lineHeight: '1.6' }}>
                <strong>📖 Glossário:</strong> {' '}
                <strong>Folha</strong> = pagamento das dobras semanais. {' '}
                <strong>Saída</strong> = lançamento avulso (consumo, adiantamento, etc.). {' '}
                <strong>💼 Conta da Semana</strong> = compensa direto na liquidação semanal. {' '}
                <strong>🚗 Transporte</strong> e <strong>💰 Adto. Especial</strong> = saldos próprios, não impactam a semana. {' '}
                <strong>+</strong> = a casa deve ao colaborador / <strong>−</strong> = colaborador deve à casa.
              </div>
            </div>
          )}
          <div style={{ marginTop: '14px', textAlign: 'right' }}>
            <button onClick={onClose} style={s.btn('#9e9e9e')}>Fechar</button>
          </div>
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      <Header title="📋 Extrato de Pagamentos" showBack={true} />

      {/* Modals */}
      {detalheItem && <ModalDetalhe item={detalheItem} onClose={() => setDetalheItem(null)} />}
      {editItem     && <ModalEdicaoSaida />}
      {modalAjuste  && <ModalAjusteManual />}
      {modalExcluir && <ModalExcluir />}
      {colaboradorSelecionado && (
        <ModalColaborador colabId={colaboradorSelecionado} onClose={() => setColaboradorSelecionado(null)} />
      )}

      <div style={{ flex: 1, padding: '20px', maxWidth: '1500px', margin: '0 auto', width: '100%' }}>

        {/* Pendentes alert */}
        {totals.pendentesAntigos > 0 && (
          <div style={{ backgroundColor: '#fff9c4', borderRadius: '6px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', borderLeft: '4px solid #f9a825', color: '#5d4037' }}>
            ⏳ <strong>{totals.pendentesAntigos} saída(s) de meses anteriores ainda pendente(s)</strong> sendo exibidas neste extrato.
            Edite-as e marque como <strong>Pago</strong> quando forem descontadas.
          </div>
        )}

        {/* Info banner */}
        <div style={{ backgroundColor: '#e3f2fd', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#1565c0', borderLeft: '4px solid #1976d2' }}>
          <strong>ℹ️ Extrato Analítico:</strong> Consolida <strong>Folha de Pagamento</strong> e <strong>Saídas</strong>.
          Saídas pendentes de meses anteriores aparecem automaticamente.
          Clique em <strong>✏️</strong> para editar qualquer saída — altere valor, status, data ou observação.
          Marque como <strong>⏳ Pendente</strong> para cobrar no próximo pagamento.
        </div>

        {/* Filtros */}
        <div style={{ ...s.card, marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={s.label}>Mês / Ano</label>
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...s.input, width: '150px' }} />
          </div>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={s.label}>Colaborador</label>
            <input type="text" placeholder="Buscar por nome..." value={filtroColaborador}
              onChange={e => setFiltroColaborador(e.target.value)} style={s.input} />
          </div>
          <div>
            <label style={s.label}>Origem</label>
            <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value as any)} style={{ ...s.select, width: '130px' }}>
              <option value="todos">Todos</option>
              <option value="folha">💰 Folha</option>
              <option value="saida">📤 Saídas</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Tipo</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as any)} style={{ ...s.select, width: '120px' }}>
              <option value="todos">Todos</option>
              <option value="credito">Crédito</option>
              <option value="debito">Débito</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Contrato</label>
            <select value={filtroContrato} onChange={e => setFiltroContrato(e.target.value as any)} style={{ ...s.select, width: '120px' }}>
              <option value="todos">Todos</option>
              <option value="CLT">CLT</option>
              <option value="Freelancer">Freelancer</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Status</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} style={{ ...s.select, width: '120px' }}>
              <option value="todos">Todos</option>
              <option value="pago">✅ Pagos</option>
              <option value="pendente">⏳ Pendentes</option>
            </select>
          </div>
          <button onClick={carregarDados} style={s.btn('#1976d2')}>🔄 Atualizar</button>
          <button onClick={exportarXLSX} disabled={filteredItems.length === 0} style={s.btn('#7b1fa2')}>📥 XLSX</button>
          <button onClick={() => navigate('/modulos/folha-pagamento')} style={s.btn('#00838f')}>💳 Folha</button>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          {[
            { label: 'Total Folha',          val: fmtMoeda(totals.totalFolha),    cor: '#2e7d32' },
            { label: 'Adiantamentos',         val: fmtMoeda(totals.totalSaidas),   cor: '#e65100' },
            { label: 'Descontos',             val: fmtMoeda(totals.totalDescontos),cor: '#c62828' },
            { label: '✅ Total Pago',          val: fmtMoeda(totals.totalPago),     cor: '#1565c0' },
            { label: '⏳ Pendente',            val: fmtMoeda(totals.totalPendente), cor: '#f57f17' },
            { label: 'Lançamentos',           val: `${filteredItems.length}`,       cor: '#6a1b9a' },
            { label: 'Colaboradores',         val: `${summaryByColab.length}`,      cor: '#00838f' },
          ].map(c => (
            <div key={c.label} style={{ ...s.card, borderLeft: `4px solid ${c.cor}` }}>
              <div style={{ fontSize: '11px', color: '#666' }}>{c.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: c.cor, marginTop: '2px' }}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '0', borderBottom: '2px solid #1976d2' }}>
          {([
            { key: 'resumo',    label: '📊 Resumo por Colaborador' },
            { key: 'detalhado', label: '📄 Lançamentos Detalhados' },
            { key: 'excluidos', label: `🗑️ Excluídos${itemsExcluidos.length > 0 ? ` (${itemsExcluidos.length})` : ''}` },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setViewMode(t.key as any)} style={s.tab(viewMode === (t.key as any))}>{t.label}</button>
          ))}
        </div>

        {/* ── Resumo por colaborador ───────────────────────────────────────── */}
        {viewMode === 'resumo' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', overflowX: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
            ) : summaryByColab.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
                <p>Nenhum lançamento encontrado para o período.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={s.th}>Colaborador</th>
                    <th style={s.thC}>Contrato</th>
                    <th style={s.thR}>💰 Folha</th>
                    <th style={s.thR}>📤 Adiant.</th>
                    <th style={s.thR}>🔴 Desconto</th>
                    <th style={s.thR}>Saldo</th>
                    <th style={s.thR}>✅ Pago</th>
                    <th style={s.thR}>⏳ Pendente</th>
                    <th style={s.thC}>Lançs.</th>
                    <th style={s.thC}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryByColab.map((row, i) => {
                    const adiantamentos = row.saidaItems.filter(x => x.tipo === 'credito').reduce((s, x) => s + x.valor, 0);
                    const descontos     = row.saidaItems.filter(x => x.tipo === 'debito').reduce((s, x) => s + x.valor, 0);
                    const folhaVal      = row.folhaItems.reduce((s, x) => s + x.valor, 0);
                    const temPendente   = row.saidaItems.some(x => !x.pago);
                    return (
                      <tr key={row.id} style={{ backgroundColor: temPendente ? '#fffde7' : i % 2 === 0 ? '#fafafa' : 'white' }}>
                        <td style={{ ...s.td, fontWeight: 'bold' }}>
                          {row.nome}
                          {temPendente && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#f57f17' }}>⏳</span>}
                        </td>
                        <td style={s.tdC}>
                          <span style={row.tipoContrato === 'CLT' ? s.badge('#e8f5e9','#2e7d32') : s.badge('#fff3e0','#e65100')}>
                            {row.tipoContrato}
                          </span>
                        </td>
                        <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{folhaVal > 0 ? fmtMoeda(folhaVal) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#e65100' }}>{adiantamentos > 0 ? fmtMoeda(adiantamentos) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#c62828' }}>{descontos > 0 ? fmtMoeda(descontos) : '—'}</td>
                        <td style={{ ...s.tdR, fontWeight: 'bold', color: row.saldo >= 0 ? '#1565c0' : '#c62828' }}>{fmtMoeda(row.saldo)}</td>
                        <td style={{ ...s.tdR, color: '#1565c0' }}>{row.pago > 0 ? fmtMoeda(row.pago) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#f57f17' }}>{row.pendente > 0 ? fmtMoeda(row.pendente) : '—'}</td>
                        <td style={{ ...s.tdC, color: '#666' }}>{row.count}</td>
                        <td style={s.tdC}>
                          <button onClick={() => setColaboradorSelecionado(row.id)}
                            style={{ ...s.btn('#6a1b9a'), padding: '3px 8px', fontSize: '11px' }}>
                            📊 Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold' }}>
                    <td style={{ padding: '8px 10px' }} colSpan={2}>TOTAIS ({summaryByColab.length} colaboradores)</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#a5d6a7' }}>{fmtMoeda(totals.totalFolha)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ffcc80' }}>{fmtMoeda(totals.totalSaidas)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ef9a9a' }}>{fmtMoeda(totals.totalDescontos)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#90caf9' }}>{fmtMoeda(totals.totalCreditos - totals.totalDebitos)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#a5d6a7' }}>{fmtMoeda(totals.totalPago)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ffcc80' }}>{fmtMoeda(totals.totalPendente)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{filteredItems.length}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* ── Lançamentos detalhados ──────────────────────────────────────── */}
        {viewMode === 'detalhado' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', overflowX: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
            ) : filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📄</div>
                <p>Nenhum lançamento encontrado.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={s.th}>Colaborador</th>
                    <th style={s.thC}>Contrato</th>
                    <th style={s.thC}>Origem</th>
                    <th style={s.thC}>Data Pgto</th>
                    <th style={s.thC}>Semana</th>
                    <th style={s.th}>Descrição / Tipo</th>
                    <th style={s.thC}>Forma</th>
                    <th style={s.thR}>Bruto</th>
                    <th style={s.thR}>Transp.</th>
                    <th style={s.thR}>Valor</th>
                    <th style={s.thC}>Status</th>
                    <th style={s.thC}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.flatMap((item, i) => {
                    // ── Detecção de folha granular (freelancer com turnos individuais) ──
                    const raw = (item as any).raw;
                    const diasDobras: any[] = raw?.diasDobras || [];
                    const diasTransp: any[]  = raw?.diasTransp  || [];
                    const ehFolhaGranular = item.origem === 'folha' && item.semana && diasDobras.length > 0;
                    const expandido = expandidosDetalhado.has(item.id);

                    if (ehFolhaGranular) {
                      const totalDobras = diasDobras.reduce((acc: number, d: any) => acc + R(d.valor), 0);
                      const totalTransp = diasTransp.reduce((acc: number, d: any) => acc + R(d.valor), 0);
                      const totalGrupo  = totalDobras + totalTransp;
                      const bgMae = !item.pago ? '#fffde7' : i % 2 === 0 ? '#f0fdf4' : '#f9fbe7';

                      // ── Auditoria: opção B (campo estruturado) ou A (parsear obs legado) ──
                      const audit = extrairAuditoria(raw, totalGrupo);

                      // ── Intervalo exato da semana ──────────────────────────────────
                      const semanaFim  = item.semana || '';
                      const semanaIniD = semanaFim ? new Date(semanaFim + 'T00:00:00') : null;
                      if (semanaIniD) semanaIniD.setDate(semanaIniD.getDate() - 7);
                      const semanaIni  = semanaIniD ? semanaIniD.toISOString().split('T')[0] : '';
                      const pgtoId     = item.pagamentoId || '';

                      // ── Saídas de CONSUMO do período (descontos do PIX) ─────────────
                      // EXCLUI: 'Desconto Transporte' (conta separada, não desconta o PIX)
                      // EXCLUI: 'Desconto Adiantamento Especial' (tratado separadamente em abatPeriodo)
                      // PRIORIDADE: filtra por pagamentoIdLigado quando disponível (mais preciso)
                      //             fallback: intervalo de datas da semana
                      const EXCLUIR_DO_PIX = new Set(['Desconto Transporte', 'Desconto Adiantamento Especial']);
                      const saidasPeriodo = items.filter(s => {
                        if (s.origem !== 'saida' || s.tipo !== 'debito') return false;
                        if (s.colaboradorId !== item.colaboradorId) return false;
                        if (EXCLUIR_DO_PIX.has(s.tipoSaida || '')) return false;
                        // Filtro por pagamentoIdLigado (preciso) ou por datas (fallback)
                        if (pgtoId && s.pagamentoIdLigado) {
                          return s.pagamentoIdLigado === pgtoId;
                        }
                        return (s.dataPagamento ?? '') >= semanaIni &&
                               (s.dataPagamento ?? '') <= semanaFim;
                      });
                      const totalSaidasPeriodo = saidasPeriodo.reduce((acc, s) => acc + R(s.valor), 0);

                      // ── Abatimento adiantamento especial do período ─────────────────
                      const abatPeriodo = items.filter(s => {
                        if (s.origem !== 'saida' || s.tipo !== 'debito') return false;
                        if (s.colaboradorId !== item.colaboradorId) return false;
                        if (s.tipoSaida !== 'Desconto Adiantamento Especial') return false;
                        if (pgtoId && s.pagamentoIdLigado) {
                          return s.pagamentoIdLigado === pgtoId;
                        }
                        return (s.dataPagamento ?? '') >= semanaIni &&
                               (s.dataPagamento ?? '') <= semanaFim;
                      });
                      const totalAbatPeriodo = abatPeriodo.reduce((acc, s) => acc + R(s.valor), 0);

                      // ── Valores definitivos ─────────────────────────────────────────
                      // 1. Liquidez: usa dado estruturado (audit.liquido) se confiável
                      // 2. Senão: reconstrói bruto − consumo − abat
                      const abatEfetivo = audit.abatEsp > 0 ? audit.abatEsp : totalAbatPeriodo;
                      const descEfetiva = totalSaidasPeriodo > 0 ? totalSaidasPeriodo
                        : (audit.descSaidas > 0 ? audit.descSaidas : 0);
                      // Se temos dado estruturado confiável (gravado no POST), usa direto
                      const liquidoEfetivo = audit.temCampoEstruturado && audit.liquido > 0
                        ? audit.liquido
                        : (descEfetiva > 0 || abatEfetivo > 0
                          ? Math.max(0, totalGrupo - descEfetiva - abatEfetivo)
                          : totalGrupo);

                      const rows: React.ReactElement[] = [];

                      // ═══════════════════════════════════════════════════════════════════
                      // LINHA-MÃE — cabeçalho do lote, sempre visível
                      // Mostra: nome · tipo · origem · data pag. · semana · descrição resumida
                      //         forma · bruto dobras · bruto transp. · LÍQUIDO (destaque)
                      // ═══════════════════════════════════════════════════════════════════
                      rows.push(
                        <tr key={item.id}
                          style={{ backgroundColor: bgMae, borderLeft: '3px solid #43a047', borderBottom: expandido ? 'none' : '1px solid #c8e6c9' }}>
                          <td style={{ ...s.td, fontWeight: 'bold' }}>
                            <button
                              onClick={() => setExpandidosDetalhado(prev => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                return next;
                              })}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', marginRight: '4px', color: '#1b5e20', fontWeight: 'bold', padding: '0 2px' }}
                              title={expandido ? 'Recolher detalhes' : 'Ver linha a linha: turnos + descontos'}>
                              {expandido ? '▼' : '▶'}
                            </button>
                            {item.nomeColaborador}
                          </td>
                          <td style={s.tdC}>
                            <span style={item.tipoContrato === 'CLT' ? s.badge('#e8f5e9','#2e7d32') : s.badge('#fff3e0','#e65100')}>
                              {item.tipoContrato || '—'}
                            </span>
                          </td>
                          <td style={s.tdC}>
                            <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', backgroundColor: '#e8f5e9', color: '#2e7d32' }}>
                              💰 Folha
                            </span>
                          </td>
                          <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px' }}>
                            {item.dataPagamento ? fmtDataBR(item.dataPagamento) : (item.mes || '—')}
                          </td>
                          <td style={{ ...s.tdC, fontSize: '11px', color: '#666' }}>
                            {item.semana ? fmtDataBR(item.semana) : '—'}
                          </td>
                          <td style={{ ...s.td, maxWidth: '200px', fontSize: '11px' }}>
                            <div style={{ color: '#1b5e20', fontWeight: 'bold' }}>
                              {diasDobras.length} turno(s){diasTransp.length > 0 ? ' + 🚗 Transp.' : ''}
                              {saidasPeriodo.length > 0 && (
                                <span style={{ color: '#c62828', marginLeft: 4 }}>+ {saidasPeriodo.length} desc.</span>
                              )}
                              {abatPeriodo.length > 0 && (
                                <span style={{ color: '#7b1fa2', marginLeft: 4 }}>⏩ adto.esp.</span>
                              )}
                              <span style={{ marginLeft: '6px', fontWeight: 'normal', color: '#888', fontSize: '10px' }}>
                                {expandido ? '▼ recolher' : '▶ ver linha a linha'}
                              </span>
                            </div>
                            <div style={{ color: '#555', fontSize: '10px', marginTop: '2px' }}>
                              {/* Dias únicos trabalhados — sem duplicar DiaNoite */}
                              {Array.from(new Set(diasDobras.map((d: any) => d.data).filter(Boolean))).sort().map((dt: any) => `${dt.substring(8)}/${dt.substring(5,7)}`).join(' · ')}
                              {diasTransp.length > 0 && ` · 🚗 ${fmtMoeda(totalTransp)}`}
                            </div>
                          </td>
                          <td style={s.tdC}>
                            {item.formaPagamento ? (
                              <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                                backgroundColor: item.formaPagamento === 'PIX' ? '#e3f2fd' : item.formaPagamento === 'Dinheiro' ? '#e8f5e9' : '#fff3e0',
                                color: item.formaPagamento === 'PIX' ? '#1565c0' : item.formaPagamento === 'Dinheiro' ? '#2e7d32' : '#e65100' }}>
                                {item.formaPagamento === 'PIX' ? '📱 PIX' : item.formaPagamento === 'Dinheiro' ? '💵 $' : '🔄 Misto'}
                              </span>
                            ) : <span style={{ color: '#ccc', fontSize: '10px' }}>—</span>}
                          </td>
                          <td style={{ ...s.tdR, color: '#1976d2', fontSize: '11px' }}>{totalDobras > 0 ? fmtMoeda(totalDobras) : '—'}</td>
                          <td style={{ ...s.tdR, color: '#1565c0', fontSize: '11px' }}>{totalTransp > 0 ? fmtMoeda(totalTransp) : '—'}</td>
                          {/* Coluna Valor: líquido real em destaque + equação resumida */}
                          <td style={{ ...s.tdR, fontWeight: 'bold', fontSize: '13px' }}>
                            <div style={{ color: item.formaPagamento === 'PIX' ? '#1565c0' : '#2e7d32', fontSize: '14px' }}>
                              {item.formaPagamento === 'PIX' ? '📱 ' : ''}{fmtMoeda(liquidoEfetivo)}
                            </div>
                            {(descEfetiva > 0 || abatEfetivo > 0) && (
                              <div style={{ fontSize: '9px', color: '#888', fontWeight: 'normal', lineHeight: '1.5', marginTop: '2px' }}>
                                bruto {fmtMoeda(totalGrupo)}
                                {descEfetiva > 0 && <span style={{ color: '#c62828' }}> −{fmtMoeda(descEfetiva)}</span>}
                                {abatEfetivo > 0 && <span style={{ color: '#7b1fa2' }}> −{fmtMoeda(abatEfetivo)} adto.</span>}
                                {' = '}<span style={{ color: '#1b5e20', fontWeight: 'bold' }}>{fmtMoeda(liquidoEfetivo)}</span>
                              </div>
                            )}
                          </td>
                          <td style={s.tdC}>
                            <span style={item.pago ? s.badge('#e8f5e9','#2e7d32') : s.badge('#fff9c4','#f57f17')}>
                              {item.pago ? '✅ Pago' : '⏳ Pend.'}
                            </span>
                          </td>
                          <td style={s.tdC}>
                            <button onClick={() => setDetalheItem(item)}
                              style={{ ...s.btn('#1976d2'), padding: '3px 7px', fontSize: '11px' }} title="Ver detalhes">📋</button>
                          </td>
                        </tr>
                      );

                      // ═══════════════════════════════════════════════════════════════════
                      // SUB-LINHAS — visíveis apenas quando expandido
                      // Ordem: CRÉDITOS primeiro (turnos + transporte), depois DÉBITOS (descontos)
                      // ═══════════════════════════════════════════════════════════════════
                      if (expandido) {
                        // ── [1] Turnos (dobras) — créditos ──────────────────────────────
                        diasDobras.forEach((d: any) => {
                          const turnoLabel = d.turno === 'Dia' ? '☀️ Dia' : d.turno === 'Noite' ? '🌙 Noite' : (d.turno || '?');
                          const isPagoTurno = d.pago === true;
                          const dataFormatada = d.data
                            ? new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                            : '—';
                          rows.push(
                            <tr key={`${item.id}_turno_${d.id || d.data}_${d.turno}`}
                              style={{ backgroundColor: '#f1f8e9', borderBottom: '1px dashed #c5e1a5', borderLeft: '6px solid #a5d6a7' }}>
                              <td style={{ ...s.td, paddingLeft: '28px', fontSize: '11px' }} colSpan={2}>
                                ↳ {item.nomeColaborador}
                              </td>
                              <td style={s.tdC}>
                                <span style={{ padding: '1px 5px', borderRadius: '6px', fontSize: '10px', backgroundColor: '#dcedc8', color: '#33691e' }}>☀️ turno</span>
                              </td>
                              <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                                {dataFormatada}
                              </td>
                              <td style={{ ...s.tdC, fontSize: '11px', color: '#666' }}>
                                {item.semana ? fmtDataBR(item.semana) : '—'}
                              </td>
                              <td style={{ ...s.td, fontSize: '11px', color: '#33691e' }}>
                                <strong>{turnoLabel}</strong> — dobra individual
                              </td>
                              <td style={s.tdC}>
                                <span style={{ padding: '2px 5px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', backgroundColor: '#e3f2fd', color: '#1565c0' }}>
                                  {item.formaPagamento === 'PIX' ? '📱 PIX' : item.formaPagamento || '—'}
                                </span>
                              </td>
                              <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{fmtMoeda(R(d.valor))}</td>
                              <td style={s.tdR}>—</td>
                              <td style={{ ...s.tdR, fontWeight: 'bold', color: '#2e7d32' }}>+{fmtMoeda(R(d.valor))}</td>
                              <td style={s.tdC}>
                                <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                                  backgroundColor: isPagoTurno ? '#e8f5e9' : '#fff9c4', color: isPagoTurno ? '#2e7d32' : '#f57f17' }}>
                                  {isPagoTurno ? '✅ Pago' : '⏳ Pend.'}
                                </span>
                              </td>
                              <td />
                            </tr>
                          );
                        });

                        // ── [2] Transporte — dia a dia (ou crédito semanal se não granular) ─
                        // Se diasTransp tem 1 item consolidado e diasDobras tem dias individuais,
                        // desdobrar o transporte por dia único trabalhado para rastrear qual dia
                        // o colaborador compareceu e recebeu transporte.
                        {
                          // Dias únicos trabalhados (sem duplicar DiaNoite do mesmo dia)
                          const diasUnicos: string[] = Array.from(
                            new Set(diasDobras.map((d: any) => d.data).filter(Boolean))
                          ).sort() as string[];
                          // Valor unitário: do registro transporte se existir, senão divide total
                          const vtUnit = diasTransp.length === 1 && diasUnicos.length > 0
                            ? R(diasTransp[0].valor) / diasUnicos.length  // proporcional
                            : (diasTransp.length > 0 ? R(diasTransp[0].valor) : 0);
                          // Se temos dias únicos E um registro consolidado de transporte → expandir dia a dia
                          const usarDiaADia = diasUnicos.length > 0 && diasTransp.length === 1;

                          if (usarDiaADia) {
                            diasUnicos.forEach((data: string) => {
                              const dataFormatada = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
                              rows.push(
                                <tr key={`${item.id}_transp_dia_${data}`}
                                  style={{ backgroundColor: '#e8f5e9', borderBottom: '1px dashed #a5d6a7', borderLeft: '6px solid #66bb6a' }}>
                                  <td style={{ ...s.td, paddingLeft: '28px', fontSize: '11px' }} colSpan={2}>
                                    ↳ {item.nomeColaborador}
                                  </td>
                                  <td style={s.tdC}>
                                    <span style={{ padding: '1px 5px', borderRadius: '6px', fontSize: '10px', backgroundColor: '#c8e6c9', color: '#1b5e20' }}>🚗 transp.</span>
                                  </td>
                                  <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                                    {dataFormatada}
                                  </td>
                                  <td style={{ ...s.tdC, fontSize: '11px', color: '#666' }}>
                                    {item.semana ? fmtDataBR(item.semana) : '—'}
                                  </td>
                                  <td style={{ ...s.td, fontSize: '11px', color: '#1b5e20' }}>
                                    🚗 <strong>Transporte</strong> — {dataFormatada}
                                  </td>
                                  <td style={s.tdC}>
                                    <span style={{ padding: '2px 5px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', backgroundColor: '#e3f2fd', color: '#1565c0' }}>
                                      {item.formaPagamento === 'PIX' ? '📱 PIX' : item.formaPagamento || '—'}
                                    </span>
                                  </td>
                                  <td style={s.tdR}>—</td>
                                  <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{fmtMoeda(vtUnit)}</td>
                                  <td style={{ ...s.tdR, fontWeight: 'bold', color: '#2e7d32' }}>+{fmtMoeda(vtUnit)}</td>
                                  <td style={s.tdC}>
                                    <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                                      backgroundColor: diasTransp[0].pago ? '#e8f5e9' : '#fff9c4', color: diasTransp[0].pago ? '#2e7d32' : '#f57f17' }}>
                                      {diasTransp[0].pago ? '✅ Pago' : '⏳ Pend.'}
                                    </span>
                                  </td>
                                  <td />
                                </tr>
                              );
                            });
                          } else {
                            // Fallback: exibir como crédito semanal consolidado (comportamento anterior)
                            diasTransp.forEach((d: any) => {
                              const dataFormatada = d.dataPagamento ? fmtDataBR(d.dataPagamento)
                                : (d.data ? new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—');
                              rows.push(
                                <tr key={`${item.id}_transp_${d.id || d.data}`}
                                  style={{ backgroundColor: '#e8f5e9', borderBottom: '1px dashed #a5d6a7', borderLeft: '6px solid #66bb6a' }}>
                                  <td style={{ ...s.td, paddingLeft: '28px', fontSize: '11px' }} colSpan={2}>
                                    ↳ {item.nomeColaborador}
                                  </td>
                                  <td style={s.tdC}>
                                    <span style={{ padding: '1px 5px', borderRadius: '6px', fontSize: '10px', backgroundColor: '#c8e6c9', color: '#1b5e20' }}>🚗 transp.</span>
                                  </td>
                                  <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                                    {dataFormatada}
                                  </td>
                                  <td style={{ ...s.tdC, fontSize: '11px', color: '#666' }}>
                                    {item.semana ? fmtDataBR(item.semana) : '—'}
                                  </td>
                                  <td style={{ ...s.td, fontSize: '11px', color: '#1b5e20' }}>
                                    🚗 <strong>Transporte</strong> — crédito semanal
                                  </td>
                                  <td style={s.tdC}>
                                    <span style={{ padding: '2px 5px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', backgroundColor: '#e3f2fd', color: '#1565c0' }}>
                                      {item.formaPagamento === 'PIX' ? '📱 PIX' : item.formaPagamento || '—'}
                                    </span>
                                  </td>
                                  <td style={s.tdR}>—</td>
                                  <td style={{ ...s.tdR, color: '#2e7d32', fontWeight: 'bold' }}>{fmtMoeda(R(d.valor))}</td>
                                  <td style={{ ...s.tdR, fontWeight: 'bold', color: '#2e7d32' }}>+{fmtMoeda(R(d.valor))}</td>
                                  <td style={s.tdC}>
                                    <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                                      backgroundColor: d.pago ? '#e8f5e9' : '#fff9c4', color: d.pago ? '#2e7d32' : '#f57f17' }}>
                                      {d.pago ? '✅ Pago' : '⏳ Pend.'}
                                    </span>
                                  </td>
                                  <td />
                                </tr>
                              );
                            });
                          } // fim else fallback
                        } // fim bloco [2] Transporte

                        // ── [3] Descontos (saídas débito do período) — integrados ao grupo ──
                        // Cada desconto aparece como sub-linha vermelha dentro do grupo expandido
                        saidasPeriodo.forEach((saida) => {
                          const dataFormatada = saida.dataPagamento
                            ? fmtDataBR(saida.dataPagamento)
                            : '—';
                          const isAdtEsp = saida.tipoSaida === 'Desconto Adiantamento Especial'
                            || saida.tipoSaida === 'Adiantamento Especial';
                          rows.push(
                            <tr key={`${item.id}_desc_${saida.id}`}
                              style={{ backgroundColor: isAdtEsp ? '#fce4ec' : '#fff8f8', borderBottom: '1px dashed #ffcdd2', borderLeft: `6px solid ${isAdtEsp ? '#e91e63' : '#ef9a9a'}` }}>
                              <td style={{ ...s.td, paddingLeft: '28px', fontSize: '11px' }} colSpan={2}>
                                ↳ {item.nomeColaborador}
                              </td>
                              <td style={s.tdC}>
                                <span style={{ padding: '1px 5px', borderRadius: '6px', fontSize: '10px',
                                  backgroundColor: isAdtEsp ? '#fce4ec' : '#ffebee',
                                  color: isAdtEsp ? '#880e4f' : '#c62828' }}>
                                  {isAdtEsp ? '⏩ adto.esp.' : '📉 desc.'}
                                </span>
                              </td>
                              <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                                {dataFormatada}
                              </td>
                              <td style={{ ...s.tdC, fontSize: '11px', color: '#666' }}>
                                {item.semana ? fmtDataBR(item.semana) : '—'}
                              </td>
                              <td style={{ ...s.td, fontSize: '11px' }}>
                                <div style={{ color: isAdtEsp ? '#880e4f' : '#c62828', fontWeight: 'bold' }}>
                                  {saida.descricao || saida.tipoSaida || 'Desconto'}
                                </div>
                                {saida.obs && (
                                  <div style={{ color: '#999', fontSize: '10px', fontStyle: 'italic' }}>📝 {saida.obs}</div>
                                )}
                              </td>
                              <td style={s.tdC}>
                                <span style={{ padding: '2px 5px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', backgroundColor: '#e3f2fd', color: '#1565c0' }}>
                                  {saida.formaPagamento === 'PIX' ? '📱 PIX' : saida.formaPagamento || '—'}
                                </span>
                              </td>
                              <td style={s.tdR}>—</td>
                              <td style={s.tdR}>—</td>
                              <td style={{ ...s.tdR, fontWeight: 'bold', color: isAdtEsp ? '#880e4f' : '#c62828' }}>
                                −{fmtMoeda(R(saida.valor))}
                              </td>
                              <td style={s.tdC}>
                                <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                                  backgroundColor: saida.pago ? '#e8f5e9' : '#fff9c4', color: saida.pago ? '#2e7d32' : '#f57f17' }}>
                                  {saida.pago ? '✅ Pago' : '⏳ Pend.'}
                                </span>
                              </td>
                              <td />
                            </tr>
                          );
                        });

                        // ── [3b] Desconto Adiantamento Especial — sub-linha roxa integrada ──
                        // abatPeriodo: saídas tipo 'Desconto Adiantamento Especial' vinculadas ao lote
                        // Aparecem separadas de saidasPeriodo (consumo), com cor roxa distinta
                        abatPeriodo.forEach((saida) => {
                          const dataFormatada = saida.dataPagamento ? fmtDataBR(saida.dataPagamento) : '—';
                          rows.push(
                            <tr key={`${item.id}_abat_${saida.id}`}
                              style={{ backgroundColor: '#f3e5f5', borderBottom: '1px dashed #ce93d8', borderLeft: '6px solid #9c27b0' }}>
                              <td style={{ ...s.td, paddingLeft: '28px', fontSize: '11px' }} colSpan={2}>
                                ↳ {item.nomeColaborador}
                              </td>
                              <td style={s.tdC}>
                                <span style={{ padding: '1px 5px', borderRadius: '6px', fontSize: '10px', backgroundColor: '#9c27b0', color: 'white', fontWeight: 'bold' }}>
                                  ⏩ adto.esp.
                                </span>
                              </td>
                              <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                                {dataFormatada}
                              </td>
                              <td style={{ ...s.tdC, fontSize: '11px', color: '#666' }}>
                                {item.semana ? fmtDataBR(item.semana) : '—'}
                              </td>
                              <td style={{ ...s.td, fontSize: '11px' }}>
                                <div style={{ color: '#6a1b9a', fontWeight: 'bold' }}>
                                  {saida.descricao || 'Abatimento Adiantamento Especial'}
                                </div>
                                {saida.obs && (
                                  <div style={{ color: '#ab47bc', fontSize: '10px', fontStyle: 'italic' }}>📝 {saida.obs}</div>
                                )}
                              </td>
                              <td style={s.tdC}>
                                <span style={{ padding: '2px 5px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', backgroundColor: '#e3f2fd', color: '#1565c0' }}>
                                  {saida.formaPagamento === 'PIX' ? '📱 PIX' : saida.formaPagamento || '—'}
                                </span>
                              </td>
                              <td style={s.tdR}>—</td>
                              <td style={s.tdR}>—</td>
                              <td style={{ ...s.tdR, fontWeight: 'bold', color: '#6a1b9a' }}>
                                −{fmtMoeda(R(saida.valor))}
                              </td>
                              <td style={s.tdC}>
                                <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
                                  backgroundColor: saida.pago ? '#e8f5e9' : '#fff9c4', color: saida.pago ? '#2e7d32' : '#f57f17' }}>
                                  {saida.pago ? '✅ Pago' : '⏳ Pend.'}
                                </span>
                              </td>
                              <td />
                            </tr>
                          );
                        });

                        // ── [3c] Log de Pagamento PIX — registro real do que foi pago ───
                        // Mostra cada entrada do logPagamentos: data · valor · forma
                        // Responde: "cadê o histórico do PIX de R$619?"
                        {
                          const logs: PagamentoLog[] = Array.isArray(item.logPagamentos) ? item.logPagamentos : [];
                          if (logs.length > 0) {
                            logs.forEach((log, idx) => {
                              const dataLog = log.data
                                ? new Date(log.data + (log.data.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                : '—';
                              const formaLog = log.forma || (log as any).tipo || 'PIX';
                              const valorLog = log.valor ?? (log as any).value ?? 0;
                              const valorPix = log.valorPix ?? (formaLog === 'PIX' ? valorLog : 0);
                              const valorDin = log.valorDinheiro ?? (formaLog === 'Dinheiro' ? valorLog : 0);
                              const isMisto = formaLog === 'Misto' || (valorPix > 0 && valorDin > 0);
                              rows.push(
                                <tr key={`${item.id}_logpix_${idx}`}
                                  style={{ backgroundColor: '#e3f2fd', borderBottom: '1px dashed #90caf9', borderLeft: '6px solid #1565c0' }}>
                                  <td style={{ ...s.td, paddingLeft: '28px', fontSize: '11px' }} colSpan={2}>
                                    ↳ {item.nomeColaborador}
                                  </td>
                                  <td style={s.tdC}>
                                    <span style={{ padding: '1px 5px', borderRadius: '6px', fontSize: '10px', backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                                      📱 pgto.
                                    </span>
                                  </td>
                                  <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                                    {dataLog}
                                  </td>
                                  <td style={{ ...s.tdC, fontSize: '11px', color: '#666' }}>
                                    {item.semana ? fmtDataBR(item.semana) : '—'}
                                  </td>
                                  <td style={{ ...s.td, fontSize: '11px', color: '#0d47a1' }}>
                                    <strong>
                                      {formaLog === 'PIX' ? '📱 PIX' : formaLog === 'Dinheiro' ? '💵 Dinheiro' : '🔄 Misto'} — registro de pagamento
                                    </strong>
                                    {isMisto && (valorPix > 0 || valorDin > 0) && (
                                      <div style={{ fontSize: '10px', color: '#1565c0', marginTop: '2px' }}>
                                        {valorPix > 0 && <span>📱 PIX {fmtMoeda(valorPix)}</span>}
                                        {valorPix > 0 && valorDin > 0 && <span style={{ margin: '0 4px', color: '#90caf9' }}>·</span>}
                                        {valorDin > 0 && <span>💵 Din. {fmtMoeda(valorDin)}</span>}
                                      </div>
                                    )}
                                    {log.obs && (
                                      <div style={{ color: '#90caf9', fontSize: '10px', fontStyle: 'italic', marginTop: '2px' }}>📝 {log.obs}</div>
                                    )}
                                  </td>
                                  <td style={s.tdC}>
                                    <span style={{ padding: '2px 5px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', backgroundColor: '#1565c0', color: 'white' }}>
                                      {formaLog === 'PIX' ? '📱 PIX' : formaLog === 'Dinheiro' ? '💵 $' : '🔄 Misto'}
                                    </span>
                                  </td>
                                  <td style={s.tdR}>—</td>
                                  <td style={s.tdR}>—</td>
                                  <td style={{ ...s.tdR, fontWeight: 'bold', color: '#1565c0', fontSize: '12px' }}>
                                    📱 {fmtMoeda(valorLog)}
                                  </td>
                                  <td style={s.tdC}>
                                    <span style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', backgroundColor: '#1565c0', color: 'white' }}>
                                      ✅ Pago
                                    </span>
                                  </td>
                                  <td />
                                </tr>
                              );
                            });
                          }
                        }

                        // ── [4] Subtotal do lote (fundo verde escuro) ───────────────────
                        // Equação completa: bruto + transp. − descontos − abat. = LÍQUIDO
                        rows.push(
                          <tr key={`${item.id}_subtotal`}
                            style={{ backgroundColor: '#1b5e20', borderBottom: '2px solid #43a047', borderLeft: '6px solid #43a047' }}>
                            <td colSpan={6} style={{ padding: '8px 8px 8px 28px', fontSize: '11px', color: '#a5d6a7', fontWeight: 'bold' }}>
                              📊 Lote · sem. {item.semana ? fmtDataBR(item.semana) : '—'}
                              {/* Equação completa linha a linha */}
                              <table style={{ marginTop: '6px', borderCollapse: 'collapse', width: '100%' }}>
                                <tbody>
                                  {diasDobras.map((d: any, idx: number) => (
                                    <tr key={idx}>
                                      <td style={{ color: '#c8e6c9', fontSize: '10px', paddingRight: '8px' }}>
                                        ☀️ {d.turno || '?'} {d.data ? d.data.substring(8) + '/' + d.data.substring(5,7) : ''}
                                      </td>
                                      <td style={{ color: '#a5d6a7', fontSize: '10px', textAlign: 'right' }}>+{fmtMoeda(R(d.valor))}</td>
                                    </tr>
                                  ))}
                                  {diasTransp.length === 1 && diasDobras.length > 0
                                    ? (() => {
                                        // Transporte dia a dia no subtotal
                                        const duSub: string[] = Array.from(new Set(diasDobras.map((d: any) => d.data).filter(Boolean))).sort() as string[];
                                        const vtS = duSub.length > 0 ? R(diasTransp[0].valor) / duSub.length : 0;
                                        return duSub.map((data: string) => (
                                          <tr key={`ts_${data}`}>
                                            <td style={{ color: '#c8e6c9', fontSize: '10px', paddingRight: '8px' }}>
                                              🚗 Transp. {new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                            </td>
                                            <td style={{ color: '#a5d6a7', fontSize: '10px', textAlign: 'right' }}>+{fmtMoeda(vtS)}</td>
                                          </tr>
                                        ));
                                      })()
                                    : diasTransp.map((d: any, idx: number) => (
                                        <tr key={`t${idx}`}>
                                          <td style={{ color: '#c8e6c9', fontSize: '10px', paddingRight: '8px' }}>🚗 Transporte</td>
                                          <td style={{ color: '#a5d6a7', fontSize: '10px', textAlign: 'right' }}>+{fmtMoeda(R(d.valor))}</td>
                                        </tr>
                                      ))
                                  }
                                  <tr>
                                    <td colSpan={2} style={{ borderTop: '1px solid #388e3c', paddingTop: '3px' }} />
                                  </tr>
                                  <tr>
                                    <td style={{ color: '#ffcdd2', fontSize: '10px', fontWeight: 'bold' }}>= Bruto</td>
                                    <td style={{ color: '#ffcdd2', fontSize: '10px', textAlign: 'right', fontWeight: 'bold' }}>{fmtMoeda(totalGrupo)}</td>
                                  </tr>
                                  {saidasPeriodo.map((saida) => (
                                    <tr key={saida.id}>
                                      <td style={{ color: '#ef9a9a', fontSize: '10px', paddingRight: '8px' }}>
                                        📉 {saida.descricao || saida.tipoSaida}
                                      </td>
                                      <td style={{ color: '#ef9a9a', fontSize: '10px', textAlign: 'right' }}>−{fmtMoeda(R(saida.valor))}</td>
                                    </tr>
                                  ))}
                                  {descEfetiva === 0 && audit.descSaidas > 0 && (
                                    <tr>
                                      <td style={{ color: '#ef9a9a', fontSize: '10px' }}>📉 Desc. saídas (obs)</td>
                                      <td style={{ color: '#ef9a9a', fontSize: '10px', textAlign: 'right' }}>−{fmtMoeda(audit.descSaidas)}</td>
                                    </tr>
                                  )}
                                  {abatEfetivo > 0 && (
                                    <tr>
                                      <td style={{ color: '#ce93d8', fontSize: '10px' }}>⏩ Abat. adto.esp.</td>
                                      <td style={{ color: '#ce93d8', fontSize: '10px', textAlign: 'right' }}>−{fmtMoeda(abatEfetivo)}</td>
                                    </tr>
                                  )}
                                  <tr>
                                    <td colSpan={2} style={{ borderTop: '1px solid #388e3c', paddingTop: '3px' }} />
                                  </tr>
                                  <tr>
                                    <td style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>
                                      {item.formaPagamento === 'PIX' ? '📱 PIX' : item.formaPagamento === 'Dinheiro' ? '💵 Dinheiro' : '💳'} Líquido
                                    </td>
                                    <td style={{ color: '#69f0ae', fontSize: '13px', textAlign: 'right', fontWeight: 'bold' }}>
                                      {fmtMoeda(liquidoEfetivo)}
                                    </td>
                                  </tr>
                                  {/* Log real de pagamento — confirma o valor PIX registrado */}
                                  {Array.isArray(item.logPagamentos) && item.logPagamentos.length > 0 && (() => {
                                    const logs = item.logPagamentos!;
                                    const totalPago = logs.reduce((acc, l) => acc + (l.valor ?? (l as any).value ?? 0), 0);
                                    const diff = Math.abs(totalPago - liquidoEfetivo);
                                    const temDivergencia = diff > 0.01;
                                    return (
                                      <>
                                        <tr>
                                          <td colSpan={2} style={{ borderTop: '1px dashed #1565c0', paddingTop: '4px', paddingBottom: '2px' }} />
                                        </tr>
                                        {logs.map((log, idx) => {
                                          const dataLog = log.data
                                            ? new Date(log.data + (log.data.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                            : '—';
                                          const formaLog = log.forma || (log as any).tipo || 'PIX';
                                          const valorLog = log.valor ?? (log as any).value ?? 0;
                                          return (
                                            <tr key={`sl_${idx}`}>
                                              <td style={{ color: '#90caf9', fontSize: '10px', paddingRight: '8px' }}>
                                                {formaLog === 'PIX' ? '📱' : formaLog === 'Dinheiro' ? '💵' : '🔄'} Pago em {dataLog}
                                              </td>
                                              <td style={{ color: '#90caf9', fontSize: '10px', textAlign: 'right', fontWeight: 'bold' }}>
                                                {fmtMoeda(valorLog)}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                        {logs.length > 1 && (
                                          <tr>
                                            <td style={{ color: '#64b5f6', fontSize: '10px', fontWeight: 'bold' }}>= Total pago</td>
                                            <td style={{ color: '#64b5f6', fontSize: '10px', textAlign: 'right', fontWeight: 'bold' }}>{fmtMoeda(totalPago)}</td>
                                          </tr>
                                        )}
                                        {temDivergencia && (
                                          <tr>
                                            <td style={{ color: '#ffcc02', fontSize: '10px', fontWeight: 'bold' }}>⚠️ Divergência</td>
                                            <td style={{ color: '#ffcc02', fontSize: '10px', textAlign: 'right', fontWeight: 'bold' }}>{fmtMoeda(diff)}</td>
                                          </tr>
                                        )}
                                      </>
                                    );
                                  })()}
                                </tbody>
                              </table>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center', verticalAlign: 'top' }}>
                              {item.formaPagamento ? (
                                <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                                  backgroundColor: item.formaPagamento === 'PIX' ? '#1565c0' : '#2e7d32', color: 'white' }}>
                                  {item.formaPagamento === 'PIX' ? '📱 PIX' : item.formaPagamento === 'Dinheiro' ? '💵 $' : '🔄 Misto'}
                                </span>
                              ) : null}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c8e6c9', fontSize: '11px', verticalAlign: 'top' }}>
                              {fmtMoeda(totalDobras)}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c8e6c9', fontSize: '11px', verticalAlign: 'top' }}>
                              {totalTransp > 0 ? fmtMoeda(totalTransp) : '—'}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#69f0ae', fontSize: '16px', verticalAlign: 'top' }}>
                              {item.formaPagamento === 'PIX' ? '📱 ' : ''}{fmtMoeda(liquidoEfetivo)}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        );
                      }

                      return rows;
                    }

                    // ── Linha normal (saída ou folha CLT sem turnos granulares) ──────────
                    return [(
                      <tr key={item.id}
                        style={{ backgroundColor: !item.pago ? '#fffde7' : i % 2 === 0 ? '#fafafa' : 'white', borderLeft: !item.pago ? '3px solid #f9a825' : '3px solid transparent', borderBottom: '1px solid #eee' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e8f0fe')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = !item.pago ? '#fffde7' : i % 2 === 0 ? '#fafafa' : 'white')}>
                        <td style={{ ...s.td, fontWeight: 'bold' }}>{item.nomeColaborador}</td>
                        <td style={s.tdC}>
                          <span style={item.tipoContrato === 'CLT' ? s.badge('#e8f5e9','#2e7d32') : s.badge('#fff3e0','#e65100')}>
                            {item.tipoContrato || '—'}
                          </span>
                        </td>
                        <td style={s.tdC}>
                          <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold',
                            backgroundColor: item.origem === 'folha' ? '#e8f5e9' : '#fff3e0',
                            color: item.origem === 'folha' ? '#2e7d32' : '#e65100' }}>
                            {item.origem === 'folha' ? '💰 Folha' : '📤 Saída'}
                          </span>
                        </td>
                        <td style={{ ...s.tdC, fontFamily: 'monospace', fontSize: '11px' }}>
                          {item.dataPagamento ? fmtDataBR(item.dataPagamento) : (item.mes || '—')}
                        </td>
                        <td style={{ ...s.tdC, fontSize: '11px', color: '#666' }}>
                          {item.semana ? fmtDataBR(item.semana) : '—'}
                        </td>
                        <td style={{ ...s.td, maxWidth: '200px', fontSize: '11px' }}>
                          <div style={{ color: '#333' }}>{item.descricao}</div>
                          {item.tipoSaida && <div style={{ color: '#888', fontSize: '10px' }}>{item.tipoSaida}</div>}
                          {item.obs && <div style={{ color: '#aaa', fontSize: '10px', fontStyle: 'italic' }}>📝 {item.obs}</div>}
                        </td>
                        {/* Forma de Pagamento */}
                        <td style={s.tdC}>
                          {item.formaPagamento ? (
                            <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                              backgroundColor: item.formaPagamento === 'PIX' ? '#e3f2fd' : item.formaPagamento === 'Dinheiro' ? '#e8f5e9' : '#fff3e0',
                              color: item.formaPagamento === 'PIX' ? '#1565c0' : item.formaPagamento === 'Dinheiro' ? '#2e7d32' : '#e65100' }}>
                              {item.formaPagamento === 'PIX' ? '📱 PIX' : item.formaPagamento === 'Dinheiro' ? '💵 $' : '🔄 Misto'}
                            </span>
                          ) : <span style={{ color: '#ccc', fontSize: '10px' }}>—</span>}
                          {(item.logPagamentos || []).length > 1 && (
                            <div style={{ fontSize: '9px', color: '#9e9e9e', marginTop: '2px' }}>{item.logPagamentos!.length} pgtos</div>
                          )}
                        </td>
                        <td style={{ ...s.tdR, color: '#1976d2', fontSize: '11px' }}>{item.valorBruto ? fmtMoeda(item.valorBruto) : '—'}</td>
                        <td style={{ ...s.tdR, color: '#1565c0', fontSize: '11px' }}>{item.valorTransporte ? fmtMoeda(item.valorTransporte) : '—'}</td>
                        <td style={{ ...s.tdR, fontWeight: 'bold', color: item.tipo === 'credito' ? '#2e7d32' : '#c62828', fontSize: '13px' }}>
                          {item.tipo === 'debito' ? '−' : '+'}{fmtMoeda(item.valor)}
                        </td>
                        <td style={s.tdC}>
                          <span style={item.pago ? s.badge('#e8f5e9','#2e7d32') : s.badge('#fff9c4','#f57f17')}>
                            {item.pago ? '✅ Pago' : '⏳ Pend.'}
                          </span>
                        </td>
                        <td style={s.tdC}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={() => setDetalheItem(item)}
                              style={{ ...s.btn('#1976d2'), padding: '3px 7px', fontSize: '11px' }} title="Ver detalhes">📋</button>
                            {item.origem === 'saida' && (
                              <button onClick={() => abrirEdicao(item)}
                                style={{ ...s.btn('#f57c00'), padding: '3px 7px', fontSize: '11px' }} title="Editar lançamento">✏️</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )];
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#0d47a1', color: 'white', fontWeight: 'bold' }}>
                    <td colSpan={9} style={{ padding: '8px 10px', fontSize: '12px' }}>
                      TOTAIS ({filteredItems.length} lançamentos)
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '13px', color: '#a5d6a7' }}>
                      {fmtMoeda(filteredItems.filter(i => i.tipo === 'credito').reduce((s, i) => s + i.valor, 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* ── Aba: Excluídos ──────────────────────────────────── */}
        {viewMode === 'excluidos' && (
          <div style={{ ...s.card, borderRadius: '0 8px 8px 8px', overflowX: 'auto' }}>
            {itemsExcluidos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🗑️</div>
                <p>Nenhum lançamento excluído neste mês.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#b71c1c', color: 'white' }}>
                    <th style={s.th}>Colaborador</th>
                    <th style={s.th}>Data</th>
                    <th style={s.th}>Tipo / Descrição</th>
                    <th style={s.thR}>Valor</th>
                    <th style={s.th}>Excluído por</th>
                    <th style={s.th}>Excluído em</th>
                    <th style={s.th}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsExcluidos.map((s2: any) => (
                    <tr key={s2.id} style={{ backgroundColor: '#fce4ec', opacity: 0.8 }}>
                      <td style={s.td}>{s2.colaborador || s2.favorecido || s2.colaboradorId}</td>
                      <td style={s.tdC}>{(s2.dataPagamento || s2.data || '').substring(0, 10)}</td>
                      <td style={s.td}><span style={{ color: '#b71c1c' }}>{s2.tipo || s2.origem || '?'}</span><br/><span style={{ fontSize: '11px', color: '#666' }}>{s2.descricao || ''}</span></td>
                      <td style={{ ...s.tdR, color: '#b71c1c', fontWeight: 'bold' }}>R$ {parseFloat(s2.valor||'0').toFixed(2)}</td>
                      <td style={s.tdC}>{s2.excluidoPor || '—'}</td>
                      <td style={s.tdC}>{s2.excluidoEm ? s2.excluidoEm.substring(0, 16).replace('T',' ') : '—'}</td>
                      <td style={s.td}><span style={{ fontSize: '11px', color: '#555' }}>{s2.motivoExclusao || '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div style={{ marginTop: '12px', fontSize: '11px', color: '#888', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
          ℹ️ <strong>Como usar:</strong> Clique em <strong>✏️</strong> em qualquer saída para editar valor, categoria, data ou status.
          Para cobrar no próximo pagamento, marque como <strong>⏳ Pendente</strong> — o lançamento aparecerá automaticamente no mês atual.
          Clique em <strong>📊 Ver</strong> no resumo para ver o analítico completo do colaborador.
        </div>
      </div>

      <Footer showLinks={true} />
    </div>
  );
};

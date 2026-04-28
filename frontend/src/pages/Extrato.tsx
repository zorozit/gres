import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';

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
const TIPOS_DEBITO = ['A receber', 'Consumo Interno', 'Desconto', 'Desconto Transporte', 'Desconto Adiantamento Especial', 'Sangria'];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const R = (v: any) => parseFloat(v) || 0;
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoeda = (v: number) => 'R$ ' + fmt(v);
const fmtDataBR = (iso: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const hoje = () => new Date().toISOString().split('T')[0];

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

      const [rF, rC, rS, rSPend] = await Promise.all([
        fetch(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mesAno}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
        fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
        // Current month saidas
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${dataIni}&dataFim=${dataFim}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
        // Older pending saidas (last 3 months)
        fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${prevIni}&dataFim=${dataIni}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
      ]);

      let colabs: any[] = [];
      if (rC?.ok) { const d = await rC.json(); colabs = Array.isArray(d) ? d : []; }

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
        const legadoFolha = rawFolha.filter((i: any) => i.tipo !== 'freelancer-dia' && !isMigrado(i) && !isEstornado(i));

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
          return {
            id: `grp__${ref.colaboradorId}__${ref.semana}__${ref.pagamentoId || 'legado'}`,
            colaboradorId: ref.colaboradorId,
            mes: ref.mes,
            semana: ref.semana,
            pagamentoId: ref.pagamentoId || null,
            pago: todosPagos && algumPago,
            pagoParcial: algumPago && !todosPagos,
            valorBruto: totalPago + totalPend,
            totalFinal: totalPago,
            totalPendente: totalPend,
            dataPagamento: pagos[0]?.dataPagamento || null,
            formaPagamento: ref.formaPagamento || 'PIX',
            unitId: ref.unitId,
            confiabilidade,
            obs: diasDobras.map((d: any) => `${d.data?.substring(8)}/${d.turno?.[0] || '?'}`).join(' · ')
              + (diasTransp.length > 0 ? ` + Transp. R$${diasTransp.reduce((s: number,d: any)=>s+R(d.valor),0).toFixed(2)}` : ''),
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
          const val = isGranular
            ? R(item.totalFinal)   // só o que foi efetivamente pago
            : (!isCLT && R(item.valorBruto) > 0
                ? R(item.valorBruto)
                : R(item.totalFinal) || R(item.saldoFinal) || 0);

          // Para CLT: gerar linha de Adiantamento (dia 20) separada quando pagoAdiantamento=true
          if (isCLT && item.pagoAdiantamento === true) {
            // Valor: adtoLiquido (calculado pelo frontend) ou soma dos logPagamentos tipo Adiantamento
            const logsAdto = (item.logPagamentos || []).filter((l: any) => l.tipo === 'Adiantamento');
            const adtoVal = R(item.adtoLiquido) || R(item.adtoContabil)
              || logsAdto.reduce((s: number, l: any) => s + R(l.valor), 0)
              || 0;
            allItems.push({
              id: `${item.id}_adto`,
              colaboradorId: item.colaboradorId,
              nomeColaborador: nome, tipoContrato: tc,
              origem: 'folha', mes: item.mes, semana: undefined,
              tipo: 'credito',
              descricao: `Adiantamento CLT (dia 20) – ${item.mes}`,
              valor: adtoVal,
              pago: true,
              dataPagamento: item.dataPgtoAdiantamento || undefined,
              obs: item.obs || '', updatedAt: item.updatedAt, unitId: item.unitId,
              formaPagamento: item.formaPagamento || undefined,
              logPagamentos: [],
              raw: item,
            });
          }

          // Para CLT: gerar linha de Variável (dobras/motoboy) separada quando pagoVariavel=true
          if (isCLT && item.pagoVariavel === true) {
            const varVal = R(item.totalFinal) || 0;
            allItems.push({
              id: `${item.id}_var`,
              colaboradorId: item.colaboradorId,
              nomeColaborador: nome, tipoContrato: tc,
              origem: 'folha', mes: item.mes, semana: undefined,
              tipo: 'credito',
              descricao: `Variável CLT (dobras/motoboy) – ${item.mes}`,
              valor: varVal,
              pago: true,
              dataPagamento: item.dataPgtoVariavel || undefined,
              obs: item.obs || '', updatedAt: item.updatedAt, unitId: item.unitId,
              formaPagamento: item.formaPagamento || undefined,
              logPagamentos: [],
              raw: item,
            });
          }

          // Linha principal: salário mensal CLT ou dobras freelancer
          const confBadge = isGranular
            ? (item.confiabilidade === 'recalculado' ? ' ⚠️' : item.confiabilidade === 'real' ? '' : '')
            : '';
          const descricaoPrincipal = isGranular
            ? `Dobras semanais ${fmtDataBR(item.semana)} – ${item.obs}${confBadge}${item.pagoParcial ? ` — +R$${R(item.totalPendente).toFixed(2)} pend.` : ''}`
            : (item.semana && item.semana !== true
                ? `Dobras semanais ${fmtDataBR(item.semana)} (${tc})`
                : `Pagamento mensal CLT – ${item.mes}`);

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
            raw: saida,
          });
        }
      };

      if (rS?.ok)     { const d = await rS.json();     processarSaidas(Array.isArray(d) ? d : [], false); }
      if (rSPend?.ok) { const d = await rSPend.json(); processarSaidas(Array.isArray(d) ? d : [], true);  }

      allItems.sort((a, b) => {
        const nc = (a.nomeColaborador || '').localeCompare(b.nomeColaborador || '');
        if (nc !== 0) return nc;
        const dA = a.dataPagamento || a.semana || a.mes || '';
        const dB = b.dataPagamento || b.semana || b.mes || '';
        return dB.localeCompare(dA);
      });

      setItems(allItems);
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

      const res = await fetch(`${apiUrl}/saidas/${editItem.id}`, {
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
      if (item.pago) map[id].pago += v; else map[id].pendente += v;
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
              ...(item.valorBruto    ? [{ label: 'Bruto (dobras)',   value: fmtMoeda(item.valorBruto) }]    : []),
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
      const res = await fetch(`${apiUrl}/saidas/${modalExcluir.id}`, {
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
      const res = await fetch(`${apiUrl}/saidas`, {
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
    const colabItems = items.filter(i => i.colaboradorId === colabId).sort((a, b) => {
      const dA = a.dataPagamento || a.semana || a.mes || '';
      const dB = b.dataPagamento || b.semana || b.mes || '';
      return dB.localeCompare(dA);
    });
    const nome        = colabItems[0]?.nomeColaborador || colabId;
    const folhaTotal  = colabItems.filter(i => i.origem === 'folha').reduce((s, i) => s + i.valor, 0);
    const saidaCred   = colabItems.filter(i => i.origem === 'saida' && i.tipo === 'credito').reduce((s, i) => s + i.valor, 0);
    const saidaDeb    = colabItems.filter(i => i.origem === 'saida' && i.tipo === 'debito').reduce((s, i) => s + i.valor, 0);
    const pendentes   = colabItems.filter(i => !i.pago);

    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={onClose}>
        <div style={{ ...s.card, maxWidth: '780px', width: '97%', maxHeight: '93vh', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, color: '#1565c0' }}>📊 Analítico — {nome} ({mesAno})</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Summary chips */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {[
              { label: 'Folha / Dobras',       val: fmtMoeda(folhaTotal),                          bg: '#e8f5e9', color: '#2e7d32' },
              { label: 'Adiantamentos',         val: fmtMoeda(saidaCred),                           bg: '#fff3e0', color: '#e65100' },
              { label: 'Descontos / A receber', val: fmtMoeda(saidaDeb),                            bg: '#fce4ec', color: '#c62828' },
              // Líquido = Folha bruta - Descontos - Adiantamentos já pagos
              { label: 'Líquido estimado',      val: fmtMoeda(folhaTotal - saidaDeb - saidaCred),   bg: '#e3f2fd', color: '#1565c0' },
              ...(pendentes.length > 0 ? [{ label: `⏳ Pendentes (${pendentes.length})`, val: fmtMoeda(pendentes.reduce((s,i)=>s+i.valor,0)), bg: '#fff9c4', color: '#f57f17' }] : []),
            ].map(c => (
              <div key={c.label} style={{ padding: '8px 12px', backgroundColor: c.bg, borderRadius: '8px', minWidth: '120px' }}>
                <div style={{ fontSize: '10px', color: c.color, fontWeight: 'bold' }}>{c.label}</div>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: c.color }}>{c.val}</div>
              </div>
            ))}
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
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Data</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tipo / Descrição</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Valor</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {colabItems.map((item, i) => (
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
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' as const }}>
                        {item.dataPagamento ? fmtDataBR(item.dataPagamento) : (item.mes || '—')}
                        {item.semana && <div style={{ color: '#999', fontSize: '10px' }}>sem. {fmtDataBR(item.semana)}</div>}
                      </td>
                      <td style={{ padding: '6px 8px', maxWidth: '220px' }}>
                        <div style={{ fontSize: '11px', color: '#333' }}>
                          {item.tipoSaida && <span style={{ padding: '1px 5px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold',
                            backgroundColor: TIPOS_DEBITO.includes(item.tipoSaida) ? '#fce4ec' : '#fff3e0',
                            color: TIPOS_DEBITO.includes(item.tipoSaida) ? '#c62828' : '#e65100',
                            marginRight: '4px' }}>{item.tipoSaida}</span>}
                          {item.descricao}
                        </div>
                        {item.obs && <div style={{ color: '#888', fontSize: '10px', fontStyle: 'italic' }}>📝 {item.obs}</div>}
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
                            <button onClick={() => { onClose(); abrirEdicao(item); }}
                              style={{ ...s.btn('#f57c00'), padding: '3px 7px', fontSize: '11px' }} title="Editar lançamento">✏️</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                    <td colSpan={3} style={{ padding: '8px' }}>TOTAL DO MÊS</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: '#a5d6a7', fontSize: '13px' }}>
                      {fmtMoeda(folhaTotal - saidaDeb - saidaCred)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
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
                    <th style={s.thC}>Data</th>
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
                  {filteredItems.map((item, i) => (
                    <tr key={item.id}
                      style={{ backgroundColor: !item.pago ? '#fffde7' : i % 2 === 0 ? '#fafafa' : 'white', borderLeft: !item.pago ? '3px solid #f9a825' : '3px solid transparent' }}
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
                      {/* Coluna Forma de Pagamento */}
                      <td style={s.tdC}>
                        {item.formaPagamento ? (
                          <span style={{
                            padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold',
                            backgroundColor: item.formaPagamento === 'PIX' ? '#e3f2fd' : item.formaPagamento === 'Dinheiro' ? '#e8f5e9' : '#fff3e0',
                            color: item.formaPagamento === 'PIX' ? '#1565c0' : item.formaPagamento === 'Dinheiro' ? '#2e7d32' : '#e65100',
                          }}>
                            {item.formaPagamento === 'PIX' ? '📱 PIX' : item.formaPagamento === 'Dinheiro' ? '💵 $' : '🔄 Misto'}
                          </span>
                        ) : (
                          <span style={{ color: '#ccc', fontSize: '10px' }}>—</span>
                        )}
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
                  ))}
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

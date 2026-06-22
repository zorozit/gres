import React, { useState, useCallback } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx';
import { fetchAuth } from '../utils/fetchAuth';


/* ═══════════════════════════════════════════════════════════════════════════
   CONCILIAÇÃO BANCÁRIA — Modelo Stone
   Colunas esperadas no XLSX:
   [0] Movimentação | [1] Tipo | [2] Valor | [3] Saldo antes | [4] Saldo depois
   [5] Tarifa       | [6] Data | [7] Nosso Número | [8] Situação
   [9] Destino      | [10] Destino Documento | [11] Destino Instituição
   [12] Destino Agência | [13] Destino Conta
   [14] Origem      | [15] Origem Documento  | [16] Origem Instituição
   [17] Origem Agência  | [18] Origem Conta
═══════════════════════════════════════════════════════════════════════════ */

// ── Tipos ─────────────────────────────────────────────────────────────────
interface TransacaoStone {
  id: string;
  movimentacao: 'Crédito' | 'Débito';
  tipo: string;
  valor: number;            // já em número (positivo=crédito, negativo=débito)
  saldoAntes: number;
  saldoDepois: number;
  tarifa: number;
  data: string;             // ISO YYYY-MM-DD
  dataHora: string;         // original DD/MM/YYYY HH:MM
  nossoNumero?: string;
  situacao: string;
  contraparte: string;      // nome da pessoa/empresa
  contraparteDoc?: string;  // CPF/CNPJ
  contraparteInstituicao?: string;
  // conciliação
  status: 'pendente' | 'conciliado' | 'ignorado';
  saidaId?: string;         // vínculo com lançamento em /saidas ou /despesas
  lancamentoTipo?: 'saida' | 'despesa'; // de qual módulo veio o vínculo
  obs?: string;
}

interface SaidaApi {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  dataPagamento?: string;
  tipo: string;
  origem?: string;
  colaboradorNome?: string;
  colaborador?: string;
  responsavelNome?: string;
  formaPagamento?: string;
  // campo extra para diferenciar origem
  _fonte?: 'saida' | 'despesa';
  fornecedorNome?: string;
  categoria?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const parseMoeda = (raw: any): number => {
  if (raw == null) return 0;
  const s = String(raw).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.').trim();
  return parseFloat(s) || 0;
};

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtData = (iso: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const parseDataHora = (raw: string): { iso: string; original: string } => {
  // Formato: "30/04/2026 22:35"
  if (!raw) return { iso: '', original: '' };
  const [datePart] = raw.split(' ');
  const [d, m, y] = datePart.split('/');
  return { iso: `${y}-${m}-${d}`, original: raw };
};

const getContraparte = (row: any[]): { nome: string; doc?: string; inst?: string } => {
  // Para Débito: destino é quem recebeu (coluna 9..13)
  // Para Crédito: origem é quem enviou (coluna 14..18)
  const mov = row[0];
  if (mov === 'Débito') {
    return {
      nome: (row[9] && row[9] !== 'Desconhecido') ? String(row[9]) : '—',
      doc:  (row[10] && row[10] !== 'Desconhecido') ? String(row[10]) : undefined,
      inst: (row[11] && row[11] !== 'Desconhecido') ? String(row[11]) : undefined,
    };
  } else {
    return {
      nome: (row[14] && row[14] !== 'Desconhecido') ? String(row[14]) : '—',
      doc:  (row[15] && row[15] !== 'Desconhecido') ? String(row[15]) : undefined,
      inst: (row[16] && row[16] !== 'Desconhecido') ? String(row[16]) : undefined,
    };
  }
};

// ── Cores por tipo de transação ────────────────────────────────────────────
const COR_TIPO: Record<string, { bg: string; text: string }> = {
  'Pix':                              { bg: '#e3f2fd', text: '#1565c0' },
  'Pagamento':                        { bg: '#fff3e0', text: '#e65100' },
  'Recebível de Cartão':              { bg: '#e8f5e9', text: '#2e7d32' },
  'TED':                              { bg: '#f3e5f5', text: '#6a1b9a' },
  'Transação':                        { bg: '#fce4ec', text: '#880e4f' },
  'Transferência entre contas Stone': { bg: '#e0f7fa', text: '#006064' },
  'Pagamento devolvido':              { bg: '#f9fbe7', text: '#558b2f' },
};
const corTipo = (tipo: string) => COR_TIPO[tipo] ?? { bg: '#f5f5f5', text: '#555' };

// ── Componente principal ───────────────────────────────────────────────────
const ConciliacaoBancaria: React.FC = () => {
  const { activeUnit } = useUnit();
  useAuth();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
  const authToken = localStorage.getItem('auth_token') || '';

  // ── State ──────────────────────────────────────────────────────────────
  const [transacoes, setTransacoes] = useState<TransacaoStone[]>([]);
  const [saidasApi, setSaidasApi] = useState<SaidaApi[]>([]);
  const [carregandoSaidas, setCarregandoSaidas] = useState(false);
  const [totalDespesasCarregadas, setTotalDespesasCarregadas] = useState(0);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState('');

  // filtros
  const [filtroMov, setFiltroMov] = useState<'todos' | 'Crédito' | 'Débito'>('todos');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pendente' | 'conciliado' | 'ignorado'>('todos');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [buscaTexto, setBuscaTexto] = useState('');

  // modal de conciliação
  const [transacaoSelecionada, setTransacaoSelecionada] = useState<TransacaoStone | null>(null);
  const [saidaVinculo, setSaidaVinculo] = useState('');
  const [obsVinculo, setObsVinculo] = useState('');

  // ── Parse do XLSX Stone ────────────────────────────────────────────────
  const processarArquivo = useCallback((file: File) => {
    setArquivo(file);
    setErroArquivo('');
    setTransacoes([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (!rows || rows.length < 2) {
          setErroArquivo('Arquivo vazio ou sem dados.');
          return;
        }

        // Validar cabeçalho (linha 0)
        const header = rows[0];
        if (!header[0] || !String(header[0]).toLowerCase().includes('moviment')) {
          setErroArquivo('Formato não reconhecido. Certifique-se de exportar o extrato pelo padrão Stone (coluna "Movimentação" na primeira posição).');
          return;
        }

        const parsed: TransacaoStone[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]) continue;

          const mov = String(row[0]) as 'Crédito' | 'Débito';
          const valorRaw = parseMoeda(row[2]);
          const valor = mov === 'Débito' ? -Math.abs(valorRaw) : Math.abs(valorRaw);
          const { iso, original } = parseDataHora(String(row[6] || ''));
          const cp = getContraparte(row);

          parsed.push({
            id: `stone-${i}-${iso}-${valorRaw}`,
            movimentacao: mov,
            tipo: String(row[1] || ''),
            valor,
            saldoAntes: parseMoeda(row[3]),
            saldoDepois: parseMoeda(row[4]),
            tarifa: row[5] === 'Grátis' ? 0 : parseMoeda(row[5]),
            data: iso,
            dataHora: original,
            nossoNumero: row[7] ? String(row[7]) : undefined,
            situacao: String(row[8] || ''),
            contraparte: cp.nome,
            contraparteDoc: cp.doc,
            contraparteInstituicao: cp.inst,
            status: 'pendente',
            saidaId: undefined,
            obs: undefined,
          });
        }

        setTransacoes(parsed);

        // Auto-carregar saídas do período
        if (parsed.length > 0) {
          const datas = parsed.map(t => t.data).filter(Boolean).sort();
          carregarSaidas(datas[0], datas[datas.length - 1]);
          setFiltroDataInicio(datas[0]);
          setFiltroDataFim(datas[datas.length - 1]);
        }
      } catch (err: any) {
        setErroArquivo('Erro ao processar o arquivo: ' + (err?.message || 'Formato inválido'));
      }
    };
    reader.readAsArrayBuffer(file);
  }, [unitId, authToken, apiUrl]);

  // ── Carregar saídas + despesas da API ────────────────────────────────────
  const carregarSaidas = async (inicio: string, fim: string) => {
    if (!unitId || !authToken) return;
    setCarregandoSaidas(true);
    try {
      // Busca saídas e despesas em paralelo
      const [resSaidas, resDespesas] = await Promise.allSettled([
        fetchAuth(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${inicio}&dataFim=${fim}`,
          { headers: { Authorization: `Bearer ${authToken}` } }),
        fetchAuth(`${apiUrl}/despesas?unitId=${unitId}&dataInicio=${inicio}&dataFim=${fim}`,
          { headers: { Authorization: `Bearer ${authToken}` } }),
      ]);

      const saidas: SaidaApi[] = [];
      const despesas: SaidaApi[] = [];

      if (resSaidas.status === 'fulfilled' && resSaidas.value.ok) {
        const data = await resSaidas.value.json();
        const arr: SaidaApi[] = Array.isArray(data) ? data : [];
        saidas.push(...arr.map(s => ({ ...s, _fonte: 'saida' as const })));
      }

      if (resDespesas.status === 'fulfilled' && resDespesas.value.ok) {
        const data = await resDespesas.value.json();
        const arr: any[] = Array.isArray(data) ? data : [];
        // Normaliza despesa para o shape de SaidaApi
        despesas.push(...arr.map(d => ({
          id: d.id,
          descricao: d.descricao || d.categoria,
          valor: d.valor,
          data: d.dataVencimento || d.dataEmissao || '',
          dataPagamento: d.dataPagamento,
          tipo: d.categoria || 'Despesa',
          formaPagamento: d.formaPagamento,
          fornecedorNome: d.fornecedorNome,
          categoria: d.categoria,
          _fonte: 'despesa' as const,
        })));
        setTotalDespesasCarregadas(despesas.length);
      }

      setSaidasApi([...saidas, ...despesas]);
    } catch (err) {
      console.error('Erro ao carregar saídas/despesas:', err);
    } finally {
      setCarregandoSaidas(false);
    }
  };

  // ── Filtrar transações ─────────────────────────────────────────────────
  const transacoesFiltradas = transacoes.filter(t => {
    if (filtroMov !== 'todos' && t.movimentacao !== filtroMov) return false;
    if (filtroTipo && t.tipo !== filtroTipo) return false;
    if (filtroStatus !== 'todos' && t.status !== filtroStatus) return false;
    if (filtroDataInicio && t.data < filtroDataInicio) return false;
    if (filtroDataFim && t.data > filtroDataFim) return false;
    if (buscaTexto) {
      const q = buscaTexto.toLowerCase();
      if (
        !t.contraparte.toLowerCase().includes(q) &&
        !t.tipo.toLowerCase().includes(q) &&
        !(t.contraparteDoc || '').toLowerCase().includes(q) &&
        !String(Math.abs(t.valor)).includes(q)
      ) return false;
    }
    return true;
  });

  // ── Totais ─────────────────────────────────────────────────────────────
  const totalCreditos = transacoesFiltradas.filter(t => t.valor > 0).reduce((s, t) => s + t.valor, 0);
  const totalDebitos  = transacoesFiltradas.filter(t => t.valor < 0).reduce((s, t) => s + t.valor, 0);
  const totalTarifas  = transacoesFiltradas.reduce((s, t) => s + t.tarifa, 0);
  const qtdPendentes  = transacoes.filter(t => t.status === 'pendente').length;
  const qtdConciliados = transacoes.filter(t => t.status === 'conciliado').length;
  const qtdIgnorados  = transacoes.filter(t => t.status === 'ignorado').length;

  // ── Ações de conciliação ───────────────────────────────────────────────
  const abrirModal = (t: TransacaoStone) => {
    setTransacaoSelecionada(t);
    setSaidaVinculo(t.saidaId || '');
    setObsVinculo(t.obs || '');
  };

  const vincularSaida = () => {
    if (!transacaoSelecionada) return;
    setTransacoes(prev => prev.map(t =>
      t.id === transacaoSelecionada.id
        ? { ...t, status: 'conciliado', saidaId: saidaVinculo || undefined, obs: obsVinculo || undefined }
        : t
    ));
    setTransacaoSelecionada(null);
  };

  const marcarIgnorado = (id: string) => {
    setTransacoes(prev => prev.map(t =>
      t.id === id ? { ...t, status: 'ignorado', saidaId: undefined } : t
    ));
  };

  const marcarPendente = (id: string) => {
    setTransacoes(prev => prev.map(t =>
      t.id === id ? { ...t, status: 'pendente', saidaId: undefined, obs: undefined } : t
    ));
  };

  // ── Conciliação automática (valor + data ± 1 dia) ──────────────────────
  const conciliarAutomatico = () => {
    if (!saidasApi.length || !transacoes.length) return;
    let count = 0;
    setTransacoes(prev => prev.map(t => {
      if (t.status !== 'pendente' || t.movimentacao !== 'Débito') return t;
      const valorAbs = Math.abs(t.valor);

      // Busca saída com mesmo valor (±R$0,05) e data próxima (±1 dia)
      const match = saidasApi.find(s => {
        const difValor = Math.abs(Math.abs(s.valor) - valorAbs);
        if (difValor > 0.05) return false;
        const dsData = new Date(s.dataPagamento || s.data);
        const dtTrans = new Date(t.data);
        const difDias = Math.abs((dsData.getTime() - dtTrans.getTime()) / 86400000);
        return difDias <= 1;
      });

      if (match) {
        count++;
        return { ...t, status: 'conciliado', saidaId: match.id, obs: `Auto: ${match.descricao}` };
      }
      return t;
    }));
    if (count > 0) alert(`✅ ${count} transação(ões) conciliada(s) automaticamente!`);
    else alert('Nenhuma correspondência automática encontrada. Revise manualmente.');
  };

  // ── Exportar XLSX ──────────────────────────────────────────────────────
  const exportarXLSX = () => {
    const dados = transacoesFiltradas.map(t => ({
      'Data/Hora': t.dataHora,
      'Movimentação': t.movimentacao,
      'Tipo': t.tipo,
      'Contraparte': t.contraparte,
      'Doc. Contraparte': t.contraparteDoc || '—',
      'Instituição': t.contraparteInstituicao || '—',
      'Valor (R$)': t.valor,
      'Tarifa (R$)': t.tarifa,
      'Saldo Antes': t.saldoAntes,
      'Saldo Depois': t.saldoDepois,
      'Situação': t.situacao,
      'Status Conciliação': t.status,
      'ID Saída Vinculada': t.saidaId || '—',
      'Obs. Conciliação': t.obs || '—',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, ws, 'Conciliação');
    XLSX.writeFile(wb2, `conciliacao-stone-${filtroDataInicio}-${filtroDataFim}.xlsx`);
  };

  // ── Tipos únicos para filtro ───────────────────────────────────────────
  const tiposUnicos = [...new Set(transacoes.map(t => t.tipo))].sort();

  // ── Saída selecionada no modal ─────────────────────────────────────────
  const saidaModal = saidasApi.find(s => s.id === saidaVinculo);
  const saidasSomente = saidasApi.filter(s => s._fonte !== 'despesa');
  const despesasSomente = saidasApi.filter(s => s._fonte === 'despesa');

  // ── Sugestões de conciliação para o modal ──────────────────────────────
  const sugestoes = transacaoSelecionada
    ? saidasApi.filter(s => {
        const difValor = Math.abs(Math.abs(s.valor) - Math.abs(transacaoSelecionada.valor));
        return difValor <= 10;
      }).slice(0, 8)
    : [];

  // ── Styles ────────────────────────────────────────────────────────────
  const s = {
    card: { backgroundColor: '#fff', borderRadius: '10px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.08)', border: '1px solid #e8ecf0' } as React.CSSProperties,
    btn: (bg: string, col = '#fff'): React.CSSProperties => ({ padding: '8px 16px', background: bg, color: col, border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' as const }),
    label: { display: 'block', fontSize: '12px', fontWeight: 700, color: '#555', marginBottom: '4px' } as React.CSSProperties,
    input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' as const },
    th: { padding: '10px 12px', backgroundColor: '#0f172a', color: '#fff', textAlign: 'left' as const, fontSize: '11px', whiteSpace: 'nowrap' as const },
    td: { padding: '9px 12px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const },
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      pendente:    { bg: '#fff3e0', text: '#e65100', label: '⏳ Pendente' },
      conciliado:  { bg: '#e8f5e9', text: '#2e7d32', label: '✅ Conciliado' },
      ignorado:    { bg: '#eceff1', text: '#546e7a', label: '🚫 Ignorado' },
    };
    const c = map[status] || map.pendente;
    return (
      <span style={{ backgroundColor: c.bg, color: c.text, padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
        {c.label}
      </span>
    );
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f4f6f9', display: 'flex', flexDirection: 'column' }}>
      <Header title="🏦 Conciliação Bancária — Stone" showBack={true} />

      <div style={{ flex: 1, maxWidth: '1500px', width: '100%', margin: '0 auto', padding: '20px' }}>

        {/* ── Upload do extrato ───────────────────────────────────────────── */}
        <div style={{ ...s.card, marginBottom: '18px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '17px', color: '#1f2937' }}>
            📂 Importar Extrato Stone (XLSX)
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={s.label}>Arquivo de extrato (.xlsx)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                style={s.input}
                onChange={e => { const f = e.target.files?.[0]; if (f) processarArquivo(f); }}
              />
              {arquivo && <div style={{ fontSize: '12px', color: '#607d8b', marginTop: '5px' }}>📎 {arquivo.name}</div>}
              <div style={{ fontSize: '11px', color: '#9e9e9e', marginTop: '4px' }}>
                Exporte o extrato no painel Stone → "Exportar" → formato XLSX. Suporta múltiplos meses no mesmo arquivo.
              </div>
            </div>
            {transacoes.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button style={s.btn('#1565c0')} onClick={conciliarAutomatico}>
                  ⚡ Conciliar Automático
                </button>
                <button style={s.btn('#7b1fa2')} onClick={exportarXLSX}>
                  📥 Exportar XLSX
                </button>
              </div>
            )}
          </div>
          {erroArquivo && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#ffebee', borderRadius: '6px', color: '#c62828', fontSize: '13px', fontWeight: 600 }}>
              ⚠️ {erroArquivo}
            </div>
          )}
          {carregandoSaidas && (
            <div style={{ marginTop: '10px', fontSize: '13px', color: '#607d8b' }}>⏳ Carregando saídas do período para conciliação...</div>
          )}
        </div>

        {/* ── Resumo ─────────────────────────────────────────────────────── */}
        {transacoes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            {[
              { label: 'Total transações', value: transacoes.length.toString(), color: '#1565c0', bg: '#e3f2fd' },
              { label: 'Créditos', value: fmt(totalCreditos), color: '#2e7d32', bg: '#e8f5e9' },
              { label: 'Débitos', value: fmt(Math.abs(totalDebitos)), color: '#c62828', bg: '#ffebee' },
              { label: 'Tarifas', value: fmt(totalTarifas), color: '#e65100', bg: '#fff3e0' },
              { label: '⏳ Pendentes', value: qtdPendentes.toString(), color: '#e65100', bg: '#fff3e0' },
              { label: '✅ Conciliados', value: qtdConciliados.toString(), color: '#2e7d32', bg: '#e8f5e9' },
              { label: '🚫 Ignorados', value: qtdIgnorados.toString(), color: '#546e7a', bg: '#eceff1' },
            ].map(c => (
              <div key={c.label} style={{ ...s.card, backgroundColor: c.bg, borderLeft: `4px solid ${c.color}`, padding: '14px 16px' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '.03em' }}>{c.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: c.color, marginTop: '4px' }}>{c.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        {transacoes.length > 0 && (
          <div style={{ ...s.card, marginBottom: '14px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: '140px' }}>
              <label style={s.label}>Movimentação</label>
              <select value={filtroMov} onChange={e => setFiltroMov(e.target.value as any)} style={{ ...s.input, width: 'auto' }}>
                <option value="todos">Todos</option>
                <option value="Crédito">Crédito</option>
                <option value="Débito">Débito</option>
              </select>
            </div>
            <div style={{ minWidth: '170px' }}>
              <label style={s.label}>Tipo</label>
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...s.input, width: 'auto' }}>
                <option value="">Todos</option>
                {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ minWidth: '150px' }}>
              <label style={s.label}>Status conciliação</label>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} style={{ ...s.input, width: 'auto' }}>
                <option value="todos">Todos</option>
                <option value="pendente">⏳ Pendente</option>
                <option value="conciliado">✅ Conciliado</option>
                <option value="ignorado">🚫 Ignorado</option>
              </select>
            </div>
            <div>
              <label style={s.label}>De</label>
              <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} style={{ ...s.input, width: '140px' }} />
            </div>
            <div>
              <label style={s.label}>Até</label>
              <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} style={{ ...s.input, width: '140px' }} />
            </div>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={s.label}>Buscar (contraparte / valor)</label>
              <input
                type="text"
                placeholder="Nome, CNPJ, valor..."
                value={buscaTexto}
                onChange={e => setBuscaTexto(e.target.value)}
                style={s.input}
              />
            </div>
          </div>
        )}

        {/* ── Tabela ─────────────────────────────────────────────────────── */}
        {transacoes.length > 0 ? (
          <div style={{ ...s.card, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#1f2937' }}>
                📋 {transacoesFiltradas.length} transação(ões)
              </h3>
              <div style={{ fontSize: '12px', color: '#888' }}>
                {saidasSomente.length} saídas + {totalDespesasCarregadas} despesas carregadas
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead>
                <tr>
                  {['Data/Hora', 'Tipo', 'Contraparte', 'Valor', 'Tarifa', 'Situação', 'Status', 'Saída Vinculada', 'Ações'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transacoesFiltradas.map((t, idx) => {
                  const ct = corTipo(t.tipo);
                  const saida = saidasApi.find(s => s.id === t.saidaId);
                  return (
                    <tr
                      key={t.id}
                      style={{ background: idx % 2 === 0 ? '#fafafa' : '#fff' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fafafa' : '#fff')}
                    >
                      <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {t.dataHora}
                      </td>
                      <td style={s.td}>
                        <span style={{ backgroundColor: ct.bg, color: ct.text, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
                          {t.movimentacao === 'Débito' ? '↑' : '↓'} {t.tipo}
                        </span>
                      </td>
                      <td style={{ ...s.td, maxWidth: '200px' }}>
                        <div style={{ fontWeight: 600, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.contraparte}
                        </div>
                        {t.contraparteDoc && (
                          <div style={{ fontSize: '10px', color: '#888' }}>{t.contraparteDoc}</div>
                        )}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: t.valor >= 0 ? '#2e7d32' : '#c62828', whiteSpace: 'nowrap' }}>
                        {fmt(t.valor)}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', color: '#888', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {t.tarifa > 0 ? `-${fmt(t.tarifa)}` : 'Grátis'}
                      </td>
                      <td style={{ ...s.td, fontSize: '11px', color: '#607d8b' }}>{t.situacao}</td>
                      <td style={s.td}>{statusBadge(t.status)}</td>
                      <td style={{ ...s.td, maxWidth: '160px', fontSize: '11px' }}>
                        {saida ? (
                          <div>
                            <div style={{ color: '#1565c0', fontWeight: 600 }}>{saida.descricao}</div>
                            <div style={{ color: '#888' }}>{fmt(saida.valor)} — {fmtData(saida.dataPagamento || saida.data)}</div>
                            {t.obs && <div style={{ color: '#607d8b', fontStyle: 'italic' }}>{t.obs}</div>}
                          </div>
                        ) : t.obs ? (
                          <span style={{ color: '#607d8b', fontStyle: 'italic' }}>{t.obs}</span>
                        ) : '—'}
                      </td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                        {t.status !== 'conciliado' && (
                          <button
                            onClick={() => abrirModal(t)}
                            style={{ ...s.btn('#1565c0'), padding: '4px 8px', fontSize: '11px', marginRight: '4px' }}
                          >
                            🔗
                          </button>
                        )}
                        {t.status !== 'ignorado' && t.status !== 'conciliado' && (
                          <button
                            onClick={() => marcarIgnorado(t.id)}
                            style={{ ...s.btn('#546e7a'), padding: '4px 8px', fontSize: '11px', marginRight: '4px' }}
                          >
                            🚫
                          </button>
                        )}
                        {t.status !== 'pendente' && (
                          <button
                            onClick={() => marcarPendente(t.id)}
                            style={{ ...s.btn('#e65100'), padding: '4px 8px', fontSize: '11px' }}
                          >
                            ↩
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0f172a', color: '#fff', fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: '10px 12px', fontSize: '13px' }}>
                    TOTAL ({transacoesFiltradas.length} transações)
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px' }}>
                    {fmt(totalCreditos + totalDebitos)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', color: '#f97316' }}>
                    {fmt(totalTarifas)}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div style={{ ...s.card, textAlign: 'center', padding: '60px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏦</div>
            <p style={{ color: '#888', fontSize: '15px', margin: 0 }}>
              Importe o extrato Stone (XLSX) para iniciar a conciliação.
            </p>
            <p style={{ color: '#bbb', fontSize: '12px', marginTop: '8px' }}>
              Acesse o painel Stone → Extrato → Exportar → XLSX
            </p>
          </div>
        )}
      </div>

      {/* ── Modal de vinculação ─────────────────────────────────────────────── */}
      {transacaoSelecionada && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ ...s.card, maxWidth: '560px', width: '94%', maxHeight: '92vh', overflowY: 'auto' }}>
            {/* Cabeçalho do modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#1565c0', fontSize: '16px' }}>🔗 Vincular a Saída ou Despesa</h3>
              <button onClick={() => setTransacaoSelecionada(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {/* Dados da transação */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
              <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: '6px' }}>Transação selecionada:</div>
              <div>📅 {transacaoSelecionada.dataHora}</div>
              <div>👤 {transacaoSelecionada.contraparte} {transacaoSelecionada.contraparteDoc && `(${transacaoSelecionada.contraparteDoc})`}</div>
              <div style={{ fontWeight: 700, color: transacaoSelecionada.valor >= 0 ? '#2e7d32' : '#c62828', marginTop: '4px' }}>
                💰 {fmt(transacaoSelecionada.valor)} — {transacaoSelecionada.tipo}
              </div>
            </div>

            {/* Sugestões */}
            {sugestoes.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#555', marginBottom: '8px' }}>
                  💡 Sugestões (valores próximos):
                </div>
                {sugestoes.map(s2 => (
                  <div
                    key={s2.id}
                    onClick={() => setSaidaVinculo(s2.id)}
                    style={{
                      padding: '10px 12px', borderRadius: '7px', marginBottom: '6px', cursor: 'pointer',
                      border: `2px solid ${saidaVinculo === s2.id ? '#1565c0' : '#e0e0e0'}`,
                      background: saidaVinculo === s2.id ? '#e3f2fd' : '#fff',
                      fontSize: '13px',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{s2.descricao}</div>
                    <div style={{ color: '#555', fontSize: '12px' }}>
                      {fmt(s2.valor)} — {fmtData(s2.dataPagamento || s2.data)}
                      {s2.colaboradorNome || s2.colaborador ? ` — ${s2.colaboradorNome || s2.colaborador}` : ''}
                      {` — ${s2.tipo || s2.origem || ''}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selecionar saída manualmente */}
            <div style={{ marginBottom: '14px' }}>
              <label style={s.label}>Selecionar saída ou despesa manualmente:</label>
              <select
                value={saidaVinculo}
                onChange={e => setSaidaVinculo(e.target.value)}
                style={{ ...s.input }}
              >
                <option value="">— Nenhuma (marcar como conciliado sem vínculo) —</option>
                {saidasSomente.length > 0 && (
                  <optgroup label="💸 Saídas">
                    {saidasSomente.map(s2 => (
                      <option key={s2.id} value={s2.id}>
                        {fmtData(s2.dataPagamento || s2.data)} | {fmt(s2.valor)} | {s2.descricao} | {s2.tipo || s2.origem}
                      </option>
                    ))}
                  </optgroup>
                )}
                {despesasSomente.length > 0 && (
                  <optgroup label="🧾 Despesas">
                    {despesasSomente.map(s2 => (
                      <option key={s2.id} value={s2.id}>
                        {fmtData(s2.dataPagamento || s2.data)} | {fmt(s2.valor)} | {s2.fornecedorNome || s2.descricao} | {s2.categoria}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {saidaModal && (
                <div style={{ marginTop: '8px', padding: '8px 10px', background: '#e8f5e9', borderRadius: '6px', fontSize: '12px', color: '#2e7d32', fontWeight: 600 }}>
                  ✅ Saída selecionada: {saidaModal.descricao} — {fmt(saidaModal.valor)}
                </div>
              )}
            </div>

            {/* Observação */}
            <div style={{ marginBottom: '16px' }}>
              <label style={s.label}>Observação (opcional):</label>
              <input
                type="text"
                placeholder="Ex: Pagamento fornecedor PAMA — NF 12345"
                value={obsVinculo}
                onChange={e => setObsVinculo(e.target.value)}
                style={s.input}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={vincularSaida} style={{ ...s.btn('#2e7d32'), flex: 2 }}>
                ✅ Confirmar Conciliação
              </button>
              <button onClick={() => setTransacaoSelecionada(null)} style={{ ...s.btn('#9e9e9e'), flex: 1 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer showLinks={false} />
    </div>
  );
};

export default ConciliacaoBancaria;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';
import { Footer } from '../components/Footer';
import * as XLSX from 'xlsx';

/*
  ══════════════════════════════════════════════════════════════════════════
  CATEGORIAS PADRONIZADAS DE SAÍDAS
  ══════════════════════════════════════════════════════════════════════════
  Código           │ Sinal │ Regra automática
  ─────────────────┼───────┼───────────────────────────────────────────────
  A pagar          │  (−)  │ Restaurante paga ao colaborador (gen. purpose)
  Adiant. Salário  │  (−)  │ Adiantamento salarial (descontado no fechamento CLT)
  Adiant. Transporte│ (−)  │ Transporte pago antecipado → abatido na folha semanal
  Caixinha         │  (+)  │ Gorjeta coletada pelo restaurante → PAGA ao colaborador junto com a semana
  Consumo Interno  │  (−)  │ Consumo/refeição do colaborador no restaurante
  A receber        │  (+)  │ Colaborador deve ao restaurante → descontado do líquido
  Vale             │  (+)  │ Vale adiantado que deve ser devolvido/descontado
  Sangria          │  (−)  │ Retirada física de dinheiro do caixa
  PIX              │  (−)  │ Pagamento via PIX (despesa avulsa)
  Caixa            │ (±)   │ Entrada ou saída no caixa (registro contábil)
  ══════════════════════════════════════════════════════════════════════════
*/

// ── Categorias padronizadas ────────────────────────────────────────────
interface Categoria {
  value: string;           // código salvo no banco
  label: string;           // label no select
  emoji: string;
  dir: 'saida' | 'entrada' | 'neutro';
  hint: string;
  grupo: 'colaborador' | 'caixa';
  regraFolha?: 'abate_transporte' | 'desconto_transporte' | 'desconto_liquido' | 'credito_liquido' | 'adiantamento_clt' | 'saldo_especial' | 'abate_especial' | null;
  bg: string; text: string; border: string;
}

const CATEGORIAS: Categoria[] = [
  // ── Grupo: Pagamentos ao Colaborador ──────────────────────────────
  {
    value: 'A pagar', label: 'A pagar — genérico', emoji: '📤',
    dir: 'saida', grupo: 'colaborador', regraFolha: null,
    hint: 'Pagamento genérico ao colaborador (comissão, ajuda de custo, etc.). NÃO é abatido automaticamente da folha.',
    bg: '#fce4e4', text: '#c62828', border: '#e57373',
  },
  {
    value: 'Adiantamento Salário', label: 'Adiantamento Salário', emoji: '💵',
    dir: 'saida', grupo: 'colaborador', regraFolha: 'adiantamento_clt',
    hint: 'Adiantamento sobre o salário CLT. Será descontado automaticamente no fechamento mensal.',
    bg: '#fce4e4', text: '#b71c1c', border: '#c62828',
  },
  {
    value: 'Adiantamento Transporte', label: 'Adiantamento Transporte', emoji: '🚗',
    dir: 'saida', grupo: 'colaborador', regraFolha: 'abate_transporte',
    hint: 'Transporte pago antecipado ao colaborador. Será abatido automaticamente do transporte calculado na semana de dobras (Folha → Freelancers).',
    bg: '#fff3e0', text: '#e65100', border: '#ffcc80',
  },
  {
    value: 'Desconto Transporte', label: 'Desconto Transporte', emoji: '🚌',
    dir: 'entrada', grupo: 'colaborador', regraFolha: 'desconto_transporte',
    hint: 'Desconto/abatimento manual da carteira de transporte. Útil para registrar devolução parcelada sem perder o saldo histórico.',
    bg: '#fff8e1', text: '#ef6c00', border: '#ffcc80',
  },
  {
    value: 'Adiantamento Especial', label: 'Adiantamento Especial', emoji: '💸',
    dir: 'saida', grupo: 'colaborador', regraFolha: 'saldo_especial',
    hint: 'Empréstimo / adiantamento especial pago agora ao colaborador. O saldo fica aberto para abatimentos parcelados nas semanas seguintes.',
    bg: '#f3e5f5', text: '#6a1b9a', border: '#ce93d8',
  },
  {
    value: 'Desconto Adiantamento Especial', label: 'Desconto Adiantamento Especial', emoji: '🧾',
    dir: 'entrada', grupo: 'colaborador', regraFolha: 'abate_especial',
    hint: 'Parcela semanal do adiantamento especial. Deve ser lançada a cada abatimento para reduzir o saldo em aberto e descontar do líquido.',
    bg: '#ede7f6', text: '#4527a0', border: '#b39ddb',
  },
  {
    value: 'Caixinha', label: 'Caixinha 🪙 (gorjeta a pagar)', emoji: '🪙',
    dir: 'saida', grupo: 'colaborador', regraFolha: 'credito_liquido',
    hint: '🪙 Gorjeta coletada pelo restaurante. Será PAGA ao colaborador junto com os demais pagamentos da semana (somada ao líquido, não descontada).',
    bg: '#fff8e1', text: '#f57f17', border: '#ffe082',
  },
  {
    value: 'Consumo Interno', label: 'Consumo Interno', emoji: '🍽️',
    dir: 'saida', grupo: 'colaborador', regraFolha: 'desconto_liquido',
    hint: 'Consumo de refeição/produto do colaborador. Será descontado do líquido semanal ou salário.',
    bg: '#fce4ec', text: '#880e4f', border: '#f48fb1',
  },
  {
    value: 'A receber', label: 'A receber — vale / empréstimo', emoji: '📥',
    dir: 'entrada', grupo: 'colaborador', regraFolha: 'desconto_liquido',
    hint: 'Colaborador deve ao restaurante (vale, empréstimo, uniforme, etc.). Será descontado automaticamente do líquido semanal (Freelancer) ou do saldo CLT.',
    bg: '#e8f5e9', text: '#2e7d32', border: '#66bb6a',
  },
  // ── Grupo: Caixa / Operacional ────────────────────────────────────
  {
    value: 'Sangria', label: 'Sangria de Caixa', emoji: '💵',
    dir: 'saida', grupo: 'caixa', regraFolha: null,
    hint: 'Retirada física de dinheiro do caixa (sangria). Não vinculado à folha.',
    bg: '#fff3e0', text: '#e65100', border: '#ffa726',
  },
  {
    value: 'PIX', label: 'PIX (pagamento)', emoji: '📲',
    dir: 'saida', grupo: 'caixa', regraFolha: null,
    hint: 'Pagamento enviado via PIX (despesa, fornecedor, etc.).',
    bg: '#e8eaf6', text: '#283593', border: '#7986cb',
  },
  {
    value: 'Caixa', label: 'Caixa (entrada/saída)', emoji: '🏦',
    dir: 'neutro', grupo: 'caixa', regraFolha: null,
    hint: 'Movimentação registrada diretamente no caixa.',
    bg: '#e0f7fa', text: '#006064', border: '#26c6da',
  },
];

const catMap = Object.fromEntries(CATEGORIAS.map(c => [c.value, c]));
const getCat = (tipo: string): Categoria =>
  catMap[tipo] || { value: tipo, label: tipo, emoji: '❓', dir: 'saida', grupo: 'caixa', regraFolha: null, hint: '', bg: '#f5f5f5', text: '#424242', border: '#bdbdbd' };

// ── Helper ─────────────────────────────────────────────────────────────
const fmtDataBR = (iso: string) => {
  if (!iso || iso === '-') return '-';
  const [y, m, d] = (iso || '').split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

// ══════════════════════════════════════════════════════════════════════════
export const Saidas: React.FC = () => {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const userId = localStorage.getItem('user_id') || '';
  const [abaSelecionada, setAbaSelecionada] = useState<'novo' | 'movimentos'>('novo');

  const getLocalDate = () => new Date().toISOString().split('T')[0];
  const toNum = (val: any): number => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };

  // aba Novo Registro
  const [dataSelecionada, setDataSelecionada] = useState(getLocalDate());
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [registroEditando, setRegistroEditando] = useState<any>(null);
  const [novoRegistro, setNovoRegistro] = useState({
    responsavel: email,
    colaboradorId: '',
    descricao: '',
    valor: 0,
    tipo: 'A pagar',
    origem: 'A pagar',
    dataPagamento: getLocalDate(),
    observacao: '',
  });

  // aba Movimentos
  const [movRegistros, setMovRegistros] = useState<any[]>([]);
  const [movLoading, setMovLoading] = useState(false);
  const [movDateFilter, setMovDateFilter] = useState('semana-atual');
  const [movDataInicio, setMovDataInicio] = useState('');
  const [movDataFim, setMovDataFim] = useState('');
  const [movColaborador, setMovColaborador] = useState('');
  const [movTipo, setMovTipo] = useState('');
  const [movGrupo, setMovGrupo] = useState<'todos' | 'colaborador' | 'caixa'>('todos');

  const apiUrl = import.meta.env.VITE_API_ENDPOINT || '';

  const calcularDatas = (filtro: string) => {
    const hoje = new Date();
    switch (filtro) {
      case 'hoje':
        return { inicio: hoje.toISOString().split('T')[0], fim: hoje.toISOString().split('T')[0] };
      case 'semana-atual': {
        const dow = hoje.getDay();
        const ini = new Date(hoje); ini.setDate(hoje.getDate() - dow);
        const fim = new Date(hoje); fim.setDate(hoje.getDate() + (6 - dow));
        return { inicio: ini.toISOString().split('T')[0], fim: fim.toISOString().split('T')[0] };
      }
      case 'mes-atual': {
        const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        return { inicio: ini.toISOString().split('T')[0], fim: fim.toISOString().split('T')[0] };
      }
      case 'mes-anterior': {
        const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
        return { inicio: ini.toISOString().split('T')[0], fim: fim.toISOString().split('T')[0] };
      }
      default:
        return { inicio: movDataInicio, fim: movDataFim };
    }
  };

  useEffect(() => {
    const { inicio, fim } = calcularDatas(movDateFilter);
    setMovDataInicio(inicio);
    setMovDataFim(fim);
  }, [movDateFilter]);

  useEffect(() => {
    if (unitId) carregarColaboradores();
  }, [email, unitId]);

  const carregarColaboradores = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setColaboradores(Array.isArray(data) ? data.filter((c: any) => c.ativo !== false) : []);
      }
    } catch (err) { console.error('Erro ao carregar colaboradores:', err); }
  };

  const handleFiltrar = async () => {
    setMovLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const { inicio, fim } = movDateFilter === 'customizado' ? { inicio: movDataInicio, fim: movDataFim } : calcularDatas(movDateFilter);
      let url = `${apiUrl}/saidas?dataInicio=${inicio}&dataFim=${fim}&unitId=${unitId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        let lista = Array.isArray(d) ? d : [];
        if (movColaborador) {
          lista = lista.filter((r: any) =>
            (r.colaborador || r.favorecido || r.colaboradorNome || '').toLowerCase().includes(movColaborador.toLowerCase()) ||
            (r.colaboradorId || '') === movColaborador
          );
        }
        if (movTipo) {
          lista = lista.filter((r: any) =>
            (r.tipo || r.origem || r.referencia || '').toLowerCase() === movTipo.toLowerCase()
          );
        }
        if (movGrupo !== 'todos') {
          lista = lista.filter((r: any) => {
            const cat = getCat(r.tipo || r.origem || r.referencia || '');
            return cat.grupo === movGrupo;
          });
        }
        setMovRegistros(lista);
      }
    } catch (err) { console.error('Erro ao filtrar movimentos:', err); }
    setMovLoading(false);
  };

  const handleSalvarNovoRegistro = async () => {
    if (!novoRegistro.colaboradorId) {
      alert('Selecione um colaborador');
      return;
    }
    if (!novoRegistro.descricao) {
      alert('Informe a descrição');
      return;
    }
    if (!novoRegistro.valor || novoRegistro.valor <= 0) {
      alert('Informe um valor válido (maior que zero)');
      return;
    }
    try {
      const token = localStorage.getItem('auth_token');
      // dataPagamento = data da saída (dataSelecionada) se não informado separadamente
      const dataPgto = novoRegistro.dataPagamento || dataSelecionada;
      const res = await fetch(`${apiUrl}/saidas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...novoRegistro,
          data: dataSelecionada,         // data do lançamento
          dataPagamento: dataPgto,       // data de pagamento (para filtros por período na folha)
          responsavel: email,
          responsavelId: userId,
          origem: novoRegistro.tipo,
          referencia: novoRegistro.tipo,
          unitId,
        }),
      });
      if (res.ok) {
        alert('✅ Saída registrada com sucesso!');
        setNovoRegistro({
          responsavel: email, colaboradorId: '', descricao: '', valor: 0,
          tipo: 'A pagar', origem: 'A pagar', dataPagamento: getLocalDate(), observacao: '',
        });
        // Reload movimentos if visible
        if (abaSelecionada === 'movimentos') handleFiltrar();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert('Erro ao salvar saída: ' + (errData.error || res.status));
      }
    } catch (err) { alert('Erro ao salvar saída'); }
  };

  const handleSalvarEdicao = async () => {
    if (!registroEditando) return;
    try {
      const token = localStorage.getItem('auth_token');
      const payload = {
        ...registroEditando,
        responsavel: registroEditando.responsavel || email,
        responsavelId: registroEditando.responsavelId || userId,
        origem: registroEditando.tipo || registroEditando.origem,
        referencia: registroEditando.tipo || registroEditando.referencia,
        dataPagamento: registroEditando.dataPagamento || registroEditando.data,
      };
      const res = await fetch(`${apiUrl}/saidas/${registroEditando.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert('✅ Saída atualizada!');
        setRegistroEditando(null);
        handleFiltrar();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert('Erro ao atualizar saída: ' + (errData.error || res.status));
      }
    } catch (err) { alert('Erro ao atualizar saída'); }
  };

  const handleDeletar = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja deletar este registro?')) return;
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${apiUrl}/saidas/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { alert('Saída deletada!'); handleFiltrar(); }
      else { alert('Erro ao deletar saída'); }
    } catch (err) { alert('Erro ao deletar saída'); }
  };

  const handleMudarData = (dias: number) => {
    const d = new Date(dataSelecionada + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    setDataSelecionada(d.toISOString().split('T')[0]);
  };

  const exportarXLSX = () => {
    const dados = movRegistros.map(r => {
      const cat = getCat(r.tipo || r.origem || r.referencia || '');
      return {
        'Data Lançamento': r.data || '-',
        'Data Pagamento': r.dataPagamento || r.data || '-',
        'Colaborador': r.colaborador || r.favorecido || r.colaboradorNome || '-',
        'Descrição': r.descricao || '-',
        'Categoria': r.tipo || r.origem || '-',
        'Grupo': cat.grupo === 'colaborador' ? 'Colaborador' : 'Caixa',
        'Regra Folha': cat.regraFolha || '—',
        'Valor': toNum(r.valor),
        'Responsável': r.responsavelNome || r.responsavel || '-',
        'Observação': r.observacao || '-',
      };
    });
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Saídas');
    XLSX.writeFile(wb, `saidas-${movDataInicio}-${movDataFim}.xlsx`);
  };

  // Totais por categoria
  const totaisPorCat = movRegistros.reduce((acc, r) => {
    const tipo = r.tipo || r.origem || r.referencia || '—';
    acc[tipo] = (acc[tipo] || 0) + toNum(r.valor);
    return acc;
  }, {} as Record<string, number>);

  const totalMovimentos = movRegistros.reduce((a, r) => a + toNum(r.valor), 0);
  const totalAPagar = movRegistros.filter(r => (r.tipo || r.origem || r.referencia) !== 'A receber').reduce((a, r) => a + toNum(r.valor), 0);
  const totalAReceber = movRegistros.filter(r => (r.tipo || r.origem || r.referencia) === 'A receber').reduce((a, r) => a + toNum(r.valor), 0);

  // ── Styles ─────────────────────────────────────────────────────────────
  const s = {
    card: { backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
    label: { fontSize: '13px', fontWeight: 'bold' as const, marginBottom: '4px', color: '#444', display: 'block' },
    input: { padding: '9px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    select: { padding: '9px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: (bg: string, col = 'white') => ({ padding: '10px 20px', borderRadius: '4px', border: 'none', fontSize: '14px', fontWeight: 'bold' as const, cursor: 'pointer', backgroundColor: bg, color: col }),
    th: { backgroundColor: '#1565c0', color: 'white', padding: '8px 10px', textAlign: 'left' as const, fontSize: '12px', whiteSpace: 'nowrap' as const },
    td: { padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontSize: '12px', verticalAlign: 'middle' as const },
    infoBox: (bg: string, border: string, text: string) => ({
      backgroundColor: bg, padding: '10px 14px', borderRadius: '6px',
      borderLeft: `4px solid ${border}`, marginBottom: '10px', fontSize: '12px', color: text,
    }),
  };

  const catAtual = getCat(novoRegistro.tipo);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      {/* Cabeçalho */}
      <div style={{ backgroundColor: '#1565c0', color: 'white', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate(-1)} style={{ padding: '7px 12px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>← Voltar</button>
          <h1 style={{ margin: 0, fontSize: '20px' }}>📋 Registro de Saídas</h1>
        </div>
        <button onClick={logout} style={{ padding: '7px 12px', backgroundColor: '#e53935', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🚪 Sair</button>
      </div>

      <div style={{ flex: 1, padding: '20px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {(['novo', 'movimentos'] as const).map(aba => (
            <button key={aba} onClick={() => setAbaSelecionada(aba)} style={{
              padding: '10px 20px', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer',
              backgroundColor: abaSelecionada === aba ? '#1565c0' : '#e0e0e0',
              color: abaSelecionada === aba ? 'white' : '#333',
            }}>
              {aba === 'novo' ? '➕ Novo Registro' : '📊 Movimentos'}
            </button>
          ))}
        </div>

        {/* ════════ ABA: NOVO REGISTRO ════════ */}
        {abaSelecionada === 'novo' && (
          <>
            {/* Navegação de data */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 'bold', color: '#333' }}>📅 Data do lançamento:</span>
              <button onClick={() => handleMudarData(-1)} style={s.btn('#607d8b')}>◀ Anterior</button>
              <input type="date" value={dataSelecionada} onChange={e => setDataSelecionada(e.target.value)}
                style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }} />
              <button onClick={() => handleMudarData(1)} style={s.btn('#607d8b')}>Próximo ▶</button>
              <button onClick={() => setDataSelecionada(getLocalDate())} style={s.btn('#43a047')}>Hoje</button>
            </div>

            {/* Painel de nova saída */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

              {/* Formulário */}
              <div style={s.card}>
                <h3 style={{ marginTop: 0, color: '#1565c0' }}>➕ Nova Saída — {fmtDataBR(dataSelecionada)}</h3>
                <div style={{ display: 'grid', gap: '12px' }}>

                  <div>
                    <label style={s.label}>Responsável:</label>
                    <input type="text" value={email} disabled style={{ ...s.input, backgroundColor: '#f5f5f5', cursor: 'not-allowed' }} />
                  </div>

                  <div>
                    <label style={s.label}>Colaborador: *</label>
                    <select value={novoRegistro.colaboradorId}
                      onChange={e => setNovoRegistro({ ...novoRegistro, colaboradorId: e.target.value })}
                      style={s.select}>
                      <option value="">Selecione um colaborador</option>
                      {colaboradores.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.nome} {c.tipoContrato ? `(${c.tipoContrato})` : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={s.label}>Categoria / Tipo: *</label>
                    <select value={novoRegistro.tipo}
                      onChange={e => setNovoRegistro({ ...novoRegistro, tipo: e.target.value, origem: e.target.value })}
                      style={s.select}>
                      <optgroup label="── Pagamentos ao Colaborador ──">
                        {CATEGORIAS.filter(c => c.grupo === 'colaborador').map(c => (
                          <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="── Caixa / Operacional ──">
                        {CATEGORIAS.filter(c => c.grupo === 'caixa').map(c => (
                          <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                        ))}
                      </optgroup>
                    </select>
                    {/* Hint contextual */}
                    <div style={s.infoBox(catAtual.bg, catAtual.border, catAtual.text)}>
                      <strong>{catAtual.emoji} {catAtual.label}</strong>
                      {catAtual.regraFolha && (
                        <span style={{ marginLeft: '6px', padding: '1px 6px', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '8px', fontSize: '10px' }}>
                          🔗 Regra automática na folha
                        </span>
                      )}
                      <br /><span style={{ fontSize: '11px', marginTop: '4px', display: 'block' }}>{catAtual.hint}</span>
                    </div>
                  </div>

                  <div>
                    <label style={s.label}>Descrição: *</label>
                    <input type="text" placeholder="Ex: Semana 14/04, uniforme, adiantamento…"
                      value={novoRegistro.descricao}
                      onChange={e => setNovoRegistro({ ...novoRegistro, descricao: e.target.value })}
                      style={s.input} />
                  </div>

                  <div>
                    <label style={s.label}>Valor (R$): *</label>
                    <input type="number" step="0.01" min="0" placeholder="0.00"
                      value={novoRegistro.valor || ''}
                      onChange={e => setNovoRegistro({ ...novoRegistro, valor: parseFloat(e.target.value) || 0 })}
                      style={s.input} />
                    <small style={{ color: '#888' }}>Sempre positivo — a direção é definida pela categoria.</small>
                  </div>

                  <div>
                    <label style={s.label}>Data de pagamento/competência:</label>
                    <input type="date" value={novoRegistro.dataPagamento || dataSelecionada}
                      onChange={e => setNovoRegistro({ ...novoRegistro, dataPagamento: e.target.value })}
                      style={s.input} />
                    <small style={{ color: '#888' }}>
                      Usada para cruzamento com semanas na Folha de Pagamento.
                      {catAtual.regraFolha === 'abate_transporte' && ' Deve estar dentro da semana de dobras para abater o transporte.'}
                      {catAtual.regraFolha === 'abate_especial' && ' Deve estar dentro da semana/parcela em que o desconto do adiantamento especial será abatido.'}
                    </small>
                  </div>

                  <div>
                    <label style={s.label}>Observação:</label>
                    <input type="text" placeholder="Informação adicional (opcional)"
                      value={novoRegistro.observacao}
                      onChange={e => setNovoRegistro({ ...novoRegistro, observacao: e.target.value })}
                      style={s.input} />
                  </div>

                  <button onClick={handleSalvarNovoRegistro} style={{ ...s.btn('#43a047'), padding: '12px', fontSize: '15px' }}>
                    💾 Salvar Saída
                  </button>
                </div>
              </div>

              {/* Legenda de categorias */}
              <div style={s.card}>
                <h3 style={{ marginTop: 0, color: '#1565c0' }}>📖 Guia de Categorias</h3>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {CATEGORIAS.map(cat => (
                    <div key={cat.value} style={{
                      padding: '10px 12px', borderRadius: '6px',
                      backgroundColor: cat.bg, border: `1px solid ${cat.border}`,
                      cursor: 'pointer', transition: 'opacity 0.15s',
                      opacity: novoRegistro.tipo === cat.value ? 1 : 0.7,
                      outline: novoRegistro.tipo === cat.value ? `2px solid ${cat.border}` : 'none',
                    }}
                      onClick={() => setNovoRegistro({ ...novoRegistro, tipo: cat.value, origem: cat.value })}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: 'bold', color: cat.text, fontSize: '13px' }}>{cat.emoji} {cat.label}</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.1)', color: cat.text }}>
                            {cat.dir === 'saida' ? '−' : cat.dir === 'entrada' ? '+' : '±'}
                          </span>
                          {cat.regraFolha && (
                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.15)', color: cat.text }}>
                              🔗 folha
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: cat.text, marginTop: '3px', opacity: 0.85 }}>{cat.hint}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ════════ ABA: MOVIMENTOS ════════ */}
        {abaSelecionada === 'movimentos' && (
          <>
            {/* Filtros */}
            <div style={{ ...s.card, marginBottom: '14px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ minWidth: '150px' }}>
                <label style={s.label}>Período:</label>
                <select value={movDateFilter} onChange={e => setMovDateFilter(e.target.value)} style={s.select}>
                  <option value="hoje">Hoje</option>
                  <option value="semana-atual">Esta semana</option>
                  <option value="mes-atual">Este mês</option>
                  <option value="mes-anterior">Mês anterior</option>
                  <option value="customizado">Customizado</option>
                </select>
              </div>
              {movDateFilter === 'customizado' && (
                <>
                  <div>
                    <label style={s.label}>De:</label>
                    <input type="date" value={movDataInicio} onChange={e => setMovDataInicio(e.target.value)} style={{ ...s.input, width: '140px' }} />
                  </div>
                  <div>
                    <label style={s.label}>Até:</label>
                    <input type="date" value={movDataFim} onChange={e => setMovDataFim(e.target.value)} style={{ ...s.input, width: '140px' }} />
                  </div>
                </>
              )}
              <div style={{ minWidth: '160px' }}>
                <label style={s.label}>Colaborador:</label>
                <select value={movColaborador} onChange={e => setMovColaborador(e.target.value)} style={s.select}>
                  <option value="">Todos</option>
                  {colaboradores.map((c: any) => <option key={c.id} value={c.nome || c.email}>{c.nome}</option>)}
                </select>
              </div>
              <div style={{ minWidth: '140px' }}>
                <label style={s.label}>Grupo:</label>
                <select value={movGrupo} onChange={e => setMovGrupo(e.target.value as any)} style={s.select}>
                  <option value="todos">Todos</option>
                  <option value="colaborador">👤 Colaborador</option>
                  <option value="caixa">🏦 Caixa</option>
                </select>
              </div>
              <div style={{ minWidth: '160px' }}>
                <label style={s.label}>Categoria:</label>
                <select value={movTipo} onChange={e => setMovTipo(e.target.value)} style={s.select}>
                  <option value="">Todas</option>
                  {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
                </select>
              </div>
              <button style={s.btn('#1976d2')} onClick={handleFiltrar} disabled={movLoading}>
                {movLoading ? '⏳ Carregando...' : '🔍 Filtrar'}
              </button>
              <button style={s.btn('#7b1fa2')} onClick={exportarXLSX} disabled={movRegistros.length === 0}>📥 XLSX</button>
            </div>

            {/* Cards resumo */}
            {movRegistros.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ ...s.card, borderLeft: '4px solid #1565c0', minWidth: '120px' }}>
                  <div style={{ fontSize: '11px', color: '#666' }}>Total registros</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1565c0' }}>{movRegistros.length}</div>
                </div>
                <div style={{ ...s.card, borderLeft: '4px solid #c62828', minWidth: '140px' }}>
                  <div style={{ fontSize: '11px', color: '#666' }}>Total saídas (−)</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#c62828' }}>R$ {totalAPagar.toFixed(2)}</div>
                </div>
                {totalAReceber > 0 && (
                  <div style={{ ...s.card, borderLeft: '4px solid #2e7d32', minWidth: '140px' }}>
                    <div style={{ fontSize: '11px', color: '#666' }}>A receber (+)</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2e7d32' }}>R$ {totalAReceber.toFixed(2)}</div>
                  </div>
                )}
                {/* Por categoria */}
                {Object.entries(totaisPorCat).filter(([, v]) => (v as number) > 0).map(([tipo, val]) => {
                  const cat = getCat(tipo);
                  return (
                    <div key={tipo} style={{ ...s.card, borderLeft: `4px solid ${cat.border}`, minWidth: '140px' }}>
                      <div style={{ fontSize: '11px', color: '#666' }}>{cat.emoji} {cat.label}</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: cat.text }}>R$ {(val as number).toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tabela */}
            <div style={{ ...s.card, overflowX: 'auto' }}>
              <h3 style={{ marginTop: 0, color: '#1565c0' }}>📋 {movRegistros.length} registro(s)</h3>
              {movRegistros.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '30px' }}>
                  {movLoading ? 'Carregando...' : 'Use os filtros acima e clique em "🔍 Filtrar" para carregar os registros.'}
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      {['Data', 'Dt. Pgto', 'Colaborador', 'Categoria', 'Descrição', 'Valor', 'Responsável', 'Obs', 'Ações'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movRegistros.map((r, idx) => {
                      const tipo = r.tipo || r.origem || r.referencia || '-';
                      const cat = getCat(tipo);
                      return (
                        <tr key={r.id || idx}
                          style={{ backgroundColor: idx % 2 === 0 ? '#fafafa' : 'white' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e8f0fe')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fafafa' : 'white')}>
                          <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '11px' }}>{fmtDataBR(r.data)}</td>
                          <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '11px', color: '#666' }}>{fmtDataBR(r.dataPagamento || r.data)}</td>
                          <td style={{ ...s.td, fontWeight: 'bold' }}>{r.colaborador || r.favorecido || r.colaboradorNome || '-'}</td>
                          <td style={s.td}>
                            <span style={{ backgroundColor: cat.bg, color: cat.text, border: `1px solid ${cat.border}`, padding: '2px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                              {cat.emoji} {tipo}
                            </span>
                            {cat.regraFolha && <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>🔗 {cat.regraFolha}</div>}
                          </td>
                          <td style={{ ...s.td, maxWidth: '160px', color: '#444' }}>{r.descricao || '-'}</td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', color: cat.dir === 'entrada' ? '#2e7d32' : '#c62828' }}>
                            {cat.dir === 'entrada' ? '+' : '−'} R$ {toNum(r.valor).toFixed(2)}
                          </td>
                          <td style={{ ...s.td, fontSize: '11px', color: '#666' }}>{r.responsavelNome || r.responsavel || '-'}</td>
                          <td style={{ ...s.td, fontSize: '10px', color: '#888', maxWidth: '100px' }}>{r.observacao || '—'}</td>
                          <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                            <button onClick={() => setRegistroEditando({ ...r, tipo: r.tipo || r.origem || r.referencia || 'A pagar' })}
                              style={{ padding: '4px 8px', backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px', fontSize: '11px' }}>
                              ✏️
                            </button>
                            <button onClick={() => handleDeletar(r.id)}
                              style={{ padding: '4px 8px', backgroundColor: '#e53935', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#1565c0', color: 'white', fontWeight: 'bold' }}>
                      <td colSpan={5} style={{ padding: '8px 10px' }}>TOTAL ({movRegistros.length} registros)</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '13px' }}>R$ {totalMovimentos.toFixed(2)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </>
        )}

        {/* ════════ MODAL DE EDIÇÃO ════════ */}
        {registroEditando && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ ...s.card, maxWidth: '540px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: '#1565c0' }}>✏️ Editar Saída</h3>
                <button onClick={() => setRegistroEditando(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={s.label}>Responsável:</label>
                  <input type="text" value={registroEditando.responsavelNome || registroEditando.responsavel || ''} disabled
                    style={{ ...s.input, backgroundColor: '#f5f5f5', cursor: 'not-allowed' }} />
                </div>
                <div>
                  <label style={s.label}>Colaborador:</label>
                  <select value={registroEditando.colaboradorId || ''}
                    onChange={e => setRegistroEditando({ ...registroEditando, colaboradorId: e.target.value })}
                    style={s.select}>
                    <option value="">Selecione</option>
                    {colaboradores.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Categoria / Tipo:</label>
                  <select value={registroEditando.tipo || registroEditando.origem || 'A pagar'}
                    onChange={e => setRegistroEditando({ ...registroEditando, tipo: e.target.value, origem: e.target.value, referencia: e.target.value })}
                    style={s.select}>
                    <optgroup label="── Pagamentos ao Colaborador ──">
                      {CATEGORIAS.filter(c => c.grupo === 'colaborador').map(c => (
                        <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="── Caixa / Operacional ──">
                      {CATEGORIAS.filter(c => c.grupo === 'caixa').map(c => (
                        <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label style={s.label}>Descrição:</label>
                  <input type="text" value={registroEditando.descricao || ''}
                    onChange={e => setRegistroEditando({ ...registroEditando, descricao: e.target.value })}
                    style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Valor (R$):</label>
                  <input type="number" step="0.01" min="0" value={registroEditando.valor || 0}
                    onChange={e => setRegistroEditando({ ...registroEditando, valor: parseFloat(e.target.value) || 0 })}
                    style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Data do lançamento:</label>
                  <input type="date" value={registroEditando.data || ''}
                    onChange={e => setRegistroEditando({ ...registroEditando, data: e.target.value })}
                    style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Data de pagamento/competência:</label>
                  <input type="date" value={registroEditando.dataPagamento || registroEditando.data || ''}
                    onChange={e => setRegistroEditando({ ...registroEditando, dataPagamento: e.target.value })}
                    style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Observação:</label>
                  <input type="text" value={registroEditando.observacao || ''}
                    onChange={e => setRegistroEditando({ ...registroEditando, observacao: e.target.value })}
                    style={s.input} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleSalvarEdicao} style={{ ...s.btn('#43a047'), flex: 2 }}>💾 Salvar</button>
                  <button onClick={() => setRegistroEditando(null)} style={{ ...s.btn('#9e9e9e'), flex: 1 }}>✕ Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
      <Footer />
    </div>
  );
};

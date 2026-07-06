import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';
import { fetchAuth, authHeaders } from '../utils/fetchAuth';

/* ════════════════════════════════════════════════════════════════════════════════
   ConferenciaFolha — Grid editável com TODAS as rubricas do holerite
   ════════════════════════════════════════════════════════════════════════════════
   Mostra cada colaborador CLT com as rubricas importadas da contabilidade,
   permitindo ajustar qualquer valor antes de aprovar para pagamento.
*/

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Rubrica {
  codigo: string;
  descricao: string;
  referencia: string;
  vencimento: number;
  desconto: number;
}

interface FolhaRow {
  colaboradorId: string;
  nome: string;
  cargo: string;
  // Dados contábeis
  salarioBase: number;
  salContrInss: number;
  inssValor: number;
  valeTransporteContabil: number;
  feriado: number;
  valorLiquidoContabil: number;
  totalVencimentos: number;
  totalDescontos: number;
  rubricas: Rubrica[];
  // Rubricas editáveis (cópia para edição)
  editRubricas: Rubrica[];
  // Meta
  folhaId?: string;
  mes: string;
  contabImportado: boolean;
  pago: boolean;
  conferido: boolean;
  obsEMS?: string;
}

export default function ConferenciaFolha() {
  const { user } = useAuth() as any;
  const { activeUnit } = useUnit();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const unitName = activeUnit?.nome || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT;
  const token = () => localStorage.getItem('auth_token') || '';

  const [mesAno, setMesAno] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rows, setRows] = useState<FolhaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  // Célula em edição
  const [editCell, setEditCell] = useState<{ colabId: string; rubIdx: number; field: 'vencimento' | 'desconto' } | null>(null);
  const [editBuffer, setEditBuffer] = useState('');

  // ──────────────────────────────────────────────────────────────────────────
  // Carregar dados
  // ──────────────────────────────────────────────────────────────────────────
  const carregarDados = async () => {
    if (!unitId) return;
    setLoading(true);
    setMensagem('');
    try {
      const auth = authHeaders();
      const [rColab, rFolha] = await Promise.all([
        fetchAuth(`${apiUrl}/colaboradores?unitId=${unitId}`, auth),
        fetchAuth(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mesAno}`, auth),
      ]);

      const colabs = rColab.ok ? await rColab.json() : [];
      const folhas = rFolha.ok ? await rFolha.json() : [];

      const cltColabs = (Array.isArray(colabs) ? colabs : [])
        .filter((c: any) => c.ativo !== false && (c.tipoContrato === 'CLT' || c.tipoContrato === 'clt'));

      // Mapear folha por colaboradorId (pegar o registro mensal, não os diários)
      const folhaMap = new Map<string, any>();
      (Array.isArray(folhas) ? folhas : []).forEach((f: any) => {
        if (f.mes === mesAno && f.id && !f.id.includes('_2026-') || f.id?.match(/^col-[^_]+_\d{4}-\d{2}$/)) {
          // Registro mensal: id = col-xxx_2026-06
          folhaMap.set(f.colaboradorId, f);
        }
      });
      // Fallback: se não pegou pelo padrão, pegar qualquer que tenha rubricas
      (Array.isArray(folhas) ? folhas : []).forEach((f: any) => {
        if (f.mes === mesAno && f.rubricas && !folhaMap.has(f.colaboradorId)) {
          folhaMap.set(f.colaboradorId, f);
        }
      });

      const newRows: FolhaRow[] = cltColabs.map((c: any) => {
        const f = folhaMap.get(c.id);
        const hasContab = f && f.valorLiquidoContabil != null;
        const rubricas: Rubrica[] = (f?.rubricas || []).map((r: any) => ({
          codigo: r.codigo || '',
          descricao: r.descricao || '',
          referencia: r.referencia || '',
          vencimento: parseFloat(r.vencimento) || 0,
          desconto: parseFloat(r.desconto) || 0,
        }));

        return {
          colaboradorId: c.id,
          nome: c.nome,
          cargo: c.cargo || c.funcao || '—',
          salarioBase: f?.valorBruto || parseFloat(c.salarioBase || c.salario || 0),
          salContrInss: f?.salContrInss || 0,
          inssValor: f?.inssValor || 0,
          valeTransporteContabil: f?.valeTransporteContabil || 0,
          feriado: f?.feriado || 0,
          valorLiquidoContabil: f?.valorLiquidoContabil || 0,
          totalVencimentos: f?.totalVencimentos || 0,
          totalDescontos: f?.totalDescontos || 0,
          rubricas,
          editRubricas: rubricas.map(r => ({ ...r })),
          folhaId: f?.id,
          mes: mesAno,
          contabImportado: hasContab,
          pago: f?.pago === true,
          conferido: f?.conferido === true,
          obsEMS: f?.obsEMS,
        };
      }).sort((a, b) => a.nome.localeCompare(b.nome));

      setRows(newRows);
    } catch (err: any) {
      setMensagem(`❌ Erro ao carregar dados: ${err.message}`);
    }
    setLoading(false);
  };

  useEffect(() => { carregarDados(); }, [activeUnit, mesAno]);

  // ──────────────────────────────────────────────────────────────────────────
  // Edição inline de rubrica
  // ──────────────────────────────────────────────────────────────────────────
  const startEdit = (colabId: string, rubIdx: number, field: 'vencimento' | 'desconto', value: number) => {
    setEditCell({ colabId, rubIdx, field });
    setEditBuffer(value.toFixed(2).replace('.', ','));
  };

  const commitEdit = () => {
    if (!editCell) return;
    const parsed = parseFloat(editBuffer.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) { setEditCell(null); return; }
    setRows(prev => prev.map(r => {
      if (r.colaboradorId !== editCell.colabId) return r;
      const newRubricas = r.editRubricas.map((rub, idx) => {
        if (idx !== editCell.rubIdx) return rub;
        return { ...rub, [editCell.field]: parsed };
      });
      return { ...r, editRubricas: newRubricas };
    }));
    setEditCell(null);
  };

  const cancelEdit = () => setEditCell(null);

  const resetRow = (colabId: string) => {
    setRows(prev => prev.map(r => {
      if (r.colaboradorId !== colabId) return r;
      return { ...r, editRubricas: r.rubricas.map(rub => ({ ...rub })) };
    }));
  };

  // Calcular líquido a partir das rubricas editadas
  const calcLiquido = (editRubricas: Rubrica[]) => {
    const totVenc = editRubricas.reduce((s, r) => s + r.vencimento, 0);
    const totDesc = editRubricas.reduce((s, r) => s + r.desconto, 0);
    return totVenc - totDesc;
  };

  const hasEdits = (row: FolhaRow) => {
    return row.editRubricas.some((er, i) => {
      const orig = row.rubricas[i];
      if (!orig) return true;
      return er.vencimento !== orig.vencimento || er.desconto !== orig.desconto;
    });
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Aprovar para pagamento
  // ──────────────────────────────────────────────────────────────────────────
  const aprovarTodos = async () => {
    setSalvando(true);
    setMensagem('');
    const elegíveis = rows.filter(r => !r.pago && r.contabImportado);
    let ok = 0;
    const falhas: string[] = [];

    for (const row of elegíveis) {
      try {
        const body = {
          colaboradorId: row.colaboradorId,
          mes: mesAno,
          unitId,
          valorBruto: row.salarioBase,
          valorLiquidoContabil: calcLiquido(row.editRubricas),
          inssValor: row.editRubricas.find(r => /INSS/i.test(r.descricao))?.desconto || row.inssValor,
          valeTransporte: row.editRubricas.find(r => /Vale Transp/i.test(r.descricao))?.desconto || row.valeTransporteContabil,
          feriado: row.editRubricas.find(r => /Feriado/i.test(r.descricao))?.vencimento || row.feriado,
          rubricas: row.editRubricas,
          totalVencimentos: row.editRubricas.reduce((s, r) => s + r.vencimento, 0),
          totalDescontos: row.editRubricas.reduce((s, r) => s + r.desconto, 0),
          conferido: true,
          conferidoPor: (user as any)?.email || 'conferencia-folha',
          conferidoEm: new Date().toISOString(),
          mergeMode: 'contabil',
        };
        const res = await fetchAuth(`${apiUrl}/folha-pagamento`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        ok++;
      } catch (e: any) {
        falhas.push(`${row.nome}: ${e.message}`);
      }
    }

    if (falhas.length) {
      setMensagem(`⚠️ Aprovados ${ok}/${elegíveis.length}. Falhas: ${falhas.join(' | ')}`);
    } else {
      setMensagem(`✅ ${ok} colaborador(es) aprovados com rubricas conferidas para ${mesAno}.`);
    }
    await carregarDados();
    setSalvando(false);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Resumo
  // ──────────────────────────────────────────────────────────────────────────
  const resumo = useMemo(() => {
    const total = rows.length;
    const importados = rows.filter(r => r.contabImportado).length;
    const pagos = rows.filter(r => r.pago).length;
    const conferidos = rows.filter(r => r.conferido).length;
    const editados = rows.filter(r => hasEdits(r)).length;
    const totalLiquido = rows.reduce((s, r) => s + (r.contabImportado ? calcLiquido(r.editRubricas) : 0), 0);
    const pendentes = rows.filter(r => r.contabImportado && !r.pago).length;
    return { total, importados, pagos, conferidos, editados, totalLiquido, pendentes };
  }, [rows]);

  // ──────────────────────────────────────────────────────────────────────────
  // Render célula editável
  // ──────────────────────────────────────────────────────────────────────────
  const renderEditableCell = (
    colabId: string, rubIdx: number, field: 'vencimento' | 'desconto', value: number,
    origValue: number, disabled: boolean, color?: string
  ) => {
    const isActive = editCell?.colabId === colabId && editCell?.rubIdx === rubIdx && editCell?.field === field;
    const edited = value !== origValue;

    if (isActive) {
      return (
        <input autoFocus type="text" value={editBuffer}
          onChange={e => setEditBuffer(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
          style={{ width: 85, padding: '3px 5px', fontSize: 12, textAlign: 'right', border: '2px solid #1565c0', borderRadius: 3, outline: 'none', backgroundColor: '#e3f2fd' }}
        />
      );
    }

    if (value === 0) return <span style={{ color: '#bdbdbd' }}>—</span>;

    return (
      <span
        onClick={() => !disabled && startEdit(colabId, rubIdx, field, value)}
        title={edited ? `Original: ${fmtMoeda(origValue)}` : 'Clique para editar'}
        style={{
          cursor: disabled ? 'default' : 'pointer',
          color: edited ? '#e65100' : (color || '#37474f'),
          fontWeight: edited ? 700 : 400,
          backgroundColor: edited ? '#fff3e0' : 'transparent',
          padding: edited ? '1px 4px' : undefined,
          borderRadius: edited ? 3 : undefined,
          borderBottom: disabled ? 'none' : '1px dashed #bdbdbd',
          display: 'inline-block',
          fontSize: 12,
        }}
      >
        {fmtMoeda(value)}
      </span>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Status badge
  // ──────────────────────────────────────────────────────────────────────────
  const statusBadge = (row: FolhaRow) => {
    if (row.pago) return { label: '✅ Pago', bg: '#e8f5e9', fg: '#2e7d32' };
    if (row.conferido) return { label: '🔒 Conferido', bg: '#e3f2fd', fg: '#1565c0' };
    if (row.contabImportado) return { label: '📥 Importado', bg: '#fff8e1', fg: '#ef6c00' };
    return { label: '⚠️ Sem dados', bg: '#ffebee', fg: '#c62828' };
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>📋 Conferência da Folha de Pagamento</h1>
      <p style={{ color: '#546e7a', marginBottom: 16, fontSize: 14 }}>
        Revise todas as rubricas do holerite de cada colaborador CLT. Clique em qualquer valor para ajustar antes de aprovar.
      </p>

      {/* Controles */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 600 }}>Mês/Ano:</label>
        <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }} />
        <button onClick={carregarDados} disabled={loading}
          style={{ padding: '8px 16px', borderRadius: 6, border: 'none', backgroundColor: '#1565c0', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
          {loading ? '⏳ Carregando...' : '🔄 Atualizar'}
        </button>
        <span style={{ color: '#78909c', fontSize: 13 }}>Unidade: <strong>{unitName}</strong></span>
      </div>

      {/* Mensagem */}
      {mensagem && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14,
          backgroundColor: mensagem.includes('✅') ? '#e8f5e9' : '#ffebee',
          color: mensagem.includes('✅') ? '#2e7d32' : '#c62828',
          border: `1px solid ${mensagem.includes('✅') ? '#a5d6a7' : '#ef9a9a'}`,
        }}>{mensagem}</div>
      )}

      {/* Resumo */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { label: `CLT: ${resumo.total}`, bg: '#e3f2fd', fg: '#1565c0' },
          { label: `Importados: ${resumo.importados}`, bg: '#fff8e1', fg: '#ef6c00' },
          { label: `Pagos: ${resumo.pagos}`, bg: '#e8f5e9', fg: '#2e7d32' },
          { label: `Pendentes: ${resumo.pendentes}`, bg: '#ffebee', fg: '#c62828' },
          ...(resumo.editados > 0 ? [{ label: `✏️ Editados: ${resumo.editados}`, bg: '#fff3e0', fg: '#e65100' }] : []),
          { label: `Total Líquido: ${fmtMoeda(resumo.totalLiquido)}`, bg: '#f3e5f5', fg: '#6a1b9a' },
        ].map((p, i) => (
          <span key={i} style={{ padding: '6px 14px', borderRadius: 20, backgroundColor: p.bg, color: p.fg, fontSize: 13, fontWeight: 600 }}>{p.label}</span>
        ))}
      </div>

      {/* Dica */}
      <div style={{ fontSize: 12, color: '#78909c', marginBottom: 12 }}>
        💡 Clique em qualquer valor monetário para ajustar. Valores editados ficam em <span style={{ color: '#e65100', fontWeight: 700 }}>laranja</span>.
        O Líquido é recalculado automaticamente (Total Vencimentos – Total Descontos).
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={aprovarTodos} disabled={salvando || resumo.pendentes === 0}
          style={{ padding: '10px 20px', borderRadius: 8, border: 'none', backgroundColor: '#2e7d32', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          {salvando ? '⏳ Salvando...' : `✅ Aprovar ${resumo.pendentes} pendente(s) para pagamento`}
        </button>
      </div>

      {/* Cards de colaboradores */}
      {rows.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#90a4ae' }}>
          Nenhum colaborador CLT encontrado para {mesAno}. Verifique se os dados foram importados no módulo Importações Contábeis.
        </div>
      )}

      {rows.map(row => {
        const st = statusBadge(row);
        const edited = hasEdits(row);
        const editTotalVenc = row.editRubricas.reduce((s, r) => s + r.vencimento, 0);
        const editTotalDesc = row.editRubricas.reduce((s, r) => s + r.desconto, 0);
        const editLiquido = editTotalVenc - editTotalDesc;
        const origLiquido = row.valorLiquidoContabil;
        const diffLiquido = editLiquido - origLiquido;

        return (
          <div key={row.colaboradorId} style={{
            marginBottom: 20, borderRadius: 10,
            border: `1px solid ${row.pago ? '#c8e6c9' : (edited ? '#ffe0b2' : '#e0e0e0')}`,
            backgroundColor: row.pago ? '#fafafa' : '#fff',
            opacity: row.pago ? 0.65 : 1,
          }}>
            {/* Header do colaborador */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', backgroundColor: '#263238', color: '#fff', borderRadius: '10px 10px 0 0',
            }}>
              <div>
                <strong style={{ fontSize: 15 }}>{row.nome}</strong>
                <span style={{ marginLeft: 12, fontSize: 12, color: '#b0bec5' }}>{row.cargo}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ padding: '3px 10px', borderRadius: 12, backgroundColor: st.bg, color: st.fg, fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                {edited && (
                  <button onClick={() => resetRow(row.colaboradorId)} title="Resetar valores originais"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#fff' }}>↩️</button>
                )}
              </div>
            </div>

            {!row.contabImportado ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#90a4ae', fontSize: 13 }}>
                Dados contábeis não importados para este mês. Importe o PDF no módulo Importações Contábeis.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#eceff1' }}>
                      <th style={th}>Cód.</th>
                      <th style={{ ...th, textAlign: 'left', minWidth: 200 }}>Descrição</th>
                      <th style={th}>Ref.</th>
                      <th style={{ ...th, color: '#2e7d32' }}>Vencimentos ✏️</th>
                      <th style={{ ...th, color: '#c62828' }}>Descontos ✏️</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.editRubricas.map((rub, idx) => {
                      const orig = row.rubricas[idx] || { vencimento: 0, desconto: 0 };
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f5f5f5' }}>
                          <td style={{ ...td, color: '#78909c', fontFamily: 'monospace' }}>{rub.codigo}</td>
                          <td style={{ ...td, fontWeight: 500 }}>{rub.descricao}</td>
                          <td style={{ ...td, color: '#78909c', textAlign: 'center' }}>{rub.referencia || '—'}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            {renderEditableCell(row.colaboradorId, idx, 'vencimento', rub.vencimento, orig.vencimento, row.pago, '#2e7d32')}
                          </td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            {renderEditableCell(row.colaboradorId, idx, 'desconto', rub.desconto, orig.desconto, row.pago, '#c62828')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#e8eaf6', fontWeight: 700 }}>
                      <td style={td} colSpan={3}>Total Vencimentos / Descontos</td>
                      <td style={{ ...td, textAlign: 'right', color: '#2e7d32' }}>{fmtMoeda(editTotalVenc)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#c62828' }}>{fmtMoeda(editTotalDesc)}</td>
                    </tr>
                    <tr style={{ backgroundColor: '#e8f5e9', fontWeight: 700, fontSize: 14 }}>
                      <td style={td} colSpan={3}>
                        Líquido
                        {diffLiquido !== 0 && row.contabImportado && (
                          <span style={{ marginLeft: 12, fontSize: 11, fontWeight: 400, color: diffLiquido > 0 ? '#2e7d32' : '#c62828' }}>
                            ({diffLiquido > 0 ? '+' : ''}{fmtMoeda(diffLiquido)} vs original)
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontSize: 15 }} colSpan={2}>
                        {fmtMoeda(editLiquido)}
                      </td>
                    </tr>
                    {row.salContrInss > 0 && (
                      <tr style={{ backgroundColor: '#f5f5f5', fontSize: 11, color: '#78909c' }}>
                        <td style={td} colSpan={5}>
                          Sal.Contr.INSS: {fmtMoeda(row.salContrInss)} | Sal.Base: {fmtMoeda(row.salarioBase)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: '#455a64' };
const td: React.CSSProperties = { padding: '6px 10px', whiteSpace: 'nowrap' };

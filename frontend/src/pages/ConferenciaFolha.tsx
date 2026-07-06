import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';
import { fetchAuth, authHeaders } from '../utils/fetchAuth';

/* ════════════════════════════════════════════════════════════════════════════════
   ConferenciaFolha — Grid editável para conferência de valores antes do pagamento
   ════════════════════════════════════════════════════════════════════════════════
   Mostra todos os colaboradores CLT do mês com:
   - Valores importados da contabilidade (EMS) 
   - Valores calculados pelo sistema (GIRES)
   - Possibilidade de ajustar qualquer valor antes de "Aprovar para pagamento"
   
   Os valores aprovados aqui são gravados na folha-pagamento como override contábil.
*/

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface FolhaRow {
  colaboradorId: string;
  nome: string;
  cargo: string;
  tipoContrato: string;
  // Valores contábeis (importados do PDF)
  contab_salarioBase: number;
  contab_salContrInss: number;
  contab_inss: number;
  contab_valeTransporte: number;
  contab_feriado: number;
  contab_liquido: number;
  contab_importado: boolean;
  // Valores do sistema (calculados)
  sistema_salarioBase: number;
  sistema_inss: number;
  sistema_valeTransporte: number;
  sistema_liquido: number;
  sistema_temFolha: boolean;
  sistema_pago: boolean;
  // Valores finais (editáveis) — inicializados com contábil se disponível, senão sistema
  final_salarioBase: number;
  final_inss: number;
  final_valeTransporte: number;
  final_liquido: number;
  // Meta
  folhaId?: string;
  mes: string;
  aprovado: boolean;
}

type EditableField = 'final_salarioBase' | 'final_inss' | 'final_valeTransporte' | 'final_liquido';

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

  // Edição inline
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: EditableField } | null>(null);
  const [editBuffer, setEditBuffer] = useState('');

  // ──────────────────────────────────────────────────────────────────────────
  // Carrega dados: colaboradores + folha-pagamento do mês
  // ──────────────────────────────────────────────────────────────────────────
  const carregarDados = async () => {
    console.log('[ConferenciaFolha] carregarDados', { unitId, mesAno, apiUrl });
    if (!unitId) { console.warn('[ConferenciaFolha] unitId vazio, abortando'); return; }
    setLoading(true);
    setMensagem('');
    try {
      const auth = authHeaders();
      console.log('[ConferenciaFolha] auth headers:', JSON.stringify(auth).slice(0,80));
      const [rColab, rFolha] = await Promise.all([
        fetchAuth(`${apiUrl}/colaboradores?unitId=${unitId}`, auth),
        fetchAuth(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${mesAno}`, auth),
      ]);
      console.log('[ConferenciaFolha] rColab status:', rColab.status, 'rFolha status:', rFolha.status);

      const colabs = rColab.ok ? await rColab.json() : [];
      const folhas = rFolha.ok ? await rFolha.json() : [];
      console.log('[ConferenciaFolha] colabs:', colabs.length, 'folhas:', folhas.length);

      const cltColabs = (Array.isArray(colabs) ? colabs : [])
        .filter((c: any) => c.ativo !== false && (c.tipoContrato === 'CLT' || c.tipoContrato === 'clt'));
      console.log('[ConferenciaFolha] cltColabs:', cltColabs.length, cltColabs.map((c:any) => c.nome));

      const folhaMap = new Map<string, any>();
      (Array.isArray(folhas) ? folhas : []).forEach((f: any) => {
        if (f.mes === mesAno) folhaMap.set(f.colaboradorId, f);
      });

      const newRows: FolhaRow[] = cltColabs.map((c: any) => {
        const f = folhaMap.get(c.id);
        const hasContab = f && f.valorLiquidoContabil != null;

        // Valores contábeis
        const contab_salarioBase = f?.valorBruto || 0;
        const contab_salContrInss = f?.salContrInss || 0;
        const contab_inss = f?.inssValor || 0;
        const contab_valeTransporte = f?.valeTransporteContabil || f?.valeTransporte || 0;
        const contab_feriado = f?.feriado || 0;
        const contab_liquido = f?.valorLiquidoContabil || 0;

        // Valores do sistema
        const sistema_salarioBase = parseFloat(c.salarioBase || c.salario || 0);
        const sistema_inss = 0; // seria calculado, mas não temos aqui
        const sistema_valeTransporte = 0;
        const sistema_liquido = f?.saldoFinal || 0;

        // Valores finais — preferência: contábil > sistema > 0
        const final_salarioBase = hasContab ? contab_salarioBase : sistema_salarioBase;
        const final_inss = hasContab ? contab_inss : sistema_inss;
        const final_valeTransporte = hasContab ? contab_valeTransporte : sistema_valeTransporte;
        const final_liquido = hasContab ? contab_liquido : sistema_liquido;

        return {
          colaboradorId: c.id,
          nome: c.nome,
          cargo: c.cargo || c.funcao || '—',
          tipoContrato: c.tipoContrato,
          contab_salarioBase, contab_salContrInss, contab_inss, contab_valeTransporte, contab_feriado, contab_liquido,
          contab_importado: hasContab,
          sistema_salarioBase, sistema_inss, sistema_valeTransporte, sistema_liquido,
          sistema_temFolha: !!f,
          sistema_pago: f?.pago === true,
          final_salarioBase, final_inss, final_valeTransporte, final_liquido,
          folhaId: f?.id,
          mes: mesAno,
          aprovado: f?.conferido === true,
        };
      }).sort((a: FolhaRow, b: FolhaRow) => a.nome.localeCompare(b.nome));

      setRows(newRows);
    } catch (err: any) {
      setMensagem(`❌ Erro ao carregar dados: ${err.message}`);
    }
    setLoading(false);
  };

  useEffect(() => { carregarDados(); }, [activeUnit, mesAno]);

  // ──────────────────────────────────────────────────────────────────────────
  // Edição inline
  // ──────────────────────────────────────────────────────────────────────────
  const startEditing = (rowId: string, field: EditableField, value: number) => {
    setEditingCell({ rowId, field });
    setEditBuffer(value.toFixed(2).replace('.', ','));
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const parsed = parseFloat(editBuffer.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) { setEditingCell(null); return; }
    setRows(prev => prev.map(r => r.colaboradorId !== editingCell.rowId ? r : { ...r, [editingCell.field]: parsed }));
    setEditingCell(null);
  };

  const cancelEdit = () => setEditingCell(null);

  const resetRow = (colabId: string) => {
    setRows(prev => prev.map(r => {
      if (r.colaboradorId !== colabId) return r;
      return {
        ...r,
        final_salarioBase: r.contab_importado ? r.contab_salarioBase : r.sistema_salarioBase,
        final_inss: r.contab_importado ? r.contab_inss : r.sistema_inss,
        final_valeTransporte: r.contab_importado ? r.contab_valeTransporte : r.sistema_valeTransporte,
        final_liquido: r.contab_importado ? r.contab_liquido : r.sistema_liquido,
      };
    }));
  };

  const isEdited = (row: FolhaRow, field: EditableField): boolean => {
    const origField = field.replace('final_', 'contab_') as keyof FolhaRow;
    const sysField = field.replace('final_', 'sistema_') as keyof FolhaRow;
    const origVal = row.contab_importado ? (row[origField] as number) : (row[sysField] as number);
    return (row[field] as number) !== origVal;
  };

  const hasAnyEdit = (row: FolhaRow) =>
    isEdited(row, 'final_salarioBase') || isEdited(row, 'final_inss') ||
    isEdited(row, 'final_valeTransporte') || isEdited(row, 'final_liquido');

  // ──────────────────────────────────────────────────────────────────────────
  // Aprovar / gravar valores na folha-pagamento
  // ──────────────────────────────────────────────────────────────────────────
  const aprovarTodos = async () => {
    setSalvando(true);
    setMensagem('');
    const elegíveis = rows.filter(r => !r.sistema_pago && r.contab_importado);
    let ok = 0;
    const falhas: string[] = [];

    for (const row of elegíveis) {
      try {
        const body = {
          colaboradorId: row.colaboradorId,
          mes: mesAno,
          unitId,
          valorBruto: row.final_salarioBase,
          valorLiquidoContabil: row.final_liquido,
          inssValor: row.final_inss,
          valeTransporte: row.final_valeTransporte,
          conferido: true,
          conferidoPor: (user as any)?.email || 'conferencia-folha',
          conferidoEm: new Date().toISOString(),
        };
        const res = await fetchAuth(`${apiUrl}/folha-pagamento`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(body),
        });
        console.log('[ConferenciaFolha] Aprovação resposta:', res.status);
        if (!res.ok) throw new Error(await res.text());
        ok++;
      } catch (e: any) {
        falhas.push(`${row.nome}: ${e.message}`);
      }
    }

    if (falhas.length) {
      setMensagem(`⚠️ Aprovados ${ok}/${elegíveis.length}. Falhas: ${falhas.join(' | ')}`);
    } else {
      setMensagem(`✅ ${ok} colaborador(es) aprovados para pagamento em ${mesAno}.`);
    }
    await carregarDados();
    setSalvando(false);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Resumo
  // ──────────────────────────────────────────────────────────────────────────
  const resumo = useMemo(() => {
    const total = rows.length;
    const importados = rows.filter(r => r.contab_importado).length;
    const pagos = rows.filter(r => r.sistema_pago).length;
    const aprovados = rows.filter(r => r.aprovado).length;
    const editados = rows.filter(r => hasAnyEdit(r)).length;
    const totalLiquido = rows.reduce((s, r) => s + r.final_liquido, 0);
    const pendentes = rows.filter(r => r.contab_importado && !r.sistema_pago).length;
    return { total, importados, pagos, aprovados, editados, totalLiquido, pendentes };
  }, [rows]);

  // ──────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────────────────────────────────────
  const renderCell = (row: FolhaRow, field: EditableField, color?: string) => {
    const isActive = editingCell?.rowId === row.colaboradorId && editingCell?.field === field;
    const value = row[field] as number;
    const edited = isEdited(row, field);

    if (isActive) {
      return (
        <input autoFocus type="text" value={editBuffer}
          onChange={e => setEditBuffer(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
          style={{ width: 90, padding: '4px 6px', fontSize: 13, textAlign: 'right', border: '2px solid #1565c0', borderRadius: 4, outline: 'none', backgroundColor: '#e3f2fd' }}
        />
      );
    }

    return (
      <span
        onClick={() => !row.sistema_pago && startEditing(row.colaboradorId, field, value)}
        title={edited ? `Original: ${fmtMoeda(row.contab_importado ? (row[field.replace('final_', 'contab_') as keyof FolhaRow] as number) : 0)} — Clique para editar` : 'Clique para editar'}
        style={{
          cursor: row.sistema_pago ? 'default' : 'pointer',
          color: edited ? '#e65100' : (color || '#37474f'),
          fontWeight: edited ? 800 : (field === 'final_liquido' ? 700 : 400),
          backgroundColor: edited ? '#fff3e0' : 'transparent',
          padding: edited ? '2px 6px' : undefined,
          borderRadius: edited ? 4 : undefined,
          borderBottom: row.sistema_pago ? 'none' : '1px dashed #90a4ae',
          display: 'inline-block',
        }}
      >
        {value > 0 ? fmtMoeda(value) : '—'}
      </span>
    );
  };

  const statusBadge = (row: FolhaRow) => {
    if (row.sistema_pago) return { label: '✅ Pago', bg: '#e8f5e9', fg: '#2e7d32' };
    if (row.aprovado) return { label: '🔒 Conferido', bg: '#e3f2fd', fg: '#1565c0' };
    if (row.contab_importado) return { label: '📥 Importado', bg: '#fff8e1', fg: '#ef6c00' };
    return { label: '⚠️ Sem dados', bg: '#ffebee', fg: '#c62828' };
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>📋 Conferência da Folha de Pagamento</h1>
      <p style={{ color: '#546e7a', marginBottom: 16 }}>
        Revise e ajuste os valores dos colaboradores CLT antes de confirmar o pagamento. Clique em qualquer valor para editar.
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
        💡 Clique em qualquer valor monetário na tabela para ajustar. Valores editados ficam em <span style={{ color: '#e65100', fontWeight: 700 }}>laranja</span>.
        Os valores finais (coluna "Valor Final") são os que serão usados no pagamento.
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={aprovarTodos} disabled={salvando || resumo.pendentes === 0}
          style={{ padding: '10px 20px', borderRadius: 8, border: 'none', backgroundColor: '#2e7d32', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          {salvando ? '⏳ Salvando...' : `✅ Aprovar ${resumo.pendentes} pendente(s) para pagamento`}
        </button>
      </div>

      {/* Tabela */}
      {rows.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#90a4ae' }}>
          Nenhum colaborador CLT encontrado para {mesAno}. Verifique se os dados foram importados no módulo Importações Contábeis.
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#263238', color: '#fff' }}>
                <th style={th}>Colaborador</th>
                <th style={th}>Cargo</th>
                <th style={th}>Status</th>
                <th style={{ ...th, backgroundColor: '#1a237e' }}>Sal. Base ✏️</th>
                <th style={{ ...th, backgroundColor: '#1a237e' }}>INSS ✏️</th>
                <th style={{ ...th, backgroundColor: '#1a237e' }}>VT ✏️</th>
                <th style={{ ...th, backgroundColor: '#0d47a1' }}>Líquido Final ✏️</th>
                <th style={th}>Contab. Líq.</th>
                <th style={th}>Diferença</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const st = statusBadge(row);
                const diff = row.contab_importado ? row.final_liquido - row.contab_liquido : 0;
                const edited = hasAnyEdit(row);
                return (
                  <tr key={row.colaboradorId} style={{
                    borderBottom: '1px solid #e0e0e0',
                    backgroundColor: row.sistema_pago ? '#f5f5f5' : (edited ? '#fffde7' : '#fff'),
                    opacity: row.sistema_pago ? 0.6 : 1,
                  }}>
                    <td style={td}><strong>{row.nome}</strong></td>
                    <td style={{ ...td, color: '#546e7a', fontSize: 12 }}>{row.cargo}</td>
                    <td style={td}>
                      <span style={{ padding: '3px 10px', borderRadius: 12, backgroundColor: st.bg, color: st.fg, fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{renderCell(row, 'final_salarioBase')}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{renderCell(row, 'final_inss', '#c62828')}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{renderCell(row, 'final_valeTransporte', '#c62828')}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{renderCell(row, 'final_liquido')}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#78909c' }}>
                      {row.contab_importado ? fmtMoeda(row.contab_liquido) : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: diff === 0 ? '#78909c' : (diff > 0 ? '#2e7d32' : '#c62828') }}>
                      {row.contab_importado ? (diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${fmtMoeda(diff)}`) : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {edited && (
                        <button onClick={() => resetRow(row.colaboradorId)} title="Resetar valores originais"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>↩️</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#eceff1', fontWeight: 700 }}>
                <td style={td} colSpan={6}>Total</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtMoeda(rows.reduce((s, r) => s + r.final_liquido, 0))}</td>
                <td style={{ ...td, textAlign: 'right', color: '#78909c' }}>{fmtMoeda(rows.filter(r => r.contab_importado).reduce((s, r) => s + r.contab_liquido, 0))}</td>
                <td style={td}></td>
                <td style={td}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 8px', textAlign: 'left', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px', whiteSpace: 'nowrap' };

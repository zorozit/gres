import React, { useEffect, useMemo, useState } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { buildDefaultPaymentDate, normalizeName, parsePayrollPdf } from '../utils/payrollImport';
import type { DocumentoFolhaTipo, ImportPayrollParseResult, ImportPayrollRecord } from '../utils/payrollImport';

interface Colaborador {
  id: string;
  nome: string;
  cpf?: string;
  cargo?: string;
  funcao?: string;
  tipoContrato?: string;
  ativo?: boolean;
}

interface PreviewRow extends ImportPayrollRecord {
  colaboradorId?: string;
  nomeSistema?: string;
  matchStatus: 'match' | 'unmatched';
  jaImportado: boolean;
  selecionado: boolean;
}

const fmtMoeda = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const onlyDigits = (value: string) => (value || '').replace(/\D/g, '');

const fmtTipoDocumento = (tipo: DocumentoFolhaTipo) =>
  tipo === 'adiantamento' ? 'Adiantamento dia 20' : 'Folha dia 05';

const tituloImportacao = (tipo: DocumentoFolhaTipo) =>
  tipo === 'adiantamento' ? 'Adiantamento salarial CLT' : 'Folha mensal CLT';

export const ImportacoesContabeis: React.FC = () => {
  const { activeUnit } = useUnit();
  const { user } = useAuth();
  const unitId = activeUnit?.id || localStorage.getItem('unit_id') || '';
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
  const authToken = localStorage.getItem('auth_token') || '';

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [loadingArquivo, setLoadingArquivo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [parseResult, setParseResult] = useState<ImportPayrollParseResult | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState<string>('');

  useEffect(() => {
    if (!unitId || !authToken) return;
    const carregarColaboradores = async () => {
      try {
        const res = await fetch(`${apiUrl}/colaboradores?unitId=${unitId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setColaboradores(Array.isArray(data) ? data.filter((item: Colaborador) => item.ativo !== false) : []);
      } catch (error) {
        console.error(error);
        setMensagem('Não foi possível carregar os colaboradores da unidade.');
      }
    };
    carregarColaboradores();
  }, [apiUrl, authToken, unitId]);

  const cnpjDocumento = onlyDigits(parseResult?.empresaCnpj || '');
  const cnpjUnidade = onlyDigits(unitId || '');
  const unidadeConfere = !cnpjDocumento || !cnpjUnidade || cnpjDocumento === cnpjUnidade;

  const resumo = useMemo(() => {
    const matched = rows.filter((row) => row.matchStatus === 'match').length;
    const unmatched = rows.filter((row) => row.matchStatus === 'unmatched').length;
    const selected = rows.filter((row) => row.selecionado && row.matchStatus === 'match' && !row.jaImportado).length;
    const totalSelecionado = rows
      .filter((row) => row.selecionado && row.matchStatus === 'match' && !row.jaImportado)
      .reduce((sum, row) => sum + row.valorLiquido, 0);
    return { matched, unmatched, selected, totalSelecionado };
  }, [rows]);

  const reconcileRows = async (result: ImportPayrollParseResult) => {
    const normalizedColabs = colaboradores.map((colab) => ({
      ...colab,
      normalizedName: normalizeName(colab.nome || ''),
    }));

    let existingSaidas: any[] = [];
    let existingFolhas: any[] = [];

    try {
      if (result.tipoDocumento === 'adiantamento') {
        const [year, month] = result.competencia.split('-');
        const start = `${year}-${month}-01`;
        const end = `${year}-${month}-31`;
        const response = await fetch(`${apiUrl}/saidas?unitId=${unitId}&dataInicio=${start}&dataFim=${end}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (response.ok) {
          const data = await response.json();
          existingSaidas = Array.isArray(data) ? data : [];
        }
      } else {
        const response = await fetch(`${apiUrl}/folha-pagamento?unitId=${unitId}&mes=${result.competencia}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (response.ok) {
          const data = await response.json();
          existingFolhas = Array.isArray(data) ? data : [];
        }
      }
    } catch (error) {
      console.error(error);
    }

    const previewRows: PreviewRow[] = result.records.map((record) => {
      const normalizedRecordName = normalizeName(record.nomeColaborador);
      const matched = normalizedColabs.find((colab) => colab.normalizedName === normalizedRecordName)
        || normalizedColabs.find((colab) => colab.normalizedName.includes(normalizedRecordName) || normalizedRecordName.includes(colab.normalizedName));

      // Já importado SOMENTE se houver registro previamente importado por este módulo,
      // identificado pela observação gravada por importarFolha/importarAdiantamento + competencia bate.
      // Pagamentos avulsos feitos em outras telas (Folha, Motoboys) NÃO contam como já importado,
      // pois são eventos diferentes (a importação eh do recibo contábil oficial).
      const isObsImport = (s: string) => /Importação EMS/i.test(s || '');
      const jaImportado = result.tipoDocumento === 'adiantamento'
        ? existingSaidas.some((item) =>
            item.colaboradorId === matched?.id
            && (item.tipo || item.origem || item.referencia) === 'Adiantamento Salário'
            && (item.descricao || '').includes(result.competencia)
          )
        : existingFolhas.some((item) =>
            item.colaboradorId === matched?.id
            && (item.mes === result.competencia)
            && isObsImport(item.obs || item.observacao || '')
          );

      return {
        ...record,
        colaboradorId: matched?.id,
        nomeSistema: matched?.nome,
        matchStatus: matched ? 'match' : 'unmatched',
        jaImportado,
        selecionado: Boolean(matched) && !jaImportado,
      };
    });

    setRows(previewRows);
    setPaymentDate(buildDefaultPaymentDate(result.competencia, result.tipoDocumento));
    setWarnings(result.warnings);
  };

  useEffect(() => {
    if (parseResult && colaboradores.length > 0) {
      reconcileRows(parseResult);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaboradores.length]);

  const handleArquivo = async (file?: File | null) => {
    if (!file) return;
    setArquivo(file);
    setMensagem('');
    setLoadingArquivo(true);
    setParseResult(null);
    setRows([]);
    setWarnings([]);

    try {
      const result = await parsePayrollPdf(file);
      setParseResult(result);
      await reconcileRows(result);
    } catch (error: any) {
      console.error(error);
      setMensagem(error?.message || 'Não foi possível ler o PDF enviado.');
    } finally {
      setLoadingArquivo(false);
    }
  };

  const toggleRow = (id: string) => {
    setRows((current) => current.map((row) => (
      row.id === id && row.matchStatus === 'match' && !row.jaImportado
        ? { ...row, selecionado: !row.selecionado }
        : row
    )));
  };

  const marcarTodos = (checked: boolean) => {
    setRows((current) => current.map((row) => (
      row.matchStatus === 'match' && !row.jaImportado
        ? { ...row, selecionado: checked }
        : row
    )));
  };

  const importarAdiantamento = async (row: PreviewRow) => {
    const responsavel = (user as any)?.email || localStorage.getItem('user_email') || 'importacao-contabil';
    const descricao = `Importação EMS ${row.competencia} - Adiantamento Salário`;
    const body = {
      responsavel,
      colaboradorId: row.colaboradorId,
      descricao,
      valor: row.valorLiquido,
      data: paymentDate,
      dataPagamento: paymentDate,
      origem: 'Adiantamento Salário',
      tipo: 'Adiantamento Salário',
      observacao: `Importado do PDF EMS | código ${row.codigoColaborador} | ${row.cargo} | página ${row.pagina}`,
      unitId,
    };

    const response = await fetch(`${apiUrl}/saidas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Falha ao importar ${row.nomeColaborador}`);
    }
  };

  const importarFolha = async (row: PreviewRow) => {
    const body = {
      colaboradorId: row.colaboradorId,
      mes: row.competencia,
      unitId,
      pago: true,
      dataPagamento: paymentDate,
      saldoFinal: row.valorLiquido,
      valorBruto: row.salarioBase,
      totalFinal: row.valorLiquido,
      obs: `Importação EMS folha mensal | código ${row.codigoColaborador} | ${row.cargo} | página ${row.pagina}`,
    };

    const response = await fetch(`${apiUrl}/folha-pagamento`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Falha ao importar ${row.nomeColaborador}`);
    }
  };

  const handleImportar = async () => {
    if (!parseResult) return;
    const selecionados = rows.filter((row) => row.selecionado && row.matchStatus === 'match' && !row.jaImportado);
    if (!unidadeConfere) {
      alert('O CNPJ do PDF é diferente da unidade ativa. Troque a unidade antes de importar.');
      return;
    }
    if (!selecionados.length) {
      alert('Não há linhas elegíveis selecionadas para importar.');
      return;
    }
    if (!paymentDate) {
      alert('Informe a data do pagamento antes de importar.');
      return;
    }

    setImportando(true);
    setMensagem('');

    const falhas: string[] = [];
    for (const row of selecionados) {
      try {
        if (parseResult.tipoDocumento === 'adiantamento') {
          await importarAdiantamento(row);
        } else {
          await importarFolha(row);
        }
      } catch (error: any) {
        console.error(error);
        falhas.push(`${row.nomeColaborador}: ${error?.message || 'erro ao importar'}`);
      }
    }

    if (falhas.length) {
      setMensagem(`Importação concluída com falhas em ${falhas.length} linha(s): ${falhas.join(' | ')}`);
    } else {
      setMensagem(`Importação concluída com sucesso: ${selecionados.length} lançamento(s) enviados para ${parseResult.tipoDocumento === 'adiantamento' ? 'Saídas' : 'Folha de Pagamento'}.`);
    }

    await reconcileRows(parseResult);
    setImportando(false);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f4f6f9', display: 'flex', flexDirection: 'column' }}>
      <Header title="📥 Importações Contábeis" showBack={true} />

      <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '0 20px 30px', flex: 1 }}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Onde esse importador deve morar</h2>
          <p style={styles.paragraph}>
            A melhor acomodação é em um módulo próprio de <strong>Importações Contábeis</strong>, e não dentro de Saídas, Motoboys ou Folha diretamente.
            Assim o sistema recebe PDFs de layouts diferentes, normaliza o documento e só depois distribui o resultado para o módulo correto.
          </p>
          <div style={styles.grid3}>
            <div style={styles.infoBox('#e3f2fd', '#1565c0')}>
              <strong>Entrada</strong>
              <div>PDF da contabilidade</div>
              <div>Layout EMS hoje, outros layouts amanhã</div>
            </div>
            <div style={styles.infoBox('#e8f5e9', '#2e7d32')}>
              <strong>Normalização</strong>
              <div>Competência, colaborador, tipo do documento, valor, origem</div>
              <div>Conciliação com cadastro interno</div>
            </div>
            <div style={styles.infoBox('#fff3e0', '#ef6c00')}>
              <strong>Destino</strong>
              <div>Dia 20 → Saídas / Adiantamento Salário</div>
              <div>Dia 05 → Folha de Pagamento</div>
            </div>
          </div>
        </div>

        <div style={{ ...styles.card, marginTop: '18px' }}>
          <h2 style={styles.sectionTitle}>Upload e leitura</h2>
          <div style={styles.grid2}>
            <div>
              <label style={styles.label}>Arquivo PDF da contabilidade</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => handleArquivo(event.target.files?.[0] || null)}
                style={styles.input}
              />
              {arquivo && <div style={styles.hint}>Arquivo atual: {arquivo.name}</div>}
              <div style={styles.hint}>Suporte implementado agora para o layout EMS Recibo de Pagamento. A estrutura já ficou preparada para novos adaptadores por contabilidade e por unidade.</div>
            </div>
            <div>
              <label style={styles.label}>Data de pagamento que será gravada</label>
              <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} style={styles.input} />
              <div style={styles.hint}>Dia 20 vira lançamento em Saídas. Dia 05 vira registro em Folha de Pagamento.</div>
            </div>
          </div>

          {loadingArquivo && <div style={styles.notice('#fff8e1', '#f57f17')}>⏳ Lendo PDF e identificando o layout da contabilidade...</div>}
          {mensagem && <div style={styles.notice(mensagem.includes('sucesso') ? '#e8f5e9' : '#ffebee', mensagem.includes('sucesso') ? '#2e7d32' : '#c62828')}>{mensagem}</div>}
          {warnings.length > 0 && (
            <div style={styles.notice('#fff3e0', '#ef6c00')}>
              {warnings.map((warning) => <div key={warning}>• {warning}</div>)}
            </div>
          )}
        </div>

        {parseResult && (
          <>
            <div style={{ ...styles.card, marginTop: '18px' }}>
              <h2 style={styles.sectionTitle}>Resumo do documento</h2>
              <div style={styles.grid4}>
                <div style={styles.metricCard}>
                  <div style={styles.metricLabel}>Layout</div>
                  <div style={styles.metricValue}>EMS</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricLabel}>Tipo</div>
                  <div style={styles.metricValue}>{fmtTipoDocumento(parseResult.tipoDocumento)}</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricLabel}>Competência</div>
                  <div style={styles.metricValue}>{parseResult.competencia}</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricLabel}>Destino do import</div>
                  <div style={styles.metricValue}>{tituloImportacao(parseResult.tipoDocumento)}</div>
                </div>
              </div>
              <div style={{ marginTop: '14px', color: '#455a64', fontSize: '14px' }}>
                <strong>Empresa:</strong> {parseResult.empresaNome || '—'} &nbsp;|&nbsp; <strong>CNPJ:</strong> {parseResult.empresaCnpj || '—'}
              </div>
              {!unidadeConfere && (
                <div style={styles.notice('#ffebee', '#c62828')}>
                  ⚠️ O CNPJ do PDF não bate com a unidade ativa. Revise a unidade antes de importar para evitar lançamento no restaurante errado.
                </div>
              )}
            </div>

            <div style={{ ...styles.card, marginTop: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <h2 style={styles.sectionTitle}>Prévia conciliada com colaboradores</h2>
                  <div style={styles.hint}>Linhas sem match não entram. Linhas já importadas ficam protegidas contra duplicidade.</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" style={styles.secondaryButton} onClick={() => marcarTodos(true)}>Selecionar elegíveis</button>
                  <button type="button" style={styles.secondaryButton} onClick={() => marcarTodos(false)}>Limpar seleção</button>
                  <button type="button" style={styles.primaryButton} onClick={handleImportar} disabled={importando || resumo.selected === 0 || !unidadeConfere}>
                    {importando ? '⏳ Importando...' : `✅ Importar ${resumo.selected} linha(s)`}
                  </button>
                </div>
              </div>

              <div style={styles.grid4Compact}>
                <div style={styles.summaryPill('#e3f2fd', '#1565c0')}>Match: {resumo.matched}</div>
                <div style={styles.summaryPill('#ffebee', '#c62828')}>Sem match: {resumo.unmatched}</div>
                <div style={styles.summaryPill('#e8f5e9', '#2e7d32')}>Selecionadas: {resumo.selected}</div>
                <div style={styles.summaryPill('#fff8e1', '#ef6c00')}>Valor selecionado: {fmtMoeda(resumo.totalSelecionado)}</div>
              </div>

              <div style={{ overflowX: 'auto', marginTop: '16px' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>OK</th>
                      <th style={styles.th}>Código</th>
                      <th style={styles.th}>Colaborador no PDF</th>
                      <th style={styles.th}>Colaborador no sistema</th>
                      <th style={styles.th}>Cargo</th>
                      <th style={styles.th}>Competência</th>
                      <th style={styles.th}>Ref.</th>
                      <th style={styles.th}>Salário base</th>
                      <th style={styles.th}>Valor</th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const statusLabel = row.jaImportado ? 'Já importado' : row.matchStatus === 'match' ? 'Pronto para importar' : 'Sem vínculo';
                      const statusColors = row.jaImportado
                        ? ['#eceff1', '#546e7a']
                        : row.matchStatus === 'match'
                          ? ['#e8f5e9', '#2e7d32']
                          : ['#ffebee', '#c62828'];

                      return (
                        <tr key={row.id}>
                          <td style={styles.tdCenter}>
                            <input
                              type="checkbox"
                              checked={row.selecionado}
                              disabled={row.matchStatus !== 'match' || row.jaImportado}
                              onChange={() => toggleRow(row.id)}
                            />
                          </td>
                          <td style={styles.td}>{row.codigoColaborador}</td>
                          <td style={styles.td}><strong>{row.nomeColaborador}</strong></td>
                          <td style={styles.td}>{row.nomeSistema || '—'}</td>
                          <td style={styles.td}>{row.cargo || '—'}</td>
                          <td style={styles.td}>{row.competencia}</td>
                          <td style={styles.td}>{row.referencia ? `${row.referencia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '—'}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{fmtMoeda(row.salarioBase)}</td>
                          <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{fmtMoeda(row.valorLiquido)}</td>
                          <td style={styles.td}>
                            <span style={{ ...styles.statusBadge, backgroundColor: statusColors[0], color: statusColors[1] }}>{statusLabel}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <Footer showLinks={false} />
    </div>
  );
};

const styles: Record<string, any> = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
    border: '1px solid #e6ebf1',
  },
  sectionTitle: {
    margin: '0 0 12px',
    fontSize: '20px',
    color: '#1f2937',
  },
  paragraph: {
    margin: '0 0 12px',
    color: '#455a64',
    lineHeight: 1.6,
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
  },
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
  },
  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '12px',
  },
  grid4Compact: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    marginTop: '14px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 700,
    color: '#334155',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cfd8dc',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  hint: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#607d8b',
    lineHeight: 1.5,
  },
  notice: (bg: string, color: string) => ({
    backgroundColor: bg,
    color,
    borderRadius: '8px',
    padding: '12px 14px',
    marginTop: '12px',
    fontSize: '13px',
    fontWeight: 600,
  }),
  infoBox: (bg: string, accent: string) => ({
    backgroundColor: bg,
    borderLeft: `4px solid ${accent}`,
    borderRadius: '8px',
    padding: '14px',
    color: '#37474f',
    lineHeight: 1.6,
  }),
  metricCard: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '14px',
  },
  metricLabel: {
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    color: '#607d8b',
  },
  metricValue: {
    marginTop: '6px',
    fontSize: '18px',
    fontWeight: 700,
    color: '#1f2937',
  },
  secondaryButton: {
    backgroundColor: '#eceff1',
    color: '#37474f',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  primaryButton: {
    backgroundColor: '#1565c0',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  summaryPill: (bg: string, color: string) => ({
    backgroundColor: bg,
    color,
    borderRadius: '999px',
    padding: '10px 14px',
    fontWeight: 700,
    fontSize: '13px',
    textAlign: 'center' as const,
  }),
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    minWidth: '1000px',
  },
  th: {
    padding: '10px 12px',
    backgroundColor: '#0f172a',
    color: '#fff',
    textAlign: 'left' as const,
    fontSize: '12px',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #eceff1',
    fontSize: '13px',
    color: '#37474f',
  },
  tdCenter: {
    padding: '10px 12px',
    borderBottom: '1px solid #eceff1',
    textAlign: 'center' as const,
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '999px',
    padding: '5px 10px',
    fontSize: '12px',
    fontWeight: 700,
  },
};

export default ImportacoesContabeis;

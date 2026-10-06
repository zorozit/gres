/**
 * pages/Ferias.tsx — Módulo de Férias CLT
 *
 * Fluxo:
 * 1. Lista colaboradores CLT da unidade
 * 2. Modal "Lançar Férias": preenche dados, calcula, permite edição contábil
 * 3. Confirmar → batch /pagamento-batch com folha-pagamento-upsert + payslip
 *
 * Atualizado: 2026-10-05
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../components/Header';
import { fetchAuth } from '../utils/fetchAuth';
import { calcularFerias, calcDiasDireito } from '../engine/ferias';
import { montarPayslipFerias } from '../engine/payslipFerias';
import { calcularFeriasStatus } from '../engine/feriasStatus';
import type { FeriasResult, FeriasCompetencia } from '../engine/ferias';
import type { FeriasStatusResult, HistoricoFeriasItem } from '../engine/feriasStatus';

const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

/* ══════════════════════════════════════════════════════════════
 *  TIPOS LOCAIS
 * ══════════════════════════════════════════════════════════════ */

interface ColaboradorCLT {
  id: string;
  nome: string;
  cpf?: string;
  chavePix?: string;
  tipoContrato: string;
  salario?: number;
  dataAdmissao?: string;
  cargo?: string;
  ativo?: boolean;
  historicoFerias?: HistoricoFeriasItem[];
}

interface AfastamentoDB {
  colaboradorId: string;
  tipo: string;
  dataInicio: string;
  dataFimReal?: string;
  dataFimPrevista?: string;
  motivo?: string;
  ativo?: boolean;
}

interface ValorContabilComp {
  diasFerias: number;
  valorFerias: string;
  valorTerco: string;
  valorInss: string;
  valorIrrf: string;
}

/* ══════════════════════════════════════════════════════════════
 *  HELPERS
 * ══════════════════════════════════════════════════════════════ */

const R2 = (n: number) => parseFloat(n.toFixed(2));
const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Data de hoje em YYYY-MM-DD */
function hoje(): string {
  return new Date().toISOString().split('T')[0];
}

/** Período aquisitivo padrão: admissão + 1 ano */
function periodoAquisitivoPadrao(dataAdmissao?: string): { inicio: string; fim: string } {
  if (!dataAdmissao) {
    const ano = new Date().getFullYear() - 1;
    return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
  }
  const dt = new Date(dataAdmissao + 'T12:00:00');
  const inicio = dataAdmissao;
  const fim = new Date(dt);
  fim.setFullYear(fim.getFullYear() + 1);
  fim.setDate(fim.getDate() - 1);
  return { inicio, fim: fim.toISOString().split('T')[0] };
}

/** Período de gozo padrão: hoje + 29 dias */
function periodoGozoPadrao(): { inicio: string; fim: string } {
  const ini = new Date();
  const fim = new Date(ini);
  fim.setDate(fim.getDate() + 29);
  return {
    inicio: ini.toISOString().split('T')[0],
    fim: fim.toISOString().split('T')[0],
  };
}

/** Dias entre duas datas (inclusivo) */
function diasEntre(ini: string, fim: string): number {
  const a = new Date(ini + 'T12:00:00');
  const b = new Date(fim + 'T12:00:00');
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

/* ══════════════════════════════════════════════════════════════
 *  COMPONENTE PRINCIPAL
 * ══════════════════════════════════════════════════════════════ */

export default function Ferias() {
  const { activeUnit } = useUnit();
  const { user } = useAuth() as any;
  const unitId = activeUnit?.id || (user as any)?.unitId || '';
  const token = () => localStorage.getItem('auth_token');

  const [colaboradores, setColaboradores] = useState<ColaboradorCLT[]>([]);
  const [afastamentos, setAfastamentos] = useState<AfastamentoDB[]>([]);
  const [loading, setLoading]             = useState(false);
  const [busca, setBusca]                 = useState('');

  // Modal
  const [modalColab, setModalColab]       = useState<ColaboradorCLT | null>(null);

  // Formulário do modal
  const [paInicio, setPaInicio]           = useState('');
  const [paFim, setPaFim]                 = useState('');
  const [gozoInicio, setGozoInicio]       = useState('');
  const [gozoFim, setGozoFim]             = useState('');
  const [faltas, setFaltas]               = useState(0);
  const [diasAbono, setDiasAbono]         = useState(0);
  const [remuneracao, setRemuneracao]     = useState('');
  const [variavelMedio, setVariavelMedio] = useState('');
  const [dataPgto, setDataPgto]           = useState(hoje());
  const [formaPgto, setFormaPgto]         = useState<'PIX' | 'Dinheiro' | 'Misto'>('PIX');

  // Resultado do cálculo
  const [resultado, setResultado]         = useState<FeriasResult | null>(null);
  const [calculado, setCalculado]         = useState(false);

  // Modo contábil
  const [modoContabil, setModoContabil]   = useState(false);
  const [valoresContabil, setValoresContabil] = useState<ValorContabilComp[]>([]);

  const [salvando, setSalvando]           = useState(false);
  const [apenasSimular, setApenasSimular] = useState(false);
  const [erro, setErro]                   = useState('');

  /* ── Carregar colaboradores CLT + afastamentos ──────────────── */
  const carregarColaboradores = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const [rColab, rAfast] = await Promise.all([
        fetchAuth(`${apiUrl}/colaboradores?unitId=${unitId}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
        fetchAuth(`${apiUrl}/afastamentos?unitId=${unitId}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }).catch(() => null),
      ]);
      if (rColab?.ok) {
        const data = await rColab.json();
        const lista = Array.isArray(data) ? data : (data.colaboradores || []);
        setColaboradores(lista.filter((c: ColaboradorCLT) => c.tipoContrato === 'CLT' && c.ativo !== false));
      }
      if (rAfast?.ok) {
        const data = await rAfast.json();
        const lista = Array.isArray(data) ? data : (data.afastamentos || []);
        setAfastamentos(lista);
      }
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => { carregarColaboradores(); }, [carregarColaboradores]);

  /* ── Abrir modal ─────────────────────────────────────────────────── */
  const abrirModal = (colab: ColaboradorCLT) => {
    setModalColab(colab);
    setCalculado(false);
    setResultado(null);
    setModoContabil(false);
    setValoresContabil([]);
    setErro('');
    setApenasSimular(false);

    const pa = periodoAquisitivoPadrao(colab.dataAdmissao);
    const gz = periodoGozoPadrao();
    setPaInicio(pa.inicio);
    setPaFim(pa.fim);
    setGozoInicio(gz.inicio);
    setGozoFim(gz.fim);
    setFaltas(0);
    setDiasAbono(0);
    setRemuneracao(String(colab.salario || 0));
    setVariavelMedio('');
    setDataPgto(hoje());
    setFormaPgto('PIX');
  };

  const fecharModal = () => setModalColab(null);

  /* ── Calcular ────────────────────────────────────────────────────── */
  const calcular = () => {
    setErro('');
    const base = parseFloat(remuneracao) || 0;
    const variavel = parseFloat(variavelMedio) || 0;

    if (!gozoInicio || !gozoFim) { setErro('Informe o período de gozo.'); return; }
    if (base <= 0) { setErro('Informe a remuneração base.'); return; }

    const diasGozo = diasEntre(gozoInicio, gozoFim);
    const diasDir = calcDiasDireito(faltas);
    if (diasGozo > diasDir) {
      setErro(`Direito: ${diasDir} dias. Período informado tem ${diasGozo} dias.`);
      return;
    }

    const res = calcularFerias({
      salarioBase: base,
      variavelMedio: variavel,
      periodoAquisitivoInicio: paInicio,
      periodoAquisitivoFim: paFim,
      periodoGozoInicio: gozoInicio,
      periodoGozoFim: gozoFim,
      diasAbono,
      faltas,
      modo: 'simulacao',
    });

    setResultado(res);
    setCalculado(true);

    // Inicializar valores contábeis com os calculados
    setValoresContabil(res.competencias.map(c => ({
      diasFerias: c.diasFerias,
      valorFerias: c.valorFerias.toFixed(2),
      valorTerco: c.valorTerco.toFixed(2),
      valorInss: c.valorInss.toFixed(2),
      valorIrrf: c.valorIrrf.toFixed(2),
    })));
  };

  /* ── Resultado contábil (recalcula a partir dos valores editados) ── */
  const resultadoContabil = (): FeriasResult | null => {
    if (!resultado) return null;
    if (!modoContabil || valoresContabil.length === 0) return resultado;

    return calcularFerias({
      salarioBase: parseFloat(remuneracao) || 0,
      variavelMedio: parseFloat(variavelMedio) || 0,
      periodoAquisitivoInicio: paInicio,
      periodoAquisitivoFim: paFim,
      periodoGozoInicio: gozoInicio,
      periodoGozoFim: gozoFim,
      diasAbono,
      faltas,
      modo: 'contabil',
      competenciasContabil: resultado.competencias.map((c, i) => {
        const vc = valoresContabil[i] || {
          diasFerias: c.diasFerias,
          valorFerias: c.valorFerias.toFixed(2),
          valorTerco: c.valorTerco.toFixed(2),
          valorInss: c.valorInss.toFixed(2),
          valorIrrf: c.valorIrrf.toFixed(2),
        };
        return {
          mes: c.mes,
          diasFerias: c.diasFerias,
          valorFerias: parseFloat(vc.valorFerias) || 0,
          valorTercoProporcional: parseFloat(vc.valorTerco) || 0,
          valorInss: parseFloat(vc.valorInss) || 0,
          valorIrrf: parseFloat(vc.valorIrrf) || 0,
        };
      }),
    });
  };

  /* ── Confirmar pagamento ─────────────────────────────────────────── */
  const confirmarPagamento = async () => {
    if (!modalColab || !resultado) return;
    setErro('');
    setSalvando(true);

    const resAtual = modoContabil ? resultadoContabil() : resultado;
    if (!resAtual) { setSalvando(false); return; }

    try {
      const periodoLabel = `${gozoInicio} a ${gozoFim}`;
      const aquisitivoLabel = `${paInicio} a ${paFim}`;

      // Montar payslip
      const payslip = montarPayslipFerias({
        competencias: resAtual.competencias,
        nome: modalColab.nome,
        cpf: modalColab.cpf,
        chavePix: modalColab.chavePix,
        periodoGozo: periodoLabel,
        periodoAquisitivo: aquisitivoLabel,
        dataPagamento: dataPgto,
        formaPagamento: formaPgto,
        diasAbono,
        comAbono: diasAbono > 0,
      });

      // Operações do batch (uma por competência + payslip por competência)
      const operacoes: any[] = [];

      for (const comp of resAtual.competencias) {
        const psComp = payslip.competencias.find(pc => pc.mes === comp.mes);

        // Folha-pagamento-upsert para cada competência
        operacoes.push({
          tipo: 'folha-pagamento-upsert',
          colaboradorId: modalColab.id,
          mes: comp.mes,
          tipoFerias: 'ferias',
          diasFerias: comp.diasFerias,
          valorBruto: comp.totalVencimentos,
          totalFinal: comp.liquido,
          valorInss: comp.valorInss,
          valorIrrf: comp.valorIrrf,
          valorFgts: comp.valorFgts,
          dataPagamento: dataPgto,
          formaPagamento: formaPgto,
          periodoGozo: periodoLabel,
          periodoAquisitivo: aquisitivoLabel,
          pago: true,
        });

        // Payslip por competência
        if (psComp) {
          operacoes.push({
            tipo: 'payslip',
            id: `ps-${modalColab.id}-ferias-${comp.mes.replace('-', '')}`,
            nomeColaborador: modalColab.nome,
            periodo: `ferias-${comp.mes}`,
            periodoInicio: gozoInicio,
            periodoFim: gozoFim,
            mes: comp.mes,
            bruto: psComp.bruto,
            transporte: 0,
            descontos: psComp.descontos,
            adiantamentos: 0,
            liquido: psComp.liquido,
            tipoContrato: 'CLT',
            tipoPagamento: 'ferias',
            composicao: psComp.composicao,
            dataPagamento: dataPgto,
            formaPagamento: formaPgto,
            status: 'pago',
          });
        }
      }

      // Grava histórico de férias no cadastro do colaborador (atualiza o painel)
      const historicoItem = {
        aquisitivoInicio: paInicio,
        aquisitivoFim: paFim,
        gozoInicio,
        gozoFim,
        dataPagamento: dataPgto,
        diasAbono: diasAbono || 0,
        obs: `Pago via módulo Férias CLT. Líquido R$ ${fmt(resAtual.totais.liquido)}.`,
      };
      operacoes.push({
        tipo: 'colaborador-add-ferias-historico',
        colaboradorId: modalColab.id,
        item: historicoItem,
      });

      if (!apenasSimular) {
        const resp = await fetchAuth(`${apiUrl}/pagamento-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token()}`,
          },
          body: JSON.stringify({
            colaboradorId: modalColab.id,
            unitId,
            mes: resAtual.competencias[0]?.mes || gozoInicio.slice(0, 7),
            dataPagamento: dataPgto,
            formaPagamento: formaPgto,
            operacoes,
          }),
        });

        if (!resp?.ok) {
          const txt = await resp?.text().catch(() => 'sem detalhe');
          throw new Error(`Servidor retornou ${resp?.status}: ${txt}`);
        }

        alert(`Férias de ${modalColab.nome} registradas com sucesso!\nTotal líquido: R$ ${fmt(resAtual.totais.liquido)}`);
      } else {
        alert(`[SIMULAÇÃO] Férias de ${modalColab.nome}\nTotal líquido: R$ ${fmt(resAtual.totais.liquido)}\n(Nenhum dado foi gravado)`);
      }

      fecharModal();
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar férias.');
    } finally {
      setSalvando(false);
    }
  };

  /* ── Filtrar colaboradores ───────────────────────────────────────── */
  const colabsFiltrados = colaboradores.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase())
  );

  /* ── Calcular status de cada colaborador ── */
  const statusMap: Record<string, FeriasStatusResult> = {};
  for (const c of colaboradores) {
    if (!c.dataAdmissao) continue;
    const afastColab = afastamentos
      .filter(a => a.colaboradorId === c.id)
      .map(a => ({
        tipo: a.tipo,
        dataInicio: a.dataInicio,
        dataFim: a.dataFimReal || a.dataFimPrevista,
        motivo: a.motivo,
      }));
    statusMap[c.id] = calcularFeriasStatus({
      nome: c.nome,
      dataAdmissao: c.dataAdmissao,
      historico: c.historicoFerias || [],
      afastamentos: afastColab,
    });
  }

  const totais = {
    vencidos:   Object.values(statusMap).filter(s => s.alerta === 'vencido' || s.alerta === 'duplicado').length,
    vencendo:   Object.values(statusMap).filter(s => s.alerta === 'vencendo').length,
    em_dia:     Object.values(statusMap).filter(s => s.alerta === 'em_dia').length,
  };

  const resAtualizado = calculado ? (modoContabil ? resultadoContabil() : resultado) : null;

  /* ══════════════════════════════════════════════════════════════════
   *  RENDER
   * ══════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <Header title="Férias CLT" />

      {/* ── Painel de Status ── */}
      {!loading && colaboradores.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: '#333' }}>
              🏖️ Status de Férias — Resumo da Unidade
            </h3>
            <div style={{ display: 'flex', gap: 10 }}>
              <StatusBadge count={totais.vencidos}  label="Vencidas"  color="#c62828" bg="#ffebee" />
              <StatusBadge count={totais.vencendo}  label="Vencendo"  color="#e65100" bg="#fff3e0" />
              <StatusBadge count={totais.em_dia}    label="Em dia"    color="#2e7d32" bg="#e8f5e9" />
            </div>
          </div>

          {/* Alertas detalhados dos pendentes */}
          {colaboradores.filter(c => statusMap[c.id] && (statusMap[c.id].alerta === 'vencido' || statusMap[c.id].alerta === 'vencendo' || statusMap[c.id].alerta === 'duplicado')).map(c => {
            const s = statusMap[c.id];
            const vencidos = s.aquisitivos.filter(a => a.status === 'vencido');
            const vencendo = s.aquisitivos.filter(a => a.status === 'vencendo');
            const parciais = s.aquisitivos.filter(a => a.status === 'parcial');
            const borderColor = s.alerta === 'duplicado' || s.alerta === 'vencido' ? '#c62828' : '#e65100';
            const bgColor     = s.alerta === 'duplicado' || s.alerta === 'vencido' ? '#ffebee' : '#fff3e0';
            return (
              <div key={c.id} style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 6, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{c.nome}</strong> <span style={{ color: '#666' }}>— {c.cargo}</span>
                    {s.temDuplicado && <span style={{ marginLeft: 8, background: '#c62828', color: '#fff', padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>⚠️ DUPLICADO ({s.pendentes} aquisitivos pendentes)</span>}
                  </div>
                  <button onClick={() => abrirModal(c)} style={{ ...btnPrimario, background: borderColor, padding: '5px 12px', fontSize: 12 }}>Lançar Férias</button>
                </div>
                <div style={{ marginTop: 4, color: '#555', fontSize: 12 }}>
                  {vencidos.map(a => (
                    <div key={a.ordem}>🔴 Aquisitivo {a.inicio.slice(0,10)} a {a.fim.slice(0,10)} — <strong>VENCIDO há {Math.abs(a.diasAteVencimento)} dias</strong> (pagamento em DOBRO)</div>
                  ))}
                  {vencendo.map(a => (
                    <div key={a.ordem}>🟡 Aquisitivo {a.inicio.slice(0,10)} a {a.fim.slice(0,10)} — limite para iniciar: <strong>{a.limiteGozoPratico}</strong> ({a.diasAteVencimento} dias)</div>
                  ))}
                  {parciais.map(a => (
                    <div key={a.ordem}>🟠 Aquisitivo {a.inicio.slice(0,10)} a {a.fim.slice(0,10)} — <strong>PARCIAL</strong>: já gozou {a.diasGozados}/{a.diasDireito} dias, restam <strong>{a.diasRestantes} dias</strong></div>
                  ))}
                  {s.proporcional && s.proporcional.diasAcumulados > 0 && (
                    <div style={{ color: '#888', fontStyle: 'italic', marginTop: 2 }}>📊 Próximo aquisitivo em curso: {s.proporcional.mesesTrabalhados} meses → {s.proporcional.diasAcumulados} dias acumulados</div>
                  )}
                  {s.afastamentos && s.afastamentos.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, color: '#1565c0' }}>
                      {s.afastamentos.map((af, idx) => (
                        <div key={idx}>🏥 {af.tipo} {af.motivo ? `(${af.motivo}) ` : ''}{af.dataInicio} → {af.dataFim} ({af.diasTotal} dias) — {af.obs}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Barra de busca */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar colaborador..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}
        />
      </div>

      {/* Lista de colaboradores */}
      {loading ? (
        <p style={{ color: '#666' }}>Carregando...</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={thStyle}>Nome</th>
              <th style={thStyle}>Cargo</th>
              <th style={thStyle}>Admissão</th>
              <th style={thStyle}>Salário</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {colabsFiltrados.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                Nenhum colaborador CLT encontrado.
              </td></tr>
            )}
            {colabsFiltrados.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>{c.nome}</td>
                <td style={tdStyle}>{c.cargo || '—'}</td>
                <td style={tdStyle}>{c.dataAdmissao ? new Date(c.dataAdmissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                <td style={tdStyle}>{c.salario ? `R$ ${fmt(c.salario)}` : '—'}</td>
                <td style={tdStyle}>
                  <button
                    onClick={() => abrirModal(c)}
                    style={btnPrimario}
                  >
                    Lançar Férias
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ══ MODAL ══════════════════════════════════════════════════ */}
      {modalColab && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Lançar Férias — {modalColab.nome}</h2>
              <button onClick={fecharModal} style={btnFechar}>✕</button>
            </div>

            {/* ── Dados do colaborador ── */}
            <div style={secaoStyle}>
              <div style={gridStyle}>
                <div>
                  <label style={labelStyle}>Admissão</label>
                  <p style={valorReadOnly}>{modalColab.dataAdmissao ? new Date(modalColab.dataAdmissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                </div>
                <div>
                  <label style={labelStyle}>Cargo</label>
                  <p style={valorReadOnly}>{modalColab.cargo || '—'}</p>
                </div>
              </div>
            </div>

            {/* ── Período aquisitivo ── */}
            <div style={secaoStyle}>
              <h3 style={subTituloStyle}>
                Período Aquisitivo
                <span style={{ marginLeft: 6, display: 'inline-block', verticalAlign: 'middle' }}>
                  <InfoTooltip texto={`12 meses em que o colaborador TRABALHOU para ganhar o direito a 30 dias de férias.\n\n• Começa na admissão (ou dia seguinte ao fim do último aquisitivo).\n• Faltas injustificadas reduzem o direito:\n   0-5 faltas = 30 dias\n   6-14 = 24 dias\n   15-23 = 18 dias\n   24-32 = 12 dias\n   >32 = perde o direito`} />
                </span>
              </h3>
              <div style={gridStyle}>
                <div>
                  <label style={labelStyle}>Início</label>
                  <input type="date" value={paInicio} onChange={e => setPaInicio(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Fim</label>
                  <input type="date" value={paFim} onChange={e => setPaFim(e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* ── Período de gozo ── */}
            <div style={secaoStyle}>
              <h3 style={subTituloStyle}>
                Período de Gozo
                {gozoInicio && gozoFim && (
                  <span style={{ fontWeight: 'normal', fontSize: 13, marginLeft: 8, color: '#555' }}>
                    ({diasEntre(gozoInicio, gozoFim)} dias)
                  </span>
                )}
              </h3>
              <div style={gridStyle}>
                <div>
                  <label style={labelStyle}>Início</label>
                  <input type="date" value={gozoInicio} onChange={e => setGozoInicio(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Fim</label>
                  <input type="date" value={gozoFim} onChange={e => setGozoFim(e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* ── Parâmetros ── */}
            <div style={secaoStyle}>
              <h3 style={subTituloStyle}>Parâmetros</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div>
                  <label style={labelStyle}>
                    Faltas <InfoTooltip texto={`Faltas INJUSTIFICADAS no período aquisitivo.\n\nCLT art. 130:\n0-5 = 30 dias\n6-14 = 24 dias\n15-23 = 18 dias\n24-32 = 12 dias\n>32 = perde o direito`} />
                  </label>
                  <input type="number" min={0} value={faltas} onChange={e => setFaltas(parseInt(e.target.value) || 0)} style={inputStyle} />
                  <span style={{ fontSize: 11, color: '#888' }}>
                    Direito: {calcDiasDireito(faltas)} dias
                  </span>
                </div>
                <div>
                  <label style={labelStyle}>
                    Abono (dias) <InfoTooltip texto={`Abono Pecuniário = venda de até 10 dias de férias (CLT art. 143).\n\n• Pode vender até 1/3 do direito (10 dias se tiver direito a 30).\n• Precisa ser requerido 15 dias antes do fim do aquisitivo.\n• Valor do abono = (base ÷ 30) × dias vendidos + 1/3.\n• Abono NÃO sofre INSS nem IRRF.`} />
                  </label>
                  <input type="number" min={0} max={10} value={diasAbono} onChange={e => setDiasAbono(Math.min(10, parseInt(e.target.value) || 0))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>
                    Salário + Variável <InfoTooltip texto={`Remuneração base para o cálculo das férias.\n\nUse: salário contratual + média das verbas variáveis dos últimos 12 meses (horas extras, comissões, caixinhas quando houver vencimento em folha).\n\nDiário de férias = (salário+variável) ÷ 30.`} />
                  </label>
                  <input type="number" min={0} step={0.01} value={remuneracao} onChange={e => setRemuneracao(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>
                    Variável médio <InfoTooltip texto={`Última média dos ganhos variáveis dos 12 meses do aquisitivo.\n\nIncluir: horas extras habituais, DSR sobre variável, comissões, bonificações.\n\nEste campo é informativo — some ao salário base no campo acima.`} />
                  </label>
                  <input type="number" min={0} step={0.01} value={variavelMedio} onChange={e => setVariavelMedio(e.target.value)} style={inputStyle} placeholder="0,00" />
                </div>
              </div>
            </div>

            {/* ── Botão calcular ── */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <button onClick={calcular} style={{ ...btnPrimario, padding: '10px 32px', fontSize: 15 }}>
                Calcular
              </button>
            </div>

            {/* ── Erro ── */}
            {erro && <div style={erroStyle}>{erro}</div>}

            {/* ── Resultado calculado ── */}
            {calculado && resAtualizado && (
              <>
                {/* Resumo */}
                <div style={{ background: '#f0f7f0', border: '1px solid #c8e6c9', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 12px', color: '#2e7d32' }}>Resultado</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#666' }}>Base</div>
                      <div style={{ fontWeight: 600 }}>R$ {fmt(resAtualizado.remuneracaoBase)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#666' }}>Bruto</div>
                      <div style={{ fontWeight: 600 }}>R$ {fmt(resAtualizado.totais.bruto)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#666' }}>Descontos</div>
                      <div style={{ fontWeight: 600, color: '#c62828' }}>R$ {fmt(resAtualizado.totais.descontos)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#666' }}>Líquido</div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#1b5e20' }}>R$ {fmt(resAtualizado.totais.liquido)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
                    FGTS (informativo): R$ {fmt(resAtualizado.totais.fgts)}
                  </div>
                </div>

                {/* Detalhamento por competência */}
                {resAtualizado.competencias.map((comp, i) => (
                  <div key={comp.mes} style={{ marginBottom: 12, background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: 8, padding: 14 }}>
                    <h4 style={{ margin: '0 0 10px', color: '#333' }}>
                      Competência {comp.mes.slice(0, 7)} — {comp.diasFerias} dias
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 'normal', color: comp.fonte === 'contabil' ? '#1565c0' : '#555' }}>
                        [{comp.fonte === 'contabil' ? 'contábil' : 'calculado'}]
                      </span>
                    </h4>

                    {modoContabil && valoresContabil[i] ? (
                      /* Edição de valores contábeis */
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {[
                          { label: 'Férias (cód 43)', field: 'valorFerias' as const },
                          { label: '1/3 (cód 50)', field: 'valorTerco' as const },
                          { label: 'INSS (cód 45)', field: 'valorInss' as const },
                          { label: 'IRRF (cód 46)', field: 'valorIrrf' as const },
                        ].map(({ label, field }) => (
                          <div key={field}>
                            <label style={{ ...labelStyle, fontSize: 11 }}>{label}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 12 }}>R$</span>
                              <input
                                type="number"
                                step={0.01}
                                min={0}
                                value={valoresContabil[i][field]}
                                onChange={e => {
                                  const novoArr = [...valoresContabil];
                                  novoArr[i] = { ...novoArr[i], [field]: e.target.value };
                                  setValoresContabil(novoArr);
                                }}
                                style={{ ...inputStyle, width: '100%' }}
                              />
                            </div>
                            <div style={{ fontSize: 10, color: '#1565c0', marginTop: 2 }}>
                              calc: R$ {fmt(resultado!.competencias[i]?.[field === 'valorFerias' ? 'valorFerias' : field === 'valorTerco' ? 'valorTerco' : field === 'valorInss' ? 'valorInss' : 'valorIrrf'] || 0)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Exibição calculada */
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        <InfoItem label="Férias (cód 43)" valor={comp.valorFerias}
                          info={`Fórmula: (remuneração base ÷ 30) × dias\n\nBase: R$ ${fmt(resAtualizado.remuneracaoBase)}\nDiário: R$ ${fmt(resAtualizado.valorDiario)}\nDias: ${comp.diasFerias}\n\n= R$ ${fmt(comp.valorFerias)}`} />
                        <InfoItem label="1/3 (cód 50)" valor={comp.valorTerco}
                          info={`1/3 Constitucional (Constituição Federal art. 7º XVII)\n\nFórmula: férias ÷ 3\n\n= R$ ${fmt(comp.valorFerias)} ÷ 3 = R$ ${fmt(comp.valorTerco)}`} />
                        <InfoItem label="INSS (cód 45)" valor={comp.valorInss} desconto
                          info={`INSS progressivo 2026 sobre férias + 1/3\n\nBase: R$ ${fmt(comp.baseInss)}\n\nFaixas 2026:\n  até 1518,00: 7,5%\n  1518,01 – 2793,88: 9%\n  2793,89 – 4190,83: 12%\n  4190,84 – 8157,41: 14%\n\nNa base ${fmt(comp.baseInss)} = R$ ${fmt(comp.valorInss)}`} />
                        <InfoItem label="IRRF (cód 46)" valor={comp.valorIrrf} desconto
                          info={`IRRF 2026 sobre (férias + 1/3 − INSS)\n\nBase: R$ ${fmt(comp.baseIrrf)}\n\nFaixas mensais 2026:\n  até 2.428,80: isento\n  2.428,81 – 2.826,65: 7,5% (ded. 182,16)\n  2.826,66 – 3.751,05: 15% (ded. 394,16)\n  3.751,06 – 4.664,68: 22,5% (ded. 675,49)\n  acima: 27,5% (ded. 908,73)\n\nResultado: R$ ${fmt(comp.valorIrrf)}`} />
                      </div>
                    )}
                    <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
                      Líquido: <strong>R$ {fmt(comp.liquido)}</strong>
                      {comp.valorAbono > 0 && <span style={{ marginLeft: 12 }}>+ Abono: R$ {fmt(comp.valorAbono)}</span>}
                    </div>
                  </div>
                ))}

                {/* Toggle conferir contabilidade */}
                <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id="modoContabilCk"
                    checked={modoContabil}
                    onChange={e => setModoContabil(e.target.checked)}
                  />
                  <label htmlFor="modoContabilCk" style={{ fontSize: 14, cursor: 'pointer' }}>
                    Conferir com contabilidade (editar valores manualmente)
                  </label>
                </div>

                {/* Pagamento */}
                <div style={secaoStyle}>
                  <h3 style={subTituloStyle}>Pagamento</h3>
                  <div style={gridStyle}>
                    <div>
                      <label style={labelStyle}>Data pagamento</label>
                      <input type="date" value={dataPgto} onChange={e => setDataPgto(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Forma</label>
                      <select value={formaPgto} onChange={e => setFormaPgto(e.target.value as any)} style={inputStyle}>
                        <option value="PIX">PIX</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Misto">Misto</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Simular */}
                <div style={{ margin: '8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id="simularCk"
                    checked={apenasSimular}
                    onChange={e => setApenasSimular(e.target.checked)}
                  />
                  <label htmlFor="simularCk" style={{ fontSize: 14, cursor: 'pointer', color: '#c62828' }}>
                    Apenas simular (não gravar)
                  </label>
                </div>

                {/* Botão confirmar */}
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button
                    onClick={confirmarPagamento}
                    disabled={salvando}
                    style={{ ...btnPrimario, padding: '12px 40px', fontSize: 15, background: apenasSimular ? '#fb8c00' : '#2e7d32', opacity: salvando ? 0.6 : 1 }}
                  >
                    {salvando ? 'Salvando...' : apenasSimular ? 'Simular' : 'Confirmar Pagamento'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  SUBCOMPONENTES
 * ══════════════════════════════════════════════════════════════ */

function InfoItem({ label, valor, desconto, info }: { label: string; valor: number; desconto?: boolean; info?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {info && <InfoTooltip texto={info} />}
      </div>
      <div style={{ fontWeight: 600, color: desconto ? '#c62828' : undefined }}>
        R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}

/** Tooltip de informação (?) que mostra regra ao passar o mouse */
function InfoTooltip({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onClick={() => setAberto(a => !a)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: '50%', background: '#1976d2', color: '#fff',
          fontSize: 10, fontWeight: 700, cursor: 'help', lineHeight: 1,
        }}>i</span>
      {aberto && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: '#263238', color: '#fff', padding: '8px 12px', borderRadius: 6,
          fontSize: 11, lineHeight: 1.4, whiteSpace: 'pre-wrap', width: 240, zIndex: 10000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)', textAlign: 'left', fontWeight: 400,
        }}>{texto}</span>
      )}
    </span>
  );
}

/** Badge numérico de status (vencidos / vencendo / em dia) */
function StatusBadge({ count, label, color, bg }: { count: number; label: string; color: string; bg: string }) {
  return (
    <div style={{ background: bg, color, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 16, fontWeight: 800 }}>{count}</span>
      <span>{label}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  ESTILOS
 * ══════════════════════════════════════════════════════════════ */

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#555',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 14,
};
const btnPrimario: React.CSSProperties = {
  background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6,
  padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
};
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  zIndex: 9999, overflowY: 'auto', padding: '24px 0',
};
const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 10, padding: 24,
  width: '100%', maxWidth: 780, boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
};
const btnFechar: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666',
};
const secaoStyle: React.CSSProperties = {
  marginBottom: 16, background: '#f9f9f9', borderRadius: 8, padding: 14,
};
const gridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
};
const subTituloStyle: React.CSSProperties = {
  margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: '#333',
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, color: '#555', marginBottom: 4, display: 'block',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #ccc',
  borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
};
const valorReadOnly: React.CSSProperties = {
  margin: 0, padding: '7px 0', fontSize: 14, color: '#333',
};
const erroStyle: React.CSSProperties = {
  background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 6,
  padding: '10px 14px', color: '#c62828', marginBottom: 12, fontSize: 14,
};

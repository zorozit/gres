import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const SEGMENTOS = ['À la carte', 'Buffet', 'Pizzaria', 'Hamburgueria', 'Eventos', 'Comida japonesa', 'Dark kitchen', 'Cozinha industrial'];
const TIPOS_CONTRATACAO = ['CLT', 'Freelancer', 'Ambos'];
const TEMPOS_EXPERIENCIA = ['Não tenho experiência', 'Menos de 1 ano', 'Entre 1 e 3 anos', 'Entre 3 a 5 anos', 'Mais de 5 anos'];
const QUANDO_COMECA = ['Imediato', 'Até 7 dias', 'Até 15 dias', 'Até 30 dias'];
const TURNOS = ['Dia', 'Noite', 'Ambos'];

interface Vaga {
  id: string;
  titulo: string;
  tipo: string;
  unitId: string;
  descricao?: string;
  nomeRestaurante?: string;
  endereco?: string;
  horarios?: string;
  beneficios?: string;
  proximoPasso?: string;
  exibirTodasVagas?: boolean;  // configurado pelo admin
}

const initialForm = {
  nome: '',
  email: '',
  celular: '',
  cidadeBairro: '',
  vagasInteresse: [] as string[],
  tipoContratacao: '',
  pretensaoGanho: '',
  tempoExperiencia: '',
  transporteProprio: '',
  gastoTransporte: '',
  referencia: '',
  idade: '',
  quandoComeca: '',
  trabalhouBuffet: '',
  turnoPref: '',
  diasDisponiveis: [] as string[],
  trabalhaFds: '',
  fazDobras: '',
  lidarPressao: '',
  resumoExperiencia: '',
  segmentosExperiencia: [] as string[],
  curriculo: '',
};

export default function FormularioVaga() {
  const { vagaId } = useParams<{ vagaId: string }>();

  // ── dados carregados ──
  const [todasVagas, setTodasVagas]         = useState<Vaga[]>([]);   // todas disponíveis
  const [vagaInicial, setVagaInicial]       = useState<Vaga | null>(null); // vaga do link
  const [nomeUnidade, setNomeUnidade]       = useState('');
  const [unitId, setUnitId]                 = useState('');

  // ── seleção ativa ──
  // null = "Todas as vagas"
  const [vagaSelecionada, setVagaSelecionada] = useState<Vaga | null>(null);
  // exibirTodas: determinado pelo campo exibirTodasVagas da vaga do link (configurado pelo admin)
  const [exibirTodas, setExibirTodas]         = useState(true);

  // ── form / UX ──
  const [form, setForm]     = useState(initialForm);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado]   = useState(false);
  const [erro, setErro]         = useState('');
  const [loading, setLoading]   = useState(true);
  const [encerrada, setEncerrada] = useState(false);

  /* ── Carrega vagas pelo vagaId da URL ── */
  useEffect(() => {
    if (!vagaId) return;
    fetch(`${API_URL}/vagas-publicas?vagaId=${vagaId}`)
      .then(r => r.json())
      .then(d => {
        if (d.encerrada) { setEncerrada(true); return; }

        if (d.vaga) {
          // Modo vagaId — vaga principal identificada
          const vp: Vaga = d.vaga;
          const lista: Vaga[] = d.vagas || [vp];
          setVagaInicial(vp);
          setTodasVagas(lista);
          setNomeUnidade(d.nomeUnidade || '');
          setUnitId(vp.unitId);

          // Respeita configuração do admin: exibirTodasVagas (default true)
          const mostrarTodas = vp.exibirTodasVagas !== false;
          setExibirTodas(mostrarTodas);

          // Seleciona a vaga do link por padrão
          setVagaSelecionada(vp);
          setForm(prev => ({ ...prev, vagasInteresse: [vp.titulo] }));

        } else if (d.vagas) {
          // Modo unitId legado — sem vaga específica
          const lista: Vaga[] = d.vagas || [];
          setTodasVagas(lista);
          setNomeUnidade(d.nomeUnidade || '');
          setUnitId(vagaId);
          setVagaSelecionada(null);
          setExibirTodas(true);
        }
      })
      .catch(() => setErro('Erro ao carregar o formulário. Tente novamente.'))
      .finally(() => setLoading(false));
  }, [vagaId]);

  /* ── Troca de vaga selecionada ── */
  const selecionarVaga = (vaga: Vaga | null) => {
    setVagaSelecionada(vaga);
    if (vaga) {
      setForm(prev => ({ ...prev, vagasInteresse: [vaga.titulo] }));
    } else {
      // "Todas" — limpa pré-seleção para o candidato escolher nos checkboxes
      setForm(prev => ({ ...prev, vagasInteresse: [] }));
    }
    setErro('');
  };

  /* ── Vagas visíveis no seletor ──
     - exibirTodas=true  → mostra todos os botões (configurado pelo admin)
     - exibirTodas=false → só o botão da vaga do link
  */
  const vagasVisiveis = exibirTodas ? todasVagas : (vagaSelecionada ? [vagaSelecionada] : todasVagas.slice(0, 1));

  /* ── Informações do cabeçalho (da vaga selecionada ou da vagaInicial) ── */
  const vagaHeader: Vaga | null = vagaSelecionada ?? vagaInicial;

  /* ── Form handlers ── */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleMultiCheck = (field: 'vagasInteresse' | 'diasDisponiveis' | 'segmentosExperiencia', value: string) => {
    setForm(prev => {
      const arr = prev[field] as string[];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (!form.nome || !form.email || !form.celular) {
      setErro('Preencha os campos obrigatórios: Nome, E-mail e Celular.');
      return;
    }
    if (form.vagasInteresse.length === 0) {
      setErro('Selecione ao menos uma vaga de interesse.');
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`${API_URL}/candidatos-publico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          unitId,
          vagaId: vagaSelecionada?.id ?? vagaInicial?.id ?? null,
          gastoTransporte: Number(form.gastoTransporte) || 0,
          idade: Number(form.idade) || 0,
          trabalhouBuffet: form.segmentosExperiencia.length > 0 ? form.segmentosExperiencia.join(', ') : 'Não',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEnviado(true);
      } else {
        setErro(data.error || 'Erro ao enviar candidatura. Tente novamente.');
      }
    } catch {
      setErro('Erro de conexão. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  /* ══════════════ TELAS DE ESTADO ══════════════ */
  if (loading) {
    return (
      <div style={st.container}>
        <div style={st.loadingBox}>
          <div style={st.spinner} />
          <p style={{ color: '#888', marginTop: '16px' }}>Carregando formulário...</p>
        </div>
      </div>
    );
  }

  if (encerrada) {
    return (
      <div style={st.container}>
        <div style={st.card}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>🔒</div>
            <h2 style={{ color: '#555', fontWeight: 700 }}>Vaga encerrada</h2>
            <p style={{ color: '#888', fontSize: '15px' }}>
              Esta vaga não está mais disponível.<br />Obrigado pelo interesse!
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div style={st.container}>
        <div style={st.card}>
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ color: '#27ae60', fontWeight: 700, marginBottom: '10px' }}>
              Candidatura enviada!
            </h2>
            <p style={{ color: '#555', fontSize: '15px', lineHeight: '1.7' }}>
              Obrigado, <strong>{form.nome}</strong>!<br />
              {nomeUnidade ? `Recebemos sua candidatura para o ${nomeUnidade}.` : 'Recebemos sua candidatura.'}<br />
              Entraremos em contato em breve pelo celular ou e-mail informado.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════ RENDER PRINCIPAL ══════════════ */
  return (
    <div style={st.container}>
      <div style={st.card}>

        {/* ── SELETOR DE VAGAS (topo) ── */}
        {todasVagas.length > 0 && (
          <div style={st.vagaSelector}>

            {/* Título da seção */}
            <div style={st.selectorHeader}>
              <span style={st.selectorTitle}>💼
                {exibirTodas && todasVagas.length > 1
                  ? ' Selecione a vaga desejada'
                  : ' Vaga'}
              </span>
            </div>

            {/* Botões das vagas */}
            <div style={st.vagaBtnsWrap}>

              {/* Botão "Todas" — só aparece quando exibirTodas=true e há mais de 1 vaga */}
              {exibirTodas && todasVagas.length > 1 && (
                <button
                  type="button"
                  onClick={() => selecionarVaga(null)}
                  style={{
                    ...st.vagaBtn,
                    ...(vagaSelecionada === null ? st.vagaBtnActive : {}),
                  }}
                >
                  <span style={st.vagaBtnIcon}>📋</span>
                  <span style={st.vagaBtnLabel}>Todas as vagas</span>
                  <span style={st.vagaBtnCount}>{todasVagas.length} vagas</span>
                </button>
              )}

              {/* Botões individuais de vaga */}
              {vagasVisiveis.map(v => {
                const ativa = vagaSelecionada?.id === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => selecionarVaga(v)}
                    style={{
                      ...st.vagaBtn,
                      ...(ativa ? st.vagaBtnActive : {}),
                    }}
                  >
                    <span style={st.vagaBtnIcon}>
                      {v.tipo === 'CLT' ? '📋' : v.tipo === 'Freelancer' ? '🤝' : '💼'}
                    </span>
                    <span style={st.vagaBtnLabel}>{v.titulo}</span>
                    {v.tipo && v.tipo !== 'Ambos' && (
                      <span style={{
                        ...st.vagaBtnBadge,
                        background: v.tipo === 'CLT' ? '#e3f2fd' : '#f3e5f5',
                        color: v.tipo === 'CLT' ? '#1565c0' : '#6a1b9a',
                      }}>
                        {v.tipo}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Dica quando "Todas" selecionada */}
            {vagaSelecionada === null && exibirTodas && todasVagas.length > 1 && (
              <p style={st.selectorDica}>
                💡 Você pode se candidatar a mais de uma vaga ao mesmo tempo. Basta marcar no formulário abaixo.
              </p>
            )}
          </div>
        )}

        {/* ── CABEÇALHO DA VAGA SELECIONADA ── */}
        <div style={st.header}>
          {nomeUnidade && <p style={st.unidade}>{nomeUnidade}</p>}
          <h1 style={st.title}>
            {vagaHeader ? vagaHeader.titulo : 'Formulário de Candidatura'}
          </h1>

          {vagaHeader?.endereco && (
            <p style={st.headerInfo}>📍 {vagaHeader.endereco}</p>
          )}

          {vagaHeader?.horarios && (
            <div style={st.headerBlock}>
              <strong>Horários de funcionamento:</strong>
              <div style={{ whiteSpace: 'pre-line', marginTop: '4px' }}>{vagaHeader.horarios}</div>
            </div>
          )}

          {vagaHeader?.beneficios && (
            <div style={st.headerBlock}>
              <strong>Modelo de contratação:</strong>
              <div style={{ whiteSpace: 'pre-line', marginTop: '4px' }}>{vagaHeader.beneficios}</div>
            </div>
          )}

          {vagaHeader?.proximoPasso && (
            <div style={{ ...st.headerBlock, backgroundColor: '#e8f5e9', borderLeft: '3px solid #27ae60', whiteSpace: 'pre-line' }}>
              {vagaHeader.proximoPasso}
            </div>
          )}
        </div>

        {/* ── FORMULÁRIO ── */}
        <form onSubmit={handleSubmit}>

          {/* Dados pessoais */}
          <Section title="📋 Dados Pessoais">
            <Field label="Nome completo *">
              <input style={st.input} name="nome" value={form.nome} onChange={handleChange} required placeholder="Seu nome completo" />
            </Field>
            <Field label="E-mail *">
              <input style={st.input} type="email" name="email" value={form.email} onChange={handleChange} required placeholder="seu@email.com" />
            </Field>
            <Field label="Celular / WhatsApp *">
              <input style={st.input} name="celular" value={form.celular} onChange={handleChange} required placeholder="(11) 99999-9999" />
            </Field>
            <Field label="Cidade / Bairro">
              <input style={st.input} name="cidadeBairro" value={form.cidadeBairro} onChange={handleChange} placeholder="Ex: São Paulo - Pinheiros" />
            </Field>
            <Field label="Idade">
              <input style={st.input} type="number" name="idade" value={form.idade} onChange={handleChange} placeholder="Ex: 25" min="16" max="99" />
            </Field>
          </Section>

          {/* Vagas de Interesse — só aparece quando exibirTodas=true, modo "Todas" e há mais de 1 vaga */}
          {(exibirTodas && vagaSelecionada === null && todasVagas.length > 1) && (
            <Section title="💼 Vagas de Interesse *">
              <p style={{ fontSize: '13px', color: '#888', marginBottom: '10px', marginTop: 0 }}>
                Marque todas as vagas nas quais tem interesse:
              </p>
              <div style={st.checkGrid}>
                {todasVagas.map(v => (
                  <label key={v.id} style={{
                    ...st.checkLabel,
                    backgroundColor: form.vagasInteresse.includes(v.titulo) ? '#fff3e6' : '#f8f8f8',
                    border: form.vagasInteresse.includes(v.titulo) ? '1px solid #e67e22' : '1px solid transparent',
                  }}>
                    <input
                      type="checkbox"
                      checked={form.vagasInteresse.includes(v.titulo)}
                      onChange={() => handleMultiCheck('vagasInteresse', v.titulo)}
                      style={st.checkbox}
                    />
                    <span>{v.titulo}</span>
                    {v.tipo && v.tipo !== 'Ambos' && (
                      <span style={st.vagaTipo}>{v.tipo}</span>
                    )}
                  </label>
                ))}
              </div>
            </Section>
          )}

          {/* Contratação */}
          <Section title="📄 Contratação e Disponibilidade">
            <Field label="Tipo de contratação desejada">
              <select style={st.input} name="tipoContratacao" value={form.tipoContratacao} onChange={handleChange}>
                <option value="">Selecione...</option>
                {TIPOS_CONTRATACAO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Pretensão de ganho (mensal CLT / diário Freelancer)">
              <input style={st.input} name="pretensaoGanho" value={form.pretensaoGanho} onChange={handleChange} placeholder="Ex: R$ 1.800 CLT / R$ 130 diária" />
            </Field>
            <Field label="Quando pode começar?">
              <select style={st.input} name="quandoComeca" value={form.quandoComeca} onChange={handleChange}>
                <option value="">Selecione...</option>
                {QUANDO_COMECA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Preferência de turno">
              <select style={st.input} name="turnoPref" value={form.turnoPref} onChange={handleChange}>
                <option value="">Selecione...</option>
                {TURNOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Quais dias pode trabalhar?">
              <div style={st.checkGrid}>
                {DIAS_SEMANA.map(d => (
                  <label key={d} style={st.checkLabel}>
                    <input
                      type="checkbox"
                      checked={form.diasDisponiveis.includes(d)}
                      onChange={() => handleMultiCheck('diasDisponiveis', d)}
                      style={st.checkbox}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Consegue trabalhar finais de semana e feriados?">
              <RadioGroup name="trabalhaFds" value={form.trabalhaFds} options={['Sim', 'Não']} onChange={v => setForm(p => ({ ...p, trabalhaFds: v }))} />
            </Field>
            <Field label="Pode fazer dobras quando necessário?">
              <RadioGroup name="fazDobras" value={form.fazDobras} options={['Sim', 'Não']} onChange={v => setForm(p => ({ ...p, fazDobras: v }))} />
            </Field>
          </Section>

          {/* Experiência */}
          <Section title="🎓 Experiência">
            <Field label="Tempo de experiência na área">
              <select style={st.input} name="tempoExperiencia" value={form.tempoExperiencia} onChange={handleChange}>
                <option value="">Selecione...</option>
                {TEMPOS_EXPERIENCIA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Já trabalhou com (marque todos que se aplicam):">
              <div style={st.checkGrid}>
                {SEGMENTOS.map(s => (
                  <label key={s} style={st.checkLabel}>
                    <input
                      type="checkbox"
                      checked={form.segmentosExperiencia.includes(s)}
                      onChange={() => handleMultiCheck('segmentosExperiencia', s)}
                      style={st.checkbox}
                    />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Em 2–3 linhas: faça um breve resumo da sua experiência">
              <textarea
                style={{ ...st.input, minHeight: '90px', resize: 'vertical' }}
                name="resumoExperiencia"
                value={form.resumoExperiencia}
                onChange={handleChange}
                placeholder="Conte um pouco sobre sua trajetória profissional e principais experiências..."
              />
            </Field>
          </Section>

          {/* Transporte */}
          <Section title="🚗 Transporte">
            <Field label="Possui transporte próprio?">
              <RadioGroup name="transporteProprio" value={form.transporteProprio} options={['Sim', 'Não']} onChange={v => setForm(p => ({ ...p, transporteProprio: v }))} />
            </Field>
            <Field label="Gasto médio com transporte por dia (aprox.)">
              <input style={st.input} type="number" name="gastoTransporte" value={form.gastoTransporte} onChange={handleChange} placeholder="Ex: 15" min="0" />
            </Field>
          </Section>

          {/* Complementar */}
          <Section title="📎 Informações Complementares">
            <Field label="Referência (nome do estabelecimento e telefone — opcional)">
              <input style={st.input} name="referencia" value={form.referencia} onChange={handleChange} placeholder="Ex: Restaurante XYZ - (11) 3333-4444" />
            </Field>
            <Field label="Currículo (link Google Drive, LinkedIn, etc. — opcional)">
              <input style={st.input} name="curriculo" value={form.curriculo} onChange={handleChange} placeholder="https://..." />
            </Field>
          </Section>

          {/* Resumo do que vai ser enviado */}
          {form.vagasInteresse.length > 0 && (
            <div style={st.resumoEnvio}>
              <span style={{ fontSize: '13px', color: '#555' }}>
                📤 Candidatura para:{' '}
                <strong style={{ color: '#e67e22' }}>
                  {form.vagasInteresse.join(' · ')}
                </strong>
              </span>
            </div>
          )}

          {erro && <div style={st.erro}>{erro}</div>}

          <button type="submit" style={st.submitBtn} disabled={enviando}>
            {enviando ? 'Enviando...' : '📤 Enviar Candidatura'}
          </button>
        </form>

      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#e67e22', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid #f0e6d3', margin: '0 0 12px' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '5px' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function RadioGroup({ name, value, options, onChange }: { name: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      {options.map(opt => (
        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
          <input type="radio" name={name} value={opt} checked={value === opt} onChange={() => onChange(opt)} />
          {opt}
        </label>
      ))}
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const st: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#faf6f1',
    padding: '20px 16px 60px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    maxWidth: '640px',
    margin: '0 auto',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 20px rgba(0,0,0,0.08)',
    padding: '28px 24px',
  },

  /* ── Seletor de vagas ── */
  vagaSelector: {
    marginBottom: '24px',
    padding: '16px',
    background: '#fdf8f3',
    borderRadius: '10px',
    border: '1px solid #f0e6d3',
  },
  selectorHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  selectorTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#c0502a',
    letterSpacing: '0.2px',
  },

  vagaBtnsWrap: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  vagaBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '9px 14px',
    background: '#fff',
    border: '1.5px solid #ddd',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#444',
    fontWeight: 500,
    transition: 'all 0.15s',
    textAlign: 'left' as const,
    flexShrink: 0,
  },
  vagaBtnActive: {
    background: '#fff3e6',
    border: '2px solid #e67e22',
    color: '#c0502a',
    fontWeight: 700,
    boxShadow: '0 2px 8px rgba(230,126,34,0.15)',
  },
  vagaBtnIcon: { fontSize: '16px' },
  vagaBtnLabel: { fontSize: '14px' },
  vagaBtnCount: {
    fontSize: '11px',
    background: '#f0e6d3',
    color: '#c0502a',
    borderRadius: '10px',
    padding: '1px 7px',
    fontWeight: 700,
  },
  vagaBtnBadge: {
    fontSize: '10px',
    padding: '1px 7px',
    borderRadius: '10px',
    fontWeight: 700,
  },
  selectorDica: {
    fontSize: '12px',
    color: '#888',
    margin: '10px 0 0',
    lineHeight: '1.5',
  },

  /* ── Header da vaga ── */
  header: {
    textAlign: 'center',
    marginBottom: '28px',
    paddingBottom: '20px',
    borderBottom: '2px solid #e67e22',
  },
  unidade: {
    fontSize: '13px', color: '#e67e22', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px',
  },
  title: { fontSize: '22px', fontWeight: 700, color: '#2c2c2c', margin: '0 0 6px' },
  headerInfo: { fontSize: '14px', color: '#666', margin: '8px 0 0', textAlign: 'left' as const },
  headerBlock: {
    fontSize: '14px', color: '#555', margin: '12px 0 0',
    padding: '10px 12px', backgroundColor: '#fef9f0',
    borderLeft: '3px solid #e67e22', borderRadius: '4px',
    lineHeight: '1.6', textAlign: 'left' as const,
  },

  /* ── Campos ── */
  input: {
    width: '100%', padding: '10px 12px',
    border: '1px solid #ddd', borderRadius: '8px',
    fontSize: '14px', color: '#333', backgroundColor: '#fafafa',
    boxSizing: 'border-box', outline: 'none',
  },
  checkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
    gap: '8px',
  },
  checkLabel: {
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '14px', cursor: 'pointer',
    padding: '6px 8px', borderRadius: '6px',
    userSelect: 'none',
    transition: 'all 0.1s',
  },
  checkbox: { width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 },
  vagaTipo: {
    fontSize: '10px', padding: '1px 6px', borderRadius: '10px',
    backgroundColor: '#e8f4fd', color: '#2980b9', marginLeft: '2px',
  },
  resumoEnvio: {
    background: '#f0faf0',
    border: '1px solid #a5d6a7',
    borderRadius: '8px',
    padding: '10px 14px',
    marginBottom: '12px',
  },
  submitBtn: {
    width: '100%', padding: '14px',
    backgroundColor: '#e67e22', color: '#fff',
    border: 'none', borderRadius: '10px',
    fontSize: '16px', fontWeight: 700, cursor: 'pointer', marginTop: '20px',
  },
  erro: {
    backgroundColor: '#fff3cd', color: '#856404',
    padding: '12px', borderRadius: '8px', fontSize: '14px', marginTop: '12px',
  },
  loadingBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '60vh',
  },
  spinner: {
    width: '40px', height: '40px',
    border: '4px solid #f0e6d3', borderTop: '4px solid #e67e22',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
};

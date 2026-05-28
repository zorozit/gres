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
  // Suporta tanto /vaga/:vagaId quanto /vaga/:unitId (legado)
  const { vagaId } = useParams<{ vagaId: string }>();
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [vagaPrincipal, setVagaPrincipal] = useState<Vaga | null>(null);
  const [nomeUnidade, setNomeUnidade] = useState('');
  const [unitId, setUnitId] = useState('');
  const [form, setForm] = useState(initialForm);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);
  const [encerrada, setEncerrada] = useState(false);

  useEffect(() => {
    if (!vagaId) return;
    // Tenta primeiro como vagaId, depois como unitId (legado)
    fetch(`${API_URL}/vagas-publicas?vagaId=${vagaId}`)
      .then(r => r.json())
      .then(d => {
        if (d.encerrada) {
          setEncerrada(true);
          return;
        }
        if (d.vaga) {
          // Modo vagaId
          setVagaPrincipal(d.vaga);
          setVagas(d.vagas || [d.vaga]);
          setNomeUnidade(d.nomeUnidade || '');
          setUnitId(d.vaga.unitId);
          // Pré-selecionar a vaga do link
          setForm(prev => ({ ...prev, vagasInteresse: [d.vaga.titulo] }));
        } else if (d.vagas) {
          // Modo unitId legado
          setVagas(d.vagas || []);
          setNomeUnidade(d.nomeUnidade || '');
          setUnitId(vagaId);
        }
      })
      .catch(() => setErro('Erro ao carregar o formulário. Tente novamente.'))
      .finally(() => setLoading(false));
  }, [vagaId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleMultiCheck = (field: 'vagasInteresse' | 'diasDisponiveis' | 'segmentosExperiencia', value: string) => {
    setForm(prev => {
      const arr = prev[field] as string[];
      return {
        ...prev,
        [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value],
      };
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
          vagaId: vagaPrincipal?.id || null,
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

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingBox}>
          <div style={styles.spinner} />
          <p style={{ color: '#888', marginTop: '16px' }}>Carregando formulário...</p>
        </div>
      </div>
    );
  }

  if (encerrada) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
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
      <div style={styles.container}>
        <div style={styles.card}>
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

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header rico */}
        <div style={styles.header}>
          {nomeUnidade && <p style={styles.unidade}>{nomeUnidade}</p>}
          <h1 style={styles.title}>
            {vagaPrincipal ? vagaPrincipal.titulo : 'Formulário de Candidatura'}
          </h1>

          {/* Endereço */}
          {(vagaPrincipal as any)?.endereco && (
            <p style={styles.headerInfo}>
              📍 {(vagaPrincipal as any).endereco}
            </p>
          )}

          {/* Horários */}
          {(vagaPrincipal as any)?.horarios && (
            <div style={styles.headerBlock}>
              <strong>Horários de funcionamento:</strong>
              <div style={{ whiteSpace: 'pre-line', marginTop: '4px' }}>
                {(vagaPrincipal as any).horarios}
              </div>
            </div>
          )}

          {/* Benefícios */}
          {(vagaPrincipal as any)?.beneficios && (
            <div style={styles.headerBlock}>
              <strong>Modelo de contratação:</strong>
              <div style={{ whiteSpace: 'pre-line', marginTop: '4px' }}>
                {(vagaPrincipal as any).beneficios}
              </div>
            </div>
          )}

          {/* WhatsApp */}
          {(vagaPrincipal as any)?.whatsapp && (
            <div style={{ ...styles.headerBlock, backgroundColor: '#e8f5e9', borderLeft: '3px solid #27ae60' }}>
              <strong>✅ Próximo passo:</strong> após enviar o formulário, entre em contato pelo WhatsApp&nbsp;
              <a
                href={`https://wa.me/55${(vagaPrincipal as any).whatsapp.replace(/\D/g,'')}`}
                target="_blank" rel="noopener noreferrer"
                style={{ color: '#27ae60', fontWeight: 700 }}
              >
                {(vagaPrincipal as any).whatsapp}
              </a>
              &nbsp;com uma breve apresentação: vaga desejada + experiência + disponibilidade + bairro/cidade.
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Dados pessoais */}
          <Section title="📋 Dados Pessoais">
            <Field label="Nome completo *">
              <input style={styles.input} name="nome" value={form.nome} onChange={handleChange} required placeholder="Seu nome completo" />
            </Field>
            <Field label="E-mail *">
              <input style={styles.input} type="email" name="email" value={form.email} onChange={handleChange} required placeholder="seu@email.com" />
            </Field>
            <Field label="Celular / WhatsApp *">
              <input style={styles.input} name="celular" value={form.celular} onChange={handleChange} required placeholder="(11) 99999-9999" />
            </Field>
            <Field label="Cidade / Bairro">
              <input style={styles.input} name="cidadeBairro" value={form.cidadeBairro} onChange={handleChange} placeholder="Ex: São Paulo - Pinheiros" />
            </Field>
            <Field label="Idade">
              <input style={styles.input} type="number" name="idade" value={form.idade} onChange={handleChange} placeholder="Ex: 25" min="16" max="99" />
            </Field>
          </Section>

          {/* Vagas — se houver mais de uma disponível */}
          {vagas.length > 0 && (
            <Section title="💼 Vagas de Interesse *">
              <div style={styles.checkGrid}>
                {vagas.map(v => (
                  <label key={v.id} style={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={form.vagasInteresse.includes(v.titulo)}
                      onChange={() => handleMultiCheck('vagasInteresse', v.titulo)}
                      style={styles.checkbox}
                    />
                    <span>{v.titulo}</span>
                    {v.tipo && v.tipo !== 'Ambos' && (
                      <span style={styles.vagaTipo}>{v.tipo}</span>
                    )}
                  </label>
                ))}
              </div>
            </Section>
          )}

          {/* Contratação */}
          <Section title="📄 Contratação e Disponibilidade">
            <Field label="Tipo de contratação desejada">
              <select style={styles.input} name="tipoContratacao" value={form.tipoContratacao} onChange={handleChange}>
                <option value="">Selecione...</option>
                {TIPOS_CONTRATACAO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Pretensão de ganho (mensal CLT / diário Freelancer)">
              <input style={styles.input} name="pretensaoGanho" value={form.pretensaoGanho} onChange={handleChange} placeholder="Ex: R$ 1.800 CLT / R$ 130 diária" />
            </Field>
            <Field label="Quando pode começar?">
              <select style={styles.input} name="quandoComeca" value={form.quandoComeca} onChange={handleChange}>
                <option value="">Selecione...</option>
                {QUANDO_COMECA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Preferência de turno">
              <select style={styles.input} name="turnoPref" value={form.turnoPref} onChange={handleChange}>
                <option value="">Selecione...</option>
                {TURNOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Quais dias pode trabalhar?">
              <div style={styles.checkGrid}>
                {DIAS_SEMANA.map(d => (
                  <label key={d} style={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={form.diasDisponiveis.includes(d)}
                      onChange={() => handleMultiCheck('diasDisponiveis', d)}
                      style={styles.checkbox}
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
              <select style={styles.input} name="tempoExperiencia" value={form.tempoExperiencia} onChange={handleChange}>
                <option value="">Selecione...</option>
                {TEMPOS_EXPERIENCIA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Já trabalhou com (marque todos que se aplicam):">
              <div style={styles.checkGrid}>
                {SEGMENTOS.map(s => (
                  <label key={s} style={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={form.segmentosExperiencia.includes(s)}
                      onChange={() => handleMultiCheck('segmentosExperiencia', s)}
                      style={styles.checkbox}
                    />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Em 2–3 linhas: faça um breve resumo da sua experiência">
              <textarea
                style={{ ...styles.input, minHeight: '90px', resize: 'vertical' }}
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
              <input style={styles.input} type="number" name="gastoTransporte" value={form.gastoTransporte} onChange={handleChange} placeholder="Ex: 15" min="0" />
            </Field>
          </Section>

          {/* Complementar */}
          <Section title="📎 Informações Complementares">
            <Field label="Referência (nome do estabelecimento e telefone — opcional)">
              <input style={styles.input} name="referencia" value={form.referencia} onChange={handleChange} placeholder="Ex: Restaurante XYZ - (11) 3333-4444" />
            </Field>
            <Field label="Currículo (link Google Drive, LinkedIn, etc. — opcional)">
              <input style={styles.input} name="curriculo" value={form.curriculo} onChange={handleChange} placeholder="https://..." />
            </Field>
          </Section>

          {erro && <div style={styles.erro}>{erro}</div>}

          <button type="submit" style={styles.submitBtn} disabled={enviando}>
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
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#e67e22', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid #f0e6d3', margin: '0 0 12px' }}>{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '5px' }}>{label}</label>
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
const styles: Record<string, React.CSSProperties> = {
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
  header: {
    textAlign: 'center',
    marginBottom: '28px',
    paddingBottom: '20px',
    borderBottom: '2px solid #e67e22',
  },
  unidade: { fontSize: '13px', color: '#e67e22', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' },
  title: { fontSize: '22px', fontWeight: 700, color: '#2c2c2c', margin: '0 0 6px' },
  subtitle: { fontSize: '14px', color: '#888', margin: 0 },
  headerInfo: { fontSize: '14px', color: '#666', margin: '8px 0 0', textAlign: 'left' as const },
  headerBlock: {
    fontSize: '14px', color: '#555', margin: '12px 0 0',
    padding: '10px 12px', backgroundColor: '#fef9f0',
    borderLeft: '3px solid #e67e22', borderRadius: '4px',
    lineHeight: '1.6', textAlign: 'left' as const,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#333',
    backgroundColor: '#fafafa',
    boxSizing: 'border-box',
    outline: 'none',
  },
  checkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
    gap: '8px',
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: '6px',
    backgroundColor: '#f8f8f8',
    userSelect: 'none',
  },
  checkbox: { width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 },
  vagaTipo: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '10px',
    backgroundColor: '#e8f4fd',
    color: '#2980b9',
    marginLeft: '2px',
  },
  submitBtn: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#e67e22',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '20px',
  },
  erro: {
    backgroundColor: '#fff3cd',
    color: '#856404',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    marginTop: '12px',
  },
  loadingBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' },
  spinner: {
    width: '40px', height: '40px',
    border: '4px solid #f0e6d3',
    borderTop: '4px solid #e67e22',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};

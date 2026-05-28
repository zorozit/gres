import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const TIPOS_CONTRATACAO = ['CLT', 'Freelancer', 'Ambos'];
const TEMPOS_EXPERIENCIA = ['Não tenho experiência', 'Menos de 1 ano', 'Entre 1 e 3 anos', 'Entre 3 a 5 anos', 'Mais de 5 anos'];
const QUANDO_COMECA = ['Imediato', 'Até 7 dias', 'Até 15 dias', 'Até 30 dias'];
const TURNOS = ['Dia', 'Noite', 'Ambos'];

interface Vaga {
  id: string;
  titulo: string;
  tipo: string;
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
  curriculo: '',
};

export default function FormularioVaga() {
  const { unitId } = useParams<{ unitId: string }>();
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [nomeUnidade, setNomeUnidade] = useState('');
  const [form, setForm] = useState(initialForm);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!unitId) return;
    fetch(`${API_URL}/vagas-publicas?unitId=${unitId}`)
      .then(r => r.json())
      .then(d => {
        setVagas(d.vagas || []);
        setNomeUnidade(d.nomeUnidade || '');
      })
      .catch(() => setErro('Erro ao carregar vagas. Tente novamente.'))
      .finally(() => setLoading(false));
  }, [unitId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleMultiCheck = (field: 'vagasInteresse' | 'diasDisponiveis', value: string) => {
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
          gastoTransporte: Number(form.gastoTransporte) || 0,
          idade: Number(form.idade) || 0,
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
        <div style={styles.loading}>Carregando formulário...</div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>✅</div>
          <h2 style={styles.successTitle}>Candidatura enviada com sucesso!</h2>
          <p style={styles.successText}>
            Obrigado, <strong>{form.nome}</strong>! Recebemos sua candidatura
            {nomeUnidade ? ` para o ${nomeUnidade}` : ''}.
          </p>
          <p style={styles.successText}>
            Entraremos em contato em breve pelo celular ou e-mail informado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>
            {nomeUnidade ? `${nomeUnidade}` : 'Formulário de Candidatura'}
          </h1>
          <p style={styles.subtitle}>Preencha o formulário abaixo para se candidatar a uma vaga</p>
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

          {/* Vagas de interesse */}
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
                    {v.titulo}
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
            <Field label="Pretensão de Ganho (CLT mensal / Freelancer diário)">
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
            <Field label="Tempo de experiência">
              <select style={styles.input} name="tempoExperiencia" value={form.tempoExperiencia} onChange={handleChange}>
                <option value="">Selecione...</option>
                {TEMPOS_EXPERIENCIA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Já trabalhou com buffet / pizzaria?">
              <RadioGroup name="trabalhouBuffet" value={form.trabalhouBuffet} options={['Sim', 'Não']} onChange={v => setForm(p => ({ ...p, trabalhouBuffet: v }))} />
            </Field>
            <Field label="Em 2–3 linhas: como você lida com pressão e pico de movimento?">
              <textarea
                style={{ ...styles.input, minHeight: '90px', resize: 'vertical' }}
                name="lidarPressao"
                value={form.lidarPressao}
                onChange={handleChange}
                placeholder="Conte brevemente como você se comporta em situações de muito movimento..."
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
            <Field label="Contato de referência (nome do estabelecimento e telefone — opcional)">
              <input style={styles.input} name="referencia" value={form.referencia} onChange={handleChange} placeholder="Ex: Restaurante XYZ - (11) 3333-4444" />
            </Field>
            <Field label="Link do currículo (Google Drive, LinkedIn, etc. — opcional)">
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#e67e22', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid #f0e6d3' }}>{title}</h3>
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
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#2c2c2c',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#888',
    marginTop: '6px',
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
    transition: 'border 0.2s',
    outline: 'none',
  },
  checkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '8px',
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px',
    backgroundColor: '#f8f8f8',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  vagaTipo: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '10px',
    backgroundColor: '#e8f4fd',
    color: '#2980b9',
    marginLeft: '4px',
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
    transition: 'background 0.2s',
  },
  erro: {
    backgroundColor: '#fff3cd',
    color: '#856404',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    marginTop: '12px',
  },
  loading: {
    textAlign: 'center',
    padding: '80px 20px',
    fontSize: '16px',
    color: '#888',
  },
  successIcon: {
    fontSize: '64px',
    textAlign: 'center',
    marginBottom: '16px',
  },
  successTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#27ae60',
    textAlign: 'center',
    marginBottom: '12px',
  },
  successText: {
    fontSize: '15px',
    color: '#555',
    textAlign: 'center',
    lineHeight: '1.6',
    marginBottom: '8px',
  },
};

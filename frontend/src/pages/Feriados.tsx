import { useState } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { carregarFeriados, salvarFeriados, FERIADOS_DEFAULT } from '../utils/feriados';

const fmtDataBR = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const diaSemana = (iso: string) => {
  const dt = new Date(iso + 'T12:00:00');
  return ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][dt.getDay()];
};

export default function Feriados() {
  const [feriados, setFeriados] = useState<Record<string, string>>(carregarFeriados());
  const [novaData, setNovaData] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [filtroAno, setFiltroAno] = useState('2026');

  const persistir = (novo: Record<string, string>) => {
    setFeriados(novo);
    salvarFeriados(novo);
  };

  const adicionar = () => {
    if (!novaData || !novoNome.trim()) {
      alert('Informe data e nome do feriado.');
      return;
    }
    persistir({ ...feriados, [novaData]: novoNome.trim() });
    setNovaData('');
    setNovoNome('');
  };

  const remover = (data: string) => {
    if (!window.confirm(`Remover feriado ${fmtDataBR(data)} - ${feriados[data]}?`)) return;
    const novo = { ...feriados };
    delete novo[data];
    persistir(novo);
  };

  const restaurarDefault = () => {
    if (!window.confirm('Restaurar lista padrão de feriados nacionais 2026? Suas adições serão perdidas.')) return;
    persistir({ ...FERIADOS_DEFAULT });
  };

  const lista = Object.entries(feriados)
    .filter(([d]) => !filtroAno || d.startsWith(filtroAno))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f4f6f9' }}>
      <Header title="🎉 Feriados" showBack={true} />
      <div style={{ flex: 1, padding: 20, maxWidth: 900, margin: '0 auto', width: '100%' }}>

        <div style={{ backgroundColor: '#fff3e0', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#5d4037', borderLeft: '4px solid #fb8c00' }}>
          ℹ️ <strong>Os feriados configurados aqui afetam o cálculo da Folha</strong> (cód. 1311 - dobra do dia).
          Quando colaborador tem presença confirmada em data de feriado, o sistema soma 1 dia adicional aos vencimentos.
          <div style={{ fontSize: 11, marginTop: 4 }}>
            Os dados ficam salvos no navegador (localStorage). Cada usuário precisa configurar a lista uma vez.
          </div>
        </div>

        {/* Adicionar */}
        <div style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, border: '1px solid #e0e0e0', marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 10px', color: '#1565c0' }}>➕ Adicionar feriado</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 11, color: '#666' }}>Data</label>
              <input type="date" value={novaData} onChange={e => setNovaData(e.target.value)}
                style={{ display: 'block', padding: 6, border: '1px solid #ccc', borderRadius: 4 }} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, color: '#666' }}>Nome do feriado</label>
              <input type="text" value={novoNome} onChange={e => setNovoNome(e.target.value)}
                placeholder="Ex: Aniversário da cidade"
                style={{ display: 'block', width: '100%', padding: 6, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' as const }} />
            </div>
            <button onClick={adicionar}
              style={{ padding: '8px 14px', backgroundColor: '#43a047', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
              + Adicionar
            </button>
          </div>
        </div>

        {/* Filtro + lista */}
        <div style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, border: '1px solid #e0e0e0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, color: '#1565c0' }}>📅 Lista de feriados</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)}
                style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4 }}>
                <option value="">Todos</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
              <button onClick={restaurarDefault}
                style={{ padding: '6px 12px', backgroundColor: '#fff', color: '#fb8c00', border: '1px solid #fb8c00', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                ↻ Restaurar padrão
              </button>
            </div>
          </div>

          {lista.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>Nenhum feriado para o filtro.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Data</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Dia da semana</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Nome</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #ddd', width: 80 }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(([data, nome]) => (
                  <tr key={data} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{fmtDataBR(data)}</td>
                    <td style={{ padding: '6px 8px', color: '#666' }}>{diaSemana(data)}</td>
                    <td style={{ padding: '6px 8px' }}>{nome}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <button onClick={() => remover(data)}
                        style={{ padding: '3px 10px', backgroundColor: '#fce4ec', color: '#c62828', border: '1px solid #c62828', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                        🗑️ Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <Footer showLinks={true} />
    </div>
  );
}

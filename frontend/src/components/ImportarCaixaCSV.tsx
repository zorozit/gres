import React, { useState } from 'react';

interface ImportarCaixaCSVProps {
  unitId: string;
  onImportSuccess: () => void;
  onClose: () => void;
}

interface MovimentoCSV {
  data: string;
  diaSemana: number;
  periodo: string;
  abertura: number;
  maq1: number;
  maq2: number;
  maq3: number;
  maq4: number;
  maq5: number;
  maq6: number;
  maq7: number;
  ifood: number;
  dinheiro: number;
  pix: number;
  fiado: number;
  total: number;
  sangria: number;
  sistema: number;
  diferenca: number;
  conferencia: string;
}

export const ImportarCaixaCSV: React.FC<ImportarCaixaCSVProps> = ({
  unitId,
  onImportSuccess,
  onClose
}) => {
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<MovimentoCSV[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(0);

  // Template CSV para download
  const templateCSV = `data,diaSemana,periodo,abertura,maq1,maq2,maq3,maq4,maq5,maq6,maq7,ifood,dinheiro,pix,fiado,total,sangria,sistema,diferenca,conferencia
01/01/2026,5,Dia,100.00,500.00,300.00,200.00,,,,,150.00,200.00,100.00,,1550.00,200.00,1550.00,0.00,Usuario
01/01/2026,5,Noite,50.00,300.00,200.00,150.00,,,,,100.00,150.00,50.00,,1000.00,100.00,1000.00,0.00,Usuario`;

  // Baixar template
  const downloadTemplate = () => {
    const blob = new Blob([templateCSV], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template-importacao-caixa.csv';
    link.click();
  };

  // Converter data DD/MM/YYYY para YYYY-MM-DD
  const parseData = (dataStr: string): string => {
    const [dia, mes, ano] = dataStr.split('/');
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  };

  // Converter valor (suporta vírgula e ponto como decimal)
  const parseValor = (valorStr: string): number => {
    if (!valorStr || valorStr.trim() === '' || valorStr === '-') return 0;
    
    // Remove pontos usados como separador de milhares (ex: 1.360,45)
    // Substitui vírgula decimal por ponto (ex: 87,55 -> 87.55)
    const normalizado = valorStr
      .replace(/\./g, '')  // Remove pontos (separador de milhares)
      .replace(/,/g, '.');  // Troca vírgula por ponto (decimal)
    
    const numero = parseFloat(normalizado);
    return isNaN(numero) ? 0 : numero;
  };

  // Detectar separador (ponto-vírgula, vírgula ou TAB)
  const detectarSeparador = (texto: string): string => {
    const primeiraLinha = texto.split('\n')[0];
    
    // Contar ocorrências de cada separador
    const countPontoVirgula = (primeiraLinha.match(/;/g) || []).length;
    const countVirgula = (primeiraLinha.match(/,/g) || []).length;
    const countTab = (primeiraLinha.match(/\t/g) || []).length;
    
    // Escolher o separador mais frequente
    if (countPontoVirgula > countVirgula && countPontoVirgula > countTab) {
      return ';';
    } else if (countTab > 0) {
      return '\t';
    } else {
      return ',';
    }
  };

  // Processar CSV ou dados do Excel (TAB)
  const processarCSV = () => {
    try {
      const linhas = csvText.trim().split('\n').filter(l => l.trim());
      if (linhas.length < 2) {
        alert('❌ Dados devem conter ao menos o cabeçalho e uma linha de dados');
        return;
      }

      const separador = detectarSeparador(csvText);
      const nomesSeparadores: { [key: string]: string } = {
        ';': 'PONTO-VÍRGULA (;)',
        '\t': 'TAB (Excel)',
        ',': 'VÍRGULA (,)'
      };
      console.log('🔍 Separador detectado:', nomesSeparadores[separador] || separador);

      const cabecalho = linhas[0].split(separador).map(c => c.trim());
      const movimentos: MovimentoCSV[] = [];

      // Validar colunas obrigatórias
      const colunasObrigatorias = ['data', 'periodo'];
      const colunasFaltando = colunasObrigatorias.filter(col => !cabecalho.includes(col));
      if (colunasFaltando.length > 0) {
        alert(`❌ Colunas obrigatórias faltando: ${colunasFaltando.join(', ')}\n\n` +
              `Colunas encontradas: ${cabecalho.join(', ')}`);
        return;
      }

      for (let i = 1; i < linhas.length; i++) {
        const valores = linhas[i].split(separador).map(v => v.trim());
        const mov: any = {};

        cabecalho.forEach((campo, idx) => {
          mov[campo] = valores[idx] || '';
        });

        movimentos.push({
          data: mov.data,
          diaSemana: parseInt(mov.diaSemana) || 0,
          periodo: mov.periodo,
          abertura: parseValor(mov.abertura),
          maq1: parseValor(mov.maq1),
          maq2: parseValor(mov.maq2),
          maq3: parseValor(mov.maq3),
          maq4: parseValor(mov.maq4),
          maq5: parseValor(mov.maq5),
          maq6: parseValor(mov.maq6),
          maq7: parseValor(mov.maq7),
          ifood: parseValor(mov.ifood),
          dinheiro: parseValor(mov.dinheiro),
          pix: parseValor(mov.pix),
          fiado: parseValor(mov.fiado),
          total: parseValor(mov.total),
          sangria: parseValor(mov.sangria),
          sistema: parseValor(mov.sistema),
          diferenca: parseValor(mov.diferenca),
          conferencia: mov.conferencia || 'Sistema'
        });
      }

      setPreview(movimentos);
      setErrors([]);
      alert(`✅ ${movimentos.length} movimentos processados com sucesso!`);
    } catch (error) {
      alert('❌ Erro ao processar dados: ' + (error as Error).message);
    }
  };

  // Upload de arquivo CSV
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const texto = e.target?.result as string;
      setCsvText(texto);
      alert('✅ Arquivo carregado! Clique em "🔍 Processar e Visualizar"');
    };
    reader.onerror = () => {
      alert('❌ Erro ao ler arquivo');
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Importar movimentos
  const importar = async () => {
    if (preview.length === 0) {
      alert('Nenhum movimento para importar');
      return;
    }

    setImporting(true);
    setErrors([]);
    setSuccess(0);
    setProgress(0);

    const apiUrl = import.meta.env.VITE_API_ENDPOINT || 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';

    let sucessos = 0;
    const errosTemp: string[] = [];

    for (let i = 0; i < preview.length; i++) {
      const mov = preview[i];

      try {
        const dataISO = parseData(mov.data);
        const timestamp = new Date(dataISO + 'T00:00:00').getTime();
        const random = Math.random().toString(36).substring(2, 8);
        const id = `caixa-${timestamp}-${random}`;

        const payload = {
          id,
          unitId,
          data: dataISO,
          diaSemana: mov.diaSemana,
          periodo: mov.periodo,
          abertura: mov.abertura,
          maq1: mov.maq1,
          maq2: mov.maq2,
          maq3: mov.maq3,
          maq4: mov.maq4,
          maq5: mov.maq5,
          maq6: mov.maq6,
          maq7: mov.maq7,
          ifood: mov.ifood,
          dinheiro: mov.dinheiro,
          pix: mov.pix,
          fiado: mov.fiado,
          total: mov.total,
          sangria: mov.sangria,
          sistema: mov.sistema,
          sistemaPdv: mov.sistema,
          diferenca: mov.diferenca,
          responsavel: mov.conferencia,
          responsavelNome: mov.conferencia,
          status: 'fechado',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const response = await fetch(`${apiUrl}/caixa`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          sucessos++;
        } else {
          errosTemp.push(`${mov.data} ${mov.periodo}: ${response.statusText}`);
        }
      } catch (error) {
        errosTemp.push(`${mov.data} ${mov.periodo}: ${(error as Error).message}`);
      }

      setProgress(Math.round(((i + 1) / preview.length) * 100));
      setSuccess(sucessos);
      setErrors(errosTemp);

      // Delay para evitar throttling
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setImporting(false);

    if (sucessos === preview.length) {
      alert(`✅ Importação concluída! ${sucessos} movimentos importados.`);
      onImportSuccess();
    } else {
      alert(`⚠️ Importação parcial: ${sucessos} sucessos, ${errosTemp.length} erros.`);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>📊 Importar Movimentos de Caixa (CSV)</h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.content}>
          {/* Botão para download do template */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>1️⃣ Baixar Template</h3>
            <button onClick={downloadTemplate} style={styles.btnDownload}>
              📥 Baixar Template CSV
            </button>
            <p style={styles.hint}>
              Use este arquivo como modelo para preparar seus dados
            </p>
          </div>

          {/* Upload de arquivo */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>2️⃣ Fazer Upload do Arquivo</h3>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              style={styles.fileInput}
              disabled={importing}
            />
            <p style={styles.hint}>
              📎 Selecione um arquivo CSV ou TXT do seu computador
            </p>
          </div>

          {/* Área de texto para colar CSV */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>3️⃣ OU Cole Dados do Excel/Planilha</h3>
            <p style={styles.hint}>
              💡 <strong>Como colar do Excel:</strong><br/>
              1. Selecione as células no Excel (incluindo cabeçalho)<br/>
              2. Pressione Ctrl+C (copiar)<br/>
              3. Cole aqui no campo abaixo (Ctrl+V)<br/>
              4. O sistema detecta automaticamente se é CSV (vírgula) ou Excel (TAB)
            </p>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Cole aqui os dados da planilha...&#10;&#10;Colunas obrigatórias: data, periodo&#10;&#10;Exemplo (copie do Excel e cole aqui):&#10;data	diaSemana	periodo	abertura	maq1	maq2...&#10;01/01/2026	5	Dia	100.00	500.00	300.00..."
              style={styles.textarea}
              disabled={importing}
            />
            <button
              onClick={processarCSV}
              style={styles.btnProcess}
              disabled={!csvText || importing}
            >
              🔍 Processar e Visualizar
            </button>
          </div>

          {/* Preview dos dados */}
          {preview.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                4️⃣ Preview ({preview.length} movimentos) ✅
              </h3>
              <div style={styles.previewContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={{padding: '8px'}}>Data</th>
                      <th style={{padding: '8px'}}>Período</th>
                      <th style={{padding: '8px'}}>Total</th>
                      <th style={{padding: '8px'}}>Sangria</th>
                      <th style={{padding: '8px'}}>Sistema</th>
                      <th style={{padding: '8px'}}>Dif</th>
                      <th style={{padding: '8px'}}>Resp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((mov, idx) => (
                      <tr key={idx} style={styles.tableRow}>
                        <td style={{padding: '8px'}}>{mov.data}</td>
                        <td style={{padding: '8px'}}>{mov.periodo}</td>
                        <td style={{padding: '8px'}}>R$ {mov.total.toFixed(2)}</td>
                        <td style={{padding: '8px'}}>R$ {mov.sangria.toFixed(2)}</td>
                        <td style={{padding: '8px'}}>R$ {mov.sistema.toFixed(2)}</td>
                        <td style={{ 
                          padding: '8px',
                          color: mov.diferenca >= 0 ? 'green' : 'red',
                          fontWeight: 'bold'
                        }}>
                          R$ {mov.diferenca.toFixed(2)}
                        </td>
                        <td style={{padding: '8px'}}>{mov.conferencia}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 10 && (
                  <p style={styles.moreRecords}>
                    ... e mais {preview.length - 10} registros
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Botão de importação */}
          {preview.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>5️⃣ Importar para o Sistema</h3>
              <button
                onClick={importar}
                style={{
                  ...styles.btnImport,
                  opacity: importing ? 0.6 : 1,
                  cursor: importing ? 'not-allowed' : 'pointer'
                }}
                disabled={importing}
              >
                {importing ? '⏳ Importando...' : '🚀 Importar Todos'}
              </button>

              {importing && (
                <div style={styles.progressContainer}>
                  <div style={styles.progressBar}>
                    <div
                      style={{
                        ...styles.progressFill,
                        width: `${progress}%`
                      }}
                    />
                  </div>
                  <p style={styles.progressText}>
                    {progress}% - {success} sucessos / {errors.length} erros
                  </p>
                </div>
              )}

              {errors.length > 0 && (
                <div style={styles.errorContainer}>
                  <strong>⚠️ Erros:</strong>
                  <ul style={styles.errorList}>
                    {errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                  {errors.length > 5 && (
                    <p>... e mais {errors.length - 5} erros</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.btnCancel}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px'
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    maxWidth: '900px',
    width: '100%',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
  },
  header: {
    padding: '20px 24px',
    borderBottom: '2px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#667eea',
    color: 'white',
    borderTopLeftRadius: '12px',
    borderTopRightRadius: '12px'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 'bold'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    color: 'white',
    cursor: 'pointer',
    padding: '0 8px'
  },
  content: {
    padding: '24px',
    overflowY: 'auto' as const,
    flex: 1
  },
  section: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px'
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '12px',
    color: '#333'
  },
  hint: {
    fontSize: '13px',
    color: '#666',
    margin: '8px 0 0 0'
  },
  btnDownload: {
    padding: '10px 20px',
    backgroundColor: '#4caf50',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.3s'
  },
  textarea: {
    width: '100%',
    minHeight: '150px',
    padding: '12px',
    border: '2px solid #ddd',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'monospace',
    resize: 'vertical' as const,
    marginBottom: '12px'
  },
  btnProcess: {
    padding: '10px 20px',
    backgroundColor: '#2196f3',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '8px'
  },
  fileInput: {
    padding: '10px',
    fontSize: '14px',
    border: '2px dashed #2196f3',
    borderRadius: '6px',
    width: '100%',
    cursor: 'pointer',
    backgroundColor: '#f0f7ff'
  },
  previewContainer: {
    maxHeight: '300px',
    overflowY: 'auto' as const,
    border: '1px solid #ddd',
    borderRadius: '6px',
    backgroundColor: 'white'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px'
  },
  tableHeader: {
    backgroundColor: '#667eea',
    color: 'white',
    position: 'sticky' as const,
    top: 0
  },
  tableRow: {
    borderBottom: '1px solid #eee'
  },
  moreRecords: {
    padding: '8px',
    textAlign: 'center' as const,
    color: '#666',
    fontSize: '13px'
  },
  btnImport: {
    padding: '12px 32px',
    backgroundColor: '#ff5722',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    width: '100%'
  },
  progressContainer: {
    marginTop: '16px'
  },
  progressBar: {
    width: '100%',
    height: '24px',
    backgroundColor: '#e0e0e0',
    borderRadius: '12px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4caf50',
    transition: 'width 0.3s'
  },
  progressText: {
    textAlign: 'center' as const,
    marginTop: '8px',
    fontSize: '14px',
    fontWeight: 'bold'
  },
  errorContainer: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#ffebee',
    border: '1px solid #f44336',
    borderRadius: '6px',
    fontSize: '13px'
  },
  errorList: {
    margin: '8px 0',
    paddingLeft: '20px'
  },
  footer: {
    padding: '16px 24px',
    borderTop: '2px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'flex-end'
  },
  btnCancel: {
    padding: '10px 24px',
    backgroundColor: '#999',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer'
  }
};

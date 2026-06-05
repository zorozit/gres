import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export type DocumentoFolhaTipo = 'adiantamento' | 'folha';
export type LayoutFolhaCodigo = 'ems-recibo-pagamento';

export interface ImportPayrollRecord {
  id: string;
  layout: LayoutFolhaCodigo;
  tipoDocumento: DocumentoFolhaTipo;
  empresaNome: string;
  empresaCnpj: string;
  competenciaMesNome: string;
  competenciaMes: string;
  competenciaAno: string;
  competencia: string;
  codigoColaborador: string;
  nomeColaborador: string;
  cargo: string;
  cbo: string;
  salarioBase: number;
  salContrInss: number;        // Sal.Contr.INSS do PDF (base real p/ cálculo INSS)
  inssValor: number;           // Cód.11 - INSS descontado no holerite
  valeTransporte: number;      // Cód.109 - Desconto Vale Transporte
  feriado: number;             // Cód.1311 - Valor do feriado trabalhado
  referencia: number;
  valorDocumento: number;
  valorLiquido: number;
  pagina: number;
  observacaoLayout: string;
  brutoTexto?: string;
  rawText: string;
}

export interface ImportPayrollParseResult {
  layout: LayoutFolhaCodigo;
  tipoDocumento: DocumentoFolhaTipo;
  empresaNome: string;
  empresaCnpj: string;
  competencia: string;
  records: ImportPayrollRecord[];
  warnings: string[];
}

const PT_MONTHS: Record<string, string> = {
  janeiro: '01',
  fevereiro: '02',
  marco: '03',
  março: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12',
};

const normalize = (value: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const toMoney = (value: string | undefined | null): number => {
  if (!value) return 0;
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const amount = parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
};

const formatCompetencia = (mesNome: string, ano: string) => {
  const key = normalize(mesNome);
  const month = PT_MONTHS[key] || '01';
  return `${ano}-${month}`;
};

const moneyRegex = /\d{1,3}(?:\.\d{3})*,\d{2}/g;

const findMoneyNear = (lines: string[], anchorMatcher: (line: string) => boolean) => {
  const anchorIndex = lines.findIndex(anchorMatcher);
  if (anchorIndex < 0) return 0;
  const offsets = [-1, 1, -2, 2, -3, 3];
  for (const offset of offsets) {
    const line = lines[anchorIndex + offset];
    if (!line) continue;
    const matches = line.match(moneyRegex);
    if (matches?.length) {
      return toMoney(matches[matches.length - 1]);
    }
  }
  return 0;
};

const collapseDuplicateBlock = (lines: string[]) => {
  if (!lines.length) return lines;
  const first = lines[0];
  const repeatedIndex = lines.findIndex((line, index) => index > 3 && line === first);
  return repeatedIndex > 0 ? lines.slice(0, repeatedIndex) : lines;
};

const buildLinesFromPdfPage = async (pdf: PDFDocumentProxy, pageNumber: number): Promise<string[]> => {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const rows: Array<{ y: number; items: Array<{ x: number; str: string }> }> = [];

  for (const rawItem of content.items) {
    const item = rawItem as TextItem;
    const str = (item.str || '').trim();
    if (!str) continue;
    const x = item.transform[4];
    const y = item.transform[5];

    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, str });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.items.sort((a, b) => a.x - b.x).map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
};

const detectEmsLayout = (pageTexts: string[]) => {
  // Normaliza acentos (ó → o, á → a) antes do match para aceitar PDFs gerados
  // por sistemas que mantêm acentos (Domínio, Folhamatic) além do EMS.
  const sample = pageTexts.join('\n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return sample.includes('RECIBO DE PAGAMENTO') && sample.includes('CODIGO NOME CBO') && sample.includes('SALARIO BASE');
};



const parseEmsReceiptPage = (lines: string[], pageNumber: number): ImportPayrollRecord | null => {
  const compactLines = collapseDuplicateBlock(lines);
  const blob = compactLines.join('\n');
  const kind: DocumentoFolhaTipo = /\bADTO\b/i.test(blob) ? 'adiantamento' : 'folha';

  const cnpjMatch = blob.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  const competenceMatch = blob.match(/(Janeiro|Fevereiro|Março|Marco|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\/(\d{4})/i);
  const employeeLineIndex = compactLines.findIndex((line) => /^\d+\s+.+\s+\d{6}\s+\d+\s+\d+\s+\d+\s+\d+$/i.test(line));
  if (employeeLineIndex < 0 || !cnpjMatch || !competenceMatch) return null;

  const employeeMatch = compactLines[employeeLineIndex].match(/^(\d+)\s+(.+?)\s+(\d{6})\s+\d+\s+\d+\s+\d+\s+\d+$/i);
  if (!employeeMatch) return null;

  const companyLine = compactLines[0] || '';
  const companyName = companyLine.replace(/\s+RECIBO DE PAGAMENTO$/i, '').trim() || 'Empresa não identificada';
  const cargo = compactLines[employeeLineIndex + 1] || '';

  const refAdvanceMatch = blob.match(/Adiantamento Cr[eé]dito\s+([\d.,]+)\s+([\d.,]+)/i);

  // Salário Base
  const salaryBaseMatch = blob.match(/Salario Base(?:[^\n]*?)\n([\d.,]+)/i) || blob.match(/Salario Base\s+([\d.,]+)/i);
  const salarioBase = toMoney(salaryBaseMatch?.[1]);

  // Sal.Contr.INSS — base real usada pela contabilidade para calcular o INSS
  // Aparece após "Sal.Contr.INSS" ou "Sal.Contr.INSS Base Calculo FGTS" no PDF
  const salContrInssMatch =
    blob.match(/Sal\.Contr\.INSS[^\n]*\n([\d.,]+)/i) ||
    blob.match(/Sal\.Contr\.INSS\s+([\d.,]+)/i);
  const salContrInss = toMoney(salContrInssMatch?.[1]) || salarioBase;

  // INSS (Cód. 11) — valor efetivamente descontado no holerite
  // Estratégia: localizar "INSS Sobre Salário" e pegar o valor monetário seguinte
  const inssLineIdx = compactLines.findIndex((l) => /INSS Sobre Sal/i.test(l));
  let inssValor = 0;
  if (inssLineIdx >= 0) {
    // O valor pode estar na mesma linha ou nas próximas 3
    const candidates = compactLines.slice(inssLineIdx, inssLineIdx + 4).join(' ');
    const allMoney = candidates.match(moneyRegex);
    if (allMoney) {
      // Pega o último valor monetário do bloco (valor do desconto)
      inssValor = toMoney(allMoney[allMoney.length - 1]);
    }
  }
  // Fallback: calcular via tabela progressiva 2026 sobre Sal.Contr.INSS
  if (!inssValor && salContrInss > 0) {
    const tabela = [
      { ate: 1518.00, aliq: 0.075 },
      { ate: 2793.88, aliq: 0.09 },
      { ate: 4190.83, aliq: 0.12 },
      { ate: 8157.41, aliq: 0.14 },
    ];
    let base = salContrInss;
    let anterior = 0;
    for (const faixa of tabela) {
      if (base <= 0) break;
      const faixaVal = Math.min(base, faixa.ate - anterior);
      inssValor += faixaVal * faixa.aliq;
      base -= faixaVal;
      anterior = faixa.ate;
      if (salContrInss <= faixa.ate) break;
    }
    inssValor = parseFloat(inssValor.toFixed(2));
  }

  // Vale Transporte (Cód. 109) — Desc. Vale Transporte
  const vtLineIdx = compactLines.findIndex((l) => /Desc\.?\s*Vale Transp/i.test(l) || /Vale Transporte/i.test(l));
  let valeTransporte = 0;
  if (vtLineIdx >= 0) {
    const vtBlock = compactLines.slice(vtLineIdx, vtLineIdx + 4).join(' ');
    const vtMoney = vtBlock.match(moneyRegex);
    if (vtMoney) valeTransporte = toMoney(vtMoney[vtMoney.length - 1]);
  }

  // Feriado (Cód. 1311)
  const ferLineIdx = compactLines.findIndex((l) => /Feriado/i.test(l));
  let feriado = 0;
  if (ferLineIdx >= 0) {
    const ferBlock = compactLines.slice(ferLineIdx, ferLineIdx + 3).join(' ');
    const ferMoney = ferBlock.match(moneyRegex);
    if (ferMoney) feriado = toMoney(ferMoney[ferMoney.length - 1]);
  }

  const totalLiquido = findMoneyNear(compactLines, (line) => /Total Liquido/i.test(line));

  const mesNome = competenceMatch[1];
  const ano = competenceMatch[2];
  const competencia = formatCompetencia(mesNome, ano);
  const valorAdiantamento = toMoney(refAdvanceMatch?.[2]);
  const referencia = toMoney(refAdvanceMatch?.[1]);
  const valorLiquido = kind === 'adiantamento' ? valorAdiantamento : (totalLiquido || valorAdiantamento);
  const valorDocumento = kind === 'adiantamento' ? valorAdiantamento : (totalLiquido || valorAdiantamento);

  return {
    id: `${competencia}:${employeeMatch[1]}:${kind}:${pageNumber}`,
    layout: 'ems-recibo-pagamento',
    tipoDocumento: kind,
    empresaNome: companyName,
    empresaCnpj: cnpjMatch[0],
    competenciaMesNome: mesNome,
    competenciaMes: competencia.split('-')[1],
    competenciaAno: ano,
    competencia,
    codigoColaborador: employeeMatch[1],
    nomeColaborador: employeeMatch[2].trim(),
    cargo: cargo.trim(),
    cbo: employeeMatch[3],
    salarioBase,
    salContrInss,
    inssValor,
    valeTransporte,
    feriado,
    referencia,
    valorDocumento,
    valorLiquido,
    pagina: pageNumber,
    observacaoLayout: kind === 'adiantamento' ? 'EMS ADTO' : 'EMS Folha',
    brutoTexto: salaryBaseMatch?.[1],
    rawText: blob,
  };
};

export const extractPdfPageTexts = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const lines = await buildLinesFromPdfPage(pdf, pageNumber);
    pages.push(lines.join('\n'));
  }

  return pages;
};

export const parsePayrollPdf = async (file: File): Promise<ImportPayrollParseResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const pageTexts: string[] = [];
  const warnings: string[] = [];
  const records: ImportPayrollRecord[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const lines = await buildLinesFromPdfPage(pdf, pageNumber);
    pageTexts.push(lines.join('\n'));
  }

  if (!detectEmsLayout(pageTexts)) {
    throw new Error('Layout não reconhecido. Hoje o importador está pronto para o recibo de pagamento da EMS Contabilidade.');
  }

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const lines = pageTexts[pageNumber - 1].split('\n').filter(Boolean);
    const parsed = parseEmsReceiptPage(lines, pageNumber);
    if (parsed) {
      records.push(parsed);
    } else {
      warnings.push(`Página ${pageNumber} não pôde ser convertida integralmente.`);
    }
  }

  const deduped = Array.from(new Map(records.map((record) => [record.id, record])).values());
  const first = deduped[0];

  return {
    layout: 'ems-recibo-pagamento',
    tipoDocumento: first?.tipoDocumento || 'adiantamento',
    empresaNome: first?.empresaNome || '',
    empresaCnpj: first?.empresaCnpj || '',
    competencia: first?.competencia || '',
    records: deduped,
    warnings,
  };
};

export const normalizeName = normalize;

export const buildDefaultPaymentDate = (competencia: string, tipo: DocumentoFolhaTipo) => {
  const [year, month] = competencia.split('-').map(Number);
  if (!year || !month) return '';
  if (tipo === 'adiantamento') {
    return `${String(year)}-${String(month).padStart(2, '0')}-20`;
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${String(nextYear)}-${String(nextMonth).padStart(2, '0')}-05`;
};

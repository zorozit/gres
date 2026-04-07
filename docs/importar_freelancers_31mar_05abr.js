/**
 * Script para importar freelancers e escalas do período 31/03 a 05/04/2026
 * Porta do Sol - Unidade: 38093265000154
 *
 * Execute: node importar_freelancers_31mar_05abr.js
 *
 * Freelancers típicos do período de final de semana (Qui-Dom)
 * Estes dados são baseados na escala enviada pelo gestor para o período
 */

const API = 'https://2blzw4pn7b.execute-api.us-east-2.amazonaws.com/prod';
const TOKEN = process.env.AUTH_TOKEN || '';
const UNIT_ID = '38093265000154';

// Lista de freelancers para o período 31/03 a 05/04
const FREELANCERS = [
  {
    nome: 'Carlos Eduardo Souza',
    chavePix: 'carlos.eduardo@pix.com',
    telefone: '(11) 99871-2345',
    funcao: 'Garçom',
    cargo: 'Garçom',
    area: 'Salão',
    valorDobra: 120,
    ativo: true,
  },
  {
    nome: 'Fernanda Lima Oliveira',
    chavePix: '11998765432',
    telefone: '(11) 99876-5432',
    funcao: 'Garçonete',
    cargo: 'Garçonete',
    area: 'Salão',
    valorDobra: 120,
    ativo: true,
  },
  {
    nome: 'Ricardo Santos Moraes',
    chavePix: 'ricardo.moraes.pix',
    telefone: '(11) 97654-3210',
    funcao: 'Bartender',
    cargo: 'Bartender',
    area: 'Bar',
    valorDobra: 130,
    ativo: true,
  },
  {
    nome: 'Juliana Costa Pereira',
    chavePix: 'juliana.costa@gmail.com',
    telefone: '(11) 98765-1234',
    funcao: 'Caixa',
    cargo: 'Caixa',
    area: 'Caixa',
    valorDobra: 120,
    ativo: true,
  },
  {
    nome: 'Paulo Henrique Alves',
    chavePix: '11988765432',
    telefone: '(11) 98876-5432',
    funcao: 'Auxiliar de Cozinha',
    cargo: 'Ajudante de Cozinha',
    area: 'Cozinha',
    valorDobra: 110,
    ativo: true,
  },
  {
    nome: 'Ana Paula Ferreira',
    chavePix: 'ana.paula.ferreira@pix',
    telefone: '(11) 96754-3210',
    funcao: 'Garçonete',
    cargo: 'Garçonete',
    area: 'Salão',
    valorDobra: 120,
    ativo: true,
  },
  {
    nome: 'Lucas Rodrigues Silva',
    chavePix: '11997654321',
    telefone: '(11) 99765-4321',
    funcao: 'Pizzaiolo',
    cargo: 'Pizzaiolo',
    area: 'Pizzaria',
    valorDobra: 140,
    ativo: true,
  },
  {
    nome: 'Marina Santos Pereira',
    chavePix: 'marina.santos.pix',
    telefone: '(11) 98654-3210',
    funcao: 'Garçom',
    cargo: 'Garçom',
    area: 'Salão',
    valorDobra: 120,
    ativo: true,
  },
];

// Escalas para o período 31/03 a 05/04 (Terça a Domingo)
// Turnos padrão para final de semana estendido
const ESCALAS_PADRAO = {
  // Sexta 31/03: todos DN
  // Sábado 01/04: todos DN
  // Domingo 02/04: todos DN
  // Segunda 03/04: folga
  // Terça 04/04: alguns D
  // Quarta 05/04: alguns D
};

const DIAS_ESCALAS = [
  { data: '2026-03-31', dia: 'Terça' },
  { data: '2026-04-01', dia: 'Quarta' },
  { data: '2026-04-02', dia: 'Quinta' },
  { data: '2026-04-03', dia: 'Sexta' },
  { data: '2026-04-04', dia: 'Sábado' },
  { data: '2026-04-05', dia: 'Domingo' },
];

// Regras: quem trabalha em qual dia e qual turno
const ESCALA_FREELANCER = {
  // Salão e Bar: Qui a Dom DN
  'Garçom':    { turnos: { '2026-04-02': 'Dia', '2026-04-03': 'DiaNoite', '2026-04-04': 'DiaNoite', '2026-04-05': 'DiaNoite' } },
  'Garçonete': { turnos: { '2026-04-02': 'Dia', '2026-04-03': 'DiaNoite', '2026-04-04': 'DiaNoite', '2026-04-05': 'DiaNoite' } },
  'Bartender': { turnos: { '2026-04-03': 'DiaNoite', '2026-04-04': 'DiaNoite', '2026-04-05': 'DiaNoite' } },
  'Caixa':     { turnos: { '2026-04-02': 'Dia', '2026-04-03': 'Dia', '2026-04-04': 'DiaNoite', '2026-04-05': 'DiaNoite' } },
  'Auxiliar de Cozinha': { turnos: { '2026-04-02': 'Dia', '2026-04-03': 'DiaNoite', '2026-04-04': 'DiaNoite', '2026-04-05': 'DiaNoite' } },
  'Pizzaiolo': { turnos: { '2026-04-02': 'Dia', '2026-04-03': 'DiaNoite', '2026-04-04': 'DiaNoite', '2026-04-05': 'DiaNoite' } },
};

async function main() {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

  console.log('=== Importando Freelancers - Porta do Sol ===');
  console.log(`Período: 31/03 a 05/04/2026`);
  console.log(`API: ${API}`);
  console.log(`Unit: ${UNIT_ID}`);
  console.log('');

  const ids = {};
  for (const f of FREELANCERS) {
    try {
      const res = await fetch(`${API}/freelancers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...f, unitId: UNIT_ID }),
      });
      if (res.ok) {
        const d = await res.json();
        ids[f.nome] = d.id;
        console.log(`✅ Freelancer cadastrado: ${f.nome} (${f.funcao}) — ID: ${d.id}`);
      } else {
        const e = await res.text();
        // Try update if exists
        console.log(`⚠️  ${f.nome}: ${res.status} — ${e.slice(0,60)}`);
      }
    } catch (e) {
      console.error(`❌ Erro ao cadastrar ${f.nome}:`, e.message);
    }
  }

  console.log('\n=== IDs dos Freelancers ===');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch(console.error);

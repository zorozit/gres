/**
 * engine/index.ts — Re-exporta todo o motor de cálculo GRES
 *
 * USO:
 *   import { calcINSS, calcularFolhaCLT, montarDemonstrativo } from '../engine';
 *
 * REGRA: toda lógica de cálculo vive neste diretório.
 * Nenhum módulo de página (.tsx) deve definir funções de cálculo localmente.
 * Se uma regra nova é necessária, cria/edita aqui e importa no módulo.
 *
 * Atualizado: 2026-07-06
 */

// Tipos compartilhados
export type {
  ComposicaoItem,
  RubricaHolerite,
  LogPagamento,
  SaidaCalc,
  FolhaSalvaDB,
  SemanaFechamento,
  ControleDiaMotoboy,
  HoleriteResult,
  VariavelMotoboyResult,
  DescontosOperacionaisResult,
  FolhaCLTResult,
  FreelancerFechamentoResult,
} from './types';

// INSS
export { TABELA_INSS_2026, calcINSS } from './inss';

// Semanas de fechamento
export { semanasFechamento, fmtDataBR, fmtDataISO } from './semanas';

// Folha CLT
export { calcularFolhaCLT } from './folhaCLT';
export type { FolhaCLTInput, FolhaCLTCalcResult, ColaboradorCLTInput } from './folhaCLT';

// Descontos operacionais
export { calcularDescontos, TIPOS_EXCLUIDOS_DESCONTO, TIPOS_CREDITO } from './descontos';
export type { DescontosInput, DescontosResult } from './descontos';

// Transporte
export {
  calcularTransporteFreelancer,
  calcularVTDescCLT,
  calcularTransporteMotoboyCLT,
} from './transporte';
export type {
  TransporteFreelancerInput, TransporteFreelancerResult,
  VTDescCLTInput, VTDescCLTResult,
  TransporteMotoboyCLTInput, TransporteMotoboyCLTResult,
} from './transporte';

// Motoboy variável
export { calcularVariavelMotoboy } from './motoboy';
export type { MotoboyVariavelInput, MotoboyVariavelResult } from './motoboy';

// Folha Freelancer
export {
  calcularTransporteFreelancerPeriodo,
  calcularDescontosFreelancer,
  calcularLiquidoFreelancer,
  TIPOS_DESCONTO_FREELANCER,
  TIPOS_EXCLUIDOS_DESCONTO_FREELANCER,
} from './folhaFreelancer';
export type {
  TransporteFreelancerInput as TranspFreelancerPeriodoInput,
  TransporteFreelancerResult as TranspFreelancerPeriodoResult,
  DescontosFreelancerInput,
  DescontosFreelancerResult,
  LiquidoFreelancerInput,
} from './folhaFreelancer';

// Demonstrativo (composição completa)
export { montarDemonstrativo } from './demonstrativo';
export type { DemonstrativoInput, DemonstrativoResult, DemonstrativoSecao } from './demonstrativo';

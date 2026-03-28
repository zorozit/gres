// Tipos principais do GRES

export interface User {
  id: string
  email: string
  name: string
  perfil: 'admin' | 'socio-operador' | 'operacao' | 'caixa' | 'colaborador'
  unidade_id: string
  status: 'ativo' | 'inativo'
  ultimo_acesso?: string
}

export interface Unidade {
  id: string
  nome: string
  nome_fantasia?: string
  cnpj?: string
  cidade?: string
  uf?: string
  endereco?: string
  status: 'ativo' | 'inativo' | 'implantacao'
  created_at: string
  updated_at: string
}

export interface Colaborador {
  id: string
  unidade_id: string
  nome: string
  cpf?: string
  telefone?: string
  chave_pix?: string
  tipo_contratacao: 'CLT' | 'Freelancer'
  funcao?: string
  salario_mensal?: number
  status: 'ativo' | 'inativo' | 'desligado'
  data_admissao?: string
  created_at: string
  updated_at: string
}

export interface Escala {
  id: string
  unidade_id: string
  colaborador_id: string
  data: string
  turno: 'manhã' | 'tarde' | 'noite'
  status: 'previsto' | 'presente' | 'falta' | 'folga' | 'substituição'
  valor_previsto?: number
  valor_realizado?: number
  created_at: string
  updated_at: string
}

export interface CaixaAbertura {
  id: string
  unidade_id: string
  data: string
  turno: 'manhã' | 'tarde' | 'noite'
  valor_inicial: number
  usuario_id: string
  created_at: string
}

export interface CaixaRecebimento {
  id: string
  unidade_id: string
  data: string
  turno: 'manhã' | 'tarde' | 'noite'
  tipo_recebimento: 'dinheiro' | 'pix' | 'ifood' | 'cartao_1' | 'cartao_2' | 'outros'
  valor: number
  observacao?: string
  usuario_id: string
  created_at: string
}

export interface CaixaFechamento {
  id: string
  unidade_id: string
  data: string
  turno: 'manhã' | 'tarde' | 'noite'
  valor_sistema: number
  valor_informado: number
  diferenca: number
  justificativa?: string
  usuario_id: string
  fechado_em: string
}

export interface Saida {
  id: string
  unidade_id: string
  data: string
  turno?: 'manhã' | 'tarde' | 'noite'
  categoria: string
  subcategoria?: string
  colaborador_id?: string
  descricao: string
  valor: number
  origem_saida?: string
  forma_pagamento?: string
  comprovante_url?: string
  status: 'registrado' | 'aprovado' | 'rejeitado'
  usuario_id: string
  created_at: string
  updated_at: string
}

export interface Motoboy {
  id: string
  unidade_id: string
  nome: string
  telefone?: string
  chave_pix?: string
  status: 'ativo' | 'inativo'
  created_at: string
  updated_at: string
}

export interface MotoboyLancamento {
  id: string
  unidade_id: string
  motoboy_id: string
  data: string
  turno: 'manhã' | 'tarde' | 'noite'
  valor_chegada: number
  qtde_entregas: number
  valor_por_entrega: number
  caixinha: number
  descontos: number
  valor_total: number
  data_pagamento?: string
  created_at: string
  updated_at: string
}

export interface Dashboard {
  unidade_id: string
  data: string
  total_escalados: number
  total_presentes: number
  total_faltas: number
  total_recebimentos: number
  total_saidas: number
  diferenca: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

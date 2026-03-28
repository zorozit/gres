import express, { Express, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'

// Carregar variáveis de ambiente
dotenv.config()

const app: Express = express()
const PORT = process.env.API_PORT || 3000

// Middleware
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Logger middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.API_ENV || 'development',
  })
})

// API Routes
app.get('/api/dashboard', (req: Request, res: Response) => {
  const { unidadeId, data } = req.query
  
  res.json({
    success: true,
    data: {
      unidade_id: unidadeId,
      data,
      total_escalados: 0,
      total_presentes: 0,
      total_faltas: 0,
      total_recebimentos: 0,
      total_saidas: 0,
      diferenca: 0,
    },
  })
})

// Caixa - Abertura
app.post('/api/caixa/abertura', (req: Request, res: Response) => {
  const { unidadeId, turno, valorInicial } = req.body
  
  res.json({
    success: true,
    data: {
      id: uuidv4(),
      unidade_id: unidadeId,
      turno,
      valor_inicial: valorInicial,
      created_at: new Date().toISOString(),
    },
  })
})

// Caixa - Recebimento
app.post('/api/caixa/recebimento', (req: Request, res: Response) => {
  const { unidadeId, data, turno, tipoRecebimento, valor } = req.body
  
  res.json({
    success: true,
    data: {
      id: uuidv4(),
      unidade_id: unidadeId,
      data,
      turno,
      tipo_recebimento: tipoRecebimento,
      valor,
      created_at: new Date().toISOString(),
    },
  })
})

// Caixa - Fechamento
app.post('/api/caixa/fechamento', (req: Request, res: Response) => {
  const { unidadeId, data, turno, valorInformado, justificativa } = req.body
  
  res.json({
    success: true,
    data: {
      id: uuidv4(),
      unidade_id: unidadeId,
      data,
      turno,
      valor_informado: valorInformado,
      justificativa,
      fechado_em: new Date().toISOString(),
    },
  })
})

// Escalas
app.get('/api/escalas', (req: Request, res: Response) => {
  const { unidadeId, data } = req.query
  
  res.json({
    success: true,
    data: {
      items: [],
      total: 0,
    },
  })
})

// Escalas - Marcar Presença
app.post('/api/escalas/presenca', (req: Request, res: Response) => {
  const { colaboradorId, data } = req.body
  
  res.json({
    success: true,
    data: {
      id: uuidv4(),
      colaborador_id: colaboradorId,
      data,
      status: 'presente',
    },
  })
})

// Saídas
app.get('/api/saidas', (req: Request, res: Response) => {
  const { unidadeId, data } = req.query
  
  res.json({
    success: true,
    data: {
      items: [],
      total: 0,
    },
  })
})

app.post('/api/saidas', (req: Request, res: Response) => {
  const saida = req.body
  
  res.json({
    success: true,
    data: {
      id: uuidv4(),
      ...saida,
      created_at: new Date().toISOString(),
    },
  })
})

// Motoboys
app.get('/api/motoboys', (req: Request, res: Response) => {
  const { unidadeId } = req.query
  
  res.json({
    success: true,
    data: {
      items: [],
      total: 0,
    },
  })
})

app.post('/api/motoboys/lancamento', (req: Request, res: Response) => {
  const lancamento = req.body
  
  res.json({
    success: true,
    data: {
      id: uuidv4(),
      ...lancamento,
      created_at: new Date().toISOString(),
    },
  })
})

// Colaboradores
app.get('/api/colaboradores', (req: Request, res: Response) => {
  const { unidadeId } = req.query
  
  res.json({
    success: true,
    data: {
      items: [],
      total: 0,
    },
  })
})

app.get('/api/colaboradores/:id', (req: Request, res: Response) => {
  const { id } = req.params
  
  res.json({
    success: true,
    data: {
      id,
      nome: 'Colaborador',
      status: 'ativo',
    },
  })
})

app.post('/api/colaboradores', (req: Request, res: Response) => {
  const colaborador = req.body
  
  res.json({
    success: true,
    data: {
      id: uuidv4(),
      ...colaborador,
      created_at: new Date().toISOString(),
    },
  })
})

app.put('/api/colaboradores/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const colaborador = req.body
  
  res.json({
    success: true,
    data: {
      id,
      ...colaborador,
      updated_at: new Date().toISOString(),
    },
  })
})

// Unidades
app.get('/api/unidades', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      items: [],
      total: 0,
    },
  })
})

app.get('/api/unidades/:id', (req: Request, res: Response) => {
  const { id } = req.params
  
  res.json({
    success: true,
    data: {
      id,
      nome: 'Unidade',
      status: 'ativo',
    },
  })
})

// Upload
app.post('/api/upload', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      url: 'https://example.com/arquivo.pdf',
    },
  })
})

// Error handling
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err)
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message,
  })
})

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
  })
})

// Start server
if (process.env.NODE_ENV !== 'lambda') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
    console.log(`📝 Environment: ${process.env.API_ENV || 'development'}`)
  })
}

export default app

import axios, { AxiosInstance, AxiosError } from 'axios'
import { ApiResponse } from '@/types'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000/api'
const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '30000')

class ApiService {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_ENDPOINT,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Interceptor para adicionar token JWT
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // Interceptor para tratar erros
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expirado, fazer logout
          localStorage.removeItem('auth_token')
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  // Dashboard
  async getDashboard(unidadeId: string, data: string): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/dashboard`, {
      params: { unidadeId, data },
    })
    return response.data
  }

  // Caixa
  async abrirCaixa(unidadeId: string, turno: string, valorInicial: number): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/caixa/abertura`, {
      unidadeId,
      turno,
      valorInicial,
    })
    return response.data
  }

  async lancarRecebimento(
    unidadeId: string,
    data: string,
    turno: string,
    tipoRecebimento: string,
    valor: number
  ): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/caixa/recebimento`, {
      unidadeId,
      data,
      turno,
      tipoRecebimento,
      valor,
    })
    return response.data
  }

  async fecharCaixa(
    unidadeId: string,
    data: string,
    turno: string,
    valorInformado: number,
    justificativa?: string
  ): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/caixa/fechamento`, {
      unidadeId,
      data,
      turno,
      valorInformado,
      justificativa,
    })
    return response.data
  }

  // Escalas
  async getEscalas(unidadeId: string, data: string): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/escalas`, {
      params: { unidadeId, data },
    })
    return response.data
  }

  async marcarPresenca(colaboradorId: string, data: string): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/escalas/presenca`, {
      colaboradorId,
      data,
    })
    return response.data
  }

  // Saídas
  async registrarSaida(saida: any): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/saidas`, saida)
    return response.data
  }

  async getSaidas(unidadeId: string, data: string): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/saidas`, {
      params: { unidadeId, data },
    })
    return response.data
  }

  // Motoboys
  async getMotoboys(unidadeId: string): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/motoboys`, {
      params: { unidadeId },
    })
    return response.data
  }

  async lancarMotoboy(lancamento: any): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/motoboys/lancamento`, lancamento)
    return response.data
  }

  // Colaboradores
  async getColaboradores(unidadeId: string): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/colaboradores`, {
      params: { unidadeId },
    })
    return response.data
  }

  async getColaborador(id: string): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/colaboradores/${id}`)
    return response.data
  }

  async criarColaborador(colaborador: any): Promise<ApiResponse<any>> {
    const response = await this.client.post(`/colaboradores`, colaborador)
    return response.data
  }

  async atualizarColaborador(id: string, colaborador: any): Promise<ApiResponse<any>> {
    const response = await this.client.put(`/colaboradores/${id}`, colaborador)
    return response.data
  }

  // Unidades
  async getUnidades(): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/unidades`)
    return response.data
  }

  async getUnidade(id: string): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/unidades/${id}`)
    return response.data
  }

  // Upload de arquivo
  async uploadArquivo(arquivo: File, tipo: string): Promise<ApiResponse<any>> {
    const formData = new FormData()
    formData.append('arquivo', arquivo)
    formData.append('tipo', tipo)

    const response = await this.client.post(`/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  }
}

export const apiService = new ApiService()

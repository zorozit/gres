import { useState } from 'react';

interface Regra {
  id: string;
  titulo: string;
  descricao: string;
  detalhes?: string[];
  status: 'ativo' | 'planejado' | 'parcial';
  desde?: string;
}

interface CategoriaRegras {
  id: string;
  icon: string;
  titulo: string;
  cor: string;
  regras: Regra[];
}

const CATEGORIAS: CategoriaRegras[] = [
  {
    id: 'pagamento-freelancer',
    icon: '🎯',
    titulo: 'Pagamento de Freelancers',
    cor: '#2e7d32',
    regras: [
      {
        id: 'valor-turno-fixo',
        titulo: 'Valor fixo por turno',
        descricao: 'Freelancers com acordo padrão recebem valor fixo de valorDia (turno Dia) e valorNoite (turno Noite), configurados no cadastro do colaborador.',
        detalhes: [
          'Campos: colaborador.valorDia e colaborador.valorNoite',
          'Turno "DiaNoite" (dobra) = valorDia + valorNoite',
          'Validação server-side: backend recalcula e corrige se frontend enviar valor divergente',
        ],
        status: 'ativo',
        desde: '2026-06',
      },
      {
        id: 'valor-turno-variavel',
        titulo: 'Tabela variável por dia da semana',
        descricao: 'Freelancers com tipoAcordo="valor_turno" recebem valores diferentes conforme o dia da semana, definidos em acordo.tabela.',
        detalhes: [
          'Tabela: { seg: {D, N}, ter: {D, N}, ..., dom: {D, N} }',
          'D = turno Dia, N = turno Noite',
          'Exemplo: seg D=R$100, ter D=R$80, qui-dom D=R$120',
          'Fallback: se dia não tem entrada na tabela, usa valorDia/valorNoite padrão',
          'Validação server-side: resolverValorTurnoServidor() busca acordo e corrige valor',
        ],
        status: 'ativo',
        desde: '2026-06',
      },
      {
        id: 'transporte-freelancer',
        titulo: 'Transporte por dia trabalhado',
        descricao: 'Freelancers com valorTransporte > 0 recebem transporte por dia único trabalhado (não por turno). Deduz adiantamento de transporte do mês se houver.',
        detalhes: [
          'Cálculo: dias únicos na semana × valorTransporte',
          'Se 2 turnos no mesmo dia, conta 1× transporte',
          'Adiantamento: se houve saída "Desconto Transporte" no mês, abate do saldo',
          'Saldo a pagar = transporte da semana − já adiantado (mínimo 0)',
          'Ao confirmar pagamento: gera automaticamente 1 saída "Desconto Transporte" por dia',
        ],
        status: 'ativo',
        desde: '2026-06',
      },
      {
        id: 'caixinha',
        titulo: 'Caixinha / Gorjeta',
        descricao: 'Saídas tipo "Caixinha" registradas no período aparecem como crédito no pagamento do freelancer.',
        detalhes: [
          'Fonte: tabela gres-prod-saidas com tipo="Caixinha"',
          'Filtro: colaboradorId + data dentro do período da semana',
          'Exclusão: caixinhas já pagas (pago=true ou pagamentoIdLigado) não reaparecem',
          'Ao confirmar pagamento: saídas Caixinha são marcadas como pago=true via PUT /saidas/:id',
          'Evita dupla contagem em pagamento parcial (ex: pagar parte, adicionar dia, pagar resto)',
        ],
        status: 'ativo',
        desde: '2026-06',
      },
      {
        id: 'descontos-saidas',
        titulo: 'Descontos automáticos (saídas)',
        descricao: 'Saídas de determinados tipos são descontadas automaticamente do pagamento do freelancer.',
        detalhes: [
          'Tipos que geram desconto: "A pagar", "A receber", "Consumo Interno", "Desconto Adiantamento Especial"',
          'Tipos excluídos: "Desconto Transporte" (tratado separadamente), "Caixinha" (é crédito)',
          'Adiantamento especial: pode ser abatido no pagamento, gera saída automática',
          'Saídas com adiantamentoId + pago=true são excluídas (já baixadas)',
        ],
        status: 'ativo',
      },
      {
        id: 'pagamento-parcial',
        titulo: 'Pagamento parcial / complementar',
        descricao: 'Se parte dos dias já foi paga, apenas os turnos restantes aparecem para pagamento.',
        detalhes: [
          'Registro por turno: cada dia/turno gera ID único: folha-{colaboradorId}-{data}-{turno}',
          'Dias já pagos são identificados por registros com pago=true na folha-pagamento',
          'Detalhamento mostra "✅ X dia(s) já pago(s)" com valor total',
          'Caixinha já incorporada a pagamento anterior não reaparece',
        ],
        status: 'ativo',
      },
    ],
  },
  {
    id: 'motoboy',
    icon: '🏍️',
    titulo: 'Motoboys & Entregas',
    cor: '#e65100',
    regras: [
      {
        id: 'motoboy-comissao',
        titulo: 'Comissão por entrega',
        descricao: 'Motoboys recebem valor fixo por entrega (valorEntrega) mais valor de chegada por turno.',
        detalhes: [
          'Campos: acordo.valorEntrega, acordo.chegadaDia, acordo.chegadaNoite',
          'Total = (chegada × turnos) + (entregas × valorEntrega)',
          'Registrado no controle-motoboy por semana',
        ],
        status: 'ativo',
      },
      {
        id: 'motoboy-auditoria',
        titulo: 'Auditoria linha a linha',
        descricao: 'Cada entrega do motoboy é auditável com data, turno, quantidade e valor.',
        status: 'ativo',
      },
    ],
  },
  {
    id: 'integridade-backend',
    icon: '🔒',
    titulo: 'Integridade de Dados (Backend)',
    cor: '#c62828',
    regras: [
      {
        id: 'validacao-valor-servidor',
        titulo: 'P0.1 — Validação server-side do valor do turno',
        descricao: 'O backend recalcula o valor esperado de cada turno antes de salvar. Se o frontend enviar valor divergente, o servidor corrige automaticamente.',
        detalhes: [
          'Função: resolverValorTurnoServidor(colaborador, data, turno)',
          'Busca acordo do colaborador no DynamoDB',
          'Suporta valor fixo e tabela variável por dia da semana',
          'Tolerância: diferença > R$0,01 aciona correção',
          'Resposta inclui campo "valorCorrecoes" com antes/depois',
          'Turnos tipo "Transporte" são isentos (valor não vem do acordo)',
        ],
        status: 'ativo',
        desde: '2026-06-22',
      },
      {
        id: 'idempotencia',
        titulo: 'P0.2 — Idempotência (anti-duplicata)',
        descricao: 'Registros de pagamento com ID já existente e pago=true são ignorados silenciosamente. Evita duplicação por double-click ou retry.',
        detalhes: [
          'ConditionExpression: attribute_not_exists(id) OR pago = :false',
          'Se registro existe e pago=true → skip (ConditionalCheckFailedException)',
          'Se registro existe e pago=false → sobrescreve (permite refazer)',
          'Resposta: count=0 quando todos os turnos já estavam pagos',
        ],
        status: 'ativo',
        desde: '2026-06-22',
      },
      {
        id: 'validacao-colaborador',
        titulo: 'P0.3 — Validação de colaboradorId',
        descricao: 'Antes de salvar pagamento, o backend verifica se o colaborador existe no banco de dados.',
        detalhes: [
          'Função: validarColaborador(colaboradorId)',
          'Se não existe → HTTP 400 com erro claro',
          'Se unitId diverge → warning no log (não bloqueia, admin pode operar cross-unit)',
          'POST /saidas também já valida colaborador (implementação anterior)',
        ],
        status: 'ativo',
        desde: '2026-06-22',
      },
      {
        id: 'transacao-atomica',
        titulo: 'P0.4 — Transação atômica (TransactWriteItems)',
        descricao: 'Pagamento de lote grava turnos + transporte + saídas em uma única transação atômica. Se qualquer parte falhar, nenhuma é salva.',
        status: 'planejado',
      },
      {
        id: 'auditoria-log',
        titulo: 'Log de auditoria imutável',
        descricao: 'Toda alteração em colaboradores, folha, saídas, escalas e controle-motoboy é registrada com quem, quando, valores antes/depois.',
        detalhes: [
          'Tabelas: gres-prod-{entidade}-log',
          'Campos: usuarioId, usuarioNome, evento, valoresAntes, valoresDepois, timestamp',
          'Função: logAlteracaoGenerica()',
          'Best-effort: falha no log não impede a operação principal',
        ],
        status: 'ativo',
      },
    ],
  },
  {
    id: 'permissoes',
    icon: '🛡️',
    titulo: 'Permissões & Acesso',
    cor: '#7b1fa2',
    regras: [
      {
        id: 'admin-master',
        titulo: 'Admin Master',
        descricao: 'O usuário admin@gres.com é o admin master. Tem acesso irrestrito a todas as unidades e não pode ser rebaixado.',
        detalhes: [
          'Identificado por email hardcoded: admin@gres.com',
          'Campo isMaster=true no login',
          'Visualiza todas as 5 unidades no seletor',
          'Não pode ter permissões removidas por outros admins',
        ],
        status: 'ativo',
      },
      {
        id: 'perfis-globais',
        titulo: 'Perfis globais',
        descricao: 'Perfis padrão (operador, gerente, admin, rh) definem permissões base que se aplicam a todas as unidades.',
        detalhes: [
          'Armazenados em: gres-prod-usuarios com id=config-perfis-permissoes',
          'Cada perfil tem lista de moduleIds permitidos',
          'Hierarquia: operador < gerente < admin < rh',
        ],
        status: 'ativo',
      },
      {
        id: 'override-unidade',
        titulo: 'Override por unidade',
        descricao: 'Permissões podem ser customizadas por unidade, sobrescrevendo o perfil global.',
        detalhes: [
          'Armazenados em: gres-prod-usuarios com id=config-perfis-permissoes-{unitId}',
          'Resolução: isMaster → override unidade → perfil global',
          'Um gerente pode ter acesso à folha na unidade A mas não na B',
          'UI: PermissoesConfig com seletor de escopo (Global / por unidade)',
        ],
        status: 'ativo',
      },
    ],
  },
  {
    id: 'caixa',
    icon: '💰',
    titulo: 'Controle de Caixa',
    cor: '#1565c0',
    regras: [
      {
        id: 'caixa-periodo',
        titulo: 'Períodos de caixa',
        descricao: 'Cada unidade pode ter caixa diurno e noturno, com abertura, movimentações e fechamento independentes.',
        detalhes: [
          'ID: {cnpj}-{data}-{periodo} (dia/noite)',
          'Estados: aberto → em operação → fechado',
          'Sangrias registradas como movimentações negativas',
        ],
        status: 'ativo',
      },
    ],
  },
  {
    id: 'escalas',
    icon: '📅',
    titulo: 'Escalas & Presença',
    cor: '#00838f',
    regras: [
      {
        id: 'escala-presenca',
        titulo: 'Presença vinculada à escala',
        descricao: 'A presença do colaborador na escala alimenta diretamente o cálculo da folha de pagamento.',
        detalhes: [
          'Somente turnos com presença confirmada entram no cálculo',
          'Turnos: Dia, Noite, DiaNoite (dobra)',
          'DiaNoite gera 2 registros no pagamento (Dia + Noite)',
        ],
        status: 'ativo',
      },
      {
        id: 'escala-duplicata',
        titulo: 'Verificação de duplicata de escala',
        descricao: 'Impedir que o mesmo colaborador seja escalado duas vezes no mesmo dia/turno/unidade.',
        status: 'planejado',
      },
    ],
  },
  {
    id: 'seguranca',
    icon: '🔐',
    titulo: 'Segurança',
    cor: '#455a64',
    regras: [
      {
        id: 'jwt-auth',
        titulo: 'P1.1 — Autenticação JWT',
        descricao: 'Todas as rotas protegidas da API exigem token JWT válido no header Authorization.',
        status: 'planejado',
      },
      {
        id: 'bcrypt-senhas',
        titulo: 'P1.2 — Hash de senhas (bcrypt)',
        descricao: 'Senhas são armazenadas como hash bcrypt em vez de texto plano.',
        status: 'planejado',
      },
      {
        id: 'soft-delete',
        titulo: 'P1.3 — Soft delete de colaboradores',
        descricao: 'Ao excluir colaborador, marca como ativo=false em vez de deletar. Verifica dependências antes.',
        status: 'planejado',
      },
    ],
  },
  {
    id: 'unidades',
    icon: '🏢',
    titulo: 'Multi-Unidade',
    cor: '#37474f',
    regras: [
      {
        id: 'unidade-persistencia',
        titulo: 'Persistência de unidade selecionada',
        descricao: 'A unidade ativa é salva no localStorage e restaurada ao recarregar a página (F5).',
        detalhes: [
          'useState inicializa do localStorage (síncrono, sem flash)',
          'setActiveUnit persiste no localStorage ao selecionar',
          'Logout limpa localStorage.activeUnit via AuthContext',
          'Refresh: localStorage sobrevive, state transitório null não apaga',
        ],
        status: 'ativo',
        desde: '2026-06-22',
      },
      {
        id: 'cnpj-normalizacao',
        titulo: 'Normalização de CNPJ',
        descricao: 'Todos os unitIds são normalizados para CNPJ 14 dígitos (sem formatação).',
        detalhes: [
          'Função: toCnpj() extrai 14 chars numéricos',
          'Aplicado em todas as queries e filtros',
          'Suporta formatos: CNPJ puro, CNPJ-timestamp, CNPJ formatado',
        ],
        status: 'ativo',
      },
    ],
  },
];

const statusLabel: Record<string, { text: string; bg: string; color: string }> = {
  ativo:    { text: '✅ Ativo',    bg: '#e8f5e9', color: '#2e7d32' },
  planejado:{ text: '📋 Planejado',bg: '#fff3e0', color: '#e65100' },
  parcial:  { text: '🔄 Parcial', bg: '#e3f2fd', color: '#1565c0' },
};

export default function RegrasSistema() {
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativo' | 'planejado'>('todos');
  const [busca, setBusca] = useState('');

  const toggleCategoria = (id: string) => setExpandido(prev => ({ ...prev, [id]: !prev[id] }));

  const regrasFiltradas = CATEGORIAS.map(cat => ({
    ...cat,
    regras: cat.regras.filter(r => {
      if (filtroStatus !== 'todos' && r.status !== filtroStatus) return false;
      if (busca) {
        const q = busca.toLowerCase();
        return r.titulo.toLowerCase().includes(q) || r.descricao.toLowerCase().includes(q)
          || r.detalhes?.some(d => d.toLowerCase().includes(q));
      }
      return true;
    }),
  })).filter(cat => cat.regras.length > 0);

  const totalAtivo = CATEGORIAS.reduce((s, c) => s + c.regras.filter(r => r.status === 'ativo').length, 0);
  const totalPlanejado = CATEGORIAS.reduce((s, c) => s + c.regras.filter(r => r.status === 'planejado').length, 0);
  const totalRegras = CATEGORIAS.reduce((s, c) => s + c.regras.length, 0);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>📖 Regras do Sistema</h1>
        <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
          Documentação das regras de negócio implementadas no GIRES. Atualizadas conforme o sistema evolui.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ padding: '10px 16px', background: '#e8f5e9', borderRadius: 8, flex: '1 1 120px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2e7d32' }}>{totalAtivo}</div>
          <div style={{ fontSize: 11, color: '#388e3c' }}>Regras ativas</div>
        </div>
        <div style={{ padding: '10px 16px', background: '#fff3e0', borderRadius: 8, flex: '1 1 120px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#e65100' }}>{totalPlanejado}</div>
          <div style={{ fontSize: 11, color: '#ef6c00' }}>Planejadas</div>
        </div>
        <div style={{ padding: '10px 16px', background: '#f5f5f5', borderRadius: 8, flex: '1 1 120px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#424242' }}>{totalRegras}</div>
          <div style={{ fontSize: 11, color: '#757575' }}>Total</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 Buscar regras..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ flex: '1 1 200px', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
        />
        {(['todos', 'ativo', 'planejado'] as const).map(f => (
          <button key={f} onClick={() => setFiltroStatus(f)} style={{
            padding: '6px 14px', borderRadius: 20, border: '1px solid',
            borderColor: filtroStatus === f ? '#1976d2' : '#ddd',
            background: filtroStatus === f ? '#e3f2fd' : '#fff',
            color: filtroStatus === f ? '#1565c0' : '#666',
            fontWeight: filtroStatus === f ? 700 : 400,
            fontSize: 13, cursor: 'pointer',
          }}>
            {f === 'todos' ? 'Todos' : f === 'ativo' ? '✅ Ativos' : '📋 Planejados'}
          </button>
        ))}
      </div>

      {/* Categorias */}
      {regrasFiltradas.map(cat => {
        const isOpen = expandido[cat.id] !== false; // default open
        return (
          <div key={cat.id} style={{ marginBottom: 16, border: '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
            <button onClick={() => toggleCategoria(cat.id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
              background: isOpen ? cat.cor + '10' : '#fafafa', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ fontSize: 22 }}>{cat.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#333' }}>{cat.titulo}</div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {cat.regras.filter(r => r.status === 'ativo').length} ativa(s)
                  {cat.regras.filter(r => r.status === 'planejado').length > 0 && `, ${cat.regras.filter(r => r.status === 'planejado').length} planejada(s)`}
                </div>
              </div>
              <span style={{ fontSize: 18, color: '#999', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s' }}>▼</span>
            </button>

            {isOpen && (
              <div style={{ padding: '0 16px 16px' }}>
                {cat.regras.map(regra => {
                  const st = statusLabel[regra.status];
                  return (
                    <div key={regra.id} style={{ marginTop: 12, padding: '12px 14px', background: '#fafafa', borderRadius: 8, border: '1px solid #eee' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#333', flex: 1 }}>{regra.titulo}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color }}>
                          {st.text}
                        </span>
                        {regra.desde && <span style={{ fontSize: 10, color: '#999' }}>desde {regra.desde}</span>}
                      </div>
                      <p style={{ margin: '0 0 6px', fontSize: 13, color: '#555', lineHeight: 1.5 }}>{regra.descricao}</p>
                      {regra.detalhes && regra.detalhes.length > 0 && (
                        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                          {regra.detalhes.map((d, i) => (
                            <li key={i} style={{ fontSize: 12, color: '#666', lineHeight: 1.6, marginBottom: 2 }}>
                              {d}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {regrasFiltradas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          Nenhuma regra encontrada com os filtros atuais.
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '24px 0 0', fontSize: 11, color: '#bbb' }}>
        Última atualização: 22/06/2026 — GIRES v1.0
      </div>
    </div>
  );
}

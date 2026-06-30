import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LandingPage.css';

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const statsAnimated = useRef(false);

  // Redirect logged-in users to /modulos
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/modulos', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // ── Animated counters ──
  const animateCounters = useCallback(() => {
    if (statsAnimated.current) return;
    statsAnimated.current = true;
    document.querySelectorAll<HTMLElement>('.lp-stat-value').forEach(el => {
      const target = parseInt(el.dataset.target || '0');
      const suffix = el.dataset.suffix || '';
      const duration = 2000;
      const start = performance.now();
      function update(now: number) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target) + suffix;
        if (progress < 1) requestAnimationFrame(update);
      }
      requestAnimationFrame(update);
    });
  }, []);

  // ── Scroll animations ──
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('lp-visible');
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.lp-fade-in').forEach(el => observer.observe(el));

    // Stats counter observer
    const statsEl = document.querySelector('.lp-stats');
    if (statsEl) {
      const statsObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          animateCounters();
          statsObserver.disconnect();
        }
      }, { threshold: 0.3 });
      statsObserver.observe(statsEl);
    }

    return () => observer.disconnect();
  }, [animateCounters]);

  // ── Navbar scroll effect ──
  useEffect(() => {
    const handleScroll = () => {
      const nav = document.getElementById('lp-navbar');
      if (nav) nav.classList.toggle('lp-scrolled', window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Tabs ──
  const handleTabClick = (tabId: string) => {
    document.querySelectorAll('.lp-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.lp-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.lp-tab-btn[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(`lp-tab-${tabId}`)?.classList.add('active');
  };

  // ── FAQ ──
  const handleFaqClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const item = (e.currentTarget as HTMLElement).parentElement!;
    const answer = item.querySelector<HTMLElement>('.lp-faq-answer')!;
    const isOpen = item.classList.contains('open');

    document.querySelectorAll('.lp-faq-item.open').forEach(i => {
      i.classList.remove('open');
      (i.querySelector('.lp-faq-answer') as HTMLElement).style.maxHeight = '0';
    });

    if (!isOpen) {
      item.classList.add('open');
      answer.style.maxHeight = answer.scrollHeight + 'px';
    }
  };

  // ── Mobile menu ──
  const handleHamburger = () => {
    document.getElementById('lp-hamburger')?.classList.toggle('active');
    const menu = document.getElementById('lp-mobile-menu');
    if (menu) {
      menu.classList.toggle('open');
      document.body.style.overflow = menu.classList.contains('open') ? 'hidden' : '';
    }
  };

  const closeMobile = () => {
    document.getElementById('lp-hamburger')?.classList.remove('active');
    const menu = document.getElementById('lp-mobile-menu');
    if (menu) {
      menu.classList.remove('open');
      document.body.style.overflow = '';
    }
  };

  if (isAuthenticated) return null; // while redirecting

  return (
    <div className="lp-root">
      {/* ═══ NAVBAR ═══ */}
      <nav className="lp-navbar" id="lp-navbar">
        <div className="lp-container">
          <a href="#" className="lp-nav-logo">
            <span className="lp-nav-logo-icon">⚙️</span>
            <span>GIRES</span>
          </a>

          <ul className="lp-nav-links">
            <li><a href="#plataforma">Plataforma</a></li>
            <li><a href="#modulos">Módulos</a></li>
            <li><a href="#jornada">Jornada</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul>

          <div className="lp-nav-actions">
            <Link to="/portal/login" className="lp-btn-login" style={{ marginRight: '8px' }}>👤 Portal Colaborador</Link>
            <Link to="/login" className="lp-btn-login">Login</Link>
            <a href="https://wa.me/5511999999999" className="lp-btn-cta" target="_blank" rel="noopener noreferrer">Começar agora</a>
          </div>

          <button className="lp-hamburger" id="lp-hamburger" aria-label="Menu" onClick={handleHamburger}>
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div className="lp-mobile-menu" id="lp-mobile-menu">
        <a href="#plataforma" onClick={closeMobile}>Plataforma</a>
        <a href="#modulos" onClick={closeMobile}>Módulos</a>
        <a href="#jornada" onClick={closeMobile}>Jornada</a>
        <a href="#faq" onClick={closeMobile}>FAQ</a>
        <Link to="/portal/login" onClick={closeMobile}>👤 Portal Colaborador</Link>
        <Link to="/login" onClick={closeMobile}>Login</Link>
        <a href="https://wa.me/5511999999999" className="lp-btn-cta" target="_blank" rel="noopener noreferrer">Começar agora</a>
      </div>

      {/* ═══ HERO ═══ */}
      <section className="lp-hero">
        <div className="lp-container">
          <div className="lp-fade-in">
            <div className="lp-hero-badge">🚀 Plataforma Multi-Unidade</div>
          </div>

          <h1 className="lp-fade-in lp-delay-1">
            Tudo que sua operação precisa em um <span className="lp-highlight">único lugar.</span>
          </h1>

          <p className="lp-hero-subtitle lp-fade-in lp-delay-2">
            Do caixa à folha de pagamento, uma plataforma que centraliza operações,
            automatiza processos e transforma dados em controle total da sua rede de restaurantes.
          </p>

          <div className="lp-hero-cta lp-fade-in lp-delay-3">
            <a href="https://wa.me/5511999999999" className="lp-btn-cta lp-btn-cta-large" target="_blank" rel="noopener noreferrer">
              Falar com especialista
            </a>
            <a href="#plataforma" className="lp-btn-secondary">
              Conhecer a plataforma →
            </a>
          </div>

          <div className="lp-stats lp-fade-in lp-delay-4">
            <div className="lp-stat">
              <div className="lp-stat-value" data-target="5">0</div>
              <div className="lp-stat-label">unidades gerenciadas</div>
            </div>
            <div className="lp-stat">
              <div className="lp-stat-value" data-target="22">0</div>
              <div className="lp-stat-label">módulos integrados</div>
            </div>
            <div className="lp-stat">
              <div className="lp-stat-value" data-suffix="%" data-target="100">0</div>
              <div className="lp-stat-label">em nuvem</div>
            </div>
            <div className="lp-stat">
              <div className="lp-stat-value" data-suffix="h" data-target="24">0</div>
              <div className="lp-stat-label">dados em tempo real</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PLATAFORMA (Tabs) ═══ */}
      <section className="lp-section" id="plataforma">
        <div className="lp-container">
          <div className="lp-section-header lp-fade-in">
            <div className="lp-section-badge">⚙️ A Plataforma</div>
            <h2 className="lp-section-title">Controle completo para sua rede de restaurantes</h2>
            <p className="lp-section-subtitle">Simplifique operações diárias com ferramentas inteligentes integradas em uma única plataforma.</p>
          </div>

          <div className="lp-tabs-nav lp-fade-in">
            <button className="lp-tab-btn active" data-tab="operacao" onClick={() => handleTabClick('operacao')}>Operação & Escalas</button>
            <button className="lp-tab-btn" data-tab="folha" onClick={() => handleTabClick('folha')}>Folha & Financeiro</button>
            <button className="lp-tab-btn" data-tab="auditoria" onClick={() => handleTabClick('auditoria')}>Auditoria & Controle</button>
          </div>

          {/* Tab 1: Operação */}
          <div className="lp-tab-content active" id="lp-tab-operacao">
            <div className="lp-tab-panel">
              <div className="lp-tab-text">
                <h3>Operação diária</h3>
                <h2>Gerencie todas as unidades em tempo real.</h2>
                <p>Dashboard centralizado com métricas operacionais, controle de caixa, escalas de equipe e gestão completa de entregas — tudo sincronizado entre suas unidades.</p>
                <ul className="lp-tab-features">
                  <li>Dashboard com KPIs por unidade em tempo real</li>
                  <li>Controle de abertura, movimentação e fechamento de caixa</li>
                  <li>Escalas de turnos com presença e frequência</li>
                  <li>Gestão de motoboys com comissões por entrega</li>
                </ul>
                <a href="https://wa.me/5511999999999" className="lp-btn-cta" target="_blank" rel="noopener noreferrer">Ver demonstração</a>
              </div>
              <div className="lp-tab-visual">
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">📊</div><div><div className="lp-tab-visual-label">Dashboard Operacional</div><div className="lp-tab-visual-desc">Métricas em tempo real por unidade</div></div></div>
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">💰</div><div><div className="lp-tab-visual-label">Controle de Caixa</div><div className="lp-tab-visual-desc">Abertura, sangrias e fechamento</div></div></div>
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">📅</div><div><div className="lp-tab-visual-label">Gestão de Escalas</div><div className="lp-tab-visual-desc">Turnos, presenças e frequência</div></div></div>
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">🏍️</div><div><div className="lp-tab-visual-label">Gestão de Motoboys</div><div className="lp-tab-visual-desc">Entregas, comissões e auditoria</div></div></div>
              </div>
            </div>
          </div>

          {/* Tab 2: Folha & Financeiro */}
          <div className="lp-tab-content" id="lp-tab-folha">
            <div className="lp-tab-panel">
              <div className="lp-tab-text">
                <h3>Folha & Financeiro</h3>
                <h2>Pagamentos precisos, sem retrabalho.</h2>
                <p>Calcule folha CLT, pague freelancers por turno, gerencie adiantamentos e concilie pagamentos em dinheiro com sangrias — tudo com auditoria linha a linha.</p>
                <ul className="lp-tab-features">
                  <li>Folha CLT com cálculo automático de INSS, VT e feriados</li>
                  <li>Pagamento de freelancers por valor variável por dia da semana</li>
                  <li>Conciliação bancária com importação do extrato Stone</li>
                  <li>Gestão de despesas e cadastro de fornecedores</li>
                </ul>
                <a href="https://wa.me/5511999999999" className="lp-btn-cta" target="_blank" rel="noopener noreferrer">Ver demonstração</a>
              </div>
              <div className="lp-tab-visual">
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">💳</div><div><div className="lp-tab-visual-label">Folha CLT</div><div className="lp-tab-visual-desc">Cálculo automático com deduções legais</div></div></div>
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">🎯</div><div><div className="lp-tab-visual-label">Freelancers</div><div className="lp-tab-visual-desc">Valor variável por dia da semana</div></div></div>
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">🏦</div><div><div className="lp-tab-visual-label">Conciliação Bancária</div><div className="lp-tab-visual-desc">Importação Stone + batimento automático</div></div></div>
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">💸</div><div><div className="lp-tab-visual-label">Despesas & Fornecedores</div><div className="lp-tab-visual-desc">NF, PIX, dados bancários completos</div></div></div>
              </div>
            </div>
          </div>

          {/* Tab 3: Auditoria & Controle */}
          <div className="lp-tab-content" id="lp-tab-auditoria">
            <div className="lp-tab-panel">
              <div className="lp-tab-text">
                <h3>Auditoria & Controle</h3>
                <h2>Cada centavo rastreado. Cada mudança registrada.</h2>
                <p>Trilha completa de auditoria com quem mudou, quando e o antes/depois de cada alteração. Permissões granulares por unidade com controle master.</p>
                <ul className="lp-tab-features">
                  <li>Log completo de alterações (quem, quando, antes/depois)</li>
                  <li>Extrato analítico de pagamentos com filtros avançados</li>
                  <li>Permissões por perfil com override por unidade</li>
                  <li>Admin master com visão total cross-unidade</li>
                </ul>
                <a href="https://wa.me/5511999999999" className="lp-btn-cta" target="_blank" rel="noopener noreferrer">Ver demonstração</a>
              </div>
              <div className="lp-tab-visual">
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">🔒</div><div><div className="lp-tab-visual-label">Auditoria Geral</div><div className="lp-tab-visual-desc">Histórico completo de alterações</div></div></div>
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">📋</div><div><div className="lp-tab-visual-label">Extrato de Pagamentos</div><div className="lp-tab-visual-desc">Histórico analítico com breakdown</div></div></div>
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">🛡️</div><div><div className="lp-tab-visual-label">Permissões Granulares</div><div className="lp-tab-visual-desc">Override por unidade, master admin</div></div></div>
                <div className="lp-tab-visual-row"><div className="lp-tab-visual-icon">🏢</div><div><div className="lp-tab-visual-label">Multi-Unidade</div><div className="lp-tab-visual-desc">Gestão centralizada de todas as unidades</div></div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ MÓDULOS ═══ */}
      <section className="lp-section lp-modules-section" id="modulos">
        <div className="lp-container">
          <div className="lp-section-header lp-fade-in">
            <div className="lp-section-badge">🧩 Módulos</div>
            <h2 className="lp-section-title">22 módulos integrados em uma só plataforma</h2>
            <p className="lp-section-subtitle">Cada módulo foi construído para resolver problemas reais do dia a dia de quem opera múltiplas unidades.</p>
          </div>

          <div className="lp-modules-grid">
            {[
              { icon: '📊', name: 'Dashboard', desc: 'Métricas e indicadores operacionais em tempo real por unidade.' },
              { icon: '💰', name: 'Controle de Caixa', desc: 'Abertura, recebimentos, sangrias e fechamento diário.' },
              { icon: '📅', name: 'Escalas', desc: 'Turnos, presenças e frequência de colaboradores.' },
              { icon: '🏍️', name: 'Motoboys', desc: 'Entregas, comissões e auditoria de delivery.' },
              { icon: '👥', name: 'Colaboradores', desc: 'Cadastro, histórico e dados de funcionários.' },
              { icon: '💸', name: 'Saídas', desc: 'Registro e controle de saídas operacionais.' },
              { icon: '💳', name: 'Folha CLT', desc: 'Cálculo de folha com INSS, VT e feriados automáticos.' },
              { icon: '🎯', name: 'Freelancers', desc: 'Pagamento por turno com valor variável por dia.' },
              { icon: '🧾', name: 'Adiantamentos', desc: 'Parcelas, saldos em aberto e controle de antecipações.' },
              { icon: '💵', name: 'Fechamento Dinheiro', desc: 'Batimento de sangrias × pagamentos em espécie.' },
              { icon: '📋', name: 'Extrato', desc: 'Histórico analítico de pagamentos e descontos.' },
              { icon: '🔍', name: 'Audit. Motoboys', desc: 'Visão linha a linha de entregas e descontos por semana.' },
              { icon: '🔒', name: 'Auditoria Geral', desc: 'Log completo — quem mudou, quando, antes/depois.' },
              { icon: '🏦', name: 'Conciliação Bancária', desc: 'Importação de extrato Stone e conciliação automática.' },
              { icon: '💸', name: 'Despesas', desc: 'Registro via formulário ou NF com status de pagamento.' },
              { icon: '🏪', name: 'Fornecedores', desc: 'Dados bancários, PIX e formas de pagamento.' },
              { icon: '📥', name: 'Importações Contábeis', desc: 'PDFs da contabilidade distribuídos para folha e saídas.' },
              { icon: '📢', name: 'Recrutamento', desc: 'Vagas, formulário público e triagem de candidatos.' },
              { icon: '🎉', name: 'Feriados', desc: 'Configuração de feriados que afeta cálculo da folha.' },
              { icon: '🏢', name: 'Unidades', desc: 'Cadastro e gestão de múltiplas unidades.' },
              { icon: '🔐', name: 'Usuários', desc: 'Controle de acesso, perfis e credenciais.' },
              { icon: '🛡️', name: 'Permissões', desc: 'Configuração granular por unidade com admin master.' },
            ].map((m, i) => (
              <div className="lp-module-card lp-fade-in" key={i}>
                <span className="lp-module-icon">{m.icon}</span>
                <div className="lp-module-name">{m.name}</div>
                <div className="lp-module-desc">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ JORNADA ═══ */}
      <section className="lp-section" id="jornada">
        <div className="lp-container">
          <div className="lp-section-header lp-fade-in">
            <div className="lp-section-badge">🔄 Jornada Operacional</div>
            <h2 className="lp-section-title">Do cadastro ao relatório, tudo conectado</h2>
            <p className="lp-section-subtitle">Cada etapa da operação alimenta a próxima. Sem gaps, sem retrabalho, sem planilhas paralelas.</p>
          </div>

          <div className="lp-journey-track lp-fade-in">
            {[
              { icon: '📋', num: 'Etapa 1', title: 'Cadastro', desc: 'Unidades, colaboradores e fornecedores' },
              { icon: '📅', num: 'Etapa 2', title: 'Escalas', desc: 'Turnos, presenças e frequência' },
              { icon: '⚙️', num: 'Etapa 3', title: 'Operação', desc: 'Caixa, entregas e saídas diárias' },
              { icon: '💳', num: 'Etapa 4', title: 'Pagamento', desc: 'Folha CLT, freelancers e motoboys' },
              { icon: '🔍', num: 'Etapa 5', title: 'Auditoria', desc: 'Conciliação, extratos e logs' },
              { icon: '📊', num: 'Etapa 6', title: 'Relatórios', desc: 'KPIs, dashboards e decisões' },
            ].map((s, i) => (
              <div className="lp-journey-step" key={i}>
                <div className="lp-journey-dot">{s.icon}</div>
                <div className="lp-journey-step-num">{s.num}</div>
                <div className="lp-journey-step-title">{s.title}</div>
                <div className="lp-journey-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DEPOIMENTOS ═══ */}
      <section className="lp-section lp-bg-alt">
        <div className="lp-container">
          <div className="lp-section-header lp-fade-in">
            <div className="lp-section-badge">💬 Depoimentos</div>
            <h2 className="lp-section-title">O que nossos clientes dizem</h2>
            <p className="lp-section-subtitle">Veja como o GIRES está transformando a gestão de redes de restaurantes.</p>
          </div>

          <div className="lp-testimonials-grid">
            {[
              { initials: 'RA', name: 'Roberto Almeida', role: 'Proprietário — 3 unidades', text: '"Com o GIRES consigo ver todas as unidades em uma tela só. Antes eu gastava horas viajando entre restaurantes pra conferir caixa — agora faço tudo pelo celular."' },
              { initials: 'CF', name: 'Carla Ferreira', role: 'Controller Financeira', text: '"A auditoria geral mudou nosso controle financeiro. Cada alteração fica registrada com nome, data e o que mudou. Acabaram os \'eu não fiz isso\'."' },
              { initials: 'MS', name: 'Marcos Silva', role: 'Gerente de Operações', text: '"Pagar freelancers com valor por dia da semana era um pesadelo no Excel. Agora o sistema calcula certinho e o extrato fica disponível na hora."' },
            ].map((t, i) => (
              <div className={`lp-testimonial-card lp-fade-in ${i > 0 ? `lp-delay-${i}` : ''}`} key={i}>
                <div className="lp-testimonial-stars">★★★★★</div>
                <p className="lp-testimonial-text">{t.text}</p>
                <div className="lp-testimonial-author">
                  <div className="lp-testimonial-avatar">{t.initials}</div>
                  <div>
                    <div className="lp-testimonial-name">{t.name}</div>
                    <div className="lp-testimonial-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="lp-section lp-faq-section" id="faq">
        <div className="lp-container">
          <div className="lp-section-header lp-fade-in">
            <div className="lp-section-badge">❓ FAQ</div>
            <h2 className="lp-section-title">Perguntas frequentes</h2>
            <p className="lp-section-subtitle">Tudo que você precisa saber sobre o GIRES antes de começar.</p>
          </div>

          <div className="lp-faq-list">
            {[
              { q: 'O que é o GIRES?', a: 'GIRES (Gestão Integrada de Recursos, Equipes e Serviços) é uma plataforma completa para gestão de redes de restaurantes e negócios multi-unidade. Reúne 22 módulos — do controle de caixa à folha de pagamento, passando por escalas, auditoria e conciliação bancária — em uma única interface cloud.' },
              { q: 'Como funciona a gestão multi-unidade?', a: 'Cada unidade (identificada por CNPJ) tem seus próprios dados, colaboradores e caixas. O admin master visualiza todas as unidades em um dashboard centralizado e pode alternar entre elas com um clique. Permissões podem ser customizadas por unidade — um gerente pode ter acesso total na unidade dele e nenhum na outra.' },
              { q: 'Meus dados estão seguros?', a: 'Sim. Toda a infraestrutura roda na AWS (Amazon Web Services) com criptografia em trânsito e em repouso. Cada alteração é registrada em log de auditoria imutável — você sabe quem mudou o quê, quando e o valor anterior. Backups automáticos garantem que nenhum dado seja perdido.' },
              { q: 'Posso controlar permissões por unidade?', a: 'Sim! O GIRES tem um sistema de permissões hierárquico: perfis globais (operador, gerente, admin, RH) com possibilidade de override por unidade. O admin master tem acesso irrestrito a todas as unidades. Você pode, por exemplo, permitir que um gerente veja a folha em uma unidade mas não em outra.' },
              { q: 'Como funciona o pagamento de freelancers?', a: 'Freelancers podem ter acordo por valor fixo ou tabela variável por dia da semana (ex: seg=R$100, ter/qua=R$80, qui-dom=R$120). O sistema calcula automaticamente o valor correto com base nos turnos trabalhados na escala. A auditoria mostra cada turno linha a linha para conferência antes da confirmação do pagamento.' },
              { q: 'Integra com Stone?', a: 'Sim! O módulo de Conciliação Bancária permite importar extratos Stone e fazer o batimento automático com as saídas registradas no sistema. Discrepâncias são destacadas para revisão manual, garantindo que nenhum valor passe despercebido.' },
            ].map((faq, i) => (
              <div className="lp-faq-item lp-fade-in" key={i}>
                <button className="lp-faq-question" onClick={handleFaqClick}>
                  {faq.q}
                  <span className="lp-faq-chevron">▼</span>
                </button>
                <div className="lp-faq-answer">
                  <div className="lp-faq-answer-inner">{faq.a}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA FINAL ═══ */}
      <section className="lp-section lp-cta-section">
        <div className="lp-container">
          <div className="lp-fade-in">
            <h2 className="lp-cta-title">Pronto para transformar sua operação?</h2>
            <p className="lp-cta-subtitle">
              Junte-se aos gestores que já trocaram planilhas por controle real.
              Comece agora, sem compromisso.
            </p>
            <div className="lp-hero-cta">
              <a href="https://wa.me/5511999999999" className="lp-btn-cta lp-btn-cta-large" target="_blank" rel="noopener noreferrer">
                Falar com especialista
              </a>
              <Link to="/login" className="lp-btn-secondary">
                Acessar o sistema →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <div className="lp-nav-logo">
                <span className="lp-nav-logo-icon">⚙️</span>
                <span>GIRES</span>
              </div>
              <p>Gestão Integrada de Recursos, Equipes e Serviços. A plataforma completa para redes de restaurantes.</p>
            </div>

            <div className="lp-footer-col">
              <h4>Operacional</h4>
              <ul>
                <li><a href="#modulos">Dashboard</a></li>
                <li><a href="#modulos">Controle de Caixa</a></li>
                <li><a href="#modulos">Escalas</a></li>
                <li><a href="#modulos">Motoboys</a></li>
                <li><a href="#modulos">Colaboradores</a></li>
                <li><a href="#modulos">Saídas</a></li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h4>Folha & Pagamento</h4>
              <ul>
                <li><a href="#modulos">Folha CLT</a></li>
                <li><a href="#modulos">Freelancers</a></li>
                <li><a href="#modulos">Adiantamentos</a></li>
                <li><a href="#modulos">Fechamento Dinheiro</a></li>
                <li><a href="#modulos">Extrato</a></li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h4>Auditoria & Financeiro</h4>
              <ul>
                <li><a href="#modulos">Auditoria Geral</a></li>
                <li><a href="#modulos">Conciliação Bancária</a></li>
                <li><a href="#modulos">Despesas</a></li>
                <li><a href="#modulos">Fornecedores</a></li>
                <li><a href="#modulos">Importações Contábeis</a></li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h4>RH & Admin</h4>
              <ul>
                <li><a href="#modulos">Recrutamento</a></li>
                <li><a href="#modulos">Feriados</a></li>
                <li><a href="#modulos">Unidades</a></li>
                <li><a href="#modulos">Usuários</a></li>
                <li><a href="#modulos">Permissões</a></li>
              </ul>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span>© 2025–2026 GIRES Tecnologia. Todos os direitos reservados.</span>
            <span>Feito com ⚙️ para quem opera múltiplas unidades.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

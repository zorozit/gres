import React from 'react';

interface FooterProps {
  showLinks?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ showLinks = true }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer style={styles.footer}>
      <div style={styles.footerContent}>
        <div style={styles.footerSection}>
          <h4 style={styles.sectionTitle}>GRES - Sistema de Gestão de Restaurantes</h4>
          <p style={styles.sectionText}>
            Versão 1.0.0 | © {currentYear} - Todos os direitos reservados
          </p>
        </div>

        {showLinks && (
          <div style={styles.footerSection}>
            <h4 style={styles.sectionTitle}>Links Úteis</h4>
            <ul style={styles.linkList}>
              <li><a href="/dashboard" style={styles.link}>Dashboard</a></li>
              <li><a href="/modulos" style={styles.link}>Módulos</a></li>
              <li><a href="/modulos/caixa" style={styles.link}>Controle de Caixa</a></li>
            </ul>
          </div>
        )}

        <div style={styles.footerSection}>
          <h4 style={styles.sectionTitle}>Suporte</h4>
          <p style={styles.sectionText}>
            Para dúvidas ou problemas, entre em contato com o administrador do sistema.
          </p>
        </div>
      </div>

      <div style={styles.footerBottom}>
        <p style={styles.bottomText}>
          Desenvolvido com ❤️ para otimizar a gestão de seu restaurante
        </p>
      </div>
    </footer>
  );
};

const styles = {
  footer: {
    backgroundColor: '#2c3e50',
    color: '#ecf0f1',
    padding: '40px 20px 20px',
    marginTop: '40px',
    borderTop: '3px solid #3498db',
  },
  footerContent: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '30px',
    maxWidth: '1400px',
    margin: '0 auto 20px',
  },
  footerSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  sectionTitle: {
    margin: '0 0 10px 0',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#3498db',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  sectionText: {
    margin: 0,
    fontSize: '13px',
    color: '#bdc3c7',
    lineHeight: '1.6',
  },
  linkList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  link: {
    color: '#3498db',
    textDecoration: 'none',
    fontSize: '13px',
    transition: 'color 0.3s',
  },
  footerBottom: {
    borderTop: '1px solid #34495e',
    paddingTop: '20px',
    textAlign: 'center' as const,
    maxWidth: '1400px',
    margin: '0 auto',
  },
  bottomText: {
    margin: 0,
    fontSize: '12px',
    color: '#95a5a6',
  },
};

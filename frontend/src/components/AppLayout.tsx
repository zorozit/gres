import React from 'react';
import { SidebarNav } from './SidebarNav';
import './AppLayout.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout principal do sistema — sidebar fixa à esquerda + área de conteúdo scrollável.
 * Envolve todas as rotas protegidas (exceto login e formulário público de vagas).
 */
export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="app-layout">
      <SidebarNav />
      <main className="app-layout-content">
        {children}
      </main>
    </div>
  );
};

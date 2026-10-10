import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Terra Link', description: 'Trazabilidad y debida diligencia de cacao' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <strong>Terra Link</strong>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}

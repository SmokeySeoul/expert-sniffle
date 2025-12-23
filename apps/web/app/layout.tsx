import './globals.css';
import { ReactNode } from 'react';
import { QueryProvider } from '../components/query-provider';

export const metadata = {
  title: 'Substream',
  description: 'Insights'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <QueryProvider>
          <main className="min-h-screen">{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}

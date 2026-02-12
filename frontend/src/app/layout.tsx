import type { Metadata } from 'next';
import './globals.css';
import LanguageProvider from '@/components/LanguageProvider';
import { ToastProvider } from '@/components/Toast';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: 'FreelancerOS - \u05e0\u05d9\u05d4\u05d5\u05dc \u05d4\u05e2\u05e1\u05e7 \u05e9\u05dc\u05d9',
  description: 'Freelancer management system - clients, projects, invoices, taxes, and financial tracking.',
  keywords: ['freelancer', 'invoices', 'clients', 'projects', 'tax', 'finance'],
  authors: [{ name: 'FreelancerOS' }],
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#4f46e5" />
      </head>
      <body className="min-h-screen bg-[var(--background)] font-sans antialiased">
        <ThemeProvider>
          <LanguageProvider>
            <ToastProvider>{children}</ToastProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

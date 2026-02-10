import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import LanguageProvider from '@/components/LanguageProvider';
import { ToastProvider } from '@/components/Toast';
import { ThemeProvider } from '@/components/ThemeProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  title: 'Our Money – Household Finance',
  description: 'Track income, expenses, and accounts together.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className={inter.variable} suppressHydrationWarning>
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

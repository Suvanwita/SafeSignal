import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SafeSignal',
  description: 'Open-source digital safety and accountability platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}

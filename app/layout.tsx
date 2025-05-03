import '../styles/globals.css';

export const metadata = {
  title: 'CRM App',
  description: 'CRM personalizado',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head />
      <body className="bg-gray-100 text-gray-900">{children}</body>
    </html>
  );
}
import './globals.css';

export const metadata = {
  title: 'Seguimiento comercial',
  description: 'CRM de seguimiento comercial',
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1B4D2E',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-gray-100 text-gray-900">{children}</body>
    </html>
  );
}

import './globals.css';
import 'leaflet/dist/leaflet.css';
import type { Metadata, Viewport } from 'next';
import { PwaRegistration } from './components/PwaRegistration';

export const metadata: Metadata = {
  title: 'Transit Compass HK',
  description: '香港多模式公共交通路線規劃器，整合官方交通資料來源。',
  applicationName: 'Transit Compass HK',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/app-192.png', apple: '/icons/app-192.png' },
  appleWebApp: { capable: true, title: 'Transit Compass', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#2e9127', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body><PwaRegistration />{children}</body>
    </html>
  );
}

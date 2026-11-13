import './globals.css';
import 'leaflet/dist/leaflet.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Transit Compass HK',
  description: '香港多模式公共交通路線規劃器，整合官方交通資料來源。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import { OpenDataExplorer } from '../components/OpenDataExplorer';
export const metadata: Metadata = { title: '台灣道路及交通 | Transit Compass', description: 'Taiwan open road and transport map. No account or API key required.' };
export function TaiwanDataPage({ locale }: { locale: 'zh' | 'en' }) { return <OpenDataExplorer initialRegion="taiwan" locale={locale} />; }

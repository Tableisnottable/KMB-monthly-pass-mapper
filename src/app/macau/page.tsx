import type { Metadata } from 'next';
import { MacauPlanner } from './MacauPlanner';
import './macau.css';
export const metadata: Metadata = { title: '澳門 · Transit Compass 預覽', description: '澳門巴士及輕軌路線規劃預覽。清楚標示已核實資料與估算。', applicationName: 'Transit Compass Macao', manifest: '/macau.webmanifest', appleWebApp: { capable: true, title: 'Transit Macao', statusBarStyle: 'default' } };
export default function MacauPage() { return <MacauPlanner locale="zh" />; }

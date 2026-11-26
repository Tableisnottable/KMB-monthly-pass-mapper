import type { Metadata } from 'next';
import { MacauPlanner } from './MacauPlanner';
import './macau.css';
export const metadata: Metadata = { title: '澳門 · Transit Compass', description: '澳門巴士及輕軌路線規劃，提供票價及巴士到站推算。' };
export default function MacauPage() { return <MacauPlanner locale="zh" />; }

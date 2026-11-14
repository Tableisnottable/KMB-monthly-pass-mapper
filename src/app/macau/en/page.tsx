import type { Metadata } from 'next';
import { MacauPlanner } from '../MacauPlanner';
import '../macau.css';
export const metadata: Metadata = { title: 'Macao · Transit Compass Preview', description: 'Macao bus and light rail planning preview, with verified data and estimates clearly separated.' };
export default function MacauEnglishPage() { return <MacauPlanner locale="en" />; }

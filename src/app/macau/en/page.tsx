import type { Metadata } from 'next';
import { MacauPlanner } from '../MacauPlanner';
import '../macau.css';
export const metadata: Metadata = { title: 'Macao · Transit Compass', description: 'Plan Macao bus and light rail journeys and check fares and predicted bus arrivals.' };
export default function MacauEnglishPage() { return <MacauPlanner locale="en" />; }

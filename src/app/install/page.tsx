import type { Metadata } from 'next';
import { AppInstallPanel } from '../components/AppInstallPanel';

export const metadata: Metadata = { title: 'Install Transit Compass HK' };

export default function InstallPage() { return <AppInstallPanel />; }

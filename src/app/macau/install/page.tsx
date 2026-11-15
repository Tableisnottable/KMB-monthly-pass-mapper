import type { Metadata } from 'next';
import { AppInstallPanel } from '../../components/AppInstallPanel';
export const metadata: Metadata = {
  title: 'Install Transit Compass Macao',
  description: 'Install the Macao bus and light rail preview as a web app.',
  applicationName: 'Transit Compass Macao',
  manifest: '/macau.webmanifest',
  appleWebApp: { capable: true, title: 'Transit Macao', statusBarStyle: 'default' },
};
export default function MacauInstallPage() { return <AppInstallPanel city="macau" />; }

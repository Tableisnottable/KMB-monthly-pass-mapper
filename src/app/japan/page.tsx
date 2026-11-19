import { OpenDataExplorer } from '../components/OpenDataExplorer';
export const metadata = { title: '日本道路及交通 | Transit Compass' };
export default function Page() { return <OpenDataExplorer initialRegion="japan" locale="zh" />; }

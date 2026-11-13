import type { CSSProperties } from 'react';

const paths: Record<string, React.ReactNode> = {
  compass: <><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/></>,
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  swap: <><path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4"/></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/></>,
  bus: <><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M8 15h1m6 0h1M9 6h6"/></>,
  walk: <><circle cx="14" cy="4" r="2"/><path d="m10 21 2-7-3-3 3-4 3 5 4 1M6 13l3-2m3 3 5 7"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  layers: <><path d="m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 5 9-5M3 18l9 5 9-5"/></>,
  locate: <><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  external: <><path d="M14 3h7v7m0-7L10 14M10 3H4v17h17v-6"/></>,
};

export function PlannerIcon({ name, size = 20, style }: { name: string; size?: number; style?: CSSProperties }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={style}>{paths[name] ?? paths.compass}</svg>;
}

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 18px 40px rgba(15, 23, 42, 0.10)',
        card: '0 1px 3px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.06)',
        pop: '0 8px 28px rgba(15, 23, 42, 0.16)',
      },
      colors: {
        city: {
          ink: '#0f172a',
          panel: '#ffffff',
          soft: '#f3f6fb',
          accent: '#3966ff',
          accentSoft: '#eaf0ff',
          mint: '#14b8a6',
          ember: '#ff7a59',
          bus: '#f5a623',
          subway: '#2b7cff',
          walk: '#5f6c7b',
        },
        cm: {
          green: '#00d563',
          greenDark: '#00a84d',
          greenDeep: '#007a3d',
          ink: '#1a1a1a',
          paper: '#f2f4f3',
          card: '#ffffff',
          line: '#e3e8e5',
          muted: '#6b7280',
          kmb: '#e4002b',
          lwb: '#ff6a00',
          mtr: '#a6192e',
          ctb: '#f7b500',
          ferry: '#0ea5e9',
          walk: '#9aa3ad',
        },
      },
      fontFamily: {
        cm: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"Segoe UI"',
          'Roboto',
          '"Noto Sans HK"',
          '"PingFang HK"',
          '"Microsoft JhengHei"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;

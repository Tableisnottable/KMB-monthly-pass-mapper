'use client';

import { useEffect, useState } from 'react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function AppInstallPanel() {
  const [english, setEnglish] = useState(true);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const text = (zh: string, en: string) => english ? en : zh;

  useEffect(() => {
    setEnglish(new URLSearchParams(window.location.search).get('lang') !== 'zh');
    const standalone = window.matchMedia('(display-mode: standalone)');
    const updateDisplay = () => setInstalled(standalone.matches);
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    updateDisplay();
    standalone.addEventListener('change', updateDisplay);
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', complete);
    return () => {
      standalone.removeEventListener('change', updateDisplay);
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', complete);
    };
  }, []);

  async function install() {
    if (!prompt || busy) return;
    setBusy(true); setMessage('');
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setMessage(text('請在 Android 完成安裝，然後從主畫面開啟。', 'Finish installation in Android, then open the app from your home screen.'));
    } catch {
      setMessage(text('請使用下方的 Chrome 選單步驟安裝。', 'Use the Chrome menu steps below to install.'));
    } finally { setPrompt(null); setBusy(false); }
  }

  return <main className="install-page" lang={english ? 'en' : 'zh-HK'}>
    <header><a href={english ? '/en' : '/'}>← {text('返回行程規劃', 'Back to planner')}</a>
      <a href={'/install?lang=' + (english ? 'zh' : 'en')}>{english ? '繁體中文' : 'English'}</a></header>
    <section className="install-card">
      <img src="/icons/app-192.png" width="80" height="80" alt="" />
      <p className="install-eyebrow">TRANSIT COMPASS HK</p>
      <h1>{text('在 Pixel 8 安裝 App', 'Install on your Pixel 8')}</h1>
      <p>{text('將交通規劃器加入主畫面，以獨立 App 視窗開啟。使用相同的路線權重、普通成人車費、班次及地圖。', 'Add the planner to your home screen and open it in its own app window. Use the same route scoring, adult fares, timetables and maps.')}</p>
      {installed ? <p className="install-status" role="status">{text('已在 App 視窗開啟。', 'You are using the installed app.')}</p>
        : prompt && <button className="install-primary" type="button" disabled={busy} onClick={() => void install()}>{busy ? text('正在開啟安裝…', 'Opening installer…') : text('安裝 App', 'Install app')}</button>}
      {message && <p className="install-status" role="status">{message}</p>}
      {!installed && <>
        <h2>{text('使用 Android Chrome 安裝', 'Install with Chrome on Android')}</h2>
        <ol>
          <li>{text('在 Pixel 8 的 Chrome 開啟此頁面。', 'Open this page in Chrome on your Pixel 8.')}</li>
          <li>{text('點選右上角 ⋮ 選單，再選「安裝及建立捷徑」→「安裝」。部分版本會顯示「加入主畫面」或「安裝應用程式」。', 'Tap the ⋮ menu, then Install and create shortcut → Install. Some versions show Add to home screen or Install app.')}</li>
          <li>{text('確認安裝，然後從主畫面或應用程式列表開啟 Transit Compass。', 'Confirm installation, then open Transit Compass from your home screen or app drawer.')}</li>
        </ol>
      </>}
      <a className="install-primary" href={english ? '/en' : '/'}>{text('開啟交通規劃器', 'Open the planner')}</a>
      <p className="install-note">{text('免費安裝的網頁 App，毋須 Play 商店。仍需網絡載入資料、地圖及即時到站；並非完整離線 App。首次搜尋可能較慢。', 'Free installable web app; no Play Store needed. An internet connection is still needed for data, maps and live arrivals. Full offline routing is not included. The first search may take longer.')}</p>
    </section>
  </main>;
}

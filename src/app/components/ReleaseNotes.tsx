'use client';
import { useEffect, useRef, useState } from 'react';
import { APP_VERSION, RELEASE_CHANGES, RELEASE_DATE } from '../../domain/appRelease';
import { copy, type PlannerLocale } from './plannerUi';

export function ReleaseNotes({ locale }: { locale: PlannerLocale }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem('compass-release-seen') !== APP_VERSION) setOpen(true); } catch { /* Manual version button remains available. */ }
  }, []);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  function close() {
    setOpen(false);
    try { localStorage.setItem('compass-release-seen', APP_VERSION); } catch { /* Storage may be blocked. */ }
  }
  return <>
    <button type="button" className="app-version" aria-haspopup="dialog" onClick={() => setOpen(true)} aria-label={copy(locale, '版本及更新紀錄', 'Version and release notes')}>v{APP_VERSION}</button>
    <dialog className="release-notes-dialog" ref={dialog} aria-labelledby="release-notes-title" onCancel={close} onClose={event => { if (event.target === event.currentTarget) close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <article><header><span>v{APP_VERSION} · {RELEASE_DATE}</span><button type="button" aria-label={copy(locale, '關閉更新紀錄', 'Close release notes')} onClick={close}>×</button></header>
        <h2 id="release-notes-title">{copy(locale, '今次更新', 'What’s new')}</h2>
        <ul>{RELEASE_CHANGES.map(([zh, en]) => <li key={en}>{copy(locale, zh, en)}</li>)}</ul>
        <button type="button" className="release-notes-done" onClick={close}>{copy(locale, '開始使用', 'Let’s go')}</button>
      </article>
    </dialog>
  </>;
}

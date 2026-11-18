'use client';
import { useRef, useState } from 'react';
import { passActive, paymentChoices, type OwnedPass, type PaymentChoice } from '../../domain/payment';
import { copy, type PlannerLocale } from './plannerUi';

export function PaymentControl({ value, onChange, passes, onPasses, locale }: { value: PaymentChoice; onChange: (value: PaymentChoice) => void; passes: OwnedPass[]; onPasses: (value: OwnedPass[]) => void; locale: PlannerLocale }) {
  const [name, setName] = useState('');
  const details = useRef<HTMLDetailsElement>(null);
  const fareChoice = useRef<HTMLDetailsElement>(null);
  const [panelTop, setPanelTop] = useState(80);
  const hasKmb = passes.some(pass => pass.id === 'kmb' && passActive(pass));
  const selectedChoice = paymentChoices.find(([id]) => id === value) ?? paymentChoices[0];
  return <div className="payment-controls"><details className="fare-profile-control fare-choice" ref={fareChoice}>
    <summary aria-label={copy(locale, '付款方式及票價', 'Payment and fare')}><span>{copy(locale, selectedChoice[1], selectedChoice[2])}</span><span aria-hidden="true">⌄</span></summary>
    <div className="fare-choice-list" role="group" aria-label={copy(locale, '選擇付款方式', 'Choose payment method')}>
      {paymentChoices.map(([id, zh, en]) => <button type="button" key={id} disabled={id === 'kmb-pass' && !hasKmb}
        aria-pressed={value === id} onClick={() => { onChange(id); if (fareChoice.current) fareChoice.current.open = false; }}>
        <span>{copy(locale, zh, en)}</span>{value === id && <span aria-hidden="true">✓</span>}
        {id === 'kmb-pass' && !hasKmb && <small>{copy(locale, '先加入月票', 'Add your pass first')}</small>}
      </button>)}
    </div>
  </details>
  <details className="my-passes" ref={details} onToggle={event => { if (event.currentTarget.open) setPanelTop(Math.min(event.currentTarget.querySelector('summary')!.getBoundingClientRect().bottom + 8, window.innerHeight - 240)); }}><summary>{copy(locale, '月票', 'Passes')} ({passes.length})</summary><div className="payment-pass-panel" style={{ top: panelTop }}>
    <div className="payment-pass-heading"><h3>{copy(locale, '我擁有的月票及通行證', 'Passes I own')}</h3><button type="button" onClick={() => { if (details.current) details.current.open = false; }}>{copy(locale, '完成', 'Done')}</button></div>
    <label className="owned-kmb-pass"><input type="checkbox" checked={passes.some(pass => pass.id === 'kmb')} onChange={event => {
      if (event.target.checked) { onPasses([...passes, { id: 'kmb', name: 'KMB Monthly Pass' }]); onChange('kmb-pass'); }
      else { onPasses(passes.filter(pass => pass.id !== 'kmb')); if (value === 'kmb-pass') onChange('adult-octopus'); }
    }} />{copy(locale, '有效九巴月票', 'KMB Monthly Pass')}</label>
    {passes.map(pass => <div className="owned-pass" key={pass.id}><strong>{pass.id === 'kmb' ? copy(locale, '九巴月票', 'KMB Monthly Pass') : pass.name}</strong>
      <label>{copy(locale, '到期日（可留空）', 'Expiry (optional)')}<input type="date" value={pass.expires ?? ''} onChange={event => {
        const next = passes.map(item => item.id === pass.id ? { ...item, expires: event.target.value || undefined } : item); onPasses(next);
        if (value === 'kmb-pass' && !next.some(item => item.id === 'kmb' && passActive(item))) onChange('adult-octopus');
      }} /></label>
      {!passActive(pass) && <small>{copy(locale, '已過期，不會套用。', 'Expired; not applied.')}</small>}
      {pass.id !== 'kmb' && <><small>{copy(locale, '只作記錄：未有已核實的車費規則，不會自動減價。', 'Record only: fare rules are unverified; no discount is applied.')}</small><button type="button" onClick={() => onPasses(passes.filter(item => item.id !== pass.id))}>{copy(locale, '移除', 'Remove')}</button></>}
    </div>)}
    <form className="add-pass" onSubmit={event => { event.preventDefault(); if (!name.trim() || passes.length >= 20) return; onPasses([...passes, { id: 'custom-' + Date.now(), name: name.trim().slice(0, 80) }]); setName(''); }}>
      <label><span>{copy(locale, '其他月票／通行證名稱', 'Other pass name')}</span><input maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder={copy(locale, '例如：港鐵全月通', 'For example: MTR Monthly Pass')} /></label><button type="submit" disabled={!name.trim() || passes.length >= 20}>{copy(locale, '加入', 'Add pass')}</button>
    </form>
    <p>{copy(locale, '選擇付款方式不代表每條路線都接受該方式。現金、銀行卡、手機錢包及二維碼票價尚未核實，選擇後不會假設與八達通相同。只在本裝置儲存選項及月票名稱，毋須輸入卡號。', 'Payment choices do not guarantee acceptance on every route. Cash, bank-card, wallet and QR fares are unverified and are not assumed equal to Octopus. Preferences and pass names are stored only on this device; no card numbers are needed.')}</p>
  </div></details></div>;
}

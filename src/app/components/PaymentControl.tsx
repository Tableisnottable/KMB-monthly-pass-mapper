'use client';
import { useState } from 'react';
import { ChoiceDialog } from './ChoiceDialog';
import { PassCatalog } from './PassCatalog';
import { passCatalog } from '../../domain/passCatalog';
import { passActive, paymentChoices, type OwnedPass, type PaymentChoice } from '../../domain/payment';
import { copy, type PlannerLocale } from './plannerUi';

export function PaymentControl({ value, onChange, passes, onPasses, locale, catalogOnly = false, regionId = 'all' }: { value: PaymentChoice; onChange: (value: PaymentChoice) => void; passes: OwnedPass[]; onPasses: (value: OwnedPass[]) => void; locale: PlannerLocale; catalogOnly?: boolean; regionId?: string }) {
  const [name, setName] = useState('');
  const hasKmb = passes.some(pass => pass.id === 'kmb' && passActive(pass));
  const selectedChoice = paymentChoices.find(([id]) => id === value) ?? paymentChoices[0];
  return <div className="payment-controls">
  {!catalogOnly && <ChoiceDialog className="payment-choice" title={copy(locale, '付款方式', 'Payment method')} closeLabel={copy(locale, '關閉付款選單', 'Close payment menu')}
    label={<span>{copy(locale, selectedChoice[1], selectedChoice[2])}</span>}>
    {close => <div className="payment-options">
      {([['八達通', 'Octopus', paymentChoices.slice(0, 4)], ['其他付款', 'Other payments', paymentChoices.slice(4)]] as const).map(([zh, en, choices]) => <section key={en}><h3>{copy(locale, zh, en)}</h3>
        {choices.map(([id, zh, en]) => <button className="payment-option" type="button" key={id} disabled={id === 'kmb-pass' && !hasKmb}
          aria-pressed={value === id} onClick={() => { onChange(id); close(); }}>
          <span className="choice-radio" aria-hidden="true">{value === id ? '●' : ''}</span><span>{copy(locale, zh, en)}
            {id === 'kmb-pass' && !hasKmb && <small>{copy(locale, '先在「票券」加入有效月票', 'Add an active pass in My passes first')}</small>}
            {['cash', 'bank-card', 'mobile-wallet', 'qr'].includes(id) && <small>{copy(locale, '車費及接受方式按路線確認', 'Fare and acceptance vary by route')}</small>}
          </span>
        </button>)}
      </section>)}
    </div>}
  </ChoiceDialog>}
  <ChoiceDialog className="pass-choice" title={copy(locale, '我的票券', 'My passes & cards')} closeLabel={copy(locale, '關閉票券', 'Close passes')}
    label={<span>{copy(locale, '票券', 'Passes')} <b>{passes.length}</b></span>}>
    {() => <div className="pass-manager">
    {!catalogOnly && <label className="owned-kmb-pass"><input type="checkbox" checked={passes.some(pass => pass.id === 'kmb')} onChange={event => {
      if (event.target.checked) { onPasses([...passes, { id: 'kmb', name: 'KMB Monthly Pass' }]); onChange('kmb-pass'); }
      else { onPasses(passes.filter(pass => pass.id !== 'kmb')); if (value === 'kmb-pass') onChange('adult-octopus'); }
    }} />{copy(locale, '有效九巴月票', 'KMB Monthly Pass')}</label>}
    {passes.map(pass => <div className="owned-pass" key={pass.id}><strong>{passCatalog.find(p => p.id === pass.id)?.[locale === 'en' ? 'en' : 'zh'] ?? pass.name}</strong>
      <label>{copy(locale, '到期日（可留空）', 'Expiry (optional)')}<input type="date" value={pass.expires ?? ''} onChange={event => {
        const next = passes.map(item => item.id === pass.id ? { ...item, expires: event.target.value || undefined } : item); onPasses(next);
        if (value === 'kmb-pass' && !next.some(item => item.id === 'kmb' && passActive(item))) onChange('adult-octopus');
      }} /></label>
      {!passActive(pass) && <small>{copy(locale, '已過期，不會套用。', 'Expired; not applied.')}</small>}
      {pass.id !== 'kmb' && <small>{copy(locale, '只作記錄，未套用車費優惠。', 'Record only; no fare discount applied.')}</small>}
      <button type="button" onClick={() => { onPasses(passes.filter(item => item.id !== pass.id)); if (pass.id === 'kmb' && value === 'kmb-pass') onChange('adult-octopus'); }}>{copy(locale, '移除', 'Remove')}</button>
    </div>)}
    <PassCatalog key={regionId} initialRegion={regionId} passes={passes} onAdd={pass => { if (!passes.some(p => p.id === pass.id) && passes.length < 20) { onPasses([...passes, pass]); if (pass.id === 'kmb') onChange('kmb-pass'); } }} locale={locale} />
    <form className="add-pass" onSubmit={event => { event.preventDefault(); if (!name.trim() || passes.length >= 20) return; onPasses([...passes, { id: 'custom-' + Date.now(), name: name.trim().slice(0, 80) }]); setName(''); }}>
      <label><span>{copy(locale, '其他月票／通行證名稱', 'Other pass name')}</span><input maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder={copy(locale, '例如：港鐵全月通', 'For example: MTR Monthly Pass')} /></label><button type="submit" disabled={!name.trim() || passes.length >= 20}>{copy(locale, '加入', 'Add pass')}</button>
    </form>
    <details className="payment-help"><summary>{copy(locale, '車費及付款說明', 'About fares and payments')}</summary><p>{copy(locale, '選擇付款方式不代表每條路線都接受該方式。現金、銀行卡、手機錢包及二維碼票價尚未核實，選擇後不會假設與八達通相同。只在本裝置儲存選項及月票名稱，毋須輸入卡號。', 'Payment choices do not guarantee acceptance on every route. Cash, bank-card, wallet and QR fares are unverified and are not assumed equal to Octopus. Preferences and pass names are stored only on this device; no card numbers are needed.')}</p></details>
  </div>}</ChoiceDialog></div>;
}

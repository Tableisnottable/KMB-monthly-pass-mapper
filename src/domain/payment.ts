import type { FareProfile } from './journeyFares';
export const paymentChoices = [
  ['adult-octopus', '成人八達通', 'Adult Octopus', 'adult'],
  ['mobile-octopus', '手機八達通（成人）', 'Mobile Octopus (adult)', 'adult'],
  ['student-octopus', '學生身分八達通', 'Student Octopus', 'student'],
  ['kmb-pass', '九巴月票＋八達通', 'KMB pass + Octopus', 'pass'],
  ['cash', '現金／單程票', 'Cash / single journey ticket', 'unverified'],
  ['bank-card', '感應式銀行卡', 'Contactless bank card', 'unverified'],
  ['mobile-wallet', '銀行卡手機錢包', 'Bank-card mobile wallet', 'unverified'],
  ['qr', '二維碼付款', 'QR payment', 'unverified'],
] as const;
export type PaymentChoice = typeof paymentChoices[number][0];
export type OwnedPass = { id: string; name: string; expires?: string };
export const paymentProfile = (payment: PaymentChoice): FareProfile => paymentChoices.find(row => row[0] === payment)?.[3] ?? 'unverified';
export const passActive = (pass: OwnedPass, date = new Date()) => !pass.expires || pass.expires >= new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export function readPaymentPreferences(raw: string | null): { payment: PaymentChoice; passes: OwnedPass[] } {
  const fallback = { payment: 'adult-octopus' as PaymentChoice, passes: [] as OwnedPass[] };
  try {
    const value = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object' || !Array.isArray(value.passes) || !paymentChoices.some(row => row[0] === value.payment)) return fallback;
    const passes: OwnedPass[] = value.passes.slice(0, 20).filter((pass: OwnedPass) => pass && typeof pass.id === 'string' && pass.id.length <= 100 && typeof pass.name === 'string' && pass.name.trim().length > 0 && pass.name.length <= 80 && (!pass.expires || /^\d{4}-\d{2}-\d{2}$/.test(pass.expires)));
    const payment = value.payment === 'kmb-pass' && !passes.some(pass => pass.id === 'kmb' && passActive(pass)) ? 'adult-octopus' : value.payment;
    return { payment, passes };
  } catch { return fallback; }
}

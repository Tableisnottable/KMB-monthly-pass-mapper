import { describe, expect, it } from 'vitest';
import { passActive, paymentChoices, paymentProfile, readPaymentPreferences } from './payment';
describe('Payment and owned-pass preferences', () => {
  it('uses only verified fare profiles and keeps other payment prices unverified', () => {
    expect(paymentProfile('kmb-pass')).toBe('pass'); expect(paymentProfile('student-octopus')).toBe('student');
    expect(paymentProfile('mobile-octopus')).toBe('adult');
    for (const method of ['cash', 'bank-card', 'mobile-wallet', 'qr'] as const) expect(paymentProfile(method)).toBe('unverified');
    expect(new Set(paymentChoices.map(row => row[0])).size).toBe(paymentChoices.length);
  });
  it('requires an owned, unexpired pass before restoring its selected fare', () => {
    expect(readPaymentPreferences('{"payment":"kmb-pass","passes":[]}').payment).toBe('adult-octopus');
    expect(readPaymentPreferences('{"payment":"kmb-pass","passes":[{"id":"kmb","name":"KMB","expires":"2000-01-01"}]}').payment).toBe('adult-octopus');
    expect(readPaymentPreferences('{"payment":"kmb-pass","passes":[{"id":"kmb","name":"KMB"}]}').payment).toBe('kmb-pass');
    expect(passActive({ id: 'kmb', name: 'KMB', expires: '2026-11-14' }, new Date('2026-11-14T15:59:59Z'))).toBe(true);
    expect(passActive({ id: 'kmb', name: 'KMB', expires: '2026-11-14' }, new Date('2026-11-14T16:00:00Z'))).toBe(false);
  });
  it('recovers safely from bad storage without treating custom pass names as discounts', () => {
    expect(readPaymentPreferences('broken').payment).toBe('adult-octopus');
    expect(readPaymentPreferences('{"payment":"cash","passes":[null,{"id":"custom","name":"MTR"}]}').passes).toHaveLength(1);
  });
});

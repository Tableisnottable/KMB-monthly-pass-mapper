/** Public operator product directories; no paid data feeds, eligibility or fare assumptions. */
export type PassProduct = { id: string; region: string; zh: string; en: string; source: string; pricing: boolean };
const products = (region: string, source: string, rows: [string, string, string][]): PassProduct[] => rows.map(([id, zh, en]) => ({ id, zh, en, region, source, pricing: false }));
export const passCatalog: PassProduct[] = [
  { id: 'kmb', region: 'hong-kong', zh: '九巴月票', en: 'KMB Monthly Pass', source: 'https://www.kmb.hk/monthlypass.html', pricing: true },
  ...products('hong-kong', 'https://www.mtr.com.hk/ch/customer/tickets/monthly_pass_extra.html', [
    ['mtr-sheungshui', '港鐵全月通：上水／烏溪沙－尖東', 'MTR Monthly Pass: Sheung Shui / Wu Kai Sha – East Tsim Sha Tsui'],
    ['mtr-tuenmun-namcheong', '港鐵全月通：屯門－南昌', 'MTR Monthly Pass: Tuen Mun – Nam Cheong'],
    ['mtr-tuenmun-hunghom', '港鐵全月通：屯門－紅磡', 'MTR Monthly Pass: Tuen Mun – Hung Hom'],
    ['mtr-tungchung-namcheong', '港鐵全月通：東涌－南昌', 'MTR Monthly Pass: Tung Chung – Nam Cheong'],
    ['mtr-tungchung-hongkong', '港鐵全月通：東涌－香港', 'MTR Monthly Pass: Tung Chung – Hong Kong'],
  ]),
  ...products('taiwan', 'https://www.thb.gov.tw/', [
    ['tpass-north', 'TPASS 基北北桃都會通', 'TPASS Keelung–Taipei–New Taipei–Taoyuan'],
    ['tpass-central', 'TPASS 中彰投苗生活圈', 'TPASS Taichung–Changhua–Nantou–Miaoli'],
    ['tpass-south', 'TPASS 南高屏生活圈', 'TPASS Tainan–Kaohsiung–Pingtung'],
  ]),
  ...products('japan', 'https://japanrailpass.net/en/', [['jr-national', 'JAPAN RAIL PASS 全國版', 'JAPAN RAIL PASS']]),
  ...products('japan', 'https://www.jreast.co.jp/multi/en/pass/', [
    ['jr-east-tohoku', 'JR EAST PASS 東北地區', 'JR EAST PASS (Tohoku area)'],
    ['jr-east-nagano', 'JR EAST PASS 長野、新潟地區', 'JR EAST PASS (Nagano, Niigata area)'],
    ['jr-tokyo-wide', 'JR 東京廣域周遊券', 'JR TOKYO Wide Pass'],
  ]),
  ...products('japan', 'https://www.westjr.co.jp/global/en/ticket/', [
    ['jr-kansai', 'JR 關西地區鐵路周遊券', 'JR Kansai Area Pass'],
    ['jr-kansai-wide', 'JR 關西廣域鐵路周遊券', 'JR Kansai WIDE Area Pass'],
    ['jr-kansai-hiroshima', 'JR 關西、廣島地區鐵路周遊券', 'JR Kansai–Hiroshima Area Pass'],
    ['jr-sanyo-sanin', 'JR 山陽、山陰地區鐵路周遊券', 'JR Sanyo–Sanin Area Pass'],
    ['jr-hokuriku', 'JR 北陸地區鐵路周遊券', 'JR Hokuriku Area Pass'],
    ['jr-kansai-hokuriku', 'JR 關西、北陸地區鐵路周遊券', 'JR Kansai–Hokuriku Area Pass'],
  ]),
  ...products('japan', 'https://www.jrkyushu.co.jp/english/railpass/railpass.html', [
    ['jr-kyushu', 'JR 九州鐵路周遊券：全九州', 'JR KYUSHU RAIL PASS (All Kyushu)'],
    ['jr-kyushu-north', 'JR 九州鐵路周遊券：北部九州', 'JR KYUSHU RAIL PASS (Northern Kyushu)'],
    ['jr-kyushu-south', 'JR 九州鐵路周遊券：南部九州', 'JR KYUSHU RAIL PASS (Southern Kyushu)'],
  ]),
  ...products('japan', 'https://www.jrhokkaido.co.jp/global/english/ticket/', [['jr-hokkaido', 'JR 北海道鐵路周遊券', 'Hokkaido Rail Pass']]),
  ...products('japan', 'https://www.tokyometro.jp/en/ticket/travel/index.html', [
    ['tokyo-subway-24', 'Tokyo Subway Ticket 24 小時', 'Tokyo Subway Ticket 24-hour'],
    ['tokyo-subway-48', 'Tokyo Subway Ticket 48 小時', 'Tokyo Subway Ticket 48-hour'],
    ['tokyo-subway-72', 'Tokyo Subway Ticket 72 小時', 'Tokyo Subway Ticket 72-hour'],
  ]),
  ...products('singapore', 'https://thesingaporetouristpass.com.sg/', [['singapore-tourist', '新加坡遊客通行卡', 'Singapore Tourist Pass']]),
];

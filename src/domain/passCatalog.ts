/** Public operator product directories; no paid data feeds, eligibility or fare assumptions. */
export type PassProduct = { id: string; region: string; zh: string; en: string; source: string; pricing: boolean; kind?: 'card' };
const products = (region: string, source: string, rows: [string, string, string][], kind?: 'card'): PassProduct[] => rows.map(([id, zh, en]) => ({ id, zh, en, region, source, pricing: false, ...(kind ? { kind } : {}) }));
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
  ...products('hong-kong', 'https://www.mtr.com.hk/en/customer/tickets/day_pass_tourist.html', [
    ['mtr-tourist-adult', '港鐵旅客全日通（成人）', 'MTR Adult Tourist Day Pass'],
    ['mtr-tourist-child', '港鐵旅客全日通（小童）', 'MTR Child Tourist Day Pass'],
  ]),
  ...products('hong-kong', 'https://www.hktramways.com/en/schedules-fares/', [
    ['hk-tram-monthly', '香港電車月票', 'Hong Kong Tramways Monthly Ticket'],
  ]),
  ...products('hong-kong', 'https://www.starferry.com.hk/en/service', [
    ['star-ferry-monthly', '天星小輪月票', 'Star Ferry Monthly Pass'],
    ['star-ferry-four-day', '天星小輪四天旅遊票', 'Star Ferry Four-Day Tourist Pass'],
  ]),
  ...products('macau', 'https://www.mlm.com.mo/en/general_ticket.html', [
    ['macau-lrt-card', '澳門輕軌通（成人儲值卡）', 'Macao Adult LRT Card (stored value)'],
    ['macau-pass-card', '澳門通（普通儲值卡）', 'Macau Pass (general stored-value card)'],
  ], 'card'),
  ...products('taiwan', 'https://english.metro.taipei/cp.aspx?n=BECC2E7AC426F659', [
    ['taipei-metro-day', '台北捷運一日票', 'Taipei Metro One-Day Pass'],
    ['taipei-metro-24', '台北捷運 24 小時票', 'Taipei Metro 24-hour Pass'],
    ['taipei-metro-48', '台北捷運 48 小時票', 'Taipei Metro 48-hour Pass'],
    ['taipei-metro-72', '台北捷運 72 小時票', 'Taipei Metro 72-hour Pass'],
    ['taipei-fun-transport', '台北樂遊券：交通暢遊卡', 'Taipei Fun Pass: Transportation Pass'],
    ['taipei-fun-unlimited', '台北樂遊券：無限暢遊卡', 'Taipei Fun Pass: Unlimited Pass'],
    ['taipei-fun-exploring', '台北樂遊券：探索套票', 'Taipei Fun Pass: Exploring Pass'],
    ['taipei-fun-classic', '台北樂遊券：經典套票', 'Taipei Fun Pass: Classic Version'],
  ]),
  ...products('japan', 'https://www.westjr.co.jp/global/en/ticket/pass/', [
    ['jr-kansai-mini', 'JR 關西迷你鐵路周遊券', 'JR Kansai Mini Pass'],
    ['jr-kansai-sanin', 'JR 關西、山陰地區鐵路周遊券', 'JR Kansai–Sanin Area Pass'],
    ['jr-tottori-matsue', 'JR 鳥取、松江周遊券', 'JR Tottori–Matsue Pass'],
    ['jr-hiroshima-yamaguchi', 'JR 廣島、山口地區鐵路周遊券', 'JR Hiroshima–Yamaguchi Area Pass'],
    ['jr-okayama-hiroshima-yamaguchi', 'JR 岡山、廣島、山口地區鐵路周遊券', 'JR Okayama–Hiroshima–Yamaguchi Area Pass'],
    ['jr-west-all', 'JR 西日本全地區鐵路周遊券', 'JR-WEST All Area Pass'],
  ]),
  ...products('japan', 'https://www.westjr.co.jp/travel-information/en/tickets-passes/other/', [
    ['jr-setouchi', 'JR 瀨戶內地區鐵路周遊券', 'JR Setouchi Area Pass'],
    ['jr-sanyo-sanin-north-kyushu', 'JR 山陽、山陰、北部九州周遊券', 'JR Sanyo–Sanin Northern Kyushu Pass'],
    ['jr-hokuriku-arch', 'JR 北陸拱型鐵路周遊券', 'JR Hokuriku Arch Pass'],
    ['jr-takayama-hokuriku', 'JR 高山、北陸地區周遊券', 'Takayama–Hokuriku Area Tourist Pass'],
    ['jr-ise-kumano-wakayama', 'JR 伊勢、熊野、和歌山地區周遊券', 'Ise–Kumano–Wakayama Area Tourist Pass'],
  ]),
  ...products('japan', 'https://www.jrhokkaido.co.jp/global/english/ticket/railpass/index.html', [
    ['jr-sapporo-noboribetsu', 'JR 札幌、登別區域鐵路周遊券', 'JR Sapporo–Noboribetsu Area Pass'],
    ['jr-sapporo-furano', 'JR 札幌、富良野區域鐵路周遊券', 'JR Sapporo–Furano Area Pass'],
  ]),
  ...products('japan', 'https://www.jrhokkaido.co.jp/global/english/ticket/', [
    ['jr-east-south-hokkaido', 'JR 東日本、南北海道鐵路周遊券', 'JR East–South Hokkaido Rail Pass'],
    ['jr-tohoku-south-hokkaido', 'JR 東北、南北海道鐵路周遊券', 'JR Tohoku–South Hokkaido Rail Pass'],
  ]),
  ...products('japan', 'https://subway.osakametro.co.jp/en/guide/page/enjoy-eco.php', [
    ['osaka-enjoy-eco', '大阪地鐵、巴士一日票 Enjoy Eco Card', 'Osaka Metro & Bus One-Day Pass: Enjoy Eco Card'],
  ]),
  ...products('singapore', 'https://thesingaporetouristpass.com.sg/type-of-passes/', [
    ['singapore-tourist-charm', '新加坡遊客通行卡吊飾版（魚尾獅）', 'Singapore Tourist Pass Charm (Mr. Merlion)'],
    ['singapore-tourist-changi', '新加坡遊客通行卡＋Changi Recommends 套票', 'Singapore Tourist Pass + Changi Recommends Bundle'],
  ]),
  ...products('singapore', 'https://www.simplygo.com.sg/concession-monthly-travel-cards/adult/adult-monthly-travel-card/', [
    ['singapore-adult-monthly', '新加坡成人月票（限合資格居民）', 'Singapore Adult Monthly Travel Pass (eligible residents)'],
  ]),
  ...products('singapore', 'https://www.simplygo.com.sg/travel-fares/student-concessionary-fares/', [
    ['singapore-student-monthly', '新加坡學生月票（限合資格學生）', 'Singapore Student Monthly Concession Pass (eligible students)'],
  ]),
  ...products('south-korea', 'https://english.seoul.go.kr/policy/transportation/climate-card/', [
    ['seoul-climate-1', '首爾氣候同行卡 1 日券', 'Seoul Climate Card 1-day Pass'],
    ['seoul-climate-2', '首爾氣候同行卡 2 日券', 'Seoul Climate Card 2-day Pass'],
    ['seoul-climate-3', '首爾氣候同行卡 3 日券', 'Seoul Climate Card 3-day Pass'],
    ['seoul-climate-5', '首爾氣候同行卡 5 日券', 'Seoul Climate Card 5-day Pass'],
    ['seoul-climate-7', '首爾氣候同行卡 7 日券', 'Seoul Climate Card 7-day Pass'],
    ['seoul-climate-resident', '首爾 Climate Pass（限合資格居民）', 'Seoul Climate Pass (eligible residents)'],
  ]),
  ...products('thailand', 'https://www.bts.co.th/eng/tickets/ticket-daypass.html', [
    ['bangkok-bts-day', '曼谷 BTS 一日票', 'Bangkok BTS One-Day Pass'],
  ]),
];

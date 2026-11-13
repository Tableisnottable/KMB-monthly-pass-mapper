/**
 * Route-number stop-plate colours, not bus body / corporate colours.
 * See docs/route-colours.md for the conventions, exceptions and sources.
 * Hex values approximate the physical signs; more than one sign generation exists.
 */
export interface RouteSignColours {
  background: string;
  foreground: string;
  line: string;
  convention: string;
  verified: boolean;
}

function sign(background: string, foreground: string, convention: string, line = background, verified = true): RouteSignColours {
  return { background, foreground, line, convention, verified };
}

const white = '#ffffff', black = '#111111', yellow = '#ffdf00', navy = '#002b5c';
const local = sign(white, black, 'Uncoloured / black route number', black);
const crossHarbour = sign('#d71920', white, 'Cross-Harbour / Eastern Harbour stop plate');
const westernHarbour = sign('#007d40', white, 'Western Harbour stop plate');
const airportExpress = sign('#7b2335', white, 'Cityflyer A-route stop plate');
const citybusLocal = sign('#005da6', white, 'Citybus ordinary / express stop plate');
const northLantau = sign('#f58220', white, 'Long Win E-route stop plate');
const longWinExpress = sign(navy, yellow, 'Long Win A-route stop plate');
const longWinShuttle = sign('#f58220', navy, 'Long Win S-route stop plate');
const overnightWhite = sign(black, white, 'KMB / Long Win overnight stop plate');
const overnightYellow = sign(black, yellow, 'Citybus / New Lantao overnight stop plate');
const unknown = sign(white, black, 'Stop-plate colour not verified', '#656565', false);

// These are retained display colours for non-bus modes, outside the bus-sign scheme.
const otherModes: Readonly<Record<string, string>> = {
  MTR: '#ae1734', LRT: '#bf7c22', GMB: '#21835b', FERRY: '#187fbb', TRAM: '#19867a',
  PTRAM: '#8d3069', WALK: '#9b9b9b',
};

function kmbSign(number: string): RouteSignColours {
  if (/^N/.test(number)) return overnightWhite;
  if (/^HK/.test(number)) return unknown;
  if (/^P96[08]$/.test(number)) return sign('#a25466', white, 'KMB premium stop plate');
  if (/^(?:X)?9\d\d/.test(number)) return westernHarbour;
  if (/^[136]\d\d/.test(number)) return crossHarbour;
  return local;
}

function longWinSign(number: string): RouteSignColours {
  if (/^N/.test(number)) return overnightWhite;
  if (/^A/.test(number)) return longWinExpress;
  if (/^E/.test(number)) return northLantau;
  if (/^S/.test(number)) return longWinShuttle;
  if (/^R/.test(number)) return sign(navy, white, 'Long Win Disneyland stop plate');
  return unknown;
}

export function routeSignColours(operator: string, routeNumber = ''): RouteSignColours {
  const number = routeNumber.trim().toUpperCase();
  // Joint cross-harbour services follow their tunnel's plate convention, not an invented joint colour.
  if (operator === 'KMB' || operator === 'KMB+CTB') return kmbSign(number);
  if (operator === 'LWB' || operator === 'LWB+CTB') return longWinSign(number);
  if (operator === 'CTB') {
    if (/^NR/.test(number) || /^H/.test(number) || /^382/.test(number)) return unknown;
    if (/^N/.test(number)) return overnightYellow;
    if (/^A/.test(number)) return airportExpress;
    if (/^E11/.test(number) || number === 'E18' || /^(?:X)?9\d\d/.test(number)) return westernHarbour;
    if ((/^[16]\d\d/.test(number) && !['628', '629', '634'].includes(number)) || /^3(?:01|02|07|73)/.test(number)) return crossHarbour;
    if (/^E/.test(number) || /^B(?:3|5|7|8|14|15)[A-Z]?$/.test(number)) return crossHarbour;
    if (/^R/.test(number)) return sign('#a8d7ed', navy, 'Citybus Disneyland stop plate');
    return citybusLocal;
  }
  if (operator === 'NLB') {
    if (/^N/.test(number)) return overnightYellow;
    if (number === 'A35') return sign('#d71920', yellow, 'New Lantao airport stop plate');
    if (/^B2/.test(number)) return local;
    if (/^X/.test(number)) return unknown;
    return sign('#005da6', white, 'New Lantao intermediate-stop plate');
  }
  if (operator === 'LRTFeeder') return local;
  if (otherModes[operator]) {
    return sign(otherModes[operator], operator === 'WALK' ? black : white, 'Non-bus mode display colour');
  }
  // DB / PI / XB contain different sign designs or operators. Do not invent a physical plate colour.
  return unknown;
}

export function routeColor(operator: string, routeNumber = ''): string {
  return routeSignColours(operator, routeNumber).line;
}

export function routeIconColor(operator: string, routeNumber = ''): string {
  return routeSignColours(operator, routeNumber).foreground;
}

export function routeBadgeStyle(operator: string, routeNumber = '') {
  const colours = routeSignColours(operator, routeNumber);
  return {
    backgroundColor: colours.background,
    color: colours.foreground,
    textShadow: colours.foreground === white ? '0 1px 1px #0008' : undefined,
  };
}

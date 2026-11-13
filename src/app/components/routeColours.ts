/** Shared route/company display palette, with black N/NA night buses. */
export interface RouteSignColours {
  background: string;
  foreground: string;
  line: string;
  convention: string;
  verified: boolean;
  iconBackground?: string;
  iconForeground?: string;
  iconAccent?: string;
}

function sign(background: string, foreground: string, convention: string, line = background, verified = true): RouteSignColours {
  return { background, foreground, line, convention, verified };
}

const white = '#ffffff', black = '#17212b';
const unknown = sign(white, black, 'Company colour not verified', '#656565', false);
const companyPalette: Readonly<Record<string, [string, string]>> = {
  KMB: ['#e62232', white], CTB: ['#f7b500', black], LWB: ['#ef8528', black],
  NLB: ['#317dc1', white], LRTFeeder: ['#ae1734', white],
  DB: ['#22797a', white], PI: ['#71509c', white], XB: ['#4c617a', white],
};

// These are retained display colours for non-bus modes, outside the bus-sign scheme.
const otherModes: Readonly<Record<string, string>> = {
  MTR: '#ae1734', LRT: '#bf7c22', GMB: '#21835b', FERRY: '#187fbb', TRAM: '#19867a',
  PTRAM: '#8d3069', WALK: '#9b9b9b',
};

function harbourRouteColour(operator: string, number: string): string | undefined {
  if (!operator.split('+').every(member => member === 'KMB' || member === 'CTB')) return;
  if (/^(?:X)?9\d{2}[A-Z]*$/.test(number)) return '#007d40';
  // Retain the existing stop-plate exceptions for local or mixed-tunnel services.
  if (operator === 'CTB' && /^(?:314|382|628|629|634)[A-Z]*$/.test(number)) return;
  if (/^[136]\d{2}[A-Z]*$/.test(number)) return '#d71920';
}

export function routeSignColours(operator: string, routeNumber = ''): RouteSignColours {
  const number = routeNumber.trim().toUpperCase();
  // The night-bus convention takes priority over both members of a joint service.
  // NR residents' routes and non-bus modes retain their existing palettes.
  if (!otherModes[operator] && /^NA?\d/.test(number)) {
    return sign('#000000', white, 'N/NA night bus display colours');
  }
  const members = operator.split('+'), primary = companyPalette[members[0]], secondary = companyPalette[members[1]];
  const harbour = harbourRouteColour(operator, number);
  if (primary && harbour) return { background: harbour, foreground: white, line: harbour,
    convention: 'Harbour route number colour with ' + operator + ' company icon colours', verified: true,
    iconBackground: (secondary ?? primary)[0], iconForeground: (secondary ?? primary)[1],
    ...(secondary ? { iconAccent: primary[0] } : {}),
  };
  if (primary) return { background: primary[0], foreground: primary[1], line: primary[0],
    convention: operator + ' company display colours', verified: true,
    ...(secondary ? { iconBackground: secondary[0], iconForeground: secondary[1] } : {}),
  };
  if (otherModes[operator]) {
    return sign(otherModes[operator], operator === 'WALK' ? black : white, 'Non-bus mode display colour');
  }
  // Unknown operators retain a neutral fallback.
  return unknown;
}

export function routeColor(operator: string, routeNumber = ''): string {
  return routeSignColours(operator, routeNumber).line;
}

export function routeIconColor(operator: string, routeNumber = ''): string {
  const colours = routeSignColours(operator, routeNumber);
  return colours.iconForeground ?? colours.foreground;
}

export function routeBadgeStyle(operator: string, routeNumber = '') {
  const colours = routeSignColours(operator, routeNumber);
  return {
    backgroundColor: colours.background,
    color: colours.foreground,
    '--route-icon-background': colours.iconBackground ?? colours.background,
    '--route-icon-colour': colours.iconForeground ?? colours.foreground,
    ...(colours.iconAccent ? { '--route-icon-accent': colours.iconAccent } : {}),
  };
}

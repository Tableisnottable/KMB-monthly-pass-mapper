/** Shared company display palette. Route category and tunnel do not change it. */
export interface RouteSignColours {
  background: string;
  foreground: string;
  line: string;
  convention: string;
  verified: boolean;
  iconBackground?: string;
  iconForeground?: string;
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

export function routeSignColours(operator: string, _routeNumber = ''): RouteSignColours {
  const members = operator.split('+'), primary = companyPalette[members[0]], secondary = companyPalette[members[1]];
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
  };
}

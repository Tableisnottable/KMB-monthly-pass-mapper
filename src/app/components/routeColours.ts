/** Bus lines use their operator colours; joint services show each operator. */
export interface RouteSignColours {
  background: string;
  foreground: string;
  line: string;
  convention: string;
  verified: boolean;
  iconBackground?: string;
  iconForeground?: string;
  iconAccent?: string;
  lineColours?: string[];
}

function sign(background: string, foreground: string, convention: string, line = background, verified = true): RouteSignColours {
  return { background, foreground, line, convention, verified };
}

const white = '#ffffff', black = '#17212b';
const unknown = sign(white, black, 'Company colour not verified', '#656565', false);
const companyPalette: Readonly<Record<string, [string, string]>> = {
  KMB: ['#e62232', white], CTB: ['#f7b500', black], LWB: ['#ef8528', black],
  NLB: ['#317dc1', white], LRTFeeder: ['#ae1734', white],
  DB: ['#71509c', white], PI: ['#71509c', white], XB: ['#4c617a', white],
};

// These are retained display colours for non-bus modes, outside the bus-sign scheme.
const otherModes: Readonly<Record<string, string>> = {
  MTR: '#ae1734', LRT: '#ae1734', GMB: '#21835b', FERRY: '#187fbb', TRAM: '#19867a',
  PTRAM: '#8d3069', WALK: '#9b9b9b',
};

export function routeSignColours(operator: string, routeNumber = ''): RouteSignColours {
  const members = operator.split('+').map(member => member.trim().toUpperCase()).filter(Boolean), primary = companyPalette[members[0]], secondary = companyPalette[members[1]];
  if (primary) return { background: primary[0], foreground: primary[1], line: primary[0],
    convention: operator + ' company display colours', verified: true,
    lineColours: Array.from(new Set(members.flatMap(member => companyPalette[member] ? [companyPalette[member][0]] : []))),
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

export function routeLineColours(operator: string, routeNumber = ''): string[] {
  const colours = routeSignColours(operator, routeNumber);
  return colours.lineColours ?? [colours.line];
}

/** Draw stripes on the same physical path, preserving every company and accent. */
export function routeLineStyles(operator: string, routeNumber = '') {
  const colours = routeLineColours(operator, routeNumber);
  return colours.map((color, index) => ({ color, weight: 7, lineCap: index ? 'butt' as const : 'round' as const,
    ...(index ? { dashArray: `14 ${14 * (colours.length - 1)}`, dashOffset: String(-14 * index) } : {}),
  }));
}

export function routeIconColor(operator: string, routeNumber = ''): string {
  const colours = routeSignColours(operator, routeNumber);
  return colours.iconForeground ?? colours.foreground;
}

export function routeBadgeStyle(operator: string, routeNumber = '') {
  const colours = routeSignColours(operator, routeNumber);
  const bands = routeLineColours(operator, routeNumber);
  return {
    backgroundColor: colours.background,
    color: colours.foreground,
    ...(bands.length > 1 ? {
      // A full-height split keeps both operators visible on compact route cards.
      backgroundImage: `linear-gradient(135deg, ${bands.map((colour, index) => `${colour} ${index * 100 / bands.length}% ${(index + 1) * 100 / bands.length}%`).join(', ')})`,
      backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
      textShadow: '0 1px 2px #17212bcc, 0 0 2px #17212bcc',
    } : {}),
    '--route-icon-background': colours.iconBackground ?? colours.background,
    '--route-icon-colour': colours.iconForeground ?? colours.foreground,
    ...(colours.iconAccent ? { '--route-icon-accent': colours.iconAccent } : {}),
  };
}

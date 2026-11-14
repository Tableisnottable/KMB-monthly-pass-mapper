import stops0 from './transport/stops-0.json';
import stops1 from './transport/stops-1.json';
import type { NetworkStop } from './transportNetwork';

// Place search needs stop names and coordinates, not fares or routing indexes.
export const networkStops = [...stops0, ...stops1] as NetworkStop[];

import { Route, scoreRoutes } from '../engine/UpgradedScoringEngine';

export const demoRoutes: Route[] = [
  {
    id: 'demo-1',
    segments: [
      { operator: 'KMB', routeName: '234X', rideTimeMinutes: 35 }
    ],
    legs: [
      { operator: 'KMB', routeName: '234X', rideTimeMinutes: 35 }
    ]
  }
];

export const getScoredDemoRoutes = () => scoreRoutes(demoRoutes);

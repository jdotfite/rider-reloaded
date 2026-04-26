import { BIRD_VEHICLE } from '../physics/vehicles/bird';
import { BirdRenderer } from '../rendering/BirdRenderer';
import { VehicleManifest } from './VehicleManifest';

export const BIRD_MANIFEST: VehicleManifest = {
  id: 'bird',
  name: 'Bird',
  iconSvg: '<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21c2.4-3.7 6.1-5.6 11.2-5.6 1.4-3.8 4.4-6.4 8-6.4 2.2 0 4.1.8 5.8 2.3-1.8.7-2.8 2.1-2.8 4 0 2.2 1.8 3.8 3.8 4.6-1.9 1.8-4.4 2.7-7.6 2.7H13.4c-3.3 0-6.1-.5-8.4-1.6Z"/><path d="M10 19.5c3-.1 5.7.8 8.1 2.7"/><circle cx="24.2" cy="12.4" r="0.9" fill="currentColor" stroke="none"/></svg>',
  physics: BIRD_VEHICLE,
  createRenderer: () => {
    const renderer = new BirdRenderer();
    return {
      render: (ctx, rider) => renderer.render(ctx, rider),
    };
  },
};

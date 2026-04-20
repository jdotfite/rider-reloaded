import { SLED_VEHICLE } from '../physics/vehicles/sled';
import { RiderRenderer } from '../rendering/RiderRenderer';
import { VehicleManifest } from './VehicleManifest';

export const SLED_MANIFEST: VehicleManifest = {
  id: 'sled',
  name: 'Classic Sled',
  iconSvg: '<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22l24 0"/><path d="M6 22l2-6h12l4 6"/><circle cx="10" cy="18" r="1.5" fill="currentColor"/></svg>',
  physics: SLED_VEHICLE,
  createRenderer: () => {
    const renderer = new RiderRenderer();
    return {
      render: (ctx, rider) => renderer.render(ctx, rider),
    };
  },
};

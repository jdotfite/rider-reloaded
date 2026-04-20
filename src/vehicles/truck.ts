import { TRUCK_VEHICLE } from '../physics/vehicles/truck';
import { TruckRenderer } from '../rendering/TruckRenderer';
import { VehicleManifest } from './VehicleManifest';

export const TRUCK_MANIFEST: VehicleManifest = {
  id: 'truck',
  name: 'Monster Truck',
  iconSvg: '<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="12" width="24" height="8" rx="2"/><rect x="8" y="8" width="10" height="4" rx="1"/><circle cx="9" cy="24" r="3"/><circle cx="23" cy="24" r="3"/><line x1="9" y1="20" x2="9" y2="21"/><line x1="23" y1="20" x2="23" y2="21"/></svg>',
  physics: TRUCK_VEHICLE,
  createRenderer: () => {
    const renderer = new TruckRenderer();
    return {
      render: (ctx, rider) => renderer.render(ctx, rider),
      reset: () => renderer.resetDebris(),
    };
  },
};

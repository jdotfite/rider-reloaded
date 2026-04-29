import { ROLLERCOASTER_VEHICLE } from '../physics/vehicles/rollercoaster';
import { RollerCoasterRenderer } from '../rendering/RollerCoasterRenderer';
import { VehicleManifest } from './VehicleManifest';

export const ROLLERCOASTER_MANIFEST: VehicleManifest = {
  id: 'rollercoaster',
  name: 'Roller Coaster',
  iconSvg: `<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <!-- Rear cart -->
    <rect x="1" y="12" width="8" height="6" rx="1" fill="currentColor" fill-opacity="0.15"/>
    <rect x="1" y="12" width="8" height="6" rx="1"/>
    <circle cx="3.5" cy="19.5" r="1.5"/>
    <circle cx="7" cy="19.5" r="1.5"/>
    <!-- Middle cart -->
    <rect x="11" y="12" width="8" height="6" rx="1" fill="currentColor" fill-opacity="0.15"/>
    <rect x="11" y="12" width="8" height="6" rx="1"/>
    <circle cx="13.5" cy="19.5" r="1.5"/>
    <circle cx="17" cy="19.5" r="1.5"/>
    <!-- Front cart -->
    <rect x="21" y="12" width="9" height="6" rx="1" fill="currentColor" fill-opacity="0.2"/>
    <rect x="21" y="12" width="9" height="6" rx="1"/>
    <circle cx="23.5" cy="19.5" r="1.5"/>
    <circle cx="27.5" cy="19.5" r="1.5"/>
    <!-- Couplers -->
    <line x1="9" y1="15" x2="11" y2="15"/>
    <line x1="19" y1="15" x2="21" y2="15"/>
    <!-- Driver (head sticking up from front cart) -->
    <circle cx="26" cy="10" r="2" fill="currentColor" fill-opacity="0.3"/>
    <circle cx="26" cy="10" r="2"/>
    <line x1="26" y1="12" x2="26" y2="15"/>
  </svg>`,
  physics: ROLLERCOASTER_VEHICLE,
  createRenderer: () => {
    const renderer = new RollerCoasterRenderer();
    return {
      render: (ctx, rider) => renderer.render(ctx, rider),
      reset: () => renderer.reset(),
    };
  },
};

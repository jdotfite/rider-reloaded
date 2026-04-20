import { BUGGY_VEHICLE } from '../physics/vehicles/buggy';
import { BuggyRenderer } from '../rendering/BuggyRenderer';
import { VehicleManifest } from './VehicleManifest';

export const BUGGY_MANIFEST: VehicleManifest = {
  id: 'buggy',
  name: 'Rally Buggy',
  iconSvg: '<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20l4-7h9l5 4h2"/><path d="M10 13l4-4h5"/><path d="M13 20h10"/><circle cx="10" cy="24" r="3"/><circle cx="23" cy="24" r="3"/><path d="M8 11l-2-3"/></svg>',
  physics: BUGGY_VEHICLE,
  createRenderer: () => {
    const renderer = new BuggyRenderer();
    return {
      render: (ctx, rider) => renderer.render(ctx, rider),
      reset: () => renderer.reset(),
    };
  },
};

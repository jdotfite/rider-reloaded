import type { VehicleDef } from '../physics/vehicles/VehicleDef';
import type { RiderRenderData } from '../rendering/RiderRenderer';

export interface VehicleRenderer {
  render(ctx: CanvasRenderingContext2D, rider: RiderRenderData | null): void;
  reset?(): void;
}

export interface VehicleManifest {
  id: string;
  name: string;
  iconSvg: string;
  available?: boolean;
  unlockHint?: string;
  physics: VehicleDef;
  createRenderer: () => VehicleRenderer;
}

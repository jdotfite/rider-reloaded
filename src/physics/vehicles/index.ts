import { VEHICLE_MANIFESTS, getVehicleManifest } from '../../vehicles';
import { VehicleDef } from './VehicleDef';

export type { VehicleDef } from './VehicleDef';

export const VEHICLES: VehicleDef[] = VEHICLE_MANIFESTS.map(vehicle => vehicle.physics);

export function getVehicle(id: string): VehicleDef {
  return getVehicleManifest(id).physics;
}

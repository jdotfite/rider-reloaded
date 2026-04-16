import { VehicleDef } from './VehicleDef';
import { SLED_VEHICLE } from './sled';
import { TRUCK_VEHICLE } from './truck';

export type { VehicleDef } from './VehicleDef';

export const VEHICLES: VehicleDef[] = [
  SLED_VEHICLE,
  TRUCK_VEHICLE,
];

export function getVehicle(id: string): VehicleDef {
  return VEHICLES.find(v => v.id === id) ?? SLED_VEHICLE;
}

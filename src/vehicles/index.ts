import { VehicleManifest } from './VehicleManifest';
import { BUGGY_MANIFEST } from './buggy';
import { SLED_MANIFEST } from './sled';
import { TRUCK_MANIFEST } from './truck';

export type { VehicleManifest, VehicleRenderer } from './VehicleManifest';

export const VEHICLE_MANIFESTS: VehicleManifest[] = [
  SLED_MANIFEST,
  TRUCK_MANIFEST,
  BUGGY_MANIFEST,
];

export function getVehicleManifest(id: string): VehicleManifest {
  return VEHICLE_MANIFESTS.find(vehicle => vehicle.id === id) ?? SLED_MANIFEST;
}

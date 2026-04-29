import { VehicleManifest } from './VehicleManifest';
import { BUGGY_MANIFEST } from './buggy';
import { BIRD_MANIFEST } from './bird';
import { SLED_MANIFEST } from './sled';
import { TRUCK_MANIFEST } from './truck';
import { ROLLERCOASTER_MANIFEST } from './rollercoaster';

export type { VehicleManifest, VehicleRenderer } from './VehicleManifest';

export const VEHICLE_MANIFESTS: VehicleManifest[] = [
  SLED_MANIFEST,
  BIRD_MANIFEST,
  TRUCK_MANIFEST,
  BUGGY_MANIFEST,
  ROLLERCOASTER_MANIFEST,
];

export function getVehicleManifest(id: string): VehicleManifest {
  return VEHICLE_MANIFESTS.find(vehicle => vehicle.id === id) ?? SLED_MANIFEST;
}

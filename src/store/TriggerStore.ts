import { Vec2 } from '../math/Vec2';

export type TriggerType = 'zoom' | 'camera-focus';

export interface Trigger {
  id: number;
  position: Vec2;
  type: TriggerType;
  radius: number;      // activation radius
  // Zoom trigger params
  zoomTarget?: number;
  // Camera focus params
  focusX?: number;
  focusY?: number;
}

export interface SerializedTrigger {
  id: number;
  x: number;
  y: number;
  type: string;
  radius: number;
  zoomTarget?: number;
  focusX?: number;
  focusY?: number;
}

let nextTriggerId = 0;

export class TriggerStore {
  triggers: Trigger[] = [];

  addTrigger(position: Vec2, type: TriggerType, params: Partial<Trigger> = {}): Trigger {
    const trigger: Trigger = {
      id: nextTriggerId++,
      position: position.clone(),
      type,
      radius: params.radius ?? 30,
      zoomTarget: params.zoomTarget ?? (type === 'zoom' ? 2 : undefined),
      focusX: params.focusX ?? (type === 'camera-focus' ? position.x : undefined),
      focusY: params.focusY ?? (type === 'camera-focus' ? position.y : undefined),
    };
    this.triggers.push(trigger);
    return trigger;
  }

  removeTrigger(id: number) {
    this.triggers = this.triggers.filter(t => t.id !== id);
  }

  getTriggerAt(point: Vec2, radius: number): Trigger | null {
    const radiusSq = radius * radius;
    for (const t of this.triggers) {
      if (t.position.distanceToSq(point) < radiusSq) {
        return t;
      }
    }
    return null;
  }

  /** Check which triggers the rider center is inside */
  getActiveTriggers(riderCenter: Vec2): Trigger[] {
    return this.triggers.filter(t => {
      const d = riderCenter.distanceTo(t.position);
      return d <= t.radius;
    });
  }

  clear() {
    this.triggers = [];
  }

  serialize(): SerializedTrigger[] {
    return this.triggers.map(t => ({
      id: t.id,
      x: t.position.x,
      y: t.position.y,
      type: t.type,
      radius: t.radius,
      zoomTarget: t.zoomTarget,
      focusX: t.focusX,
      focusY: t.focusY,
    }));
  }

  load(data: SerializedTrigger[]) {
    this.triggers = [];
    if (!Array.isArray(data)) return;
    for (const d of data) {
      if (typeof d.x !== 'number' || typeof d.y !== 'number') continue;
      const type = d.type === 'camera-focus' ? 'camera-focus' : 'zoom';
      this.triggers.push({
        id: nextTriggerId++,
        position: new Vec2(d.x, d.y),
        type,
        radius: typeof d.radius === 'number' ? d.radius : 30,
        zoomTarget: d.zoomTarget,
        focusX: d.focusX,
        focusY: d.focusY,
      });
    }
  }
}

import { Trigger } from '../store/TriggerStore';

export class TriggerRenderer {
  render(ctx: CanvasRenderingContext2D, triggers: Trigger[], editMode: boolean) {
    if (!editMode && triggers.length === 0) return;
    if (!editMode) return; // Only show triggers in edit mode

    for (const t of triggers) {
      // Activation radius circle
      ctx.strokeStyle = t.type === 'zoom' ? 'rgba(68, 136, 204, 0.3)' : 'rgba(204, 68, 68, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(t.position.x, t.position.y, t.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center marker
      const color = t.type === 'zoom' ? '#4488cc' : '#cc4444';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(t.position.x, t.position.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = color;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      if (t.type === 'zoom') {
        ctx.fillText(`Z:${t.zoomTarget?.toFixed(1) ?? '?'}x`, t.position.x, t.position.y - 8);
      } else {
        ctx.fillText('CAM', t.position.x, t.position.y - 8);
      }
    }
  }
}

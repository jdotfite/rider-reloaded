import { Vec2 } from '../math/Vec2';
import { COLOR_FLAG } from '../constants';

export class FlagRenderer {
  render(ctx: CanvasRenderingContext2D, startPos: Vec2) {
    const x = startPos.x;
    const y = startPos.y;
    const poleHeight = 40;
    const flagWidth = 16;
    const flagHeight = 10;

    // Pole
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - poleHeight);
    ctx.stroke();

    // Flag
    ctx.fillStyle = COLOR_FLAG;
    ctx.beginPath();
    ctx.moveTo(x, y - poleHeight);
    ctx.lineTo(x + flagWidth, y - poleHeight + flagHeight / 2);
    ctx.lineTo(x, y - poleHeight + flagHeight);
    ctx.closePath();
    ctx.fill();
  }
}

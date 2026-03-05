import { Vec2 } from '../math/Vec2';

export class FlagRenderer {
  render(ctx: CanvasRenderingContext2D, startPos: Vec2) {
    const x = startPos.x;
    const y = startPos.y;
    const poleHeight = 36;
    const flagWidth = 14;
    const flagHeight = 9;

    // Pole — thin black line
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - poleHeight);
    ctx.stroke();

    // Flag — filled black triangle
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(x, y - poleHeight);
    ctx.lineTo(x + flagWidth, y - poleHeight + flagHeight / 2);
    ctx.lineTo(x, y - poleHeight + flagHeight);
    ctx.closePath();
    ctx.fill();

    // Pole base — small circle
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

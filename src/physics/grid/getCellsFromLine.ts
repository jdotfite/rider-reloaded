import { GRID_CELL_SIZE } from '../../constants';

interface CellPos {
  x: number;
  y: number;
  gx: number;
  gy: number;
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Classic 6.2-style grid traversal from lr-core.
 * This catches the same neighboring cells the original solver uses.
 */
export function getCellsFromLine(
  x1: number, y1: number, x2: number, y2: number
): Array<[number, number]> {
  const start = getCellPosAndOffset(x1, y1);
  const end = getCellPosAndOffset(x2, y2);
  const cells: Array<[number, number]> = [[start.x, start.y]];

  const vecX = x2 - x1;
  const vecY = y2 - y1;
  if ((vecX === 0 && vecY === 0) || (start.x === end.x && start.y === end.y)) {
    return cells;
  }

  const box = getBox(start.x, start.y, end.x, end.y);
  let cell = start;
  let px = x1;
  let py = y1;

  while (true) {
    const delta = getDelta(cell, vecX, vecY);
    const nextPos = getNextPos(px, py, delta.x, delta.y, vecX, vecY);
    const nextCell = getCellPosAndOffset(nextPos.x, nextPos.y);

    if (nextCell.x === cell.x && nextCell.y === cell.y) {
      break;
    }

    if (!inBounds(nextCell, box)) {
      break;
    }

    cells.push([nextCell.x, nextCell.y]);
    cell = nextCell;
    px = nextPos.x;
    py = nextPos.y;
  }

  return cells;
}

function getCellPosAndOffset(px: number, py: number): CellPos {
  const x = Math.floor(px / GRID_CELL_SIZE);
  const y = Math.floor(py / GRID_CELL_SIZE);
  return {
    x,
    y,
    gx: px - GRID_CELL_SIZE * x,
    gy: py - GRID_CELL_SIZE * y,
  };
}

function getBox(x1: number, y1: number, x2: number, y2: number): Box {
  return {
    left: Math.min(x1, x2),
    right: Math.max(x1, x2),
    top: Math.min(y1, y2),
    bottom: Math.max(y1, y2),
  };
}

function getDelta(cell: CellPos, vecX: number, vecY: number) {
  const dx = cell.x < 0
    ? (GRID_CELL_SIZE + cell.gx) * (vecX > 0 ? 1 : -1)
    : -cell.gx + (vecX > 0 ? GRID_CELL_SIZE : -1);
  const dy = cell.y < 0
    ? (GRID_CELL_SIZE + cell.gy) * (vecY > 0 ? 1 : -1)
    : -cell.gy + (vecY > 0 ? GRID_CELL_SIZE : -1);

  return { x: dx, y: dy };
}

function getNextPos(
  x: number,
  y: number,
  dx: number,
  dy: number,
  vecX: number,
  vecY: number
) {
  if (vecX === 0) {
    return { x, y: y + dy };
  }

  if (vecY === 0) {
    return { x: x + dx, y };
  }

  const slope = vecY / vecX;
  const yNext = y + slope * dx;
  if (Math.abs(yNext - y) < Math.abs(dy)) {
    return {
      x: x + dx,
      y: yNext,
    };
  }

  if (Math.abs(yNext - y) === Math.abs(dy)) {
    return {
      x: x + dx,
      y: y + dy,
    };
  }

  return {
    x: x + vecX * dy / vecY,
    y: y + dy,
  };
}

function inBounds(cell: CellPos, box: Box): boolean {
  return cell.x >= box.left &&
    cell.x <= box.right &&
    cell.y >= box.top &&
    cell.y <= box.bottom;
}

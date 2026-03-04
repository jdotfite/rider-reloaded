import { Line } from '../lines/Line';
import { GRID_CELL_SIZE } from '../../constants';
import { getCellsFromLine } from './getCellsFromLine';
import { hashNumberPair } from './hashNumberPair';

export class SpatialGrid {
  private cells: Map<number, Line[]> = new Map();
  private lineIds: Set<number> = new Set();

  addLine(line: Line) {
    if (this.lineIds.has(line.id)) return;
    this.lineIds.add(line.id);

    const cells = getCellsFromLine(line.p1.x, line.p1.y, line.p2.x, line.p2.y);
    for (const [cx, cy] of cells) {
      const key = hashNumberPair(cx, cy);
      let cell = this.cells.get(key);
      if (!cell) {
        cell = [];
        this.cells.set(key, cell);
      }
      cell.push(line);
    }
  }

  /** Query all lines near a point */
  queryPoint(x: number, y: number): Line[] {
    const cx = Math.floor(x / GRID_CELL_SIZE);
    const cy = Math.floor(y / GRID_CELL_SIZE);

    // Check surrounding cells (3x3), preserving duplicates like the classic grid.
    const results: Line[] = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = hashNumberPair(cx + dx, cy + dy);
        const cell = this.cells.get(key);
        if (!cell) continue;
        for (const line of cell) {
          results.push(line);
        }
      }
    }
    return results;
  }

  clear() {
    this.cells.clear();
    this.lineIds.clear();
  }

  rebuild(lines: Line[]) {
    this.clear();
    for (const line of lines) {
      this.addLine(line);
    }
  }
}

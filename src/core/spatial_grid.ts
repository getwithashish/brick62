import { Brick } from './types.js';

export class SpatialGrid {
  public cellSize: number;
  public cols: number;
  public rows: number;
  public cells: Map<number, Brick[]>;

  constructor(width: number, height: number, cellSize: number = 24) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cells = new Map();
  }

  private cellIndex(col: number, row: number): number {
    return row * this.cols + col;
  }

  public clear(): void {
    this.cells.clear();
  }

  public insert(brick: Brick): void {
    if (!brick.active) return;
    const minCol = Math.max(0, Math.floor(brick.x / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((brick.x + brick.width) / this.cellSize));
    const minRow = Math.max(0, Math.floor(brick.y / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((brick.y + brick.height) / this.cellSize));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const idx = this.cellIndex(c, r);
        let list = this.cells.get(idx);
        if (!list) {
          list = [];
          this.cells.set(idx, list);
        }
        list.push(brick);
      }
    }
  }

  public remove(brick: Brick): void {
    const minCol = Math.max(0, Math.floor(brick.x / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((brick.x + brick.width) / this.cellSize));
    const minRow = Math.max(0, Math.floor(brick.y / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((brick.y + brick.height) / this.cellSize));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const idx = this.cellIndex(c, r);
        const list = this.cells.get(idx);
        if (list) {
          const pos = list.indexOf(brick);
          if (pos !== -1) {
            list.splice(pos, 1);
          }
        }
      }
    }
  }

  /**
   * Query all active bricks in the bounding box [minX, minY, maxX, maxY]
   */
  public queryBox(minX: number, minY: number, maxX: number, maxY: number, outSet: Set<Brick>): void {
    const minCol = Math.max(0, Math.floor(minX / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor(maxX / this.cellSize));
    const minRow = Math.max(0, Math.floor(minY / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor(maxY / this.cellSize));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const idx = this.cellIndex(c, r);
        const list = this.cells.get(idx);
        if (list && list.length > 0) {
          for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (b.active) {
              outSet.add(b);
            }
          }
        }
      }
    }
  }

  /**
   * Rebuild grid with an array of bricks
   */
  public build(bricks: Brick[]): void {
    this.clear();
    for (let i = 0; i < bricks.length; i++) {
      if (bricks[i].active) {
        this.insert(bricks[i]);
      }
    }
  }
}

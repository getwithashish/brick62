/**
 * Seeded PRNG using Mulberry32.
 * Deterministic across all JavaScript/Node environments.
 */
export class PRNG {
  private state: number;

  constructor(seed: number | string = 123456789) {
    if (typeof seed === 'string') {
      this.state = PRNG.hashString(seed);
    } else {
      this.state = seed >>> 0;
    }
  }

  public static hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
  }

  /**
   * Generates a pseudo-random float in [0, 1)
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a pseudo-random float between min and max
   */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Generates a pseudo-random integer between min and max inclusive
   */
  public rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Returns true with given probability (0 to 1)
   */
  public chance(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * Pick random item from array
   */
  public pick<T>(array: T[]): T {
    return array[this.rangeInt(0, array.length - 1)];
  }

  public getState(): number {
    return this.state;
  }

  public setState(state: number): void {
    this.state = state >>> 0;
  }
}

import { describe, it, expect } from 'vitest';
import { createStage } from '../src/core/stages/stage_data';
import { GameSimulation } from '../src/core/sim';
import { simulateReplay } from '../src/core/input_log';

describe('Deterministic Game Simulation', () => {
  it('creates stages 1 to 30 with bricks', () => {
    for (let i = 1; i <= 30; i++) {
      const stage = createStage(i);
      expect(stage.id).toBe(i);
      expect(stage.bricks.length).toBeGreaterThan(0);
      if (i % 5 === 0) {
        expect(stage.isBoss).toBe(true);
        expect(stage.boss).toBeDefined();
      }
    }
  });

  it('runs deterministically across multiple replay runs with same seed and inputs', () => {
    const seed = 987654321;
    const inputs = [
      { tick: 0, targetX: 240, launch: true },
      { tick: 30, targetX: 200, launch: false },
      { tick: 60, targetX: 260, launch: false },
      { tick: 90, targetX: 240, launch: false },
    ];

    const run1 = simulateReplay(1, seed, inputs, 200);
    const run2 = simulateReplay(1, seed, inputs, 200);

    expect(run1.finalScore).toBe(run2.finalScore);
    expect(run1.checksum).toBe(run2.checksum);
    expect(run1.clearTimeSeconds).toBe(run2.clearTimeSeconds);
  });

  it('handles spatial grid brick destruction cleanly', () => {
    const stage = createStage(1, 12345);
    const sim = new GameSimulation(stage, { seed: 12345 });

    const initialCount = sim.activeBricksCount;
    const firstBrick = sim.bricks[0];

    sim.damageBrick(firstBrick, null, []);
    expect(firstBrick.active).toBe(false);
    expect(sim.activeBricksCount).toBe(initialCount - 1);
  });
});

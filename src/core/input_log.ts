import { InputFrame, RunReplay } from './types.js';
import { GameSimulation, SimOptions } from './sim.js';
import { createStage } from './stages/stage_data.js';

export class InputRecorder {
  private frames: InputFrame[] = [];
  private lastX: number = -1;

  public record(tick: number, paddleX: number, launch: boolean): void {
    const roundedX = Math.round(paddleX * 10) / 10;
    // Record if launch triggered or paddle moved significantly
    if (launch || Math.abs(roundedX - this.lastX) > 0.5 || tick % 30 === 0) {
      this.frames.push({
        tick,
        targetX: roundedX,
        launch,
      });
      this.lastX = roundedX;
    }
  }

  public getFrames(): InputFrame[] {
    return this.frames;
  }

  public clear(): void {
    this.frames = [];
    this.lastX = -1;
  }
}

/**
 * Deterministically simulates a run from start to finish using the recorded input log.
 * Runs identically in Node.js serverless functions and browser!
 */
export function simulateReplay(
  stageId: number,
  seed: number,
  inputs: InputFrame[],
  maxTicks: number = 60 * 180, // Cap at 3 minutes max
  simOptions?: SimOptions
): {
  finalScore: number;
  clearTimeSeconds: number;
  isCleared: boolean;
  checksum: number;
  maxCombo: number;
} {
  const stage = createStage(stageId, seed);
  const sim = new GameSimulation(stage, { seed, ...simOptions });

  let inputIndex = 0;
  let currentTargetX = 240;

  for (let tick = 0; tick < maxTicks && sim.isRunning; tick++) {
    let launch = false;
    // Check if next input event matches this tick
    while (inputIndex < inputs.length && inputs[inputIndex].tick <= tick) {
      const frame = inputs[inputIndex];
      currentTargetX = frame.targetX;
      if (frame.launch) launch = true;
      inputIndex++;
    }

    sim.step({
      tick,
      targetX: currentTargetX,
      launch,
    });
  }

  // Checksum based on state
  let checksum = sim.score * 31 + sim.activeBricksCount * 17 + Math.floor(sim.elapsedTime * 100);
  checksum = checksum >>> 0;

  return {
    finalScore: sim.score,
    clearTimeSeconds: Math.round(sim.elapsedTime * 10) / 10,
    isCleared: sim.isCleared,
    checksum,
    maxCombo: sim.maxCombo,
  };
}

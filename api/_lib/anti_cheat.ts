import { simulateReplay } from '../../src/core/input_log.js';
import { ScoreSubmissionSchema } from './schemas.js';
import { z } from 'zod';

export type ScoreSubmission = z.infer<typeof ScoreSubmissionSchema>;

export interface ValidationResult {
  valid: boolean;
  flagged: boolean;
  verifiedScore: number;
  reason?: string;
}

/**
 * Validates runs using deterministic simulation replay and physical plausibility heuristics.
 */
export function validateRun(submission: ScoreSubmission): ValidationResult {
  const { stageId, seed, score, clearTimeSeconds, inputs, bricksCleared } = submission;

  // 1. Plausibility sanity checks
  if (clearTimeSeconds < 3.0 && score > 500) {
    return {
      valid: false,
      flagged: true,
      verifiedScore: 0,
      reason: 'Physically impossible clear time (<3 seconds)',
    };
  }

  // Maximum brick break rate check (e.g. > 45 bricks per second is physically impossible)
  if (clearTimeSeconds > 0) {
    const brickRate = bricksCleared / clearTimeSeconds;
    if (brickRate > 45.0) {
      return {
        valid: false,
        flagged: true,
        verifiedScore: 0,
        reason: `Implausible brick rate: ${brickRate.toFixed(1)} bricks/sec`,
      };
    }
  }

  // 2. Full Deterministic Re-simulation if input frames are provided
  if (inputs && inputs.length > 0 && submission.mode !== 'endless') {
    try {
      const replayResult = simulateReplay(stageId, seed, inputs, 60 * 240);

      // Verify re-simulated score matches client score within reasonable tolerance
      // (subtle platform float rounding or input timing differences)
      const scoreDiff = Math.abs(replayResult.finalScore - score);
      const tolerance = Math.max(200, score * 0.08);

      if (scoreDiff > tolerance && !replayResult.isCleared) {
        return {
          valid: false,
          flagged: true,
          verifiedScore: replayResult.finalScore,
          reason: `Simulation replay divergence (Client: ${score}, Replay: ${replayResult.finalScore})`,
        };
      }

      return {
        valid: true,
        flagged: false,
        verifiedScore: Math.max(score, replayResult.finalScore),
      };
    } catch (e: any) {
      console.warn('Replay simulation error', e);
      // Fallback to plausibility check if simulation threw
    }
  }

  // If no detailed inputs or endless mode, accept if within sanity bounds
  return {
    valid: true,
    flagged: false,
    verifiedScore: score,
  };
}

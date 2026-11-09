import { z } from 'zod';

export const SaveDataSchema = z.object({
  schemaVersion: z.number().int().min(1),
  playerId: z.string().min(1).max(128),
  authToken: z.string().optional(),
  email: z.string().email().optional(),
  updatedAt: z.string(),

  progress: z.object({
    maxUnlockedStage: z.number().int().min(1).max(30),
    stageStars: z.record(z.string(), z.number().int().min(0).max(3)),
    stageBestScores: z.record(z.string(), z.number().int().min(0)),
    stageBestTimes: z.record(z.string(), z.number().min(0)),
    bossesDefeated: z.array(z.number().int()),
  }),

  currency: z.object({
    shards: z.number().int().min(0).max(10_000_000),
  }),

  upgrades: z.record(z.string(), z.number().int().min(0).max(10)),

  cosmetics: z.object({
    ownedPaddles: z.array(z.string()),
    ownedBalls: z.array(z.string()),
    ownedThemes: z.array(z.string()),
    equippedPaddle: z.string(),
    equippedBall: z.string(),
    equippedTheme: z.string(),
  }),

  entitlements: z.object({
    adsRemoved: z.boolean(),
    seasonPass: z.boolean(),
    activePurchases: z.array(z.string()),
  }),

  streak: z.object({
    currentStreak: z.number().int().min(0),
    lastLoginDate: z.string(),
    streakSaverAvailable: z.boolean(),
  }),

  endless: z.object({
    bestWave: z.number().int().min(0),
    highScore: z.number().int().min(0),
  }),

  achievements: z.record(z.string(), z.boolean()),
  consent: z.object({
    answered: z.boolean(),
    analytics: z.boolean(),
    personalizedAds: z.boolean(),
  }),
});

export const CheckoutRequestSchema = z.object({
  productId: z.string().min(1),
  playerId: z.string().min(1),
});

export const ScoreSubmissionSchema = z.object({
  playerId: z.string().min(1),
  displayName: z.string().min(1).max(32).optional(),
  mode: z.enum(['campaign', 'endless', 'daily', 'tournament']),
  stageId: z.number().int().min(1),
  seed: z.number().int(),
  score: z.number().int().min(0),
  clearTimeSeconds: z.number().min(0),
  maxCombo: z.number().int().min(0),
  bricksCleared: z.number().int().min(0),
  inputs: z.array(
    z.object({
      tick: z.number().int().min(0),
      targetX: z.number(),
      launch: z.boolean(),
    })
  ).max(20000),
});

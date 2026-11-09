import { describe, it, expect, beforeEach } from 'vitest';
import { mergeSaves, createDefaultSave } from '../src/services/save_service';
import { validateRun } from '../api/_lib/anti_cheat';
import dodoWebhookHandler from '../api/webhooks/dodo';
import { getDb } from '../api/_lib/db';

describe('Save Layer & Safe Merge', () => {
  it('correctly merges guest and cloud save taking max values per field', () => {
    const local = createDefaultSave('player_123');
    local.progress.maxUnlockedStage = 5;
    local.progress.stageStars[1] = 3;
    local.progress.stageStars[2] = 2;
    local.currency.shards = 450;
    local.upgrades.paddle_width = 2;
    local.cosmetics.ownedPaddles.push('paddle_cyberpunk');

    const remote = createDefaultSave('player_123');
    remote.progress.maxUnlockedStage = 3;
    remote.progress.stageStars[2] = 3; // Remote has higher stars on stage 2!
    remote.progress.stageStars[3] = 1;
    remote.currency.shards = 600; // Remote has more shards!
    remote.upgrades.combo_grace = 3;
    remote.cosmetics.ownedBalls.push('ball_plasma');

    const merged = mergeSaves(local, remote);

    // Max stage should be 5
    expect(merged.progress.maxUnlockedStage).toBe(5);
    // Stage 1 stars = 3, Stage 2 stars = 3 (took higher), Stage 3 stars = 1
    expect(merged.progress.stageStars[1]).toBe(3);
    expect(merged.progress.stageStars[2]).toBe(3);
    expect(merged.progress.stageStars[3]).toBe(1);
    // Currency = 600
    expect(merged.currency.shards).toBe(600);
    // Upgrades preserved from both
    expect(merged.upgrades.paddle_width).toBe(2);
    expect(merged.upgrades.combo_grace).toBe(3);
    // Cosmetics unified
    expect(merged.cosmetics.ownedPaddles).toContain('paddle_cyberpunk');
    expect(merged.cosmetics.ownedBalls).toContain('ball_plasma');
  });
});

describe('Anti-Cheat Verification', () => {
  it('flags impossible clear time (<3 seconds for huge score)', () => {
    const result = validateRun({
      playerId: 'cheater_1',
      mode: 'daily',
      stageId: 1,
      seed: 12345,
      score: 15000,
      clearTimeSeconds: 1.2, // Impossible!
      maxCombo: 50,
      bricksCleared: 80,
      inputs: [],
    });

    expect(result.valid).toBe(false);
    expect(result.flagged).toBe(true);
    expect(result.reason).toContain('impossible clear time');
  });

  it('flags impossible brick break rate (>45 bricks/sec)', () => {
    const result = validateRun({
      playerId: 'cheater_2',
      mode: 'tournament',
      stageId: 2,
      seed: 9999,
      score: 25000,
      clearTimeSeconds: 10.0,
      maxCombo: 80,
      bricksCleared: 950, // 95 bricks/sec!
      inputs: [],
    });

    expect(result.valid).toBe(false);
    expect(result.flagged).toBe(true);
    expect(result.reason).toContain('Implausible brick rate');
  });

  it('accepts plausible legitimate gameplay runs', () => {
    const result = validateRun({
      playerId: 'legit_pilot',
      mode: 'campaign',
      stageId: 1,
      seed: 4567,
      score: 1250,
      clearTimeSeconds: 45.0,
      maxCombo: 12,
      bricksCleared: 60,
      inputs: [],
    });

    expect(result.valid).toBe(true);
    expect(result.flagged).toBe(false);
    expect(result.verifiedScore).toBe(1250);
  });
});

describe('Dodo Payments Webhook & Idempotency', () => {
  beforeEach(async () => {
    const db = await getDb();
    await db.collection('processed_webhooks').deleteMany({});
    await db.collection('entitlements').deleteMany({});
    await db.collection('purchases').deleteMany({});
  });

  it('processes payment.succeeded and grants entitlements', async () => {
    const fakeReq: any = {
      method: 'POST',
      headers: { 'webhook-id': 'wh_test_101' },
      body: {
        type: 'payment.succeeded',
        id: 'wh_test_101',
        data: {
          payment_id: 'pay_xyz_1',
          total_amount: 399,
          currency: 'USD',
          metadata: {
            playerId: 'player_vip',
            productId: 'remove_ads',
          },
        },
      },
    };

    let statusCode = 0;
    let jsonResponse: any = {};
    const fakeRes: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            jsonResponse = data;
          },
        };
      },
    };

    await dodoWebhookHandler(fakeReq, fakeRes);
    expect(statusCode).toBe(200);
    expect(jsonResponse.received).toBe(true);

    const db = await getDb();
    const ent = await db.collection('entitlements').findOne({ playerId: 'player_vip' });
    expect(ent).toBeDefined();
    expect(ent.adsRemoved).toBe(true);

    // Duplicate webhook should be ignored idempotently!
    await dodoWebhookHandler(fakeReq, fakeRes);
    expect(statusCode).toBe(200);
    expect(jsonResponse.duplicate).toBe(true);
  });
});

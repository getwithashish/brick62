import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';
import { ScoreSubmissionSchema } from './_lib/schemas';
import { validateRun } from './_lib/anti_cheat';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const parseResult = ScoreSubmissionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ message: 'Invalid submission format', errors: parseResult.error.errors });
  }

  const submission = parseResult.data;

  // Run anti-cheat verification
  const validation = validateRun(submission);

  if (!validation.valid) {
    console.warn(`Anti-cheat flagged submission from ${submission.playerId}: ${validation.reason}`);
    // Record flagged score for admin review
    const db = await getDb();
    await db.collection('flagged_scores').insertOne({
      ...submission,
      reason: validation.reason,
      flaggedAt: new Date().toISOString(),
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
    });

    return res.status(400).json({
      success: false,
      flagged: true,
      message: 'Score failed verification check',
      reason: validation.reason,
    });
  }

  const db = await getDb();
  const scoreEntry = {
    playerId: submission.playerId,
    displayName: submission.displayName || `Pilot-${submission.playerId.slice(0, 5)}`,
    mode: submission.mode,
    stageId: submission.stageId,
    seed: submission.seed,
    score: validation.verifiedScore,
    clearTimeSeconds: submission.clearTimeSeconds,
    maxCombo: submission.maxCombo,
    bricksCleared: submission.bricksCleared,
    verified: true,
    createdAt: new Date().toISOString(),
  };

  await db.collection('scores').insertOne(scoreEntry);

  return res.status(200).json({
    success: true,
    verifiedScore: validation.verifiedScore,
    rank: 1, // Will be computed on leaderboard
  });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const mode = (req.query.mode as string) || 'daily';
  const stageId = req.query.stageId ? parseInt(req.query.stageId as string, 10) : undefined;

  const db = await getDb();
  const query: any = { mode };
  if (stageId !== undefined) {
    query.stageId = stageId;
  }

  const scoresQuery = await db.collection('scores').find(query);
  const topScores = await scoresQuery.sort({ score: -1 }).limit(50).toArray();

  const formatted = topScores.map((s: any, idx: number) => ({
    rank: idx + 1,
    playerId: s.playerId,
    displayName: s.displayName || `Player ${idx + 1}`,
    score: s.score,
    clearTimeSeconds: s.clearTimeSeconds,
    maxCombo: s.maxCombo,
    date: s.createdAt,
  }));

  // If no scores in database yet, provide seeded competitive demo leaderboard
  if (formatted.length === 0) {
    const demoNames = ['CosmicStriker', 'NovaPulse', 'PixelValkyrie', 'ChronoBreak', 'HyperZenith'];
    const mockList = demoNames.map((name, i) => ({
      rank: i + 1,
      playerId: `demo_${i + 1}`,
      displayName: name,
      score: 18500 - i * 2200,
      clearTimeSeconds: 42.5 + i * 4.2,
      maxCombo: 38 - i * 4,
      date: new Date().toISOString(),
    }));
    return res.status(200).json({ leaderboard: mockList });
  }

  return res.status(200).json({ leaderboard: formatted });
}

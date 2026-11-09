import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  // Protect cron endpoint with CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const db = await getDb();
  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Roll Daily Challenge Seed
  const dailySeed = Math.floor(Math.random() * 1000000);
  await db.collection('events').updateOne(
    { type: 'daily_challenge', date: todayStr },
    {
      $set: {
        type: 'daily_challenge',
        date: todayStr,
        seed: dailySeed,
        createdAt: new Date().toISOString(),
      },
    },
    { upsert: true }
  );

  // 2. Weekly Tournament Rollover Check
  const activeTournament = await db.collection('events').findOne({
    type: 'weekly_tournament',
    status: 'active',
  });

  let tournamentRolled = false;
  if (activeTournament && new Date(activeTournament.endDate) <= new Date()) {
    // Finalize top players and select winners
    const scoresQuery = await db.collection('scores').find({
      mode: 'tournament',
      stageId: activeTournament.stageId,
    });
    const winners = await scoresQuery.sort({ score: -1 }).limit(10).toArray();

    await db.collection('events').updateOne(
      { _id: activeTournament._id },
      {
        $set: {
          status: 'completed',
          winners: winners.map((w: any) => ({
            playerId: w.playerId,
            score: w.score,
            rank: winners.indexOf(w) + 1,
          })),
          finalizedAt: new Date().toISOString(),
        },
      }
    );
    tournamentRolled = true;
  }

  return res.status(200).json({
    success: true,
    today: todayStr,
    dailySeed,
    tournamentRolled,
  });
}

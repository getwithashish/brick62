import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const providedAuth = req.headers['x-admin-password'] || req.query.password;

  if (providedAuth !== adminPassword) {
    return res.status(401).json({ message: 'Unauthorized: Invalid Admin Password' });
  }

  const db = await getDb();
  const action = (req.query.action as string) || (req.body?.action as string) || 'overview';

  if (action === 'overview') {
    const flaggedQuery = await db.collection('flagged_scores').find({});
    const flagged = await flaggedQuery.sort({ flaggedAt: -1 }).limit(20).toArray();

    const purchasesQuery = await db.collection('purchases').find({});
    const recentPurchases = await purchasesQuery.sort({ createdAt: -1 }).limit(20).toArray();

    const activeTournament = await db.collection('events').findOne({
      type: 'weekly_tournament',
      status: 'active',
    });

    return res.status(200).json({
      flaggedCount: flagged.length,
      flaggedRuns: flagged,
      purchasesCount: recentPurchases.length,
      recentPurchases,
      activeTournament,
      prizesEnabled: process.env.ENABLE_PRIZES === '1',
      allowedPrizeRegions: process.env.ALLOWED_PRIZE_REGIONS || 'US,CA,GB',
    });
  }

  if (action === 'approve_winner' && req.method === 'POST') {
    const { winnerId, tournamentId } = req.body;
    await db.collection('events').updateOne(
      { _id: tournamentId, 'winners.playerId': winnerId },
      { $set: { 'winners.$.approved': true, 'winners.$.approvedAt': new Date().toISOString() } }
    );
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ message: 'Unknown admin action' });
}

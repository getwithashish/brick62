import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const playerId = req.query.playerId as string;
  if (!playerId) {
    return res.status(400).json({ message: 'Missing playerId query parameter' });
  }

  const db = await getDb();
  const ent = await db.collection('entitlements').findOne({ playerId });

  if (!ent) {
    return res.status(200).json({
      playerId,
      adsRemoved: false,
      seasonPass: false,
      activePurchases: [],
      ownedCosmetics: [],
    });
  }

  return res.status(200).json({
    playerId,
    adsRemoved: !!ent.adsRemoved,
    seasonPass: !!ent.seasonPass,
    activePurchases: ent.activePurchases || [],
    ownedCosmetics: ent.ownedCosmetics || [],
  });
}

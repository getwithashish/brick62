import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/db';
import { SaveDataSchema } from './_lib/schemas';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = await getDb();

  if (req.method === 'GET') {
    const playerId = req.query.playerId as string;
    if (!playerId) {
      return res.status(400).json({ message: 'Missing playerId parameter' });
    }

    const saveDoc = await db.collection('saves').findOne({ playerId });
    if (!saveDoc) {
      return res.status(404).json({ message: 'Save not found' });
    }

    return res.status(200).json({ save: saveDoc });
  }

  if (req.method === 'POST') {
    const parseResult = SaveDataSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ message: 'Validation failed', errors: parseResult.error.errors });
    }

    const saveData = parseResult.data;

    // Sanity bounds check: anti-hack protection
    if (saveData.currency.shards > 50_000_000 || saveData.currency.shards < 0) {
      return res.status(400).json({ message: 'Suspicious shard balance rejected' });
    }
    if (saveData.progress.maxUnlockedStage > 30 || saveData.progress.maxUnlockedStage < 1) {
      return res.status(400).json({ message: 'Invalid stage range' });
    }

    // Merge with any server entitlements
    const entitlements = await db.collection('entitlements').findOne({ playerId: saveData.playerId });
    if (entitlements) {
      if (entitlements.adsRemoved) saveData.entitlements.adsRemoved = true;
      if (entitlements.seasonPass) saveData.entitlements.seasonPass = true;
    }

    await db.collection('saves').updateOne(
      { playerId: saveData.playerId },
      { $set: { ...saveData, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );

    return res.status(200).json({ success: true, updatedAt: new Date().toISOString() });
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
}

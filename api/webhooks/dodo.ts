import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/db';
import { GAME_BALANCE } from '../../src/config/balance';
import { DodoPayments } from 'dodopayments';

// Helper to buffer raw body for signature verification in Vercel
async function getRawBody(req: VercelRequest): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return JSON.stringify(req.body || {});
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const rawBody = await getRawBody(req);
  const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;

  let eventPayload: any;

  // 1. Webhook Signature Verification
  try {
    if (webhookSecret && !webhookSecret.startsWith('whsec_placeholder')) {
      const client = new DodoPayments({
        bearerToken: apiKey || 'test',
        webhookKey: webhookSecret,
      });

      // Headers normalized
      const headersRecord: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headersRecord[key.toLowerCase()] = value;
      }

      eventPayload = client.webhooks.unwrap(rawBody, {
        headers: headersRecord,
        key: webhookSecret,
      });
    } else {
      // In local dev/test with mock placeholder secret
      eventPayload = JSON.parse(rawBody);
    }
  } catch (err: any) {
    console.error('Dodo webhook signature verification failed:', err);
    return res.status(400).json({ message: 'Invalid webhook signature', error: err.message });
  }

  const db = await getDb();
  const webhookId =
    (req.headers['webhook-id'] as string) ||
    eventPayload.id ||
    eventPayload.event_id ||
    `wh_${Date.now()}`;

  // 2. Idempotency Check: Reject duplicate event processing
  const existingEvent = await db.collection('processed_webhooks').findOne({ webhookId });
  if (existingEvent) {
    console.log(`Duplicate webhook ${webhookId} ignored (already processed).`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  const eventType = eventPayload.type || eventPayload.event_type;
  const data = eventPayload.data || eventPayload;
  const metadata = data.metadata || {};
  const playerId = metadata.playerId || data.customer?.metadata?.playerId;
  const productId = metadata.productId;
  const paymentId = data.payment_id || data.id || `pay_${Date.now()}`;

  if (!playerId) {
    console.warn('Webhook received with no playerId in metadata, recording event only.');
    await db.collection('processed_webhooks').insertOne({
      webhookId,
      eventType,
      receivedAt: new Date().toISOString(),
    });
    return res.status(200).json({ received: true, warning: 'no_player_id' });
  }

  // 3. Process Event Types Idempotently
  if (eventType === 'payment.succeeded' || eventType === 'checkout.session.completed') {
    const product = GAME_BALANCE.products.find((p) => p.productId === productId);
    const reward = product ? product.reward : {};

    // Record purchase transaction
    await db.collection('purchases').insertOne({
      playerId,
      dodoPaymentId: paymentId,
      productId: productId || 'unknown',
      amount: data.total_amount || (product ? product.priceUsd * 100 : 0),
      currency: data.currency || 'USD',
      status: 'succeeded',
      rawWebhookId: webhookId,
      createdAt: new Date().toISOString(),
    });

    // Update entitlements
    const entitlementUpdate: any = {
      $set: {
        playerId,
        updatedAt: new Date().toISOString(),
      },
      $addToSet: {
        activePurchases: productId,
      },
    };

    if (reward.removeAds) {
      entitlementUpdate.$set.adsRemoved = true;
    }
    if (reward.seasonPass) {
      entitlementUpdate.$set.seasonPass = true;
    }
    if (reward.cosmeticId) {
      entitlementUpdate.$addToSet.ownedCosmetics = reward.cosmeticId;
    }

    await db.collection('entitlements').updateOne(
      { playerId },
      entitlementUpdate,
      { upsert: true }
    );

    // If purchase grants currency shards, update player's cloud save
    if (reward.shards && reward.shards > 0) {
      await db.collection('saves').updateOne(
        { playerId },
        {
          $inc: { 'currency.shards': reward.shards },
          $set: { updatedAt: new Date().toISOString() },
        },
        { upsert: false }
      );
    }

    console.log(`Entitlements granted to player ${playerId} for product ${productId}.`);
  } else if (
    eventType === 'payment.failed' ||
    eventType === 'refund.succeeded' ||
    eventType === 'dispute.opened'
  ) {
    // Record refund/revocation
    await db.collection('purchases').updateOne(
      { dodoPaymentId: paymentId },
      { $set: { status: eventType, refundedAt: new Date().toISOString() } }
    );

    // If refund succeeded, revoke removeAds if applicable
    if (productId === 'remove_ads') {
      await db.collection('entitlements').updateOne(
        { playerId },
        { $set: { adsRemoved: false, updatedAt: new Date().toISOString() } }
      );
    }
    console.log(`Payment reversal handled for player ${playerId}, status: ${eventType}.`);
  }

  // 4. Mark webhook as processed for idempotency
  await db.collection('processed_webhooks').insertOne({
    webhookId,
    eventType,
    paymentId,
    playerId,
    processedAt: new Date().toISOString(),
  });

  return res.status(200).json({ received: true });
}

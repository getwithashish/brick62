import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CheckoutRequestSchema } from './_lib/schemas.js';
import { GAME_BALANCE } from '../src/config/balance.js';
import { DodoPayments } from 'dodopayments';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(455).json({ message: 'Method Not Allowed' });
  }

  const parseResult = CheckoutRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ message: 'Invalid request body', errors: parseResult.error.errors });
  }

  const { productId, playerId } = parseResult.data;
  const product = GAME_BALANCE.products.find((p) => p.productId === productId);
  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // If running in development without real API credentials, return mock session URL
  if (!apiKey || apiKey.startsWith('test_dodo_apikey_placeholder')) {
    return res.status(200).json({
      checkoutUrl: `${appUrl}?mock_checkout=1&productId=${productId}&playerId=${playerId}`,
      sessionId: `mock_sess_${Date.now()}`,
    });
  }

  try {
    const isLive = process.env.DODO_ENV === 'live';
    const client = new DodoPayments({
      bearerToken: apiKey,
      environment: isLive ? 'live_mode' : 'test_mode',
    });

    // Create checkout session using Dodo Payments SDK
    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: product.dodoProductId, quantity: 1 }],
      metadata: {
        playerId,
        productId,
        game: 'BRICK62',
      },
      return_url: `${appUrl}?payment_status=success&product_id=${productId}`,
    } as any);

    return res.status(200).json({
      checkoutUrl: (session as any).checkout_url || (session as any).url,
      sessionId: (session as any).session_id || (session as any).id,
    });
  } catch (error: any) {
    console.error('Error creating Dodo Payments checkout session:', error);
    return res.status(500).json({ message: error.message || 'Payment provider error' });
  }
}

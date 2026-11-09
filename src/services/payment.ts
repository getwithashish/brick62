import { GAME_BALANCE, ProductConfig } from '../config/balance';

export interface Entitlements {
  adsRemoved: boolean;
  seasonPass: boolean;
  activePurchases: string[];
}

export interface PaymentProvider {
  name: string;
  initiateCheckout(productId: string, playerId: string): Promise<{ checkoutUrl?: string; success: boolean; reward?: any }>;
  restorePurchases(playerId: string): Promise<Entitlements>;
}

export class MockPaymentProvider implements PaymentProvider {
  public name: string = 'MockPaymentProvider';

  public async initiateCheckout(productId: string, playerId: string): Promise<{ checkoutUrl?: string; success: boolean; reward?: any }> {
    const product = GAME_BALANCE.products.find((p) => p.productId === productId);
    if (!product) throw new Error(`Product not found: ${productId}`);

    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'ad-modal-overlay';
      modal.innerHTML = `
        <div class="ad-modal-card">
          <div class="ad-badge">DEV TEST CHECKOUT</div>
          <h3>Simulated Purchase: ${product.name}</h3>
          <p>Price: $${product.priceUsd.toFixed(2)} USD</p>
          <p style="color:#aaa; font-size:13px;">(Mock mode enabled: this simulates a successful purchase flow without spending real money)</p>
          <div style="display:flex; gap:12px; justify-content:center; margin-top:20px;">
            <button id="mockPaySuccess" class="primary-btn" style="background:#00d2d3;">Simulate Success</button>
            <button id="mockPayCancel" class="primary-btn" style="background:#555;">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const successBtn = modal.querySelector('#mockPaySuccess') as HTMLButtonElement;
      const cancelBtn = modal.querySelector('#mockPayCancel') as HTMLButtonElement;

      successBtn.onclick = () => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
        resolve({ success: true, reward: product.reward });
      };

      cancelBtn.onclick = () => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
        resolve({ success: false });
      };
    });
  }

  public async restorePurchases(playerId: string): Promise<Entitlements> {
    try {
      const raw = localStorage.getItem('brick62_save_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.entitlements) {
          return parsed.entitlements;
        }
      }
    } catch (e) {}
    return { adsRemoved: false, seasonPass: false, activePurchases: [] };
  }
}

export class DodoPaymentProvider implements PaymentProvider {
  public name: string = 'DodoPaymentProvider';
  private apiEndpoint: string = '/api/checkout';

  public async initiateCheckout(productId: string, playerId: string): Promise<{ checkoutUrl?: string; success: boolean; reward?: any }> {
    try {
      const res = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, playerId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to initialize Dodo checkout session');
      }

      const data = await res.json();
      if (data.checkoutUrl) {
        // Open Dodo hosted checkout page
        window.location.href = data.checkoutUrl;
        return { checkoutUrl: data.checkoutUrl, success: true };
      }
      return { success: false };
    } catch (e: any) {
      console.error('Dodo checkout failed', e);
      alert(`Checkout error: ${e.message || 'Unknown error'}`);
      return { success: false };
    }
  }

  public async restorePurchases(playerId: string): Promise<Entitlements> {
    try {
      const res = await fetch(`/api/entitlements?playerId=${encodeURIComponent(playerId)}`);
      if (res.ok) {
        const data = await res.json();
        return {
          adsRemoved: !!data.adsRemoved,
          seasonPass: !!data.seasonPass,
          activePurchases: data.activePurchases || [],
        };
      }
    } catch (e) {
      console.warn('Failed to restore cloud entitlements', e);
    }
    return { adsRemoved: false, seasonPass: false, activePurchases: [] };
  }
}

import { GAME_BALANCE } from '../config/balance';

export interface AdProvider {
  name: string;
  isRewardedAvailable(): boolean;
  showRewarded(placement: string): Promise<boolean>;
  showInterstitial(placement: string): Promise<boolean>;
}

export class MockAdProvider implements AdProvider {
  public name: string = 'MockAdProvider';
  private adsRemoved: boolean = false;
  private rewardedTodayCount: number = 0;
  private sessionStartTime: number = Date.now();
  private lastInterstitialTime: number = 0;
  private stagesSinceLastInterstitial: number = 0;

  constructor(adsRemoved: boolean = false) {
    this.adsRemoved = adsRemoved;
  }

  public setAdsRemoved(removed: boolean): void {
    this.adsRemoved = removed;
  }

  public isRewardedAvailable(): boolean {
    return this.rewardedTodayCount < GAME_BALANCE.ads.maxRewardedPerDay;
  }

  /**
   * Shows a 3-second simulated rewarded video overlay with an ethical countdown
   */
  public async showRewarded(placement: string): Promise<boolean> {
    if (!this.isRewardedAvailable()) return false;

    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'ad-modal-overlay';
      modal.innerHTML = `
        <div class="ad-modal-card">
          <div class="ad-badge">SPONSORED REWARD (${placement})</div>
          <h3>Simulated Video Ad</h3>
          <p>Supporting BRICK62 developers. Thank you for playing!</p>
          <div class="ad-timer-bar-wrap">
            <div class="ad-timer-bar" id="adTimerBar"></div>
          </div>
          <p id="adCountdownText" class="ad-countdown">Reward in 3 seconds...</p>
        </div>
      `;
      document.body.appendChild(modal);

      let timeLeft = 3;
      const bar = modal.querySelector('#adTimerBar') as HTMLElement;
      const text = modal.querySelector('#adCountdownText') as HTMLElement;

      const interval = setInterval(() => {
        timeLeft--;
        if (bar) bar.style.width = `${((3 - timeLeft) / 3) * 100}%`;
        if (text) text.innerText = timeLeft > 0 ? `Reward in ${timeLeft}s...` : 'Reward Unlocked!';

        if (timeLeft <= 0) {
          clearInterval(interval);
          setTimeout(() => {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
            this.rewardedTodayCount++;
            resolve(true);
          }, 350);
        }
      }, 1000);
    });
  }

  /**
   * Interstitial with strict ethical frequency rules:
   * Never within first 3 minutes, at least 5 mins between ads, never during play, disabled if adsRemoved.
   */
  public async showInterstitial(placement: string): Promise<boolean> {
    if (this.adsRemoved) return false;

    const now = Date.now();
    const elapsedSinceStart = (now - this.sessionStartTime) / 1000;
    if (elapsedSinceStart < GAME_BALANCE.ads.interstitialMinSecondsAfterStart) {
      return false; // Skip early game
    }

    const elapsedSinceLast = (now - this.lastInterstitialTime) / 1000;
    if (elapsedSinceLast < GAME_BALANCE.ads.interstitialMinIntervalSeconds) {
      return false;
    }

    this.stagesSinceLastInterstitial++;
    if (this.stagesSinceLastInterstitial < GAME_BALANCE.ads.interstitialStageFrequency) {
      return false;
    }

    this.lastInterstitialTime = now;
    this.stagesSinceLastInterstitial = 0;

    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'ad-modal-overlay';
      modal.innerHTML = `
        <div class="ad-modal-card">
          <div class="ad-badge">INTERSTITIAL (${placement})</div>
          <h3>Short Sponsor Break</h3>
          <p>Remove ads anytime in the store for $3.99!</p>
          <button id="closeAdBtn" class="primary-btn" style="margin-top:16px;">Continue Playing</button>
        </div>
      `;
      document.body.appendChild(modal);

      const btn = modal.querySelector('#closeAdBtn') as HTMLButtonElement;
      if (btn) {
        btn.onclick = () => {
          if (modal.parentNode) modal.parentNode.removeChild(modal);
          resolve(true);
        };
      }
    });
  }
}

/**
 * Adapter for Web Game Portals (Poki SDK, CrazyGames, GameDistribution)
 */
export class PortalAdProvider implements AdProvider {
  public name: string;
  private sdk: any;
  private adsRemoved: boolean;

  constructor(portalName: 'poki' | 'crazygames' | 'gamedistribution', adsRemoved: boolean = false) {
    this.name = portalName;
    this.adsRemoved = adsRemoved;
    this.sdk = (window as any)[portalName] || (window as any).CrazyGames?.SDK;
  }

  public setAdsRemoved(removed: boolean): void {
    this.adsRemoved = removed;
  }

  public isRewardedAvailable(): boolean {
    return !!this.sdk;
  }

  public async showRewarded(placement: string): Promise<boolean> {
    if (!this.sdk) return false;
    try {
      if (this.name === 'crazygames' && this.sdk.ad) {
        await this.sdk.ad.requestAd('rewarded');
        return true;
      } else if (this.name === 'poki') {
        const success = await this.sdk.rewardedBreak();
        return !!success;
      }
    } catch (e) {
      console.warn('Portal rewarded ad failed', e);
    }
    return false;
  }

  public async showInterstitial(placement: string): Promise<boolean> {
    if (this.adsRemoved || !this.sdk) return false;
    try {
      if (this.name === 'crazygames' && this.sdk.ad) {
        await this.sdk.ad.requestAd('midgame');
        return true;
      } else if (this.name === 'poki') {
        await this.sdk.commercialBreak();
        return true;
      }
    } catch (e) {
      console.warn('Portal interstitial ad failed', e);
    }
    return false;
  }
}

import { GameSimulation } from './core/sim';
import { GameRenderer } from './render/renderer';
import { SoundEngine } from './audio/sound_engine';
import { LocalSaveProvider, CloudSaveProvider, SaveData } from './services/save_service';
import { MockAdProvider } from './services/ads';
import { MockPaymentProvider, DodoPaymentProvider } from './services/payment';
import { AnalyticsService } from './services/analytics';
import { InputRecorder } from './core/input_log';
import { createStage, generateEndlessWave, generateDailyChallenge } from './core/stages/stage_data';
import { GAME_BALANCE } from './config/balance';
import { GameEvent } from './core/types';

class GameManager {
  private canvas: HTMLCanvasElement;
  private renderer: GameRenderer;
  private sound: SoundEngine;
  private saveProvider: CloudSaveProvider;
  private localSaveProvider: LocalSaveProvider;
  private adProvider: MockAdProvider;
  private paymentProvider: MockPaymentProvider | DodoPaymentProvider;
  private analytics: AnalyticsService;
  private inputRecorder: InputRecorder;

  public saveData!: SaveData;
  public sim: GameSimulation | null = null;

  // Loop timing
  private lastTime: number = 0;
  private accumulator: number = 0;
  private isLoopRunning: boolean = false;

  // Active play state
  public currentStageId: number = 1;
  public currentMode: 'campaign' | 'endless' | 'daily' | 'tournament' = 'campaign';
  public currentAttempt: number = 1;
  public endlessWave: number = 1;
  public dailyModifier?: string;

  // Input state
  private inputTargetX: number = 240;
  private inputLaunchRequested: boolean = false;
  private keysDown: Set<string> = new Set();

  constructor() {
    this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    this.renderer = new GameRenderer(this.canvas);
    this.sound = new SoundEngine();

    this.localSaveProvider = new LocalSaveProvider();
    this.saveProvider = new CloudSaveProvider(this.localSaveProvider);

    this.adProvider = new MockAdProvider();
    // Default to Mock for dev; if DODO_PAYMENTS_API_KEY is present or not in mock mode, use Dodo
    this.paymentProvider = new MockPaymentProvider();

    this.analytics = new AnalyticsService();
    this.inputRecorder = new InputRecorder();
  }

  public async init(): Promise<void> {
    // 1. Load Save Data
    this.saveData = await this.saveProvider.load();
    this.adProvider.setAdsRemoved(this.saveData.entitlements.adsRemoved);
    this.analytics.setConsent(this.saveData.consent.analytics);

    // Apply persisted audio & visual settings
    this.sound.setMuted(this.saveData.settings.muted);
    this.sound.setSfxVolume(this.saveData.settings.sfxVolume);
    this.sound.setMusicVolume(this.saveData.settings.musicVolume);

    this.renderer.settings.screenShakeScale = this.saveData.settings.screenShake;
    this.renderer.settings.reduceMotion = this.saveData.settings.reduceMotion;
    this.renderer.settings.reduceFlash = this.saveData.settings.reduceFlash;
    this.renderer.settings.colorblindMode = this.saveData.settings.colorblindMode as any;
    this.renderer.settings.paddleSkin = this.saveData.cosmetics.equippedPaddle;
    this.renderer.settings.ballSkin = this.saveData.cosmetics.equippedBall;

    // 2. Setup Responsive Viewport Resize
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    // 3. Attach Input Handlers
    this.setupInputListeners();

    // 4. Wire UI Elements
    this.wireUI();

    // 5. Check Consent Banner
    if (!this.saveData.consent.answered) {
      const banner = document.getElementById('consentBanner');
      if (banner) banner.classList.remove('hidden');
    }

    // Update Sideboards
    this.refreshSidebars();

    // Check payment redirect parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment_status') === 'success') {
      await this.handlePaymentReturn();
    }

    // Start render/game loop
    this.startLoop();
  }

  private handleResize(): void {
    const viewport = document.getElementById('canvasViewport');
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    this.renderer.resize(rect.width, rect.height);
  }

  private setupInputListeners(): void {
    // Unlock Web Audio on first gesture
    const unlockAudio = () => {
      this.sound.initContext();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Touch / Pointer Movement (drag anywhere to steer paddle)
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sound.initContext();
      this.updateInputFromPointer(e);
      this.inputLaunchRequested = true;
    });

    window.addEventListener('pointermove', (e) => {
      if (this.sim && this.sim.isRunning) {
        this.updateInputFromPointer(e);
      }
    });

    window.addEventListener('pointerup', () => {
      this.inputLaunchRequested = false;
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      this.keysDown.add(e.code);
      if (e.code === 'Space' || e.code === 'Enter') {
        this.inputLaunchRequested = true;
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        this.togglePause();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      if (e.code === 'Space' || e.code === 'Enter') {
        this.inputLaunchRequested = false;
      }
    });
  }

  private updateInputFromPointer(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const normX = (clientX / rect.width) * GAME_BALANCE.arena.width;
    this.inputTargetX = Math.max(20, Math.min(GAME_BALANCE.arena.width - 20, normX));
  }

  private updateKeyboardPaddle(dt: number): void {
    const speed = GAME_BALANCE.paddle.speed;
    let dx = 0;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) dx -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) dx += 1;

    if (dx !== 0) {
      this.inputTargetX = Math.max(
        20,
        Math.min(GAME_BALANCE.arena.width - 20, this.inputTargetX + dx * speed * dt)
      );
    }
  }

  /**
   * Main game animation loop with fixed-timestep sub-stepping
   */
  private startLoop(): void {
    this.isLoopRunning = true;
    this.lastTime = performance.now();

    const loop = (time: number) => {
      if (!this.isLoopRunning) return;
      const rawDt = (time - this.lastTime) / 1000;
      this.lastTime = time;

      // Cap delta time to prevent spiral of death
      const dt = Math.min(GAME_BALANCE.physics.maxDt, rawDt);
      this.accumulator += dt;

      const targetDt = GAME_BALANCE.physics.dt;

      if (this.sim && this.sim.isRunning) {
        this.updateKeyboardPaddle(targetDt);

        while (this.accumulator >= targetDt) {
          // Record input frame for anti-cheat verification
          this.inputRecorder.record(this.sim.tick, this.inputTargetX, this.inputLaunchRequested);

          const events = this.sim.step({
            tick: this.sim.tick,
            targetX: this.inputTargetX,
            launch: this.inputLaunchRequested,
          });

          this.handleSimulationEvents(events);

          this.inputLaunchRequested = false;
          this.accumulator -= targetDt;
        }

        // Update In-Game HUD
        this.updateHud();
      } else {
        this.accumulator = 0;
      }

      // Render graphics
      if (this.sim) {
        this.renderer.render(this.sim, dt);
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  private handleSimulationEvents(events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'sound':
          this.sound.playSound(ev.soundId, ev.pitchMultiplier, ev.worldId);
          break;
        case 'screen_shake':
          this.renderer.triggerShake(ev.intensity, ev.duration);
          break;
        case 'hit_stop':
          if (this.sim) this.sim.hitStopTicks = ev.frames;
          break;
        case 'brick_hit':
          this.renderer.updateBrokenBrick(ev.brick);
          this.renderer.particleSystem.emitBrickCrumble(
            ev.brick.x,
            ev.brick.y,
            ev.brick.width,
            ev.brick.height,
            ev.brick.color,
            ev.isDestroyed ? 8 : 3
          );
          break;
        case 'explosion':
          this.renderer.particleSystem.emitExplosion(ev.x, ev.y, ev.radius);
          break;
        case 'combo_milestone':
          this.renderer.particleSystem.addText(
            `COMBO x${ev.combo}!`,
            ev.x,
            ev.y,
            '#feca57',
            1.2
          );
          break;
        case 'ball_paddle_hit':
          if (ev.perfect) {
            this.renderer.particleSystem.addText(
              'PERFECT!',
              ev.ball.x,
              ev.ball.y - 20,
              '#00f2fe',
              1.1
            );
          }
          break;
        case 'stage_cleared':
          this.onStageCleared(ev.stats);
          break;
        case 'stage_failed':
          this.onStageFailed(ev.remainingBricks, ev.attempt);
          break;
      }
    }
  }

  private updateHud(): void {
    if (!this.sim) return;
    const sim = this.sim;

    const brickCount = document.getElementById('hudBrickCount');
    if (brickCount) brickCount.innerText = `${sim.activeBricksCount} Bricks`;

    const bar = document.getElementById('hudProgressBar');
    if (bar && sim.initialBricksCount > 0) {
      const pct = (sim.activeBricksCount / sim.initialBricksCount) * 100;
      bar.style.width = `${pct}%`;
    }

    const ballCount = document.getElementById('hudBallCount');
    if (ballCount) ballCount.innerText = `${sim.balls.length}`;

    const comboPill = document.getElementById('hudComboPill');
    const comboCount = document.getElementById('hudComboCount');
    if (comboPill && comboCount) {
      if (sim.combo > 1) {
        comboPill.classList.remove('hidden');
        comboCount.innerText = `x${sim.combo}`;
      } else {
        comboPill.classList.add('hidden');
      }
    }

    // Power-up slot
    const slot = document.getElementById('hudPowerUpSlot');
    const icon = document.getElementById('hudPowerUpIcon');
    const fill = document.getElementById('hudPowerUpBar');
    if (slot && icon && fill) {
      if (sim.paddle.laserTimer > 0) {
        slot.classList.remove('hidden');
        icon.innerText = '▲';
        fill.style.width = `${(sim.paddle.laserTimer / GAME_BALANCE.powerups.durations.laserPaddle) * 100}%`;
      } else if (sim.paddle.wideTimer > 0) {
        slot.classList.remove('hidden');
        icon.innerText = '↔';
        fill.style.width = `${(sim.paddle.wideTimer / GAME_BALANCE.powerups.durations.widePaddle) * 100}%`;
      } else {
        slot.classList.add('hidden');
      }
    }

    // Keep dynamic music updated
    this.sound.updateMusicState(sim.stage.worldId, sim.combo);
  }

  public launchStage(stageId: number, options: { mode?: any; modifier?: string } = {}): void {
    this.currentStageId = stageId;
    this.currentMode = options.mode || 'campaign';
    this.dailyModifier = options.modifier;

    let stageDef;
    if (this.currentMode === 'endless') {
      stageDef = generateEndlessWave(this.endlessWave);
    } else if (this.currentMode === 'daily') {
      const today = new Date().toISOString().slice(0, 10);
      const daily = generateDailyChallenge(today);
      stageDef = daily.stage;
      this.dailyModifier = daily.modifierName;
    } else {
      stageDef = createStage(stageId);
    }

    this.sim = new GameSimulation(stageDef, {
      attemptNumber: this.currentAttempt,
      permanentUpgrades: this.saveData.upgrades,
      modifier: this.dailyModifier,
    });

    this.inputRecorder.clear();
    this.renderer.bakeStaticBricks(this.sim.bricks, Math.min(5, Math.floor((stageId - 1) / 5)));
    this.renderer.particleSystem.clear();

    // Show HUD, Hide Menus
    this.hideAllScreens();
    const hud = document.getElementById('gameHud');
    if (hud) hud.classList.remove('hidden');

    const titleEl = document.getElementById('hudStageTitle');
    if (titleEl) {
      titleEl.innerText = this.currentMode === 'endless' ? `WAVE ${this.endlessWave}` : stageDef.name.toUpperCase();
    }
    const attemptEl = document.getElementById('hudAttemptCount');
    if (attemptEl) attemptEl.innerText = `#${this.currentAttempt}`;

    this.sound.startMusic(stageDef.worldId);
    this.analytics.logEvent('stage_start', { stageId, mode: this.currentMode, attempt: this.currentAttempt });
  }

  private async onStageCleared(stats: import('./core/types').StageEndStats): Promise<void> {
    this.sound.stopMusic();

    // Update Save Data
    const prevStars = this.saveData.progress.stageStars[stats.stageId] || 0;
    this.saveData.progress.stageStars[stats.stageId] = Math.max(prevStars, stats.starsEarned);

    const prevScore = this.saveData.progress.stageBestScores[stats.stageId] || 0;
    this.saveData.progress.stageBestScores[stats.stageId] = Math.max(prevScore, stats.score);

    const prevTime = this.saveData.progress.stageBestTimes[stats.stageId] || 9999;
    this.saveData.progress.stageBestTimes[stats.stageId] = Math.min(prevTime, stats.clearTimeSeconds);

    // Unlock next stage if campaign
    if (this.currentMode === 'campaign' && stats.stageId === this.saveData.progress.maxUnlockedStage) {
      if (this.saveData.progress.maxUnlockedStage < 30) {
        this.saveData.progress.maxUnlockedStage++;
      }
    }

    // Add Shards
    this.saveData.currency.shards += stats.shardsEarned;
    await this.saveProvider.save(this.saveData);
    this.refreshSidebars();

    // Submit validated score to backend leaderboard
    try {
      fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: this.saveData.playerId,
          mode: this.currentMode,
          stageId: stats.stageId,
          seed: stats.stageId * 31337,
          score: stats.score,
          clearTimeSeconds: stats.clearTimeSeconds,
          maxCombo: stats.maxCombo,
          bricksCleared: this.sim?.initialBricksCount || 100,
          inputs: this.inputRecorder.getFrames(),
        }),
      }).catch(() => {});
    } catch (e) {}

    // Populate Clear Modal
    const modal = document.getElementById('modalStageClear');
    const scoreVal = document.getElementById('clearScoreVal');
    const timeVal = document.getElementById('clearTimeVal');
    const comboVal = document.getElementById('clearComboVal');
    const shardsVal = document.getElementById('clearShardsVal');
    const starsRow = document.getElementById('clearStarsRow');

    if (scoreVal) scoreVal.innerText = stats.score.toLocaleString();
    if (timeVal) timeVal.innerText = `${stats.clearTimeSeconds}s`;
    if (comboVal) comboVal.innerText = `x${stats.maxCombo}`;
    if (shardsVal) shardsVal.innerText = `+${stats.shardsEarned} ⬡`;

    if (starsRow) {
      starsRow.innerHTML = `
        <span class="star-big ${stats.star1Achieved ? 'star-active' : ''}">★</span>
        <span class="star-big ${stats.star2Achieved ? 'star-active' : ''}">★</span>
        <span class="star-big ${stats.star3Achieved ? 'star-active' : ''}">★</span>
      `;
    }

    if (modal) modal.classList.remove('hidden');

    this.analytics.logEvent('stage_clear', {
      stageId: stats.stageId,
      stars: stats.starsEarned,
      score: stats.score,
    });
  }

  private onStageFailed(remainingBricks: number, attempt: number): void {
    this.sound.stopMusic();

    const modal = document.getElementById('modalFailed');
    const missedText = document.getElementById('failMissedText');
    if (missedText) missedText.innerText = `Missed by ${remainingBricks} brick${remainingBricks === 1 ? '' : 's'}!`;

    if (modal) modal.classList.remove('hidden');

    this.analytics.logEvent('attempt_fail', {
      stageId: this.currentStageId,
      attempt,
      remainingBricks,
    });
  }

  public restartAttempt(): void {
    this.currentAttempt++;
    this.launchStage(this.currentStageId, { mode: this.currentMode, modifier: this.dailyModifier });
  }

  public togglePause(): void {
    const pauseModal = document.getElementById('modalPause');
    if (!this.sim || !pauseModal) return;

    if (this.sim.isRunning) {
      this.sim.isRunning = false;
      const bricksLeft = document.getElementById('pauseBricksLeft');
      const score = document.getElementById('pauseScore');
      if (bricksLeft) bricksLeft.innerText = `${this.sim.activeBricksCount}`;
      if (score) score.innerText = `${this.sim.score}`;
      pauseModal.classList.remove('hidden');
    } else {
      this.sim.isRunning = true;
      pauseModal.classList.add('hidden');
    }
  }

  private refreshSidebars(): void {
    let totalStars = 0;
    for (const s of Object.values(this.saveData.progress.stageStars)) {
      totalStars += s;
    }

    const starEl = document.getElementById('sideTotalStars');
    if (starEl) starEl.innerText = `${totalStars} ★`;

    const shardEl = document.getElementById('sideTotalShards');
    if (shardEl) shardEl.innerText = `${this.saveData.currency.shards} ⬡`;

    const titleShards = document.getElementById('titleShards');
    if (titleShards) titleShards.innerText = `${this.saveData.currency.shards} ⬡`;

    const mapShards = document.getElementById('mapShardsDisplay');
    if (mapShards) mapShards.innerText = `${this.saveData.currency.shards} ⬡`;

    const upgShards = document.getElementById('upgradesShardsDisplay');
    if (upgShards) upgShards.innerText = `${this.saveData.currency.shards} ⬡`;

    const streakEl = document.getElementById('sideDailyStreak');
    if (streakEl) streakEl.innerText = `Day ${this.saveData.streak.currentStreak} 🔥`;

    const adFreeBadge = document.getElementById('sideAdFreeBadge');
    if (adFreeBadge) {
      if (this.saveData.entitlements.adsRemoved) {
        adFreeBadge.classList.remove('hidden');
      } else {
        adFreeBadge.classList.add('hidden');
      }
    }
  }

  private hideAllScreens(): void {
    const screens = [
      'screenTitle', 'screenMap', 'screenUpgrades', 'screenStore',
      'screenDaily', 'screenLeaderboard', 'screenSettings', 'screenAchievements',
      'modalPreStage', 'modalPause', 'modalStageClear', 'modalFailed', 'modalLegal',
    ];
    for (const id of screens) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    }
  }

  public showScreen(screenId: string): void {
    this.hideAllScreens();
    const hud = document.getElementById('gameHud');
    if (hud) hud.classList.add('hidden');

    const screen = document.getElementById(screenId);
    if (screen) screen.classList.remove('hidden');

    if (screenId === 'screenMap') this.renderStageMap();
    if (screenId === 'screenUpgrades') this.renderUpgrades();
    if (screenId === 'screenStore') this.renderStore();
    if (screenId === 'screenLeaderboard') this.loadLeaderboard('daily');
    if (screenId === 'screenAchievements') this.renderAchievements();
  }

  // --- STAGE MAP RENDERING ---
  private renderStageMap(worldIndex: number = 0): void {
    const tabs = document.getElementById('worldTabs');
    const grid = document.getElementById('stagesGrid');
    if (!tabs || !grid) return;

    tabs.innerHTML = '';
    GAME_BALANCE.worlds.forEach((w, idx) => {
      const btn = document.createElement('button');
      btn.className = `world-tab-btn ${idx === worldIndex ? 'active' : ''}`;
      btn.innerText = `W${idx + 1}: ${w.name}`;
      btn.onclick = () => this.renderStageMap(idx);
      tabs.appendChild(btn);
    });

    grid.innerHTML = '';
    const startStage = worldIndex * 5 + 1;
    for (let sid = startStage; sid < startStage + 5; sid++) {
      const isLocked = sid > this.saveData.progress.maxUnlockedStage;
      const isBoss = sid % 5 === 0;
      const stars = this.saveData.progress.stageStars[sid] || 0;

      const card = document.createElement('div');
      card.className = `stage-card-btn ${isLocked ? 'locked' : ''} ${isBoss ? 'boss-stage' : ''} ${sid === this.saveData.progress.maxUnlockedStage ? 'active-stage' : ''}`;

      card.innerHTML = `
        <span class="stage-num">${isBoss ? 'BOSS' : sid}</span>
        <span class="stage-stars-mini">${isLocked ? '🔒' : '★'.repeat(stars) + '☆'.repeat(3 - stars)}</span>
      `;

      if (!isLocked) {
        card.onclick = () => this.openPreStage(sid);
      }
      grid.appendChild(card);
    }
  }

  private openPreStage(stageId: number): void {
    const modal = document.getElementById('modalPreStage');
    const title = document.getElementById('preStageTitle');
    const worldEl = document.getElementById('preStageWorld');
    if (!modal || !title) return;

    const stage = createStage(stageId);
    const worldIdx = Math.min(5, Math.floor((stageId - 1) / 5));
    title.innerText = `SECTOR ${stageId}: ${stage.name}`;
    if (worldEl) worldEl.innerText = `WORLD ${worldIdx + 1}: ${GAME_BALANCE.worlds[worldIdx].name}`;

    modal.classList.remove('hidden');

    const startBtn = document.getElementById('btnStartStage');
    if (startBtn) {
      startBtn.onclick = () => {
        modal.classList.add('hidden');
        this.currentAttempt = 1;
        this.launchStage(stageId);
      };
    }
  }

  // --- UPGRADES SHOP RENDERING ---
  private renderUpgrades(): void {
    const list = document.getElementById('upgradesList');
    if (!list) return;

    list.innerHTML = '';
    for (const upg of GAME_BALANCE.upgrades) {
      const currentLevel = this.saveData.upgrades[upg.id] || 0;
      const isMax = currentLevel >= upg.maxLevel;
      const cost = Math.round(upg.baseCost * Math.pow(upg.costMultiplier, currentLevel));
      const canAfford = this.saveData.currency.shards >= cost && !isMax;

      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `
        <div class="upgrade-info">
          <span class="upgrade-icon">${upg.icon}</span>
          <div class="upgrade-text">
            <h4>${upg.name} (${currentLevel}/${upg.maxLevel})</h4>
            <p>${upg.description} (+${upg.valuePerLevel}${upg.unit}/lvl)</p>
          </div>
        </div>
        <button class="upgrade-btn" ${!canAfford ? 'disabled' : ''}>
          ${isMax ? 'MAX' : `${cost} ⬡`}
        </button>
      `;

      const btn = card.querySelector('button');
      if (btn && canAfford) {
        btn.onclick = async () => {
          this.saveData.currency.shards -= cost;
          this.saveData.upgrades[upg.id] = currentLevel + 1;
          await this.saveProvider.save(this.saveData);
          this.sound.playSound('powerup_collect');
          this.refreshSidebars();
          this.renderUpgrades();
        };
      }
      list.appendChild(card);
    }
  }

  // --- STORE RENDERING ---
  private renderStore(): void {
    const list = document.getElementById('storeProductsList');
    if (!list) return;

    list.innerHTML = '';
    for (const prod of GAME_BALANCE.products) {
      const alreadyOwned = prod.productId === 'remove_ads' && this.saveData.entitlements.adsRemoved;

      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <div class="product-info">
          <h4>${prod.name}</h4>
          <p>${prod.description}</p>
        </div>
        <button class="buy-btn" ${alreadyOwned ? 'disabled' : ''}>
          ${alreadyOwned ? 'OWNED' : `$${prod.priceUsd.toFixed(2)}`}
        </button>
      `;

      const btn = card.querySelector('button');
      if (btn && !alreadyOwned) {
        btn.onclick = async () => {
          const res = await this.paymentProvider.initiateCheckout(prod.productId, this.saveData.playerId);
          if (res.success && res.reward) {
            // Apply rewards immediately for mock mode
            if (res.reward.removeAds) this.saveData.entitlements.adsRemoved = true;
            if (res.reward.shards) this.saveData.currency.shards += res.reward.shards;
            if (res.reward.seasonPass) this.saveData.entitlements.seasonPass = true;
            if (res.reward.cosmeticId && !this.saveData.cosmetics.ownedPaddles.includes(res.reward.cosmeticId)) {
              this.saveData.cosmetics.ownedPaddles.push(res.reward.cosmeticId);
            }
            await this.saveProvider.save(this.saveData);
            this.adProvider.setAdsRemoved(this.saveData.entitlements.adsRemoved);
            this.refreshSidebars();
            this.renderStore();
            alert(`Thank you! ${prod.name} unlocked successfully!`);
          }
        };
      }
      list.appendChild(card);
    }

    // Render cosmetics grid
    const cosGrid = document.getElementById('cosmeticsGrid');
    if (cosGrid) {
      cosGrid.innerHTML = '';
      for (const p of GAME_BALANCE.cosmetics.paddles) {
        const owned = this.saveData.cosmetics.ownedPaddles.includes(p.id);
        const equipped = this.saveData.cosmetics.equippedPaddle === p.id;

        const c = document.createElement('div');
        c.className = 'cosmetic-card';
        c.innerHTML = `
          <h5>${p.name}</h5>
          <div class="cosmetic-preview" style="background:${p.color};"></div>
          <button class="cyber-btn compact" style="margin-top:6px;">
            ${equipped ? 'EQUIPPED' : (owned ? 'EQUIP' : `${p.priceShards} ⬡`)}
          </button>
        `;

        const btn = c.querySelector('button');
        if (btn) {
          btn.onclick = async () => {
            if (owned) {
              this.saveData.cosmetics.equippedPaddle = p.id;
              this.renderer.settings.paddleSkin = p.id;
              await this.saveProvider.save(this.saveData);
              this.renderStore();
            } else if (this.saveData.currency.shards >= p.priceShards) {
              this.saveData.currency.shards -= p.priceShards;
              this.saveData.cosmetics.ownedPaddles.push(p.id);
              this.saveData.cosmetics.equippedPaddle = p.id;
              this.renderer.settings.paddleSkin = p.id;
              await this.saveProvider.save(this.saveData);
              this.refreshSidebars();
              this.renderStore();
            }
          };
        }
        cosGrid.appendChild(c);
      }
    }
  }

  // --- LEADERBOARDS ---
  private async loadLeaderboard(mode: string): Promise<void> {
    const tbody = document.getElementById('leaderboardBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading ranks...</td></tr>';
    try {
      const res = await fetch(`/api/leaderboard?mode=${mode}`);
      if (res.ok) {
        const data = await res.json();
        tbody.innerHTML = '';
        data.leaderboard.forEach((r: any) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>#${r.rank}</strong></td>
            <td>${r.displayName}</td>
            <td class="text-gold">${r.score.toLocaleString()}</td>
            <td>${r.clearTimeSeconds}s</td>
          `;
          tbody.appendChild(tr);
        });
        return;
      }
    } catch (e) {}
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Offline: Local leaderboard active</td></tr>';
  }

  // --- ACHIEVEMENTS ---
  private renderAchievements(): void {
    const list = document.getElementById('achievementsList');
    if (!list) return;

    const milestones = [
      { id: 'first_blood', name: 'First Light', desc: 'Clear Stage 1 with 3 Stars', icon: '🌟' },
      { id: 'combo_master', name: 'Combo Master', desc: 'Reach a 30x Combo multiplier', icon: '⚡' },
      { id: 'boss_slayer', name: 'Dreadnought Breaker', desc: 'Defeat Boss 1 (SOLARIS CORE)', icon: '👑' },
      { id: 'endless_voyager', name: 'Infinite Voyager', desc: 'Reach Wave 10 in Endless Mode', icon: '♾️' },
      { id: 'speed_demon', name: 'Light Speed', desc: 'Clear any stage under 30 seconds', icon: '⏱️' },
    ];

    list.innerHTML = '';
    milestones.forEach((m) => {
      const unlocked = !!this.saveData.achievements[m.id];
      const div = document.createElement('div');
      div.className = 'upgrade-card';
      div.innerHTML = `
        <div class="upgrade-info">
          <span class="upgrade-icon">${m.icon}</span>
          <div class="upgrade-text">
            <h4>${m.name}</h4>
            <p>${m.desc}</p>
          </div>
        </div>
        <span style="font-size:12px; font-weight:700; color:${unlocked ? 'var(--neon-green)' : '#666'};">
          ${unlocked ? 'COMPLETED' : 'LOCKED'}
        </span>
      `;
      list.appendChild(div);
    });
  }

  private async handlePaymentReturn(): Promise<void> {
    const entitlements = await this.paymentProvider.restorePurchases(this.saveData.playerId);
    if (entitlements.adsRemoved) {
      this.saveData.entitlements.adsRemoved = true;
      this.adProvider.setAdsRemoved(true);
      await this.saveProvider.save(this.saveData);
      this.refreshSidebars();
      alert('Purchases successfully restored and verified from server!');
    }
  }

  // --- WIRE UI LISTENERS ---
  private wireUI(): void {
    // Title buttons
    document.getElementById('btnPlay')?.addEventListener('click', () => this.showScreen('screenMap'));
    document.getElementById('btnShop')?.addEventListener('click', () => this.showScreen('screenUpgrades'));
    document.getElementById('btnStore')?.addEventListener('click', () => this.showScreen('screenStore'));
    document.getElementById('btnLeaderboard')?.addEventListener('click', () => this.showScreen('screenLeaderboard'));
    document.getElementById('btnAchievements')?.addEventListener('click', () => this.showScreen('screenAchievements'));
    document.getElementById('btnSettings')?.addEventListener('click', () => this.showScreen('screenSettings'));
    document.getElementById('btnPrivacyTerms')?.addEventListener('click', () => {
      document.getElementById('modalLegal')?.classList.remove('hidden');
    });

    // Back buttons
    document.getElementById('mapBackBtn')?.addEventListener('click', () => this.showScreen('screenTitle'));
    document.getElementById('upgradesBackBtn')?.addEventListener('click', () => this.showScreen('screenTitle'));
    document.getElementById('storeBackBtn')?.addEventListener('click', () => this.showScreen('screenTitle'));
    document.getElementById('dailyBackBtn')?.addEventListener('click', () => this.showScreen('screenTitle'));
    document.getElementById('leaderboardBackBtn')?.addEventListener('click', () => this.showScreen('screenTitle'));
    document.getElementById('settingsBackBtn')?.addEventListener('click', () => this.showScreen('screenTitle'));
    document.getElementById('achievementsBackBtn')?.addEventListener('click', () => this.showScreen('screenTitle'));
    document.getElementById('btnCloseLegal')?.addEventListener('click', () => {
      document.getElementById('modalLegal')?.classList.add('hidden');
    });
    document.getElementById('btnClosePreStage')?.addEventListener('click', () => {
      document.getElementById('modalPreStage')?.classList.add('hidden');
    });

    // In-game HUD
    document.getElementById('hudPauseBtn')?.addEventListener('click', () => this.togglePause());
    document.getElementById('hudMuteBtn')?.addEventListener('click', () => {
      const nowMuted = !this.sound.getMuted();
      this.sound.setMuted(nowMuted);
      this.saveData.settings.muted = nowMuted;
      this.saveProvider.save(this.saveData);
      const btn = document.getElementById('hudMuteBtn');
      if (btn) btn.innerText = nowMuted ? '🔇' : '🔊';
    });

    // Pause Modal
    document.getElementById('btnResume')?.addEventListener('click', () => this.togglePause());
    document.getElementById('btnRestartAttempt')?.addEventListener('click', () => {
      document.getElementById('modalPause')?.classList.add('hidden');
      this.restartAttempt();
    });
    document.getElementById('btnQuitToMap')?.addEventListener('click', () => {
      this.sound.stopMusic();
      this.showScreen('screenMap');
    });

    // Victory Modal
    document.getElementById('btnNextStage')?.addEventListener('click', () => {
      document.getElementById('modalStageClear')?.classList.add('hidden');
      if (this.currentMode === 'endless') {
        this.endlessWave++;
        this.launchStage(1, { mode: 'endless' });
      } else {
        const nextId = Math.min(30, this.currentStageId + 1);
        this.currentAttempt = 1;
        this.launchStage(nextId);
      }
    });
    document.getElementById('btnClearToMap')?.addEventListener('click', () => {
      this.showScreen('screenMap');
    });
    document.getElementById('btnAdDoubleShards')?.addEventListener('click', async () => {
      const watched = await this.adProvider.showRewarded('double_shards');
      if (watched) {
        const bonus = 65; // Extra bonus shards
        this.saveData.currency.shards += bonus;
        await this.saveProvider.save(this.saveData);
        this.refreshSidebars();
        document.getElementById('adDoubleShardsCard')?.classList.add('hidden');
        alert(`Rewarded! Double shards granted (+${bonus} ⬡).`);
      }
    });

    // Failed Modal
    document.getElementById('btnRetryAttempt')?.addEventListener('click', () => {
      document.getElementById('modalFailed')?.classList.add('hidden');
      this.restartAttempt();
    });
    document.getElementById('btnFailToMap')?.addEventListener('click', () => {
      this.showScreen('screenMap');
    });
    document.getElementById('btnAdRevive')?.addEventListener('click', async () => {
      const watched = await this.adProvider.showRewarded('revive_ball');
      if (watched && this.sim) {
        document.getElementById('modalFailed')?.classList.add('hidden');
        this.sim.reviveAttempt();
        this.sound.startMusic(this.sim.stage.worldId);
      }
    });

    // Daily Challenge
    document.getElementById('btnDaily')?.addEventListener('click', () => {
      const today = new Date().toISOString().slice(0, 10);
      const challenge = generateDailyChallenge(today);
      const title = document.getElementById('dailyModName');
      const desc = document.getElementById('dailyModDesc');
      if (title) title.innerText = `MODIFIER: ${challenge.modifierName.toUpperCase()}`;
      if (desc) desc.innerText = challenge.modifierDesc;
      this.showScreen('screenDaily');
    });
    document.getElementById('btnStartDaily')?.addEventListener('click', () => {
      this.currentAttempt = 1;
      this.launchStage(1, { mode: 'daily' });
    });

    // Endless Mode
    document.getElementById('btnEndless')?.addEventListener('click', () => {
      this.endlessWave = 1;
      this.currentAttempt = 1;
      this.launchStage(1, { mode: 'endless' });
    });

    // Consent Banner
    document.getElementById('btnConsentAccept')?.addEventListener('click', async () => {
      this.saveData.consent.answered = true;
      this.saveData.consent.analytics = true;
      this.saveData.consent.personalizedAds = true;
      this.analytics.setConsent(true);
      await this.saveProvider.save(this.saveData);
      document.getElementById('consentBanner')?.classList.add('hidden');
    });
    document.getElementById('btnConsentEssential')?.addEventListener('click', async () => {
      this.saveData.consent.answered = true;
      this.saveData.consent.analytics = false;
      this.saveData.consent.personalizedAds = false;
      this.analytics.setConsent(false);
      await this.saveProvider.save(this.saveData);
      document.getElementById('consentBanner')?.classList.add('hidden');
    });

    // Settings Controls
    const setMute = document.getElementById('settingMute') as HTMLInputElement;
    if (setMute) {
      setMute.checked = this.saveData.settings.muted;
      setMute.onchange = () => {
        this.sound.setMuted(setMute.checked);
        this.saveData.settings.muted = setMute.checked;
        this.saveProvider.save(this.saveData);
      };
    }
    const setShake = document.getElementById('settingShake') as HTMLInputElement;
    if (setShake) {
      setShake.value = this.saveData.settings.screenShake.toString();
      setShake.oninput = () => {
        const val = parseFloat(setShake.value);
        this.renderer.settings.screenShakeScale = val;
        this.saveData.settings.screenShake = val;
        this.saveProvider.save(this.saveData);
      };
    }
    const setColorblind = document.getElementById('settingColorblind') as HTMLSelectElement;
    if (setColorblind) {
      setColorblind.value = this.saveData.settings.colorblindMode;
      setColorblind.onchange = () => {
        this.renderer.settings.colorblindMode = setColorblind.value as any;
        this.saveData.settings.colorblindMode = setColorblind.value;
        this.saveProvider.save(this.saveData);
        if (this.sim) {
          this.renderer.bakeStaticBricks(this.sim.bricks, Math.min(5, Math.floor((this.currentStageId - 1) / 5)));
        }
      };
    }

    // Export & Reset Data
    document.getElementById('btnExportSave')?.addEventListener('click', () => {
      const str = JSON.stringify(this.saveData, null, 2);
      navigator.clipboard?.writeText(str);
      alert('Save data copied to clipboard!');
    });
    document.getElementById('btnDeleteData')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
        localStorage.clear();
        window.location.reload();
      }
    });
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const manager = new GameManager();
  manager.init().catch((e) => console.error('Initialization error:', e));
});

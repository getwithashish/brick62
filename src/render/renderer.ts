import { GameSimulation } from '../core/sim';
import { Brick, Ball, Paddle, PowerUpEntity, BossHazard } from '../core/types';
import { ParticleSystem } from './particles';
import { GAME_BALANCE } from '../config/balance';

export interface RenderSettings {
  screenShakeScale: number; // 0 to 1
  reduceMotion: boolean;
  reduceFlash: boolean;
  colorblindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'high_contrast';
  paddleSkin: string;
  ballSkin: string;
}

export class GameRenderer {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public offscreenCanvas: HTMLCanvasElement;
  public offscreenCtx: CanvasRenderingContext2D;

  public particleSystem: ParticleSystem;
  public settings: RenderSettings;

  public arenaWidth: number = GAME_BALANCE.arena.width;
  public arenaHeight: number = GAME_BALANCE.arena.height;

  // Viewport scale and offset
  public scale: number = 1.0;
  public offsetX: number = 0;
  public offsetY: number = 0;
  public dpr: number = 1.0;

  // Screen shake state
  private shakeIntensity: number = 0;
  private shakeDuration: number = 0;
  private shakeTimer: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.arenaWidth;
    this.offscreenCanvas.height = this.arenaHeight;
    const offCtx = this.offscreenCanvas.getContext('2d', { alpha: true });
    if (!offCtx) throw new Error('Could not get offscreen 2D context');
    this.offscreenCtx = offCtx;

    this.particleSystem = new ParticleSystem();

    this.settings = {
      screenShakeScale: 1.0,
      reduceMotion: false,
      reduceFlash: false,
      colorblindMode: 'none',
      paddleSkin: 'paddle_classic',
      ballSkin: 'ball_classic',
    };

    // Load persisted settings
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      const shake = localStorage.getItem('brick62_screen_shake');
      if (shake !== null) this.settings.screenShakeScale = parseFloat(shake);
      const motion = localStorage.getItem('brick62_reduce_motion');
      if (motion !== null) this.settings.reduceMotion = motion === 'true';
      const flash = localStorage.getItem('brick62_reduce_flash');
      if (flash !== null) this.settings.reduceFlash = flash === 'true';
      const cb = localStorage.getItem('brick62_colorblind');
      if (cb) this.settings.colorblindMode = cb as any;
      const paddle = localStorage.getItem('brick62_paddle_skin');
      if (paddle) this.settings.paddleSkin = paddle;
      const ball = localStorage.getItem('brick62_ball_skin');
      if (ball) this.settings.ballSkin = ball;
    } catch (e) {}
  }

  public saveSettings(): void {
    try {
      localStorage.setItem('brick62_screen_shake', this.settings.screenShakeScale.toString());
      localStorage.setItem('brick62_reduce_motion', this.settings.reduceMotion ? 'true' : 'false');
      localStorage.setItem('brick62_reduce_flash', this.settings.reduceFlash ? 'true' : 'false');
      localStorage.setItem('brick62_colorblind', this.settings.colorblindMode);
      localStorage.setItem('brick62_paddle_skin', this.settings.paddleSkin);
      localStorage.setItem('brick62_ball_skin', this.settings.ballSkin);
    } catch (e) {}
  }

  public resize(containerWidth: number, containerHeight: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5); // Cap at 2.5x to preserve GPU performance

    // Maintain 480x720 aspect ratio inside container
    const aspect = this.arenaWidth / this.arenaHeight;
    let targetW = containerWidth;
    let targetH = containerWidth / aspect;

    if (targetH > containerHeight) {
      targetH = containerHeight;
      targetW = containerHeight * aspect;
    }

    this.canvas.width = Math.round(targetW * this.dpr);
    this.canvas.height = Math.round(targetH * this.dpr);

    this.scale = (targetW / this.arenaWidth) * this.dpr;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  public triggerShake(intensity: number, duration: number): void {
    if (this.settings.reduceMotion || this.settings.screenShakeScale <= 0) return;
    this.shakeIntensity = intensity * this.settings.screenShakeScale;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  /**
   * Rebuilds the entire offscreen cached brick canvas
   */
  public bakeStaticBricks(bricks: Brick[], worldIndex: number): void {
    const ctx = this.offscreenCtx;
    ctx.clearRect(0, 0, this.arenaWidth, this.arenaHeight);

    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      if (!b.active) continue;
      this.drawSingleBrick(ctx, b);
    }
  }

  /**
   * Fast incremental update: clear broken brick from cached offscreen canvas
   */
  public updateBrokenBrick(brick: Brick): void {
    const ctx = this.offscreenCtx;
    ctx.clearRect(brick.x - 1, brick.y - 1, brick.width + 2, brick.height + 2);
    if (brick.active) {
      this.drawSingleBrick(ctx, brick);
    }
  }

  private drawSingleBrick(ctx: CanvasRenderingContext2D, b: Brick): void {
    let color = this.adjustColor(b.color);

    if (b.frozen) {
      color = '#e0f7fa';
    }

    ctx.fillStyle = color;
    ctx.fillRect(b.x, b.y, b.width, b.height);

    // Subtle 3D highlight bevel
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(b.x, b.y, b.width, 1);
    ctx.fillRect(b.x, b.y, 1, b.height);

    // Shadow bevel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(b.x, b.y + b.height - 1, b.width, 1);
    ctx.fillRect(b.x + b.width - 1, b.y, 1, b.height);

    // Special icons/markings on special bricks
    if (b.type === 'explosive') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(b.x + b.width / 2 - 1, b.y + b.height / 2 - 1, 2, 2);
    } else if (b.type === 'freeze') {
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(b.x + b.width / 2 - 1, b.y + 1, 2, b.height - 2);
    } else if (b.hp > 1) {
      // Tough brick armor stripes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillRect(b.x + 2, b.y + b.height / 2 - 0.5, b.width - 4, 1);
    }
  }

  private adjustColor(hex: string): string {
    const mode = this.settings.colorblindMode;
    if (mode === 'none') return hex;

    // High contrast mode
    if (mode === 'high_contrast') {
      return hex === '#ffffff' ? '#ffffff' : '#00e5ff';
    }
    // Protanopia / Deuteranopia safe shifts
    if (mode === 'protanopia' && hex === '#ff3838') return '#f39c12';
    if (mode === 'deuteranopia' && hex === '#2ed573') return '#00d2d3';
    return hex;
  }

  /**
   * Main render frame
   */
  public render(sim: GameSimulation, dt: number): void {
    const ctx = this.ctx;

    // Update screen shake
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const progress = this.shakeTimer / this.shakeDuration;
      const curIntensity = this.shakeIntensity * progress;
      shakeX = (Math.random() - 0.5) * curIntensity * 2;
      shakeY = (Math.random() - 0.5) * curIntensity * 2;
    }

    ctx.save();
    // Scale coordinate system to virtual arena
    ctx.scale(this.scale, this.scale);
    ctx.translate(shakeX, shakeY);

    // Draw deep cosmic backdrop gradient
    const worldIndex = Math.min(5, Math.max(0, sim.stage.worldId - 1));
    const world = GAME_BALANCE.worlds[worldIndex];
    const bgGrad = ctx.createLinearGradient(0, 0, 0, this.arenaHeight);
    bgGrad.addColorStop(0, world.bgGradient[0]);
    bgGrad.addColorStop(1, world.bgGradient[1]);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.arenaWidth, this.arenaHeight);

    // Draw subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x < this.arenaWidth; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.arenaHeight);
      ctx.stroke();
    }

    // Blit cached static bricks in ONE single call!
    ctx.drawImage(this.offscreenCanvas, 0, 0);

    // Draw Gravity Wells (World 4)
    for (const well of sim.gravityWells) {
      ctx.save();
      const grad = ctx.createRadialGradient(well.x, well.y, 4, well.x, well.y, well.radius * 2);
      grad.addColorStop(0, 'rgba(165, 94, 234, 0.8)');
      grad.addColorStop(0.5, 'rgba(112, 111, 211, 0.3)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(well.x, well.y, well.radius * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw Lasers
    this.renderLasers(ctx, sim.lasers);

    // Draw Boss
    if (sim.boss && sim.boss.active) {
      this.renderBoss(ctx, sim.boss);
    }

    // Draw Boss Hazards
    this.renderHazards(ctx, sim.hazards);

    // Draw Power-Up Drops
    this.renderPowerUps(ctx, sim.powerUps);

    // Draw Paddle & Shield
    this.renderPaddle(ctx, sim.paddle, sim.stage.worldId);

    // Draw Balls & Trails
    this.renderBalls(ctx, sim.balls);

    // Update and draw particle effects & combat text
    this.particleSystem.update(dt);
    this.particleSystem.render(ctx);

    ctx.restore();
  }

  private renderPaddle(ctx: CanvasRenderingContext2D, p: Paddle, worldId: number): void {
    const skinColor = this.getPaddleSkinColor();

    ctx.save();
    // Paddle glow
    ctx.shadowColor = skinColor;
    ctx.shadowBlur = 12;

    // Paddle body gradient
    const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.height);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, skinColor);
    grad.addColorStop(1, '#0f2027');

    ctx.fillStyle = grad;
    // Rounded paddle pill
    this.roundRect(ctx, p.x, p.y, p.width, p.height, 6);
    ctx.fill();

    // Core neon stripe
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x + p.width * 0.25, p.y + 2, p.width * 0.5, 2);

    // Laser cannons indicator
    if (p.laserTimer > 0) {
      ctx.fillStyle = '#ff0055';
      ctx.fillRect(p.x + 4, p.y - 4, 6, 4);
      ctx.fillRect(p.x + p.width - 10, p.y - 4, 6, 4);
    }

    // Sticky indicator
    if (p.stickyTimer > 0) {
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 2, p.y - 2, p.width + 4, p.height + 4);
    }

    // Shield floor barrier if active
    if (p.shieldCharges > 0) {
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = `rgba(0, 242, 254, ${0.5 + Math.sin(Date.now() * 0.008) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, this.arenaHeight - 4);
      ctx.lineTo(this.arenaWidth, this.arenaHeight - 4);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderBalls(ctx: CanvasRenderingContext2D, balls: Ball[]): void {
    const skinColor = this.getBallSkinColor();

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];

      // Draw glowing motion trail
      if (b.trail.length > 1) {
        ctx.save();
        for (let j = 0; j < b.trail.length - 1; j++) {
          const pt1 = b.trail[j];
          const pt2 = b.trail[j + 1];
          const alpha = (j / b.trail.length) * 0.45;
          ctx.strokeStyle = b.isFireball ? `rgba(255, 69, 0, ${alpha})` : `rgba(0, 242, 254, ${alpha})`;
          ctx.lineWidth = (j / b.trail.length) * (b.radius * 1.5);
          ctx.beginPath();
          ctx.moveTo(pt1.x, pt1.y);
          ctx.lineTo(pt2.x, pt2.y);
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.save();
      const ballColor = b.isFireball ? '#ff4500' : (b.isBomb ? '#ff0055' : skinColor);
      ctx.shadowColor = ballColor;
      ctx.shadowBlur = b.isFireball ? 20 : 12;

      ctx.fillStyle = ballColor;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();

      // Bright inner core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x - b.radius * 0.25, b.y - b.radius * 0.25, b.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private renderPowerUps(ctx: CanvasRenderingContext2D, powerUps: PowerUpEntity[]): void {
    for (let i = 0; i < powerUps.length; i++) {
      const p = powerUps[i];
      if (!p.active) continue;

      ctx.save();
      const color = this.getPowerUpColor(p.type);
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;

      // Capsule shape
      ctx.fillStyle = '#111827';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      this.roundRect(ctx, p.x, p.y, p.width, p.height, 6);
      ctx.fill();
      ctx.stroke();

      // Power-up icon / text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.getPowerUpSymbol(p.type), p.x + p.width / 2, p.y + p.height / 2);

      ctx.restore();
    }
  }

  private renderLasers(ctx: CanvasRenderingContext2D, lasers: any[]): void {
    ctx.save();
    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 10;
    for (let i = 0; i < lasers.length; i++) {
      const l = lasers[i];
      if (!l.active) continue;
      ctx.fillRect(l.x, l.y, l.width, l.height);
    }
    ctx.restore();
  }

  private renderBoss(ctx: CanvasRenderingContext2D, boss: any): void {
    ctx.save();
    // Boss body
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#1e112a';
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 2;
    this.roundRect(ctx, boss.x - boss.width / 2, boss.y - boss.height / 2, boss.width, boss.height, 8);
    ctx.fill();
    ctx.stroke();

    // Rotating shield arc
    if (boss.hasShield) {
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.75)';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, boss.shieldRadius, boss.shieldAngle, boss.shieldAngle + Math.PI * 0.7);
      ctx.stroke();
    }

    // Boss Health Bar at top
    const barW = 280;
    const barH = 10;
    const barX = (this.arenaWidth - barW) / 2;
    const barY = 32;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX, barY, barW, barH);

    const hpRatio = Math.max(0, boss.hp / boss.maxHp);
    const hpGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    hpGrad.addColorStop(0, '#ff0055');
    hpGrad.addColorStop(1, '#ff9900');
    ctx.fillStyle = hpGrad;
    ctx.fillRect(barX, barY, barW * hpRatio, barH);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${boss.name} - ${Math.round(hpRatio * 100)}%`, this.arenaWidth / 2, barY - 6);

    ctx.restore();
  }

  private renderHazards(ctx: CanvasRenderingContext2D, hazards: BossHazard[]): void {
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (!h.active) continue;
      ctx.save();
      ctx.fillStyle = h.color;
      ctx.shadowColor = h.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private getPaddleSkinColor(): string {
    switch (this.settings.paddleSkin) {
      case 'paddle_cyberpunk': return '#ff007f';
      case 'paddle_cybergold': return '#ffd700';
      case 'paddle_glitch': return '#00ff88';
      default: return '#00f2fe';
    }
  }

  private getBallSkinColor(): string {
    switch (this.settings.ballSkin) {
      case 'ball_plasma': return '#bb00ff';
      case 'ball_rainbow': return '#00ffff';
      case 'ball_fire': return '#ff6600';
      default: return '#ffffff';
    }
  }

  private getPowerUpColor(type: string): string {
    switch (type) {
      case 'multi_ball': return '#00f2fe';
      case 'wide_paddle': return '#2ed573';
      case 'laser_paddle': return '#ff4757';
      case 'fireball': return '#ff6348';
      case 'bomb_ball': return '#e84118';
      case 'slow_mo': return '#9c88ff';
      case 'shield': return '#00d2d3';
      case 'sticky_paddle': return '#fbc531';
      case 'shrink_paddle': return '#ff3838';
      case 'speed_up': return '#ffa801';
      default: return '#ffffff';
    }
  }

  private getPowerUpSymbol(type: string): string {
    switch (type) {
      case 'multi_ball': return '+3';
      case 'wide_paddle': return '↔';
      case 'laser_paddle': return '▲';
      case 'fireball': return '🔥';
      case 'bomb_ball': return '💣';
      case 'slow_mo': return '⌛';
      case 'shield': return '🛡️';
      case 'sticky_paddle': return '🧲';
      case 'shrink_paddle': return '><';
      case 'speed_up': return '⚡';
      default: return '?';
    }
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

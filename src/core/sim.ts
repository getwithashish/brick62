import {
  Ball,
  Paddle,
  Brick,
  PowerUpEntity,
  LaserBolt,
  BossHazard,
  BossState,
  GameEvent,
  InputFrame,
  PowerUpType,
  StageDefinition,
  StageEndStats,
  GravityWell,
} from './types.js';
import { SpatialGrid } from './spatial_grid.js';
import { PRNG } from './rng.js';
import { GAME_BALANCE } from '../config/balance.js';

export interface SimOptions {
  seed?: number;
  attemptNumber?: number;
  permanentUpgrades?: {
    paddle_width?: number; // Level 0-5
    combo_grace?: number;
    extra_ball?: number;
    drop_luck?: number;
    starting_shield?: number;
    magnet_radius?: number;
  };
  modifier?: string;
}

export class GameSimulation {
  public stage: StageDefinition;
  public prng: PRNG;
  public options: SimOptions;

  public tick: number = 0;
  public elapsedTime: number = 0;
  public isRunning: boolean = true;
  public isCleared: boolean = false;
  public isFailed: boolean = false;

  public score: number = 0;
  public combo: number = 0;
  public maxCombo: number = 0;
  public comboTimer: number = 0;
  public comboGraceWindow: number;

  public paddle: Paddle;
  public balls: Ball[] = [];
  public bricks: Brick[] = [];
  public powerUps: PowerUpEntity[] = [];
  public lasers: LaserBolt[] = [];
  public hazards: BossHazard[] = [];
  public boss?: BossState;
  public gravityWells: GravityWell[] = [];

  public spatialGrid: SpatialGrid;
  public activeBricksCount: number = 0;
  public initialBricksCount: number = 0;
  public ballsLostCount: number = 0;
  public nextEntityId: number = 10000;

  public timeSinceLastBrickHit: number = 0;
  public hitStopTicks: number = 0;
  public timeScale: number = 1.0;

  // Adaptive assistance tracking
  public assistancePaddleExtra: number = 0;
  public assistanceDropExtra: number = 0;

  // Cached scratch set for spatial grid queries to avoid GC pressure
  private querySet: Set<Brick> = new Set();

  constructor(stage: StageDefinition, options: SimOptions = {}) {
    this.stage = stage;
    this.options = options;
    this.prng = new PRNG(options.seed !== undefined ? options.seed : stage.id * 31337);

    const upgrades = options.permanentUpgrades || {};
    const paddleWidthLvl = upgrades.paddle_width || 0;
    const comboGraceLvl = upgrades.combo_grace || 0;
    const startingShieldLvl = upgrades.starting_shield || 0;

    // Invisible adaptive assistance
    const attempts = options.attemptNumber || 1;
    if (attempts >= GAME_BALANCE.adaptiveAssistance.thresholdAttempts) {
      this.assistancePaddleExtra =
        GAME_BALANCE.paddle.baseWidth * GAME_BALANCE.adaptiveAssistance.extraPaddleWidthPct;
      this.assistanceDropExtra = GAME_BALANCE.adaptiveAssistance.extraDropRateBonus;
    }

    const baseWidth =
      GAME_BALANCE.paddle.baseWidth + paddleWidthLvl * 6 + this.assistancePaddleExtra;

    this.comboGraceWindow = GAME_BALANCE.combo.baseGraceSeconds + comboGraceLvl * 0.4;

    this.paddle = {
      x: GAME_BALANCE.arena.width / 2 - baseWidth / 2,
      y: GAME_BALANCE.paddle.y,
      width: baseWidth,
      height: GAME_BALANCE.paddle.height,
      targetX: GAME_BALANCE.arena.width / 2,
      vx: 0,
      shieldCharges: startingShieldLvl,
      wideTimer: 0,
      shrinkTimer: 0,
      laserTimer: 0,
      laserCooldown: 0,
      stickyTimer: 0,
      hasStickyBall: true,
    };

    // Deep clone stage bricks
    this.bricks = stage.bricks.map((b) => ({ ...b }));
    this.activeBricksCount = this.bricks.filter((b) => b.active && b.type !== 'decoy').length;
    this.initialBricksCount = this.activeBricksCount;

    this.spatialGrid = new SpatialGrid(GAME_BALANCE.arena.width, GAME_BALANCE.arena.height, 24);
    this.spatialGrid.build(this.bricks);

    if (stage.boss) {
      this.boss = { ...stage.boss };
    }
    if (stage.specialRules?.gravityWells) {
      this.gravityWells = [...stage.specialRules.gravityWells];
    }

    // Launch initial ball stuck to paddle center
    this.spawnBall(true, 0);

    // Twin launch upgrade check
    const extraBallLvl = upgrades.extra_ball || 0;
    if (extraBallLvl > 0 && this.prng.chance(extraBallLvl * 0.25)) {
      this.spawnBall(true, 0.4);
    }

    // Modifier check
    if (options.modifier === 'Firestorm') {
      this.paddle.width *= 0.75;
      for (const b of this.balls) b.isFireball = true;
    } else if (options.modifier === 'Multi-Glitch') {
      this.spawnBall(true, -0.4);
      this.spawnBall(true, 0.4);
    } else if (options.modifier === 'Glass Cannon') {
      this.paddle.laserTimer = 9999;
      this.paddle.shieldCharges = 0;
    }
  }

  public spawnBall(stuck: boolean = false, offsetRatio: number = 0): Ball {
    if (this.balls.length >= GAME_BALANCE.ball.maxBallsOnScreen) return this.balls[0];

    const angle = -Math.PI / 2 + (this.prng.next() - 0.5) * 0.6;
    const speed = GAME_BALANCE.ball.initialSpeed;

    const ball: Ball = {
      id: this.nextEntityId++,
      x: this.paddle.x + this.paddle.width / 2 + offsetRatio * (this.paddle.width * 0.4),
      y: this.paddle.y - GAME_BALANCE.ball.radius - 1,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: GAME_BALANCE.ball.radius,
      speed,
      isFireball: this.options.modifier === 'Firestorm',
      isBomb: false,
      isStuck: stuck,
      stuckOffsetRatio: offsetRatio,
      trail: [],
    };

    this.balls.push(ball);
    return ball;
  }

  /**
   * Main deterministic simulation tick
   */
  public step(input: InputFrame): GameEvent[] {
    const events: GameEvent[] = [];
    if (!this.isRunning) return events;

    this.tick++;
    const dt = GAME_BALANCE.physics.dt * this.timeScale;
    this.elapsedTime += dt;

    // Handle hit-stop (screen freeze on massive impacts)
    if (this.hitStopTicks > 0) {
      this.hitStopTicks--;
      return events;
    }

    // Update paddle movement
    this.updatePaddle(input, dt, events);

    // Update combo grace timer
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        events.push({ type: 'combo_ended', finalCombo: this.combo });
        this.combo = 0;
      }
    }

    // Laser firing logic
    if (this.paddle.laserTimer > 0) {
      this.paddle.laserTimer -= dt;
      this.paddle.laserCooldown -= dt;
      if (this.paddle.laserCooldown <= 0) {
        this.paddle.laserCooldown = GAME_BALANCE.paddle.laserCooldown;
        this.fireLaser(events);
      }
    }

    // Sub-stepping for physics accuracy & continuous collision detection
    const subSteps = GAME_BALANCE.physics.subSteps;
    const subDt = dt / subSteps;

    for (let step = 0; step < subSteps; step++) {
      this.stepPhysics(subDt, events);
    }

    // Update power-up entities
    this.updatePowerUps(dt, events);

    // Update lasers
    this.updateLasers(dt, events);

    // Update boss & hazards
    if (this.boss && this.boss.active) {
      this.updateBoss(dt, events);
    }
    this.updateHazards(dt, events);

    // Anti-stall watchdog: if balls in play but no brick hit for antiStallSeconds
    const hasUnstuckBalls = this.balls.some((b) => !b.isStuck);
    if (hasUnstuckBalls) {
      this.timeSinceLastBrickHit += dt;
      if (this.timeSinceLastBrickHit >= GAME_BALANCE.physics.antiStallSeconds) {
        this.timeSinceLastBrickHit = 0;
        this.triggerAntiStall(events);
      }
    }

    // Check win/loss state
    this.checkCompletion(events);

    return events;
  }

  private updatePaddle(input: InputFrame, dt: number, events: GameEvent[]): void {
    // Eased paddle tracking towards input targetX
    const targetX = Math.max(
      0,
      Math.min(GAME_BALANCE.arena.width - this.paddle.width, input.targetX - this.paddle.width / 2)
    );

    const prevX = this.paddle.x;
    // Fast responsiveness with smooth lerp
    this.paddle.x += (targetX - this.paddle.x) * Math.min(1.0, 24.0 * dt);
    this.paddle.vx = (this.paddle.x - prevX) / dt;

    // Handle Power-up timers on paddle
    if (this.paddle.wideTimer > 0) {
      this.paddle.wideTimer -= dt;
      if (this.paddle.wideTimer <= 0) {
        this.recalculatePaddleWidth();
      }
    }
    if (this.paddle.shrinkTimer > 0) {
      this.paddle.shrinkTimer -= dt;
      if (this.paddle.shrinkTimer <= 0) {
        this.recalculatePaddleWidth();
      }
    }
    if (this.paddle.stickyTimer > 0) {
      this.paddle.stickyTimer -= dt;
    }

    // Launch stuck balls on input
    if (input.launch) {
      for (const ball of this.balls) {
        if (ball.isStuck) {
          ball.isStuck = false;
          // Launch upward with slight angle based on offset
          const angle = -Math.PI / 2 + ball.stuckOffsetRatio * 0.4;
          ball.vx = Math.cos(angle) * ball.speed;
          ball.vy = Math.sin(angle) * ball.speed;
          events.push({ type: 'sound', soundId: 'ball_launch' });
        }
      }
      this.paddle.hasStickyBall = false;
    }
  }

  private recalculatePaddleWidth(): void {
    const upgrades = this.options.permanentUpgrades || {};
    const paddleWidthLvl = upgrades.paddle_width || 0;
    let w = GAME_BALANCE.paddle.baseWidth + paddleWidthLvl * 6 + this.assistancePaddleExtra;

    if (this.paddle.wideTimer > 0) {
      w *= GAME_BALANCE.powerups.widePaddleMultiplier;
    } else if (this.paddle.shrinkTimer > 0) {
      w *= GAME_BALANCE.powerups.shrinkPaddleMultiplier;
    }
    this.paddle.width = w;
  }

  private fireLaser(events: GameEvent[]): void {
    const x1 = this.paddle.x + 8;
    const x2 = this.paddle.x + this.paddle.width - 8;
    const y = this.paddle.y - 10;

    this.lasers.push({
      id: this.nextEntityId++,
      x: x1,
      y,
      vy: -GAME_BALANCE.paddle.laserSpeed,
      width: GAME_BALANCE.paddle.laserWidth,
      height: GAME_BALANCE.paddle.laserHeight,
      active: true,
    });
    this.lasers.push({
      id: this.nextEntityId++,
      x: x2,
      y,
      vy: -GAME_BALANCE.paddle.laserSpeed,
      width: GAME_BALANCE.paddle.laserWidth,
      height: GAME_BALANCE.paddle.laserHeight,
      active: true,
    });

    events.push({ type: 'laser_fired', x1, x2, y });
    events.push({ type: 'sound', soundId: 'laser_fire' });
  }

  private stepPhysics(dt: number, events: GameEvent[]): void {
    const arenaW = GAME_BALANCE.arena.width;
    const arenaH = GAME_BALANCE.arena.height;

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];

      if (ball.isStuck) {
        // Position fixed relative to paddle
        ball.x = this.paddle.x + this.paddle.width / 2 + ball.stuckOffsetRatio * (this.paddle.width * 0.4);
        ball.y = this.paddle.y - ball.radius - 1;
        continue;
      }

      // Gravitational pull from gravity wells (World 4 / Special)
      for (const well of this.gravityWells) {
        const dx = well.x - ball.x;
        const dy = well.y - ball.y;
        const d2 = dx * dx + dy * dy;
        const dist = Math.sqrt(d2);
        if (dist > 10 && dist < 220) {
          const force = (well.mass / (d2 + 100)) * dt * 15;
          ball.vx += (dx / dist) * force;
          ball.vy += (dy / dist) * force;
        }
      }

      // Record trail
      if (this.tick % 2 === 0) {
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 8) ball.trail.shift();
      }

      // Ball speed slowly ramps
      const speedRamp = GAME_BALANCE.ball.speedRampPerSecond * dt;
      ball.speed = Math.min(GAME_BALANCE.ball.maxSpeed, ball.speed + speedRamp);
      const curSpeed = Math.hypot(ball.vx, ball.vy);
      if (curSpeed > 0.001) {
        ball.vx = (ball.vx / curSpeed) * ball.speed;
        ball.vy = (ball.vy / curSpeed) * ball.speed;
      }

      // Sub-step movement
      const nextX = ball.x + ball.vx * dt;
      const nextY = ball.y + ball.vy * dt;

      // Arena boundary collision
      // Left wall
      if (nextX - ball.radius < 0) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx);
        events.push({ type: 'sound', soundId: 'wall_bounce' });
      } else if (nextX + ball.radius > arenaW) {
        // Right wall
        ball.x = arenaW - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        events.push({ type: 'sound', soundId: 'wall_bounce' });
      } else {
        ball.x = nextX;
      }

      // Ceiling collision
      if (nextY - ball.radius < 0) {
        ball.y = ball.radius;
        ball.vy = Math.abs(ball.vy);
        events.push({ type: 'sound', soundId: 'wall_bounce' });
      } else {
        ball.y = nextY;
      }

      // Floor collision (Missed ball or Shield save)
      if (ball.y + ball.radius >= arenaH) {
        if (this.paddle.shieldCharges > 0) {
          // Saved by shield floor!
          this.paddle.shieldCharges--;
          ball.y = arenaH - ball.radius - 2;
          ball.vy = -Math.abs(ball.vy);
          events.push({ type: 'shield_bounce', x: ball.x, y: ball.y });
          events.push({ type: 'sound', soundId: 'shield_save' });
          events.push({ type: 'screen_shake', intensity: 8, duration: 0.2 });
        } else {
          // Ball lost
          this.balls.splice(i, 1);
          this.ballsLostCount++;
          events.push({ type: 'ball_lost', remainingBalls: this.balls.length });
          events.push({ type: 'sound', soundId: 'ball_lost' });

          // Reset combo on ball loss
          if (this.combo > 0) {
            events.push({ type: 'combo_ended', finalCombo: this.combo });
            this.combo = 0;
          }

          // If no balls remain, stage will fail or trigger retry
          continue;
        }
      }

      // Paddle collision
      if (ball.vy > 0 && this.checkPaddleCollision(ball, events)) {
        continue;
      }

      // Boss shield / core collision
      if (this.boss && this.boss.active && this.checkBossCollision(ball, events)) {
        continue;
      }

      // Brick collisions using spatial grid (continuous swept AABB check)
      this.checkBrickCollision(ball, events);
    }
  }

  private checkPaddleCollision(ball: Ball, events: GameEvent[]): boolean {
    const p = this.paddle;
    // Check if ball intersects paddle top surface
    if (
      ball.y + ball.radius >= p.y &&
      ball.y - ball.radius <= p.y + p.height &&
      ball.x + ball.radius >= p.x &&
      ball.x - ball.radius <= p.x + p.width
    ) {
      // Reposition ball above paddle
      ball.y = p.y - ball.radius - 1;

      // Sticky paddle check
      if (p.stickyTimer > 0) {
        ball.isStuck = true;
        ball.stuckOffsetRatio = (ball.x - (p.x + p.width / 2)) / (p.width / 2);
        p.hasStickyBall = true;
        events.push({ type: 'sound', soundId: 'paddle_catch' });
        return true;
      }

      // Calculate bounce angle: center = straight up, edges = steep angle
      const relativeHit = (ball.x - (p.x + p.width / 2)) / (p.width / 2);
      const clampedHit = Math.max(-0.95, Math.min(0.95, relativeHit));
      const bounceAngle = clampedHit * GAME_BALANCE.paddle.maxBounceAngleRad;

      const isPerfect = Math.abs(clampedHit) < 0.12;

      // Add paddle velocity influence
      ball.vx = Math.sin(bounceAngle) * ball.speed + p.vx * 0.15;
      ball.vy = -Math.abs(Math.cos(bounceAngle) * ball.speed);

      // Re-normalize to maintained speed
      const curSpeed = Math.hypot(ball.vx, ball.vy);
      if (curSpeed > 0.001) {
        ball.vx = (ball.vx / curSpeed) * ball.speed;
        ball.vy = (ball.vy / curSpeed) * ball.speed;
      }

      if (isPerfect) {
        this.score += GAME_BALANCE.combo.perfectCatchBonus;
        events.push({ type: 'ball_paddle_hit', ball, perfect: true });
        events.push({ type: 'sound', soundId: 'perfect_catch' });
        events.push({ type: 'haptic', style: 'medium' });
      } else {
        events.push({ type: 'ball_paddle_hit', ball, perfect: false });
        events.push({ type: 'sound', soundId: 'paddle_hit' });
        events.push({ type: 'haptic', style: 'light' });
      }

      return true;
    }
    return false;
  }

  private checkBossCollision(ball: Ball, events: GameEvent[]): boolean {
    if (!this.boss || !this.boss.active) return false;
    const boss = this.boss;

    // Check boss rotating shield if enabled
    if (boss.hasShield) {
      const dx = ball.x - boss.x;
      const dy = ball.y - boss.y;
      const dist = Math.hypot(dx, dy);

      if (Math.abs(dist - boss.shieldRadius) < ball.radius + 12) {
        const ballAngle = Math.atan2(dy, dx);
        const shieldAngleDiff = Math.abs(((ballAngle - boss.shieldAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

        // Shield covers a 120 degree arc
        if (shieldAngleDiff < Math.PI / 3) {
          // Reflected off shield
          const normalX = dx / dist;
          const normalY = dy / dist;
          const dot = ball.vx * normalX + ball.vy * normalY;
          ball.vx -= 2 * dot * normalX;
          ball.vy -= 2 * dot * normalY;
          events.push({ type: 'sound', soundId: 'shield_bounce' });
          events.push({ type: 'screen_shake', intensity: 4, duration: 0.1 });
          return true;
        }
      }
    }

    // Direct boss body collision
    const bx1 = boss.x - boss.width / 2;
    const bx2 = boss.x + boss.width / 2;
    const by1 = boss.y - boss.height / 2;
    const by2 = boss.y + boss.height / 2;

    if (
      ball.x + ball.radius >= bx1 &&
      ball.x - ball.radius <= bx2 &&
      ball.y + ball.radius >= by1 &&
      ball.y - ball.radius <= by2
    ) {
      // Boss hit!
      boss.hp -= ball.isFireball ? 3 : 1;
      events.push({ type: 'boss_damage', hpLeft: Math.max(0, boss.hp), maxHp: boss.maxHp });
      events.push({ type: 'sound', soundId: 'boss_hit' });
      events.push({ type: 'screen_shake', intensity: 7, duration: 0.15 });

      // Reflect
      ball.vy = -ball.vy;

      if (boss.hp <= 0) {
        boss.active = false;
        this.score += 5000;
        events.push({ type: 'sound', soundId: 'boss_defeated' });
        events.push({ type: 'screen_shake', intensity: 20, duration: 0.8 });
        events.push({ type: 'hit_stop', frames: 6 });
        // Clear remaining bricks to complete stage
        for (const b of this.bricks) {
          if (b.active) {
            b.active = false;
            this.spatialGrid.remove(b);
          }
        }
        this.activeBricksCount = 0;
      }
      return true;
    }

    return false;
  }

  private checkBrickCollision(ball: Ball, events: GameEvent[]): void {
    // Spatial grid query around ball's current position + radius
    this.querySet.clear();
    this.spatialGrid.queryBox(
      ball.x - ball.radius - 2,
      ball.y - ball.radius - 2,
      ball.x + ball.radius + 2,
      ball.y + ball.radius + 2,
      this.querySet
    );

    if (this.querySet.size === 0) return;

    let hitBrick: Brick | null = null;
    let minOverLap = Infinity;
    let collisionNormalX = 0;
    let collisionNormalY = 0;

    for (const brick of this.querySet) {
      if (!brick.active) continue;

      // Decoy bricks just disappear with a puff
      if (brick.type === 'decoy') {
        brick.active = false;
        this.spatialGrid.remove(brick);
        events.push({ type: 'sound', soundId: 'glitch_zap' });
        continue;
      }

      // Check circle vs AABB overlap
      const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
      const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));
      const distX = ball.x - closestX;
      const distY = ball.y - closestY;
      const distSq = distX * distX + distY * distY;

      if (distSq < ball.radius * ball.radius) {
        hitBrick = brick;

        // Calculate penetration depths
        const overlapLeft = ball.x + ball.radius - brick.x;
        const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
        const overlapTop = ball.y + ball.radius - brick.y;
        const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);

        const minHoriz = Math.min(overlapLeft, overlapRight);
        const minVert = Math.min(overlapTop, overlapBottom);

        if (minHoriz < minVert) {
          collisionNormalX = overlapLeft < overlapRight ? -1 : 1;
          collisionNormalY = 0;
        } else {
          collisionNormalX = 0;
          collisionNormalY = overlapTop < overlapBottom ? -1 : 1;
        }
        break; // Collide with one brick per sub-step
      }
    }

    if (hitBrick) {
      this.timeSinceLastBrickHit = 0;

      // Handle ball reflection unless it's a fireball
      if (!ball.isFireball) {
        if (collisionNormalX !== 0) {
          ball.vx = -ball.vx;
          ball.x += collisionNormalX * 1;
        }
        if (collisionNormalY !== 0) {
          ball.vy = -ball.vy;
          ball.y += collisionNormalY * 1;
        }
      }

      // Damage or destroy brick
      this.damageBrick(hitBrick, ball, events);

      // Bomb ball explosion
      if (ball.isBomb) {
        this.triggerBombExplosion(hitBrick.x + hitBrick.width / 2, hitBrick.y + hitBrick.height / 2, events);
      }
    }
  }

  public damageBrick(brick: Brick, sourceBall: Ball | null, events: GameEvent[]): void {
    if (!brick.active) return;

    brick.hp--;
    events.push({
      type: 'brick_hit',
      brick,
      ball: sourceBall || this.balls[0],
      isDestroyed: brick.hp <= 0,
    });

    if (brick.hp <= 0) {
      brick.active = false;
      this.spatialGrid.remove(brick);
      this.activeBricksCount--;

      // Increment combo and score
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.comboTimer = this.comboGraceWindow;

      const comboMultiplier = Math.min(10, 1 + Math.floor(this.combo / 5));
      const points = brick.points * comboMultiplier;
      this.score += points;

      events.push({
        type: 'brick_destroyed',
        brick,
        points,
        combo: this.combo,
      });

      // Combo milestone pops
      if (GAME_BALANCE.combo.milestonePops.includes(this.combo)) {
        events.push({
          type: 'combo_milestone',
          combo: this.combo,
          x: brick.x + brick.width / 2,
          y: brick.y + brick.height / 2,
        });
        events.push({ type: 'sound', soundId: 'combo_milestone', pitchMultiplier: 1.0 + this.combo * 0.05 });
      }

      // Check special brick mechanics
      if (brick.type === 'explosive') {
        this.triggerExplosiveChain(brick.x + brick.width / 2, brick.y + brick.height / 2, events);
      } else if (brick.type === 'freeze') {
        this.triggerFreezeChain(brick.x + brick.width / 2, brick.y + brick.height / 2, events);
      }

      // Power-up drop check
      if (brick.dropsPowerUp) {
        this.spawnPowerUp(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.dropsPowerUp, events);
      }

      // Sound trigger with rising combo pitch
      const pitchRatio = Math.min(2.5, 1.0 + (this.combo % 12) * 0.08);
      events.push({
        type: 'sound',
        soundId: 'brick_hit',
        pitchMultiplier: pitchRatio,
        worldId: this.stage.worldId,
      });

      // Slow-mo cinematic on very last brick
      if (this.activeBricksCount === 1) {
        this.timeScale = 0.28;
      }
    } else {
      events.push({ type: 'sound', soundId: 'tough_brick_hit' });
    }
  }

  private triggerExplosiveChain(x: number, y: number, events: GameEvent[]): void {
    const radius = GAME_BALANCE.ball.bombRadius;
    events.push({ type: 'explosion', x, y, radius });
    events.push({ type: 'sound', soundId: 'explosion' });
    events.push({ type: 'screen_shake', intensity: 10, duration: 0.25 });
    events.push({ type: 'hit_stop', frames: 3 });

    this.querySet.clear();
    this.spatialGrid.queryBox(x - radius, y - radius, x + radius, y + radius, this.querySet);

    for (const b of this.querySet) {
      if (!b.active) continue;
      const bx = b.x + b.width / 2;
      const by = b.y + b.height / 2;
      if (Math.hypot(bx - x, by - y) <= radius) {
        this.damageBrick(b, null, events);
      }
    }
  }

  private triggerBombExplosion(x: number, y: number, events: GameEvent[]): void {
    this.triggerExplosiveChain(x, y, events);
  }

  private triggerFreezeChain(x: number, y: number, events: GameEvent[]): void {
    const radius = 60;
    this.querySet.clear();
    this.spatialGrid.queryBox(x - radius, y - radius, x + radius, y + radius, this.querySet);

    let count = 0;
    for (const b of this.querySet) {
      if (b.active && !b.frozen) {
        b.frozen = true;
        b.frozenTimer = 4.0;
        b.hp = 1; // Frozen bricks shatter in 1 hit!
        count++;
      }
    }

    events.push({ type: 'freeze_shatter', x, y, count });
    events.push({ type: 'sound', soundId: 'freeze' });
  }

  private spawnPowerUp(x: number, y: number, type: PowerUpType, events: GameEvent[]): void {
    const entity: PowerUpEntity = {
      id: this.nextEntityId++,
      type,
      x: x - GAME_BALANCE.powerups.width / 2,
      y,
      vy: GAME_BALANCE.powerups.fallSpeed,
      width: GAME_BALANCE.powerups.width,
      height: GAME_BALANCE.powerups.height,
      active: true,
    };
    this.powerUps.push(entity);
    events.push({ type: 'powerup_spawned', entity });
  }

  private updatePowerUps(dt: number, events: GameEvent[]): void {
    const p = this.paddle;
    const upgrades = this.options.permanentUpgrades || {};
    const magnetRadius = (upgrades.magnet_radius || 0) * 40;

    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const drop = this.powerUps[i];
      if (!drop.active) {
        this.powerUps.splice(i, 1);
        continue;
      }

      // Magnet attraction upgrade
      if (magnetRadius > 0) {
        const pCenterX = p.x + p.width / 2;
        const dist = Math.abs(drop.x - pCenterX);
        if (dist < magnetRadius && drop.y < p.y) {
          drop.x += Math.sign(pCenterX - drop.x) * 160 * dt;
        }
      }

      drop.y += drop.vy * dt;

      // Check paddle catch
      if (
        drop.y + drop.height >= p.y &&
        drop.y <= p.y + p.height &&
        drop.x + drop.width >= p.x &&
        drop.x <= p.x + p.width
      ) {
        drop.active = false;
        this.applyPowerUp(drop.type, events);
        events.push({
          type: 'powerup_collected',
          powerUpType: drop.type,
          x: drop.x + drop.width / 2,
          y: drop.y,
        });
        events.push({ type: 'sound', soundId: 'powerup_collect' });
        this.powerUps.splice(i, 1);
        continue;
      }

      // Bottom fall-off
      if (drop.y > GAME_BALANCE.arena.height) {
        drop.active = false;
        this.powerUps.splice(i, 1);
      }
    }
  }

  public applyPowerUp(type: PowerUpType, events: GameEvent[]): void {
    const d = GAME_BALANCE.powerups.durations;

    switch (type) {
      case 'multi_ball': {
        const curCount = this.balls.length;
        const toSpawn = Math.min(
          GAME_BALANCE.ball.maxBallsOnScreen - curCount,
          GAME_BALANCE.powerups.multiBallCount
        );
        for (let i = 0; i < toSpawn; i++) {
          const ball = this.spawnBall(false);
          ball.x = this.paddle.x + this.paddle.width / 2;
          ball.y = this.paddle.y - 12;
          const angle = -Math.PI / 2 + (this.prng.next() - 0.5) * 1.2;
          ball.vx = Math.cos(angle) * ball.speed;
          ball.vy = Math.sin(angle) * ball.speed;
        }
        break;
      }
      case 'wide_paddle': {
        this.paddle.wideTimer = d.widePaddle;
        this.paddle.shrinkTimer = 0;
        this.recalculatePaddleWidth();
        break;
      }
      case 'laser_paddle': {
        this.paddle.laserTimer = d.laserPaddle;
        this.paddle.laserCooldown = 0;
        break;
      }
      case 'sticky_paddle': {
        this.paddle.stickyTimer = d.stickyPaddle;
        break;
      }
      case 'fireball': {
        for (const b of this.balls) b.isFireball = true;
        break;
      }
      case 'bomb_ball': {
        for (const b of this.balls) b.isBomb = true;
        break;
      }
      case 'slow_mo': {
        this.timeScale = GAME_BALANCE.powerups.slowMoTimeScale;
        break;
      }
      case 'shield': {
        this.paddle.shieldCharges = Math.min(3, this.paddle.shieldCharges + 1);
        break;
      }
      case 'shrink_paddle': {
        this.paddle.shrinkTimer = d.shrinkPaddle;
        this.paddle.wideTimer = 0;
        this.recalculatePaddleWidth();
        break;
      }
      case 'speed_up': {
        for (const b of this.balls) {
          b.speed = Math.min(GAME_BALANCE.ball.maxSpeed, b.speed * GAME_BALANCE.powerups.speedUpMultiplier);
        }
        break;
      }
    }
  }

  private updateLasers(dt: number, events: GameEvent[]): void {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const laser = this.lasers[i];
      if (!laser.active) {
        this.lasers.splice(i, 1);
        continue;
      }

      laser.y += laser.vy * dt;

      // Laser vs Bricks
      this.querySet.clear();
      this.spatialGrid.queryBox(laser.x - 2, laser.y - 2, laser.x + laser.width + 2, laser.y + laser.height + 2, this.querySet);

      for (const brick of this.querySet) {
        if (!brick.active) continue;
        if (
          laser.x + laser.width >= brick.x &&
          laser.x <= brick.x + brick.width &&
          laser.y <= brick.y + brick.height &&
          laser.y + laser.height >= brick.y
        ) {
          laser.active = false;
          this.damageBrick(brick, null, events);
          break;
        }
      }

      if (laser.y < -20 || !laser.active) {
        this.lasers.splice(i, 1);
      }
    }
  }

  private updateBoss(dt: number, events: GameEvent[]): void {
    if (!this.boss || !this.boss.active) return;
    const boss = this.boss;

    // Boss horizontal oscillation
    boss.x += boss.vx * dt;
    if (boss.x - boss.width / 2 < 40) {
      boss.x = 40 + boss.width / 2;
      boss.vx = Math.abs(boss.vx);
    } else if (boss.x + boss.width / 2 > GAME_BALANCE.arena.width - 40) {
      boss.x = GAME_BALANCE.arena.width - 40 - boss.width / 2;
      boss.vx = -Math.abs(boss.vx);
    }

    // Shield rotation
    boss.shieldAngle += 1.8 * dt;

    // Boss attack patterns
    boss.attackTimer -= dt;
    if (boss.attackTimer <= 0) {
      boss.attackTimer = 3.5;
      this.spawnBossHazards(events);
    }
  }

  private spawnBossHazards(events: GameEvent[]): void {
    if (!this.boss || !this.boss.active) return;
    const boss = this.boss;

    // Drop energy hazard orbs that paddle must dodge
    const count = boss.phase >= 2 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * 45;
      this.hazards.push({
        id: this.nextEntityId++,
        x: boss.x + offset,
        y: boss.y + boss.height / 2,
        vx: (this.prng.next() - 0.5) * 60,
        vy: 140,
        radius: 7,
        active: true,
        color: '#ff0055',
      });
    }

    events.push({ type: 'sound', soundId: 'boss_hazard_spawn' });
  }

  private updateHazards(dt: number, events: GameEvent[]): void {
    const p = this.paddle;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (!h.active) {
        this.hazards.splice(i, 1);
        continue;
      }

      h.x += h.vx * dt;
      h.y += h.vy * dt;

      // Hazard vs Paddle
      if (
        h.y + h.radius >= p.y &&
        h.y - h.radius <= p.y + p.height &&
        h.x + h.radius >= p.x &&
        h.x - h.radius <= p.x + p.width
      ) {
        h.active = false;
        // Disrupts paddle: shrinks temporarily
        p.shrinkTimer = 3.5;
        this.recalculatePaddleWidth();
        events.push({ type: 'sound', soundId: 'hazard_hit' });
        events.push({ type: 'screen_shake', intensity: 8, duration: 0.2 });
        this.hazards.splice(i, 1);
        continue;
      }

      if (h.y > GAME_BALANCE.arena.height + 20) {
        this.hazards.splice(i, 1);
      }
    }
  }

  private triggerAntiStall(events: GameEvent[]): void {
    for (const ball of this.balls) {
      if (ball.isStuck) continue;
      // Slight vertical angle boost to break horizontal stalls
      if (Math.abs(ball.vy) < 60) {
        ball.vy = Math.sign(ball.vy || 1) * 160;
      }
      ball.vx += (this.prng.next() - 0.5) * 40;
    }
  }

  private checkCompletion(events: GameEvent[]): void {
    // Check Victory
    if (this.activeBricksCount <= 0 && (!this.boss || !this.boss.active)) {
      this.isCleared = true;
      this.isRunning = false;

      const goals = this.stage.starGoals;
      const star1Achieved = true; // Completed
      const star2Achieved = this.elapsedTime <= goals.timeUnderSeconds;
      const star3Achieved = goals.loseNoBalls
        ? this.ballsLostCount === 0
        : this.maxCombo >= goals.comboGoal;

      let stars = 1;
      if (star2Achieved) stars++;
      if (star3Achieved) stars++;

      const isBoss = this.stage.isBoss;
      const clearShards =
        (isBoss
          ? GAME_BALANCE.rewards.shardsBossClearBonus
          : GAME_BALANCE.rewards.shardsStageClearBonus) +
        stars * GAME_BALANCE.rewards.shardsPerStar;

      const stats: StageEndStats = {
        stageId: this.stage.id,
        score: this.score,
        clearTimeSeconds: Math.round(this.elapsedTime * 10) / 10,
        starsEarned: stars,
        star1Achieved,
        star2Achieved,
        star3Achieved,
        maxCombo: this.maxCombo,
        ballsLost: this.ballsLostCount,
        shardsEarned: clearShards,
        attemptsUsed: this.options.attemptNumber || 1,
      };

      events.push({ type: 'stage_cleared', stats });
      events.push({ type: 'sound', soundId: 'victory_fanfare' });
      return;
    }

    // Check Loss (All balls lost)
    if (this.balls.length === 0) {
      this.isFailed = true;
      this.isRunning = false;

      events.push({
        type: 'stage_failed',
        remainingBricks: this.activeBricksCount,
        attempt: this.options.attemptNumber || 1,
      });
      events.push({ type: 'sound', soundId: 'game_over' });
    }
  }

  /**
   * For Rewarded Ad: Revive attempt by giving 1 ball back immediately
   */
  public reviveAttempt(): void {
    if (this.balls.length === 0) {
      this.isFailed = false;
      this.isRunning = true;
      this.paddle.shieldCharges = 1;
      this.spawnBall(true, 0);
    }
  }
}

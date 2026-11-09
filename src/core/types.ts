export type BrickType =
  | 'normal'
  | 'tough'
  | 'explosive'
  | 'freeze'
  | 'gravity'
  | 'glitch'
  | 'decoy'
  | 'boss_node'
  | 'boss_core';

export type PowerUpType =
  | 'multi_ball'
  | 'wide_paddle'
  | 'laser_paddle'
  | 'sticky_paddle'
  | 'fireball'
  | 'bomb_ball'
  | 'slow_mo'
  | 'shield'
  | 'shrink_paddle'
  | 'speed_up';

export interface Brick {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: BrickType;
  hp: number;
  maxHp: number;
  color: string;
  points: number;
  dropsPowerUp?: PowerUpType;
  active: boolean;
  frozen?: boolean;
  frozenTimer?: number;
  glitchTimer?: number;
  originalX?: number;
  originalY?: number;
  isBossPart?: boolean;
  gridCol?: number;
  gridRow?: number;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speed: number;
  isFireball: boolean;
  isBomb: boolean;
  isStuck: boolean;
  stuckOffsetRatio: number; // -1 to 1 relative to paddle center
  trail: { x: number; y: number }[];
}

export interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  targetX: number;
  vx: number;
  shieldCharges: number;
  wideTimer: number;
  shrinkTimer: number;
  laserTimer: number;
  laserCooldown: number;
  stickyTimer: number;
  hasStickyBall: boolean;
}

export interface PowerUpEntity {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  vy: number;
  width: number;
  height: number;
  active: boolean;
}

export interface LaserBolt {
  id: number;
  x: number;
  y: number;
  vy: number;
  width: number;
  height: number;
  active: boolean;
}

export interface BossHazard {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  active: boolean;
  color: string;
}

export interface BossState {
  active: boolean;
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  phase: number;
  attackTimer: number;
  shieldAngle: number;
  hasShield: boolean;
  shieldRadius: number;
  weakPointBrickIds: number[];
  coreBrickId: number;
}

export interface GravityWell {
  x: number;
  y: number;
  mass: number;
  radius: number;
}

export interface StageStarGoals {
  timeUnderSeconds: number;
  loseNoBalls: boolean;
  comboGoal: number;
}

export interface StageDefinition {
  id: number;
  worldId: number;
  name: string;
  shapeName: string;
  isBoss: boolean;
  starGoals: StageStarGoals;
  specialRules?: {
    gravityWells?: GravityWell[];
    freezeDensity?: number;
    explosiveDensity?: number;
    glitchDensity?: number;
    toughDensity?: number;
    brickDrift?: boolean;
    pixelSize?: number;
  };
  bricks: Brick[];
  boss?: BossState;
}

export type GameEvent =
  | { type: 'brick_hit'; brick: Brick; ball: Ball; isDestroyed: boolean }
  | { type: 'brick_destroyed'; brick: Brick; points: number; combo: number }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'freeze_shatter'; x: number; y: number; count: number }
  | { type: 'glitch_teleport'; brickId: number; fromX: number; toX: number }
  | { type: 'powerup_spawned'; entity: PowerUpEntity }
  | { type: 'powerup_collected'; powerUpType: PowerUpType; x: number; y: number }
  | { type: 'ball_paddle_hit'; ball: Ball; perfect: boolean }
  | { type: 'ball_lost'; remainingBalls: number }
  | { type: 'shield_bounce'; x: number; y: number }
  | { type: 'combo_milestone'; combo: number; x: number; y: number }
  | { type: 'combo_ended'; finalCombo: number }
  | { type: 'laser_fired'; x1: number; x2: number; y: number }
  | { type: 'boss_damage'; hpLeft: number; maxHp: number }
  | { type: 'stage_cleared'; stats: StageEndStats }
  | { type: 'stage_failed'; remainingBricks: number; attempt: number }
  | { type: 'sound'; soundId: string; pitchMultiplier?: number; worldId?: number }
  | { type: 'screen_shake'; intensity: number; duration: number }
  | { type: 'hit_stop'; frames: number }
  | { type: 'haptic'; style: 'light' | 'medium' | 'heavy' };

export interface StageEndStats {
  stageId: number;
  score: number;
  clearTimeSeconds: number;
  starsEarned: number;
  star1Achieved: boolean;
  star2Achieved: boolean;
  star3Achieved: boolean;
  maxCombo: number;
  ballsLost: number;
  shardsEarned: number;
  attemptsUsed: number;
}

export interface InputFrame {
  tick: number;
  targetX: number;
  launch: boolean;
}

export interface RunReplay {
  stageId: number;
  seed: number;
  mode: 'campaign' | 'endless' | 'daily' | 'tournament';
  inputs: InputFrame[];
  finalScore: number;
  clearTimeSeconds: number;
  bricksCleared: number;
  totalBricks: number;
  checksum: number;
}

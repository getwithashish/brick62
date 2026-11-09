/**
 * BRICK62 - Game Balance & Configuration Sheet
 * All tuning numbers, drop rates, speeds, and costs live here.
 */

export interface WorldConfig {
  id: number;
  key: string;
  name: string;
  description: string;
  primaryColor: string;
  accentColor: string;
  bgGradient: [string, string];
  musicKey: string;
  musicScale: number[]; // MIDI note offsets or relative scale steps
  specialMechanic: string;
}

export interface UpgradeConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  valuePerLevel: number;
  unit: string;
}

export interface ProductConfig {
  productId: string;
  dodoProductId: string;
  name: string;
  description: string;
  priceUsd: number;
  type: 'one_time' | 'consumable' | 'subscription';
  reward: {
    removeAds?: boolean;
    shards?: number;
    cosmeticId?: string;
    seasonPass?: boolean;
  };
}

export const GAME_BALANCE = {
  // Arena Coordinate Space (Virtual resolution for physics)
  arena: {
    width: 480,
    height: 720,
    aspectRatio: 480 / 720,
  },

  // Physics Timestep
  physics: {
    tickRate: 60, // 60 ticks/second
    dt: 1 / 60,
    subSteps: 3, // Sub-stepping for collision accuracy
    maxDt: 0.1, // Prevent spiral of death on lag
    antiStallSeconds: 5.0, // Nudge ball if no brick hit
  },

  // Paddle Tuning
  paddle: {
    baseWidth: 90,
    height: 14,
    y: 670, // Distance from top
    speed: 750, // Keyboard move speed px/s
    maxBounceAngleRad: (75 * Math.PI) / 180, // Max bounce angle off paddle edge
    friction: 0.88,
    laserCooldown: 0.22, // Laser fire rate when active
    laserSpeed: 900,
    laserWidth: 4,
    laserHeight: 14,
  },

  // Ball Tuning
  ball: {
    radius: 6,
    initialSpeed: 380,
    maxSpeed: 720,
    speedRampPerHit: 1.5, // Subtle acceleration per brick
    speedRampPerSecond: 2.0,
    maxBallsOnScreen: 10,
    fireballRadiusMultiplier: 1.25,
    bombRadius: 65, // Area blast radius in px
  },

  // Combo Tuning
  combo: {
    baseGraceSeconds: 2.0, // Seconds before combo resets
    scorePerBrick: 10,
    perfectCatchBonus: 150,
    milestonePops: [5, 10, 20, 30, 50, 100],
  },

  // Invisible Adaptive Assistance (Fail assistance)
  adaptiveAssistance: {
    thresholdAttempts: 3, // After 3 failed attempts on same stage
    extraPaddleWidthPct: 0.08, // +8% paddle width
    extraDropRateBonus: 0.15, // +15% power-up drop chance
  },

  // Power-up Tuning
  powerups: {
    fallSpeed: 160,
    width: 22,
    height: 22,
    baseDropChance: 0.14, // 14% chance brick drops a powerup
    durations: {
      widePaddle: 12.0,
      laserPaddle: 8.0,
      stickyPaddle: 10.0,
      fireball: 7.0,
      bombBall: 8.0,
      slowMo: 6.0,
      shrinkPaddle: 7.0,
      speedUp: 6.0,
    },
    multiBallCount: 2, // Spawn 2 extra balls per drop
    widePaddleMultiplier: 1.45,
    shrinkPaddleMultiplier: 0.70,
    speedUpMultiplier: 1.35,
    slowMoTimeScale: 0.55,
  },

  // Worlds (6 worlds x 5 stages = 30 stages)
  worlds: [
    {
      id: 1,
      key: 'core',
      name: 'CORE',
      description: 'The foundation of all light. Pure kinetic energy.',
      primaryColor: '#ff9f43',
      accentColor: '#feca57',
      bgGradient: ['#120e1d', '#1d112b'],
      musicKey: 'C Major',
      musicScale: [60, 62, 64, 67, 69, 72, 74, 76], // C Major Pentatonic
      specialMechanic: 'Plain bricks, multi-ball showcase, combo training.',
    },
    {
      id: 2,
      key: 'ember',
      name: 'EMBER',
      description: 'Molten fury. Explosive chain reactions ignite the grid.',
      primaryColor: '#ff3838',
      accentColor: '#ff9f1a',
      bgGradient: ['#1b0d0e', '#291012'],
      musicKey: 'E Minor / Phrygian',
      musicScale: [52, 53, 55, 57, 59, 60, 64, 65], // E Phrygian
      specialMechanic: 'Tough multi-hit bricks & volatile explosive chain bricks.',
    },
    {
      id: 3,
      key: 'frost',
      name: 'FROST',
      description: 'Sub-zero crystalline lattices that freeze and shatter.',
      primaryColor: '#00d2d3',
      accentColor: '#54a0ff',
      bgGradient: ['#0b1626', '#0f2238'],
      musicKey: 'A Minor / Dorian',
      musicScale: [57, 59, 60, 62, 64, 66, 67, 69], // A Dorian
      specialMechanic: 'Freeze nodes that crystallize neighbors, shattering them on next hit.',
    },
    {
      id: 4,
      key: 'gravity',
      name: 'GRAVITY',
      description: 'Deep cosmic singularity. Micro black holes bend trajectories.',
      primaryColor: '#a55eea',
      accentColor: '#ff78cb',
      bgGradient: ['#140a24', '#200c36'],
      musicKey: 'D Minor',
      musicScale: [50, 52, 53, 55, 57, 58, 62, 65], // D Minor Space
      specialMechanic: 'Attractors pull balls toward them; drifting orbital bricks.',
    },
    {
      id: 5,
      key: 'glitch',
      name: 'GLITCH',
      description: 'Corrupted cyber memory. Bricks teleport, swap, and deceive.',
      primaryColor: '#2ed573',
      accentColor: '#ff4757',
      bgGradient: ['#0a1a14', '#11291f'],
      musicKey: 'F# Lydian / Chiptune',
      musicScale: [54, 56, 58, 60, 61, 63, 66, 70], // F# Lydian Chiptune
      specialMechanic: 'Teleporting bricks, decoy hologram bricks, RGB split visuals.',
    },
    {
      id: 6,
      key: 'void',
      name: 'VOID',
      description: 'The ultimate boundary. All dimensions collide.',
      primaryColor: '#70a1ff',
      accentColor: '#ffffff',
      bgGradient: ['#090914', '#151528'],
      musicKey: 'B Locrian / Celestial',
      musicScale: [47, 48, 50, 52, 53, 55, 57, 59], // B Locrian / Dark Celestial
      specialMechanic: 'Combined hazards, moving void portals, supreme boss battle.',
    },
  ] as WorldConfig[],

  // Permanent Upgrades (Shards store)
  upgrades: [
    {
      id: 'paddle_width',
      name: 'Paddle Expander',
      description: 'Increases starting paddle width.',
      icon: '📏',
      maxLevel: 5,
      baseCost: 100,
      costMultiplier: 1.8,
      valuePerLevel: 6, // +6px per level
      unit: 'px',
    },
    {
      id: 'combo_grace',
      name: 'Combo Buffer',
      description: 'Extends time before combo multiplier drops.',
      icon: '⏱️',
      maxLevel: 5,
      baseCost: 120,
      costMultiplier: 2.0,
      valuePerLevel: 0.4, // +0.4s per level
      unit: 's',
    },
    {
      id: 'extra_ball',
      name: 'Twin Launch',
      description: 'Chance to start any stage with an extra ball launched.',
      icon: '⚪',
      maxLevel: 3,
      baseCost: 350,
      costMultiplier: 2.5,
      valuePerLevel: 25, // % chance
      unit: '%',
    },
    {
      id: 'drop_luck',
      name: 'Drop Catalyzer',
      description: 'Increases drop rate of power-ups from broken bricks.',
      icon: '✨',
      maxLevel: 5,
      baseCost: 150,
      costMultiplier: 1.9,
      valuePerLevel: 2, // +2% drop rate per level
      unit: '%',
    },
    {
      id: 'starting_shield',
      name: 'Floor Barrier',
      description: 'Provides a safety energy shield at stage start.',
      icon: '🛡️',
      maxLevel: 3,
      baseCost: 200,
      costMultiplier: 2.2,
      valuePerLevel: 1, // 1 shield charge
      unit: 'x',
    },
    {
      id: 'magnet_radius',
      name: 'Magnet Catch',
      description: 'Magnetically attracts dropping power-ups toward paddle.',
      icon: '🧲',
      maxLevel: 4,
      baseCost: 180,
      costMultiplier: 2.0,
      valuePerLevel: 40, // Attraction radius in px
      unit: 'px',
    },
  ] as UpgradeConfig[],

  // Currency Rewards
  rewards: {
    shardsPerBrick: 1,
    shardsPerStar: 25,
    shardsStageClearBonus: 40,
    shardsBossClearBonus: 250,
    dailyStreakBonus: 50, // Base daily login bonus (scales with streak)
    rewardedAdBonusMultiplier: 2, // 2x shards from ad
  },

  // Ad Limits & Caps (ethical monetization)
  ads: {
    maxRewardedPerDay: 15,
    interstitialMinSecondsAfterStart: 180, // No interstitials in first 3 minutes
    interstitialMinIntervalSeconds: 300, // At least 5 mins between interstitials
    interstitialStageFrequency: 4, // At most once every 4 stages
  },

  // In-App Products Catalog
  products: [
    {
      productId: 'remove_ads',
      dodoProductId: 'p_prod_remove_ads',
      name: 'Ad-Free Forever',
      description: 'Removes all interstitial and banner ads forever. Plus unlocks Cyber Gold paddle skin.',
      priceUsd: 3.99,
      type: 'one_time',
      reward: { removeAds: true, cosmeticId: 'paddle_cybergold' },
    },
    {
      productId: 'starter_pack',
      dodoProductId: 'p_prod_starter_pack',
      name: 'Neon Starter Pack',
      description: '5,000 Shards + Exclusive Rainbow Ball Trail + Remove Ads.',
      priceUsd: 5.99,
      type: 'one_time',
      reward: { removeAds: true, shards: 5000, cosmeticId: 'ball_rainbow' },
    },
    {
      productId: 'shards_pile',
      dodoProductId: 'p_prod_shards_2500',
      name: 'Pile of Shards',
      description: '2,500 Shards to fast-track your upgrades.',
      priceUsd: 1.99,
      type: 'consumable',
      reward: { shards: 2500 },
    },
    {
      productId: 'shards_vault',
      dodoProductId: 'p_prod_shards_10000',
      name: 'Vault of Shards',
      description: '10,000 Shards (+2,000 bonus shards!).',
      priceUsd: 6.99,
      type: 'consumable',
      reward: { shards: 12000 },
    },
    {
      productId: 'season_pass',
      dodoProductId: 'p_prod_season_pass_1',
      name: 'Season 1 Pass',
      description: 'Unlock 30 tiers of premium cosmetic skins, custom audio packs, and daily streak insurance.',
      priceUsd: 4.99,
      type: 'one_time',
      reward: { seasonPass: true, shards: 3000 },
    },
  ] as ProductConfig[],

  // Cosmetics Catalog
  cosmetics: {
    paddles: [
      { id: 'paddle_classic', name: 'Classic Neon', priceShards: 0, unlocked: true, color: '#00f2fe' },
      { id: 'paddle_cyberpunk', name: 'Cyberpunk Red', priceShards: 800, unlocked: false, color: '#ff007f' },
      { id: 'paddle_cybergold', name: 'Cyber Gold', priceShards: 2500, unlocked: false, color: '#ffd700' },
      { id: 'paddle_glitch', name: 'Glitch Runner', priceShards: 1500, unlocked: false, color: '#00ff88' },
    ],
    balls: [
      { id: 'ball_classic', name: 'Photon White', priceShards: 0, unlocked: true, color: '#ffffff' },
      { id: 'ball_plasma', name: 'Plasma Violet', priceShards: 600, unlocked: false, color: '#bb00ff' },
      { id: 'ball_rainbow', name: 'Chroma Trail', priceShards: 1200, unlocked: false, color: '#00ffff' },
      { id: 'ball_fire', name: 'Solar Flare', priceShards: 1000, unlocked: false, color: '#ff6600' },
    ],
    themes: [
      { id: 'theme_neon', name: 'Cyber Neon', priceShards: 0, unlocked: true },
      { id: 'theme_synthwave', name: 'Sunset Retro', priceShards: 1500, unlocked: false },
      { id: 'theme_deepspace', name: 'Deep Nebula', priceShards: 2000, unlocked: false },
    ],
  },
};

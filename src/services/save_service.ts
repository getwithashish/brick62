import { GAME_BALANCE } from '../config/balance';

export interface SaveData {
  schemaVersion: number;
  playerId: string;
  authToken?: string;
  email?: string;
  updatedAt: string;

  progress: {
    maxUnlockedStage: number;
    stageStars: Record<number, number>;
    stageBestScores: Record<number, number>;
    stageBestTimes: Record<number, number>;
    bossesDefeated: number[];
  };

  currency: {
    shards: number;
  };

  upgrades: Record<string, number>; // upgradeId -> level

  cosmetics: {
    ownedPaddles: string[];
    ownedBalls: string[];
    ownedThemes: string[];
    equippedPaddle: string;
    equippedBall: string;
    equippedTheme: string;
  };

  entitlements: {
    adsRemoved: boolean;
    seasonPass: boolean;
    activePurchases: string[];
  };

  streak: {
    currentStreak: number;
    lastLoginDate: string;
    streakSaverAvailable: boolean;
  };

  endless: {
    bestWave: number;
    highScore: number;
  };

  achievements: Record<string, boolean>;

  consent: {
    answered: boolean;
    analytics: boolean;
    personalizedAds: boolean;
    timestamp?: string;
  };

  settings: {
    muted: boolean;
    sfxVolume: number;
    musicVolume: number;
    haptics: boolean;
    screenShake: number;
    reduceMotion: boolean;
    reduceFlash: boolean;
    colorblindMode: string;
  };
}

export function createDefaultSave(playerId: string = generateUUID()): SaveData {
  return {
    schemaVersion: 1,
    playerId,
    updatedAt: new Date().toISOString(),
    progress: {
      maxUnlockedStage: 1,
      stageStars: {},
      stageBestScores: {},
      stageBestTimes: {},
      bossesDefeated: [],
    },
    currency: {
      shards: 150, // Starting shard bonus to buy first upgrade
    },
    upgrades: {
      paddle_width: 0,
      combo_grace: 0,
      extra_ball: 0,
      drop_luck: 0,
      starting_shield: 0,
      magnet_radius: 0,
    },
    cosmetics: {
      ownedPaddles: ['paddle_classic'],
      ownedBalls: ['ball_classic'],
      ownedThemes: ['theme_neon'],
      equippedPaddle: 'paddle_classic',
      equippedBall: 'ball_classic',
      equippedTheme: 'theme_neon',
    },
    entitlements: {
      adsRemoved: false,
      seasonPass: false,
      activePurchases: [],
    },
    streak: {
      currentStreak: 1,
      lastLoginDate: new Date().toISOString().slice(0, 10),
      streakSaverAvailable: true,
    },
    endless: {
      bestWave: 0,
      highScore: 0,
    },
    achievements: {},
    consent: {
      answered: false,
      analytics: false,
      personalizedAds: false,
    },
    settings: {
      muted: false,
      sfxVolume: 0.8,
      musicVolume: 0.5,
      haptics: true,
      screenShake: 1.0,
      reduceMotion: false,
      reduceFlash: false,
      colorblindMode: 'none',
    },
  };
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Merges local and remote save safely taking the higher / more complete value per field.
 * Never loses player progress!
 */
export function mergeSaves(local: SaveData, remote: SaveData): SaveData {
  const merged: SaveData = {
    ...remote,
    updatedAt: new Date().toISOString(),
    progress: {
      maxUnlockedStage: Math.max(local.progress.maxUnlockedStage, remote.progress.maxUnlockedStage),
      stageStars: { ...remote.progress.stageStars, ...local.progress.stageStars },
      stageBestScores: { ...remote.progress.stageBestScores },
      stageBestTimes: { ...remote.progress.stageBestTimes },
      bossesDefeated: Array.from(new Set([...(remote.progress.bossesDefeated || []), ...(local.progress.bossesDefeated || [])])),
    },
    currency: {
      shards: Math.max(local.currency.shards, remote.currency.shards),
    },
    upgrades: { ...remote.upgrades },
    cosmetics: {
      ownedPaddles: Array.from(new Set([...remote.cosmetics.ownedPaddles, ...local.cosmetics.ownedPaddles])),
      ownedBalls: Array.from(new Set([...remote.cosmetics.ownedBalls, ...local.cosmetics.ownedBalls])),
      ownedThemes: Array.from(new Set([...remote.cosmetics.ownedThemes, ...local.cosmetics.ownedThemes])),
      equippedPaddle: local.cosmetics.equippedPaddle || remote.cosmetics.equippedPaddle,
      equippedBall: local.cosmetics.equippedBall || remote.cosmetics.equippedBall,
      equippedTheme: local.cosmetics.equippedTheme || remote.cosmetics.equippedTheme,
    },
    entitlements: {
      adsRemoved: local.entitlements.adsRemoved || remote.entitlements.adsRemoved,
      seasonPass: local.entitlements.seasonPass || remote.entitlements.seasonPass,
      activePurchases: Array.from(new Set([...(remote.entitlements.activePurchases || []), ...(local.entitlements.activePurchases || [])])),
    },
    streak: {
      currentStreak: Math.max(local.streak.currentStreak, remote.streak.currentStreak),
      lastLoginDate: local.streak.lastLoginDate || remote.streak.lastLoginDate,
      streakSaverAvailable: local.streak.streakSaverAvailable || remote.streak.streakSaverAvailable,
    },
    endless: {
      bestWave: Math.max(local.endless.bestWave, remote.endless.bestWave),
      highScore: Math.max(local.endless.highScore, remote.endless.highScore),
    },
    achievements: { ...remote.achievements, ...local.achievements },
    consent: remote.consent.answered ? remote.consent : local.consent,
    settings: { ...remote.settings, ...local.settings },
  };

  // Higher stars per stage
  const allStageIds = new Set([
    ...Object.keys(local.progress.stageStars).map(Number),
    ...Object.keys(remote.progress.stageStars).map(Number),
  ]);
  for (const sid of allStageIds) {
    const lStars = local.progress.stageStars[sid] || 0;
    const rStars = remote.progress.stageStars[sid] || 0;
    merged.progress.stageStars[sid] = Math.max(lStars, rStars);

    const lScore = local.progress.stageBestScores[sid] || 0;
    const rScore = remote.progress.stageBestScores[sid] || 0;
    merged.progress.stageBestScores[sid] = Math.max(lScore, rScore);

    const lTime = local.progress.stageBestTimes[sid] || 9999;
    const rTime = remote.progress.stageBestTimes[sid] || 9999;
    merged.progress.stageBestTimes[sid] = Math.min(lTime, rTime);
  }

  // Higher upgrade level per item
  for (const upg of GAME_BALANCE.upgrades) {
    const lLevel = local.upgrades[upg.id] || 0;
    const rLevel = remote.upgrades[upg.id] || 0;
    merged.upgrades[upg.id] = Math.max(lLevel, rLevel);
  }

  return merged;
}

export interface SaveProvider {
  load(): Promise<SaveData>;
  save(data: SaveData): Promise<void>;
  merge(remoteData: SaveData): Promise<SaveData>;
}

export class LocalSaveProvider implements SaveProvider {
  private key: string = 'brick62_save_v1';

  public async load(): Promise<SaveData> {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.playerId) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load local save, creating new default', e);
    }
    const fresh = createDefaultSave();
    await this.save(fresh);
    return fresh;
  }

  public async save(data: SaveData): Promise<void> {
    try {
      data.updatedAt = new Date().toISOString();
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  public async merge(remoteData: SaveData): Promise<SaveData> {
    const local = await this.load();
    const merged = mergeSaves(local, remoteData);
    await this.save(merged);
    return merged;
  }
}

export class CloudSaveProvider implements SaveProvider {
  private localProvider: LocalSaveProvider;
  private apiEndpoint: string = '/api/save';

  constructor(localProvider: LocalSaveProvider) {
    this.localProvider = localProvider;
  }

  public async load(): Promise<SaveData> {
    const local = await this.localProvider.load();
    try {
      const res = await fetch(`${this.apiEndpoint}?playerId=${encodeURIComponent(local.playerId)}`, {
        headers: local.authToken ? { Authorization: `Bearer ${local.authToken}` } : {},
      });
      if (res.ok) {
        const remote = await res.json();
        if (remote && remote.save) {
          const merged = mergeSaves(local, remote.save);
          await this.localProvider.save(merged);
          return merged;
        }
      }
    } catch (e) {
      // Offline fallback: return local
    }
    return local;
  }

  public async save(data: SaveData): Promise<void> {
    // Always save locally first for instant offline responsiveness
    await this.localProvider.save(data);

    try {
      await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(data.authToken ? { Authorization: `Bearer ${data.authToken}` } : {}),
        },
        body: JSON.stringify(data),
      });
    } catch (e) {
      // Cloud sync will retry on next session
    }
  }

  public async merge(remoteData: SaveData): Promise<SaveData> {
    const merged = await this.localProvider.merge(remoteData);
    await this.save(merged);
    return merged;
  }
}

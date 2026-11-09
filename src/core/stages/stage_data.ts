import { Brick, BrickType, BossState, StageDefinition, GravityWell } from '../types';
import { PRNG } from '../rng';
import { GAME_BALANCE } from '../../config/balance';

/**
 * Shape mask formulas to generate dense pixel-art brick layouts.
 */
export function createStage(stageId: number, seed?: number): StageDefinition {
  const prng = new PRNG(seed !== undefined ? seed : stageId * 7919);
  const worldIndex = Math.min(5, Math.floor((stageId - 1) / 5));
  const world = GAME_BALANCE.worlds[worldIndex];
  const isBoss = stageId % 5 === 0;

  const names: string[] = [
    // World 1 - Core
    'Prism Heart', 'Solar Disc', 'Diamond Crest', 'Helix Waves', 'SOLARIS CORE',
    // World 2 - Ember
    'Molten Cross', 'Fire Skull', 'Volcano Rings', 'Inferno Wings', 'PYROCLAST',
    // World 3 - Frost
    'Snowflake Lattice', 'Ice Citadel', 'Glacier Shards', 'Crystal Crown', 'GLACIER WYRM',
    // World 4 - Gravity
    'Orbital Rings', 'Cosmic Nebula', 'Event Horizon', 'Black Sun', 'SINGULARITY',
    // World 5 - Glitch
    'Cyber Matrix', 'RGB Split', 'Phantom Ghost', 'Chrono Shift', 'BYTE PHANTOM',
    // World 6 - Void
    'Void Spiral', 'Omega Portal', 'Supernova', 'Infinity Gate', 'VOID ARCHITECT',
  ];

  const name = names[stageId - 1] || `Sector ${stageId}`;

  // Time & Star goals tailored to stage
  const starGoals = {
    timeUnderSeconds: isBoss ? 90 : Math.max(35, 75 - Math.floor(stageId * 0.8)),
    loseNoBalls: true,
    comboGoal: Math.min(45, 12 + Math.floor(stageId * 1.0)),
  };

  const bricks: Brick[] = [];
  let boss: BossState | undefined = undefined;
  const gravityWells: GravityWell[] = [];

  // Generate brick pattern based on stage
  generateStageLayout(stageId, worldIndex, isBoss, prng, bricks, gravityWells);

  if (isBoss) {
    boss = createBoss(stageId, worldIndex, bricks);
  }

  return {
    id: stageId,
    worldId: world.id,
    name,
    shapeName: name,
    isBoss,
    starGoals,
    specialRules: {
      gravityWells: gravityWells.length > 0 ? gravityWells : undefined,
    },
    bricks,
    boss,
  };
}

/**
 * Generates brick layouts using pixel-grid sampling of mathematical shapes.
 */
function generateStageLayout(
  stageId: number,
  worldIndex: number,
  isBoss: boolean,
  prng: PRNG,
  outBricks: Brick[],
  outWells: GravityWell[]
): void {
  const arenaW = GAME_BALANCE.arena.width; // 480
  const arenaH = GAME_BALANCE.arena.height; // 720

  // Palette definitions per world
  const palettes = [
    // Core
    ['#ff9f43', '#feca57', '#ff6b6b', '#48dbfb', '#ff9ff3'],
    // Ember
    ['#ff3838', '#ff9f1a', '#e55039', '#eb2f06', '#f8c291'],
    // Frost
    ['#00d2d3', '#54a0ff', '#10ac84', '#c8d6e5', '#48dbfb'],
    // Gravity
    ['#a55eea', '#ff78cb', '#706fd3', '#341f97', '#be2edd'],
    // Glitch
    ['#2ed573', '#ff4757', '#00f2fe', '#e056fd', '#f1c40f'],
    // Void
    ['#70a1ff', '#ffffff', '#ff3838', '#2ed573', '#e056fd'],
  ];

  const worldPalette = palettes[worldIndex];

  // Pixel sizing: 8x8 or 10x10 for intricate shapes
  const pixelW = isBoss ? 16 : (stageId === 2 ? 6 : 8);
  const pixelH = isBoss ? 12 : (stageId === 2 ? 6 : 7);
  const marginX = 24;
  const startY = 80;
  const areaW = arenaW - marginX * 2;
  const areaH = 360;

  const cols = Math.floor(areaW / (pixelW + 1));
  const rows = Math.floor(areaH / (pixelH + 1));

  let brickIdCounter = 1;

  // Decide brick shape equation based on stageId
  const shapeType = getShapeType(stageId);

  // For gravity stages, register gravity wells
  if (worldIndex === 3 || stageId === 26 || stageId === 30) {
    outWells.push({
      x: arenaW / 2,
      y: 220,
      mass: 4200,
      radius: 28,
    });
    if (stageId === 17 || stageId === 27) {
      outWells.push({
        x: arenaW / 4,
        y: 280,
        mass: 3000,
        radius: 22,
      });
      outWells.push({
        x: (arenaW * 3) / 4,
        y: 280,
        mass: 3000,
        radius: 22,
      });
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Normalized coordinates (-1 to 1)
      const nx = (c / (cols - 1)) * 2 - 1;
      const ny = (r / (rows - 1)) * 2 - 1;

      const inside = evaluateShape(shapeType, nx, ny, c, r, cols, rows, stageId);

      if (inside) {
        const bx = marginX + c * (pixelW + 1);
        const by = startY + r * (pixelH + 1);

        // Pick brick type based on world & stage mechanics
        const bType = determineBrickType(worldIndex, stageId, prng);
        const hp = bType === 'tough' ? prng.rangeInt(2, 3) : 1;
        const color = pickBrickColor(bType, worldPalette, prng, nx, ny);

        // Power-up chance
        const dropsPowerUp = prng.chance(GAME_BALANCE.powerups.baseDropChance)
          ? pickPowerUp(prng, worldIndex)
          : undefined;

        outBricks.push({
          id: brickIdCounter++,
          x: bx,
          y: by,
          width: pixelW,
          height: pixelH,
          type: bType,
          hp,
          maxHp: hp,
          color,
          points: bType === 'tough' ? 30 : (bType === 'explosive' ? 25 : 10),
          dropsPowerUp,
          active: true,
          originalX: bx,
          originalY: by,
        });
      }
    }
  }

  // Ensure stage has at least some bricks
  if (outBricks.length === 0) {
    // Fallback grid
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 12; c++) {
        outBricks.push({
          id: brickIdCounter++,
          x: 40 + c * 34,
          y: 90 + r * 16,
          width: 30,
          height: 12,
          type: 'normal',
          hp: 1,
          maxHp: 1,
          color: worldPalette[r % worldPalette.length],
          points: 10,
          active: true,
        });
      }
    }
  }
}

function getShapeType(stageId: number): string {
  switch (stageId) {
    case 1: return 'heart';
    case 2: return 'solar_disc_ring'; // ~2,500 brick disc inside ring with bottom gap!
    case 3: return 'diamond';
    case 4: return 'helix';
    case 5: return 'boss_solaris';
    case 6: return 'cross';
    case 7: return 'skull';
    case 8: return 'volcano_rings';
    case 9: return 'wings';
    case 10: return 'boss_pyroclast';
    case 11: return 'snowflake';
    case 12: return 'citadel';
    case 13: return 'glacier_shards';
    case 14: return 'crown';
    case 15: return 'boss_wyrm';
    case 16: return 'orbital_rings';
    case 17: return 'nebula_spiral';
    case 18: return 'event_horizon';
    case 19: return 'black_sun';
    case 20: return 'boss_singularity';
    case 21: return 'matrix_chip';
    case 22: return 'rgb_split';
    case 23: return 'phantom_ghost';
    case 24: return 'chrono_shift';
    case 25: return 'boss_glitch';
    case 26: return 'void_spiral';
    case 27: return 'omega_portal';
    case 28: return 'supernova';
    case 29: return 'infinity_gate';
    case 30: return 'boss_void_architect';
    default: return 'diamond';
  }
}

function evaluateShape(
  shape: string,
  nx: number,
  ny: number,
  c: number,
  r: number,
  cols: number,
  rows: number,
  stageId: number
): boolean {
  const dist = Math.sqrt(nx * nx + ny * ny);

  switch (shape) {
    case 'heart': {
      // (x^2 + y^2 - 1)^3 - x^2 * y^3 <= 0
      const hx = nx * 1.25;
      const hy = -ny * 1.25 + 0.15;
      const eq = Math.pow(hx * hx + hy * hy - 0.75, 3) - hx * hx * Math.pow(hy, 3);
      return eq <= 0;
    }
    case 'solar_disc_ring': {
      // A dense circular disc inside a thin ring with a gap at the bottom!
      // Inner disc
      if (dist < 0.60) return true;
      // Outer ring with bottom gap (gap when ny > 0.65 and Math.abs(nx) < 0.35)
      const inRing = dist >= 0.78 && dist <= 0.95;
      const isGap = ny > 0.65 && Math.abs(nx) < 0.35;
      return inRing && !isGap;
    }
    case 'diamond': {
      return Math.abs(nx) + Math.abs(ny) <= 0.85;
    }
    case 'helix': {
      const wave1 = Math.sin(ny * Math.PI * 3) * 0.45;
      const wave2 = -Math.sin(ny * Math.PI * 3) * 0.45;
      return (Math.abs(nx - wave1) < 0.22 || Math.abs(nx - wave2) < 0.22) && Math.abs(ny) < 0.9;
    }
    case 'cross': {
      const inArm1 = Math.abs(nx) < 0.25 && Math.abs(ny) < 0.85;
      const inArm2 = Math.abs(ny) < 0.25 && Math.abs(nx) < 0.85;
      return inArm1 || inArm2;
    }
    case 'skull': {
      // Head dome + jaw
      const inDome = dist < 0.7 && ny < 0.25;
      const inJaw = Math.abs(nx) < 0.45 && ny >= 0.25 && ny < 0.85;
      const isEye1 = Math.hypot(nx - 0.25, ny - 0.05) < 0.16;
      const isEye2 = Math.hypot(nx + 0.25, ny - 0.05) < 0.16;
      const isNose = Math.hypot(nx, ny - 0.22) < 0.08;
      return (inDome || inJaw) && !isEye1 && !isEye2 && !isNose;
    }
    case 'volcano_rings': {
      const ring1 = dist > 0.2 && dist < 0.4;
      const ring2 = dist > 0.55 && dist < 0.75;
      const ring3 = dist > 0.85 && dist < 0.98;
      return ring1 || ring2 || ring3;
    }
    case 'wings': {
      const wingY = Math.abs(nx) * 0.7 - ny;
      return Math.abs(nx) > 0.1 && wingY > 0 && wingY < 0.7 && Math.abs(ny) < 0.85;
    }
    case 'snowflake': {
      // 6-fold radial symmetry
      const angle = Math.atan2(ny, nx);
      const modAngle = Math.abs((angle % (Math.PI / 3)) - Math.PI / 6);
      return (dist < 0.85 && modAngle < 0.18) || (dist < 0.45 && modAngle < 0.35) || (dist < 0.2);
    }
    case 'citadel': {
      const inBase = Math.abs(nx) < 0.8 && ny > -0.1 && ny < 0.75;
      const inLeftTower = Math.abs(nx + 0.6) < 0.2 && ny > -0.8 && ny < 0.75;
      const inRightTower = Math.abs(nx - 0.6) < 0.2 && ny > -0.8 && ny < 0.75;
      const inCenterSpire = Math.abs(nx) < 0.22 && ny > -0.85 && ny < 0.75;
      return inBase || inLeftTower || inRightTower || inCenterSpire;
    }
    case 'glacier_shards': {
      // Angular shards
      return (c * 7 + r * 11) % 17 > 6 && Math.abs(nx) < 0.9 && Math.abs(ny) < 0.85;
    }
    case 'crown': {
      const base = ny > 0.2 && ny < 0.6 && Math.abs(nx) < 0.8;
      const peak1 = Math.abs(nx) < 0.18 && ny >= -0.6 && ny <= 0.2;
      const peak2 = Math.abs(nx - 0.5) < 0.16 && ny >= -0.3 && ny <= 0.2;
      const peak3 = Math.abs(nx + 0.5) < 0.16 && ny >= -0.3 && ny <= 0.2;
      return base || peak1 || peak2 || peak3;
    }
    case 'orbital_rings': {
      const planet = dist < 0.45;
      // Elliptical ring tilted
      const rx = nx;
      const ry = ny * 2.5 + nx * 0.5;
      const ringDist = Math.sqrt(rx * rx + ry * ry);
      const ring = ringDist > 0.75 && ringDist < 0.95;
      return planet || ring;
    }
    case 'nebula_spiral': {
      const angle = Math.atan2(ny, nx);
      const spiral = (dist - (angle / (2 * Math.PI)) * 0.4) % 0.4;
      return dist < 0.9 && Math.abs(spiral) < 0.12;
    }
    case 'event_horizon': {
      const hourglass = Math.abs(nx) < Math.abs(ny) * 0.8 + 0.15 && Math.abs(ny) < 0.85;
      return hourglass && dist > 0.15;
    }
    case 'black_sun': {
      const hollowDisc = dist > 0.35 && dist < 0.85;
      const rays = dist >= 0.85 && dist < 0.98 && ((c + r) % 4 === 0);
      return hollowDisc || rays;
    }
    case 'matrix_chip': {
      const board = Math.abs(nx) < 0.85 && Math.abs(ny) < 0.85;
      const gridPattern = (c % 3 !== 0) && (r % 3 !== 0);
      return board && (gridPattern || dist < 0.3);
    }
    case 'rgb_split': {
      const c1 = Math.hypot(nx + 0.2, ny) < 0.55;
      const c2 = Math.hypot(nx - 0.2, ny) < 0.55;
      const c3 = Math.hypot(nx, ny - 0.25) < 0.55;
      return c1 || c2 || c3;
    }
    case 'phantom_ghost': {
      const dome = dist < 0.65 && ny < 0.2;
      const skirt = Math.abs(nx) < 0.65 && ny >= 0.2 && ny < 0.75 && !((c % 6 < 3) && ny > 0.6);
      const eye1 = Math.hypot(nx - 0.22, ny) < 0.12;
      const eye2 = Math.hypot(nx + 0.22, ny) < 0.12;
      return (dome || skirt) && !eye1 && !eye2;
    }
    case 'chrono_shift': {
      const clockRing = dist > 0.65 && dist < 0.85;
      const hand1 = Math.abs(nx) < 0.08 && ny > -0.65 && ny < 0;
      const hand2 = Math.abs(ny) < 0.08 && nx > 0 && nx < 0.55;
      return clockRing || hand1 || hand2 || dist < 0.15;
    }
    case 'void_spiral': {
      const angle = Math.atan2(ny, nx);
      return dist < 0.9 && (Math.sin(angle * 4 + dist * 8) > 0.2);
    }
    case 'omega_portal': {
      const portal1 = Math.hypot(nx + 0.45, ny) < 0.42 && Math.hypot(nx + 0.45, ny) > 0.2;
      const portal2 = Math.hypot(nx - 0.45, ny) < 0.42 && Math.hypot(nx - 0.45, ny) > 0.2;
      return portal1 || portal2;
    }
    case 'supernova': {
      const center = dist < 0.35;
      const burst = dist < 0.95 && ((c * 3 + r * 5) % 11 < 4);
      return center || burst;
    }
    case 'infinity_gate': {
      // Lemniscate of Bernoulli: (x^2 + y^2)^2 = 2 a^2 (x^2 - y^2)
      const d2 = nx * nx + ny * ny;
      const lem = d2 * d2 - 0.7 * (nx * nx - ny * ny);
      return Math.abs(lem) < 0.18 && Math.abs(nx) < 0.95;
    }
    // Boss stages get special layout frameworks
    case 'boss_solaris':
    case 'boss_pyroclast':
    case 'boss_wyrm':
    case 'boss_singularity':
    case 'boss_glitch':
    case 'boss_void_architect': {
      // Boss frame with weak points and armor shields
      const core = dist < 0.25;
      const wings = Math.abs(ny) < 0.35 && Math.abs(nx) < 0.85 && Math.abs(nx) > 0.35;
      const shieldPillars = Math.abs(nx) < 0.75 && ny > 0.45 && ny < 0.7;
      return core || wings || shieldPillars;
    }
    default:
      return dist < 0.75;
  }
}

function determineBrickType(worldIndex: number, stageId: number, prng: PRNG): BrickType {
  // World mechanics introduction
  switch (worldIndex) {
    case 0: // Core: plain
      return 'normal';
    case 1: // Ember: explosive & tough
      if (prng.chance(0.18)) return 'explosive';
      if (prng.chance(0.25)) return 'tough';
      return 'normal';
    case 2: // Frost: freeze nodes
      if (prng.chance(0.20)) return 'freeze';
      if (prng.chance(0.15)) return 'tough';
      return 'normal';
    case 3: // Gravity: attractor & drifting
      if (prng.chance(0.15)) return 'gravity';
      if (prng.chance(0.20)) return 'tough';
      return 'normal';
    case 4: // Glitch: glitch & decoy
      if (prng.chance(0.18)) return 'glitch';
      if (prng.chance(0.10)) return 'decoy';
      if (prng.chance(0.15)) return 'tough';
      return 'normal';
    case 5: // Void: combination of everything
      const roll = prng.next();
      if (roll < 0.15) return 'explosive';
      if (roll < 0.30) return 'freeze';
      if (roll < 0.45) return 'glitch';
      if (roll < 0.65) return 'tough';
      return 'normal';
    default:
      return 'normal';
  }
}

function pickBrickColor(type: BrickType, palette: string[], prng: PRNG, nx: number, ny: number): string {
  if (type === 'explosive') return '#ff3838';
  if (type === 'freeze') return '#00d2d3';
  if (type === 'gravity') return '#a55eea';
  if (type === 'glitch') return '#2ed573';
  if (type === 'decoy') return '#ffa801';
  if (type === 'tough') return '#f1f2f6';

  // Gradient based on position
  const colorIndex = Math.floor(((nx + 1) * 0.5 * palette.length + (ny + 1) * 2)) % palette.length;
  return palette[Math.abs(colorIndex) % palette.length];
}

function pickPowerUp(prng: PRNG, worldIndex: number): import('../types').PowerUpType {
  const pool: import('../types').PowerUpType[] = [
    'multi_ball', 'multi_ball', 'multi_ball',
    'wide_paddle', 'wide_paddle',
    'laser_paddle',
    'fireball',
    'bomb_ball',
    'slow_mo',
    'shield',
    'sticky_paddle',
    // Rare risk power-ups
    'shrink_paddle',
    'speed_up',
  ];
  return prng.pick(pool);
}

function createBoss(stageId: number, worldIndex: number, bricks: Brick[]): BossState {
  const bossNames = [
    'SOLARIS DREADNOUGHT',
    'PYROCLAST GOLEM',
    'GLACIER WYRM',
    'SINGULARITY EYE',
    'BYTE PHANTOM',
    'VOID ARCHITECT',
  ];

  const name = bossNames[worldIndex] || 'NEXUS OVERLORD';
  const maxHp = 60 + worldIndex * 30;

  // Mark boss part bricks
  const weakPointBrickIds: number[] = [];
  let coreBrickId = 0;

  for (let i = 0; i < bricks.length; i++) {
    const b = bricks[i];
    // Center brick is core
    if (Math.hypot(b.x - 240, b.y - 200) < 30) {
      b.type = 'boss_core';
      b.hp = 10;
      b.maxHp = 10;
      b.color = '#ff0055';
      b.isBossPart = true;
      coreBrickId = b.id;
    } else if (i % 8 === 0) {
      b.type = 'boss_node';
      b.hp = 3;
      b.maxHp = 3;
      b.color = '#ffd700';
      b.isBossPart = true;
      weakPointBrickIds.push(b.id);
    }
  }

  return {
    active: true,
    id: stageId,
    name,
    hp: maxHp,
    maxHp,
    x: 240,
    y: 190,
    width: 140,
    height: 60,
    vx: 60,
    phase: 1,
    attackTimer: 3.0,
    shieldAngle: 0,
    hasShield: true,
    shieldRadius: 90,
    weakPointBrickIds,
    coreBrickId,
  };
}

/**
 * Procedural Endless Mode wave generator
 */
export function generateEndlessWave(waveNumber: number, seed?: number): StageDefinition {
  const prng = new PRNG(seed !== undefined ? seed : waveNumber * 10007);
  const worldIdx = (waveNumber - 1) % 6;
  const world = GAME_BALANCE.worlds[worldIdx];
  const bricks: Brick[] = [];
  let id = 1;

  const cols = 12;
  const rows = Math.min(14, 5 + Math.floor(waveNumber * 0.7));
  const bw = 32;
  const bh = 14;
  const startX = (GAME_BALANCE.arena.width - cols * (bw + 2)) / 2;
  const startY = 80;

  const palettes = [
    ['#ff9f43', '#feca57', '#ff6b6b'],
    ['#ff3838', '#ff9f1a', '#e55039'],
    ['#00d2d3', '#54a0ff', '#10ac84'],
    ['#a55eea', '#ff78cb', '#706fd3'],
    ['#2ed573', '#ff4757', '#00f2fe'],
    ['#70a1ff', '#ffffff', '#ff3838'],
  ];
  const pal = palettes[worldIdx];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (prng.chance(0.85)) {
        const typeRoll = prng.next();
        let type: BrickType = 'normal';
        let hp = 1;
        if (typeRoll < 0.12 + waveNumber * 0.01) {
          type = 'tough';
          hp = Math.min(4, 2 + Math.floor(waveNumber / 4));
        } else if (typeRoll < 0.22) {
          type = 'explosive';
        } else if (typeRoll < 0.32 && waveNumber > 3) {
          type = 'freeze';
        }

        const color = type === 'explosive' ? '#ff3838' : (type === 'freeze' ? '#00d2d3' : pal[r % pal.length]);

        bricks.push({
          id: id++,
          x: startX + c * (bw + 2),
          y: startY + r * (bh + 2),
          width: bw,
          height: bh,
          type,
          hp,
          maxHp: hp,
          color,
          points: 10 * hp,
          dropsPowerUp: prng.chance(GAME_BALANCE.powerups.baseDropChance) ? pickPowerUp(prng, worldIdx) : undefined,
          active: true,
        });
      }
    }
  }

  return {
    id: 1000 + waveNumber,
    worldId: world.id,
    name: `Endless Wave ${waveNumber}`,
    shapeName: `Wave ${waveNumber}`,
    isBoss: waveNumber % 5 === 0,
    starGoals: { timeUnderSeconds: 60, loseNoBalls: false, comboGoal: 15 },
    bricks,
  };
}

/**
 * Seeded Daily Challenge generator
 */
export function generateDailyChallenge(dateString: string): { stage: StageDefinition; modifierName: string; modifierDesc: string } {
  const seed = PRNG.hashString(dateString);
  const prng = new PRNG(seed);

  // Pick stage template 1-30
  const baseStageId = prng.rangeInt(1, 30);
  const stage = createStage(baseStageId, seed);
  stage.name = `Daily Challenge: ${dateString}`;

  const modifiers = [
    { name: 'Firestorm', desc: 'All balls are fireballs! Bricks pierce on contact, but paddle width is -25%.' },
    { name: 'Hyper Velocity', desc: 'Starting ball speed +35%! Drops drop 2x as often.' },
    { name: 'Multi-Glitch', desc: 'Start with 3 balls! Corrupted bricks teleport frequently.' },
    { name: 'Singularity Drift', desc: 'Heavy gravity attractor in arena center! Combo multiplier grace is doubled.' },
    { name: 'Chain Reaction', desc: 'Explosive brick density increased by 300%! Blast radius +50%.' },
    { name: 'Glass Cannon', desc: 'Lasers permanently active! Single ball only, no floor shield.' },
  ];

  const modifier = prng.pick(modifiers);

  return {
    stage,
    modifierName: modifier.name,
    modifierDesc: modifier.desc,
  };
}

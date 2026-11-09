import { GAME_BALANCE } from '../config/balance';

/**
 * Procedural Web Audio Sound Engine for BRICK62.
 * Synthesizes all sound effects, combo chimes, and generative background music.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private sfxVolume: number = 0.8;
  private musicVolume: number = 0.5;

  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  // Generative music state
  private musicIntervalId: any = null;
  private currentWorldId: number = 1;
  private currentCombo: number = 0;
  private musicStep: number = 0;
  private isMusicPlaying: boolean = false;

  constructor() {
    // Read persisted audio settings from localStorage if available
    try {
      const storedMute = localStorage.getItem('brick62_muted');
      if (storedMute !== null) {
        this.isMuted = storedMute === 'true';
      }
      const storedSfx = localStorage.getItem('brick62_sfx_volume');
      if (storedSfx !== null) this.sfxVolume = parseFloat(storedSfx);
      const storedMusic = localStorage.getItem('brick62_music_volume');
      if (storedMusic !== null) this.musicVolume = parseFloat(storedMusic);
    } catch (e) {
      // Storage unavailable
    }
  }

  /**
   * Initializes or unlocks Web Audio Context on first user touch/click.
   */
  public initContext(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
        this.sfxGain.connect(this.masterGain);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
        this.musicGain.connect(this.masterGain);
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    try {
      localStorage.setItem('brick62_muted', muted ? 'true' : 'false');
    } catch (e) {}

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setSfxVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('brick62_sfx_volume', this.sfxVolume.toString());
    } catch (e) {}
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  public setMusicVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('brick62_music_volume', this.musicVolume.toString());
    } catch (e) {}
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05);
    }
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  /**
   * Helper to convert MIDI note number to Hz
   */
  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Play procedural sound effect by ID
   */
  public playSound(soundId: string, pitchMultiplier: number = 1.0, worldId: number = 1): void {
    if (this.isMuted || !this.ctx || !this.sfxGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const t = this.ctx.currentTime;

    switch (soundId) {
      case 'brick_hit': {
        // Pentatonic chime note scaling with combo
        const world = GAME_BALANCE.worlds[Math.min(5, Math.max(0, worldId - 1))];
        const scale = world.musicScale;
        const noteIndex = Math.floor((pitchMultiplier - 1.0) * 8) % scale.length;
        const midi = scale[Math.abs(noteIndex)] + (pitchMultiplier > 1.8 ? 12 : 0);
        const freq = this.midiToFreq(midi);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Sine with slight square overtone for sparkle
        osc.type = worldId === 5 ? 'square' : 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.02, t + 0.1);

        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(t);
        osc.stop(t + 0.18);
        break;
      }

      case 'paddle_hit': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(110, t + 0.08);

        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(t);
        osc.stop(t + 0.1);
        break;
      }

      case 'perfect_catch': {
        // Harmonic major third bell chime
        [523.25, 659.25, 1046.5].forEach((freq, i) => {
          if (!this.ctx || !this.sfxGain) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + i * 0.02);
          gain.gain.setValueAtTime(0.3, t + i * 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28 + i * 0.02);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(t + i * 0.02);
          osc.stop(t + 0.3 + i * 0.02);
        });
        break;
      }

      case 'laser_fire': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(980, t);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.09);

        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(t);
        osc.stop(t + 0.1);
        break;
      }

      case 'explosion': {
        // Synthesize white noise burst with resonant low-pass filter
        const bufferSize = this.ctx.sampleRate * 0.35;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t);
        filter.frequency.exponentialRampToValueAtTime(80, t + 0.35);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        noise.start(t);
        noise.stop(t + 0.36);
        break;
      }

      case 'freeze': {
        // High frequency icy shatter
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(2400, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.14);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.15);
        break;
      }

      case 'powerup_collect': {
        // Upward 3-note chime
        [587.33, 739.99, 880].forEach((freq, idx) => {
          if (!this.ctx || !this.sfxGain) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + idx * 0.05);
          gain.gain.setValueAtTime(0.25, t + idx * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15 + idx * 0.05);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(t + idx * 0.05);
          osc.stop(t + 0.16 + idx * 0.05);
        });
        break;
      }

      case 'shield_save': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(320, t + 0.18);
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.23);
        break;
      }

      case 'victory_fanfare': {
        // Triumphant chord progression
        const chord = [523.25, 659.25, 783.99, 1046.5];
        chord.forEach((freq, i) => {
          if (!this.ctx || !this.sfxGain) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t + i * 0.08);
          gain.gain.setValueAtTime(0.3, t + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(t + i * 0.08);
          osc.stop(t + 0.95);
        });
        break;
      }

      case 'game_over': {
        // Descending gentle minor chord
        [440, 415.3, 392, 349.23].forEach((freq, i) => {
          if (!this.ctx || !this.sfxGain) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + i * 0.12);
          gain.gain.setValueAtTime(0.2, t + i * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5 + i * 0.12);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(t + i * 0.12);
          osc.stop(t + 0.6 + i * 0.12);
        });
        break;
      }

      default:
        // Generic click / wall bounce
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(150, t + 0.04);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.06);
        break;
    }
  }

  /**
   * Generative dynamic music loop.
   * Plays ambient rhythmic arpeggios that adapt to the current world's musical key and player combo.
   */
  public startMusic(worldId: number = 1): void {
    this.currentWorldId = worldId;
    if (this.isMusicPlaying) return;
    this.isMusicPlaying = true;

    const tempoMs = 240; // ~125 BPM eighth notes
    this.musicIntervalId = setInterval(() => {
      this.tickMusicNote();
    }, tempoMs);
  }

  public updateMusicState(worldId: number, combo: number): void {
    this.currentWorldId = worldId;
    this.currentCombo = combo;
  }

  public stopMusic(): void {
    if (this.musicIntervalId) {
      clearInterval(this.musicIntervalId);
      this.musicIntervalId = null;
    }
    this.isMusicPlaying = false;
  }

  private tickMusicNote(): void {
    if (this.isMuted || !this.ctx || !this.musicGain || this.musicVolume <= 0) return;

    const t = this.ctx.currentTime;
    const worldIndex = Math.min(5, Math.max(0, this.currentWorldId - 1));
    const world = GAME_BALANCE.worlds[worldIndex];
    const scale = world.musicScale;

    // Pattern step sequence (8-step arpeggio)
    const pattern = [0, 2, 4, 2, 1, 3, 5, 4];
    const noteStep = pattern[this.musicStep % pattern.length];
    this.musicStep++;

    const midi = scale[noteStep % scale.length] - 12; // Lower octave for bass/backing
    const freq = this.midiToFreq(midi);

    // Bass synth pulse
    const bassOsc = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bassOsc.type = worldIndex === 4 ? 'square' : 'triangle';
    bassOsc.frequency.setValueAtTime(freq, t);

    const bassVol = 0.12;
    bassGain.gain.setValueAtTime(bassVol, t);
    bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    bassOsc.connect(bassGain);
    bassGain.connect(this.musicGain);

    bassOsc.start(t);
    bassOsc.stop(t + 0.24);

    // If combo > 5, add upper harmonic sparkle
    if (this.currentCombo >= 5 && this.musicStep % 2 === 0) {
      const highMidi = scale[(noteStep + 3) % scale.length] + 12;
      const highFreq = this.midiToFreq(highMidi);

      const highOsc = this.ctx.createOscillator();
      const highGain = this.ctx.createGain();
      highOsc.type = 'sine';
      highOsc.frequency.setValueAtTime(highFreq, t);

      highGain.gain.setValueAtTime(0.08, t);
      highGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      highOsc.connect(highGain);
      highGain.connect(this.musicGain);

      highOsc.start(t);
      highOsc.stop(t + 0.2);
    }
  }
}

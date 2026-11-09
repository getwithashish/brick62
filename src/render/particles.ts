export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  gravity: number;
  rotation: number;
  rotationSpeed: number;
}

export interface FloatingText {
  text: string;
  x: number;
  y: number;
  vy: number;
  alpha: number;
  scale: number;
  color: string;
  duration: number;
  elapsed: number;
}

export class ParticleSystem {
  public particles: Particle[] = [];
  public texts: FloatingText[] = [];
  private maxParticles: number = 800;

  public emitBrickCrumble(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    count: number = 8
  ): void {
    const toSpawn = Math.min(count, this.maxParticles - this.particles.length);
    for (let i = 0; i < toSpawn; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 140;
      this.particles.push({
        x: x + Math.random() * width,
        y: y + Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30, // Initial upward burst
        size: 2.5 + Math.random() * 3.5,
        color,
        alpha: 1.0,
        decay: 1.8 + Math.random() * 1.4,
        gravity: 280,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 10,
      });
    }
  }

  public emitExplosion(x: number, y: number, radius: number, color: string = '#ff3838'): void {
    const count = 35;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const speed = 80 + Math.random() * 200;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color,
        alpha: 1.0,
        decay: 2.5,
        gravity: 50,
        rotation: 0,
        rotationSpeed: 0,
      });
    }
  }

  public emitSparks(x: number, y: number, count: number = 10, color: string = '#ffd700'): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2,
        color,
        alpha: 1.0,
        decay: 3.0,
        gravity: 100,
        rotation: 0,
        rotationSpeed: 0,
      });
    }
  }

  public addText(text: string, x: number, y: number, color: string = '#ffd700', scale: number = 1.0): void {
    this.texts.push({
      text,
      x,
      y,
      vy: -60,
      alpha: 1.0,
      scale,
      color,
      duration: 0.9,
      elapsed: 0,
    });
  }

  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.rotation += p.rotationSpeed * dt;
      p.alpha -= p.decay * dt;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.elapsed += dt;
      t.y += t.vy * dt;
      t.alpha = Math.max(0, 1.0 - t.elapsed / t.duration);

      if (t.elapsed >= t.duration) {
        this.texts.splice(i, 1);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    // Render particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }

    // Render floating combat text
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.alpha);
      ctx.font = `bold ${Math.round(18 * t.scale)}px 'Impact', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }

  public clear(): void {
    this.particles = [];
    this.texts = [];
  }
}

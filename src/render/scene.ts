/**
 * Canvas-rendered particle scene: parallax background, the particle itself,
 * click ripples/floating text, and a background palette that shifts per era
 * (CLAUDE.md: "background palette shifts per era"). Everything here is pure
 * visual flourish — game state lives in core/, this only reads numbers handed
 * to it each frame.
 */

interface FloatingText {
  x: number;
  y: number;
  text: string;
  age: number;
}

interface Ripple {
  x: number;
  y: number;
  age: number;
}

interface Streak {
  yFrac: number;
  depth: number; // 0..1 — parallax speed multiplier relative to scroll
  length: number;
  opacity: number;
  phase: number;
}

interface EraPalette {
  bgTop: string;
  bgBottom: string;
  gridLine: string;
  streak: string;
  particleCore: string;
  particleMid: string;
  particleEdge: string;
  glow: string;
}

const ERA_PALETTES: EraPalette[] = [
  // subatomic: ℓₚ, nm, µm
  {
    bgTop: '#0a0714',
    bgBottom: '#05070a',
    gridLine: 'rgba(155,107,255,0.06)',
    streak: 'rgba(155,107,255,0.22)',
    particleCore: '#E4D6FF',
    particleMid: '#9B6BFF',
    particleEdge: '#6236C9',
    glow: 'rgba(155,107,255,0.55)',
  },
  // human scale: mm, cm, m — matches the design mockup's default blue
  {
    bgTop: '#070a12',
    bgBottom: '#05070a',
    gridLine: 'rgba(124,135,160,0.05)',
    streak: 'rgba(124,135,160,0.18)',
    particleCore: '#9FC2FF',
    particleMid: '#4C8DFF',
    particleEdge: '#2E63C9',
    glow: 'rgba(76,141,255,0.55)',
  },
  // planetary: km
  {
    bgTop: '#051012',
    bgBottom: '#05070a',
    gridLine: 'rgba(76,217,255,0.05)',
    streak: 'rgba(76,217,255,0.2)',
    particleCore: '#C9F5FF',
    particleMid: '#4CD9FF',
    particleEdge: '#2496B8',
    glow: 'rgba(76,217,255,0.55)',
  },
  // solar / interstellar: AU, ld
  {
    bgTop: '#120d05',
    bgBottom: '#07050a',
    gridLine: 'rgba(255,184,76,0.05)',
    streak: 'rgba(255,184,76,0.2)',
    particleCore: '#FFEBC9',
    particleMid: '#FFB84C',
    particleEdge: '#C97A24',
    glow: 'rgba(255,184,76,0.55)',
  },
  // galactic: ly
  {
    bgTop: '#120610',
    bgBottom: '#07050a',
    gridLine: 'rgba(255,107,224,0.06)',
    streak: 'rgba(255,107,224,0.22)',
    particleCore: '#FFFFFF',
    particleMid: '#FF6BE0',
    particleEdge: '#B833A0',
    glow: 'rgba(255,107,224,0.6)',
  },
];

// The particle itself always stays violet — only the background/grid/streaks
// shift per era (CLAUDE.md: "background palette shifts per era", particle
// color is not part of that spec).
const PARTICLE_PALETTE = ERA_PALETTES[0]!;

const UNIT_ERA: Record<string, number> = {
  ℓₚ: 0,
  nm: 0,
  µm: 0,
  mm: 1,
  cm: 1,
  m: 1,
  km: 2,
  AU: 3,
  ld: 3,
  ly: 4,
};

export class ParticleScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dpr = Math.max(1, window.devicePixelRatio || 1);
  private width = 0;
  private height = 0;
  private readonly streaks: Streak[];
  private floating: FloatingText[] = [];
  private ripples: Ripple[] = [];
  private scrollPx = 0;
  private visualSpeed = 0;
  private palette: EraPalette = ERA_PALETTES[1]!;
  private time = 0;
  // Random-walk vertical jitter layered on top of the idle sine bob — retargets
  // itself at an interval and amplitude that both shrink as visualSpeed rises,
  // so the particle reads as increasingly erratic (not just faster).
  private wobbleY = 0;
  private wobbleTarget = 0;
  private wobbleTimer = 0;
  private bob = 0;
  // Recent bob samples (oldest first), used to draw the trail as a curve that
  // traces the particle's actual up/down path instead of a flat line.
  private readonly trailHistory: number[] = [];
  private static readonly TRAIL_SAMPLES = 24;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    this.streaks = Array.from({ length: 5 }, (_, i) => ({
      yFrac: 0.15 + (i / 5) * 0.75 + Math.random() * 0.08,
      depth: 0.3 + Math.random() * 0.7,
      length: 140 + Math.random() * 220,
      opacity: 0.5 + Math.random() * 0.5,
      phase: Math.random() * 2000,
    }));

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth ?? this.canvas.clientWidth;
    const h = parent?.clientHeight ?? this.canvas.clientHeight;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Shift the ambient palette based on the current display unit (see UNIT_ERA). */
  setEra(unitSymbol: string): void {
    const idx = UNIT_ERA[unitSymbol] ?? 1;
    this.palette = ERA_PALETTES[idx]!;
  }

  /** Spawn a click ripple + floating label at a client-space point (e.g. from a MouseEvent). */
  addClickEffect(clientX: number, clientY: number, label: string): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    this.floating.push({ x, y, text: label, age: 0 });
    this.ripples.push({ x, y, age: 0 });
  }

  /** speedFraction: 0..1 visual intensity (log-mapped by the caller — see ui/stage.ts). */
  update(dt: number, speedFraction: number): void {
    this.time += dt;
    this.visualSpeed += (speedFraction - this.visualSpeed) * Math.min(1, dt * 2.5);
    this.scrollPx += dt * (20 + this.visualSpeed * 320);

    this.wobbleTimer -= dt;
    if (this.wobbleTimer <= 0) {
      const amplitude = 3 + this.visualSpeed * 16;
      this.wobbleTarget = (Math.random() * 2 - 1) * amplitude;
      this.wobbleTimer = 0.4 - this.visualSpeed * 0.3 + Math.random() * 0.2;
    }
    // Exponential (rather than linear) approach to the target — no overshoot,
    // reads as smoother easing instead of a snap-then-drift.
    const wobbleRate = 3 + this.visualSpeed * 8;
    this.wobbleY += (this.wobbleTarget - this.wobbleY) * (1 - Math.exp(-wobbleRate * dt));

    this.bob = Math.sin(this.time * 1.6) * 3 + this.wobbleY;
    this.trailHistory.push(this.bob);
    if (this.trailHistory.length > ParticleScene.TRAIL_SAMPLES) this.trailHistory.shift();

    for (const f of this.floating) f.age += dt;
    this.floating = this.floating.filter((f) => f.age < 1.4);
    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < 0.6);
  }

  draw(): void {
    const { ctx } = this;
    const w = this.width;
    const h = this.height;
    const p = this.palette;

    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, p.bgTop);
    bgGrad.addColorStop(1, p.bgBottom);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    this.drawGrid(p);
    this.drawStreaks(p);
    this.drawRuler();
    this.drawParticle(PARTICLE_PALETTE);
    this.drawRipples(PARTICLE_PALETTE);
    this.drawFloatingText(PARTICLE_PALETTE);
  }

  private drawGrid(p: EraPalette): void {
    const { ctx } = this;
    const spacing = 96;
    const offset = (this.scrollPx * 0.15) % spacing;
    ctx.strokeStyle = p.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -offset; x < this.width; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    ctx.stroke();
  }

  private drawStreaks(p: EraPalette): void {
    const { ctx } = this;
    for (const s of this.streaks) {
      const y = s.yFrac * this.height;
      const cycle = this.width + s.length * 2;
      const x = cycle - ((this.scrollPx * s.depth + s.phase) % cycle) - s.length;
      const grad = ctx.createLinearGradient(x, y, x + s.length, y);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.5, p.streak);
      grad.addColorStop(1, 'transparent');
      ctx.strokeStyle = grad;
      ctx.globalAlpha = s.opacity;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + s.length, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawRuler(): void {
    const { ctx } = this;
    // +0.5 keeps 1px strokes aligned to a device-pixel center instead of a
    // boundary, which otherwise anti-aliases them into a faint 2px smear.
    const rulerY = Math.round(this.height - 44) + 0.5;

    ctx.strokeStyle = 'rgba(124,135,160,0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerY);
    ctx.lineTo(this.width, rulerY);
    ctx.stroke();

    const minorSpacing = 28;
    const minorOffset = (this.scrollPx * 0.6) % minorSpacing;
    ctx.strokeStyle = 'rgba(124,135,160,0.4)';
    ctx.beginPath();
    for (let x = -minorOffset; x < this.width; x += minorSpacing) {
      const xr = Math.round(x) + 0.5;
      ctx.moveTo(xr, rulerY);
      ctx.lineTo(xr, rulerY + 8);
    }
    ctx.stroke();

    const majorSpacing = minorSpacing * 5;
    const majorOffset = (this.scrollPx * 0.6) % majorSpacing;
    ctx.strokeStyle = 'rgba(220,228,242,0.6)';
    ctx.beginPath();
    for (let x = -majorOffset; x < this.width; x += majorSpacing) {
      const xr = Math.round(x) + 0.5;
      ctx.moveTo(xr, rulerY - 12);
      ctx.lineTo(xr, rulerY + 4);
    }
    ctx.stroke();
  }

  private drawParticle(p: EraPalette): void {
    const { ctx } = this;
    const px = this.width * 0.35;
    const py = this.height * 0.42;
    const bob = this.bob;

    const trailLen = this.width * 0.24;
    const hist = this.trailHistory;
    if (hist.length > 1) {
      const n = hist.length;
      const pts = hist.map((y, i) => ({
        x: px - trailLen + (trailLen * i) / (n - 1),
        y: py + y,
      }));

      const trailGrad = ctx.createLinearGradient(px - trailLen, py, px, py);
      trailGrad.addColorStop(0, 'transparent');
      trailGrad.addColorStop(0.65, p.glow);
      trailGrad.addColorStop(1, p.particleMid);
      ctx.strokeStyle = trailGrad;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = p.glow;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      // Quadratic-through-midpoints: turns the raw polyline into a smooth
      // curve that traces the particle's actual recent up/down path.
      for (let i = 1; i < n - 1; i++) {
        const mid = { x: (pts[i]!.x + pts[i + 1]!.x) / 2, y: (pts[i]!.y + pts[i + 1]!.y) / 2 };
        ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, mid.x, mid.y);
      }
      ctx.lineTo(pts[n - 1]!.x, pts[n - 1]!.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const r = (11 + Math.min(6, this.visualSpeed * 6)) * 1.1;
    const coreGrad = ctx.createRadialGradient(px - r * 0.25, py + bob - r * 0.25, 1, px, py + bob, r);
    coreGrad.addColorStop(0, p.particleCore);
    coreGrad.addColorStop(0.6, p.particleMid);
    coreGrad.addColorStop(1, p.particleEdge);

    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 24 + this.visualSpeed * 20;
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(px, py + bob, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawRipples(p: EraPalette): void {
    const { ctx } = this;
    for (const rp of this.ripples) {
      const t = rp.age / 0.6;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = p.particleMid;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, 6 + t * 34, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloatingText(p: EraPalette): void {
    const { ctx } = this;
    ctx.font = '600 13px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    for (const f of this.floating) {
      const t = f.age / 1.4;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.particleCore;
      ctx.fillText(f.text, f.x, f.y - t * 36);
    }
    ctx.globalAlpha = 1;
  }
}

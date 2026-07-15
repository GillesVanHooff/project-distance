/**
 * Canvas-rendered particle scene: parallax background, the particle itself,
 * click ripples/floating text, and a background palette that shifts per era
 * (CLAUDE.md: "background palette shifts per era"). Everything here is pure
 * visual flourish — game state lives in core/, this only reads numbers handed
 * to it each frame.
 */

import { formatMagnitude } from '../core/units';

interface RulerInput {
  /** Current distance in whatever unit the odometer is displaying right now. */
  distanceInUnit: number;
  /** Current speed in that same unit, per second. */
  speedInUnitPerSec: number;
}

interface NiceStep {
  exp: number;
  value: number;
}

/** Snap a rough step size to the nearest "1 / 2 / 5 × 10ⁿ" — the classic
 * map-scale-bar trick — so ruler labels always land on a round number no
 * matter how oddly the real unit-per-tick amount comes out. */
function niceStep(rough: number): NiceStep {
  const exp = Math.floor(Math.log10(rough));
  const mantissa = rough / 10 ** exp;
  if (mantissa < 1.5) return { exp, value: 1 * 10 ** exp };
  if (mantissa < 3.5) return { exp, value: 2 * 10 ** exp };
  if (mantissa < 7.5) return { exp, value: 5 * 10 ** exp };
  return { exp: exp + 1, value: 10 ** (exp + 1) };
}

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

  // Ruler state — see drawRuler(). Position comes straight from the real
  // distance/unit each frame; only the tick *step size* needs smoothing, so it
  // doesn't relabel every frame as speed jitters.
  private rulerDistance = 0;
  private smoothedTickSpeed = 0;
  private tickStep: NiceStep = { exp: 0, value: 1 };
  private tickStepAge = 999; // large: no fade-in flash on first paint
  private static readonly RULER_TARGET_PX = 140;
  private static readonly RULER_TEMPO_SECONDS = 1.8;
  private static readonly RULER_MINOR_PER_MAJOR = 5;

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

  /** Horizontal anchor the particle sits at — also where the ruler's "you are here" cursor lands. */
  private get particleX(): number {
    return this.width * 0.35;
  }

  /** speedFraction: 0..1 visual intensity (log-mapped by the caller — see ui/stage.ts).
   * ruler: real distance/speed in the odometer's current unit, for truthful tick labels. */
  update(dt: number, speedFraction: number, ruler: RulerInput): void {
    this.time += dt;
    this.visualSpeed += (speedFraction - this.visualSpeed) * Math.min(1, dt * 2.5);
    // Exponential easing asymptotically approaches the target but never quite
    // reaches it — left alone, a trail floor further down (drawParticle) would
    // never fully clear after the particle has ever moved. Snap once close.
    if (Math.abs(speedFraction - this.visualSpeed) < 0.001) this.visualSpeed = speedFraction;
    this.scrollPx += dt * (20 + this.visualSpeed * 320);

    this.rulerDistance = ruler.distanceInUnit;
    // Smooth the speed feeding the tick-step choice (not tick position — that
    // tracks the real distance exactly) so the step size doesn't relabel on
    // every small speed fluctuation.
    this.smoothedTickSpeed += (Math.max(0, ruler.speedInUnitPerSec) - this.smoothedTickSpeed) * Math.min(1, dt * 0.8);
    if (this.smoothedTickSpeed > 0) {
      const candidate = niceStep(this.smoothedTickSpeed * ParticleScene.RULER_TEMPO_SECONDS);
      if (candidate.value !== this.tickStep.value) {
        this.tickStep = candidate;
        this.tickStepAge = 0;
      }
    }
    this.tickStepAge += dt;

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
    this.drawRuler(PARTICLE_PALETTE);
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

  /** Tape-measure ruler: tick spacing is a "nice" round step (1/2/5×10ⁿ) in the
   * odometer's current unit, chosen from the smoothed real speed so the tempo
   * stays readable at any magnitude (see niceStep()); tick *positions* come
   * straight from the real distance, so the labels are never fiction — they
   * agree with the odometer above. A small cursor pinned to the particle marks
   * the exact (non-rounded) reading between the two nearest ticks. */
  private drawRuler(p: EraPalette): void {
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

    const step = this.tickStep;
    if (step.value > 0) {
      const rawStep = this.smoothedTickSpeed * ParticleScene.RULER_TEMPO_SECONDS;
      // Stretch/compress slightly off the 140px target so the step's label
      // lands on a round number — the map-scale-bar trick from niceStep().
      const pxPerStep =
        rawStep > 0
          ? Math.min(400, Math.max(40, ParticleScene.RULER_TARGET_PX * (step.value / rawStep)))
          : ParticleScene.RULER_TARGET_PX;
      const minorPerMajor = ParticleScene.RULER_MINOR_PER_MAJOR;
      const minorPx = pxPerStep / minorPerMajor;

      const anchorValue = Math.floor(this.rulerDistance / step.value) * step.value;
      const frac = (this.rulerDistance - anchorValue) / step.value;
      const anchorX = this.particleX - frac * pxPerStep;

      const iMin = Math.floor(-anchorX / minorPx) - 1;
      const iMax = Math.ceil((this.width - anchorX) / minorPx) + 1;

      // Fresh grid fades in over the transition so a step-size change (a
      // "gear shift" as speed crosses an order of magnitude) reads as a
      // deliberate recalibration rather than a jump-cut.
      ctx.globalAlpha = Math.min(1, this.tickStepAge / 0.25);

      ctx.strokeStyle = 'rgba(124,135,160,0.4)';
      ctx.beginPath();
      for (let i = iMin; i <= iMax; i++) {
        if (i % minorPerMajor === 0) continue;
        const xr = Math.round(anchorX + i * minorPx) + 0.5;
        ctx.moveTo(xr, rulerY);
        ctx.lineTo(xr, rulerY + 8);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(220,228,242,0.6)';
      ctx.beginPath();
      for (let i = iMin; i <= iMax; i++) {
        if (i % minorPerMajor !== 0) continue;
        const xr = Math.round(anchorX + i * minorPx) + 0.5;
        ctx.moveTo(xr, rulerY - 12);
        ctx.lineTo(xr, rulerY + 4);
      }
      ctx.stroke();

      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(220,228,242,0.72)';
      for (let i = iMin; i <= iMax; i++) {
        if (i % minorPerMajor !== 0) continue;
        const x = anchorX + i * minorPx;
        if (x < -24 || x > this.width + 24) continue;
        const k = i / minorPerMajor;
        const value = Math.round((anchorValue + k * step.value) * 1e6) / 1e6;
        ctx.fillText(formatMagnitude(value), Math.round(x) + 0.5, rulerY - 18);
      }

      ctx.globalAlpha = 1;
    }

    // "You are here" cursor — pinned to the particle's x position, independent
    // of the tick grid, so it never jumps when the grid's step size reflows.
    ctx.fillStyle = p.particleMid;
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(this.particleX, rulerY + 10);
    ctx.lineTo(this.particleX - 4, rulerY + 18);
    ctx.lineTo(this.particleX + 4, rulerY + 18);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawParticle(p: EraPalette): void {
    const { ctx } = this;
    const px = this.particleX;
    const py = this.height * 0.42;
    const bob = this.bob;

    // No trail at rest, growing toward the max as visualSpeed climbs toward c.
    // The "just started moving" floor (0.06) ramps in over visualSpeed's own
    // low range rather than snapping on at any positive value, so the trail
    // fades in/out smoothly with visualSpeed's easing instead of popping.
    const rampIn = Math.min(1, this.visualSpeed / 0.08);
    const trailFrac = rampIn * 0.06 + 0.18 * this.visualSpeed;
    const trailLen = this.width * trailFrac;
    const hist = this.trailHistory;
    if (trailLen > 0 && hist.length > 1) {
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

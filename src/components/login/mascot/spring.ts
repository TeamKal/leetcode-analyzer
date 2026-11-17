/**
 * A tiny damped spring (semi-implicit Euler). The mascot uses these to ease
 * every facial feature toward its target, so movement overshoots and settles
 * instead of snapping. No animation library needed.
 */
export class Spring {
  x: number;
  v = 0;
  target: number;

  constructor(
    private readonly stiffness: number,
    private readonly damping: number,
    start = 0,
  ) {
    this.x = start;
    this.target = start;
  }

  step(dt: number) {
    const acceleration =
      -this.stiffness * (this.x - this.target) - this.damping * this.v;
    this.v += acceleration * dt;
    this.x += this.v * dt;
  }

  /** Add velocity (a push), e.g. a jump or an ear wiggle. */
  kick(velocity: number) {
    this.v += velocity;
  }

  snap() {
    this.x = this.target;
    this.v = 0;
  }

  get settled() {
    return Math.abs(this.x - this.target) < 0.002 && Math.abs(this.v) < 0.01;
  }
}

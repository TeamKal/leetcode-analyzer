import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  type Scene,
} from "three";
import {
  ApplyForce,
  BatchedRenderer,
  Bezier,
  ColorOverLife,
  ConstantColor,
  ConstantValue,
  Gradient,
  IntervalValue,
  ParticleSystem,
  PiecewiseBezier,
  RenderMode,
  SizeOverLife,
  SphereEmitter,
  Vector3,
  Vector4,
  type ParticleSystemParameters,
} from "three.quarks";
import { puffTexture } from "./textures";

type Wave = { mesh: Mesh; mat: ShaderMaterial; start: number; radius: number; life: number };

const WAVE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// An expanding ring of compressed air: bright thin leading edge, fading as it grows.
const WAVE_FRAG = /* glsl */ `
  uniform float uProg;
  uniform float uPower;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float width = 0.05 + 0.14 * uProg;
    float edge = smoothstep(width, 0.0, abs(r - uProg));
    float trail = smoothstep(0.0, 1.0, 1.0 - (uProg - r) / 0.35) * step(r, uProg) * 0.22;
    float a = (edge + trail) * (1.0 - uProg) * uPower;
    vec3 col = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.95, 0.82), edge);
    gl_FragColor = vec4(col * a, a);
  }
`;

/** A constant colour generator (a thin wrapper so the call sites read clearly). */
class ConstantValueColor extends ConstantColor {
  constructor(r: number, g: number, b: number, a: number) {
    super(new Vector4(r, g, b, a));
  }
}

/**
 * Fireballs, smoke, sparks, embers and shockwaves. The particles come from
 * three.quarks (one batched draw per kind); the shockwave is a small shader.
 * Sizes and speeds are in pixels of the page, scaled by `k`.
 */
export function createExplosionKit(scene: Scene, k: number) {
  const batch = new BatchedRenderer();
  scene.add(batch);

  const tex = {
    fire: puffTexture("fire"),
    smoke: puffTexture("smoke"),
    spark: puffTexture("spark", 64),
    ember: puffTexture("ember", 64),
  };
  const mats = {
    fire: new MeshBasicMaterial({ map: tex.fire, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    smoke: new MeshBasicMaterial({ map: tex.smoke, transparent: true, blending: NormalBlending, depthWrite: false, side: DoubleSide }),
    spark: new MeshBasicMaterial({ map: tex.spark, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    ember: new MeshBasicMaterial({ map: tex.ember, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
  };

  const waveGeo = new PlaneGeometry(2, 2);
  const waves: Wave[] = [];
  let live = 0;

  const grow = (from: number, to: number) =>
    new SizeOverLife(new PiecewiseBezier([[new Bezier(from, (from * 2 + to) / 3, (from + to * 2) / 3, to), 0]]));

  const add = (
    x: number,
    y: number,
    params: Omit<ParticleSystemParameters, "worldSpace" | "looping" | "autoDestroy">,
  ) => {
    const ps = new ParticleSystem({ ...params, worldSpace: true, looping: false, autoDestroy: true });
    ps.emitter.position.set(x, y, 6);
    scene.add(ps.emitter);
    batch.addSystem(ps);
    live += 1;
    ps.addEventListener("destroy", () => {
      live -= 1;
    });
  };

  const burst = (count: number) => [
    { time: 0, count: new ConstantValue(count), cycle: 1, interval: 0.01, probability: 1 },
  ];

  /** One explosion at a point. `power` is 1 for a normal charge. */
  const explode = (x: number, y: number, nowMs: number, power = 1) => {
    // The fireball: white-hot core fading through orange to dark red.
    add(x, y, {
      duration: 0.1,
      shape: new SphereEmitter({ radius: 12 * k, thickness: 1, arc: Math.PI * 2 }),
      startLife: new IntervalValue(0.5, 1.05),
      startSpeed: new IntervalValue(50 * k, 330 * k * power),
      startSize: new IntervalValue(70 * k, 150 * k * power),
      startColor: new ConstantValueColor(1, 1, 1, 1),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: burst(Math.round(34 * power)),
      behaviors: [
        new ColorOverLife(
          new Gradient(
            [
              [new Vector3(1, 0.96, 0.8), 0],
              [new Vector3(1, 0.6, 0.14), 0.28],
              [new Vector3(0.82, 0.2, 0.04), 0.62],
              [new Vector3(0.18, 0.05, 0.02), 1],
            ],
            [
              [0, 0],
              [1, 0.07],
              [0.85, 0.5],
              [0, 1],
            ],
          ),
        ),
        grow(0.55, 1.7),
        new ApplyForce(new Vector3(0, 1, 0), new ConstantValue(120 * k)),
      ],
      material: mats.fire,
      renderOrder: 3,
    });

    // Flames that keep burning on the spot after the blast.
    add(x, y - 6 * k, {
      duration: 1.7,
      shape: new SphereEmitter({ radius: 24 * k, thickness: 1, arc: Math.PI * 2, spread: 0.4 }),
      startLife: new IntervalValue(0.45, 0.9),
      startSpeed: new IntervalValue(20 * k, 90 * k),
      startSize: new IntervalValue(36 * k, 80 * k),
      startColor: new ConstantValueColor(1, 1, 1, 1),
      emissionOverTime: new ConstantValue(34),
      behaviors: [
        new ColorOverLife(
          new Gradient(
            [
              [new Vector3(1, 0.85, 0.4), 0],
              [new Vector3(1, 0.45, 0.08), 0.4],
              [new Vector3(0.3, 0.07, 0.02), 1],
            ],
            [
              [0, 0],
              [0.9, 0.15],
              [0, 1],
            ],
          ),
        ),
        grow(1, 0.35),
        new ApplyForce(new Vector3(0, 1, 0), new ConstantValue(260 * k)),
      ],
      material: mats.fire,
      renderOrder: 3,
    });

    // Smoke: dark, slow, billowing upwards.
    add(x, y, {
      duration: 0.3,
      shape: new SphereEmitter({ radius: 20 * k, thickness: 1, arc: Math.PI * 2 }),
      startLife: new IntervalValue(1.8, 3.4),
      startSpeed: new IntervalValue(25 * k, 120 * k),
      startSize: new IntervalValue(90 * k, 190 * k),
      startColor: new ConstantValueColor(1, 1, 1, 1),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: burst(Math.round(16 * power)),
      behaviors: [
        new ColorOverLife(
          new Gradient(
            [
              [new Vector3(0.32, 0.27, 0.24), 0],
              [new Vector3(0.12, 0.11, 0.1), 0.4],
              [new Vector3(0.06, 0.06, 0.06), 1],
            ],
            [
              [0, 0],
              [0.55, 0.15],
              [0.4, 0.6],
              [0, 1],
            ],
          ),
        ),
        grow(0.5, 2.1),
        new ApplyForce(new Vector3(0, 1, 0), new ConstantValue(46 * k)),
      ],
      material: mats.smoke,
      renderOrder: 2,
    });

    // Sparks: fast streaks that arc down under gravity.
    add(x, y, {
      duration: 0.1,
      shape: new SphereEmitter({ radius: 6 * k, thickness: 1, arc: Math.PI * 2 }),
      startLife: new IntervalValue(0.55, 1.4),
      startSpeed: new IntervalValue(380 * k, 1150 * k * power),
      startSize: new IntervalValue(5 * k, 9 * k),
      startColor: new ConstantValueColor(1, 1, 1, 1),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: burst(Math.round(48 * power)),
      renderMode: RenderMode.StretchedBillBoard,
      speedFactor: 0.045,
      behaviors: [
        new ColorOverLife(
          new Gradient(
            [
              [new Vector3(1, 0.95, 0.7), 0],
              [new Vector3(1, 0.5, 0.1), 0.6],
            ],
            [
              [1, 0],
              [0, 1],
            ],
          ),
        ),
        new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(880 * k)),
      ],
      material: mats.spark,
      renderOrder: 4,
    });

    // Embers: small glowing flecks that drift up and wink out.
    add(x, y, {
      duration: 0.4,
      shape: new SphereEmitter({ radius: 40 * k, thickness: 1, arc: Math.PI * 2 }),
      startLife: new IntervalValue(1.8, 4),
      startSpeed: new IntervalValue(30 * k, 190 * k),
      startSize: new IntervalValue(4 * k, 9 * k),
      startColor: new ConstantValueColor(1, 1, 1, 1),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: burst(Math.round(30 * power)),
      behaviors: [
        new ColorOverLife(
          new Gradient(
            [
              [new Vector3(1, 0.85, 0.4), 0],
              [new Vector3(1, 0.35, 0.05), 1],
            ],
            [
              [0, 0],
              [1, 0.1],
              [0.7, 0.6],
              [0, 1],
            ],
          ),
        ),
        new ApplyForce(new Vector3(0, 1, 0), new ConstantValue(70 * k)),
      ],
      material: mats.ember,
      renderOrder: 4,
    });

    // The shockwave rings.
    for (const [radius, life, strength] of [
      [620 * k * power, 1.0, 1],
      [380 * k * power, 0.7, 0.6],
    ] as Array<[number, number, number]>) {
      const mat = new ShaderMaterial({
        uniforms: { uProg: { value: 0 }, uPower: { value: strength } },
        vertexShader: WAVE_VERT,
        fragmentShader: WAVE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(waveGeo, mat);
      mesh.position.set(x, y, 8);
      mesh.scale.setScalar(radius);
      mesh.renderOrder = 5;
      scene.add(mesh);
      waves.push({ mesh, mat, start: nowMs, radius, life });
    }
  };

  const update = (deltaSeconds: number, nowMs: number) => {
    if (live > 0) batch.update(deltaSeconds);
    for (let i = waves.length - 1; i >= 0; i -= 1) {
      const w = waves[i];
      const p = (nowMs - w.start) / 1000 / w.life;
      if (p >= 1) {
        scene.remove(w.mesh);
        w.mat.dispose();
        waves.splice(i, 1);
      } else {
        w.mat.uniforms.uProg.value = Math.max(0, p);
      }
    }
  };

  return {
    explode,
    update,
    get busy() {
      return live > 0 || waves.length > 0;
    },
    dispose() {
      for (const w of waves) w.mat.dispose();
      waves.length = 0;
      waveGeo.dispose();
      for (const m of Object.values(mats)) m.dispose();
      for (const t of Object.values(tex)) t.dispose();
      scene.remove(batch);
    },
  };
}


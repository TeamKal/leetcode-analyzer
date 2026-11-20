import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
} from "three";
import { buildShards, seeded } from "@/lib/ui/shards";

const VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2 uSize;
  uniform float uGravity;
  attribute vec2 aCentroid;
  attribute vec3 aVel;
  attribute vec4 aSpin;
  attribute float aDelay;
  attribute vec3 aBary;
  varying vec2 vUv;
  varying vec3 vBary;
  varying float vAge;
  varying float vLight;
  varying float vHot;

  mat3 rotation(vec3 u, float a) {
    float c = cos(a);
    float s = sin(a);
    float t = 1.0 - c;
    return mat3(
      t * u.x * u.x + c,       t * u.x * u.y + s * u.z, t * u.x * u.z - s * u.y,
      t * u.x * u.y - s * u.z, t * u.y * u.y + c,       t * u.y * u.z + s * u.x,
      t * u.x * u.z + s * u.y, t * u.y * u.z - s * u.x, t * u.z * u.z + c
    );
  }

  void main() {
    float age = max(0.0, uTime - aDelay);
    // Page pixels are y-down; the scene is y-up.
    vec3 local = vec3(position.x - aCentroid.x, -(position.y - aCentroid.y), 0.0);
    mat3 R = rotation(normalize(aSpin.xyz), aSpin.w * age);
    vec3 p = vec3(aCentroid.x, -aCentroid.y, 0.0)
           + R * local
           + aVel * age
           + vec3(0.0, -0.5 * uGravity * age * age, 0.0);
    vUv = vec2(position.x / uSize.x, 1.0 - position.y / uSize.y);
    vBary = aBary;
    vAge = age;
    vec3 n = R * vec3(0.0, 0.0, 1.0);
    vLight = n.z * 0.55 + n.x * 0.3 + n.y * 0.3;
    vHot = age > 0.0 ? exp(-age * 2.2) : 0.0;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uCrack;
  varying vec2 vUv;
  varying vec3 vBary;
  varying float vAge;
  varying float vLight;
  varying float vHot;
  void main() {
    vec4 c = texture2D(uTex, vUv);
    float edge = min(min(vBary.x, vBary.y), vBary.z);
    float line = 1.0 - smoothstep(0.0, 0.03, edge);
    float moving = step(0.001, vAge);
    vec3 col = c.rgb * (0.68 + 0.55 * vLight);
    // Hairline cracks show before the pieces let go.
    col += line * uCrack * 0.5 * (1.0 - moving) * vec3(1.0, 0.92, 0.8);
    // Once flying, each piece gets a dark rim on two edges and a bright glint on the third,
    // so the glass reads clearly against a pale page.
    float rim = 1.0 - smoothstep(0.0, 0.045, min(vBary.y, vBary.z));
    float glint = 1.0 - smoothstep(0.0, 0.05, vBary.x);
    col = mix(col, vec3(0.2, 0.16, 0.14), rim * moving * 0.7);
    col += glint * moving * vec3(1.0, 0.95, 0.85) * 0.7;
    // Lit by the fire.
    col = mix(col, col * vec3(1.7, 0.95, 0.5) + vec3(0.28, 0.1, 0.0), clamp(vHot, 0.0, 1.0) * 0.8);
    float alpha = 1.0 - smoothstep(2.0, 3.4, vAge);
    gl_FragColor = vec4(col, alpha * c.a);
  }
`;

export type ShatterInput = {
  width: number;
  height: number;
  /** The page as it looked: width x height (css pixels), at some pixel ratio. */
  raster: HTMLCanvasElement;
  /** Where each charge is on screen, and when it goes off (seconds). */
  impacts: Array<{ x: number; y: number; at: number }>;
};

/**
 * The page broken into glass-like shards. One mesh, one draw call: every piece's
 * flight (spin, momentum, gravity) is worked out on the GPU from the time uniform.
 * Pieces nearest a charge let go when that charge goes off; the rest follow as
 * the shockwave reaches them.
 */
export function createShatter(input: ShatterInput) {
  const { width, height, raster, impacts } = input;
  const shards = buildShards({
    width,
    height,
    impacts: impacts.map(({ x, y }) => ({ x, y })),
    seed: 21,
  });
  const rand = seeded(99);
  const count = shards.length * 3;

  const position = new Float32Array(count * 3);
  const centroid = new Float32Array(count * 2);
  const vel = new Float32Array(count * 3);
  const spin = new Float32Array(count * 4);
  const delay = new Float32Array(count);
  const bary = new Float32Array(count * 3);
  const SHOCK = 1500; // pixels per second

  let maxDelay = 0;
  shards.forEach((shard, i) => {
    const hasImpact = shard.impact >= 0;
    const at = hasImpact ? impacts[shard.impact].at : 0.2;
    const d = hasImpact ? shard.distance : 400;
    const dly = at + d / SHOCK + rand() * 0.05;
    maxDelay = Math.max(maxDelay, dly);

    let dx = hasImpact ? shard.centroid.x - impacts[shard.impact].x : rand() - 0.5;
    let dy = hasImpact ? shard.centroid.y - impacts[shard.impact].y : rand() - 0.5;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const speed = 560 * Math.exp(-d / 430) + 110 + rand() * 140;
    const vx = dx * speed + (rand() - 0.5) * 70;
    const vy = -dy * speed + 140 + rand() * 160; // world y is up
    const vz = 90 + rand() * 170;

    let ax = rand() - 0.5;
    let ay = rand() - 0.5;
    let az = rand() - 0.5;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al;
    ay /= al;
    az /= al;
    const rate = (rand() - 0.5) * 11;

    shard.tri.forEach((p, v) => {
      const o = i * 3 + v;
      position[o * 3] = p.x;
      position[o * 3 + 1] = p.y;
      position[o * 3 + 2] = 0;
      centroid[o * 2] = shard.centroid.x;
      centroid[o * 2 + 1] = shard.centroid.y;
      vel[o * 3] = vx;
      vel[o * 3 + 1] = vy;
      vel[o * 3 + 2] = vz;
      spin[o * 4] = ax;
      spin[o * 4 + 1] = ay;
      spin[o * 4 + 2] = az;
      spin[o * 4 + 3] = rate;
      delay[o] = dly;
      bary[o * 3 + v] = 1;
    });
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("aCentroid", new BufferAttribute(centroid, 2));
  geometry.setAttribute("aVel", new BufferAttribute(vel, 3));
  geometry.setAttribute("aSpin", new BufferAttribute(spin, 4));
  geometry.setAttribute("aDelay", new BufferAttribute(delay, 1));
  geometry.setAttribute("aBary", new BufferAttribute(bary, 3));

  const texture = new CanvasTexture(raster);
  texture.colorSpace = SRGBColorSpace;
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: new Vector2(width, height) },
      uGravity: { value: 950 },
      uTex: { value: texture },
      uCrack: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  return {
    mesh,
    /** Seconds after the first detonation by which every piece has fallen and faded. */
    endSeconds: maxDelay + 3.5,
    count: shards.length,
    set time(seconds: number) {
      material.uniforms.uTime.value = seconds;
    },
    set crack(value: number) {
      material.uniforms.uCrack.value = value;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

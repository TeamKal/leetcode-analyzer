import {
  AmbientLight,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  PointLight,
  Scene,
  WebGLRenderer,
} from "three";
import { toCanvas } from "html-to-image";
import { createC4Kit, type C4 } from "./c4";
import { createExplosionKit } from "./fire";
import { createShatter } from "./shatter";

export type EffectsOptions = {
  /** Where the charge model comes from (null: the built-in prop). */
  modelUrl: string | null;
  /** The countdown shown on each charge ends at this audio time (ms). */
  detonateMs: number;
  /** Gap between one charge going off and the next (ms). */
  chainMs: number;
};

export type ChargePosition = { x: number; y: number; fixed: boolean };

export type Effects = {
  /** Drops a charge (page coordinates, or viewport ones when `fixed`). */
  addCharge(position: ChargePosition, nowMs: number): void;
  /** Draws one frame. `nowMs` is the audio clock. */
  frame(nowMs: number, deltaMs: number): void;
  /** Photographs the page as it is now, for the shatter. */
  capture(): Promise<void>;
  /** Starts the chain of explosions. `hideDom` is called at the white-hot peak. */
  detonate(nowMs: number, hideDom: () => void): void;
  /** True once every piece has fallen and the fire has died down. */
  readonly finished: boolean;
  readonly detonated: boolean;
  dispose(): void;
};

type Planted = { c4: C4; position: ChargePosition; plantedAt: number; exploded: boolean };

/**
 * The effects layer: one fixed WebGL canvas above the page (the page's own DOM
 * is never touched except by the capture and the final hide). It holds the
 * planted charges, the explosions and the shattering glass.
 */
export async function createEffects(options: EffectsOptions): Promise<Effects> {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const small = vw < 640;
  const k = small ? 0.72 : 1;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:60;";
  document.body.appendChild(canvas);

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
  renderer.setSize(vw, vh, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const fov = 35;
  const camera = new PerspectiveCamera(fov, vw / vh, 10, 6000);
  // At this distance one world unit is exactly one page pixel on the z=0 plane.
  const distance = vh / 2 / Math.tan((fov * Math.PI) / 360);
  camera.position.set(vw / 2, -vh / 2, distance);

  const key = new DirectionalLight(0xfff0dc, 2.7);
  key.position.set(-320, 460, 560);
  const fill = new HemisphereLight(0xd7e0ff, 0x4a4036, 1.15);
  const ambient = new AmbientLight(0xffffff, 0.35);
  const glow = new PointLight(0xff6a1a, 0, 900, 1.2);
  scene.add(key, fill, ambient, glow);

  const pageGroup = new Group(); // page coordinates
  const fixedGroup = new Group(); // viewport coordinates (follows the scroll)
  scene.add(pageGroup, fixedGroup);

  const kit = await createC4Kit(k, options.modelUrl);
  const fire = createExplosionKit(scene, k);

  const planted: Planted[] = [];
  let shatter: ReturnType<typeof createShatter> | null = null;
  let rasterCanvas: HTMLCanvasElement | null = null;
  let detonatedAt: number | null = null;
  let hide: (() => void) | null = null;
  let hidden = false;
  let finished = false;
  let shake = 0;
  let shakeAt = 0;
  const flashes: HTMLElement[] = [];

  /** A burst of light: white-hot in the middle, orange at the edges. */
  const flash = (x: number, y: number, size: number, strength: number) => {
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      `position:fixed;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;` +
      "pointer-events:none;z-index:61;opacity:0;will-change:transform,opacity;" +
      "background:radial-gradient(circle closest-side,#fff 0%,rgba(255,244,214,.92) 18%,rgba(255,176,80,.6) 42%,rgba(255,96,24,.22) 70%,rgba(255,60,10,0) 100%);";
    document.body.appendChild(el);
    flashes.push(el);
    const anim = el.animate(
      [
        { opacity: 0, transform: "scale(.25)" },
        { opacity: strength, transform: "scale(.75)", offset: 0.1 },
        { opacity: 0, transform: "scale(1.5)" },
      ],
      { duration: 520, easing: "ease-out" },
    );
    anim.onfinish = () => {
      el.remove();
      const i = flashes.indexOf(el);
      if (i >= 0) flashes.splice(i, 1);
    };
  };

  const scrollNow = () => window.scrollY;
  const viewportOf = (p: ChargePosition) => ({ x: p.x, y: p.fixed ? p.y : p.y - scrollNow() });

  const api: Effects = {
    addCharge(position, nowMs) {
      const c4 = kit.make();
      c4.group.position.set(position.x, -position.y, 0);
      (position.fixed ? fixedGroup : pageGroup).add(c4.group);
      planted.push({ c4, position, plantedAt: nowMs, exploded: false });
    },

    async capture() {
      // Entrance animations would be photographed at their first (invisible) frame, so
      // they are paused for the moment of the capture (the mascot keeps moving).
      const freeze = document.createElement("style");
      freeze.textContent =
        ".dash :not(.mc-dock, .mc-dock *){animation:none!important;transition:none!important}";
      document.head.appendChild(freeze);
      const root = document.querySelector<HTMLElement>(".dash");
      const out = document.createElement("canvas");
      const pr = 1;
      out.width = Math.round(vw * pr);
      out.height = Math.round(vh * pr);
      const g = out.getContext("2d")!;
      const bg = root ? getComputedStyle(root).backgroundColor : "#f7f7f8";
      g.fillStyle = bg;
      g.fillRect(0, 0, out.width, out.height);
      if (root) {
        try {
          // The mascot has left by now, and is not part of what shatters.
          const skip = (node: Node) =>
            !(node instanceof HTMLElement && node.classList.contains("mc-dock"));
          const doc = await toCanvas(root, { pixelRatio: pr, skipFonts: true, filter: skip });
          const sy = Math.round(scrollNow() * pr);
          g.drawImage(doc, 0, sy, doc.width, Math.min(out.height, doc.height - sy), 0, 0, doc.width, Math.min(out.height, doc.height - sy));
          const nav = root.querySelector<HTMLElement>(".pn-bar");
          if (nav) {
            const navCanvas = await toCanvas(nav, { pixelRatio: pr, skipFonts: true });
            g.drawImage(navCanvas, 0, 0);
          }
        } catch {
          // The plain background still breaks apart; only the page's detail is missing.
        }
      }
      freeze.remove();
      rasterCanvas = out;
    },

    detonate(nowMs, hideDom) {
      detonatedAt = nowMs;
      hide = hideDom;
      const impacts = planted
        .map((p, i) => ({ p, i, v: viewportOf(p.position) }))
        .filter(({ v }) => v.x > -50 && v.x < vw + 50 && v.y > -50 && v.y < vh + 50)
        .map(({ i, v }) => ({ x: v.x, y: v.y, at: (i * options.chainMs) / 1000 }));
      shatter = createShatter({
        width: vw,
        height: vh,
        raster: rasterCanvas ?? document.createElement("canvas"),
        impacts,
      });
      shatter.mesh.position.y = -scrollNow();
      scene.add(shatter.mesh);
    },

    frame(nowMs, deltaMs) {
      if (planted.length === 0 && detonatedAt === null) return;
      const scroll = scrollNow();

      // Charges: drop in, blink and count down.
      const left = Math.max(0, Math.ceil((options.detonateMs - nowMs) / 1000));
      for (const p of planted) {
        if (p.exploded) continue;
        p.c4.animate((nowMs - p.plantedAt) / 1000, nowMs);
        p.c4.setTimer(`00:${String(left).padStart(2, "0")}`);
      }
      fixedGroup.position.y = -scroll;

      // The chain of explosions.
      if (detonatedAt !== null) {
        const since = nowMs - detonatedAt;
        if (shatter) {
          shatter.time = Math.max(0, since / 1000);
          shatter.crack = Math.min(1, since / 150);
        }
        planted.forEach((p, i) => {
          if (p.exploded || since < i * options.chainMs) return;
          p.exploded = true;
          p.c4.group.visible = false;
          const v = viewportOf(p.position);
          const first = i === 0;
          if (!hidden && first) {
            // At the white-hot peak the live page is swapped for its shards.
            window.setTimeout(() => {
              hide?.();
              hidden = true;
            }, 70);
          }
          const onScreen = v.x > -250 && v.x < vw + 250 && v.y > -250 && v.y < vh + 250;
          if (onScreen) {
            fire.explode(v.x, -(scroll + v.y), nowMs, first ? 1.25 : 1);
            flash(v.x, v.y, (first ? 900 : 620) * k, first ? 1 : 0.8);
          }
          shake = Math.min(1.6, shake + (first ? 1 : 0.55));
          shakeAt = nowMs;
        });
        if (!hidden && since > 400) {
          hide?.();
          hidden = true;
        }
        glow.intensity = Math.max(0, 9000 * Math.exp(-since / 700)) * (since < 3000 ? 1 : 0);
        if (planted.length) {
          const v = viewportOf(planted[0].position);
          glow.position.set(v.x, -(scroll + v.y), 260);
        }
        if (shatter && since / 1000 > shatter.endSeconds && !fire.busy) finished = true;
      }

      // A controlled shake that fades quickly after each blast.
      const amp = shake * 16 * Math.exp(-(nowMs - shakeAt) / 380) * k;
      camera.position.set(
        vw / 2 + Math.sin(nowMs * 0.083) * amp + Math.sin(nowMs * 0.171) * amp * 0.5,
        -(scroll + vh / 2) + Math.cos(nowMs * 0.097) * amp,
        distance,
      );

      fire.update(Math.min(0.05, deltaMs / 1000), nowMs);
      renderer.render(scene, camera);
    },

    get finished() {
      return finished;
    },
    get detonated() {
      return detonatedAt !== null;
    },

    dispose() {
      for (const el of flashes) el.remove();
      flashes.length = 0;
      shatter?.dispose();
      fire.dispose();
      kit.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
  return api;
}

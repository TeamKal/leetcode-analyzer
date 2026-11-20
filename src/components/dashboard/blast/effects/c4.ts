import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { drawTimer, filmTexture, shadowTexture } from "./textures";

export type C4 = {
  group: Group;
  /** Shows the countdown on its display (only redraws when the text changes). */
  setTimer(text: string): void;
  /** Animates the drop-in and the confirming ring; `age` is seconds since planting. */
  animate(age: number, nowMs: number): void;
};

const easeOutBack = (t: number) => {
  const c1 = 2.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Builds charges that share their geometry and materials. The prop is a block of
 * plastic explosive in printed wrapping, taped, with a detonator, a countdown
 * display, wiring and a status light, lit like a real object (physically based
 * materials, a key light and a fill). With `modelUrl` a glTF model is used instead.
 */
export async function createC4Kit(scale: number, modelUrl: string | null) {
  const film = filmTexture();
  const disposables: Array<{ dispose(): void }> = [film];
  const track = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  const blockGeo = track(new RoundedBoxGeometry(58, 25, 15, 4, 2.2));
  const blockMat = track(
    new MeshStandardMaterial({
      map: film,
      bumpMap: film,
      bumpScale: 0.8,
      roughness: 0.74,
      metalness: 0.02,
    }),
  );
  const tapeGeo = track(new RoundedBoxGeometry(6, 26.4, 16.4, 2, 1));
  const tapeMat = track(new MeshStandardMaterial({ color: 0x151515, roughness: 0.5, metalness: 0.1 }));
  const caseGeo = track(new RoundedBoxGeometry(17, 11, 11, 3, 1.5));
  const caseMat = track(new MeshStandardMaterial({ color: 0x23262b, roughness: 0.38, metalness: 0.65 }));
  const capGeo = track(new CylinderGeometry(2.6, 2.6, 6, 16));
  const capMat = track(new MeshStandardMaterial({ color: 0xb08d4a, roughness: 0.3, metalness: 0.95 }));
  const moduleGeo = track(new RoundedBoxGeometry(24, 11, 4, 2, 1));
  const moduleMat = track(new MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.45, metalness: 0.4 }));
  const screenGeo = track(new PlaneGeometry(19, 7.5));
  const ledGeo = track(new SphereGeometry(2, 14, 10));
  const ringGeo = track(new RingGeometry(3.4, 4.6, 32));
  const shadowGeo = track(new PlaneGeometry(112, 56));
  const shadowTex = track(shadowTexture());
  const shadowMat = track(
    new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.8 }),
  );

  const wireMaterials = [0xd6202a, 0x2060d8, 0xe8c020].map((color) =>
    track(new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 })),
  );
  const wireGeos = [
    [new Vector3(8, 6, 6), new Vector3(2, 14, 11), new Vector3(-8, 12, 10), new Vector3(-12, 4, 10)],
    [new Vector3(9, 5, 6), new Vector3(4, 17, 13), new Vector3(-3, 16, 12), new Vector3(-10, 3, 10)],
    [new Vector3(10, 4, 6), new Vector3(10, 9, 15), new Vector3(0, 9, 14), new Vector3(-9, 2, 10)],
  ].map((pts) => track(new TubeGeometry(new CatmullRomCurve3(pts), 24, 0.85, 6, false)));

  let model: Object3D | null = null;
  if (modelUrl) {
    try {
      const gltf = await new GLTFLoader().loadAsync(modelUrl);
      model = gltf.scene;
    } catch {
      model = null;
    }
  }

  const make = (): C4 => {
    const group = new Group();
    const body = new Group();
    group.add(body);

    // A soft shadow behind, so the charge stands out from any page colour.
    const shadow = new Mesh(shadowGeo, shadowMat);
    shadow.position.set(6, -9, -7);
    group.add(shadow);

    const timerCanvas = document.createElement("canvas");
    timerCanvas.width = 160;
    timerCanvas.height = 64;
    drawTimer(timerCanvas, "--");
    const timerTex = new CanvasTexture(timerCanvas);
    timerTex.colorSpace = SRGBColorSpace;
    const screenMat = new MeshBasicMaterial({ map: timerTex });

    const ledMat = new MeshStandardMaterial({
      color: 0x2a0606,
      emissive: 0xff2a1a,
      emissiveIntensity: 0,
      roughness: 0.3,
    });
    const pingMat = new MeshBasicMaterial({ color: 0x55ff8e, transparent: true, opacity: 0, depthWrite: false });
    const ping = new Mesh(ringGeo, pingMat);
    ping.position.set(23, 5, 9);

    if (model) {
      const clone = model.clone(true);
      body.add(clone);
    } else {
      const block = new Mesh(blockGeo, blockMat);
      body.add(block);
      const tape = new Mesh(tapeGeo, tapeMat);
      tape.position.x = -9;
      body.add(tape);
      const tape2 = new Mesh(tapeGeo, tapeMat);
      tape2.position.x = 14;
      body.add(tape2);

      const casing = new Mesh(caseGeo, caseMat);
      casing.position.set(14, 18, 1);
      body.add(casing);
      const cap = new Mesh(capGeo, capMat);
      cap.position.set(14, 24.5, 1);
      body.add(cap);

      const mod = new Mesh(moduleGeo, moduleMat);
      mod.position.set(-12, 0, 9.4);
      body.add(mod);
      const screen = new Mesh(screenGeo, screenMat);
      screen.position.set(-12, 0, 11.5);
      body.add(screen);

      const led = new Mesh(ledGeo, ledMat);
      led.position.set(23, 5, 9.5);
      body.add(led);

      wireGeos.forEach((geo, i) => {
        const wire = new Mesh(geo, wireMaterials[i]);
        wire.position.set(6, 12, 1);
        body.add(wire);
      });
    }
    body.add(ping);

    // Seen slightly from above and from the side, like a prop on a surface.
    body.rotation.set(0.5, -0.42, 0.06);
    body.position.y = 12;
    group.scale.setScalar(scale);
    group.visible = false;

    let lastText = "";
    return {
      group,
      setTimer(text) {
        if (text === lastText) return;
        lastText = text;
        drawTimer(timerCanvas, text);
        timerTex.needsUpdate = true;
      },
      animate(age, nowMs) {
        if (age < 0) {
          group.visible = false;
          return;
        }
        group.visible = true;
        const k = Math.min(1, age / 0.32);
        const s = scale * Math.max(0.001, easeOutBack(k));
        group.scale.setScalar(s);
        body.position.y = 12 + (1 - k) * 46;

        // Arming: a green ring confirms the placement, then the light blinks red.
        const p = Math.min(1, Math.max(0, (age - 0.25) / 0.7));
        pingMat.opacity = p > 0 && p < 1 ? (1 - p) * 0.95 : 0;
        ping.scale.setScalar(1 + p * 4.5);
        if (age > 0.7) {
          const on = Math.floor(nowMs / 500) % 2 === 0;
          ledMat.emissiveIntensity = on ? 3.2 : 0.15;
        } else {
          ledMat.emissiveIntensity = 0;
        }
      },
    };
  };

  return {
    make,
    dispose() {
      for (const item of disposables) item.dispose();
      for (const m of [...wireMaterials] as Material[]) m.dispose();
    },
  };
}

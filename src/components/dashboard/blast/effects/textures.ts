import { CanvasTexture, SRGBColorSpace } from "three";

/** Soft blobs drawn on a canvas, used as particle sprites (no image files needed). */
export function puffTexture(kind: "fire" | "smoke" | "spark" | "ember", size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  const c = size / 2;

  const blob = (x: number, y: number, r: number, stops: Array<[number, string]>) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };

  if (kind === "spark") {
    blob(c, c, c, [
      [0, "rgba(255,255,255,1)"],
      [0.25, "rgba(255,226,150,0.95)"],
      [1, "rgba(255,140,30,0)"],
    ]);
  } else if (kind === "ember") {
    blob(c, c, c * 0.8, [
      [0, "rgba(255,230,160,1)"],
      [0.4, "rgba(255,130,30,0.8)"],
      [1, "rgba(200,40,0,0)"],
    ]);
  } else {
    // Several overlapping blobs make an irregular, billowing shape.
    const seed = kind === "fire" ? 3 : 11;
    let a = seed;
    const rand = () => {
      a = (a * 16807) % 2147483647;
      return a / 2147483647;
    };
    const stops: Array<[number, string]> =
      kind === "fire"
        ? [
            [0, "rgba(255,255,255,0.9)"],
            [0.35, "rgba(255,255,255,0.55)"],
            [1, "rgba(255,255,255,0)"],
          ]
        : [
            [0, "rgba(255,255,255,0.7)"],
            [0.5, "rgba(255,255,255,0.35)"],
            [1, "rgba(255,255,255,0)"],
          ];
    blob(c, c, c * 0.95, stops);
    for (let i = 0; i < 9; i += 1) {
      const ang = rand() * Math.PI * 2;
      const dist = rand() * c * 0.38;
      blob(c + Math.cos(ang) * dist, c + Math.sin(ang) * dist, c * (0.35 + rand() * 0.3), stops);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The stamped, printed look of a wrapped block of plastic explosive. */
export function filmTexture() {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#cdc3a4";
  g.fillRect(0, 0, w, h);

  // A mottled, slightly greasy surface.
  let a = 5;
  const rand = () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
  for (let i = 0; i < 2600; i += 1) {
    const v = 150 + Math.floor(rand() * 70);
    g.fillStyle = `rgba(${v},${v - 8},${v - 40},${0.05 + rand() * 0.12})`;
    g.fillRect(rand() * w, rand() * h, 2 + rand() * 12, 1 + rand() * 6);
  }
  // Wrapping creases and seams.
  g.strokeStyle = "rgba(90,80,55,0.35)";
  g.lineWidth = 1.5;
  for (const x of [34, 478]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 3, h);
    g.stroke();
  }
  g.strokeStyle = "rgba(255,250,230,0.18)";
  for (let i = 0; i < 7; i += 1) {
    g.beginPath();
    g.moveTo(rand() * w, rand() * h);
    g.lineTo(rand() * w, rand() * h);
    g.stroke();
  }
  // Stencilled lettering.
  g.fillStyle = "rgba(38,34,24,0.82)";
  g.textBaseline = "middle";
  g.font = "700 30px 'Courier New', monospace";
  g.fillText("COMPOSITION C-4", 56, 62);
  g.font = "700 20px 'Courier New', monospace";
  g.fillText("EXPLOSIVE  •  M112  •  1.25 LB", 56, 108);
  g.font = "600 15px 'Courier New', monospace";
  g.fillText("LOT 0412-87   DANGER   HANDLE WITH CARE", 56, 150);
  g.fillRect(56, 178, 400, 3);
  g.font = "700 22px 'Courier New', monospace";
  g.fillText("NET WT 568 g", 56, 214);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A soft dark patch that sits under a charge so it stands out from the page. */
export function shadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const grad = g.createRadialGradient(64, 32, 4, 64, 32, 62);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.save();
  g.scale(1, 0.5);
  g.fillRect(0, 0, 128, 128);
  g.restore();
  return new CanvasTexture(canvas);
}

/** A little red seven-segment-style display. */
export function drawTimer(canvas: HTMLCanvasElement, text: string) {
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#0a0a08";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.font = "700 34px 'Courier New', monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "rgba(255,40,30,0.12)";
  g.fillText("88:88", canvas.width / 2, canvas.height / 2 + 1);
  g.shadowColor = "rgba(255,50,30,0.9)";
  g.shadowBlur = 8;
  g.fillStyle = "#ff3b2a";
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
}

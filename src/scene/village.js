import * as THREE from "three";
import { createRain } from "./rain.js";
import { createCrowd } from "./people.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* -------------------------------------------------------------------------- */
/*  Village / countryside stage                                               */
/* -------------------------------------------------------------------------- */

const TAU = Math.PI * 2;
// The car drives in the left-hand lane. Centring it between the painted lines
// keeps its wheels off the verge and leaves the lane clear ahead.
export const VILLAGE_LANE_Z = 2.05;
// The edge lines sit at ±4.1 m, so each driving lane is 4.1 m wide. 2.05 keeps
// the car dead centre between the centre line and the edge line; the old 4.1
// offset put its left wheels on the verge.
const LANE_FAR = -VILLAGE_LANE_Z;
// The road runs well past the fog's far plane so its end is never visible as a
// hard edge on the horizon. The village itself still occupies the middle of it.
const ROAD_LENGTH = 1100;
const ROAD_WIDTH = 9;
const CYCLE = 360;
// Houses and roadside furniture use a longer loop than the traffic so the
// scenery can extend past the far bend and wrap where the fog and hills hide
// it. Traffic still cycles on CYCLE.
const SCENERY_CYCLE = 520;
const START = -190;
const END = START + CYCLE;
const TILE = 8;

/**
 * 2D oriented-box overlap. Each box is {x, z, heading, halfLength, halfWidth}.
 * The village car sits at a fixed x while the road scrolls, so the same SAT
 * test used by the Tokyo traffic keeps a vehicle from driving through it.
 */
function obbOverlap(a, b, margin = 0) {
  const ca = Math.cos(a.heading);
  const sa = Math.sin(a.heading);
  const cb = Math.cos(b.heading);
  const sb = Math.sin(b.heading);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const axes = [
    [ca, -sa],
    [sa, ca],
    [cb, -sb],
    [sb, cb],
  ];
  const ahl = a.halfLength + margin;
  const ahw = a.halfWidth + margin;
  const bhl = b.halfLength + margin;
  const bhw = b.halfWidth + margin;
  for (const [ax, az] of axes) {
    const ra =
      ahl * Math.abs(ax * ca - az * sa) +
      ahw * Math.abs(ax * sa + az * ca);
    const rb =
      bhl * Math.abs(ax * cb - az * sb) +
      bhw * Math.abs(ax * sb + az * cb);
    if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
  }
  return true;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas2d(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d") };
}

function texture(canvas, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso;
  return tex;
}

/* -------------------------------------------------------------------------- */
/*  Textures                                                                  */
/* -------------------------------------------------------------------------- */

function makeGrassTexture() {
  const { canvas, ctx } = canvas2d(1024, 1024);
  const rand = seeded(21);
  ctx.fillStyle = "#5d7a3d";
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 26000; i++) {
    const x = rand() * 1024;
    const y = rand() * 1024;
    const g = 70 + Math.floor(rand() * 70);
    const r = 38 + Math.floor(rand() * 48);
    const b = 24 + Math.floor(rand() * 32);
    ctx.fillStyle = `rgba(${r},${g},${b},${0.1 + rand() * 0.35})`;
    ctx.fillRect(x, y, 1 + rand() * 2.4, 1 + rand() * 4);
  }

  // Dry patches and darker clumps, painted as irregular clusters rather than
  // uniform noise so the ground does not look like a flat green carpet.
  for (let i = 0; i < 90; i++) {
    const x = rand() * 1024;
    const y = rand() * 1024;
    const r = 10 + rand() * 48;
    const dry = rand() > 0.55;
    ctx.fillStyle = dry
      ? `rgba(142,132,74,${0.05 + rand() * 0.09})`
      : `rgba(38,66,31,${0.05 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rand() * 0.8), rand() * TAU, 0, TAU);
    ctx.fill();
  }

  // Tiny wildflowers: sharp specks, not soft bokeh.
  for (let i = 0; i < 420; i++) {
    const x = rand() * 1024;
    const y = rand() * 1024;
    ctx.fillStyle =
      rand() > 0.55 ? "rgba(238,232,196,0.75)" : "rgba(224,196,92,0.7)";
    ctx.fillRect(x, y, 1.2, 1.2);
  }

  return texture(canvas, { aniso: 8 });
}

function makeRoadTexture() {
  const { canvas, ctx } = canvas2d(1024, 512);
  const rand = seeded(33);
  ctx.fillStyle = "#858a8d";
  ctx.fillRect(0, 0, 1024, 512);

  for (let i = 0; i < 22000; i++) {
    const x = rand() * 1024;
    const y = rand() * 512;
    const light = rand() > 0.52;
    const a = 0.015 + rand() * 0.06;
    ctx.fillStyle = light
      ? `rgba(214,220,224,${a})`
      : `rgba(8,10,12,${a})`;
    ctx.fillRect(x, y, 1 + rand() * 2.2, 1 + rand() * 2.2);
  }

  // Worn wheel tracks.
  for (const y of [120, 392]) {
    const g = ctx.createLinearGradient(0, y - 46, 0, y + 60);
    g.addColorStop(0, "rgba(20,23,26,0)");
    g.addColorStop(0.5, "rgba(20,23,26,0.24)");
    g.addColorStop(1, "rgba(20,23,26,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 46, 1024, 106);
  }

  // Worn centre dashes. The texture repeats once across the road width, so a
  // line at v = 0.5 lands exactly on the centre of the carriageway.
  ctx.fillStyle = "rgba(226,222,204,0.74)";
  for (let i = 0; i < 2; i++) {
    const x = i * 512 + 48;
    ctx.fillRect(x, 253, 300, 5);
    ctx.fillStyle = "rgba(92,88,76,0.26)";
    ctx.fillRect(x + 20, 257, 260, 1.5);
    ctx.fillStyle = "rgba(226,222,204,0.74)";
  }

  // Gravel and grass creeping in at the edges.
  for (let i = 0; i < 900; i++) {
    const edge = rand() > 0.5;
    const x = rand() * 1024;
    const y = edge ? rand() * 26 : 512 - rand() * 26;
    ctx.fillStyle = `rgba(120,112,82,${0.1 + rand() * 0.3})`;
    ctx.fillRect(x, y, 1 + rand() * 3, 1 + rand() * 3);
  }

  // Tar seams and patched repairs.
  for (let i = 0; i < 9; i++) {
    const x = rand() * 1024;
    const y = rand() * 512;
    ctx.strokeStyle = `rgba(10,12,14,${0.3 + rand() * 0.28})`;
    ctx.lineWidth = 2 + rand() * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + 50,
      y + (rand() - 0.5) * 40,
      x + 130,
      y + (rand() - 0.5) * 30,
      x + 220,
      y + (rand() - 0.5) * 50
    );
    ctx.stroke();
  }

  return texture(canvas, { aniso: 8 });
}

function makeGravelTexture() {
  const { canvas, ctx } = canvas2d(512, 512);
  const rand = seeded(44);
  ctx.fillStyle = "#77715f";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const v = 70 + Math.floor(rand() * 80);
    ctx.fillStyle = `rgba(${v + 20},${v + 16},${v},${0.2 + rand() * 0.5})`;
    ctx.fillRect(x, y, 1 + rand() * 2.5, 1 + rand() * 2.5);
  }
  return texture(canvas, { aniso: 4 });
}

function makeCropTexture(golden) {
  const { canvas, ctx } = canvas2d(512, 512);
  const rand = seeded(golden ? 71 : 72);
  ctx.fillStyle = golden ? "#8f7838" : "#4f6b34";
  ctx.fillRect(0, 0, 512, 512);

  for (let row = 0; row < 34; row++) {
    const y = row * 15;
    ctx.fillStyle = golden
      ? `rgba(206,178,92,${0.18 + rand() * 0.24})`
      : `rgba(86,120,52,${0.18 + rand() * 0.26})`;
    ctx.fillRect(0, y, 512, 4 + rand() * 5);
    ctx.fillStyle = "rgba(18,26,14,0.18)";
    ctx.fillRect(0, y + 9, 512, 2);
  }
  for (let i = 0; i < 8000; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    ctx.fillStyle = golden
      ? `rgba(236,214,140,${rand() * 0.25})`
      : `rgba(144,176,92,${rand() * 0.22})`;
    ctx.fillRect(x, y, 1, 1 + rand() * 3);
  }
  return texture(canvas, { aniso: 4 });
}

function makeStoneTexture() {
  const { canvas, ctx } = canvas2d(512, 512);
  const rand = seeded(515);
  ctx.fillStyle = "#8a877c";
  ctx.fillRect(0, 0, 512, 512);

  // Irregular courses of field stone with pale mortar joints.
  let y = 0;
  let row = 0;
  while (y < 512) {
    const h = 28 + rand() * 24;
    let x = row % 2 ? -20 - rand() * 22 : 0;
    while (x < 512) {
      const w = 34 + rand() * 48;
      const tone = 118 + Math.floor(rand() * 66);
      ctx.fillStyle = `rgb(${tone + 12},${tone + 9},${tone - 4})`;
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 3);
      ctx.lineTo(x + w - 3, y + 2 + rand() * 3);
      ctx.lineTo(x + w - 2 - rand() * 4, y + h - 3);
      ctx.lineTo(x + 3 + rand() * 3, y + h - 2 - rand() * 3);
      ctx.closePath();
      ctx.fill();

      // Highlight and shadow edges give each stone a chiselled read.
      ctx.strokeStyle = "rgba(236,231,216,0.18)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + w - 5, y + 3);
      ctx.stroke();
      ctx.strokeStyle = "rgba(24,22,18,0.28)";
      ctx.beginPath();
      ctx.moveTo(x + 4, y + h - 4);
      ctx.lineTo(x + w - 4, y + h - 4);
      ctx.stroke();

      x += w;
    }
    y += h;
    row++;
  }

  for (let i = 0; i < 9000; i++) {
    const px = rand() * 512;
    const py = rand() * 512;
    ctx.fillStyle =
      rand() > 0.5
        ? `rgba(255,250,235,${rand() * 0.05})`
        : `rgba(20,18,14,${rand() * 0.07})`;
    ctx.fillRect(px, py, 1 + rand() * 2, 1 + rand() * 2);
  }

  return texture(canvas, { aniso: 4 });
}

function makeWindowTexture() {
  const { canvas, ctx } = canvas2d(128, 160);
  // Baked sky reflection: pale at the top, deep blue-grey at the bottom. It
  // gives every window a believable glassy read even when the env map has no
  // bright sky in the reflected direction.
  const grad = ctx.createLinearGradient(0, 0, 36, 160);
  grad.addColorStop(0, "#a8c2d1");
  grad.addColorStop(0.26, "#7694a5");
  grad.addColorStop(0.55, "#3b5360");
  grad.addColorStop(1, "#1d2d35");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 160);

  ctx.fillStyle = "rgba(230,240,244,0.2)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(46, 0);
  ctx.lineTo(10, 160);
  ctx.lineTo(0, 160);
  ctx.closePath();
  ctx.fill();

  // A curtain edge on one side keeps the panes from looking like empty holes.
  ctx.fillStyle = "rgba(226,214,186,0.16)";
  ctx.fillRect(98, 0, 13, 160);

  return texture(canvas, { aniso: 4 });
}

function makeWarmWindowTexture() {
  const { canvas, ctx } = canvas2d(128, 160);
  const grad = ctx.createLinearGradient(0, 0, 30, 160);
  grad.addColorStop(0, "#ffe8bd");
  grad.addColorStop(0.42, "#f2c17a");
  grad.addColorStop(1, "#a96c38");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 160);

  // Curtains at both edges and a soft lamp glow in the upper pane.
  ctx.fillStyle = "rgba(112,64,32,0.32)";
  ctx.fillRect(0, 0, 20, 160);
  ctx.fillRect(108, 0, 20, 160);
  const glow = ctx.createRadialGradient(64, 52, 3, 64, 52, 58);
  glow.addColorStop(0, "rgba(255,248,214,0.85)");
  glow.addColorStop(1, "rgba(255,220,150,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 160);

  return texture(canvas, { aniso: 4 });
}

function makeFlowerTexture() {
  const { canvas, ctx } = canvas2d(64, 64);
  const rand = seeded(616);
  ctx.fillStyle = "#31452a";
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 90; i++) {
    const x = rand() * 64;
    const y = rand() * 64;
    const tone = rand();
    ctx.fillStyle =
      tone > 0.55
        ? "#b8302c"
        : tone > 0.3
          ? "#d9a63c"
          : tone > 0.14
            ? "#e8dfc8"
            : "#416b32";
    ctx.fillRect(x, y, 1.6 + rand() * 2.2, 1.6 + rand() * 2.2);
  }
  return texture(canvas, { aniso: 2 });
}

function makeRoofTexture() {
  const { canvas, ctx } = canvas2d(512, 512);
  const rand = seeded(717);
  ctx.fillStyle = "#9a8877";
  ctx.fillRect(0, 0, 512, 512);

  // Overlapping clay tiles: each course is a row of rounded scallops with a
  // shadow under the lip and a pale top edge. Kept low-contrast so the roof
  // reads as weathered clay rather than a graphic pattern.
  const course = 26;
  for (let row = 0; row < 20; row++) {
    const y = row * course;
    const offset = row % 2 ? 16 : 0;
    for (let x = -32; x < 512; x += 32) {
      const tone = 128 + Math.floor(rand() * 46);
      ctx.fillStyle = `rgb(${tone + 16},${tone + 4},${tone - 12})`;
      ctx.beginPath();
      ctx.moveTo(x + offset, y);
      ctx.lineTo(x + offset + 30, y);
      ctx.lineTo(x + offset + 28, y + course - 4);
      ctx.quadraticCurveTo(
        x + offset + 15,
        y + course + 2,
        x + offset + 2,
        y + course - 4
      );
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(46,32,24,0.28)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,240,220,0.08)";
      ctx.fillRect(x + offset + 3, y + 1, 24, 1.6);
    }
    ctx.fillStyle = "rgba(38,27,20,0.2)";
    ctx.fillRect(0, y + course - 2, 512, 2);
  }

  // Moss and rain streaks.
  for (let i = 0; i < 120; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    ctx.fillStyle =
      rand() > 0.55
        ? `rgba(68,84,44,${0.06 + rand() * 0.14})`
        : `rgba(40,30,22,${0.04 + rand() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + rand() * 18, 2 + rand() * 8, rand() * TAU, 0, TAU);
    ctx.fill();
  }

  const tex = texture(canvas, { aniso: 4 });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

function makeHedgeTexture() {
  const { canvas, ctx } = canvas2d(512, 256);
  const rand = seeded(818);
  ctx.fillStyle = "#1d2b17";
  ctx.fillRect(0, 0, 512, 256);

  // Dense small leaves with dark gaps, so a flat hedge volume still reads as
  // foliage up close instead of a painted green box.
  for (let i = 0; i < 9000; i++) {
    const x = rand() * 512;
    const y = rand() * 256;
    const tone = rand();
    ctx.fillStyle =
      tone > 0.72
        ? `rgba(${96 + rand() * 44},${126 + rand() * 40},${58 + rand() * 28},${0.5 + rand() * 0.4})`
        : tone > 0.3
          ? `rgba(${54 + rand() * 34},${80 + rand() * 34},${34 + rand() * 22},${0.5 + rand() * 0.4})`
          : `rgba(${24 + rand() * 22},${42 + rand() * 24},${18 + rand() * 16},${0.45 + rand() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      1.2 + rand() * 3.2,
      0.8 + rand() * 1.8,
      rand() * TAU,
      0,
      TAU
    );
    ctx.fill();
  }

  const tex = texture(canvas, { aniso: 4 });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 1);
  return tex;
}

function makePlasterTexture(seed, base = seed % 2 ? "#d9d1bd" : "#cfc6b2") {
  const { canvas, ctx } = canvas2d(512, 512);
  const rand = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 12000; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    ctx.fillStyle =
      rand() > 0.5
        ? `rgba(255,255,255,${rand() * 0.045})`
        : `rgba(58,52,40,${rand() * 0.05})`;
    ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
  }
  // Broad, soft weathering patches. The old version painted long horizontal
  // streaks across the whole canvas, which tiled into clapboard-like bands on
  // every wall. Radial patches keep the render mottled without reading as
  // siding.
  for (let i = 0; i < 44; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 14 + rand() * 52;
    const patch = ctx.createRadialGradient(x, y, 0, x, y, r);
    patch.addColorStop(0, `rgba(120,104,78,${0.02 + rand() * 0.035})`);
    patch.addColorStop(1, "rgba(120,104,78,0)");
    ctx.fillStyle = patch;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return texture(canvas, { aniso: 4 });
}

function makeSkyTexture(overcast = false) {
  const { canvas, ctx } = canvas2d(1024, 512);
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  // On a sphere the horizon sits at v = 0.5, so all of the warm horizon colour
  // has to live in the upper half of the texture. Painting it lower (as the
  // first version did) hid the entire golden band below the ground plane.
  if (overcast) {
    grad.addColorStop(0, "#4b5a68");
    grad.addColorStop(0.22, "#687987");
    grad.addColorStop(0.38, "#8e9ca6");
    grad.addColorStop(0.46, "#b3bcbe");
    grad.addColorStop(0.5, "#c6cbc6");
    grad.addColorStop(0.56, "#9aa49b");
    grad.addColorStop(1, "#7d877d");
  } else {
    grad.addColorStop(0, "#2f609c");
    grad.addColorStop(0.2, "#5b8dbb");
    grad.addColorStop(0.36, "#95b8d0");
    grad.addColorStop(0.44, "#d9c9a7");
    grad.addColorStop(0.49, "#f3c98e");
    grad.addColorStop(0.53, "#d8ae74");
    grad.addColorStop(0.62, "#a8916c");
    grad.addColorStop(1, "#7d735e");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  const rand = seeded(overcast ? 91 : 92);

  if (!overcast) {
    // Warm sun glow at the horizon. It is painted into the sky rather than a
    // sprite, so it stays perfectly sharp.
    const sun = ctx.createRadialGradient(320, 248, 4, 320, 248, 170);
    sun.addColorStop(0, "rgba(255,246,214,0.95)");
    sun.addColorStop(0.16, "rgba(255,222,158,0.5)");
    sun.addColorStop(0.46, "rgba(255,198,128,0.18)");
    sun.addColorStop(1, "rgba(255,190,120,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(130, 78, 380, 330);
  }

  // Cloud banks. Soft-edged by design, but painted at full resolution so they
  // do not turn into low-res blurry dots when the camera looks up.
  for (let i = 0; i < 12; i++) {
    const x = rand() * 1024;
    const y = 86 + rand() * 142;
    const rx = 60 + rand() * 150;
    const ry = 8 + rand() * 22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(
      0,
      overcast
        ? "rgba(214,222,226,0.32)"
        : i % 3 === 0
          ? "rgba(255,231,196,0.4)"
          : "rgba(255,248,236,0.34)"
    );
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  return texture(canvas, { repeat: false, aniso: 2 });
}

function makeVillageSignTexture() {
  const { canvas, ctx } = canvas2d(512, 256);
  const rand = seeded(77);

  ctx.fillStyle = "#2c4634";
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${18 + rand() * 26},${32 + rand() * 30},${22 + rand() * 24},${0.2 + rand() * 0.3})`;
    ctx.fillRect(rand() * 512, rand() * 256, 1 + rand() * 3, 1 + rand() * 3);
  }

  ctx.strokeStyle = "rgba(233,222,190,0.82)";
  ctx.lineWidth = 5;
  ctx.strokeRect(18, 18, 476, 220);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(29, 29, 454, 198);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(233,222,190,0.8)";
  ctx.font = "500 22px Georgia, serif";
  ctx.letterSpacing = "7px";
  ctx.fillText("WELCOME TO", 256, 68);

  ctx.fillStyle = "#f3e8cd";
  ctx.font = "italic 700 58px Georgia, serif";
  ctx.letterSpacing = "1px";
  ctx.fillText("Little Halden", 256, 132);

  ctx.strokeStyle = "rgba(233,222,190,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(150, 171);
  ctx.lineTo(362, 171);
  ctx.stroke();

  ctx.fillStyle = "rgba(233,222,190,0.78)";
  ctx.font = "500 21px Georgia, serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("PLEASE DRIVE SLOWLY", 256, 202);

  return texture(canvas, { repeat: false, aniso: 8 });
}

function makePhoneSignTexture() {
  const { canvas, ctx } = canvas2d(256, 64);
  ctx.fillStyle = "#efe6cf";
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = "#8f2119";
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.fillStyle = "#8f2119";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 25px Georgia, serif";
  ctx.letterSpacing = "2px";
  ctx.fillText("TELEPHONE", 128, 34);
  return texture(canvas, { repeat: false, aniso: 8 });
}

/* -------------------------------------------------------------------------- */
/*  Geometry helpers                                                          */
/* -------------------------------------------------------------------------- */

function makeRoofGeometry(w, d, rise) {
  const hw = w / 2;
  const hd = d / 2;
  const positions = [
    // +z slope
    -hw, 0, hd, hw, 0, hd, hw, rise, 0, -hw, rise, 0,
    // -z slope
    -hw, rise, 0, hw, rise, 0, hw, 0, -hd, -hw, 0, -hd,
    // -x gable
    -hw, 0, hd, -hw, rise, 0, -hw, 0, -hd,
    // +x gable
    hw, 0, hd, hw, 0, -hd, hw, rise, 0,
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10,
    11, 12, 13,
  ];
  const uvs = [
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 0.5, 1,
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// Houses are built from dozens of small boxes for the trim, frames, shutters
// and sills. Baking those into one mesh per material keeps the extra detail
// from turning into hundreds of draw calls per house.
function mergeStaticGroup(root) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((node) => {
    if (!node.isMesh) return;
    let bucket = buckets.get(node.material);
    if (!bucket) {
      bucket = { material: node.material, geometries: [] };
      buckets.set(node.material, bucket);
    }
    let geometry = node.geometry.clone();
    // Primitives are indexed, but the flower blobs are not. Normalise before
    // merging so a single material bucket can hold both.
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }
    geometry.applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld)
    );
    bucket.geometries.push(geometry);
  });

  const meshes = [];
  for (const { material, geometries } of buckets.values()) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) {
      // Keep the detail rather than dropping a material if the attribute sets
      // ever diverge.
      for (const geometry of geometries) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        meshes.push(mesh);
      }
      continue;
    }
    geometries.forEach((geometry) => geometry.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }

  for (const child of [...root.children]) root.remove(child);
  root.add(...meshes);
  return root;
}

/* -------------------------------------------------------------------------- */
/*  Environment map                                                           */
/* -------------------------------------------------------------------------- */

function makeEnvironment(renderer, skyTexture) {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x93b5cf);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 24, 12),
    new THREE.MeshBasicMaterial({
      map: skyTexture,
      side: THREE.BackSide,
      toneMapped: false,
      fog: false,
    })
  );
  envScene.add(sky);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(58, 24),
    new THREE.MeshBasicMaterial({ color: 0x4d5b37, toneMapped: false })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  envScene.add(ground);

  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({ color: 0xfff0cd, toneMapped: false })
  );
  sun.position.set(-34, 34, 40);
  sun.lookAt(0, 2, 0);
  envScene.add(sun);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.02, 0.1, 160);
  envScene.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    object.material.dispose();
  });
  pmrem.dispose();
  return target.texture;
}

/* -------------------------------------------------------------------------- */
/*  Stage                                                                     */
/* -------------------------------------------------------------------------- */

export function createVillage(renderer) {
  const group = new THREE.Group();
  group.name = "Village";
  // The village is built in world space: the road centre is z = 0 and the car
  // drives in the near lane at VILLAGE_LANE_Z. Keeping the group at the origin
  // means camera, traffic and collision all share the same coordinates.
  group.visible = false;

  const rand = seeded(2026);
  const props = [];
  const farProps = [];
  const windmills = [];
  const roadActors = [];
  const scrollingBatches = [];

  // Instanced scenery that has to travel with the road. A single InstancedMesh
  // holds a short repeating ribbon of clumps; each frame the ribbon scrolls and
  // each clump wraps at the ends, so distinct bushes and grass tufts move past
  // the car instead of hovering in place.
  const batchMatrix = new THREE.Matrix4();
  const batchQuat = new THREE.Quaternion();
  const batchEuler = new THREE.Euler();
  const batchPos = new THREE.Vector3();
  const batchScale = new THREE.Vector3();

  // A single shared clock drives a tiny vertex-shader sway on foliage. Doing
  // this on the GPU keeps thousands of leaves and grass blades moving without
  // rebuilding a single instance matrix on the CPU.
  const windTime = { value: 0 };
  function addWind(material, { strength, mask, phase, key }) {
    const sx = strength.toFixed(3);
    const sz = (strength * 0.65).toFixed(3);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = windTime;
      shader.vertexShader = `uniform float uWindTime;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float windPhase = uWindTime * 1.25 + ${phase};
        float windMask = ${mask};
        transformed.x += sin(windPhase) * ${sx} * windMask;
        transformed.z += cos(windPhase * 0.83 + 1.7) * ${sz} * windMask;`
      );
    };
    material.customProgramCacheKey = () => key;
  }

  function addScrollingBatch(mesh, items, span, rate = 1) {
    const batch = { mesh, items, span, offset: 0, rate };
    scrollingBatches.push(batch);
    writeScrollingBatch(batch);
  }

  function writeScrollingBatch(batch) {
    const { mesh, items, span, offset } = batch;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let x = item.x - offset;
      if (x < -span / 2) x += span;
      else if (x > span / 2) x -= span;
      batchPos.set(x, item.y, item.z);
      batchEuler.set(item.rx || 0, item.ry || 0, item.rz || 0);
      batchQuat.setFromEuler(batchEuler);
      batchScale.set(item.sx, item.sy, item.sz);
      batchMatrix.compose(batchPos, batchQuat, batchScale);
      mesh.setMatrixAt(i, batchMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------- sky ---------------------------------- */
  const clearSky = makeSkyTexture(false);
  const rainSky = makeSkyTexture(true);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(320, 40, 24),
    new THREE.MeshBasicMaterial({
      map: clearSky,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  sky.name = "VillageSky";
  sky.renderOrder = -30;
  group.add(sky);

  /* ------------------------------ ground -------------------------------- */
  const grassTexture = makeGrassTexture();
  grassTexture.repeat.set(105, 70);
  // Vertex colours add the broad meadow variation the 15 m texture tile cannot:
  // sunlit patches, cooler hollows and a little warm/cool drift across the
  // fields. The texture still supplies the blade-level detail.
  const grassGeo = new THREE.PlaneGeometry(1600, 1100, 56, 40);
  {
    const pos = grassGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const broad =
        Math.sin(x * 0.018 + 1.3) * Math.cos(y * 0.021 - 0.7) * 0.55 +
        Math.sin(x * 0.007 - y * 0.011) * 0.45;
      const fine = Math.sin(x * 0.09 + y * 0.07) * 0.05;
      const t = 0.86 + broad * 0.11 + fine;
      const warm = Math.sin(x * 0.012 + y * 0.017) * 0.5 + 0.5;
      colors[i * 3] = t * (0.92 + warm * 0.09);
      colors[i * 3 + 1] = t;
      colors[i * 3 + 2] = t * (0.84 + warm * 0.08);
    }
    grassGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  const grass = new THREE.Mesh(
    grassGeo,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: grassTexture,
      vertexColors: true,
      roughness: 0.98,
      metalness: 0.0,
      envMapIntensity: 0.18,
    })
  );
  grass.name = "VillageGround";
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, -0.02, 0);
  grass.receiveShadow = true;
  group.add(grass);

  /* ------------------------------- road --------------------------------- */
  const roadTexture = makeRoadTexture();
  roadTexture.repeat.set(ROAD_LENGTH / TILE, 1);
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0xe0e2de,
    map: roadTexture,
    roughness: 0.86,
    metalness: 0.04,
    envMapIntensity: 0.3,
  });
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_LENGTH, ROAD_WIDTH),
    roadMaterial
  );
  road.name = "VillageRoad";
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, 0);
  road.receiveShadow = true;
  group.add(road);

  const gravelTexture = makeGravelTexture();
  gravelTexture.repeat.set(ROAD_LENGTH / 4, 1);
  const gravelMaterial = new THREE.MeshStandardMaterial({
    color: 0x91866b,
    map: gravelTexture,
    roughness: 0.97,
    metalness: 0.0,
    envMapIntensity: 0.16,
  });
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_LENGTH, 1.25),
      gravelMaterial
    );
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(0, 0.002, side * (ROAD_WIDTH / 2 + 0.55));
    shoulder.receiveShadow = true;
    group.add(shoulder);
  }

  // A faint, worn edge line on each side of the lane.
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xc4c0ae,
    roughness: 0.8,
    metalness: 0.0,
    transparent: true,
    opacity: 0.62,
  });
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LENGTH, 0.12), edgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(0, 0.006, side * 4.1);
    group.add(edge);
  }

  /* ----------------------------- fields --------------------------------- */
  const cropGreen = makeCropTexture(false);
  cropGreen.repeat.set(28, 10);
  const cropGold = makeCropTexture(true);
  cropGold.repeat.set(28, 10);
  const fieldMats = [
    new THREE.MeshStandardMaterial({
      color: 0xf0f2dc,
      map: cropGreen,
      roughness: 0.98,
      metalness: 0.0,
      envMapIntensity: 0.18,
    }),
    new THREE.MeshStandardMaterial({
      color: 0xfff0c8,
      map: cropGold,
      roughness: 0.98,
      metalness: 0.0,
      envMapIntensity: 0.18,
    }),
  ];
  // Crops start beyond the third row of houses. The old bands reached z = 15
  // and turned every front garden into a brown field, which is what made the
  // village look like a handful of boxes dropped in a ploughed desert.
  // Non-overlapping bands with a grass strip between them; overlapping planes
  // at the same height used to z-fight and read as muddy dark patches.
  const fieldBands = [
    { center: 96, depth: 26 },
    { center: 132, depth: 34 },
    { center: 178, depth: 44 },
    { center: 230, depth: 56 },
  ];
  for (const side of [-1, 1]) {
    for (let i = 0; i < fieldBands.length; i++) {
      const band = fieldBands[i];
      const field = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_LENGTH + 160, band.depth),
        fieldMats[(i + (side > 0 ? 1 : 0)) % 2]
      );
      field.rotation.x = -Math.PI / 2;
      field.position.set(0, -0.005, side * band.center);
      field.receiveShadow = true;
      group.add(field);
    }
  }

  /* ----------------------------- materials ------------------------------ */
  // Cream, ochre, whitewash, pale sage, warm clay and weathered stone. The
  // base colour lives in the texture so each wall reads as painted render
  // rather than the same beige box with a tint multiplied over it.
  const plasterTints = [
    ["#e9dfc9", 31],
    ["#d9c09a", 32],
    ["#f2ede1", 33],
    ["#c9cbb6", 34],
    ["#e2c6ae", 35],
    ["#b9b2a1", 36],
  ];
  const plasterMats = plasterTints.map(([base, seed]) => {
    const map = makePlasterTexture(seed, base);
    map.repeat.set(2, 1);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map,
      bumpMap: map,
      bumpScale: 0.012,
      roughness: 0.9,
      metalness: 0.0,
      envMapIntensity: 0.24,
    });
  });
  const roofTexture = makeRoofTexture();
  // Terracotta, weathered red, slate, pale clay and mossy grey. The texture
  // carries the tile pattern; these tints are light enough that the pattern
  // survives instead of crushing to near-black under the low sun.
  const roofMats = [
    new THREE.MeshStandardMaterial({ color: 0xd39a78, map: roofTexture, bumpMap: roofTexture, bumpScale: 0.02, roughness: 0.86, metalness: 0.02, envMapIntensity: 0.28 }),
    new THREE.MeshStandardMaterial({ color: 0xb27a60, map: roofTexture, bumpMap: roofTexture, bumpScale: 0.02, roughness: 0.86, metalness: 0.02, envMapIntensity: 0.28 }),
    new THREE.MeshStandardMaterial({ color: 0x8f9499, map: roofTexture, bumpMap: roofTexture, bumpScale: 0.02, roughness: 0.84, metalness: 0.05, envMapIntensity: 0.3 }),
    new THREE.MeshStandardMaterial({ color: 0xc4a184, map: roofTexture, bumpMap: roofTexture, bumpScale: 0.02, roughness: 0.88, metalness: 0.02, envMapIntensity: 0.24 }),
    new THREE.MeshStandardMaterial({ color: 0x9b9a80, map: roofTexture, bumpMap: roofTexture, bumpScale: 0.02, roughness: 0.9, metalness: 0.02, envMapIntensity: 0.22 }),
  ];
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x4a3827, roughness: 0.84, metalness: 0.0 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8577, roughness: 0.92, metalness: 0.02 });
  const yardTexture = grassTexture.clone();
  yardTexture.repeat.set(3, 3);
  yardTexture.needsUpdate = true;
  const yardMat = new THREE.MeshStandardMaterial({
    color: 0xc6d49e,
    map: yardTexture,
    roughness: 0.97,
    metalness: 0.0,
    envMapIntensity: 0.16,
  });
  const doorPanelMat = new THREE.MeshStandardMaterial({
    color: 0x3b2c1e,
    roughness: 0.88,
    metalness: 0.0,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xb08a4a,
    roughness: 0.32,
    metalness: 0.75,
    envMapIntensity: 0.8,
  });
  const potMat = new THREE.MeshStandardMaterial({
    color: 0x9a5a3c,
    roughness: 0.86,
    metalness: 0.0,
  });
  const gardenHedgeTexture = makeHedgeTexture();
  gardenHedgeTexture.repeat.set(7, 1);
  const gardenHedgeMat = new THREE.MeshStandardMaterial({
    color: 0x6a7f45,
    bumpMap: gardenHedgeTexture,
    bumpScale: 0.035,
    roughness: 0.96,
    metalness: 0.0,
    envMapIntensity: 0.14,
  });
  const darkGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeWindowTexture(),
    roughness: 0.2,
    metalness: 0.35,
    envMapIntensity: 1.1,
  });
  const warmWindowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeWarmWindowTexture(),
    emissive: 0xffb066,
    emissiveIntensity: 0.2,
    roughness: 0.4,
    metalness: 0.1,
  });
  const creamTrimMat = new THREE.MeshStandardMaterial({
    color: 0xe8e1d0,
    roughness: 0.78,
    metalness: 0.0,
  });
  const shutterMat = new THREE.MeshStandardMaterial({
    color: 0x3f5a3a,
    roughness: 0.86,
    metalness: 0.0,
  });
  const stoneWallMat = new THREE.MeshStandardMaterial({
    color: 0xd2cbb8,
    map: makeStoneTexture(),
    roughness: 0.95,
    metalness: 0.0,
    envMapIntensity: 0.16,
  });
  // The plinth is long and shallow, so the churchyard stone texture tiled
  // vertically into wood-grain lines. Stretch it into two broad courses.
  const plinthTexture = makeStoneTexture();
  plinthTexture.repeat.set(6, 0.18);
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0xd8d2c2,
    map: plinthTexture,
    roughness: 0.95,
    metalness: 0.0,
    envMapIntensity: 0.16,
  });
  const gutterMat = new THREE.MeshStandardMaterial({
    color: 0x4b504b,
    roughness: 0.44,
    metalness: 0.55,
    envMapIntensity: 0.6,
  });
  const flowerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeFlowerTexture(),
    roughness: 0.9,
    metalness: 0.0,
    envMapIntensity: 0.2,
  });
  const lampGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffd39a,
    toneMapped: false,
    fog: true,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x0c0d0e,
    roughness: 0.92,
    metalness: 0.02,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x7c807c,
    roughness: 0.36,
    metalness: 0.78,
    envMapIntensity: 0.9,
  });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4630, roughness: 0.94 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x3f5f2d, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0x4f7235, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x35502a, roughness: 0.94 }),
  ];
  for (const mat of leafMats) {
    addWind(mat, {
      strength: 0.045,
      mask: "1.0",
      phase: "modelMatrix[3].x * 0.22 + modelMatrix[3].z * 0.19",
      key: "village-leaf-wind",
    });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.22, 2.6, 6);
  const leafGeo = new THREE.IcosahedronGeometry(1.05, 1);

  /* ---------------------------- village props --------------------------- */
  function makeTree(scale = 1) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.3;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    // Five overlapping lobes read as one broad, irregular crown instead of
    // three floating balls. Two green tones add depth inside the canopy.
    const leafMat = leafMats[Math.floor(rand() * leafMats.length)];
    const underMat = leafMats[Math.floor(rand() * leafMats.length)];
    const lobes = [
      { x: 0, y: 3.2, z: 0, s: 1.5, mat: leafMat },
      { x: -0.78, y: 3.55, z: 0.34, s: 1.02, mat: underMat },
      { x: 0.82, y: 3.58, z: -0.28, s: 0.98, mat: leafMat },
      { x: 0.14, y: 4.38, z: 0.3, s: 0.9, mat: leafMat },
      { x: -0.34, y: 3.12, z: -0.78, s: 0.82, mat: underMat },
    ];
    for (const lobe of lobes) {
      const leaf = new THREE.Mesh(leafGeo, lobe.mat);
      const s = lobe.s * (0.92 + rand() * 0.16);
      leaf.scale.set(s, s * (0.88 + rand() * 0.22), s);
      leaf.position.set(
        lobe.x + (rand() - 0.5) * 0.2,
        lobe.y + rand() * 0.2,
        lobe.z + (rand() - 0.5) * 0.2
      );
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      tree.add(leaf);
    }
    tree.scale.setScalar(scale);
    return tree;
  }

  function makeHouse({
    wide = false,
    barn = false,
    storeys = 1,
    simple = false,
    yard = false,
    roadDistance = 0,
  } = {}) {
    const house = new THREE.Group();
    const w = (wide ? 8 : 5.5) + rand() * 2.8;
    const d = (barn ? 7 : 4.8) + rand() * 2.2;
    const h =
      (barn ? 4.2 : storeys > 1 ? 5.0 : 2.9) +
      rand() * (barn ? 1.1 : storeys > 1 ? 0.9 : 1.1);
    const twoStorey = storeys > 1 && !barn;
    const halfTimber = !barn && !simple && rand() > 0.52;
    const hasBalcony = twoStorey && !simple && rand() > 0.48;
    const hasDormer = !barn && !simple && rand() > 0.42;
    const hasAttic = !barn && rand() > 0.28;
    const wallMat = plasterMats[Math.floor(rand() * plasterMats.length)];
    const roofMat = roofMats[barn ? 2 : Math.floor(rand() * roofMats.length)];
    const rise = 1.3 + rand() * 0.9;
    const frontZ = d / 2 + 0.012;
    const glassMat = rand() > 0.86 ? warmWindowMat : darkGlassMat;

    function addBox(sw, sh, sd, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      house.add(mesh);
      return mesh;
    }

    function addFlat(pw, ph, mat, x, y, z, ry = 0, rx = 0) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, 0);
      mesh.receiveShadow = true;
      house.add(mesh);
      return mesh;
    }

    // Window on a wall that faces +z (road side) or -z (garden side).
    function addWindowZ(
      side,
      x,
      y,
      { scale = 1, shutters = false, box = false } = {}
    ) {
      const ww = 0.92 * scale;
      const wh = 1.14 * scale;
      const zf = side * (d / 2);
      addBox(ww, wh, 0.06, creamTrimMat, x, y, zf + side * 0.03);
      addFlat(
        ww - 0.2,
        wh - 0.22,
        rand() > 0.8 ? warmWindowMat : darkGlassMat,
        x,
        y,
        zf + side * 0.064,
        side > 0 ? 0 : Math.PI
      );
      // A cross mullion turns a black rectangle into a real casement.
      addBox(0.035, wh - 0.2, 0.025, creamTrimMat, x, y, zf + side * 0.078);
      addBox(ww - 0.2, 0.035, 0.025, creamTrimMat, x, y, zf + side * 0.078);
      addBox(
        ww + 0.14,
        0.08,
        0.16,
        stoneMat,
        x,
        y - wh / 2 - 0.04,
        zf + side * 0.03
      );
      addBox(
        ww + 0.14,
        0.09,
        0.12,
        creamTrimMat,
        x,
        y + wh / 2 + 0.05,
        zf + side * 0.02
      );
      if (shutters) {
        for (const dir of [-1, 1]) {
          const sx = x + dir * (ww / 2 + 0.14);
          addBox(0.18, wh - 0.12, 0.05, shutterMat, sx, y, zf + side * 0.045);
          for (const sy of [-0.3, 0, 0.3]) {
            addBox(
              0.14,
              0.035,
              0.02,
              creamTrimMat,
              sx,
              y + sy * wh,
              zf + side * 0.075
            );
          }
        }
      }
      if (box) {
        addBox(
          ww + 0.04,
          0.16,
          0.2,
          timberMat,
          x,
          y - wh / 2 - 0.18,
          zf + side * 0.13
        );
        addBox(
          ww - 0.02,
          0.14,
          0.17,
          flowerMat,
          x,
          y - wh / 2 - 0.09,
          zf + side * 0.14
        );
      }
    }

    // Window on a gable end that faces +x or -x. Attic windows sit on the
    // roof's gable face, which is what is actually visible from the lane.
    function addWindowX(side, z, y, { scale = 1, attic = false } = {}) {
      const ww = (attic ? 0.62 : 0.8) * scale;
      const wh = (attic ? 0.72 : 1.0) * scale;
      const xf = side * (attic ? w / 2 + 0.4 : w / 2);
      addBox(0.06, wh, ww, creamTrimMat, xf + side * 0.03, y, z);
      addFlat(
        ww - 0.16,
        wh - 0.18,
        rand() > 0.9 ? warmWindowMat : darkGlassMat,
        xf + side * 0.064,
        y,
        z,
        side > 0 ? Math.PI / 2 : -Math.PI / 2
      );
      addBox(0.025, wh - 0.18, 0.035, creamTrimMat, xf + side * 0.078, y, z);
      addBox(0.025, 0.035, ww - 0.16, creamTrimMat, xf + side * 0.078, y, z);
      addBox(
        0.16,
        0.08,
        ww + 0.12,
        stoneMat,
        xf + side * 0.03,
        y - wh / 2 - 0.04,
        z
      );
      addBox(
        0.12,
        0.09,
        ww + 0.12,
        creamTrimMat,
        xf + side * 0.02,
        y + wh / 2 + 0.05,
        z
      );
    }

    // Stone plinth grounds the plaster wall and hides the hard seam where a
    // box meets the grass.
    addBox(w + 0.1, 0.34, d + 0.1, plinthMat, 0, 0.17, 0);

    // A mown yard keeps a back-row house from sitting directly in a crop field.
    if (yard) {
      const lawn = new THREE.Mesh(
        new THREE.PlaneGeometry(w + 7, d + 7),
        yardMat
      );
      lawn.rotation.x = -Math.PI / 2;
      lawn.position.set(0, 0.001, 0);
      lawn.receiveShadow = true;
      house.add(lawn);
    }

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);

    // Stone quoins on some plaster corners.
    if (!barn && !halfTimber && !simple && rand() > 0.5) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          addBox(
            0.26,
            0.3,
            0.09,
            stoneMat,
            side * (w / 2 - 0.12),
            0.62 + i * 0.78,
            d / 2 + 0.005
          );
        }
      }
    }

    // Roof with a generous eave, ridge cap and fascia boards.
    const roof = new THREE.Mesh(
      makeRoofGeometry(w + 0.8, d + 0.8, rise),
      roofMat
    );
    roof.position.y = h;
    roof.castShadow = true;
    roof.receiveShadow = true;
    house.add(roof);

    addBox(w + 0.92, 0.09, 0.16, timberMat, 0, h + rise - 0.02, 0);
    addBox(w + 0.84, 0.1, 0.08, timberMat, 0, h + 0.015, d / 2 + 0.38);
    addBox(w + 0.84, 0.1, 0.08, timberMat, 0, h + 0.015, -(d / 2 + 0.38));

    const gutter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.048, w + 0.72, 6),
      gutterMat
    );
    gutter.rotation.z = Math.PI / 2;
    gutter.position.set(0, h + 0.055, d / 2 + 0.2);
    gutter.castShadow = true;
    house.add(gutter);
    addBox(
      0.034,
      h - 0.16,
      0.034,
      gutterMat,
      w * 0.43,
      (h - 0.16) / 2,
      d / 2 + 0.2
    );

    // Windows: two rows on a two-storey house, one on a cottage. Gable ends
    // get their own windows so the house reads from every angle on the road.
    const rows = twoStorey ? [1.5, h * 0.72] : [Math.min(h * 0.55, 1.65)];
    for (const side of [-1, 1]) {
      if (barn && side > 0) continue;
      for (let r = 0; r < rows.length; r++) {
        const y = rows[r];
        const offsets =
          twoStorey && r === 0
            ? [-w * 0.3, w * 0.3]
            : [-w * 0.26, w * 0.26];
        for (const x of offsets) {
          addWindowZ(side, x, y, {
            shutters: side > 0 && !barn,
            box: side > 0 && !barn && r === rows.length - 1 && rand() > 0.4,
          });
        }
      }
      if (!barn) {
        addWindowX(side, 0, twoStorey ? 1.5 : Math.min(h * 0.55, 1.65), {
          scale: 0.95,
        });
        if (twoStorey) addWindowX(side, 0, h * 0.72, { scale: 0.95 });
      }
    }

    if (hasAttic) {
      if (halfTimber) {
        for (const side of [-1, 1]) {
          for (const z of [-d * 0.18, d * 0.18]) {
            addWindowX(side, z, h + rise * 0.38, {
              scale: 0.85,
              attic: true,
            });
          }
        }
      } else {
        for (const side of [-1, 1]) {
          addWindowX(side, 0, h + rise * 0.38, { scale: 0.9, attic: true });
        }
      }
    }

    // Door, canopy, step, lamp and a pair of pots.
    if (!barn) {
      addBox(1.18, 2.08, 0.05, creamTrimMat, 0, 1.02, frontZ + 0.02);
      addBox(0.95, 1.95, 0.08, timberMat, 0, 0.98, frontZ + 0.04);
      addBox(0.62, 0.55, 0.025, doorPanelMat, 0, 1.46, frontZ + 0.09);
      addBox(0.62, 0.55, 0.025, doorPanelMat, 0, 0.76, frontZ + 0.09);
      addBox(0.05, 0.05, 0.1, brassMat, 0.34, 1.05, frontZ + 0.12);
      addBox(0.18, 0.13, 0.02, creamTrimMat, -0.34, 1.46, frontZ + 0.1);
      addBox(1.6, 0.08, 0.72, roofMat, 0, 2.28, frontZ + 0.36, 0.16);
      for (const dir of [-1, 1]) {
        // Dark timber braces under the canopy. Cream brackets read as loose
        // paper panels against the plaster.
        addBox(
          0.07,
          0.5,
          0.07,
          timberMat,
          dir * 0.64,
          2.02,
          frontZ + 0.2,
          0,
          0,
          dir * 0.3
        );
      }
      addBox(1.4, 0.14, 0.7, stoneMat, 0, 0.07, frontZ + 0.42);
      addBox(0.11, 0.16, 0.08, lampGlowMat, 0.82, 2.16, frontZ + 0.1);
      addBox(0.06, 0.06, 0.18, timberMat, 0.82, 2.28, frontZ + 0.02);
      if (!simple) {
        for (const dir of [-1, 1]) {
          const pot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.1, 0.24, 8),
            potMat
          );
          pot.position.set(dir * 0.78, 0.12, frontZ + 0.52);
          pot.castShadow = true;
          house.add(pot);
          const bloom = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.16, 0),
            flowerMat
          );
          bloom.position.set(dir * 0.78, 0.3, frontZ + 0.52);
          house.add(bloom);
        }
      }
    } else {
      addBox(w * 0.42, h * 0.72, 0.1, timberMat, 0, h * 0.36, frontZ + 0.04);
      for (const angle of [-0.6, 0.6]) {
        addBox(
          0.09,
          h * 0.7,
          0.05,
          plasterMats[0],
          0,
          h * 0.36,
          frontZ + 0.1,
          0,
          0,
          angle
        );
      }
      // Hayloft opening and hoist beam.
      addBox(w * 0.3, h * 0.24, 0.04, creamTrimMat, 0, h * 0.78, frontZ + 0.02);
      addFlat(w * 0.24, h * 0.19, darkGlassMat, 0, h * 0.78, frontZ + 0.05);
      addBox(0.14, 0.14, 1.4, timberMat, 0, h * 0.94, frontZ + 0.6);
    }

    // Exposed timber frame on the road façade and both gable ends.
    if (halfTimber) {
      for (const side of [-1, 1]) {
        addBox(
          0.16,
          h - 0.2,
          0.06,
          timberMat,
          side * (w / 2 - 0.1),
          h / 2,
          frontZ + 0.03
        );
      }
      addBox(w, 0.18, 0.08, timberMat, 0, h - 0.1, frontZ + 0.035);
      if (twoStorey) {
        addBox(w, 0.16, 0.08, timberMat, 0, h * 0.5, frontZ + 0.035);
      }
      for (const side of [-1, 1]) {
        addBox(
          0.06,
          h - 0.2,
          0.16,
          timberMat,
          side * (w / 2 + 0.02),
          h / 2,
          d / 2 - 0.1
        );
        addBox(
          0.06,
          h - 0.2,
          0.16,
          timberMat,
          side * (w / 2 + 0.02),
          h / 2,
          -(d / 2 - 0.1)
        );
        addBox(
          0.08,
          0.18,
          d,
          timberMat,
          side * (w / 2 + 0.03),
          h - 0.1,
          0
        );
        addBox(
          0.06,
          rise * 0.7,
          0.14,
          timberMat,
          side * (w / 2 + 0.42),
          h + rise * 0.35,
          0
        );
      }
    }

    // A timber balcony under the upper windows, with flower boxes.
    if (hasBalcony) {
      const by = h * 0.5;
      const bz = d / 2 + 0.45;
      addBox(w * 0.56, 0.12, 0.9, timberMat, 0, by, bz);
      addBox(w * 0.56, 0.07, 0.07, timberMat, 0, by + 0.86, bz + 0.4);
      addBox(w * 0.56, 0.06, 0.06, timberMat, 0, by + 0.28, bz + 0.4);
      for (const x of [-w * 0.27, -w * 0.1, w * 0.1, w * 0.27]) {
        addBox(0.06, 0.86, 0.06, timberMat, x, by + 0.47, bz + 0.4);
      }
      for (const dir of [-1, 1]) {
        addBox(
          w * 0.18,
          0.16,
          0.18,
          timberMat,
          dir * w * 0.18,
          by + 0.72,
          bz + 0.48
        );
        addBox(
          w * 0.16,
          0.13,
          0.16,
          flowerMat,
          dir * w * 0.18,
          by + 0.82,
          bz + 0.49
        );
      }
    }

    // A small dormer breaks the long roof slope.
    if (hasDormer) {
      const dx = (rand() > 0.5 ? 1 : -1) * w * 0.14;
      const dz = d * 0.22;
      const dy = h + rise * 0.46;
      addBox(1.05, 0.82, 0.9, wallMat, dx, dy, dz);
      addBox(0.68, 0.56, 0.05, creamTrimMat, dx, dy + 0.02, dz + 0.47);
      addFlat(0.52, 0.42, glassMat, dx, dy + 0.02, dz + 0.5);
      const dormerRoof = new THREE.Mesh(
        makeRoofGeometry(1.45, 1.15, 0.36),
        roofMat
      );
      dormerRoof.position.set(dx, dy + 0.41, dz);
      dormerRoof.castShadow = true;
      house.add(dormerRoof);
    }

    if (rand() > 0.42) {
      const cx = w * 0.28;
      const cy = h + rise * 0.52;
      const cz = -d * 0.18;
      addBox(0.48, 1.5, 0.48, stoneMat, cx, cy, cz);
      addBox(0.62, 0.09, 0.62, stoneMat, cx, cy + 0.78, cz);
      for (const dir of [-1, 1]) {
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.085, 0.075, 0.3, 8),
          potMat
        );
        pot.position.set(cx + dir * 0.13, cy + 0.96, cz);
        pot.castShadow = true;
        house.add(pot);
      }
    }

    // A timber shed in some back gardens. It is merged into the house, so the
    // extra silhouette costs nothing at render time.
    if (!barn && !simple && rand() > 0.52) {
      const shedW = 2.3 + rand() * 1.1;
      const shedD = 1.8 + rand() * 0.8;
      const shedH = 1.8 + rand() * 0.4;
      const sx = (rand() > 0.5 ? 1 : -1) * w * 0.22;
      const sz = -(d / 2 + 2.4 + rand() * 1.1);
      addBox(shedW, shedH, shedD, timberMat, sx, shedH / 2, sz);
      const shedRoof = new THREE.Mesh(
        makeRoofGeometry(shedW + 0.3, shedD + 0.3, 0.55),
        roofMat
      );
      shedRoof.position.set(sx, shedH, sz);
      shedRoof.castShadow = true;
      house.add(shedRoof);
      addBox(
        0.68,
        1.3,
        0.04,
        doorPanelMat,
        sx,
        0.65,
        sz + shedD / 2 + 0.02
      );
    }

    // Gravel path from the door to the lane.
    const pathLength = Math.max(0, roadDistance - d / 2);
    if (pathLength > 0.8) {
      const path = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, pathLength),
        gravelMaterial
      );
      path.rotation.x = -Math.PI / 2;
      path.position.set(0, 0.006, d / 2 + pathLength / 2);
      path.receiveShadow = true;
      house.add(path);
    }

    // Low side hedges enclose each front garden, so the gaps between cottages
    // read as separate plots instead of one open lawn running behind the
    // roadside fence. The front is left open where the path meets the lane.
    if (!barn && !simple && pathLength > 2.4) {
      const sideLen = pathLength - 1.5;
      const count = Math.max(3, Math.round(sideLen / 0.55));
      // Most gardens get a clipped hedge; a few get a low stone wall so the
      // street does not repeat the same green boundary for a whole mile.
      const walled = rand() > 0.68;
      for (const dir of [-1, 1]) {
        if (walled) {
          addBox(
            0.32,
            0.52,
            sideLen,
            plinthMat,
            dir * (w / 2 + 1.05),
            0.26,
            d / 2 + 0.8 + sideLen / 2
          );
          addBox(
            0.42,
            0.07,
            sideLen + 0.06,
            stoneMat,
            dir * (w / 2 + 1.05),
            0.555,
            d / 2 + 0.8 + sideLen / 2
          );
        } else {
          // A run of overlapping clipped bushes, not a green box: the box
          // read as a painted wall from the car.
          for (let k = 0; k < count; k++) {
            const blob = new THREE.Mesh(
              new THREE.IcosahedronGeometry(0.34, 0),
              gardenHedgeMat
            );
            blob.position.set(
              dir * (w / 2 + 1.05) + (rand() - 0.5) * 0.16,
              0.3 + rand() * 0.06,
              d / 2 + 1.0 + (k + 0.5) * (sideLen / count)
            );
            blob.scale.set(
              0.95 + rand() * 0.2,
              0.72 + rand() * 0.12,
              1.25 + rand() * 0.2
            );
            blob.rotation.y = rand() * TAU;
            blob.castShadow = true;
            house.add(blob);
          }
        }
      }
    }

    house.userData.width = w;
    house.userData.depth = d;
    mergeStaticGroup(house);
    return house;
  }

  function makeWindmill() {
    const mill = new THREE.Group();
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 1.55, 7.2, 8),
      plasterMats[0]
    );
    tower.position.y = 3.6;
    tower.castShadow = true;
    tower.receiveShadow = true;
    mill.add(tower);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(1.55, 1.4, 8),
      roofMats[0]
    );
    cap.position.y = 7.9;
    cap.castShadow = true;
    mill.add(cap);

    const hub = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 8),
      timberMat
    );
    hub.position.set(0, 7.2, 1.65);
    mill.add(hub);

    const blades = new THREE.Group();
    blades.position.set(0, 7.2, 1.78);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i / 4) * TAU;
      const spar = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 3.5, 0.09),
        timberMat
      );
      spar.position.y = 1.85;
      arm.add(spar);
      const sail = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 2.2, 0.05),
        new THREE.MeshStandardMaterial({
          color: 0xd8cfb4,
          roughness: 0.86,
          metalness: 0.0,
        })
      );
      sail.position.set(0.5, 2.2, 0.02);
      arm.add(sail);
      blades.add(arm);
    }
    mill.add(blades);
    windmills.push(blades);
    return mill;
  }

  function makeSilo() {
    const silo = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({
      color: 0x9a978c,
      roughness: 0.58,
      metalness: 0.35,
    });
    const bandSteel = new THREE.MeshStandardMaterial({
      color: 0x6e716d,
      roughness: 0.5,
      metalness: 0.5,
    });
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 8.5, 18),
      steel
    );
    body.position.y = 4.25;
    body.castShadow = true;
    body.receiveShadow = true;
    silo.add(body);

    // Rolled horizontal bands break up the big galvanised cylinder.
    for (const y of [1.15, 3.0, 4.9, 6.8, 8.35]) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(1.29, 1.29, 0.09, 18),
        bandSteel
      );
      band.position.y = y;
      band.castShadow = true;
      silo.add(band);
    }

    // Vertical panel seams, drawn as one line batch.
    const seamPoints = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const x = Math.cos(a) * 1.26;
      const z = Math.sin(a) * 1.26;
      seamPoints.push(x, 0.1, z, x, 8.45, z);
    }
    const seams = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: seamPoints.length / 3 }, (_, i) =>
          new THREE.Vector3(seamPoints[i * 3], seamPoints[i * 3 + 1], seamPoints[i * 3 + 2])
        )
      ),
      new THREE.LineBasicMaterial({ color: 0x777a74, transparent: true, opacity: 0.7 })
    );
    silo.add(seams);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.36, 1.15, 18),
      new THREE.MeshStandardMaterial({ color: 0x7d7f79, roughness: 0.5, metalness: 0.45 })
    );
    roof.position.y = 9.05;
    roof.castShadow = true;
    silo.add(roof);

    const hatch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12),
      bandSteel
    );
    hatch.position.y = 9.68;
    silo.add(hatch);

    // A simple external ladder gives the silhouette a human scale.
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 8.2, 0.045),
        bandSteel
      );
      rail.position.set(side * 0.27, 4.2, 1.28);
      silo.add(rail);
    }
    for (let y = 0.65; y < 8.2; y += 0.38) {
      const rung = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.035, 0.035),
        bandSteel
      );
      rung.position.set(0, y, 1.28);
      silo.add(rung);
    }
    return silo;
  }

  /* --------------------------- place buildings -------------------------- */
  // A dense main street with a second row behind it. The near-end houses move
  // back into the second row, so the village keeps its depth as the scenery
  // scrolls instead of ending in an empty field.
  const housePositions = [];
  const HOUSE_COUNT = 30;
  const HOUSE_START = -182;
  const HOUSE_END = 298;
  const houseStep = (HOUSE_END - HOUSE_START) / (HOUSE_COUNT - 1);
  for (let i = 0; i < HOUSE_COUNT; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = HOUSE_START + i * houseStep + (rand() - 0.5) * 2.4;
    const nearEnd = x > 222 || x < -222;
    // Only the far ends and a couple of plots step back. Pushing every seventh
    // house into the back row left 60 m holes in the main street, which read as
    // empty lawns from the car.
    const backBand = nearEnd || i % 13 === 3;
    // Camera-side houses used to sit 18-23 m back, which left a 15-20 m deep
    // strip of empty lawn along half the street. Both rows now keep a normal
    // cottage front garden of roughly 6-8 m; the sun still clears the lane
    // because the low golden-hour shadows run mostly along +x, not across it.
    const z = backBand
      ? side * (42 + rand() * 10)
      : side > 0
        ? 13.5 + rand() * 2.5
        : -(12.5 + rand() * 4.5);
    const storeys = backBand ? 2 : rand() > 0.38 ? 2 : 1;
    const barn = !backBand && (i === 5 || i === 20);
    housePositions.push({ x, z, side, backBand, barn });

    const building = makeHouse({
      wide: rand() > 0.68,
      barn,
      storeys,
      simple: backBand,
      yard: backBand,
      roadDistance: backBand ? 0 : Math.abs(z) - 7.5,
    });
    building.position.set(x, 0, z);
    building.rotation.y = side > 0 ? Math.PI : 0;
    group.add(building);
    props.push(building);
  }

  // A third row out in the fields. It gives the front and rear views a proper
  // village skyline instead of a bare green hill.
  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = -180 + i * 36 + (rand() - 0.5) * 8;
    const z = side * (62 + rand() * 14);
    const building = makeHouse({
      wide: rand() > 0.55,
      storeys: 2,
      simple: true,
      yard: true,
    });
    building.position.set(x, 0, z);
    building.rotation.y = side > 0 ? Math.PI : 0;
    group.add(building);
    props.push(building);
  }

  // Landmarks set back between the rows.
  {
    const mill = makeWindmill();
    mill.position.set(-58, 0, 24);
    mill.rotation.y = 0.35;
    group.add(mill);
    props.push(mill);
  }
  {
    const silo = makeSilo();
    silo.position.set(44, 0, -24);
    group.add(silo);
    props.push(silo);
  }

  // A small stone church with a spire anchors the village centre.
  {
    const church = new THREE.Group();
    const nave = new THREE.Mesh(
      new THREE.BoxGeometry(6.2, 4.6, 4.6),
      plasterMats[1]
    );
    nave.position.y = 2.3;
    nave.castShadow = true;
    nave.receiveShadow = true;
    church.add(nave);
    const naveRoof = new THREE.Mesh(
      makeRoofGeometry(7, 5.4, 1.9),
      roofMats[1]
    );
    naveRoof.position.y = 4.6;
    naveRoof.castShadow = true;
    church.add(naveRoof);

    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 9, 2.4),
      plasterMats[2]
    );
    tower.position.set(-4.3, 4.5, 0);
    tower.castShadow = true;
    church.add(tower);
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(1.7, 4.2, 4),
      roofMats[2]
    );
    spire.position.set(-4.3, 11.1, 0);
    spire.rotation.y = Math.PI / 4;
    spire.castShadow = true;
    church.add(spire);

    for (const y of [5.4, 7.2]) {
      const opening = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 1.2),
        darkGlassMat
      );
      opening.position.set(-4.3, y, 1.22);
      church.add(opening);
    }
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), timberMat);
    crossV.position.set(-4.3, 13.6, 0);
    church.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), timberMat);
    crossH.position.set(-4.3, 13.7, 0);
    church.add(crossH);

    // Between the main street and the second row, facing the road.
    church.position.set(-40, 0, -28.5);
    church.rotation.y = 0;
    group.add(church);
    props.push(church);

    // Low churchyard wall. These are children of the church so they travel
    // with it instead of being left behind as static scenery.
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x9a927c,
      roughness: 0.94,
      metalness: 0.0,
    });
    for (const [wx, wz, ww, wd] of [
      [0, 5.6, 13, 0.34],
      [0, -5.6, 13, 0.34],
      [-6.4, 0, 0.34, 11.2],
      [6.4, 0, 0.34, 11.2],
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.62, wd), wallMat);
      wall.position.set(wx, 0.31, wz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      church.add(wall);
    }

    // A stone well in the churchyard.
    const well = new THREE.Group();
    const wellRing = new THREE.Mesh(
      new THREE.CylinderGeometry(1.02, 1.14, 0.95, 16, 1, true),
      stoneWallMat
    );
    wellRing.position.y = 0.48;
    wellRing.castShadow = true;
    wellRing.receiveShadow = true;
    well.add(wellRing);
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(0.94, 16),
      new THREE.MeshStandardMaterial({
        color: 0x1d2a2a,
        roughness: 0.18,
        metalness: 0.4,
        envMapIntensity: 0.9,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.66;
    well.add(water);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 2.15, 0.13),
        timberMat
      );
      post.position.set(side * 0.92, 1.35, 0);
      post.castShadow = true;
      well.add(post);
    }
    const wellBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 2.2, 6),
      timberMat
    );
    wellBeam.rotation.z = Math.PI / 2;
    wellBeam.position.y = 2.3;
    well.add(wellBeam);
    const wellRoof = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 0.7, 4),
      roofMats[0]
    );
    wellRoof.rotation.y = Math.PI / 4;
    wellRoof.position.y = 2.9;
    wellRoof.castShadow = true;
    well.add(wellRoof);
    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.15, 0.26, 8),
      gutterMat
    );
    bucket.position.set(0, 1.28, 0);
    well.add(bucket);
    well.position.set(4.5, 0, 1.5);
    church.add(well);
  }

  /* ------------------------------ trees --------------------------------- */
  // Trees between the street and the second row, so the gaps between houses
  // read as gardens rather than bare field.
  for (let i = 0; i < 44; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = START + rand() * SCENERY_CYCLE;
    const z = side * (25 + rand() * 11);
    const tree = makeTree(0.8 + rand() * 0.9);
    tree.position.set(x, 0, z);
    tree.rotation.y = rand() * TAU;
    group.add(tree);
    props.push(tree);
  }

  // Orchard rows in the strip between the street and the back row. They fill
  // the mid-ground with small crowns instead of a bare green lawn.
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = -178 + i * 18 + (rand() - 0.5) * 5;
    const z = side * (32 + (i % 3) * 4 + rand() * 2);
    const tree = makeTree(0.5 + rand() * 0.35);
    tree.position.set(x, 0, z);
    tree.rotation.y = rand() * TAU;
    group.add(tree);
    props.push(tree);
  }

  // Small fruit trees in the gaps between the street-front cottages. They add
  // foreground depth without hiding the doors and windows.
  for (const side of [-1, 1]) {
    const row = housePositions
      .filter((house) => !house.backBand && house.side === side)
      .sort((a, b) => a.x - b.x);
    for (let i = 0; i < row.length - 1; i++) {
      if (rand() > 0.62) continue;
      const x = (row[i].x + row[i + 1].x) / 2 + (rand() - 0.5) * 2.4;
      const z = side * (9.8 + rand() * 1.8);
      const tree = makeTree(0.4 + rand() * 0.22);
      tree.position.set(x, 0, z);
      tree.rotation.y = rand() * TAU;
      group.add(tree);
      props.push(tree);
    }
  }

  // Two deliberate foreground trees fill the near lawns the random gap pass
  // skips because those plots sit just behind the camera.
  for (const [x, z, s] of [
    [7, 12.5, 0.5],
    [-26, 12.4, 0.46],
  ]) {
    const tree = makeTree(s);
    tree.position.set(x, 0, z);
    tree.rotation.y = rand() * TAU;
    group.add(tree);
    props.push(tree);
  }

  // A dense backdrop behind the third row, static and slowly drifting.
  for (let i = 0; i < 34; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const tree = makeTree(1 + rand() * 1.2);
    tree.position.set(
      START + rand() * SCENERY_CYCLE,
      0,
      side * (82 + rand() * 46)
    );
    tree.rotation.y = rand() * TAU;
    group.add(tree);
    farProps.push(tree);
  }

  /* ------------------------- hedges and fences -------------------------- */
  // A low, continuous hedge volume gives the verge a solid mass, and the
  // instanced clumps below sit on top as its uneven grown edge. Without the
  // base the gaps between clumps showed bare grass through what should be a
  // hedge, especially once the car started moving.
  const hedgeBaseTexture = makeHedgeTexture();
  hedgeBaseTexture.repeat.set(140, 1);
  const hedgeBaseMat = new THREE.MeshStandardMaterial({
    color: 0xbfc9a8,
    map: hedgeBaseTexture,
    bumpMap: hedgeBaseTexture,
    bumpScale: 0.02,
    roughness: 0.95,
    metalness: 0.0,
    envMapIntensity: 0.14,
  });
  const hedgeBaseGeo = new THREE.BoxGeometry(ROAD_LENGTH, 0.34, 0.62);
  for (const side of [-1, 1]) {
    const base = new THREE.Mesh(hedgeBaseGeo, hedgeBaseMat);
    base.position.set(0, 0.17, side * 7.18);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
  }

  const hedgeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0.0,
    envMapIntensity: 0.16,
  });
  addWind(hedgeMat, {
    strength: 0.032,
    mask: "smoothstep(-0.28, 0.34, transformed.y)",
    phase: "instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27",
    key: "village-bush-wind",
  });
  const bushGeo = new THREE.IcosahedronGeometry(0.34, 1);
  const bushItems = [];
  const bushColors = [0x33482a, 0x3c5430, 0x455f35, 0x2d4226, 0x4f6639];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 152; i++) {
      bushItems.push({
        x: -100 + i * 1.32 + (rand() - 0.5) * 0.7,
        y: 0.24 + rand() * 0.1,
        z: side * (7.1 + (rand() - 0.5) * 0.32),
        sx: 1.1 + rand() * 0.55,
        sy: 0.55 + rand() * 0.32,
        sz: 1.1 + rand() * 0.55,
        ry: rand() * TAU,
      });
    }
  }
  const bushes = new THREE.InstancedMesh(bushGeo, hedgeMat, bushItems.length);
  bushItems.forEach((_, i) => {
    bushes.setColorAt(i, new THREE.Color(bushColors[i % bushColors.length]));
  });
  bushes.instanceColor.needsUpdate = true;
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  bushes.frustumCulled = false;
  group.add(bushes);
  addScrollingBatch(bushes, bushItems, 200);

  // Field hedgerows beyond the third row. They turn the empty green plain
  // into a patchwork of small holdings: a long boundary along the near edge
  // of each crop band, and cross hedges dividing the bands into fields.
  const farHedgeGeo = new THREE.IcosahedronGeometry(0.55, 0);
  const farHedgeItems = [];
  const fieldBoundaries = [82, 112, 152, 201];
  for (const side of [-1, 1]) {
    for (const z of fieldBoundaries) {
      for (let x = -320; x < 320; x += 1.25 + rand() * 0.55) {
        farHedgeItems.push({
          x: x + (rand() - 0.5) * 0.6,
          y: 0.58 + rand() * 0.2,
          z: side * (z + (rand() - 0.5) * 1.3),
          sx: 1.2 + rand() * 0.7,
          sy: 0.82 + rand() * 0.5,
          sz: 1.05 + rand() * 0.5,
          ry: rand() * TAU,
        });
      }
    }
    for (const x of [-280, -210, -140, -70, 0, 70, 140, 210, 280]) {
      for (let z = 82; z <= 201; z += 1.35 + rand() * 0.5) {
        farHedgeItems.push({
          x: x + (rand() - 0.5) * 1.3,
          y: 0.58 + rand() * 0.2,
          z: side * (z + (rand() - 0.5) * 0.6),
          sx: 1.15 + rand() * 0.6,
          sy: 0.8 + rand() * 0.45,
          sz: 1.05 + rand() * 0.5,
          ry: rand() * TAU,
        });
      }
    }
  }
  const farHedges = new THREE.InstancedMesh(
    farHedgeGeo,
    hedgeMat,
    farHedgeItems.length
  );
  farHedgeItems.forEach((_, i) => {
    farHedges.setColorAt(i, new THREE.Color(bushColors[i % bushColors.length]));
  });
  farHedges.instanceColor.needsUpdate = true;
  farHedges.receiveShadow = true;
  farHedges.frustumCulled = false;
  group.add(farHedges);
  // Distant hedges drift slower than the street, matching the far tree line
  // and the way the crop bands sit still under the fog.
  addScrollingBatch(farHedges, farHedgeItems, 640, 0.18);

  // Grass tufts just off the gravel shoulder. Three merged blades per clump,
  // instanced into one draw call, then scrolled with the road.
  const bladeGeo = new THREE.ConeGeometry(0.026, 0.26, 3);
  const tuftParts = [];
  for (const [bx, bz, tilt, spin] of [
    [-0.035, 0.01, 0.2, 0.4],
    [0.026, -0.02, -0.24, 1.9],
    [0.004, 0.035, 0.04, 3.4],
  ]) {
    const blade = bladeGeo.clone();
    blade.scale(1, 0.82 + rand() * 0.4, 1);
    blade.rotateZ(tilt);
    blade.rotateY(spin);
    blade.translate(bx, 0.12, bz);
    tuftParts.push(blade);
  }
  const tuftGeo = mergeGeometries(tuftParts, false);
  bladeGeo.dispose();
  tuftParts.forEach((part) => part.dispose());
  const tuftMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0.0,
    envMapIntensity: 0.12,
  });
  addWind(tuftMat, {
    strength: 0.06,
    mask: "smoothstep(0.0, 0.28, transformed.y + 0.04)",
    phase: "instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27",
    key: "village-tuft-wind",
  });
  const tuftItems = [];
  const tuftColors = [0x4e5f2e, 0x5a6b38, 0x445428, 0x657440, 0x536430];
  for (let i = 0; i < 900; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    tuftItems.push({
      x: -70 + rand() * 140,
      y: 0,
      z: side * (4.8 + rand() * 1.6),
      sx: 0.7 + rand() * 0.65,
      sy: 0.55 + rand() * 0.5,
      sz: 0.7 + rand() * 0.65,
      ry: rand() * TAU,
    });
  }
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftItems.length);
  tuftItems.forEach((_, i) => {
    tufts.setColorAt(i, new THREE.Color(tuftColors[i % tuftColors.length]));
  });
  tufts.instanceColor.needsUpdate = true;
  tufts.receiveShadow = true;
  tufts.frustumCulled = false;
  group.add(tufts);
  addScrollingBatch(tufts, tuftItems, 140);

  for (const side of [-1, 1]) {
    // Fence posts as one instanced draw call.
    const postGeo = new THREE.BoxGeometry(0.11, 1.05, 0.11);
    const postMat = timberMat;
    const count = Math.floor(ROAD_LENGTH / 6);
    const posts = new THREE.InstancedMesh(postGeo, postMat, count);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      matrix.makeTranslation(-ROAD_LENGTH / 2 + i * 6, 0.52, side * 7.5);
      posts.setMatrixAt(i, matrix);
    }
    posts.castShadow = true;
    group.add(posts);

    for (const y of [0.58, 0.92]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(ROAD_LENGTH, 0.07, 0.07),
        timberMat
      );
      rail.position.set(0, y, side * 7.5);
      group.add(rail);
    }
  }

  /* --------------------------- utility poles ---------------------------- */
  // A rural power line on the far verge: wooden poles, crossarms and two
  // sagging wires. The wires are thin lines, so they stay razor sharp.
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x4d4134,
    roughness: 0.92,
    metalness: 0.0,
  });
  const insulatorMat = new THREE.MeshStandardMaterial({
    color: 0x9b978a,
    roughness: 0.55,
    metalness: 0.1,
  });
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x2b2a26,
    transparent: true,
    opacity: 0.7,
  });
  const poleSpacing = 28;
  // Just behind the verge fence, clear of the house walls, and repeated far
  // enough to follow the longer scenery loop.
  const poleZ = -8.6;
  for (let i = 0; i < 17; i++) {
    const x = START + 18 + i * poleSpacing;
    const pole = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.17, 7.4, 6),
      poleMat
    );
    post.position.y = 3.7;
    post.castShadow = true;
    pole.add(post);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 1.9), poleMat);
    arm.position.y = 6.7;
    arm.castShadow = true;
    pole.add(arm);

    for (const offset of [-0.75, 0.75]) {
      const insulator = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.18, 6),
        insulatorMat
      );
      insulator.position.set(0, 6.85, offset);
      pole.add(insulator);
    }

    pole.position.set(x, 0, poleZ);
    group.add(pole);
    props.push(pole);

    for (const offset of [-0.75, 0.75]) {
      const points = [];
      for (let s = 0; s <= 8; s++) {
        const t = s / 8;
        points.push(
          new THREE.Vector3(
            t * poleSpacing,
            6.86 - Math.sin(Math.PI * t) * 0.55,
            poleZ + offset
          )
        );
      }
      const wire = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        wireMat
      );
      wire.position.x = x;
      group.add(wire);
      props.push(wire);
    }
  }

  /* ----------------------------- village sign --------------------------- */
  {
    const signTexture = makeVillageSignTexture();
    const sign = new THREE.Group();
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1.9, 0.1),
        timberMat
      );
      post.position.set(side * 0.76, 0.95, 0);
      post.castShadow = true;
      sign.add(post);
    }
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.86, 0.94, 0.07),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: signTexture,
        roughness: 0.62,
        metalness: 0.04,
      })
    );
    board.position.y = 1.72;
    board.castShadow = true;
    sign.add(board);
    // Left of the car in the opening frame, clear of the desktop config rail.
    sign.position.set(-13.5, 0, -7.75);
    sign.rotation.y = 0.16;
    group.add(sign);
    props.push(sign);
  }

  /* ------------------------------ phone box ----------------------------- */
  // A red K6-style box behind the low wall, next to the village sign. It is
  // small, but the one saturated red object in the whole village pulls the eye
  // down the lane and makes the opening frame feel lived in.
  {
    const phoneRed = new THREE.MeshStandardMaterial({
      color: 0x9c2a20,
      roughness: 0.48,
      metalness: 0.14,
      envMapIntensity: 0.55,
    });
    const phoneTrim = new THREE.MeshStandardMaterial({
      color: 0x5f1712,
      roughness: 0.6,
      metalness: 0.16,
      envMapIntensity: 0.35,
    });
    const phoneGlass = new THREE.MeshStandardMaterial({
      color: 0x20333a,
      roughness: 0.16,
      metalness: 0.45,
      emissive: 0xffbd7a,
      emissiveIntensity: 0.1,
      envMapIntensity: 1.25,
    });
    const phoneSignMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: makePhoneSignTexture(),
      roughness: 0.6,
      metalness: 0.0,
    });

    const box = new THREE.Group();
    const addPart = (geometry, material, x, y, z, ry = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      box.add(mesh);
      return mesh;
    };

    addPart(new THREE.BoxGeometry(1.12, 0.12, 1.12), phoneTrim, 0, 0.06, 0);
    addPart(new THREE.BoxGeometry(1.0, 2.2, 1.0), phoneRed, 0, 1.22, 0);

    // Glazing, mullions and the TELEPHONE band on all four faces. u runs along
    // the face, w is the outward offset, so one loop dresses every side.
    const glassGeo = new THREE.PlaneGeometry(0.74, 1.02);
    const vertGeo = new THREE.BoxGeometry(0.045, 1.02, 0.03);
    const horizGeo = new THREE.BoxGeometry(0.74, 0.045, 0.03);
    const signGeo = new THREE.PlaneGeometry(0.88, 0.2);
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const at = (u, y, w, geometry, material) =>
        addPart(
          geometry,
          material,
          cos * u + sin * w,
          y,
          -sin * u + cos * w,
          angle
        );

      at(0, 1.58, 0.504, glassGeo, phoneGlass);
      for (const u of [-0.24, 0.24]) {
        at(u, 1.58, 0.516, vertGeo, phoneRed);
      }
      for (const y of [1.32, 1.84]) {
        at(0, y, 0.516, horizGeo, phoneRed);
      }
      at(0, 2.14, 0.507, signGeo, phoneSignMat);
    }

    // Shallow four-sided cap, then the little ball finial.
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.78, 0.27, 4),
      phoneRed
    );
    roof.position.y = 2.455;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    box.add(roof);
    const finial = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      phoneTrim
    );
    finial.position.y = 2.605;
    box.add(finial);

    // Door handle and a worn stone step at the front.
    addPart(new THREE.BoxGeometry(0.035, 0.28, 0.045), phoneTrim, 0.36, 1.08, 0.53);
    addPart(new THREE.BoxGeometry(1.0, 0.07, 0.26), stoneMat, 0, 0.035, 0.66);

    mergeStaticGroup(box);
    box.position.set(-20.3, 0, -8.35);
    group.add(box);
    props.push(box);
  }

  /* --------------------------- roadside props --------------------------- */
  // Hay bales in the fields.
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xb89a58, roughness: 0.95 });
  const hayGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.15, 10);
  for (let i = 0; i < 18; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const hay = new THREE.Mesh(hayGeo, hayMat);
    hay.rotation.z = Math.PI / 2;
    hay.position.set(
      START + rand() * SCENERY_CYCLE,
      0.75,
      side * (28 + rand() * 8)
    );
    hay.castShadow = true;
    hay.receiveShadow = true;
    group.add(hay);
    props.push(hay);
  }

  // Wildflowers are painted into the grass texture. A separate point cloud
  // turned into visible soft dots at driving distance, so the verge stays
  // texture-only here.

  /* ------------------------- village furniture -------------------------- */
  // Low field-stone boundary walls break up the hedge line.
  const wallSegments = [
    { x: -108, z: 6.58, len: 11 },
    { x: -18, z: -6.58, len: 9 },
    { x: 62, z: 6.58, len: 12 },
    { x: 138, z: -6.58, len: 10 },
  ];
  for (const segment of wallSegments) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(segment.len, 0.66, 0.42),
      stoneWallMat
    );
    wall.position.set(segment.x, 0.33, segment.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
    props.push(wall);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(segment.len + 0.12, 0.09, 0.54),
      stoneWallMat
    );
    cap.position.set(segment.x, 0.7, segment.z);
    cap.castShadow = true;
    group.add(cap);
    props.push(cap);
  }

  function makeBench() {
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 0.08, 0.44),
      timberMat
    );
    seat.position.y = 0.44;
    seat.castShadow = true;
    bench.add(seat);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 0.44, 0.07),
      timberMat
    );
    back.position.set(0, 0.73, -0.19);
    back.rotation.x = -0.1;
    back.castShadow = true;
    bench.add(back);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.44, 0.4),
        stoneMat
      );
      leg.position.set(side * 0.62, 0.22, 0);
      leg.castShadow = true;
      bench.add(leg);
    }
    return bench;
  }

  for (const spot of [
    { x: -10.9, z: -6.4, ry: 0.1 },
    { x: 24, z: 6.42, ry: Math.PI },
    { x: -33.2, z: -27.1, ry: 0.2 },
    { x: 96, z: 6.42, ry: Math.PI },
    { x: 186, z: -6.4, ry: 0.1 },
  ]) {
    const bench = makeBench();
    bench.position.set(spot.x, 0, spot.z);
    bench.rotation.y = spot.ry;
    group.add(bench);
    props.push(bench);
  }

  function makeMailbox() {
    const box = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 1.1, 0.09),
      timberMat
    );
    post.position.y = 0.55;
    post.castShadow = true;
    box.add(post);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.28, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x5b6752,
        roughness: 0.62,
        metalness: 0.35,
      })
    );
    body.position.y = 1.18;
    body.castShadow = true;
    box.add(body);
    return box;
  }

  for (const spot of [
    { x: -6.2, z: 6.35 },
    { x: 39.5, z: -6.35 },
    { x: -71, z: -6.35 },
    { x: 102, z: 6.35 },
    { x: -148, z: 6.35 },
    { x: 196, z: -6.35 },
  ]) {
    const mailbox = makeMailbox();
    mailbox.position.set(spot.x, 0, spot.z);
    group.add(mailbox);
    props.push(mailbox);
  }

  function makeLampPost() {
    const lamp = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.08, 3.25, 6),
      poleMat
    );
    post.position.y = 1.62;
    post.castShadow = true;
    lamp.add(post);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.72),
      poleMat
    );
    arm.position.set(0, 3.18, -0.32);
    lamp.add(arm);
    const lantern = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.28, 0.18),
      lampGlowMat
    );
    lantern.position.set(0, 3.0, -0.64);
    lamp.add(lantern);
    return lamp;
  }

  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const lamp = makeLampPost();
    lamp.position.set(-160 + i * 65, 0, side * 6.32);
    if (side < 0) lamp.rotation.y = Math.PI;
    group.add(lamp);
    props.push(lamp);
  }

  // A little red tractor parked by the barn.
  {
    const tractor = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({
      color: 0x7e3025,
      roughness: 0.58,
      metalness: 0.28,
      envMapIntensity: 0.5,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.72, 1.16), red);
    body.position.y = 0.92;
    body.castShadow = true;
    tractor.add(body);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.52, 1.02), red);
    hood.position.set(1.02, 0.92, 0);
    hood.castShadow = true;
    tractor.add(hood);

    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(1.16, 1.2, 1.06),
      new THREE.MeshStandardMaterial({
        color: 0x27302f,
        roughness: 0.42,
        metalness: 0.35,
      })
    );
    cab.position.set(-0.52, 1.82, 0);
    cab.castShadow = true;
    tractor.add(cab);
    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.08, 1.22), red);
    cabRoof.position.set(-0.52, 2.46, 0);
    cabRoof.castShadow = true;
    tractor.add(cabRoof);

    for (const side of [-1, 1]) {
      const rear = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.72, 0.38, 14),
        tireMat
      );
      rear.rotation.x = Math.PI / 2;
      rear.position.set(-0.7, 0.72, side * 0.72);
      rear.castShadow = true;
      tractor.add(rear);
      const rearRim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.34, 0.4, 12),
        rimMat
      );
      rearRim.rotation.x = Math.PI / 2;
      rearRim.position.set(-0.7, 0.72, side * 0.72);
      tractor.add(rearRim);

      const front = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.26, 12),
        tireMat
      );
      front.rotation.x = Math.PI / 2;
      front.position.set(1.02, 0.4, side * 0.62);
      front.castShadow = true;
      tractor.add(front);
    }

    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.9, 6),
      gutterMat
    );
    exhaust.position.set(0.64, 1.6, 0.34);
    tractor.add(exhaust);

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.16, 0.44),
      timberMat
    );
    seat.position.set(-0.42, 1.3, 0);
    tractor.add(seat);

    const barn =
      housePositions.find((house) => house.barn) ?? housePositions[5];
    tractor.position.set(barn.x + 7, 0, barn.z > 0 ? barn.z + 5 : barn.z - 5);
    tractor.rotation.y = 0.5;
    group.add(tractor);
    props.push(tractor);
  }

  /* ------------------------------ road life ----------------------------- */
  // Sparse village traffic: a few sports cars passing on the far lane, three
  // cyclists on the shoulders and one motorbike. Everything is procedural and
  // deliberately low-detail at driving distance.
  const riderSkinMat = new THREE.MeshStandardMaterial({
    color: 0xa97650,
    roughness: 0.72,
    metalness: 0.0,
    envMapIntensity: 0.35,
  });
  const riderTrouserMat = new THREE.MeshStandardMaterial({
    color: 0x23262b,
    roughness: 0.88,
    metalness: 0.0,
  });
  const riderHelmetMat = new THREE.MeshStandardMaterial({
    color: 0x171a1c,
    roughness: 0.35,
    metalness: 0.25,
    envMapIntensity: 0.7,
  });
  const bikeFrameMats = [
    new THREE.MeshStandardMaterial({ color: 0x2f4d5c, roughness: 0.42, metalness: 0.55 }),
    new THREE.MeshStandardMaterial({ color: 0x6b2b2a, roughness: 0.42, metalness: 0.55 }),
    new THREE.MeshStandardMaterial({ color: 0x3d4a32, roughness: 0.45, metalness: 0.5 }),
  ];
  const carGlassMat = new THREE.MeshStandardMaterial({
    color: 0x0b1318,
    roughness: 0.16,
    metalness: 0.72,
    envMapIntensity: 1.25,
  });
  const headlightMat = new THREE.MeshBasicMaterial({
    color: 0xfff1cf,
    toneMapped: false,
    fog: true,
  });
  const taillightMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a,
    toneMapped: false,
    fog: true,
  });

  function tubeGeometry(a, b, radius) {
    const start = new THREE.Vector3(a[0], a[1], a[2]);
    const end = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = end.clone().sub(start);
    const length = dir.length();
    dir.normalize();
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 6);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir
    );
    const matrix = new THREE.Matrix4().compose(
      start.clone().addScaledVector(dir, length / 2),
      quat,
      new THREE.Vector3(1, 1, 1)
    );
    geometry.applyMatrix4(matrix);
    return geometry;
  }

  function makeRider(jacketMat) {
    const rider = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.145, 0.3, 4, 6),
      jacketMat
    );
    torso.scale.z = 0.72;
    torso.rotation.z = -0.26;
    torso.position.set(0.02, 1.12, 0);
    torso.castShadow = true;
    rider.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      riderSkinMat
    );
    head.position.set(0.15, 1.47, 0);
    head.castShadow = true;
    rider.add(head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.112, 8, 6, 0, TAU, 0, Math.PI * 0.56),
      riderHelmetMat
    );
    helmet.position.set(0.15, 1.49, 0);
    rider.add(helmet);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(
        tubeGeometry(
          [0.0, 1.32, side * 0.14],
          [0.43, 0.96, side * 0.16],
          0.042
        ),
        jacketMat
      );
      arm.castShadow = true;
      rider.add(arm);

      const leg = new THREE.Mesh(
        tubeGeometry(
          [-0.02, 0.94, side * 0.11],
          [0.06, 0.38, side * 0.13],
          0.058
        ),
        riderTrouserMat
      );
      leg.castShadow = true;
      rider.add(leg);
    }
    return rider;
  }

  function makeCyclist(frameMat) {
    const bike = new THREE.Group();
    const segments = [
      [[-0.55, 0.34, 0], [-0.1, 0.84, 0]],
      [[-0.1, 0.84, 0], [0.02, 0.4, 0]],
      [[0.02, 0.4, 0], [0.55, 0.34, 0]],
      [[-0.1, 0.84, 0], [0.38, 0.88, 0]],
      [[0.38, 0.88, 0], [0.55, 0.34, 0]],
      [[-0.55, 0.34, 0], [0.02, 0.4, 0]],
    ];
    const frameGeo = mergeGeometries(
      segments.map(([a, b]) => tubeGeometry(a, b, 0.022)),
      false
    );
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.castShadow = true;
    bike.add(frame);

    const wheels = [];
    for (const wx of [-0.55, 0.55]) {
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.33, 0.022, 6, 16),
        tireMat
      );
      wheel.position.set(wx, 0.34, 0);
      wheel.castShadow = true;
      bike.add(wheel);
      wheels.push(wheel);
    }

    const saddle = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.05, 0.12),
      riderTrouserMat
    );
    saddle.position.set(-0.12, 0.87, 0);
    bike.add(saddle);

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.4, 6),
      gutterMat
    );
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0.38, 0.9, 0);
    bike.add(bar);

    bike.add(makeRider(frameMat));
    return { group: bike, wheels, radius: 0.33, length: 1.4, width: 0.35, type: "cyclist" };
  }

  function makeMotorbike() {
    const bike = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({
      color: 0x8a2a1f,
      roughness: 0.3,
      metalness: 0.6,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.1,
    });
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(1.5, 0.4, 0.4, 3, 0.12),
      paint
    );
    body.position.y = 0.74;
    body.castShadow = true;
    bike.add(body);

    const tank = new THREE.Mesh(
      new RoundedBoxGeometry(0.58, 0.3, 0.36, 3, 0.1),
      paint
    );
    tank.position.set(0.18, 0.94, 0);
    tank.castShadow = true;
    bike.add(tank);

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.3),
      riderTrouserMat
    );
    seat.position.set(-0.5, 0.96, 0);
    bike.add(seat);

    const wheels = [];
    for (const wx of [-0.62, 0.62]) {
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.05, 6, 16),
        tireMat
      );
      wheel.position.set(wx, 0.36, 0);
      wheel.castShadow = true;
      bike.add(wheel);
      wheels.push(wheel);
    }

    for (const side of [-1, 1]) {
      const fork = new THREE.Mesh(
        tubeGeometry([0.62, 0.36, side * 0.1], [0.4, 1.0, side * 0.1], 0.025),
        gutterMat
      );
      bike.add(fork);
    }

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6),
      gutterMat
    );
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0.4, 1.02, 0);
    bike.add(bar);

    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10),
      headlightMat
    );
    lamp.rotation.z = Math.PI / 2;
    lamp.position.set(0.76, 0.88, 0);
    bike.add(lamp);

    bike.add(makeRider(paint));
    return { group: bike, wheels, radius: 0.34, length: 2.0, width: 0.7, type: "motorbike" };
  }

  function addVillageWheel(vehicle, wheels, wheelRadii, x, y, z, radius, width) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, width, 14),
      tireMat
    );
    tire.rotation.x = Math.PI / 2;
    tire.castShadow = true;
    pivot.add(tire);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.01, 10),
      rimMat
    );
    rim.rotation.x = Math.PI / 2;
    pivot.add(rim);
    vehicle.add(pivot);
    wheels.push({ pivot, radius, front: x > 0 });
    wheelRadii.push(radius);
  }

  function makeVillageTractor(paintMat) {
    const tractor = new THREE.Group();
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(2.5, 0.72, 1.16, 3, 0.12),
      paintMat
    );
    body.position.y = 0.92;
    body.castShadow = true;
    tractor.add(body);

    const hood = new THREE.Mesh(
      new RoundedBoxGeometry(1.05, 0.52, 1.02, 3, 0.1),
      paintMat
    );
    hood.position.set(1.02, 0.92, 0);
    hood.castShadow = true;
    tractor.add(hood);

    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(1.16, 1.2, 1.06),
      carGlassMat
    );
    cab.position.set(-0.52, 1.82, 0);
    cab.castShadow = true;
    tractor.add(cab);

    const cabRoof = new THREE.Mesh(
      new THREE.BoxGeometry(1.38, 0.08, 1.22),
      paintMat
    );
    cabRoof.position.set(-0.52, 2.46, 0);
    cabRoof.castShadow = true;
    tractor.add(cabRoof);

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.08, 0.4),
      riderTrouserMat
    );
    seat.position.set(-0.35, 1.3, 0);
    tractor.add(seat);

    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 0.85, 6),
      gutterMat
    );
    exhaust.position.set(1.36, 1.5, 0.26);
    tractor.add(exhaust);

    const wheels = [];
    const wheelRadii = [];
    for (const side of [-1, 1]) {
      addVillageWheel(tractor, wheels, wheelRadii, -0.7, 0.72, side * 0.72, 0.72, 0.36);
      addVillageWheel(tractor, wheels, wheelRadii, 1.05, 0.37, side * 0.58, 0.37, 0.22);
    }

    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, 0.24),
        headlightMat
      );
      head.position.set(1.57, 0.95, side * 0.34);
      tractor.add(head);
    }

    return {
      group: tractor,
      wheels,
      wheelRadii,
      radius: 0.72,
      length: 2.8,
      width: 1.5,
      type: "tractor",
    };
  }

  function makeVillageTruck(paintMat) {
    const truck = new THREE.Group();
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(6.0, 0.2, 1.9),
      gutterMat
    );
    chassis.position.y = 0.55;
    truck.add(chassis);

    const cab = new THREE.Mesh(
      new RoundedBoxGeometry(2.2, 1.8, 2.0, 3, 0.14),
      paintMat
    );
    cab.position.set(2.2, 1.35, 0);
    cab.castShadow = true;
    truck.add(cab);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.66, 1.6),
      carGlassMat
    );
    windshield.position.set(3.32, 1.85, 0);
    truck.add(windshield);

    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 1.6, 2.0),
      new THREE.MeshStandardMaterial({
        color: 0x8d8a7d,
        roughness: 0.72,
        metalness: 0.18,
        envMapIntensity: 0.5,
      })
    );
    bed.position.set(-0.9, 1.5, 0);
    bed.castShadow = true;
    truck.add(bed);

    const tailgate = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.55, 1.95),
      paintMat
    );
    tailgate.position.set(-2.82, 1.5, 0);
    truck.add(tailgate);

    const wheels = [];
    const wheelRadii = [];
    for (const side of [-1, 1]) {
      addVillageWheel(truck, wheels, wheelRadii, 2.4, 0.4, side * 0.9, 0.4, 0.26);
      addVillageWheel(truck, wheels, wheelRadii, -1.4, 0.4, side * 0.9, 0.4, 0.26);
      addVillageWheel(truck, wheels, wheelRadii, -2.4, 0.4, side * 0.9, 0.4, 0.26);
    }

    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, 0.28),
        headlightMat
      );
      head.position.set(3.33, 0.8, side * 0.66);
      truck.add(head);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, 0.24),
        taillightMat
      );
      tail.position.set(-2.88, 0.9, side * 0.78);
      truck.add(tail);
    }

    return {
      group: truck,
      wheels,
      wheelRadii,
      radius: 0.4,
      length: 6.2,
      width: 2.0,
      type: "truck",
    };
  }

  function makeVillageBus(paintMat) {
    const bus = new THREE.Group();
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(7.6, 2.1, 2.15, 4, 0.16),
      paintMat
    );
    body.position.y = 1.4;
    body.castShadow = true;
    bus.add(body);

    const windowBand = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 0.65, 2.16),
      carGlassMat
    );
    windowBand.position.y = 2.0;
    bus.add(windowBand);

    for (let i = -2; i <= 2; i++) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.7, 2.17),
        paintMat
      );
      pillar.position.set(i * 1.22, 2.0, 0);
      bus.add(pillar);
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(7.0, 0.07, 1.9),
      paintMat
    );
    roof.position.y = 2.5;
    bus.add(roof);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.8, 1.7),
      carGlassMat
    );
    windshield.position.set(3.81, 1.98, 0);
    bus.add(windshield);

    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.3, 1.35),
      gutterMat
    );
    grille.position.set(3.82, 0.8, 0);
    bus.add(grille);

    const wheels = [];
    const wheelRadii = [];
    for (const side of [-1, 1]) {
      addVillageWheel(bus, wheels, wheelRadii, 2.6, 0.42, side * 0.92, 0.42, 0.28);
      addVillageWheel(bus, wheels, wheelRadii, -2.4, 0.42, side * 0.92, 0.42, 0.28);
    }

    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.09, 0.3),
        headlightMat
      );
      head.position.set(3.82, 0.68, side * 0.72);
      bus.add(head);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, 0.26),
        taillightMat
      );
      tail.position.set(-3.82, 0.76, side * 0.8);
      bus.add(tail);
    }

    return {
      group: bus,
      wheels,
      wheelRadii,
      radius: 0.42,
      length: 7.6,
      width: 2.15,
      type: "bus",
    };
  }

  function makeSportsCar(paintMat) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(4.3, 0.5, 1.86, 4, 0.16),
      paintMat
    );
    body.position.y = 0.48;
    body.castShadow = true;
    car.add(body);

    const nose = new THREE.Mesh(
      new RoundedBoxGeometry(1.1, 0.34, 1.7, 3, 0.12),
      paintMat
    );
    nose.position.set(1.78, 0.5, 0);
    nose.castShadow = true;
    car.add(nose);

    const cabin = new THREE.Mesh(
      new RoundedBoxGeometry(2.0, 0.42, 1.5, 4, 0.14),
      carGlassMat
    );
    cabin.position.set(-0.18, 0.9, 0);
    cabin.castShadow = true;
    car.add(cabin);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.05, 1.28),
      paintMat
    );
    roof.position.set(-0.2, 1.13, 0);
    car.add(roof);

    const spoiler = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.05, 1.56),
      paintMat
    );
    spoiler.position.set(-2.0, 1.0, 0);
    spoiler.castShadow = true;
    car.add(spoiler);
    for (const side of [-1, 1]) {
      const support = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.22, 0.08),
        gutterMat
      );
      support.position.set(-1.96, 0.88, side * 0.54);
      car.add(support);
    }

    const wheels = [];
    for (const side of [-1, 1]) {
      for (const ax of [-1.35, 1.35]) {
        const pivot = new THREE.Group();
        pivot.position.set(ax, 0.34, side * 0.86);
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14),
          tireMat
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.castShadow = true;
        pivot.add(wheel);
        const rim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.2, 0.245, 10),
          rimMat
        );
        rim.rotation.x = Math.PI / 2;
        pivot.add(rim);
        car.add(pivot);
        wheels.push(pivot);
      }
    }

    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.07, 0.42),
        headlightMat
      );
      head.position.set(2.24, 0.58, side * 0.54);
      car.add(head);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.06, 0.38),
        taillightMat
      );
      tail.position.set(-2.18, 0.6, side * 0.54);
      car.add(tail);
    }

    return { group: car, wheels, radius: 0.34, length: 4.4, width: 1.86, type: "sports-car" };
  }

  function addRoadActor(
    build,
    { x, z, dir, speed, length = 4.4, canOvertake = false }
  ) {
    const object = build.group;
    object.position.set(x, 0, z);
    object.rotation.y = dir > 0 ? 0 : Math.PI;
    group.add(object);
    const wheelSet = (build.wheels ?? []).map((wheel, index) => ({
      pivot: wheel.isObject3D ? wheel : wheel.pivot,
      radius:
        (wheel.isObject3D ? null : wheel.radius) ??
        build.wheelRadii?.[index] ??
        build.radius ??
        0.34,
      front: wheel.isObject3D ? false : Boolean(wheel.front),
    }));
    const type = build.type ?? "actor";
    object.userData.type = type;
    roadActors.push({
      object,
      dir,
      speed,
      baseSpeed: speed,
      wheels: wheelSet,
      length: build.length ?? length,
      width: build.width ?? 1.8,
      baseZ: z,
      laneZ: z,
      targetZ: z,
      overtakeTimer: 0,
      cooldown: 0,
      canOvertake,
      type,
      steer: 0,
      phase: rand() * Math.PI * 2,
    });
  }

  const sportsPaintMats = [0x8e1d22, 0xc29a24, 0x1e3f73].map(
    (color) =>
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.28,
        metalness: 0.62,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.15,
      })
  );
  const villageTractorMat = new THREE.MeshStandardMaterial({
    color: 0x7e3025,
    roughness: 0.58,
    metalness: 0.28,
    envMapIntensity: 0.5,
  });
  const villageBusMat = new THREE.MeshStandardMaterial({
    color: 0x2f6f5e,
    roughness: 0.5,
    metalness: 0.32,
    envMapIntensity: 0.7,
  });
  const villageTruckMat = new THREE.MeshStandardMaterial({
    color: 0x5e5a44,
    roughness: 0.58,
    metalness: 0.3,
    envMapIntensity: 0.6,
  });

  for (let i = 0; i < 3; i++) {
    addRoadActor(makeSportsCar(sportsPaintMats[i]), {
      x: [36, 128, -84][i],
      z: LANE_FAR,
      dir: -1,
      speed: [17, 19, 15][i],
      canOvertake: true,
    });
  }

  addRoadActor(makeVillageBus(villageBusMat), {
    x: -30,
    z: LANE_FAR,
    dir: -1,
    speed: 7.4,
  });
  addRoadActor(makeVillageTruck(villageTruckMat), {
    x: 70,
    z: LANE_FAR,
    dir: -1,
    speed: 8.6,
  });
  addRoadActor(makeVillageTractor(villageTractorMat), {
    x: -140,
    z: LANE_FAR,
    dir: -1,
    speed: 4.8,
  });

  addRoadActor(makeCyclist(bikeFrameMats[0]), {
    x: 22,
    z: 5.55,
    dir: 1,
    speed: 4.2,
  });
  addRoadActor(makeCyclist(bikeFrameMats[1]), {
    x: -64,
    z: 5.55,
    dir: 1,
    speed: 4.2,
  });
  addRoadActor(makeCyclist(bikeFrameMats[2]), {
    x: 78,
    z: -5.5,
    dir: -1,
    speed: 4.6,
  });
  addRoadActor(makeMotorbike(), {
    x: 110,
    z: -4.15,
    dir: -1,
    speed: 13,
    canOvertake: true,
  });

  /* ----------------------------- villagers ------------------------------ */
  const villageCrowdActors = [
    { x: -36, z: 6.15, kind: "walk", dir: 1, walk: 0.72 },
    { x: 18, z: 6.2, kind: "walk", dir: -1, walk: 0.66 },
    { x: 64, z: 6.1, kind: "walk", dir: 1, walk: 0.8 },
    { x: -88, z: -6.15, kind: "walk", dir: -1, walk: 0.7 },
    { x: 42, z: -6.2, kind: "walk", dir: 1, walk: 0.78 },
    { x: -12, z: -6.1, kind: "walk", dir: -1, walk: 0.62 },
  ];
  for (const index of [2, 6, 10]) {
    const house = housePositions[index];
    const side = house.z > 0 ? 1 : -1;
    villageCrowdActors.push({
      x: house.x + (rand() - 0.5) * 3,
      z: side * (11.1 + rand() * 1.2),
      kind: "shop",
      yaw: side > 0 ? Math.PI : 0,
      bag: rand() > 0.5,
    });
  }
  villageCrowdActors.push({
    x: -12.2,
    z: -6.3,
    kind: "shop",
    yaw: 0,
    umbrella: false,
  });

  const crowd = createCrowd({
    actors: villageCrowdActors,
    wrapMin: START - 30,
    wrapSpan: SCENERY_CYCLE,
    seed: 20261025,
    castShadow: true,
  });
  group.add(crowd.group);

  /* ---------------------------- distant hills --------------------------- */
  // Three hill tones at staggered distances. Warm olive in the near ring,
  // sage in the middle, hazy blue-green at the back; the fog does the rest.
  const hillMats = [
    new THREE.MeshStandardMaterial({
      color: 0x66734c,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.1,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x7b8468,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.09,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x929a88,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.08,
    }),
  ];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * TAU + rand() * 0.22;
    const radius = 150 + rand() * 120;
    const material =
      radius > 230 ? hillMats[2] : radius > 190 ? hillMats[1] : hillMats[0];
    const shapeRadius = 26 + rand() * 38;
    const sx = 1.5 + rand() * 1.0;
    const sy = 0.2 + rand() * 0.22;
    const sz = 1.1 + rand() * 0.8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = -5 - rand() * 6;
    // Leave the lane and its verges clear: a hill whose flattened footprint
    // reaches the road reads as a green wall across the horizon and hides the
    // whole far stretch of the street.
    if (Math.abs(z) < shapeRadius * sz + 30) continue;
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(shapeRadius, 10, 7),
      material
    );
    hill.scale.set(sx, sy, sz);
    hill.position.set(x, y, z);
    group.add(hill);
  }

  // A low, dense mountain ridge behind the hills. Many overlapping, faceted
  // peaks read as one continuous range instead of a few isolated pyramids.
  const mountainMats = [
    new THREE.MeshStandardMaterial({
      color: 0x71807c,
      roughness: 1.0,
      metalness: 0.0,
      flatShading: true,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x7e8a85,
      roughness: 1.0,
      metalness: 0.0,
      flatShading: true,
    }),
  ];
  for (let i = 0; i < 56; i++) {
    const angle = (i / 56) * TAU + rand() * 0.08;
    const radius = 300 + rand() * 90;
    const coneRadius = 60 + rand() * 44;
    const coneHeight = 14 + rand() * 20;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = -1 + rand() * 3;
    const spin = rand() * TAU;
    // The ridge is a backdrop, not a wall across the road. Skip the peaks whose
    // base circle reaches the lane so the extended street runs out into haze.
    if (Math.abs(z) < coneRadius + 12) continue;
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(coneRadius, coneHeight, 7),
      mountainMats[i % 2]
    );
    mountain.position.set(x, y, z);
    mountain.rotation.y = spin;
    group.add(mountain);
  }

  /* ------------------------------- lights ------------------------------- */
  // Late-afternoon light: a warm low sun with a restrained sky fill. The
  // earlier 0.98 hemisphere washed every surface toward the same pale sage and
  // flattened the long shadows that give the village its depth.
  const hemi = new THREE.HemisphereLight(0xc6d6e6, 0x6a5838, 0.78);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(0xffb877, 3.5);
  sun.position.set(-58, 30, 34);
  sun.target.position.set(0, 0.8, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(
    window.matchMedia("(pointer: coarse)").matches ? 1024 : 2048,
    window.matchMedia("(pointer: coarse)").matches ? 1024 : 2048
  );
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.0004;
  group.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0xa9c9ee, 0.22);
  fill.position.set(38, 26, -32);
  fill.target.position.set(0, 0.8, 0);
  group.add(fill, fill.target);

  const warmBounce = new THREE.PointLight(0xffc98f, 5, 22, 1.7);
  warmBounce.position.set(-3, 3.2, 6);
  group.add(warmBounce);

  /* -------------------------------- rain -------------------------------- */
  const rain = createRain({
    count: 1800,
    radius: 25,
    height: 18,
    color: 0xd2e0ea,
    opacity: 0.42,
    windX: 0.7,
    windZ: 0.2,
  });
  group.add(rain.group);

  let rainOn = false;
  let wetness = 0;

  function setRain(value) {
    rainOn = Boolean(value);
    rain.setVisible(rainOn);
    sky.material.map = rainOn ? rainSky : clearSky;
    sky.material.needsUpdate = true;
    hemi.intensity = rainOn ? 0.62 : 0.78;
    sun.intensity = rainOn ? 1.1 : 3.5;
    fill.intensity = rainOn ? 0.18 : 0.22;
    roadMaterial.roughness = rainOn ? 0.42 : 0.9;
    // The dry tint used to be a dark grey, which multiplied with the already
    // grey asphalt map and turned the near lane almost black. Keep the dry
    // surface light so the texture supplies the tone, and darken only when wet.
    roadMaterial.color.set(rainOn ? 0x6b7175 : 0xc4c7c3);
    roadMaterial.envMapIntensity = rainOn ? 0.55 : 0.24;
    grass.material.color.set(rainOn ? 0x7d8a5e : 0xffffff);
    grass.material.roughness = rainOn ? 0.72 : 0.96;
    crowd.setRain(rainOn);
    wetness = rainOn ? 1 : 0;
  }

  // A longer, slightly cooler falloff keeps the distant ridge blue-green
  // instead of bleaching it into flat cream triangles.
  const fog = new THREE.Fog(0xe3ccab, 125, 470);

  /* ------------------------------- update ------------------------------- */
  let roadOffset = 0;

  function update(dt, elapsed, speed, camera, focusX = 0, player = null) {
    windTime.value = elapsed;
    roadOffset = (roadOffset + (speed * dt) / TILE) % 1;
    roadTexture.offset.x = roadOffset;
    gravelTexture.offset.x = (gravelTexture.offset.x + (speed * dt) / 4) % 1;
    // One hedge texture repeat spans ROAD_LENGTH / 140 metres, so the base
    // foliage scrolls at the same ground speed as the clumps sitting on it.
    hedgeBaseTexture.offset.x =
      (hedgeBaseTexture.offset.x + (speed * dt) / (ROAD_LENGTH / 140)) % 1;

    for (const prop of props) {
      prop.position.x -= speed * dt;
      if (prop.position.x < START - 30) prop.position.x += SCENERY_CYCLE;
    }
    for (const prop of farProps) {
      prop.position.x -= speed * dt * 0.18;
      if (prop.position.x < START - 50) prop.position.x += SCENERY_CYCLE;
    }

    for (const batch of scrollingBatches) {
      batch.offset = (batch.offset + speed * dt * batch.rate) % batch.span;
      writeScrollingBatch(batch);
    }

    // Village traffic. The road is narrow, so nobody overtakes: a fast sports
    // car queues behind the bus or tractor instead of cutting into the centre
    // line. Each vehicle keeps its own road speed; the player's speed only
    // changes the relative motion, never the speed the AI drives at.
    const lanes = new Map();
    for (const actor of roadActors) {
      const key = `${actor.dir}|${actor.baseZ}`;
      let lane = lanes.get(key);
      if (!lane) {
        lane = [];
        lanes.set(key, lane);
      }
      lane.push(actor);
    }

    for (const lane of lanes.values()) {
      // Frontmost first: for dir -1 that is the smallest x.
      lane.sort(
        (a, b) => (b.object.position.x - a.object.position.x) * a.dir
      );
      for (let i = 0; i < lane.length; i++) {
        const actor = lane[i];
        if (i === 0) {
          actor.speed +=
            (actor.baseSpeed - actor.speed) * Math.min(1, dt * 0.9);
          continue;
        }
        const leader = lane[i - 1];
        const gap =
          (leader.object.position.x - actor.object.position.x) * actor.dir;
        const safe = (leader.length + actor.length) * 0.5 + 2.6;
        const look = 28;
        const t = THREE.MathUtils.clamp(
          (gap - safe) / Math.max(1, look - safe),
          0,
          1
        );
        const target = Math.min(
          actor.baseSpeed,
          leader.speed + (actor.baseSpeed - leader.speed) * t
        );
        actor.speed += (target - actor.speed) * Math.min(1, dt * 1.7);
      }
    }

    for (const actor of roadActors) {
      const oldX = actor.object.position.x;
      actor.object.position.x += (actor.dir * actor.speed - speed) * dt;

      let wrapped = false;
      if (actor.object.position.x < START - 30) {
        actor.object.position.x += CYCLE;
        wrapped = true;
      } else if (actor.object.position.x > START - 30 + CYCLE) {
        actor.object.position.x -= CYCLE;
        wrapped = true;
      }
      if (wrapped) {
        actor.speed = actor.baseSpeed;
        actor.laneZ = actor.baseZ;
      }

      actor.object.position.z = actor.laneZ;
      actor.object.rotation.y = actor.dir > 0 ? 0 : Math.PI;

      // Do not let a village vehicle drive through the player. Reverting the
      // step leaves it waiting at the bumper; the queue logic then holds the
      // vehicles behind it too.
      if (
        !wrapped &&
        player &&
        obbOverlap(
          player,
          {
            x: actor.object.position.x,
            z: actor.laneZ,
            heading: actor.object.rotation.y,
            halfLength: actor.length * 0.5,
            halfWidth: actor.width * 0.5,
          },
          0.06
        )
      ) {
        actor.object.position.x = oldX;
      }

      const steerTarget = THREE.MathUtils.clamp(
        Math.sin(elapsed * 0.7 + actor.phase) * 0.012,
        -0.03,
        0.03
      );
      actor.steer += (steerTarget - actor.steer) * Math.min(1, dt * 3.6);

      for (const wheel of actor.wheels) {
        if (wheel.front) wheel.pivot.rotation.y = actor.steer;
        wheel.pivot.rotation.z -= (actor.speed * dt) / wheel.radius;
      }
    }

    // A hard safety net after movement. Lane groups already keep a comfortable
    // gap; this catches the rare case where a wrap or a slow leader closes it.
    // Push along x only, and compare lane-relative z so a wide vehicle in the
    // next lane is never mistaken for a rear-end collision.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < roadActors.length; i++) {
        for (let j = i + 1; j < roadActors.length; j++) {
          const a = roadActors[i];
          const b = roadActors[j];
          const dx = b.object.position.x - a.object.position.x;
          const dz = b.laneZ - a.laneZ;
          const minX = (a.length + b.length) * 0.5 + 1.2;
          const minZ = (a.width + b.width) * 0.5 + 0.3;
          if (Math.abs(dx) >= minX || Math.abs(dz) >= minZ) continue;
          const push = (minX - Math.abs(dx)) * 0.5 + 0.01;
          if (a.dir === b.dir) {
            // Move the one that is behind backwards along its travel axis.
            const behind = (dx * a.dir) > 0 ? a : b;
            behind.object.position.x -= push * behind.dir;
          } else {
            a.object.position.x -= push;
            b.object.position.x += push;
          }
        }
      }
    }

    // Keep every actor in its lane after the safety push.
    for (const actor of roadActors) {
      actor.object.position.z = actor.laneZ;
    }

    for (const blades of windmills) {
      blades.rotation.z += dt * (0.35 + speed * 0.012);
    }

    crowd.update(dt, speed);
    rain.update(dt, speed, camera);

    // Wet ground keeps a little gloss after the rain stops, then dries.
    if (!rainOn && wetness > 0) {
      wetness = Math.max(0, wetness - dt * 0.12);
      roadMaterial.roughness = 0.42 + (1 - wetness) * 0.48;
    }
  }

  const environment = makeEnvironment(renderer, clearSky);

  return {
    group,
    environment,
    fog,
    update,
    setRain,
    crowd,
    roadActors,
    get rainOn() {
      return rainOn;
    },
  };
}

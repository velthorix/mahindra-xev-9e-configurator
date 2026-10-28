import * as THREE from "three";
import { createRain } from "./rain.js";
import { createCrowd } from "./people.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* -------------------------------------------------------------------------- */
/*  Night City                                                                */
/* -------------------------------------------------------------------------- */

const TAU = Math.PI * 2;
const CYCLE = 320;
const ROAD_LENGTH = 360;
const ROAD_WIDTH = 14;
const CITY_START = -168;
const CITY_END = CITY_START + CYCLE;
const TILE = 8;
const DASH_GAP = 8;

// Four-lane boulevard. The player owns the near inner lane; AI traffic uses the
// outer near lane in the same direction and the two far lanes oncoming. Keeping
// the hero lane free is what makes the high-speed overtake read cleanly instead
// of the camera clipping through a car.
const LANE_PLAYER = 1.75;
const LANE_SAME = 5.25;
const LANE_ONCOMING_INNER = -1.75;
const LANE_ONCOMING_OUTER = -5.25;

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
/*  Sky                                                                       */
/* -------------------------------------------------------------------------- */

function makeSkyTexture() {
  const { canvas, ctx } = canvas2d(1024, 512);
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  // Dark navy, not pitch black. A real city sky still holds some light from
  // the skyglow, and an absolute black dome makes the towers read as cut-outs.
  grad.addColorStop(0, "#060b18");
  grad.addColorStop(0.26, "#081222");
  grad.addColorStop(0.48, "#0b1d31");
  grad.addColorStop(0.63, "#143149");
  grad.addColorStop(0.73, "#1b3e56");
  grad.addColorStop(0.79, "#244252");
  grad.addColorStop(0.84, "#2c333a");
  grad.addColorStop(0.89, "#151e27");
  grad.addColorStop(1, "#03060c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // City light pollution along the horizon: warm on one side, cool on the
  // other, broken up by a few soft clouds.
  const warm = ctx.createRadialGradient(270, 388, 10, 270, 388, 330);
  warm.addColorStop(0, "rgba(255, 172, 104, 0.2)");
  warm.addColorStop(0.45, "rgba(198, 118, 82, 0.08)");
  warm.addColorStop(1, "rgba(120, 70, 55, 0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 180, 700, 300);

  const cool = ctx.createRadialGradient(770, 370, 12, 770, 370, 360);
  cool.addColorStop(0, "rgba(112, 186, 255, 0.17)");
  cool.addColorStop(0.5, "rgba(68, 130, 205, 0.07)");
  cool.addColorStop(1, "rgba(40, 80, 130, 0)");
  ctx.fillStyle = cool;
  ctx.fillRect(400, 160, 624, 320);

  // Stars are drawn as real points in the scene instead of pixels in this
  // 1024px sky texture. At this texture resolution a painted star stretches
  // into a soft 10px block once it wraps the sky dome.
  const rand = seeded(71);
  for (let i = 0; i < 7; i++) {
    const x = rand() * 1024;
    const y = 300 + rand() * 80;
    const rx = 80 + rand() * 150;
    const ry = 8 + rand() * 16;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(20, 29, 40, ${0.2 + rand() * 0.2})`);
    g.addColorStop(1, "rgba(20, 29, 40, 0)");
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

/* -------------------------------------------------------------------------- */
/*  Ground                                                                    */
/* -------------------------------------------------------------------------- */

function makeRoadTexture() {
  const { canvas, ctx } = canvas2d(1024, 512);
  ctx.fillStyle = "#24282e";
  ctx.fillRect(0, 0, 1024, 512);

  const rand = seeded(19);
  for (let i = 0; i < 15000; i++) {
    const x = rand() * 1024;
    const y = rand() * 512;
    const a = 0.012 + rand() * 0.05;
    ctx.fillStyle = rand() > 0.48 ? `rgba(235,240,246,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 1 + rand() * 2.4, 1 + rand() * 2.4);
  }

  // Slightly polished wheel tracks.
  for (const y of [112, 384]) {
    const g = ctx.createLinearGradient(0, y - 34, 0, y + 64);
    g.addColorStop(0, "rgba(15,18,24,0)");
    g.addColorStop(0.45, "rgba(15,18,24,0.22)");
    g.addColorStop(1, "rgba(15,18,24,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 34, 1024, 98);
  }

  // Tar seams, patches and a couple of drain covers.
  for (let i = 0; i < 8; i++) {
    const x = rand() * 1024;
    const y = rand() * 512;
    ctx.strokeStyle = `rgba(12,14,18,${0.28 + rand() * 0.25})`;
    ctx.lineWidth = 2 + rand() * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + 40,
      y + (rand() - 0.5) * 50,
      x + 120,
      y + (rand() - 0.5) * 30,
      x + 180,
      y + (rand() - 0.5) * 60
    );
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = rand() * 1024;
    const y = rand() * 512;
    const w = 70 + rand() * 90;
    const h = 30 + rand() * 40;
    ctx.fillStyle = `rgba(28,32,38,${0.22 + rand() * 0.12})`;
    ctx.fillRect(x, y, w, h);
  }
  for (let i = 0; i < 3; i++) {
    const x = 200 + rand() * 620;
    const y = rand() * 480;
    ctx.fillStyle = "rgba(18,21,26,0.9)";
    ctx.beginPath();
    ctx.ellipse(x, y, 10, 7, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,98,108,0.32)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  return texture(canvas, { aniso: 8 });
}

function makePavingTexture() {
  const { canvas, ctx } = canvas2d(512, 512);
  ctx.fillStyle = "#2a2f37";
  ctx.fillRect(0, 0, 512, 512);
  const rand = seeded(41);
  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rand() * 0.018})`;
    ctx.fillRect(rand() * 512, rand() * 512, 1.5, 1.5);
  }
  // Paving slabs with slightly varied tone and fine joints.
  const cell = 64;
  for (let y = 0; y < 512; y += cell) {
    for (let x = 0; x < 512; x += cell) {
      const v = 46 + Math.floor(rand() * 16);
      ctx.fillStyle = `rgba(${v},${v + 3},${v + 7},0.55)`;
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
  }
  ctx.strokeStyle = "rgba(12,14,18,0.65)";
  ctx.lineWidth = 2;
  for (let y = 0; y <= 512; y += cell) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  for (let x = 0; x <= 512; x += cell) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  return texture(canvas, { aniso: 8 });
}

/* -------------------------------------------------------------------------- */
/*  Facades                                                                   */
/* -------------------------------------------------------------------------- */

const FACADE_COLS = 10;
const FACADE_ROWS = 20;
const FACADE_TILE_W = 10;
const FACADE_TILE_H = 30;
const FACADE_W = 768;
const FACADE_H = 1536;

function makeFacadeMaterial(seed, tone) {
  const { canvas: base, ctx: b } = canvas2d(FACADE_W, FACADE_H);
  const { canvas: glow, ctx: e } = canvas2d(FACADE_W, FACADE_H);
  const rand = seeded(seed);
  const palette =
    tone === "warm"
      ? ["255,190,118", "255,214,158", "232,156,92", "255,229,186"]
      : tone === "cool"
        ? ["142,188,240", "178,214,255", "106,158,220", "222,234,250"]
        : ["255,196,138", "154,194,242", "255,224,180", "188,214,245"];

  // Concrete still catches a little skyglow at night. Pure near-black made the
  // towers read as holes in the frame; these values keep the mass dark while
  // letting the piers and floor bands survive. The street-side blocks are now
  // much closer to the camera, so the facade needs enough mid-tone to show its
  // relief instead of collapsing into a silhouette.
  b.fillStyle =
    tone === "warm" ? "#2a241d" : tone === "cool" ? "#1f252e" : "#24262c";
  b.fillRect(0, 0, FACADE_W, FACADE_H);
  e.fillStyle = "#000";
  e.fillRect(0, 0, FACADE_W, FACADE_H);

  // Concrete grain, vertical weathering and horizontal pour marks.
  for (let i = 0; i < 9000; i++) {
    const x = rand() * FACADE_W;
    const y = rand() * FACADE_H;
    b.fillStyle =
      rand() > 0.52
        ? `rgba(255,255,255,${rand() * 0.014})`
        : `rgba(0,0,0,${rand() * 0.055})`;
    b.fillRect(x, y, 1.2 + rand() * 1.6, 1.2 + rand() * 1.6);
  }
  for (let i = 0; i < 20; i++) {
    const x = rand() * FACADE_W;
    const w = 6 + rand() * 28;
    const g = b.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, `rgba(0,0,0,${0.04 + rand() * 0.07})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    b.fillStyle = g;
    b.fillRect(x, 0, w, FACADE_H);
  }
  for (let i = 0; i < 46; i++) {
    b.fillStyle = `rgba(0,0,0,${0.02 + rand() * 0.045})`;
    b.fillRect(0, rand() * FACADE_H, FACADE_W, 1 + rand() * 2);
  }

  const cellW = FACADE_W / FACADE_COLS;
  const cellH = FACADE_H / FACADE_ROWS;

  // Floor bands and structural piers. These are deliberately low-contrast; the
  // only strong contrast in a night facade should come from lit windows.
  for (let row = 0; row <= FACADE_ROWS; row++) {
    const y = row * cellH;
    b.fillStyle = "rgba(0,0,0,0.32)";
    b.fillRect(0, y - 3, FACADE_W, 6);
    b.fillStyle = "rgba(186,196,210,0.045)";
    b.fillRect(0, y + 3, FACADE_W, 1.2);
  }
  for (let col = 0; col <= FACADE_COLS; col += 5) {
    const x = col * cellW;
    b.fillStyle = "rgba(0,0,0,0.28)";
    b.fillRect(x - 3, 0, 6, FACADE_H);
    b.fillStyle = "rgba(190,200,214,0.04)";
    b.fillRect(x + 3, 0, 1.5, FACADE_H);
  }

  // Dark vertical service risers and occasional blank party walls.
  for (let i = 0; i < 2; i++) {
    const x = 40 + rand() * (FACADE_W - 100);
    b.fillStyle = "rgba(7,9,12,0.4)";
    b.fillRect(x, 0, 8 + rand() * 12, FACADE_H);
  }

  const brightRow = 2 + Math.floor(rand() * 15);
  const officeTop = Math.floor(rand() * 4);
  let run = 0;
  let runLit = false;
  let runColor = null;
  for (let row = 0; row < FACADE_ROWS; row++) {
    const officeFloor = row < officeTop;
    const rowLit = officeFloor
      ? 0.58
      : row === brightRow
        ? 0.5
        : tone === "warm"
          ? 0.29
          : tone === "cool"
            ? 0.24
            : 0.27;

    for (let col = 0; col < FACADE_COLS; col++) {
      // A lit apartment usually shows a run of neighbouring windows, not one
      // isolated pane per floor. Starting short runs gives the facade the
      // lived-in rhythm of a real block.
      if (run === 0 && rand() < 0.17) {
        run = 2 + Math.floor(rand() * 4);
        runLit = rand() < 0.78;
        runColor = palette[Math.floor(rand() * palette.length)];
      }

      // Occasional balcony door: taller and wider than a normal window.
      const balconyDoor = row > officeTop + 1 && col % 5 === 2 && rand() > 0.52;
      const wx = col * cellW + cellW * (balconyDoor ? 0.17 : 0.22);
      const wy = row * cellH + cellH * (balconyDoor ? 0.12 : 0.2);
      const ww = cellW * (balconyDoor ? 0.66 : 0.56);
      const wh = cellH * (balconyDoor ? 0.74 : 0.58);
      const lit = run > 0 ? runLit : rand() < rowLit;
      if (run > 0) run--;

      // Recessed reveal and a dark aluminium frame.
      b.fillStyle = "rgba(4,6,9,0.94)";
      b.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      b.fillStyle = "rgba(20,24,29,0.96)";
      b.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

      // Dark glass with a faint cool sky reflection at the top.
      const glass = b.createLinearGradient(wx, wy, wx, wy + wh);
      glass.addColorStop(0, "rgba(32,54,75,0.92)");
      glass.addColorStop(0.28, "rgba(12,21,31,0.97)");
      glass.addColorStop(1, "rgba(5,9,14,1)");
      b.fillStyle = glass;
      b.fillRect(wx, wy, ww, wh);

      // Mullion and, on balcony doors, a lower rail.
      b.fillStyle = "rgba(3,5,8,0.9)";
      b.fillRect(wx + ww * 0.48, wy, 2, wh);
      if (balconyDoor) {
        b.fillRect(wx, wy + wh * 0.62, ww, 2.5);
      }

      if (lit) {
        const color = runColor ?? palette[Math.floor(rand() * palette.length)];
        const alpha = 0.24 + rand() * 0.46;
        // Crisp emissive rectangles only. A blurred halo here reads as a
        // smudge at street distance rather than a lit window.
        e.fillStyle = `rgba(${color},${alpha})`;
        e.fillRect(wx, wy, ww, wh);

        const inner = b.createLinearGradient(wx, wy, wx, wy + wh);
        inner.addColorStop(0, `rgba(${color},${alpha * 0.78})`);
        inner.addColorStop(0.55, `rgba(${color},${alpha * 0.52})`);
        inner.addColorStop(1, `rgba(${color},${alpha * 0.16})`);
        b.fillStyle = inner;
        b.fillRect(wx, wy, ww, wh);

        // Blinds, a curtain edge or a low sofa silhouette.
        const dressing = rand();
        if (dressing > 0.58) {
          const bx = wx + ww * (0.18 + rand() * 0.54);
          b.fillStyle = "rgba(7,9,12,0.62)";
          b.fillRect(bx, wy, 2 + rand() * 5, wh);
          e.fillStyle = "rgba(0,0,0,0.5)";
          e.fillRect(bx, wy, 3, wh);
        }
        if (dressing > 0.38) {
          b.fillStyle = "rgba(8,10,13,0.5)";
          b.fillRect(wx, wy + wh * (0.42 + rand() * 0.2), ww, 2.5);
        }
        if (dressing > 0.8) {
          b.fillStyle = "rgba(9,10,13,0.7)";
          b.fillRect(wx + ww * 0.2, wy + wh * 0.55, ww * 0.2, wh * 0.4);
          e.fillStyle = "rgba(0,0,0,0.4)";
          e.fillRect(wx + ww * 0.2, wy + wh * 0.55, ww * 0.2, wh * 0.4);
        }
        // A warm ceiling wash at the top of the pane.
        b.fillStyle = `rgba(${color},${0.12 + alpha * 0.2})`;
        b.fillRect(wx + 1, wy + 1, ww - 2, 3);
      } else {
        // Unlit glass still picks up the sky.
        const refl = b.createLinearGradient(wx, wy, wx, wy + wh * 0.45);
        refl.addColorStop(0, `rgba(72,104,136,${0.05 + rand() * 0.06})`);
        refl.addColorStop(1, "rgba(72,104,136,0)");
        b.fillStyle = refl;
        b.fillRect(wx, wy, ww, wh * 0.45);
      }

      // Every window gets a pale concrete sill; this is the small shadow line
      // that stops a facade reading as a flat printed grid.
      b.fillStyle = "rgba(182,190,202,0.16)";
      b.fillRect(wx - 5, wy + wh + 4, ww + 10, 2.4);
      b.fillStyle = "rgba(0,0,0,0.38)";
      b.fillRect(wx - 5, wy + wh + 6.4, ww + 10, 1.6);

      // A few air-conditioner boxes and balcony rails break the grid.
      if (rand() > 0.8) {
        const acx = wx + ww * 0.08;
        const acy = wy + wh + 5;
        b.fillStyle = "rgba(58,62,66,0.85)";
        b.fillRect(acx, acy, ww * 0.32, 7);
        b.fillStyle = "rgba(0,0,0,0.55)";
        b.fillRect(acx, acy + 6, ww * 0.32, 2);
        b.strokeStyle = "rgba(20,22,24,0.8)";
        b.lineWidth = 1;
        b.beginPath();
        b.arc(acx + ww * 0.16, acy + 3.2, 2.1, 0, TAU);
        b.stroke();
      }
      if (rand() > 0.9) {
        b.fillStyle = "rgba(8,10,13,0.7)";
        b.fillRect(wx - 4, wy + wh + 4, ww + 8, 2);
        b.fillRect(wx - 4, wy + wh + 4, 1.5, 8);
        b.fillRect(wx + ww + 2.5, wy + wh + 4, 1.5, 8);
      }
    }
  }

  // Ground-floor plinth: a darker, taller band than the residential floors.
  b.fillStyle = "rgba(4,6,8,0.65)";
  b.fillRect(0, FACADE_H - cellH, FACADE_W, cellH);
  b.fillStyle = "rgba(160,170,184,0.07)";
  b.fillRect(0, FACADE_H - cellH, FACADE_W, 2);

  const map = texture(base, { aniso: 8 });
  const emissiveMap = texture(glow, { aniso: 8 });
  return new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 1.05,
    roughness: 0.88,
    metalness: 0.04,
    envMapIntensity: 0.35,
  });
}

// A second facade family for the newer towers. Punched concrete windows on
// every block made the skyline read as one repeated building; a curtain wall
// with continuous mullions and a few fully lit floors gives the city the mix of
// old and new stock a real downtown has.
function makeCurtainWallMaterial(seed, tone) {
  const { canvas: base, ctx: b } = canvas2d(FACADE_W, FACADE_H);
  const { canvas: glow, ctx: e } = canvas2d(FACADE_W, FACADE_H);
  const rand = seeded(seed);
  const cols = 14;
  const rows = 26;
  const cellW = FACADE_W / cols;
  const cellH = FACADE_H / rows;
  const warm = tone === "warm";
  const litPalette = warm
    ? ["255,203,142", "255,226,184", "238,172,110"]
    : ["168,206,244", "198,224,255", "126,178,232"];

  b.fillStyle = warm ? "#1b1a18" : "#111820";
  b.fillRect(0, 0, FACADE_W, FACADE_H);
  e.fillStyle = "#000";
  e.fillRect(0, 0, FACADE_W, FACADE_H);

  // Continuous glass, darker toward the bottom of every floor.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellW;
      const y = row * cellH;
      const glass = b.createLinearGradient(x, y, x, y + cellH);
      glass.addColorStop(0, "rgba(46,72,96,0.96)");
      glass.addColorStop(0.45, "rgba(16,28,40,0.98)");
      glass.addColorStop(1, "rgba(8,14,21,1)");
      b.fillStyle = glass;
      b.fillRect(x + 1.5, y + 1.5, cellW - 3, cellH - 3);

      // Reflected sky streaks on a few panes.
      if (rand() > 0.72) {
        const refl = b.createLinearGradient(x, y, x + cellW, y + cellH);
        refl.addColorStop(0, "rgba(92,132,170,0.1)");
        refl.addColorStop(1, "rgba(92,132,170,0)");
        b.fillStyle = refl;
        b.fillRect(x + 1.5, y + 1.5, cellW - 3, cellH - 3);
      }
    }
  }

  // Whole floors lit at once, plus a scattering of individual offices.
  for (let row = 0; row < rows; row++) {
    const wholeFloor = rand() < 0.12;
    for (let col = 0; col < cols; col++) {
      const lit = wholeFloor || rand() < 0.18;
      if (!lit) continue;
      const color = litPalette[Math.floor(rand() * litPalette.length)];
      const alpha = wholeFloor ? 0.4 + rand() * 0.28 : 0.18 + rand() * 0.4;
      const x = col * cellW;
      const y = row * cellH;
      e.fillStyle = `rgba(${color},${alpha})`;
      e.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
      b.fillStyle = `rgba(${color},${alpha * 0.55})`;
      b.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
      // Ceiling wash and a mullion shadow over the lit pane.
      b.fillStyle = `rgba(${color},${alpha * 0.5})`;
      b.fillRect(x + 2, y + 2, cellW - 4, 3);
      b.fillStyle = "rgba(4,7,10,0.55)";
      b.fillRect(x + cellW * 0.48, y, 2, cellH);
    }
  }

  // Structural mullions: thin bright edges catch the street light.
  for (let col = 0; col <= cols; col++) {
    const x = col * cellW;
    b.fillStyle = "rgba(12,16,20,0.96)";
    b.fillRect(x - 2, 0, 4, FACADE_H);
    b.fillStyle = "rgba(172,188,204,0.1)";
    b.fillRect(x + 2, 0, 1.2, FACADE_H);
  }
  for (let row = 0; row <= rows; row++) {
    const y = row * cellH;
    b.fillStyle = "rgba(10,14,18,0.96)";
    b.fillRect(0, y - 2, FACADE_W, 4);
    b.fillStyle = "rgba(176,192,208,0.08)";
    b.fillRect(0, y + 2, FACADE_W, 1);
  }

  const map = texture(base, { aniso: 8 });
  const emissiveMap = texture(glow, { aniso: 8 });
  return new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 1.0,
    roughness: 0.34,
    metalness: 0.34,
    envMapIntensity: 0.7,
  });
}

function makeBuildingGeometry(w, h, d) {
  const geom = new THREE.BoxGeometry(w, h, d);
  const uv = geom.attributes.uv;
  const scaleFace = (face, uScale, vScale) => {
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
    }
  };
  scaleFace(0, d / FACADE_TILE_W, h / FACADE_TILE_H);
  scaleFace(1, d / FACADE_TILE_W, h / FACADE_TILE_H);
  scaleFace(2, w / FACADE_TILE_W, d / FACADE_TILE_W);
  scaleFace(3, w / FACADE_TILE_W, d / FACADE_TILE_W);
  scaleFace(4, w / FACADE_TILE_W, h / FACADE_TILE_H);
  scaleFace(5, w / FACADE_TILE_W, h / FACADE_TILE_H);
  uv.needsUpdate = true;
  return geom;
}

// The relief (balconies, AC boxes, cornices, fire escapes) is made from dozens
// of small boxes per building. Bake them down to one mesh per material so the
// extra detail does not turn into hundreds of draw calls.
function mergeDetailGroup(root) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((node) => {
    if (!node.isMesh || Array.isArray(node.material)) return;
    let bucket = buckets.get(node.material);
    if (!bucket) {
      bucket = { material: node.material, geometries: [] };
      buckets.set(node.material, bucket);
    }
    let geometry = node.geometry.clone();
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

  for (const child of [...root.children]) root.remove(child);
  for (const { material, geometries } of buckets.values()) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) continue;
    geometries.forEach((geometry) => geometry.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

function makeStorefrontTexture(seed) {
  const { canvas, ctx } = canvas2d(512, 256);
  const rand = seeded(seed);
  const warm = rand() > 0.42;
  const glow = warm ? [255, 196, 126] : [154, 208, 255];

  ctx.fillStyle = "#0b0d11";
  ctx.fillRect(0, 0, 512, 256);
  // Dark interior wall and counter silhouettes.
  const g = ctx.createLinearGradient(0, 30, 0, 240);
  g.addColorStop(0, `rgba(${glow[0]},${glow[1]},${glow[2]},0.1)`);
  g.addColorStop(0.42, `rgba(${glow[0]},${glow[1]},${glow[2]},0.28)`);
  g.addColorStop(1, "rgba(12,12,13,0.98)");
  ctx.fillStyle = g;
  ctx.fillRect(8, 34, 496, 204);

  // Window bays.
  const bays = 3 + Math.floor(rand() * 2);
  const gap = 496 / bays;
  for (let i = 0; i < bays; i++) {
    const x = 10 + i * gap;
    ctx.fillStyle = "rgba(6,8,11,0.95)";
    ctx.fillRect(x, 30, 8, 214);
    ctx.fillStyle = `rgba(${glow[0]},${glow[1]},${glow[2]},${0.06 + rand() * 0.1})`;
    ctx.fillRect(x + 8, 38, gap - 16, 190);

    // Interior shelves / tables.
    ctx.fillStyle = "rgba(18,17,18,0.75)";
    const shelfY = 108 + rand() * 40;
    ctx.fillRect(x + 20, shelfY, gap - 40, 6);
    for (let k = 0; k < 3; k++) {
      const bx = x + 22 + rand() * (gap - 60);
      const bh = 12 + rand() * 26;
      ctx.fillRect(bx, shelfY - bh, 10 + rand() * 16, bh);
    }
    if (rand() > 0.55) {
      ctx.fillStyle = "rgba(10,10,12,0.85)";
      ctx.beginPath();
      ctx.arc(x + gap * (0.25 + rand() * 0.5), 156, 15, 0, TAU);
      ctx.fill();
      ctx.fillRect(x + gap * 0.36, 158, 24, 52);
    }
  }

  // Door with a bright spill.
  const doorX = 18 + Math.floor(rand() * (bays - 1)) * gap + 14;
  ctx.fillStyle = "rgba(250,236,210,0.34)";
  ctx.fillRect(doorX, 60, 34, 166);
  ctx.fillStyle = "rgba(13,14,16,0.94)";
  ctx.fillRect(doorX + 26, 64, 5, 158);
  const spill = ctx.createLinearGradient(doorX + 30, 0, doorX + 120, 0);
  spill.addColorStop(0, "rgba(255,225,180,0.18)");
  spill.addColorStop(1, "rgba(255,225,180,0)");
  ctx.fillStyle = spill;
  ctx.fillRect(doorX + 30, 60, 110, 166);

  // Sign band along the top.
  ctx.fillStyle = "rgba(10,11,14,0.96)";
  ctx.fillRect(0, 0, 512, 32);
  ctx.fillStyle = `rgba(${glow[0]},${glow[1]},${glow[2]},0.8)`;
  ctx.fillRect(14, 12, 80 + rand() * 100, 4);

  // Small entry lights.
  for (let i = 0; i < bays; i++) {
    ctx.fillStyle = "rgba(255,235,203,0.9)";
    ctx.beginPath();
    ctx.arc(14 + i * gap + gap * 0.5, 42, 3, 0, TAU);
    ctx.fill();
  }

  return texture(canvas, { repeat: false, aniso: 4 });
}

function makeSignTexture(text, hue) {
  const { canvas, ctx } = canvas2d(128, 512);
  ctx.clearRect(0, 0, 128, 512);
  ctx.fillStyle = "rgba(5,7,10,0.94)";
  ctx.fillRect(7, 7, 114, 498);
  ctx.strokeStyle = `hsla(${hue},100%,70%,0.9)`;
  ctx.lineWidth = 3;
  ctx.strokeRect(9, 9, 110, 494);
  ctx.font = "bold 56px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `hsl(${hue},100%,72%)`;
  const step = 470 / text.length;
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], 64, 44 + i * step);
  }
  return texture(canvas, { repeat: false, aniso: 2 });
}

/* -------------------------------------------------------------------------- */
/*  Environment                                                               */
/* -------------------------------------------------------------------------- */

function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030710);

  const panel = (color, intensity, position, size) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), material);
    mesh.position.copy(position);
    mesh.lookAt(0, 3, 0);
    scene.add(mesh);
  };

  // A city at night is mostly sodium-warm at street level with a cool sky
  // above. Keep the coloured neon accents deliberately weak: strong magenta
  // and cyan panels turn every painted panel into a toy and read as neon bars
  // rather than street lighting in the car's clearcoat. The overhead sky panel
  // is very dim and narrow highlights do the work instead: a broad bright panel
  // reflected in the panorama roof read like a painted white roof.
  panel(0x6f8db4, 0.1, new THREE.Vector3(0, 26, 0), [44, 10]);
  panel(0xdfeaff, 0.2, new THREE.Vector3(-6, 18, 3), [1.2, 16]);
  panel(0xffc48a, 0.16, new THREE.Vector3(8, 15, -2), [1.8, 12]);
  panel(0xffb870, 0.9, new THREE.Vector3(-8, 3.4, 9), [12, 2.2]);
  panel(0xffc48a, 0.55, new THREE.Vector3(9, 2.6, 7), [9, 1.6]);
  panel(0xbcd8ff, 0.7, new THREE.Vector3(6, 9, -7), [8, 3.2]);
  panel(0x7fb4ff, 0.35, new THREE.Vector3(-12, 7, -4), [7, 4]);
  panel(0xff7b52, 0.22, new THREE.Vector3(14, 4, -2), [2, 8]);
  panel(0x53c7ff, 0.16, new THREE.Vector3(-14, 5, 2), [1.4, 7]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.06, 0.1, 120);
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    object.material.dispose();
  });
  pmrem.dispose();
  return target.texture;
}

/* -------------------------------------------------------------------------- */
/*  Public                                                                    */
/* -------------------------------------------------------------------------- */

export function createNightCity(renderer) {
  const group = new THREE.Group();
  group.name = "NightCity";
  group.visible = false;
  // Put the car in the centre of the right-hand lane rather than on top of the
  // centre line. The whole stage shifts, not the car, so the studio views are
  // untouched.
  group.position.z = -1.75;

  const rand = seeded(207);
  const props = [];
  const farProps = [];
  const traffic = [];
  const beacons = [];
  const signs = [];

  /* ------------------------------- sky ---------------------------------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(240, 40, 24),
    new THREE.MeshBasicMaterial({
      map: makeSkyTexture(),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  sky.name = "NightSky";
  sky.renderOrder = -30;
  group.add(sky);

  const starRand = seeded(88);
  const starPositions = [];
  for (let i = 0; i < 330; i++) {
    const azimuth = starRand() * Math.PI * 2;
    const polar = starRand() * 0.95;
    const radius = 165 + starRand() * 45;
    const y = Math.cos(polar) * radius;
    if (y < 20) continue;
    starPositions.push(
      Math.sin(polar) * Math.cos(azimuth) * radius,
      y,
      Math.sin(polar) * Math.sin(azimuth) * radius
    );
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xc8dcff,
      size: 0.32,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  stars.renderOrder = -29;
  group.add(stars);

  /* ------------------------------- road --------------------------------- */
  const roadTexture = makeRoadTexture();
  roadTexture.repeat.set(ROAD_LENGTH / TILE, ROAD_WIDTH / TILE);
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x5d636b,
    map: roadTexture,
    roughness: 0.86,
    metalness: 0.06,
    envMapIntensity: 0.3,
  });
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_LENGTH, ROAD_WIDTH),
    roadMaterial
  );
  road.name = "NightRoad";
  road.rotation.x = -Math.PI / 2;
  road.position.set(-10, -0.012, 0);
  group.add(road);

  const pavingTexture = makePavingTexture();
  pavingTexture.repeat.set(ROAD_LENGTH / 5, 2);
  const pavement = new THREE.MeshStandardMaterial({
    color: 0x3b424d,
    map: pavingTexture,
    roughness: 0.9,
    metalness: 0.04,
    envMapIntensity: 0.35,
  });
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x595f69,
    roughness: 0.7,
    metalness: 0.08,
    envMapIntensity: 0.55,
  });
  for (const side of [-1, 1]) {
    const walk = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_LENGTH, 0.18, 2.9),
      pavement
    );
    walk.position.set(-10, 0.08, side * 8.45);
    group.add(walk);

    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_LENGTH, 0.13, 0.2),
      curbMat
    );
    curb.position.set(-10, 0.055, side * 7.02);
    group.add(curb);

    const neon = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_LENGTH, 0.014, 0.028),
      new THREE.MeshBasicMaterial({
        color: side < 0 ? 0x36cfff : 0xa85cff,
        transparent: true,
        opacity: 0.32,
        toneMapped: false,
      })
    );
    neon.position.set(-10, 0.022, side * 7.13);
    group.add(neon);
  }

  // Fill the block behind the sidewalk. Without this the buildings stood on
  // the void and their bases disappeared into background colour.
  const blockTexture = pavingTexture.clone();
  blockTexture.repeat.set(ROAD_LENGTH / 5, 10);
  blockTexture.needsUpdate = true;
  const blockMat = new THREE.MeshStandardMaterial({
    color: 0x2b3037,
    map: blockTexture,
    roughness: 0.93,
    metalness: 0.03,
    envMapIntensity: 0.24,
  });
  for (const side of [-1, 1]) {
    const block = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_LENGTH, 56),
      blockMat
    );
    block.rotation.x = -Math.PI / 2;
    block.position.set(-10, -0.018, side * 37.9);
    group.add(block);
  }

  /* --------------------------- lane markings ---------------------------- */
  const markGeom = new THREE.BufferGeometry();
  const markPos = [];
  const markIdx = [];
  let vBase = 0;
  const addMark = (x, z, w, l) => {
    markPos.push(
      x - l / 2, 0.007, z - w / 2,
      x + l / 2, 0.007, z - w / 2,
      x + l / 2, 0.007, z + w / 2,
      x - l / 2, 0.007, z + w / 2
    );
    markIdx.push(vBase, vBase + 2, vBase + 1, vBase, vBase + 3, vBase + 2);
    vBase += 4;
  };
  for (let x = -182; x <= 190; x += DASH_GAP) {
    addMark(x + 2.8, 3.5, 0.12, 2.6);
    addMark(x + 2.8, -3.5, 0.12, 2.6);
  }
  markGeom.setAttribute("position", new THREE.Float32BufferAttribute(markPos, 3));
  markGeom.setIndex(markIdx);
  markGeom.computeVertexNormals();
  const roadMarks = new THREE.Mesh(
    markGeom,
    new THREE.MeshStandardMaterial({
      color: 0x9ba3ad,
      roughness: 0.8,
      metalness: 0.01,
      emissive: 0x15181e,
      emissiveIntensity: 0.14,
    })
  );
  roadMarks.name = "LaneDashes";
  group.add(roadMarks);

  // Double yellow centre line. The old white dashes ran directly under the
  // hero car and made it look parked on a lane divider.
  const centreMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a2c,
    roughness: 0.84,
    metalness: 0.02,
    emissive: 0x2a1d06,
    emissiveIntensity: 0.35,
  });
  for (const z of [-0.09, 0.09]) {
    const centre = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_LENGTH, 0.075),
      centreMat
    );
    centre.rotation.x = -Math.PI / 2;
    centre.position.set(-10, 0.006, z);
    group.add(centre);
  }

  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xb3bbc6,
    roughness: 0.67,
    metalness: 0.02,
    emissive: 0x252a32,
    emissiveIntensity: 0.2,
  });
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_LENGTH, 0.15),
      edgeMat
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(-10, 0.008, side * 6.56);
    group.add(edge);
  }

  /* ---------------------------- street lights --------------------------- */
  const poleGeometry = new THREE.CylinderGeometry(0.07, 0.105, 8.0, 8);
  const poleMaterial = new THREE.MeshStandardMaterial({
    color: 0x252b34,
    roughness: 0.5,
    metalness: 0.62,
    envMapIntensity: 0.75,
  });
  const lampMaterialCool = new THREE.MeshBasicMaterial({
    color: 0xd8eeff,
    toneMapped: false,
    fog: true,
  });
  const lampMaterialWarm = new THREE.MeshBasicMaterial({
    color: 0xffe4bb,
    toneMapped: false,
    fog: true,
  });
  const armGeometry = new THREE.CylinderGeometry(0.045, 0.055, 1.7, 6);
  const lampGeometry = new THREE.BoxGeometry(0.72, 0.13, 0.28);
  const lampGlassGeometry = new THREE.BoxGeometry(0.56, 0.025, 0.2);

  for (let i = 0; i < 14; i++) {
    for (const side of [-1, 1]) {
      const street = new THREE.Group();
      street.position.set(CITY_START + i * 23 + rand() * 5, 0, side * 8.7);

      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.y = 4.0;
      street.add(pole);

      const arm = new THREE.Mesh(armGeometry, poleMaterial);
      arm.position.set(-side * 0.72, 7.72, -side * 0.02);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = side * 0.18;
      street.add(arm);

      const housing = new THREE.Mesh(lampGeometry, poleMaterial);
      housing.position.set(-side * 1.48, 7.64, -side * 0.14);
      housing.rotation.z = -side * 0.1;
      street.add(housing);

      const lens = new THREE.Mesh(
        lampGlassGeometry,
        side < 0 ? lampMaterialWarm : lampMaterialCool
      );
      lens.position.set(-side * 1.48, 7.57, -side * 0.14);
      street.add(lens);

      group.add(street);
      props.push(street);
    }
  }

  /* --------------------------- street furniture -------------------------- */
  // Trees, bins and a pair of bus shelters. With the buildings brought up to
  // the sidewalk these small objects are what make the street read as a place
  // rather than a corridor between two walls.
  const treeTrunkMat = new THREE.MeshStandardMaterial({
    color: 0x2a211a,
    roughness: 0.92,
    metalness: 0.02,
  });
  const treeLeafMat = new THREE.MeshStandardMaterial({
    color: 0x1d3325,
    roughness: 0.9,
    metalness: 0.02,
    envMapIntensity: 0.35,
  });
  const planterMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f35,
    roughness: 0.82,
    metalness: 0.12,
  });
  const binMat = new THREE.MeshStandardMaterial({
    color: 0x24282d,
    roughness: 0.6,
    metalness: 0.45,
  });

  function makeStreetTree(scale = 1) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11 * scale, 0.16 * scale, 3.0 * scale, 7),
      treeTrunkMat
    );
    trunk.position.y = 1.5 * scale;
    tree.add(trunk);
    for (let k = 0; k < 4; k++) {
      const blob = new THREE.Mesh(
        new THREE.IcosahedronGeometry((0.95 + rand() * 0.45) * scale, 1),
        treeLeafMat
      );
      blob.position.set(
        (rand() - 0.5) * 1.5 * scale,
        (3.1 + rand() * 1.5) * scale,
        (rand() - 0.5) * 1.3 * scale
      );
      blob.scale.y = 0.72;
      tree.add(blob);
    }
    const pit = new THREE.Mesh(
      new THREE.BoxGeometry(1.35 * scale, 0.16, 1.35 * scale),
      planterMat
    );
    pit.position.y = 0.08;
    tree.add(pit);
    mergeDetailGroup(tree);
    return tree;
  }

  for (let i = 0; i < 7; i++) {
    for (const side of [-1, 1]) {
      const tree = makeStreetTree(0.9 + rand() * 0.22);
      tree.position.set(CITY_START + i * 46 + rand() * 9, 0, side * 9.22);
      group.add(tree);
      props.push(tree);
    }
  }

  for (let i = 0; i < 9; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const bin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.24, 0.82, 10),
      binMat
    );
    bin.position.set(CITY_START + 14 + i * 34 + rand() * 8, 0.55, side * 9.3);
    bin.castShadow = true;
    group.add(bin);
    props.push(bin);
  }

  function makeBusShelter() {
    const shelter = new THREE.Group();
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.12, 1.5),
      poleMaterial
    );
    roof.position.y = 2.55;
    shelter.add(roof);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 2.3, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x1b2833,
        roughness: 0.16,
        metalness: 0.45,
        envMapIntensity: 1.1,
        transparent: true,
        opacity: 0.72,
      })
    );
    back.position.set(0, 1.3, -0.68);
    shelter.add(back);
    for (const x of [-1.95, 1.95]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 2.5, 0.09),
        poleMaterial
      );
      post.position.set(x, 1.25, -0.68);
      shelter.add(post);
    }
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.1, 0.42),
      planterMat
    );
    bench.position.set(0, 0.55, -0.35);
    shelter.add(bench);
    const ad = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.75),
      new THREE.MeshBasicMaterial({
        color: 0x9fc4e8,
        transparent: true,
        opacity: 0.28,
        toneMapped: false,
        fog: true,
      })
    );
    ad.position.set(-1.4, 1.45, -0.64);
    shelter.add(ad);
    return shelter;
  }

  for (const [x, side] of [
    [CITY_START + 58, -1],
    [CITY_START + 212, 1],
  ]) {
    const shelter = makeBusShelter();
    shelter.position.set(x, 0, side * 8.95);
    shelter.rotation.y = side > 0 ? Math.PI : 0;
    group.add(shelter);
    props.push(shelter);
  }

  /* ----------------------------- buildings ------------------------------ */
  const facadeMats = [
    makeFacadeMaterial(33, "cool"),
    makeFacadeMaterial(58, "warm"),
    makeFacadeMaterial(91, "mixed"),
    makeFacadeMaterial(122, "cool"),
    makeFacadeMaterial(157, "warm"),
  ];
  const curtainMats = [
    makeCurtainWallMaterial(71, "cool"),
    makeCurtainWallMaterial(104, "mixed"),
    makeCurtainWallMaterial(139, "warm"),
  ];
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x12151a,
    roughness: 0.9,
    metalness: 0.15,
  });
  // Facade relief is deliberately a little lighter than the wall so the
  // cornices, balcony slabs and piers actually catch the street lights.
  const concreteDetailMat = new THREE.MeshStandardMaterial({
    color: 0x474e58,
    roughness: 0.82,
    metalness: 0.06,
    envMapIntensity: 0.45,
  });
  const metalDetailMat = new THREE.MeshStandardMaterial({
    color: 0x2a3037,
    roughness: 0.46,
    metalness: 0.55,
    envMapIntensity: 0.7,
  });
  const storefrontMats = [11, 12, 13, 14, 15].map((seed) => {
    const map = makeStorefrontTexture(seed * 29);
    return new THREE.MeshStandardMaterial({
      color: 0xa3a8b0,
      map,
      emissiveMap: map,
      emissive: 0xffffff,
      emissiveIntensity: 0.64,
      roughness: 0.3,
      metalness: 0.12,
      envMapIntensity: 0.5,
      fog: true,
    });
  });
  const signLabels = ["CAFE", "HOTEL", "24H", "NOIR", "MARKET", "BAR", "CINEMA", "OPEN"];
  const signHues = [188, 322, 28, 265, 154];
  const signTextures = signLabels.map((label, i) =>
    makeSignTexture(label, signHues[i % signHues.length])
  );

  function addStorefront(building, side, width, height, depth) {
    const frontZ = side > 0 ? -depth / 2 - 0.02 : depth / 2 + 0.02;
    const facing = side > 0 ? Math.PI : 0;
    const mat = storefrontMats[Math.floor(rand() * storefrontMats.length)];

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.93, 3.7),
      mat
    );
    screen.position.set(0, 1.85, frontZ);
    screen.rotation.y = facing;
    building.add(screen);

    // Projecting canopy with a lit underside. Keep it slim: the old deep slab
    // read as a black shelf across every shopfront.
    if (rand() > 0.3) {
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.9, 0.075, 0.54),
        poleMaterial
      );
      awning.position.set(0, 3.8, frontZ + (side > 0 ? -0.24 : 0.24));
      building.add(awning);

      const under = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.82, 0.4),
        new THREE.MeshBasicMaterial({
          color: 0xffd9ad,
          transparent: true,
          opacity: 0.13,
          toneMapped: false,
          fog: true,
          side: THREE.DoubleSide,
        })
      );
      under.rotation.x = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      under.position.set(0, 3.75, frontZ + (side > 0 ? -0.38 : 0.38));
      building.add(under);
    }

    // Small glowing sign over the canopy.
    if (rand() > 0.35) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9 + rand() * 1.6, 0.46),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.08 + rand() * 0.08, 0.8, 0.62),
          transparent: true,
          opacity: 0.75,
          toneMapped: false,
          fog: true,
        })
      );
      sign.position.set(
        (rand() - 0.5) * width * 0.5,
        4.12,
        frontZ + (side > 0 ? -0.31 : 0.31)
      );
      sign.rotation.y = facing;
      building.add(sign);
    }

    return { frontZ, facing };
  }

  function addVerticalSign(building, side, width, height, depth) {
    const label = signLabels[Math.floor(rand() * signLabels.length)];
    const map = signTextures[signLabels.indexOf(label)];
    const frontZ = side > 0 ? -depth / 2 : depth / 2;
    const signGroup = new THREE.Group();
    signGroup.position.set(
      (rand() - 0.5) * width * 0.6,
      4.8 + rand() * (height * 0.3),
      frontZ + (side > 0 ? -1.0 : 1.0)
    );
    const signMaterial = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      toneMapped: false,
      fog: true,
    });
    for (const facing of [-1, 1]) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 3.4),
        signMaterial
      );
      sign.rotation.y = facing * Math.PI / 2;
      sign.position.x = facing * 0.006;
      signGroup.add(sign);
    }

    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 1.95),
      poleMaterial
    );
    bracket.position.set(0, 1.72, side > 0 ? 0.48 : -0.48);
    signGroup.add(bracket);

    building.add(signGroup);
    signs.push({ material: signMaterial, phase: rand() * TAU });
  }

  // Real facades are not flat. A handful of projecting elements - a cornice
  // above the shopfronts, vertical piers, balconies, AC boxes and a fire escape
  // - are enough to give the street wall depth and shadow at driving speed.
  function addFacadeRelief(building, side, width, height, depth) {
    const detail = new THREE.Group();
    const outward = -side;
    const frontZ = outward * (depth / 2 + 0.08);
    const addBox = (w, h, d, x, y, z, material = concreteDetailMat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      detail.add(mesh);
      return mesh;
    };

    // Band above the shopfronts and a heavier cornice under the parapet.
    addBox(width + 0.52, 0.28, depth + 0.52, 0, 4.18, 0);
    addBox(width + 0.44, 0.34, depth + 0.44, 0, height - 0.42, 0);

    // Street-facing piers. They break the punched-window texture into bays and
    // catch the warm shop light from below.
    const pierCount = 3 + Math.floor(rand() * 2);
    for (let k = 0; k < pierCount; k++) {
      const x = -width / 2 + (width * (k + 1)) / (pierCount + 1);
      addBox(0.32, height - 5.2, 0.2, x, (height + 4.6) / 2, frontZ + outward * 0.05);
    }

    // Balconies: a slab and a slim metal rail, on two or three floors.
    if (height > 11 && rand() > 0.34) {
      const floorCount = Math.max(2, Math.floor((height - 6) / 3.2));
      const balconies = Math.min(3, floorCount);
      for (let f = 0; f < balconies; f++) {
        const fy = 6.2 + f * 3.2 + rand() * 0.6;
        const bw = 1.7 + rand() * 1.0;
        const bx = (rand() - 0.5) * Math.max(0, width - bw - 1.6);
        const railZ = frontZ + outward * 0.94;
        addBox(bw, 0.14, 0.98, bx, fy, frontZ + outward * 0.48);
        addBox(bw, 0.055, 0.055, bx, fy + 0.62, railZ, metalDetailMat);
        addBox(0.055, 0.62, 0.055, bx - bw / 2 + 0.04, fy + 0.31, railZ, metalDetailMat);
        addBox(0.055, 0.62, 0.055, bx + bw / 2 - 0.04, fy + 0.31, railZ, metalDetailMat);
        for (let p = 1; p <= 3; p++) {
          const px = bx - bw / 2 + (bw * p) / 4;
          addBox(0.035, 0.62, 0.035, px, fy + 0.31, railZ, metalDetailMat);
        }
        addBox(0.055, 0.62, 0.92, bx - bw / 2 + 0.04, fy + 0.31, frontZ + outward * 0.5, metalDetailMat);
        addBox(0.055, 0.62, 0.92, bx + bw / 2 - 0.04, fy + 0.31, frontZ + outward * 0.5, metalDetailMat);
      }
    }

    // Air-conditioning boxes and their drip pipes.
    const acCount = 4 + Math.floor(rand() * 5);
    for (let k = 0; k < acCount; k++) {
      const x = (rand() - 0.5) * (width - 1.4);
      const y = 6.0 + rand() * Math.max(1, height - 9);
      addBox(0.72, 0.48, 0.44, x, y, frontZ + outward * 0.24, metalDetailMat);
      addBox(0.032, 1.1, 0.032, x + 0.28, y - 0.72, frontZ + outward * 0.22, metalDetailMat);
    }

    // A fire escape on a few mid-rise blocks.
    if (height > 15 && height < 34 && rand() > 0.66) {
      const ex = (rand() - 0.5) * Math.max(0, width - 4);
      const floors = Math.min(3, Math.floor((height - 8) / 3.2));
      for (let f = 0; f < floors; f++) {
        const fy = 7.4 + f * 3.2;
        const ez = frontZ + outward * 0.72;
        addBox(2.5, 0.09, 1.1, ex, fy, ez, metalDetailMat);
        addBox(2.5, 0.045, 0.045, ex, fy + 0.72, ez + outward * 0.5, metalDetailMat);
        addBox(0.045, 0.72, 0.045, ex - 1.2, fy + 0.36, ez + outward * 0.5, metalDetailMat);
        addBox(0.045, 0.72, 0.045, ex + 1.2, fy + 0.36, ez + outward * 0.5, metalDetailMat);
        if (f < floors - 1) {
          addBox(0.06, 2.5, 0.06, ex - 0.95, fy + 1.35, ez + outward * 0.35, metalDetailMat);
          addBox(0.06, 2.5, 0.06, ex + 0.95, fy + 1.35, ez + outward * 0.35, metalDetailMat);
          for (let r = 0; r < 5; r++) {
            addBox(1.9, 0.035, 0.035, ex, fy + 0.35 + r * 0.5, ez + outward * 0.35, metalDetailMat);
          }
        }
      }
    }

    // Entrance canopy with two posts. It gives the ground floor a real door
    // instead of a glowing rectangle pasted onto the wall.
    const doorX = (rand() - 0.5) * width * 0.42;
    addBox(2.5, 0.1, 1.15, doorX, 2.95, frontZ + outward * 0.52, metalDetailMat);
    addBox(0.07, 2.9, 0.07, doorX - 1.14, 1.45, frontZ + outward * 0.98, metalDetailMat);
    addBox(0.07, 2.9, 0.07, doorX + 1.14, 1.45, frontZ + outward * 0.98, metalDetailMat);

    mergeDetailGroup(detail);
    building.add(detail);
  }

  const shopSpots = [];
  const workerSpots = [];
  const buildingList = [];
  for (let i = 0; i < 16; i++) {
    for (const side of [-1, 1]) {
      const width = 7 + rand() * 8;
      const depth = 7.5 + rand() * 7;
      const tall = rand() > 0.76;
      const height = tall ? 27 + rand() * 18 : 9 + rand() * 15;
      const useCurtain = height > 24 && rand() > 0.48;
      const facadeMat = useCurtain
        ? curtainMats[Math.floor(rand() * curtainMats.length)]
        : facadeMats[Math.floor(rand() * facadeMats.length)];

      const building = new THREE.Group();
      // Front the sidewalk. The old 17-28 m setback left a dead apron of dark
      // paving between the shops and the kerb, which read as an empty car park.
      building.position.set(
        CITY_START + i * 20 + rand() * 7,
        0,
        side * (10.5 + depth / 2 + rand() * 2.2)
      );

      const shell = new THREE.Mesh(makeBuildingGeometry(width, height, depth), [
        facadeMat,
        facadeMat,
        roofMat,
        roofMat,
        facadeMat,
        facadeMat,
      ]);
      shell.position.y = height / 2;
      building.add(shell);

      // Some blocks step back at the top. This is the cheapest way to stop the
      // skyline reading as a row of identical extruded boxes.
      let topY = height;
      let topW = width;
      let topD = depth;
      if (rand() > 0.58) {
        const tierH = 3 + rand() * Math.min(8, height * 0.28);
        topW = width * (0.56 + rand() * 0.2);
        topD = depth * (0.56 + rand() * 0.2);
        const tier = new THREE.Mesh(
          makeBuildingGeometry(topW, tierH, topD),
          [
            facadeMat,
            facadeMat,
            roofMat,
            roofMat,
            facadeMat,
            facadeMat,
          ]
        );
        tier.position.y = height + tierH / 2;
        building.add(tier);
        topY = height + tierH;
      }

      // Parapet and a few rooftop boxes give the skyline a real silhouette.
      const parapet = new THREE.Mesh(
        new THREE.BoxGeometry(topW + 0.24, 0.32, topD + 0.24),
        roofMat
      );
      parapet.position.y = topY + 0.12;
      building.add(parapet);

      const rooftop = new THREE.Group();
      for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.8 + rand() * 2.2, 0.5 + rand() * 1.5, 0.8 + rand() * 2),
          roofMat
        );
        box.position.set(
          (rand() - 0.5) * topW * 0.55,
          topY + 0.4 + rand() * 1.3,
          (rand() - 0.5) * topD * 0.55
        );
        rooftop.add(box);
      }
      // A water tank / plant room on some roofs.
      if (rand() > 0.58) {
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(0.65 + rand() * 0.5, 0.75 + rand() * 0.5, 1.6 + rand() * 1.2, 8),
          roofMat
        );
        tank.position.set(
          (rand() - 0.5) * topW * 0.4,
          topY + 1.2,
          (rand() - 0.5) * topD * 0.4
        );
        rooftop.add(tank);
      }
      building.add(rooftop);

      if (height > 26) {
        const antenna = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.065, 3.5 + rand() * 4.5, 5),
          poleMaterial
        );
        antenna.position.set(0, topY + 2.2, 0);
        building.add(antenna);

        const beaconMat = new THREE.MeshBasicMaterial({
          color: 0xff3046,
          transparent: true,
          opacity: 0.8,
          toneMapped: false,
          fog: true,
        });
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), beaconMat);
        beacon.position.set(0, topY + 4.4 + rand() * 2, 0);
        building.add(beacon);
        beacons.push({ material: beaconMat, phase: rand() * TAU });
      }

      const storefront = addStorefront(building, side, width, height, depth);
      if (rand() > 0.46) addVerticalSign(building, side, width, height, depth);
      addFacadeRelief(building, side, width, height, depth);

      // Remember a few lit shop fronts where a member of staff can stand
      // behind a counter. The counter and the worker both scroll with the
      // same band as the buildings, so they stay paired forever.
      if (storefront) {
        workerSpots.push({
          x: building.position.x + (rand() - 0.5) * width * 0.36,
          z: building.position.z + storefront.frontZ,
          side,
          width: Math.min(2.9, Math.max(1.9, width * 0.38)),
        });
      }

      // Remember a few shop entrances so idlers can stand under the awnings.
      // They share the same wrap band as the buildings, which keeps a person
      // waiting outside the same shop as the whole block scrolls past.
      if (rand() > 0.42) {
        shopSpots.push({
          x: building.position.x + (rand() - 0.5) * width * 0.55,
          z: side * (9.15 + rand() * 0.55),
          side,
        });
      }

      group.add(building);
      props.push(building);
      buildingList.push({ group: building, side, width, height, depth });
    }
  }

  /* --------------------------- shop counters ---------------------------- */
  // The storefronts are painted planes, so the staff are staged just in front
  // of them behind a slim 3D counter. From the street the counter hides their
  // legs and the lit shopfront reads as the back wall of the shop. A handful
  // of evenly spaced counters keeps the whole block alive without turning the
  // sidewalk into a market.
  const counterBodyMat = new THREE.MeshStandardMaterial({
    color: 0x241c17,
    roughness: 0.62,
    metalness: 0.18,
    envMapIntensity: 0.5,
  });
  const counterTopMat = new THREE.MeshStandardMaterial({
    color: 0x7b6247,
    roughness: 0.45,
    metalness: 0.15,
    envMapIntensity: 0.7,
  });
  const counterGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffc98f,
    toneMapped: false,
    fog: true,
  });
  const shopWorkers = [];
  if (workerSpots.length) {
    const sorted = [...workerSpots].sort((a, b) => a.x - b.x);
    const wanted = Math.min(8, sorted.length);
    for (let i = 0; i < wanted; i++) {
      const spot = sorted[Math.floor(((i + 0.5) * sorted.length) / wanted)];
      shopWorkers.push(spot);
      const towardStreet = -spot.side;
      const counter = new THREE.Group();
      counter.position.set(spot.x, 0, spot.z + towardStreet * 0.62);

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(spot.width, 0.9, 0.42),
        counterBodyMat
      );
      body.position.y = 0.45;
      body.castShadow = true;
      body.receiveShadow = true;
      counter.add(body);

      const top = new THREE.Mesh(
        new THREE.BoxGeometry(spot.width + 0.12, 0.06, 0.52),
        counterTopMat
      );
      top.position.y = 0.93;
      top.castShadow = true;
      counter.add(top);

      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(spot.width * 0.86, 0.032, 0.018),
        counterGlowMat
      );
      glow.position.set(0, 0.68, towardStreet * 0.215);
      counter.add(glow);

      group.add(counter);
      props.push(counter);
    }
  }

  // A few illuminated billboards, bolted to the front of taller blocks. They
  // scroll with their host building, so a sign can never drift away from the
  // wall or end up floating in the middle of the road.
  const billboardHosts = buildingList.filter((b) => b.height > 14);
  for (let i = 0; i < 10 && billboardHosts.length; i++) {
    const host = billboardHosts[Math.floor(rand() * billboardHosts.length)];
    const outward = -host.side;
    const frontZ = outward * (host.depth / 2);
    const w = 2.4 + rand() * 3.5;
    const h = 2.8 + rand() * 5.5;
    const billboard = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.52 + rand() * 0.32, 0.75, 0.35),
        transparent: true,
        opacity: 0.42,
        toneMapped: false,
        fog: true,
      })
    );
    billboard.position.set(
      (rand() - 0.5) * Math.max(0, host.width - w - 1),
      8 + rand() * Math.max(1, host.height - 13),
      frontZ + outward * 0.05
    );
    billboard.rotation.y = host.side > 0 ? Math.PI : 0;
    host.group.add(billboard);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.03),
      metalDetailMat
    );
    frame.position.copy(billboard.position);
    frame.position.z -= outward * 0.02;
    frame.rotation.y = billboard.rotation.y;
    host.group.add(frame);
  }

  // Distant skyline. It drifts more slowly than the near buildings so the city
  // has actual depth instead of a single painted wall. The far blocks reuse the
  // same window-grid geometry as the near buildings, at a scale that keeps the
  // window rhythm consistent all the way to the horizon.
  for (let i = 0; i < 34; i++) {
    const w = 10 + rand() * 22;
    const h = 20 + rand() * 56;
    const d = 10 + rand() * 18;
    const far = new THREE.Group();
    far.position.set(
      CITY_START - 40 + rand() * (CYCLE + 80),
      0,
      (rand() > 0.5 ? 1 : -1) * (64 + rand() * 92)
    );
    const facadeMat =
      rand() > 0.62
        ? curtainMats[Math.floor(rand() * curtainMats.length)]
        : facadeMats[Math.floor(rand() * facadeMats.length)];
    const block = new THREE.Mesh(makeBuildingGeometry(w, h, d), [
      facadeMat,
      facadeMat,
      roofMat,
      roofMat,
      facadeMat,
      facadeMat,
    ]);
    block.position.y = h / 2;
    far.add(block);
    if (h > 58) {
      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.12, 6 + rand() * 10, 5),
        poleMaterial
      );
      spire.position.y = h + 4;
      far.add(spire);
    }
    group.add(far);
    farProps.push(far);
  }

  /* ------------------------------ traffic ------------------------------- */
  const carBodyMats = [
    new THREE.MeshStandardMaterial({ color: 0x25303d, metalness: 0.6, roughness: 0.32, envMapIntensity: 1.2 }),
    new THREE.MeshStandardMaterial({ color: 0x3a4654, metalness: 0.55, roughness: 0.36, envMapIntensity: 1.2 }),
    new THREE.MeshStandardMaterial({ color: 0x59626c, metalness: 0.6, roughness: 0.3, envMapIntensity: 1.3 }),
    new THREE.MeshStandardMaterial({ color: 0x8b9299, metalness: 0.65, roughness: 0.28, envMapIntensity: 1.4 }),
    new THREE.MeshStandardMaterial({ color: 0x6d2328, metalness: 0.55, roughness: 0.3, envMapIntensity: 1.25 }),
    new THREE.MeshStandardMaterial({ color: 0xd9dde1, metalness: 0.35, roughness: 0.34, envMapIntensity: 1.25 }),
    new THREE.MeshStandardMaterial({ color: 0xb08a32, metalness: 0.5, roughness: 0.34, envMapIntensity: 1.2 }),
    new THREE.MeshStandardMaterial({ color: 0x1f4b45, metalness: 0.55, roughness: 0.33, envMapIntensity: 1.2 }),
  ];
  const busBodyMats = [
    new THREE.MeshStandardMaterial({ color: 0x2f6f5e, metalness: 0.45, roughness: 0.42, envMapIntensity: 1.0 }),
    new THREE.MeshStandardMaterial({ color: 0x8a3a2a, metalness: 0.42, roughness: 0.44, envMapIntensity: 1.0 }),
    new THREE.MeshStandardMaterial({ color: 0x2a4f7a, metalness: 0.45, roughness: 0.4, envMapIntensity: 1.0 }),
  ];
  const truckBodyMats = [
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a, metalness: 0.4, roughness: 0.5, envMapIntensity: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x2f4a5e, metalness: 0.45, roughness: 0.44, envMapIntensity: 1.0 }),
    new THREE.MeshStandardMaterial({ color: 0x7a2a24, metalness: 0.42, roughness: 0.46, envMapIntensity: 0.95 }),
    new THREE.MeshStandardMaterial({ color: 0x5b6168, metalness: 0.4, roughness: 0.5, envMapIntensity: 0.9 }),
  ];
  const bikeBodyMats = [
    new THREE.MeshStandardMaterial({ color: 0x1e2b38, metalness: 0.6, roughness: 0.3, envMapIntensity: 1.2 }),
    new THREE.MeshStandardMaterial({ color: 0x8a2a1f, metalness: 0.55, roughness: 0.32, envMapIntensity: 1.1 }),
    new THREE.MeshStandardMaterial({ color: 0x2f4d5c, metalness: 0.55, roughness: 0.34, envMapIntensity: 1.1 }),
  ];
  const trafficGlassMat = new THREE.MeshStandardMaterial({
    color: 0x0a141c,
    metalness: 0.45,
    roughness: 0.14,
    envMapIntensity: 1.35,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x050608,
    roughness: 0.92,
    metalness: 0.02,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x6d747c,
    roughness: 0.35,
    metalness: 0.8,
    envMapIntensity: 1.2,
  });
  const headlightMat = new THREE.MeshBasicMaterial({
    color: 0xf1f7ff,
    toneMapped: false,
    fog: true,
  });
  const taillightMat = new THREE.MeshBasicMaterial({
    color: 0xff2638,
    toneMapped: false,
    fog: true,
  });
  const busSignMat = new THREE.MeshBasicMaterial({
    color: 0xffc46a,
    toneMapped: false,
    fog: true,
  });
  const cargoMat = new THREE.MeshStandardMaterial({
    color: 0xb9bcc0,
    roughness: 0.62,
    metalness: 0.28,
    envMapIntensity: 0.9,
  });
  const cargoDarkMat = new THREE.MeshStandardMaterial({
    color: 0x3c4248,
    roughness: 0.7,
    metalness: 0.3,
    envMapIntensity: 0.7,
  });
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
  const riderJacketMat = new THREE.MeshStandardMaterial({
    color: 0x2c3038,
    roughness: 0.76,
    metalness: 0.05,
  });
  const riderHelmetMat = new THREE.MeshStandardMaterial({
    color: 0x171a1c,
    roughness: 0.35,
    metalness: 0.25,
    envMapIntensity: 0.7,
  });

  const pick = (items) => items[Math.floor(rand() * items.length)];

  function addWheel(vehicle, wheels, x, y, z, radius, width) {
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
      new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.012, 10),
      rimMat
    );
    rim.rotation.x = Math.PI / 2;
    pivot.add(rim);
    vehicle.add(pivot);
    wheels.push({ pivot, radius, front: x > 0 });
  }

  function limb(vehicle, a, b, radius, material) {
    const start = new THREE.Vector3(a[0], a[1], a[2]);
    const end = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = end.clone().sub(start);
    const length = dir.length();
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 6),
      material
    );
    mesh.position.copy(start).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize()
    );
    mesh.castShadow = true;
    vehicle.add(mesh);
    return mesh;
  }

  function makeCityCar(paintMat) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(4.2, 0.58, 1.76, 3, 0.14),
      paintMat
    );
    body.position.y = 0.46;
    body.rotation.z = (rand() - 0.5) * 0.012;
    body.castShadow = true;
    car.add(body);

    const cabin = new THREE.Mesh(
      new RoundedBoxGeometry(2.15, 0.52, 1.52, 3, 0.14),
      trafficGlassMat
    );
    cabin.position.set(-0.25, 0.95, 0);
    car.add(cabin);

    const roofCap = new THREE.Mesh(
      new THREE.BoxGeometry(1.36, 0.055, 1.3),
      paintMat
    );
    roofCap.position.set(-0.3, 1.218, 0);
    car.add(roofCap);

    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.16, 1.15),
      trafficGlassMat
    );
    grille.position.set(2.088, 0.5, 0);
    car.add(grille);
    const headBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.045, 1.18),
      headlightMat
    );
    headBar.position.set(2.092, 0.65, 0);
    car.add(headBar);

    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.34), headlightMat);
      head.position.set(2.085, 0.64, side * 0.57);
      car.add(head);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.3), taillightMat);
      tail.position.set(-2.08, 0.64, side * 0.57);
      car.add(tail);
    }
    const tailBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.05, 1.16),
      taillightMat
    );
    tailBar.position.set(-2.078, 0.65, 0);
    car.add(tailBar);

    const wheels = [];
    for (const side of [-1, 1]) {
      for (const ax of [-1.35, 1.35]) {
        addWheel(car, wheels, ax, 0.33, side * 0.8, 0.33, 0.22);
      }
    }

    return { group: car, wheels, radius: 0.33, length: 4.2, width: 1.76, type: "car" };
  }

  function makeCityBus(paintMat) {
    const bus = new THREE.Group();
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(9.6, 2.35, 2.35, 4, 0.18),
      paintMat
    );
    body.position.y = 1.55;
    body.castShadow = true;
    bus.add(body);

    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(9.62, 0.4, 2.36),
      cargoDarkMat
    );
    skirt.position.y = 0.46;
    bus.add(skirt);

    const windowBand = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 0.72, 2.37),
      trafficGlassMat
    );
    windowBand.position.y = 2.2;
    bus.add(windowBand);

    for (let i = -3; i <= 3; i++) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.78, 2.38),
        paintMat
      );
      pillar.position.set(i * 1.22, 2.2, 0);
      bus.add(pillar);
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(9.0, 0.08, 2.1),
      paintMat
    );
    roof.position.y = 2.76;
    bus.add(roof);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.92, 1.92),
      trafficGlassMat
    );
    windshield.position.set(4.81, 2.14, 0);
    bus.add(windshield);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.2, 1.2),
      busSignMat
    );
    sign.position.set(4.82, 2.83, 0);
    bus.add(sign);

    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.34, 1.5),
      cargoDarkMat
    );
    grille.position.set(4.82, 0.88, 0);
    bus.add(grille);

    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.1, 0.34),
        headlightMat
      );
      head.position.set(4.83, 0.72, side * 0.78);
      bus.add(head);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.09, 0.3),
        taillightMat
      );
      tail.position.set(-4.83, 0.82, side * 0.86);
      bus.add(tail);
    }

    const wheels = [];
    for (const side of [-1, 1]) {
      addWheel(bus, wheels, 3.35, 0.46, side * 1.0, 0.46, 0.3);
      addWheel(bus, wheels, -3.0, 0.46, side * 1.0, 0.46, 0.3);
    }

    return { group: bus, wheels, radius: 0.46, length: 9.6, width: 2.35, type: "bus" };
  }

  function makeCityTruck(paintMat) {
    const truck = new THREE.Group();
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.22, 2.0),
      cargoDarkMat
    );
    chassis.position.y = 0.62;
    truck.add(chassis);

    const cab = new THREE.Mesh(
      new RoundedBoxGeometry(2.35, 1.95, 2.2, 3, 0.16),
      paintMat
    );
    cab.position.set(2.45, 1.55, 0);
    cab.castShadow = true;
    truck.add(cab);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.72, 1.8),
      trafficGlassMat
    );
    windshield.position.set(3.63, 2.0, 0);
    truck.add(windshield);

    const sideGlass = new THREE.Mesh(
      new THREE.BoxGeometry(1.28, 0.58, 2.21),
      trafficGlassMat
    );
    sideGlass.position.set(2.32, 2.0, 0);
    truck.add(sideGlass);

    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 2.4, 2.3),
      cargoMat
    );
    cargo.position.set(-1.2, 1.95, 0);
    cargo.castShadow = true;
    truck.add(cargo);

    for (const side of [-1, 1]) {
      for (const rx of [-2.65, -1.2, 0.25]) {
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 2.4, 0.04),
          cargoDarkMat
        );
        rib.position.set(rx, 1.95, side * 1.16);
        truck.add(rib);
      }
    }

    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.32, 1.45),
      cargoDarkMat
    );
    grille.position.set(3.64, 0.92, 0);
    truck.add(grille);

    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.09, 0.32),
        headlightMat
      );
      head.position.set(3.65, 0.78, side * 0.72);
      truck.add(head);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, 0.3),
        taillightMat
      );
      tail.position.set(-3.52, 0.9, side * 0.88);
      truck.add(tail);
    }

    const wheels = [];
    for (const side of [-1, 1]) {
      addWheel(truck, wheels, 2.7, 0.44, side * 0.98, 0.44, 0.3);
      addWheel(truck, wheels, -1.2, 0.44, side * 0.98, 0.44, 0.3);
      addWheel(truck, wheels, -2.6, 0.44, side * 0.98, 0.44, 0.3);
    }

    return { group: truck, wheels, radius: 0.44, length: 7.5, width: 2.3, type: "truck" };
  }

  function makeCityMotorcycle(paintMat) {
    const bike = new THREE.Group();
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(1.45, 0.34, 0.36, 3, 0.12),
      paintMat
    );
    body.position.y = 0.78;
    body.castShadow = true;
    bike.add(body);

    const tank = new THREE.Mesh(
      new RoundedBoxGeometry(0.55, 0.3, 0.34, 3, 0.1),
      paintMat
    );
    tank.position.set(0.2, 0.98, 0);
    tank.castShadow = true;
    bike.add(tank);

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.3),
      riderTrouserMat
    );
    seat.position.set(-0.5, 1.0, 0);
    bike.add(seat);

    const wheels = [];
    for (const wx of [-0.64, 0.64]) {
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.055, 6, 16),
        tireMat
      );
      wheel.position.set(wx, 0.37, 0);
      wheel.castShadow = true;
      bike.add(wheel);
      wheels.push({ pivot: wheel, radius: 0.34 });
    }

    for (const side of [-1, 1]) {
      limb(bike, [0.64, 0.37, side * 0.1], [0.42, 1.0, side * 0.1], 0.025, cargoDarkMat);
      limb(bike, [-0.64, 0.37, side * 0.1], [-0.35, 0.9, side * 0.1], 0.022, cargoDarkMat);
    }

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6),
      cargoDarkMat
    );
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0.42, 1.03, 0);
    bike.add(bar);

    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10),
      headlightMat
    );
    lamp.rotation.z = Math.PI / 2;
    lamp.position.set(0.78, 0.9, 0);
    bike.add(lamp);

    // Rider: a compact seated silhouette with a helmet and a jacket, readable
    // at the 20-60 m distance the traffic is normally seen from.
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.135, 0.3, 4, 6),
      riderJacketMat
    );
    torso.scale.z = 0.74;
    torso.rotation.z = -0.28;
    torso.position.set(0.02, 1.2, 0);
    torso.castShadow = true;
    bike.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 8, 6),
      riderSkinMat
    );
    head.position.set(0.15, 1.53, 0);
    bike.add(head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.108, 8, 6, 0, TAU, 0, Math.PI * 0.56),
      riderHelmetMat
    );
    helmet.position.set(0.15, 1.55, 0);
    bike.add(helmet);

    for (const side of [-1, 1]) {
      limb(bike, [0.0, 1.36, side * 0.13], [0.42, 1.04, side * 0.17], 0.042, riderJacketMat);
      limb(bike, [-0.02, 0.98, side * 0.1], [0.06, 0.4, side * 0.13], 0.055, riderTrouserMat);
    }

    return { group: bike, wheels, radius: 0.34, length: 1.95, width: 0.7, type: "motorcycle" };
  }

  function addTraffic(build, { lane, direction, speed }) {
    const object = build.group;
    object.position.set(0, 0, lane);
    object.rotation.y = direction > 0 ? 0 : Math.PI;
    group.add(object);
    traffic.push({
      object,
      speed,
      baseSpeed: speed,
      direction,
      lane,
      laneZ: lane,
      targetLane: lane,
      baseLane: lane,
      wheels: build.wheels,
      wheelRadius: build.radius,
      length: build.length,
      width: build.width,
      type: build.type,
      overtakeTimer: 0,
      cooldown: rand() * 5,
      steer: 0,
      phase: rand() * TAU,
    });
  }

  // Same-direction traffic stays in the outer near lane, leaving the hero lane
  // clear. It is deliberately slower than the player so the car visibly passes
  // it at any speed above about 25 km/h.
  addTraffic(makeCityCar(pick(carBodyMats)), { lane: LANE_SAME, direction: 1, speed: 6.2 + rand() * 1.2 });
  addTraffic(makeCityCar(pick(carBodyMats)), { lane: LANE_SAME, direction: 1, speed: 7.2 + rand() * 1.2 });
  addTraffic(makeCityCar(pick(carBodyMats)), { lane: LANE_SAME, direction: 1, speed: 8.3 + rand() * 1.1 });
  addTraffic(makeCityBus(pick(busBodyMats)), { lane: LANE_SAME, direction: 1, speed: 6.0 });
  addTraffic(makeCityTruck(pick(truckBodyMats)), { lane: LANE_SAME, direction: 1, speed: 5.6 });
  addTraffic(makeCityMotorcycle(pick(bikeBodyMats)), { lane: LANE_SAME, direction: 1, speed: 9.4 });
  addTraffic(makeCityMotorcycle(pick(bikeBodyMats)), { lane: LANE_SAME, direction: 1, speed: 10.6 });

  // Oncoming traffic uses both far lanes. Faster cars and bikes pull into the
  // other lane to pass buses, trucks and slower cars, then return.
  addTraffic(makeCityCar(pick(carBodyMats)), { lane: LANE_ONCOMING_INNER, direction: -1, speed: 8.4 });
  addTraffic(makeCityCar(pick(carBodyMats)), { lane: LANE_ONCOMING_INNER, direction: -1, speed: 10.2 });
  addTraffic(makeCityCar(pick(carBodyMats)), { lane: LANE_ONCOMING_INNER, direction: -1, speed: 9.4 });
  addTraffic(makeCityBus(pick(busBodyMats)), { lane: LANE_ONCOMING_INNER, direction: -1, speed: 6.8 });
  addTraffic(makeCityMotorcycle(pick(bikeBodyMats)), { lane: LANE_ONCOMING_INNER, direction: -1, speed: 13.0 });

  addTraffic(makeCityCar(pick(carBodyMats)), { lane: LANE_ONCOMING_OUTER, direction: -1, speed: 7.4 });
  addTraffic(makeCityCar(pick(carBodyMats)), { lane: LANE_ONCOMING_OUTER, direction: -1, speed: 9.2 });
  addTraffic(makeCityCar(pick(carBodyMats)), { lane: LANE_ONCOMING_OUTER, direction: -1, speed: 11.0 });
  addTraffic(makeCityTruck(pick(truckBodyMats)), { lane: LANE_ONCOMING_OUTER, direction: -1, speed: 7.0 });
  addTraffic(makeCityBus(pick(busBodyMats)), { lane: LANE_ONCOMING_OUTER, direction: -1, speed: 6.4 });
  addTraffic(makeCityMotorcycle(pick(bikeBodyMats)), { lane: LANE_ONCOMING_OUTER, direction: -1, speed: 14.0 });

  // Spread each lane evenly before the first frame. Without this two vehicles can
  // spawn on top of each other and then drive through one another forever.
  for (const lane of [LANE_SAME, LANE_ONCOMING_INNER, LANE_ONCOMING_OUTER]) {
    const laneCars = traffic.filter((item) => item.baseLane === lane);
    laneCars.sort((a, b) => a.baseSpeed - b.baseSpeed);
    const gap = CYCLE / laneCars.length;
    laneCars.forEach((item, index) => {
      let x = CITY_START + index * gap + (rand() - 0.5) * gap * 0.32;
      if (Math.abs(x) < 18) x += 32;
      item.object.position.x = x;
    });
  }

  /* ----------------------------- pedestrians ---------------------------- */
  // Two sidewalks, shop fronts set back behind the paving, and a handful of
  // people placed in the opening frame. The instanced crowd costs nine draw
  // calls for the whole street.
  const crowdActors = [];

  // Hand-placed near the hero camera so the street has life immediately.
  crowdActors.push(
    { x: -5.4, z: -8.25, y: 0.17, kind: "walk", dir: 1, walk: 0.82 },
    { x: 7.6, z: -8.6, y: 0.17, kind: "walk", dir: -1, walk: 0.94 },
    { x: -7.1, z: -12.0, y: 0, kind: "shop", yaw: 0, bag: true },
    { x: 5.9, z: -12.4, y: 0, kind: "shop", yaw: 0, bag: false }
  );

  // Far sidewalk walkers. This is the side the rear-quarter camera sees, so it
  // gets the larger share.
  for (let i = 0; i < 8; i++) {
    crowdActors.push({
      x: CITY_START + rand() * CYCLE,
      z: -8.45 + (rand() - 0.5) * 1.0,
      y: 0.17,
      kind: "walk",
      dir: rand() > 0.5 ? 1 : -1,
      walk: 0.68 + rand() * 0.55,
    });
  }

  // Near sidewalk, mostly visible when the camera orbits around the car.
  for (let i = 0; i < 5; i++) {
    crowdActors.push({
      x: CITY_START + rand() * CYCLE,
      z: 8.45 + (rand() - 0.5) * 1.0,
      y: 0.17,
      kind: "walk",
      dir: rand() > 0.5 ? 1 : -1,
      walk: 0.7 + rand() * 0.5,
    });
  }

  // Idlers under shop awnings.
  for (let i = 0; i < Math.min(8, shopSpots.length); i++) {
    const spot = shopSpots[(i * 4 + 1) % shopSpots.length];
    crowdActors.push({
      x: spot.x,
      // Stand on the outer edge of the paving, in front of the shops. The
      // building fronts now sit just behind the sidewalk, so the idler stays in
      // the open walkway and can never end up inside a wall after a wrap.
      z: spot.side * (9.1 + rand() * 0.55),
      y: 0,
      kind: "shop",
      yaw: spot.side > 0 ? Math.PI : 0,
      bag: rand() > 0.45,
      umbrella: rand() > 0.2,
    });
  }

  // Shop staff behind the counters. Their jackets read as uniforms against the
  // warm storefront light, and the work pose keeps their hands busy.
  const workerJackets = [0xe6dfd2, 0xd8c9b4, 0x8f3a32, 0x2e4d3c, 0x3b4657];
  shopWorkers.forEach((spot, i) => {
    const towardStreet = -spot.side;
    crowdActors.push({
      x: spot.x,
      z: spot.z + towardStreet * 0.22,
      y: 0,
      kind: "work",
      yaw: spot.side > 0 ? Math.PI : 0,
      umbrella: false,
      bag: false,
      longHair: i % 4 === 1,
      colors: {
        jacket: workerJackets[i % workerJackets.length],
        trousers: 0x23262b,
        skin: i % 3 === 0 ? 0x9a6647 : i % 3 === 1 ? 0xd29b72 : 0x6f452e,
      },
    });
  });

  const crowd = createCrowd({
    actors: crowdActors,
    wrapMin: CITY_START - 12,
    wrapSpan: CYCLE,
    seed: 20261024,
    castShadow: false,
  });
  group.add(crowd.group);

  /* ------------------------------ lights -------------------------------- */
  // One warm sodium key, one cool sky fill, and a lot of restraint. The old
  // stage was lit by several coloured fills at once, which flattened the
  // bodywork and produced magenta highlights on a red car.
  const ambient = new THREE.HemisphereLight(0x8aa8cc, 0x0a0e15, 0.72);
  group.add(ambient);

  const moon = new THREE.DirectionalLight(0xb8cff0, 0.95);
  moon.position.set(-8, 26, -14);
  group.add(moon);

  const warmKey = new THREE.DirectionalLight(0xffc18a, 1.1);
  warmKey.position.set(6, 7, 9);
  warmKey.target.position.set(0, 0.9, 0);
  group.add(warmKey, warmKey.target);

  const coolFill = new THREE.DirectionalLight(0x9fc6ff, 0.6);
  coolFill.position.set(9, 7, -5);
  coolFill.target.position.set(0, 0.8, 0);
  group.add(coolFill, coolFill.target);

  const rearRim = new THREE.DirectionalLight(0xffd0a0, 0.9);
  rearRim.position.set(-11, 4.5, 5);
  rearRim.target.position.set(0, 0.9, 0);
  group.add(rearRim, rearRim.target);

  const topFill = new THREE.DirectionalLight(0x9fc4ff, 0.28);
  topFill.position.set(2, 16, 1);
  topFill.target.position.set(0, 0.8, 0);
  group.add(topFill, topFill.target);

  const coolStreet = new THREE.PointLight(0x9ed6ff, 18, 26, 1.8);
  coolStreet.position.set(5, 7.2, -4.2);
  group.add(coolStreet);

  const warmStreet = new THREE.PointLight(0xffc38d, 55, 30, 1.75);
  warmStreet.position.set(-6, 6.8, 5);
  group.add(warmStreet);

  const shopFill = new THREE.PointLight(0xffb877, 24, 22, 1.7);
  shopFill.position.set(3.5, 3.0, 7.5);
  group.add(shopFill);

  // One warm street-light pool near the car. The old cool second spot left a
  // soft white oval on the asphalt with no visible fixture above it, which read
  // as a blur patch; it has been removed.
  const spotA = new THREE.SpotLight(0xffd0a0, 240, 32, 0.62, 0.85, 1.6);
  spotA.position.set(-13, 9.4, 5.2);
  spotA.target.position.set(-4, 0, 0.2);
  group.add(spotA, spotA.target);

  const environment = makeEnvironment(renderer);
  const fog = new THREE.Fog(0x08121f, 26, 175);

  /* -------------------------------- rain -------------------------------- */
  // Sharp line streaks only. No sprite cards, no additive glow, so the rain
  // stays crisp against the neon instead of smearing into a soft haze.
  const rain = createRain({
    count: 1500,
    radius: 26,
    height: 19,
    color: 0xa9c7e6,
    opacity: 0.36,
    windX: 0.8,
    windZ: 0.22,
  });
  group.add(rain.group);

  let rainOn = false;
  let wetness = 0;

  function setRain(value) {
    rainOn = Boolean(value);
    rain.setVisible(rainOn);
    roadMaterial.roughness = rainOn ? 0.34 : 0.86;
    roadMaterial.color.set(rainOn ? 0x454d58 : 0x5d636b);
    roadMaterial.envMapIntensity = rainOn ? 0.85 : 0.3;
    pavement.roughness = rainOn ? 0.5 : 0.9;
    pavement.envMapIntensity = rainOn ? 0.72 : 0.35;
    sky.material.color.set(rainOn ? 0x93a2b4 : 0xffffff);
    fog.near = rainOn ? 18 : 26;
    fog.far = rainOn ? 132 : 175;
    crowd.setRain(rainOn);
    wetness = rainOn ? 1 : 0;
  }

  let roadOffset = 0;
  let markOffset = 0;

  function update(dt, elapsed, speed, camera) {
    rain.update(dt, speed, camera);

    // The asphalt stays glossy for a while after the shower stops, then dries.
    if (!rainOn && wetness > 0) {
      wetness = Math.max(0, wetness - dt * 0.1);
      roadMaterial.roughness = 0.34 + (1 - wetness) * 0.52;
    }

    roadOffset = (roadOffset + (speed * dt) / TILE) % 1;
    roadTexture.offset.x = roadOffset;
    pavingTexture.offset.x = (pavingTexture.offset.x + (speed * dt) / 5) % 1;

    markOffset = (markOffset - speed * dt) % DASH_GAP;
    roadMarks.position.x = markOffset;

    for (const prop of props) {
      prop.position.x -= speed * dt;
      if (prop.position.x < CITY_START - 12) prop.position.x += CYCLE;
    }
    for (const prop of farProps) {
      prop.position.x -= speed * dt * 0.22;
      if (prop.position.x < CITY_START - 70) prop.position.x += CYCLE + 140;
    }

    // Overtake decisions. Oncoming vehicles may use the other far lane to pass
    // a slower bus, truck or car. Same-direction traffic never borrows the hero
    // lane, so the player's car is always clear.
    for (const item of traffic) {
      if (item.overtakeTimer > 0) {
        item.overtakeTimer -= dt;
        if (item.overtakeTimer <= 0) {
          item.lane = item.baseLane;
          item.targetLane = item.baseLane;
          item.cooldown = 5 + rand() * 5;
        }
      }
      if (item.cooldown > 0) {
        item.cooldown = Math.max(0, item.cooldown - dt);
      }
    }

    for (const item of traffic) {
      if (item.overtakeTimer > 0 || item.cooldown > 0) continue;

      let leader = null;
      let bestGap = Infinity;
      for (const other of traffic) {
        if (other === item || other.direction !== item.direction) continue;
        if (other.lane !== item.lane) continue;
        const ahead =
          (other.object.position.x - item.object.position.x) * item.direction;
        if (ahead > 0 && ahead < bestGap) {
          bestGap = ahead;
          leader = other;
        }
      }
      if (!leader || bestGap > 18 || leader.speed >= item.speed - 0.7) continue;

      let candidate = null;
      if (item.direction === -1) {
        candidate =
          item.baseLane === LANE_ONCOMING_INNER
            ? LANE_ONCOMING_OUTER
            : LANE_ONCOMING_INNER;
      }
      if (candidate === null) continue;

      let clear = true;
      for (const other of traffic) {
        if (other === item || other.direction !== item.direction) continue;
        if (other.lane !== candidate) continue;
        if (
          Math.abs(other.object.position.x - item.object.position.x) <
          24 + (other.length + item.length) * 0.5
        ) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;

      item.lane = candidate;
      item.targetLane = candidate;
      item.overtakeTimer = 2.4 + rand() * 1.6;
    }

    for (const item of traffic) {
      // Never leave an AI vehicle in the hero lane once the player is moving at
      // a normal road speed.
      if (item.direction === 1 && item.lane !== item.baseLane && speed > 12) {
        item.lane = item.baseLane;
        item.targetLane = item.baseLane;
        item.overtakeTimer = 0;
      }
      item.speed =
        item.overtakeTimer > 0 ? item.baseSpeed * 1.32 : item.baseSpeed;

      // Same-direction traffic moves at its own road speed, so the relative
      // motion is (traffic - player). Oncoming traffic always closes at the sum
      // of the two speeds. At 202 km/h the whole boulevard streams backwards.
      const relative =
        item.direction === 1
          ? item.speed - speed
          : -(item.speed + speed);
      item.object.position.x += relative * dt;

      const lateral = item.targetLane - item.laneZ;
      item.laneZ += lateral * Math.min(1, dt * 3.1);
      item.object.position.z = item.laneZ;

      // Front wheels follow the lane change and a little road camber. The
      // direction sign flips because a car facing -x is rotated 180 degrees.
      const steerTarget = Math.max(
        -0.3,
        Math.min(
          0.3,
          -lateral * 0.26 * item.direction +
            Math.sin(elapsed * 0.8 + item.phase) * 0.012
        )
      );
      item.steer += (steerTarget - item.steer) * Math.min(1, dt * 4);

      let wrapped = false;
      if (item.object.position.x > CITY_END + 60) {
        item.object.position.x = CITY_START - 60;
        wrapped = true;
      } else if (item.object.position.x < CITY_START - 60) {
        item.object.position.x = CITY_END + 60;
        wrapped = true;
      }
      if (wrapped) {
        item.lane = item.baseLane;
        item.targetLane = item.baseLane;
        item.laneZ = item.baseLane;
        item.overtakeTimer = 0;
        item.object.position.z = item.baseLane;
      }

      for (const wheel of item.wheels) {
        if (wheel.front) wheel.pivot.rotation.y = item.steer;
        wheel.pivot.rotation.z -= (item.speed * dt) / wheel.radius;
      }
    }

    // Car-following, not just lane assignment: a faster vehicle may never pass
    // through the one ahead. Each lane is processed from the front backwards so
    // a push propagates down the queue instead of creating a new overlap.
    for (const lane of [
      LANE_PLAYER,
      LANE_SAME,
      LANE_ONCOMING_INNER,
      LANE_ONCOMING_OUTER,
    ]) {
      const laneCars = traffic.filter((item) => item.lane === lane);
      laneCars.sort(
        (a, b) => (a.object.position.x - b.object.position.x) * a.direction
      );
      for (let i = laneCars.length - 2; i >= 0; i--) {
        const follower = laneCars[i];
        const leader = laneCars[i + 1];
        const gap =
          (leader.object.position.x - follower.object.position.x) *
          follower.direction;
        const minGap = (leader.length + follower.length) * 0.5 + 4.5;
        if (gap < minGap) {
          follower.object.position.x -= (minGap - gap) * follower.direction;
        }
      }
    }

    // Global safety net. Lane following only sees cars already assigned to the
    // same lane, so a vehicle mid-lane-change can still clip another one.
    // Compare lane-relative z and separate along x only; two passes settle a
    // cluster without shoving anyone into a different lane.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < traffic.length; i++) {
        for (let j = i + 1; j < traffic.length; j++) {
          const a = traffic[i];
          const b = traffic[j];
          const dx = b.object.position.x - a.object.position.x;
          const dz = b.laneZ - a.laneZ;
          const minX = (a.length + b.length) * 0.5 + 1.6;
          const minZ = (a.width + b.width) * 0.5 + 0.35;
          if (Math.abs(dx) >= minX || Math.abs(dz) >= minZ) continue;
          const push = (minX - Math.abs(dx)) * 0.5 + 0.01;
          if (a.direction === b.direction) {
            const behind = (dx * a.direction) > 0 ? a : b;
            behind.object.position.x -= push * behind.direction;
          } else {
            a.object.position.x -= push;
            b.object.position.x += push;
          }
        }
      }
    }

    crowd.update(dt, speed);

    for (const item of beacons) {
      item.material.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 1.8 + item.phase));
    }

    for (const item of signs) {
      const flicker = 0.88 + 0.06 * Math.sin(elapsed * 4.2 + item.phase);
      item.material.opacity = flicker;
    }
  }

  return {
    group,
    environment,
    update,
    setRain,
    fog,
    cycle: CYCLE,
    crowd,
    get rainOn() {
      return rainOn;
    },
    get traffic() {
      return traffic;
    },
  };
}

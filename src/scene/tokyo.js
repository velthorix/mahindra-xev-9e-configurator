import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createRain } from "./rain.js";
import { createCrowd } from "./people.js";

/* -------------------------------------------------------------------------- */
/*  Tokyo Dreams                                                              */
/* -------------------------------------------------------------------------- */
/*
 * A compact, explorable Japanese city built entirely from procedural geometry.
 * The avenue runs along x. The road occupies z = -9..9, the pavements sit at
 * |z| = 9..13, and the districts stack up behind them. Everything that repeats
 * is merged or instanced; only the hero storefronts, signs and animated props
 * keep their own draw calls.
 */

const TAU = Math.PI * 2;
const JP_FONT = '"Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif';

const CITY = {
  minX: -176,
  maxX: 176,
  minZ: -104,
  maxZ: 104,
  roadHalf: 9,
  walkHalf: 13,
  crossHalf: 7,
};

// The core city is finite so its landmarks stay where they were authored.
// Beyond it the avenue continues forever: a moving road strip plus a small
// pool of procedural blocks that are reassigned to the slots around the car.
const ENDLESS = {
  chunkLength: 96,
  chunkCount: 8,
  viewDistance: 300,
  corridorLength: 800,
  snap: 8,
};

/**
 * 2D oriented-box overlap. Each box is {x, z, heading, halfLength, halfWidth}.
 * The margin expands both boxes, which is useful for vehicle bumpers. This is a
 * separating-axis test, so it is exact for the rectangles used by the drive
 * collision and cheap enough to run against every street vehicle each frame.
 */
export function obbOverlap(a, b, margin = 0) {
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

const DISTRICTS = [
  {
    id: "neon",
    name: "Neon District",
    jp: "ネオン街",
    minX: -68,
    maxX: 68,
    color: "#ff4fb8",
  },
  {
    id: "traditional",
    name: "Traditional District",
    jp: "下町",
    minX: -176,
    maxX: -68,
    color: "#ffb15e",
  },
  {
    id: "sakura",
    name: "Sakura District",
    jp: "桜町",
    minX: 28,
    maxX: 112,
    color: "#ff9ec4",
  },
  {
    id: "residential",
    name: "Residential District",
    jp: "住宅街",
    minX: -68,
    maxX: 28,
    color: "#8fd8ff",
  },
  {
    id: "train",
    name: "Train District",
    jp: "駅前",
    minX: 112,
    maxX: 176,
    color: "#9dffcf",
  },
];

const SIDE_LANES = [
  { id: "shrine", x: -72, half: 3.2, z0: 9, z1: 46, kind: "stone" },
  { id: "sakura", x: 58, half: 3.6, z0: 9, z1: 50, kind: "stone" },
  { id: "residential", x: 88, half: 3.0, z0: -9, z1: -58, kind: "alley" },
  { id: "station", x: 132, half: 4.2, z0: 9, z1: 38, kind: "road" },
  { id: "northalley", x: -118, half: 2.8, z0: -9, z1: -48, kind: "alley" },
];

const SIGN_LIBRARY = [
  { text: "ラーメン", fg: "#ffd45e", bg: "#210b05", vertical: true, accent: "#ff4a2a" },
  { text: "居酒屋", fg: "#ff6a52", bg: "#1a0706", vertical: true, accent: "#ffd45e" },
  { text: "カラオケ", fg: "#ff5bd6", bg: "#17051b", vertical: true, accent: "#66e6ff" },
  { text: "薬", fg: "#83ffb5", bg: "#04170d", vertical: true, accent: "#ffffff" },
  { text: "焼肉", fg: "#ff8a3d", bg: "#1b0a04", vertical: true, accent: "#ffd45e" },
  { text: "寿司", fg: "#ffe9b8", bg: "#0c1720", vertical: true, accent: "#66d9ff" },
  { text: "ゲーム", fg: "#6beaff", bg: "#04131c", vertical: true, accent: "#ff5bd6" },
  { text: "喫茶", fg: "#ffd9a2", bg: "#1b1209", vertical: false, accent: "#8a5a2a" },
  { text: "書店", fg: "#b993ff", bg: "#100818", vertical: true, accent: "#ffd45e" },
  { text: "パチンコ", fg: "#ffef62", bg: "#1a1403", vertical: true, accent: "#ff3d6e" },
  { text: "ホテル", fg: "#ff8bd2", bg: "#170814", vertical: true, accent: "#8fd8ff" },
  { text: "中華", fg: "#ff5548", bg: "#1a0505", vertical: false, accent: "#ffd45e" },
  { text: "酒", fg: "#ffe6a8", bg: "#160b06", vertical: true, accent: "#ff8a3d" },
  { text: "たばこ", fg: "#ffb84a", bg: "#1b0d04", vertical: true, accent: "#ffffff" },
  { text: "美容室", fg: "#ff9ad8", bg: "#1a0714", vertical: false, accent: "#ffffff" },
  { text: "定食", fg: "#ffe7b8", bg: "#181006", vertical: false, accent: "#ff6a52" },
  { text: "うどん", fg: "#ffd27a", bg: "#160d05", vertical: false, accent: "#ff4a2a" },
  { text: "花", fg: "#ff9ad0", bg: "#170811", vertical: true, accent: "#9dffcf" },
  { text: "コインランドリー", fg: "#7be7ff", bg: "#04141a", vertical: false, accent: "#ffffff" },
  { text: "整体", fg: "#9dffcf", bg: "#04170e", vertical: true, accent: "#ffe6a8" },
  { text: "米", fg: "#f4e7c0", bg: "#171207", vertical: true, accent: "#b6ff8a" },
  { text: "茶", fg: "#b6ff8a", bg: "#081707", vertical: true, accent: "#ffe6a8" },
  { text: "宿", fg: "#ffbe7a", bg: "#1a0d05", vertical: true, accent: "#ffffff" },
  { text: "駅", fg: "#9fdcff", bg: "#06131c", vertical: false, accent: "#ffffff" },
  { text: "神社", fg: "#ffcf8a", bg: "#1a1006", vertical: true, accent: "#ff5a3d" },
  { text: "さくら", fg: "#ff9ec4", bg: "#1c0711", vertical: true, accent: "#ffffff" },
  { text: "駐車場", fg: "#d8f4ff", bg: "#07131a", vertical: false, accent: "#66d9ff" },
  { text: "東京", fg: "#ff5fb0", bg: "#12040c", vertical: false, accent: "#66e6ff" },
  { text: "未来", fg: "#5fe8ff", bg: "#041218", vertical: false, accent: "#ff5bd6" },
  { text: "住宅街", fg: "#bfe8ff", bg: "#07131a", vertical: false, accent: "#ffffff" },
  { text: "バス", fg: "#ffffff", bg: "#0a3a6a", vertical: false, accent: "#9fdcff" },
];

const BILLBOARD_LIBRARY = [
  { text: "東京の夜", sub: "TOKYO DREAMS", fg: "#ffd9f2", bg: "#200726", accent: "#ff4fb8" },
  { text: "未来へ", sub: "NEXT HORIZON", fg: "#d9fbff", bg: "#041a24", accent: "#4fe8ff" },
  { text: "桜", sub: "SAKURA SEASON", fg: "#fff0f6", bg: "#2a0b19", accent: "#ff9ec4" },
  { text: "夜を歩く", sub: "WALK THE NIGHT", fg: "#fff3c9", bg: "#1b1205", accent: "#ffb15e" },
];

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                             */
/* -------------------------------------------------------------------------- */

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function range(rand, min, max) {
  return min + rand() * (max - min);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d") };
}

function canvasTexture(canvas, { repeat = false, srgb = true, aniso = 4 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  }
  texture.anisotropy = aniso;
  return texture;
}

function cloneTexture(texture, repeatX, repeatY) {
  const copy = texture.clone();
  copy.needsUpdate = true;
  copy.wrapS = copy.wrapT = THREE.RepeatWrapping;
  copy.repeat.set(repeatX, repeatY);
  return copy;
}

function noise(ctx, width, height, amount = 0.08, alpha = 0.18) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * amount;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    data[i + 3] = Math.max(0, Math.min(255, data[i + 3] * (1 - alpha) + 255 * alpha));
  }
  ctx.putImageData(image, 0, 0);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/* -------------------------------------------------------------------------- */
/*  Procedural textures                                                       */
/* -------------------------------------------------------------------------- */

function makeWallTexture() {
  const { canvas, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = "#b6b6b2";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 10 + Math.random() * 120;
    const h = 20 + Math.random() * 180;
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 40},${
      Math.random() > 0.5 ? 255 : 45
    },${Math.random() > 0.5 ? 255 : 40},${0.012 + Math.random() * 0.025})`;
    ctx.fillRect(x, y, w, h);
  }
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * 512;
    const gradient = ctx.createLinearGradient(x, 0, x + 20, 0);
    gradient.addColorStop(0, "rgba(30,32,34,0)");
    gradient.addColorStop(0.5, "rgba(30,32,34,0.12)");
    gradient.addColorStop(1, "rgba(30,32,34,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, 20 + Math.random() * 18, 512);
  }
  ctx.strokeStyle = "rgba(55,58,60,0.22)";
  ctx.lineWidth = 1;
  for (let y = 64; y < 512; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(512, y + 0.5);
    ctx.stroke();
  }
  for (let x = 0; x < 512; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, 512);
    ctx.stroke();
  }
  noise(ctx, 512, 512, 0.06, 0.08);
  return canvasTexture(canvas, { repeat: true });
}

function makeAsphaltTexture() {
  const { canvas, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = "#17191c";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const value = 20 + Math.floor(Math.random() * 70);
    ctx.fillStyle = `rgba(${value},${value + 2},${value + 5},${0.2 + Math.random() * 0.5})`;
    const size = Math.random() > 0.94 ? 2 : 1;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, size, size);
  }
  ctx.strokeStyle = "rgba(6,7,9,0.55)";
  for (let i = 0; i < 14; i++) {
    let x = Math.random() * 512;
    let y = Math.random() * 512;
    ctx.lineWidth = 0.6 + Math.random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 40;
      y += 10 + Math.random() * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return canvasTexture(canvas, { repeat: true });
}

function makeSidewalkTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = "#8b8984";
  ctx.fillRect(0, 0, 256, 256);
  const tile = 64;
  for (let y = 0; y < 256; y += tile) {
    for (let x = 0; x < 256; x += tile) {
      const shade = 128 + Math.floor(Math.random() * 26);
      ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 5})`;
      ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      ctx.strokeStyle = "rgba(42,42,40,0.22)";
      ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
    }
  }
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(40,38,35,${0.02 + Math.random() * 0.04})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 60, 10 + Math.random() * 40);
  }
  noise(ctx, 256, 256, 0.05, 0.05);
  return canvasTexture(canvas, { repeat: true });
}

function makeStoneTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = "#6e6a62";
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 64) {
      const offset = (Math.floor(y / 32) % 2) * 32;
      const shade = 100 + Math.floor(Math.random() * 34);
      ctx.fillStyle = `rgb(${shade},${shade - 3},${shade - 8})`;
      roundRect(ctx, x + offset + 1, y + 1, 61, 29, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(35,33,30,0.32)";
      ctx.stroke();
    }
  }
  noise(ctx, 256, 256, 0.08, 0.08);
  return canvasTexture(canvas, { repeat: true });
}

function makeWoodTexture() {
  const { canvas, ctx } = makeCanvas(256, 512);
  ctx.fillStyle = "#5b3c25";
  ctx.fillRect(0, 0, 256, 512);
  for (let x = 0; x < 256; x += 8) {
    const shade = 60 + Math.floor(Math.random() * 44);
    ctx.fillStyle = `rgba(${shade + 24},${shade},${Math.max(18, shade - 22)},0.55)`;
    ctx.fillRect(x, 0, 5 + Math.random() * 3, 512);
  }
  for (let i = 0; i < 24; i++) {
    ctx.strokeStyle = `rgba(28,16,8,${0.08 + Math.random() * 0.12})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.4;
    ctx.beginPath();
    const x = Math.random() * 256;
    ctx.moveTo(x, 0);
    for (let y = 0; y < 512; y += 32) {
      ctx.lineTo(x + Math.sin(y * 0.02 + i) * 5, y);
    }
    ctx.stroke();
  }
  noise(ctx, 256, 512, 0.04, 0.04);
  return canvasTexture(canvas, { repeat: true });
}

function makeRoofTexture() {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = "#343a42";
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 24) {
    for (let x = 0; x < 256; x += 32) {
      const offset = (Math.floor(y / 24) % 2) * 16;
      const shade = 42 + Math.floor(Math.random() * 26);
      ctx.fillStyle = `rgb(${shade},${shade + 5},${shade + 12})`;
      ctx.beginPath();
      ctx.ellipse(x + offset + 16, y + 12, 17, 12, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(12,14,18,0.4)";
      ctx.stroke();
    }
  }
  noise(ctx, 256, 256, 0.05, 0.05);
  return canvasTexture(canvas, { repeat: true });
}

function makeSignTexture(sign, index) {
  const vertical = Boolean(sign.vertical);
  const width = vertical ? 256 : 640;
  const height = vertical ? 768 : 224;
  const { canvas, ctx } = makeCanvas(width, height);

  ctx.fillStyle = sign.bg;
  ctx.fillRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(255,255,255,0.10)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.24)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = sign.accent ?? sign.fg;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, width - 10, height - 10);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = sign.fg;
  ctx.shadowBlur = 22;
  ctx.fillStyle = sign.fg;

  if (vertical) {
    const characters = [...sign.text];
    const area = height - 88;
    const step = area / characters.length;
    const size = Math.min(122, step * 0.82, width * 0.62);
    ctx.font = `700 ${size}px ${JP_FONT}`;
    characters.forEach((character, i) => {
      ctx.fillText(character, width / 2, 52 + step * (i + 0.5));
    });
    ctx.shadowBlur = 0;
    ctx.font = `500 26px ${JP_FONT}`;
    ctx.fillStyle = sign.accent ?? sign.fg;
    ctx.globalAlpha = 0.85;
    ctx.fillText(String(index + 1).padStart(2, "0"), width / 2, height - 30);
    ctx.globalAlpha = 1;
  } else {
    ctx.font = `700 ${Math.min(112, 640 / Math.max(2, [...sign.text].length) * 1.15)}px ${JP_FONT}`;
    ctx.fillText(sign.text, width / 2, height * 0.46);
    ctx.shadowBlur = 0;
    ctx.font = `500 24px ${JP_FONT}`;
    ctx.fillStyle = sign.accent ?? sign.fg;
    ctx.globalAlpha = 0.78;
    ctx.fillText("TOKYO", width / 2, height - 34);
    ctx.globalAlpha = 1;
  }

  return canvasTexture(canvas);
}

function makeBillboardTexture(item, index) {
  const { canvas, ctx } = makeCanvas(768, 384);
  ctx.fillStyle = item.bg;
  ctx.fillRect(0, 0, 768, 384);

  const glow = ctx.createRadialGradient(180, 130, 10, 180, 130, 360);
  glow.addColorStop(0, item.accent);
  glow.addColorStop(0.35, `${item.accent}66`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 768, 384);

  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = item.accent;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(120 + i * 30, 300 - i * 16, 120 + i * 32, -0.4, 2.2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.shadowColor = item.accent;
  ctx.shadowBlur = 26;
  ctx.fillStyle = item.fg;
  ctx.font = `700 96px ${JP_FONT}`;
  ctx.fillText(item.text, 54, 150);
  ctx.shadowBlur = 0;
  ctx.fillStyle = item.accent;
  ctx.font = `600 26px ${JP_FONT}`;
  ctx.fillText(item.sub, 58, 246);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `500 18px ${JP_FONT}`;
  ctx.fillText(`TOKYO / 0${index + 1}`, 58, 292);

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 748, 364);
  return canvasTexture(canvas);
}

function makeShopTexture() {
  const { canvas, ctx } = makeCanvas(512, 256);
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#ffd9a0");
  gradient.addColorStop(0.45, "#ffb968");
  gradient.addColorStop(1, "#7a3d18");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = "rgba(70,34,14,0.55)";
  for (let row = 0; row < 3; row++) {
    ctx.fillRect(24, 50 + row * 56, 464, 7);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(${40 + Math.random() * 80},${20 + Math.random() * 40},${
        10 + Math.random() * 30
      },0.7)`;
      ctx.fillRect(32 + i * 38, 22 + row * 56, 18 + Math.random() * 8, 24);
    }
  }
  ctx.fillStyle = "rgba(22,10,4,0.65)";
  ctx.beginPath();
  ctx.ellipse(430, 200, 34, 52, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,240,205,0.25)";
  ctx.fillRect(0, 0, 512, 16);
  return canvasTexture(canvas);
}

function makeVendingTexture() {
  const { canvas, ctx } = makeCanvas(256, 512);
  ctx.fillStyle = "#f4f4ef";
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = "#d8262f";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 38px ${JP_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("つめたい", 128, 34);

  ctx.fillStyle = "#13161c";
  ctx.fillRect(14, 80, 228, 320);
  const colors = ["#ff5a4a", "#ffd45e", "#66d9ff", "#9dffcf", "#ff8bd2", "#ffffff", "#7b5cff"];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const x = 24 + col * 44;
      const y = 94 + row * 74;
      ctx.fillStyle = colors[(row * 5 + col) % colors.length];
      roundRect(ctx, x, y, 32, 52, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x + 6, y + 6, 6, 38);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x + 5, y + 43, 22, 4);
    }
  }
  ctx.fillStyle = "#16181c";
  ctx.fillRect(30, 420, 196, 56);
  ctx.fillStyle = "#8fffa8";
  ctx.font = `600 22px ${JP_FONT}`;
  ctx.fillText("COLD / 100円", 128, 450);
  return canvasTexture(canvas);
}

function makeNorenTexture(text, color = "#1b2b52") {
  const { canvas, ctx } = makeCanvas(512, 256);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let x = 0; x < 512; x += 8) ctx.fillRect(x, 0, 3, 256);
  ctx.fillStyle = "#f2ead9";
  ctx.font = `700 96px ${JP_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 124);
  ctx.strokeStyle = "rgba(242,234,217,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(512, 22);
  ctx.stroke();
  return canvasTexture(canvas);
}

function makePetalTexture() {
  const { canvas, ctx } = makeCanvas(64, 64);
  ctx.clearRect(0, 0, 64, 64);
  const gradient = ctx.createRadialGradient(26, 22, 2, 32, 32, 30);
  gradient.addColorStop(0, "#fff3f7");
  gradient.addColorStop(0.55, "#ffc2d8");
  gradient.addColorStop(1, "#f28db4");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.bezierCurveTo(58, 12, 60, 42, 32, 60);
  ctx.bezierCurveTo(4, 42, 6, 12, 32, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(190,80,120,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, 12);
  ctx.lineTo(32, 52);
  ctx.stroke();
  return canvasTexture(canvas);
}

function makeGlowTexture() {
  const { canvas, ctx } = makeCanvas(128, 128);
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,255,255,0.82)");
  gradient.addColorStop(0.46, "rgba(255,255,255,0.28)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(canvas, { srgb: false });
}

function makeWindowTexture(lit) {
  const { canvas, ctx } = makeCanvas(128, 128);
  if (lit) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 128);
    gradient.addColorStop(0, "#fff8e8");
    gradient.addColorStop(0.55, "#ffd79c");
    gradient.addColorStop(1, "#b86b32");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(80,40,18,0.35)";
    ctx.fillRect(58, 0, 5, 128);
    ctx.fillRect(0, 62, 128, 5);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(8, 8, 40, 48);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 128, 128);
    gradient.addColorStop(0, "#2b3a4a");
    gradient.addColorStop(0.5, "#16212d");
    gradient.addColorStop(1, "#0a1017");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(160,200,230,0.16)";
    ctx.fillRect(6, 6, 34, 54);
  }
  ctx.strokeStyle = lit ? "rgba(70,35,14,0.85)" : "rgba(8,12,16,0.9)";
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, 128, 128);
  return canvasTexture(canvas);
}

function makeSkylineWindowTexture() {
  const { canvas, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, 128, 128);
  const colors = ["#ffd79c", "#9fdcff", "#ff8bd2", "#fff3c9"];
  for (let y = 8; y < 124; y += 16) {
    for (let x = 8; x < 124; x += 16) {
      if (Math.random() > 0.48) {
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.globalAlpha = 0.35 + Math.random() * 0.65;
        ctx.fillRect(x, y, 7, 8);
      }
    }
  }
  ctx.globalAlpha = 1;
  return canvasTexture(canvas);
}

function makeStationSignTexture() {
  const { canvas, ctx } = makeCanvas(768, 224);
  ctx.fillStyle = "#f4f7f8";
  ctx.fillRect(0, 0, 768, 224);
  ctx.fillStyle = "#0d3a58";
  ctx.fillRect(0, 0, 768, 42);
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 22px ${JP_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("TOKYO METRO  /  JR EAST", 24, 22);
  ctx.fillStyle = "#12232f";
  ctx.font = `700 72px ${JP_FONT}`;
  ctx.fillText("桜 台 駅", 28, 116);
  ctx.font = `500 28px ${JP_FONT}`;
  ctx.fillStyle = "#47606e";
  ctx.fillText("Sakura-dai Station", 30, 174);
  ctx.fillStyle = "#d8262f";
  ctx.beginPath();
  ctx.arc(704, 116, 34, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 32px ${JP_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("駅", 704, 116);
  return canvasTexture(canvas);
}

function makeRamenSignTexture() {
  const { canvas, ctx } = makeCanvas(640, 256);
  ctx.fillStyle = "#1b0905";
  ctx.fillRect(0, 0, 640, 256);
  ctx.strokeStyle = "#ffcf5a";
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 628, 244);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#ff6a2a";
  ctx.shadowBlur = 26;
  ctx.fillStyle = "#ffe7b0";
  ctx.font = `700 92px ${JP_FONT}`;
  ctx.fillText("麺処 あかり", 320, 104);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ff6a2a";
  ctx.font = `600 30px ${JP_FONT}`;
  ctx.fillText("RAMEN  /  OPEN 18:00", 320, 186);
  return canvasTexture(canvas);
}

function makeKonbiniSignTexture() {
  const { canvas, ctx } = makeCanvas(768, 192);
  ctx.fillStyle = "#f7fbf7";
  ctx.fillRect(0, 0, 768, 192);
  ctx.fillStyle = "#0a9c5a";
  ctx.fillRect(0, 0, 768, 24);
  ctx.fillRect(0, 168, 768, 24);
  ctx.fillStyle = "#0a6f9c";
  ctx.fillRect(0, 24, 768, 12);
  ctx.fillStyle = "#0c2a1a";
  ctx.font = `700 72px ${JP_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("まちかどマート", 384, 94);
  ctx.fillStyle = "#0a9c5a";
  ctx.font = `600 22px ${JP_FONT}`;
  ctx.fillText("24 HOURS  /  コンビニ", 384, 148);
  return canvasTexture(canvas);
}

/* -------------------------------------------------------------------------- */
/*  Materials                                                                 */
/* -------------------------------------------------------------------------- */

function makeMaterials() {
  const wall = makeWallTexture();
  const asphalt = makeAsphaltTexture();
  const sidewalk = makeSidewalkTexture();
  const stone = makeStoneTexture();
  const wood = makeWoodTexture();
  const roof = makeRoofTexture();

  const wallMaterial = (color, roughness = 0.86, metalness = 0.02) =>
    new THREE.MeshStandardMaterial({
      color,
      map: wall,
      roughness,
      metalness,
      envMapIntensity: 0.42,
    });

  const materials = {
    concrete: wallMaterial(0xbab8b0),
    concreteCool: wallMaterial(0x8f9aa4),
    concreteWarm: wallMaterial(0xc4b29a),
    concreteDark: wallMaterial(0x4a4d52),
    brick: wallMaterial(0x8b5a44),
    cream: wallMaterial(0xd8d2c2),
    tile: wallMaterial(0x7d8a8c),
    wood: new THREE.MeshStandardMaterial({
      color: 0x8a6440,
      map: wood,
      roughness: 0.78,
      metalness: 0.01,
      envMapIntensity: 0.25,
    }),
    darkWood: new THREE.MeshStandardMaterial({
      color: 0x4a3020,
      map: wood,
      roughness: 0.84,
      metalness: 0.01,
      envMapIntensity: 0.2,
    }),
    roof: new THREE.MeshStandardMaterial({
      color: 0x6f7c86,
      map: roof,
      roughness: 0.62,
      metalness: 0.12,
      envMapIntensity: 0.5,
    }),
    roofDark: new THREE.MeshStandardMaterial({
      color: 0x3a414a,
      map: roof,
      roughness: 0.55,
      metalness: 0.2,
      envMapIntensity: 0.65,
    }),
    asphalt: new THREE.MeshStandardMaterial({
      color: 0x1c1f24,
      map: cloneTexture(asphalt, 44, 3),
      roughness: 0.28,
      metalness: 0.32,
      envMapIntensity: 1.25,
    }),
    asphaltSide: new THREE.MeshStandardMaterial({
      color: 0x202329,
      map: cloneTexture(asphalt, 4, 18),
      roughness: 0.32,
      metalness: 0.26,
      envMapIntensity: 1.0,
    }),
    alley: new THREE.MeshStandardMaterial({
      color: 0x55524b,
      map: cloneTexture(stone, 3, 14),
      roughness: 0.72,
      metalness: 0.05,
      envMapIntensity: 0.6,
    }),
    stone: new THREE.MeshStandardMaterial({
      color: 0x9a968c,
      map: cloneTexture(stone, 2, 10),
      roughness: 0.82,
      metalness: 0.02,
      envMapIntensity: 0.4,
    }),
    sidewalk: new THREE.MeshStandardMaterial({
      color: 0xa7a49d,
      map: cloneTexture(sidewalk, 38, 1.2),
      roughness: 0.78,
      metalness: 0.03,
      envMapIntensity: 0.5,
    }),
    sidewalkCross: new THREE.MeshStandardMaterial({
      color: 0xa7a49d,
      map: cloneTexture(sidewalk, 1.2, 12),
      roughness: 0.78,
      metalness: 0.03,
      envMapIntensity: 0.5,
    }),
    curb: new THREE.MeshStandardMaterial({
      color: 0xb8b5ad,
      roughness: 0.72,
      metalness: 0.04,
      envMapIntensity: 0.4,
    }),
    paintWhite: new THREE.MeshStandardMaterial({
      color: 0xe9e7de,
      roughness: 0.44,
      metalness: 0.05,
      emissive: 0x161616,
      emissiveIntensity: 0.15,
      envMapIntensity: 0.7,
    }),
    paintYellow: new THREE.MeshStandardMaterial({
      color: 0xd8b04c,
      roughness: 0.5,
      metalness: 0.04,
      envMapIntensity: 0.6,
    }),
    paintBlue: new THREE.MeshStandardMaterial({
      color: 0x4d8db8,
      roughness: 0.55,
      metalness: 0.05,
      envMapIntensity: 0.5,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x6c747c,
      roughness: 0.4,
      metalness: 0.72,
      envMapIntensity: 1.0,
    }),
    darkMetal: new THREE.MeshStandardMaterial({
      color: 0x23272c,
      roughness: 0.48,
      metalness: 0.7,
      envMapIntensity: 0.9,
    }),
    rust: new THREE.MeshStandardMaterial({
      color: 0x6d3e2c,
      roughness: 0.86,
      metalness: 0.3,
      envMapIntensity: 0.35,
    }),
    green: new THREE.MeshStandardMaterial({
      color: 0x2e5e45,
      roughness: 0.72,
      metalness: 0.08,
      envMapIntensity: 0.5,
    }),
    red: new THREE.MeshStandardMaterial({
      color: 0xa83028,
      roughness: 0.6,
      metalness: 0.1,
      envMapIntensity: 0.5,
    }),
    torii: new THREE.MeshStandardMaterial({
      color: 0xc4472f,
      roughness: 0.55,
      metalness: 0.06,
      envMapIntensity: 0.5,
    }),
    black: new THREE.MeshStandardMaterial({
      color: 0x111316,
      roughness: 0.52,
      metalness: 0.24,
      envMapIntensity: 0.7,
    }),
    white: new THREE.MeshStandardMaterial({
      color: 0xe6e4dc,
      roughness: 0.68,
      metalness: 0.03,
      envMapIntensity: 0.5,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x1b3340,
      roughness: 0.08,
      metalness: 0.68,
      envMapIntensity: 1.6,
      transparent: true,
      opacity: 0.86,
    }),
    paper: new THREE.MeshStandardMaterial({
      color: 0xffd9a0,
      roughness: 0.7,
      metalness: 0.0,
      emissive: 0xffa54a,
      emissiveIntensity: 0.8,
      envMapIntensity: 0.2,
    }),
    lantern: new THREE.MeshStandardMaterial({
      color: 0xffb35e,
      roughness: 0.55,
      metalness: 0.0,
      emissive: 0xff7a22,
      emissiveIntensity: 1.5,
      envMapIntensity: 0.1,
    }),
    lanternWhite: new THREE.MeshStandardMaterial({
      color: 0xfff0d2,
      roughness: 0.62,
      metalness: 0.0,
      emissive: 0xffd7a0,
      emissiveIntensity: 1.0,
      envMapIntensity: 0.1,
    }),
    streetLamp: new THREE.MeshStandardMaterial({
      color: 0xfff2d6,
      roughness: 0.4,
      metalness: 0.02,
      emissive: 0xffd9a0,
      emissiveIntensity: 1.5,
      envMapIntensity: 0.1,
    }),
    water: new THREE.MeshPhysicalMaterial({
      color: 0x14343c,
      roughness: 0.06,
      metalness: 0.48,
      envMapIntensity: 1.8,
      transparent: true,
      opacity: 0.88,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      emissive: 0x0a2a33,
      emissiveIntensity: 0.22,
    }),
    blossom: new THREE.MeshStandardMaterial({
      color: 0xffc2d8,
      roughness: 0.82,
      metalness: 0.0,
      emissive: 0x3a1420,
      emissiveIntensity: 0.2,
      envMapIntensity: 0.35,
      flatShading: true,
    }),
    leaf: new THREE.MeshStandardMaterial({
      color: 0x3f6b48,
      roughness: 0.9,
      metalness: 0.0,
      envMapIntensity: 0.25,
      flatShading: true,
    }),
    trunk: new THREE.MeshStandardMaterial({
      color: 0x4b3527,
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.18,
    }),
    soil: new THREE.MeshStandardMaterial({
      color: 0x3b3228,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.15,
    }),
    train: new THREE.MeshStandardMaterial({
      color: 0xcfd6d8,
      roughness: 0.4,
      metalness: 0.55,
      envMapIntensity: 1.1,
    }),
    trainGreen: new THREE.MeshStandardMaterial({
      color: 0x2f8f6a,
      roughness: 0.48,
      metalness: 0.35,
      envMapIntensity: 0.8,
    }),
    trainDark: new THREE.MeshStandardMaterial({
      color: 0x1b2328,
      roughness: 0.5,
      metalness: 0.4,
      envMapIntensity: 0.8,
    }),
  };

  // The merged walls share a map; the tile and wood maps are deliberately
  // subtle so a single material can cover many differently sized boxes.
  materials.wall = wall;
  materials.asphaltBase = asphalt;
  materials.sidewalkBase = sidewalk;
  materials.stoneBase = stone;
  materials.woodBase = wood;
  materials.roofBase = roof;
  return materials;
}

/* -------------------------------------------------------------------------- */
/*  Static geometry builder                                                   */
/* -------------------------------------------------------------------------- */

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

function createBuilder() {
  const buckets = new Map();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();

  function add(key, geometry, { cast = true, receive = true } = {}) {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { geometries: [], cast, receive };
      buckets.set(key, bucket);
    }
    bucket.geometries.push(geometry);
  }

  function transformed(geometry, x, y, z, rx, ry, rz) {
    euler.set(rx, ry, rz);
    quaternion.setFromEuler(euler);
    position.set(x, y, z);
    scale.set(1, 1, 1);
    matrix.compose(position, quaternion, scale);
    geometry.applyMatrix4(matrix);
    return geometry;
  }

  function box(key, width, height, depth, x, y, z, options = {}) {
    const geometry = UNIT_BOX.clone();
    geometry.scale(width, height, depth);
    transformed(
      geometry,
      x,
      y,
      z,
      options.rx ?? 0,
      options.ry ?? 0,
      options.rz ?? 0
    );
    add(key, geometry, options);
  }

  function cylinder(key, radiusTop, radiusBottom, height, segments, x, y, z, options = {}) {
    const geometry = new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      segments,
      options.heightSegments ?? 1,
      options.openEnded ?? false
    );
    transformed(
      geometry,
      x,
      y,
      z,
      options.rx ?? 0,
      options.ry ?? 0,
      options.rz ?? 0
    );
    add(key, geometry, options);
  }

  function sphere(key, radius, widthSegments, heightSegments, x, y, z, options = {}) {
    const geometry = new THREE.SphereGeometry(
      radius,
      widthSegments,
      heightSegments,
      options.phiStart ?? 0,
      options.phiLength ?? TAU,
      options.thetaStart ?? 0,
      options.thetaLength ?? Math.PI
    );
    transformed(
      geometry,
      x,
      y,
      z,
      options.rx ?? 0,
      options.ry ?? 0,
      options.rz ?? 0
    );
    add(key, geometry, options);
  }

  function cone(key, radius, height, segments, x, y, z, options = {}) {
    const geometry = new THREE.ConeGeometry(radius, height, segments);
    transformed(
      geometry,
      x,
      y,
      z,
      options.rx ?? 0,
      options.ry ?? 0,
      options.rz ?? 0
    );
    add(key, geometry, options);
  }

  function plane(key, width, height, x, y, z, options = {}) {
    const geometry = UNIT_PLANE.clone();
    geometry.scale(width, height, 1);
    transformed(
      geometry,
      x,
      y,
      z,
      options.rx ?? 0,
      options.ry ?? 0,
      options.rz ?? 0
    );
    add(key, geometry, { cast: false, receive: options.receive ?? true });
  }

  function torus(key, radius, tube, radialSegments, tubularSegments, x, y, z, options = {}) {
    const geometry = new THREE.TorusGeometry(
      radius,
      tube,
      radialSegments,
      tubularSegments
    );
    transformed(
      geometry,
      x,
      y,
      z,
      options.rx ?? 0,
      options.ry ?? 0,
      options.rz ?? 0
    );
    add(key, geometry, options);
  }

  function addGeometry(key, geometry, x, y, z, options = {}) {
    transformed(
      geometry,
      x,
      y,
      z,
      options.rx ?? 0,
      options.ry ?? 0,
      options.rz ?? 0
    );
    add(key, geometry, options);
  }

  function finish(group, materials) {
    for (const [key, bucket] of buckets) {
      if (!bucket.geometries.length) continue;
      const material = materials[key];
      if (!material) {
        console.warn(`Tokyo: no material for "${key}"`);
        continue;
      }
      const merged = mergeGeometries(bucket.geometries, false);
      for (const geometry of bucket.geometries) geometry.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `TokyoStatic_${key}`;
      mesh.castShadow = bucket.cast;
      mesh.receiveShadow = bucket.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    buckets.clear();
  }

  return { add, box, cylinder, sphere, cone, plane, torus, addGeometry, finish };
}

/* -------------------------------------------------------------------------- */
/*  Sky, stars and environment                                                */
/* -------------------------------------------------------------------------- */

function createSky() {
  const uniforms = {
    topColor: { value: new THREE.Color(0x050b1e) },
    horizonColor: { value: new THREE.Color(0x18264a) },
    groundColor: { value: new THREE.Color(0x02040a) },
    sunColor: { value: new THREE.Color(0x9fc8ff) },
    sunDirection: { value: new THREE.Vector3(-0.4, 0.3, -0.8).normalize() },
    sunGlow: { value: 0.4 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 groundColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      uniform float sunGlow;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 color = mix(horizonColor, topColor, smoothstep(0.48, 0.94, height));
        color = mix(groundColor, color, smoothstep(0.0, 0.085, height));
        float sun = pow(max(dot(direction, normalize(sunDirection)), 0.0), 260.0);
        color += sunColor * sun * sunGlow;
        float band = exp(-abs(direction.y) * 10.0);
        color += horizonColor * band * 0.12;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  material.toneMapped = false;

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 18), material);
  mesh.name = "TokyoSky";
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return { mesh, uniforms, material };
}

function createStars() {
  const rand = seeded(90125);
  const count = 1100;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = rand() * TAU;
    const y = 0.08 + rand() * 0.92;
    const r = Math.sqrt(1 - y * y);
    const radius = 455;
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xdbe8ff,
    size: 1.5,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "TokyoStars";
  points.renderOrder = -90;
  points.frustumCulled = false;
  return points;
}

function createCelestialSprite(color, size) {
  const { canvas, ctx } = makeCanvas(128, 128);
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.16, color);
  gradient.addColorStop(0.46, "rgba(255,255,255,0.15)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const material = new THREE.SpriteMaterial({
    map: canvasTexture(canvas, { srgb: false }),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(size);
  return sprite;
}

function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050c);

  const panel = (color, intensity, position, size) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.lookAt(0, position[1] * 0.4, 0);
    scene.add(mesh);
  };

  // A ring of coloured shopfronts and signs so wet asphalt picks up believable
  // pink, cyan and amber streaks without a second reflection pass.
  panel(0xff4fb8, 3.2, [-18, 4.5, 9], [3, 12]);
  panel(0x4fe8ff, 3.6, [17, 5.5, 8], [2.4, 14]);
  panel(0xffb15e, 2.6, [8, 2.4, -14], [10, 3]);
  panel(0x9d6bff, 2.4, [-9, 7.5, -15], [4, 10]);
  panel(0xffe6b0, 2.0, [0, 2.0, 16], [12, 2.4]);
  panel(0x5b7cff, 1.8, [22, 3.0, -8], [3, 8]);
  panel(0xff3d6e, 2.0, [-24, 6.0, -5], [2, 9]);
  panel(0x9dffcf, 1.8, [28, 4.0, 4], [2, 8]);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 32),
    new THREE.MeshBasicMaterial({ color: 0x080a10 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  scene.add(ground);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  scene.traverse((object) => {
    object.geometry?.dispose?.();
    object.material?.dispose?.();
  });
  return target.texture;
}

/* -------------------------------------------------------------------------- */
/*  Instanced windows, glows and petals                                       */
/* -------------------------------------------------------------------------- */

function createWindowLayer(materials, shared = null) {
  const litMaterial =
    shared?.litMaterial ??
    new THREE.MeshBasicMaterial({
      map: makeWindowTexture(true),
      transparent: true,
      opacity: 0.96,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: true,
    });
  const darkMaterial =
    shared?.darkMaterial ??
    new THREE.MeshStandardMaterial({
      map: makeWindowTexture(false),
      roughness: 0.22,
      metalness: 0.5,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
    });

  const lit = [];
  const dark = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  function add(x, y, z, width, height, rotationY, isLit, tint = 0xffd9a0) {
    euler.set(0, rotationY, 0);
    quaternion.setFromEuler(euler);
    position.set(x, y, z);
    scale.set(width, height, 1);
    matrix.compose(position, quaternion, scale);
    if (isLit) {
      lit.push({ matrix: matrix.clone(), color: new THREE.Color(tint) });
    } else {
      dark.push({ matrix: matrix.clone() });
    }
  }

  function finish(group, { register = true } = {}) {
    if (lit.length) {
      const mesh = new THREE.InstancedMesh(UNIT_PLANE.clone(), litMaterial, lit.length);
      mesh.name = "TokyoLitWindows";
      lit.forEach((item, i) => {
        mesh.setMatrixAt(i, item.matrix);
        mesh.setColorAt(i, item.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      group.add(mesh);
      if (register) materials.litWindows = mesh;
    }
    if (dark.length) {
      const mesh = new THREE.InstancedMesh(UNIT_PLANE.clone(), darkMaterial, dark.length);
      mesh.name = "TokyoDarkWindows";
      dark.forEach((item, i) => mesh.setMatrixAt(i, item.matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      group.add(mesh);
      if (register) materials.darkWindows = mesh;
    }
    if (register) {
      materials.litWindowMaterial = litMaterial;
      materials.darkWindowMaterial = darkMaterial;
    }
  }

  return { add, finish, litMaterial, darkMaterial };
}

function createGlowLayer(group, shared = null) {
  const vertical = [];
  const ground = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  function addVertical(x, y, z, width, height, rotationY, tint, intensity = 1) {
    euler.set(0, rotationY, 0);
    quaternion.setFromEuler(euler);
    position.set(x, y, z);
    scale.set(width, height, 1);
    matrix.compose(position, quaternion, scale);
    vertical.push({ matrix: matrix.clone(), color: new THREE.Color(tint), intensity });
  }

  function addGround(x, z, width, depth, tint, intensity = 1, rotation = 0, y = 0.045) {
    euler.set(-Math.PI / 2, 0, rotation);
    quaternion.setFromEuler(euler);
    position.set(x, y, z);
    scale.set(width, depth, 1);
    matrix.compose(position, quaternion, scale);
    ground.push({ matrix: matrix.clone(), color: new THREE.Color(tint), intensity });
  }

  const verticalMaterial =
    shared?.verticalMaterial ??
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      fog: true,
    });
  const groundMaterial =
    shared?.groundMaterial ??
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      fog: true,
    });

  function build(list, material, name) {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(UNIT_PLANE.clone(), material, list.length);
    mesh.name = name;
    list.forEach((item, i) => {
      mesh.setMatrixAt(i, item.matrix);
      const c = item.color.clone().multiplyScalar(item.intensity);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    group.add(mesh);
    return mesh;
  }

  let verticalMesh = null;
  let groundMesh = null;

  return {
    addVertical,
    addGround,
    get verticalMesh() {
      return verticalMesh;
    },
    get groundMesh() {
      return groundMesh;
    },
    verticalMaterial,
    groundMaterial,
    finish() {
      verticalMesh = build(vertical, verticalMaterial, "TokyoSignGlow");
      groundMesh = build(ground, groundMaterial, "TokyoGroundGlow");
    },
  };
}

function createPetals(count = 420) {
  const rand = seeded(77123);
  const geometry = new THREE.PlaneGeometry(0.16, 0.24);
  const material = new THREE.MeshBasicMaterial({
    map: makePetalTexture(),
    transparent: true,
    alphaTest: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "TokyoPetals";
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const petals = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  function spawn(petal, initial = false) {
    // Most petals live around the sakura pond, a few drift over the avenue.
    const nearSakura = rand() < 0.72;
    if (nearSakura) {
      petal.x = 44 + rand() * 52;
      petal.z = 12 + rand() * 42;
    } else {
      petal.x = -60 + rand() * 130;
      petal.z = -12 + rand() * 24;
    }
    petal.y = initial ? 0.4 + rand() * 9 : 6 + rand() * 7;
    petal.vx = -0.18 - rand() * 0.34;
    petal.vz = 0.1 + rand() * 0.28;
    petal.vy = -0.22 - rand() * 0.3;
    petal.spin = rand() * TAU;
    petal.spinSpeed = (rand() - 0.5) * 2.2;
    petal.sway = 0.4 + rand() * 1.3;
    petal.phase = rand() * TAU;
    petal.size = 0.6 + rand() * 0.8;
  }

  for (let i = 0; i < count; i++) {
    const petal = {};
    spawn(petal, true);
    petals.push(petal);
  }

  function update(dt, elapsed) {
    for (let i = 0; i < count; i++) {
      const petal = petals[i];
      petal.phase += dt * petal.sway;
      petal.x += (petal.vx + Math.sin(petal.phase) * 0.16) * dt;
      petal.z += petal.vz * dt;
      petal.y += petal.vy * dt;
      petal.spin += petal.spinSpeed * dt;
      if (petal.y < 0.1 || petal.x < -80 || petal.x > 120 || petal.z > 62) {
        spawn(petal);
      }
      euler.set(petal.spin * 0.8, petal.spin, petal.spin * 0.4);
      quaternion.setFromEuler(euler);
      position.set(petal.x, petal.y, petal.z);
      scale.setScalar(petal.size);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(0.016, 0);
  return { mesh, update, material, petals };
}

/* -------------------------------------------------------------------------- */
/*  Signage                                                                   */
/* -------------------------------------------------------------------------- */

function createSignMaterials(materials) {
  const signs = SIGN_LIBRARY.map((sign, index) => {
    const map = makeSignTexture(sign, index);
    const material = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: 0xffffff,
      emissiveIntensity: 1.05,
      roughness: 0.52,
      metalness: 0.04,
      side: THREE.DoubleSide,
      envMapIntensity: 0.25,
    });
    materials[`sign${index}`] = material;
    return { ...sign, map, material };
  });

  const billboards = BILLBOARD_LIBRARY.map((item, index) => {
    const map = makeBillboardTexture(item, index);
    const material = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: 0xffffff,
      emissiveIntensity: 1.15,
      roughness: 0.5,
      metalness: 0.05,
      side: THREE.DoubleSide,
      envMapIntensity: 0.3,
    });
    materials[`billboard${index}`] = material;
    return { ...item, map, material };
  });

  const shopMap = makeShopTexture();
  const shopMaterial = new THREE.MeshStandardMaterial({
    map: shopMap,
    emissiveMap: shopMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    roughness: 0.42,
    metalness: 0.08,
    envMapIntensity: 0.5,
  });
  materials.shopFront = shopMaterial;

  const vendingMap = makeVendingTexture();
  const vendingMaterial = new THREE.MeshStandardMaterial({
    map: vendingMap,
    emissiveMap: vendingMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.9,
    roughness: 0.4,
    metalness: 0.08,
    envMapIntensity: 0.4,
  });
  materials.vendingFront = vendingMaterial;

  const stationMap = makeStationSignTexture();
  const stationMaterial = new THREE.MeshStandardMaterial({
    map: stationMap,
    emissiveMap: stationMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    roughness: 0.45,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });
  materials.stationSign = stationMaterial;

  const ramenMap = makeRamenSignTexture();
  const ramenMaterial = new THREE.MeshStandardMaterial({
    map: ramenMap,
    emissiveMap: ramenMap,
    emissive: 0xffffff,
    emissiveIntensity: 1.2,
    roughness: 0.5,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  materials.ramenSign = ramenMaterial;

  const konbiniMap = makeKonbiniSignTexture();
  const konbiniMaterial = new THREE.MeshStandardMaterial({
    map: konbiniMap,
    emissiveMap: konbiniMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.85,
    roughness: 0.46,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  materials.konbiniSign = konbiniMaterial;

  const norenTextures = ["らーめん", "居酒屋", "お茶", "さくら", "食堂"].map((text) =>
    makeNorenTexture(text)
  );
  const norenMaterials = norenTextures.map(
    (map) =>
      new THREE.MeshStandardMaterial({
        map,
        roughness: 0.85,
        metalness: 0.0,
        side: THREE.DoubleSide,
        envMapIntensity: 0.2,
      })
  );

  materials.signMaterialFor = (text) => {
    const index = SIGN_LIBRARY.findIndex((sign) => sign.text === text);
    return materials[`sign${index >= 0 ? index : 0}`];
  };

  return {
    signs,
    billboards,
    shopMaterial,
    vendingMaterial,
    stationMaterial,
    ramenMaterial,
    konbiniMaterial,
    norenMaterials,
  };
}

function facadeFrame(x, z, w, d, normal) {
  const right = new THREE.Vector3(normal.z, 0, -normal.x);
  const rotationY = Math.atan2(normal.x, normal.z);
  const faceOffset = d * 0.5;
  return {
    right,
    rotationY,
    faceOffset,
    place(u, y, offset = 0) {
      return {
        x: x + right.x * u + normal.x * (faceOffset + offset),
        y,
        z: z + right.z * u + normal.z * (faceOffset + offset),
      };
    },
  };
}

function addSignPlane(
  builder,
  glow,
  signMaterials,
  index,
  x,
  y,
  z,
  width,
  height,
  rotationY,
  normal,
  { ground = true, glowScale = 1 } = {}
) {
  const sign = signMaterials[index % signMaterials.length];
  builder.plane(`sign${index % signMaterials.length}`, width, height, x, y, z, {
    ry: rotationY,
  });
  glow.addVertical(
    x - normal.x * 0.02,
    y,
    z - normal.z * 0.02,
    width * 1.7 * glowScale,
    height * 1.55 * glowScale,
    rotationY,
    sign.fg,
    0.5
  );
  if (ground) {
    glow.addGround(
      x + normal.x * 3.2,
      z + normal.z * 3.2,
      Math.max(2.2, width * 1.4),
      Math.max(2.6, width * 1.8),
      sign.fg,
      0.32
    );
  }
  return sign;
}

function addLantern(group, materials, x, y, z, { color = 0xff7a22, scale = 1 } = {}) {
  const lantern = new THREE.Group();
  lantern.position.set(x, y, z);
  lantern.scale.setScalar(scale);
  const bodyMaterial = materials.lantern.clone();
  bodyMaterial.emissive = new THREE.Color(color);
  bodyMaterial.color = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.25);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.48, 10),
    bodyMaterial
  );
  body.castShadow = false;
  lantern.add(body);
  const capMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a120a,
    roughness: 0.7,
    metalness: 0.2,
  });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10), capMaterial);
  top.position.y = 0.26;
  const bottom = top.clone();
  bottom.position.y = -0.26;
  lantern.add(top, bottom);
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4),
    capMaterial
  );
  cord.position.y = 0.43;
  lantern.add(cord);

  const spriteMaterial = new THREE.SpriteMaterial({
    map: materials.glowTexture,
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: true,
  });
  const glowSprite = new THREE.Sprite(spriteMaterial);
  glowSprite.scale.setScalar(2.1);
  lantern.add(glowSprite);
  group.add(lantern);
  return lantern;
}

/* -------------------------------------------------------------------------- */
/*  Roof geometry                                                             */
/* -------------------------------------------------------------------------- */

function gableRoofGeometry(width, depth, rise, overhang = 0.55) {
  const w = width * 0.5 + overhang;
  const d = depth * 0.5 + overhang;
  const positions = [
    -w, 0, d, w, 0, d, w, rise, 0, -w, rise, 0,
    w, 0, -d, -w, 0, -d, -w, rise, 0, w, rise, 0,
    -w, 0, -d, -w, 0, d, -w, rise, 0,
    w, 0, d, w, 0, -d, w, rise, 0,
  ];
  const uvs = [
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 0.5, 1,
    0, 0, 1, 0, 0.5, 1,
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10,
    11, 12, 13,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/* -------------------------------------------------------------------------- */
/*  Buildings                                                                 */
/* -------------------------------------------------------------------------- */

function wallKeyFor(rand, district) {
  if (district === "neon") {
    return pick(rand, ["concreteCool", "concreteDark", "cream", "tile", "brick"]);
  }
  if (district === "traditional") {
    return pick(rand, ["wood", "cream", "tile", "concreteWarm"]);
  }
  if (district === "sakura") {
    return pick(rand, ["cream", "concreteWarm", "tile", "white"]);
  }
  if (district === "residential") {
    return pick(rand, ["cream", "concreteWarm", "white", "tile", "brick"]);
  }
  return pick(rand, ["concrete", "concreteCool", "tile", "cream"]);
}

function addRooftop(builder, rand, x, z, sizeX, sizeZ, height, normal) {
  const rail = 0.9;
  builder.box("concreteDark", sizeX + 0.18, 0.26, sizeZ + 0.18, x, height + 0.13, z);
  const railHeight = 0.65;
  builder.box("darkMetal", sizeX, railHeight, 0.08, x, height + railHeight * 0.5, z - sizeZ * 0.5);
  builder.box("darkMetal", sizeX, railHeight, 0.08, x, height + railHeight * 0.5, z + sizeZ * 0.5);
  builder.box("darkMetal", 0.08, railHeight, sizeZ, x - sizeX * 0.5, height + railHeight * 0.5, z);
  builder.box("darkMetal", 0.08, railHeight, sizeZ, x + sizeX * 0.5, height + railHeight * 0.5, z);

  if (rand() < 0.58) {
    const tankX = x + (rand() - 0.5) * sizeX * 0.42;
    const tankZ = z + (rand() - 0.5) * sizeZ * 0.42;
    builder.cylinder("metal", 0.72, 0.72, 1.45, 12, tankX, height + 0.95, tankZ);
    builder.box("darkMetal", 1.7, 0.1, 1.7, tankX, height + 0.25, tankZ);
  }
  const acCount = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < acCount; i++) {
    const ax = x + (rand() - 0.5) * sizeX * 0.68;
    const az = z + (rand() - 0.5) * sizeZ * 0.6;
    builder.box("metal", 0.9, 0.62, 0.62, ax, height + 0.42, az);
    builder.box("darkMetal", 0.74, 0.5, 0.04, ax, height + 0.42, az + 0.33);
  }
  if (rand() < 0.52) {
    const antennaX = x + (rand() - 0.5) * sizeX * 0.6;
    const antennaZ = z + (rand() - 0.5) * sizeZ * 0.6;
    builder.cylinder("darkMetal", 0.025, 0.04, 2.8 + rand() * 2.4, 5, antennaX, height + 1.8, antennaZ);
    builder.box("darkMetal", 0.9, 0.04, 0.04, antennaX, height + 2.4, antennaZ);
    builder.box("darkMetal", 0.04, 0.04, 0.9, antennaX, height + 2.9, antennaZ);
  }
  if (rand() < 0.32) {
    builder.box("concreteDark", 1.4, 0.9, 1.1, x - sizeX * 0.24, height + 0.58, z + sizeZ * 0.2);
  }
}

function buildModern(ctx, options) {
  const {
    builder,
    windows,
    glow,
    blockers,
    rand,
    signMaterials,
    billboards,
  } = ctx;
  const { x, z, w, d, h, normal, district } = options;

  const sizeX = normal.x !== 0 ? d : w;
  const sizeZ = normal.z !== 0 ? d : w;
  const frame = facadeFrame(x, z, w, d, normal);
  const { rotationY, place } = frame;
  const wallKey = wallKeyFor(rand, district);

  builder.box(wallKey, sizeX, h, sizeZ, x, h * 0.5, z);
  builder.box("concreteDark", sizeX + 0.2, 0.36, sizeZ + 0.2, x, 0.18, z);
  blockers.push({
    minX: x - sizeX * 0.5,
    maxX: x + sizeX * 0.5,
    minZ: z - sizeZ * 0.5,
    maxZ: z + sizeZ * 0.5,
  });

  const floors = Math.max(2, Math.floor(h / 3.25));
  const litChance = district === "neon" ? 0.68 : 0.54;
  const tintList = [0xffd39a, 0xffd39a, 0xbfe8ff, 0xffb4d8, 0xd8ffe0];
  const cols = Math.max(2, Math.floor(w / 2.05));
  const spacing = w / cols;

  for (let floor = 1; floor < floors; floor++) {
    const y = floor * 3.12 + 0.62;
    for (let col = 0; col < cols; col++) {
      const u = -w * 0.5 + spacing * (col + 0.5);
      const point = place(u, y, 0.035);
      const lit = rand() < litChance;
      windows.add(
        point.x,
        point.y,
        point.z,
        1.05,
        1.32,
        rotationY,
        lit,
        pick(rand, tintList)
      );
    }
  }

  // A few side windows make the corners read as real volumes from the cross
  // street instead of flat cardboard cut-outs.
  if (Math.abs(normal.z) > 0.5 && w > 8) {
    const sideNormal = new THREE.Vector3(rand() > 0.5 ? 1 : -1, 0, 0);
    const sideFrame = facadeFrame(x, z, d, w, sideNormal);
    for (let floor = 1; floor < floors; floor += 2) {
      const y = floor * 3.12 + 0.62;
      for (let col = 0; col < 2; col++) {
        const point = sideFrame.place((col - 0.5) * d * 0.45, y, 0.035);
        windows.add(
          point.x,
          point.y,
          point.z,
          1.0,
          1.28,
          sideFrame.rotationY,
          rand() < litChance,
          pick(rand, tintList)
        );
      }
    }
  }

  // Ground-floor shop. Tall blocks keep a lit shop at street level; a handful
  // are plain lobbies with a darker glass entrance.
  const hasShop = district !== "residential" && rand() < 0.78;
  if (hasShop) {
    const shopWidth = w * 0.82;
    const point = place(0, 1.5, 0.06);
    builder.plane("shopFront", shopWidth, 2.45, point.x, point.y, point.z, {
      ry: rotationY,
    });
    builder.box("darkMetal", shopWidth + 0.28, 0.13, 0.18, point.x, 2.8, point.z, {
      ry: rotationY,
    });
    builder.box("darkMetal", shopWidth + 0.28, 0.1, 0.18, point.x, 0.22, point.z, {
      ry: rotationY,
    });
    const mullions = Math.max(2, Math.round(shopWidth / 1.8));
    for (let i = 0; i <= mullions; i++) {
      const u = -shopWidth * 0.5 + (shopWidth / mullions) * i;
      const m = place(u, 1.5, 0.08);
      builder.box("darkMetal", 0.07, 2.35, 0.08, m.x, m.y, m.z, { ry: rotationY });
    }
    const awning = place(0, 2.98, 0.62);
    builder.box("darkMetal", shopWidth + 0.5, 0.1, 1.25, awning.x, awning.y, awning.z, {
      ry: rotationY,
    });
    const signIndex = Math.floor(rand() * signMaterials.length);
    const signPoint = place(0, 3.62, 0.16);
    addSignPlane(
      builder,
      glow,
      signMaterials,
      signIndex,
      signPoint.x,
      signPoint.y,
      signPoint.z,
      Math.min(4.4, shopWidth * 0.62),
      1.0,
      rotationY,
      normal
    );
  } else {
    const point = place(0, 1.65, 0.06);
    builder.plane("glass", Math.min(2.2, w * 0.4), 2.4, point.x, point.y, point.z, {
      ry: rotationY,
    });
    builder.box("concreteDark", 2.7, 0.18, 0.24, point.x, 3.0, point.z, { ry: rotationY });
  }

  // Vertical signboard near the corner. Neon blocks get one almost every time;
  // quieter districts only occasionally.
  const signChance = district === "neon" ? 0.86 : district === "train" ? 0.52 : 0.28;
  if (h > 9 && rand() < signChance) {
    const signWidth = 1.05;
    const signHeight = Math.min(5.2, Math.max(2.4, h * 0.42));
    const u = w * 0.5 - signWidth * 0.7;
    const point = place(u, Math.min(h - 1.5, 4.2 + signHeight * 0.5), 0.2);
    const index = Math.floor(rand() * signMaterials.length);
    addSignPlane(
      builder,
      glow,
      signMaterials,
      index,
      point.x,
      point.y,
      point.z,
      signWidth,
      signHeight,
      rotationY,
      normal,
      { glowScale: 1.2 }
    );
  }

  // Large animated-looking billboards on the tall neon blocks.
  if (h > 18 && district === "neon" && rand() < 0.7) {
    const billboard = billboards[Math.floor(rand() * billboards.length)];
    const billboardWidth = Math.min(8.4, w * 0.82);
    const billboardHeight = billboardWidth * 0.5;
    const point = place(0, h * 0.7, 0.28);
    builder.plane(
      `billboard${billboards.indexOf(billboard)}`,
      billboardWidth,
      billboardHeight,
      point.x,
      point.y,
      point.z,
      { ry: rotationY }
    );
    builder.box("darkMetal", billboardWidth + 0.3, billboardHeight + 0.3, 0.2, point.x, point.y, point.z, {
      ry: rotationY,
    });
    glow.addVertical(
      point.x - normal.x * 0.03,
      point.y,
      point.z - normal.z * 0.03,
      billboardWidth * 1.6,
      billboardHeight * 1.5,
      rotationY,
      billboard.accent,
      0.62
    );
  }

  // Balconies on the quieter half of the city. The slabs and rails are cheap
  // merged boxes, but they break up the facade at eye level.
  if (district !== "neon" && h > 10 && rand() < 0.6) {
    for (let floor = 2; floor < floors; floor += 2) {
      const y = floor * 3.12;
      const slab = place(0, y, 0.48);
      builder.box("concreteDark", w * 0.72, 0.12, 0.92, slab.x, slab.y, slab.z, {
        ry: rotationY,
      });
      const rail = place(0, y + 0.55, 0.9);
      builder.box("darkMetal", w * 0.72, 0.06, 0.05, rail.x, rail.y, rail.z, {
        ry: rotationY,
      });
      builder.box("darkMetal", w * 0.72, 0.05, 0.05, rail.x, y + 0.95, rail.z, {
        ry: rotationY,
      });
      for (let i = 0; i < 4; i++) {
        const u = (i - 1.5) * w * 0.18;
        const post = place(u, y + 0.56, 0.9);
        builder.box("darkMetal", 0.04, 0.72, 0.04, post.x, post.y, post.z);
      }
      if (rand() < 0.6) {
        const ac = place(w * 0.28, y + 0.34, 0.6);
        builder.box("metal", 0.62, 0.46, 0.36, ac.x, ac.y, ac.z, { ry: rotationY });
      }
    }
  }

  addRooftop(builder, rand, x, z, sizeX, sizeZ, h, normal);
  return { wallKey, sizeX, sizeZ };
}

function buildMachiya(ctx, options) {
  const { builder, windows, glow, blockers, rand, signMaterials, norenMaterials, group, lanterns } = ctx;
  const { x, z, w, d, h, normal } = options;
  const sizeX = normal.x !== 0 ? d : w;
  const sizeZ = normal.z !== 0 ? d : w;
  const frame = facadeFrame(x, z, w, d, normal);
  const { rotationY, place } = frame;

  builder.box("wood", sizeX, h, sizeZ, x, h * 0.5, z);
  builder.box("stone", sizeX + 0.16, 0.32, sizeZ + 0.16, x, 0.16, z);
  blockers.push({
    minX: x - sizeX * 0.5,
    maxX: x + sizeX * 0.5,
    minZ: z - sizeZ * 0.5,
    maxZ: z + sizeZ * 0.5,
  });

  // Tiled gable roof, ridge parallel to the shopfront.
  const roofGeometry = gableRoofGeometry(w, d, 1.25, 0.62);
  builder.addGeometry("roofDark", roofGeometry, x, h, z, {
    ry: Math.abs(normal.z) > 0.5 ? 0 : Math.PI / 2,
  });
  builder.box("darkWood", sizeX + 1.1, 0.14, 0.18, x, h + 0.02, z - sizeZ * 0.5 - 0.55);
  builder.box("darkWood", sizeX + 1.1, 0.14, 0.18, x, h + 0.02, z + sizeZ * 0.5 + 0.55);

  // Lattice front. Vertical slats and two horizontal rails, with a lit paper
  // panel behind them.
  const paper = place(0, 1.55, 0.045);
  builder.plane("paper", w * 0.66, 1.9, paper.x, paper.y, paper.z, { ry: rotationY });
  const slats = Math.max(6, Math.round(w * 1.5));
  for (let i = 0; i <= slats; i++) {
    const u = -w * 0.33 + (w * 0.66 / slats) * i;
    const point = place(u, 1.55, 0.11);
    builder.box("darkWood", 0.045, 2.05, 0.06, point.x, point.y, point.z, {
      ry: rotationY,
    });
  }
  const beam = place(0, 2.52, 0.12);
  builder.box("darkWood", w * 0.72, 0.08, 0.08, beam.x, beam.y, beam.z, { ry: rotationY });
  const beam2 = place(0, 0.58, 0.12);
  builder.box("darkWood", w * 0.72, 0.08, 0.08, beam2.x, beam2.y, beam2.z, { ry: rotationY });

  // Second-floor paper windows.
  const upper = place(0, h - 1.15, 0.05);
  builder.plane("paper", w * 0.58, 1.0, upper.x, upper.y, upper.z, { ry: rotationY });
  for (let i = 0; i < 4; i++) {
    const u = (i - 1.5) * w * 0.14;
    const post = place(u, h - 1.15, 0.11);
    builder.box("darkWood", 0.05, 1.08, 0.05, post.x, post.y, post.z);
  }

  // Door and noren.
  const door = place(w * 0.28, 1.05, 0.08);
  builder.box("darkWood", 1.1, 2.05, 0.1, door.x, door.y, door.z, { ry: rotationY });
  if (rand() < 0.72) {
    const material = norenMaterials[Math.floor(rand() * norenMaterials.length)];
    const geometry = new THREE.PlaneGeometry(1.35, 0.78);
    geometry.translate(0, -0.39, 0);
    const mesh = new THREE.Mesh(geometry, material);
    const top = place(w * 0.28, 2.35, 0.2);
    mesh.position.set(top.x, top.y, top.z);
    mesh.rotation.y = rotationY;
    mesh.userData.baseRotation = 0;
    mesh.userData.phase = rand() * TAU;
    group.add(mesh);
    ctx.norenMeshes.push(mesh);
  }

  // Hanging lanterns at the eaves.
  for (const side of [-1, 1]) {
    const point = place(side * (w * 0.33), 2.7, 0.48);
    const lantern = addLantern(group, { ...ctx, lantern: ctx.lanternMaterial }, point.x, point.y, point.z, {
      color: side > 0 ? 0xff7a22 : 0xffc36a,
      scale: 0.9,
    });
    lanterns.push({ group: lantern, phase: rand() * TAU, base: lantern.rotation.z });
  }

  // Shop sign above the door.
  const signPoint = place(0, h + 0.55, 0.3);
  const signIndex = Math.floor(rand() * signMaterials.length);
  addSignPlane(
    builder,
    glow,
    signMaterials,
    signIndex,
    signPoint.x,
    signPoint.y,
    signPoint.z,
    Math.min(3.4, w * 0.55),
    0.78,
    rotationY,
    normal,
    { ground: true, glowScale: 0.8 }
  );

  // Low stone step and a few potted plants.
  const step = place(0, 0.16, 0.55);
  builder.box("stone", w * 0.82, 0.32, 0.7, step.x, step.y, step.z, { ry: rotationY });
  for (let i = 0; i < 2; i++) {
    const pot = place((rand() > 0.5 ? 1 : -1) * w * 0.42, 0.4, 0.8);
    builder.cylinder("rust", 0.18, 0.22, 0.38, 8, pot.x, pot.y, pot.z);
    builder.sphere("leaf", 0.26, 5, 4, pot.x, pot.y + 0.42, pot.z);
  }
  return { sizeX, sizeZ };
}

function buildHouse(ctx, options) {
  const { builder, windows, glow, blockers, rand, group, lanterns } = ctx;
  const { x, z, w, d, h, normal, frontWall = true } = options;
  const sizeX = normal.x !== 0 ? d : w;
  const sizeZ = normal.z !== 0 ? d : w;
  const frame = facadeFrame(x, z, w, d, normal);
  const { rotationY, place } = frame;
  const wall = pick(rand, ["cream", "concreteWarm", "white", "tile", "concrete"]);

  builder.box(wall, sizeX, h, sizeZ, x, h * 0.5, z);
  builder.box("stone", sizeX + 0.14, 0.26, sizeZ + 0.14, x, 0.13, z);
  blockers.push({
    minX: x - sizeX * 0.5,
    maxX: x + sizeX * 0.5,
    minZ: z - sizeZ * 0.5,
    maxZ: z + sizeZ * 0.5,
  });

  const roof = gableRoofGeometry(w, d, 1.0, 0.55);
  builder.addGeometry("roof", roof, x, h, z, {
    ry: Math.abs(normal.z) > 0.5 ? 0 : Math.PI / 2,
  });

  const floors = h > 6 ? 2 : 1;
  for (let floor = 0; floor < floors; floor++) {
    const y = 1.65 + floor * 2.75;
    for (let i = 0; i < 2; i++) {
      const u = (i - 0.5) * w * 0.42;
      const point = place(u, y, 0.035);
      windows.add(point.x, point.y, point.z, 1.0, 1.2, rotationY, rand() < 0.4, 0xffd39a);
    }
  }

  const door = place(w * 0.28, 1.05, 0.08);
  builder.box("darkWood", 1.0, 2.0, 0.1, door.x, door.y, door.z, { ry: rotationY });
  builder.box("darkWood", 1.3, 0.1, 0.7, door.x, 2.12, door.z, { ry: rotationY });

  if (h > 6) {
    const slab = place(0, 3.4, 0.42);
    builder.box("concreteDark", w * 0.62, 0.1, 0.8, slab.x, slab.y, slab.z, { ry: rotationY });
    builder.box("darkMetal", w * 0.62, 0.05, 0.05, slab.x, 3.95, slab.z, { ry: rotationY });
    for (let i = 0; i < 3; i++) {
      const u = (i - 1) * w * 0.18;
      const post = place(u, 3.62, 0.8);
      builder.box("darkMetal", 0.035, 0.65, 0.035, post.x, post.y, post.z);
    }
    const ac = place(-w * 0.28, 0.62, 0.42);
    builder.box("metal", 0.66, 0.5, 0.38, ac.x, ac.y, ac.z, { ry: rotationY });
  }

  // A low front wall and gate make the little plots feel residential.
  if (frontWall) {
    const wallPoint = place(0, 0.42, 1.45);
    builder.box("concreteWarm", w * 0.9, 0.7, 0.16, wallPoint.x, wallPoint.y, wallPoint.z, {
      ry: rotationY,
    });
    const gate = place(w * 0.24, 0.42, 1.45);
    builder.box("darkMetal", 0.08, 0.9, 0.12, gate.x - 0.45, 0.45, gate.z);
    builder.box("darkMetal", 0.08, 0.9, 0.12, gate.x + 0.45, 0.45, gate.z);
  }

  if (rand() < 0.5) {
    const point = place(w * 0.38, 2.15, 0.15);
    const lantern = addLantern(group, { ...ctx, lantern: ctx.lanternMaterial }, point.x, point.y, point.z, {
      color: 0xffc36a,
      scale: 0.7,
    });
    lanterns.push({ group: lantern, phase: rand() * TAU, base: 0 });
  }
  return { sizeX, sizeZ };
}

/* -------------------------------------------------------------------------- */
/*  Roads and ground                                                          */
/* -------------------------------------------------------------------------- */

function addFlatPlane(group, material, width, depth, x, z, y = 0.01, rotation = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rotation;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  group.add(mesh);
  return mesh;
}

function createGround(builder, group, materials, rand) {
  // A wide, dark base keeps the horizon from showing the clear colour through
  // gaps between blocks.
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      roughness: 0.9,
      metalness: 0.05,
      envMapIntensity: 0.2,
    })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.08;
  base.receiveShadow = true;
  group.add(base);

  addFlatPlane(group, materials.asphalt, 352, 18, 0, 0, 0.012);
  addFlatPlane(group, materials.asphaltSide, 14, 208, 0, 0, 0.014);

  for (const lane of SIDE_LANES) {
    const material = lane.kind === "stone" ? materials.stone : lane.kind === "alley" ? materials.alley : materials.asphaltSide;
    const depth = Math.abs(lane.z1 - lane.z0);
    addFlatPlane(
      group,
      material,
      lane.half * 2,
      depth,
      lane.x,
      (lane.z0 + lane.z1) * 0.5,
      0.016
    );
  }

  // Pavements. The intersection is left open so the cross street reads as a
  // real junction rather than a raised slab across the road.
  for (const side of [-1, 1]) {
    const z = side * 11;
    for (const [x0, x1] of [
      [-176, -7.2],
      [7.2, 176],
    ]) {
      addFlatPlane(group, materials.sidewalk, x1 - x0, 4, (x0 + x1) * 0.5, z, 0.085);
    }
    // Cross-street pavements.
    for (const [z0, z1] of [
      [13, 104],
      [-104, -13],
    ]) {
      addFlatPlane(group, materials.sidewalkCross, 4, z1 - z0, side * 9, (z0 + z1) * 0.5, 0.085);
    }
  }

  // Curbs.
  for (const side of [-1, 1]) {
    for (const [x0, x1] of [
      [-176, -7.2],
      [7.2, 176],
    ]) {
      builder.box("curb", x1 - x0, 0.16, 0.22, (x0 + x1) * 0.5, 0.08, side * 9.05);
    }
    for (const [z0, z1] of [
      [13, 104],
      [-104, -13],
    ]) {
      builder.box("curb", 0.22, 0.16, z1 - z0, side * 7.05, 0.08, (z0 + z1) * 0.5);
    }
  }

  // Centre double-yellow, broken at the junction.
  for (const side of [-1, 1]) {
    for (const [x0, x1] of [
      [-176, -8],
      [8, 176],
    ]) {
      addFlatPlane(group, materials.paintYellow, x1 - x0, 0.1, (x0 + x1) * 0.5, side * 0.19, 0.035);
    }
  }

  // Lane dashes. Instanced planes keep the marking pass cheap.
  const dashGeometry = new THREE.PlaneGeometry(3.6, 0.11);
  const dashMaterial = materials.paintWhite;
  const dashPositions = [];
  for (const z of [-4.5, 4.5]) {
    for (let x = -172; x < 176; x += 8) {
      if (Math.abs(x) < 10) continue;
      dashPositions.push({ x, z });
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashPositions.length);
  dashes.name = "TokyoLaneDashes";
  const dashMatrix = new THREE.Matrix4();
  const dashQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  dashPositions.forEach((item, i) => {
    dashMatrix.compose(
      new THREE.Vector3(item.x, 0.034, item.z),
      dashQuat,
      new THREE.Vector3(1, 1, 1)
    );
    dashes.setMatrixAt(i, dashMatrix);
  });
  dashes.instanceMatrix.needsUpdate = true;
  dashes.receiveShadow = true;
  dashes.castShadow = false;
  group.add(dashes);

  // Edge lines.
  for (const side of [-1, 1]) {
    for (const [x0, x1] of [
      [-176, -7],
      [7, 176],
    ]) {
      addFlatPlane(group, materials.paintWhite, x1 - x0, 0.1, (x0 + x1) * 0.5, side * 8.55, 0.033);
    }
  }

  // Zebra crossings across the avenue at the junction and across the side
  // street on both approaches.
  for (let i = -5; i <= 5; i++) {
    addFlatPlane(group, materials.paintWhite, 0.55, 17.4, i * 1.15, 0, 0.038);
  }
  for (const side of [-1, 1]) {
    for (let i = -4; i <= 4; i++) {
      addFlatPlane(group, materials.paintWhite, 12.4, 0.5, 0, side * (9.5 + i * 1.05), 0.039);
    }
  }

  // Cross-street lane lines.
  for (const side of [-1, 1]) {
    for (let z = 18; z < 102; z += 8) {
      addFlatPlane(group, materials.paintWhite, 0.1, 3.4, 0, side * z, 0.034);
    }
  }

  // Manhole covers, drains and a handful of puddles.
  const manholes = [
    [-24, 2.2],
    [31, -3.6],
    [-62, 4.1],
    [77, 1.8],
    [118, -4.4],
    [-118, 2.9],
    [48, 6.5],
    [-92, -5.2],
  ];
  for (const [x, z] of manholes) {
    builder.cylinder("darkMetal", 0.46, 0.46, 0.035, 16, x, 0.045, z);
    builder.cylinder("metal", 0.36, 0.36, 0.018, 16, x, 0.065, z);
  }

  const puddles = [
    [-46, 5.4, 3.2, 1.4],
    [-9, -6.2, 4.2, 1.8],
    [28, 6.1, 2.6, 1.1],
    [61, -2.2, 3.8, 1.5],
    [104, 4.6, 4.6, 1.9],
    [141, -5.2, 3.1, 1.3],
    [-84, -3.8, 3.4, 1.5],
    [-137, 5.0, 2.8, 1.2],
    [17, -9.6, 2.2, 1.0],
    [-33, 9.4, 2.0, 0.9],
  ];
  const puddleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0d1820,
    roughness: 0.03,
    metalness: 0.72,
    transparent: true,
    opacity: 0.7,
    envMapIntensity: 2.0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    depthWrite: false,
  });
  for (const [x, z, width, depth] of puddles) {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 24), puddleMaterial);
    puddle.rotation.x = -Math.PI / 2;
    puddle.scale.set(width, depth, 1);
    puddle.position.set(x, 0.03, z);
    puddle.renderOrder = 2;
    group.add(puddle);
  }
  materials.puddle = puddleMaterial;

  // A few asphalt repair patches break up the perfect plane.
  for (let i = 0; i < 18; i++) {
    const x = range(rand, -168, 168);
    const z = range(rand, -7.8, 7.8);
    addFlatPlane(
      group,
      new THREE.MeshStandardMaterial({
        color: 0x111318,
        roughness: 0.4,
        metalness: 0.28,
      }),
      range(rand, 1.4, 4.2),
      range(rand, 0.7, 2.0),
      x,
      z,
      0.028,
      range(rand, 0, Math.PI)
    );
  }

  return { puddleMaterial };
}

/* -------------------------------------------------------------------------- */
/*  City blocks                                                               */
/* -------------------------------------------------------------------------- */

function laneBlocksSide(x, width, side) {
  for (const lane of SIDE_LANES) {
    if (Math.sign(lane.z0) !== side) continue;
    if (
      x + width * 0.5 > lane.x - lane.half - 1.2 &&
      x - width * 0.5 < lane.x + lane.half + 1.2
    ) {
      return true;
    }
  }
  return false;
}

function createMainRows(ctx) {
  const { rand, builder, windows, glow, blockers } = ctx;
  for (const side of [-1, 1]) {
    let x = -172;
    while (x < 172) {
      const district =
        side > 0
          ? x < -68
            ? "traditional"
            : x > 112
              ? "train"
              : x > 62
                ? "sakura"
                : "neon"
          : x < -68
            ? "traditional"
            : x > 112
              ? "train"
              : x > 62
                ? "residential"
                : "neon";
      const width =
        district === "neon"
          ? range(rand, 9, 18)
          : district === "traditional" && side > 0
            ? range(rand, 7, 12)
            : range(rand, 7.5, 15);
      const gap = range(rand, 0.55, 2.0);
      const centerX = x + width * 0.5;
      if (centerX + width * 0.5 > -10 && centerX - width * 0.5 < 10) {
        x += width + gap;
        continue;
      }
      if (laneBlocksSide(centerX, width, side)) {
        x += width + gap;
        continue;
      }
      // Leave the park and the station forecourt open to the avenue. Without
      // these gaps the generated blocks would swallow both landmarks.
      if (
        side > 0 &&
        ((centerX > 50 && centerX < 86) || (centerX > 112 && centerX < 154))
      ) {
        x += width + gap;
        continue;
      }

      const depth = range(rand, 9, 17);
      const z = side * (13.7 + depth * 0.5 + range(rand, 0, 1.0));
      const normal = new THREE.Vector3(0, 0, side > 0 ? -1 : 1);
      let height;
      if (district === "traditional" && side > 0) {
        height = range(rand, 5.1, 7.0);
      } else if (district === "sakura") {
        height = range(rand, 7.0, 14.0);
      } else if (district === "residential") {
        height = range(rand, 5.4, 9.0);
      } else if (district === "train") {
        height = range(rand, 10, 26);
      } else if (district === "traditional") {
        height = range(rand, 7, 14);
      } else {
        height = range(rand, 14, 46);
        if (rand() < 0.12) height = range(rand, 46, 58);
      }

      if (district === "traditional" && side > 0) {
        buildMachiya(ctx, { x: centerX, z, w: width, d: depth, h: height, normal });
      } else if (
        (district === "residential" && rand() < 0.72) ||
        (district === "traditional" && side < 0 && rand() < 0.55)
      ) {
        buildHouse(ctx, { x: centerX, z, w: width, d: depth, h: height, normal });
      } else {
        buildModern(ctx, {
          x: centerX,
          z,
          w: width,
          d: depth,
          h: height,
          normal,
          district,
        });
      }
      x += width + gap;
    }
  }

  // Buildings lining the cross street. They face the junction, giving the
  // avenue a deep side view instead of a flat wall of backs.
  for (const side of [-1, 1]) {
    let z = 32;
    while (z < 96) {
      const width = range(rand, 7.5, 14);
      const depth = range(rand, 8, 15);
      const x = side * (13.8 + depth * 0.5 + range(rand, 0, 0.8));
      const normal = new THREE.Vector3(side > 0 ? -1 : 1, 0, 0);
      const height = z < 62 ? range(rand, 12, 34) : range(rand, 7, 16);
      buildModern(ctx, {
        x,
        z: z + width * 0.5,
        w: width,
        d: depth,
        h: height,
        normal,
        district: z < 62 ? "neon" : "residential",
      });
      z += width + range(rand, 0.6, 2.0);
    }
    let z2 = -32;
    while (z2 > -96) {
      const width = range(rand, 7.5, 14);
      const depth = range(rand, 8, 15);
      const x = side * (13.8 + depth * 0.5 + range(rand, 0, 0.8));
      const normal = new THREE.Vector3(side > 0 ? -1 : 1, 0, 0);
      const height = z2 > -62 ? range(rand, 11, 30) : range(rand, 6, 14);
      buildModern(ctx, {
        x,
        z: z2 - width * 0.5,
        w: width,
        d: depth,
        h: height,
        normal,
        district: z2 > -62 ? "neon" : "residential",
      });
      z2 -= width + range(rand, 0.6, 2.0);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Endless city                                                              */
/* -------------------------------------------------------------------------- */

function endlessSlotCenter(index) {
  const half = ENDLESS.chunkLength * 0.5;
  if (index >= 0) {
    return CITY.maxX + half + index * ENDLESS.chunkLength;
  }
  const step = -index - 1;
  return -CITY.maxX - half - step * ENDLESS.chunkLength;
}

function endlessSlotsNear(focusX) {
  const half = ENDLESS.chunkLength * 0.5;
  const reach = ENDLESS.viewDistance + half;
  const length = ENDLESS.chunkLength;
  const eastBase = CITY.maxX + half;
  const slots = [];
  const minEast = Math.max(0, Math.ceil((focusX - reach - eastBase) / length));
  const maxEast = Math.floor((focusX + reach - eastBase) / length);
  for (let i = minEast; i <= maxEast; i++) slots.push(i);
  const minWest = Math.max(0, Math.ceil((-focusX - reach - eastBase) / length));
  const maxWest = Math.floor((-focusX + reach - eastBase) / length);
  for (let i = minWest; i <= maxWest; i++) slots.push(-i - 1);
  return slots;
}

function addEndlessStreetLight(ctx, x, side) {
  const { builder, glow } = ctx;
  const z = side * 12.55;
  builder.cylinder("darkMetal", 0.09, 0.13, 6.6, 7, x, 3.3, z);
  builder.box("darkMetal", 1.75, 0.09, 0.09, x + (side > 0 ? -0.7 : 0.7), 6.45, z);
  const headX = x + (side > 0 ? -1.45 : 1.45);
  builder.box("darkMetal", 0.52, 0.16, 0.32, headX, 6.35, z);
  builder.box("streetLamp", 0.42, 0.06, 0.24, headX, 6.26, z);
  glow.addVertical(headX, 6.1, z, 2.8, 2.8, 0, 0xffe6b0, 0.34);
  glow.addGround(headX, z - side * 1.2, 3.2, 3.6, 0xffe6b0, 0.24, 0, 0.095);
}

function createEndlessCorridor(materials) {
  const group = new THREE.Group();
  group.name = "TokyoEndlessRoad";
  const length = ENDLESS.corridorLength;

  // The corridor sits a few millimetres below the authored core so the two
  // surfaces can overlap without z-fighting. Its textures repeat on the same
  // eight-metre grid as the dashes, which lets the whole strip snap forward
  // without the road appearing to slide under the car.
  const asphalt = new THREE.MeshStandardMaterial({
    color: 0x1c1f24,
    map: cloneTexture(materials.asphaltBase, length / 8, 3),
    roughness: materials.asphalt.roughness,
    metalness: materials.asphalt.metalness,
    envMapIntensity: materials.asphalt.envMapIntensity,
  });
  const sidewalk = new THREE.MeshStandardMaterial({
    color: 0xa7a49d,
    // The sidewalk is built per chunk, so the repeat is sized for a 96 m
    // block rather than the whole corridor.
    map: cloneTexture(materials.sidewalkBase, ENDLESS.chunkLength / 4.36, 1.2),
    roughness: materials.sidewalk.roughness,
    metalness: materials.sidewalk.metalness,
    envMapIntensity: materials.sidewalk.envMapIntensity,
  });
  materials.asphaltEndless = asphalt;
  materials.sidewalkEndless = sidewalk;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(length + 200, 520),
    new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      roughness: 0.9,
      metalness: 0.05,
      envMapIntensity: 0.2,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.09;
  ground.receiveShadow = true;
  group.add(ground);

  // Only the asphalt lives on the moving corridor. Pavements, kerbs and lane
  // markings are part of the recycled blocks, which begin outside the authored
  // core, so the junction is never crossed by a moving sidewalk.
  addFlatPlane(group, asphalt, length, 18, 0, 0, 0.008);

  return group;
}

function createEndlessChunk(ctx, variant) {
  const group = new THREE.Group();
  group.name = `TokyoEndlessBlock${variant}`;
  group.visible = false;

  const builder = createBuilder();
  const windows = createWindowLayer(ctx.materials, {
    litMaterial: ctx.coreWindows.litMaterial,
    darkMaterial: ctx.coreWindows.darkMaterial,
  });
  const glow = createGlowLayer(group, {
    verticalMaterial: ctx.coreGlow.verticalMaterial,
    groundMaterial: ctx.coreGlow.groundMaterial,
  });
  const rand = seeded(0x7a1e0000 + variant * 7919);
  const chunkCtx = {
    ...ctx,
    group,
    builder,
    windows,
    glow,
    blockers: [],
    rand,
    pois: [],
    pickables: [],
    trafficSignals: [],
  };
  const length = ENDLESS.chunkLength;
  const mood = variant % 4;

  // Pavement, kerb and markings are local to the block. Slots sit on a
  // multiple-of-eight grid, so the dashes line up with the core avenue and the
  // pavements meet edge-to-edge when two blocks are neighbours.
  for (const side of [-1, 1]) {
    builder.plane("sidewalkEndless", length, 4, 0, 0.08, side * 11, {
      rx: -Math.PI / 2,
    });
    builder.box("curb", length, 0.16, 0.22, 0, 0.08, side * 9.05);
    builder.plane("paintWhite", length, 0.1, 0, 0.033, side * 8.55, {
      rx: -Math.PI / 2,
    });
    builder.plane("paintYellow", length, 0.1, 0, 0.035, side * 0.19, {
      rx: -Math.PI / 2,
    });
  }
  for (const z of [-4.5, 4.5]) {
    // 4 mod 8 matches the authored dashes, which start at -172.
    for (let x = -length * 0.5 + 4; x < length * 0.5 - 2; x += 8) {
      builder.plane("paintWhite", 3.6, 0.11, x, 0.034, z, {
        rx: -Math.PI / 2,
      });
    }
  }

  for (const side of [-1, 1]) {
    let x = -length * 0.5 + 1;
    while (x < length * 0.5 - 5) {
      const width = range(rand, 7.5, 14);
      const gap = range(rand, 0.5, 1.8);
      if (x + width > length * 0.5 - 0.5) break;
      const centerX = x + width * 0.5;
      const depth = range(rand, 9, 16);
      const z = side * (13.7 + depth * 0.5 + range(rand, 0, 0.9));
      const normal = new THREE.Vector3(0, 0, side > 0 ? -1 : 1);

      let style;
      if (mood === 0) style = "neon";
      else if (mood === 1) style = "residential";
      else if (mood === 2) style = "traditional";
      else style = rand() < 0.5 ? "sakura" : "train";

      let height;
      if (style === "traditional") height = range(rand, 5.4, 9.5);
      else if (style === "residential") height = range(rand, 5.2, 9.0);
      else if (style === "sakura") height = range(rand, 7.0, 16.0);
      else if (style === "train") height = range(rand, 10, 26);
      else height = range(rand, 13, 42);

      if (style === "traditional" && side > 0) {
        buildMachiya(chunkCtx, { x: centerX, z, w: width, d: depth, h: height, normal });
      } else if (style === "residential" && rand() < 0.72) {
        buildHouse(chunkCtx, { x: centerX, z, w: width, d: depth, h: height, normal });
      } else {
        buildModern(chunkCtx, {
          x: centerX,
          z,
          w: width,
          d: depth,
          h: height,
          normal,
          district: style,
        });
      }
      x += width + gap;
    }
  }

  for (const side of [-1, 1]) {
    for (let x = -length * 0.5 + 12; x < length * 0.5 - 6; x += 24) {
      addEndlessStreetLight(chunkCtx, x, side);
    }
  }

  if (variant % 2 === 0) {
    addVendingMachine(chunkCtx, -length * 0.5 + 18, 12.35, Math.PI);
  } else {
    addVendingMachine(chunkCtx, length * 0.5 - 18, -12.35, 0);
  }

  windows.finish(group, { register: false });
  glow.finish();
  builder.finish(group, ctx.materials);
  return group;
}

function createEndlessCity(ctx, coreWindows, coreGlow) {
  const group = new THREE.Group();
  group.name = "TokyoEndlessCity";
  const corridor = createEndlessCorridor(ctx.materials);
  group.add(corridor);

  const chunkCtx = {
    ...ctx,
    coreWindows,
    coreGlow,
  };
  const chunks = [];
  for (let variant = 0; variant < ENDLESS.chunkCount; variant++) {
    const chunk = createEndlessChunk(chunkCtx, variant);
    group.add(chunk);
    chunks.push({ group: chunk, slot: null });
  }

  const assigned = new Map();
  let lastFocus = Number.NaN;

  function update(focusX) {
    const snapped = Math.round(focusX / ENDLESS.snap) * ENDLESS.snap;
    corridor.position.x = snapped;

    if (Number.isFinite(lastFocus) && Math.abs(focusX - lastFocus) < 12) return;
    lastFocus = focusX;

    const wanted = endlessSlotsNear(focusX);
    const wantedSet = new Set(wanted);
    for (const [slot, chunk] of assigned) {
      if (wantedSet.has(slot)) continue;
      assigned.delete(slot);
      chunk.slot = null;
      chunk.group.visible = false;
    }

    for (const slot of wanted) {
      if (assigned.has(slot)) continue;
      let chunk = chunks.find((item) => item.slot === null);
      if (!chunk) {
        // Keep the pool bounded by taking the slot farthest behind the car.
        let victimSlot = null;
        let victimDistance = -1;
        for (const [candidate, item] of assigned) {
          const distance = Math.abs(endlessSlotCenter(candidate) - focusX);
          if (distance > victimDistance) {
            victimDistance = distance;
            victimSlot = candidate;
            chunk = item;
          }
        }
        if (!chunk) continue;
        assigned.delete(victimSlot);
      }
      chunk.slot = slot;
      chunk.group.position.x = endlessSlotCenter(slot);
      chunk.group.visible = true;
      assigned.set(slot, chunk);
    }
  }

  update(0);
  return { group, update };
}

/* -------------------------------------------------------------------------- */
/*  Trees and planting                                                        */
/* -------------------------------------------------------------------------- */

function addTree(ctx, x, z, scale = 1, pink = true) {
  const { builder, rand, blossoms, leaves } = ctx;
  const trunkHeight = 2.3 * scale;
  builder.cylinder("trunk", 0.2 * scale, 0.34 * scale, trunkHeight, 7, x, trunkHeight * 0.5, z);
  builder.cylinder("trunk", 0.1 * scale, 0.16 * scale, 1.1 * scale, 5, x, trunkHeight + 0.4 * scale, z);

  const branchCount = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < branchCount; i++) {
    const angle = (i / branchCount) * TAU + rand() * 0.5;
    const reach = (0.9 + rand() * 1.2) * scale;
    const lift = (0.8 + rand() * 0.8) * scale;
    const bx = x + Math.cos(angle) * reach * 0.5;
    const bz = z + Math.sin(angle) * reach * 0.5;
    const by = trunkHeight + lift * 0.5;
    builder.cylinder("trunk", 0.05 * scale, 0.11 * scale, reach * 1.3, 5, bx, by, bz, {
      rx: Math.cos(angle) * 0.72,
      rz: Math.sin(angle) * 0.72,
    });
    const tipX = x + Math.cos(angle) * reach;
    const tipZ = z + Math.sin(angle) * reach;
    const tipY = trunkHeight + lift;
    const clusters = 3 + Math.floor(rand() * 3);
    for (let c = 0; c < clusters; c++) {
      const item = {
        x: tipX + (rand() - 0.5) * 1.4 * scale,
        y: tipY + (rand() - 0.5) * 0.9 * scale,
        z: tipZ + (rand() - 0.5) * 1.4 * scale,
        scale: (0.5 + rand() * 0.55) * scale,
      };
      if (pink) blossoms.push(item);
      else leaves.push(item);
    }
  }

  const crownClusters = pink ? 5 : 4;
  for (let i = 0; i < crownClusters; i++) {
    const angle = rand() * TAU;
    const radius = rand() * 1.2 * scale;
    const item = {
      x: x + Math.cos(angle) * radius,
      y: trunkHeight + (0.7 + rand() * 1.2) * scale,
      z: z + Math.sin(angle) * radius,
      scale: (0.55 + rand() * 0.5) * scale,
    };
    if (pink) blossoms.push(item);
    else leaves.push(item);
  }
}

function createBlossomLayer(group, ctx) {
  const blossomGeometry = new THREE.IcosahedronGeometry(0.62, 1);
  const blossomMaterial = ctx.materials.blossom.clone();
  const blossomMesh = new THREE.InstancedMesh(
    blossomGeometry,
    blossomMaterial,
    Math.max(1, ctx.blossoms.length)
  );
  blossomMesh.name = "TokyoBlossoms";
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const shades = [0xffd6e4, 0xffc2d8, 0xffb0cc, 0xffe4ee, 0xf7a8c4];
  ctx.blossoms.forEach((item, i) => {
    euler.set(item.x * 0.17, item.z * 0.13, item.y * 0.11);
    quaternion.setFromEuler(euler);
    position.set(item.x, item.y, item.z);
    scale.setScalar(item.scale);
    matrix.compose(position, quaternion, scale);
    blossomMesh.setMatrixAt(i, matrix);
    color.set(shades[i % shades.length]);
    blossomMesh.setColorAt(i, color);
  });
  blossomMesh.instanceMatrix.needsUpdate = true;
  if (blossomMesh.instanceColor) blossomMesh.instanceColor.needsUpdate = true;
  blossomMesh.castShadow = true;
  blossomMesh.receiveShadow = true;
  blossomMesh.frustumCulled = false;
  group.add(blossomMesh);
  ctx.materials.blossomMesh = blossomMesh;

  const leafGeometry = new THREE.IcosahedronGeometry(0.75, 0);
  const leafMaterial = ctx.materials.leaf.clone();
  const leafMesh = new THREE.InstancedMesh(
    leafGeometry,
    leafMaterial,
    Math.max(1, ctx.leaves.length)
  );
  leafMesh.name = "TokyoLeaves";
  ctx.leaves.forEach((item, i) => {
    euler.set(item.x * 0.21, item.z * 0.17, item.y * 0.13);
    quaternion.setFromEuler(euler);
    position.set(item.x, item.y, item.z);
    scale.setScalar(item.scale);
    matrix.compose(position, quaternion, scale);
    leafMesh.setMatrixAt(i, matrix);
    color.set(i % 3 === 0 ? 0x4f7d54 : i % 3 === 1 ? 0x3d6748 : 0x5a865e);
    leafMesh.setColorAt(i, color);
  });
  leafMesh.instanceMatrix.needsUpdate = true;
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  leafMesh.castShadow = true;
  leafMesh.receiveShadow = true;
  leafMesh.frustumCulled = false;
  group.add(leafMesh);
  ctx.materials.leafMesh = leafMesh;
}

/* -------------------------------------------------------------------------- */
/*  Shrine                                                                    */
/* -------------------------------------------------------------------------- */

function createShrine(ctx) {
  const { builder, glow, blockers, rand, group, materials, pois, pickables, lanterns } = ctx;
  const shrineX = -72;
  const pathZ = 27.5;

  // Stone approach.
  addFlatPlane(group, materials.stone, 6.2, 37, shrineX, pathZ, 0.06);
  for (const side of [-1, 1]) {
    builder.box("stone", 0.28, 0.18, 37, shrineX + side * 3.3, 0.11, pathZ);
  }

  // Torii. Individual meshes so the top beam can be picked as a landmark.
  const torii = new THREE.Group();
  torii.name = "TokyoTorii";
  const pillarMaterial = materials.torii;
  const blackMaterial = materials.black;
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.46, 5.4, 12),
      pillarMaterial
    );
    pillar.position.set(side * 2.5, 2.7, 17.2);
    pillar.castShadow = true;
    torii.add(pillar);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.72, 0.5, 12),
      blackMaterial
    );
    base.position.set(side * 2.5, 0.25, 17.2);
    torii.add(base);
    blockers.push({
      minX: shrineX + side * 2.5 - 0.6,
      maxX: shrineX + side * 2.5 + 0.6,
      minZ: 16.6,
      maxZ: 17.8,
    });
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.52, 0.75), pillarMaterial);
  lintel.position.set(0, 5.2, 17.2);
  lintel.castShadow = true;
  lintel.userData.tokyoPoi = "shrine";
  torii.add(lintel);
  pickables.push(lintel);
  const lintelCap = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.18, 0.95), blackMaterial);
  lintelCap.position.set(0, 5.54, 17.2);
  torii.add(lintelCap);
  const secondLintel = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.3, 0.48), pillarMaterial);
  secondLintel.position.set(0, 4.35, 17.2);
  torii.add(secondLintel);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.7), materials.signMaterialFor("神社"));
  plaque.position.set(0, 4.62, 17.6);
  torii.add(plaque);
  torii.position.set(shrineX, 0, 0);
  group.add(torii);
  glow.addVertical(shrineX, 4.6, 17.1, 7.5, 5.8, Math.PI, 0xffb15e, 0.38);
  glow.addGround(shrineX, 14.6, 6.5, 5.5, 0xffb15e, 0.38);

  // Shrine hall.
  const hallX = shrineX;
  const hallZ = 37.5;
  builder.box("stone", 8.6, 0.5, 7.2, hallX, 0.25, hallZ);
  builder.box("wood", 7.6, 3.8, 5.8, hallX, 2.4, hallZ);
  const hallRoof = gableRoofGeometry(7.8, 6.2, 1.8, 0.9);
  builder.addGeometry("roofDark", hallRoof, hallX, 4.4, hallZ);
  builder.box("darkWood", 8.8, 0.18, 0.24, hallX, 4.5, hallZ - 3.0);
  builder.box("darkWood", 8.8, 0.18, 0.24, hallX, 4.5, hallZ + 3.0);
  for (let i = 0; i < 5; i++) {
    builder.box("stone", 1.3, 0.16, 0.5, hallX, 0.08 + i * 0.1, hallZ - 3.4 - i * 0.45);
  }
  // Veranda and offering box.
  builder.box("wood", 9.0, 0.22, 1.4, hallX, 0.65, hallZ - 3.4);
  builder.box("darkWood", 2.4, 1.0, 1.1, hallX, 0.55, hallZ - 4.1);
  builder.box("darkWood", 2.6, 0.12, 1.2, hallX, 1.1, hallZ - 4.1);
  // Bell rope and bell.
  builder.cylinder("darkWood", 0.07, 0.07, 2.2, 6, hallX, 3.1, hallZ - 3.55);
  builder.sphere("metal", 0.24, 10, 8, hallX, 2.2, hallZ - 3.55);
  blockers.push({
    minX: hallX - 4.6,
    maxX: hallX + 4.6,
    minZ: hallZ - 3.8,
    maxZ: hallZ + 3.8,
  });

  // Stone lanterns along the path.
  for (const z of [22.5, 28.5, 34.5]) {
    for (const side of [-1, 1]) {
      const lx = shrineX + side * 4.4;
      builder.cylinder("stone", 0.5, 0.62, 0.32, 8, lx, 0.16, z);
      builder.cylinder("stone", 0.16, 0.2, 1.1, 8, lx, 0.86, z);
      builder.box("stone", 0.72, 0.55, 0.72, lx, 1.58, z);
      builder.box("lanternWhite", 0.42, 0.3, 0.42, lx, 1.58, z);
      builder.cone("roofDark", 0.66, 0.42, 4, lx, 2.04, z);
      glow.addGround(lx, z + 1.2, 2.4, 2.8, 0xffc36a, 0.34);
    }
  }

  // Komainu guardians.
  for (const side of [-1, 1]) {
    const kx = shrineX + side * 4.6;
    const kz = 20.2;
    builder.box("stone", 1.1, 0.9, 1.2, kx, 0.45, kz);
    builder.sphere("stone", 0.5, 8, 6, kx, 1.2, kz);
    builder.sphere("stone", 0.3, 8, 6, kx, 1.58, kz - 0.24);
    builder.cone("stone", 0.1, 0.28, 4, kx - 0.16, 1.82, kz - 0.22, { rz: -0.2 });
    builder.cone("stone", 0.1, 0.28, 4, kx + 0.16, 1.82, kz - 0.22, { rz: 0.2 });
    builder.box("stone", 0.2, 0.35, 0.55, kx - 0.28, 0.45, kz - 0.45);
    builder.box("stone", 0.2, 0.35, 0.55, kx + 0.28, 0.45, kz - 0.45);
    blockers.push({ minX: kx - 0.6, maxX: kx + 0.6, minZ: kz - 0.7, maxZ: kz + 0.7 });
  }

  // Ema rack and a small purification fountain.
  builder.box("darkWood", 3.2, 0.12, 0.16, shrineX - 5.5, 2.3, 31.2);
  builder.box("darkWood", 0.12, 2.3, 0.16, shrineX - 7.0, 1.15, 31.2);
  builder.box("darkWood", 0.12, 2.3, 0.16, shrineX - 4.0, 1.15, 31.2);
  for (let i = 0; i < 9; i++) {
    builder.box("paper", 0.32, 0.22, 0.04, shrineX - 6.5 + i * 0.32, 1.95, 31.2);
  }
  builder.box("stone", 1.8, 0.45, 1.0, shrineX + 5.4, 0.22, 31.5);
  builder.box("water", 1.3, 0.05, 0.65, shrineX + 5.4, 0.47, 31.5);

  // Trees frame the approach.
  addTree(ctx, shrineX - 8.5, 20.5, 1.15, true);
  addTree(ctx, shrineX + 8.0, 21.5, 1.0, true);
  addTree(ctx, shrineX - 8.8, 39.0, 1.2, true);
  addTree(ctx, shrineX + 8.6, 38.0, 1.05, true);
  addTree(ctx, shrineX + 10.5, 30.0, 0.9, false);
  addTree(ctx, shrineX - 10.5, 29.0, 0.9, false);

  pois.push({
    id: "shrine",
    name: "Hoshimi Shrine",
    jp: "星見神社",
    district: "Traditional District",
    x: shrineX,
    z: 27,
    description:
      "A small neighbourhood shrine tucked behind the avenue. Vermilion torii, mossy stone lanterns and a quiet cedar grove make it feel a hundred years away from the neon.",
    focus: { pos: [-72, 3.4, -2.0], target: [-72, 2.6, 30] },
  });
}

/* -------------------------------------------------------------------------- */
/*  Sakura park                                                               */
/* -------------------------------------------------------------------------- */

function createSakuraPark(ctx) {
  const { builder, glow, blockers, rand, group, materials, pois, pickables } = ctx;
  const px = 68;
  const pz = 30;
  const rx = 11.5;
  const rz = 7.0;

  // Park ground and pond.
  addFlatPlane(group, materials.soil, 36, 32, px, pz, 0.02);
  addFlatPlane(group, materials.stone, 30, 26, px, pz, 0.035);

  // Low stone plinth and clipped hedges close the park on three sides. They
  // hide the flat backs of the neighbouring blocks and give the pond a proper
  // garden edge, while the avenue side stays open as the entrance.
  builder.box("stone", 0.9, 0.5, 31.6, px - 17.45, 0.25, pz);
  builder.box("stone", 0.9, 0.5, 31.6, px + 17.45, 0.25, pz);
  builder.box("stone", 35.8, 0.5, 0.9, px, 0.25, pz + 15.45);
  builder.box("leaf", 0.75, 1.0, 31.2, px - 17.45, 1.0, pz);
  builder.box("leaf", 0.75, 1.0, 31.2, px + 17.45, 1.0, pz);
  builder.box("leaf", 35.2, 1.0, 0.75, px, 1.0, pz + 15.45);
  for (let i = 0; i < 20; i++) {
    const t = -15.2 + i * 1.6;
    const r = 0.36 + rand() * 0.16;
    builder.sphere("leaf", r, 6, 4, px - 17.45, 1.45, pz + t);
    builder.sphere("leaf", r, 6, 4, px + 17.45, 1.45, pz + t);
  }
  for (let i = 0; i < 22; i++) {
    const t = -17.2 + i * 1.6;
    builder.sphere("leaf", 0.36 + rand() * 0.16, 6, 4, px + t, 1.45, pz + 15.45);
  }
  // Low front edging, split around the entrance.
  builder.box("stone", 12, 0.34, 0.7, px - 12, 0.17, pz - 15.55);
  builder.box("stone", 12, 0.34, 0.7, px + 12, 0.17, pz - 15.55);
  blockers.push(
    { minX: px - 17.9, maxX: px - 17.0, minZ: pz - 15.8, maxZ: pz + 15.8 },
    { minX: px + 17.0, maxX: px + 17.9, minZ: pz - 15.8, maxZ: pz + 15.8 },
    { minX: px - 17.9, maxX: px + 17.9, minZ: pz + 15.0, maxZ: pz + 15.9 },
    { minX: px - 18, maxX: px - 6, minZ: pz - 15.9, maxZ: pz - 15.2 },
    { minX: px + 6, maxX: px + 18, minZ: pz - 15.9, maxZ: pz - 15.2 }
  );

  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 56), materials.water);
  water.rotation.x = -Math.PI / 2;
  water.scale.set(rx, rz, 1);
  water.position.set(px, 0.08, pz);
  water.receiveShadow = true;
  group.add(water);
  materials.waterMesh = water;

  const border = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1.06, 56),
    new THREE.MeshStandardMaterial({
      color: 0x8f8a7d,
      roughness: 0.85,
      metalness: 0.02,
    })
  );
  border.rotation.x = -Math.PI / 2;
  border.scale.set(rx, rz, 1);
  border.position.set(px, 0.07, pz);
  group.add(border);

  // Keep walkers out of the water, but leave a gap for the bridge.
  blockers.push(
    { minX: px - rx, maxX: px - 1.7, minZ: pz - rz, maxZ: pz + rz },
    { minX: px + 1.7, maxX: px + rx, minZ: pz - rz, maxZ: pz + rz }
  );

  // Low stone bridge over the pond.
  const bridgeZ0 = pz - rz - 1.2;
  const bridgeZ1 = pz + rz + 1.2;
  const bridgeSegments = 11;
  for (let i = 0; i < bridgeSegments; i++) {
    const t = i / (bridgeSegments - 1);
    const z = THREE.MathUtils.lerp(bridgeZ0, bridgeZ1, t);
    const y = 0.2 + Math.sin(t * Math.PI) * 0.42;
    builder.box("stone", 2.5, 0.18, (bridgeZ1 - bridgeZ0) / bridgeSegments + 0.18, px, y, z);
    for (const side of [-1, 1]) {
      builder.box("stone", 0.16, 0.85, 0.16, px + side * 1.2, y + 0.42, z);
    }
  }
  for (const side of [-1, 1]) {
    builder.box("stone", 0.16, 0.16, bridgeZ1 - bridgeZ0, px + side * 1.2, 1.22, pz);
  }

  // Benches.
  for (const [bx, bz, rotation] of [
    [px - 14, pz - 4, 0],
    [px + 14, pz - 4, Math.PI],
    [px - 14, pz + 7, 0],
    [px + 14, pz + 7, Math.PI],
  ]) {
    builder.box("darkWood", 2.2, 0.12, 0.55, bx, 0.52, bz, { ry: rotation });
    builder.box("darkWood", 2.2, 0.5, 0.1, bx, 0.82, bz - 0.25, { ry: rotation });
    for (const side of [-1, 1]) {
      builder.box("darkMetal", 0.08, 0.5, 0.5, bx + side * 0.85, 0.25, bz);
    }
    blockers.push({ minX: bx - 1.2, maxX: bx + 1.2, minZ: bz - 0.4, maxZ: bz + 0.4 });
  }

  // Stone lanterns and a little pier.
  for (const [lx, lz] of [
    [px - 13, pz + 10],
    [px + 13, pz + 10],
    [px - 13, pz - 8],
    [px + 13, pz - 8],
  ]) {
    builder.cylinder("stone", 0.45, 0.56, 0.28, 8, lx, 0.14, lz);
    builder.cylinder("stone", 0.14, 0.18, 0.9, 8, lx, 0.74, lz);
    builder.box("stone", 0.62, 0.46, 0.62, lx, 1.36, lz);
    builder.box("lanternWhite", 0.36, 0.26, 0.36, lx, 1.36, lz);
    builder.cone("roofDark", 0.58, 0.36, 4, lx, 1.78, lz);
    glow.addGround(lx, lz + 1.0, 2.2, 2.5, 0xffd6a0, 0.25);
  }
  builder.box("wood", 3.0, 0.14, 1.2, px - 7.8, 0.16, pz - 1.0);
  builder.box("wood", 0.16, 0.8, 0.16, px - 9.1, 0.5, pz - 1.5);
  builder.box("wood", 0.16, 0.8, 0.16, px - 6.5, 0.5, pz - 1.5);

  // Cherry trees ring the water, with a few more along the avenue.
  for (const [tx, tz, scale] of [
    [px - 15, pz - 10, 1.25],
    [px + 15, pz - 10, 1.15],
    [px - 15, pz + 12, 1.1],
    [px + 15, pz + 12, 1.25],
    [px - 8, pz - 12, 0.95],
    [px + 8, pz - 12, 1.0],
    [px - 9, pz + 14, 1.05],
    [px + 9, pz + 14, 0.95],
    [48, 15.5, 1.0],
    [58, 14.5, 0.9],
    [78, 14.5, 0.9],
    [88, 15.5, 1.0],
    [100, 14.0, 0.85],
  ]) {
    addTree(ctx, tx, tz, scale, true);
  }
  addTree(ctx, px + 19, pz + 3, 1.0, false);
  addTree(ctx, px - 19, pz + 2, 0.95, false);

  // A wooden sign at the entrance, also the landmark pick target.
  const signMaterial = materials.signMaterialFor("さくら");
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), signMaterial);
  sign.position.set(px, 1.8, 15.6);
  sign.rotation.y = Math.PI;
  sign.userData.tokyoPoi = "sakura";
  group.add(sign);
  pickables.push(sign);
  builder.box("darkWood", 0.16, 1.9, 0.16, px - 1.4, 0.95, 15.55);
  builder.box("darkWood", 0.16, 1.9, 0.16, px + 1.4, 0.95, 15.55);
  glow.addVertical(px, 1.9, 15.45, 4.2, 2.6, Math.PI, 0xff9ec4, 0.35);
  glow.addGround(px, 13.8, 5.0, 4.0, 0xff9ec4, 0.3);

  pois.push({
    id: "sakura",
    name: "Sakura Pond",
    jp: "桜池",
    district: "Sakura District",
    x: px,
    z: pz,
    description:
      "A pocket park built around a still pond. Stone lanterns, a low arched bridge and cherry trees dropping petals into the water — best seen at dusk, when the lanterns come on.",
    focus: { pos: [68, 6.4, 10.0], target: [68, 1.2, 30] },
  });
}

/* -------------------------------------------------------------------------- */
/*  Small street props                                                        */
/* -------------------------------------------------------------------------- */

function addVendingMachine(ctx, x, z, rotationY = 0) {
  const { group, materials, blockers } = ctx;
  const machine = new THREE.Group();
  machine.position.set(x, 0, z);
  machine.rotation.y = rotationY;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.9, 0.78), materials.white);
  body.position.y = 0.95;
  body.castShadow = true;
  body.receiveShadow = true;
  machine.add(body);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.72), materials.vendingFront);
  front.position.set(0, 0.98, 0.395);
  machine.add(front);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.84), materials.darkMetal);
  trim.position.y = 1.92;
  machine.add(trim);
  const spriteMaterial = new THREE.SpriteMaterial({
    map: materials.glowTexture,
    color: new THREE.Color(0x9fe8ff),
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: true,
  });
  const glowSprite = new THREE.Sprite(spriteMaterial);
  glowSprite.scale.set(2.4, 2.4, 1);
  glowSprite.position.set(0, 1.1, 0.55);
  machine.add(glowSprite);
  group.add(machine);
  blockers.push({
    minX: x - 0.62,
    maxX: x + 0.62,
    minZ: z - 0.5,
    maxZ: z + 0.5,
  });
  return machine;
}

function rodBetween(group, start, end, radius, material) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 5),
    material
  );
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function addBicycle(ctx, x, z, rotationY, color = 0x30353a, moving = false) {
  const { materials } = ctx;
  const bike = new THREE.Group();
  bike.position.set(x, 0, z);
  bike.rotation.y = rotationY;
  const frameMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.66,
    envMapIntensity: 0.8,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x0b0d0f,
    roughness: 0.86,
    metalness: 0.05,
  });
  const wheels = [];
  for (const wheelX of [-0.55, 0.55]) {
    const pivot = new THREE.Group();
    pivot.position.set(wheelX, 0.33, 0);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.026, 6, 16), rubber);
    tire.castShadow = true;
    pivot.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 6), materials.metal);
    hub.rotation.x = Math.PI / 2;
    pivot.add(hub);
    for (let i = 0; i < 4; i++) {
      rodBetween(
        pivot,
        [0, 0, 0],
        [Math.cos((i / 4) * TAU) * 0.27, Math.sin((i / 4) * TAU) * 0.27, 0],
        0.006,
        materials.metal
      );
    }
    bike.add(pivot);
    wheels.push(pivot);
  }
  rodBetween(bike, [-0.55, 0.33, 0], [0.05, 0.82, 0], 0.026, frameMaterial);
  rodBetween(bike, [0.05, 0.82, 0], [0.55, 0.33, 0], 0.026, frameMaterial);
  rodBetween(bike, [-0.55, 0.33, 0], [0.05, 0.33, 0], 0.026, frameMaterial);
  rodBetween(bike, [0.05, 0.33, 0], [0.05, 0.82, 0], 0.026, frameMaterial);
  rodBetween(bike, [0.05, 0.82, 0], [0.45, 0.92, 0], 0.024, frameMaterial);
  rodBetween(bike, [0.45, 0.92, -0.24], [0.45, 0.92, 0.24], 0.02, materials.darkMetal);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.12), materials.black);
  seat.position.set(-0.08, 0.88, 0);
  bike.add(seat);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.28), materials.darkMetal);
  basket.position.set(0.5, 0.78, 0);
  bike.add(basket);
  bike.userData.wheels = wheels;
  if (!moving) {
    ctx.group.add(bike);
  }
  return bike;
}

function createCat(ctx, x, y, z, rotationY, color = 0x23262c) {
  const { group } = ctx;
  const cat = new THREE.Group();
  cat.position.set(x, y, z);
  cat.rotation.y = rotationY;
  const fur = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.02,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), fur);
  body.scale.set(1.25, 0.82, 0.9);
  body.position.y = 0.19;
  body.castShadow = true;
  cat.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), fur);
  head.position.set(0.23, 0.34, 0);
  head.castShadow = true;
  cat.add(head);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), fur);
    ear.position.set(0.24, 0.44, side * 0.07);
    ear.rotation.z = -0.15;
    cat.add(ear);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0xc9ff8a, toneMapped: false })
    );
    eye.position.set(0.345, 0.36, side * 0.045);
    cat.add(eye);
  }
  const tail = new THREE.Group();
  tail.position.set(-0.25, 0.2, 0);
  const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.46, 5), fur);
  tailMesh.position.y = 0.2;
  tailMesh.rotation.z = -0.5;
  tail.add(tailMesh);
  cat.add(tail);
  cat.userData.tail = tail;
  cat.userData.phase = Math.random() * TAU;
  group.add(cat);
  ctx.cats.push(cat);
  return cat;
}

function addLaundryLine(ctx, x0, x1, z, y, items) {
  const { group, materials } = ctx;
  const wire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, x1 - x0, 4),
    materials.darkMetal
  );
  wire.rotation.z = Math.PI / 2;
  wire.position.set((x0 + x1) * 0.5, y, z);
  group.add(wire);
  const colors = [0xffc2d8, 0xd9f0ff, 0xfff2cf, 0xe7d6ff, 0xc7f5d6];
  for (let i = 0; i < items; i++) {
    const material = new THREE.MeshStandardMaterial({
      color: colors[i % colors.length],
      roughness: 0.92,
      metalness: 0.0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.25,
    });
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.78), material);
    const t = (i + 0.5) / items;
    cloth.position.set(THREE.MathUtils.lerp(x0 + 0.25, x1 - 0.25, t), y - 0.4, z);
    cloth.castShadow = true;
    group.add(cloth);
    ctx.laundryMeshes.push({
      mesh: cloth,
      phase: Math.random() * TAU,
      base: 0,
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Residential alley                                                         */
/* -------------------------------------------------------------------------- */

function createResidentialAlley(ctx) {
  const {
    builder,
    group,
    materials,
    glow,
    rand,
    blockers,
    pois,
    pickables,
    cats,
  } = ctx;
  const alleyX = 88;
  const z0 = -9;
  const z1 = -58;
  const centerZ = (z0 + z1) * 0.5;

  addFlatPlane(group, materials.alley, 6.4, Math.abs(z1 - z0), alleyX, centerZ, 0.045);
  for (const side of [-1, 1]) {
    builder.box("curb", 0.16, 0.12, Math.abs(z1 - z0), alleyX + side * 3.18, 0.06, centerZ);
  }

  // Two facing rows of little houses, set back just enough for a scooter or a
  // row of potted plants. The alley stays narrow and shaded, which is the
  // point: it reads as a breath between the neon blocks.
  let z = -14;
  while (z > -55) {
    const width = range(rand, 6.4, 9.2);
    const depth = range(rand, 7.2, 10.5);
    const height = range(rand, 5.2, 8.0);
    for (const side of [-1, 1]) {
      const x = alleyX + side * (3.15 + depth * 0.5 + 0.35);
      const normal = new THREE.Vector3(side > 0 ? -1 : 1, 0, 0);
      buildHouse(ctx, {
        x,
        z: z - width * 0.5,
        w: width,
        d: depth,
        h: height,
        normal,
        frontWall: false,
      });
    }
    z -= width + range(rand, 1.4, 2.8);
  }

  // Low fences and gates close the plots without walling off the lane.
  for (const side of [-1, 1]) {
    const x = alleyX + side * 3.05;
    for (let fz = -15.5; fz > -55; fz -= range(rand, 5, 8)) {
      const length = range(rand, 2.4, 4.2);
      builder.box("darkMetal", 0.07, 1.0, length, x, 0.55, fz);
      builder.box("darkMetal", 0.07, 0.07, length, x, 1.05, fz);
      for (let i = 0; i < 3; i++) {
        builder.box("darkMetal", 0.05, 0.9, 0.05, x, 0.48, fz - length * 0.5 + (length / 2) * i);
      }
      blockers.push({
        minX: x - 0.12,
        maxX: x + 0.12,
        minZ: fz - length * 0.5,
        maxZ: fz + length * 0.5,
      });
    }
  }

  // Potted plants, crates and a couple of parked bicycles.
  for (let i = 0; i < 16; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = alleyX + side * range(rand, 2.2, 2.9);
    const pz = range(rand, -53, -14);
    builder.cylinder("rust", 0.14, 0.18, 0.3, 7, x, 0.15, pz);
    builder.sphere("leaf", 0.22, 5, 4, x, 0.46, pz);
    if (i % 4 === 0) {
      builder.box("wood", 0.5, 0.36, 0.38, x, 0.18, pz + 0.7);
    }
  }
  addBicycle(ctx, 84.7, -22.5, Math.PI / 2, 0x6d3f2c);
  addBicycle(ctx, 91.3, -41.5, -Math.PI / 2, 0x2d4b6e);
  addVendingMachine(ctx, 84.85, -17.2, Math.PI / 2);
  addVendingMachine(ctx, 91.15, -47.8, -Math.PI / 2);

  // Laundry strung across the lane, and the cats that own the walls.
  addLaundryLine(ctx, 85.4, 90.6, -24.0, 4.2, 4);
  addLaundryLine(ctx, 85.4, 90.6, -34.5, 4.4, 3);
  addLaundryLine(ctx, 85.4, 90.6, -46.0, 4.1, 4);
  createCat(ctx, 84.6, 1.08, -29.5, Math.PI / 2);
  createCat(ctx, 91.4, 0.72, -37.5, -Math.PI / 2, 0xd8d2c4);
  createCat(ctx, 88.0, 0.28, -50.5, -Math.PI / 2, 0x3a2b25);

  // A tiny neighbourhood notice board and a warm alley lamp.
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.0),
    new THREE.MeshStandardMaterial({
      color: 0xe7dcc2,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    })
  );
  board.position.set(85.2, 1.8, -31.0);
  board.rotation.y = Math.PI / 2;
  group.add(board);
  builder.box("darkWood", 0.1, 2.4, 0.1, 85.15, 1.2, -31.7);
  builder.box("darkWood", 0.1, 2.4, 0.1, 85.15, 1.2, -30.3);
  glow.addGround(85.0, -31.0, 3.0, 3.4, 0xffd7a0, 0.22);

  for (const [lx, lz] of [
    [84.95, -20],
    [91.05, -33],
    [84.95, -44],
  ]) {
    builder.cylinder("darkMetal", 0.05, 0.06, 3.4, 6, lx, 1.7, lz);
    builder.box("lanternWhite", 0.22, 0.3, 0.22, lx, 3.3, lz);
    glow.addGround(lx, lz + 0.9, 1.8, 2.2, 0xffd7a0, 0.25);
  }

  // The alley opens onto the avenue with a low wooden sign.
  const signMaterial = materials.signMaterialFor("住宅街");
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.15), signMaterial);
  sign.position.set(84.9, 2.2, -10.4);
  sign.rotation.y = Math.PI / 2;
  sign.userData.tokyoPoi = "alley";
  group.add(sign);
  pickables.push(sign);
  builder.box("darkWood", 0.1, 2.8, 0.1, 84.85, 1.4, -11.3);
  builder.box("darkWood", 0.1, 2.8, 0.1, 84.85, 1.4, -9.5);
  glow.addGround(86.5, -10.4, 3.6, 3.6, 0x8fd8ff, 0.26);

  pois.push({
    id: "alley",
    name: "Yanaka Alley",
    jp: "谷中横丁",
    district: "Residential District",
    x: alleyX,
    z: -34,
    description:
      "A narrow back lane of timber houses, potted plants, laundry lines and cats. Vending machines hum at either end; the city feels very far away between these walls.",
    focus: { pos: [88, 2.2, -14.5], target: [88, 1.5, -36] },
  });
}

/* -------------------------------------------------------------------------- */
/*  Elevated railway and station                                              */
/* -------------------------------------------------------------------------- */

function makeTrainCar(materials) {
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(16.4, 2.7, 2.75), materials.train);
  body.position.y = 1.55;
  body.castShadow = true;
  car.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.22, 2.5), materials.trainDark);
  roof.position.y = 2.98;
  car.add(roof);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(16.45, 0.28, 2.79), materials.trainGreen);
  stripe.position.y = 1.45;
  car.add(stripe);
  const underframe = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.55, 2.4), materials.trainDark);
  underframe.position.y = 0.32;
  car.add(underframe);

  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d1c24,
    emissive: 0xffd9a0,
    emissiveIntensity: 0.65,
    roughness: 0.16,
    metalness: 0.4,
    envMapIntensity: 1.2,
  });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const windowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), windowMaterial);
      windowMesh.position.set(-6.2 + i * 3.1, 2.05, side * 1.39);
      if (side < 0) windowMesh.rotation.y = Math.PI;
      car.add(windowMesh);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.85), materials.trainDark);
    door.position.set(7.1, 1.45, side * 1.39);
    if (side < 0) door.rotation.y = Math.PI;
    car.add(door);
  }
  const frontWindow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.95), windowMaterial);
  frontWindow.position.set(8.22, 2.05, 0);
  frontWindow.rotation.y = Math.PI / 2;
  car.add(frontWindow);

  const bogies = [];
  for (const bx of [-5.4, 5.4]) {
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 2.1), materials.trainDark);
    bogie.position.set(bx, 0.15, 0);
    car.add(bogie);
    for (const wx of [-0.75, 0.75]) {
      for (const wz of [-0.95, 0.95]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, 0.16, 10),
          materials.darkMetal
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(bx + wx, 0.14, wz);
        car.add(wheel);
        bogies.push(wheel);
      }
    }
  }
  car.userData.bogies = bogies;
  car.userData.windowMaterial = windowMaterial;
  return car;
}

function createStation(ctx) {
  const {
    builder,
    group,
    materials,
    glow,
    rand,
    blockers,
    pois,
    pickables,
  } = ctx;
  const stationX = 132;
  const trackZ = 36;
  const deckY = 6.15;

  // Ground-level station building opening onto the avenue.
  builder.box("concreteCool", 18, 5.4, 8.4, stationX, 2.7, 24);
  builder.box("concreteDark", 18.6, 0.35, 8.8, stationX, 5.55, 24);
  builder.box("concreteDark", 19, 0.25, 9.2, stationX, 0.12, 24);
  blockers.push({
    minX: stationX - 9.2,
    maxX: stationX + 9.2,
    minZ: 19.6,
    maxZ: 28.4,
  });

  // Glazed front and entrance canopy.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(12.5, 3.2),
    new THREE.MeshStandardMaterial({
      color: 0x17313c,
      emissive: 0xffe0ad,
      emissiveIntensity: 0.5,
      roughness: 0.12,
      metalness: 0.55,
      envMapIntensity: 1.4,
      transparent: true,
      opacity: 0.9,
    })
  );
  glass.position.set(stationX, 1.9, 19.78);
  glass.rotation.y = Math.PI;
  group.add(glass);
  for (let i = 0; i < 7; i++) {
    builder.box(
      "darkMetal",
      0.08,
      3.3,
      0.12,
      stationX - 6.2 + i * 2.06,
      1.9,
      19.7
    );
  }
  builder.box("darkMetal", 14.4, 0.14, 1.7, stationX, 4.15, 19.2);
  for (const side of [-1, 1]) {
    builder.box("darkMetal", 0.16, 3.9, 0.16, stationX + side * 7.1, 2.0, 19.1);
  }

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 1.55), materials.stationSign);
  sign.position.set(stationX, 5.0, 19.72);
  sign.rotation.y = Math.PI;
  sign.userData.tokyoPoi = "station";
  group.add(sign);
  pickables.push(sign);
  glow.addVertical(stationX, 5.0, 19.6, 12.0, 4.6, Math.PI, 0xbfe8ff, 0.36);
  glow.addVertical(stationX, 3.85, 19.25, 13.2, 1.4, Math.PI, 0xffe6b0, 0.34);
  glow.addGround(stationX, 17.6, 12.0, 5.5, 0xbfe8ff, 0.34);
  glow.addGround(stationX, 12.5, 16.0, 6.0, 0xffe6b0, 0.22);

  // Ticket machines and a little warm light under the canopy.
  for (const side of [-1, 1]) {
    builder.box("white", 0.8, 1.65, 0.55, stationX + side * 5.2, 0.85, 19.1);
    builder.box("darkMetal", 0.62, 0.42, 0.04, stationX + side * 5.2, 1.35, 18.82);
    builder.box("darkMetal", 0.62, 0.22, 0.04, stationX + side * 5.2, 0.95, 18.82);
  }
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.08, 0.22),
      materials.lanternWhite
    );
    lamp.position.set(stationX + side * 3.4, 3.85, 19.4);
    group.add(lamp);
  }

  // Stairs up to the platform.
  const stairZ0 = 28.5;
  const stairZ1 = 34.0;
  const steps = 15;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const y = 0.22 + t * (deckY - 0.22);
    const z = THREE.MathUtils.lerp(stairZ0, stairZ1, t);
    builder.box("concrete", 5.6, 0.22, (stairZ1 - stairZ0) / steps + 0.06, stationX, y, z);
  }
  for (const side of [-1, 1]) {
    builder.box("darkMetal", 0.1, 1.0, stairZ1 - stairZ0, stationX + side * 2.85, 3.2, (stairZ0 + stairZ1) * 0.5, {
      rx: -0.38,
    });
  }

  // Viaduct: piers, deck, rails and sleepers.
  const trackStart = 92;
  const trackEnd = 232;
  builder.box("concrete", trackEnd - trackStart, 0.6, 6.2, (trackStart + trackEnd) * 0.5, deckY - 0.3, trackZ);
  for (let x = trackStart + 6; x < trackEnd; x += 14) {
    builder.box("concreteDark", 1.25, deckY - 0.6, 1.8, x, (deckY - 0.6) * 0.5, trackZ);
    builder.box("concreteDark", 3.2, 0.4, 2.4, x, 0.2, trackZ);
  }
  for (const side of [-1, 1]) {
    builder.box("darkMetal", trackEnd - trackStart, 0.16, 0.12, (trackStart + trackEnd) * 0.5, deckY + 0.55, trackZ + side * 3.02);
    for (let x = trackStart; x < trackEnd; x += 3.0) {
      builder.box("darkMetal", 0.08, 0.55, 0.08, x, deckY + 0.28, trackZ + side * 3.02);
    }
  }
  for (const railZ of [-0.72, 0.72]) {
    builder.box("metal", trackEnd - trackStart, 0.09, 0.09, (trackStart + trackEnd) * 0.5, deckY + 0.08, trackZ + railZ);
  }
  for (let x = trackStart; x < trackEnd; x += 1.25) {
    builder.box("darkWood", 0.26, 0.1, 2.3, x, deckY + 0.01, trackZ);
  }

  // Platform, canopy and lighting.
  builder.box("concrete", 26, 0.5, 5.6, stationX, deckY, trackZ - 3.5);
  builder.box("paintYellow", 26, 0.03, 0.18, stationX, deckY + 0.27, trackZ - 6.1);
  builder.box("paintWhite", 26, 0.03, 0.14, stationX, deckY + 0.27, trackZ - 6.35);
  builder.box("streetLamp", 24.5, 0.05, 0.07, stationX, deckY + 0.27, trackZ - 6.22);
  for (let i = 0; i < 7; i++) {
    const x = stationX - 12 + i * 4;
    builder.box("darkMetal", 0.16, 3.4, 0.16, x, deckY + 1.9, trackZ - 6.1);
    builder.box("darkMetal", 0.16, 3.4, 0.16, x, deckY + 1.9, trackZ - 1.0);
    builder.box("lanternWhite", 0.7, 0.1, 0.24, x, deckY + 3.55, trackZ - 3.55);
    glow.addGround(x, trackZ - 3.6, 2.4, 2.8, 0xffe6b0, 0.24);
  }
  builder.box("concreteDark", 27, 0.22, 6.2, stationX, deckY + 3.75, trackZ - 3.5);
  const platformSign = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.9), materials.stationSign);
  platformSign.position.set(stationX + 7.2, deckY + 2.55, trackZ - 6.05);
  platformSign.rotation.y = Math.PI;
  group.add(platformSign);
  for (const [bx, bz] of [
    [stationX - 6, trackZ - 3.2],
    [stationX + 6, trackZ - 3.2],
  ]) {
    builder.box("darkWood", 2.4, 0.12, 0.55, bx, deckY + 0.72, bz);
    builder.box("darkWood", 2.4, 0.5, 0.1, bx, deckY + 1.0, bz - 0.24);
    for (const side of [-1, 1]) {
      builder.box("darkMetal", 0.08, 0.5, 0.5, bx + side * 0.9, deckY + 0.4, bz);
    }
  }

  // A covered bicycle park and a taxi rank in the forecourt.
  for (let i = 0; i < 8; i++) {
    addBicycle(
      ctx,
      stationX - 12 + (i % 4) * 1.1,
      14.8 + Math.floor(i / 4) * 1.2,
      Math.PI / 2,
      [0x2e4b63, 0x6d3f2c, 0x30353a][i % 3]
    );
  }
  builder.box("darkMetal", 5.4, 0.08, 3.1, stationX - 10.4, 2.4, 15.4);
  for (const side of [-1, 1]) {
    builder.box("darkMetal", 0.08, 2.4, 0.08, stationX - 10.4 + side * 2.6, 1.2, 14.0);
    builder.box("darkMetal", 0.08, 2.4, 0.08, stationX - 10.4 + side * 2.6, 1.2, 16.8);
  }

  // The train itself. Three cars, looping behind the platform.
  const train = new THREE.Group();
  train.name = "TokyoTrain";
  const cars = [];
  for (let i = 0; i < 3; i++) {
    const car = makeTrainCar(materials);
    car.position.x = (i - 1) * 16.9;
    train.add(car);
    cars.push(car);
  }
  train.position.set(198, deckY + 0.18, trackZ);
  group.add(train);
  const trainLightMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff2cf,
    toneMapped: false,
  });
  for (const side of [-1, 1]) {
    const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), trainLightMaterial);
    headlight.position.set(8.2, 1.1, side * 0.9);
    cars[0].add(headlight);
  }
  const trainGlowMaterial = new THREE.SpriteMaterial({
    map: materials.glowTexture,
    color: new THREE.Color(0xfff2cf),
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: true,
  });
  const trainGlow = new THREE.Sprite(trainGlowMaterial);
  trainGlow.scale.set(7, 5, 1);
  trainGlow.position.set(8.6, 1.5, 0);
  cars[0].add(trainGlow);

  pois.push({
    id: "station",
    name: "Sakura-dai Station",
    jp: "桜台駅",
    district: "Train District",
    x: stationX,
    z: 24,
    description:
      "An elevated commuter station above the avenue. Trains slide past every minute or so, the platform lights hum, and the stairs smell faintly of rain and vending-machine coffee.",
    focus: { pos: [118, 4.8, 1.5], target: [132, 4.8, 27] },
  });

  return { train, cars, trackZ, deckY };
}

/* -------------------------------------------------------------------------- */
/*  Street furniture, shopfronts and utilities                                */
/* -------------------------------------------------------------------------- */

function addStreetLights(ctx) {
  const { builder, glow, blockers, materials } = ctx;
  const lampMaterial = materials.streetLamp ?? materials.lanternWhite;
  for (const side of [-1, 1]) {
    for (let x = -162; x <= 166; x += 26) {
      // Keep the landmark frontages clear: the ramen shop, the konbini and the
      // station forecourt were each framed by a lamp post standing right in
      // front of the sign.
      if (
        (x > -42 && x < -28) ||
        (x > -12 && x < 26) ||
        (x > 112 && x < 156)
      ) {
        continue;
      }
      const z = side * 12.55;
      builder.cylinder("darkMetal", 0.09, 0.13, 6.6, 7, x, 3.3, z);
      builder.box("darkMetal", 1.75, 0.09, 0.09, x + (side > 0 ? -0.7 : 0.7), 6.45, z);
      const headX = x + (side > 0 ? -1.45 : 1.45);
      builder.box("darkMetal", 0.52, 0.16, 0.32, headX, 6.35, z);
      builder.box("streetLamp", 0.42, 0.06, 0.24, headX, 6.26, z);
      glow.addVertical(headX, 6.1, z, 2.8, 2.8, 0, 0xffe6b0, 0.34);
      glow.addGround(headX, z - side * 1.2, 3.2, 3.6, 0xffe6b0, 0.24);
      blockers.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2 });
    }
  }
  // Keep the merged lamp heads emissive through a dedicated material so the
  // day/night switch can dim them without touching the lanterns.
  materials.streetLampMesh = null;
  void lampMaterial;
}

function addPowerLines(ctx) {
  const { builder, group, materials, rand } = ctx;
  const poles = [];
  for (const side of [-1, 1]) {
    for (let x = -166; x <= 166; x += 32) {
      if (side < 0 && Math.abs(x) % 64 > 2) continue;
      if (
        Math.abs(x + 38) < 8 ||
        Math.abs(x - 24) < 8 ||
        Math.abs(x + 72) < 6 ||
        (x > 112 && x < 156)
      ) {
        continue;
      }
      const z = side * 12.85;
      const height = 9.2 + rand() * 0.5;
      builder.cylinder("concreteDark", 0.13, 0.2, height, 7, x, height * 0.5, z);
      for (const y of [height - 0.6, height - 1.5]) {
        builder.box("darkMetal", 2.4, 0.09, 0.09, x, y, z);
        for (const offset of [-1.05, 0, 1.05]) {
          builder.cylinder("white", 0.045, 0.045, 0.16, 5, x + offset, y + 0.13, z);
        }
      }
      if (rand() < 0.4) {
        builder.cylinder("metal", 0.3, 0.3, 0.8, 8, x + 0.35, height - 2.4, z);
      }
      poles.push({ x, z, height, side });
    }
  }

  const wireMaterial = new THREE.LineBasicMaterial({
    color: 0x080a0c,
    transparent: true,
    opacity: 0.72,
    fog: true,
  });
  const sorted = new Map();
  for (const pole of poles) {
    const key = pole.side;
    if (!sorted.has(key)) sorted.set(key, []);
    sorted.get(key).push(pole);
  }
  for (const list of sorted.values()) {
    list.sort((a, b) => a.x - b.x);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      for (const [offset, yOffset] of [
        [-1.05, -0.45],
        [0, -0.45],
        [1.05, -0.45],
        [-1.05, -1.35],
        [1.05, -1.35],
      ]) {
        const points = [];
        for (let s = 0; s <= 10; s++) {
          const t = s / 10;
          const sag = Math.sin(t * Math.PI) * 0.55;
          points.push(
            new THREE.Vector3(
              THREE.MathUtils.lerp(a.x, b.x, t),
              a.height + yOffset - sag,
              a.z + offset
            )
          );
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, wireMaterial);
        group.add(line);
      }
    }
  }

  // A few wires cross the avenue overhead, sagging from the taller poles.
  for (const x of [-96, -32, 44, 108]) {
    const points = [];
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      points.push(
        new THREE.Vector3(
          x,
          8.6 - Math.sin(t * Math.PI) * 1.25,
          THREE.MathUtils.lerp(-12.85, 12.85, t)
        )
      );
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geometry, wireMaterial));
  }
}

function addTrafficLights(ctx) {
  const { builder, group, materials, blockers, glow, trafficSignals } = ctx;
  const lensColors = {
    red: { on: 0xff3b2f, off: 0x2c0b09 },
    amber: { on: 0xffb42f, off: 0x2b1c07 },
    green: { on: 0x38ff9a, off: 0x07251a },
  };
  const corners = [
    { x: -8.6, z: -10.1, dirX: 1, dirZ: 0 },
    { x: 8.6, z: 10.1, dirX: -1, dirZ: 0 },
    { x: -8.6, z: 10.1, dirX: 0, dirZ: -1 },
    { x: 8.6, z: -10.1, dirX: 0, dirZ: 1 },
  ];
  for (const corner of corners) {
    builder.cylinder("darkMetal", 0.09, 0.12, 5.7, 7, corner.x, 2.85, corner.z);
    const head = new THREE.Group();
    head.position.set(
      corner.x + corner.dirX * 1.2,
      5.35,
      corner.z + corner.dirZ * 1.2
    );
    head.rotation.y = Math.atan2(corner.dirX, corner.dirZ);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.42, 0.32), materials.black);
    housing.castShadow = true;
    head.add(housing);
    const lenses = [];
    for (let i = 0; i < 3; i++) {
      const tint = i === 0 ? "red" : i === 1 ? "amber" : "green";
      const colors = lensColors[tint];
      // Each lens owns its material so the signal can show exactly one lamp
      // at a time. The unlit lenses keep their colour but go very dark.
      const lensMaterial = new THREE.MeshBasicMaterial({
        color: colors.off,
        toneMapped: false,
      });
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), lensMaterial);
      lens.position.set(-0.44 + i * 0.44, 0, 0.18);
      head.add(lens);
      const spriteMaterial = new THREE.SpriteMaterial({
        map: materials.glowTexture,
        color: new THREE.Color(colors.on),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: true,
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(1.5, 1.5, 1);
      sprite.position.set(-0.44 + i * 0.44, 0, 0.23);
      head.add(sprite);
      lenses.push({
        tint,
        material: lensMaterial,
        spriteMaterial,
        onColor: colors.on,
        offColor: colors.off,
      });
    }
    trafficSignals.push({
      axis: corner.dirX !== 0 ? "ew" : "ns",
      lenses,
    });
    group.add(head);
    blockers.push({
      minX: corner.x - 0.22,
      maxX: corner.x + 0.22,
      minZ: corner.z - 0.22,
      maxZ: corner.z + 0.22,
    });
    glow.addGround(corner.x, corner.z, 2.8, 2.8, 0x66d9ff, 0.12);
  }
}

function updateTrafficSignals(trafficSignals, elapsed) {
  // A small, readable four-way cycle: avenue green, avenue amber, all red,
  // cross-street green, cross-street amber, all red. Only one lens per head is
  // ever lit, which is what makes the junction read as a real signal.
  const phase = elapsed % 18;
  let ew;
  let ns;
  if (phase < 7) {
    ew = "green";
    ns = "red";
  } else if (phase < 8.2) {
    ew = "amber";
    ns = "red";
  } else if (phase < 9) {
    ew = "red";
    ns = "red";
  } else if (phase < 16) {
    ew = "red";
    ns = "green";
  } else if (phase < 17.2) {
    ew = "red";
    ns = "amber";
  } else {
    ew = "red";
    ns = "red";
  }

  for (const signal of trafficSignals) {
    const active = signal.axis === "ew" ? ew : ns;
    for (const lens of signal.lenses) {
      const on = lens.tint === active;
      lens.material.color.setHex(on ? lens.onColor : lens.offColor);
      lens.spriteMaterial.opacity = on ? 0.42 : 0;
    }
  }
}

function addBusStop(ctx) {
  const { builder, group, materials, glow } = ctx;
  const x = 22;
  const z = 11.1;
  builder.box("darkMetal", 4.2, 0.12, 2.0, x, 2.65, z);
  for (const side of [-1, 1]) {
    builder.box("darkMetal", 0.09, 2.6, 0.09, x + side * 1.95, 1.3, z - 0.7);
    builder.box("darkMetal", 0.09, 2.6, 0.09, x + side * 1.95, 1.3, z + 0.7);
  }
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 1.9),
    new THREE.MeshStandardMaterial({
      color: 0x6f9aa8,
      roughness: 0.08,
      metalness: 0.5,
      transparent: true,
      opacity: 0.28,
      envMapIntensity: 1.4,
      side: THREE.DoubleSide,
    })
  );
  glass.position.set(x, 1.35, z + 0.72);
  group.add(glass);
  builder.box("darkWood", 3.0, 0.12, 0.5, x, 0.55, z + 0.15);
  builder.box("darkWood", 3.0, 0.45, 0.1, x, 0.82, z - 0.12);
  for (const side of [-1, 1]) {
    builder.box("darkMetal", 0.08, 0.5, 0.5, x + side * 1.2, 0.28, z + 0.15);
  }
  builder.cylinder("darkMetal", 0.05, 0.06, 2.7, 6, x + 2.4, 1.35, z - 0.8);
  const signMaterial = materials.signMaterialFor("バス");
  if (signMaterial) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), signMaterial);
    sign.position.set(x + 2.4, 2.75, z - 0.76);
    group.add(sign);
  }
  glow.addGround(x, z, 4.2, 3.0, 0xffe6b0, 0.2);
}

function addRamenShop(ctx) {
  const {
    group,
    builder,
    materials,
    glow,
    pickables,
    pois,
    lanterns,
    steam,
    rand,
  } = ctx;
  const x = -38;
  const z = 13.62;
  const width = 8.6;

  const shop = new THREE.Mesh(new THREE.PlaneGeometry(width, 2.6), materials.shopFront);
  shop.position.set(x, 1.45, z);
  shop.rotation.y = Math.PI;
  group.add(shop);
  builder.box("darkMetal", width + 0.4, 0.14, 0.7, x, 2.9, z - 0.25);
  for (let i = 0; i < 5; i++) {
    builder.box("darkWood", 0.08, 2.5, 0.1, x - width * 0.42 + i * (width * 0.21), 1.45, z - 0.02);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.15), materials.ramenSign);
  sign.position.set(x, 4.25, z - 0.06);
  sign.rotation.y = Math.PI;
  sign.userData.tokyoPoi = "ramen";
  group.add(sign);
  pickables.push(sign);
  glow.addVertical(x, 4.2, z - 0.12, 7.4, 5.6, Math.PI, 0xffb15e, 0.52);
  glow.addGround(x, z - 2.2, 7.0, 4.4, 0xffb15e, 0.38);

  // Noren curtains in the doorway.
  const norenMaterial = ctx.norenMaterials[0];
  for (let i = 0; i < 3; i++) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.9), norenMaterial);
    panel.position.set(x - 0.7 + i * 0.7, 2.15, z - 0.22);
    panel.rotation.y = Math.PI;
    panel.userData.baseRotation = Math.PI;
    panel.userData.phase = rand() * TAU;
    group.add(panel);
    ctx.norenMeshes.push(panel);
  }
  for (const side of [-1, 1]) {
    const lantern = addLantern(
      group,
      { ...ctx, lantern: ctx.lanternMaterial },
      x + side * 3.4,
      3.0,
      z - 0.5,
      { color: 0xff6a2a, scale: 1.05 }
    );
    lanterns.push({ group: lantern, phase: rand() * TAU, base: 0 });
  }
  // Steam over the kitchen vent.
  for (let i = 0; i < 4; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: materials.glowTexture,
        color: new THREE.Color(0xfff0d0),
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: true,
      })
    );
    sprite.position.set(x + 2.2 + rand() * 1.2, 3.2 + rand() * 2, z - 1.0);
    sprite.scale.set(1.6, 2.2, 1);
    group.add(sprite);
    steam.push({ sprite, phase: rand() * TAU, x: sprite.position.x, z: sprite.position.z });
  }
  // Red paper lanterns hanging over the pavement.
  for (const side of [-1, 1]) {
    builder.box("darkWood", 0.08, 0.08, 1.5, x + side * (width * 0.5 + 0.4), 3.4, z - 0.8);
    const lantern = addLantern(
      group,
      { ...ctx, lantern: ctx.lanternMaterial },
      x + side * (width * 0.5 + 0.4),
      3.0,
      z - 1.45,
      { color: 0xff4a2a, scale: 0.8 }
    );
    lanterns.push({ group: lantern, phase: rand() * TAU, base: 0 });
  }

  pois.push({
    id: "ramen",
    name: "Akari Ramen",
    jp: "麺処 あかり",
    district: "Neon District",
    x,
    z: 13,
    description:
      "A six-seat counter behind a steamed-up window. The broth has been on since morning, the noren is faded, and the lanterns make the wet pavement outside glow orange.",
    focus: { pos: [-26, 6.2, -10.5], target: [-38, 3.2, 13.4], fov: 34 },
  });
}

function addKonbini(ctx) {
  const {
    group,
    builder,
    materials,
    glow,
    pickables,
    pois,
    rand,
  } = ctx;
  const x = 24;
  const z = -13.62;
  const width = 10.4;

  const interior = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 2.7),
    new THREE.MeshStandardMaterial({
      color: 0xf2fff7,
      emissive: 0xdfffe9,
      emissiveIntensity: 0.65,
      roughness: 0.3,
      metalness: 0.05,
      side: THREE.DoubleSide,
    })
  );
  interior.position.set(x, 1.5, z);
  group.add(interior);
  // Shelving silhouettes and a strip of coloured products behind the glass.
  for (let row = 0; row < 3; row++) {
    builder.box("white", width * 0.86, 0.06, 0.1, x, 0.75 + row * 0.62, z - 0.08);
  }
  for (let i = 0; i < 16; i++) {
    const px = x - width * 0.4 + (i % 8) * 1.12;
    const py = 0.9 + Math.floor(i / 8) * 0.62;
    const color = ["red", "green", "paintBlue", "paintYellow", "white"][i % 5];
    builder.box(color, 0.28, 0.2, 0.06, px, py, z - 0.02);
  }
  for (let i = 0; i < 6; i++) {
    builder.box("darkMetal", 0.07, 2.8, 0.12, x - width * 0.42 + i * (width * 0.168), 1.5, z + 0.02);
  }
  builder.box("darkMetal", width + 0.3, 0.15, 0.8, x, 2.95, z + 0.25);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 1.45), materials.konbiniSign);
  sign.position.set(x, 4.05, z + 0.1);
  sign.userData.tokyoPoi = "konbini";
  group.add(sign);
  pickables.push(sign);
  glow.addVertical(x, 4.05, z + 0.05, 10.5, 4.2, 0, 0xdfffe9, 0.4);
  glow.addGround(x, z + 2.2, 9.0, 4.6, 0xdfffe9, 0.34);
  addVendingMachine(ctx, x + 6.1, z + 1.1, Math.PI);
  addVendingMachine(ctx, x - 6.1, z + 1.1, Math.PI);
  // Bicycle parked against the glass.
  addBicycle(ctx, x - 3.2, z + 1.3, Math.PI / 2, 0x2f4d66);

  // A small stack of crates and a bin by the door.
  for (let i = 0; i < 3; i++) {
    builder.box("paintBlue", 0.55, 0.38, 0.42, x + 4.2, 0.2 + i * 0.38, z + 1.4, {
      ry: rand() * 0.2,
    });
  }
  builder.cylinder("darkMetal", 0.28, 0.3, 0.85, 8, x + 5.3, 0.42, z + 1.5);

  pois.push({
    id: "konbini",
    name: "Machikado Mart",
    jp: "まちかどマート",
    district: "Neon District",
    x,
    z: -13,
    description:
      "The corner konbini: fluorescent white, green signage and a wall of cold drinks. Its light spills across the pavement all night, and the automatic door chimes at every hour.",
    focus: { pos: [16, 3.4, 1.5], target: [24, 2.6, -13.4] },
  });
}

function addIntersectionSign(ctx) {
  const { group, builder, materials, glow, pickables, pois } = ctx;
  const x = 9.2;
  const z = 11.8;
  builder.cylinder("darkMetal", 0.06, 0.08, 3.8, 6, x, 1.9, z);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.15), materials.signMaterialFor("東京"));
  sign.position.set(x, 3.4, z - 0.03);
  sign.rotation.y = Math.PI;
  sign.userData.tokyoPoi = "crossing";
  group.add(sign);
  pickables.push(sign);
  glow.addVertical(x, 3.4, z - 0.08, 4.2, 3.0, Math.PI, 0xff5fb0, 0.32);
  glow.addGround(x, z - 1.4, 3.4, 3.0, 0xff5fb0, 0.24);

  // A tall vertical neon blade on the opposite corner, visible from the car.
  const blade = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 5.8),
    materials.signMaterialFor("未来")
  );
  blade.position.set(-9.0, 5.4, -11.2);
  blade.rotation.y = 0;
  group.add(blade);
  pickables.push(blade);
  blade.userData.tokyoPoi = "crossing";
  glow.addVertical(-9.0, 5.4, -11.15, 3.2, 7.2, 0, 0x5fe8ff, 0.42);

  pois.push({
    id: "crossing",
    name: "Tokyo Crossing",
    jp: "東京交差点",
    district: "Neon District",
    x: 0,
    z: 0,
    description:
      "The heart of the avenue: a wide scramble crossing under a thicket of signs. Cyan, pink and violet light rolls over the wet asphalt while the signals click through their cycle.",
    focus: { pos: [0, 5.4, 32], target: [0, 1.7, 0] },
  });
}

function addGuardrails(ctx) {
  const { builder, blockers } = ctx;
  for (const side of [-1, 1]) {
    for (const [x0, x1] of [
      [-64, -44],
      [32, 52],
      [96, 118],
      [148, 166],
    ]) {
      const z = side * 9.35;
      for (let x = x0; x <= x1; x += 2.4) {
        builder.box("metal", 0.06, 0.85, 0.06, x, 0.43, z);
      }
      builder.box("metal", x1 - x0, 0.07, 0.07, (x0 + x1) * 0.5, 0.78, z);
      blockers.push({ minX: x0, maxX: x1, minZ: z - 0.1, maxZ: z + 0.1 });
    }
  }
}

function addStreetBarricades(ctx) {
  const { builder, blockers } = ctx;
  // The cross street is a finite side road. Close both ends with visible
  // construction barriers so the car never meets an invisible wall on a road
  // that still looks open.
  for (const z of [-58, 58]) {
    for (const x of [-6.3, 0, 6.3]) {
      builder.box("darkMetal", 0.14, 1.02, 0.14, x, 0.51, z);
    }
    builder.box("paintYellow", 13.4, 0.34, 0.14, 0, 0.92, z);
    builder.box("paintYellow", 13.4, 0.18, 0.1, 0, 0.5, z);
    for (let x = -5.8; x <= 5.8; x += 2.9) {
      builder.box("darkMetal", 0.46, 0.36, 0.16, x, 0.92, z + (z > 0 ? 0.06 : -0.06));
    }
    for (const x of [-6.4, 6.4]) {
      builder.sphere("streetLamp", 0.11, 8, 6, x, 1.2, z);
    }
    blockers.push({ minX: -7.1, maxX: 7.1, minZ: z - 0.22, maxZ: z + 0.22 });
  }
}

function createStreetFurniture(ctx) {
  addStreetLights(ctx);
  addPowerLines(ctx);
  addTrafficLights(ctx);
  addBusStop(ctx);
  addGuardrails(ctx);
  addStreetBarricades(ctx);
  addIntersectionSign(ctx);
  addRamenShop(ctx);
  addKonbini(ctx);

  // Vending machines and bicycles scattered along both pavements.
  for (const [x, z, rotation] of [
    [-58, 12.35, Math.PI],
    [-24, -12.35, 0],
    [8, 12.35, Math.PI],
    [44, -12.35, 0],
    [72, 12.35, Math.PI],
    [104, -12.35, 0],
    [152, 12.35, Math.PI],
  ]) {
    addVendingMachine(ctx, x, z, rotation);
  }
  for (const [x, z, rotation, color] of [
    [-44.5, 11.0, Math.PI / 2, 0x6d3f2c],
    [-20.0, 11.0, Math.PI / 2, 0x2d4b6e],
    [-2.0, -11.0, -Math.PI / 2, 0x30353a],
    [30.0, 11.0, Math.PI / 2, 0x5a3a6e],
    [58.0, -11.0, -Math.PI / 2, 0x2e4b63],
    [96.0, 11.0, Math.PI / 2, 0x6d3f2c],
    [144.0, -11.0, -Math.PI / 2, 0x2d4b6e],
  ]) {
    addBicycle(ctx, x, z, rotation, color);
  }

  // Planters and benches give the wide pavements a human scale.
  for (const [x, z] of [
    [-50, 10.8],
    [-14, 10.8],
    [16, 10.8],
    [62, 10.8],
    [90, 10.8],
    [120, 10.8],
    [-36, -10.8],
    [4, -10.8],
    [54, -10.8],
    [84, -10.8],
    [146, -10.8],
  ]) {
    builderBoxPlanter(ctx, x, z);
  }
}

function builderBoxPlanter(ctx, x, z) {
  const { builder, blockers, rand } = ctx;
  const side = z > 0 ? -1 : 1;
  builder.box("concreteDark", 1.4, 0.55, 0.7, x, 0.27, z);
  builder.box("soil", 1.2, 0.08, 0.52, x, 0.55, z);
  for (let i = 0; i < 3; i++) {
    builder.sphere("leaf", 0.22 + rand() * 0.1, 5, 4, x - 0.4 + i * 0.4, 0.75, z + (rand() - 0.5) * 0.2);
  }
  blockers.push({ minX: x - 0.75, maxX: x + 0.75, minZ: z - 0.4, maxZ: z + 0.4 });
  void side;
}

/* -------------------------------------------------------------------------- */
/*  Traffic, cyclists and pedestrians                                         */
/* -------------------------------------------------------------------------- */

function makeStreetVehicle(ctx, kind, color) {
  const { materials } = ctx;
  const object = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.34,
    metalness: 0.62,
    envMapIntensity: 1.1,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0d1a22,
    roughness: 0.12,
    metalness: 0.55,
    envMapIntensity: 1.4,
  });
  const headlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff2c4,
    toneMapped: false,
  });
  const taillightMaterial = new THREE.MeshBasicMaterial({
    color: 0xff2a20,
    toneMapped: false,
  });
  const lights = [];
  const wheels = [];
  let length = 4.2;
  let width = 1.8;

  if (kind === "bus") {
    length = 9.4;
    width = 2.45;
    const body = new THREE.Mesh(new THREE.BoxGeometry(9.2, 2.25, 2.35), paint);
    body.position.y = 1.5;
    body.castShadow = true;
    object.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.2, 2.2), materials.white);
    roof.position.y = 2.7;
    object.add(roof);
    for (const side of [-1, 1]) {
      const windows = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 0.9), glass);
      windows.position.set(0, 2.05, side * 1.18);
      if (side < 0) windows.rotation.y = Math.PI;
      object.add(windows);
    }
    const frontWindow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.05), glass);
    frontWindow.position.set(4.62, 2.0, 0);
    frontWindow.rotation.y = Math.PI / 2;
    object.add(frontWindow);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(9.24, 0.24, 2.39), materials.trainGreen);
    stripe.position.y = 1.05;
    object.add(stripe);
    for (const side of [-1, 1]) {
      const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), headlightMaterial);
      headlight.position.set(4.63, 0.75, side * 0.72);
      object.add(headlight);
      lights.push({ mesh: headlight, kind: "head" });
      const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.3), taillightMaterial);
      taillight.position.set(-4.62, 0.85, side * 0.76);
      object.add(taillight);
      lights.push({ mesh: taillight, kind: "tail" });
    }
  } else if (kind === "kei") {
    length = 3.5;
    width = 1.55;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.35, 1.5), paint);
    cab.position.set(0.9, 1.0, 0);
    cab.castShadow = true;
    object.add(cab);
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.65), glass);
    windshield.position.set(1.71, 1.25, 0);
    windshield.rotation.y = Math.PI / 2;
    object.add(windshield);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.48, 1.5), materials.metal);
    bed.position.set(-0.9, 0.78, 0);
    bed.castShadow = true;
    object.add(bed);
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 1.1), materials.wood);
    cargo.position.set(-0.8, 1.18, 0);
    object.add(cargo);
    for (const side of [-1, 1]) {
      const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), headlightMaterial);
      headlight.position.set(1.73, 0.65, side * 0.55);
      object.add(headlight);
      lights.push({ mesh: headlight, kind: "head" });
      const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.24), taillightMaterial);
      taillight.position.set(-2.02, 0.7, side * 0.58);
      object.add(taillight);
      lights.push({ mesh: taillight, kind: "tail" });
    }
  } else {
    const isTaxi = kind === "taxi";
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.62, 1.78), paint);
    body.position.y = 0.62;
    body.castShadow = true;
    object.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.56, 1.62), paint);
    cabin.position.set(-0.2, 1.18, 0);
    cabin.castShadow = true;
    object.add(cabin);
    const windscreen = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.42), glass);
    windscreen.position.set(0.9, 1.2, 0);
    windscreen.rotation.y = Math.PI / 2;
    object.add(windscreen);
    const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.4), glass);
    rearGlass.position.set(-1.3, 1.2, 0);
    rearGlass.rotation.y = -Math.PI / 2;
    object.add(rearGlass);
    for (const side of [-1, 1]) {
      const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), glass);
      sideGlass.position.set(-0.2, 1.2, side * 0.82);
      if (side < 0) sideGlass.rotation.y = Math.PI;
      object.add(sideGlass);
    }
    if (isTaxi) {
      const roofSign = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.14, 0.24),
        new THREE.MeshBasicMaterial({ color: 0xffd45e, toneMapped: false })
      );
      roofSign.position.set(-0.2, 1.54, 0);
      object.add(roofSign);
    }
    for (const side of [-1, 1]) {
      const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), headlightMaterial);
      headlight.position.set(2.07, 0.68, side * 0.58);
      object.add(headlight);
      lights.push({ mesh: headlight, kind: "head" });
      const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.3), taillightMaterial);
      taillight.position.set(-2.07, 0.72, side * 0.6);
      object.add(taillight);
      lights.push({ mesh: taillight, kind: "tail" });
    }
  }

  const axlePositions = kind === "bus" ? [-3.0, 3.0] : kind === "kei" ? [-1.1, 1.1] : [-1.35, 1.35];
  const trackHalf = width * 0.47;
  for (const axleX of axlePositions) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(axleX, kind === "bus" ? 0.46 : 0.34, side * trackHalf);
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(kind === "bus" ? 0.46 : 0.32, kind === "bus" ? 0.46 : 0.32, 0.22, 10),
        materials.black
      );
      tire.rotation.x = Math.PI / 2;
      tire.castShadow = true;
      pivot.add(tire);
      object.add(pivot);
      wheels.push(pivot);
    }
  }

  for (const side of [-1, 1]) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: materials.glowTexture,
        color: new THREE.Color(0xfff2c4),
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: true,
      })
    );
    sprite.scale.set(2.4, 2.0, 1);
    sprite.position.set(length * 0.5 + 0.1, 0.7, side * 0.55);
    object.add(sprite);
    lights.push({ mesh: sprite, kind: "head" });
  }

  object.userData.length = length;
  object.userData.width = width;
  object.userData.wheels = wheels;
  object.userData.lights = lights;
  return { object, wheels, lights, length, width };
}

function createTraffic(ctx) {
  const { group, rand } = ctx;
  const traffic = [];
  const definitions = [
    { kind: "sedan", color: 0x8e1f2a, axis: "x", lane: -4.5, dir: 1, speed: 9.2, start: -120 },
    { kind: "sedan", color: 0x203a58, axis: "x", lane: -4.5, dir: 1, speed: 8.1, start: 34 },
    { kind: "taxi", color: 0x15181c, axis: "x", lane: 4.5, dir: -1, speed: 10.4, start: 112 },
    { kind: "kei", color: 0xe6e1d4, axis: "x", lane: -4.5, dir: 1, speed: 7.4, start: 132 },
    { kind: "bus", color: 0x2f8f6a, axis: "x", lane: 4.5, dir: -1, speed: 6.2, start: -34 },
    { kind: "sedan", color: 0x5b3a72, axis: "x", lane: 4.5, dir: -1, speed: 11.0, start: -148 },
    { kind: "sedan", color: 0x2a2d31, axis: "x", lane: 4.5, dir: -1, speed: 8.4, start: -70 },
    { kind: "kei", color: 0xd8d2c4, axis: "x", lane: -4.5, dir: 1, speed: 7.1, start: 48 },
  ];
  for (const definition of definitions) {
    const vehicle = makeStreetVehicle(ctx, definition.kind, definition.color);
    if (definition.axis === "x") {
      vehicle.object.position.set(definition.start, 0, definition.lane);
      vehicle.object.rotation.y = definition.dir > 0 ? 0 : Math.PI;
    } else {
      vehicle.object.position.set(definition.lane, 0, definition.start);
      vehicle.object.rotation.y = definition.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    group.add(vehicle.object);
    traffic.push({
      object: vehicle.object,
      wheels: vehicle.wheels,
      lights: vehicle.lights,
      axis: definition.axis,
      dir: definition.dir,
      speed: definition.speed,
      lane: definition.lane,
      laneZ: definition.axis === "x" ? definition.lane : undefined,
      length: vehicle.length,
    });
  }

  // Cyclists drift along the kerb, slower and quieter than the traffic.
  const cyclists = [];
  for (const [index, definition] of [
    { x: -64, z: 10.9, dir: 1, speed: 3.1, color: 0x2f4d66 },
    { x: 42, z: -10.9, dir: -1, speed: 2.7, color: 0x6d3f2c },
    { x: 118, z: 10.9, dir: 1, speed: 3.4, color: 0x30353a },
  ].entries()) {
    const bike = addBicycle(ctx, definition.x, definition.z, definition.dir > 0 ? 0 : Math.PI, definition.color, true);
    const jacket = new THREE.MeshStandardMaterial({
      color: [0x35536b, 0x8a5a3a, 0x2d3a2e][index % 3],
      roughness: 0.86,
      metalness: 0.05,
    });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.58, 6), jacket);
    torso.position.set(-0.08, 1.22, 0);
    torso.rotation.z = 0.18;
    torso.castShadow = true;
    bike.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xc79a78, roughness: 0.8 })
    );
    head.position.set(-0.02, 1.58, 0);
    bike.add(head);
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.155, 8, 5, 0, TAU, 0, Math.PI * 0.55),
      materialsForHelmet(index)
    );
    helmet.position.set(-0.02, 1.62, 0);
    bike.add(helmet);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.065, 0.55, 5),
        new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.9 })
      );
      leg.position.set(-0.08 + side * 0.09, 0.72, side * 0.09);
      leg.rotation.z = side * 0.25;
      bike.add(leg);
    }
    group.add(bike);
    cyclists.push({
      object: bike,
      wheels: bike.userData.wheels,
      dir: definition.dir,
      speed: definition.speed,
      laneZ: definition.z,
    });
  }

  function setLights(on) {
    for (const vehicle of traffic) {
      for (const light of vehicle.lights) {
        light.mesh.visible = Boolean(on);
      }
    }
  }

  function update(dt, focusX = 0, player = null) {
    const avenueMin = focusX - 190;
    const avenueSpan = 380;
    for (const vehicle of traffic) {
      const oldX = vehicle.object.position.x;
      const oldZ = vehicle.object.position.z;
      if (vehicle.axis === "x") {
        vehicle.object.position.x += vehicle.dir * vehicle.speed * dt;
        let x = vehicle.object.position.x;
        // Wrap relative to the car so the avenue always has traffic around it,
        // however far the player drives from the authored core.
        if (x < avenueMin) x += Math.ceil((avenueMin - x) / avenueSpan) * avenueSpan;
        else if (x > avenueMin + avenueSpan) {
          x -= Math.ceil((x - avenueMin - avenueSpan) / avenueSpan) * avenueSpan;
        }
        vehicle.object.position.x = x;
      } else {
        vehicle.object.position.z += vehicle.dir * vehicle.speed * dt;
        if (vehicle.dir > 0 && vehicle.object.position.z > 112) {
          vehicle.object.position.z = -112;
        } else if (vehicle.dir < 0 && vehicle.object.position.z < -112) {
          vehicle.object.position.z = 112;
        }
      }
      // Do not let a street vehicle drive through the player. Reverting the
      // step makes it wait behind the car and try again next frame, instead of
      // ghosting through the body.
      if (player) {
        const hit = obbOverlap(
          {
            x: player.x,
            z: player.z,
            heading: player.heading,
            halfLength: player.halfLength,
            halfWidth: player.halfWidth,
          },
          {
            x: vehicle.object.position.x,
            z: vehicle.object.position.z,
            heading: vehicle.object.rotation.y,
            halfLength: vehicle.length * 0.5,
            halfWidth: (vehicle.object.userData.width ?? 1.8) * 0.5,
          },
          0.06
        );
        if (hit) {
          vehicle.object.position.x = oldX;
          vehicle.object.position.z = oldZ;
          continue;
        }
      }
      for (const wheel of vehicle.wheels) {
        wheel.rotation.z -= (vehicle.dir * vehicle.speed * dt) / 0.32;
      }
    }
    const cycleMin = focusX - 178;
    const cycleSpan = 356;
    for (const cyclist of cyclists) {
      cyclist.object.position.x += cyclist.dir * cyclist.speed * dt;
      let x = cyclist.object.position.x;
      if (x < cycleMin) x += Math.ceil((cycleMin - x) / cycleSpan) * cycleSpan;
      else if (x > cycleMin + cycleSpan) {
        x -= Math.ceil((x - cycleMin - cycleSpan) / cycleSpan) * cycleSpan;
      }
      cyclist.object.position.x = x;
      for (const wheel of cyclist.wheels) {
        wheel.rotation.z -= (cyclist.dir * cyclist.speed * dt) / 0.31;
      }
    }
  }

  return { traffic, cyclists, setLights, update };
}

function materialsForHelmet(index) {
  return new THREE.MeshStandardMaterial({
    color: [0xdfe8ea, 0xd8b04c, 0x8a2a1f][index % 3],
    roughness: 0.36,
    metalness: 0.25,
    envMapIntensity: 0.9,
  });
}

function createTokyoCrowd(ctx) {
  const { rand } = ctx;
  const actors = [];
  for (let i = 0; i < 28; i++) {
    const x = -164 + i * 11.8 + range(rand, -3, 3);
    const side = rand() > 0.5 ? 1 : -1;
    const z = side * range(rand, 10.2, 12.0);
    const roll = rand();
    const kind = roll > 0.88 ? "stand" : roll > 0.8 ? "work" : "walk";
    actors.push({
      x,
      z,
      y: 0.02,
      kind,
      dir: rand() > 0.5 ? 1 : -1,
      walk: 0.62 + rand() * 0.48,
      yaw: kind === "walk" ? undefined : side > 0 ? Math.PI : 0,
      umbrella: rand() > 0.2,
    });
  }
  const crowd = createCrowd({
    actors,
    wrapMin: -180,
    wrapSpan: 360,
    seed: 20261027,
    castShadow: false,
  });
  crowd.group.position.y = 0.08;
  return crowd;
}

/* -------------------------------------------------------------------------- */
/*  Cats                                                                      */
/* -------------------------------------------------------------------------- */

function createCats(ctx) {
  createCat(ctx, -72 + 4.6, 0.32, 20.2, -Math.PI / 2, 0x2a2c31);
  createCat(ctx, 68 - 12.8, 0.3, 29.0, Math.PI / 2, 0xd8d2c4);
  createCat(ctx, -20.4, 0.28, 11.9, Math.PI, 0x3a2b25);
  createCat(ctx, 30.6, 0.28, -11.9, 0, 0x23262c);
}

/* -------------------------------------------------------------------------- */
/*  Scene assembly                                                            */
/* -------------------------------------------------------------------------- */

export function createTokyo(renderer) {
  const group = new THREE.Group();
  group.name = "TokyoDreams";
  group.visible = false;

  const materials = makeMaterials();
  materials.glowTexture = makeGlowTexture();
  const builder = createBuilder();
  const rand = seeded(20261027);
  const glow = createGlowLayer(group);
  const windows = createWindowLayer(materials);
  const signLibrary = createSignMaterials(materials);
  const blockers = [];
  const blossoms = [];
  const leaves = [];
  const lanterns = [];
  const norenMeshes = [];
  const laundryMeshes = [];
  const cats = [];
  const steam = [];
  const pois = [];
  const pickables = [];

  const ctx = {
    group,
    materials,
    builder,
    windows,
    glow,
    blockers,
    rand,
    blossoms,
    leaves,
    lanterns,
    norenMeshes,
    laundryMeshes,
    cats,
    steam,
    pois,
    pickables,
    trafficSignals: [],
    signMaterials: signLibrary.signs,
    billboards: signLibrary.billboards,
    norenMaterials: signLibrary.norenMaterials,
    lanternMaterial: materials.lantern,
    glowTexture: materials.glowTexture,
  };

  createGround(builder, group, materials, rand);
  createMainRows(ctx);
  createShrine(ctx);
  createSakuraPark(ctx);
  createResidentialAlley(ctx);
  const station = createStation(ctx);
  createStreetFurniture(ctx);
  createCats(ctx);
  windows.finish(group);
  createBlossomLayer(group, ctx);
  glow.finish();
  builder.finish(group, materials);

  // The authored core ends at ±176 m. Beyond it, a moving asphalt corridor and
  // a small pool of recycled procedural blocks keep the avenue going forever.
  const endless = createEndlessCity(ctx, windows, glow);
  group.add(endless.group);

  const crowd = createTokyoCrowd(ctx);
  group.add(crowd.group);
  const trafficState = createTraffic(ctx);

  const rain = createRain({
    count: 1300,
    radius: 30,
    height: 18,
    color: 0xbcd4e8,
    opacity: 0.48,
    windX: 0.42,
    windZ: 0.14,
  });
  rain.setVisible(false);
  group.add(rain.group);

  const sky = createSky();
  group.add(sky.mesh);
  const stars = createStars();
  group.add(stars);
  const moon = createCelestialSprite("rgba(215,232,255,0.95)", 30);
  moon.position.set(-210, 190, -300);
  group.add(moon);
  const sun = createCelestialSprite("rgba(255,242,205,1)", 42);
  sun.position.set(240, 210, 170);
  sun.visible = false;
  group.add(sun);

  const hemisphere = new THREE.HemisphereLight(0x6f8fc4, 0x080a0e, 0.38);
  hemisphere.name = "TokyoHemisphere";
  group.add(hemisphere);
  const ambient = new THREE.AmbientLight(0x243044, 0.24);
  ambient.name = "TokyoAmbient";
  group.add(ambient);
  const key = new THREE.DirectionalLight(0xaecbff, 0.9);
  key.name = "TokyoKey";
  key.position.set(-62, 92, -46);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -110;
  key.shadow.camera.right = 110;
  key.shadow.camera.top = 110;
  key.shadow.camera.bottom = -110;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 320;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.035;
  group.add(key);
  group.add(key.target);
  key.target.position.set(0, 0, 0);

  // Soft front fill from the avenue side. The key light comes from behind the
  // north row, which left the south-facing shopfronts almost black; this lifts
  // them without flattening the shadows or costing another shadow map.
  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.4);
  fill.name = "TokyoFill";
  fill.position.set(38, 46, 84);
  group.add(fill);
  group.add(fill.target);
  fill.target.position.set(0, 4, 0);

  const shrineLight = new THREE.PointLight(0xffb15e, 22, 26, 2);
  shrineLight.position.set(-72, 3.4, 29);
  group.add(shrineLight);
  const sakuraLight = new THREE.PointLight(0xff9ec4, 26, 30, 2);
  sakuraLight.position.set(68, 3.0, 30);
  group.add(sakuraLight);
  const sakuraLanternLight = new THREE.PointLight(0xffd6a0, 10, 18, 2);
  sakuraLanternLight.position.set(58, 1.9, 38);
  group.add(sakuraLanternLight);
  const stationLight = new THREE.PointLight(0xbfe8ff, 30, 34, 2);
  stationLight.position.set(132, 7.2, 26);
  group.add(stationLight);
  const platformLight = new THREE.PointLight(0xffe6b0, 14, 24, 2);
  platformLight.position.set(132, 9.0, 34);
  group.add(platformLight);
  const alleyLight = new THREE.PointLight(0xffd7a0, 10, 20, 2);
  alleyLight.position.set(88, 2.4, -30);
  group.add(alleyLight);
  const crossingLight = new THREE.PointLight(0xff4fb8, 24, 30, 2);
  crossingLight.position.set(0, 5.4, 6);
  group.add(crossingLight);

  const environment = makeEnvironment(renderer);
  const fog = new THREE.FogExp2(0x0a1220, 0.0062);

  const signBase = signLibrary.signs.map((sign) => sign.material.emissiveIntensity);
  const billboardBase = signLibrary.billboards.map(
    (billboard) => billboard.material.emissiveIntensity
  );

  let night = true;
  let neonOn = true;
  let rainOn = false;
  let quality = "high";
  let wetness = 0.55;
  let lastFocusX = null;

  function applyWetness() {
    const rough = THREE.MathUtils.lerp(0.62, 0.22, wetness);
    const metal = THREE.MathUtils.lerp(0.12, 0.36, wetness);
    const env = THREE.MathUtils.lerp(0.8, 1.5, wetness);
    materials.asphalt.roughness = rough;
    materials.asphalt.metalness = metal;
    materials.asphalt.envMapIntensity = env;
    materials.asphaltSide.roughness = rough + 0.04;
    materials.asphaltSide.metalness = metal;
    materials.asphaltSide.envMapIntensity = env;
    materials.alley.roughness = THREE.MathUtils.lerp(0.88, 0.5, wetness);
    materials.alley.envMapIntensity = THREE.MathUtils.lerp(0.4, 0.9, wetness);
    materials.sidewalk.roughness = THREE.MathUtils.lerp(0.86, 0.55, wetness);
    materials.sidewalk.envMapIntensity = THREE.MathUtils.lerp(0.35, 0.8, wetness);
    if (materials.asphaltEndless) {
      materials.asphaltEndless.roughness = rough;
      materials.asphaltEndless.metalness = metal;
      materials.asphaltEndless.envMapIntensity = env;
    }
    if (materials.sidewalkEndless) {
      materials.sidewalkEndless.roughness = THREE.MathUtils.lerp(0.86, 0.55, wetness);
      materials.sidewalkEndless.envMapIntensity = THREE.MathUtils.lerp(0.35, 0.8, wetness);
    }
    if (materials.puddle) {
      materials.puddle.opacity = THREE.MathUtils.lerp(0.22, 0.72, wetness);
    }
    if (materials.waterMesh) {
      materials.waterMesh.material.envMapIntensity = THREE.MathUtils.lerp(1.1, 1.8, wetness);
    }
  }

  function applyNeon() {
    const factor = neonOn ? (night ? 1 : 0.46) : night ? 0.1 : 0.02;
    signLibrary.signs.forEach((sign, index) => {
      sign.material.emissiveIntensity = signBase[index] * factor;
    });
    signLibrary.billboards.forEach((billboard, index) => {
      billboard.material.emissiveIntensity = billboardBase[index] * factor;
    });
    glow.verticalMaterial.opacity = neonOn ? (night ? 0.55 : 0.16) : 0.012;
    glow.groundMaterial.opacity = neonOn ? (night ? 0.4 : 0.11) : 0.01;
    materials.shopFront.emissiveIntensity = neonOn
      ? night
        ? 0.55
        : 0.16
      : 0.06;
    materials.vendingFront.emissiveIntensity = neonOn
      ? night
        ? 0.9
        : 0.32
      : 0.18;
    materials.ramenSign.emissiveIntensity = neonOn ? (night ? 1.2 : 0.4) : 0.08;
    materials.konbiniSign.emissiveIntensity = neonOn ? (night ? 0.85 : 0.3) : 0.08;
    materials.stationSign.emissiveIntensity = night ? 0.55 : 0.16;
    materials.streetLamp.emissiveIntensity = night ? 1.5 : 0.04;
  }

  function applyTime() {
    const day = !night;
    sky.uniforms.topColor.value.set(day ? 0x78b4e2 : 0x050b1e);
    sky.uniforms.horizonColor.value.set(day ? 0xd8e8f2 : 0x18264a);
    sky.uniforms.groundColor.value.set(day ? 0x9aabb3 : 0x02040a);
    sky.uniforms.sunColor.value.set(day ? 0xfff2d0 : 0x9fc8ff);
    sky.uniforms.sunGlow.value = day ? 0.65 : 0.4;
    stars.visible = !day;
    moon.visible = !day;
    sun.visible = day;
    hemisphere.color.set(day ? 0xdcecff : 0x6f8fc4);
    hemisphere.groundColor.set(day ? 0x9a8f7d : 0x080a0e);
    hemisphere.intensity = day ? 1.25 : 0.5;
    ambient.color.set(day ? 0xc9d9e6 : 0x243044);
    ambient.intensity = day ? 0.55 : 0.32;
    key.color.set(day ? 0xfff1d4 : 0xaecbff);
    key.intensity = day ? 2.35 : 1.05;
    key.position.set(day ? 70 : -62, day ? 120 : 92, day ? 58 : -46);
    fill.intensity = day ? 0.25 : 0.4;
    shrineLight.intensity = day ? 0 : 22;
    sakuraLight.intensity = day ? 0 : 26;
    sakuraLanternLight.intensity = day ? 0 : 10;
    stationLight.intensity = day ? 5 : 30;
    platformLight.intensity = day ? 4 : 14;
    alleyLight.intensity = day ? 0 : 10;
    crossingLight.intensity = day ? 0 : 24;
    fog.color.set(day ? 0xc7dbe5 : 0x0a1220);
    fog.density = day ? 0.0036 : 0.0062;
    renderer.toneMappingExposure = day ? 1.06 : 1.04;
    materials.litWindows.visible = !day;
    materials.litWindowMaterial.opacity = day ? 0 : 0.96;
    materials.streetLamp.emissiveIntensity = day ? 0.04 : 1.5;
    materials.paper.emissiveIntensity = day ? 0.06 : 0.8;
    materials.lanternWhite.emissiveIntensity = day ? 0.08 : 1.0;
    materials.lantern.emissiveIntensity = day ? 0.1 : 1.5;
    materials.water.color.set(day ? 0x2b5560 : 0x14343c);
    materials.water.emissiveIntensity = day ? 0.08 : 0.22;
    for (const lantern of lanterns) {
      const body = lantern.group.children[0];
      if (body?.material) {
        body.material.emissiveIntensity = day ? 0.18 : 1.5;
      }
      const sprite = lantern.group.children.find((child) => child.isSprite);
      if (sprite) sprite.material.opacity = day ? 0.06 : 0.55;
    }
    for (const car of station.cars) {
      car.userData.windowMaterial.emissiveIntensity = day ? 0.08 : 0.65;
    }
    trafficState.setLights(night || rainOn);
    applyNeon();
    applyWetness();
  }

  function setTimeOfDay(value) {
    night = value !== "day";
    applyTime();
  }

  function setNeon(value) {
    neonOn = Boolean(value);
    applyNeon();
  }

  function setRain(value) {
    rainOn = Boolean(value);
    rain.setVisible(rainOn);
    crowd.setRain(rainOn);
    trafficState.setLights(night || rainOn);
  }

  function setQuality(value) {
    quality = value === "low" || value === "medium" ? value : "high";
    const high = quality === "high";
    if (materials.blossomMesh) materials.blossomMesh.castShadow = high;
    if (materials.leafMesh) materials.leafMesh.castShadow = high;
    if (petals?.mesh) petals.mesh.visible = quality !== "low";
  }

  const petals = createPetals(420);
  group.add(petals.mesh);

  applyTime();

  function update(dt, elapsed, speed, camera, focusX = 0, player = null) {
    const focus = Number.isFinite(focusX) ? focusX : camera?.position.x ?? 0;
    const focusVelocity =
      lastFocusX === null
        ? 0
        : THREE.MathUtils.clamp((focus - lastFocusX) / Math.max(dt, 0.0001), -45, 45);
    lastFocusX = focus;

    const cameraX = camera?.position.x ?? focus;
    const cameraZ = camera?.position.z ?? 0;
    rain.group.position.set(cameraX, 0, cameraZ);
    rain.update(dt, 0, camera);

    const targetWet = rainOn ? 1 : night ? 0.55 : 0.12;
    wetness = damp(wetness, targetWet, 1.25, dt);
    applyWetness();

    endless.update(focus);

    // The crowd and the avenue traffic live in world space. Recentring the
    // crowd on the car and feeding the car's velocity back as scroll keeps
    // every pedestrian fixed to the pavement while the pool wraps around.
    crowd.group.position.x = focus;
    crowd.update(dt, focusVelocity);
    petals.update(dt, elapsed);
    trafficState.update(dt, focus, player);
    updateTrafficSignals(ctx.trafficSignals, elapsed);

    // Sky, stars and the key light follow the viewer so a long drive never
    // leaves them behind. The moon and sun keep their fixed offset.
    sky.mesh.position.set(cameraX, 0, cameraZ);
    stars.position.set(cameraX, 0, cameraZ);
    moon.position.set(cameraX - 210, 190, cameraZ - 300);
    sun.position.set(cameraX + 240, 210, cameraZ + 170);
    key.position.set(
      cameraX + (night ? -62 : 70),
      night ? 92 : 120,
      cameraZ + (night ? -46 : 58)
    );
    key.target.position.set(cameraX, 0, cameraZ);
    fill.position.set(cameraX + 38, 46, cameraZ + 84);
    fill.target.position.set(cameraX, 4, cameraZ);

    station.train.position.x -= 16.5 * dt;
    if (station.train.position.x < 62) station.train.position.x = 246;
    for (const car of station.cars) {
      for (const bogie of car.userData.bogies) {
        bogie.rotation.z -= (16.5 * dt) / 0.34;
      }
    }

    for (const lantern of lanterns) {
      lantern.group.rotation.z =
        lantern.base + Math.sin(elapsed * 1.7 + lantern.phase) * 0.045;
    }
    for (const mesh of norenMeshes) {
      const phase = mesh.userData.phase ?? 0;
      mesh.rotation.z = Math.sin(elapsed * 1.9 + phase) * 0.045;
    }
    for (const cloth of laundryMeshes) {
      cloth.mesh.rotation.x = Math.sin(elapsed * 1.4 + cloth.phase) * 0.08;
      cloth.mesh.rotation.z = Math.cos(elapsed * 1.1 + cloth.phase) * 0.035;
    }
    for (const cat of cats) {
      const tail = cat.userData.tail;
      if (tail) {
        tail.rotation.y = Math.sin(elapsed * 1.9 + cat.userData.phase) * 0.55;
        tail.rotation.z = 0.15 + Math.sin(elapsed * 1.3 + cat.userData.phase) * 0.18;
      }
    }
    for (const puff of steam) {
      const t = ((elapsed * 0.34 + puff.phase) % 1 + 1) % 1;
      puff.sprite.position.y = 3.1 + t * 2.6;
      puff.sprite.position.x = puff.x + Math.sin(elapsed * 0.6 + puff.phase) * 0.3;
      puff.sprite.position.z = puff.z + Math.cos(elapsed * 0.5 + puff.phase) * 0.2;
      puff.sprite.material.opacity = 0.14 * (1 - t);
      puff.sprite.scale.set(1.4 + t * 1.4, 2.0 + t * 1.8, 1);
    }
    if (materials.waterMesh) {
      materials.waterMesh.material.envMapIntensity = THREE.MathUtils.lerp(
        1.1,
        1.8,
        wetness
      );
    }
  }

  return {
    group,
    environment,
    fog,
    update,
    setRain,
    setTimeOfDay,
    setNeon,
    setQuality,
    pois,
    pickables,
    colliders: blockers,
    trafficSignals: ctx.trafficSignals,
    crowd,
    traffic: trafficState.traffic,
    get night() {
      return night;
    },
    get neon() {
      return neonOn;
    },
    get raining() {
      return rainOn;
    },
    get quality() {
      return quality;
    },
    get exposure() {
      return night ? 1.04 : 1.06;
    },
  };
}




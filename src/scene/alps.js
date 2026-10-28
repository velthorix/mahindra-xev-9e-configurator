import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createCrowd } from "./people.js";

/* -------------------------------------------------------------------------- */
/*  Alpine Pass                                                               */
/* -------------------------------------------------------------------------- */
/*
 * A third driving stage: a snow-covered mountain village at blue hour. Like the
 * city and the village it is entirely procedural. The road is a scrolling
 * treadmill, the chalets, pines and snowbanks ride on it, and a real particle
 * snowfall fills the air around the car.
 */

const TAU = Math.PI * 2;
const CYCLE = 340;
const ROAD_LENGTH = 390;
const ROAD_WIDTH = 11;
const START = -175;
const TILE = 10;

const LANE_PLAYER = 2.0;
const LANE_SAME = 5.25;
const LANE_ONCOMING_INNER = -2.0;
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
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  map.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  map.anisotropy = aniso;
  return map;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* -------------------------------------------------------------------------- */
/*  Textures                                                                  */
/* -------------------------------------------------------------------------- */

function makeSnowTexture() {
  const { canvas, ctx } = canvas2d(512, 512);
  const rand = seeded(801);
  ctx.fillStyle = "#e9eff7";
  ctx.fillRect(0, 0, 512, 512);

  // Broad wind-packed shadows, then fine grain. Pure white snow reads as paper
  // under a directional light, so the blue-grey patches are doing the work.
  for (let i = 0; i < 34; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 30 + rand() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(150,172,198,${0.06 + rand() * 0.1})`);
    g.addColorStop(1, "rgba(150,172,198,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 15000; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const light = rand() > 0.4;
    ctx.fillStyle = light
      ? `rgba(255,255,255,${0.16 + rand() * 0.34})`
      : `rgba(150,172,198,${0.04 + rand() * 0.12})`;
    ctx.fillRect(x, y, 1 + rand() * 1.8, 1 + rand() * 1.8);
  }
  // A few sparkles catch the low sun.
  for (let i = 0; i < 260; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    ctx.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.55})`;
    ctx.fillRect(x, y, 1, 1);
  }
  return texture(canvas, { aniso: 8 });
}

function makeRoadTexture() {
  const { canvas, ctx } = canvas2d(1024, 512);
  const rand = seeded(802);
  ctx.fillStyle = "#5e6873";
  ctx.fillRect(0, 0, 1024, 512);

  for (let i = 0; i < 20000; i++) {
    const x = rand() * 1024;
    const y = rand() * 512;
    const light = rand() > 0.55;
    ctx.fillStyle = light
      ? `rgba(214,226,238,${0.015 + rand() * 0.07})`
      : `rgba(10,14,18,${0.02 + rand() * 0.08})`;
    ctx.fillRect(x, y, 1 + rand() * 2.2, 1 + rand() * 2.2);
  }

  // Snow pushed to the edges by the plough.
  for (const side of [0, 1]) {
    const g = ctx.createLinearGradient(0, side ? 512 : 0, 0, side ? 430 : 82);
    g.addColorStop(0, "rgba(240,246,252,0.92)");
    g.addColorStop(0.55, "rgba(232,240,248,0.5)");
    g.addColorStop(1, "rgba(232,240,248,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, side ? 420 : 0, 1024, 92);
  }

  // Packed wheel tracks.
  for (const y of [128, 384]) {
    const g = ctx.createLinearGradient(0, y - 50, 0, y + 58);
    g.addColorStop(0, "rgba(26,32,38,0)");
    g.addColorStop(0.5, "rgba(26,32,38,0.26)");
    g.addColorStop(1, "rgba(26,32,38,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 50, 1024, 108);
  }

  // Faint centre dashes.
  ctx.fillStyle = "rgba(226,232,230,0.62)";
  for (let i = 0; i < 2; i++) {
    ctx.fillRect(i * 512 + 56, 254, 286, 5);
  }

  // Salt streaks.
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(235,242,250,${0.03 + rand() * 0.08})`;
    ctx.lineWidth = 1 + rand() * 2;
    const y = rand() * 512;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(300, y + (rand() - 0.5) * 18, 700, y + (rand() - 0.5) * 18, 1024, y);
    ctx.stroke();
  }

  return texture(canvas, { aniso: 8 });
}

function makeIceTexture() {
  const { canvas, ctx } = canvas2d(512, 512);
  const rand = seeded(803);
  ctx.fillStyle = "#a9c9dc";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 60; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 20 + rand() * 80;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(230,246,255,${0.1 + rand() * 0.2})`);
    g.addColorStop(1, "rgba(230,246,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 22; i++) {
    ctx.strokeStyle = `rgba(244,252,255,${0.18 + rand() * 0.3})`;
    ctx.lineWidth = 0.8 + rand() * 1.6;
    let x = rand() * 512;
    let y = rand() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (rand() - 0.5) * 120;
      y += (rand() - 0.5) * 120;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return texture(canvas, { aniso: 8 });
}

function makeSkyTexture() {
  const { canvas, ctx } = canvas2d(1024, 512);
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#07111f");
  grad.addColorStop(0.2, "#10243d");
  grad.addColorStop(0.36, "#2b4a6d");
  grad.addColorStop(0.45, "#7b7f99");
  grad.addColorStop(0.5, "#e2b49e");
  grad.addColorStop(0.56, "#c99c8f");
  grad.addColorStop(0.68, "#77818f");
  grad.addColorStop(1, "#4b5663");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  const rand = seeded(804);
  // Stars in the upper sky.
  for (let i = 0; i < 260; i++) {
    const x = rand() * 1024;
    const y = rand() * 190;
    const a = 0.2 + rand() * 0.7;
    ctx.fillStyle = `rgba(230,240,255,${a})`;
    const s = rand() > 0.9 ? 1.8 : 1;
    ctx.fillRect(x, y, s, s);
  }

  // Moon with a soft halo, high on the left.
  const moon = ctx.createRadialGradient(250, 110, 2, 250, 110, 120);
  moon.addColorStop(0, "rgba(244,248,255,0.95)");
  moon.addColorStop(0.12, "rgba(226,238,255,0.5)");
  moon.addColorStop(0.42, "rgba(190,214,246,0.14)");
  moon.addColorStop(1, "rgba(190,214,246,0)");
  ctx.fillStyle = moon;
  ctx.fillRect(120, 0, 260, 240);
  ctx.fillStyle = "rgba(250,252,255,0.96)";
  ctx.beginPath();
  ctx.arc(250, 110, 17, 0, TAU);
  ctx.fill();

  // Thin dusk cloud bands.
  for (let i = 0; i < 16; i++) {
    const x = rand() * 1024;
    const y = 120 + rand() * 150;
    const rx = 70 + rand() * 190;
    const ry = 4 + rand() * 14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(
      0,
      i % 4 === 0
        ? "rgba(255,210,190,0.22)"
        : "rgba(200,216,236,0.16)"
    );
    g.addColorStop(1, "rgba(200,216,236,0)");
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

function makeWoodTexture() {
  const { canvas, ctx } = canvas2d(256, 256);
  const rand = seeded(805);
  ctx.fillStyle = "#7a5d47";
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) {
    ctx.fillStyle = `rgba(46,30,20,${0.16 + rand() * 0.12})`;
    ctx.fillRect(0, y, 256, 1.5);
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = `rgba(154,116,84,${0.12 + rand() * 0.16})`;
      ctx.lineWidth = 0.6 + rand();
      ctx.beginPath();
      const yy = y + 2 + rand() * 5;
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(80, yy + (rand() - 0.5) * 5, 170, yy + (rand() - 0.5) * 5, 256, yy);
      ctx.stroke();
    }
  }
  // A few pale knots and weathered patches so the wall is not a striped sheet.
  for (let i = 0; i < 12; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    ctx.strokeStyle = `rgba(138,104,72,${0.14 + rand() * 0.12})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + rand() * 4, 1 + rand() * 2, 0, 0, TAU);
    ctx.stroke();
  }
  return texture(canvas, { aniso: 4 });
}

function makePlasterTexture() {
  const { canvas, ctx } = canvas2d(256, 256);
  const rand = seeded(808);
  ctx.fillStyle = "#e9e2d6";
  ctx.fillRect(0, 0, 256, 256);
  // Broad trowel patches and fine aggregate. Without this the rendered walls
  // read as untextured white boxes at close range.
  for (let i = 0; i < 70; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 10 + rand() * 38;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(120,108,90,${0.025 + rand() * 0.04})`);
    g.addColorStop(1, "rgba(120,108,90,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9000; i++) {
    const light = rand() > 0.48;
    ctx.fillStyle = light
      ? `rgba(255,252,244,${0.08 + rand() * 0.16})`
      : `rgba(118,108,94,${0.03 + rand() * 0.09})`;
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 1.4, 1 + rand() * 1.4);
  }
  return texture(canvas, { aniso: 4 });
}

function makeStoneTexture() {
  const { canvas, ctx } = canvas2d(256, 256);
  const rand = seeded(807);
  ctx.fillStyle = "#6f6f6a";
  ctx.fillRect(0, 0, 256, 256);
  const rows = 7;
  const rowH = 256 / rows;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : -22;
    const cols = 5;
    const colW = 256 / cols;
    for (let col = -1; col <= cols; col++) {
      const x = offset + col * colW + 2;
      const y = row * rowH + 2;
      const v = 104 + Math.floor(rand() * 30);
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      ctx.fillRect(x, y, colW - 4, rowH - 4);
      // Chipped corners and a lighter top edge.
      ctx.fillStyle = "rgba(210,212,206,0.16)";
      ctx.fillRect(x + 2, y + 1, colW - 8, 2);
      ctx.fillStyle = "rgba(30,30,28,0.28)";
      ctx.fillRect(x + 2, y + rowH - 6, colW - 8, 2);
      for (let s = 0; s < 16; s++) {
        ctx.fillStyle =
          rand() > 0.5
            ? `rgba(235,235,228,${rand() * 0.08})`
            : `rgba(28,28,26,${rand() * 0.1})`;
        ctx.fillRect(x + rand() * (colW - 6), y + rand() * (rowH - 6), 1.5, 1.5);
      }
    }
  }
  // Mortar shadow lines.
  ctx.strokeStyle = "rgba(44,44,42,0.55)";
  ctx.lineWidth = 2;
  for (let row = 0; row <= rows; row++) {
    ctx.beginPath();
    ctx.moveTo(0, row * rowH);
    ctx.lineTo(256, row * rowH);
    ctx.stroke();
  }
  return texture(canvas, { aniso: 4 });
}

function makeSnowflakeTexture() {
  const { canvas, ctx } = canvas2d(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return texture(canvas, { repeat: false, aniso: 2 });
}

function makeGlowTexture() {
  const { canvas, ctx } = canvas2d(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.18, "rgba(255,236,196,0.7)");
  g.addColorStop(0.55, "rgba(255,196,120,0.18)");
  g.addColorStop(1, "rgba(255,180,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return texture(canvas, { repeat: false, aniso: 2 });
}

function makeSignTexture(label, accent = "#d8b06a") {
  const { canvas, ctx } = canvas2d(512, 160);
  ctx.fillStyle = "#241a14";
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.strokeRect(12, 12, 488, 136);
  ctx.fillStyle = "#f1dfbb";
  ctx.font = "600 58px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 256, 82);
  return texture(canvas, { repeat: false, aniso: 4 });
}

function makeEnvironment(renderer, skyTexture) {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x9db4cc);

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
    new THREE.MeshBasicMaterial({ color: 0x8e9caa, toneMapped: false })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  envScene.add(ground);

  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.MeshBasicMaterial({ color: 0xf2f6ff, toneMapped: false })
  );
  moon.position.set(-30, 36, 38);
  moon.lookAt(0, 2, 0);
  envScene.add(moon);

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
/*  Geometry helpers                                                          */
/* -------------------------------------------------------------------------- */

function makeRoofGeometry(w, d, rise) {
  const hw = w / 2;
  const hd = d / 2;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const push = (x, y, z, nx, ny, nz, u, v) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };
  const slope = Math.atan2(rise, hd);
  const nz = Math.sin(slope);
  const ny = Math.cos(slope);

  // Road-facing slope.
  let a = push(-hw, 0, hd, 0, ny, nz, 0, 0);
  let b = push(hw, 0, hd, 0, ny, nz, 1, 0);
  let c = push(hw, rise, 0, 0, ny, nz, 1, 1);
  let d0 = push(-hw, rise, 0, 0, ny, nz, 0, 1);
  indices.push(a, b, c, a, c, d0);

  // Rear slope.
  a = push(hw, 0, -hd, 0, ny, -nz, 0, 0);
  b = push(-hw, 0, -hd, 0, ny, -nz, 1, 0);
  c = push(-hw, rise, 0, 0, ny, -nz, 1, 1);
  d0 = push(hw, rise, 0, 0, ny, -nz, 0, 1);
  indices.push(a, b, c, a, c, d0);

  // Gable ends.
  for (const side of [-1, 1]) {
    const x = side * hw;
    const nx = side;
    a = push(x, 0, -hd, nx, 0, 0, 0, 0);
    b = push(x, 0, hd, nx, 0, 0, 1, 0);
    c = push(x, rise, 0, nx, 0, 0, 0.5, 1);
    if (side > 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}

/* -------------------------------------------------------------------------- */
/*  Public                                                                    */
/* -------------------------------------------------------------------------- */

export function createAlps(renderer) {
  const group = new THREE.Group();
  group.name = "Alps";
  group.position.z = -LANE_PLAYER;
  group.visible = false;

  const rand = seeded(2601);
  const props = [];
  const farProps = [];
  const smoke = [];
  const stringLights = [];

  /* ------------------------------- sky ---------------------------------- */
  const skyTexture = makeSkyTexture();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 48, 28),
    new THREE.MeshBasicMaterial({
      map: skyTexture,
      side: THREE.BackSide,
      toneMapped: false,
      fog: false,
    })
  );
  sky.name = "AlpsSky";
  group.add(sky);

  /* ------------------------------ ground -------------------------------- */
  const snowTexture = makeSnowTexture();
  const glowTexture = makeGlowTexture();
  snowTexture.repeat.set(64, 42);
  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xe8eef6,
    map: snowTexture,
    roughness: 0.9,
    metalness: 0.0,
    envMapIntensity: 0.28,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 460), snowMat);
  ground.name = "AlpsGround";
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  group.add(ground);

  // Soft snow hills rising away from the road. They are simple flattened
  // icosahedrons: from the driver's seat the silhouette is what sells the
  // valley, not the topology.
  const hillMat = new THREE.MeshStandardMaterial({
    color: 0xdfe9f3,
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
    envMapIntensity: 0.24,
  });
  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const hill = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      hillMat
    );
    hill.position.set(
      -260 + (i / 13) * 520 + (rand() - 0.5) * 30,
      -1.2 + rand() * 0.4,
      side * (42 + rand() * 80)
    );
    hill.scale.set(34 + rand() * 42, 5 + rand() * 8, 24 + rand() * 30);
    hill.rotation.y = rand() * TAU;
    group.add(hill);
  }

  /* ------------------------------- road --------------------------------- */
  const roadTexture = makeRoadTexture();
  roadTexture.repeat.set(ROAD_LENGTH / TILE, 1);
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0xd6dde4,
    map: roadTexture,
    roughness: 0.82,
    metalness: 0.04,
    envMapIntensity: 0.32,
  });
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_LENGTH, ROAD_WIDTH),
    roadMaterial
  );
  road.name = "AlpsRoad";
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  group.add(road);

  // Snowbanks: low, plough-packed ribbons at the shoulder. They have to stay
  // small: a close-up chase camera passes within a couple of metres of them,
  // and a big rounded mound reads as a white boulder, not a snowbank.
  const bankMat = new THREE.MeshStandardMaterial({
    color: 0xf1f6fc,
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.24,
  });
  const bankGeo = new THREE.SphereGeometry(1, 9, 5);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 46; i++) {
      const bank = new THREE.Mesh(bankGeo, bankMat);
      const x = START + (i / 46) * CYCLE + (rand() - 0.5) * 4;
      bank.position.set(
        x,
        0.04 + rand() * 0.03,
        side * (ROAD_WIDTH / 2 + 0.42 + rand() * 0.25)
      );
      bank.scale.set(1.5 + rand() * 1.5, 0.14 + rand() * 0.1, 0.42 + rand() * 0.3);
      bank.rotation.y = rand() * TAU;
      bank.castShadow = true;
      bank.receiveShadow = true;
      group.add(bank);
      props.push(bank);
    }
  }

  // Ploughed ice at the road edge.
  const iceTexture = makeIceTexture();
  iceTexture.repeat.set(ROAD_LENGTH / 18, 1);
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0xc8e0ee,
    map: iceTexture,
    roughness: 0.2,
    metalness: 0.1,
    envMapIntensity: 0.8,
    transparent: true,
    opacity: 0.85,
  });
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_LENGTH, 0.55),
      iceMat
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.004, side * (ROAD_WIDTH / 2 - 0.4));
    group.add(strip);
  }

  // Kerbs and a trodden pavement edge. A thin stone lip and a slightly grey
  // snow strip stop the road from floating on the white plane.
  const kerbMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3ab,
    roughness: 0.92,
    metalness: 0.02,
    envMapIntensity: 0.2,
  });
  const pavementMat = new THREE.MeshStandardMaterial({
    color: 0xc8d2dc,
    roughness: 0.95,
    metalness: 0,
    map: snowTexture,
    envMapIntensity: 0.22,
  });
  for (const side of [-1, 1]) {
    const kerb = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_LENGTH, 0.12, 0.18),
      kerbMat
    );
    kerb.position.set(0, 0.06, side * (ROAD_WIDTH / 2 + 0.09));
    kerb.receiveShadow = true;
    group.add(kerb);
    const pavement = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_LENGTH, 0.08, 1.9),
      pavementMat
    );
    pavement.position.set(0, 0.04, side * (ROAD_WIDTH / 2 + 1.15));
    pavement.receiveShadow = true;
    group.add(pavement);
  }

  // Red-and-white snow poles mark the road under the snow.
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0xf1f4f7,
    roughness: 0.7,
    metalness: 0.05,
  });
  const poleRedMat = new THREE.MeshStandardMaterial({
    color: 0xb3362f,
    roughness: 0.65,
    metalness: 0.05,
    emissive: 0x300806,
    emissiveIntensity: 0.4,
  });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 13; i++) {
      const post = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.055, 1.5, 6),
        poleMat
      );
      shaft.position.y = 0.75;
      post.add(shaft);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.052, 0.22, 6),
        poleRedMat
      );
      band.position.y = 1.28;
      post.add(band);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 6, 5),
        poleRedMat
      );
      tip.position.y = 1.52;
      post.add(tip);
      post.position.set(START + (i / 13) * CYCLE + rand() * 8, 0, side * (ROAD_WIDTH / 2 + 0.42));
      group.add(post);
      props.push(post);
    }
  }

  // Village street lamps. The globe and the cone of light do most of the work;
  // only a handful of real point lights are used to keep the frame cheap.
  const lampMetalMat = new THREE.MeshStandardMaterial({
    color: 0x252c33,
    roughness: 0.6,
    metalness: 0.55,
    envMapIntensity: 0.5,
  });
  const lampConeMat = new THREE.MeshBasicMaterial({
    color: 0xffc27a,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: true,
  });
  const lampPoolMat = new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: 0xffb066,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: true,
  });
  for (let i = 0; i < 9; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.08, 4.2, 8),
      lampMetalMat
    );
    pole.position.y = 2.1;
    pole.castShadow = true;
    lamp.add(pole);
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.85, 6),
      lampMetalMat
    );
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, 4.14, -side * 0.4);
    lamp.add(arm);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.22, 10, 1, true),
      lampMetalMat
    );
    shade.rotation.x = Math.PI;
    shade.position.set(0, 4.05, -side * 0.8);
    lamp.add(shade);
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd9a2, toneMapped: false, fog: true })
    );
    globe.position.set(0, 3.96, -side * 0.8);
    lamp.add(globe);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.7, 4.0, 12, 1, true),
      lampConeMat
    );
    cone.position.set(0, 2.0, -side * 0.8);
    lamp.add(cone);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), lampPoolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.015, -side * 0.8);
    lamp.add(pool);
    lamp.position.set(START + (i / 9) * CYCLE + rand() * 6, 0, side * (ROAD_WIDTH / 2 + 1.5));
    lamp.rotation.y = side > 0 ? 0 : Math.PI;
    group.add(lamp);
    props.push(lamp);
    if (i % 3 === 1) {
      const light = new THREE.PointLight(0xffb066, 3.4, 13, 2);
      light.position.set(0, 3.9, -side * 0.8);
      lamp.add(light);
    }
  }

  /* ----------------------------- mountains ------------------------------ */
  const mountainRockMat = new THREE.MeshStandardMaterial({
    color: 0x6b7889,
    roughness: 0.96,
    metalness: 0.0,
    flatShading: true,
    envMapIntensity: 0.2,
  });
  const mountainSnowMat = new THREE.MeshStandardMaterial({
    color: 0xdce8f4,
    roughness: 0.88,
    metalness: 0.0,
    flatShading: true,
    envMapIntensity: 0.3,
  });
  const peaks = [
    [-210, -190, 62, 44],
    [-130, -215, 76, 54],
    [-40, -230, 58, 40],
    [60, -218, 84, 58],
    [160, -195, 68, 46],
    [240, -160, 54, 36],
    [-250, -110, 48, 32],
    [250, -70, 52, 34],
    [270, 40, 46, 30],
    [-270, 30, 52, 34],
    [-245, 120, 58, 38],
    [245, 140, 62, 40],
  ];
  for (const [x, z, height, radius] of peaks) {
    const base = new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 5, 1),
      mountainRockMat
    );
    base.position.set(x, height / 2 - 2, z);
    base.rotation.y = rand() * TAU;
    group.add(base);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.72, height * 0.58, 5, 1),
      mountainSnowMat
    );
    cap.position.set(x, height * 0.71 - 2, z);
    cap.rotation.y = base.rotation.y;
    group.add(cap);
  }

  // A low ridge behind the road, closer than the peaks, so the horizon is not
  // an empty strip of sky between the trees and the mountains.
  const ridgeMat = new THREE.MeshStandardMaterial({
    color: 0x8b9aab,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  });
  for (let i = 0; i < 10; i++) {
    const ridge = new THREE.Mesh(
      new THREE.ConeGeometry(34 + rand() * 22, 20 + rand() * 16, 5, 1),
      ridgeMat
    );
    ridge.position.set(-260 + i * 58 + rand() * 18, 7, -118 - rand() * 30);
    ridge.rotation.y = rand() * TAU;
    group.add(ridge);
  }

  // A farther wall of high peaks, softened by fog. These fill the horizon
  // behind the ski lift and make the valley feel enclosed.
  for (let i = 0; i < 7; i++) {
    const height = 84 + rand() * 34;
    const radius = 56 + rand() * 28;
    const x = -300 + i * 100 + (rand() - 0.5) * 40;
    const base = new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 6, 1),
      mountainRockMat
    );
    base.position.set(x, height / 2 - 6, -265 - rand() * 30);
    base.rotation.y = rand() * TAU;
    group.add(base);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.66, height * 0.52, 6, 1),
      mountainSnowMat
    );
    cap.position.set(x, height * 0.68 - 6, base.position.z);
    cap.rotation.y = base.rotation.y;
    group.add(cap);
  }

  // Ski lift: two cables strung between the pylons with empty chairs. The
  // chairs are tiny at this distance, but their rhythm along the cable is what
  // makes the hillside read as a working resort rather than scenery.
  {
    const pylonX = [];
    for (let i = 0; i < 5; i++) pylonX.push(-130 + i * 58);
    const cableMat = new THREE.LineBasicMaterial({
      color: 0x6b7782,
      transparent: true,
      opacity: 0.8,
      fog: true,
    });
    for (const offsetZ of [0, 1.6]) {
      const points = [];
      for (let i = 0; i < pylonX.length; i++) {
        points.push(new THREE.Vector3(pylonX[i], 11.4, -78 + offsetZ));
        if (i < pylonX.length - 1) {
          points.push(
            new THREE.Vector3(
              (pylonX[i] + pylonX[i + 1]) / 2,
              10.85,
              -78 + offsetZ
            )
          );
        }
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const cable = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(160)),
        cableMat
      );
      group.add(cable);
      const chairMat = new THREE.MeshStandardMaterial({
        color: 0x2c3339,
        roughness: 0.7,
        metalness: 0.3,
      });
      const chairMatRed = new THREE.MeshStandardMaterial({
        color: 0x8c2f2a,
        roughness: 0.7,
        metalness: 0.2,
      });
      for (let i = 0; i < 12; i++) {
        const u = (i + 0.5) / 12;
        const point = curve.getPointAt(u);
        const hanger = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 1.15, 4),
          chairMat
        );
        hanger.position.set(point.x, point.y - 0.58, point.z);
        group.add(hanger);
        const chair = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.1, 0.52),
          i % 3 === 0 ? chairMatRed : chairMat
        );
        chair.position.set(point.x, point.y - 1.18, point.z);
        group.add(chair);
        const back = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.44, 0.07),
          i % 3 === 0 ? chairMatRed : chairMat
        );
        back.position.set(point.x - 0.26, point.y - 0.96, point.z);
        group.add(back);
      }
    }
  }

  /* ------------------------------- lake --------------------------------- */
  const lake = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 80),
    new THREE.MeshPhysicalMaterial({
      color: 0xa7c7db,
      map: iceTexture,
      roughness: 0.14,
      metalness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.1,
    })
  );
  lake.name = "FrozenLake";
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(-74, 0.006, 64);
  group.add(lake);

  /* ------------------------------ pines --------------------------------- */
  const pineMat = new THREE.MeshStandardMaterial({
    color: 0x203c33,
    roughness: 0.92,
    metalness: 0.0,
    flatShading: true,
    envMapIntensity: 0.2,
  });
  const pineSnowMat = new THREE.MeshStandardMaterial({
    color: 0xe4edf6,
    roughness: 0.9,
    metalness: 0.0,
    flatShading: true,
    envMapIntensity: 0.24,
  });
  const pineTrunkMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a1e,
    roughness: 0.95,
    metalness: 0,
  });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.2, 7);
  const coneGeo = new THREE.ConeGeometry(1, 1, 10, 1);
  const pineTemplate = new THREE.Group();
  {
    const trunk = new THREE.Mesh(trunkGeo, pineTrunkMat);
    trunk.position.y = 1.1;
    trunk.castShadow = true;
    pineTemplate.add(trunk);
    // Five staggered skirts, each with a snow cap. More layers keep the
    // silhouette from reading as three giant flat triangles up close.
    const layers = [
      { y: 1.95, r: 1.72, h: 1.85, ox: 0.02, oz: 0.0 },
      { y: 2.85, r: 1.5, h: 1.7, ox: -0.03, oz: 0.04 },
      { y: 3.72, r: 1.24, h: 1.55, ox: 0.03, oz: -0.03 },
      { y: 4.55, r: 0.96, h: 1.4, ox: -0.02, oz: 0.02 },
      { y: 5.3, r: 0.66, h: 1.25, ox: 0.01, oz: 0.0 },
    ];
    layers.forEach((layer, index) => {
      const cone = new THREE.Mesh(coneGeo, pineMat);
      cone.scale.set(layer.r, layer.h, layer.r);
      cone.position.set(layer.ox, layer.y, layer.oz);
      cone.rotation.y = index * 0.7;
      cone.castShadow = true;
      pineTemplate.add(cone);
      const snow = new THREE.Mesh(coneGeo, pineSnowMat);
      snow.scale.set(layer.r * 0.88, layer.h * 0.28, layer.r * 0.88);
      snow.position.set(layer.ox, layer.y + layer.h * 0.42, layer.oz);
      snow.rotation.y = index * 0.7 + 0.2;
      pineTemplate.add(snow);
    });
  }

  function addPine(x, z, scale) {
    const tree = pineTemplate.clone(true);
    tree.position.set(x, 0, z);
    tree.scale.setScalar(scale);
    tree.rotation.y = rand() * TAU;
    group.add(tree);
    props.push(tree);
    return tree;
  }

  for (let i = 0; i < 54; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = START + rand() * CYCLE;
    const z = side * (13 + rand() * 46);
    addPine(x, z, 0.8 + rand() * 1.5);
  }
  // Denser pine wall on the far side, behind the chalets.
  for (let i = 0; i < 34; i++) {
    const x = START + rand() * CYCLE;
    const z = -44 - rand() * 52;
    addPine(x, z, 1.2 + rand() * 1.8);
  }

  /* ------------------------------ chalets ------------------------------- */
  const woodTexture = makeWoodTexture();
  // The map already carries the dark timber colour. The old material multiplied
  // it by another dark brown, which crushed the planks to black; a pale tint
  // lets the grain and the horizontal courses read under the blue-hour light.
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xd6c6b4,
    map: woodTexture,
    roughness: 0.82,
    metalness: 0.02,
    envMapIntensity: 0.35,
  });
  const woodMats = [0xd6c6b4, 0xc8b29a, 0xe0d0bc].map(
    (color) =>
      new THREE.MeshStandardMaterial({
        color,
        map: woodTexture,
        roughness: 0.82,
        metalness: 0.02,
        envMapIntensity: 0.35,
      })
  );
  const plasterTexture = makePlasterTexture();
  plasterTexture.repeat.set(2.2, 1.4);
  const plasterMat = new THREE.MeshStandardMaterial({
    color: 0xe7e0d2,
    map: plasterTexture,
    roughness: 0.9,
    metalness: 0.0,
    envMapIntensity: 0.3,
  });
  const plasterMats = [0xefe8da, 0xe5d8c1, 0xdccbb3, 0xf2ecdf].map(
    (color) =>
      new THREE.MeshStandardMaterial({
        color,
        map: plasterTexture,
        roughness: 0.9,
        metalness: 0.0,
        envMapIntensity: 0.3,
      })
  );
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x3d2b25,
    roughness: 0.88,
    metalness: 0.05,
    envMapIntensity: 0.3,
  });
  const roofMats = [0x3d2b25, 0x4a3329, 0x332724].map(
    (color) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.88,
        metalness: 0.05,
        envMapIntensity: 0.3,
      })
  );
  // A snow cap needs the same wind-packed grain as the ground, otherwise the
  // big roof planes read as flat white paper from the chase camera.
  const roofSnowTexture = snowTexture.clone();
  roofSnowTexture.needsUpdate = true;
  roofSnowTexture.repeat.set(2.6, 2.2);
  const roofSnowMat = new THREE.MeshStandardMaterial({
    color: 0xf0f5fb,
    map: roofSnowTexture,
    roughness: 0.9,
    metalness: 0.0,
    envMapIntensity: 0.26,
  });
  const warmWindowMat = new THREE.MeshStandardMaterial({
    color: 0xffcf8a,
    emissive: 0xffa94d,
    emissiveIntensity: 2.1,
    roughness: 0.35,
    metalness: 0.0,
    toneMapped: true,
  });
  const darkWindowMat = new THREE.MeshStandardMaterial({
    color: 0x1b2833,
    roughness: 0.18,
    metalness: 0.35,
    envMapIntensity: 1.2,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a20,
    roughness: 0.8,
    metalness: 0.05,
  });
  const stoneTexture = makeStoneTexture();
  stoneTexture.repeat.set(1.6, 1.6);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xbfbfb8,
    map: stoneTexture,
    roughness: 0.96,
    metalness: 0.0,
  });
  const lightBulbMat = new THREE.MeshBasicMaterial({
    color: 0xffd49a,
    toneMapped: false,
    fog: true,
  });
  const icicleMat = new THREE.MeshStandardMaterial({
    color: 0xdcecf7,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.8,
    envMapIntensity: 1.2,
  });
  const wreathMat = new THREE.MeshStandardMaterial({
    color: 0x24452d,
    roughness: 0.9,
  });
  const bowMat = new THREE.MeshStandardMaterial({
    color: 0x8c2f2a,
    roughness: 0.75,
  });
  const bloomRedMat = new THREE.MeshStandardMaterial({
    color: 0x8c2f2a,
    roughness: 0.85,
  });
  const bloomGreenMat = new THREE.MeshStandardMaterial({
    color: 0x2c4a30,
    roughness: 0.85,
  });

  const chaletLights = [];
  function makeChalet({ wide = false, near = true } = {}) {
    const house = new THREE.Group();
    const w = (wide ? 9 : 6.4) + rand() * 2.6;
    const d = 6 + rand() * 2.4;
    const h = 3.2 + rand() * 1.3;
    const rise = 2.0 + rand() * 0.9;
    const lowerIsPlaster = rand() > 0.52;
    const lowerMat = lowerIsPlaster
      ? plasterMats[Math.floor(rand() * plasterMats.length)]
      : woodMats[Math.floor(rand() * woodMats.length)];
    const upperMat = woodMats[Math.floor(rand() * woodMats.length)];
    const houseRoofMat = roofMats[Math.floor(rand() * roofMats.length)];

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.2, 0.55, d + 0.2),
      stoneMat
    );
    plinth.position.y = 0.27;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    house.add(plinth);

    const lower = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      lowerMat
    );
    lower.position.y = h / 2 + 0.1;
    lower.castShadow = true;
    lower.receiveShadow = true;
    house.add(lower);

    // Timber upper floor, slightly overhanging.
    const upperH = 1.5 + rand() * 0.6;
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.25, upperH, d + 0.2),
      upperMat
    );
    upper.position.y = h + 0.1 + upperH / 2;
    upper.castShadow = true;
    house.add(upper);

    // Exposed timber frame on the plastered ground floor. It is the detail that
    // separates an Alpine chalet from a plain rendered box.
    if (lowerIsPlaster) {
      for (const bx of [-w * 0.4, 0, w * 0.4]) {
        const beam = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, h - 0.3, 0.06),
          trimMat
        );
        beam.position.set(bx, h * 0.5 + 0.1, d / 2 + 0.03);
        house.add(beam);
      }
      for (const by of [0.3, h - 0.1]) {
        const beam = new THREE.Mesh(
          new THREE.BoxGeometry(w - 0.08, 0.14, 0.06),
          trimMat
        );
        beam.position.set(0, by, d / 2 + 0.03);
        house.add(beam);
      }
    }

    const roof = new THREE.Mesh(
      makeRoofGeometry(w + 1.8, d + 1.8, rise),
      houseRoofMat
    );
    roof.position.y = h + 0.1 + upperH;
    roof.castShadow = true;
    roof.receiveShadow = true;
    house.add(roof);

    // A thick snow cap, offset up so it reads as a separate layer.
    const snowRoof = new THREE.Mesh(
      makeRoofGeometry(w + 1.9, d + 1.9, rise + 0.03),
      roofSnowMat
    );
    snowRoof.position.y = h + 0.16 + upperH;
    snowRoof.castShadow = false;
    house.add(snowRoof);

    // Eave brackets under the deep overhang.
    const eaveY = h + 0.1 + upperH;
    for (let i = 0; i < 6; i++) {
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.55, 0.8),
        trimMat
      );
      bracket.position.set(
        -w * 0.42 + (i / 5) * w * 0.84,
        eaveY - 0.08,
        d / 2 + 0.48
      );
      bracket.rotation.x = 0.5;
      house.add(bracket);
    }

    // Chimney with a snow cap and a smoke plume.
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1.8, 0.55),
      stoneMat
    );
    chimney.position.set(w * 0.28, h + upperH + rise * 0.55, d * 0.18);
    chimney.castShadow = true;
    house.add(chimney);
    const chimneySnow = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.12, 0.66),
      roofSnowMat
    );
    chimneySnow.position.set(w * 0.28, h + upperH + rise * 0.55 + 0.92, d * 0.18);
    house.add(chimneySnow);
    if (near) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 6, 5),
        new THREE.MeshBasicMaterial({
          color: 0xdfe7ef,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        })
      );
      puff.position.set(w * 0.28, h + upperH + rise * 0.55 + 1.5, d * 0.18);
      house.add(puff);
      smoke.push({ mesh: puff, phase: rand() * TAU, baseY: puff.position.y });
    }

    // Balcony across the road-facing side.
    const balconyZ = d / 2 + 0.55;
    const balcony = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.86, 0.16, 1.1),
      woodMat
    );
    balcony.position.set(0, h + 0.22, balconyZ);
    balcony.castShadow = true;
    house.add(balcony);
    const balconySnow = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.84, 0.06, 1.02),
      roofSnowMat
    );
    balconySnow.position.set(0, h + 0.31, balconyZ);
    house.add(balconySnow);
    const railTop = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.86, 0.08, 0.08),
      trimMat
    );
    railTop.position.set(0, h + 0.98, balconyZ + 0.5);
    house.add(railTop);
    const railSnow = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.88, 0.055, 0.13),
      roofSnowMat
    );
    railSnow.position.set(0, h + 1.04, balconyZ + 0.5);
    house.add(railSnow);
    for (let i = 0; i < 8; i++) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.78, 0.07),
        trimMat
      );
      post.position.set(-w * 0.4 + (i / 7) * w * 0.8, h + 0.62, balconyZ + 0.5);
      house.add(post);
    }

    // Windows: warm on the road side, with dark timber shutters.
    const frontZ = d / 2 + 0.012;
    for (const x of [-w * 0.26, w * 0.26]) {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 1.25, 0.08),
        trimMat
      );
      frame.position.set(x, h * 0.55, frontZ);
      house.add(frame);
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.82, 1.02),
        rand() > 0.28 ? warmWindowMat : darkWindowMat
      );
      pane.position.set(x, h * 0.55, frontZ + 0.05);
      house.add(pane);
      for (const side of [-1, 1]) {
        const shutter = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 1.16, 0.05),
          trimMat
        );
        shutter.position.set(x + side * 0.63, h * 0.55, frontZ + 0.03);
        house.add(shutter);
        const shutterSnow = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.05, 0.08),
          roofSnowMat
        );
        shutterSnow.position.set(
          x + side * 0.63,
          h * 0.55 + 0.61,
          frontZ + 0.035
        );
        house.add(shutterSnow);
      }
      // A snow-dusted window box with a few dark geraniums.
      const boxWood = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.18, 0.28),
        trimMat
      );
      boxWood.position.set(x, h * 0.55 - 0.72, frontZ + 0.14);
      house.add(boxWood);
      const boxSnow = new THREE.Mesh(
        new THREE.BoxGeometry(1.18, 0.07, 0.3),
        roofSnowMat
      );
      boxSnow.position.set(x, h * 0.55 - 0.62, frontZ + 0.15);
      house.add(boxSnow);
      for (let f = 0; f < 3; f++) {
        const bloom = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 5, 4),
          f === 1 ? bloomRedMat : bloomGreenMat
        );
        bloom.position.set(x - 0.3 + f * 0.3, h * 0.55 - 0.53, frontZ + 0.16);
        house.add(bloom);
      }
    }

    // Upper windows under the gable.
    for (const x of [-w * 0.2, w * 0.2]) {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.92, 0.07),
        trimMat
      );
      frame.position.set(x, h + 0.95, frontZ + 0.02);
      house.add(frame);
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.72),
        rand() > 0.2 ? warmWindowMat : darkWindowMat
      );
      pane.position.set(x, h + 0.95, frontZ + 0.06);
      house.add(pane);
    }

    // Gable-end windows. A chalet passes the camera side-on as often as it
    // faces it, and blank side walls made the houses read as white boxes.
    for (const side of [-1, 1]) {
      const sideX = side * (w / 2 + 0.04);
      const sideFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 1.1, 0.98),
        trimMat
      );
      sideFrame.position.set(sideX, h * 0.55, 0);
      house.add(sideFrame);
      const sidePane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.78, 0.9),
        rand() > 0.3 ? warmWindowMat : darkWindowMat
      );
      sidePane.position.set(side * (w / 2 + 0.09), h * 0.55, 0);
      sidePane.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      house.add(sidePane);
      const sideSill = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.06, 1.08),
        roofSnowMat
      );
      sideSill.position.set(side * (w / 2 + 0.1), h * 0.55 - 0.62, 0);
      house.add(sideSill);

      // Upper gable window, tucked under the deep overhang.
      const upperX = side * ((w + 0.25) / 2 + 0.04);
      const upperFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.82, 0.72),
        trimMat
      );
      upperFrame.position.set(upperX, h + 0.95, 0);
      house.add(upperFrame);
      const upperPane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.56, 0.62),
        rand() > 0.24 ? warmWindowMat : darkWindowMat
      );
      upperPane.position.set(side * ((w + 0.25) / 2 + 0.09), h + 0.95, 0);
      upperPane.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      house.add(upperPane);
    }

    // Door with a small canopy and a porch lamp.
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.0, 0.08),
      trimMat
    );
    door.position.set(w * 0.02, 1.05, frontZ + 0.02);
    house.add(door);
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.18, 0.72),
      stoneMat
    );
    step.position.set(w * 0.02, 0.09, frontZ + 0.36);
    step.receiveShadow = true;
    house.add(step);
    const doorCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.08, 0.9),
      roofSnowMat
    );
    doorCanopy.position.set(w * 0.02, 2.35, frontZ + 0.38);
    doorCanopy.rotation.x = 0.16;
    house.add(doorCanopy);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      lightBulbMat
    );
    lamp.position.set(w * 0.02 + 0.8, 2.05, frontZ + 0.16);
    house.add(lamp);

    // Icicles along the road-facing eave.
    const eaveZ = d / 2 + 0.9;
    for (let i = 0; i < 7; i++) {
      const length = 0.16 + rand() * 0.3;
      const icicle = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, length, 4),
        icicleMat
      );
      icicle.rotation.x = Math.PI;
      icicle.position.set(
        -w * 0.42 + (i / 6) * w * 0.84,
        eaveY - length / 2 - 0.02,
        eaveZ - 0.04
      );
      house.add(icicle);
    }

    // A wreath and a red bow on the door.
    const wreath = new THREE.Mesh(
      new THREE.TorusGeometry(0.25, 0.07, 6, 14),
      wreathMat
    );
    wreath.position.set(w * 0.02, 1.55, frontZ + 0.09);
    house.add(wreath);
    for (const side of [-1, 1]) {
      const bow = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.08, 0.05),
        bowMat
      );
      bow.position.set(w * 0.02 + side * 0.08, 1.3, frontZ + 0.11);
      bow.rotation.z = side * 0.5;
      house.add(bow);
    }

    // Drifts banked against the plinth.
    for (const side of [-1, 1]) {
      const drift = new THREE.Mesh(
        new THREE.SphereGeometry(1, 7, 5),
        roofSnowMat
      );
      drift.position.set(side * w * 0.32, 0.12, d / 2 + 0.32);
      drift.scale.set(w * 0.26, 0.26, 0.52);
      house.add(drift);
    }

    // A hanging sign for a few of the nearer inns.
    if (near && rand() > 0.4) {
      const labels = ["GASTHOF", "ALPENSTUBE", "SKI SCHULE", "CAF\u00c9"];
      const label = labels[Math.floor(rand() * labels.length)];
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.48),
        new THREE.MeshBasicMaterial({
          map: makeSignTexture(label),
          toneMapped: false,
        })
      );
      sign.position.set(-w * 0.28, 2.55, frontZ + 0.05);
      house.add(sign);
      const bracket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.6, 5),
        lampMetalMat
      );
      bracket.rotation.x = Math.PI / 2;
      bracket.position.set(-w * 0.28, 2.86, frontZ + 0.2);
      house.add(bracket);
    }

    // String lights along the balcony rail.
    if (rand() > 0.35) {
      for (let i = 0; i < 7; i++) {
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 6, 4),
          lightBulbMat
        );
        bulb.position.set(
          -w * 0.4 + (i / 6) * w * 0.8,
          h + 0.84 - Math.sin((i / 6) * Math.PI) * 0.16,
          balconyZ + 0.54
        );
        house.add(bulb);
        stringLights.push(bulb);
      }
    }

    return house;
  }

  const chaletPositions = [];
  let squarePosition = null;
  for (let i = 0; i < 11; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    let x = START + (i / 11) * CYCLE + (rand() - 0.5) * 10;
    // Keep the first frame consistent with the scroll band, so a chalet and
    // its porch idler never start on opposite sides of the wrap.
    if (x > START + CYCLE - 35) x -= CYCLE;
    const z = side * (14 + rand() * 5);

    // Leave one gap on the far side for the village square.
    if (i === 5) {
      const square = new THREE.Group();
      const plaza = new THREE.Mesh(
        new THREE.CylinderGeometry(5.4, 5.6, 0.1, 24),
        stoneMat
      );
      plaza.position.y = 0.05;
      plaza.receiveShadow = true;
      square.add(plaza);
      const plazaSnow = new THREE.Mesh(
        new THREE.CylinderGeometry(5.1, 5.1, 0.04, 24),
        pavementMat
      );
      plazaSnow.position.y = 0.11;
      square.add(plazaSnow);

      // Fountain, frozen for the season.
      const basin = new THREE.Mesh(
        new THREE.CylinderGeometry(1.55, 1.7, 0.55, 16),
        stoneMat
      );
      basin.position.y = 0.32;
      basin.castShadow = true;
      square.add(basin);
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(1.42, 1.42, 0.06, 16),
        new THREE.MeshPhysicalMaterial({
          color: 0xb8d6e6,
          roughness: 0.12,
          metalness: 0.05,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          envMapIntensity: 1.2,
        })
      );
      water.position.y = 0.58;
      square.add(water);
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.24, 1.7, 10),
        stoneMat
      );
      column.position.y = 1.4;
      square.add(column);
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.32, 0.22, 12),
        stoneMat
      );
      bowl.position.y = 2.2;
      square.add(bowl);
      const fountainSnow = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 8, 5, 0, TAU, 0, Math.PI / 2),
        roofSnowMat
      );
      fountainSnow.position.y = 2.3;
      fountainSnow.scale.set(1, 0.25, 1);
      square.add(fountainSnow);
      const fountainLight = new THREE.PointLight(0x9ec8e8, 2.2, 8, 2);
      fountainLight.position.set(0, 0.9, 0);
      square.add(fountainLight);

      // The village Christmas tree.
      const tree = pineTemplate.clone(true);
      tree.scale.setScalar(2.35);
      tree.position.set(-3.1, 0, 1.1);
      tree.rotation.y = 0.6;
      square.add(tree);
      for (let l = 0; l < 26; l++) {
        const u = l / 26;
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 6, 4),
          l % 4 === 0 ? bowMat : lightBulbMat
        );
        const radius = 2.4 * (1 - u) + 0.35;
        const angle = u * Math.PI * 9;
        bulb.position.set(
          -3.1 + Math.cos(angle) * radius * 0.55,
          0.8 + u * 6.1,
          1.1 + Math.sin(angle) * radius * 0.55
        );
        square.add(bulb);
        stringLights.push(bulb);
      }
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.24, 0),
        new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false, fog: true })
      );
      star.position.set(-3.1, 7.05, 1.1);
      star.scale.set(1, 1.5, 1);
      square.add(star);
      const treeLight = new THREE.PointLight(0xffc47a, 4.2, 10, 2);
      treeLight.position.set(-3.1, 3.6, 1.1);
      square.add(treeLight);
      const squareGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: 0xffb066,
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );
      squareGlow.position.set(-1.5, 5.5, 0.5);
      squareGlow.scale.set(26, 11, 1);
      square.add(squareGlow);

      // Two market stalls with striped canopies.
      const canopyMat = new THREE.MeshStandardMaterial({
        color: 0x7a2c37,
        roughness: 0.82,
        metalness: 0.02,
      });
      for (const [sx, sz, rot] of [
        [2.8, -2.2, -0.4],
        [3.2, 2.3, 0.35],
      ]) {
        const stall = new THREE.Group();
        const counter = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.9, 1.0),
          woodMat
        );
        counter.position.y = 0.55;
        stall.add(counter);
        for (const sideX of [-0.8, 0.8]) {
          for (const sideZ of [-0.4, 0.4]) {
            const leg = new THREE.Mesh(
              new THREE.BoxGeometry(0.08, 1.7, 0.08),
              trimMat
            );
            leg.position.set(sideX, 1.05, sideZ);
            stall.add(leg);
          }
        }
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(2.1, 0.1, 1.4),
          canopyMat
        );
        canopy.position.y = 2.0;
        canopy.rotation.z = 0.08;
        stall.add(canopy);
        const snowCap = new THREE.Mesh(
          new THREE.BoxGeometry(2.1, 0.06, 1.4),
          roofSnowMat
        );
        snowCap.position.y = 2.08;
        snowCap.rotation.z = 0.08;
        stall.add(snowCap);
        for (let c = 0; c < 4; c++) {
          const crate = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.26, 0.3),
            trimMat
          );
          crate.position.set(-0.6 + c * 0.4, 1.12, 0);
          stall.add(crate);
        }
        stall.position.set(sx, 0, sz);
        stall.rotation.y = rot;
        square.add(stall);
      }

      // Benches and lamps around the plaza.
      for (const [bx, bz, brot] of [
        [-1.4, -3.7, 0],
        [4.0, 0.2, Math.PI / 2],
      ]) {
        const bench = new THREE.Group();
        const seat = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.09, 0.4),
          woodMat
        );
        seat.position.y = 0.48;
        bench.add(seat);
        const back = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.45, 0.08),
          woodMat
        );
        back.position.set(0, 0.74, -0.18);
        back.rotation.x = -0.12;
        bench.add(back);
        for (const legX of [-0.65, 0.65]) {
          const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.48, 0.34),
            trimMat
          );
          leg.position.set(legX, 0.24, 0);
          bench.add(leg);
        }
        bench.position.set(bx, 0.08, bz);
        bench.rotation.y = brot;
        square.add(bench);
      }

      const plazaSign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9, 0.6),
        new THREE.MeshBasicMaterial({
          map: makeSignTexture("DORFPLATZ"),
          toneMapped: false,
        })
      );
      plazaSign.position.set(-5.2, 2.4, -0.2);
      plazaSign.rotation.y = Math.PI / 2;
      square.add(plazaSign);

      square.position.set(x, 0, z);
      group.add(square);
      props.push(square);
      squarePosition = { x, z };
      continue;
    }

    const chalet = makeChalet({ wide: i % 3 === 0, near: i < 6 });
    chalet.position.set(x, 0, z);
    chalet.rotation.y = side > 0 ? Math.PI : 0;
    group.add(chalet);
    props.push(chalet);
    chaletPositions.push({ x, z, side });
    if (i < 4) {
      const light = new THREE.PointLight(0xffb066, 4.2, 13, 2);
      light.position.set(x, 3.2, z - side * 3.2);
      group.add(light);
      chaletLights.push(light);
    }
  }

  // A village church with a tall spire, set back from the road.
  {
    const church = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 5.2, 10.5),
      plasterMat
    );
    body.position.y = 2.6;
    body.castShadow = true;
    church.add(body);
    const roof = new THREE.Mesh(
      makeRoofGeometry(8.6, 11.8, 2.2),
      roofSnowMat
    );
    roof.position.y = 5.2;
    church.add(roof);
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 9.2, 2.8),
      plasterMat
    );
    tower.position.set(0, 4.6, 6.2);
    tower.castShadow = true;
    church.add(tower);
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 6.4, 4),
      roofSnowMat
    );
    spire.position.set(0, 12.4, 6.2);
    spire.rotation.y = Math.PI / 4;
    church.add(spire);
    const clock = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 16),
      new THREE.MeshBasicMaterial({ color: 0xf4e6c8, toneMapped: false })
    );
    clock.position.set(0, 9.4, 7.62);
    church.add(clock);
    const hourHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.4, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x2a1e16, toneMapped: false })
    );
    hourHand.position.set(0, 9.55, 7.65);
    hourHand.rotation.z = -0.9;
    church.add(hourHand);
    const minuteHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.58, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x2a1e16, toneMapped: false })
    );
    minuteHand.position.set(0, 9.68, 7.66);
    minuteHand.rotation.z = 0.55;
    church.add(minuteHand);
    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.9, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x2c241d, roughness: 0.8 })
    );
    crossV.position.set(0, 15.7, 6.2);
    church.add(crossV);
    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.09, 0.09),
      crossV.material
    );
    crossH.position.set(0, 15.82, 6.2);
    church.add(crossH);
    church.position.set(-32, 0, -24);
    church.rotation.y = 0.18;
    group.add(church);
    props.push(church);
  }

  // Warm lights scattered up the far hillside: farmhouses and the upper
  // village, read as a handful of amber pinpricks through the snow.
  for (let i = 0; i < 34; i++) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 + rand() * 0.08, 5, 4),
      new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xffd9a0 : 0xffb877,
        toneMapped: false,
        fog: true,
      })
    );
    light.position.set(
      -240 + rand() * 500,
      3 + rand() * 26,
      -95 - rand() * 70
    );
    group.add(light);
    farProps.push(light);
  }

  /* ---------------------------- roadside props -------------------------- */
  // Snowman.
  {
    const snowman = new THREE.Group();
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xf2f7fd,
      roughness: 0.88,
      metalness: 0,
    });
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), ballMat);
    b1.position.y = 0.6;
    snowman.add(b1);
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.44, 10, 8), ballMat);
    b2.position.y = 1.35;
    snowman.add(b2);
    const b3 = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 8), ballMat);
    b3.position.y = 1.95;
    snowman.add(b3);
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.32, 6),
      new THREE.MeshStandardMaterial({ color: 0xd27a2a, roughness: 0.8 })
    );
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.38, 1.98, 0);
    snowman.add(nose);
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.24, 0.3, 8),
      trimMat
    );
    hat.position.y = 2.26;
    snowman.add(hat);
    snowman.position.set(-14, 0, 8.4);
    group.add(snowman);
    props.push(snowman);
  }

  // Wooden fence sections and a ski sign.
  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0x4b3728,
    roughness: 0.9,
    metalness: 0.02,
  });
  for (let i = 0; i < 24; i++) {
    const x = START + rand() * CYCLE;
    const side = rand() > 0.5 ? 1 : -1;
    const fence = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1.0, 0.1),
        fenceMat
      );
      post.position.set((j - 1) * 1.4, 0.5, 0);
      fence.add(post);
    }
    for (let j = 0; j < 2; j++) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(3.0, 0.08, 0.07),
        fenceMat
      );
      rail.position.set(0, 0.42 + j * 0.38, 0);
      fence.add(rail);
    }
    fence.position.set(x, 0, side * (12 + rand() * 3));
    fence.rotation.y = rand() * 0.2;
    group.add(fence);
    props.push(fence);
  }

  // A timber bus shelter with a snow-laden roof and a warm interior lamp.
  {
    const shelter = new THREE.Group();
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.8, 0.12),
      woodMat
    );
    back.position.set(0, 0.95, -0.9);
    shelter.add(back);
    for (const sideX of [-1.6, 1.6]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 2.3, 0.14),
        trimMat
      );
      post.position.set(sideX, 1.15, 0.7);
      shelter.add(post);
    }
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.12, 2.2),
      roofMat
    );
    roof.position.set(0, 2.32, -0.1);
    roof.rotation.x = 0.08;
    shelter.add(roof);
    const roofSnow = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.09, 2.2),
      roofSnowMat
    );
    roofSnow.position.set(0, 2.41, -0.1);
    roofSnow.rotation.x = 0.08;
    shelter.add(roofSnow);
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.1, 0.42),
      woodMat
    );
    bench.position.set(0, 0.5, -0.55);
    shelter.add(bench);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 7, 5),
      lightBulbMat
    );
    lamp.position.set(0, 2.05, -0.35);
    shelter.add(lamp);
    const light = new THREE.PointLight(0xffb066, 2.0, 5.5, 2);
    light.position.set(0, 1.95, -0.35);
    shelter.add(light);
    shelter.position.set(24, 0, 7.6);
    shelter.rotation.y = Math.PI;
    group.add(shelter);
    props.push(shelter);
  }

  // A small ski-lift pylon silhouette on the far hillside.
  for (let i = 0; i < 5; i++) {
    const pylon = new THREE.Group();
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.26, 12, 6),
      new THREE.MeshStandardMaterial({ color: 0x4c5864, roughness: 0.7, metalness: 0.4 })
    );
    mast.position.y = 6;
    pylon.add(mast);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.18, 0.18),
      mast.material
    );
    arm.position.y = 11.4;
    pylon.add(arm);
    pylon.position.set(-130 + i * 58, 0, -78);
    group.add(pylon);
  }

  /* ------------------------------- traffic ------------------------------ */
  const carPaints = [0x24303c, 0x8d2a2a, 0xd9dde2, 0x2f5a55, 0x6b4a2e].map(
    (color) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.38,
        metalness: 0.45,
        envMapIntensity: 1.0,
      })
  );
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0c1820,
    roughness: 0.16,
    metalness: 0.4,
    envMapIntensity: 1.3,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x050607,
    roughness: 0.92,
    metalness: 0.02,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x6d747c,
    roughness: 0.38,
    metalness: 0.8,
    envMapIntensity: 1.1,
  });
  const headlightMat = new THREE.MeshBasicMaterial({
    color: 0xf4f8ff,
    toneMapped: false,
    fog: true,
  });
  const taillightMat = new THREE.MeshBasicMaterial({
    color: 0xff2a36,
    toneMapped: false,
    fog: true,
  });
  const amberMat = new THREE.MeshBasicMaterial({
    color: 0xffae2a,
    toneMapped: false,
    fog: true,
  });

  function addWheel(vehicle, wheels, x, y, z, radius, width) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, width, 12),
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
    wheels.push({ pivot, radius });
  }

  const headGlowMat = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xfff1d0,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const tailGlowMat = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xff3a32,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const beamMat = new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: 0xffd39a,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: true,
  });

  function addVehicleGlow(vehicle, length, width, height = 0.7) {
    for (const side of [-1, 1]) {
      const head = new THREE.Sprite(headGlowMat);
      head.position.set(length / 2 + 0.06, height, side * width * 0.3);
      head.scale.set(1.15, 1.15, 1);
      vehicle.add(head);
      const tail = new THREE.Sprite(tailGlowMat);
      tail.position.set(-length / 2 - 0.04, height, side * width * 0.34);
      tail.scale.set(0.62, 0.62, 1);
      vehicle.add(tail);
    }
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, width * 1.4),
      beamMat
    );
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(length / 2 + 4.1, 0.025, 0);
    vehicle.add(beam);
  }

  function makeSnowCar(paintMat) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(4.15, 0.6, 1.78, 4, 0.16),
      paintMat
    );
    body.position.y = 0.47;
    body.castShadow = true;
    car.add(body);

    const hood = new THREE.Mesh(
      new RoundedBoxGeometry(1.15, 0.2, 1.68, 3, 0.08),
      paintMat
    );
    hood.position.set(1.62, 0.78, 0);
    hood.castShadow = true;
    car.add(hood);

    const cabin = new THREE.Mesh(
      new RoundedBoxGeometry(2.1, 0.56, 1.54, 4, 0.16),
      glassMat
    );
    cabin.position.set(-0.28, 0.98, 0);
    car.add(cabin);

    const roof = new THREE.Mesh(
      new RoundedBoxGeometry(1.45, 0.1, 1.32, 3, 0.05),
      paintMat
    );
    roof.position.set(-0.34, 1.3, 0);
    car.add(roof);

    // Snow on the roof and bonnet.
    const snowRoof = new THREE.Mesh(
      new THREE.BoxGeometry(1.32, 0.035, 1.2),
      roofSnowMat
    );
    snowRoof.position.set(-0.34, 1.36, 0);
    car.add(snowRoof);
    const snowHood = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.025, 1.28),
      roofSnowMat
    );
    snowHood.position.set(1.58, 0.9, 0);
    car.add(snowHood);

    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.09, 0.36),
        headlightMat
      );
      head.position.set(2.08, 0.66, side * 0.56);
      car.add(head);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.07, 0.3),
        taillightMat
      );
      tail.position.set(-2.07, 0.66, side * 0.58);
      car.add(tail);
      const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.08, 0.1),
        paintMat
      );
      mirror.position.set(0.92, 1.08, side * 0.92);
      car.add(mirror);
    }

    const wheels = [];
    for (const side of [-1, 1]) {
      for (const ax of [-1.32, 1.32]) {
        addWheel(car, wheels, ax, 0.33, side * 0.8, 0.33, 0.22);
      }
    }
    return { group: car, wheels, radius: 0.33, length: 4.15, width: 1.78, type: "car" };
  }

  function makeSnowBus(paintMat) {
    const bus = new THREE.Group();
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(9.2, 2.3, 2.3, 4, 0.18),
      paintMat
    );
    body.position.y = 1.5;
    body.castShadow = true;
    bus.add(body);
    const windowBand = new THREE.Mesh(
      new THREE.BoxGeometry(8.1, 0.7, 2.31),
      glassMat
    );
    windowBand.position.y = 2.14;
    bus.add(windowBand);
    for (let i = -3; i <= 3; i++) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.76, 2.32),
        paintMat
      );
      pillar.position.set(i * 1.16, 2.14, 0);
      bus.add(pillar);
    }
    const roofSnow = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.08, 2.0),
      roofSnowMat
    );
    roofSnow.position.y = 2.7;
    bus.add(roofSnow);
    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.9, 1.9),
      glassMat
    );
    windshield.position.set(4.61, 2.1, 0);
    bus.add(windshield);
    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.1, 0.34),
        headlightMat
      );
      head.position.set(4.62, 0.7, side * 0.76);
      bus.add(head);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.09, 0.3),
        taillightMat
      );
      tail.position.set(-4.62, 0.78, side * 0.82);
      bus.add(tail);
    }
    const wheels = [];
    for (const side of [-1, 1]) {
      addWheel(bus, wheels, 3.2, 0.45, side * 0.98, 0.45, 0.3);
      addWheel(bus, wheels, -2.9, 0.45, side * 0.98, 0.45, 0.3);
    }
    return { group: bus, wheels, radius: 0.45, length: 9.2, width: 2.3, type: "bus" };
  }

  function makeSnowPlough() {
    const truck = new THREE.Group();
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 0.24, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x2c3238, roughness: 0.7, metalness: 0.3 })
    );
    chassis.position.y = 0.62;
    truck.add(chassis);
    const cab = new THREE.Mesh(
      new RoundedBoxGeometry(2.2, 1.85, 2.2, 3, 0.14),
      new THREE.MeshStandardMaterial({
        color: 0xe0a32a,
        roughness: 0.42,
        metalness: 0.35,
        envMapIntensity: 0.9,
      })
    );
    cab.position.set(2.2, 1.5, 0);
    cab.castShadow = true;
    truck.add(cab);
    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.7, 1.8),
      glassMat
    );
    windshield.position.set(3.32, 1.95, 0);
    truck.add(windshield);
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 1.0, 2.1),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2a, roughness: 0.75, metalness: 0.15 })
    );
    bed.position.set(-1.3, 1.4, 0);
    bed.castShadow = true;
    truck.add(bed);
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 1.3, 3.8),
      new THREE.MeshStandardMaterial({
        color: 0xb9c2ca,
        roughness: 0.5,
        metalness: 0.65,
        envMapIntensity: 1.0,
      })
    );
    blade.position.set(3.55, 0.8, 0);
    blade.rotation.z = -0.28;
    blade.castShadow = true;
    truck.add(blade);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      amberMat
    );
    beacon.position.set(2.2, 2.48, 0);
    truck.add(beacon);
    const wheels = [];
    for (const side of [-1, 1]) {
      addWheel(truck, wheels, 2.4, 0.44, side * 0.98, 0.44, 0.3);
      addWheel(truck, wheels, -1.2, 0.44, side * 0.98, 0.44, 0.3);
      addWheel(truck, wheels, -2.4, 0.44, side * 0.98, 0.44, 0.3);
    }
    return { group: truck, wheels, radius: 0.44, length: 6.8, width: 2.2, type: "plough" };
  }

  const traffic = [];
  function addTraffic(build, { lane, direction, speed }) {
    const object = build.group;
    object.position.set(0, 0, lane);
    object.rotation.y = direction > 0 ? 0 : Math.PI;
    group.add(object);
    addVehicleGlow(
      object,
      build.length,
      build.width,
      build.type === "bus" || build.type === "plough" ? 0.85 : 0.68
    );
    traffic.push({
      object,
      speed,
      baseSpeed: speed,
      direction,
      lane,
      laneZ: lane,
      wheels: build.wheels,
      wheelRadius: build.radius,
      length: build.length,
      width: build.width,
      type: build.type,
    });
  }

  addTraffic(makeSnowCar(carPaints[0]), { lane: LANE_SAME, direction: 1, speed: 5.2 });
  addTraffic(makeSnowCar(carPaints[1]), { lane: LANE_SAME, direction: 1, speed: 6.0 });
  addTraffic(makeSnowBus(carPaints[3]), { lane: LANE_SAME, direction: 1, speed: 4.8 });
  addTraffic(makeSnowPlough(), { lane: LANE_SAME, direction: 1, speed: 3.6 });

  addTraffic(makeSnowCar(carPaints[2]), { lane: LANE_ONCOMING_INNER, direction: -1, speed: 7.4 });
  addTraffic(makeSnowCar(carPaints[4]), { lane: LANE_ONCOMING_INNER, direction: -1, speed: 8.2 });
  addTraffic(makeSnowCar(carPaints[0]), { lane: LANE_ONCOMING_OUTER, direction: -1, speed: 6.8 });
  addTraffic(makeSnowBus(carPaints[1]), { lane: LANE_ONCOMING_OUTER, direction: -1, speed: 5.6 });
  addTraffic(makeSnowCar(carPaints[3]), { lane: LANE_ONCOMING_OUTER, direction: -1, speed: 9.0 });

  for (const lane of [LANE_SAME, LANE_ONCOMING_INNER, LANE_ONCOMING_OUTER]) {
    const laneCars = traffic.filter((item) => item.lane === lane);
    const gap = CYCLE / laneCars.length;
    laneCars.forEach((item, index) => {
      let x = START + index * gap + (rand() - 0.5) * gap * 0.3;
      if (Math.abs(x) < 20) x += 40;
      item.object.position.x = x;
    });
  }

  /* ----------------------------- villagers ------------------------------ */
  // Winter-dressed pedestrians: walkers on the trodden pavement, a few people
  // crossing the square, and innkeepers standing under the chalet porches.
  const alpsCrowdActors = [
    { x: -74, z: 6.95, kind: "walk", dir: 1, walk: 0.58, y: 0.03 },
    { x: -18, z: 7.05, kind: "walk", dir: -1, walk: 0.52, y: 0.03 },
    { x: 46, z: 6.85, kind: "walk", dir: 1, walk: 0.64, y: 0.03 },
    { x: 108, z: 7.1, kind: "walk", dir: -1, walk: 0.55, y: 0.03 },
    { x: -58, z: -6.9, kind: "walk", dir: -1, walk: 0.6, y: 0.03 },
    { x: 24, z: -7.05, kind: "walk", dir: 1, walk: 0.5, y: 0.03 },
    { x: 84, z: -6.95, kind: "walk", dir: -1, walk: 0.62, y: 0.03 },
  ];
  for (let i = 0; i < alpsCrowdActors.length; i++) {
    const coats = [0x6b2f2a, 0x2f4a5e, 0x3a4a34, 0x4a3a4a, 0x5a4632, 0x26313c];
    alpsCrowdActors[i].colors = {
      jacket: coats[i % coats.length],
      trousers: 0x2a2c31,
    };
    alpsCrowdActors[i].winter = true;
  }
  if (squarePosition) {
    const plazaSpots = [
      [-3.4, 4.1, Math.PI * 0.15],
      [2.9, 3.4, -Math.PI * 0.2],
      [-1.2, -3.6, Math.PI],
      [3.6, -2.4, -Math.PI * 0.7],
    ];
    for (let i = 0; i < plazaSpots.length; i++) {
      const [dx, dz, yaw] = plazaSpots[i];
      alpsCrowdActors.push({
        x: squarePosition.x + dx,
        z: squarePosition.z + dz,
        kind: i < 2 ? "idle" : "shop",
        yaw,
        bag: i === 2,
        winter: true,
        y: 0.12,
        colors: {
          jacket: [0x8a3a30, 0x2f4a5e, 0x3a5a3f, 0x5a4632][i],
          trousers: 0x26282c,
          hat: [0xd9c9a8, 0x8c2f2a, 0x2f4a5e, 0x3a4034][i],
        },
      });
    }
  }
  for (let i = 0; i < chaletPositions.length; i += 3) {
    const chalet = chaletPositions[i];
    const towardRoad = chalet.side > 0 ? -1 : 1;
    alpsCrowdActors.push({
      x: chalet.x + (rand() - 0.5) * 2.4,
      z: chalet.z + towardRoad * (4.1 + rand() * 0.7),
      kind: "idle",
      yaw: chalet.side > 0 ? Math.PI : 0,
      winter: true,
      y: 0.02,
      colors: {
        jacket: [0x3a4a34, 0x6b2f2a, 0x26313c][i % 3],
        trousers: 0x2b2d31,
      },
    });
  }
  const crowd = createCrowd({
    actors: alpsCrowdActors,
    wrapMin: START - 35,
    wrapSpan: CYCLE,
    seed: 40817,
    winter: true,
  });
  group.add(crowd.group);

  /* ------------------------------ snowfall ------------------------------ */
  const flakeTexture = makeSnowflakeTexture();
  const SNOW_COUNT = 2200;
  const snowPositions = new Float32Array(SNOW_COUNT * 3);
  const snowSpeed = new Float32Array(SNOW_COUNT);
  const snowDrift = new Float32Array(SNOW_COUNT);
  for (let i = 0; i < SNOW_COUNT; i++) {
    snowPositions[i * 3] = (rand() - 0.5) * 90;
    snowPositions[i * 3 + 1] = rand() * 36;
    snowPositions[i * 3 + 2] = (rand() - 0.5) * 90;
    snowSpeed[i] = 0.9 + rand() * 1.8;
    snowDrift[i] = (rand() - 0.5) * 0.9;
  }
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(snowPositions, 3)
  );
  const snowMaterial = new THREE.PointsMaterial({
    map: flakeTexture,
    size: 0.24,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: true,
  });
  const snowfall = new THREE.Points(snowGeometry, snowMaterial);
  snowfall.name = "AlpsSnowfall";
  group.add(snowfall);

  /* ------------------------------- lights ------------------------------- */
  const hemi = new THREE.HemisphereLight(0xa4c6e8, 0x3f4a58, 0.6);
  group.add(hemi);

  const moonLight = new THREE.DirectionalLight(0xffd7b4, 2.15);
  moonLight.position.set(-46, 44, 36);
  moonLight.target.position.set(0, 0.8, 0);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  moonLight.shadow.camera.left = -34;
  moonLight.shadow.camera.right = 34;
  moonLight.shadow.camera.top = 34;
  moonLight.shadow.camera.bottom = -34;
  moonLight.shadow.camera.near = 1;
  moonLight.shadow.camera.far = 130;
  moonLight.shadow.bias = -0.0004;
  group.add(moonLight, moonLight.target);

  const fill = new THREE.DirectionalLight(0x9ec8ff, 0.52);
  fill.position.set(30, 22, -40);
  group.add(fill);

  const fog = new THREE.Fog(0xc2d2e4, 58, 330);

  /* ------------------------------ setRain ------------------------------- */
  let snowHeavy = false;
  function setRain(value) {
    snowHeavy = Boolean(value);
    snowMaterial.size = snowHeavy ? 0.34 : 0.24;
    snowMaterial.opacity = snowHeavy ? 1 : 0.9;
    hemi.intensity = snowHeavy ? 0.52 : 0.6;
    moonLight.intensity = snowHeavy ? 1.45 : 2.15;
    fill.intensity = snowHeavy ? 0.36 : 0.52;
    fog.near = snowHeavy ? 38 : 58;
    fog.far = snowHeavy ? 230 : 330;
    roadMaterial.roughness = snowHeavy ? 0.6 : 0.82;
    roadMaterial.color.set(snowHeavy ? 0xb9c3cc : 0xd6dde4);
  }

  /* ------------------------------- update ------------------------------- */
  let roadOffset = 0;
  let elapsedTime = 0;

  function update(dt, elapsed, speed, camera) {
    elapsedTime = elapsed;
    roadOffset = (roadOffset + (speed * dt) / TILE) % 1;
    roadTexture.offset.x = roadOffset;
    iceTexture.offset.x = (iceTexture.offset.x + (speed * dt) / 18) % 1;

    for (const prop of props) {
      prop.position.x -= speed * dt;
      if (prop.position.x < START - 35) prop.position.x += CYCLE;
    }
    for (const prop of farProps) {
      prop.position.x -= speed * dt * 0.16;
      if (prop.position.x < START - 60) prop.position.x += CYCLE + 120;
    }

    crowd.update(dt, speed);

    // Snow traffic keeps its lane and never overtakes. Each vehicle has its own
    // road speed; a look-ahead gap only makes a follower ease off when it is
    // actually catching the vehicle in front, so the player's speed never
    // changes how fast the traffic drives.
    const lanes = new Map();
    for (const item of traffic) {
      const key = `${item.direction}|${item.lane}`;
      let lane = lanes.get(key);
      if (!lane) {
        lane = [];
        lanes.set(key, lane);
      }
      lane.push(item);
    }

    for (const lane of lanes.values()) {
      lane.sort(
        (a, b) => (b.object.position.x - a.object.position.x) * a.direction
      );
      for (let i = 1; i < lane.length; i++) {
        const leader = lane[i - 1];
        const follower = lane[i];
        const gap =
          (leader.object.position.x - follower.object.position.x) *
          follower.direction;
        const safe = (leader.length + follower.length) * 0.5 + 3;
        const look = 30;
        const t = THREE.MathUtils.clamp(
          (gap - safe) / Math.max(1, look - safe),
          0,
          1
        );
        const target = Math.min(
          follower.baseSpeed,
          leader.speed + (follower.baseSpeed - leader.speed) * t
        );
        follower.speed += (target - follower.speed) * Math.min(1, dt * 1.5);
      }
    }

    for (const item of traffic) {
      const relative =
        item.direction === 1
          ? item.speed - speed
          : -(item.speed + speed);
      item.object.position.x += relative * dt;
      if (item.object.position.x > START + CYCLE + 55) {
        item.object.position.x = START - 55;
        item.speed = item.baseSpeed;
      } else if (item.object.position.x < START - 55) {
        item.object.position.x = START + CYCLE + 55;
        item.speed = item.baseSpeed;
      }
      for (const wheel of item.wheels) {
        wheel.pivot.rotation.z -= (item.speed * dt) / wheel.radius;
      }
    }

    // Hard queue constraint after movement. It only engages if a wrap or a
    // sudden slow-down has closed the gap below the physical length.
    for (const lane of lanes.values()) {
      for (let i = 1; i < lane.length; i++) {
        const leader = lane[i - 1];
        const follower = lane[i];
        const gap =
          (leader.object.position.x - follower.object.position.x) *
          follower.direction;
        const minGap = (leader.length + follower.length) * 0.5 + 1.2;
        if (gap < minGap) {
          follower.object.position.x =
            leader.object.position.x - follower.direction * minGap;
          follower.speed = Math.min(follower.speed, leader.speed);
        }
      }
    }

    for (const item of traffic) {
      item.object.position.z = item.laneZ;
    }

    // Snowfall. Keep the field centred on the car and wrap every flake.
    const pos = snowGeometry.attributes.position;
    const array = pos.array;
    const driftScale = snowHeavy ? 1.6 : 1;
    for (let i = 0; i < SNOW_COUNT; i++) {
      const i3 = i * 3;
      array[i3 + 1] -= snowSpeed[i] * dt * driftScale;
      array[i3] += snowDrift[i] * dt * driftScale;
      array[i3 + 2] += Math.sin(elapsed * 0.7 + i) * dt * 0.12;
      if (array[i3 + 1] < -0.2) {
        array[i3 + 1] = 34 + rand() * 4;
        array[i3] = (rand() - 0.5) * 90;
        array[i3 + 2] = (rand() - 0.5) * 90;
      }
      if (array[i3] > 45) array[i3] = -45;
      if (array[i3] < -45) array[i3] = 45;
      if (array[i3 + 2] > 45) array[i3 + 2] = -45;
      if (array[i3 + 2] < -45) array[i3 + 2] = 45;
    }
    pos.needsUpdate = true;

    // Chimney smoke and string-light shimmer.
    for (const puff of smoke) {
      puff.mesh.position.y = puff.baseY + Math.sin(elapsed * 0.4 + puff.phase) * 0.22;
      puff.mesh.material.opacity =
        0.14 + 0.08 * (0.5 + 0.5 * Math.sin(elapsed * 0.3 + puff.phase));
      puff.mesh.scale.setScalar(1 + 0.18 * Math.sin(elapsed * 0.25 + puff.phase));
    }
    for (let i = 0; i < stringLights.length; i++) {
      const bulb = stringLights[i];
      bulb.scale.setScalar(0.92 + 0.08 * Math.sin(elapsed * 2.2 + i * 0.7));
    }

    // A faint warm pulse in the chalet windows, like a fire inside.
    const pulse = 1.85 + Math.sin(elapsed * 0.7) * 0.18;
    warmWindowMat.emissiveIntensity = pulse;
    for (const light of chaletLights) {
      light.intensity = 3.7 + Math.sin(elapsed * 0.9 + light.position.x) * 0.5;
    }
  }

  return {
    group,
    environment: makeEnvironment(renderer, skyTexture),
    update,
    setRain,
    fog,
    cycle: CYCLE,
    baseZ: -LANE_PLAYER,
    traffic,
    crowd,
    chalets: chaletPositions,
    square: squarePosition,
    get snowHeavy() {
      return snowHeavy;
    },
  };
}

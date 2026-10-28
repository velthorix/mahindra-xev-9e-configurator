import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { curve, gridSurface, lerp, smoothstep, tubeFromPoints } from "./utils.js";
import { CAR, halfWidthAt, zTop } from "./body.js";

/* -------------------------------------------------------------------------- */
/*  Roof profile                                                              */
/* -------------------------------------------------------------------------- */

const ROOF_KEYS = [
  [-2.02, 1.350],
  [-1.90, 1.385],
  [-1.75, 1.430],
  [-1.55, 1.485],
  [-1.30, 1.545],
  [-1.05, 1.596],
  [-0.80, 1.634],
  [-0.55, 1.656],
  [-0.28, 1.666],
  [0.00, 1.667],
  [0.20, 1.656],
  [0.38, 1.628],
  [0.56, 1.590],
  [0.72, 1.530],
  [0.84, 1.455],
  [0.93, 1.360],
  [0.99, 1.205],
  [1.02, 1.112],
];

export const roofHeight = (x) => curve(ROOF_KEYS, x);

/*
 * The greenhouse cross-section is deliberately more upright than a sports
 * car: the side glass rises almost vertically before the roof turns inboard.
 * This keeps the car reading as a coupe SUV rather than a targa.
 */
const Y_FRAC = [
  [0.0, 1.0],
  [0.12, 1.0],
  [0.28, 0.997],
  [0.42, 0.985],
  [0.54, 0.948],
  [0.63, 0.898],
  [0.71, 0.845],
  [0.78, 0.800],
  [0.85, 0.720],
  [0.92, 0.600],
  [0.97, 0.440],
  [1.0, 0.0],
];
const Z_FRAC = [
  [0.0, 0.0],
  [0.12, 0.10],
  [0.28, 0.32],
  [0.42, 0.56],
  [0.54, 0.72],
  [0.63, 0.82],
  [0.71, 0.90],
  [0.78, 0.965],
  [0.85, 0.990],
  [0.92, 0.999],
  [0.97, 1.0],
  [1.0, 1.0],
];

/** Glass canopy surface. t = 0 at the beltline, 1 at the centreline. */
export function canopyPoint(x, t, side, offset = 0) {
  const base = zTop(x);
  const roof = roofHeight(x);
  const h = Math.max(0.005, roof - base);
  const yBase = halfWidthAt(x, base) - 0.006;
  const y = side * yBase * curve(Y_FRAC, t);
  const z = base + h * curve(Z_FRAC, t);
  return new THREE.Vector3(x, z + offset, y);
}

function canopyNormal(x, t, side) {
  const p = canopyPoint(x, t, side);
  const px = canopyPoint(x + 0.01, t, side);
  const pt = canopyPoint(x, Math.min(1, t + 0.02), side);
  const n = new THREE.Vector3()
    .subVectors(px, p)
    .cross(new THREE.Vector3().subVectors(pt, p));
  n.normalize();
  if (n.z * side < 0) n.multiplyScalar(-1);
  return n;
}

/* -------------------------------------------------------------------------- */
/*  Windscreen                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Where the side daylight opening stops. The real car has a deep body-colour
 * roof band above the side glass, not a black canopy that runs all the way to
 * the silhouette. Keeping this below the roof shoulder is what gives the
 * greenhouse its flat, production-car window line.
 */
const SIDE_GLASS_T = 0.64;
export const sideGlassT = SIDE_GLASS_T;

/*
 * The screen is a separate, near-flat plane. It is not the front of the barrel
 * canopy: the old full-width canopy dome ran from the roof header all the way
 * down onto the cowl, which made the car look like it had a visor instead of a
 * windscreen. This plane has one straight slope in side view, a hard break at
 * the cowl, a hard break at the roof header, and slightly crowned glass across
 * its width. The pillars and roof are built around it rather than through it.
 */
const SCREEN = {
  baseX: 0.992,
  baseZ: 1.238,
  baseHalfWidth: 0.868,
  headerX: 0.372,
  headerZ: 1.610,
  headerHalfWidth: 0.776,
  crown: 0.012,
  headerDrop: 0.048,
  baseDrop: 0.006,
};

// The painted A-pillar occupies the shoulder between the screen edge and the
// side glass. In the real car it is a broad, rounded body-colour section that
// runs in an almost straight line from the cowl to the roof; the screen edge
// and the side-glass edge are its two borders. The old edge followed the
// canopy's cross-section parameter directly, which made the pillar curve
// nearly horizontal at the cowl and collapse to a needle at the header. The
// edge below is projected onto the canopy from a straight side-view line, so
// the pillar keeps a consistent, production-like taper.
const AP_OUTER_BASE_X = 0.895;
const AP_OUTER_TOP_X = 0.300;
// The screen edge stays at u = 1. The pillar is the painted shoulder between
// that edge and the front edge of the side glass.
const AP_INNER_U = 1.0;

function screenHalfWidth(s) {
  // A shallow side bulge keeps the A-pillar a consistent width instead of
  // pinching at mid-height where the canopy shoulder is widest.
  return (
    lerp(SCREEN.baseHalfWidth, SCREEN.headerHalfWidth, s) +
    0.022 * Math.sin(Math.PI * s)
  );
}

/** Point on the windscreen. s = 0 at the cowl, 1 at the roof header. */
function windshieldPoint(s, u) {
  const x = lerp(SCREEN.baseX, SCREEN.headerX, s);
  const zBase = SCREEN.baseZ - SCREEN.baseDrop * u * u;
  const zHeader = SCREEN.headerZ - SCREEN.headerDrop * u * u;
  const z =
    lerp(zBase, zHeader, s) +
    SCREEN.crown * Math.sin(Math.PI * s) * (1 - u * u);
  return new THREE.Vector3(x, z, u * screenHalfWidth(s));
}

/* A-pillar outer edge: a straight line in side view, projected onto the
 * canopy. Solving the canopy parameter keeps the edge on the glass surface
 * while giving it the long, even rake of the real car. */
const AP_BASE_Y = zTop(AP_OUTER_BASE_X) + 0.003;
const AP_TOP_Y = canopyPoint(AP_OUTER_TOP_X, SIDE_GLASS_T, 1).y;
const AP_EDGE_SEGMENTS = 96;
const AP_EDGE = [];

function solveCanopyT(x, y) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) * 0.5;
    if (canopyPoint(x, mid, 1).y < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

for (let i = 0; i <= AP_EDGE_SEGMENTS; i++) {
  const s = i / AP_EDGE_SEGMENTS;
  const x = lerp(AP_OUTER_BASE_X, AP_OUTER_TOP_X, s);
  const y = lerp(AP_BASE_Y, AP_TOP_Y, s);
  AP_EDGE.push({ s, x, t: solveCanopyT(x, y) });
}

function aPillarOuterFrame(s, side) {
  const f = Math.max(0, Math.min(1, s)) * AP_EDGE_SEGMENTS;
  const i = Math.min(AP_EDGE_SEGMENTS - 1, Math.floor(f));
  const a = AP_EDGE[i];
  const b = AP_EDGE[i + 1];
  const w = f - i;
  const x = lerp(a.x, b.x, w);
  const t = lerp(a.t, b.t, w);
  return {
    p: canopyPoint(x, t, side),
    n: canopyNormal(x, t, side),
    x,
    t,
  };
}

/** Outer edge of the A-pillar / front edge of the side glass. */
function aPillarOuter(s, side) {
  return aPillarOuterFrame(s, side).p;
}

/** The x coordinate of the side-glass front edge at canopy parameter t. */
function aPillarFrontX(t) {
  const target = Math.max(0, Math.min(AP_EDGE[AP_EDGE_SEGMENTS].t, t));
  let lo = 0;
  let hi = AP_EDGE_SEGMENTS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (AP_EDGE[mid].t <= target) lo = mid;
    else hi = mid;
  }
  const a = AP_EDGE[lo];
  const b = AP_EDGE[hi];
  const w = (target - a.t) / Math.max(1e-6, b.t - a.t);
  return lerp(a.x, b.x, w);
}

/* -------------------------------------------------------------------------- */
/*  Glass canopy                                                              */
/* -------------------------------------------------------------------------- */

function buildCanopy(materials) {
  const glassTs = [];
  for (let i = 0; i <= 60; i++) glassTs.push(lerp(0, SIDE_GLASS_T, i / 60));
  const railTs = [];
  for (let i = 0; i <= 22; i++) railTs.push(lerp(SIDE_GLASS_T, 1, i / 22));
  const group = new THREE.Group();
  group.name = "GlassCanopy";

  const makeXs = (x0, x1, n) => {
    const xs = [];
    for (let i = 0; i <= n; i++) xs.push(lerp(x0, x1, i / n));
    return xs;
  };
  const frontRoofXs = makeXs(ROOF_FRONT, -0.30, 52);
  const rearRoofXs = makeXs(-0.30, -1.84, 84);

  /* ----------------------------- windscreen ----------------------------- */
  const screenSs = [];
  for (let i = 0; i <= 46; i++) screenSs.push(i / 46);
  const screenUs = [];
  for (let i = 0; i <= 64; i++) screenUs.push(lerp(-1, 1, i / 64));

  const screen = gridSurface(
    screenSs,
    screenUs,
    (s, u) => windshieldPoint(s, u),
    materials.glassLight,
    "Windscreen"
  );
  screen.castShadow = false;
  screen.receiveShadow = false;
  screen.renderOrder = 5;
  group.add(screen);

  /* ---------------- front side glass ahead of the roof ------------------ */
  const frontWs = [];
  for (let i = 0; i <= 30; i++) frontWs.push(i / 30);
  for (const side of [-1, 1]) {
    const tag = side > 0 ? "R" : "L";
    const frontGlass = gridSurface(
      frontWs,
      glassTs,
      (w, t) => {
        const frontX = aPillarFrontX(t);
        const x = lerp(frontX, ROOF_FRONT, w);
        return canopyPoint(x, t, side);
      },
      materials.glassLight,
      `FrontSideGlass_${tag}`
    );
    frontGlass.castShadow = false;
    frontGlass.receiveShadow = false;
    frontGlass.renderOrder = 5;
    group.add(frontGlass);
  }

  /* ------------------------------- roof --------------------------------- */
  // Roof panels lie almost flat, so a mirror-smooth glass turns the night
  // stage's key lights into one broad white sheet across the roof. These
  // dedicated clones keep the roof dark and glassy; the windscreen and side
  // glass keep their original crisp reflections.
  const canopyRoofGlass = materials.glassLight.clone();
  canopyRoofGlass.name = "CanopyRoofGlass";
  canopyRoofGlass.roughness = 0.18;
  canopyRoofGlass.clearcoat = 0.3;
  canopyRoofGlass.clearcoatRoughness = 0.12;
  canopyRoofGlass.envMapIntensity = 0.7;
  canopyRoofGlass.specularIntensity = 0.22;
  canopyRoofGlass.opacity = 0.93;

  const canopyRearGlass = materials.glassRear.clone();
  canopyRearGlass.name = "CanopyRearRoofGlass";
  canopyRearGlass.roughness = 0.2;
  canopyRearGlass.clearcoat = 0.3;
  canopyRearGlass.clearcoatRoughness = 0.14;
  canopyRearGlass.envMapIntensity = 0.65;
  canopyRearGlass.specularIntensity = 0.22;
  canopyRearGlass.opacity = 0.9;

  for (const side of [-1, 1]) {
    const tag = side > 0 ? "R" : "L";
    const roofSections = [
      { xs: frontRoofXs, material: canopyRoofGlass, name: "CanopyFrontRoof" },
      { xs: rearRoofXs, material: canopyRearGlass, name: "CanopyRear" },
    ];
    for (const section of roofSections) {
      const mesh = gridSurface(
        section.xs,
        glassTs,
        (x, t) => canopyPoint(x, t, side),
        section.material,
        `${section.name}_${tag}`
      );
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 5;
      group.add(mesh);

      // The production roof is a continuous black canopy. A body-colour rail
      // here left a bright painted stripe around the glass and made the roof
      // read as a red panel with a black centre.
      const rail = gridSurface(
        section.xs,
        railTs,
        (x, t) => canopyPoint(x, t, side),
        materials.roofBlack,
        `${section.name}Rail_${tag}`
      );
      rail.castShadow = false;
      rail.receiveShadow = true;
      group.add(rail);
    }
  }

  // Black ceramic frit across the top of the screen. It follows the plane of
  // the glass, so it reads as a band printed on the screen rather than a
  // separate visor hovering above it.
  const fritSs = [];
  for (let i = 0; i <= 12; i++) fritSs.push(lerp(0.925, 1, i / 12));
  const frit = gridSurface(
    fritSs,
    screenUs,
    (s, u) => {
      const p = windshieldPoint(s, u);
      p.y += 0.0018;
      p.x += 0.0012;
      return p;
    },
    materials.pillar,
    "WindscreenFrit"
  );
  frit.castShadow = false;
  frit.renderOrder = 6;
  group.add(frit);

  // The black header panel bridges the top of the flat screen to the front
  // lip of the roof. Without it the new hard windscreen/roof break leaves a
  // bright slot across the car.
  const headerVs = [];
  for (let i = 0; i <= 8; i++) headerVs.push(i / 8);
  const headerBand = gridSurface(
    headerVs,
    screenUs,
    (v, u) => {
      const glassEdge = windshieldPoint(1, u);
      const roofEdge = roofPoint(ROOF_FRONT + 0.004, u);
      const p = glassEdge.lerp(roofEdge, v);
      p.y += 0.0025 * Math.sin(Math.PI * v);
      return p;
    },
    materials.pillar,
    "WindscreenHeader"
  );
  headerBand.castShadow = false;
  headerBand.receiveShadow = true;
  group.add(headerBand);

  // Rubber seal along the cowl. This is the hard, visible break between the
  // raked screen and the horizontal bonnet.
  const cowlPts = [];
  for (let i = 0; i <= 48; i++) {
    const u = lerp(-1, 1, i / 48);
    const p = windshieldPoint(0, u);
    p.x += 0.002;
    p.y += 0.004;
    cowlPts.push(p);
  }
  const cowlSeal = tubeFromPoints(
    cowlPts,
    0.0072,
    materials.rubberTrim,
    8,
    "WindscreenCowlSeal"
  );
  cowlSeal.castShadow = false;
  cowlSeal.receiveShadow = true;
  group.add(cowlSeal);

  return group;
}

function trimLine(points, materials, radius = 0.0055, name = "WindowTrim") {
  const mesh = tubeFromPoints(points, radius, materials.darkChrome, 7, name);
  mesh.castShadow = true;
  return mesh;
}

function beltlineTrim(materials) {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const x = lerp(1.00, -2.02, i / 96);
      const p = canopyPoint(x, 0.011, side, 0.003);
      // canopyPoint stores height in .y and lateral offset in .z. The old code
      // wrote the half-width into .y, which buried both beltline trim strips
      // inside the body instead of sitting them proud of the shoulder.
      p.y -= 0.006;
      // Sit the seal in the 6 mm gap between the body-side top edge and the
      // inboard glass edge. A strip placed outboard of the body left the sharp
      // top edge exposed as a continuous white pinstripe along the shoulder.
      p.z = side * (halfWidthAt(x, zTop(x)) - 0.003);
      pts.push(p);
    }
    // The production XEV 9e has a black window surround. Use a matte rubber
    // seal so the rounded strip cannot catch the softbox as a second highlight.
    group.add(tubeFromPoints(pts, 0.007, materials.rubberTrim, 7, "BeltlineTrim"));

    // A fine chrome bead along the base of the daylight opening. The real car
    // has a bright line here that separates the tall body from the privacy
    // glass; without it the raised beltline reads as one black slab.
    const chromePts = [];
    for (let i = 0; i <= 96; i++) {
      const x = lerp(1.00, -1.80, i / 96);
      const p = canopyPoint(x, 0.020, side, 0.0045);
      p.y += 0.0015;
      chromePts.push(p);
    }
    group.add(tubeFromPoints(chromePts, 0.0026, materials.chrome, 6, "BeltlineChrome"));
  }
  return group;
}

/* -------------------------------------------------------------------------- */
/*  Pillars                                                                   */
/* -------------------------------------------------------------------------- */

function aPillarHeightAt(s) {
  // The pillar is a painted section of the body, so it stays nearly full depth
  // from the beltline to the roof. Keep a little relief at the top: fading the
  // section to almost nothing let the black canopy rail poke through the paint
  // and turned the top of the pillar into a white spike. The black end cap
  // (see makeAPillar) hides the cut instead.
  const base = 0.3 + 0.7 * smoothstep(0, 0.08, s);
  return base * (1 - 0.45 * smoothstep(0.94, 1, s));
}

function makeAPillar(materials, side) {
  const ns = 64;
  const inner = [];
  const outer = [];
  const normals = [];
  for (let i = 0; i <= ns; i++) {
    const s = i / ns;
    inner.push(windshieldPoint(s, side * AP_INNER_U));
    const frame = aPillarOuterFrame(s, side);
    outer.push(frame.p);
    normals.push(frame.n);
  }

  // A shallow, rounded painted section. The old 8-point ring had a flat
  // plateau and a hard ridge; this profile is a continuous dome. Its height
  // fades into the cowl at the base and into the roof at the header, so the
  // pillar no longer ends in a raised blade.
  const topSteps = 10;
  const profile = [];
  for (let i = 0; i <= topSteps; i++) {
    const f = i / topSteps;
    profile.push([f, 0.005 * Math.pow(Math.sin(Math.PI * f), 0.85)]);
  }
  profile.push([1.0, -0.0018]);
  profile.push([0.985, -0.0024]);
  for (let i = topSteps - 1; i >= 1; i--) {
    const f = i / topSteps;
    profile.push([f, -0.0018 - 0.0006 * Math.sin(Math.PI * f)]);
  }
  profile.push([0.0, -0.0013]);
  const ringCount = profile.length;

  const positions = [];
  const indices = [];
  const sealInner = [];
  const sealOuter = [];
  for (let i = 0; i <= ns; i++) {
    const s = i / ns;
    const h = aPillarHeightAt(s);
    const normal = normals[i];
    for (const [f, lift] of profile) {
      const p = inner[i]
        .clone()
        .lerp(outer[i], f)
        .addScaledVector(normal, lift * h);
      positions.push(p.x, p.y, p.z);
    }
    sealInner.push(inner[i].clone().addScaledVector(normal, 0.0024));
    sealOuter.push(outer[i].clone().addScaledVector(normal, 0.0016));
  }
  for (let i = 0; i < ns; i++) {
    for (let j = 0; j < ringCount; j++) {
      const a = i * ringCount + j;
      const b = i * ringCount + ((j + 1) % ringCount);
      const c = (i + 1) * ringCount + j;
      const d = (i + 1) * ringCount + ((j + 1) % ringCount);
      indices.push(a, c, b, b, c, d);
    }
  }
  const sideIndexCount = indices.length;
  for (const [ring, flip] of [[0, false], [ns, true]]) {
    const base = ring * ringCount;
    for (let j = 1; j < ringCount - 1; j++) {
      if (flip) indices.push(base, base + j + 1, base + j);
      else indices.push(base, base + j, base + j + 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  // Paint the long skin, but keep the cut faces at the cowl and the roof black
  // so the pillar dissolves into the black rail instead of ending in a white
  // wedge.
  geom.addGroup(0, sideIndexCount, 0);
  geom.addGroup(sideIndexCount, indices.length - sideIndexCount, 1);

  const group = new THREE.Group();
  group.name = "APillar";
  const mesh = new THREE.Mesh(geom, [materials.pillarPaint, materials.rubberTrim]);
  mesh.name = "APillarSkin";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Black trim over the last few centimetres at the roof. The painted skin
  // narrows to a point where the screen edge and the side-glass edge meet;
  // letting it run into the black rail leaves a white spike. The cap covers
  // that tip and reads as the roof-rail end moulding.
  const capStart = 0.93;
  const capSteps = 12;
  const capPositions = [];
  const capIndices = [];
  for (let i = 0; i <= capSteps; i++) {
    const s = lerp(capStart, 1, i / capSteps);
    const h = aPillarHeightAt(s);
    const innerP = windshieldPoint(s, side * AP_INNER_U);
    const frame = aPillarOuterFrame(s, side);
    for (const [f, lift] of profile) {
      const p = innerP
        .clone()
        .lerp(frame.p, f)
        .addScaledVector(frame.n, lift * h + 0.0008);
      capPositions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < capSteps; i++) {
    for (let j = 0; j < ringCount; j++) {
      const a = i * ringCount + j;
      const b = i * ringCount + ((j + 1) % ringCount);
      const c = (i + 1) * ringCount + j;
      const d = (i + 1) * ringCount + ((j + 1) % ringCount);
      capIndices.push(a, c, b, b, c, d);
    }
  }
  const capGeom = new THREE.BufferGeometry();
  capGeom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(capPositions, 3)
  );
  capGeom.setIndex(capIndices);
  capGeom.computeVertexNormals();
  const capMesh = new THREE.Mesh(capGeom, materials.rubberTrim);
  capMesh.name = "APillarTopCap";
  capMesh.castShadow = false;
  capMesh.receiveShadow = true;
  group.add(capMesh);

  // A thin black rubber garnish along the screen edge and a small seal on the
  // glass side. These are edge trims, not the wide black band that used to
  // eat half the painted pillar.
  const innerSeal = tubeFromPoints(
    sealInner,
    0.0024,
    materials.rubberTrim,
    6,
    "APillarInnerGarnish"
  );
  innerSeal.castShadow = false;
  group.add(innerSeal);

  const outerSeal = tubeFromPoints(
    sealOuter,
    0.0012,
    materials.rubberTrim,
    6,
    "APillarOuterSeal"
  );
  outerSeal.castShadow = false;
  group.add(outerSeal);

  // A fine shut line where the pillar meets the cowl.
  const basePts = [];
  for (let i = 0; i <= 16; i++) {
    const p = inner[0].clone().lerp(outer[0], i / 16);
    p.addScaledVector(normals[0], 0.0012);
    basePts.push(p);
  }
  const baseSeal = tubeFromPoints(
    basePts,
    0.0018,
    materials.rubberTrim,
    5,
    "APillarBaseSeal"
  );
  baseSeal.castShadow = false;
  group.add(baseSeal);

  return group;
}

function makeMirrorSail(materials, side) {
  // Compact gloss-black sail at the front lower corner of the door glass. The
  // front edge follows the A-pillar, the base follows the beltline, and the
  // flat top edge carries the mirror stalk. The production part is a shallow
  // plastic wedge, not a flat decal, so it stands a few millimetres proud of
  // the glass and is gloss black against the dark tinted glass.
  const topY = 1.248;
  const sBase = 0.012;
  const sTop = Math.max(
    0.05,
    (topY - AP_BASE_Y) / (AP_TOP_Y - AP_BASE_Y)
  );
  const frontBase = aPillarOuterFrame(sBase, side);
  const frontTop = aPillarOuterFrame(sTop, side);
  const rearBaseX = 0.760;
  const rearTopX = 0.775;
  const rearBaseY = canopyPoint(rearBaseX, 0.004, side).y;

  const n = 18;
  const us = [];
  const vs = [];
  for (let i = 0; i <= n; i++) {
    us.push(i / n);
    vs.push(i / n);
  }

  const panel = gridSurface(
    vs,
    us,
    (v, u) => {
      const baseY = lerp(frontBase.p.y, rearBaseY, u);
      const y = lerp(baseY, topY, v);
      const xFront = lerp(frontBase.p.x, frontTop.p.x, v);
      const xRear = lerp(rearBaseX, rearTopX, v);
      const x = lerp(xFront, xRear, u);
      const t = solveCanopyT(x, y);
      const p = canopyPoint(x, t, side);
      const normal = canopyNormal(x, t, side);
      const lift =
        0.0025 +
        0.0055 * v +
        0.0012 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      p.addScaledVector(normal, lift);
      return p;
    },
    materials.gloss,
    `MirrorSailPanel_${side > 0 ? "R" : "L"}`
  );
  panel.castShadow = true;
  panel.receiveShadow = true;

  const group = new THREE.Group();
  group.name = `MirrorSail_${side > 0 ? "R" : "L"}`;
  group.add(panel);

  // A satin rim along the top and rear edges, where the plastic part meets the
  // glass. It gives the sail a real edge instead of a flat black shape.
  const rimPts = [];
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    const x = lerp(frontTop.p.x, rearTopX, u);
    const t = solveCanopyT(x, topY);
    const p = canopyPoint(x, t, side);
    p.addScaledVector(canopyNormal(x, t, side), 0.0082);
    rimPts.push(p);
  }
  for (let i = 1; i <= 10; i++) {
    const v = 1 - i / 10;
    const x = rearTopX;
    const y = lerp(rearBaseY, topY, v);
    const t = solveCanopyT(x, y);
    const p = canopyPoint(x, t, side);
    p.addScaledVector(
      canopyNormal(x, t, side),
      0.0025 + 0.0055 * v + 0.0008
    );
    rimPts.push(p);
  }
  const rim = tubeFromPoints(
    rimPts,
    0.0022,
    materials.pillar,
    6,
    "MirrorSailRim"
  );
  rim.castShadow = true;
  group.add(rim);

  // Chrome bead along the sail's top edge. It is the start of the window
  // surround and is what makes the sail read as a separate part against the
  // dark glass.
  const chromePts = [];
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    const x = lerp(frontTop.p.x, rearTopX, u);
    const t = solveCanopyT(x, topY);
    const p = canopyPoint(x, t, side);
    p.addScaledVector(canopyNormal(x, t, side), 0.0102);
    chromePts.push(p);
  }
  const chrome = tubeFromPoints(
    chromePts,
    0.0011,
    materials.chrome,
    6,
    "MirrorSailChrome"
  );
  chrome.castShadow = false;
  group.add(chrome);

  return group;
}

function aPillarChrome(materials, side) {
  // Bright bead along the outboard edge of the A-pillar. On the production car
  // this is the start of the chrome window surround; it separates the painted
  // pillar from the black side glass.
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const s = lerp(0.012, 1, i / 48);
    const frame = aPillarOuterFrame(s, side);
    const p = frame.p.clone().addScaledVector(frame.n, 0.0024);
    pts.push(p);
  }
  return tubeFromPoints(pts, 0.0012, materials.chrome, 6, "APillarChrome");
}

function windowTopChrome(materials, side) {
  const pts = [];
  for (let i = 0; i <= 54; i++) {
    const x = lerp(AP_OUTER_TOP_X, -1.72, i / 54);
    const t = SIDE_GLASS_T + 0.006;
    const p = canopyPoint(x, t, side);
    p.addScaledVector(canopyNormal(x, t, side), 0.0024);
    pts.push(p);
  }
  return tubeFromPoints(pts, 0.0012, materials.chrome, 6, "WindowTopChrome");
}

function makeBPillar(materials, side) {
  const positions = [];
  const indices = [];
  const nx = 6;
  const nt = 26;
  const x0 = -0.356;
  const x1 = -0.268;
  for (let i = 0; i <= nx; i++) {
    const x = lerp(x0, x1, i / nx);
    for (let j = 0; j <= nt; j++) {
      const t = lerp(0.004, SIDE_GLASS_T + 0.018, j / nt);
      const p = canopyPoint(x, t, side);
      const n = canopyNormal(x, t, side);
      p.addScaledVector(n, 0.0056);
      positions.push(p.x, p.y, p.z);
    }
  }
  const cols = nt + 1;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nt; j++) {
      const a = i * cols + j;
      indices.push(a, a + 1, a + cols + 1, a, a + cols + 1, a + cols);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, materials.pillar);
  mesh.name = "BPillar";
  mesh.castShadow = true;
  return mesh;
}

function makeCPillar(materials, side) {
  const positions = [];
  const indices = [];
  const nv = 34;
  const ns = 18;
  for (let i = 0; i <= nv; i++) {
    const v = i / nv;
    const t = v * (SIDE_GLASS_T + 0.05);
    // A slim body-colour C-pillar at the rear of the quarter glass. The old
    // 40 cm-wide panel read as a floating red fin once the roof was blacked out.
    const xFront = lerp(-1.62, -1.68, v);
    const xRear = lerp(-1.78, -1.86, v);
    for (let j = 0; j <= ns; j++) {
      const s = j / ns;
      const x = lerp(xFront, xRear, s);
      const p = canopyPoint(x, t, side);
      const n = canopyNormal(x, t, side);
      p.addScaledVector(n, 0.0052);
      positions.push(p.x, p.y, p.z);
    }
  }
  const cols = ns + 1;
  for (let i = 0; i < nv; i++) {
    for (let j = 0; j < ns; j++) {
      const a = i * cols + j;
      indices.push(a, a + 1, a + cols + 1, a, a + cols + 1, a + cols);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, materials.paint);
  mesh.name = "CPillar";
  mesh.castShadow = true;
  return mesh;
}

function makeRearSail(materials, side) {
  // Closes the triangular void between the C-pillar, the beltline and the
  // backlight. Without it the rear headrests are visible around the glass.
  // Start behind the slim body-colour C-pillar instead of overlapping it. The
  // old front edge buried the red pillar under black trim and made the quarter
  // look like one continuous black wedge.
  const a = canopyPoint(-1.855, SIDE_GLASS_T, side);
  a.addScaledVector(canopyNormal(-1.855, SIDE_GLASS_T, side), 0.0032);
  const b = canopyPoint(-1.780, 0, side);
  b.addScaledVector(canopyNormal(-1.780, 0, side), 0.0032);
  const d = new THREE.Vector3(-1.845, 1.392, side * 0.515);
  const c = new THREE.Vector3(-2.335, 1.198, side * 0.715);

  const vs = [];
  const us = [];
  for (let i = 0; i <= 10; i++) vs.push(i / 10);
  for (let i = 0; i <= 14; i++) us.push(i / 14);

  const mesh = gridSurface(
    vs,
    us,
    (v, u) => {
      const top = a.clone().lerp(d, u);
      const bottom = b.clone().lerp(c, u);
      const p = top.lerp(bottom, v);
      p.z += side * 0.009 * Math.sin(Math.PI * v) * Math.sin(Math.PI * u);
      return p;
    },
    // The sail closes the quarter-panel void, but it must read as black glass /
    // pillar trim. Painting it body colour made a floating red fin behind the
    // C-pillar, which the production car does not have.
    materials.pillar,
    `RearSail_${side > 0 ? "R" : "L"}`
  );
  mesh.castShadow = true;
  return mesh;
}

function cPlaceTrim(materials, side) {
  const pts = [];
  for (let i = 0; i <= 26; i++) {
    const v = i / 26;
    const t = v * (SIDE_GLASS_T + 0.05);
    const x = lerp(-1.62, -1.68, v) + 0.001;
    const p = canopyPoint(x, t, side);
    const n = canopyNormal(x, t, side);
    p.addScaledVector(n, 0.0072);
    pts.push(p);
  }
  return trimLine(pts, materials, 0.0028, "CPillarEdge");
}

/* -------------------------------------------------------------------------- */
/*  Roof                                                                      */
/* -------------------------------------------------------------------------- */

const ROOF_FRONT = 0.38;
const ROOF_REAR = -1.82;

function roofHalfWidth(x) {
  return curve(
    [
      [ROOF_REAR, 0.585],
      [-1.72, 0.602],
      [-1.56, 0.626],
      [-1.36, 0.656],
      [-1.10, 0.690],
      [-0.80, 0.718],
      [-0.40, 0.734],
      [0.00, 0.740],
      [0.20, 0.732],
      [0.32, 0.714],
      [ROOF_FRONT, 0.690],
    ],
    x
  );
}

function roofPoint(x, u) {
  const w = roofHalfWidth(x);
  const y = u * w;
  const crown = 0.028 * u * u;
  return new THREE.Vector3(x, roofHeight(x) + 0.012 - crown, y);
}

function roofPanel(materials, name, widthScale = 1, lift = 0) {
  const xs = [];
  for (let i = 0; i <= 94; i++) xs.push(lerp(ROOF_FRONT, ROOF_REAR, i / 94));
  const us = [];
  for (let i = 0; i <= 34; i++) us.push(lerp(-1, 1, i / 34));
  // The production roof is black all the way to the side rims, with the
  // panoramic glass sitting on top. Keeping the frame body-colour left a white
  // stripe above the windows that the real car does not have.
  const frameMat = materials.roofBlack;
  return gridSurface(
    xs,
    us,
    (x, u) => {
      const p = roofPoint(x, u * widthScale);
      p.y += lift;
      return p;
    },
    frameMat,
    name
  );
}

function roofRim(materials) {
  const group = new THREE.Group();
  const edgeMat = materials.roofBlack;

  for (const side of [-1, 1]) {
    const positions = [];
    const indices = [];
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const x = lerp(ROOF_FRONT, ROOF_REAR, i / n);
      const w = roofHalfWidth(x);
      const top = roofPoint(x, side);
      top.y -= 0.001;
      top.z = side * (w + 0.001);
      // A deep black rail, not a thin painted lip. The reference car's roof
      // rail is clearly visible from the side above the window seal.
      const bottom = new THREE.Vector3(top.x, top.y - 0.062, side * (w - 0.004));
      positions.push(top.x, top.y, top.z, bottom.x, bottom.y, bottom.z);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geom.setIndex(indices);
    geom.computeVertexNormals();
    const rim = new THREE.Mesh(geom, edgeMat);
    rim.name = "RoofSideRim";
    rim.castShadow = true;
    group.add(rim);
  }

  // Front and rear header lips, following the plan-view curve.
  for (const [x, label] of [
    [ROOF_FRONT, "RoofFrontRim"],
    [ROOF_REAR, "RoofRearRim"],
  ]) {
    const pts = [];
    const sign = x === ROOF_FRONT ? 1 : -1;
    for (let i = 0; i <= 34; i++) {
      const u = lerp(-1, 1, i / 34);
      const p = roofPoint(x, u);
      // The front seal must sit on the roof skin, not 10 mm below it. The
      // sunken seal left the glossy front edge of the roof panel exposed as a
      // thin silver line straight above the windscreen.
      p.y -= x === ROOF_FRONT ? 0.001 : 0.010;
      p.x += sign * 0.006;
      pts.push(p);
    }
    const lip = tubeFromPoints(
      pts,
      x === ROOF_FRONT ? 0.008 : 0.007,
      materials.rubberTrim,
      8,
      label
    );
    lip.castShadow = true;
    group.add(lip);
  }

  return group;
}

function roofAssembly(materials) {
  const group = new THREE.Group();
  group.add(roofPanel(materials, "RoofFrame"));
  group.add(roofRim(materials));

  // Dark panoramic centre panel. It runs close to the front header so the
  // glossy black roof reads as one continuous mirror above the windscreen.
  const xs = [];
  for (let i = 0; i <= 60; i++) xs.push(lerp(0.34, -1.34, i / 60));
  const us = [];
  for (let i = 0; i <= 22; i++) us.push(lerp(-0.64, 0.64, i / 22));
  const glass = gridSurface(
    xs,
    us,
    (x, u) => {
      const p = roofPoint(x, u);
      p.y += 0.006;
      return p;
    },
    materials.glassRoof,
    "PanoramicRoof"
  );
  glass.renderOrder = 6;
  glass.castShadow = false;
  group.add(glass);

  // Fine bright border around the glass panel.
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const x = lerp(0.34, -1.34, i / 40);
      const p = roofPoint(x, side * 0.64);
      p.y += 0.009;
      pts.push(p);
    }
    group.add(tubeFromPoints(pts, 0.0022, materials.satin, 6, "PanoramicTrim"));
  }

  // A black roof-edge bead closes the bright glass strip between the roof
  // panel and the side windows. Previously that strip caught the studio
  // horizon and read as a silver halo around the whole canopy.
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const x = lerp(ROOF_FRONT + 0.004, ROOF_REAR - 0.004, i / 60);
      const p = roofPoint(x, side * 0.995);
      p.y += 0.008;
      pts.push(p);
    }
    group.add(tubeFromPoints(pts, 0.011, materials.darkChrome, 7, "RoofEdgeTrim"));
  }

  return group;
}

function rearWindow(materials) {
  const group = new THREE.Group();
  group.name = "RearGlass";

  const vs = [];
  for (let i = 0; i <= 30; i++) vs.push(i / 30);
  const us = [];
  for (let i = 0; i <= 52; i++) us.push(lerp(-1, 1, i / 52));

  const surface = gridSurface(
    vs,
    us,
    (v, u) => {
      const w = lerp(0.72, 0.52, v);
      const z = u * w;
      const x =
        lerp(-2.335, -1.845, v) -
        0.028 * Math.sin(Math.PI * v) * (1 - u * u);
      const y =
        lerp(1.198, 1.392, v) +
        0.010 * Math.sin(Math.PI * v) * (1 - u * u);
      return new THREE.Vector3(x, y, z);
    },
    materials.glassRear,
    "Backlight"
  );
  surface.renderOrder = 6;
  surface.castShadow = false;
  surface.receiveShadow = false;
  group.add(surface);

  // Substantial black side frames, with a fine chrome inner line.
  for (const side of [-1, 1]) {
    const outer = [];
    const inner = [];
    for (let i = 0; i <= 30; i++) {
      const v = i / 30;
      const w = lerp(0.72, 0.52, v);
      const x = lerp(-2.335, -1.845, v);
      const y = lerp(1.198, 1.392, v);
      outer.push(new THREE.Vector3(x - 0.004, y, side * (w + 0.006)));
      inner.push(new THREE.Vector3(x - 0.008, y, side * (w - 0.004)));
    }
    const frame = tubeFromPoints(outer, 0.011, materials.pillar, 8, "RearGlassFrame");
    frame.castShadow = true;
    group.add(frame);
    group.add(trimLine(inner, materials, 0.0026, "RearGlassChrome"));
  }

  // Header and lower trim.
  const header = [];
  for (let i = 0; i <= 40; i++) {
    const u = lerp(-1, 1, i / 40);
    header.push(new THREE.Vector3(-1.849, 1.392, u * 0.52));
  }
  const headerTrim = tubeFromPoints(header, 0.008, materials.pillar, 8, "RearGlassHeader");
  headerTrim.castShadow = true;
  group.add(headerTrim);

  const lower = [];
  for (let i = 0; i <= 40; i++) {
    const u = lerp(-1, 1, i / 40);
    lower.push(new THREE.Vector3(-2.335, 1.198, u * 0.72));
  }
  group.add(tubeFromPoints(lower, 0.0052, materials.darkChrome, 6, "RearGlassLower"));

  return group;
}

function headliner(materials) {
  const group = new THREE.Group();
  const mat = materials.interiorSoft.clone();
  mat.side = THREE.DoubleSide;
  mat.color.set(0xc6c2b4);
  mat.roughness = 0.9;
  mat.metalness = 0;
  mat.envMapIntensity = 0.35;

  const xs = [];
  for (let i = 0; i <= 44; i++) xs.push(lerp(0.26, -1.80, i / 44));
  const us = [];
  for (let i = 0; i <= 14; i++) us.push(lerp(-0.94, 0.94, i / 14));
  const panel = gridSurface(
    xs,
    us,
    (x, u) => {
      const w = (roofHalfWidth(x) - 0.055) * u;
      return new THREE.Vector3(x, roofHeight(x) - 0.062 - 0.012 * u * u, w);
    },
    mat,
    "Headliner"
  );
  group.add(panel);

  // Opaque sunshade between the glass roof and the cream headliner. From the
  // cabin the headliner still reads light, but from outside the roof stays dark
  // instead of showing a bright white ceiling through the panoramic glass.
  const shadeMat = materials.roofBlack.clone();
  shadeMat.side = THREE.DoubleSide;
  shadeMat.color.set(0x080a0b);
  shadeMat.roughness = 0.38;
  shadeMat.envMapIntensity = 0.7;
  // Start the opaque shade at the panoramic panel, not at the headliner's
  // leading edge. The real car's cream header, visors and mirror read through
  // the top of the windscreen; only the glass roof itself stays black outside.
  const shadeXs = [];
  for (let i = 0; i <= 40; i++) shadeXs.push(lerp(0.345, -1.80, i / 40));
  const roofShade = gridSurface(
    shadeXs,
    us,
    (x, u) => {
      const w = (roofHalfWidth(x) - 0.045) * u;
      return new THREE.Vector3(x, roofHeight(x) - 0.028 - 0.006 * u * u, w);
    },
    shadeMat,
    "RoofShade"
  );
  group.add(roofShade);

  // Sun visors. The reference car's upper cabin is dark; cream visors read as
  // two bright floating slabs through the windscreen.
  const visorMat = mat.clone();
  visorMat.color.set(0x3b3834);
  visorMat.roughness = 0.88;
  for (const side of [-1, 1]) {
    const visor = new THREE.Mesh(
      new RoundedBoxGeometry(0.22, 0.024, 0.30, 3, 0.012),
      visorMat
    );
    visor.position.set(0.30, roofHeight(0.30) - 0.118, side * 0.36);
    visor.rotation.z = -0.10;
    group.add(visor);
  }

  // Cargo cover behind the rear bench.
  const shelf = new THREE.Mesh(
    new RoundedBoxGeometry(0.50, 0.035, 1.14, 3, 0.02),
    materials.interiorDark
  );
  shelf.position.set(-1.67, 0.93, 0);
  shelf.rotation.z = 0.03;
  group.add(shelf);

  // A dark bulkhead behind the rear seat keeps the cabin visually closed.
  const bulkhead = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.62, 1.24),
    materials.interiorDark
  );
  bulkhead.position.set(-1.40, 0.78, 0);
  group.add(bulkhead);

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

function roofSpoiler(materials) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1.72, 0.002);
  shape.lineTo(-1.78, 0.017);
  shape.lineTo(-1.89, 0.021);
  shape.lineTo(-1.945, 0.007);
  shape.lineTo(-1.915, 0.001);
  shape.lineTo(-1.78, -0.002);
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 1.0,
    bevelEnabled: true,
    bevelSize: 0.005,
    bevelThickness: 0.005,
    bevelSegments: 3,
    curveSegments: 6,
  });
  geom.translate(0, roofHeight(-1.82) - 0.016, -0.5);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, materials.roofBlack);
  mesh.name = "RoofSpoiler";
  mesh.castShadow = true;
  group.add(mesh);

  const brake = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.006, 0.74),
    materials.tailLED
  );
  brake.position.set(-1.952, roofHeight(-1.82) - 0.023, 0);
  brake.rotation.z = -0.25;
  brake.name = "HighMountBrakeLight";
  group.add(brake);
  return group;
}

function sharkFin(materials) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.73, 0);
  shape.lineTo(-1.57, 0);
  shape.quadraticCurveTo(-1.61, 0.045, -1.67, 0.062);
  shape.quadraticCurveTo(-1.72, 0.052, -1.73, 0);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.052,
    bevelEnabled: true,
    bevelSize: 0.005,
    bevelThickness: 0.005,
    bevelSegments: 2,
  });
  geom.translate(0, 0, -0.026);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, materials.roofBlack);
  mesh.name = "SharkFin";
  mesh.position.set(0, roofHeight(-1.58) + 0.002, 0);
  mesh.castShadow = true;
  return mesh;
}

/* -------------------------------------------------------------------------- */
/*  Mirrors and small parts                                                   */
/* -------------------------------------------------------------------------- */

function sideMirror(materials, side) {
  const group = new THREE.Group();
  group.name = "SideMirror";

  // The production mirror is a body-colour cap over a black lower shell, on a
  // short black stalk from the door sail. The old stacked rounded boxes read
  // as a suitcase, so the housing is a smooth loft: a rounded teardrop in plan
  // view, tallest at the glass, tapering and dipping slightly toward the nose.
  const L = 0.21;
  const H = 0.053;
  const W = 0.074;
  const M = 24;
  const N_WHITE = 30;
  const N_BLACK = 14;
  const seamFrac = 0.5;
  const p = 2 / 4;
  const seamPow = 1 / p;
  const thetaSeam = Math.asin(Math.pow(seamFrac, seamPow));
  const thetaA = Math.PI + thetaSeam;
  const thetaB = 2 * Math.PI - thetaSeam;

  const section = (theta, h, w) => {
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    return [
      h * Math.sign(s) * Math.pow(Math.abs(s), p),
      w * Math.sign(c) * Math.pow(Math.abs(c), p),
    ];
  };

  const stations = [];
  for (let i = 0; i <= M; i++) {
    const u = i / M;
    // A smooth teardrop nose. The cap stays full through most of its length
    // and closes over the front third with a generous radius, like the
    // production part; a short taper ends in a needle and a blunt cut reads as
    // a chopped-off box.
    const nose =
      u < 0.7
        ? 1
        : Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.7) / 0.3, 2)));
    const h =
      H * (1 - 0.12 * u) * (1 + 0.01 * Math.sin(Math.PI * u)) * nose;
    const w =
      W * (1 - 0.08 * u) * (1 + 0.015 * Math.sin(Math.PI * u)) * nose;
    const y = -0.003 * u * u;
    stations.push({ u, x: -L / 2 + L * u, y, h, w });
  }

  const stationAt = (u) => {
    const f = Math.max(0, Math.min(1, u)) * M;
    const i = Math.min(M - 1, Math.floor(f));
    const a = stations[i];
    const b = stations[i + 1];
    const w = f - i;
    return {
      x: lerp(a.x, b.x, w),
      y: lerp(a.y, b.y, w),
      h: lerp(a.h, b.h, w),
      w: lerp(a.w, b.w, w),
    };
  };

  const buildShell = (theta0, theta1, n, material, name) => {
    const positions = [];
    const indices = [];
    const rows = stations.length;
    for (let i = 0; i < rows; i++) {
      const st = stations[i];
      for (let j = 0; j <= n; j++) {
        const theta = lerp(theta0, theta1, j / n);
        const [y, z] = section(theta, st.h, st.w);
        positions.push(st.x, st.y + y, z);
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < n; j++) {
        const a = i * (n + 1) + j;
        const b = (i + 1) * (n + 1) + j;
        const c = (i + 1) * (n + 1) + j + 1;
        const d = i * (n + 1) + j + 1;
        indices.push(a, b, c, a, c, d);
      }
    }
    // Rear cap (faces the driver, -X).
    const rearCenter = positions.length / 3;
    positions.push(stations[0].x, stations[0].y, 0);
    for (let j = 0; j < n; j++) {
      indices.push(rearCenter, j, j + 1);
    }
    // Front cap (faces the front of the car, +X).
    const frontCenter = positions.length / 3;
    const last = stations[rows - 1];
    positions.push(last.x, last.y, 0);
    const base = (rows - 1) * (n + 1);
    for (let j = 0; j < n; j++) {
      indices.push(frontCenter, base + j + 1, base + j);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const housing = new THREE.Group();
  housing.name = "MirrorHousing";
  housing.position.set(0.735, 1.228, side * 1.0);
  housing.rotation.y = -side * 0.14;
  housing.add(
    buildShell(
      thetaB,
      thetaA + 2 * Math.PI,
      N_WHITE,
      materials.paint,
      "MirrorCap"
    )
  );
  housing.add(
    buildShell(thetaA, thetaB, N_BLACK, materials.satin, "MirrorBase")
  );

  // Chrome bead along the outboard cap/base seam.
  const seamTheta = side > 0 ? thetaB : thetaA;
  const seamPts = [];
  for (let i = 0; i <= 24; i++) {
    const u = lerp(0.02, 0.975, i / 24);
    const st = stationAt(u);
    const [y, z] = section(seamTheta, st.h, st.w);
    seamPts.push(
      new THREE.Vector3(st.x, st.y + y, z + side * 0.0012)
    );
  }
  housing.add(
    tubeFromPoints(seamPts, 0.0014, materials.chrome, 5, "MirrorCapChrome")
  );

  // Mirror glass and a black bezel. The bezel is smaller than the housing's
  // rear section so a thin rim of body-colour cap stays visible around it, and
  // the glass fills almost all of the bezel. The old oversized plate stuck out
  // like a picture frame.
  const bezel = new THREE.Mesh(
    new RoundedBoxGeometry(0.005, 0.094, 0.14, 4, 0.03),
    materials.gloss
  );
  bezel.name = "MirrorBezel";
  bezel.position.set(-L / 2 - 0.0015, 0, 0);
  housing.add(bezel);

  const glass = new THREE.Mesh(
    new RoundedBoxGeometry(0.003, 0.084, 0.128, 4, 0.024),
    new THREE.MeshPhysicalMaterial({
      color: 0x9fb4c4,
      metalness: 1,
      roughness: 0.022,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.5,
    })
  );
  glass.name = "MirrorGlass";
  glass.position.set(-L / 2 - 0.0045, 0, 0);
  housing.add(glass);

  // Turn repeater: a slim bright strip at the bottom edge of the painted cap,
  // just above the chrome seam.
  const indSt = stationAt(0.3);
  const indTheta = Math.asin(Math.pow(0.44, seamPow));
  const indThetaSide = side > 0 ? indTheta : Math.PI - indTheta;
  const [indY, indZ] = section(indThetaSide, indSt.h, indSt.w);
  const indicator = new THREE.Mesh(
    new THREE.BoxGeometry(0.042, 0.004, 0.0025),
    materials.chrome
  );
  indicator.name = "MirrorIndicator";
  indicator.position.set(indSt.x, indSt.y + indY, indZ + side * 0.0012);
  housing.add(indicator);

  // Blind-spot camera under the shell.
  const camSt = stationAt(0.36);
  const cameraHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.01, 0.014, 10),
    materials.satin
  );
  cameraHousing.name = "MirrorCamera";
  cameraHousing.position.set(
    camSt.x,
    camSt.y - camSt.h - 0.005,
    -side * 0.008
  );
  housing.add(cameraHousing);

  const cameraLens = new THREE.Mesh(
    new THREE.CircleGeometry(0.005, 10),
    new THREE.MeshPhysicalMaterial({
      color: 0x1b2a36,
      metalness: 0.8,
      roughness: 0.08,
      envMapIntensity: 1.4,
    })
  );
  cameraLens.rotation.x = Math.PI / 2;
  cameraLens.position.set(
    camSt.x,
    camSt.y - camSt.h - 0.0125,
    -side * 0.008
  );
  housing.add(cameraLens);

  group.add(housing);

  // Short black stalk from the door sail to the housing.
  const stalk = new THREE.Mesh(
    new RoundedBoxGeometry(0.055, 0.055, 0.09, 3, 0.012),
    materials.satin
  );
  stalk.name = "MirrorStalk";
  stalk.position.set(0.797, 1.212, side * 0.912);
  stalk.rotation.y = side * 0.34;
  group.add(stalk);

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

function wipers(materials) {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const pts = [
      new THREE.Vector3(0.998, 1.247, side * 0.12),
      new THREE.Vector3(0.984, 1.250, side * 0.34),
      new THREE.Vector3(0.970, 1.253, side * 0.56),
    ];
    const arm = tubeFromPoints(
      pts,
      0.0044,
      materials.rubberTrim,
      8,
      "WiperArm"
    );
    group.add(arm);
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.008, 0.48),
      materials.rubberTrim
    );
    blade.position.set(0.980, 1.250, side * 0.34);
    blade.rotation.y = side * 0.08;
    group.add(blade);
  }
  return group;
}

/* -------------------------------------------------------------------------- */
/*  Public                                                                    */
/* -------------------------------------------------------------------------- */

export function createGreenhouse(materials) {
  const group = new THREE.Group();
  group.name = "Greenhouse";

  const pillar = materials.gloss.clone();
  pillar.side = THREE.DoubleSide;
  pillar.color.set(0x050506);
  // Satin, not mirror gloss. The old near-mirror finish caught the studio
  // horizon as a bright silver halo right around the windscreen.
  pillar.roughness = 0.34;
  pillar.metalness = 0.22;
  pillar.envMapIntensity = 0.7;
  materials.pillar = pillar;

  group.add(buildCanopy(materials), roofAssembly(materials), beltlineTrim(materials));
  group.add(makeAPillar(materials, 1), makeAPillar(materials, -1));
  group.add(makeMirrorSail(materials, 1), makeMirrorSail(materials, -1));
  group.add(aPillarChrome(materials, 1), aPillarChrome(materials, -1));
  group.add(makeBPillar(materials, 1), makeBPillar(materials, -1));
  group.add(makeCPillar(materials, 1), makeCPillar(materials, -1));

  // Machined edges on both sides of the B-pillar make the front and rear side
  // windows read as two separate openings instead of one long black band.
  for (const side of [-1, 1]) {
    for (const x of [-0.356, -0.268]) {
      const pts = [];
      for (let i = 0; i <= 36; i++) {
        const t = lerp(0.006, SIDE_GLASS_T + 0.016, i / 36);
        const p = canopyPoint(x, t, side);
        p.addScaledVector(canopyNormal(x, t, side), 0.0072);
        pts.push(p);
      }
      group.add(tubeFromPoints(pts, 0.0018, materials.pillar, 7, "BPillarEdge"));
    }
  }
  // Deep black seal along the top of the side glass. The painted roof shoulder
  // starts above it, so the window line reads as a flat production-car opening
  // instead of black glass bleeding into the roof.
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 54; i++) {
      const x = lerp(0.402, -1.72, i / 54);
      const p = canopyPoint(x, SIDE_GLASS_T, side);
      p.addScaledVector(canopyNormal(x, SIDE_GLASS_T, side), 0.0068);
      pts.push(p);
    }
    const seal = tubeFromPoints(
      pts,
      0.0048,
      materials.rubberTrim,
      7,
      "WindowTopSeal"
    );
    seal.castShadow = false;
    group.add(seal);
  }
  group.add(windowTopChrome(materials, 1), windowTopChrome(materials, -1));
  group.add(makeRearSail(materials, 1), makeRearSail(materials, -1));
  group.add(cPlaceTrim(materials, 1), cPlaceTrim(materials, -1));
  group.add(headliner(materials));
  group.add(rearWindow(materials));
  group.add(roofSpoiler(materials), sharkFin(materials));
  group.add(sideMirror(materials, 1), sideMirror(materials, -1));


  return group;
}

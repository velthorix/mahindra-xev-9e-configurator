import * as THREE from "three";
import {
  curve,
  warpSurface,
  gridSurface,
  tubeFromPoints,
  lerp,
  roundedRect,
} from "./utils.js";
import { sidePoint } from "./body.js";
import { createEmblem } from "./wheels.js";
import { makePlateTexture } from "../scene/textures.js";

const HW_KEYS = [
  [0.295, 0.64],
  [0.34, 0.725],
  [0.40, 0.772],
  [0.50, 0.795],
  [0.60, 0.802],
  [0.70, 0.800],
  [0.78, 0.796],
  [0.845, 0.800],
  [0.885, 0.795],
  [0.925, 0.786],
  [0.965, 0.772],
  [1.02, 0.742],
];
export const frontHalfWidth = (h) => curve(HW_KEYS, h);

/**
 * The whole nose has to grow with the raised bonnet. Rather than moving forty
 * hand-authored lamp, shield and DRL heights one by one, stretch the fascia in
 * height above the bumper: zero lift at the lower lip, full lift under the
 * bonnet. This keeps the lamp-to-brow spacing and lets the bonnet shut line sit
 * on top of the fascia instead of a hand's width above it.
 */
const FRONT_TOP_LIFT = 0.105;
export function frontLift(h) {
  return FRONT_TOP_LIFT * THREE.MathUtils.smoothstep(h, 0.42, 0.96);
}

/** Base front fascia point. offset pushes forward along +X. */
export function frontPoint(z, h, offset = 0) {
  const hw = frontHalfWidth(h);
  const u = THREE.MathUtils.clamp(z / hw, -1, 1);
  // The nose rounds back into the bonnet above the lamp line. Without this
  // crown the fascia is a tall vertical plate that stands proud of the hood and
  // catches the studio reflection like a mirror.
  const crown = Math.max(0, (h - 0.72) / 0.16);
  const x =
    2.392 -
    0.058 * Math.pow(Math.abs(u), 2.8) -
    0.026 * Math.pow((h - 0.70) / 0.34, 2) -
    0.006 * Math.pow(Math.abs(u), 10) -
    0.075 * Math.pow(crown, 2.2) +
    offset;
  return new THREE.Vector3(x, h + frontLift(h), z);
}

function frontGrid(us, hs, offset, material, name, uvScale = [1, 1]) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    for (let j = 0; j < hs.length; j++) {
      const h = hs[j];
      const z = u * frontHalfWidth(h);
      const p = frontPoint(z, h, offset);
      positions.push(p.x, p.y, p.z);
      uvs.push(((u + 1) / 2) * uvScale[0], ((h - 0.3) / 0.62) * uvScale[1]);
    }
  }
  const nv = hs.length;
  for (let i = 0; i < us.length - 1; i++) {
    for (let j = 0; j < nv - 1; j++) {
      const a = i * nv + j;
      indices.push(a, a + 1, a + nv + 1, a, a + nv + 1, a + nv);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = name;
  return mesh;
}

/** UV-mapped front panel whose width tapers with height. */
function taperedFrontPanel(
  h0,
  h1,
  widthAt,
  offset,
  material,
  name,
  { nu = 56, nh = 34, bulge = 0 } = {}
) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= nu; i++) {
    const t = (i / nu) * 2 - 1;
    for (let j = 0; j <= nh; j++) {
      const s = j / nh;
      const h = lerp(h0, h1, s);
      const z = t * widthAt(h);
      const panelOffset = offset + bulge * Math.exp(-(t * t) / 0.035) * Math.sin(Math.PI * s);
      const p = frontPoint(z, h, panelOffset);
      positions.push(p.x, p.y, p.z);
      uvs.push((t + 1) / 2, s);
    }
  }
  const nv = nh + 1;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nh; j++) {
      const a = i * nv + j;
      indices.push(a, a + 1, a + nv + 1, a, a + nv + 1, a + nv);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = name;
  return mesh;
}

/** A narrow horizontal light/diffuser strip that follows the fascia. */
function frontRibbon(z0, z1, h, height, offset, material, name, segments = 72) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const z = lerp(z0, z1, i / segments);
    for (const row of [-0.5, 0.5]) {
      const p = frontPoint(z, h + height * row, offset);
      positions.push(p.x, p.y, p.z);
      uvs.push(i / segments, row + 0.5);
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 3, a, a + 3, a + 1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.material.side = THREE.DoubleSide;
  mesh.name = name;
  return mesh;
}

function outlineFrom(parts) {
  const pts = [];
  for (const part of parts) {
    if (part.type === "line") {
      for (let i = 0; i < part.points.length - 1; i++) {
        const a = part.points[i];
        const b = part.points[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.006));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          pts.push(new THREE.Vector2(lerp(a[0], b[0], t), lerp(a[1], b[1], t)));
        }
      }
    }
  }
  return pts;
}

function patch(outline, offset, material, name, maxEdge = 0.008) {
  const mesh = warpSurface(
    outline,
    (z, h) => frontPoint(z, h, offset),
    maxEdge,
    material,
    name
  );
  mesh.name = name;
  return mesh;
}

function mirrorZ(points) {
  return points.map((p) => new THREE.Vector2(-p.x, p.y));
}

/* -------------------------------------------------------------------------- */
/*  Headlamps                                                                 */
/* -------------------------------------------------------------------------- */

const LAMP_OUTLINE = [
  [0.784, 0.832],
  [0.568, 0.832],
  [0.556, 0.792],
  [0.534, 0.690],
  [0.566, 0.592],
  [0.600, 0.548],
  [0.708, 0.554],
  [0.756, 0.602],
  [0.778, 0.700],
  [0.782, 0.790],
];

function makeProjector(materials, side, z, h, width, height, grid = false) {
  const module = new THREE.Group();
  module.name = "HeadlampProjector";

  const p = frontPoint(side * z, h, 0.010);

  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, height + 0.011, width + 0.014),
    materials.headlampHousing
  );
  backing.position.copy(p);
  module.add(backing);

  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, height + 0.004, width + 0.004),
    materials.gap
  );
  bezel.position.set(p.x + 0.011, p.y, p.z);
  module.add(bezel);

  const recess = new THREE.Mesh(
    new THREE.BoxGeometry(0.006, height, width),
    materials.projector
  );
  recess.position.set(p.x + 0.016, p.y, p.z);
  module.add(recess);

  if (grid) {
    // The production lower module is a 2x2 array of bright LED chips, not one
    // flat lens. Four small emitters also stop the black housing reading as a
    // vent when the lights are off.
    const chipW = (width - 0.026) * 0.5;
    const chipH = (height - 0.020) * 0.5;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const chip = new THREE.Mesh(
          new THREE.ShapeGeometry(roundedRect(chipW, chipH, 0.0018, 2)),
          materials.drl
        );
        chip.rotation.y = Math.PI / 2;
        chip.position.set(
          p.x + 0.0225,
          p.y + (row - 0.5) * (chipH + 0.0045),
          p.z + (col - 0.5) * (chipW + 0.0045)
        );
        module.add(chip);
      }
    }
  } else {
    const led = new THREE.Mesh(
      new THREE.ShapeGeometry(roundedRect(width - 0.012, height - 0.009, 0.006, 3)),
      materials.headlampLED
    );
    // The front of the car is +X for both lamps. Facing the left LED backwards
    // makes it disappear completely, which is why the old left cluster looked
    // dead even with the light mode switched on.
    led.rotation.y = Math.PI / 2;
    led.position.set(p.x + 0.0205, p.y, p.z);
    module.add(led);

    // A fine horizontal light guide splits the rectangle like the production
    // projector modules.
    const divider = new THREE.Mesh(
      new THREE.BoxGeometry(0.004, 0.0028, width - 0.017),
      materials.darkChrome
    );
    divider.position.set(p.x + 0.023, p.y, p.z);
    module.add(divider);
  }

  const glass = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRect(width - 0.004, height - 0.002, 0.006, 3)),
    materials.lensClear
  );
  glass.rotation.y = Math.PI / 2;
  glass.position.set(p.x + 0.025, p.y, p.z);
  module.add(glass);

  // Thin machined ring around the LED aperture. Without it the dark module
  // reads as a vent slot from three-quarters.
  {
    const pts = [];
    const hw = width * 0.5 + 0.002;
    const hh = height * 0.5 + 0.002;
    const r = Math.min(hw, hh) * 0.28;
    const corners = [
      [hw - r, hh - r, 0, Math.PI * 0.5],
      [-hw + r, hh - r, Math.PI * 0.5, Math.PI],
      [-hw + r, -hh + r, Math.PI, Math.PI * 1.5],
      [hw - r, -hh + r, Math.PI * 1.5, Math.PI * 2],
    ];
    for (const [cx, cy, a0, a1] of corners) {
      for (let i = 0; i <= 4; i++) {
        const a = lerp(a0, a1, i / 4);
        pts.push(
          new THREE.Vector3(
            p.x + 0.024,
            p.y + cy + Math.sin(a) * r,
            p.z + cx + Math.cos(a) * r
          )
        );
      }
    }
    pts.push(pts[0].clone());
    module.add(tubeFromPoints(pts, 0.0022, materials.alloy, 5, "ProjectorRing"));
  }

  return module;
}

function makeLamp(materials, side) {
  const group = new THREE.Group();
  group.name = side > 0 ? "Headlamp_R" : "Headlamp_L";

  let outline = LAMP_OUTLINE.map(([z, h]) => [z, h]);
  if (side < 0) outline = outline.map(([z, h]) => [-z, h]);

  const outlinePts = outlineFrom([
    { type: "line", points: [...outline, outline[0]] },
  ]);

  // Sit the housing just proud of the nose shield so the full angular lamp is
  // visible. At the old depth the body-colour shield covered the inner half and
  // the cluster read as a thin bumper vent.
  const housing = patch(outlinePts, 0.012, materials.headlampHousing, "LampHousing", 0.006);
  group.add(housing);

  const inner = outline.map(([z, h]) => {
    const cz = outline.reduce((a, p) => a + p[0], 0) / outline.length;
    const ch = outline.reduce((a, p) => a + p[1], 0) / outline.length;
    return [cz + (z - cz) * 0.86, ch + (h - ch) * 0.9];
  });
  const innerPts = outlineFrom([{ type: "line", points: [...inner, inner[0]] }]);
  group.add(patch(innerPts, 0.014, materials.projector, "LampInner", 0.006));

  // Thin bright edge around the aperture, like the machined frame on the real
  // lamp. It is deliberately inboard of the shut line so it never reads as a
  // chrome bumper trim.
  const framePts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const z = side * lerp(0.556, 0.782, t);
    const h = lerp(0.792, 0.832, t);
    framePts.push(frontPoint(z, h, 0.015));
  }
  group.add(tubeFromPoints(framePts, 0.0024, materials.alloy, 5, "LampTopFrame"));

  // A slim raised bezel around the whole aperture separates the black lamp from
  // the red fascia and stops it reading as a bumper vent at three-quarters.
  {
    const rimPts = LAMP_OUTLINE.map(([z, h]) => frontPoint(side * z, h, 0.013));
    rimPts.push(rimPts[0].clone());
    group.add(tubeFromPoints(rimPts, 0.0024, materials.alloy, 5, "LampBezel"));
  }

  // The production signature runs down the outboard edge of the cluster, right
  // next to the fender, rather than drawing a parenthesis around the inboard
  // projectors.
  const bladePts = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const h = lerp(0.575, 0.828, t);
    const z = side * lerp(0.735, 0.782, t);
    bladePts.push(frontPoint(z, h, 0.032));
  }
  group.add(tubeFromPoints(bladePts, 0.0042, materials.drl, 6, "HeadlampBlade"));

  // Two stacked rectangular LED modules. The upper one is a projector low beam;
  // the lower one is the high-beam/auxiliary LED array.
  group.add(makeProjector(materials, side, 0.700, 0.748, 0.112, 0.048));
  group.add(makeProjector(materials, side, 0.684, 0.675, 0.090, 0.036, true));

  // Clear lens over the whole aperture.
  group.add(patch(outlinePts, 0.039, materials.lensClear, "HeadlampLens", 0.009));

  // Amber side marker, kept at the outer corner so it reads only from profile.
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(0.006, 0.012, 0.028),
    materials.indicator
  );
  marker.position.copy(frontPoint(side * 0.780, 0.742, 0.026));
  group.add(marker);

  // The lamp wraps around the front corner onto the fender. A black side
  // extension with its own light blade makes the headlamp legible in profile
  // and three-quarter views, where the front face alone disappears.
  {
    const xs = [];
    const x0 = side > 0 ? 2.345 : 2.388;
    const x1 = side > 0 ? 2.388 : 2.345;
    for (let i = 0; i <= 12; i++) xs.push(lerp(x0, x1, i / 12));
    const hs = [];
    for (let i = 0; i <= 16; i++) hs.push(lerp(0.616, 0.832, i / 16));
    const sideLamp = gridSurface(
      xs,
      hs,
      (x, h) => sidePoint(x, h + frontLift(h), side, 0.0038),
      materials.headlampHousing,
      "HeadlampSide"
    );
    group.add(sideLamp);

    const sideBlade = [];
    for (let i = 0; i <= 16; i++) {
      const h = lerp(0.618, 0.824, i / 16);
      sideBlade.push(sidePoint(2.374, h + frontLift(h), side, 0.008));
    }
    group.add(tubeFromPoints(sideBlade, 0.0028, materials.drl, 6, "HeadlampSideBlade"));
  }

  return group;
}

/* -------------------------------------------------------------------------- */

export function createFront(materials) {
  const group = new THREE.Group();
  group.name = "FrontEnd";

  // Main fascia
  const us = [];
  for (let i = 0; i <= 90; i++) us.push(lerp(-1, 1, i / 90));
  const hs = [];
  for (let i = 0; i <= 64; i++) hs.push(lerp(0.295, 0.882, i / 64));
  const fascia = frontGrid(us, hs, 0, materials.paint, "FrontFascia");
  group.add(fascia);

  /* --------------------------- sculpted nose ---------------------------- */
  const shieldWidth = (h) =>
    curve(
      [
        [0.500, 0.420],
        [0.545, 0.445],
        [0.600, 0.485],
        [0.680, 0.520],
        [0.760, 0.550],
        [0.835, 0.566],
      ],
      h
    );

  // The real car has a body-colour "grille" with a very fine geometric surface.
  // A black gasket and a satin, bump-mapped shield keep it from behaving like a
  // flat mirror, while the panel still matches every paint colour.
  const gasket = taperedFrontPanel(
    0.495,
    0.840,
    (h) => shieldWidth(h) + 0.016,
    0.003,
    materials.gap,
    "NoseGasket",
    { nu: 40, nh: 24 }
  );
  group.add(gasket);

  const shield = taperedFrontPanel(
    0.505,
    0.832,
    shieldWidth,
    0.006,
    materials.noseShield,
    "NoseShield",
    { nu: 72, nh: 40, bulge: 0.0035 }
  );
  group.add(shield);

  // Fine black shut line / gasket around the shield. No chrome frame: the real
  // panel is visually flush with the body apart from a narrow dark gap.
  {
    const top = [];
    const bottom = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      const z1 = lerp(-shieldWidth(0.832) - 0.006, shieldWidth(0.832) + 0.006, t);
      top.push(frontPoint(z1, 0.834, 0.0065));
      const z2 = lerp(-shieldWidth(0.505) - 0.006, shieldWidth(0.505) + 0.006, t);
      bottom.push(frontPoint(z2, 0.503, 0.0065));
    }
    group.add(tubeFromPoints(top, 0.0022, materials.gap, 5, "NoseTopSeam"));
    group.add(tubeFromPoints(bottom, 0.0022, materials.gap, 5, "NoseBottomSeam"));

    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 36; i++) {
        const h = lerp(0.505, 0.832, i / 36);
        pts.push(frontPoint(side * (shieldWidth(h) + 0.008), h, 0.0065));
      }
      group.add(tubeFromPoints(pts, 0.0022, materials.gap, 5, "NoseSideSeam"));
    }
  }

  // A restrained centre ridge catches the studio highlight like the crease on
  // the production nose.
  {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const h = lerp(0.55, 0.82, i / 30);
      pts.push(frontPoint(0, h, 0.0105 + 0.0035 * Math.sin(Math.PI * (i / 30))));
    }
    group.add(tubeFromPoints(pts, 0.0016, materials.gap, 4, "NoseCentreSeam"));
  }

  /* ---------------------------- light bar ------------------------------- */
  {
    // The production light slot is a narrow black band beneath the bonnet
    // brow, not the deep bumper-height bar used in the earlier front end.
    const recess = frontRibbon(-0.790, 0.790, 0.858, 0.016, 0.007, materials.gloss, "DRLRecess");
    group.add(recess);
    const glow = frontRibbon(-0.772, 0.772, 0.858, 0.008, 0.013, materials.drl, "DRLBar");
    group.add(glow);
    const underline = frontRibbon(-0.790, 0.790, 0.846, 0.0018, 0.0105, materials.darkChrome, "DRLUnderline", 48);
    group.add(underline);
  }

  /* ------------------------------ emblem -------------------------------- */
  // The production car places the twin-peaks mark on the red brow above the
  // light bar, not in the middle of the lattice shield.
  const emblem = createEmblem(0.11, materials);
  emblem.rotation.y = Math.PI / 2;
  const ep = frontPoint(0, 0.880, 0.016);
  emblem.position.set(ep.x - 0.005, ep.y, ep.z);
  group.add(emblem);

  /* ------------------------------ lamps --------------------------------- */
  group.add(makeLamp(materials, 1), makeLamp(materials, -1));

  // Black corner infill joins each lamp to the lower bumper the way the
  // production car's lamp aperture wraps into the bumper.
  for (const side of [-1, 1]) {
    const outline = [
      [side * 0.640, 0.495],
      [side * 0.800, 0.495],
      [side * 0.810, 0.585],
      [side * 0.762, 0.552],
      [side * 0.705, 0.548],
      [side * 0.650, 0.565],
    ].map(([z, h]) => new THREE.Vector2(z, h));
    group.add(patch(outline, 0.006, materials.gloss, "LampCornerInfill", 0.01));
  }

  /* --------------------------- lower bumper ----------------------------- */
  const lowerUs = [];
  for (let i = 0; i <= 74; i++) lowerUs.push(lerp(-1, 1, i / 74));
  const lowerHs = [];
  for (let i = 0; i <= 24; i++) lowerHs.push(lerp(0.292, 0.51, i / 24));
  const lower = frontGrid(lowerUs, lowerHs, 0.006, materials.satin, "FrontLowerBumper");
  group.add(lower);

  // Two wide lower intakes split by a body-colour centre bar, matching the
  // production bumper. A single narrow grille made the nose look electric-only
  // and toy-like from straight ahead.
  {
    const ihs = [];
    for (let i = 0; i <= 16; i++) ihs.push(lerp(0.338, 0.492, i / 16));
    for (const [u0, u1] of [
      [-0.50, -0.055],
      [0.055, 0.50],
    ]) {
      const ius = [];
      for (let i = 0; i <= 34; i++) ius.push(lerp(u0, u1, i / 34));
      const intake = frontGrid(ius, ihs, 0.012, materials.intakeMesh, "FrontIntakeMesh");
      group.add(intake);
    }

    // Centre divider.
    const centreUs = [];
    for (let i = 0; i <= 8; i++) centreUs.push(lerp(-0.05, 0.05, i / 8));
    const centreHs = [];
    for (let i = 0; i <= 12; i++) centreHs.push(lerp(0.336, 0.496, i / 12));
    group.add(frontGrid(centreUs, centreHs, 0.017, materials.gap, "IntakeCentreBar"));

    // Horizontal strakes behind the mesh give the lower intake depth.
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        const pts = [];
        for (let j = 0; j <= 22; j++) {
          const z = side * lerp(0.07, 0.37, j / 22);
          pts.push(frontPoint(z, 0.355 + i * 0.032, 0.02));
        }
        group.add(tubeFromPoints(pts, 0.0021, materials.darkChrome, 4, "IntakeSlat"));
      }
    }
  }

  // Vertical corner intakes.
  for (const side of [-1, 1]) {
    const p = frontPoint(side * 0.715, 0.415, 0.013);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.135, 0.072),
      materials.gap
    );
    frame.position.copy(p);
    group.add(frame);

    for (let i = 0; i < 2; i++) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.009, 0.118, 0.006),
        materials.darkChrome
      );
      fin.position.copy(frontPoint(side * (0.704 + i * 0.022), 0.415, 0.026));
      group.add(fin);
    }
  }

  // Silver skid plate.
  {
    const p = frontPoint(0, 0.306, 0.012);
    const skid = new THREE.Mesh(
      new THREE.BoxGeometry(0.023, 0.033, 1.12),
      materials.alloy
    );
    skid.position.copy(p);
    group.add(skid);
    const under = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.018, 1.06),
      materials.gap
    );
    under.position.copy(frontPoint(0, 0.323, 0.018));
    group.add(under);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.026, 0.13),
        materials.alloy
      );
      wing.position.copy(frontPoint(side * 0.53, 0.307, 0.014));
      wing.rotation.y = side * 0.18;
      group.add(wing);
    }
  }

  // Parking sensors on the bumper.
  for (const z of [-0.52, -0.28, 0.28, 0.52]) {
    const p = frontPoint(z, 0.505, 0.019);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.007, 18),
      materials.darkChrome
    );
    ring.rotation.z = Math.PI / 2;
    ring.position.copy(p);
    group.add(ring);
  }

  // Front camera under the emblem.
  {
    const p = frontPoint(0, 0.744, 0.018);
    const cam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0105, 0.0105, 0.012, 18),
      materials.projector
    );
    cam.rotation.z = Math.PI / 2;
    cam.position.copy(p);
    group.add(cam);
  }

  // Number plate, mounted on the body-colour shield like the production car,
  // with the black intake below it.
  {
    const tex = makePlateTexture("XEV 9e");
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.112, 0.45),
      materials.plate
    );
    backing.position.copy(frontPoint(0, 0.575, 0.023));
    group.add(backing);
    const faceMat = materials.plateFace.clone();
    faceMat.map = tex;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.432, 0.100), faceMat);
    face.rotation.y = Math.PI / 2;
    face.position.copy(frontPoint(0, 0.575, 0.031));
    group.add(face);
  }

  /* --------------------------- headlight beams -------------------------- */
  const lights = [];
  for (const side of [-1, 1]) {
    const spot = new THREE.SpotLight(0xe7f1ff, 0, 22, 0.36, 0.72, 1.35);
    spot.position.set(2.46, 0.66, side * 0.67);
    const target = new THREE.Object3D();
    target.position.set(7.2, 0.02, side * 1.3);
    group.add(spot, target);
    spot.target = target;
    lights.push(spot);
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });

  return { group, lights, materials };
}

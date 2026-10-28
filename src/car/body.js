import * as THREE from "three";
import {
  curve,
  warpSurface,
  gridSurface,
  tubeFromPoints,
  lerp,
  clamp,
  smoothstep,
} from "./utils.js";

/* --------------------------------------------------------------------------
   Key proportions of the production car (metres)
   -------------------------------------------------------------------------- */

export const CAR = {
  length: 4.789,
  width: 1.907,
  height: 1.694,
  wheelbase: 2.775,
  frontAxle: 1.3875,
  rearAxle: -1.3875,
  wheelRadius: 0.376,
  wheelY: 0.376,
  trackHalf: 0.805,
  archRadius: 0.405,
};

const TOP_KEYS = [
  [-2.394, 1.030],
  [-2.30, 1.085],
  [-2.21, 1.142],
  [-2.10, 1.208],
  [-1.98, 1.248],
  [-1.86, 1.248],
  [-1.70, 1.232],
  [-1.55, 1.218],
  [-1.3875, 1.205],
  [-1.20, 1.195],
  [-1.00, 1.188],
  [-0.70, 1.187],
  [-0.40, 1.185],
  [0.00, 1.188],
  [0.40, 1.191],
  [0.70, 1.198],
  [0.95, 1.210],
  [1.10, 1.205],
  [1.25, 1.197],
  [1.3875, 1.190],
  [1.55, 1.175],
  [1.70, 1.158],
  [1.85, 1.140],
  [2.00, 1.115],
  [2.12, 1.090],
  [2.24, 1.060],
  [2.32, 1.030],
  [2.37, 1.008],
  [2.394, 0.995],
];

const BOTTOM_KEYS = [
  [-2.394, 0.455],
  [-2.30, 0.365],
  [-2.15, 0.318],
  [-1.90, 0.300],
  [-1.20, 0.294],
  [0.00, 0.294],
  [1.20, 0.298],
  [1.90, 0.302],
  [2.15, 0.322],
  [2.30, 0.355],
  [2.394, 0.405],
];

const WIDTH_KEYS = [
  [-2.394, 0.795],
  [-2.30, 0.838],
  [-2.15, 0.883],
  [-2.00, 0.916],
  [-1.80, 0.938],
  [-1.60, 0.949],
  [-1.3875, 0.9535],
  [-1.15, 0.950],
  [-0.80, 0.947],
  [-0.30, 0.946],
  [0.20, 0.945],
  [0.60, 0.945],
  [0.95, 0.947],
  [1.15, 0.951],
  [1.3875, 0.9535],
  [1.60, 0.948],
  [1.80, 0.937],
  [2.00, 0.922],
  [2.15, 0.902],
  [2.28, 0.876],
  [2.35, 0.840],
  [2.394, 0.807],
];

/* Cross-sectional width factor by height: a broad shoulder, tucked rocker and
   a little tumblehome above the shoulder. */
const GIRTH_KEYS = [
  [0.27, 0.848],
  [0.31, 0.875],
  [0.36, 0.894],
  [0.42, 0.912],
  [0.50, 0.932],
  [0.60, 0.950],
  [0.70, 0.966],
  [0.78, 0.979],
  [0.84, 0.990],
  [0.88, 0.997],
  [0.91, 1.0],
  [0.94, 1.0],
  [0.98, 0.997],
  [1.02, 0.990],
  [1.06, 0.978],
  [1.10, 0.962],
  [1.14, 0.943],
  [1.18, 0.920],
  [1.22, 0.894],
  [1.26, 0.864],
  [1.30, 0.830],
  [1.36, 0.780],
  [1.42, 0.720],
  [1.50, 0.650],
  [1.60, 0.560],
  [1.70, 0.470],
];

export const zTop = (x) => curve(TOP_KEYS, x);
export const zBottom = (x) => curve(BOTTOM_KEYS, x);
export const maxHalfWidth = (x) => curve(WIDTH_KEYS, x);

export function halfWidthAt(x, h) {
  let base = maxHalfWidth(x) * curve(GIRTH_KEYS, h);
  // Crisp fender haunch around each axle.
  const fender =
    0.008 *
    Math.exp(-Math.pow((x - CAR.frontAxle) / 0.34, 2)) *
    smoothstep(0.42, 0.68, h) *
    (1 - smoothstep(0.98, 1.14, h));
  const rearFender =
    0.009 *
    Math.exp(-Math.pow((x - CAR.rearAxle) / 0.32, 2)) *
    smoothstep(0.44, 0.70, h) *
    (1 - smoothstep(0.98, 1.16, h));
  // A very subtle body-side crease at shoulder height.
  const crease = 0.0022 * Math.exp(-Math.pow((h - 0.805) / 0.022, 2));
  return base + fender + rearFender + crease;
}

function archData() {
  const arches = [];
  for (const cx of [CAR.rearAxle, CAR.frontAxle]) {
    const zb = zBottom(cx);
    const dz = zb - CAR.wheelY;
    const dx = Math.sqrt(Math.max(0.001, CAR.archRadius ** 2 - dz ** 2));
    const alpha = Math.asin(clamp(dz / CAR.archRadius, -1, 1));
    arches.push({ cx, dx, zb, alpha, r: CAR.archRadius });
  }
  return arches;
}

const ARCHES = archData();

export const sidePoint = (x, h, side, offset = 0) =>
  new THREE.Vector3(x, h, side * (halfWidthAt(x, h) + offset));

/* -------------------------------------------------------------------------- */
/*  Side silhouette                                                            */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Body context                                                              */
/* -------------------------------------------------------------------------- */

export function createBody(materials) {
  const group = new THREE.Group();
  group.name = "ExteriorBody";

  /**
   * The side is a heightfield with much finer rows than columns. Adaptive
   * triangulation at 4.8 cm undersamples the shoulder curvature, and glossy
   * area-light reflections break into a moiré band there. A brute-force
   * 1.2 cm adaptive mesh fixed it but produced >600k triangles per side, so
   * this structured grid keeps ~1 cm vertical steps at a fraction of the cost.
   * Cells touching the wheel openings are omitted; the wider arch cladding
   * covers the stepped paint edge.
   */
  const sidePanel = (side, name) => {
    const stepX = 0.026;
    const rows = 76;
    const xs = [];
    for (let x = -2.394; x < 2.394 - 1e-6; x += stepX) xs.push(x);
    xs.push(2.394);

    const nu = xs.length;
    const nv = rows + 1;
    const positions = [];
    const normals = [];
    const indices = [];
    const eps = 0.002;

    for (let i = 0; i < nu; i++) {
      const x = xs[i];
      const yBottom = zBottom(x);
      const yTop = zTop(x);
      for (let j = 0; j < nv; j++) {
        const h = lerp(yBottom, yTop, j / rows);
        positions.push(x, h, side * halfWidthAt(x, h));

        // Keep the shading derivative inside the actual side surface. At the
        // top row h + eps used to sample the greenhouse void above zTop, which
        // tilted the boundary normal upward and left a bright 1-pixel pinstripe
        // along the whole shoulder. A clipped one-sided difference fixes it.
        const xPlus = Math.min(x + eps, 2.394);
        const xMinus = Math.max(x - eps, -2.394);
        const hPlus = Math.min(h + eps, yTop);
        const hMinus = Math.max(h - eps, yBottom);
        const wx =
          (halfWidthAt(xPlus, h) - halfWidthAt(xMinus, h)) /
          Math.max(1e-6, xPlus - xMinus);
        const wh =
          (halfWidthAt(x, hPlus) - halfWidthAt(x, hMinus)) /
          Math.max(1e-6, hPlus - hMinus);
        let nx = -wx;
        let ny = -wh;
        let nz = side;
        const length = Math.hypot(nx, ny, nz) || 1;
        normals.push(nx / length, ny / length, nz / length);
      }
    }

    const nearOpening = (x, h) =>
      ARCHES.some((a) => {
        const dx = x - a.cx;
        const dy = h - CAR.wheelY;
        const r = a.r + 0.012;
        return dx * dx + dy * dy < r * r;
      });

    for (let i = 0; i < nu - 1; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const b0 = zBottom(x0);
      const t0 = zTop(x0);
      const b1 = zBottom(x1);
      const t1 = zTop(x1);

      for (let j = 0; j < rows; j++) {
        const j0 = j / rows;
        const j1 = (j + 1) / rows;
        const h00 = lerp(b0, t0, j0);
        const h01 = lerp(b0, t0, j1);
        const h10 = lerp(b1, t1, j0);
        const h11 = lerp(b1, t1, j1);

        if (
          nearOpening(x0, h00) ||
          nearOpening(x0, h01) ||
          nearOpening(x1, h10) ||
          nearOpening(x1, h11) ||
          nearOpening((x0 + x1) / 2, (h00 + h11) / 2)
        ) {
          continue;
        }

        const a = i * nv + j;
        const b = a + 1;
        const c = (i + 1) * nv + j + 1;
        const d = (i + 1) * nv + j;
        if (side > 0) indices.push(a, d, c, a, c, b);
        else indices.push(a, c, d, a, b, c);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geom.setIndex(indices);
    const mesh = new THREE.Mesh(geom, materials.paint);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const right = sidePanel(1, "BodySide_R");
  const left = sidePanel(-1, "BodySide_L");
  group.add(right, left);

  // Rocker cladding
  const rockerShape = [
    new THREE.Vector2(1.00, 0.300),
    new THREE.Vector2(1.025, 0.375),
    new THREE.Vector2(1.07, 0.455),
    new THREE.Vector2(1.02, 0.528),
    new THREE.Vector2(0.84, 0.545),
    new THREE.Vector2(-0.84, 0.545),
    new THREE.Vector2(-1.02, 0.528),
    new THREE.Vector2(-1.07, 0.455),
    new THREE.Vector2(-1.025, 0.375),
    new THREE.Vector2(-1.00, 0.300),
    new THREE.Vector2(0.0, 0.288),
  ];
  for (const side of [-1, 1]) {
    const cladding = warpSurface(
      rockerShape,
      (x, h) => new THREE.Vector3(x, h, side * (halfWidthAt(x, h) + 0.008)),
      0.035,
      materials.satin,
      side > 0 ? "RockerTrim_R" : "RockerTrim_L"
    );
    cladding.castShadow = true;
    cladding.receiveShadow = true;
    group.add(cladding);
  }

  // Wheel-arch cladding: a raised lip following the exact opening.
  const addArchTrim = (side) => {
    for (const a of ARCHES) {
      const start = Math.PI - a.alpha + 0.025;
      const end = a.alpha - 0.025;
      const n = 64;
      const rows = [];
      const rings = [
        { r: a.r + 0.052, off: 0.004, lift: 0.0 },
        { r: a.r + 0.030, off: 0.018, lift: 0.012 },
        { r: a.r + 0.006, off: 0.024, lift: 0.017 },
        { r: a.r - 0.006, off: -0.040, lift: -0.012 },
      ];
      for (let i = 0; i <= n; i++) {
        const ang = lerp(start, end, i / n);
        const x = a.cx + Math.cos(ang) * (a.r + 0.03);
        const h = CAR.wheelY + Math.sin(ang) * (a.r + 0.03);
        const z = side * (halfWidthAt(x, h) + 0.01);
        const row = [];
        for (const ring of rings) {
          const xx = a.cx + Math.cos(ang) * ring.r;
          const hh = CAR.wheelY + Math.sin(ang) * ring.r;
          row.push(new THREE.Vector3(xx, hh, side * (halfWidthAt(xx, hh) + ring.off)));
        }
        rows.push(row);
      }
      const positions = [];
      const indices = [];
      for (const row of rows) for (const p of row) positions.push(p.x, p.y, p.z);
      const cols = rings.length;
      for (let i = 0; i < rows.length - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
          const a0 = i * cols + j;
          const b0 = a0 + 1;
          const c0 = (i + 1) * cols + j + 1;
          const d0 = (i + 1) * cols + j;
          indices.push(a0, b0, c0, a0, c0, d0);
        }
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      const mesh = new THREE.Mesh(geom, materials.satin);
      mesh.name = "ArchCladding";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      // A raised rubber lip around the opening. The flat cladding band alone
      // disappeared against the shadowed tyre; this catches a highlight and
      // gives the wheel arch the same thick black edge as the production car.
      const lipPts = [];
      for (let i = 0; i <= 48; i++) {
        const ang = lerp(start, end, i / 48);
        const r = a.r + 0.014;
        const xx = a.cx + Math.cos(ang) * r;
        const hh = CAR.wheelY + Math.sin(ang) * r;
        lipPts.push(new THREE.Vector3(xx, hh, side * (halfWidthAt(xx, hh) + 0.024)));
      }
      const lip = tubeFromPoints(lipPts, 0.018, materials.satin, 7, "ArchLip");
      lip.castShadow = true;
      group.add(lip);
    }
  };
  addArchTrim(1);
  addArchTrim(-1);

  // Wheel-house liners.
  const linerGeom = (side, a) => {
    const n = 48;
    const positions = [];
    const indices = [];
    const zInner = side * 0.62;
    const zOuter = side * 0.925;
    for (let i = 0; i <= n; i++) {
      const ang = lerp(Math.PI + 0.12, -0.12, i / n);
      const x = a.cx + Math.cos(ang) * (a.r - 0.006);
      const h = CAR.wheelY + Math.sin(ang) * (a.r - 0.006);
      positions.push(x, h, zInner, x, h, zOuter);
    }
    for (let i = 0; i < n; i++) {
      const a0 = i * 2;
      indices.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2);
    }
    // inner wall
    const base = (n + 1) * 2;
    const center = base;
    positions.push(a.cx, CAR.wheelY, zInner);
    for (let i = 0; i <= n; i++) {
      const ang = lerp(Math.PI + 0.12, -0.12, i / n);
      positions.push(
        a.cx + Math.cos(ang) * (a.r - 0.006),
        CAR.wheelY + Math.sin(ang) * (a.r - 0.006),
        zInner
      );
    }
    for (let i = 0; i < n; i++) indices.push(center, base + 1 + i, base + 2 + i);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  };
  for (const a of ARCHES) {
    for (const side of [-1, 1]) {
      const liner = new THREE.Mesh(linerGeom(side, a), materials.wheelWell);
      liner.name = "WheelHouseLiner";
      liner.receiveShadow = true;
      group.add(liner);
    }
  }

  /* ----------------------------- hood ------------------------------------ */
  const hoodXs = [];
  for (let i = 0; i <= 150; i++) hoodXs.push(lerp(1.005, 2.33, i / 150));
  const hoodUs = [];
  for (let i = 0; i <= 128; i++) hoodUs.push(lerp(-1, 1, i / 128));

  const hoodCrown = (x) =>
    curve(
      [
        [1.005, 0.025],
        [1.20, 0.032],
        [1.55, 0.039],
        [1.90, 0.034],
        [2.15, 0.023],
        [2.33, 0.013],
      ],
      x
    );

  const hoodPoint = (x, u) => {
    const zt = zTop(x);
    // Close the old 4 mm slit between the bonnet edge and the top of the body
    // side. The slit read as a continuous white pinstripe along the fender and
    // bonnet, independent of paint roughness or lighting.
    const topW = halfWidthAt(x, zt) + 0.0015;
    const absU = Math.abs(u);

    // Match the production bonnet: a broad, almost flat centre with a gentle
    // crown and two restrained character lines set well outboard. The previous
    // deep twin grooves and central spine read as a double-bubble hood from the
    // front, unlike the real car's clean clamshell pressing.
    const crown = hoodCrown(x) * Math.pow(1 - Math.pow(absU, 3.2), 0.92);
    const groove = 0.0032 * Math.exp(-Math.pow((absU - 0.50) / 0.030, 2));
    return new THREE.Vector3(x, zt + crown - groove, u * topW);
  };
  const hood = gridSurface(hoodXs, hoodUs, hoodPoint, materials.paint, "Bonnet");
  hood.castShadow = true;
  hood.receiveShadow = true;
  group.add(hood);

  // Hood shut lines, inboard of the outer edge.
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const x = lerp(1.02, 2.315, i / 80);
      const p = hoodPoint(x, side * 0.955);
      p.z += side * 0.001;
      pts.push(p);
    }
    const seam = tubeFromPoints(pts, 0.0015, materials.gap, 4, "BonnetSeam");
    group.add(seam);
  }
  // bonnet leading edge
  {
    const pts = [];
    for (let i = 0; i <= 70; i++) {
      const u = lerp(-0.955, 0.955, i / 70);
      const p = hoodPoint(2.317, u);
      p.y += 0.001;
      pts.push(p);
    }
    group.add(tubeFromPoints(pts, 0.0015, materials.gap, 4, "BonnetFrontSeam"));
  }
  // cowl shut line
  {
    const pts = [];
    for (let i = 0; i <= 70; i++) {
      const u = lerp(-0.93, 0.93, i / 70);
      const p = hoodPoint(1.018, u);
      p.y += 0.001;
      pts.push(p);
    }
    group.add(tubeFromPoints(pts, 0.0015, materials.gap, 4, "BonnetRearSeam"));
  }

  // cowl vent / wiper base. This used to be a glossy tube laid across the
  // bonnet; its low-poly facets caught the studio key light as a dotted white
  // pinstripe. The production part is a wide matte-black plastic grille, so it
  // is now a thin panel that follows the bonnet crown, with a fine raised lip
  // along its forward edge.
  {
    const ventXs = [];
    for (let i = 0; i <= 6; i++) ventXs.push(lerp(0.958, 1.024, i / 6));
    const ventUs = [];
    for (let i = 0; i <= 48; i++) ventUs.push(lerp(-0.985, 0.985, i / 48));
    const vent = gridSurface(
      ventXs,
      ventUs,
      (x, u) => {
        const p = hoodPoint(x, u);
        const centre = 1 - Math.pow(Math.abs(u), 3);
        p.y += 0.0028 + 0.0022 * centre;
        return p;
      },
      materials.rubberTrim,
      "CowlVent"
    );
    vent.castShadow = false;
    vent.receiveShadow = true;
    group.add(vent);

    const lipPts = [];
    for (let i = 0; i <= 60; i++) {
      const u = lerp(-0.985, 0.985, i / 60);
      const p = hoodPoint(1.024, u);
      p.y += 0.0042;
      lipPts.push(p);
    }
    const lip = tubeFromPoints(
      lipPts,
      0.0034,
      materials.rubberTrim,
      6,
      "CowlVentLip"
    );
    lip.castShadow = false;
    group.add(lip);
  }

  /* --------------------------- side details ------------------------------ */
  const addDoorSeam = (pts2d, name) => {
    for (const side of [-1, 1]) {
      const pts = pts2d.map(([x, h]) => {
        const p = sidePoint(x, h, side, 0.0035);
        return p;
      });
      const seam = tubeFromPoints(pts, 0.002, materials.gap, 4, name);
      group.add(seam);
    }
  };

  addDoorSeam(
    [
      [0.995, 1.204],
      [0.982, 1.085],
      [0.970, 0.90],
      [0.968, 0.58],
      [1.000, 0.39],
    ],
    "FrontDoorSeam"
  );
  addDoorSeam(
    [
      [-0.330, 1.180],
      [-0.338, 0.98],
      [-0.352, 0.70],
      [-0.352, 0.40],
    ],
    "BPillarSeam"
  );
  addDoorSeam(
    [
      [-1.260, 1.193],
      [-1.245, 1.08],
      [-1.210, 0.88],
    ],
    "RearDoorSeam"
  );

  // Flush door handles
  const makeHandle = (x, h, side) => {
    const g = new THREE.Group();
    const p = sidePoint(x, h, side, 0);
    const recess = new THREE.Mesh(
      new THREE.BoxGeometry(0.205, 0.048, 0.006),
      materials.gap
    );
    recess.position.set(p.x, p.y, p.z);
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.178, 0.034, 0.004),
      materials.paint
    );
    blade.position.set(p.x, p.y, p.z + side * 0.0035);
    const chrome = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.0024, 0.003),
      materials.darkChrome
    );
    chrome.position.set(p.x, p.y + 0.0105, p.z + side * 0.0055);
    g.add(recess, blade, chrome);
    g.name = "FlushDoorHandle";
    // The blade and its chrome inlay sit a few millimetres proud when the car
    // is parked, then tuck flush as it pulls away.
    g.userData = { side, baseZ: p.z, blade, chrome };
    for (const m of [recess, blade, chrome]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    return g;
  };
  group.add(makeHandle(0.34, 0.968, 1));
  group.add(makeHandle(0.34, 0.968, -1));
  group.add(makeHandle(-0.74, 0.980, 1));
  group.add(makeHandle(-0.74, 0.980, -1));

  // Charge flap on the left rear quarter.
  {
    const side = -1;
    const x = -1.61;
    const h = 0.90;
    const p = sidePoint(x, h, side, 0.005);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.115, 0.014), materials.paint);
    flap.position.copy(p);
    flap.castShadow = true;
    const border = new THREE.Mesh(new THREE.BoxGeometry(0.185, 0.13, 0.01), materials.gap);
    border.position.set(p.x, p.y, p.z + side * 0.002);
    const icon = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.04, 0.002), materials.chrome);
    icon.position.set(p.x + 0.05, p.y - 0.025, p.z + side * 0.012);
    group.add(border, flap, icon);
  }

  return {
    group,
    sidePoint,
    hoodPoint,
    halfWidthAt,
    zTop,
    zBottom,
    ARCHES,
  };
}

/* -------------------------------------------------------------------------- */
/*  Underbody                                                                 */
/* -------------------------------------------------------------------------- */

export function createUnderbody(materials, ctx) {
  const group = new THREE.Group();
  group.name = "Underbody";

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.06, 1.42),
    materials.underbody
  );
  floor.position.set(-0.05, 0.255, 0);
  floor.castShadow = true;
  floor.receiveShadow = true;
  group.add(floor);

  const battery = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.13, 1.24),
    materials.underbody
  );
  battery.position.set(-0.1, 0.205, 0);
  battery.castShadow = true;
  group.add(battery);
  for (let i = 0; i < 9; i++) {
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.045, 1.2),
      materials.satinSoft
    );
    rib.position.set(-1.0 + i * 0.25, 0.155, 0);
    group.add(rib);
  }

  // Frunk floor + front bay blanking
  const frunk = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.08, 1.06),
    materials.underbody
  );
  frunk.position.set(1.66, 0.34, 0);
  group.add(frunk);

  // subframes and suspension arms
  for (const x of [1.45, -1.45]) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.1, 1.36),
      materials.satinSoft
    );
    beam.position.set(x, 0.31, 0);
    group.add(beam);
  }
  for (const side of [-1, 1]) {
    for (const x of [CAR.frontAxle, CAR.rearAxle]) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.05, 0.075),
        materials.caliper
      );
      arm.position.set(x, 0.245, side * 0.58);
      arm.rotation.y = side * 0.12;
      group.add(arm);
      const link = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.25, 0.06),
        materials.caliper
      );
      link.position.set(x, 0.33, side * 0.7);
      group.add(link);
    }
  }

  // rear diffuser
  const diffuser = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.055, 1.36),
    materials.satin
  );
  diffuser.position.set(-2.12, 0.3, 0);
  diffuser.rotation.z = -0.10;
  group.add(diffuser);
  for (let i = -3; i <= 3; i++) {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.11, 0.018),
      materials.gloss
    );
    fin.position.set(-2.12, 0.31, i * 0.18);
    fin.rotation.z = -0.1;
    group.add(fin);
  }

  // close the underside at the sides
  const sideSkirtsUnder = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.08, 0.08),
    materials.satinSoft
  );
  for (const side of [-1, 1]) {
    const s = sideSkirtsUnder.clone();
    s.position.set(0, 0.29, side * 0.70);
    group.add(s);
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

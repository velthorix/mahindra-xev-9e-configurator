import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { tubeFromPoints } from "./utils.js";
import { CAR } from "./body.js";

export const LOGO_OUTLINE = [
  [1177, 38], [1123, 13], [1039, 56], [884, 204], [661, 450], [699, 487],
  [1047, 163], [1090, 140], [1109, 149], [1100, 304], [1023, 577], [953, 732],
  [926, 759], [891, 766], [848, 744], [209, 82], [118, 20], [78, 15], [50, 28],
  [24, 67], [13, 127], [38, 310], [122, 596], [217, 788], [280, 835], [352, 825],
  [442, 757], [551, 642], [516, 609], [348, 755], [304, 766], [275, 746],
  [220, 647], [143, 417], [103, 224], [113, 143], [154, 154], [785, 776],
  [853, 824], [925, 836], [984, 806], [1025, 751], [1128, 501], [1202, 178],
  [1201, 98],
];

function logoShape(scale) {
  const shape = new THREE.Shape();
  const pts = LOGO_OUTLINE;
  shape.moveTo((pts[0][0] - 608) * scale, (418 - pts[0][1]) * scale);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo((pts[i][0] - 608) * scale, (418 - pts[i][1]) * scale);
  }
  shape.closePath();
  return shape;
}

export function createEmblem(width, materials) {
  const scale = width / 1202;
  const shape = logoShape(scale);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelSize: 0.0022,
    bevelThickness: 0.0022,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, materials.emblem);
  mesh.name = "MahindraTwinPeaks";
  mesh.castShadow = true;
  return mesh;
}

export function makeEmblemTexture(resolution = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, resolution, resolution);
  ctx.fillStyle = "#e8ebee";
  const s = resolution / 1300;
  ctx.beginPath();
  LOGO_OUTLINE.forEach(([x, y], i) => {
    const px = (x - 608) * s + resolution / 2;
    const py = (418 - y) * s + resolution / 2;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* -------------------------------------------------------------------------- */
/*  Tyre                                                                      */
/* -------------------------------------------------------------------------- */

function tyreGeometry() {
  const pts = [];
  const add = (r, z) => pts.push(new THREE.Vector2(r, z));

  // Open tyre profile; the rim closes the bead.
  add(0.258, -0.114);
  add(0.276, -0.124);
  add(0.308, -0.128);
  add(0.338, -0.124);
  add(0.358, -0.114);
  add(0.369, -0.098);
  add(0.375, -0.079);
  add(0.3771, -0.060);

  // circumferential tread grooves
  const grooves = [-0.075, -0.032, 0.032, 0.075];
  const treadPts = [
    [-0.055, 0.3773], [-0.044, 0.3773], [-0.04, 0.373], [-0.03, 0.373],
    [-0.024, 0.3772], [-0.01, 0.3774], [0.01, 0.3774], [0.024, 0.3772],
    [0.03, 0.373], [0.04, 0.373], [0.044, 0.3773], [0.055, 0.3773],
    [0.06, 0.3771],
  ];
  // Rebuild the tread with grooves at the listed axial positions.
  const treadSamples = [];
  for (let z = -0.06; z <= 0.0601; z += 0.0025) {
    let r = 0.3772;
    for (const g of grooves) {
      const d = Math.abs(z - g);
      if (d < 0.007) r -= 0.0042 * Math.cos((d / 0.007) * Math.PI * 0.5) ** 2;
    }
    treadSamples.push([z, r]);
  }
  for (const [z, r] of treadSamples) add(r, z);

  add(0.3771, 0.060);
  add(0.375, 0.079);
  add(0.369, 0.098);
  add(0.358, 0.114);
  add(0.338, 0.124);
  add(0.308, 0.128);
  add(0.276, 0.124);
  add(0.258, 0.114);

  const geom = new THREE.LatheGeometry(pts, 256);
  // Lathe revolves around Y; put the axle on Z.
  geom.rotateX(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

/* -------------------------------------------------------------------------- */
/*  Alloy wheel                                                               */
/* -------------------------------------------------------------------------- */

function spokeOutline() {
  // A wide aero blade, drawn in the wheel's XY plane. Radial direction +Y.
  const shape = new THREE.Shape();
  const n = 24;
  const left = [];
  const right = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = THREE.MathUtils.lerp(0.064, 0.249, t);
    const lean = 0.08 * t * t;
    const width = THREE.MathUtils.lerp(0.03, 0.062, Math.pow(t, 0.5));
    const dx = Math.cos(lean) * width;
    const dy = -Math.sin(lean) * width;
    left.push([Math.sin(lean) * r - dx, Math.cos(lean) * r - dy]);
    right.push([Math.sin(lean) * r + dx, Math.cos(lean) * r + dy]);
  }
  shape.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) shape.lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 1; i >= 0; i--) shape.lineTo(right[i][0], right[i][1]);
  shape.closePath();
  return shape;
}

function createSpokes(materials) {
  const group = new THREE.Group();
  const shape = spokeOutline();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.024,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 3,
    curveSegments: 6,
  });
  geom.computeVertexNormals();

  // Five wide aero spokes with a slight turbine lean.
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const m = new THREE.Mesh(geom, materials.wheelFace);
    m.rotation.z = angle;
    m.position.z = 0.076;
    m.castShadow = true;
    group.add(m);

    // A dark machined groove splits each broad blade into a twin-spoke face.
    // It adds depth without another layer of geometry or a busy ten-spoke look.
    const groove = [];
    for (let j = 0; j <= 14; j++) {
      const t = j / 14;
      const r = THREE.MathUtils.lerp(0.085, 0.245, t);
      const lean = 0.08 * t * t;
      const x0 = Math.sin(lean) * r;
      const y0 = Math.cos(lean) * r;
      groove.push(
        new THREE.Vector3(
          x0 * Math.cos(angle) - y0 * Math.sin(angle),
          x0 * Math.sin(angle) + y0 * Math.cos(angle),
          0.106
        )
      );
    }
    group.add(tubeFromPoints(groove, 0.0032, materials.alloyDark, 5, "SpokeGroove"));
  }
  return group;
}

function createRimFace(materials) {
  const group = new THREE.Group();
  const barrelMat = materials.alloyDark;

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.256, 0.258, 0.21, 72, 1, true),
    barrelMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.005;
  group.add(barrel);

  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.251, 0.251, 0.012, 64, 1, false),
    materials.satin,
  );
  inner.rotation.x = Math.PI / 2;
  inner.position.z = -0.095;
  group.add(inner);

  // Outer lip
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(0.2525, 0.0105, 10, 96),
    materials.alloy
  );
  lip.position.z = 0.102;
  group.add(lip);

  const lipDark = new THREE.Mesh(
    new THREE.TorusGeometry(0.243, 0.012, 8, 96),
    materials.alloyDark
  );
  lipDark.position.z = 0.09;
  group.add(lipDark);

  // Machined ring just inside the lip.
  const machined = new THREE.Mesh(
    new THREE.TorusGeometry(0.222, 0.0032, 8, 96),
    materials.alloy
  );
  machined.position.z = 0.099;
  group.add(machined);

  // Aerodisc behind the spokes
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.243, 0.243, 0.008, 64),
    materials.alloyDark
  );
  disc.rotation.x = Math.PI / 2;
  disc.position.z = 0.056;
  group.add(disc);

  // A ring of subtle triangular cutouts is implied by the dark disc.
  group.add(createSpokes(materials));

  // Hub and centre cap
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.078, 0.086, 0.05, 40),
    materials.alloyDark
  );
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.078;
  group.add(hub);

  const hubRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.059, 0.0026, 8, 48),
    materials.alloy
  );
  hubRing.position.z = 0.111;
  group.add(hubRing);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.054, 0.057, 0.018, 40),
    materials.gloss
  );
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.112;
  group.add(cap);

  const tex = makeEmblemTexture(256);
  const logoMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    metalness: 0.95,
    roughness: 0.2,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.094, 0.065), logoMat);
  logo.position.z = 0.122;
  group.add(logo);

  // Lug bolts
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + Math.PI / 10;
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.012, 10),
      materials.darkChrome
    );
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(Math.cos(angle) * 0.068, Math.sin(angle) * 0.068, 0.114);
    group.add(bolt);
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

/* -------------------------------------------------------------------------- */
/*  Brakes                                                                    */
/* -------------------------------------------------------------------------- */

function createBrakes(materials) {
  const group = new THREE.Group();

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.188, 0.188, 0.026, 64),
    materials.brakeRotor
  );
  disc.rotation.x = Math.PI / 2;
  disc.position.z = -0.005;
  group.add(disc);

  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.083, 0.083, 0.05, 36),
    materials.brakeDisc
  );
  hat.rotation.x = Math.PI / 2;
  hat.position.z = 0.025;
  group.add(hat);

  // Cross-drilled dimples
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * Math.PI * 2 + (i % 2) * 0.11;
    const r = 0.115 + (i % 4) * 0.018;
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0042, 0.0042, 0.004, 8),
      materials.gap
    );
    hole.rotation.x = Math.PI / 2;
    hole.position.set(Math.cos(ang) * r, Math.sin(ang) * r, 0.011);
    group.add(hole);
  }

  // Caliper at the trailing/top edge.
  const caliper = new THREE.Mesh(
    new RoundedBoxGeometry(0.085, 0.15, 0.073, 3, 0.025),
    materials.caliper
  );
  caliper.position.set(-0.115, 0.11, 0.018);
  caliper.rotation.z = -0.5;
  group.add(caliper);

  const stripe = new THREE.Mesh(
    new RoundedBoxGeometry(0.02, 0.12, 0.075, 3, 0.008),
    materials.darkChrome
  );
  stripe.position.set(-0.11, 0.11, 0.019);
  stripe.rotation.z = -0.5;
  group.add(stripe);

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

/* -------------------------------------------------------------------------- */
/*  Public wheel rig                                                          */
/* -------------------------------------------------------------------------- */

export function createWheels(materials) {
  const root = new THREE.Group();
  root.name = "Wheels";

  const tyre = tyreGeometry();
  const wheels = [];

  for (const [name, x, side] of [
    ["FL", CAR.frontAxle, 1],
    ["FR", CAR.frontAxle, -1],
    ["RL", CAR.rearAxle, 1],
    ["RR", CAR.rearAxle, -1],
  ]) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(x, CAR.wheelY, side * 0.797);
    steerPivot.name = `WheelPivot_${name}`;

    const sideGroup = new THREE.Group();
    sideGroup.rotation.y = side > 0 ? 0 : Math.PI;
    steerPivot.add(sideGroup);

    const spin = new THREE.Group();
    spin.name = `WheelSpin_${name}`;
    sideGroup.add(spin);

    const tyreMesh = new THREE.Mesh(tyre, materials.tireTread);
    tyreMesh.castShadow = true;
    tyreMesh.receiveShadow = true;
    spin.add(tyreMesh);

    const rim = createRimFace(materials);
    spin.add(rim);

    const brakes = createBrakes(materials);
    // Brakes stay with the upright; only the wheel spins. In reality the disc
    // spins too, but the caliper must stay fixed.
    brakes.rotation.y = side > 0 ? 0 : Math.PI;
    brakes.position.z = side * 0.015;
    steerPivot.add(brakes);

    // subtle tyre sidewall bead ring
    for (const z of [-0.118, 0.118]) {
      const bead = new THREE.Mesh(
        new THREE.TorusGeometry(0.286, 0.004, 6, 64),
        materials.rubberTrim
      );
      bead.position.z = z;
      bead.scale.z = 0.85;
      spin.add(bead);
    }

    root.add(steerPivot);
    wheels.push({
      name,
      x,
      side,
      pivot: steerPivot,
      spin,
      radius: 0.377,
    });
  }

  return { group: root, wheels };
}

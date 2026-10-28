import * as THREE from "three";
import { curve, warpSurface, tubeFromPoints, lerp, roundedRect } from "./utils.js";
import { createEmblem } from "./wheels.js";
import { makePlateTexture, makeTextTexture } from "../scene/textures.js";

const HW_KEYS = [
  [0.34, 0.70],
  [0.40, 0.765],
  [0.50, 0.795],
  [0.62, 0.812],
  [0.75, 0.815],
  [0.88, 0.803],
  [1.00, 0.785],
  [1.10, 0.762],
  [1.18, 0.727],
  [1.23, 0.675],
  [1.265, 0.59],
];
const rearHalfWidth = (h) => curve(HW_KEYS, h);

export function rearPoint(z, h, offset = 0) {
  const hw = rearHalfWidth(h);
  const u = THREE.MathUtils.clamp(z / hw, -1, 1);
  const x =
    -2.392 +
    0.052 * Math.pow(Math.abs(u), 2.5) +
    0.035 * Math.pow(Math.max(0, (h - 1.03) / 0.24), 2.1) +
    0.02 * Math.pow(Math.max(0, (0.58 - h) / 0.24), 2) -
    offset;
  return new THREE.Vector3(x, h, z);
}

function rearGrid(us, hs, offset, material, name) {
  const positions = [];
  const indices = [];
  for (let i = 0; i < us.length; i++) {
    for (let j = 0; j < hs.length; j++) {
      const h = hs[j];
      const z = us[i] * rearHalfWidth(h);
      const p = rearPoint(z, h, offset);
      positions.push(p.x, p.y, p.z);
    }
  }
  const nv = hs.length;
  for (let i = 0; i < us.length - 1; i++) {
    for (let j = 0; j < nv - 1; j++) {
      const a = i * nv + j;
      // Rear surfaces face -X. The old order faced +X, so the painted
      // tailgate, bumper and appliques were back-face culled from behind and
      // the dark interior showed through the hatch instead of the body colour.
      indices.push(a, a + nv + 1, a + 1, a, a + nv, a + nv + 1);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = name;
  return mesh;
}

function patchFromOutline(outline, offset, material, name, maxEdge = 0.014) {
  const mesh = warpSurface(
    outline,
    (z, h) => rearPoint(z, h, offset),
    maxEdge,
    material,
    name
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function shapePoints(shape) {
  return shape.getPoints(6);
}

function mirror(points) {
  return points.map((p) => new THREE.Vector2(-p.x, p.y));
}

export function createRear(materials) {
  const group = new THREE.Group();
  group.name = "RearEnd";

  // main tailgate
  const us = [];
  for (let i = 0; i <= 92; i++) us.push(lerp(-1, 1, i / 92));
  const hs = [];
  for (let i = 0; i <= 68; i++) hs.push(lerp(0.30, 1.19, i / 68));
  const tailgate = rearGrid(us, hs, 0, materials.paint, "Tailgate");
  tailgate.castShadow = true;
  tailgate.receiveShadow = true;
  group.add(tailgate);

  // black light band
  {
    const us2 = [];
    for (let i = 0; i <= 70; i++) us2.push(lerp(-0.93, 0.93, i / 70));
    const hs2 = [];
    for (let i = 0; i <= 8; i++) hs2.push(lerp(1.105, 1.19, i / 8));
    const band = rearGrid(us2, hs2, 0.006, materials.gloss, "RearLightBand");
    group.add(band);
  }

  // Full-width light bar, sitting high on the tailgate like the production car.
  {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const z = lerp(-0.722, 0.722, i / 64);
      pts.push(rearPoint(z, 1.166, 0.024));
    }
    const core = tubeFromPoints(pts, 0.0125, materials.tailLED, 8, "TailLightBar");
    group.add(core);
    const underline = [];
    for (let i = 0; i <= 64; i++) {
      const z = lerp(-0.69, 0.69, i / 64);
      underline.push(rearPoint(z, 1.137, 0.024));
    }
    group.add(tubeFromPoints(underline, 0.0036, materials.tailLED, 6, "TailLightUnderline"));
    const chrome = [];
    for (let i = 0; i <= 64; i++) {
      const z = lerp(-0.71, 0.71, i / 64);
      chrome.push(rearPoint(z, 1.108, 0.018));
    }
    group.add(tubeFromPoints(chrome, 0.0016, materials.darkChrome, 4, "TailChrome"));
  }

  // Music-reactive segments sit just proud of the continuous light bar. They
  // stay dark red when the soundtrack is off, then run a restrained pattern
  // along the bar instead of strobing the whole rear end.
  const musicSegments = [];
  {
    const count = 18;
    for (let i = 0; i < count; i++) {
      const z0 = lerp(-0.70, 0.70, i / count) + 0.0035;
      const z1 = lerp(-0.70, 0.70, (i + 1) / count) - 0.0035;
      if (z1 <= z0) continue;
      const material = materials.tailLED.clone();
      material.name = `TailMusicSegment_${i}`;
      material.color.setHex(0x34070c);
      material.emissive.setHex(0xff2030);
      material.emissiveIntensity = 0;
      const segment = tubeFromPoints(
        [
          rearPoint(z0, 1.166, 0.033),
          rearPoint((z0 + z1) / 2, 1.166, 0.034),
          rearPoint(z1, 1.166, 0.033),
        ],
        0.0052,
        material,
        5,
        `TailMusicSegment_${i}`
      );
      segment.castShadow = false;
      segment.receiveShadow = false;
      group.add(segment);
      musicSegments.push({ mesh: segment, material, index: i });
    }
  }

  // Black vertical appliques frame the body-colour tailgate panel and carry the
  // corner light blades, as on the production rear end.
  for (const side of [-1, 1]) {
    const us2 = [];
    for (let i = 0; i <= 16; i++) us2.push(side * lerp(0.80, 0.995, i / 16));
    const hs2 = [];
    for (let i = 0; i <= 20; i++) hs2.push(lerp(0.70, 1.19, i / 20));
    group.add(rearGrid(us2, hs2, 0.006, materials.gloss, "TailgateSideApplique"));
  }

  // corner lamp clusters
  for (const side of [-1, 1]) {
    const outline = [
      [0.615, 1.18],
      [0.700, 1.18],
      [0.752, 1.06],
      [0.792, 0.86],
      [0.782, 0.72],
      [0.700, 0.70],
      [0.632, 0.80],
      [0.602, 0.98],
    ].map(([z, h]) => new THREE.Vector2(side * z, h));
    const lens = patchFromOutline(outline, 0.011, materials.tailLens, "TailCornerLens", 0.01);
    group.add(lens);

    // The production rear signature is a continuous inverted-U, not two
    // disconnected corner lamps. Run a thin red blade down each outer corner
    // so the top bar and the vertical drops read as one piece.
    const leg = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const h = lerp(0.715, 1.160, t);
      const z = side * lerp(0.755, 0.700, Math.pow(t, 0.72));
      leg.push(rearPoint(z, h, 0.024));
    }
    group.add(tubeFromPoints(leg, 0.0105, materials.tailLED, 8, "TailCornerBlade"));

    // A dark inset behind the blade prevents it from reading as a painted-on
    // stripe and gives the lens some depth.
    const legRecess = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const h = lerp(0.712, 1.158, t);
      const z = side * lerp(0.762, 0.705, Math.pow(t, 0.72));
      legRecess.push(rearPoint(z, h, 0.010));
    }
    group.add(tubeFromPoints(legRecess, 0.014, materials.satin, 6, "TailCornerRecess"));

    // reverse light
    const rev = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.026, 0.07),
      materials.reverseLED
    );
    rev.position.copy(rearPoint(side * 0.56, 0.62, 0.017));
    group.add(rev);

    // reflector
    const reflector = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.035, 0.18),
      materials.tailLens
    );
    reflector.position.copy(rearPoint(side * 0.63, 0.435, 0.01));
    group.add(reflector);
  }

  // emblem
  {
    const emblem = createEmblem(0.16, materials);
    emblem.rotation.y = -Math.PI / 2;
    const p = rearPoint(0, 1.022, 0.012);
    emblem.position.set(p.x - 0.012, p.y, p.z);
    group.add(emblem);
  }

  // XEV 9e lettering
  {
    const tex = makeTextTexture("XEV 9e", {
      width: 1400,
      height: 260,
      font: "500 150px 'DM Sans', sans-serif",
      letterSpacing: 34,
      color: "#e9ecee",
    });
    tex.anisotropy = 16;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      metalness: 0.85,
      roughness: 0.22,
      depthWrite: false,
      toneMapped: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.085), mat);
    mesh.rotation.y = -Math.PI / 2;
    mesh.position.copy(rearPoint(0, 0.905, 0.012));
    mesh.position.x -= 0.008;
    group.add(mesh);
  }

  // rear bumper: a narrower black valance with painted corners
  {
    const us3 = [];
    for (let i = 0; i <= 80; i++) us3.push(lerp(-1, 1, i / 80));
    const hs3 = [];
    for (let i = 0; i <= 26; i++) hs3.push(lerp(0.295, 0.695, i / 26));
    const bumper = rearGrid(us3, hs3, 0.006, materials.satin, "RearBumper");
    group.add(bumper);

    // Silver skid strip, matching the bright horizontal bar in the rear
    // reference. The old black line disappeared against the bumper.
    const pts = [];
    for (let i = 0; i <= 50; i++) {
      const z = lerp(-0.58, 0.58, i / 50);
      pts.push(rearPoint(z, 0.365, 0.017));
    }
    group.add(tubeFromPoints(pts, 0.0048, materials.alloy, 6, "RearSkidLine"));

    // center trim under the plate
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.018, 0.32),
      materials.darkChrome
    );
    trim.position.copy(rearPoint(0, 0.455, 0.014));
    group.add(trim);

    // Lower diffuser: a smooth black valance with shallow strakes instead of
    // the five spikes that previously hung below the bumper.
    const diffuser = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.045, 1.10),
      materials.satin
    );
    diffuser.position.set(-2.30, 0.302, 0);
    diffuser.rotation.z = 0.18;
    group.add(diffuser);

    for (const z of [-0.38, 0, 0.38]) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.024, 0.018),
        materials.gloss
      );
      fin.position.set(-2.28, 0.298, z);
      fin.rotation.z = 0.18;
      group.add(fin);
    }
  }

  // Low red reflectors in the rear valance.
  for (const side of [-1, 1]) {
    const p = rearPoint(side * 0.62, 0.415, 0.018);
    const reflector = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.024, 0.12),
      materials.tailLED
    );
    reflector.position.copy(p);
    group.add(reflector);
  }

  // number plate
  {
    const tex = makePlateTexture("XEV 9e");
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.11, 0.43),
      materials.plate
    );
    backing.position.copy(rearPoint(0, 0.505, 0.025));
    group.add(backing);
    const faceMat = materials.plateFace.clone();
    faceMat.map = tex;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.415, 0.1), faceMat);
    face.rotation.y = -Math.PI / 2;
    face.position.copy(rearPoint(0, 0.505, 0.033));
    group.add(face);
  }

  // parking sensors
  for (const z of [-0.48, -0.24, 0.24, 0.48]) {
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.01, 18),
      materials.darkChrome
    );
    ring.rotation.z = Math.PI / 2;
    ring.position.copy(rearPoint(z, 0.525, 0.016));
    group.add(ring);
  }

  // tailgate shut line
  {
    const pts = [];
    for (let i = 0; i <= 30; i++) pts.push(rearPoint(lerp(-0.69, 0.69, i / 30), 0.705, 0.009));
    group.add(tubeFromPoints(pts, 0.0018, materials.gap, 5, "TailgateSeam"));
    for (const side of [-1, 1]) {
      const pts2 = [];
      for (let i = 0; i <= 28; i++) {
        pts2.push(rearPoint(side * 0.69, lerp(0.71, 1.185, i / 28), 0.009));
      }
      group.add(tubeFromPoints(pts2, 0.0018, materials.gap, 4, "TailgateSeamSide"));
    }
  }

  // Tailgate top trim.
  {
    const pts = [];
    for (let i = 0; i <= 50; i++) {
      pts.push(rearPoint(lerp(-0.66, 0.66, i / 50), 1.188, 0.006));
    }
    group.add(tubeFromPoints(pts, 0.0032, materials.darkChrome, 5, "TailgateTopTrim"));
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { group, materials, musicSegments };
}

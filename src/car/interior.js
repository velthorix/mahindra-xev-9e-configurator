import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { gridSurface, lerp, tubeFromPoints } from "./utils.js";
import { halfWidthAt } from "./body.js";
import { makeEmblemTexture } from "./wheels.js";
import {
  makeDriverScreenTexture,
  makeCenterScreenTexture,
  makePassengerScreenTexture,
} from "../scene/textures.js";

function box(w, h, d, r, mat) {
  // RoundedBoxGeometry produces broken normals when the radius is larger than
  // half of the smallest dimension. Several trim parts are intentionally very
  // thin, so clamp there once rather than hand-tuning every call.
  const safeRadius = Math.max(
    0.0004,
    Math.min(r, w / 2 - 0.0004, h / 2 - 0.0004, d / 2 - 0.0004)
  );
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, safeRadius), mat);
}

function screenFace(materials, tex, w, h, x, y, z, tilt = 0.025) {
  const mat = materials.screen.clone();
  mat.map = tex;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  face.rotation.y = -Math.PI / 2;
  face.rotation.z = tilt;
  face.position.set(x, y, z);
  return face;
}

function vent(materials, x, y, z, width, height = 0.036) {
  const group = new THREE.Group();
  const recess = box(0.026, height, width, 0.008, materials.gap);
  recess.position.set(x, y, z);
  group.add(recess);

  for (let i = 0; i < 3; i++) {
    const slat = box(0.012, 0.0032, width - 0.022, 0.0012, materials.darkChrome);
    slat.position.set(x - 0.014, y + (i - 1) * 0.0085, z);
    group.add(slat);
  }
  const frame = box(0.004, height + 0.006, width + 0.006, 0.002, materials.interiorMetal);
  frame.position.set(x + 0.014, y, z);
  group.add(frame);
  return group;
}

function seat(materials, x, z, scale = 1, rear = false) {
  const group = new THREE.Group();
  group.name = rear ? "RearSeat" : "FrontSeat";

  const W = 0.46 * scale;
  const cushionY = rear ? 0.50 : 0.505;

  // Dark lower shell and rails, visible from a low exterior angle.
  const shell = box(0.34, 0.10, W + 0.06, 0.026, materials.interiorDark);
  shell.position.set(x + 0.02, cushionY - 0.12, z);
  group.add(shell);
  for (const s of [-1, 1]) {
    const rail = box(0.28, 0.025, 0.026, 0.01, materials.interiorMetal);
    rail.position.set(x + 0.04, cushionY - 0.185, z + s * (W * 0.28));
    group.add(rail);
  }

  const cushion = box(0.48, 0.105, W, 0.045, materials.leather);
  cushion.position.set(x + 0.045, cushionY, z);
  cushion.rotation.z = -0.025;
  group.add(cushion);

  // Deep side bolsters in the darker olive leather.
  for (const s of [-1, 1]) {
    const bolster = box(0.44, 0.12, 0.075, 0.034, materials.leatherDark);
    bolster.position.set(x + 0.035, cushionY + 0.045, z + s * (W * 0.48));
    bolster.rotation.z = -0.025;
    group.add(bolster);

    const shoulder = box(0.12, 0.23, 0.07, 0.032, materials.leatherDark);
    shoulder.position.set(x - 0.14, cushionY + 0.34, z + s * (W * 0.46));
    shoulder.rotation.z = -0.17;
    group.add(shoulder);
  }

  // The seat back and head restraint are dark in the reference car. The light
  // leather is reserved for the cushion and the lower door trim, which keeps
  // the cabin from reading as one pale slab through the windscreen.
  const back = box(0.145, 0.60, W * 0.9, 0.05, materials.seatBack);
  back.position.set(x - 0.19, cushionY + 0.32, z);
  back.rotation.z = -0.17;
  group.add(back);

  // Terracotta shoulder panels on the occupant-facing side of the backrest.
  for (const s of [-1, 1]) {
    const accent = box(0.018, 0.30, W * 0.24, 0.02, materials.seatAccent);
    accent.position.set(x - 0.105, cushionY + 0.40, z + s * (W * 0.23));
    accent.rotation.z = -0.17;
    group.add(accent);
  }

  // A shallow map pocket keeps the rear face of the seat from looking like a
  // plain dark box in the cabin camera. A slim terracotta line above it ties
  // the rear of the seats to the shoulder panels.
  const pocket = box(0.014, 0.19, W * 0.56, 0.014, materials.leatherDark);
  pocket.position.set(x - 0.274, cushionY + 0.22, z);
  pocket.rotation.z = -0.17;
  group.add(pocket);
  const rearAccentLine = box(0.016, 0.012, W * 0.28, 0.006, materials.seatAccent);
  rearAccentLine.position.set(x - 0.281, cushionY + 0.59, z);
  rearAccentLine.rotation.z = -0.17;
  group.add(rearAccentLine);

  const head = box(0.105, 0.155, W * 0.43, 0.04, materials.seatBack);
  head.position.set(x - 0.235, cushionY + 0.655, z);
  head.rotation.z = -0.17;
  group.add(head);

  // A slim dark piping strip, instead of the chunky black "ears" that made the
  // head restraints look like gaming chairs.
  for (const s of [-1, 1]) {
    const piping = box(0.03, 0.105, 0.012, 0.006, materials.leatherDark);
    piping.position.set(x - 0.225, cushionY + 0.655, z + s * (W * 0.22));
    piping.rotation.z = -0.17;
    group.add(piping);
  }

  // Fine piping / stitch lines.
  for (const dz of [-0.042, 0.042]) {
    const stitch = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.0026, 0.0036),
      materials.stitch
    );
    stitch.position.set(x + 0.035, cushionY + 0.061, z + dz);
    stitch.rotation.z = -0.025;
    group.add(stitch);
  }
  const backStitch = new THREE.Mesh(
    new THREE.BoxGeometry(0.0026, 0.43, 0.0034),
    materials.stitch
  );
  backStitch.position.set(x - 0.262, cushionY + 0.34, z);
  backStitch.rotation.z = -0.17;
  group.add(backStitch);

  if (!rear) {
    // Outer seat control module.
    const side = z >= 0 ? 1 : -1;
    const controls = box(0.085, 0.08, 0.024, 0.012, materials.gloss);
    controls.position.set(x + 0.10, cushionY + 0.15, z + side * (W * 0.56));
    group.add(controls);
    for (let i = 0; i < 3; i++) {
      const button = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.005, 10),
        materials.interiorMetal
      );
      button.rotation.x = Math.PI / 2;
      button.position.set(
        x + 0.075 + i * 0.024,
        cushionY + 0.15,
        z + side * (W * 0.57)
      );
      group.add(button);
    }
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

function steering(materials) {
  const group = new THREE.Group();
  group.name = "SteeringWheel";
  const x = 0.47;
  const y = 1.00;
  const z = 0.36;

  const wheel = new THREE.Group();
  wheel.position.set(x, y, z);
  wheel.rotation.y = -Math.PI / 2;
  wheel.rotation.x = 0.16;

  const pointAt = (a) => {
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const px = 0.185 * Math.sign(cos) * Math.pow(Math.abs(cos), 0.91);
    const py = 0.178 * Math.sign(sin) * Math.pow(Math.abs(sin), 0.86);
    return new THREE.Vector3(px, py, 0);
  };

  const rimPoints = [];
  for (let i = 0; i < 64; i++) rimPoints.push(pointAt((i / 64) * Math.PI * 2));
  const rimCurve = new THREE.CatmullRomCurve3(rimPoints, true, "catmullrom", 0.4);
  const rim = new THREE.Mesh(
    new THREE.TubeGeometry(rimCurve, 96, 0.0205, 10, true),
    materials.leatherDark
  );
  wheel.add(rim);

  // A slim machined highlight along the upper rim.
  const rimHighlightPoints = [];
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * (0.13 + (i / 17) * 0.74);
    const p = pointAt(a);
    rimHighlightPoints.push(new THREE.Vector3(p.x, p.y, 0.016));
  }
  const highlightCurve = new THREE.CatmullRomCurve3(rimHighlightPoints, false, "catmullrom", 0.4);
  const highlight = new THREE.Mesh(
    new THREE.TubeGeometry(highlightCurve, 48, 0.0024, 5, false),
    materials.darkChrome
  );
  wheel.add(highlight);

  // Two horizontal spokes and a lower spoke, like the production wheel.
  for (const s of [-1, 1]) {
    const spoke = box(0.12, 0.038, 0.06, 0.016, materials.interiorMetal);
    spoke.position.set(s * 0.085, -0.025, 0.007);
    spoke.rotation.z = s * 0.09;
    wheel.add(spoke);

    const insert = box(0.085, 0.017, 0.068, 0.008, materials.gloss);
    insert.position.set(s * 0.09, -0.006, 0.041);
    insert.rotation.z = s * 0.09;
    wheel.add(insert);
  }

  const hub = box(0.175, 0.135, 0.074, 0.045, materials.interiorDark);
  hub.position.set(0, -0.012, 0.02);
  wheel.add(hub);

  const pad = box(0.135, 0.092, 0.045, 0.03, materials.leatherDark);
  pad.position.set(0, -0.012, 0.066);
  wheel.add(pad);

  const hubTrim = box(0.145, 0.012, 0.006, 0.003, materials.interiorMetal);
  hubTrim.position.set(0, -0.06, 0.078);
  wheel.add(hubTrim);

  const emblemTex = makeEmblemTexture(256);
  const emblemMat = new THREE.MeshStandardMaterial({
    map: emblemTex,
    transparent: true,
    metalness: 0.9,
    roughness: 0.22,
    toneMapped: true,
  });
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.039), emblemMat);
  emblem.position.set(0, -0.012, 0.09);
  wheel.add(emblem);

  for (const s of [-1, 1]) {
    const pod = box(0.055, 0.033, 0.018, 0.009, materials.gloss);
    pod.position.set(s * 0.073, 0.027, 0.068);
    pod.rotation.z = s * -0.04;
    wheel.add(pod);
    for (let i = 0; i < 3; i++) {
      const button = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 10),
        materials.darkChrome
      );
      button.rotation.x = Math.PI / 2;
      button.position.set(s * 0.073 + (i - 1) * 0.014, 0.027, 0.078);
      wheel.add(button);
    }
    const scroll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.006, 12),
      materials.darkChrome
    );
    scroll.rotation.x = Math.PI / 2;
    scroll.position.set(s * 0.073, -0.005, 0.078);
    wheel.add(scroll);
  }

  // Everything on the wheel spins together. Keeping the spin in its own group
  // separates the steering rotation from the wheel's mounting tilt.
  const spin = new THREE.Group();
  spin.name = "SteeringWheelRim";
  while (wheel.children.length) spin.add(wheel.children[0]);
  wheel.add(spin);
  group.add(wheel);

  // Column and stalks sit behind the wheel, angled along the steering axis.
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.06, 0.24, 20),
    materials.interiorDark
  );
  column.rotation.z = Math.PI / 2;
  column.rotation.x = -0.1;
  column.position.set(x + 0.15, y - 0.035, z);
  group.add(column);

  for (const s of [-1, 1]) {
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0075, 0.0075, 0.15, 10),
      materials.gloss
    );
    stalk.rotation.z = Math.PI / 2;
    stalk.rotation.y = s * 0.18;
    stalk.position.set(x + 0.08, y - 0.105, z + s * 0.055);
    group.add(stalk);
    const tip = box(0.028, 0.016, 0.016, 0.006, materials.interiorMetal);
    tip.position.set(x + 0.02, y - 0.11, z + s * 0.07);
    group.add(tip);
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

function doorCards(materials) {
  const group = new THREE.Group();
  group.name = "DoorCards";
  const baseMat = materials.interiorDark.clone();
  baseMat.side = THREE.DoubleSide;
  const insertMat = materials.leather.clone();
  insertMat.side = THREE.DoubleSide;
  const sageMat = materials.interiorSage.clone();
  sageMat.side = THREE.DoubleSide;

  for (const side of [-1, 1]) {
    const xs = [];
    for (let i = 0; i <= 44; i++) xs.push(lerp(0.91, -1.55, i / 44));
    const hs = [];
    for (let i = 0; i <= 20; i++) hs.push(lerp(0.36, 1.17, i / 20));
    const base = gridSurface(
      xs,
      hs,
      (x, h) => new THREE.Vector3(x, h, side * (halfWidthAt(x, h) - 0.052)),
      baseMat,
      "DoorCardBase"
    );
    base.castShadow = true;
    group.add(base);

    const xis = [];
    for (let i = 0; i <= 38; i++) xis.push(lerp(0.79, -1.24, i / 38));
    const his = [];
    for (let i = 0; i <= 16; i++) his.push(lerp(0.585, 1.10, i / 16));
    const insert = gridSurface(
      xis,
      his,
      (x, h) => new THREE.Vector3(x, h, side * (halfWidthAt(x, h) - 0.066)),
      insertMat,
      "DoorCardInsert"
    );
    group.add(insert);

    // Sage upper cap and a chrome window-sill line.
    const xhs = [];
    for (let i = 0; i <= 38; i++) xhs.push(lerp(0.88, -1.45, i / 38));
    const hhs = [];
    for (let i = 0; i <= 5; i++) hhs.push(lerp(1.10, 1.16, i / 5));
    group.add(
      gridSurface(
        xhs,
        hhs,
        (x, h) => new THREE.Vector3(x, h, side * (halfWidthAt(x, h) - 0.061)),
        sageMat,
        "DoorCardUpper"
      )
    );

    const sill = [];
    for (let i = 0; i <= 42; i++) {
      const x = lerp(0.87, -1.4, i / 42);
      sill.push(new THREE.Vector3(x, 1.145, side * (halfWidthAt(x, 1.145) - 0.063)));
    }
    group.add(tubeFromPoints(sill, 0.0026, materials.darkChrome, 5, "DoorSillTrim"));

    // Armrests, front and rear.
    const armFront = box(0.47, 0.055, 0.085, 0.022, materials.leatherDark);
    armFront.position.set(0.08, 0.865, side * 0.735);
    group.add(armFront);
    const armRear = box(0.42, 0.052, 0.082, 0.02, materials.leatherDark);
    armRear.position.set(-1.04, 0.860, side * 0.735);
    group.add(armRear);
    const pull = box(0.14, 0.022, 0.036, 0.01, materials.interiorMetal);
    pull.position.set(0.42, 0.960, side * 0.735);
    pull.rotation.y = side * 0.12;
    group.add(pull);

    // Speaker grille: dark recess, metal mesh ring, chrome surround.
    const speakerPos = new THREE.Vector3(0.49, 0.625, side * 0.777);
    const speakerBack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.084, 0.084, 0.012, 32),
      materials.gap
    );
    speakerBack.rotation.x = Math.PI / 2;
    speakerBack.position.copy(speakerPos);
    group.add(speakerBack);

    const speaker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.076, 0.076, 0.008, 32),
      materials.interiorMetal
    );
    speaker.rotation.x = Math.PI / 2;
    speaker.position.copy(speakerPos).setZ(side * 0.782);
    group.add(speaker);

    const speakerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.083, 0.0034, 6, 32),
      materials.darkChrome
    );
    speakerRing.position.copy(speaker.position).setZ(side * 0.789);
    group.add(speakerRing);

    // Ambient line under the insert.
    const ambientPts = [];
    for (let i = 0; i <= 32; i++) {
      const x = lerp(0.64, -1.0, i / 32);
      ambientPts.push(
        new THREE.Vector3(x, 0.86, side * (halfWidthAt(x, 0.86) - 0.068))
      );
    }
    group.add(tubeFromPoints(ambientPts, 0.0032, materials.ambient, 5, "DoorAmbient"));

    // Dark window surround along the door top.
    const top = [];
    for (let i = 0; i <= 38; i++) {
      const x = lerp(0.91, -1.45, i / 38);
      top.push(new THREE.Vector3(x, 1.155, side * (halfWidthAt(x, 1.155) - 0.056)));
    }
    group.add(tubeFromPoints(top, 0.0065, materials.interiorDark, 6, "DoorTopRoll"));
  }
  return group;
}

export function createInterior(materials) {
  const group = new THREE.Group();
  group.name = "Interior";

  const floor = box(2.6, 0.045, 1.44, 0.04, materials.interiorSoft);
  floor.position.set(-0.34, 0.342, 0);
  group.add(floor);

  // Dark carpet mats.
  for (const z of [-0.38, 0.38]) {
    const mat = box(0.86, 0.012, 0.48, 0.02, materials.interiorDark);
    mat.position.set(0.20, 0.37, z);
    group.add(mat);
  }

  // Footwell / bulkhead.
  const bulkhead = box(0.08, 0.48, 1.44, 0.03, materials.interiorDark);
  bulkhead.position.set(0.84, 0.57, 0);
  group.add(bulkhead);

  // The upper dash is real interior furniture, but seen through the dark
  // windscreen from outside it reads as a black visor hovering above the
  // bonnet. Keep it grouped so exterior camera views can hide it while the
  // cabin view still shows the full dash and all three screens.
  const dashExterior = new THREE.Group();
  dashExterior.name = "DashExterior";

  // A wide, low dashboard with the dark upper beam and pale sage lower pad.
  const dashUpper = box(0.31, 0.18, 1.56, 0.06, materials.interiorDark);
  dashUpper.position.set(0.79, 1.115, 0);
  dashExterior.add(dashUpper);

  // Keep the dash top behind the windscreen base. The old 0.43 m-deep panel
  // reached x=1.045, poking out past the canopy (x=1.018) and reading as a
  // black visor hovering over the bonnet from the front and 3/4 views.
  const dashTop = box(0.30, 0.045, 1.52, 0.035, materials.interiorDark);
  dashTop.position.set(0.81, 1.205, 0);
  dashExterior.add(dashTop);

  const dashLower = box(0.31, 0.17, 1.52, 0.05, materials.interiorSage);
  dashLower.position.set(0.70, 0.925, 0);
  group.add(dashLower);

  const dashLip = box(0.06, 0.035, 1.50, 0.014, materials.interiorSageDeep);
  dashLip.position.set(0.585, 0.875, 0);
  group.add(dashLip);

  // Defroster slots on the top pad.
  for (const z of [-0.36, -0.12, 0.12, 0.36]) {
    const slot = box(0.18, 0.005, 0.018, 0.0016, materials.gap);
    slot.position.set(0.86, 1.228, z);
    dashExterior.add(slot);
  }
  group.add(dashExterior);

  // Continuous screen glass, with three UI panels behind it. The panel is kept
  // inside the cabin width: the older 2.4 m dashboard beam visibly pierced the
  // side glass and read as a huge black wing from the front of the car.
  const screenPanel = box(0.028, 0.235, 1.47, 0.008, materials.screenGlass);
  screenPanel.position.set(0.595, 1.105, 0);
  dashExterior.add(screenPanel);

  const screenY = 1.105;
  dashExterior.add(
    screenFace(materials, makeDriverScreenTexture(), 0.35, 0.157, 0.576, screenY + 0.005, 0.38, 0.026)
  );
  dashExterior.add(
    screenFace(materials, makeCenterScreenTexture(), 0.40, 0.207, 0.576, screenY, -0.08, 0.026)
  );
  dashExterior.add(
    screenFace(materials, makePassengerScreenTexture(), 0.31, 0.157, 0.576, screenY + 0.005, -0.50, 0.026)
  );

  const bezelTop = box(0.012, 0.004, 1.49, 0.0015, materials.interiorMetal);
  bezelTop.position.set(0.574, 1.225, 0);
  dashExterior.add(bezelTop);
  const bezelBottom = box(0.012, 0.004, 1.49, 0.0015, materials.interiorMetal);
  bezelBottom.position.set(0.574, 0.985, 0);
  dashExterior.add(bezelBottom);

  // Center stack and slim vents below the screen.
  group.add(vent(materials, 0.575, 0.955, -0.08, 0.47));
  group.add(vent(materials, 0.575, 0.955, -0.57, 0.28));
  group.add(vent(materials, 0.575, 0.955, 0.56, 0.26));

  const stack = box(0.095, 0.21, 0.46, 0.025, materials.interiorDark);
  stack.position.set(0.605, 0.83, -0.05);
  group.add(stack);
  const stackScreen = box(0.004, 0.085, 0.25, 0.008, materials.screenGlass);
  stackScreen.position.set(0.553, 0.865, -0.05);
  group.add(stackScreen);

  // Haptic climate row.
  const haptic = box(0.012, 0.035, 0.54, 0.006, materials.screenGlass);
  haptic.position.set(0.559, 0.905, -0.10);
  group.add(haptic);
  for (let i = 0; i < 7; i++) {
    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 10),
      materials.interiorMetal
    );
    button.rotation.z = Math.PI / 2;
    button.position.set(0.551, 0.904, -0.32 + i * 0.072);
    group.add(button);
  }

  // Ambient line under the dash.
  const dashAmbient = new THREE.Mesh(
    new THREE.BoxGeometry(0.009, 0.004, 1.40),
    materials.ambient
  );
  dashAmbient.position.set(0.556, 0.944, -0.06);
  group.add(dashAmbient);

  // Steering wheel.
  group.add(steering(materials));

  // Floating center console.
  const consoleBase = box(0.72, 0.18, 0.30, 0.045, materials.interiorDark);
  consoleBase.position.set(0.00, 0.47, 0);
  group.add(consoleBase);
  const consoleTop = box(0.74, 0.055, 0.30, 0.025, materials.gloss);
  consoleTop.position.set(0.005, 0.585, 0);
  group.add(consoleTop);

  const bridge = box(0.18, 0.30, 0.22, 0.025, materials.interiorDark);
  bridge.position.set(0.45, 0.74, 0);
  bridge.rotation.z = 0.32;
  group.add(bridge);

  const armrest = box(0.38, 0.085, 0.25, 0.035, materials.leather);
  armrest.position.set(-0.27, 0.655, 0);
  group.add(armrest);

  const chargePad = box(0.22, 0.008, 0.16, 0.008, materials.screenGlass);
  chargePad.position.set(0.25, 0.617, -0.045);
  chargePad.rotation.z = 0.03;
  group.add(chargePad);

  const shifterBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.051, 0.061, 0.025, 24),
    materials.darkChrome
  );
  shifterBase.position.set(-0.03, 0.617, 0.075);
  group.add(shifterBase);
  const shifter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.028, 0.06, 24),
    materials.screenGlass
  );
  shifter.position.set(-0.03, 0.655, 0.075);
  shifter.rotation.z = 0.10;
  group.add(shifter);

  const startRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.024, 0.004, 8, 24),
    materials.interiorMetal
  );
  startRing.rotation.x = Math.PI / 2;
  startRing.position.set(-0.03, 0.615, -0.085);
  group.add(startRing);
  const startButton = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.006, 24),
    materials.screenGlass
  );
  startButton.position.set(-0.03, 0.617, -0.085);
  group.add(startButton);

  for (const z of [-0.075, 0.075]) {
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.039, 0.039, 0.02, 24),
      materials.gap
    );
    cup.position.set(0.17, 0.615, z);
    group.add(cup);
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.0034, 6, 24),
      materials.interiorMetal
    );
    edge.rotation.x = Math.PI / 2;
    edge.position.set(0.17, 0.625, z);
    group.add(edge);
  }

  // Rear console face with vents, USB ports and a small climate panel.
  const rearConsole = box(0.08, 0.20, 0.26, 0.02, materials.interiorDark);
  rearConsole.position.set(-0.60, 0.54, 0);
  group.add(rearConsole);
  for (const z of [-0.06, 0.06]) {
    const vent2 = box(0.012, 0.055, 0.11, 0.012, materials.gap);
    vent2.position.set(-0.645, 0.60, z);
    group.add(vent2);
  }
  for (const z of [-0.045, 0.045]) {
    const usb = box(0.005, 0.012, 0.022, 0.002, materials.interiorMetal);
    usb.position.set(-0.646, 0.49, z);
    group.add(usb);
  }

  // Seats.
  group.add(seat(materials, 0.02, 0.36));
  group.add(seat(materials, 0.02, -0.36));

  // Rear bench: sculpted cushion, dark bolsters and three integrated headrests.
  const rearCushion = box(0.52, 0.135, 1.22, 0.06, materials.leather);
  rearCushion.position.set(-1.01, 0.50, 0);
  group.add(rearCushion);
  for (const z of [-0.61, 0.61]) {
    const bolster = box(0.48, 0.14, 0.09, 0.04, materials.leatherDark);
    bolster.position.set(-1.00, 0.53, z);
    group.add(bolster);
  }
  const rearBack = box(0.145, 0.56, 1.19, 0.06, materials.seatBack);
  rearBack.position.set(-1.24, 0.82, 0);
  rearBack.rotation.z = -0.16;
  group.add(rearBack);

  // A wide terracotta panel at shoulder height echoes the reference car's red
  // rear bench, visible between the front seats from head-on.
  const rearAccent = box(0.018, 0.22, 1.02, 0.03, materials.seatAccent);
  rearAccent.position.set(-1.158, 0.97, 0);
  rearAccent.rotation.z = -0.16;
  group.add(rearAccent);

  for (const z of [-0.42, 0, 0.42]) {
    const head = box(0.105, 0.19, 0.27, 0.04, materials.seatBack);
    head.position.set(-1.33, 1.16, z);
    head.rotation.z = -0.16;
    group.add(head);
    const side = z >= 0 ? 1 : -1;
    const wing = box(0.09, 0.15, 0.032, 0.016, materials.seatBack);
    wing.position.set(-1.32, 1.16, z + side * 0.15);
    wing.rotation.z = -0.16;
    group.add(wing);
  }

  const rearShell = box(0.09, 0.44, 1.13, 0.03, materials.interiorDark);
  rearShell.position.set(-1.32, 0.78, 0);
  rearShell.rotation.z = -0.16;
  group.add(rearShell);

  // A slim center armrest on the rear bench.
  const rearArm = box(0.24, 0.06, 0.22, 0.025, materials.leatherDark);
  rearArm.position.set(-0.99, 0.60, 0);
  group.add(rearArm);

  // Door cards.
  group.add(doorCards(materials));

  // Rear-view mirror, facing the cabin. Keep it slim and dark: a large bright
  // housing dominated the head-on view and read as a second overhead shelf.
  const mirrorHousing = new THREE.Mesh(
    new RoundedBoxGeometry(0.036, 0.054, 0.215, 3, 0.018),
    materials.gloss
  );
  mirrorHousing.position.set(0.50, 1.478, 0);
  group.add(mirrorHousing);
  const mirrorFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.205, 0.047),
    new THREE.MeshPhysicalMaterial({
      color: 0x3f4a52,
      metalness: 0.8,
      roughness: 0.08,
      envMapIntensity: 1.2,
    })
  );
  mirrorFace.rotation.y = -Math.PI / 2;
  mirrorFace.position.set(0.482, 1.478, 0);
  group.add(mirrorFace);
  const mirrorStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.009, 0.012, 0.10, 12),
    materials.gloss
  );
  mirrorStem.rotation.z = -0.4;
  mirrorStem.position.set(0.535, 1.535, 0);
  group.add(mirrorStem);

  // Low-profile overhead console with map lights. Match the headliner so the
  // console and mirror do not merge into one heavy black bar through the glass.
  const roofConsole = box(0.09, 0.028, 0.16, 0.012, materials.interiorSoft);
  roofConsole.position.set(0.30, 1.522, 0);
  group.add(roofConsole);
  for (const z of [-0.06, 0.06]) {
    const lamp = box(0.026, 0.005, 0.035, 0.004, materials.screenGlass);
    lamp.position.set(0.30, 1.508, z);
    group.add(lamp);
  }

  // Pedals.
  for (const [z, width] of [
    [0.26, 0.075],
    [0.47, 0.095],
  ]) {
    const pedal = box(0.045, 0.11, width, 0.012, materials.interiorMetal);
    pedal.position.set(0.80, 0.44, z);
    pedal.rotation.z = 0.38;
    group.add(pedal);
    const rubber = box(0.006, 0.088, width - 0.018, 0.006, materials.rubber);
    rubber.position.set(0.825, 0.448, z);
    rubber.rotation.z = 0.38;
    group.add(rubber);
  }

  const footrest = box(0.15, 0.012, 0.10, 0.01, materials.interiorMetal);
  footrest.position.set(0.82, 0.39, 0.06);
  footrest.rotation.z = 0.44;
  group.add(footrest);

  // Seat-belt webbing for the front seats.
  for (const side of [-1, 1]) {
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.72, 0.042),
      materials.leatherDark
    );
    belt.position.set(-0.19, 0.95, side * 0.53);
    belt.rotation.z = -0.20;
    belt.rotation.x = side * 0.10;
    group.add(belt);
    const buckle = box(0.04, 0.055, 0.035, 0.008, materials.interiorMetal);
    buckle.position.set(0.11, 0.60, side * 0.46);
    group.add(buckle);
    const release = box(0.016, 0.012, 0.026, 0.004, materials.tailLED);
    release.position.set(0.126, 0.603, side * 0.46);
    group.add(release);
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

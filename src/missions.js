import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/* -------------------------------------------------------------------------- */
/*  Experiences                                                               */
/* -------------------------------------------------------------------------- */
/*
 * One scripted experience layered on top of the free-driving Night City stage:
 *
 *   Date   Night City   pickup, restaurant, dinner, drop-off
 *
 * Every prop and character is procedural. The car stays at the origin while the
 * stage scrolls underneath it, so a mission set can be parked in world space
 * next to the car and revealed when the car stops. The scripted camera takes
 * over from OrbitControls for the duration of the sequence.
 *
 * The in-world clock is accelerated: a 100-second sequence reads as the 22
 * minutes the story describes, which keeps the experience watchable without
 * pretending a browser demo should hold the viewer for half an hour.
 */

const TAU = Math.PI * 2;

function std(color, rough = 0.85, metal = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    envMapIntensity: 0.4,
    ...extra,
  });
}

function basic(color, extra = {}) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra });
}

function mesh(geometry, material, cast = true, receive = true) {
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = cast;
  object.receiveShadow = receive;
  return object;
}

function box(w, h, d, material, radius = 0) {
  const geometry =
    radius > 0
      ? new RoundedBoxGeometry(w, h, d, 3, radius)
      : new THREE.BoxGeometry(w, h, d);
  return mesh(geometry, material);
}

function canvasTexture(w, h, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(t) {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function faceTowards(object, dx, dz) {
  object.rotation.y = Math.atan2(-dz, dx);
}

function ramp(t, up = 0.18, down = 0.16) {
  if (t < up) return smoothstep(t / up);
  if (t > 1 - down) return smoothstep((1 - t) / down);
  return 1;
}

function repeatingTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const map = canvasTexture(w, h, draw);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatX, repeatY);
  return map;
}

function makePlasterMap() {
  return repeatingTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#8d6f58";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 5200; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const light = Math.random() > 0.5;
        ctx.fillStyle = light
          ? `rgba(214,190,164,${0.025 + Math.random() * 0.06})`
          : `rgba(48,34,25,${0.02 + Math.random() * 0.06})`;
        ctx.fillRect(x, y, 1 + Math.random() * 2.4, 1 + Math.random() * 2.4);
      }
      for (let i = 0; i < 9; i++) {
        ctx.strokeStyle = `rgba(52,38,28,${0.1 + Math.random() * 0.12})`;
        ctx.lineWidth = 0.7 + Math.random();
        let x = Math.random() * w;
        let y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += (Math.random() - 0.5) * 36;
          y += (Math.random() - 0.5) * 24;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
    2,
    2
  );
}

function makeRoofMap() {
  return repeatingTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#2c2725";
      ctx.fillRect(0, 0, w, h);
      const rowH = 22;
      for (let row = 0; row < Math.ceil(h / rowH); row++) {
        const y = row * rowH;
        const offset = row % 2 === 0 ? 0 : 24;
        for (let x = -48; x < w + 48; x += 48) {
          ctx.fillStyle = `rgba(${58 + Math.random() * 16},${50 + Math.random() * 12},${46 + Math.random() * 10},0.5)`;
          ctx.fillRect(x + offset + 1, y + 1, 46, rowH - 3);
          ctx.strokeStyle = "rgba(16,14,13,0.7)";
          ctx.lineWidth = 1.4;
          ctx.strokeRect(x + offset, y, 48, rowH);
        }
        ctx.fillStyle = "rgba(12,10,9,0.42)";
        ctx.fillRect(0, y + rowH - 3, w, 2);
      }
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(150,140,130,${0.02 + Math.random() * 0.06})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      }
    },
    3,
    2
  );
}

function makePavingMap() {
  return repeatingTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#6a675f";
      ctx.fillRect(0, 0, w, h);
      const rowH = 42;
      for (let row = 0; row < Math.ceil(h / rowH); row++) {
        const y = row * rowH;
        const offset = row % 2 === 0 ? 0 : 54;
        for (let x = -108; x < w + 108; x += 108) {
          const shade = 88 + Math.random() * 26;
          ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 7})`;
          ctx.fillRect(x + offset + 2, y + 2, 104, rowH - 4);
          ctx.strokeStyle = "rgba(34,32,28,0.55)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + offset, y, 108, rowH);
        }
      }
      for (let i = 0; i < 1600; i++) {
        ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 220 : 30},${Math.random() > 0.5 ? 216 : 28},${Math.random() > 0.5 ? 205 : 26},0.035)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
    },
    2,
    3
  );
}

function makeBrickMap() {
  return repeatingTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#4a3a33";
      ctx.fillRect(0, 0, w, h);
      const rowH = 26;
      for (let row = 0; row < Math.ceil(h / rowH); row++) {
        const y = row * rowH;
        const offset = row % 2 === 0 ? 0 : 34;
        for (let x = -68; x < w + 68; x += 68) {
          const shade = 58 + Math.random() * 22;
          ctx.fillStyle = `rgb(${shade + 16},${shade},${shade - 8})`;
          ctx.fillRect(x + offset + 2, y + 2, 64, rowH - 4);
          ctx.strokeStyle = "rgba(26,22,20,0.75)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + offset, y, 68, rowH);
        }
      }
      for (let i = 0; i < 2000; i++) {
        ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 210 : 22},${Math.random() > 0.5 ? 198 : 18},${Math.random() > 0.5 ? 184 : 16},0.04)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
    },
    2,
    2
  );
}

function makeAwningMap() {
  return repeatingTexture(
    256,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = "#5c1f28";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#7a2c37" : "#3e151c";
        ctx.fillRect((i / 8) * w, 0, w / 8, h);
      }
      for (let i = 0; i < 220; i++) {
        ctx.fillStyle = `rgba(20,10,12,${0.02 + Math.random() * 0.06})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1 + Math.random() * 3);
      }
    },
    3,
    1
  );
}

function makeRestaurantInteriorMap() {
  const map = canvasTexture(512, 512, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#2a1b14");
    grad.addColorStop(0.4, "#5a3722");
    grad.addColorStop(0.72, "#a56434");
    grad.addColorStop(1, "#3b2519");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Warm pendant pools.
    for (const x of [130, 382]) {
      const glow = ctx.createRadialGradient(x, 130, 4, x, 130, 120);
      glow.addColorStop(0, "rgba(255,226,170,0.95)");
      glow.addColorStop(0.16, "rgba(255,186,104,0.5)");
      glow.addColorStop(1, "rgba(255,150,70,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 130, 0, 260, 280);
      ctx.fillStyle = "#1b1210";
      ctx.fillRect(x - 34, 62, 68, 8);
      ctx.fillStyle = "#ffd89a";
      ctx.beginPath();
      ctx.arc(x, 92, 9, 0, TAU);
      ctx.fill();
    }

    // Table and seated silhouettes.
    ctx.fillStyle = "rgba(24,14,10,0.9)";
    ctx.fillRect(70, 330, 372, 14);
    ctx.fillRect(96, 344, 10, 96);
    ctx.fillRect(406, 344, 10, 96);
    for (const x of [168, 344]) {
      ctx.fillStyle = "rgba(18,10,8,0.94)";
      ctx.beginPath();
      ctx.arc(x, 286, 24, 0, TAU);
      ctx.fill();
      ctx.fillRect(x - 30, 306, 60, 78);
    }
    ctx.fillStyle = "rgba(255,196,126,0.18)";
    ctx.fillRect(60, 300, 392, 8);
  });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  return map;
}

function makeWoodMap() {
  return repeatingTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#3a2a20";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 9) {
        ctx.fillStyle = `rgba(16,10,7,${0.24 + Math.random() * 0.12})`;
        ctx.fillRect(0, y, w, 1.4);
        for (let i = 0; i < 14; i++) {
          ctx.strokeStyle = `rgba(104,72,48,${0.08 + Math.random() * 0.12})`;
          ctx.lineWidth = 0.6 + Math.random();
          const yy = y + 2 + Math.random() * 6;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.bezierCurveTo(w * 0.3, yy + (Math.random() - 0.5) * 4, w * 0.7, yy + (Math.random() - 0.5) * 4, w, yy);
          ctx.stroke();
        }
      }
    },
    2,
    2
  );
}

/* -------------------------------------------------------------------------- */
/*  Procedural people                                                         */
/* -------------------------------------------------------------------------- */

function personRig(options = {}) {
  const {
    female = false,
    height = female ? 1.66 : 1.76,
    skin = female ? 0xc98d63 : 0xa97650,
    hair = female ? 0x241713 : 0x1b1714,
    top = female ? 0x6b2431 : 0x26313d,
    bottom = 0x24262b,
    dress = female ? 0x742538 : null,
    shoes = 0x111316,
    coat = female ? 0x2b2028 : 0x1d242c,
    name = "Person",
    simple = false,
  } = options;

  const scale = height / 1.76;
  const root = new THREE.Group();
  root.name = name;
  root.scale.setScalar(scale);

  const body = new THREE.Group();
  root.add(body);

  const skinMat = std(skin, 0.68, 0, { emissive: 0x2a150c, emissiveIntensity: 0.3 });
  const hairMat = std(hair, 0.72, 0, { emissive: 0x050403, emissiveIntensity: 0.18 });
  const topMat = std(top, 0.82, 0, { emissive: 0x080a0c, emissiveIntensity: 0.2 });
  const bottomMat = std(bottom, 0.9);
  const shoeMat = std(shoes, 0.55, 0.08);
  const dressMat = dress ? std(dress, 0.78, 0, { emissive: 0x120409, emissiveIntensity: 0.22 }) : null;
  const eyeWhite = std(0xf2ebdf, 0.3, 0, { emissive: 0x30291f, emissiveIntensity: 0.5 });
  const eyeDark = std(0x171210, 0.4);
  const irisMat = std(female ? 0x4a2a16 : 0x2a1a10, 0.45);
  const lipMat = std(female ? 0x8f4a48 : 0x7a4038, 0.66, 0, {
    emissive: 0x1a0b08,
    emissiveIntensity: 0.25,
  });
  const mouthMat = std(0x2a1112, 0.85);
  const coatMat = std(coat, 0.8, 0.02, {
    emissive: 0x060506,
    emissiveIntensity: 0.16,
  });
  const goldMat = std(0xb18a48, 0.28, 0.9);
  const blushMat = std(female ? 0xa9655c : 0x8a5a48, 0.8, 0, {
    transparent: true,
    opacity: 0.3,
  });

  const hips = box(0.23, 0.2, 0.31, dressMat || bottomMat, 0.06);
  hips.position.set(0, 0.93, 0);
  body.add(hips);

  const torso = mesh(new THREE.CylinderGeometry(0.16, 0.125, 0.5, 14), topMat);
  torso.scale.set(0.86, 1, 1.12);
  torso.position.set(0.005, 1.22, 0);
  body.add(torso);
  const chest = mesh(new THREE.SphereGeometry(0.16, 14, 10), topMat);
  chest.scale.set(0.82, 0.64, 1.12);
  chest.position.set(0.008, 1.36, 0);
  body.add(chest);

  // A tailored waistband separates the bodice from the skirt/trousers and gives
  // the silhouette a waist instead of a straight capsule.
  const waist = box(0.25, 0.055, 0.31, std(0x171214, 0.72, 0.12), 0.012);
  waist.position.set(0.005, 1.04, 0);
  body.add(waist);

  const collar = mesh(new THREE.TorusGeometry(0.078, 0.017, 6, 14), std(top, 0.76));
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0.005, 1.43, 0);
  body.add(collar);

  // A narrow shirt placket and two buttons read as a real shirt under the
  // jacket in the close two-shots.
  if (!simple) {
    const placket = box(0.012, 0.3, 0.028, std(0xd8d2c4, 0.75));
    placket.position.set(0.143, 1.3, 0);
    body.add(placket);
    for (const y of [1.24, 1.34]) {
      const button = mesh(new THREE.SphereGeometry(0.009, 6, 5), goldMat);
      button.position.set(0.152, y, 0);
      body.add(button);
    }
  }

  const neck = mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.09, 9), skinMat);
  neck.position.set(0.005, 1.49, 0);
  body.add(neck);

  const head = mesh(new THREE.SphereGeometry(0.1, 16, 12), skinMat);
  head.scale.set(0.9, 1.06, 0.94);
  head.position.set(0.012, 1.6, 0);
  body.add(head);

  const hairCap = mesh(
    new THREE.SphereGeometry(0.104, 16, 10, 0, TAU, 0, Math.PI * 0.44),
    hairMat
  );
  hairCap.scale.set(0.94, 1.04, 0.99);
  hairCap.position.set(0.002, 1.61, 0);
  body.add(hairCap);

  const backHair = mesh(
    new THREE.SphereGeometry(0.1, 12, 9, 0, TAU, 0, Math.PI * 0.58),
    hairMat
  );
  backHair.scale.set(0.86, 1, 0.72);
  backHair.position.set(-0.012, 1.58, 0);
  body.add(backHair);

  if (!simple) {
    // A side-swept fringe and face-framing locks break up the smooth cap so
    // the close-ups don't read as a bald head.
    const fringe = mesh(new THREE.SphereGeometry(0.062, 12, 8), hairMat);
    fringe.scale.set(0.55, 0.4, 1.05);
    fringe.position.set(0.062, 1.655, 0.008);
    fringe.rotation.z = -0.35;
    body.add(fringe);
    for (const side of [-1, 1]) {
      const lock = mesh(new THREE.CapsuleGeometry(0.018, 0.11, 4, 8), hairMat);
      lock.scale.set(1, 1, 0.82);
      lock.position.set(0.016, 1.56, side * 0.082);
      body.add(lock);
    }
  }

  if (female) {
    const longHair = mesh(new THREE.CapsuleGeometry(0.075, 0.26, 5, 10), hairMat);
    longHair.scale.set(0.8, 1, 0.72);
    longHair.position.set(-0.055, 1.42, 0);
    body.add(longHair);

    if (!simple) {
      // A low bun gives the silhouette a finished hairstyle from behind.
      const bun = mesh(new THREE.SphereGeometry(0.058, 12, 10), hairMat);
      bun.scale.set(0.9, 0.82, 0.9);
      bun.position.set(-0.1, 1.565, 0);
      body.add(bun);
    }
  }

  const eyes = [];
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.022, 8, 6), skinMat);
    ear.position.set(0, 1.595, side * 0.094);
    ear.scale.set(0.7, 1, 0.55);
    body.add(ear);

    if (female && !simple) {
      const earring = mesh(new THREE.SphereGeometry(0.008, 6, 5), goldMat);
      earring.position.set(-0.006, 1.572, side * 0.098);
      earring.scale.set(0.7, 1.5, 0.7);
      body.add(earring);
    }

    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(0.095, 1.617, side * 0.036);
    body.add(eyeGroup);

    const eye = mesh(new THREE.SphereGeometry(0.0125, 10, 8), eyeWhite);
    eye.scale.set(0.5, 0.92, 1);
    eyeGroup.add(eye);
    const iris = mesh(new THREE.SphereGeometry(0.0078, 8, 6), irisMat);
    iris.position.set(0.006, 0, 0);
    iris.scale.set(0.5, 1, 1);
    eyeGroup.add(iris);
    const pupil = mesh(new THREE.SphereGeometry(0.0042, 6, 5), eyeDark);
    pupil.position.set(0.011, 0, 0);
    eyeGroup.add(pupil);
    if (!simple) {
      const glint = mesh(new THREE.SphereGeometry(0.0017, 5, 4), basic(0xffffff), false, false);
      glint.position.set(0.014, 0.002, 0.002);
      eyeGroup.add(glint);
      const lid = mesh(
        new THREE.SphereGeometry(0.0134, 10, 8, 0, TAU, 0, Math.PI * 0.42),
        skinMat
      );
      lid.scale.set(0.54, 0.9, 1.02);
      lid.position.set(0.001, 0.002, 0);
      eyeGroup.add(lid);
      const lash = box(0.004, 0.0025, 0.024, eyeDark);
      lash.position.set(0.012, 0.008, 0);
      eyeGroup.add(lash);
    }
    eyes.push(eyeGroup);

    const brow = box(0.008, 0.008, 0.042, hairMat);
    brow.position.set(0.102, 1.636, side * 0.036);
    brow.rotation.x = side * 0.05;
    brow.rotation.z = side * 0.04;
    body.add(brow);
  }

  const nose = mesh(new THREE.SphereGeometry(0.019, 8, 6), skinMat);
  nose.scale.set(1.35, 0.9, 0.72);
  nose.position.set(0.103, 1.594, 0);
  body.add(nose);
  const noseBridge = mesh(new THREE.SphereGeometry(0.014, 8, 6), skinMat);
  noseBridge.scale.set(1.1, 1.5, 0.62);
  noseBridge.position.set(0.096, 1.612, 0);
  body.add(noseBridge);

  const mouth = new THREE.Group();
  mouth.position.set(0.1, 1.571, 0);
  body.add(mouth);
  const mouthDark = box(0.006, 0.006, 0.036, mouthMat);
  mouthDark.position.set(0.001, 0, 0);
  mouth.add(mouthDark);
  const lipsUpper = box(0.008, 0.006, 0.042, lipMat);
  lipsUpper.position.set(0, 0.005, 0);
  mouth.add(lipsUpper);
  const lipsLower = box(0.008, 0.007, 0.038, lipMat);
  lipsLower.position.set(0, -0.005, 0);
  mouth.add(lipsLower);
  if (!simple) {
    for (const side of [-1, 1]) {
      const blush = mesh(new THREE.SphereGeometry(0.026, 8, 6), blushMat, false, false);
      blush.scale.set(0.32, 0.62, 1);
      blush.position.set(0.084, 1.594, side * 0.062);
      body.add(blush);
    }
  }

  let skirt = null;
  let hem = null;
  if (dressMat) {
    skirt = mesh(new THREE.CylinderGeometry(0.17, 0.34, 0.55, 16, 1, false), dressMat);
    skirt.position.set(0, 0.68, 0);
    body.add(skirt);
    hem = mesh(new THREE.TorusGeometry(0.335, 0.012, 5, 20), std(dress, 0.7));
    hem.rotation.x = Math.PI / 2;
    hem.position.set(0, 0.41, 0);
    body.add(hem);
    if (!simple) {
      const necklace = mesh(new THREE.TorusGeometry(0.052, 0.0035, 4, 18), goldMat);
      necklace.rotation.x = Math.PI / 2;
      necklace.position.set(0.008, 1.445, 0);
      body.add(necklace);
      const pendant = mesh(new THREE.SphereGeometry(0.008, 6, 5), goldMat);
      pendant.position.set(0.052, 1.425, 0);
      body.add(pendant);
    }
  }

  // An open overcoat. The front panels are slightly angled so the dress and
  // shirt show through the gap; the sleeves are recoloured when it is worn.
  const coatGroup = new THREE.Group();
  coatGroup.name = `${name}Coat`;
  body.add(coatGroup);
  const coatLength = female ? 0.94 : 0.66;
  const coatBottom = female ? 0.53 : 0.78;
  const coatCenter = coatBottom + coatLength / 2;

  // The back of the coat is a curved, tapered shell rather than a flat slab.
  // A box read as a billboard in the close two-shots, especially from behind
  // at the porch and when the player walks away from the camera.
  const coatShellMat = coatMat.clone();
  coatShellMat.side = THREE.DoubleSide;
  const addCoatBack = (topRadius, bottomRadius) => {
    const shell = mesh(
      new THREE.CylinderGeometry(
        topRadius,
        bottomRadius,
        coatLength,
        18,
        3,
        true,
        Math.PI,
        Math.PI
      ),
      coatShellMat
    );
    shell.position.set(-0.008, coatCenter, 0);
    shell.scale.x = 0.82;
    coatGroup.add(shell);
  };
  const addCoatShoulders = (size, width) => {
    for (const side of [-1, 1]) {
      const shoulder = mesh(new THREE.SphereGeometry(size, 10, 8), coatMat);
      shoulder.scale.set(1.02, 0.7, 1.08);
      shoulder.position.set(-0.006, 1.386, side * width);
      coatGroup.add(shoulder);
    }
    const yoke = box(0.14, 0.16, female ? 0.32 : 0.34, coatMat, 0.05);
    yoke.position.set(-0.074, 1.35, 0);
    coatGroup.add(yoke);
  };

  if (female) {
    addCoatBack(0.19, 0.31);
    addCoatShoulders(0.085, 0.165);
    for (const side of [-1, 1]) {
      const panel = box(0.16, coatLength, 0.115, coatMat, 0.035);
      panel.position.set(0.062, coatCenter, side * 0.17);
      panel.rotation.y = side * 0.17;
      coatGroup.add(panel);
    }
    const coatCollar = mesh(new THREE.TorusGeometry(0.092, 0.024, 6, 18), coatMat);
    coatCollar.rotation.x = Math.PI / 2;
    coatCollar.position.set(0.002, 1.432, 0);
    coatGroup.add(coatCollar);
    const coatBelt = box(0.235, 0.05, 0.345, std(0x171214, 0.72, 0.1), 0.01);
    coatBelt.position.set(0.008, 1.03, 0);
    coatGroup.add(coatBelt);
  } else {
    addCoatBack(0.205, 0.24);
    addCoatShoulders(0.09, 0.175);
    for (const side of [-1, 1]) {
      const panel = box(0.17, coatLength, 0.12, coatMat, 0.035);
      panel.position.set(0.058, coatCenter, side * 0.165);
      panel.rotation.y = side * 0.13;
      coatGroup.add(panel);
      const lapel = box(0.06, 0.26, 0.03, coatMat, 0.012);
      lapel.position.set(0.14, 1.33, side * 0.1);
      lapel.rotation.z = side * 0.32;
      lapel.rotation.y = side * 0.18;
      coatGroup.add(lapel);
    }
    const coatCollar = mesh(new THREE.TorusGeometry(0.094, 0.022, 6, 18), coatMat);
    coatCollar.rotation.x = Math.PI / 2;
    coatCollar.position.set(0.002, 1.435, 0);
    coatGroup.add(coatCollar);
  }

  function arm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.4, side * 0.195);
    body.add(pivot);
    const shoulder = mesh(new THREE.SphereGeometry(0.06, 9, 7), topMat);
    pivot.add(shoulder);
    const upper = mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.3, 8), topMat);
    upper.position.y = -0.15;
    pivot.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    pivot.add(elbow);
    const joint = mesh(new THREE.SphereGeometry(0.045, 8, 6), topMat);
    elbow.add(joint);
    const fore = mesh(new THREE.CylinderGeometry(0.043, 0.036, 0.27, 8), skinMat);
    fore.position.y = -0.135;
    elbow.add(fore);
    const cuff = mesh(new THREE.CylinderGeometry(0.047, 0.043, 0.06, 9), topMat);
    cuff.position.y = -0.268;
    elbow.add(cuff);
    const hand = mesh(new THREE.SphereGeometry(0.047, 9, 7), skinMat);
    hand.scale.set(0.85, 1.08, 0.92);
    hand.position.y = -0.3;
    elbow.add(hand);
    if (!simple) {
      for (let i = 0; i < 4; i++) {
        const finger = mesh(new THREE.CapsuleGeometry(0.0085, 0.032, 3, 5), skinMat);
        finger.position.set(0.012, -0.34, (i - 1.5) * 0.016);
        finger.rotation.z = -0.12;
        elbow.add(finger);
      }
      const thumb = mesh(new THREE.CapsuleGeometry(0.0095, 0.028, 3, 5), skinMat);
      thumb.position.set(-0.012, -0.315, 0.036);
      thumb.rotation.z = 0.6;
      elbow.add(thumb);
    }
    return { pivot, elbow, hand, upper, shoulder, fore, cuff };
  }

  function leg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.9, side * 0.1);
    body.add(pivot);
    const thigh = mesh(new THREE.CylinderGeometry(0.072, 0.062, 0.44, 9), dressMat || bottomMat);
    thigh.position.y = -0.22;
    pivot.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    pivot.add(knee);
    const joint = mesh(new THREE.SphereGeometry(0.064, 8, 6), dressMat || bottomMat);
    knee.add(joint);
    const shin = mesh(new THREE.CylinderGeometry(0.055, 0.046, 0.42, 8), dressMat ? skinMat : bottomMat);
    shin.position.y = -0.21;
    knee.add(shin);
    const shoe = box(0.23, 0.075, 0.115, shoeMat, 0.025);
    shoe.position.set(0.06, -0.44, 0);
    knee.add(shoe);
    return { pivot, knee, shoe };
  }

  const armL = arm(-1);
  const armR = arm(1);
  const legL = leg(-1);
  const legR = leg(1);

  const bag = new THREE.Group();
  bag.position.set(0.015, -0.35, 0.045);
  bag.rotation.z = 0.18;
  const bagBody = box(0.1, 0.14, 0.052, std(0x241a1c, 0.58, 0.2), 0.02);
  bag.add(bagBody);
  const bagClasp = mesh(new THREE.SphereGeometry(0.009, 6, 5), goldMat);
  bagClasp.position.set(0.005, 0.045, 0.032);
  bag.add(bagClasp);
  bag.visible = false;
  armL.elbow.add(bag);

  const fork = new THREE.Group();
  const forkHandle = mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.12, 6), goldMat);
  forkHandle.position.y = -0.06;
  fork.add(forkHandle);
  const forkHead = box(0.012, 0.045, 0.02, goldMat);
  forkHead.position.set(0, -0.13, 0);
  fork.add(forkHead);
  for (const z of [-0.006, 0, 0.006]) {
    const prong = box(0.003, 0.03, 0.003, goldMat);
    prong.position.set(0, -0.16, z);
    fork.add(prong);
  }
  fork.position.set(0.018, -0.37, 0.012);
  fork.rotation.z = 0.12;
  fork.visible = false;
  armL.elbow.add(fork);

  const knife = new THREE.Group();
  const knifeHandle = mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.11, 6), std(0x2a2420, 0.7));
  knifeHandle.position.y = -0.055;
  knife.add(knifeHandle);
  const blade = box(0.008, 0.12, 0.022, std(0xc9d0d4, 0.22, 0.9));
  blade.position.set(0, -0.16, 0.006);
  knife.add(blade);
  knife.position.set(0.018, -0.37, -0.01);
  knife.rotation.z = 0.1;
  knife.visible = false;
  armR.elbow.add(knife);

  function setCoat(value) {
    const on = Boolean(value);
    coatGroup.visible = on;
    for (const armPart of [armL, armR]) {
      armPart.upper.material = on ? coatMat : topMat;
      armPart.shoulder.material = on ? coatMat : topMat;
      armPart.cuff.material = on ? coatMat : topMat;
    }
  }
  setCoat(true);

  const rig = {
    root,
    body,
    head,
    scale,
    armL,
    armR,
    legL,
    legR,
    skirt,
    hem,
    walkPhase: 0,
    groundY: 0,
    sitting: 0,
    name,
  };

  rig.place = (x, y, z) => {
    rig.groundY = y;
    root.position.set(x, y, z);
  };

  rig.face = (dx, dz) => faceTowards(root, dx, dz);

  rig.walk = (dt, amount = 1) => {
    rig.walkPhase += dt * 7.0 * amount;
    const swing = Math.sin(rig.walkPhase);
    const liftL = Math.max(0, swing);
    const liftR = Math.max(0, -swing);
    legL.pivot.rotation.z = swing * 0.46 * amount;
    legR.pivot.rotation.z = -swing * 0.46 * amount;
    legL.knee.rotation.z = -liftL * 0.88 * amount;
    legR.knee.rotation.z = -liftR * 0.88 * amount;
    legL.pivot.rotation.x = -0.03 * amount;
    legR.pivot.rotation.x = 0.03 * amount;
    armL.pivot.rotation.z = -swing * 0.38 * amount;
    armR.pivot.rotation.z = swing * 0.38 * amount;
    armL.pivot.rotation.x = 0.05;
    armR.pivot.rotation.x = -0.05;
    armL.elbow.rotation.z = -0.2 - Math.max(0, -swing) * 0.22;
    armR.elbow.rotation.z = -0.2 - Math.max(0, swing) * 0.22;
    body.position.y = Math.abs(Math.sin(rig.walkPhase)) * 0.017 * amount;
    body.rotation.z = 0.022 + Math.sin(rig.walkPhase * 2) * 0.01 * amount;
    body.rotation.y = Math.sin(rig.walkPhase) * 0.035 * amount;
    head.rotation.y = -body.rotation.y * 0.7;
    head.rotation.z = 0;
  };

  rig.idle = (elapsed) => {
    const sway = Math.sin(elapsed * 1.1 + (female ? 1.7 : 0));
    const weight = Math.sin(elapsed * 0.42 + (female ? 0.8 : 0));
    legL.pivot.rotation.z = 0.012 * weight;
    legR.pivot.rotation.z = -0.012 * weight;
    legL.knee.rotation.z = 0;
    legR.knee.rotation.z = 0;
    armL.pivot.rotation.z = 0.025 + sway * 0.012;
    armR.pivot.rotation.z = -0.025 - sway * 0.012;
    armL.pivot.rotation.x = 0.05;
    armR.pivot.rotation.x = -0.05;
    armL.elbow.rotation.z = -0.13;
    armR.elbow.rotation.z = -0.13;
    body.position.y = sway * 0.0035;
    body.rotation.z = 0.016 + sway * 0.005;
    body.rotation.y = weight * 0.018;
    head.rotation.y = -weight * 0.05;
    head.rotation.z = sway * 0.018;
    rig.blink(elapsed);
  };

  rig.sit = (k = 1) => {
    const t = clamp01(k);
    rig.sitting = t;
    root.position.y = rig.groundY - 0.34 * t * scale;
    legL.pivot.rotation.z = 1.42 * t;
    legR.pivot.rotation.z = 1.42 * t;
    legL.knee.rotation.z = -1.36 * t;
    legR.knee.rotation.z = -1.36 * t;
    legL.pivot.rotation.x = -0.07 * t;
    legR.pivot.rotation.x = 0.07 * t;
    legL.knee.rotation.x = 0.02 * t;
    legR.knee.rotation.x = -0.02 * t;
    armL.pivot.rotation.z = 0.24 * t;
    armR.pivot.rotation.z = 0.24 * t;
    armL.pivot.rotation.x = 0.12 * t;
    armR.pivot.rotation.x = -0.12 * t;
    armL.elbow.rotation.z = -0.62 * t;
    armR.elbow.rotation.z = -0.62 * t;
    body.position.y = 0;
    body.rotation.z = 0.018 * t;
    body.rotation.y = 0;
    head.rotation.y = 0;
    head.rotation.x = -0.02 * t;
  };

  rig.eat = (elapsed, side = 1) => {
    const arm = side > 0 ? armR : armL;
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.4 + (side > 0 ? 0 : 1.4));
    // Keep the elbow tucked near the body; flaring it out turned the coat
    // sleeve into a black slab across the chest in the dinner close-ups.
    arm.pivot.rotation.z = 0.46 + pulse * 0.08;
    arm.pivot.rotation.x = side * -0.16;
    arm.elbow.rotation.z = -1.52 - pulse * 0.12;
    head.rotation.z = 0.03 + Math.sin(elapsed * 1.2) * 0.012;
    head.rotation.x = -0.02 - pulse * 0.025;
    rig.blink(elapsed);
  };

  rig.wave = (elapsed) => {
    armR.pivot.rotation.z = 2.55;
    armR.pivot.rotation.x = -0.25;
    armR.elbow.rotation.z = -0.5 + Math.sin(elapsed * 7) * 0.28;
  };

  rig.blink = (elapsed) => {
    const cycle = (elapsed + (female ? 1.3 : 0.4)) % 4.6;
    const k = cycle > 4.34 ? Math.sin(((cycle - 4.34) / 0.26) * Math.PI) : 0;
    for (const eye of eyes) eye.scale.y = 1 - k * 0.92;
  };

  rig.talk = (elapsed, amount = 1) => {
    const a = clamp01(amount);
    const open = (0.5 + 0.5 * Math.sin(elapsed * 11.5)) * a;
    lipsLower.position.y = -0.005 - open * 0.0065;
    mouthDark.scale.y = 1 + open * 2.4;
    mouthDark.position.y = -open * 0.0015;
    head.rotation.z = 0.02 + Math.sin(elapsed * 2.2) * 0.012 * a;
    head.rotation.x = -open * 0.018;
  };

  rig.look = (yaw = 0, pitch = 0) => {
    head.rotation.y = yaw;
    head.rotation.x = pitch;
  };

  rig.setCoat = setCoat;
  rig.setBag = (value) => {
    bag.visible = Boolean(value);
  };
  rig.setCutlery = (value) => {
    fork.visible = Boolean(value);
    knife.visible = Boolean(value);
  };
  rig.hasCoat = true;

  return rig;
}

/* -------------------------------------------------------------------------- */
/*  Passenger door and the seated companion                                  */
/* -------------------------------------------------------------------------- */

function createPassengerDoor(materials) {
  const hinge = new THREE.Group();
  hinge.name = "PassengerDoor";
  hinge.position.set(0.995, 0, -0.955);
  hinge.visible = false;

  const tilt = new THREE.Group();
  tilt.rotation.x = 0.14;
  hinge.add(tilt);

  const paint = materials.paint;
  const panel = new THREE.Mesh(
    new RoundedBoxGeometry(1.3, 0.62, 0.04, 4, 0.045),
    paint
  );
  panel.position.set(-0.65, 0.69, 0);
  panel.castShadow = true;
  tilt.add(panel);

  const windowFrame = box(1.16, 0.36, 0.03, std(0x0b0d10, 0.55, 0.2));
  windowFrame.position.set(-0.64, 1.17, 0);
  tilt.add(windowFrame);

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.02, 0.28),
    new THREE.MeshStandardMaterial({
      color: 0x0a1218,
      roughness: 0.14,
      metalness: 0.3,
      transparent: true,
      opacity: 0.72,
      envMapIntensity: 1.1,
      side: THREE.DoubleSide,
    })
  );
  glass.position.set(-0.64, 1.18, -0.018);
  tilt.add(glass);

  const bPillar = box(0.09, 0.42, 0.05, std(0x090b0d, 0.6, 0.15));
  bPillar.position.set(-1.22, 1.15, 0);
  tilt.add(bPillar);

  const innerCard = box(1.08, 0.42, 0.025, materials.interiorSoft ?? std(0xd8cdb8, 0.8));
  innerCard.position.set(-0.62, 0.7, 0.026);
  tilt.add(innerCard);

  const handle = box(0.18, 0.032, 0.012, std(0x2a2c2e, 0.4, 0.5));
  handle.position.set(-0.28, 0.9, -0.028);
  tilt.add(handle);

  const trim = box(1.2, 0.035, 0.05, std(0x0b0c0e, 0.7, 0.1));
  trim.position.set(-0.63, 0.38, 0);
  tilt.add(trim);

  let target = 0;
  let angle = 0;
  let velocity = 0;
  let openTime = 0;
  let opening = false;
  return {
    group: hinge,
    setOpen(value) {
      // A wide, near-vertical opening keeps the door clear of Anaya when the
      // camera looks through the aperture from the rear quarter.
      if (value && !opening) openTime = 0;
      opening = Boolean(value);
      target = value ? -1.35 : 0;
    },
    update(dt) {
      const step = Math.min(dt, 0.05);
      if (opening) openTime += step;

      // Real car doors have a check strap: the latch releases, the door swings
      // to its first detent, then continues to the wide hold-open position.
      // A critically-damped spring plus that two-stage target reads as a heavy
      // door instead of a panel rotating on a hinge.
      let stageTarget = target;
      if (opening && openTime < 0.9) stageTarget = -0.92;
      const stiffness = opening ? 34 : 46;
      const damping = opening ? 8.6 : 11;
      const accel = (stageTarget - angle) * stiffness - velocity * damping;
      velocity += accel * step;
      angle += velocity * step;
      angle = Math.max(-1.42, Math.min(0.02, angle));
      hinge.rotation.y = angle;
    },
    get open() {
      return angle;
    },
  };
}

function createSeatedCompanion() {
  const rig = personRig({
    female: true,
    height: 1.64,
    name: "Anaya",
    top: 0x7a2b3a,
    dress: 0x6f2333,
    skin: 0xcf9568,
    hair: 0x2a1a14,
  });
  rig.root.visible = false;
  rig.root.position.set(0.02, 0, -0.36);
  rig.setCoat(false);
  rig.setBag(false);
  rig.hasCoat = false;

  // The seated rig is already built from the same skeleton. Reuse its sit pose
  // but keep the feet clear of the footwell and the hands resting on the lap.
  rig.sit(1);
  // The cabin shell hides her lower half. Hiding the seated legs, skirt and
  // hem keeps the dress from poking through the door sill in side shots.
  rig.legL.pivot.visible = false;
  rig.legR.pivot.visible = false;
  if (rig.skirt) rig.skirt.visible = false;
  if (rig.hem) rig.hem.visible = false;
  rig.root.position.set(0.02, -0.34 * rig.scale, -0.36);
  rig.armL.pivot.rotation.z = 0.55;
  rig.armR.pivot.rotation.z = 0.55;
  rig.armL.elbow.rotation.z = -0.85;
  rig.armR.elbow.rotation.z = -0.85;
  rig.legL.pivot.rotation.z = 1.35;
  rig.legR.pivot.rotation.z = 1.35;
  rig.legL.knee.rotation.z = -1.3;
  rig.legR.knee.rotation.z = -1.3;

  let mood = 0;
  return {
    rig,
    group: rig.root,
    update(dt, elapsed) {
      const breathe = Math.sin(elapsed * 1.8) * 0.004;
      rig.body.position.y = breathe;
      rig.head.rotation.y = Math.sin(elapsed * 0.55) * 0.08 * mood;
      rig.head.rotation.z = 0.03 + Math.sin(elapsed * 0.9) * 0.02;
      rig.armR.pivot.rotation.z = 0.55 + Math.sin(elapsed * 1.1) * 0.02;
      rig.blink(elapsed);
    },
    setMood(value) {
      mood = value;
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Her house                                                                 */
/* -------------------------------------------------------------------------- */

function createHouse() {
  const group = new THREE.Group();
  group.name = "DateHouse";
  group.position.set(7.6, 0, -7.4);

  const plasterMap = makePlasterMap();
  const roofMap = makeRoofMap();
  const woodMap = makeWoodMap();
  const pavingMap = makePavingMap();
  const plaster = std(0xffffff, 0.9, 0, { map: plasterMap });
  const plasterDark = std(0x9a8774, 0.92, 0, { map: plasterMap });
  const roofMat = std(0xffffff, 0.88, 0.04, { map: roofMap });
  const wood = std(0xffffff, 0.86, 0.03, { map: woodMap });
  const trim = std(0x201b18, 0.8);
  const stone = std(0xffffff, 0.95, 0, { map: pavingMap });
  const warm = std(0xffc078, 0.4, 0, { emissive: 0xff9a45, emissiveIntensity: 2.4 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1b2a33,
    roughness: 0.16,
    metalness: 0.3,
    envMapIntensity: 1.1,
  });

  const shell = box(7.4, 5.2, 6.2, plaster);
  shell.position.y = 2.6;
  group.add(shell);

  const plinth = box(7.6, 0.4, 6.4, stone);
  plinth.position.y = 0.2;
  group.add(plinth);

  // Two roof slabs meeting at a ridge.
  for (const side of [-1, 1]) {
    const slope = box(8.5, 0.22, 3.9, roofMat);
    slope.position.set(0, 6.1, side * 1.85);
    slope.rotation.x = side * 0.58;
    group.add(slope);
  }
  const ridge = box(8.6, 0.18, 0.28, trim);
  ridge.position.y = 6.98;
  group.add(ridge);

  // Warm windows, framed in timber.
  for (const x of [-2.1, 2.1]) {
    for (const y of [2.4, 4.0]) {
      const frame = box(1.55, 1.5, 0.16, wood);
      frame.position.set(x, y, 3.12);
      group.add(frame);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.2), warm);
      pane.position.set(x, y, 3.21);
      group.add(pane);
      const mullion = box(0.06, 1.2, 0.04, trim);
      mullion.position.set(x, y, 3.23);
      group.add(mullion);
      const transom = box(1.25, 0.05, 0.04, trim);
      transom.position.set(x, y, 3.23);
      group.add(transom);
      for (const side of [-1, 1]) {
        const shutter = box(0.26, 1.34, 0.06, wood);
        shutter.position.set(x + side * 0.9, y, 3.17);
        group.add(shutter);
      }
    }
  }

  // A dark glass attic window under the gable.
  const atticFrame = box(1.15, 1.0, 0.12, wood);
  atticFrame.position.set(0, 5.45, 3.12);
  group.add(atticFrame);
  const atticGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.75), glass);
  atticGlass.position.set(0, 5.45, 3.2);
  group.add(atticGlass);

  // Door, hinge and brass handle.
  const doorPivot = new THREE.Group();
  doorPivot.position.set(0.55, 0, 3.13);
  group.add(doorPivot);
  const door = box(1.1, 2.15, 0.09, wood);
  door.position.set(-0.55, 1.08, 0);
  doorPivot.add(door);
  const doorInset = box(0.72, 1.5, 0.03, plasterDark);
  doorInset.position.set(-0.55, 1.1, 0.06);
  doorPivot.add(doorInset);
  const handle = mesh(new THREE.SphereGeometry(0.045, 10, 8), std(0xb18a48, 0.3, 0.85));
  handle.position.set(-0.12, 1.0, 0.09);
  doorPivot.add(handle);

  // Porch. Kept almost flush with the path so the characters' feet stay on
  // the stone instead of sinking through a raised deck.
  const porch = box(3.6, 0.08, 1.7, stone);
  porch.position.set(0, 0.04, 4.05);
  group.add(porch);
  const step = box(2.4, 0.06, 0.55, stone);
  step.position.set(0, 0.03, 5.1);
  group.add(step);
  const mat = box(1.05, 0.012, 0.62, std(0x2c2522, 0.96), 0.01);
  mat.position.set(0.55, 0.082, 3.98);
  group.add(mat);
  for (const side of [-1, 1]) {
    const post = box(0.16, 2.8, 0.16, wood);
    post.position.set(side * 1.55, 1.55, 4.75);
    group.add(post);
    const lamp = mesh(new THREE.SphereGeometry(0.1, 10, 8), basic(0xffcf8c));
    lamp.position.set(side * 1.55, 2.65, 4.9);
    group.add(lamp);
  }
  const canopy = box(3.8, 0.16, 1.9, roofMat);
  canopy.position.set(0, 3.0, 4.1);
  canopy.rotation.x = -0.08;
  group.add(canopy);

  // Path to the kerb.
  const pathMat = std(0xffffff, 0.94, 0, { map: pavingMap });
  for (let i = 0; i < 6; i++) {
    const slab = box(1.5, 0.04, 0.62, pathMat);
    slab.position.set(0, 0.025, 5.7 + i * 0.72);
    slab.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.008;
    group.add(slab);
  }

  // Planters flank the porch steps. Keeping them close to the facade clears
  // the diagonal Anaya takes from the door to the kerb.
  for (const side of [-1, 1]) {
    const planter = box(0.5, 0.55, 0.5, stone);
    planter.position.set(side * 2.1, 0.3, 3.9);
    group.add(planter);
    const bush = mesh(new THREE.SphereGeometry(0.32, 10, 8), std(0x27442c, 0.92));
    bush.position.set(side * 2.1, 0.82, 3.9);
    bush.scale.set(1, 0.8, 1);
    group.add(bush);
  }

  // Curtains and flower boxes make the lit windows read as rooms rather than
  // glowing panels. They are cheap planes and small spheres, but the silhouettes
  // carry the close-up when Anaya walks down the path.
  const curtainMat = std(0x7a5a48, 0.94);
  const curtainSheer = std(0xd9c9b2, 0.96, 0, {
    transparent: true,
    opacity: 0.72,
  });
  const boxWood = std(0x2b211b, 0.86);
  const flowerMat = std(0x6e2332, 0.82);
  const flowerLeaf = std(0x2d4a2e, 0.9);
  for (const x of [-2.1, 2.1]) {
    for (const y of [2.4, 4.0]) {
      for (const side of [-1, 1]) {
        const curtain = box(0.2, 1.32, 0.03, side > 0 ? curtainMat : curtainSheer);
        curtain.position.set(x + side * 0.52, y, 3.245);
        curtain.rotation.y = side * 0.04;
        group.add(curtain);
      }
      const valance = box(1.4, 0.12, 0.045, curtainMat);
      valance.position.set(x, y + 0.68, 3.25);
      group.add(valance);
      if (y === 2.4) {
        const windowBox = box(1.42, 0.16, 0.26, boxWood, 0.03);
        windowBox.position.set(x, 1.62, 3.32);
        group.add(windowBox);
        for (let i = 0; i < 7; i++) {
          const bloom = mesh(new THREE.SphereGeometry(0.045, 6, 5), flowerMat);
          bloom.position.set(x - 0.55 + i * 0.18, 1.73 + (i % 2) * 0.035, 3.33);
          group.add(bloom);
          const leaf = mesh(new THREE.SphereGeometry(0.04, 6, 5), flowerLeaf);
          leaf.scale.set(1.3, 0.5, 0.8);
          leaf.position.set(x - 0.58 + i * 0.18, 1.68, 3.31);
          group.add(leaf);
        }
      }
    }
  }

  // Chimney, eaves and a downpipe.
  const chimney = box(0.62, 2.1, 0.62, stone);
  chimney.position.set(-2.55, 6.5, -1.15);
  group.add(chimney);
  const chimneyCap = box(0.78, 0.12, 0.78, trim);
  chimneyCap.position.set(-2.55, 7.58, -1.15);
  group.add(chimneyCap);
  for (const side of [-1, 1]) {
    const eave = box(8.7, 0.12, 0.24, trim);
    eave.position.set(0, 6.06, side * 3.72);
    group.add(eave);
    const gutter = mesh(new THREE.CylinderGeometry(0.055, 0.055, 8.7, 8), trim);
    gutter.rotation.z = Math.PI / 2;
    gutter.position.set(0, 5.98, side * 3.8);
    group.add(gutter);
  }
  const downpipe = mesh(new THREE.CylinderGeometry(0.045, 0.045, 4.6, 8), trim);
  downpipe.position.set(-3.55, 3.7, 3.42);
  group.add(downpipe);
  const downpipeFoot = box(0.2, 0.16, 0.28, trim);
  downpipeFoot.position.set(-3.55, 1.48, 3.5);
  group.add(downpipeFoot);

  // A bench, house number and a small garden lamp.
  const bench = new THREE.Group();
  const benchSeat = box(1.25, 0.08, 0.38, wood, 0.02);
  benchSeat.position.set(0, 0.45, 0);
  bench.add(benchSeat);
  const benchBack = box(1.25, 0.42, 0.07, wood, 0.02);
  benchBack.position.set(0, 0.69, -0.16);
  benchBack.rotation.x = -0.12;
  bench.add(benchBack);
  for (const side of [-1, 1]) {
    const leg = box(0.07, 0.44, 0.34, trim);
    leg.position.set(side * 0.52, 0.22, 0);
    bench.add(leg);
  }
  bench.position.set(-1.25, 0.08, 4.0);
  bench.rotation.y = Math.PI / 2;
  group.add(bench);

  const numberTexture = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#201b18";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#b18a48";
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = "#f0dfbc";
    ctx.font = "600 64px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("18", w / 2, h / 2 + 4);
  });
  const number = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ map: numberTexture, toneMapped: false })
  );
  number.position.set(1.42, 1.85, 3.15);
  group.add(number);

  const mailbox = new THREE.Group();
  const mailboxPost = mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.15, 8), trim);
  mailboxPost.position.y = 0.58;
  mailbox.add(mailboxPost);
  const mailboxBody = box(0.34, 0.28, 0.22, std(0x1d2429, 0.45, 0.4), 0.04);
  mailboxBody.position.set(0, 1.2, 0);
  mailbox.add(mailboxBody);
  const mailboxFlag = box(0.03, 0.16, 0.02, std(0xb18a48, 0.3, 0.85));
  mailboxFlag.position.set(0.18, 1.3, 0.11);
  mailbox.add(mailboxFlag);
  mailbox.position.set(2.2, 0, 6.6);
  group.add(mailbox);

  // The garden lamp sits on the mailbox side of the path. On the old side it
  // stood directly between the pickup camera and Anaya's route to the car.
  const gardenPole = mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.5, 8), trim);
  gardenPole.position.set(3.0, 1.25, 6.8);
  group.add(gardenPole);
  const gardenLamp = mesh(new THREE.SphereGeometry(0.13, 10, 8), basic(0xffc47e), false, false);
  gardenLamp.position.set(3.0, 2.58, 6.8);
  group.add(gardenLamp);
  const gardenCap = mesh(new THREE.ConeGeometry(0.18, 0.14, 8), trim);
  gardenCap.position.set(3.0, 2.73, 6.8);
  group.add(gardenCap);
  const gardenLight = new THREE.PointLight(0xffb066, 2.2, 6, 2);
  gardenLight.position.set(3.0, 2.5, 6.8);
  group.add(gardenLight);

  // Low box hedges sit behind the walking line rather than across it. The
  // earlier tall clumps filled the foreground of the pickup shot with green
  // spheres and snagged Anaya's route to the car.
  for (const side of [-1, 1]) {
    const hedge = box(0.5, 0.42, 1.8, std(0x243d2a, 0.94), 0.12);
    hedge.position.set(side * 3.6, 0.21, 5.5);
    group.add(hedge);
    for (let i = 0; i < 4; i++) {
      const leaf = mesh(new THREE.SphereGeometry(0.16, 7, 5), std(0x2b4931, 0.92));
      leaf.position.set(side * 3.6 + (Math.random() - 0.5) * 0.24, 0.45, 4.9 + i * 0.42);
      leaf.scale.set(1, 0.65, 1);
      group.add(leaf);
    }
  }

  const porchLight = new THREE.PointLight(0xffb066, 5.5, 12, 2);
  porchLight.position.set(0, 2.8, 4.8);
  group.add(porchLight);

  const house = {
    group,
    doorPivot,
    porch: new THREE.Vector3(7.6, 0, -3.9),
    entrance: new THREE.Vector3(7.6, 0, -2.7),
    doorOpen: 0,
  };
  group.visible = false;
  return house;
}

/* -------------------------------------------------------------------------- */
/*  Restaurant                                                                */
/* -------------------------------------------------------------------------- */

function createRestaurant() {
  const group = new THREE.Group();
  group.name = "DateRestaurant";
  group.position.set(-8.8, 0, -7.8);

  const brickMap = makeBrickMap();
  const woodMap = makeWoodMap();
  const pavingMap = makePavingMap();
  const brick = std(0xffffff, 0.92, 0, { map: brickMap });
  const dark = std(0x1a1715, 0.85);
  const trim = std(0x171311, 0.7, 0.2);
  const wood = std(0xffffff, 0.86, 0, { map: woodMap });
  const brass = std(0xb18a48, 0.3, 0.88);
  const warm = std(0xffc078, 0.42, 0, { emissive: 0xff9a45, emissiveIntensity: 2.1 });
  const interiorMap = makeRestaurantInteriorMap();
  const interiorGlow = new THREE.MeshBasicMaterial({
    map: interiorMap,
    toneMapped: false,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x101a20,
    roughness: 0.12,
    metalness: 0.35,
    transparent: true,
    opacity: 0.24,
    envMapIntensity: 1.2,
  });
  const awningMap = makeAwningMap();
  const burgundy = std(0xffffff, 0.8, 0, { map: awningMap });

  const shell = box(10.2, 5.0, 6.4, brick);
  shell.position.y = 2.5;
  group.add(shell);
  const band = box(10.3, 0.5, 6.5, trim);
  band.position.y = 4.9;
  group.add(band);

  // Ground-floor glazing with warm interior panels behind.
  for (const x of [-3.2, -1.1, 1.1, 3.2]) {
    const frame = box(1.85, 2.3, 0.16, trim);
    frame.position.set(x, 1.55, 3.22);
    group.add(frame);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 2.06), interiorGlow);
    pane.position.set(x, 1.55, 3.305);
    group.add(pane);
    const glare = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.05), glass);
    glare.position.set(x, 1.55, 3.34);
    group.add(glare);
    const mullion = box(0.05, 2.05, 0.03, trim);
    mullion.position.set(x, 1.55, 3.36);
    group.add(mullion);
    const transom = box(1.7, 0.06, 0.035, trim);
    transom.position.set(x, 2.42, 3.36);
    group.add(transom);
    // Stone sill and a small window lamp inside.
    const sill = box(1.95, 0.1, 0.3, std(0xffffff, 0.95, 0, { map: pavingMap }));
    sill.position.set(x, 0.42, 3.34);
    group.add(sill);
  }

  // Clerestory band and pilasters break up the flat brick box.
  for (const x of [-4.2, -2.6, -0.9, 0.9, 2.6, 4.2]) {
    const upper = box(1.15, 1.1, 0.08, trim);
    upper.position.set(x, 3.72, 3.24);
    group.add(upper);
    const upperPane = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.94), warm);
    upperPane.position.set(x, 3.72, 3.3);
    group.add(upperPane);
  }
  for (const x of [-5.05, 5.05]) {
    const pilaster = box(0.34, 4.7, 0.42, std(0x3b2d28, 0.9, 0, { map: brickMap }));
    pilaster.position.set(x, 2.35, 3.28);
    group.add(pilaster);
  }
  const cornice = box(10.7, 0.22, 0.5, trim);
  cornice.position.set(0, 5.06, 3.22);
  group.add(cornice);

  // Central double door.
  const doorPivot = new THREE.Group();
  doorPivot.position.set(0.62, 0, 3.25);
  group.add(doorPivot);
  const door = box(1.24, 2.4, 0.1, wood);
  door.position.set(-0.62, 1.2, 0);
  doorPivot.add(door);
  const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.5), glass);
  doorGlass.position.set(-0.62, 1.5, 0.06);
  doorPivot.add(doorGlass);
  const doorHandle = box(0.035, 0.42, 0.05, std(0xb18a48, 0.3, 0.85));
  doorHandle.position.set(-0.12, 1.15, 0.09);
  doorPivot.add(doorHandle);

  // Awning with a scalloped edge. The striped canvas is a texture so the
  // scallops read as part of the same fabric rather than separate blobs.
  const awning = box(6.2, 0.12, 1.9, burgundy);
  awning.position.set(0, 3.15, 4.0);
  awning.rotation.x = -0.18;
  group.add(awning);
  const awningEdge = box(6.2, 0.05, 0.16, burgundy);
  awningEdge.position.set(0, 2.9, 4.92);
  group.add(awningEdge);
  for (let i = 0; i < 14; i++) {
    const scallop = mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI), burgundy);
    scallop.position.set(-2.9 + (i / 13) * 5.8, 3.02, 4.86);
    scallop.rotation.x = Math.PI / 2;
    scallop.scale.set(0.92, 0.55, 1);
    group.add(scallop);
  }
  for (const side of [-1, 1]) {
    const arm = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.95, 6), trim);
    arm.rotation.x = Math.PI / 2 - 0.18;
    arm.position.set(side * 3.0, 3.16, 4.02);
    group.add(arm);
  }

  // Sign board, lit by two small brass spots.
  const signTexture = canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = "#120e0c";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#b18a48";
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 18, w - 36, h - 36);
    ctx.fillStyle = "#f3d9a0";
    ctx.font = "600 92px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LUMIÈRE", w / 2, h / 2 - 4);
    ctx.fillStyle = "#b18a48";
    ctx.font = "400 26px Georgia, serif";
    ctx.fillText("KITCHEN  ·  BAR", w / 2, h / 2 + 62);
  });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 1.15),
    new THREE.MeshBasicMaterial({ map: signTexture, toneMapped: false })
  );
  sign.position.set(0, 4.15, 3.29);
  group.add(sign);
  const signBoard = box(4.9, 1.42, 0.1, trim);
  signBoard.position.set(0, 4.15, 3.2);
  group.add(signBoard);

  // Sconces flanking the door with warm spill on the brick.
  for (const side of [-1, 1]) {
    const bracket = box(0.1, 0.12, 0.28, trim);
    bracket.position.set(side * 1.35, 2.72, 3.28);
    group.add(bracket);
    const globe = mesh(new THREE.SphereGeometry(0.11, 10, 8), basic(0xffd49a), false, false);
    globe.position.set(side * 1.35, 2.6, 3.44);
    group.add(globe);
    const sconceLight = new THREE.PointLight(0xffb066, 1.5, 3.2, 2);
    sconceLight.position.set(side * 1.35, 2.55, 3.55);
    group.add(sconceLight);
  }

  // Outdoor planters, a menu stand and brass stanchions.
  for (const side of [-1, 1]) {
    const planter = box(0.62, 0.7, 0.62, dark);
    planter.position.set(side * 3.9, 0.35, 3.9);
    group.add(planter);
    const shrub = mesh(new THREE.SphereGeometry(0.42, 10, 8), std(0x2b4630, 0.9));
    shrub.position.set(side * 3.9, 0.98, 3.9);
    group.add(shrub);
    const bollard = mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 8), trim);
    bollard.position.set(side * 2.6, 0.45, 5.0);
    group.add(bollard);
    const lamp = mesh(new THREE.SphereGeometry(0.09, 8, 6), basic(0xffcf8c));
    lamp.position.set(side * 2.6, 0.98, 5.0);
    group.add(lamp);
    const bollardLight = new THREE.PointLight(0xffb066, 0.8, 2.6, 2);
    bollardLight.position.set(side * 2.6, 1.0, 5.0);
    group.add(bollardLight);

    // Stanchion posts and a velvet rope.
    const post = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.95, 8), brass);
    post.position.set(side * 1.9, 0.48, 5.3);
    group.add(post);
    const cap = mesh(new THREE.SphereGeometry(0.055, 8, 6), brass);
    cap.position.set(side * 1.9, 0.98, 5.3);
    group.add(cap);
    const base = mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.05, 10), brass);
    base.position.set(side * 1.9, 0.03, 5.3);
    group.add(base);
  }
  const rope = mesh(new THREE.TorusGeometry(1.9, 0.02, 6, 24, Math.PI), std(0x5c1f28, 0.85));
  rope.position.set(0, 0.98, 5.3);
  rope.rotation.z = Math.PI;
  rope.rotation.x = Math.PI / 2;
  group.add(rope);

  // A-frame menu stand near the door.
  const menuTexture = canvasTexture(256, 320, (ctx, w, h) => {
    ctx.fillStyle = "#1b1512";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#b18a48";
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = "#f0dcb4";
    ctx.font = "600 26px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("MENU", w / 2, 58);
    ctx.font = "400 13px Georgia, serif";
    ctx.fillStyle = "#cdb88f";
    const lines = ["Oysters · mignonette", "Truffle tagliatelle", "Sea bass · fennel", "Lamb · rosemary", "Dark chocolate", "—", "Tasting 6 courses"];
    lines.forEach((line, i) => ctx.fillText(line, w / 2, 98 + i * 28));
  });
  const menu = new THREE.Group();
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.68),
      new THREE.MeshBasicMaterial({ map: menuTexture, toneMapped: false, side: THREE.DoubleSide })
    );
    leaf.position.set(0, 0.44, side * 0.07);
    leaf.rotation.x = side * 0.16;
    menu.add(leaf);
    const leg = box(0.035, 0.85, 0.035, trim);
    leg.position.set(side * 0.24, 0.42, 0);
    menu.add(leg);
  }
  menu.position.set(-1.9, 0.02, 4.45);
  menu.rotation.y = 0.22;
  group.add(menu);

  // Warm light spilling out of the windows onto the pavement.
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(8.4, 2.2),
    new THREE.MeshBasicMaterial({
      color: 0xffa860,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.012, 4.9);
  group.add(spill);

  const entranceLight = new THREE.PointLight(0xffa860, 7.5, 15, 2);
  entranceLight.position.set(0, 3.2, 4.6);
  group.add(entranceLight);
  const windowLight = new THREE.PointLight(0xff9a50, 3.2, 9, 2);
  windowLight.position.set(0, 1.6, 4.4);
  group.add(windowLight);

  const restaurant = {
    group,
    doorPivot,
    entrance: new THREE.Vector3(-8.8, 0, -4.1),
    doorOpen: 0,
  };
  group.visible = false;
  return restaurant;
}

/* -------------------------------------------------------------------------- */
/*  Dining room diorama                                                       */
/* -------------------------------------------------------------------------- */

function createDiningRoom() {
  const group = new THREE.Group();
  group.name = "DateDiningRoom";
  group.position.set(80, 0, -60);

  const floorMap = makeWoodMap();
  floorMap.repeat.set(4, 3);
  const wallMap = makePlasterMap();
  wallMap.repeat.set(3, 2);
  const brickMap = makeBrickMap();
  const floorMat = std(0x8a6848, 0.68, 0.04, { map: floorMap });
  const wallMat = std(0xa08570, 0.92, 0, { map: wallMap });
  const wainscot = std(0x3b2a20, 0.82, 0, { map: floorMap });
  const ceiling = std(0x2a2320, 0.95);
  const trim = std(0x191411, 0.7, 0.1);
  const brass = std(0xb18a48, 0.28, 0.9);
  const cloth = std(0xe6dcc8, 0.92);
  const wood = std(0x4a2f1f, 0.7, 0.05, { map: floorMap });
  const candleMat = std(0xf0e6d0, 0.8);
  const flame = basic(0xffc06a);
  const leafMat = std(0x2c4a30, 0.9);

  const floor = box(11, 0.12, 8.4, floorMat);
  floor.position.y = -0.06;
  group.add(floor);
  // Plank seams across the floor.
  for (let i = 0; i < 22; i++) {
    const seam = box(11, 0.004, 0.012, std(0x2c1e14, 0.9));
    seam.position.set(0, 0.001, -4.1 + i * 0.39);
    group.add(seam);
  }
  const rug = box(6.4, 0.02, 4.2, std(0x3e2324, 0.96));
  rug.position.y = 0.012;
  group.add(rug);
  const rugBorder = box(6.6, 0.016, 4.4, std(0x6d4a2e, 0.92));
  rugBorder.position.y = 0.006;
  group.add(rugBorder);

  const backWall = box(11, 3.6, 0.2, wallMat);
  backWall.position.set(0, 1.8, -4.2);
  group.add(backWall);
  const leftWall = box(0.2, 3.6, 8.4, wallMat);
  leftWall.position.set(-5.5, 1.8, 0);
  group.add(leftWall);
  const rightWall = box(0.2, 3.6, 8.4, wallMat);
  rightWall.position.set(5.5, 1.8, 0);
  group.add(rightWall);
  const frontWall = box(11, 3.6, 0.2, wallMat);
  frontWall.position.set(0, 1.8, 4.2);
  group.add(frontWall);
  const roof = box(11, 0.16, 8.4, ceiling);
  roof.position.y = 3.6;
  group.add(roof);

  // Ceiling beams and a plaster cornice.
  for (const z of [-3.2, -1.6, 0, 1.6, 3.2]) {
    const beam = box(11, 0.16, 0.18, trim);
    beam.position.set(0, 3.5, z);
    group.add(beam);
  }
  for (const side of [-1, 1]) {
    const cornice = box(10.9, 0.14, 0.2, trim);
    cornice.position.set(0, 3.44, side * 4.06);
    group.add(cornice);
  }

  // Wainscot and a chair rail.
  for (const wall of [backWall, leftWall, rightWall, frontWall]) {
    const panel = wall.clone();
    panel.material = wainscot;
    panel.scale.y = 0.28;
    panel.position.y = 0.55;
    panel.position.x = wall.position.x;
    panel.position.z = wall.position.z;
    group.add(panel);
  }
  const rail = box(10.6, 0.08, 0.08, trim);
  rail.position.set(0, 1.02, -4.08);
  group.add(rail);

  // A bokeh window on the left wall, city lights out of focus.
  const bokeh = canvasTexture(512, 320, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#07101b");
    gradient.addColorStop(0.62, "#12202c");
    gradient.addColorStop(1, "#2a1c16");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 130; i++) {
      const x = Math.random() * w;
      const y = h * 0.25 + Math.random() * h * 0.7;
      const r = 2 + Math.random() * 9;
      const warm = Math.random() > 0.45;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
      glow.addColorStop(0, warm ? "rgba(255,196,120,0.8)" : "rgba(140,200,255,0.65)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    }
  });
  const windowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.0),
    new THREE.MeshBasicMaterial({ map: bokeh, toneMapped: false })
  );
  windowPlane.rotation.y = Math.PI / 2;
  windowPlane.position.set(-5.38, 2.05, -0.5);
  group.add(windowPlane);
  const windowFrame = box(0.1, 2.25, 3.45, trim);
  windowFrame.position.set(-5.46, 2.05, -0.5);
  group.add(windowFrame);
  // Curtains framing the window.
  for (const side of [-1, 1]) {
    const curtain = box(0.06, 2.5, 0.55, std(0x6a3a3a, 0.94));
    curtain.position.set(-5.34, 1.95, -0.5 + side * 1.72);
    group.add(curtain);
  }

  // Framed art on the back wall.
  const artColors = [
    ["#243b4a", "#c98a4b", "#e8d5b0"],
    ["#3a2430", "#b87333", "#7d9b8a"],
    ["#1f2a24", "#c9a86a", "#8a5a44"],
  ];
  for (let i = 0; i < 3; i++) {
    const [bg, mid, light] = artColors[i];
    const artTexture = canvasTexture(256, 320, (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = mid;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.42, w * 0.26, 0, TAU);
      ctx.fill();
      ctx.fillStyle = light;
      ctx.fillRect(w * 0.16, h * 0.58, w * 0.68, h * 0.2);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#000000";
      for (let j = 0; j < 18; j++) {
        ctx.fillRect(Math.random() * w, h * 0.62 + Math.random() * h * 0.36, 2, 2);
      }
      ctx.globalAlpha = 1;
    });
    const frame = box(0.78, 0.98, 0.06, brass);
    frame.position.set(-3.1 + i * 3.1, 2.25, -4.08);
    group.add(frame);
    const canvas = new THREE.Mesh(
      new THREE.PlaneGeometry(0.64, 0.84),
      new THREE.MeshBasicMaterial({ map: artTexture, toneMapped: false })
    );
    canvas.position.set(-3.1 + i * 3.1, 2.25, -4.045);
    group.add(canvas);
  }

  // Back bar along the right wall: counter, shelves, bottles, stools.
  const barCounter = box(0.62, 1.08, 3.1, wood, 0.03);
  barCounter.position.set(4.92, 0.54, -2.05);
  group.add(barCounter);
  const barTop = box(0.8, 0.08, 3.25, std(0x2b201a, 0.32, 0.15), 0.02);
  barTop.position.set(4.92, 1.11, -2.05);
  group.add(barTop);
  const barFront = box(0.08, 0.82, 2.9, std(0x3a2a20, 0.8));
  barFront.position.set(4.58, 0.46, -2.05);
  group.add(barFront);
  const barRail = mesh(new THREE.CylinderGeometry(0.028, 0.028, 2.9, 8), brass);
  barRail.rotation.x = Math.PI / 2;
  barRail.position.set(4.5, 0.86, -2.05);
  group.add(barRail);
  const backBar = box(0.28, 2.4, 3.2, std(0x241a16, 0.9));
  backBar.position.set(5.3, 1.5, -2.05);
  group.add(backBar);
  for (const y of [1.35, 1.85, 2.35]) {
    const shelf = box(0.42, 0.04, 2.9, wood);
    shelf.position.set(5.12, y, -2.05);
    group.add(shelf);
  }
  const bottleMats = [0x2f4a2e, 0x4a2a1e, 0x2b3446, 0x6a4a24, 0x3a2030];
  const bottleTops = [0x1c2a1c, 0x2a1810, 0x18202a, 0x3a2812, 0x22121c];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 9; i++) {
      const height = 0.2 + ((i * 7 + row * 3) % 5) * 0.035;
      const bottle = mesh(
        new THREE.CylinderGeometry(0.036, 0.042, height, 8),
        std(bottleMats[(i + row) % bottleMats.length], 0.28, 0.12, {
          emissive: 0x140c06,
          emissiveIntensity: 0.4,
        })
      );
      bottle.position.set(5.12, 1.37 + row * 0.5 + height / 2, -3.35 + i * 0.32);
      group.add(bottle);
      const neck = mesh(
        new THREE.CylinderGeometry(0.014, 0.018, 0.09, 6),
        std(bottleTops[(i + row) % bottleTops.length], 0.4)
      );
      neck.position.set(5.12, 1.37 + row * 0.5 + height + 0.045, -3.35 + i * 0.32);
      group.add(neck);
    }
  }
  for (const z of [-3.0, -2.3, -1.6, -0.9]) {
    const stoolSeat = mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.07, 12), std(0x5b2630, 0.86));
    stoolSeat.position.set(4.25, 0.62, z);
    group.add(stoolSeat);
    const stoolPost = mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.58, 8), brass);
    stoolPost.position.set(4.25, 0.31, z);
    group.add(stoolPost);
    const stoolBase = mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.04, 10), brass);
    stoolBase.position.set(4.25, 0.02, z);
    group.add(stoolBase);
  }
  const barLight = new THREE.PointLight(0xffb070, 3.4, 6.5, 2);
  barLight.position.set(4.5, 2.5, -2.0);
  group.add(barLight);

  // A table lamp in the far corner keeps the back of the room from going flat.
  const cornerShade = mesh(
    new THREE.ConeGeometry(0.22, 0.26, 12, 1, true),
    std(0xd8b98a, 0.85, 0, { emissive: 0x6a3c18, emissiveIntensity: 0.6 })
  );
  cornerShade.rotation.x = Math.PI;
  cornerShade.position.set(-4.4, 1.5, -3.4);
  group.add(cornerShade);
  const cornerLight = new THREE.PointLight(0xffb870, 2.2, 5, 2);
  cornerLight.position.set(-4.4, 1.4, -3.4);
  group.add(cornerLight);

  // A background couple and a waiter give the room life beyond the hero table.
  const dinerA = personRig({
    female: true,
    simple: true,
    height: 1.63,
    skin: 0x8a5a3c,
    hair: 0x1a1310,
    dress: 0x2e3d4a,
    coat: 0x2a2028,
    name: "DinerA",
  });
  dinerA.place(-3.35, 0, -3.3);
  dinerA.face(0, 1);
  dinerA.sit(1);
  dinerA.setCoat(false);
  group.add(dinerA.root);

  const dinerB = personRig({
    height: 1.78,
    skin: 0x6e4a30,
    hair: 0x12100e,
    top: 0x2a2f36,
    coat: 0x1a1d22,
    name: "DinerB",
  });
  dinerB.place(-3.35, 0, -2.1);
  dinerB.face(0, -1);
  dinerB.sit(1);
  dinerB.setCoat(false);
  group.add(dinerB.root);

  const bgTable = box(1.3, 0.08, 0.8, cloth, 0.03);
  bgTable.position.set(-3.35, 0.74, -2.7);
  group.add(bgTable);
  const bgCandle = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.18, 10), candleMat);
  bgCandle.position.set(-3.35, 0.86, -2.7);
  group.add(bgCandle);
  const bgFlame = mesh(new THREE.SphereGeometry(0.022, 7, 5), flame, false, false);
  bgFlame.scale.set(1, 1.7, 1);
  bgFlame.position.set(-3.35, 0.98, -2.7);
  group.add(bgFlame);
  const bgLight = new THREE.PointLight(0xffb060, 1.6, 3.2, 2);
  bgLight.position.set(-3.35, 1.05, -2.7);
  group.add(bgLight);

  const waiter = personRig({
    height: 1.8,
    skin: 0x9a6a46,
    hair: 0x171310,
    top: 0x1d1f24,
    bottom: 0x141619,
    coat: 0x1d1f24,
    name: "Waiter",
  });
  waiter.setCoat(true);
  waiter.place(3.55, 0, -3.1);
  group.add(waiter.root);
  const tray = new THREE.Group();
  const trayDisc = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 16), std(0xc9c2b2, 0.35, 0.6));
  tray.add(trayDisc);
  for (const side of [-1, 1]) {
    const glassBowl = mesh(
      new THREE.CylinderGeometry(0.032, 0.022, 0.08, 8, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xd8e6ef,
        roughness: 0.05,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      })
    );
    glassBowl.position.set(side * 0.07, 0.05, 0.03);
    tray.add(glassBowl);
  }
  tray.position.set(0, -0.14, 0);
  tray.rotation.z = 0.5;
  waiter.armL.hand.add(tray);
  waiter.tray = tray;

  // A small bread basket and a wine bottle dress the hero table.
  const basket = mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.06, 10), std(0x8a6a42, 0.9));
  basket.position.set(-0.45, 0.82, 0);
  group.add(basket);
  for (let i = 0; i < 3; i++) {
    const roll = mesh(new THREE.SphereGeometry(0.05, 8, 6), std(0xc9a06a, 0.88));
    roll.scale.set(1.3, 0.7, 1);
    roll.position.set(-0.47 + i * 0.05, 0.87, -0.03 + i * 0.04);
    group.add(roll);
  }
  const wineBottle = mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 0.26, 10),
    std(0x1e3020, 0.2, 0.2, { emissive: 0x081006, emissiveIntensity: 0.5 })
  );
  wineBottle.position.set(0.55, 0.94, -0.02);
  group.add(wineBottle);
  const wineNeck = mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.11, 8), std(0x1e3020, 0.25, 0.2));
  wineNeck.position.set(0.55, 1.12, -0.02);
  group.add(wineNeck);
  const wineLabel = box(0.07, 0.08, 0.005, std(0xd8cba8, 0.8));
  wineLabel.position.set(0.55, 0.96, 0.049);
  group.add(wineLabel);
  const vase = mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.16, 10), std(0x9aa8a2, 0.35, 0.1));
  vase.position.set(0.12, 0.9, 0.28);
  group.add(vase);
  for (let i = 0; i < 3; i++) {
    const stem = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.24, 5), leafMat);
    stem.position.set(0.12 + (i - 1) * 0.03, 1.08, 0.28 + (i % 2) * 0.02);
    stem.rotation.z = (i - 1) * 0.16;
    group.add(stem);
    const bloom = mesh(new THREE.SphereGeometry(0.032, 7, 6), std(0xc9a4a8, 0.7));
    bloom.position.set(0.12 + (i - 1) * 0.07, 1.2, 0.28 + (i % 2) * 0.03);
    group.add(bloom);
  }
  for (const z of [-0.38, 0.38]) {
    const napkin = box(0.16, 0.012, 0.22, std(0xe8e0d0, 0.95));
    napkin.position.set(-0.1, 0.822, z + 0.18);
    napkin.rotation.y = 0.12;
    group.add(napkin);
  }

  // Table, set for two.
  const tableTop = box(2.5, 0.1, 1.15, cloth, 0.04);
  tableTop.position.y = 0.75;
  group.add(tableTop);
  const tableSkirt = box(2.38, 0.12, 1.03, cloth);
  tableSkirt.position.y = 0.66;
  group.add(tableSkirt);
  for (const x of [-1.0, 1.0]) {
    for (const z of [-0.42, 0.42]) {
      const leg = box(0.08, 0.72, 0.08, wood);
      leg.position.set(x, 0.36, z);
      group.add(leg);
    }
  }

  // Two chairs, oriented toward the table.
  function chair(z, facing) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, z);
    pivot.rotation.y = facing;
    const seat = box(0.56, 0.09, 0.54, wood, 0.03);
    seat.position.y = 0.4;
    pivot.add(seat);
    const cushion = box(0.5, 0.06, 0.48, std(0x5b2630, 0.9), 0.03);
    cushion.position.y = 0.465;
    pivot.add(cushion);
    const back = box(0.56, 0.68, 0.08, wood, 0.03);
    back.position.set(0, 0.77, -0.26);
    pivot.add(back);
    const backCushion = box(0.48, 0.5, 0.06, std(0x5b2630, 0.9), 0.03);
    backCushion.position.set(0, 0.73, -0.21);
    pivot.add(backCushion);
    for (const x of [-0.22, 0.22]) {
      for (const zz of [-0.2, 0.2]) {
        const leg = box(0.055, 0.4, 0.055, wood);
        leg.position.set(x, 0.2, zz);
        pivot.add(leg);
      }
    }
    group.add(pivot);
    return pivot;
  }
  const chairA = chair(-1.08, 0);
  const chairB = chair(1.08, Math.PI);

  // Plates, food, cutlery, glasses and a candle.
  const plateMat = std(0xf2eee4, 0.28, 0.05);
  const foodMeat = std(0x7a3a24, 0.72);
  const foodGreen = std(0x3f6b34, 0.82);
  const potato = std(0xd9c58f, 0.86);
  const plates = [];
  const foods = [];
  for (const z of [-0.38, 0.38]) {
    const plate = mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.02, 20), plateMat);
    plate.position.set(0, 0.82, z);
    group.add(plate);
    plates.push(plate);
    const meat = mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.055, 12), foodMeat);
    meat.position.set(-0.03, 0.86, z);
    group.add(meat);
    foods.push(meat);
    const mash = mesh(new THREE.SphereGeometry(0.06, 10, 8), potato);
    mash.position.set(0.06, 0.86, z + 0.045);
    group.add(mash);
    foods.push(mash);
    for (let i = 0; i < 3; i++) {
      const leaf = mesh(new THREE.SphereGeometry(0.028, 6, 5), foodGreen);
      leaf.scale.set(1.4, 0.5, 0.8);
      leaf.position.set(0.05 + i * 0.03, 0.86, z - 0.06);
      group.add(leaf);
      foods.push(leaf);
    }
    const fork = box(0.018, 0.006, 0.19, brass);
    fork.position.set(-0.28, 0.815, z);
    group.add(fork);
    const knife = box(0.018, 0.006, 0.2, brass);
    knife.position.set(0.28, 0.815, z);
    group.add(knife);
    const glassBowl = mesh(
      new THREE.CylinderGeometry(0.055, 0.035, 0.13, 12, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xd8e6ef,
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      })
    );
    glassBowl.position.set(0.38, 0.95, z + 0.2);
    group.add(glassBowl);
    const stem = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), plateMat);
    stem.position.set(0.38, 0.855, z + 0.2);
    group.add(stem);
  }

  const candle = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.24, 12), candleMat);
  candle.position.set(0, 0.9, 0);
  group.add(candle);
  const flameMesh = mesh(new THREE.SphereGeometry(0.028, 8, 6), flame, false, false);
  flameMesh.scale.set(1, 1.7, 1);
  flameMesh.position.set(0, 1.06, 0);
  group.add(flameMesh);
  const candleLight = new THREE.PointLight(0xffb060, 3.2, 5.5, 2);
  candleLight.position.set(0, 1.18, 0);
  group.add(candleLight);

  // Pendant lights.
  const pendants = [];
  for (const z of [-1.4, 1.4]) {
    const cord = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.1, 5), trim);
    cord.position.set(0, 3.0, z);
    group.add(cord);
    const shade = mesh(new THREE.ConeGeometry(0.28, 0.24, 16, 1, true), std(0x2b2622, 0.6, 0.2));
    shade.rotation.x = Math.PI;
    shade.position.set(0, 2.42, z);
    group.add(shade);
    const bulb = mesh(new THREE.SphereGeometry(0.055, 8, 6), basic(0xffd6a0), false, false);
    bulb.position.set(0, 2.34, z);
    group.add(bulb);
    const light = new THREE.PointLight(0xffb870, 4.6, 8, 2);
    light.position.set(0, 2.3, z);
    group.add(light);
    pendants.push(light);
  }

  // Wall sconces.
  for (const x of [-3.6, 3.6]) {
    const sconce = mesh(new THREE.SphereGeometry(0.09, 8, 6), basic(0xffcf8c), false, false);
    sconce.position.set(x, 2.5, -4.05);
    group.add(sconce);
  }
  const fill = new THREE.PointLight(0xffd2a0, 4.2, 13, 2);
  fill.position.set(0, 2.9, 1.7);
  group.add(fill);

  group.visible = false;
  return {
    group,
    origin: new THREE.Vector3(80, 0, -60),
    chairA,
    chairB,
    plates,
    foods,
    candle,
    flameMesh,
    candleLight,
    pendants,
    dinerA,
    dinerB,
    bgFlame,
    bgLight,
    waiter,
    tray,
    seatA: new THREE.Vector3(80, 0, -61.08),
    seatB: new THREE.Vector3(80, 0, -58.92),
    entrance: new THREE.Vector3(80, 0, -56.6),
    chairAPull: 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  Mission director                                                          */
/* -------------------------------------------------------------------------- */

export function createMissionDirector(options) {
  const {
    scene,
    carGroup,
    materials,
    camera,
    controls,
    ambience,
    setDriveSpeed,
    restoreView,
    cancelCameraTween,
    showToast,
    requestRender,
  } = options;

  const sets = {
    house: createHouse(),
    restaurant: createRestaurant(),
    room: createDiningRoom(),
  };
  for (const set of Object.values(sets)) scene.add(set.group);

  const door = createPassengerDoor(materials);
  carGroup.add(door.group);
  const companion = createSeatedCompanion();
  carGroup.add(companion.group);
  const companionLight = new THREE.PointLight(0xffd6ad, 0, 1.5, 2);
  companionLight.position.set(0.22, 1.24, -0.36);
  carGroup.add(companionLight);

  const player = personRig({
    name: "DriverWalking",
    height: 1.78,
    skin: 0xb07a50,
    hair: 0x1c1714,
    top: 0x28323d,
    bottom: 0x22252a,
  });
  const girlfriend = personRig({
    female: true,
    name: "Anaya",
    height: 1.66,
    skin: 0xcf9568,
    hair: 0x2a1a14,
    top: 0x7a2b3a,
    dress: 0x6f2333,
  });
  scene.add(player.root, girlfriend.root);
  player.root.visible = false;
  girlfriend.root.visible = false;

  const ui = {
    hud: document.getElementById("mission-hud"),
    eyebrow: document.getElementById("mission-eyebrow"),
    title: document.getElementById("mission-title"),
    step: document.getElementById("mission-step"),
    dialogue: document.getElementById("mission-dialogue"),
    speaker: document.getElementById("mission-speaker"),
    line: document.getElementById("mission-line"),
    progress: document.getElementById("mission-progress"),
    clock: document.getElementById("mission-clock"),
    duration: document.getElementById("mission-duration"),
    end: document.getElementById("mission-end"),
    dock: document.getElementById("mission-dock"),
  };

  let active = false;
  let kind = null;
  let phases = [];
  let phaseIndex = -1;
  let phaseTime = 0;
  let elapsed = 0;
  let totalReal = 1;
  let totalMinutes = 20;
  let clockStart = 18 * 60 + 30;
  let completionTimer = 0;
  let completed = false;
  let previousSpeed = 35;
  let driverAboard = false;
  let lastSpeed = -1;
  let hudTimer = 0;
  let currentStep = "";
  let timeScale = 1;
  let dialogueTimer = 0;

  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  let camFov = 38;
  let camCut = false;

  function pose(pos, target, fov = 38, cut = false) {
    camPos.copy(pos);
    camTarget.copy(target);
    camFov = fov;
    if (cut) camCut = true;
  }

  function drive(kmh) {
    const value = Math.round(kmh * 10) / 10;
    if (Math.abs(value - lastSpeed) < 0.35) return;
    lastSpeed = value;
    setDriveSpeed(value);
  }

  function hideSets() {
    for (const set of Object.values(sets)) set.group.visible = false;
  }

  function hidePeople() {
    player.root.visible = false;
    girlfriend.root.visible = false;
    companion.group.visible = false;
    companionLight.intensity = 0;
  }

  function setStep(text) {
    if (text === currentStep) return;
    currentStep = text;
    if (ui.step) ui.step.textContent = text;
  }

  /**
   * Show a spoken line in the mission HUD and, when the platform supports it,
   * voice it. Anaya sits slightly higher and quicker than the player so the two
   * voices read as different people even with a single system voice.
   */
  function say(speaker, line, options = {}) {
    if (ui.dialogue) {
      ui.dialogue.hidden = false;
      if (ui.speaker) ui.speaker.textContent = speaker;
      if (ui.line) ui.line.textContent = line;
    }
    dialogueTimer = Math.max(
      2.6,
      Number(options.hold) || line.length * 0.058 + 1.4
    );
    if (options.voice !== false) {
      ambience.speak?.(line, {
        pitch: options.pitch ?? (speaker === "Anaya" ? 1.16 : 0.82),
        rate: options.rate ?? (speaker === "Anaya" ? 0.94 : 0.9),
        volume: options.volume ?? 0.28,
      });
    }
  }

  function clearDialogue() {
    dialogueTimer = 0;
    if (ui.dialogue) ui.dialogue.hidden = true;
  }

  function tickDialogue(dt) {
    if (dialogueTimer <= 0) return;
    dialogueTimer -= dt;
    if (dialogueTimer <= 0 && ui.dialogue) ui.dialogue.hidden = true;
  }

  /**
   * A tiny cue list: each entry runs once when mission-local time passes its
   * mark. `reset` is called from a phase's enter() so replaying the experience
   * starts the cues from the top.
   */
  function makeCues(list) {
    let index = 0;
    return {
      reset() {
        index = 0;
      },
      run(t) {
        while (index < list.length && t >= list[index].at) {
          const cue = list[index++];
          cue.run();
        }
      },
    };
  }

  function formatClock(minutes) {
    const total = Math.floor(minutes) % (24 * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function updateHud(force = false) {
    if (!ui.hud) return;
    if (!force) {
      hudTimer -= 1;
      if (hudTimer > 0) return;
    }
    hudTimer = 8;
    const progress = clamp01(elapsed / totalReal);
    if (ui.progress) ui.progress.style.width = `${progress * 100}%`;
    if (ui.clock) ui.clock.textContent = formatClock(clockStart + progress * totalMinutes);
    if (ui.duration) ui.duration.textContent = `${Math.round(progress * totalMinutes)} / ${totalMinutes} min`;
  }

  function walkTo(rig, from, to, t, dt, amount = 1) {
    const p = clamp01(t);
    rig.place(lerp(from.x, to.x, p), 0, lerp(from.z, to.z, p));
    faceTowards(rig.root, to.x - from.x, to.z - from.z);
    rig.walk(dt, amount);
  }

  function idleAt(rig, x, z, dx, dz, clock) {
    rig.place(x, 0, z);
    faceTowards(rig.root, dx, dz);
    rig.idle(clock);
  }

  function setHouseDoor(dt, open) {
    const house = sets.house;
    house.doorOpen += ((open ? 1 : 0) - house.doorOpen) * (1 - Math.exp(-6 * dt));
    house.doorPivot.rotation.y = house.doorOpen * 1.52;
  }

  function setRestaurantDoor(dt, open) {
    const restaurant = sets.restaurant;
    restaurant.doorOpen += ((open ? 1 : 0) - restaurant.doorOpen) * (1 - Math.exp(-6 * dt));
    restaurant.doorPivot.rotation.y = restaurant.doorOpen * 1.2;
  }

  function animateRoom(dt, clock) {
    const room = sets.room;
    room.chairA.position.z = -1.08 - room.chairAPull * 0.62;
    room.chairB.position.z = 1.08 + (room.chairBPull || 0) * 0.55;
    room.flameMesh.scale.y = 1.6 + Math.sin(clock * 12.5) * 0.16 + Math.sin(clock * 29) * 0.08;
    room.flameMesh.position.x = Math.sin(clock * 8.3) * 0.004;
    room.candleLight.intensity = 3.0 + Math.sin(clock * 9.2) * 0.45 + Math.sin(clock * 23.1) * 0.18;
    for (const pendant of room.pendants) {
      pendant.intensity = 4.4 + Math.sin(clock * 1.7 + pendant.position.z) * 0.2;
    }
    if (room.bgFlame) {
      room.bgFlame.scale.y = 1.5 + Math.sin(clock * 13.7) * 0.2;
      room.bgLight.intensity = 1.45 + Math.sin(clock * 10.1) * 0.25;
    }
    if (room.dinerA) {
      room.dinerA.eat(clock * 0.82 + 1.4, 1);
      room.dinerB.eat(clock * 0.74, -1);
      room.dinerA.head.rotation.y = Math.sin(clock * 0.7) * 0.14;
      room.dinerB.head.rotation.y = Math.sin(clock * 0.62 + 1.1) * 0.12;
    }
    if (room.waiter) {
      const phase = (clock * 0.16) % 2;
      const going = phase < 1;
      const p = going ? phase : 2 - phase;
      room.waiter.place(3.55, 0, lerp(-3.15, 0.25, p));
      room.waiter.face(0, going ? 1 : -1);
      room.waiter.walk(dt, 0.5);
      // The tray arm stays fixed and level while the other arm swings.
      room.waiter.armL.pivot.rotation.z = 0.95;
      room.waiter.armL.pivot.rotation.x = 0.08;
      room.waiter.armL.elbow.rotation.z = -1.45;
      room.waiter.armL.elbow.rotation.x = 0;
      room.waiter.blink(clock);
    }
  }

  /* ------------------------------ Date ---------------------------------- */

  function buildDate() {
    const house = sets.house;
    const restaurant = sets.restaurant;
    const room = sets.room;
    const porch = house.porch;
    const doorThreshold = new THREE.Vector3(
      house.group.position.x,
      0,
      house.group.position.z + 3.13
    );
    const doorStand = new THREE.Vector3(2.55, 0, -2.25);
    const pathEnd = new THREE.Vector3(porch.x, 0, 0.1);
    const curb = new THREE.Vector3(4.2, 0, 0.1);
    const seatStand = new THREE.Vector3(0.55, 0, -1.3);
    const driverStand = new THREE.Vector3(1.45, 0, 1.7);
    const rearCorner = new THREE.Vector3(-2.75, 0, 1.35);
    const meetB = new THREE.Vector3(-2.95, 0, -1.15);
    const meetA = new THREE.Vector3(-2.45, 0, -1.55);
    const restaurantEntrance = restaurant.entrance;
    const roomOrigin = room.origin;
    const dinnerA = new THREE.Vector3(roomOrigin.x, 0, roomOrigin.z - 1.08);
    const dinnerB = new THREE.Vector3(roomOrigin.x, 0, roomOrigin.z + 1.08);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const foley = (kind, options) => ambience.foley?.(kind, options);
    const shot = (pos, target, fov = 38, cut = false) =>
      pose(V(pos[0], pos[1], pos[2]), V(target[0], target[1], target[2]), fov, cut);

    // Per-run shot state. Each phase resets its own flag in enter().
    let pickupCut = -1;
    let driveShot = -1;
    let arriveExited = false;
    let arriveShot = -1;
    let walkDoor = false;
    let walkShot = -1;
    let seatingStep = false;
    let dropoffWide = false;
    let dropoffClose = false;
    let dropoffDoor = false;
    let dinnerShot = -1;

    const pickupCues = makeCues([
      { at: 0.5, run: () => foley("door", { pan: 0.2, level: 0.2 }) },
      { at: 1.1, run: () => say("Anaya", "You're early.") },
      { at: 3.1, run: () => say("Player", "I wanted to see you sooner.") },
      { at: 4.9, run: () => foley("door-close", { pan: 0.25, level: 0.18 }) },
      { at: 5.3, run: () => say("Anaya", "Flatterer. Let's go.") },
    ]);

    const doorCues = makeCues([
      { at: 0.15, run: () => foley("door", { pan: -0.2, level: 0.18 }) },
      {
        at: 0.34,
        run: () =>
          ambience.speak?.("Door open.", {
            pitch: 1.34,
            rate: 1.04,
            volume: 0.26,
          }),
      },
      { at: 1.15, run: () => say("Player", "Your carriage awaits.") },
      { at: 2.55, run: () => say("Anaya", "Such a gentleman.") },
    ]);

    const seatCues = makeCues([
      { at: 0.7, run: () => foley("seatbelt", { pan: -0.2, level: 0.2 }) },
      { at: 1.1, run: () => say("Anaya", "Thank you.") },
      { at: 2.7, run: () => foley("door-close", { pan: -0.25, level: 0.2 }) },
      { at: 3.4, run: () => say("Anaya", "I like this car.") },
      { at: 5.0, run: () => foley("door-close", { pan: 0.25, level: 0.2 }) },
    ]);

    const driveCues = makeCues([
      { at: 1.4, run: () => say("Anaya", "So where are we going?") },
      { at: 4.6, run: () => say("Player", "Somewhere with candles.") },
      { at: 8.0, run: () => say("Anaya", "Lumi\u00e8re? I've heard about it.") },
      { at: 11.6, run: () => say("Player", "Then let's find out.") },
      { at: 14.8, run: () => say("Anaya", "I'm nervous. Good nervous.") },
    ]);

    const arriveCues = makeCues([
      { at: 1.1, run: () => say("Anaya", "Lumi\u00e8re. It's even prettier than I imagined.") },
      { at: 4.2, run: () => say("Player", "Wait until you see inside.") },
      { at: 5.2, run: () => foley("door", { pan: -0.3, level: 0.16 }) },
    ]);

    const walkCues = makeCues([
      { at: 1.2, run: () => say("Anaya", "I hope the wine list is good.") },
      { at: 4.4, run: () => say("Player", "I booked the corner table.") },
      { at: 7.0, run: () => say("Anaya", "You planned this.") },
      { at: 7.6, run: () => foley("doorbell", { pan: -0.4, level: 0.13 }) },
    ]);

    const seatingCues = makeCues([
      { at: 0.6, run: () => say("Player", "Allow me.") },
      { at: 2.6, run: () => say("Anaya", "Such a gentleman.") },
      { at: 4.8, run: () => say("Player", "Only on Tuesdays.") },
    ]);

    const dinnerCues = makeCues([
      { at: 0.7, run: () => say("Anaya", "This is lovely. Thank you for bringing me here.") },
      { at: 4.2, run: () => foley("pour", { pan: -0.15, level: 0.16 }) },
      { at: 5.2, run: () => say("Player", "I wanted tonight to be perfect.") },
      { at: 8.6, run: () => say("Anaya", "It is. Mostly.") },
      { at: 10.6, run: () => say("Player", "Mostly?") },
      { at: 12.1, run: () => foley("glass", { pan: 0.1, level: 0.12 }) },
    ]);

    const homeCues = makeCues([
      { at: 1.2, run: () => say("Anaya", "I had a lovely time.") },
      { at: 4.8, run: () => say("Player", "So did I. The company especially.") },
      { at: 8.6, run: () => say("Anaya", "Smooth.") },
      { at: 12.2, run: () => say("Anaya", "Thank you for tonight.") },
    ]);

    const dropoffCues = makeCues([
      { at: 0.8, run: () => say("Anaya", "Thank you for tonight.") },
      { at: 3.4, run: () => say("Player", "I'll call you tomorrow.") },
      { at: 5.4, run: () => say("Anaya", "You'd better.") },
      { at: 6.6, run: () => foley("door", { pan: 0.2, level: 0.18 }) },
      { at: 8.0, run: () => foley("door-close", { pan: 0.25, level: 0.18 }) },
    ]);

    return [
      {
        id: "pickup",
        label: "Anaya steps out to meet you",
        duration: 7.6,
        enter() {
          hideSets();
          house.group.visible = true;
          house.doorOpen = 0;
          house.doorPivot.rotation.y = 0;
          girlfriend.root.visible = true;
          player.root.visible = true;
          girlfriend.place(porch.x, 0, porch.z + 0.35);
          girlfriend.face(0, 1);
          // He waits by the driver's side so the street camera sees him,
          // then comes around the nose to open her door.
          player.place(2.55, 0, 1.1);
          player.face(1, -0.2);
          door.group.visible = true;
          door.setOpen(0);
          companion.group.visible = false;
          companionLight.intensity = 0;
          driverAboard = false;
          drive(0);
          pickupCues.reset();
          pickupCut = -1;
          shot([4.6, 1.7, 4.6], [7.7, 1.4, -2.8], 34, true);
        },
        update(t, dt, clock) {
          const from = V(porch.x, 0, porch.z + 0.35);
          // She walks the path to the kerb, then along it to the car. The old
          // diagonal cut across the garden and passed through the hedge.
          if (t < 0.38) {
            walkTo(girlfriend, from, pathEnd, t / 0.38, dt, 1);
          } else if (t < 0.7) {
            walkTo(girlfriend, pathEnd, curb, (t - 0.38) / 0.32, dt, 1.05);
          } else {
            walkTo(girlfriend, curb, doorStand, (t - 0.7) / 0.3, dt, 0.9);
          }
          if (t < 0.78) {
            idleAt(player, 2.55, 1.1, 1, -0.2, clock);
          } else {
            // He comes around the nose of the car to open her door as she
            // reaches the kerb, keeping the hand-off seamless into the cut.
            const p = (t - 0.78) / 0.22;
            const a = V(2.55, 0, 1.1);
            const b = V(3.15, 0, 0.15);
            const c = V(1.55, 0, -1.55);
            if (p < 0.45) walkTo(player, a, b, p / 0.45, dt, 1.1);
            else walkTo(player, b, c, (p - 0.45) / 0.55, dt, 1.1);
          }
          setHouseDoor(dt, t < 0.72);
          pickupCues.run(t * 7.6);
          // Two angles so we see her face the whole way: she comes down the
          // path toward the lens, then the camera picks her up from the car
          // side as she reaches the kerb and turns to the passenger door.
          if (t < 0.38) {
            const push = smoothstep(t / 0.38);
            shot(
              [lerp(4.6, 4.9, push), 1.7, lerp(4.6, 4.3, push)],
              [lerp(7.7, 7.6, push), 1.4, lerp(-2.8, -3.0, push)],
              34,
              pickupCut !== 0
            );
            pickupCut = 0;
          } else {
            const push = smoothstep((t - 0.38) / 0.62);
            shot(
              [lerp(-2.6, -2.2, push), 2.0, lerp(5.2, 4.8, push)],
              [lerp(4.2, 3.9, push), 1.3, lerp(-1.4, -1.6, push)],
              38,
              pickupCut !== 1
            );
            pickupCut = 1;
          }
        },
        exit() {
          setHouseDoor(0.016, false);
        },
      },
      {
        id: "door",
        label: "You open her door",
        duration: 3.6,
        enter() {
          door.setOpen(1);
          girlfriend.root.visible = true;
          girlfriend.place(doorStand.x, 0, doorStand.z);
          girlfriend.face(-1, 0.25);
          player.place(1.25, 0, -2.25);
          player.face(1, 0);
          doorCues.reset();
          // From the rear quarter the door swings wide and clears her, so the
          // camera looks straight through the aperture at her face.
          shot([-2.8, 1.7, -3.4], [0.9, 1.15, -1.35], 44, true);
        },
        update(t, dt, clock) {
          if (t < 0.55) walkTo(girlfriend, doorStand, seatStand, t / 0.55, dt, 0.8);
          else {
            girlfriend.place(seatStand.x + 0.1, 0, seatStand.z - 0.1);
            faceTowards(girlfriend.root, 0.6, 0.8);
            girlfriend.idle(clock);
          }
          // He holds the door, turning from her to the opening as she steps in.
          const toHer = t < 0.38;
          idleAt(
            player,
            1.25,
            -2.25,
            toHer ? 1 : -0.8,
            toHer ? 0 : 0.55,
            clock
          );
          player.armR.pivot.rotation.z = 0.72 + Math.sin(clock * 2.2) * 0.04;
          player.armR.pivot.rotation.x = -0.35;
          player.armR.elbow.rotation.z = -0.7;
          doorCues.run(t * 3.6);
          const push = smoothstep(t);
          shot(
            [
              lerp(-2.8, -2.6, push),
              lerp(1.7, 1.68, push),
              lerp(-3.4, -3.3, push),
            ],
            [0.9, 1.15, -1.35],
            44
          );
        },
      },
      {
        id: "seat",
        label: "She settles into the passenger seat",
        duration: 6,
        enter() {
          door.setOpen(1);
          girlfriend.root.visible = true;
          girlfriend.place(seatStand.x + 0.1, 0, seatStand.z - 0.1);
          girlfriend.face(0.6, 0.8);
          player.place(1.45, 0, -1.85);
          companion.group.visible = false;
          seatCues.reset();
          // Stay outside for the whole beat: the passenger door is open, she
          // slips in, and the player walks around the tail to the driver's
          // side. Cutting into the cabin exposes the low-detail seated rig,
          // so the wide departure shot carries the beat instead.
          shot([-6.4, 2.0, -3.0], [0.2, 1.0, -0.5], 40, true);
        },
        update(t, dt, clock) {
          if (t < 0.08) {
            // A short held beat as she turns from the porch to the seat.
            girlfriend.place(
              lerp(seatStand.x + 0.1, seatStand.x, t / 0.08),
              0,
              lerp(seatStand.z - 0.1, seatStand.z, t / 0.08)
            );
            faceTowards(girlfriend.root, 0.4, 0.9);
            girlfriend.idle(clock);
          } else {
            girlfriend.root.visible = false;
            companion.group.visible = true;
            companionLight.intensity = 1.5;
          }
          if (t > 0.14 && t < 0.94) {
            // He crosses behind the car to the driver's side, staying inside
            // the rear-quarter camera's frame the whole way.
            const p = (t - 0.14) / 0.8;
            const a = V(1.45, 0, -1.85);
            const b = V(-2.9, 0, -1.45);
            const c = V(-2.9, 0, 1.0);
            const d = V(1.45, 0, 1.75);
            if (p < 0.36) walkTo(player, a, b, p / 0.36, dt, 1.4);
            else if (p < 0.56) walkTo(player, b, c, (p - 0.36) / 0.2, dt, 1.4);
            else walkTo(player, c, d, (p - 0.56) / 0.44, dt, 1.4);
            player.root.visible = true;
          } else if (t >= 0.94) {
            player.root.visible = false;
            driverAboard = true;
          }
          // She pulls the passenger door shut once she is settled; the
          // driver's door thunks at the end of his walk-around.
          door.setOpen(t < 0.45 ? 1 : 0);
          companion.update(dt, clock);
          companion.rig.head.rotation.y = 0.22 + Math.sin(clock * 0.8) * 0.03;
          seatCues.run(t * 6);
          // Slow push-in on the departure three-quarter. The car body hides
          // her, so this reads as the pair getting away rather than an
          // unconvincing cabin close-up.
          const push = smoothstep(t);
          shot(
            [
              lerp(-6.4, -5.9, push),
              lerp(2.0, 1.95, push),
              lerp(-3.0, -2.7, push),
            ],
            [
              lerp(0.2, 0.3, push),
              lerp(1.0, 1.02, push),
              lerp(-0.5, -0.6, push),
            ],
            lerp(40, 38, push)
          );
        },
      },
      {
        id: "drive",
        label: "Driving to Lumière",
        duration: 18,
        enter() {
          hideSets();
          hidePeople();
          companion.group.visible = true;
          companionLight.intensity = 1.5;
          companion.setMood(1);
          door.setOpen(0);
          driverAboard = true;
          driveShot = -1;
          driveCues.reset();
          shot([-5.8, 1.45, 3.4], [1.2, 0.95, 0.1], 42, true);
        },
        update(t, dt, clock) {
          const speed =
            t < 0.24
              ? 54 * smoothstep(t / 0.24)
              : t > 0.86
                ? lerp(54, 14, smoothstep((t - 0.86) / 0.14))
                : 54;
          drive(speed);
          companion.update(dt, clock);
          if (dialogueTimer > 0) companion.rig.talk(clock, 0.6);
          companion.rig.head.rotation.y = 0.26 + Math.sin(clock * 0.7) * 0.03;
          const sway = Math.sin(clock * 0.8) * 0.045;
          const rise = Math.sin(clock * 0.63) * 0.02;
          if (t < 0.34) {
            shot(
              [-5.8 + sway, 1.45 + rise, 3.4],
              [1.2, 0.95, 0.1],
              42,
              driveShot !== 0
            );
            driveShot = 0;
          } else if (t < 0.68) {
            shot(
              [0.3 + sway, 1.28 + rise, -5.6],
              [0.4, 1.0, 0.2],
              38,
              driveShot !== 1
            );
            driveShot = 1;
          } else {
            // Rear-right three-quarter instead of a hood-level front shot.
            shot(
              [-5.6 + sway, 1.6 + rise, -3.4],
              [1.0, 0.95, 0],
              42,
              driveShot !== 2
            );
            driveShot = 2;
          }
          driveCues.run(t * 18);
        },
      },
      {
        id: "arrive",
        label: "Arriving at Lumière",
        duration: 6,
        enter() {
          hideSets();
          restaurant.group.visible = true;
          restaurant.doorOpen = 0;
          restaurant.doorPivot.rotation.y = 0;
          companion.group.visible = true;
          companionLight.intensity = 1.5;
          driverAboard = true;
          door.setOpen(1);
          drive(0);
          arriveExited = false;
          arriveShot = -1;
          arriveCues.reset();
          shot([-6.8, 2.1, 4.8], [-3.2, 1.35, -2.2], 44, true);
        },
        update(t, dt, clock) {
          drive(0);
          if (t > 0.14 && !arriveExited) {
            arriveExited = true;
            companion.group.visible = false;
            companionLight.intensity = 0;
            girlfriend.root.visible = true;
            player.root.visible = true;
            girlfriend.place(seatStand.x, 0, seatStand.z);
            girlfriend.face(-1, 0.25);
            player.place(driverStand.x, 0, driverStand.z);
            player.face(-1, -0.25);
            driverAboard = false;
            foley("door", { pan: -0.3, level: 0.2 });
          }
          if (arriveExited) {
            const walkP = clamp01((t - 0.14) / 0.42);
            // He comes around the back of the car; she meets him there so the
            // pair can walk into the restaurant together. They are both in
            // place by the time the camera cuts in for the two-shot.
            if (walkP < 0.62) {
              walkTo(player, driverStand, rearCorner, walkP / 0.62, dt, 1.05);
            } else if (walkP < 1) {
              walkTo(player, rearCorner, meetB, (walkP - 0.62) / 0.38, dt, 1.05);
            } else {
              player.place(meetB.x, 0, meetB.z);
              faceTowards(player.root, -1, -0.4);
              player.idle(clock);
            }
            if (walkP < 1) {
              walkTo(girlfriend, seatStand, meetA, walkP, dt, 0.8);
            } else {
              girlfriend.place(meetA.x, 0, meetA.z);
              faceTowards(girlfriend.root, -1, -0.4);
              girlfriend.idle(clock);
            }
            if (walkP >= 1) {
              girlfriend.look(0.24 + Math.sin(clock * 0.9) * 0.05, -0.02);
              player.look(-0.2 + Math.sin(clock * 0.7) * 0.04, -0.02);
              girlfriend.blink(clock);
              player.blink(clock);
            }
          }
          door.setOpen(t < 0.5 ? 1 : 0);
          arriveCues.run(t * 6);
          // Establish the lit facade and the car, then cut to the couple
          // standing at the rear of the car, facing the restaurant.
          if (t < 0.33) {
            const push = smoothstep(t / 0.33);
            shot(
              [lerp(-6.8, -6.6, push), lerp(2.1, 2.06, push), lerp(4.8, 4.6, push)],
              [lerp(-3.2, -3.3, push), 1.35, lerp(-2.2, -2.3, push)],
              44,
              arriveShot !== 0
            );
            arriveShot = 0;
          } else {
            const push = smoothstep((t - 0.33) / 0.67);
            shot(
              [-6.6, 1.7, -2.8],
              [lerp(-2.8, -2.9, push), 1.3, lerp(-1.4, -1.5, push)],
              42,
              arriveShot !== 1
            );
            arriveShot = 1;
          }
        },
      },
      {
        id: "walk-in",
        label: "Walking in together",
        duration: 8.4,
        enter() {
          restaurant.group.visible = true;
          restaurant.doorOpen = 0;
          restaurant.doorPivot.rotation.y = 0;
          girlfriend.root.visible = true;
          player.root.visible = true;
          girlfriend.place(meetA.x, 0, meetA.z);
          girlfriend.face(-1, -0.4);
          player.place(meetB.x, 0, meetB.z);
          player.face(-1, -0.4);
          door.setOpen(0);
          walkDoor = false;
          walkShot = -1;
          walkCues.reset();
          shot([-11.6, 1.8, -2.4], [-7.0, 1.3, -2.7], 40, true);
        },
        update(t, dt, clock) {
          const endA = V(restaurantEntrance.x + 0.35, 0, restaurantEntrance.z - 0.2);
          const endB = V(restaurantEntrance.x - 0.35, 0, restaurantEntrance.z + 0.1);
          const pA = smoothstep(t / 0.9);
          const pB = smoothstep(t / 0.86);
          if (pA < 1) {
            walkTo(girlfriend, meetA, endA, pA, dt, 0.95);
          } else {
            girlfriend.place(endA.x, 0, endA.z);
            faceTowards(girlfriend.root, -0.7, 0.3);
            girlfriend.idle(clock);
          }
          if (pB < 1) {
            walkTo(player, meetB, endB, pB, dt, 1);
          } else {
            player.place(endB.x, 0, endB.z);
            faceTowards(player.root, 0.7, -0.3);
            player.idle(clock);
          }
          // The door stays shut until the cut; opening it here would put the
          // leaf between the camera and Anaya.
          setRestaurantDoor(dt, false);
          if (t > 0.96 && !walkDoor) {
            walkDoor = true;
            foley("door", { pan: -0.35, level: 0.18 });
          }
          walkCues.run(t * 8.4);
          // Meet them head-on as they cross the street, then cut to a wide
          // from the far pavement as they reach the lit door.
          if (t < 0.55) {
            const push = smoothstep(t / 0.55);
            shot(
              [lerp(-11.6, -11.2, push), 1.8, lerp(-2.4, -2.5, push)],
              [lerp(-7.0, -7.6, push), 1.3, lerp(-2.7, -2.9, push)],
              40,
              walkShot !== 0
            );
            walkShot = 0;
          } else {
            const push = smoothstep((t - 0.55) / 0.45);
            shot(
              [lerp(-6.4, -6.8, push), 2.6, lerp(3.8, 3.2, push)],
              [restaurantEntrance.x, 1.55, lerp(-3.7, -3.8, push)],
              38,
              walkShot !== 1
            );
            walkShot = 1;
          }
        },
        exit() {
          hidePeople();
          restaurant.group.visible = false;
          hideSets();
          room.group.visible = true;
          girlfriend.root.visible = true;
          player.root.visible = true;
          girlfriend.place(dinnerA.x, 0, dinnerA.z - 0.72);
          girlfriend.face(0, 1);
          player.place(dinnerB.x, 0, dinnerB.z + 0.65);
          player.face(0, -1);
          girlfriend.sit(0);
          player.sit(0);
          room.chairAPull = 0.7;
          room.chairBPull = 0.7;
          shot(
            [roomOrigin.x + 3.9, 1.95, roomOrigin.z + 2.8],
            [roomOrigin.x, 1.05, roomOrigin.z - 0.15],
            40,
            true
          );
        },
      },
      {
        id: "seating",
        label: "You help her to her seat",
        duration: 6.4,
        enter() {
          hideSets();
          room.group.visible = true;
          girlfriend.root.visible = true;
          player.root.visible = true;
          girlfriend.place(dinnerA.x, 0, dinnerA.z - 0.72);
          girlfriend.face(0, 1);
          player.place(dinnerB.x, 0, dinnerB.z + 0.65);
          player.face(0, -1);
          girlfriend.sit(0);
          player.sit(0);
          room.chairAPull = 0.7;
          room.chairBPull = 0.7;
          seatingStep = false;
          seatingCues.reset();
          shot(
            [roomOrigin.x - 4.8, 1.9, roomOrigin.z + 0.3],
            [roomOrigin.x, 1.05, roomOrigin.z - 0.1],
            40,
            true
          );
        },
        update(t, dt, clock) {
          const pull = 1 - smoothstep((t - 0.25) / 0.35);
          room.chairAPull = 0.7 * pull;
          room.chairBPull = 0.7 * pull;
          const sitT = smoothstep((t - 0.22) / 0.35);
          girlfriend.place(dinnerA.x, 0, lerp(dinnerA.z - 0.72, dinnerA.z, sitT));
          faceTowards(girlfriend.root, 0, 1);
          girlfriend.sit(sitT);
          player.place(dinnerB.x, 0, lerp(dinnerB.z + 0.65, dinnerB.z, sitT));
          faceTowards(player.root, 0, -1);
          player.sit(sitT);
          if (t > 0.18 && t < 0.3 && !seatingStep) {
            seatingStep = true;
            foley("steps", { count: 2, spacing: 0.22, level: 0.1 });
          }
          animateRoom(dt, clock);
          seatingCues.run(t * 6.4);
          const dolly = smoothstep(t);
          shot(
            [
              roomOrigin.x - lerp(4.8, 4.5, dolly),
              1.9,
              roomOrigin.z + lerp(0.3, 0.15, dolly),
            ],
            [roomOrigin.x, 1.05, roomOrigin.z - 0.1],
            40
          );
        },
        exit() {
          room.chairAPull = 0;
          room.chairBPull = 0;
        },
      },
      {
        id: "dinner",
        label: "Dinner for two",
        duration: 13.5,
        enter() {
          hideSets();
          room.group.visible = true;
          girlfriend.root.visible = true;
          player.root.visible = true;
          girlfriend.place(dinnerA.x, 0, dinnerA.z);
          faceTowards(girlfriend.root, 0, 1);
          girlfriend.sit(1);
          player.place(dinnerB.x, 0, dinnerB.z);
          faceTowards(player.root, 0, -1);
          player.sit(1);
          room.chairAPull = 0;
          room.chairBPull = 0;
          dinnerShot = -1;
          dinnerCues.reset();
          shot(
            [roomOrigin.x - 4.9, 1.9, roomOrigin.z + 0.3],
            [roomOrigin.x, 1.15, roomOrigin.z - 0.1],
            38,
            true
          );
        },
        update(t, dt, clock) {
          girlfriend.eat(clock, 1);
          player.eat(clock, -1);
          if (dialogueTimer > 0) {
            girlfriend.talk(clock, 0.85);
            player.talk(clock, 0.45);
          }
          for (const food of room.foods) {
            food.scale.setScalar(1 - t * 0.45);
          }
          animateRoom(dt, clock);
          dinnerCues.run(t * 13.5);
          if (t < 0.38) {
            // A wide profile two-shot from the window side. Shooting from -x
            // keeps the waiter's route behind the couple instead of letting
            // him fill the foreground on his way to the bar.
            const wide = smoothstep(t / 0.38);
            shot(
              [
                roomOrigin.x - lerp(4.9, 4.6, wide),
                1.9,
                roomOrigin.z + lerp(0.3, 0.15, wide),
              ],
              [roomOrigin.x, 1.15, roomOrigin.z - 0.1],
              38,
              dinnerShot !== 0
            );
            dinnerShot = 0;
          } else if (t < 0.72) {
            // 3/4 close-up of Anaya from the window side, with the bar
            // behind her instead of the other diners.
            const close = smoothstep((t - 0.38) / 0.34);
            shot(
              [
                roomOrigin.x - lerp(1.52, 1.46, close),
                lerp(1.32, 1.3, close),
                roomOrigin.z + lerp(0.1, 0.06, close),
              ],
              [roomOrigin.x, 1.16, roomOrigin.z - 1.08],
              36,
              dinnerShot !== 1
            );
            dinnerShot = 1;
          } else {
            // Matching close-up of the player, framed across the flowers.
            const close = smoothstep((t - 0.72) / 0.28);
            shot(
              [
                roomOrigin.x - lerp(1.52, 1.46, close),
                lerp(1.36, 1.34, close),
                roomOrigin.z - lerp(0.3, 0.24, close),
              ],
              [roomOrigin.x, 1.24, roomOrigin.z + 1.08],
              36,
              dinnerShot !== 2
            );
            dinnerShot = 2;
          }
        },
        exit() {
          for (const food of room.foods) food.scale.setScalar(1);
        },
      },
      {
        id: "drive-home",
        label: "Driving her home",
        duration: 16,
        enter() {
          hideSets();
          hidePeople();
          companion.group.visible = true;
          companionLight.intensity = 1.5;
          companion.setMood(1);
          door.setOpen(0);
          driverAboard = true;
          driveShot = -1;
          homeCues.reset();
          shot([3.8, 1.62, 1.3], [0.2, 1.1, 0], 40, true);
        },
        update(t, dt, clock) {
          const speed =
            t < 0.2
              ? 46 * smoothstep(t / 0.2)
              : t > 0.82
                ? lerp(46, 10, smoothstep((t - 0.82) / 0.18))
                : 46;
          drive(speed);
          companion.update(dt, clock);
          if (dialogueTimer > 0) companion.rig.talk(clock, 0.6);
          companion.rig.head.rotation.y = 0.32 + Math.sin(clock * 0.6) * 0.04;
          const sway = Math.sin(clock * 0.74) * 0.04;
          const rise = Math.sin(clock * 0.58) * 0.018;
          if (t < 0.4) {
            shot(
              [-5.6 + sway, 1.6 + rise, 3.4],
              [1.2, 0.95, 0],
              42,
              driveShot !== 0
            );
            driveShot = 0;
          } else if (t < 0.74) {
            shot(
              [0.2 + sway, 1.3 + rise, -5.2],
              [0.4, 1.05, 0.1],
              36,
              driveShot !== 1
            );
            driveShot = 1;
          } else {
            shot(
              [-5.6 + sway, 1.6 + rise, -3.4],
              [1.0, 0.95, 0],
              42,
              driveShot !== 2
            );
            driveShot = 2;
          }
          homeCues.run(t * 16);
        },
      },
      {
        id: "dropoff",
        label: "Walking her to the door",
        duration: 9,
        enter() {
          hideSets();
          house.group.visible = true;
          house.doorOpen = 0;
          house.doorPivot.rotation.y = 0;
          companion.group.visible = false;
          companionLight.intensity = 0;
          driverAboard = false;
          door.setOpen(1);
          girlfriend.root.visible = true;
          player.root.visible = true;
          girlfriend.place(seatStand.x, 0, seatStand.z);
          girlfriend.face(1, -0.3);
          player.place(driverStand.x, 0, driverStand.z);
          player.face(1, -0.2);
          drive(0);
          dropoffWide = false;
          dropoffClose = false;
          dropoffDoor = false;
          dropoffCues.reset();
          shot([4.4, 1.75, -3.2], [1.0, 1.15, -1.0], 44, true);
        },
        update(t, dt, clock) {
          // Anaya steps out and walks with him to the porch. He comes around
          // the nose of the car and joins her on the house side.
          // They follow the pavement to the front path instead of cutting
          // diagonally through the garden hedge.
          if (t < 0.1) {
            walkTo(girlfriend, seatStand, V(2.35, 0, -1.45), t / 0.1, dt, 0.8);
          } else if (t < 0.3) {
            walkTo(
              girlfriend,
              V(2.35, 0, -1.45),
              V(4.2, 0, 0.1),
              (t - 0.1) / 0.2,
              dt,
              1.05
            );
          } else if (t < 0.52) {
            walkTo(
              girlfriend,
              V(4.2, 0, 0.1),
              V(porch.x, 0, 0.1),
              (t - 0.3) / 0.22,
              dt,
              1.05
            );
          } else if (t < 0.7) {
            walkTo(
              girlfriend,
              V(porch.x, 0, 0.1),
              V(porch.x, 0, porch.z),
              (t - 0.52) / 0.18,
              dt,
              0.9
            );
          } else {
            girlfriend.place(porch.x, 0, porch.z);
            faceTowards(girlfriend.root, -1, 0.55);
            girlfriend.wave(clock);
            girlfriend.blink(clock);
          }
          if (t < 0.1) {
            walkTo(player, driverStand, V(2.55, 0, 0.55), t / 0.1, dt, 1.05);
          } else if (t < 0.2) {
            walkTo(
              player,
              V(2.55, 0, 0.55),
              V(3.15, 0, -1.2),
              (t - 0.1) / 0.1,
              dt,
              1.05
            );
          } else if (t < 0.34) {
            walkTo(
              player,
              V(3.15, 0, -1.2),
              V(4.3, 0, 0.1),
              (t - 0.2) / 0.14,
              dt,
              1.05
            );
          } else if (t < 0.5) {
            walkTo(
              player,
              V(4.3, 0, 0.1),
              V(6.5, 0, 0.1),
              (t - 0.34) / 0.16,
              dt,
              1.05
            );
          } else if (t < 0.68) {
            // He waits at the gate while she goes up to the door, keeping the
            // two silhouettes apart in the wide shot.
            idleAt(player, 6.5, 0.1, 1, -0.2, clock);
          } else if (t < 0.82) {
            walkTo(
              player,
              V(6.5, 0, 0.1),
              V(6.6, 0, -3.15),
              (t - 0.68) / 0.14,
              dt,
              0.95
            );
          } else {
            // He ends up beside her on the porch, not behind her, so the
            // street camera sees both of them.
            idleAt(player, 6.6, -3.15, 1, -0.4, clock);
            player.armR.pivot.rotation.z = 0.12 + Math.sin(clock * 1.6) * 0.04;
            player.blink(clock);
          }
          door.setOpen(t < 0.16 ? 1 : 0);
          setHouseDoor(dt, t > 0.64);
          if (t > 0.62 && !dropoffDoor) {
            dropoffDoor = true;
            foley("door", { pan: 0.2, level: 0.18 });
          }
          dropoffCues.run(t * 9);
          if (t < 0.2) {
            // Anaya steps out of the car.
            shot([4.4, 1.75, -3.2], [1.0, 1.15, -1.0], 44, true);
          } else if (t < 0.7) {
            // Wide street shot: the two of them walk the pavement to the path.
            const wide = smoothstep((t - 0.2) / 0.5);
            shot(
              [lerp(1.8, 2.2, wide), 2.1, lerp(5.6, 5.2, wide)],
              [6.9, 1.35, -3.6],
              42,
              !dropoffWide
            );
            dropoffWide = true;
          } else {
            // Closer porch shot for the goodnight wave.
            const push = smoothstep((t - 0.7) / 0.3);
            shot(
              [lerp(4.0, 4.4, push), lerp(1.8, 1.75, push), lerp(2.6, 2.2, push)],
              [lerp(7.0, 7.1, push), 1.4, lerp(-3.6, -3.7, push)],
              40,
              !dropoffClose
            );
            dropoffClose = true;
          }
        },
        exit() {
          player.root.visible = false;
        },
      },
      {
        id: "complete",
        label: "A perfect evening",
        duration: 3.8,
        enter() {
          hideSets();
          hidePeople();
          house.group.visible = true;
          house.doorOpen = 1;
          house.doorPivot.rotation.y = 1.52;
          girlfriend.root.visible = true;
          girlfriend.place(porch.x, 0, porch.z);
          // Face the street so the final wave reads before she turns to the
          // door and steps inside.
          girlfriend.face(-0.6, 1);
          companion.group.visible = false;
          companionLight.intensity = 0;
          door.setOpen(0);
          driverAboard = false;
          drive(0);
          shot([4.9, 1.9, 1.0], [7.7, 1.5, -3.9], 36, true);
          showToast?.("Date complete · 22 minutes together");
        },
        update(t, dt, clock) {
          if (t < 0.34) {
            girlfriend.wave(clock);
          } else if (t < 0.56) {
            walkTo(
              girlfriend,
              porch,
              doorThreshold,
              (t - 0.34) / 0.22,
              dt,
              0.65
            );
          } else {
            girlfriend.root.visible = false;
          }
          setHouseDoor(dt, t < 0.58);
          const push = smoothstep(t);
          shot(
            [lerp(4.9, 5.15, push), lerp(1.9, 1.86, push), lerp(1.0, 0.75, push)],
            [lerp(7.7, 7.8, push), lerp(1.5, 1.47, push), lerp(-3.9, -4.0, push)],
            36
          );
        },
      },
    ];
  }

  const definitions = {
    date: {
      title: "An evening with Anaya",
      eyebrow: "Night City · Date",
      minutes: 22,
      clock: 18 * 60 + 40,
      build: buildDate,
    },
  };

  function nextPhase() {
    if (phaseIndex >= 0 && phases[phaseIndex]?.exit) phases[phaseIndex].exit();
    phaseIndex++;
    if (phaseIndex >= phases.length) {
      complete();
      return;
    }
    phaseTime = 0;
    clearDialogue();
    const phase = phases[phaseIndex];
    phase.enter?.();
    setStep(phase.label || "");
    updateHud(true);
  }

  function complete() {
    if (completed) return;
    completed = true;
    completionTimer = 3.2;
    setStep("Experience complete");
    if (ui.progress) ui.progress.style.width = "100%";
  }

  function applyCamera(dt) {
    if (camCut) {
      camera.position.copy(camPos);
      controls.target.copy(camTarget);
      camera.fov = camFov;
      camera.updateProjectionMatrix();
      camera.lookAt(controls.target);
      camCut = false;
      return;
    }
    const k = 1 - Math.exp(-4.4 * dt);
    camera.position.lerp(camPos, k);
    controls.target.lerp(camTarget, k);
    camera.fov += (camFov - camera.fov) * (1 - Math.exp(-3.4 * dt));
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
  }

  function start(missionKind) {
    if (active) return false;
    const definition = definitions[missionKind];
    if (!definition) return false;
    kind = missionKind;
    active = true;
    completed = false;
    completionTimer = 0;
    phaseIndex = -1;
    phaseTime = 0;
    elapsed = 0;
    lastSpeed = -1;
    previousSpeed = 35;
    totalMinutes = definition.minutes;
    clockStart = definition.clock;
    phases = definition.build();
    totalReal = phases.reduce((sum, phase) => sum + phase.duration, 0);
    hideSets();
    hidePeople();
    door.group.visible = true;
    door.setOpen(0);
    companion.group.visible = false;
    companionLight.intensity = 0;
    driverAboard = false;
    document.body.classList.add("mission-mode");
    if (ui.hud) ui.hud.hidden = false;
    if (ui.eyebrow) ui.eyebrow.textContent = definition.eyebrow;
    if (ui.title) ui.title.textContent = definition.title;
    if (ui.duration) ui.duration.textContent = `0 / ${definition.minutes} min`;
    if (ui.progress) ui.progress.style.width = "0%";
    if (ui.dock) ui.dock.classList.add("is-running");
    controls.enabled = false;
    cancelCameraTween?.();
    drive(0);
    nextPhase();
    updateHud(true);
    requestRender?.();
    return true;
  }

  function finish(completedRun = false, restore = true) {
    if (!active) return;
    active = false;
    if (phaseIndex >= 0 && phases[phaseIndex]?.exit) phases[phaseIndex].exit();
    hideSets();
    hidePeople();
    door.group.visible = false;
    door.setOpen(0);
    companion.group.visible = false;
    companionLight.intensity = 0;
    driverAboard = false;
    document.body.classList.remove("mission-mode");
    clearDialogue();
    if (ui.hud) ui.hud.hidden = true;
    if (ui.dock) ui.dock.classList.remove("is-running");
    controls.enabled = true;
    drive(previousSpeed);
    if (!completedRun) showToast?.("Experience ended");
    if (restore) restoreView?.();
    requestRender?.();
  }

  function stepMission(step, clock, withHud) {
    if (!active) return;
    if (completed) {
      completionTimer -= step;
      if (completionTimer <= 0) finish(true);
      return;
    }
    elapsed += step;
    phaseTime += step;
    const phase = phases[phaseIndex];
    if (!phase) return;
    const t = clamp01(phaseTime / phase.duration);
    phase.update?.(t, step, clock);
    door.update(step);
    tickDialogue(step);
    if (companion.group.visible) companion.update(step, clock);
    if (withHud) updateHud(false);
    if (phaseTime >= phase.duration) nextPhase();
  }

  function update(dt, clock) {
    if (!active) return;
    const step = dt * timeScale;
    if (completed) {
      completionTimer -= step;
      if (completionTimer <= 0) finish(true);
      return;
    }
    stepMission(step, clock, true);
    applyCamera(dt);
    requestRender?.();
  }

  /**
   * QA-only timeline scrub. The headless renderer runs far below 60 fps, so
   * mission time would otherwise crawl. `advance` steps the same director
   * logic with a fixed slice, then snaps the camera and HUD to the new state.
   * Normal play never calls this.
   */
  function advance(seconds) {
    if (!active) return elapsed;
    const total = Math.max(0, Math.min(300, Number(seconds) || 0));
    let clock = performance.now() / 1000;
    const slice = 1 / 30;
    let remaining = total;
    let guard = 0;
    while (remaining > 0.0001 && active && guard < 20000) {
      const step = Math.min(slice, remaining);
      stepMission(step, clock, false);
      clock += step;
      remaining -= step;
      guard += 1;
    }
    if (active) {
      updateHud(true);
      applyCamera(1.5);
    }
    requestRender?.();
    return elapsed;
  }

  function skipTo(id) {
    if (!active) return false;
    const target = phases.findIndex((phase) => phase.id === id);
    if (target < 0) return false;
    let clock = performance.now() / 1000;
    const slice = 1 / 30;
    let guard = 0;
    while (active && phaseIndex < target && guard < 40000) {
      stepMission(slice, clock, false);
      clock += slice;
      guard += 1;
    }
    if (!active) return false;
    if (phaseIndex === target) {
      updateHud(true);
      applyCamera(1.5);
      requestRender?.();
      return true;
    }
    return false;
  }

  ui.end?.addEventListener("click", () => finish(false));

  return {
    start,
    finish,
    update,
    advance,
    skipTo,
    get active() {
      return active;
    },
    get kind() {
      return kind;
    },
    get driverAboard() {
      return driverAboard;
    },
    get sets() {
      return sets;
    },
    get passenger() {
      return companion;
    },
    get door() {
      return door;
    },
    get timeScale() {
      return timeScale;
    },
    set timeScale(value) {
      timeScale = Math.max(0.25, Math.min(12, Number(value) || 1));
    },
  };
}



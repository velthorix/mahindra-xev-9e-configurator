import * as THREE from "three";

/* -------------------------------------------------------------------------- */
/*  Procedural crowd                                                          */
/* -------------------------------------------------------------------------- */
/*
 * GTA-style street life without a single imported asset. Every person is built
 * from shared primitives drawn through InstancedMesh, so a whole crowd costs a
 * few dozen draw calls instead of several hundred. The rig has a tapered torso,
 * hips, a real neck, ears, eyes, nose and mouth, jointed limbs with knees and
 * elbows, shoes with soles, and a collar and belt. Walkers get an opposed
 * stride, workers reach over their counters, and umbrellas only open in rain.
 */

const TAU = Math.PI * 2;

const SKIN = [
  0x6f452e, 0x8c5a3c, 0xb47a55, 0xd29b72, 0xe4b991, 0x9a6647, 0x5d3826,
  0xc08a62,
];
const HAIR = [0x121010, 0x241a12, 0x3a2718, 0x543a22, 0x6d5233, 0x8b7654, 0x0c0c0d];
const JACKETS = [
  0x26313c, 0x3f3a31, 0x5a2c2c, 0x2d4034, 0x35353f, 0x655538, 0x1f2a33,
  0x5b5a54, 0x382c3d, 0x1d2729, 0x6c3f2c, 0x2b3d4d, 0x4b2f3f, 0x2f3b2f,
  0x7d6a52, 0x3c4a58, 0x4a3a2c, 0x5e6157, 0x72513f, 0x465b64,
];
const SHIRTS = [
  0xd9d2c4, 0x9aa6b0, 0x6b7a86, 0xb6a68c, 0x8f4a3f, 0x3f5a4a, 0x2f3f55,
  0xc4b9a6, 0x7a6d5a,
];
const TROUSERS = [
  0x1b2027, 0x292b30, 0x383329, 0x1e2420, 0x2f353c, 0x474135, 0x23262c,
  0x3d3a44, 0x3a4a5a, 0x4a4034,
];
const SHOES = [0x0e0f10, 0x211b16, 0x2c2925, 0x3a3732, 0x4b4036];
const UMBRELLAS = [0x16191b, 0x22303a, 0x3a1e23, 0x2a372b, 0x393341, 0x595043, 0x1d2a3c];
const BAGS = [0x171a1c, 0x3a2a20, 0x2b3038, 0x4a3b2a, 0x5a4632];
const HATS = [
  0x8c2f2a, 0x2f4a5e, 0xd9c9a8, 0x3a4034, 0x5a4632, 0x6b2f3a, 0x1f2a33,
  0xb08a52, 0x4a3a4a,
];
const SCARVES = [
  0xa33a32, 0x2f4a5e, 0xc9b08a, 0x3a5a3f, 0x6b3a4a, 0x8a6a3a, 0x4a4a52,
  0xb0703a,
];
const GLOVES = [0x1b1b1b, 0x2b2119, 0x3a2a20, 0x4a3a2a, 0x23262b];

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length) % list.length];
}

/* ------------------------------- geometry -------------------------------- */

const headGeo = new THREE.SphereGeometry(0.104, 16, 12);
headGeo.scale(0.92, 1.06, 0.98);

// Hair only covers the crown and back, leaving the forehead and face open.
const hairGeo = new THREE.SphereGeometry(0.109, 14, 10, 0, TAU, 0, Math.PI * 0.4);
hairGeo.scale(0.96, 1.04, 1.0);
hairGeo.translate(0, 0.012, -0.006);

const backHairGeo = new THREE.SphereGeometry(0.1, 12, 8, 0, TAU, 0, Math.PI * 0.55);
backHairGeo.scale(0.9, 1.0, 0.7);
backHairGeo.translate(0, -0.02, -0.05);

const longHairGeo = new THREE.CapsuleGeometry(0.07, 0.26, 4, 8);
longHairGeo.scale(0.95, 1, 0.6);
longHairGeo.translate(0, -0.14, -0.055);

const neckGeo = new THREE.CylinderGeometry(0.043, 0.052, 0.12, 10);
neckGeo.translate(0, -0.06, 0);

// A lathe gives the torso a waist, a chest and sloped shoulders instead of the
// capsule silhouette that made everyone look like a bowling pin.
const torsoGeo = new THREE.LatheGeometry(
  [
    new THREE.Vector2(0.112, -0.3),
    new THREE.Vector2(0.132, -0.22),
    new THREE.Vector2(0.146, -0.08),
    new THREE.Vector2(0.168, 0.08),
    new THREE.Vector2(0.186, 0.19),
    new THREE.Vector2(0.19, 0.24),
    new THREE.Vector2(0.168, 0.28),
    new THREE.Vector2(0.12, 0.3),
    new THREE.Vector2(0.075, 0.305),
  ],
  16
);
torsoGeo.scale(1, 1, 0.64);

const pelvisGeo = new THREE.SphereGeometry(0.145, 12, 8);
pelvisGeo.scale(1.02, 0.64, 0.68);

const collarGeo = new THREE.TorusGeometry(0.076, 0.016, 6, 16);
collarGeo.rotateX(Math.PI / 2);
collarGeo.scale(1, 1, 0.8);

const beltGeo = new THREE.TorusGeometry(0.148, 0.017, 6, 18);
beltGeo.rotateX(Math.PI / 2);
beltGeo.scale(1, 1, 0.64);

const buckleGeo = new THREE.BoxGeometry(0.045, 0.036, 0.012);

const upperArmGeo = new THREE.CapsuleGeometry(0.052, 0.19, 5, 10);
upperArmGeo.translate(0, -0.147, 0);

const forearmGeo = new THREE.CapsuleGeometry(0.042, 0.17, 5, 10);
forearmGeo.translate(0, -0.127, 0);

const shoulderGeo = new THREE.SphereGeometry(0.055, 10, 8);
const elbowGeo = new THREE.SphereGeometry(0.044, 8, 6);
const handGeo = new THREE.SphereGeometry(0.042, 10, 8);
handGeo.scale(0.8, 1.12, 0.9);
const thumbGeo = new THREE.SphereGeometry(0.015, 7, 5);
thumbGeo.scale(0.6, 1.1, 0.7);

const thighGeo = new THREE.CapsuleGeometry(0.085, 0.25, 5, 10);
thighGeo.translate(0, -0.21, 0);
const shinGeo = new THREE.CapsuleGeometry(0.062, 0.3, 5, 10);
shinGeo.translate(0, -0.212, 0);
const kneeGeo = new THREE.SphereGeometry(0.068, 9, 7);
const footGeo = new THREE.BoxGeometry(0.1, 0.068, 0.255);
footGeo.translate(0, -0.02, 0.075);
const soleGeo = new THREE.BoxGeometry(0.106, 0.018, 0.26);
soleGeo.translate(0, -0.052, 0.075);

const hemGeo = new THREE.CylinderGeometry(0.152, 0.158, 0.04, 18, 1, true);
hemGeo.scale(1, 1, 0.64);
const pocketGeo = new THREE.BoxGeometry(0.055, 0.04, 0.006);
const cuffGeo = new THREE.CylinderGeometry(0.046, 0.046, 0.03, 10, 1, true);
const shirtVGeo = new THREE.BoxGeometry(0.009, 0.055, 0.006);

const bagGeo = new THREE.BoxGeometry(0.17, 0.24, 0.1);
const strapGeo = new THREE.BoxGeometry(0.026, 0.8, 0.008);

// Winter kit: a knitted beanie with a rolled brim and pom, a chunky scarf and
// a longer coat skirt over the hips. The base rig is unchanged, so the same
// walk cycle carries the extra clothing.
const beanieGeo = new THREE.SphereGeometry(
  0.119,
  14,
  9,
  0,
  TAU,
  0,
  Math.PI * 0.56
);
beanieGeo.scale(0.98, 1.18, 1.0);
beanieGeo.translate(0, 0.012, 0);
const beanieBrimGeo = new THREE.CylinderGeometry(0.124, 0.126, 0.036, 14, 1, true);
const pomGeo = new THREE.SphereGeometry(0.029, 7, 5);
const scarfGeo = new THREE.TorusGeometry(0.087, 0.031, 6, 16);
scarfGeo.rotateX(Math.PI / 2);
scarfGeo.scale(1, 1, 0.82);
const scarfTailGeo = new THREE.BoxGeometry(0.078, 0.34, 0.03);
scarfTailGeo.translate(0, -0.17, 0);
const coatSkirtGeo = new THREE.CylinderGeometry(0.16, 0.212, 0.42, 16, 1, true);
coatSkirtGeo.scale(1, 1, 0.76);
coatSkirtGeo.translate(0, -0.21, 0);

const eyeGeo = new THREE.SphereGeometry(0.0105, 8, 6);
eyeGeo.scale(1, 0.85, 0.5);
const pupilGeo = new THREE.SphereGeometry(0.0052, 6, 5);
const browGeo = new THREE.BoxGeometry(0.032, 0.006, 0.008);
const noseGeo = new THREE.SphereGeometry(0.016, 8, 6);
noseGeo.scale(0.7, 0.95, 1.05);
const mouthGeo = new THREE.BoxGeometry(0.036, 0.006, 0.007);
const earGeo = new THREE.SphereGeometry(0.019, 8, 6);
earGeo.scale(0.55, 1.0, 0.8);

const canopyGeo = new THREE.ConeGeometry(0.46, 0.2, 10);
canopyGeo.translate(0, 0.1, 0);
const shaftGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.96, 5);
shaftGeo.translate(0, 0.48, 0);

/* ------------------------------- materials ------------------------------- */

const clothMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.9,
  metalness: 0.0,
  envMapIntensity: 0.42,
});
const skinMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.72,
  metalness: 0.0,
  envMapIntensity: 0.34,
});
const hairMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.68,
  metalness: 0.02,
  envMapIntensity: 0.3,
});
const shoeMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.56,
  metalness: 0.06,
  envMapIntensity: 0.4,
});
const bagMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.82,
  metalness: 0.02,
  envMapIntensity: 0.3,
});
const canopyMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.58,
  metalness: 0.04,
  envMapIntensity: 0.5,
  side: THREE.DoubleSide,
});
const eyeMat = new THREE.MeshStandardMaterial({
  color: 0xe8e1d4,
  roughness: 0.32,
  metalness: 0.0,
  envMapIntensity: 0.6,
});
const pupilMat = new THREE.MeshStandardMaterial({
  color: 0x14100e,
  roughness: 0.4,
  metalness: 0.0,
});
const lipMat = new THREE.MeshStandardMaterial({
  color: 0x6a3f33,
  roughness: 0.7,
  metalness: 0.0,
});
const buckleMat = new THREE.MeshStandardMaterial({
  color: 0x9a9d9a,
  roughness: 0.35,
  metalness: 0.8,
  envMapIntensity: 0.8,
});
const soleMat = new THREE.MeshStandardMaterial({
  color: 0x141516,
  roughness: 0.9,
  metalness: 0.0,
});

/* -------------------------------- helpers -------------------------------- */

const tmpBase = new THREE.Matrix4();
const tmpLocal = new THREE.Matrix4();
const tmpPart = new THREE.Matrix4();
const tmpHead = new THREE.Matrix4();
const tmpTorso = new THREE.Matrix4();
const tmpUpper = new THREE.Matrix4();
const tmpFore = new THREE.Matrix4();
const tmpThigh = new THREE.Matrix4();
const tmpShin = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

function partMatrix(base, x, y, z, rotX = 0, rotZ = 0) {
  tmpE.set(rotX, 0, rotZ);
  tmpQ.setFromEuler(tmpE);
  tmpLocal.compose(tmpV.set(x, y, z), tmpQ, ONE);
  return tmpPart.multiplyMatrices(base, tmpLocal);
}

function childMatrix(parent, x, y, z, rotX = 0, rotZ = 0) {
  tmpE.set(rotX, 0, rotZ);
  tmpQ.setFromEuler(tmpE);
  tmpLocal.compose(tmpV.set(x, y, z), tmpQ, ONE);
  return tmpPart.multiplyMatrices(parent, tmpLocal);
}

function hideMatrix(base) {
  tmpS.set(0, 0, 0);
  tmpLocal.compose(tmpV.set(0, 0, 0), tmpQ.identity(), tmpS);
  return tmpPart.multiplyMatrices(base, tmpLocal);
}

function makeInstanced(geometry, material, count, name, castShadow) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = castShadow;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

/* --------------------------------- crowd --------------------------------- */

/**
 * Build a crowd of procedural pedestrians.
 *
 * actors: [{
 *   x, z, y?, dir?, walk?, kind?: "walk"|"idle"|"shop"|"work",
 *   scale?, yaw?, umbrella?, bag?, winter?, colors?: { skin, hair, jacket,
 *   trousers, shoes, umbrella, bag, shirt, hat, scarf, glove }
 * }]
 *
 * `update(dt, scrollSpeed)` scrolls the crowd with the stage and animates the
 * stride. `setRain(value)` opens the umbrellas and makes walkers hurry.
 */
export function createCrowd({
  actors = [],
  wrapMin = -190,
  wrapSpan = 360,
  seed = 90210,
  castShadow = false,
  winter = false,
} = {}) {
  const rand = seeded(seed);
  const group = new THREE.Group();
  group.name = "Crowd";

  const count = actors.length;
  if (!count) return { group, update() {}, setRain() {}, actors };

  const head = makeInstanced(headGeo, skinMat, count, "CrowdHeads", castShadow);
  const hair = makeInstanced(hairGeo, hairMat, count, "CrowdHair", castShadow);
  const backHair = makeInstanced(backHairGeo, hairMat, count, "CrowdBackHair", castShadow);
  const longHair = makeInstanced(longHairGeo, hairMat, count, "CrowdLongHair", castShadow);
  const neck = makeInstanced(neckGeo, skinMat, count, "CrowdNecks", castShadow);
  const torso = makeInstanced(torsoGeo, clothMat, count, "CrowdTorsos", castShadow);
  const pelvis = makeInstanced(pelvisGeo, clothMat, count, "CrowdPelvis", castShadow);
  const collar = makeInstanced(collarGeo, clothMat, count, "CrowdCollars", castShadow);
  const belt = makeInstanced(beltGeo, clothMat, count, "CrowdBelt", castShadow);
  const buckle = makeInstanced(buckleGeo, buckleMat, count, "CrowdBuckle", false);
  const hem = makeInstanced(hemGeo, clothMat, count, "CrowdJacketHem", false);
  const pockets = makeInstanced(pocketGeo, clothMat, count * 2, "CrowdPockets", false);
  const cuffs = makeInstanced(cuffGeo, clothMat, count * 2, "CrowdCuffs", false);
  const shirtV = makeInstanced(shirtVGeo, clothMat, count * 2, "CrowdShirtV", false);

  const eyeL = makeInstanced(eyeGeo, eyeMat, count, "CrowdEyeL", castShadow);
  const eyeR = makeInstanced(eyeGeo, eyeMat, count, "CrowdEyeR", castShadow);
  const pupilL = makeInstanced(pupilGeo, pupilMat, count, "CrowdPupilL", false);
  const pupilR = makeInstanced(pupilGeo, pupilMat, count, "CrowdPupilR", false);
  const browL = makeInstanced(browGeo, hairMat, count, "CrowdBrowL", false);
  const browR = makeInstanced(browGeo, hairMat, count, "CrowdBrowR", false);
  const nose = makeInstanced(noseGeo, skinMat, count, "CrowdNoses", false);
  const mouth = makeInstanced(mouthGeo, lipMat, count, "CrowdMouths", false);
  const earL = makeInstanced(earGeo, skinMat, count, "CrowdEarL", false);
  const earR = makeInstanced(earGeo, skinMat, count, "CrowdEarR", false);

  const shoulders = makeInstanced(shoulderGeo, clothMat, count * 2, "CrowdShoulders", castShadow);
  const upperArms = makeInstanced(upperArmGeo, clothMat, count * 2, "CrowdUpperArms", castShadow);
  const elbows = makeInstanced(elbowGeo, clothMat, count * 2, "CrowdElbows", castShadow);
  const forearms = makeInstanced(forearmGeo, clothMat, count * 2, "CrowdForearms", castShadow);
  const hands = makeInstanced(handGeo, skinMat, count * 2, "CrowdHands", castShadow);
  const thumbs = makeInstanced(thumbGeo, skinMat, count * 2, "CrowdThumbs", false);

  const thighs = makeInstanced(thighGeo, clothMat, count * 2, "CrowdThighs", castShadow);
  const knees = makeInstanced(kneeGeo, clothMat, count * 2, "CrowdKnees", castShadow);
  const shins = makeInstanced(shinGeo, clothMat, count * 2, "CrowdShins", castShadow);
  const feet = makeInstanced(footGeo, shoeMat, count * 2, "CrowdFeet", castShadow);
  const soles = makeInstanced(soleGeo, soleMat, count * 2, "CrowdSoles", false);

  const bags = makeInstanced(bagGeo, bagMat, count, "CrowdBags", castShadow);
  const straps = makeInstanced(strapGeo, bagMat, count, "CrowdStraps", castShadow);
  const beanies = makeInstanced(beanieGeo, clothMat, count, "CrowdBeanies", castShadow);
  const beanieBrims = makeInstanced(
    beanieBrimGeo,
    clothMat,
    count,
    "CrowdBeanieBrims",
    false
  );
  const poms = makeInstanced(pomGeo, clothMat, count, "CrowdPoms", false);
  const scarves = makeInstanced(scarfGeo, clothMat, count, "CrowdScarves", castShadow);
  const scarfTails = makeInstanced(
    scarfTailGeo,
    clothMat,
    count,
    "CrowdScarfTails",
    false
  );
  const coatSkirts = makeInstanced(
    coatSkirtGeo,
    clothMat,
    count,
    "CrowdCoatSkirts",
    false
  );
  const canopies = makeInstanced(canopyGeo, canopyMat, count, "CrowdUmbrellas", castShadow);
  const shafts = makeInstanced(shaftGeo, bagMat, count, "CrowdUmbrellaShafts", castShadow);

  const umbrellaLayer = new THREE.Group();
  umbrellaLayer.name = "CrowdUmbrellaLayer";
  umbrellaLayer.add(canopies, shafts);
  umbrellaLayer.visible = false;

  group.add(
    head, hair, backHair, longHair, neck, torso, pelvis, collar, belt, buckle,
    hem, pockets, cuffs, shirtV,
    eyeL, eyeR, pupilL, pupilR, browL, browR, nose, mouth, earL, earR,
    shoulders, upperArms, elbows, forearms, hands, thumbs,
    thighs, knees, shins, feet, soles,
    bags, straps, beanies, beanieBrims, poms, scarves, scarfTails, coatSkirts,
    umbrellaLayer
  );

  // Deterministic appearance so the street looks the same every reload.
  actors.forEach((actor, i) => {
    const colors = actor.colors ?? {};
    const skin = colors.skin ?? pick(rand, SKIN);
    const jacket = colors.jacket ?? pick(rand, JACKETS);
    const shirt = colors.shirt ?? pick(rand, SHIRTS);
    const trousers = colors.trousers ?? pick(rand, TROUSERS);
    const shoes = colors.shoes ?? pick(rand, SHOES);
    const hairColor = colors.hair ?? pick(rand, HAIR);
    const umbrellaColor = colors.umbrella ?? pick(rand, UMBRELLAS);
    const bagColor = colors.bag ?? pick(rand, BAGS);
    const isWinter = actor.winter ?? winter;
    const hatColor = colors.hat ?? pick(rand, HATS);
    const scarfColor = colors.scarf ?? pick(rand, SCARVES);
    const gloveColor = colors.glove ?? pick(rand, GLOVES);
    const shortSleeves = !isWinter && rand() > 0.62;
    const hasBag = actor.bag ?? rand() > 0.7;
    const hasUmbrella = actor.umbrella ?? (isWinter ? false : rand() > 0.16);
    const hasLongHair = actor.longHair ?? rand() > 0.66;

    actor.kind = actor.kind ?? "walk";
    actor.dir = actor.kind === "walk" ? actor.dir ?? (rand() > 0.5 ? 1 : -1) : 0;
    actor.walk = actor.kind === "walk" ? actor.walk ?? 0.72 + rand() * 0.55 : 0;
    actor.scale = actor.scale ?? 0.93 + rand() * 0.12;
    actor.width = actor.width ?? 0.94 + rand() * 0.1;
    // A winter coat adds bulk, but not so much that the silhouette changes.
    if (isWinter) actor.width *= 1.05;
    actor.y = actor.y ?? 0;
    actor.phase = rand() * TAU;
    actor.sway = rand() * TAU;
    actor.hasBag = hasBag;
    actor.hasUmbrella = hasUmbrella;
    actor.hasLongHair = hasLongHair;
    actor.shortSleeves = shortSleeves;
    actor.winter = isWinter;
    actor.hatColor = hatColor;
    actor.scarfColor = scarfColor;
    actor.gloveColor = gloveColor;
    actor.skin = skin;
    actor.jacket = jacket;
    actor.shirt = shirt;

    if (actor.yaw === undefined) {
      if (actor.kind === "walk") actor.yaw = actor.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      else actor.yaw = actor.z > 0 ? Math.PI : 0;
    }

    head.setColorAt(i, new THREE.Color(skin));
    hair.setColorAt(i, new THREE.Color(hairColor));
    backHair.setColorAt(i, new THREE.Color(hairColor));
    longHair.setColorAt(i, new THREE.Color(hairColor));
    neck.setColorAt(i, new THREE.Color(skin));
    torso.setColorAt(i, new THREE.Color(jacket));
    pelvis.setColorAt(i, new THREE.Color(trousers));
    collar.setColorAt(i, new THREE.Color(shirt));
    belt.setColorAt(i, new THREE.Color(0x2a211b));
    hem.setColorAt(i, new THREE.Color(jacket));
    const darkJacket = new THREE.Color(jacket).multiplyScalar(0.52);
    pockets.setColorAt(i * 2, darkJacket);
    pockets.setColorAt(i * 2 + 1, darkJacket);
    shirtV.setColorAt(i * 2, new THREE.Color(shirt));
    shirtV.setColorAt(i * 2 + 1, new THREE.Color(shirt));

    browL.setColorAt(i, new THREE.Color(hairColor));
    browR.setColorAt(i, new THREE.Color(hairColor));
    nose.setColorAt(i, new THREE.Color(skin));
    earL.setColorAt(i, new THREE.Color(skin));
    earR.setColorAt(i, new THREE.Color(skin));

    for (const s of [0, 1]) {
      const index = i * 2 + s;
      shoulders.setColorAt(index, new THREE.Color(jacket));
      upperArms.setColorAt(index, new THREE.Color(jacket));
      elbows.setColorAt(index, new THREE.Color(jacket));
      forearms.setColorAt(index, new THREE.Color(shortSleeves ? skin : jacket));
      hands.setColorAt(index, new THREE.Color(isWinter ? gloveColor : skin));
      thumbs.setColorAt(index, new THREE.Color(isWinter ? gloveColor : skin));
      cuffs.setColorAt(index, new THREE.Color(shortSleeves ? skin : jacket));
      // The coat skirt is a rigid cone, so a striding thigh can push through
      // its back panel. Tinting the hidden thigh with the coat colour makes
      // any poke-through read as a fold of fabric rather than dark trousers.
      thighs.setColorAt(index, new THREE.Color(isWinter ? jacket : trousers));
      knees.setColorAt(index, new THREE.Color(trousers));
      shins.setColorAt(index, new THREE.Color(trousers));
      feet.setColorAt(index, new THREE.Color(isWinter ? 0x2a211a : shoes));
    }
    bags.setColorAt(i, new THREE.Color(bagColor));
    straps.setColorAt(i, new THREE.Color(bagColor));
    canopies.setColorAt(i, new THREE.Color(umbrellaColor));
    shafts.setColorAt(i, new THREE.Color(0x2b2b29));
    beanies.setColorAt(i, new THREE.Color(hatColor));
    beanieBrims.setColorAt(
      i,
      new THREE.Color(hatColor).multiplyScalar(0.78)
    );
    poms.setColorAt(i, new THREE.Color(0xe6ddca));
    scarves.setColorAt(i, new THREE.Color(scarfColor));
    scarfTails.setColorAt(i, new THREE.Color(scarfColor));
    coatSkirts.setColorAt(
      i,
      new THREE.Color(jacket).multiplyScalar(0.94)
    );
  });

  for (const mesh of [
    head, hair, backHair, longHair, neck, torso, pelvis, collar, belt,
    hem, pockets, cuffs, shirtV,
    browL, browR, nose, earL, earR,
    shoulders, upperArms, elbows, forearms, hands, thumbs,
    thighs, knees, shins, feet, bags, straps, canopies, shafts,
    beanies, beanieBrims, poms, scarves, scarfTails, coatSkirts,
  ]) {
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  let raining = false;
  let time = 0;

  function writeActor(actor, i) {
    const scale = actor.scale;
    const walk = actor.kind === "walk";
    const work = actor.kind === "work";
    const stride = walk ? Math.sin(actor.phase) : 0;
    const breathe = Math.sin(actor.phase * 0.9) * 0.004;
    const bob = walk
      ? Math.abs(Math.sin(actor.phase)) * 0.014
      : work
        ? Math.sin(actor.phase * 1.7) * 0.003
        : breathe;

    tmpE.set(0, actor.yaw, 0);
    tmpQ.setFromEuler(tmpE);
    tmpV.set(actor.x, actor.y + bob, actor.z);
    tmpS.set(scale * actor.width, scale, scale * actor.width);
    tmpBase.compose(tmpV, tmpQ, tmpS);

    const lean = work ? 0.16 : walk ? 0.03 : 0;
    const headNod = walk ? stride * 0.045 : work ? 0.14 : 0;
    // The upper body pivots at the waist, so the head has to travel forward
    // with the lean instead of floating above the hips.
    const headZ = 0.008 + Math.sin(lean) * 0.49;
    const neckZ = 0.008 + Math.sin(lean) * 0.36;

    const torsoMatrix = partMatrix(
      tmpBase,
      0,
      1.1,
      0,
      lean,
      walk ? stride * 0.012 : Math.sin(actor.phase * 0.7) * 0.008
    );
    torso.setMatrixAt(i, torsoMatrix);
    tmpTorso.copy(torsoMatrix);
    pelvis.setMatrixAt(i, partMatrix(tmpBase, 0, 0.89, 0));
    belt.setMatrixAt(i, partMatrix(tmpBase, 0, 0.94, 0));
    buckle.setMatrixAt(i, partMatrix(tmpBase, 0, 0.94, 0.105));

    // Jacket hem, hip pockets and an open shirt V. They are children of the
    // torso so they lean with the body instead of hovering in front of it.
    hem.setMatrixAt(i, childMatrix(tmpTorso, 0, -0.15, 0));
    pockets.setMatrixAt(i * 2, childMatrix(tmpTorso, 0.075, -0.06, 0.082));
    pockets.setMatrixAt(i * 2 + 1, childMatrix(tmpTorso, -0.075, -0.06, 0.082));
    shirtV.setMatrixAt(i * 2, childMatrix(tmpTorso, 0.014, 0.245, 0.126, 0, -0.26));
    shirtV.setMatrixAt(i * 2 + 1, childMatrix(tmpTorso, -0.014, 0.245, 0.126, 0, 0.26));
    collar.setMatrixAt(i, partMatrix(tmpBase, 0, 1.405, neckZ * 0.6, lean * 0.5));
    neck.setMatrixAt(i, partMatrix(tmpBase, 0, 1.5, neckZ, lean * 0.5));

    // Head and every facial feature share one matrix so the face stays glued
    // together as the head nods.
    tmpHead.copy(partMatrix(tmpBase, 0, 1.59, headZ, headNod));
    head.setMatrixAt(i, tmpHead);
    hair.setMatrixAt(i, childMatrix(tmpHead, 0, 0.012, -0.006));
    backHair.setMatrixAt(i, childMatrix(tmpHead, 0, -0.02, -0.05));
    if (actor.hasLongHair) {
      longHair.setMatrixAt(i, childMatrix(tmpHead, 0, -0.07, -0.055, headNod * 0.4));
    } else {
      longHair.setMatrixAt(i, hideMatrix(tmpBase));
    }

    if (actor.winter) {
      beanies.setMatrixAt(i, childMatrix(tmpHead, 0, 0.0, -0.004));
      beanieBrims.setMatrixAt(i, childMatrix(tmpHead, 0, 0.004, -0.004));
      poms.setMatrixAt(i, childMatrix(tmpHead, 0, 0.155, -0.004));
      scarves.setMatrixAt(
        i,
        partMatrix(tmpBase, 0, 1.452, neckZ * 0.9, lean * 0.5)
      );
      scarfTails.setMatrixAt(
        i,
        childMatrix(tmpTorso, 0.045, 0.32, 0.132, 0.04)
      );
      coatSkirts.setMatrixAt(i, childMatrix(tmpTorso, 0, -0.17, 0));
    } else {
      beanies.setMatrixAt(i, hideMatrix(tmpBase));
      beanieBrims.setMatrixAt(i, hideMatrix(tmpBase));
      poms.setMatrixAt(i, hideMatrix(tmpBase));
      scarves.setMatrixAt(i, hideMatrix(tmpBase));
      scarfTails.setMatrixAt(i, hideMatrix(tmpBase));
      coatSkirts.setMatrixAt(i, hideMatrix(tmpBase));
    }

    // The head sphere's front surface sits at local z 0.102. Features have to
    // clear that surface or they disappear inside the skull at close range.
    eyeL.setMatrixAt(i, childMatrix(tmpHead, 0.033, 0.017, 0.100));
    eyeR.setMatrixAt(i, childMatrix(tmpHead, -0.033, 0.017, 0.100));
    pupilL.setMatrixAt(i, childMatrix(tmpHead, 0.033, 0.017, 0.1065));
    pupilR.setMatrixAt(i, childMatrix(tmpHead, -0.033, 0.017, 0.1065));
    browL.setMatrixAt(i, childMatrix(tmpHead, 0.033, 0.032, 0.103, -0.06));
    browR.setMatrixAt(i, childMatrix(tmpHead, -0.033, 0.032, 0.103, -0.06));
    nose.setMatrixAt(i, childMatrix(tmpHead, 0, -0.006, 0.107));
    mouth.setMatrixAt(i, childMatrix(tmpHead, 0, -0.055, 0.104));
    earL.setMatrixAt(i, childMatrix(tmpHead, 0.096, 0, 0));
    earR.setMatrixAt(i, childMatrix(tmpHead, -0.096, 0, 0));

    // Arms. Walkers oppose the legs; workers reach forward over a counter.
    const armL = walk
      ? -stride * 0.38
      : work
        ? -1.05 + Math.sin(actor.phase) * 0.08
        : Math.sin(actor.phase * 0.8) * 0.018;
    const armR = walk
      ? stride * 0.38
      : work
        ? -1.05 + Math.sin(actor.phase + Math.PI) * 0.08
        : Math.sin(actor.phase * 0.8 + Math.PI) * 0.018;
    const elbowL = work
      ? -0.6 + Math.sin(actor.phase) * 0.12
      : -0.2 - Math.max(0, -armL) * 0.9;
    const elbowR = work
      ? -0.6 + Math.sin(actor.phase + Math.PI) * 0.12
      : -0.2 - Math.max(0, -armR) * 0.9;

    const shoulderZ = Math.sin(lean) * 0.22;

    for (const [side, swing, elbow] of [
      [1, armL, elbowL],
      [-1, armR, elbowR],
    ]) {
      const index = i * 2 + (side > 0 ? 0 : 1);
      const sx = side * 0.172;
      shoulders.setMatrixAt(index, partMatrix(tmpBase, sx, 1.325, shoulderZ));

      const upper = partMatrix(tmpBase, sx, 1.325, shoulderZ, swing, side * 0.04);
      tmpUpper.copy(upper);
      upperArms.setMatrixAt(index, upper);
      elbows.setMatrixAt(index, childMatrix(tmpUpper, 0, -0.294, 0));
      const fore = childMatrix(tmpUpper, 0, -0.294, 0, elbow);
      tmpFore.copy(fore);
      forearms.setMatrixAt(index, fore);
      hands.setMatrixAt(index, childMatrix(tmpFore, 0, -0.254, 0));
      thumbs.setMatrixAt(index, childMatrix(tmpFore, side * 0.03, -0.262, 0.018));
      cuffs.setMatrixAt(
        index,
        actor.shortSleeves
          ? hideMatrix(tmpBase)
          : childMatrix(tmpFore, 0, -0.243, 0)
      );
    }

    // Legs: thigh, knee and shin, with the foot counter-rotated so the sole
    // stays close to level through the stride.
    // A long winter coat shortens the natural stride; it also keeps the
    // rigid skirt from being pushed too far by the thighs.
    const legSwing = walk ? stride * (actor.winter ? 0.36 : 0.44) : 0;
    const kneeL = walk ? Math.max(0, legSwing) * 1.05 + 0.04 : 0.02;
    const kneeR = walk ? Math.max(0, -legSwing) * 1.05 + 0.04 : 0.02;

    for (const [side, swing, knee] of [
      [1, legSwing, kneeL],
      [-1, -legSwing, kneeR],
    ]) {
      const index = i * 2 + (side > 0 ? 0 : 1);
      const thigh = partMatrix(tmpBase, side * 0.085, 0.9, 0, swing, side * 0.018);
      tmpThigh.copy(thigh);
      thighs.setMatrixAt(index, thigh);
      knees.setMatrixAt(index, childMatrix(tmpThigh, 0, -0.42, 0));
      const shin = childMatrix(tmpThigh, 0, -0.42, 0, knee);
      tmpShin.copy(shin);
      shins.setMatrixAt(index, shin);
      const foot = childMatrix(tmpShin, 0, -0.424, 0, -knee * 0.55 - swing * 0.3);
      feet.setMatrixAt(index, foot);
      soles.setMatrixAt(index, foot);
    }

    // Shoulder bag and cross-body strap.
    if (actor.hasBag) {
      bags.setMatrixAt(i, partMatrix(tmpBase, 0.21, 0.95, -0.02, 0, 0.12));
      straps.setMatrixAt(i, partMatrix(tmpBase, 0.02, 1.1, 0.112, 0, 0.55));
    } else {
      bags.setMatrixAt(i, hideMatrix(tmpBase));
      straps.setMatrixAt(i, hideMatrix(tmpBase));
    }

    // Umbrella held in the right hand.
    if (actor.hasUmbrella) {
      const sway = walk ? Math.sin(actor.phase) * 0.02 : Math.sin(actor.phase * 0.7) * 0.012;
      canopies.setMatrixAt(i, partMatrix(tmpBase, 0.17, 1.86, 0.015, 0, sway));
      shafts.setMatrixAt(i, partMatrix(tmpBase, 0.17, 0.88, 0.015, 0, sway * 0.4));
    } else {
      canopies.setMatrixAt(i, hideMatrix(tmpBase));
      shafts.setMatrixAt(i, hideMatrix(tmpBase));
    }
  }

  function update(dt, scrollSpeed = 0) {
    time += dt;
    const hurry = raining ? 1.22 : 1;

    for (let i = 0; i < count; i++) {
      const actor = actors[i];
      const own = actor.kind === "walk" ? actor.dir * actor.walk * hurry : 0;
      actor.x += own * dt - scrollSpeed * dt;
      if (actor.x < wrapMin) actor.x += wrapSpan;
      else if (actor.x > wrapMin + wrapSpan) actor.x -= wrapSpan;
      actor.phase +=
        dt *
        (actor.kind === "walk"
          ? actor.walk * 4.8 * hurry
          : actor.kind === "work"
            ? 2.1
            : 1.05);
      writeActor(actor, i);
    }

    for (const mesh of [
      head, hair, backHair, longHair, neck, torso, pelvis, collar, belt, buckle,
      hem, pockets, cuffs, shirtV,
      eyeL, eyeR, pupilL, pupilR, browL, browR, nose, mouth, earL, earR,
      shoulders, upperArms, elbows, forearms, hands, thumbs,
      thighs, knees, shins, feet, soles, bags, straps, canopies, shafts,
      beanies, beanieBrims, poms, scarves, scarfTails, coatSkirts,
    ]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function setRain(value) {
    raining = Boolean(value);
    umbrellaLayer.visible = raining;
    // Rain makes people walk a little faster; the pose updates on the next
    // frame, so nudge the whole crowd once when the weather changes.
    if (raining) update(0.016, 0);
  }

  // First pose is written immediately so the crowd is complete on the first
  // rendered frame after entering a stage.
  update(0.016, 0);

  return {
    group,
    actors,
    update,
    setRain,
    get raining() {
      return raining;
    },
    get time() {
      return time;
    },
  };
}

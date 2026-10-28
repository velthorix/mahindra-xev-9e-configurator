import * as THREE from "three";

/* -------------------------------------------------------------------------- */
/*  Procedural driver                                                         */
/* -------------------------------------------------------------------------- */
/*
 * A seated driver built from the same primitives as the rest of the car: no
 * imported human, no textures. The hands are solved onto the steering rim with
 * a two-bone IK every frame, so when the wheel turns the arms follow instead of
 * floating beside it. The figure only appears while a stage is rolling.
 */

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

function material(
  color,
  roughness = 0.86,
  metalness = 0,
  emissive = 0x000000,
  emissiveIntensity = 0
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMapIntensity: 0.4,
    emissive,
    emissiveIntensity,
  });
}

function part(geometry, mat) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function bone(radiusTop, radiusBottom, mat) {
  // Unit-height cylinder; each bone is scaled along Y to the solved length.
  return part(new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, 9, 1), mat);
}

const tmpDir = new THREE.Vector3();
const tmpMid = new THREE.Vector3();
const tmpHand = new THREE.Vector3();
const tmpElbow = new THREE.Vector3();
const tmpShoulder = new THREE.Vector3();
const tmpPole = new THREE.Vector3();
const tmpAxis = new THREE.Vector3();
const tmpElbowDir = new THREE.Vector3();

export function createDriver() {
  const group = new THREE.Group();
  group.name = "Driver";
  group.visible = false;

  // The cabin is dim and the glass is tinted, so the driver carries a small
  // self-lit lift. It is deliberately subtle: enough to separate the figure
  // from the black interior, not enough to look like a glowing mannequin.
  const jacket = material(0x2a3542, 0.86, 0, 0x0d131a, 0.45);
  const jacketDark = material(0x1c242d, 0.9, 0, 0x080c11, 0.35);
  const trousers = material(0x2b3138, 0.92, 0, 0x080a0d, 0.3);
  const skin = material(0xc0845a, 0.66, 0, 0x32190c, 0.42);
  const hair = material(0x1b1714, 0.7, 0, 0x060504, 0.22);
  const shoe = material(0x121417, 0.6, 0.05, 0x030405, 0.2);
  const belt = material(0x3c4247, 0.72, 0, 0x080a0c, 0.25);
  const buckle = material(0x8b8f8e, 0.3, 0.85);

  // Torso: a soft capsule leaning into the seat back.
  const torso = part(new THREE.CapsuleGeometry(0.155, 0.3, 5, 12), jacket);
  torso.scale.set(1.06, 1, 0.72);
  torso.position.set(0.015, 0.875, 0.36);
  torso.rotation.z = 0.13;
  group.add(torso);

  // Collar and seat belt. The belt is deliberately matte so it reads as
  // webbing rather than a strip of chrome in the cabin light.
  const collar = part(new THREE.TorusGeometry(0.082, 0.018, 6, 16), jacketDark);
  collar.rotation.x = Math.PI / 2;
  collar.rotation.z = 0.13;
  collar.position.set(-0.005, 1.115, 0.36);
  group.add(collar);

  const strap = part(new THREE.BoxGeometry(0.014, 0.54, 0.05), belt);
  strap.position.set(0.162, 0.885, 0.36);
  strap.rotation.x = 0.52;
  strap.rotation.z = 0.13;
  group.add(strap);

  const buckleMesh = part(new THREE.BoxGeometry(0.022, 0.045, 0.055), buckle);
  buckleMesh.position.set(0.18, 0.76, 0.285);
  group.add(buckleMesh);

  // Neck, head and hair.
  const neck = part(new THREE.CylinderGeometry(0.043, 0.05, 0.095, 9), skin);
  neck.position.set(0.005, 1.155, 0.36);
  neck.rotation.z = 0.1;
  group.add(neck);

  const head = part(new THREE.SphereGeometry(0.098, 14, 11), skin);
  head.scale.set(0.9, 1.06, 0.95);
  head.position.set(0.015, 1.27, 0.36);
  group.add(head);

  const hairCap = part(
    new THREE.SphereGeometry(0.102, 14, 10, 0, TAU, 0, Math.PI * 0.42),
    hair
  );
  hairCap.scale.set(0.93, 1.04, 0.99);
  hairCap.position.set(0.007, 1.279, 0.356);
  hairCap.rotation.z = -0.04;
  group.add(hairCap);

  const backHair = part(
    new THREE.SphereGeometry(0.098, 12, 8, 0, TAU, 0, Math.PI * 0.55),
    hair
  );
  backHair.scale.set(0.88, 1.0, 0.7);
  backHair.position.set(0.002, 1.252, 0.348);
  group.add(backHair);

  for (const side of [-1, 1]) {
    const ear = part(new THREE.SphereGeometry(0.022, 8, 6), skin);
    ear.position.set(0.0, 1.267, 0.36 + side * 0.093);
    ear.scale.set(0.7, 1, 0.55);
    group.add(ear);
  }

  const nose = part(new THREE.SphereGeometry(0.019, 8, 6), skin);
  nose.scale.set(1.35, 0.9, 0.75);
  nose.position.set(0.104, 1.263, 0.36);
  group.add(nose);

  const eyeWhite = new THREE.MeshStandardMaterial({
    color: 0xf0e9dc,
    roughness: 0.32,
    metalness: 0,
    envMapIntensity: 0.6,
    emissive: 0x2a2620,
    emissiveIntensity: 0.55,
  });
  const eyeDark = new THREE.MeshStandardMaterial({
    color: 0x14100e,
    roughness: 0.4,
    metalness: 0,
  });
  const lipMat = new THREE.MeshStandardMaterial({
    color: 0x7a4a3b,
    roughness: 0.7,
    metalness: 0,
    emissive: 0x1a0b08,
    emissiveIntensity: 0.3,
  });

  for (const side of [-1, 1]) {
    const eye = part(new THREE.SphereGeometry(0.013, 8, 6), eyeWhite);
    eye.scale.set(0.55, 0.9, 1);
    eye.position.set(0.104, 1.287, 0.36 + side * 0.036);
    group.add(eye);

    const pupil = part(new THREE.SphereGeometry(0.0065, 6, 5), eyeDark);
    pupil.position.set(0.111, 1.287, 0.36 + side * 0.036);
    group.add(pupil);

    const brow = part(new THREE.BoxGeometry(0.008, 0.008, 0.04), hair);
    brow.position.set(0.106, 1.305, 0.36 + side * 0.036);
    brow.rotation.x = side * 0.05;
    group.add(brow);
  }

  const mouth = part(new THREE.BoxGeometry(0.008, 0.008, 0.046), lipMat);
  mouth.position.set(0.106, 1.243, 0.36);
  group.add(mouth);

  // Legs: hip to knee to ankle. The feet rest in the footwell, clear of the
  // pedal box and the lower dash.
  const hips = [];
  const knees = [];
  const ankles = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Vector3(0.0, 0.6, 0.36 + side * 0.1);
    const knee = new THREE.Vector3(0.34, 0.55, 0.36 + side * 0.115);
    const ankle = new THREE.Vector3(0.56, 0.34, 0.36 + side * 0.115);
    hips.push(hip);
    knees.push(knee);
    ankles.push(ankle);

    const thigh = bone(0.078, 0.07, trousers);
    placeBone(thigh, hip, knee);
    group.add(thigh);

    const kneeCap = part(new THREE.SphereGeometry(0.07, 9, 7), trousers);
    kneeCap.position.copy(knee);
    kneeCap.scale.set(1, 0.9, 0.95);
    group.add(kneeCap);

    const shin = bone(0.06, 0.052, trousers);
    placeBone(shin, knee, ankle);
    group.add(shin);

    const shoeMesh = part(new THREE.BoxGeometry(0.24, 0.075, 0.118), shoe);
    shoeMesh.position.set(0.645, 0.305, 0.36 + side * 0.115);
    shoeMesh.rotation.z = -0.04;
    group.add(shoeMesh);
  }

  // Arms are rebuilt each frame from shoulder to the rim.
  const shoulders = [
    new THREE.Vector3(-0.005, 1.07, 0.36 + 0.188),
    new THREE.Vector3(-0.005, 1.07, 0.36 - 0.188),
  ];
  const arms = [];
  for (let i = 0; i < 2; i++) {
    const shoulderCap = part(new THREE.SphereGeometry(0.064, 9, 7), jacket);
    shoulderCap.position.copy(shoulders[i]);
    group.add(shoulderCap);

    const upper = bone(0.052, 0.045, jacket);
    const fore = bone(0.044, 0.038, jacket);
    const elbow = part(new THREE.SphereGeometry(0.046, 8, 6), jacket);
    const hand = part(new THREE.SphereGeometry(0.048, 9, 7), skin);
    hand.scale.set(0.82, 1.08, 0.92);
    group.add(upper, fore, elbow, hand);
    arms.push({ upper, fore, elbow, hand, shoulderCap });
  }

  // The wheel's local frame: it is mounted with rotation.y = -PI/2 and a
  // 0.16 rad tilt, so the rim plane is almost the car's YZ plane. These
  // constants reproduce that frame without touching the wheel's matrix.
  const WHEEL = new THREE.Vector3(0.47, 1.0, 0.36);
  const RIM_RADIUS = 0.162;
  const TILT = 0.16;
  const tiltSin = Math.sin(TILT);
  const tiltCos = Math.cos(TILT);

  function handTarget(angle, out) {
    // A point on the rim, rotated by the wheel spin. Local +X maps to world
    // +Z (with a small downward tilt) and local +Y maps to world +Y.
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    out.set(
      WHEEL.x - tiltSin * RIM_RADIUS * s,
      WHEEL.y - tiltSin * RIM_RADIUS * c + tiltCos * RIM_RADIUS * s,
      WHEEL.z + tiltCos * RIM_RADIUS * c
    );
    return out;
  }

  const shoulderWorld = new THREE.Vector3();
  const handWorld = new THREE.Vector3();
  let time = 0;

  function solveArm(arm, shoulder, hand, side) {
    const upperLength = 0.3;
    const lowerLength = 0.29;

    tmpDir.subVectors(hand, shoulder);
    let distance = tmpDir.length();
    if (distance < 1e-4) distance = 1e-4;
    tmpDir.divideScalar(distance);
    distance = Math.min(distance, (upperLength + lowerLength) * 0.998);

    // Law of cosines for the elbow, then bend the chain down and slightly
    // outward so the arms do not cross the chest.
    const cos = THREE.MathUtils.clamp(
      (upperLength * upperLength + distance * distance - lowerLength * lowerLength) /
        (2 * upperLength * distance),
      -1,
      1
    );
    const angle = Math.acos(cos);
    tmpPole.set(0, -1, side * 0.38).normalize();
    tmpAxis.crossVectors(tmpDir, tmpPole).normalize();
    tmpElbowDir.copy(tmpDir).applyAxisAngle(tmpAxis, angle);
    tmpElbow.copy(shoulder).addScaledVector(tmpElbowDir, upperLength);

    placeBone(arm.upper, shoulder, tmpElbow);
    placeBone(arm.fore, tmpElbow, hand);
    arm.elbow.position.copy(tmpElbow);
    arm.hand.position.copy(hand);
    arm.hand.quaternion.setFromUnitVectors(UP, tmpDir);
  }

  function update(dt, speed = 0, steerAngle = 0, elapsed = 0) {
    time += dt;
    const intensity = THREE.MathUtils.clamp(speed / 22, 0, 1);
    const bob = Math.sin(elapsed * 7.4) * 0.0018 * intensity;
    group.position.y = bob;

    torso.rotation.z = 0.13 + Math.sin(elapsed * 1.15) * 0.0035;
    torso.rotation.y = Math.sin(elapsed * 0.42) * 0.012 * intensity;
    head.rotation.z = Math.sin(elapsed * 0.9 + 0.5) * 0.012;
    head.rotation.y = Math.sin(elapsed * 0.33) * 0.028 * intensity;
    hairCap.rotation.y = head.rotation.y;

    // Hands ride the rim at roughly 9 and 3 o'clock.
    for (let i = 0; i < 2; i++) {
      const arm = arms[i];
      const side = i === 0 ? 1 : -1;
      const base = i === 0 ? 0 : Math.PI;
      handTarget(base + steerAngle, tmpHand);
      shoulderWorld.copy(shoulders[i]);
      shoulderWorld.x += Math.sin(elapsed * 0.42) * 0.003 * intensity;
      handWorld.copy(tmpHand);
      solveArm(arm, shoulderWorld, handWorld, side);
      arm.shoulderCap.position.copy(shoulderWorld);
    }
  }

  // Settle the arms on the wheel before the first visible frame.
  update(0.016, 0, 0, 0);

  return {
    group,
    update,
    get hands() {
      return arms.map((arm) => arm.hand.position.clone());
    },
  };
}

/* ------------------------------- utilities -------------------------------- */

const boneDir = new THREE.Vector3();

function placeBone(mesh, from, to) {
  boneDir.subVectors(to, from);
  const length = boneDir.length();
  mesh.position.copy(from).addScaledVector(boneDir, 0.5);
  mesh.scale.set(1, Math.max(0.0001, length), 1);
  mesh.quaternion.setFromUnitVectors(UP, boneDir.normalize());
}

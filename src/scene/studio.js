import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { makeFloorTexture } from "./textures.js";

RectAreaLightUniformsLib.init();

function environmentScene() {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(36, 16, 46),
    new THREE.MeshBasicMaterial({ color: 0x111412, side: THREE.BackSide })
  );
  room.position.y = 5;
  scene.add(room);

  const panel = (w, h, color, intensity, position, lookAt) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.copy(position);
    mesh.lookAt(lookAt);
    scene.add(mesh);
    return mesh;
  };

  // Broad, soft overheads. Wide panels give the paint a long satin highlight
  // instead of the narrow "light sabre" streak a thin strip would produce.
  for (const z of [-6, 2.5, 9]) {
    panel(16, 2.6, 0xe9eef4, 0.58, new THREE.Vector3(0, 10, z), new THREE.Vector3(0, 0, z));
  }
  panel(1.9, 12, 0xeef4fb, 0.8, new THREE.Vector3(-13, 6, -1), new THREE.Vector3(0, 3, -1));
  panel(1.9, 12, 0xf4f8ff, 0.74, new THREE.Vector3(13, 6, 1), new THREE.Vector3(0, 3, 1));

  // Large side bounce cards
  panel(9, 5, 0xdfe9f5, 0.5, new THREE.Vector3(-8, 3.5, 8), new THREE.Vector3(0, 2, 0));
  panel(9, 5, 0xfff3e6, 0.42, new THREE.Vector3(8, 3.5, -8), new THREE.Vector3(0, 2, 0));

  // Front and rear slashes
  panel(11, 0.8, 0xffffff, 0.48, new THREE.Vector3(13, 4.8, 0), new THREE.Vector3(0, 3, 0));
  panel(11, 0.6, 0xffffff, 0.38, new THREE.Vector3(-13, 4.8, 0), new THREE.Vector3(0, 3, 0));

  // Low side bounce, so the doors and rockers keep their paint colour.
  panel(7.5, 1.6, 0xe9e6df, 0.38, new THREE.Vector3(0, 0.9, 6.2), new THREE.Vector3(0, 0.7, 0));
  panel(7.5, 1.6, 0xe9e6df, 0.38, new THREE.Vector3(0, 0.9, -6.2), new THREE.Vector3(0, 0.7, 0));

  // Dim floor for a restrained upward bounce. The tall panels do the work.
  const envFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 42),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x2a2e2b).multiplyScalar(0.4),
      side: THREE.DoubleSide,
    })
  );
  envFloor.rotation.x = -Math.PI / 2;
  envFloor.position.y = 0.02;
  scene.add(envFloor);

  return scene;
}

function background() {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#030504");
  gradient.addColorStop(0.24, "#060907");
  gradient.addColorStop(0.46, "#0a0d0b");
  gradient.addColorStop(0.62, "#0d100e");
  gradient.addColorStop(1, "#090b0a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(320, 64, 40), mat);
  mesh.name = "StudioBackdrop";
  mesh.renderOrder = -10;
  return mesh;
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(256, 256, 20, 256, 256, 250);
  g.addColorStop(0, "rgba(0,0,0,0.62)");
  g.addColorStop(0.4, "rgba(0,0,0,0.36)");
  g.addColorStop(0.72, "rgba(0,0,0,0.1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function floorAlphaTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.82, "#ffffff");
  g.addColorStop(0.93, "#b4b4b4");
  g.addColorStop(1, "#000000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function createStudio(renderer) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x090b0a, 18, 105);
  scene.add(background());

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = environmentScene();
  // A slightly wider PMREM blur keeps large studio softboxes reading as soft
  // gradients in the clearcoat instead of mirror-sharp white shapes.
  const envTarget = pmrem.fromScene(env, 0.07, 0.1, 100);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.92;
  env.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  pmrem.dispose();

  // A very large matte outer floor lets the fog dissolve the horizon instead
  // of ending in a hard line.
  const outerFloor = new THREE.Mesh(
    new THREE.CircleGeometry(300, 128),
    new THREE.MeshStandardMaterial({
      color: 0x171a18,
      roughness: 0.62,
      metalness: 0.08,
      envMapIntensity: 0.26,
    })
  );
  outerFloor.name = "StudioOuterFloor";
  outerFloor.rotation.x = -Math.PI / 2;
  outerFloor.position.y = -0.045;
  // The floor overlay and the soft contact shadow already ground the car; the
  // key shadow frustum on this huge matte plane produced a visible dark band.
  outerFloor.receiveShadow = false;
  scene.add(outerFloor);

  // Reflective platform
  const reflector = new Reflector(new THREE.CircleGeometry(6.54, 128), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x2e332f,
  });
  reflector.name = "StudioReflector";
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.y = 0;
  scene.add(reflector);

  const floorTex = makeFloorTexture();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6.6, 160),
    new THREE.MeshPhysicalMaterial({
      color: 0x40463f,
      map: floorTex,
      alphaMap: floorAlphaTexture(),
      roughness: 0.42,
      metalness: 0.05,
      clearcoat: 0.35,
      clearcoatRoughness: 0.32,
      transparent: true,
      opacity: 0.7,
      envMapIntensity: 0.5,
      depthWrite: true,
    })
  );
  floor.name = "StudioFloor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.0015;
  floor.receiveShadow = true;
  scene.add(floor);

  // Soft contact shadow
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 4.5),
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    })
  );
  contact.name = "StudioContact";
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.004;
  contact.renderOrder = 2;
  scene.add(contact);

  /* --------------------------- studio dressing --------------------------- */
  // Tall vertical softboxes and a lime platform ring. These are real scene
  // geometry, so they show up in the reflective floor and frame the car the
  // way the reference studio does. Kept in one group so the driving stages can
  // hide the whole set in a single step.
  const dressing = new THREE.Group();
  dressing.name = "StudioDressing";
  scene.add(dressing);

  // The environment map still gets tall strip highlights from the PMREM
  // softboxes, but no hard-edged strip geometry cuts through the car silhouette
  // from the hero camera.

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xd8f59a,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    toneMapped: false,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.9, 4.97, 180), ringMat);
  ring.name = "StudioRing";
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.007;
  ring.renderOrder = 3;
  dressing.add(ring);

  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(6.6, 6.63, 180),
    new THREE.MeshBasicMaterial({
      color: 0xdfe9f2,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      toneMapped: false,
      depthWrite: false,
    })
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.006;
  outerRing.renderOrder = 3;
  dressing.add(outerRing);

  /* ----------------------------- lights ---------------------------------- */
  const hemisphere = new THREE.HemisphereLight(0xf6f4ef, 0x5e6264, 0.8);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xfff6ea, 0.75);
  key.position.set(2.8, 9.2, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.019;
  key.shadow.radius = 4;
  key.target.position.set(0, 0.7, 0);
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xdfeaff, 0.5);
  fill.position.set(-6, 4, 3.5);
  scene.add(fill);

  // Soft upper side fills. The key light is high and frontal, so the tall,
  // near-vertical C-pillar and side glass previously fell into near-black
  // shadow and the body-colour pillar disappeared.
  const upperLeft = new THREE.DirectionalLight(0xfff3e8, 0.13);
  upperLeft.position.set(1.4, 1.7, 6.4);
  upperLeft.target.position.set(-0.4, 1.1, 0);
  scene.add(upperLeft, upperLeft.target);

  const upperRight = new THREE.DirectionalLight(0xeef6ff, 0.11);
  upperRight.position.set(-1.0, 1.7, -6.4);
  upperRight.target.position.set(0.2, 1.1, 0);
  scene.add(upperRight, upperRight.target);

  // Front/rear fills are kept low, below the bonnet line. A large area light
  // sitting above a horizontal clearcoat panel is exactly what paints a white
  // sheet across the hood or roof from the opposite camera angle.
  const rearSoft = new THREE.RectAreaLight(0xffe9d6, 0.26, 3.8, 1.0);
  rearSoft.position.set(-6.0, 0.7, -4.8);
  rearSoft.lookAt(0, 0.5, 0);
  scene.add(rearSoft);

  const leftSoft = new THREE.RectAreaLight(0xffffff, 0.45, 7.5, 1.4);
  leftSoft.position.set(-5.6, 0.7, 0.5);
  leftSoft.lookAt(0, 0.5, 0);
  scene.add(leftSoft);

  const rightSoft = new THREE.RectAreaLight(0xeef6ff, 0.4, 7.5, 1.4);
  rightSoft.position.set(5.6, 0.7, -0.5);
  rightSoft.lookAt(0, 0.5, 0);
  scene.add(rightSoft);

  const frontSoft = new THREE.RectAreaLight(0xfff4e8, 0.3, 5.5, 1.0);
  frontSoft.position.set(7.5, 0.7, 4.5);
  frontSoft.lookAt(0, 0.5, 0);
  scene.add(frontSoft);

  // Broad, centred front fill. The body-colour lattice nose and the bonnet
  // brow were falling into shadow in the head-on view; the real car has an
  // even frontal wash that lets the milled panel read as red, not black.
  const noseFill = new THREE.RectAreaLight(0xfff6ec, 0.38, 3.8, 1.2);
  noseFill.position.set(7.8, 1.1, 0);
  noseFill.lookAt(0, 0.75, 0);
  scene.add(noseFill);

  // Low side fills reveal the lower door surfaces and wheel faces without
  // throwing a specular sheet onto the bonnet or roof.
  const lowLeft = new THREE.RectAreaLight(0xfff5e9, 0.6, 5.5, 1.0);
  lowLeft.position.set(0, 0.62, 5.8);
  lowLeft.lookAt(0, 0.5, 0);
  scene.add(lowLeft);

  const lowRight = new THREE.RectAreaLight(0xeef5ff, 0.6, 5.5, 1.0);
  lowRight.position.set(0, 0.62, -5.8);
  lowRight.lookAt(0, 0.5, 0);
  scene.add(lowRight);

  return {
    scene,
    reflector,
    floor,
    outerFloor,
    dressing,
    key,
    fill,
    rearSoft,
    leftSoft,
    rightSoft,
    frontSoft,
    noseFill,
    lowLeft,
    lowRight,
    upperLeft,
    upperRight,
    hemisphere,
    contact,
  };
}

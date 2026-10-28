import * as THREE from "three";

/* -------------------------------------------------------------------------- */
/*  Curve helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Monotone cubic interpolation through [x, y] control points. */
export function curve(points, x) {
  const n = points.length;
  if (n === 0) return 0;
  if (n === 1) return points[0][1];
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[n - 1][0]) return points[n - 1][1];

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    d[i] = (ys[i + 1] - ys[i]) / h[i];
  }
  const m = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const t = (x - xs[i]) / h[i];
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * ys[i] + h10 * h[i] * m[i] + h01 * ys[i + 1] + h11 * h[i] * m[i + 1];
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Sample a smooth path of x->z keys at a fixed X step. */
export function sampleCurveX(points, step = 0.02) {
  const out = [];
  const x0 = points[0][0];
  const x1 = points[points.length - 1][0];
  const n = Math.max(2, Math.ceil((x1 - x0) / step));
  for (let i = 0; i <= n; i++) {
    const x = lerp(x0, x1, i / n);
    out.push(new THREE.Vector2(x, curve(points, x)));
  }
  return out;
}

export function roundedRect(w, h, r, segments = 8) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

export function shapeToPoints(shape, divisions = 10) {
  const points = shape.getPoints(divisions);
  if (points[0].distanceTo(points[points.length - 1]) < 1e-6) points.pop();
  return points;
}

/* -------------------------------------------------------------------------- */
/*  Adaptive triangulation of a 2D shape                                       */
/* -------------------------------------------------------------------------- */

/**
 * Triangulate an outline and subdivide long triangles so the surface can be
 * smoothly warped into 3D. Returns shared vertices and triangle indices.
 */
export function triangulateAdaptive(outline, maxEdge = 0.05) {
  const tris = THREE.ShapeUtils.triangulateShape(outline, []);
  const verts = outline.map((p) => [p.x, p.y]);
  const cache = new Map();
  const out = [];

  function mid(i, j) {
    const a = Math.min(i, j);
    const b = Math.max(i, j);
    const key = a * 100000 + b;
    if (cache.has(key)) return cache.get(key);
    const p = [(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2];
    verts.push(p);
    const idx = verts.length - 1;
    cache.set(key, idx);
    return idx;
  }

  function edgeLen(i, j) {
    const a = verts[i];
    const b = verts[j];
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  function split(a, b, c, depth = 0) {
    if (depth > 24) {
      out.push([a, b, c]);
      return;
    }
    const ab = edgeLen(a, b);
    const bc = edgeLen(b, c);
    const ca = edgeLen(c, a);
    if (Math.max(ab, bc, ca) <= maxEdge) {
      out.push([a, b, c]);
      return;
    }
    if (ab >= bc && ab >= ca) {
      const m = mid(a, b);
      split(a, m, c, depth + 1);
      split(m, b, c, depth + 1);
    } else if (bc >= ca) {
      const m = mid(b, c);
      split(a, b, m, depth + 1);
      split(a, m, c, depth + 1);
    } else {
      const m = mid(c, a);
      split(a, b, m, depth + 1);
      split(m, b, c, depth + 1);
    }
  }

  for (const [a, b, c] of tris) split(a, b, c);
  return { points: verts, faces: out };
}

/**
 * Build a smooth surface from a 2D outline and a warp function.
 * The returned mesh is double sided so thin panels never disappear.
 */
export function warpSurface(outline, warp, maxEdge = 0.05, material = null, name = "surface") {
  const { points, faces } = triangulateAdaptive(outline, maxEdge);
  const positions = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    const v = warp(points[i][0], points[i][1], points[i]);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  const indices = [];
  for (const f of faces) indices.push(f[0], f[1], f[2]);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  smoothParametricNormals(geom, points, warp);
  geom.attributes.normal.setUsage(THREE.StaticDrawUsage);
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = name;
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}

/**
 * Replace topology-derived normals with analytic normals from the parametric
 * surface. Adaptive triangulation produces long, uneven triangles; averaging
 * their face normals leaves tiny changes that sparkle along a glossy
 * highlight. Central differences over the smooth surface function remove that
 * speckle without blurring the paint.
 */
function smoothParametricNormals(geometry, uvList, fn, eps = 0.0015) {
  const reference = geometry.attributes.normal;
  const normals = new Float32Array(uvList.length * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  const du = new THREE.Vector3();
  const dv = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < uvList.length; i++) {
    const [u, v] = uvList[i];
    a.copy(fn(u + eps, v));
    b.copy(fn(u - eps, v));
    c.copy(fn(u, v + eps));
    d.copy(fn(u, v - eps));
    du.subVectors(a, b);
    dv.subVectors(c, d);
    normal.crossVectors(du, dv);
    const length = normal.length();
    if (length < 1e-9) {
      normals[i * 3] = reference.getX(i);
      normals[i * 3 + 1] = reference.getY(i);
      normals[i * 3 + 2] = reference.getZ(i);
      continue;
    }
    normal.multiplyScalar(1 / length);
    const rx = reference.getX(i);
    const ry = reference.getY(i);
    const rz = reference.getZ(i);
    if (normal.x * rx + normal.y * ry + normal.z * rz < 0) normal.negate();
    normals[i * 3] = normal.x;
    normals[i * 3 + 1] = normal.y;
    normals[i * 3 + 2] = normal.z;
  }
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
}

/** Build a grid surface from a function (x, t) -> Vector3. */
export function gridSurface(xs, ts, fn, material, name = "grid") {
  const positions = [];
  const indices = [];
  const uvList = [];
  const nu = xs.length;
  const nv = ts.length;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const p = fn(xs[i], ts[j]);
      positions.push(p.x, p.y, p.z);
      uvList.push([xs[i], ts[j]]);
    }
  }
  for (let i = 0; i < nu - 1; i++) {
    for (let j = 0; j < nv - 1; j++) {
      const a = i * nv + j;
      const b = a + 1;
      const c = (i + 1) * nv + j + 1;
      const d = (i + 1) * nv + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  smoothParametricNormals(geom, uvList, fn);
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = name;
  return mesh;
}

/** Create a tube from a list of 3D points. */
export function tubeFromPoints(points, radius = 0.0025, material, radialSegments = 5, name = "trim") {
  const curveObj = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.35);
  const geom = new THREE.TubeGeometry(
    curveObj,
    Math.max(12, Math.round(curveObj.getLength() / 0.02)),
    radius,
    radialSegments,
    false
  );
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = name;
  return mesh;
}

/** Convert a list of 2D paths into an extruded bevelled mesh. */
export function extrudeShape(shape, depth, bevel = 0.002, material, name = "extrude") {
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = name;
  return mesh;
}

export function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        for (const key of Object.keys(mat)) {
          const val = mat[key];
          if (val && val.isTexture) val.dispose();
        }
        mat.dispose();
      }
    }
  });
}

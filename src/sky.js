/**
 * sky.js — 渐变夜空穹顶 + 会闪烁的星点。
 * 纯 Shader / Points，不依赖贴图，离线可用。
 */
import * as THREE from 'three';

let seed = 77001;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

const STAR_COLORS = [
  [1.0, 1.0, 1.0],
  [0.68, 0.84, 1.0],
  [1.0, 0.88, 0.72],
  [1.0, 0.78, 0.90],
  [0.78, 1.0, 0.96],
];

export function buildSky(scene) {
  const skyGroup = new THREE.Group();
  scene.add(skyGroup);

  // ---- 渐变天空穹顶 ----
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);

        vec3 zenith = vec3(0.085, 0.045, 0.24);
        vec3 horizon = vec3(0.045, 0.090, 0.20);
        vec3 below = vec3(0.006, 0.010, 0.030);

        vec3 col = mix(horizon, zenith, smoothstep(0.50, 0.98, h));
        col = mix(below, col, smoothstep(0.22, 0.55, h));

        // 淡淡的星云带
        float neb = sin(d.x * 6.0 + d.z * 4.0) * sin(d.y * 8.0 - d.z * 3.0);
        col += vec3(0.07, 0.025, 0.11) * max(0.0, neb) * 0.45;
        float neb2 = sin(d.x * 11.0 - d.z * 7.0 + 1.7) * max(0.0, d.y);
        col += vec3(0.02, 0.05, 0.09) * max(0.0, neb2) * 0.30;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 20), domeMat);
  dome.renderOrder = -10;
  skyGroup.add(dome);

  // ---- 星点 ----
  const COUNT = 4600;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const phases = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    // 8 成均匀铺满天空，2 成沿一条斜带聚成「银河」
    const galaxy = i >= Math.floor(COUNT * 0.8);
    let dirX, dirY, dirZ;

    if (galaxy) {
      const t = rnd() * 2 - 1;
      const spread = () => (rnd() - 0.5) * 0.30;
      dirX = t * 0.78 + spread();
      dirY = t * 0.52 + spread() + 0.16;
      dirZ = -t * 0.35 + spread();
      const len = Math.hypot(dirX, dirY, dirZ) || 1;
      dirX /= len; dirY /= len; dirZ /= len;
    } else {
      const y = rnd() * 2 - 1;
      const theta = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      dirX = Math.cos(theta) * r;
      dirY = y;
      dirZ = Math.sin(theta) * r;
    }

    const radius = 95 + rnd() * 55;
    positions[i * 3] = dirX * radius;
    positions[i * 3 + 1] = dirY * radius;
    positions[i * 3 + 2] = dirZ * radius;

    const c = STAR_COLORS[Math.floor(rnd() * STAR_COLORS.length)];
    const brightness = 0.72 + rnd() * 0.28;
    colors[i * 3] = c[0] * brightness;
    colors[i * 3 + 1] = c[1] * brightness;
    colors[i * 3 + 2] = c[2] * brightness;

    sizes[i] = rnd() < 0.08 ? 3.0 + rnd() * 2.2 : 1.0 + rnd() * 1.5;
    phases[i] = rnd() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

  const uniforms = { uTime: { value: 0 } };
  const starMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = aColor;
        vTwinkle = 0.80 + 0.20 * sin(uTime * 1.6 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * vTwinkle * (190.0 / -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float d = length(p);
        float a = smoothstep(0.5, 0.05, d);
        gl_FragColor = vec4(vColor, a * vTwinkle);
      }
    `,
  });

  const stars = new THREE.Points(geo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  skyGroup.add(stars);

  return {
    group: skyGroup,
    /** 每帧更新闪烁相位 */
    update(dt) {
      uniforms.uTime.value += dt;
      skyGroup.rotation.y += dt * 0.003;
    },
  };
}

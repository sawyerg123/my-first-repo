// Main Three.js scene with liquid shader effect and post-processing
const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({canvas: canvas, antialias: true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1.0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 1.5);
scene.add(camera);

// Shader code
const vertexShader = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uStrength;
  
  vec3 mod289(vec3 x) { return x - floor(x / 289.0) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x / 289.0) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v)
  {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0);
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    i = mod289(i);
    vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    float distToMouse = distance(vUv, uPointer);
    float ripple = sin((distToMouse - uTime * 0.5) * 40.0) * 0.02 / (distToMouse * 5.0 + 0.1);
    float n = snoise(vec3(pos.xy * 3.0, uTime * 0.2));
    float disp = n * 0.05 + ripple * uStrength * 5.0 + sin(uTime + pos.x * 5.0) * 0.01;
    pos.z += disp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uStrength;
  
  vec3 hueShift(vec3 color, float shift) {
    const mat3 toYIQ = mat3(
      0.299, 0.587, 0.114,
      0.596, -0.274, -0.322,
      0.211, -0.523, 0.312
    );
    const mat3 toRGB = mat3(
      1.0, 0.956, 0.621,
      1.0, -0.272, -0.647,
      1.0, -1.107, 1.705
    );
    vec3 yiq = toYIQ * color;
    float hue = atan(yiq.z, yiq.y) + shift;
    float chroma = sqrt(yiq.y * yiq.y + yiq.z * yiq.z);
    vec3 result;
    result.x = yiq.x;
    result.y = chroma * cos(hue);
    result.z = chroma * sin(hue);
    return toRGB * result;
  }

  void main() {
    vec3 baseColor = mix(vec3(0.1,0.1,0.15), vec3(0.4,0.4,0.45), vUv.y);
    float stripes = smoothstep(0.0, 0.01, abs(sin((vUv.y + uTime * 0.1) * 20.0)));
    baseColor += stripes * 0.1;
    baseColor = hueShift(baseColor, uTime * 0.1 + uStrength * 0.5);
    float vignette = smoothstep(1.0, 0.7, distance(vUv, vec2(0.5)));
    baseColor *= vignette;
    gl_FragColor = vec4(baseColor, 1.0);
  }
`;

const planeGeometry = new THREE.PlaneGeometry(2, 2, 200, 200);
const uniforms = {
  uTime: { value: 0 },
  uPointer: { value: new THREE.Vector2(0.5, 0.5) },
  uStrength: { value: 0.0 }
};
const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, side: THREE.DoubleSide });
const plane = new THREE.Mesh(planeGeometry, material);
scene.add(plane);

const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.4, 0.85);
composer.addPass(bloomPass);
const rgbShiftPass = new THREE.ShaderPass(THREE.RGBShiftShader);
rgbShiftPass.uniforms['amount'].value = 0.0015;
composer.addPass(rgbShiftPass);

let lastMouse = new THREE.Vector2(0.5,0.5);
let pointerVelocity = 0;
function onMouseMove(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  const newPos = new THREE.Vector2(x, 1 - y);
  pointerVelocity = newPos.distanceTo(lastMouse);
  lastMouse.copy(newPos);
  uniforms.uPointer.value.copy(newPos);
}
window.addEventListener('mousemove', onMouseMove);

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();
function animate() {
  const elapsed = clock.getElapsedTime();
  uniforms.uTime.value = elapsed;
  uniforms.uStrength.value += (pointerVelocity * 5.0 - uniforms.uStrength.value) * 0.1;
  pointerVelocity *= 0.9;
  composer.render();
  requestAnimationFrame(animate);
}
animate();

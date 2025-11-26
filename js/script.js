/**
 * SAWYER G. PORTFOLIO - CORE ENGINE
 * * Tech Stack: Three.js, GLSL Shaders, GSAP, Lenis
 *Features: Liquid Distortion, Raycasting, Post-Processing (Bloom + RGB Shift), Kinetic Type
 */

// --- CONFIGURATION ---
const config = {
    debug: false,
    color: {
        bg: "#050505",
        mesh: "#111111",
        light: "#ffffff",
        accent: "#007AFF"
    },
    physics: {
        tension: 0.5,
        friction: 0.9,
        mouseSize: 0.1
    }
};

// --- CUSTOM POST-PROCESSING SHADERS ---

// RGB Shift Shader (The "Glitch" Effect)
const RGBShiftShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "amount": { value: 0.005 },
        "angle": { value: 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        uniform float angle;
        varying vec2 vUv;
        void main() {
            vec2 offset = amount * vec2( cos(angle), sin(angle));
            vec4 cr = texture2D(tDiffuse, vUv + offset);
            vec4 cga = texture2D(tDiffuse, vUv);
            vec4 cb = texture2D(tDiffuse, vUv - offset);
            gl_FragColor = vec4(cr.r, cga.g, cb.b, cga.a);
        }`
};

// --- SCENE SHADERS ---

// 1. LIQUID DISTORTION VERTEX SHADER
const vertexShader = `
    uniform float uTime;
    uniform vec2 uMouse;
    uniform float uHover;
    varying vec2 vUv;
    varying float vElevation;

    // Simplex Noise Helper
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
    float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ; m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }

    void main() {
        vUv = uv;
        vec4 modelPosition = modelMatrix * vec4(position, 1.0);
        
        float dist = distance(uMouse, modelPosition.xy);
        float wave = sin(dist * 10.0 - uTime * 2.0);
        float activation = smoothstep(0.5, 0.0, dist);
        
        float elevation = snoise(vec2(modelPosition.x * 2.0, modelPosition.y * 2.0 + uTime * 0.1));
        elevation += wave * activation * uHover;

        modelPosition.z += elevation * 0.5;
        vElevation = elevation;

        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectedPosition = projectionMatrix * viewPosition;
        gl_Position = projectedPosition;
    }
`;

// 2. HOLOGRAPHIC FRAGMENT SHADER
const fragmentShader = `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying float vElevation;

    void main() {
        vec3 color = uColor;
        float mixStrength = (vElevation + 0.25) * 2.0;
        
        // Dynamic iridescent highlights
        vec3 highlight = vec3(0.1, 0.5, 1.0); 
        color = mix(color, highlight, mixStrength);

        // Scanline / Interference
        float scanline = sin(vUv.y * 80.0 + uTime * 3.0) * 0.05;
        color += scanline;

        gl_FragColor = vec4(color, 1.0);
    }
`;


// --- MAIN APP CLASS ---

class PortfolioApp {
    constructor() {
        this.container = document.getElementById('webgl-container');
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.mouse = new THREE.Vector2();
        this.targetMouse = new THREE.Vector2();
        this.timeSpeed = 1.0; // Modifier for interaction
        
        this.init();
        this.addObjects();
        this.initPostProcessing(); 
        this.initScroll();
        this.addEvents();
        this.resize();
        this.render();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(config.color.bg);

        this.camera = new THREE.PerspectiveCamera(70, this.width / this.height, 0.01, 100);
        this.camera.position.z = 2;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);
        
        this.clock = new THREE.Clock();
    }

    addObjects() {
        this.geometry = new THREE.PlaneGeometry(3, 3, 128, 128);
        this.material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(config.color.mesh) },
                uMouse: { value: new THREE.Vector2(0, 0) },
                uHover: { value: 0 }
            },
            side: THREE.DoubleSide,
            wireframe: true
        });

        this.plane = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.plane);

        // Ambient particles
        const particleGeo = new THREE.BufferGeometry();
        const count = 2000;
        const positions = new Float32Array(count * 3);
        for(let i = 0; i < count * 3; i++) {
            positions[i] = (Math.random() - 0.5) * 6;
        }
        particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const particleMat = new THREE.PointsMaterial({
            size: 0.005,
            color: config.color.accent,
            transparent: true,
            opacity: 0.6
        });
        this.particles = new THREE.Points(particleGeo, particleMat);
        this.scene.add(this.particles);
    }

    initPostProcessing() {
        // NOTE: This relies on the global THREE object and correct script tags in HTML
        if (typeof THREE.EffectComposer === 'undefined') {
            console.warn("Post-Processing libraries not loaded. Skipping.");
            return;
        }

        this.composer = new THREE.EffectComposer(this.renderer);
        this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));

        // 1. Bloom Pass (Glow)
        const bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(this.width, this.height),
            1.5, 0.4, 0.85
        );
        bloomPass.threshold = 0.2;
        bloomPass.strength = 0.8; // Glow intensity
        bloomPass.radius = 0.5;
        this.composer.addPass(bloomPass);

        // 2. Custom RGB Shift (Glitch)
        this.rgbShiftPass = new THREE.ShaderPass(RGBShiftShader);
        this.rgbShiftPass.uniforms['amount'].value = 0.002; // Subtle default
        this.composer.addPass(this.rgbShiftPass);
    }

    initScroll() {
        this.lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smooth: true
        });
        gsap.ticker.add((time) => {
            this.lenis.raf(time * 1000);
        });

        gsap.registerPlugin(ScrollTrigger);
        
        // Rotate plane on scroll
        gsap.to(this.plane.rotation, {
            scrollTrigger: {
                trigger: "body",
                start: "top top",
                end: "bottom bottom",
                scrub: 1
            },
            x: Math.PI / 2, 
            y: Math.PI / 4
        });
        
        // Text reveals
        document.querySelectorAll('.reveal-text').forEach(text => {
            gsap.from(text, {
                scrollTrigger: { trigger: text, start: "top 80%" },
                y: 100, opacity: 0, duration: 1.5, ease: "power4.out"
            });
        });
    }

    addEvents() {
        window.addEventListener('resize', this.resize.bind(this));
        
        window.addEventListener('mousemove', (e) => {
            const x = (e.clientX / this.width) * 2 - 1;
            const y = -(e.clientY / this.height) * 2 + 1;
            this.targetMouse.set(x, y);

            const cursor = document.querySelector('.cursor-dot');
            if(cursor) gsap.to(cursor, { x: e.clientX, y: e.clientY, duration: 0.1 });
        });

        // Click interaction: Warp speed
        window.addEventListener('mousedown', () => {
            gsap.to(this, { timeSpeed: 4.0, duration: 0.5 });
            if(this.rgbShiftPass) gsap.to(this.rgbShiftPass.uniforms.amount, { value: 0.01, duration: 0.2 });
        });
        window.addEventListener('mouseup', () => {
            gsap.to(this, { timeSpeed: 1.0, duration: 0.5 });
            if(this.rgbShiftPass) gsap.to(this.rgbShiftPass.uniforms.amount, { value: 0.002, duration: 0.5 });
        });
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.renderer.setSize(this.width, this.height);
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        
        if (this.composer) {
            this.composer.setSize(this.width, this.height);
        }
    }

    render() {
        const delta = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();

        this.mouse.lerp(this.targetMouse, 0.1);

        // Update Shader Uniforms
        this.material.uniforms.uTime.value += delta * this.timeSpeed; // Use modified speed
        this.material.uniforms.uMouse.value = this.mouse;

        // Hover intensity logic
        const dist = this.mouse.length();
        const targetHover = dist < 0.5 ? 1.0 : 0.0;
        const currentHover = this.material.uniforms.uHover.value;
        this.material.uniforms.uHover.value += (targetHover - currentHover) * 0.05;

        // Particles rotation
        this.particles.rotation.y = elapsedTime * 0.05;

        // Render via Composer if available, else standard
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
        
        requestAnimationFrame(this.render.bind(this));
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // We check for Three.js. If Post-Processing libs aren't loaded, initPostProcessing handles it gracefully.
    if (typeof THREE !== 'undefined' && typeof gsap !== 'undefined') {
        new PortfolioApp();
    } else {
        console.error("Critical: Three.js or GSAP not loaded.");
    }
});

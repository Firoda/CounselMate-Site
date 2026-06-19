/* ---------------------------------------------------------------
   CounselMate landing page interactions
   - Scroll-reveal storytelling (IntersectionObserver)
   - Pointer-driven 3D tilt cards (desktop only)
   - Optional Three.js hero scene with full graceful degradation
--------------------------------------------------------------- */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const isSmallScreen = window.matchMedia('(max-width: 640px)').matches;
const saveData = navigator.connection && (navigator.connection.saveData ||
  ['slow-2g', '2g', '3g'].includes(navigator.connection.effectiveType));

/* ---------------- Scroll reveal ---------------- */
function initScrollReveal() {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
  );

  targets.forEach((el) => observer.observe(el));
}

/* ---------------- 3D tilt cards ---------------- */
function initTiltCards() {
  if (prefersReducedMotion || !isFinePointer) return;

  const cards = document.querySelectorAll('[data-tilt]');
  const MAX_TILT = 10;

  cards.forEach((card) => {
    const inner = card.querySelector('.tilt-card-inner');
    if (!inner) return;

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rotateY = (x - 0.5) * MAX_TILT * 2;
      const rotateX = (0.5 - y) * MAX_TILT * 2;
      inner.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(0)`;
    });

    card.addEventListener('mouseleave', () => {
      inner.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0)';
    });
  });
}

/* ---------------- Three.js hero scene ---------------- */
function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

async function initHeroScene() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  // Bail gracefully: reduced motion, no WebGL, or a constrained connection.
  // The CSS gradient (.hero-bg) underneath already looks complete on its own.
  if (prefersReducedMotion || saveData || !supportsWebGL()) return;

  let THREE;
  try {
    THREE = await import('three');
  } catch (e) {
    return; // CDN unreachable or blocked — fall back to CSS background only.
  }

  const hero = document.getElementById('hero');
  const particleCount = isSmallScreen ? 160 : 480;
  const dprCap = isSmallScreen ? 1.5 : 2;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.z = 9;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !isSmallScreen,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  // Wireframe icosahedron — an abstract "network" core.
  const coreGeometry = new THREE.IcosahedronGeometry(2.4, 1);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0x5b8def,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  scene.add(core);

  // Particle field — scattered "case nodes".
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const radius = 4 + Math.random() * 5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    color: 0x4fd1e8,
    size: 0.045,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);

  let pointerX = 0;
  let pointerY = 0;
  let targetRotX = 0;
  let targetRotY = 0;

  if (isFinePointer) {
    window.addEventListener('pointermove', (e) => {
      pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      pointerY = (e.clientY / window.innerHeight) * 2 - 1;
    });
  }

  let scrollFactor = 0;
  window.addEventListener('scroll', () => {
    scrollFactor = Math.min(window.scrollY / window.innerHeight, 1.5);
  }, { passive: true });

  let isVisible = true;
  if ('IntersectionObserver' in window) {
    const visibilityObserver = new IntersectionObserver(
      (entries) => { isVisible = entries[0].isIntersecting; },
      { threshold: 0 }
    );
    visibilityObserver.observe(hero);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) isVisible = false;
    else isVisible = true;
  });

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    }, 150);
  });

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    if (!isVisible) return;

    const elapsed = clock.getElapsedTime();

    core.rotation.y = elapsed * 0.08;
    core.rotation.x = elapsed * 0.05;
    particles.rotation.y = -elapsed * 0.03;

    targetRotX += (pointerY * 0.25 - targetRotX) * 0.04;
    targetRotY += (pointerX * 0.3 - targetRotY) * 0.04;
    scene.rotation.x = targetRotX + scrollFactor * 0.15;
    scene.rotation.y = targetRotY;

    camera.position.z = 9 - scrollFactor * 1.5;

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
}

/* ---------------- Init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initScrollReveal();
  initTiltCards();
  initHeroScene();
});

// Comportamiento ligero del sitio: video del hero, parallax del agua, inclinación de tarjetas y aparición al hacer scroll.
// Todo parte de un estado visible: sin JavaScript la página se ve completa (D-309, orden 90).
import { initForms } from './forms';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
type Conn = { saveData?: boolean; effectiveType?: string };
const conn = (navigator as Navigator & { connection?: Conn }).connection;
const slow = !!conn && (conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType ?? ''));

// Video del hero: solo si no hay "reducir movimiento" ni ahorro de datos; el póster queda debajo siempre.
function loadHeroVideo() {
  const video = document.querySelector<HTMLVideoElement>('video[data-hero]');
  if (!video || reduce || slow) return;
  const start = () => {
    for (const [src, type] of [[video.dataset.webm, 'video/webm'], [video.dataset.mp4, 'video/mp4']]) {
      if (!src) continue;
      const s = document.createElement('source');
      s.src = src;
      s.type = type as string;
      video.appendChild(s);
    }
    video.muted = true;
    video.addEventListener('playing', () => video.classList.add('on'), { once: true });
    video.load();
    video.play().catch(() => { /* sin autoplay: se queda el póster */ });
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  const later = () => (idle ? idle(start) : setTimeout(start, 300));
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
}

// Parallax suave del agua del hero.
function parallax() {
  const media = document.querySelector<HTMLElement>('.hero-media');
  if (!media || reduce) return;
  let ticking = false;
  const update = () => {
    const y = Math.min(window.scrollY, 900);
    media.style.transform = `translate3d(0, ${(y * 0.18).toFixed(1)}px, 0) scale(1.04)`;
    ticking = false;
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
}

// Inclinación leve con el puntero, solo con puntero fino.
function tilt() {
  if (reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll<HTMLElement>('.tilt').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--ry', `${(x * 6).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  });
}

// Aparición: el contenido ya se ve; al entrar en pantalla solo sube unos píxeles.
function reveal() {
  if (reduce || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => {
    if (el.getBoundingClientRect().top > window.innerHeight) io.observe(el);
  });
}

loadHeroVideo();
parallax();
tilt();
reveal();
initForms();

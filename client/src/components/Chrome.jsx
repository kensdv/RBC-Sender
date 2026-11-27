import { useEffect, useRef } from 'react';

function RbcMascot({ size = 34 }) {
  return (
    <svg className="rbc-mascot" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <line className="ms-antenna" x1="32" y1="14" x2="32" y2="6" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" />
      <circle className="ms-antenna-tip" cx="32" cy="5" r="2.6" fill="var(--cyan)" />
      <rect className="ms-ear-l" x="5" y="26" width="6" height="12" rx="3" fill="var(--green)" opacity="0.85" />
      <rect className="ms-ear-r" x="53" y="26" width="6" height="12" rx="3" fill="var(--green)" opacity="0.85" />
      <rect className="ms-head" x="10" y="14" width="44" height="30" rx="14" fill="var(--panel2)" stroke="var(--green)" strokeWidth="2" />
      <ellipse className="ms-eye-l" cx="23" cy="29" rx="4.4" ry="5.2" fill="var(--cyan)" />
      <ellipse className="ms-eye-r" cx="41" cy="29" rx="4.4" ry="5.2" fill="var(--cyan)" />
      <circle className="ms-pupil-l" cx="24" cy="30" r="1.6" fill="var(--bg)" />
      <circle className="ms-pupil-r" cx="42" cy="30" r="1.6" fill="var(--bg)" />
      <rect className="ms-mouth" x="25" y="37" width="14" height="3" rx="1.5" fill="var(--green)" />
      <rect className="ms-arm-l" x="2" y="45" width="10" height="4" rx="2" fill="var(--green)" />
      <rect className="ms-arm-r" x="52" y="45" width="10" height="4" rx="2" fill="var(--green)" />
      <rect className="ms-body" x="22" y="44" width="20" height="12" rx="5" fill="var(--panel2)" stroke="var(--green)" strokeWidth="2" />
      <circle cx="32" cy="50" r="2.4" fill="var(--yellow)" />
      <line className="ms-leg-l" x1="27" y1="56" x2="25" y2="62" stroke="var(--green)" strokeWidth="2.6" strokeLinecap="round" />
      <line className="ms-leg-r" x1="37" y1="56" x2="39" y2="62" stroke="var(--green)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function ChromosomeBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize);
    resize();

    // ── Neon galaxy: static stars + slow nebula glow pulses ──
    const STAR_COUNT = 400;
    const NEBULA_COUNT = 6;

    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 0.3 + Math.random() * 1.4,
      alpha: 0.2 + Math.random() * 0.8,
      cyan: Math.random() < 0.2,
      pulse: Math.random() * Math.PI * 2,
      pulseSpd: 0.008 + Math.random() * 0.012,
    }));

    const nebulas = Array.from({ length: NEBULA_COUNT }, () => ({
      cx: Math.random() * window.innerWidth,
      cy: Math.random() * window.innerHeight,
      r: 120 + Math.random() * 200,
      alpha: 0.06 + Math.random() * 0.12,
      pulse: Math.random() * Math.PI * 2,
      pulseSpd: 0.003 + Math.random() * 0.006,
      col: ['0,255,65', '0,220,255', '68,255,136', '0,150,255'][Math.floor(Math.random() * 4)],
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const themeNow = document.documentElement.dataset.theme;
      if (themeNow === 'obsidian') {
        // ── OBSIDIAN: flat ink base + sparse dim stars, no glow gimmick ──
        ctx.fillStyle = '#12140f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (const s of stars) {
          s.pulse += s.pulseSpd;
          const a = s.alpha * 0.35 * (0.6 + 0.4 * Math.sin(s.pulse));
          ctx.fillStyle = `rgba(232,230,223,${a * 0.5})`;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.7, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        // Base — deep phosphor
        ctx.fillStyle = '#020402';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Nebula clouds — slow pulsing radial gradients
        for (const n of nebulas) {
          n.pulse += n.pulseSpd;
          const amp = 0.7 + 0.3 * Math.sin(n.pulse);
          const g = ctx.createRadialGradient(n.cx, n.cy, 0, n.cx, n.cy, n.r * amp);
          g.addColorStop(0,   `rgba(${n.col},${n.alpha * amp})`);
          g.addColorStop(0.5, `rgba(${n.col},${n.alpha * 0.4 * amp})`);
          g.addColorStop(1,   'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(n.cx, n.cy, n.r * amp, 0, Math.PI * 2); ctx.fill();
        }

        // Stars — static positions, pulsing brightness
        for (const s of stars) {
          s.pulse += s.pulseSpd;
          const a = s.alpha * (0.6 + 0.4 * Math.sin(s.pulse));
          const col = s.cyan ? '0,220,255' : '0,255,65';
          ctx.fillStyle = `rgba(${col},${a})`;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
          // Occasional bright cross for larger stars
          if (s.r > 1 && Math.random() < 0.01) {
            ctx.strokeStyle = `rgba(${col},${a * 0.8})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(s.x - s.r * 3, s.y); ctx.lineTo(s.x + s.r * 3, s.y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(s.x, s.y - s.r * 3); ctx.lineTo(s.x, s.y + s.r * 3); ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />;
}

function RbcLogo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="rbcg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2fe06b" /><stop offset="1" stopColor="#00ffff" />
        </linearGradient>
      </defs>
      <path d="M24 2 42 12v24L24 46 6 36V12L24 2Z" fill="url(#rbcg)" opacity="0.14" stroke="url(#rbcg)" strokeWidth="2" />
      <path d="M14 20.5 24 27l10-6.5V32a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2v-11.5Z" fill="none" stroke="#eafff6" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="m14 20.5 10 6.5 10-6.5-10-6.5-10 6.5Z" fill="#eafff6" />
      <path d="M31 14.5c2.5.4 4.5 2.4 4.9 4.9M33.5 10.5c4 .7 7.3 4 8 8" stroke="#00e5a0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Lucide-style stroke icons — crisp at 14px, no font dependency, no tofu.
const NAV_ICONS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  compose: 'M4 4h16v16H4zM4 7l8 6 8-6',
  aiwriter: 'M12 2l2.1 5.9L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-2.1zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z',
  recipients: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.87M15.5 3.13a4 4 0 0 1 0 7.75',
  sorter: 'M3 4h18l-7 8v5l-4 2v-7L3 4z',
  smtp: 'M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zM6 6h.01M6 18h.01',
  delivery: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  schedule: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  bounces: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  analytics: 'M3 21h18M7 16v-5M12 16V8M17 16v-8',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
};
function NavIcon({ name, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={NAV_ICONS[name] || NAV_ICONS.help} />
    </svg>
  );
}


export { RbcMascot, ChromosomeBackground, RbcLogo, NavIcon };

import { useEffect, useRef } from 'react';
import {
  LayoutDashboard, Send, Mail, Sparkles, Users, Filter, Server, Settings2,
  CalendarClock, AlertTriangle, BarChart3, HelpCircle,
} from 'lucide-react';

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
        <linearGradient id="rbcg" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A06659" /><stop offset="0.55" stopColor="#CE9C58" /><stop offset="1" stopColor="#3EB221" />
        </linearGradient>
      </defs>
      <path d="M24 2 42 12v24L24 46 6 36V12L24 2Z" fill="url(#rbcg)" />
      <path d="M14 20.5 24 27l10-6.5V32a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2v-11.5Z" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="m14 20.5 10 6.5 10-6.5-10-6.5-10 6.5Z" fill="#ffffff" />
      <circle cx="36" cy="12" r="3.4" fill="#ffffff" />
      <circle cx="36" cy="12" r="2" fill="#3EB221" />
    </svg>
  );
}

// Free stroke icons from Lucide (ISC). One consistent 1.8px set across the app.
const NAV_ICONS = {
  dashboard: LayoutDashboard,
  send: Send,
  compose: Mail,
  aiwriter: Sparkles,
  recipients: Users,
  sorter: Filter,
  smtp: Server,
  delivery: Settings2,
  schedule: CalendarClock,
  bounces: AlertTriangle,
  analytics: BarChart3,
  help: HelpCircle,
};
function NavIcon({ name, size = 16 }) {
  const Icon = NAV_ICONS[name] || NAV_ICONS.help;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}


export { RbcMascot, ChromosomeBackground, RbcLogo, NavIcon };

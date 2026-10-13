import { useEffect, useRef } from "react";

// Hafif konfeti: kutuphanesiz, ~3 sn calisip kendini temizler.
export default function Confetti({ run }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!run) return;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    resize();
    const colors = ["#4285f4", "#ea4335", "#fbbc04", "#34a853", "#ffffff"];
    const parts = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height * 0.4,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      vx: -2 + Math.random() * 4, vy: 2 + Math.random() * 4,
      r: Math.random() * 6, vr: -0.2 + Math.random() * 0.4,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf; const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.04;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 3200);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (elapsed < 3200) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run]);
  return <canvas ref={ref} className="confetti" />;
}

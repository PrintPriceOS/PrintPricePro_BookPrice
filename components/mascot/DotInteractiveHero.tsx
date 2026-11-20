'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import './dot-ppp.css';

export interface DotInteractiveHeroProps {
  size?: number;
  enableEyeTracking?: boolean;
  interactiveTags?: boolean; // Kept for backwards compatibility, no tags rendered
  className?: string;
  glow?: boolean;
  onToolSelect?: (tool: string) => void;
}

export const DotInteractiveHero: React.FC<DotInteractiveHeroProps> = ({
  size = 220,
  enableEyeTracking = true,
  className = '',
  glow = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<SVGGElement | null>(null);
  const eyesRef = useRef<SVGGElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const eyeLRef = useRef<SVGCircleElement | null>(null);
  const eyeRRef = useRef<SVGCircleElement | null>(null);

  const [squish, setSquish] = useState('scale(1, 1)');

  // Targets de interpolación física
  const physicsRef = useRef({
    targetX: 0,
    targetY: 0,
    currentX: 0,
    currentY: 0,
    isHovered: false,
  });

  // Parpadeo orgánico autónomo
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      if (eyeLRef.current && eyeRRef.current) {
        eyeLRef.current.style.transition = 'transform 0.09s ease-in-out';
        eyeRRef.current.style.transition = 'transform 0.09s ease-in-out';
        eyeLRef.current.style.transform = 'scaleY(0.08) scaleX(1.1)';
        eyeRRef.current.style.transform = 'scaleY(0.08) scaleX(1.1)';

        setTimeout(() => {
          if (eyeLRef.current && eyeRRef.current) {
            eyeLRef.current.style.transform = 'scaleY(1) scaleX(1)';
            eyeRRef.current.style.transform = 'scaleY(1) scaleX(1)';
          }
        }, 120);
      }
    }, 4500);

    return () => clearInterval(blinkInterval);
  }, []);

  // Seguimiento con Eye-Tracking y física de paralaje 3D (30% cuerpo, 100% ojos)
  useEffect(() => {
    if (!enableEyeTracking) return;

    let rafId = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = (e.clientX - centerX) / (rect.width * 0.7);
      const dy = (e.clientY - centerY) / (rect.height * 0.7);

      const dist = Math.hypot(dx, dy);
      const maxRadius = 1.0;
      const clampFactor = dist > maxRadius ? maxRadius / dist : 1;

      physicsRef.current.targetX = dx * clampFactor * 16;
      physicsRef.current.targetY = dy * clampFactor * 14;
    };

    const handleMouseLeave = () => {
      physicsRef.current.targetX = 0;
      physicsRef.current.targetY = 0;
      physicsRef.current.isHovered = false;
    };

    const handleMouseEnter = () => {
      physicsRef.current.isHovered = true;
    };

    const tick = () => {
      const p = physicsRef.current;

      // Lerp suave para la posición de los ojos
      p.currentX += (p.targetX - p.currentX) * 0.14;
      p.currentY += (p.targetY - p.currentY) * 0.14;

      // Paralaje 3D: Cuerpo se mueve al 30%, Ojos al 100%
      const bodyX = (p.currentX * 0.3).toFixed(2);
      const bodyY = (p.currentY * 0.3).toFixed(2);
      const eyeX = p.currentX.toFixed(2);
      const eyeY = p.currentY.toFixed(2);

      bodyRef.current?.setAttribute('transform', `translate(${bodyX}, ${bodyY})`);
      eyesRef.current?.setAttribute('transform', `translate(${eyeX}, ${eyeY})`);

      // Sombra dinámica de suelo
      if (shadowRef.current) {
        const shadowScale = (1 - Math.abs(p.currentY) / 60).toFixed(3);
        shadowRef.current.style.transform = `scaleX(${shadowScale})`;
      }

      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', handleMouseMove);
    containerRef.current?.addEventListener('mouseenter', handleMouseEnter);
    containerRef.current?.addEventListener('mouseleave', handleMouseLeave);
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, [enableEyeTracking]);

  // Rebote elástico al hacer clic (Squash & Stretch)
  const handleBounce = useCallback(() => {
    setSquish('scale(1.18, 0.84)');
    setTimeout(() => setSquish('scale(0.92, 1.10)'), 120);
    setTimeout(() => setSquish('scale(1.05, 0.96)'), 220);
    setTimeout(() => setSquish('scale(1, 1)'), 320);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{
        width: size,
        height: size,
        overflow: 'visible',
      }}
    >
      {/* Resplandor ambiental suave en rojo PrintPrice */}
      {glow && (
        <div
          style={{
            position: 'absolute',
            width: size * 1.3,
            height: size * 1.3,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(229, 53, 43, 0.18) 0%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {/* Contenedor de Flotación Gravedad Cero + Squash & Stretch */}
      <div
        className="dot-hero-float"
        onClick={handleBounce}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 2,
          overflow: 'visible',
        }}
        title="Dot (dot_ppp) · Click to interact"
      >
        {/* Esfera SVG con transformaciones elásticas */}
        <div
          style={{
            transform: squish,
            transition: 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
            width: '100%',
            height: '100%',
            overflow: 'visible',
          }}
        >
          <svg
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              width: '100%',
              height: '100%',
              overflow: 'visible',
              filter: 'drop-shadow(0 20px 35px rgba(229, 53, 43, 0.28))',
            }}
          >
            {/* Grupo Cuerpo: 30% Paralaje */}
            <g ref={bodyRef} className="dot-body-group">
              <circle cx="100" cy="100" r="88" fill="#E5352B" />
            </g>

            {/* Grupo Ojos: 100% Paralaje */}
            <g ref={eyesRef} className="dot-eyes-group">
              <circle
                ref={eyeLRef}
                className="dot-eye"
                cx="74"
                cy="78"
                r="19"
                fill="#FFFFFF"
              />
              <circle
                ref={eyeRRef}
                className="dot-eye"
                cx="126"
                cy="78"
                r="19"
                fill="#FFFFFF"
              />
            </g>
          </svg>
        </div>

        {/* Sombra de suelo dinámica */}
        <div
          ref={shadowRef}
          style={{
            position: 'absolute',
            bottom: '-18px',
            width: size * 0.55,
            height: '10px',
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.35)',
            filter: 'blur(4px)',
            transition: 'transform 0.15s ease-out',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};

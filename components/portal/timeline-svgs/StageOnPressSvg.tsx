import React from 'react';
import type { TimelineSvgProps } from './StagePreflightSvg';

/**
 * Stage 02: On Press (Plates & Print Run) ('StageOnPressSvg.tsx')
 * Technical metaphor: Opposed industrial offset press cylinders (CTP Plate Cylinder vs. Blanket Cylinder)
 * feeding a continuous paper web/sheet with inline spectrophotometric densitometry color control bars.
 */
export const StageOnPressSvg: React.FC<TimelineSvgProps> = ({
  className = 'w-12 h-12',
  status = 'SCHEDULED',
}) => {
  const isLit = status === 'COMPLETED' || status === 'ACTIVE';
  const strokeColor = isLit ? '#ef4444' : 'rgba(239, 68, 68, 0.42)';
  const accentFill = isLit ? 'rgba(239, 68, 68, 0.10)' : 'rgba(239, 68, 68, 0.03)';

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={
        isLit
          ? { filter: 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.42))' }
          : undefined
      }
      aria-hidden="true"
    >
      {/* Side Press Frame Towers (CAD Structural Columns) */}
      <path
        d="M8 10 V54 M56 10 V54 M5 10 H12 M52 10 H59 M5 54 H12 M52 54 H59"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* Top CTP Plate Cylinder */}
      <circle
        cx="32"
        cy="19"
        r="10.5"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.9"
      />
      <circle cx="32" cy="19" r="3.2" stroke={strokeColor} strokeWidth="1.5" />
      {/* Rotation Direction Arc on Top Cylinder */}
      <path
        d="M26 14.5 A7.5 7.5 0 0 1 38 14.5"
        stroke={strokeColor}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M36.5 12.5 L38.5 14.8 L35.8 15.8" stroke={strokeColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />

      {/* Bottom Blanket / Impression Cylinder */}
      <circle
        cx="32"
        cy="43"
        r="10.5"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.9"
      />
      <circle cx="32" cy="43" r="3.2" stroke={strokeColor} strokeWidth="1.5" />
      {/* Counter-Rotation Arc on Bottom Cylinder */}
      <path
        d="M26 47.5 A7.5 7.5 0 0 0 38 47.5"
        stroke={strokeColor}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M36.5 49.5 L38.5 47.2 L35.8 46.2" stroke={strokeColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />

      {/* Paper Sheet / Web Passing Through Nip Point */}
      <path
        d="M4 31 H60"
        stroke={strokeColor}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M11 28.2 H53"
        stroke={strokeColor}
        strokeWidth="1.1"
        strokeDasharray="2.5 2.5"
      />

      {/* Inline Spectrophotometric Densitometry Color Control Bars */}
      <rect x="14" y="55" width="7" height="4" rx="0.8" fill={accentFill} stroke={strokeColor} strokeWidth="1.4" />
      <rect x="24" y="55" width="7" height="4" rx="0.8" fill={accentFill} stroke={strokeColor} strokeWidth="1.4" />
      <rect x="34" y="55" width="7" height="4" rx="0.8" fill={accentFill} stroke={strokeColor} strokeWidth="1.4" />
      <rect x="44" y="55" width="7" height="4" rx="0.8" fill={accentFill} stroke={strokeColor} strokeWidth="1.4" />
    </svg>
  );
};

export default StageOnPressSvg;

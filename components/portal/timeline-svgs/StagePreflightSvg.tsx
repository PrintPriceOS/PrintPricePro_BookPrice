import React from 'react';

export interface TimelineSvgProps {
  className?: string;
  status?: 'COMPLETED' | 'ACTIVE' | 'SCHEDULED';
}

/**
 * Stage 01: Preflight Approved ('StagePreflightSvg.tsx')
 * Technical metaphor: Press sheet / CAD document with corner crop marks, registration targets,
 * perimeter 3.0mm bleed dashed frame, and geometric inspection loupe / laser scan.
 */
export const StagePreflightSvg: React.FC<TimelineSvgProps> = ({
  className = 'w-12 h-12',
  status = 'SCHEDULED',
}) => {
  const isLit = status === 'COMPLETED' || status === 'ACTIVE';
  const strokeColor = isLit ? '#dc2626' : 'rgba(220, 38, 38, 0.45)';
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
      {/* Corner Crop Marks (Registration & Trim Geometry) */}
      <path
        d="M6 14 H12 M10 10 V16 M58 14 H52 M54 10 V16 M6 50 H12 M10 54 V48 M58 50 H52 M54 54 V48"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Outer Bleed Box (Dashed 3.0mm Bleed Frame) */}
      <rect
        x="11"
        y="11"
        width="42"
        height="42"
        rx="2"
        stroke={strokeColor}
        strokeWidth="1.35"
        strokeDasharray="3 2.5"
      />

      {/* Inner Trim Box (Press-Ready Document Sheet) */}
      <rect
        x="15"
        y="15"
        width="30"
        height="34"
        rx="1.5"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Typography / Safe Area Box Lines */}
      <path
        d="M20 22 H36 M20 27 H34 M20 32 H30 M20 37 H27"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* Top Registration Crosshair Target */}
      <circle cx="30" cy="8" r="2.2" stroke={strokeColor} strokeWidth="1.3" />
      <path d="M26.5 8 H33.5 M30 4.5 V11.5" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />

      {/* Geometric Preflight Inspection Loupe + Check */}
      <circle
        cx="42"
        cy="41"
        r="10"
        className="fill-white dark:fill-[#0f1115]"
        stroke={strokeColor}
        strokeWidth="2"
      />
      <circle
        cx="42"
        cy="41"
        r="7.5"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
      <path
        d="M38.5 41.2 L41 43.7 L46 38.5"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M49.2 48.2 L55.5 54.5"
        stroke={strokeColor}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default StagePreflightSvg;

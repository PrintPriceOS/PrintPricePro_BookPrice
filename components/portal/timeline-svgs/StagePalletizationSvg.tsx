import React from 'react';
import type { TimelineSvgProps } from './StagePreflightSvg';

/**
 * Stage 04: EPAL Palletization ('StagePalletizationSvg.tsx')
 * Technical metaphor: Certified Euro-Pallet EPAL (with visible blocks, deckboards & fork entry slots),
 * 3D isometric cubed book cartons, corner edge protectors, and perimeter stretch-wrap strapping.
 */
export const StagePalletizationSvg: React.FC<TimelineSvgProps> = ({
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
      {/* 3D Isometric Cubed Book Cartons Load */}
      {/* Top Isometric Diamond Face */}
      <path
        d="M32 8 L52 18 L32 28 L12 18 Z"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
      {/* Left Isometric Cube Face */}
      <path
        d="M12 18 L32 28 V46 L12 36 Z"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
      {/* Right Isometric Cube Face */}
      <path
        d="M52 18 L32 28 V46 L52 36 Z"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.85"
        strokeLinejoin="round"
      />

      {/* Internal Carton Subdivisions (FEFCO 0201 Book Boxes) */}
      <path
        d="M22 13 L42 23 M42 13 L22 23 M12 27 L32 37 L52 27 M22 23 V41 M42 23 V41"
        stroke={strokeColor}
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Perimeter Stretch-Wrap & Edge Protectors (Dashed Halo) */}
      <path
        d="M9 16 V38 M55 16 V38"
        stroke={strokeColor}
        strokeWidth="1.4"
        strokeDasharray="2.5 2"
        strokeLinecap="round"
      />

      {/* GS1-128 SSCC-18 Logistic Label on Right Face */}
      <rect
        x="37"
        y="29"
        width="7"
        height="5"
        transform="skewY(-26)"
        className="fill-white dark:fill-[#0f1115]"
        stroke={strokeColor}
        strokeWidth="1.2"
      />

      {/* Homologated Euro-Pallet EPAL Base (1200x800mm Skids & Blocks) */}
      <path
        d="M7 46 H57 M7 54 H57"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* 3 EPAL Support Blocks & Forklift Entry Tunnels */}
      <rect x="9" y="46" width="8" height="8" fill={accentFill} stroke={strokeColor} strokeWidth="1.75" />
      <rect x="28" y="46" width="8" height="8" fill={accentFill} stroke={strokeColor} strokeWidth="1.75" />
      <rect x="47" y="46" width="8" height="8" fill={accentFill} stroke={strokeColor} strokeWidth="1.75" />
      {/* Fork Entry Slots */}
      <path d="M19 50 H26 M38 50 H45" stroke={strokeColor} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
};

export default StagePalletizationSvg;

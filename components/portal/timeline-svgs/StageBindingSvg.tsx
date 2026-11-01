import React from 'react';
import type { TimelineSvgProps } from './StagePreflightSvg';

/**
 * Stage 03: Binding & Finishing ('StageBindingSvg.tsx')
 * Technical metaphor: Open book block receiving spine milling & reactive PUR adhesive
 * at the spine hub, with a perpendicular 3-knife trimmer blade descending cleanly over the block.
 */
export const StageBindingSvg: React.FC<TimelineSvgProps> = ({
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
      {/* Top 3-Knife Guillotine Trimmer Assembly & Descending Vectors */}
      <path
        d="M14 8 H50 V16 L32 22 L14 16 V8 Z"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
      {/* Blade Bevel Line */}
      <path d="M16 14 L32 19.5 L48 14" stroke={strokeColor} strokeWidth="1.3" strokeDasharray="2.5 2" />
      {/* Vertical Compression / Cut Arrows */}
      <path
        d="M22 4 V11 M42 4 V11 M32 22 V29"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M29.5 26.5 L32 29.5 L34.5 26.5"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Open Book Signatures & Milled Spine Block */}
      {/* Left Wing Signatures */}
      <path
        d="M8 36 C15 33 24 34 32 39 V53 C24 48 15 47 8 50 V36 Z"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
      {/* Right Wing Signatures */}
      <path
        d="M56 36 C49 33 40 34 32 39 V53 C40 48 49 47 56 50 V36 Z"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
      {/* Internal Page Signature Layers */}
      <path
        d="M12 40 C18 38 25 39 32 43 C39 39 46 38 52 40 M12 45 C18 43 25 44 32 48 C39 44 46 43 52 45"
        stroke={strokeColor}
        strokeWidth="1.3"
        strokeLinecap="round"
      />

      {/* Outer Wrap Cover & PUR Spine Channel */}
      <path
        d="M6 53 C15 50 24 51 32 56 C40 51 49 50 58 53"
        stroke={strokeColor}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {/* Reactive PUR Spine Bead & Milling Notches */}
      <circle cx="32" cy="56" r="2.8" fill={accentFill} stroke={strokeColor} strokeWidth="1.75" />
      <path d="M26 58 H38" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};

export default StageBindingSvg;

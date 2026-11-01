import React from 'react';
import type { TimelineSvgProps } from './StagePreflightSvg';

/**
 * Stage 05: In Transit / Delivered ('StageInTransitSvg.tsx')
 * Technical metaphor: Heavy B2B 13.6m articulated freight trailer in technical side-isometric profile
 * carrying palletized cargo, with satellite GPS telemetry waves and dock route vector.
 */
export const StageInTransitSvg: React.FC<TimelineSvgProps> = ({
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
      {/* Satellite / GPS Telemetry Waves Above Trailer */}
      <path
        d="M21 15 A8 8 0 0 1 33 15 M17.5 11.5 A13 13 0 0 1 36.5 11.5"
        stroke={strokeColor}
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <circle cx="27" cy="18" r="1.6" fill={strokeColor} />

      {/* 13.6m Articulated Freight Trailer Box */}
      <rect
        x="6"
        y="22"
        width="34"
        height="22"
        rx="2"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.9"
      />
      {/* Internal Palletized Load Silhouette Inside Trailer */}
      <path
        d="M11 38 H35 M13 28 H21 V38 H13 Z M25 28 H33 V38 H25 Z"
        stroke={strokeColor}
        strokeWidth="1.3"
        strokeDasharray="2 1.5"
      />

      {/* Tractor Cab Unit (Aerodynamic B2B Freight Cab) */}
      <path
        d="M40 27 H50 L57 35 V44 H40 V27 Z"
        fill={accentFill}
        stroke={strokeColor}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      {/* Cab Windshield */}
      <path
        d="M44 30 H49.2 L53.5 35 H44 V30 Z"
        stroke={strokeColor}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* Chassis & Dual Rear Axle + Tractor Axle Wheels */}
      <circle cx="14" cy="46" r="4.5" fill="#0f1115" stroke={strokeColor} strokeWidth="1.9" />
      <circle cx="14" cy="46" r="1.5" fill={strokeColor} />
      <circle cx="25" cy="46" r="4.5" fill="#0f1115" stroke={strokeColor} strokeWidth="1.9" />
      <circle cx="25" cy="46" r="1.5" fill={strokeColor} />
      <circle cx="49" cy="46" r="4.5" fill="#0f1115" stroke={strokeColor} strokeWidth="1.9" />
      <circle cx="49" cy="46" r="1.5" fill={strokeColor} />

      {/* Highway / Dock Leveler Telemetry Track Line */}
      <path
        d="M3 54 H61 M8 58 H22 M30 58 H48"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default StageInTransitSvg;

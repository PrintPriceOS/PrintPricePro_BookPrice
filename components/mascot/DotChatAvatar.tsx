import React, { useId } from 'react';
import './dot-ppp.css';

export type DotChatState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'success';

export interface DotChatAvatarProps {
  state?: DotChatState;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Avatar reactivo "Dot" (dot_ppp) para cajas de chat e interfaces de Agente IA.
 * Cero dependencias externas, animaciones aceleradas por GPU.
 * Especificación canónica: viewBox 0 0 200 200, cuerpo #E5352B r=88, ojos r=19 en (74,78) y (126,78).
 */
export const DotChatAvatar: React.FC<DotChatAvatarProps> = ({
  state = 'idle',
  size = 40,
  className = '',
  title = 'Dot · Asistente IA PrintPrice.pro',
}) => {
  const instanceId = useId();

  return (
    <div
      data-state={state}
      className={`dot-ppp-avatar ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        overflow: 'visible',
      }}
      role="img"
      aria-label={title}
      title={title}
    >
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: '100%',
          height: '100%',
          overflow: 'visible',
        }}
      >
        {/* Anillo de pulso para estados listening, thinking y success */}
        <circle
          className="dot-pulse-ring"
          cx="100"
          cy="100"
          r="88"
          stroke="#E5352B"
          strokeWidth="4"
        />

        {/* Grupo Cuerpo: Squash & Stretch y respiración */}
        <g className="dot-body-group">
          <circle cx="100" cy="100" r="88" fill="#E5352B" />

          {/* Grupo Ojos: Parpadeo y seguimiento */}
          <g className="dot-eyes-group">
            <circle
              id={`dot-eye-l-${instanceId}`}
              className="dot-eye"
              cx="74"
              cy="78"
              r="19"
              fill="#FFFFFF"
            />
            <circle
              id={`dot-eye-r-${instanceId}`}
              className="dot-eye"
              cx="126"
              cy="78"
              r="19"
              fill="#FFFFFF"
            />
          </g>
        </g>

        {/* Destellos estrellados para estado Success */}
        <path
          className="dot-sparkle"
          d="M168 32L171 41L180 44L171 47L168 56L165 47L156 44L165 41L168 32Z"
          fill="#E5352B"
        />
        <path
          className="dot-sparkle"
          d="M32 38L34 44L40 46L34 48L32 54L30 48L24 46L30 44L32 38Z"
          fill="#E5352B"
        />
      </svg>
    </div>
  );
};

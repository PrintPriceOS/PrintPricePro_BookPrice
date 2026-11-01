import React from 'react';
import StagePreflightSvg, { type TimelineSvgProps } from './StagePreflightSvg';
import StageOnPressSvg from './StageOnPressSvg';
import StageBindingSvg from './StageBindingSvg';
import StagePalletizationSvg from './StagePalletizationSvg';
import StageInTransitSvg from './StageInTransitSvg';

export type { TimelineSvgProps };
export {
  StagePreflightSvg,
  StageOnPressSvg,
  StageBindingSvg,
  StagePalletizationSvg,
  StageInTransitSvg,
};

export const renderStageTimelineSvg = (
  stepNumber: number,
  status: 'COMPLETED' | 'ACTIVE' | 'SCHEDULED',
  className = 'w-12 h-12'
): React.ReactNode => {
  switch (stepNumber) {
    case 1:
      return <StagePreflightSvg status={status} className={className} />;
    case 2:
      return <StageOnPressSvg status={status} className={className} />;
    case 3:
      return <StageBindingSvg status={status} className={className} />;
    case 4:
      return <StagePalletizationSvg status={status} className={className} />;
    case 5:
    default:
      return <StageInTransitSvg status={status} className={className} />;
  }
};

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
      return React.createElement(StagePreflightSvg, { status, className });
    case 2:
      return React.createElement(StageOnPressSvg, { status, className });
    case 3:
      return React.createElement(StageBindingSvg, { status, className });
    case 4:
      return React.createElement(StagePalletizationSvg, { status, className });
    case 5:
    default:
      return React.createElement(StageInTransitSvg, { status, className });
  }
};

import React from 'react';

interface CheckoutStepperProps {
  currentStep: 'specs' | 'offer' | 'upload' | 'checkout';
}

const CheckoutStepper: React.FC<CheckoutStepperProps> = ({ currentStep }) => {
  const steps = [
    { key: 'specs', label: '1. Configure Specs', shortLabel: 'Configure Specs' },
    { key: 'offer', label: '2. Select BPE Offer', shortLabel: 'Select BPE Offer' },
    { key: 'upload', label: '3. Production PDFs', shortLabel: 'Production PDFs' },
    { key: 'checkout', label: '4. Order Intake', shortLabel: 'Order Intake' },
  ];

  const currentIdx = Math.max(0, steps.findIndex((s) => s.key === currentStep));
  const activeStep = steps[currentIdx] || steps[0];
  const progressPct = Math.round(((currentIdx + 1) / steps.length) * 100);

  return (
    <div
      className="mb-3 sm:mb-6 bg-corporate-secondary border border-corporate-border rounded-xl sm:rounded-2xl px-3.5 sm:px-6 py-2.5 sm:py-4 shadow-sm transition-colors"
      role="region"
      aria-label="Book Price Workflow Progress"
    >
      {/* COMPACT MOBILE PROGRESS BAR (< 640px) */}
      <div className="sm:hidden space-y-2" data-testid="mobile-compact-progress">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[9px] font-technical font-bold uppercase tracking-wider text-corporate-muted shrink-0">
              BOOK PRICE WORKFLOW
            </span>
            <span className="text-corporate-border-strong shrink-0">·</span>
            <span
              className="text-[11px] font-sans font-extrabold text-corporate-text truncate"
              data-testid="mobile-active-step-label"
            >
              {activeStep.shortLabel}
            </span>
          </div>
          <span
            className="px-2 py-0.5 rounded-md bg-corporate-elevated border border-corporate-border text-[10px] font-technical font-bold text-corporate-accent shrink-0 tabular-nums"
            data-testid="mobile-step-counter"
          >
            Step {currentIdx + 1} of {steps.length}
          </span>
        </div>

        {/* Thin horizontal progress bar with corporate red fill & smooth transition */}
        <div
          className="w-full h-1.5 bg-corporate-elevated rounded-full overflow-hidden border border-corporate-border/60"
          role="progressbar"
          aria-valuenow={currentIdx + 1}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-label={`Book Price Workflow: Step ${currentIdx + 1} of ${steps.length}, ${activeStep.shortLabel}`}
        >
          <div
            className="h-full bg-corporate-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* DESKTOP & TABLET 4-PHASE STEPPER (>= 640px) */}
      <div
        className="hidden sm:flex items-center justify-between max-w-4xl mx-auto w-full gap-2"
        data-testid="desktop-four-phase-stepper"
      >
        {steps.map((step, idx) => {
          const isActive = step.key === currentStep;
          const isPast = currentIdx > idx;

          return (
            <React.Fragment key={step.key}>
              <div
                className="flex items-center gap-2.5 sm:gap-3 relative z-10 min-w-0 select-none"
                aria-current={isActive ? 'step' : undefined}
              >
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg shrink-0 flex items-center justify-center text-[10px] sm:text-[11px] font-technical font-black transition-all duration-300 border ${
                    isActive
                      ? 'bg-corporate-accent border-corporate-accent text-white shadow-[0_0_16px_rgba(220,0,0,0.28)]'
                      : isPast
                        ? 'bg-corporate-text border-corporate-text text-corporate-secondary'
                        : 'bg-corporate-elevated border-corporate-border text-corporate-muted'
                  }`}
                >
                  {isPast ? '✓' : idx + 1}
                </div>
                <span
                  className={`text-[10px] md:text-[11px] font-technical font-bold tracking-wider uppercase truncate transition-colors ${
                    isActive
                      ? 'text-corporate-accent font-black'
                      : isPast
                        ? 'text-corporate-text'
                        : 'text-corporate-muted'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className="flex-1 h-1 mx-2 sm:mx-3 relative min-w-[16px] rounded-full overflow-hidden bg-corporate-border">
                  <div
                    className="absolute inset-y-0 left-0 bg-corporate-accent rounded-full transition-all duration-500 ease-in-out"
                    style={{ width: isPast ? '100%' : '0%' }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default CheckoutStepper;

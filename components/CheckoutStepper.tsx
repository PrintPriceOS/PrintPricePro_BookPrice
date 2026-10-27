import React from 'react';

interface CheckoutStepperProps {
  currentStep: 'specs' | 'offer' | 'upload' | 'checkout';
}

const CheckoutStepper: React.FC<CheckoutStepperProps> = ({ currentStep }) => {
  const steps = [
    { key: 'specs', label: 'Configure' },
    { key: 'offer', label: 'Select Offer' },
    { key: 'upload', label: 'Upload Files' },
    { key: 'checkout', label: 'Confirmation' },
  ];

  const currentIdx = steps.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center justify-between mb-8 sm:mb-12 px-2 sm:px-4 max-w-3xl mx-auto w-full">
      {steps.map((step, idx) => {
        const isActive = step.key === currentStep;
        const isPast = currentIdx > idx;
        
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center relative z-10">
              <div 
                className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-[10px] sm:text-[11px] font-sans font-black transition-all duration-500 border-2 ${
                  isActive ? 'bg-corporate-accent border-corporate-accent text-white shadow-[0_0_25px_rgba(220,0,0,0.4)] scale-110' : 
                  isPast ? 'bg-corporate-text border-corporate-text text-corporate-primary' : 
                  'bg-corporate-secondary border-white/10 text-corporate-muted'
                }`}
              >
                {isPast ? '✓' : idx + 1}
              </div>
              <div className="absolute -bottom-6 hidden sm:block whitespace-nowrap">
                <span className={`text-[8px] font-sans font-black tracking-monolith uppercase transition-colors duration-500 ${
                  isActive ? 'text-corporate-accent' : 
                  isPast ? 'text-corporate-text' : 
                  'text-corporate-muted'
                }`}>
                  {step.label}
                </span>
              </div>
            </div>
            {idx < steps.length - 1 && (
              <div className="flex-1 h-[2px] mx-4 -mt-6 relative">
                <div className="absolute inset-0 bg-white/5" />
                <div 
                  className="absolute inset-0 bg-corporate-accent/40 transition-all duration-700 ease-in-out" 
                  style={{ width: isPast ? '100%' : '0%' }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default CheckoutStepper;

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  DocumentMagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { OrderIntent, PreflightJob } from '../types';

interface Props {
  orderIntent: OrderIntent;
  onUpdate?: (updated: OrderIntent) => void;
}

const PreflightJobItem: React.FC<{ job: PreflightJob }> = ({ job }) => {
  const isPending = ['PENDING', 'RUNNING', 'NOT_STARTED'].includes(job.status);
  const isPassed = job.status === 'PASSED';
  const isFailed = job.status === 'FAILED';
  const isError = job.status === 'ERROR';

  return (
    <div className="bg-corporate-primary/40 border border-corporate-border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-corporate-secondary border border-corporate-border">
            <DocumentMagnifyingGlassIcon className="w-4 h-4 text-corporate-muted" />
          </div>
          <div>
            <p className="text-[0.6rem] font-technical font-black uppercase tracking-monolith text-corporate-muted">
              {job.role.replace('_', ' ')}
            </p>
            <p className="text-[0.7rem] font-technical font-bold text-corporate-text truncate max-w-[120px]" title={job.file_id}>
              {job.file_id.split('_').pop()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPending && <ClockIcon className="w-4 h-4 text-yellow-500 animate-pulse" />}
          {isPassed && <CheckCircleIcon className="w-4 h-4 text-green-500" />}
          {isFailed && <XCircleIcon className="w-4 h-4 text-corporate-accent" />}
          {isError && <ExclamationTriangleIcon className="w-4 h-4 text-orange-500" />}
          
          <span className={`text-[0.6rem] font-black uppercase tracking-widest ${
            isPassed ? 'text-green-500' : isFailed ? 'text-corporate-accent' : isPending ? 'text-yellow-500' : 'text-corporate-muted'
          }`}>
            {job.status}
          </span>
        </div>
      </div>

      {(isFailed || job.findings?.length) && (
        <div className="border-t border-corporate-border pt-3">
          <div className="flex items-center gap-4 text-[0.6rem] font-technical uppercase tracking-wider text-corporate-muted mb-2">
            <span>Risk: <span className={job.risk_level === 'CRITICAL' ? 'text-corporate-accent' : 'text-corporate-text'}>{job.risk_level || 'UNKNOWN'}</span></span>
            <span>Issues: <span className="text-corporate-text">{job.issue_count || 0}</span></span>
            <span>Critical: <span className="text-corporate-accent">{job.critical_count || 0}</span></span>
          </div>
          {job.findings && job.findings.length > 0 && (
            <ul className="space-y-1">
              {job.findings.slice(0, 3).map((f: any, i: number) => (
                <li key={i} className="text-[0.65rem] text-corporate-text-secondary flex gap-2">
                  <span className="text-corporate-accent">•</span>
                  <span className="truncate">{f.message || f.description || 'Validation issue'}</span>
                </li>
              ))}
              {job.findings.length > 3 && (
                <li className="text-[0.6rem] text-corporate-muted italic">
                  + {job.findings.length - 3} more issues...
                </li>
              )}
            </ul>
          )}
        </div>
      )}
      
      {isError && job.error && (
        <div className="text-[0.65rem] text-orange-400 bg-orange-400/5 p-2 border border-orange-400/20">
          {job.error}
        </div>
      )}
    </div>
  );
};

const OrderIntentPreflightPanel: React.FC<Props> = ({ orderIntent, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preflight = orderIntent.preflight;
  const isNotStarted = !preflight || preflight.status === 'NOT_STARTED';
  const isRunning = preflight?.status === 'RUNNING' || preflight?.status === 'PENDING' || preflight?.status === 'PARTIAL';
  const isPassed = preflight?.status === 'PASSED';
  const isFailed = preflight?.status === 'FAILED';
  const isNotConfigured = preflight?.status === 'NOT_CONFIGURED';

  const startPreflight = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/order-intents/${orderIntent.order_intent_id}/preflight/start`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to start preflight.');
        // If it's NOT_CONFIGURED, we still want to refresh to show that status
        if (data.error === 'PREFLIGHT_NOT_CONFIGURED' && onUpdate) {
            // We can fetch details or just wait for polling logic to handle it if we refresh intent
        }
      }
      
      // Refresh intent details
      const refreshRes = await fetch(`/api/order-intents/${orderIntent.order_intent_id}`);
      const refreshData = await refreshRes.json();
      if (refreshData.ok && onUpdate) {
        onUpdate(refreshData.order_intent);
      }
    } catch (err) {
      setError('Connection error. Could not start validation.');
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = useCallback(async () => {
    if (!isRunning && !polling) return;
    try {
      const res = await fetch(`/api/order-intents/${orderIntent.order_intent_id}/preflight`);
      const data = await res.json();
      if (data.ok && onUpdate) {
        onUpdate({ ...orderIntent, preflight: data.preflight });
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, [orderIntent, isRunning, polling, onUpdate]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(pollStatus, 5000);
    }
    return () => clearInterval(interval);
  }, [isRunning, pollStatus]);

  const manualRefresh = async () => {
      setPolling(true);
      await pollStatus();
      setPolling(false);
  };

  return (
    <div className="bg-corporate-secondary border border-corporate-border overflow-hidden">
      <div className="h-[2px] w-full bg-corporate-accent/50" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-corporate-accent/10 border border-corporate-accent/20">
              <DocumentMagnifyingGlassIcon className="w-5 h-5 text-corporate-accent" />
            </div>
            <div>
              <h3 className="text-[0.75rem] font-black uppercase tracking-widest text-corporate-text">
                Preflight Validation
              </h3>
              <p className="text-[0.6rem] font-technical text-corporate-muted uppercase tracking-wider">
                Asset Integrity & Production Readiness Check
              </p>
            </div>
          </div>

          {isRunning && (
            <button 
                onClick={manualRefresh}
                disabled={polling}
                className="p-2 text-corporate-muted hover:text-corporate-accent transition-colors"
            >
                <ArrowPathIcon className={`w-4 h-4 ${polling ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {isNotStarted && (
          <div className="flex flex-col items-center justify-center py-8 bg-corporate-primary/20 border border-dashed border-corporate-border gap-4">
            <p className="text-[0.7rem] text-corporate-text-secondary text-center max-w-[280px]">
              Files are uploaded but have not been validated for production readiness.
            </p>
            <button
              onClick={startPreflight}
              disabled={loading}
              className="flex items-center gap-2 bg-corporate-accent hover:bg-corporate-accent-hover px-6 py-2.5 text-[0.7rem] font-black uppercase tracking-monolith text-white transition-all disabled:opacity-50"
            >
              {loading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Start Validation'}
            </button>
          </div>
        )}

        {isNotConfigured && (
          <div className="p-4 bg-orange-400/5 border border-orange-400/20 flex gap-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-orange-400 shrink-0" />
            <div>
              <p className="text-[0.7rem] font-bold text-orange-400 uppercase tracking-wider mb-1">
                Preflight Not Configured
              </p>
              <p className="text-[0.65rem] text-orange-400/80">
                Automated preflight validation is not enabled in this environment. Manual verification is required before order finalization.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-corporate-accent/5 border border-corporate-accent/20 text-[0.65rem] text-corporate-accent font-bold uppercase tracking-wider">
            {error}
          </div>
        )}

        {(preflight?.jobs && preflight.jobs.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {preflight.jobs.map((job, i) => (
              <PreflightJobItem key={i} job={job} />
            ))}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-corporate-border flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted">
              Preflight Status
            </span>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isPassed ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : isFailed ? 'bg-corporate-accent shadow-[0_0_8px_rgba(220,0,0,0.5)]' : isRunning ? 'bg-yellow-500 animate-pulse' : 'bg-corporate-muted'}`} />
              <span className={`text-[0.7rem] font-black uppercase tracking-[0.15em] ${isPassed ? 'text-green-500' : isFailed ? 'text-corporate-accent' : isRunning ? 'text-yellow-500' : 'text-corporate-muted'}`}>
                {preflight?.status || 'NOT STARTED'}
              </span>
            </div>
          </div>

          <div className="text-right">
             <span className="text-[0.6rem] font-technical uppercase tracking-widest text-corporate-muted block mb-1">
              Billing Status
            </span>
            {isPassed ? (
                <span className="text-[0.7rem] font-black uppercase tracking-[0.15em] text-green-500/80">
                    READY FOR INVOICE
                </span>
            ) : (
                <span className="text-[0.65rem] font-technical italic text-corporate-muted">
                    Blocked by Preflight
                </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderIntentPreflightPanel;

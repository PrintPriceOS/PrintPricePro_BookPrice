import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ArrowUpTrayIcon, 
  DocumentTextIcon, 
  XCircleIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

interface CustomerAction {
  orderId: string;
  requiredFiles: string[];
  blockers: string[];
  message?: string;
  expiresAt?: string;
  status?: string;
}

interface UploadedFileMetadata {
  storageId: string;
  role: string;
  originalName: string;
  sizeBytes: number;
  checksumSha256: string;
  storagePath: string;
}

interface CustomerRemediationPageProps {
  orderId: string;
  token: string;
}

export const CustomerRemediationPage: React.FC<CustomerRemediationPageProps> = ({ orderId, token }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<CustomerAction | null>(null);
  
  // Track upload status per role
  const [uploads, setUploads] = useState<Record<string, {
    file: File | null;
    status: 'idle' | 'uploading' | 'success' | 'error';
    error?: string;
    metadata?: UploadedFileMetadata;
  }>>({});

  // Run status
  const [running, setRunning] = useState<boolean>(false);
  const [runOutcome, setRunOutcome] = useState<{
    status: 'success' | 'blocked' | 'error';
    message: string;
    updatedBlockers?: string[];
  } | null>(null);

  // Fetch customer action details on mount
  const fetchAction = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/customer-action/${orderId}/${token}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error fetching action details (Status ${response.status})`);
      }
      const data = await response.json();
      setAction(data);

      // Initialize upload states based on required files
      const initialUploads: typeof uploads = {};
      const required = data.requiredFiles || data.required_files || [];
      required.forEach((role: string) => {
        initialUploads[role] = { file: null, status: 'idle' };
      });
      setUploads(initialUploads);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load remediation token. It may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    fetchAction();
  }, [fetchAction]);

  // Handle file upload
  const handleUploadFile = async (role: string, file: File) => {
    setUploads(prev => ({
      ...prev,
      [role]: { ...prev[role], file, status: 'uploading', error: undefined }
    }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('role', role);

      const response = await fetch(`/api/customer-action/${orderId}/${token}/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || `Upload failed (Status ${response.status})`);
      }

      const data = await response.json();
      setUploads(prev => ({
        ...prev,
        [role]: {
          ...prev[role],
          status: 'success',
          metadata: data.metadata
        }
      }));
    } catch (err: any) {
      console.error(err);
      setUploads(prev => ({
        ...prev,
        [role]: {
          ...prev[role],
          status: 'error',
          error: err.message || 'Upload failed'
        }
      }));
    }
  };

  // Trigger remediation run
  const handleRunRemediation = async () => {
    setRunning(true);
    setRunOutcome(null);

    try {
      const response = await fetch(`/api/customer-action/${orderId}/${token}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || `Validation run failed (Status ${response.status})`);
      }

      // Read status from response
      const status = data.status || data.remediationStatus || '';
      const isSuccess = ['RESOLVED', 'READY_FOR_INVOICE', 'SUCCESS'].includes(status.toUpperCase());
      const isStillBlocked = ['STILL_BLOCKED', 'FILE_REUPLOAD_REQUIRED', 'BLOCKED'].includes(status.toUpperCase());

      if (isSuccess) {
        setRunOutcome({
          status: 'success',
          message: data.message || 'Order successfully validated and approved for invoicing!'
        });
      } else if (isStillBlocked) {
        setRunOutcome({
          status: 'blocked',
          message: data.message || 'The validation run was completed, but issues remain. Please check the blockers and try again.',
          updatedBlockers: data.blockers || data.required_files_blockers || []
        });
        // If there are updated blockers or required files, refresh the action details
        if (data.blockers) {
          setAction(prev => prev ? { ...prev, blockers: data.blockers } : null);
        }
      } else {
        setRunOutcome({
          status: 'success',
          message: data.message || `Validation run completed. Status: ${status}`
        });
      }
    } catch (err: any) {
      console.error(err);
      setRunOutcome({
        status: 'error',
        message: err.message || 'An error occurred during the validation run.'
      });
    } finally {
      setRunning(false);
    }
  };

  // Format file role label for customer viewing
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'INTERIOR_PDF':
        return 'Interior PDF (Book Content)';
      case 'COVER_PDF':
        return 'Cover PDF (Cover, Spine & Back)';
      default:
        return role;
    }
  };

  // Render Loading State
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-corporate-secondary border border-corporate-border p-12">
        <ArrowPathIcon className="w-8 h-8 text-corporate-accent animate-spin" />
        <p className="mt-4 text-[0.65rem] font-technical font-black tracking-monolith text-corporate-accent uppercase">
          Verifying Customer Action Token...
        </p>
      </div>
    );
  }

  // Render Error State (Token Invalid or Expired)
  if (error || !action) {
    return (
      <div className="bg-corporate-secondary border border-red-500/30 p-8 max-w-2xl mx-auto my-12 animate-in fade-in">
        <div className="flex items-start gap-4">
          <ExclamationTriangleIcon className="w-6 h-6 text-red-500 shrink-0" />
          <div>
            <h2 className="text-[0.75rem] font-technical font-black tracking-monolith text-red-500 uppercase mb-4">
              Access Token Error
            </h2>
            <p className="text-sm text-corporate-text mb-6">
              {error || 'This link is invalid, expired, or has already been completed.'}
            </p>
            <p className="text-xs text-corporate-text-secondary leading-relaxed">
              If your printing service request is active, please request a new remediation link from the administration portal.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const requiredFiles = action.requiredFiles || [];
  const blockers = action.blockers || [];
  const isExpired = action.expiresAt ? new Date(action.expiresAt) < new Date() : false;

  // Check if all required files have a status of 'success'
  const allUploaded = requiredFiles.length > 0 && requiredFiles.every(role => uploads[role]?.status === 'success');

  // Render success screen after validation run
  if (runOutcome && runOutcome.status === 'success') {
    return (
      <div className="bg-corporate-secondary border border-corporate-accent/40 p-8 max-w-2xl mx-auto my-12 animate-in fade-in">
        <div className="flex items-start gap-4">
          <CheckCircleIcon className="w-8 h-8 text-corporate-accent shrink-0" />
          <div>
            <h2 className="text-[0.75rem] font-technical font-black tracking-monolith text-corporate-accent uppercase mb-4">
              Remediation Action Complete
            </h2>
            <p className="text-sm text-corporate-text mb-6">
              {runOutcome.message}
            </p>
            <div className="border-t border-corporate-border pt-4">
              <p className="text-xs text-corporate-text-secondary">
                You can close this window now. The administrative pipeline has been advanced to the next production step.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto my-8 space-y-8 animate-in fade-in">
      {/* Expiry / Header Banner */}
      <div className="bg-corporate-secondary border-l-4 border-corporate-accent p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[0.8rem] font-technical font-black tracking-monolith text-corporate-accent uppercase">
            Action Required: Fix Order Layout
          </h1>
          <p className="text-xs text-corporate-text-secondary mt-1">
            Order Reference: <span className="font-technical text-corporate-text">{orderId}</span>
          </p>
        </div>
        
        {action.expiresAt && (
          <div className="flex items-center gap-2 text-xs font-technical text-corporate-muted uppercase tracking-wider">
            <ClockIcon className="w-4 h-4 text-corporate-accent" />
            <span>
              Expires: {isExpired ? (
                <span className="text-red-500 font-bold">Expired</span>
              ) : (
                new Date(action.expiresAt).toLocaleString()
              )}
            </span>
          </div>
        )}
      </div>

      {/* Message and Printer Blockers */}
      <div className="bg-corporate-secondary border border-corporate-border p-6 space-y-4">
        <h2 className="text-[0.65rem] font-technical font-black tracking-monolith text-corporate-accent uppercase">
          Issues Identified by Print Facility
        </h2>
        {action.message && (
          <p className="text-sm text-corporate-text leading-relaxed">
            {action.message}
          </p>
        )}
        
        {blockers.length > 0 && (
          <div className="bg-corporate-primary/50 border-l border-red-500/30 p-4 space-y-2">
            <p className="text-[10px] font-technical font-black tracking-monolith text-red-400 uppercase">
              Validation Blockers ({blockers.length})
            </p>
            <ul className="list-disc pl-4 space-y-1.5">
              {blockers.map((blocker, idx) => (
                <li key={idx} className="text-xs text-corporate-text-secondary leading-relaxed">
                  {blocker}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* File Upload Sections */}
      <div className="space-y-6">
        <h2 className="text-[0.65rem] font-technical font-black tracking-monolith text-corporate-text-secondary uppercase">
          Required PDF Reuploads
        </h2>

        {requiredFiles.map((role) => {
          const up = uploads[role] || { status: 'idle', file: null };
          
          return (
            <div key={role} className="bg-corporate-secondary border border-corporate-border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-technical font-bold text-corporate-text uppercase tracking-wider">
                  {getRoleLabel(role)}
                </span>
                
                {up.status === 'success' && (
                  <span className="flex items-center gap-1 text-[10px] font-technical text-corporate-accent font-black uppercase tracking-monolith">
                    <CheckCircleIcon className="w-4 h-4 text-corporate-accent" />
                    Uploaded
                  </span>
                )}
                {up.status === 'uploading' && (
                  <span className="flex items-center gap-1.5 text-[10px] font-technical text-corporate-muted uppercase tracking-wider">
                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin text-corporate-accent" />
                    Uploading...
                  </span>
                )}
                {up.status === 'error' && (
                  <span className="flex items-center gap-1 text-[10px] font-technical text-red-500 font-bold uppercase tracking-wider">
                    <XCircleIcon className="w-4 h-4 text-red-500" />
                    Upload Failed
                  </span>
                )}
              </div>

              {/* Drag and Drop Zone custom-built */}
              <div className="relative border-2 border-dashed border-corporate-border p-8 text-center transition-colors hover:border-corporate-accent/40 bg-corporate-primary/30">
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={isExpired || running}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleUploadFile(role, e.target.files[0]);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />

                <div className="flex flex-col items-center justify-center space-y-2">
                  <ArrowUpTrayIcon className="w-8 h-8 text-corporate-accent/40" />
                  <p className="text-[10px] font-technical font-black tracking-monolith text-corporate-text-secondary uppercase">
                    {up.file ? `Selected: ${up.file.name}` : 'Click or drag PDF here to upload'}
                  </p>
                  <p className="text-[9px] font-technical text-corporate-muted uppercase tracking-widest">
                    Only PDF files allowed
                  </p>
                </div>
              </div>

              {/* Error messages */}
              {up.status === 'error' && up.error && (
                <div className="text-xs text-red-400 bg-red-500/5 border border-red-500/10 p-3 flex items-start gap-2">
                  <ExclamationTriangleIcon className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{up.error}</span>
                </div>
              )}

              {/* Uploaded File Details */}
              {up.status === 'success' && up.metadata && (
                <div className="bg-corporate-primary/40 border border-corporate-accent/10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs truncate">
                    <DocumentTextIcon className="w-4 h-4 text-corporate-accent" />
                    <span className="truncate text-corporate-text">{up.metadata.originalName}</span>
                  </div>
                  <span className="text-[10px] font-technical text-corporate-muted shrink-0 ml-4">
                    {(up.metadata.sizeBytes / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Outcome Banner (For blocked status after runs) */}
      {runOutcome && runOutcome.status === 'blocked' && (
        <div className="bg-corporate-secondary border border-red-500/20 p-5 flex items-start gap-4 animate-in slide-in-from-bottom-2">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-[10px] font-technical font-black tracking-monolith text-red-400 uppercase">
              Validation Refused
            </p>
            <p className="text-xs text-corporate-text">
              {runOutcome.message}
            </p>
            {runOutcome.updatedBlockers && runOutcome.updatedBlockers.length > 0 && (
              <ul className="list-disc pl-4 space-y-1 text-xs text-corporate-text-secondary">
                {runOutcome.updatedBlockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Run Action Panel */}
      <div className="bg-corporate-secondary border border-corporate-border p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xs font-technical font-bold text-corporate-text uppercase tracking-wider">
            Re-evaluate Order Status
          </h3>
          <p className="text-[11px] text-corporate-text-secondary mt-1">
            Trigger a complete prepress layout verification with the updated files.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunRemediation}
          disabled={!allUploaded || running || isExpired}
          className={`flex items-center justify-center gap-2 px-6 py-3 font-technical text-[10px] font-black uppercase tracking-monolith text-corporate-text transition-all
            ${allUploaded && !running && !isExpired
              ? 'bg-corporate-accent hover:bg-corporate-hover cursor-pointer shadow-lg shadow-corporate-accent/10'
              : 'bg-corporate-elevated text-corporate-muted border border-corporate-border cursor-not-allowed'
            }
          `}
        >
          {running ? (
            <>
              <ArrowPathIcon className="w-4 h-4 animate-spin text-corporate-text" />
              Running Verification...
            </>
          ) : (
            'Run Validation'
          )}
        </button>
      </div>
    </div>
  );
};

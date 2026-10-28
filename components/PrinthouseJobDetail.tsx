import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  X, 
  Download, 
  FileText, 
  ShieldCheck, 
  CreditCard, 
  Settings, 
  Truck, 
  CheckCircle, 
  AlertTriangle,
  History,
  MessageSquare,
  ArrowRight,
  Clipboard,
  ExternalLink,
  Ban,
  Play,
  Check,
  Search
} from 'lucide-react';

interface PrinthouseJobDetailProps {
  packageId: string;
  onClose: () => void;
  onStatusUpdated?: () => void;
}

export const PrinthouseJobDetail: React.FC<PrinthouseJobDetailProps> = ({ packageId, onClose, onStatusUpdated }) => {
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [operatorNotes, setOperatorNotes] = useState('');
  const [shipmentData, setShipmentData] = useState({ carrier: '', tracking_number: '' });

  const fetchJob = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/printhouse/queue/${packageId}`);
      if (response.data.ok) {
        setJob(response.data.job);
        setOperatorNotes(response.data.job.production_queue?.operator_notes || '');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJob();
  }, [packageId]);

  const updateStatus = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const payload: any = { 
        status: newStatus,
        operator_notes: operatorNotes
      };
      
      if (newStatus === 'REJECTED') {
        payload.rejection_reason = rejectionReason;
      }
      
      if (newStatus === 'SHIPPED') {
        payload.shipment = shipmentData;
      }

      const response = await axios.post(`/api/printhouse/queue/${packageId}/status`, payload);
      
      if (response.data.ok) {
        setJob({ ...job, production_queue: response.data.production_queue });
        setShowRejectionForm(false);
        if (onStatusUpdated) onStatusUpdated();
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update production status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const downloadFile = (fileId: string, filename: string) => {
    // Files must go through the secure dispatch package proxy
    window.open(`/api/dispatch-packages/${packageId}/files/${fileId}`, '_blank');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl h-full flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <Settings className="w-8 h-8 text-corporate-accent animate-spin" />
          <span className="text-slate-500 font-medium font-technical text-sm">LOADING_JOB_METADATA...</span>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="bg-white rounded-xl h-full p-12 flex flex-col items-center justify-center text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-bold text-slate-800">Operational Failure</h3>
        <p className="text-slate-500 mb-6">{error || 'Job not found.'}</p>
        <button onClick={onClose} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold">Close</button>
      </div>
    );
  }

  const currentStatus = job.production_queue?.status || 'QUEUED';

  const ActionButton = ({ targetStatus, label, icon: Icon, colorClass }: any) => (
    <button
      disabled={updatingStatus}
      onClick={() => updateStatus(targetStatus)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${colorClass} disabled:opacity-50`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="bg-white rounded-xl h-full flex flex-col shadow-2xl border border-slate-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="bg-corporate-accent p-2 rounded-lg text-white shadow-md">
            <Clipboard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 leading-tight">Job #{job.public_ref}</h2>
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-technical text-slate-400">{job.package_id}</span>
               <span className="px-1.5 py-0.5 bg-corporate-accent/10 text-corporate-accent text-[9px] font-bold rounded uppercase">
                 {job.printhouse_name}
               </span>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
          <X className="w-5 h-5 text-slate-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        
        {/* Status Ribbon */}
        <div className="flex items-center justify-between p-4 bg-slate-900 text-corporate-text rounded-xl shadow-inner">
           <div className="flex items-center gap-4">
              <div className="flex flex-col">
                 <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Current Status</span>
                 <span className="text-lg font-black text-corporate-accent uppercase">{currentStatus}</span>
              </div>
           </div>
           <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-medium">Last Update</span>
              <span className="text-xs font-technical">{new Date(job.production_queue?.updated_at || job.updated_at).toLocaleString()}</span>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column: Specs & Files */}
          <div className="space-y-8">
            <section>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-corporate-accent" />
                Production Specifications
              </h3>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 grid grid-cols-2 gap-y-3 gap-x-4">
                 <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-bold">Copies</span>
                    <span className="text-sm font-bold text-slate-700">{job.production_specs?.copies}</span>
                 </div>
                 <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-bold">Interior Pages</span>
                    <span className="text-sm font-bold text-slate-700">{job.production_specs?.interior_pages}</span>
                 </div>
                 <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-bold">Format</span>
                    <span className="text-sm font-bold text-slate-700 uppercase">{job.production_specs?.book_size}</span>
                 </div>
                 <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-bold">Binding</span>
                    <span className="text-sm font-bold text-slate-700 uppercase">{job.production_specs?.binding_method?.replace(/_/g, ' ')}</span>
                 </div>
                 <div className="col-span-2 pt-2 border-t border-slate-200">
                    <span className="text-[10px] text-slate-400 uppercase block font-bold">Paper Interior (Standard Baseline)</span>
                    <span className="text-xs text-slate-600">{job.production_specs?.paper_weight_interior}g {job.production_specs?.paper_type_interior}</span>
                 </div>
                 <div className="col-span-2">
                    <span className="text-[10px] text-slate-400 uppercase block font-bold">Paper Cover (Standard Baseline)</span>
                    <span className="text-xs text-slate-600">{job.production_specs?.paper_weight_cover}g {job.production_specs?.paper_type_cover}</span>
                 </div>

                 {/* Customer Paper Preferences (Informative - Pending Printer Confirmation) */}
                 {(() => {
                   const prefs = job.customer_paper_preferences || 
                                 job.production_specs?.customer_paper_preferences || 
                                 job.production_specs_summary?.customer_paper_preferences || 
                                 null;
                   if (!prefs || (!prefs.interior && !prefs.cover && !prefs.endpaper)) return null;

                   return (
                     <div className="col-span-2 mt-3 pt-3 border-t-2 border-dashed border-amber-300 bg-amber-50/70 p-3 rounded-lg">
                       <div className="flex items-center gap-2 mb-1.5">
                         <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                         <span className="text-xs font-black text-amber-900 uppercase tracking-tight">
                           Customer Paper Preferences (Informative)
                         </span>
                       </div>
                       <p className="text-[10px] text-amber-800 leading-relaxed mb-3">
                         Paper preference only. Does not affect this estimate. Subject to print house confirmation and availability.
                       </p>

                       <div className="space-y-2">
                         {prefs.interior && (
                           <div className="bg-white p-2.5 rounded border border-amber-200">
                             <span className="text-[9px] uppercase font-bold text-slate-400 block">Preferred Interior Substrate</span>
                             <div className="text-xs font-bold text-slate-800">
                               {prefs.interior.productName || prefs.interior.product_name}
                               {prefs.interior.brand ? ` (${prefs.interior.brand})` : ''} · {prefs.interior.gsm}g
                             </div>
                             <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                               Category: {prefs.interior.category} | Finish: {prefs.interior.finish || 'Standard'} | Sheet: {prefs.interior.rawSheetFormat || 'Standard'}
                             </div>
                             <span className="inline-block mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">
                               PENDING PRINTHOUSE CONFIRMATION
                             </span>
                           </div>
                         )}

                         {prefs.cover && (
                           <div className="bg-white p-2.5 rounded border border-amber-200">
                             <span className="text-[9px] uppercase font-bold text-slate-400 block">Preferred Cover Substrate</span>
                             <div className="text-xs font-bold text-slate-800">
                               {prefs.cover.productName || prefs.cover.product_name}
                               {prefs.cover.brand ? ` (${prefs.cover.brand})` : ''} · {prefs.cover.gsm}g
                             </div>
                             <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                               Category: {prefs.cover.category} | Finish: {prefs.cover.finish || 'Standard'} | Sheet: {prefs.cover.rawSheetFormat || 'Standard'}
                             </div>
                             <span className="inline-block mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">
                               PENDING PRINTHOUSE CONFIRMATION
                             </span>
                           </div>
                         )}

                         {prefs.endpaper && (
                           <div className="bg-white p-2.5 rounded border border-amber-200">
                             <span className="text-[9px] uppercase font-bold text-slate-400 block">Preferred Endpaper Substrate</span>
                             <div className="text-xs font-bold text-slate-800">
                               {prefs.endpaper.productName || prefs.endpaper.product_name} · {prefs.endpaper.gsm}g
                             </div>
                             <span className="inline-block mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">
                               PENDING PRINTHOUSE CONFIRMATION
                             </span>
                           </div>
                         )}
                       </div>
                     </div>
                   );
                 })()}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-500" />
                Production Assets
              </h3>
              <div className="space-y-2">
                {job.files?.map((f: any) => (
                  <div key={f.file_id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{f.filename}</span>
                        <span className="text-[10px] text-slate-400 uppercase">{f.role} • {(f.size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => downloadFile(f.file_id, f.filename)}
                      className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                      title="Download Asset"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Preflight, Billing, Notes */}
          <div className="space-y-8">
            <section>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-500" />
                Preflight Verification
              </h3>
              <div className={`p-4 rounded-xl border ${job.preflight_summary?.status === 'PASSED' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                 <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-tight">Status</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${job.preflight_summary?.status === 'PASSED' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                      {job.preflight_summary?.status}
                    </span>
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/60 p-2 rounded-lg text-center border border-white/40">
                       <span className="text-[10px] text-slate-400 block font-bold uppercase">Issues</span>
                       <span className="text-sm font-black text-slate-800">{job.preflight_summary?.issue_count || 0}</span>
                    </div>
                    <div className="bg-white/60 p-2 rounded-lg text-center border border-white/40">
                       <span className="text-[10px] text-slate-400 block font-bold uppercase">Risk</span>
                       <span className="text-sm font-black text-slate-800 uppercase">{job.preflight_summary?.risk_level || 'LOW'}</span>
                    </div>
                 </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-500" />
                Billing & Confirmation
              </h3>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                 <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-500 font-medium">Payment Status</span>
                    <div className="flex items-center gap-1.5">
                       <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                       <span className="text-xs font-black text-green-700 uppercase">{job.billing_summary?.payment_status}</span>
                    </div>
                 </div>
                 <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">Confirmed Amount</span>
                    <span className="text-sm font-black text-indigo-700">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: job.billing_summary?.currency || 'EUR' }).format(job.billing_summary?.total_price || 0)}
                    </span>
                 </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-500" />
                Operator Workflow Notes
              </h3>
              <textarea 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 focus:ring-2 focus:ring-corporate-accent outline-none resize-none min-h-[80px]"
                placeholder="Internal production notes, prepress findings, etc..."
                value={operatorNotes}
                onChange={(e) => setOperatorNotes(e.target.value)}
              />
            </section>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col gap-4">
        
        {/* Status Transition Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {currentStatus === 'QUEUED' && (
            <ActionButton 
              targetStatus="REVIEWING" 
              label="Start Review" 
              icon={Search} 
              colorClass="bg-amber-100 text-amber-700 hover:bg-amber-600 hover:text-corporate-text" 
            />
          )}

          {currentStatus === 'REVIEWING' && (
            <>
              <ActionButton 
                targetStatus="ACCEPTED" 
                label="Accept Job" 
                icon={Check} 
                colorClass="bg-green-600 text-white hover:bg-green-700" 
              />
              <button
                onClick={() => setShowRejectionForm(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-red-50 text-red-600 hover:bg-red-600 hover:text-corporate-text transition-all shadow-sm"
              >
                <Ban className="w-4 h-4" />
                Reject Job
              </button>
            </>
          )}

          {currentStatus === 'ACCEPTED' && (
            <ActionButton 
              targetStatus="IN_PREPRESS" 
              label="Send to Pre-Press" 
              icon={Clipboard} 
              colorClass="bg-indigo-600 text-white hover:bg-indigo-700" 
            />
          )}

          {currentStatus === 'IN_PREPRESS' && (
            <ActionButton 
              targetStatus="IN_PRODUCTION" 
              label="Start Production" 
              icon={Play} 
              colorClass="bg-purple-600 text-corporate-text hover:bg-purple-700" 
            />
          )}

          {currentStatus === 'IN_PRODUCTION' && (
            <ActionButton 
              targetStatus="COMPLETED" 
              label="Mark Completed" 
              icon={CheckCircle} 
              colorClass="bg-emerald-600 text-white hover:bg-emerald-700" 
            />
          )}

          {currentStatus === 'COMPLETED' && (
            <div className="flex items-center gap-3 w-full">
               <input 
                 type="text" 
                 placeholder="Tracking Number" 
                 className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                 value={shipmentData.tracking_number}
                 onChange={(e) => setShipmentData({ ...shipmentData, tracking_number: e.target.value })}
               />
               <input 
                 type="text" 
                 placeholder="Carrier" 
                 className="w-32 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                 value={shipmentData.carrier}
                 onChange={(e) => setShipmentData({ ...shipmentData, carrier: e.target.value })}
               />
               <ActionButton 
                targetStatus="SHIPPED" 
                label="Confirm Shipment" 
                icon={Truck} 
                colorClass="bg-sky-600 text-corporate-text hover:bg-sky-700" 
              />
            </div>
          )}

          {(currentStatus === 'REJECTED' || currentStatus === 'CANCELLED' || currentStatus === 'SHIPPED') && (
            <div className="flex items-center gap-2 text-slate-400 italic text-sm">
               <History className="w-4 h-4" />
               Job lifecycle finalized in this terminal.
            </div>
          )}
        </div>

        {showRejectionForm && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3 animate-in slide-in-from-bottom-2">
             <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-700 uppercase">Mandatory Rejection Protocol</span>
                <button onClick={() => setShowRejectionForm(false)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
             </div>
             <textarea 
               className="w-full bg-white border border-red-200 rounded-lg p-3 text-sm text-slate-700 focus:ring-2 focus:ring-red-500 outline-none min-h-[60px]"
               placeholder="Specify technical rejection reason (e.g., file corruption, capacity overflow)..."
               value={rejectionReason}
               onChange={(e) => setRejectionReason(e.target.value)}
             />
             <div className="flex justify-end">
                <button 
                  disabled={!rejectionReason || updatingStatus}
                  onClick={() => updateStatus('REJECTED')}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-all disabled:opacity-50 shadow-md"
                >
                  Confirm Rejection
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

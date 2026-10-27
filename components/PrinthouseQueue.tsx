import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Eye, 
  Filter, 
  Truck, 
  Package, 
  Clipboard,
  Search,
  Settings,
  XCircle,
  FileText
} from 'lucide-react';

interface QueueJob {
  package_id: string;
  order_intent_id: string;
  public_ref: string;
  control_plane_order_ref: string;
  printhouse_id: string;
  printhouse_name: string;
  production_queue_status: string;
  payment_status: string;
  preflight_status: string;
  dispatch_package_status: string;
  created_at: string;
  updated_at: string;
  customer_summary: {
    name: string;
    email: string;
    shipping?: any;
  };
  production_specs_summary: any;
  files_summary: Array<{ role: string; filename: string }>;
}

export const PrinthouseQueue: React.FC = () => {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Mock printhouse ID for now, since we don't have full auth mapping
  // In a real app, this would come from the user's profile/claims
  const PRINTHOUSE_ID = 'PH_001'; 

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const params: any = { printhouse_id: PRINTHOUSE_ID };
      if (statusFilter) params.status = statusFilter;
      
      const response = await axios.get('/api/printhouse/queue', { params });
      if (response.data.ok) {
        setJobs(response.data.jobs);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch production queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [statusFilter]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'QUEUED': return <Clock className="w-4 h-4 text-slate-500" />;
      case 'REVIEWING': return <Search className="w-4 h-4 text-amber-500" />;
      case 'ACCEPTED': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'REJECTED': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'IN_PREPRESS': return <Clipboard className="w-4 h-4 text-indigo-500" />;
      case 'IN_PRODUCTION': return <Settings className="w-4 h-4 text-purple-500 animate-spin" />;
      case 'COMPLETED': return <Package className="w-4 h-4 text-emerald-500" />;
      case 'SHIPPED': return <Truck className="w-4 h-4 text-emerald-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    const base = "px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ";
    switch (status) {
      case 'QUEUED': return base + "bg-slate-100 text-slate-800";
      case 'REVIEWING': return base + "bg-amber-100 text-amber-800";
      case 'ACCEPTED': return base + "bg-green-100 text-green-800";
      case 'REJECTED': return base + "bg-red-100 text-red-800";
      case 'IN_PREPRESS': return base + "bg-indigo-100 text-indigo-800";
      case 'IN_PRODUCTION': return base + "bg-purple-100 text-purple-800";
      case 'COMPLETED': return base + "bg-emerald-100 text-emerald-800";
      case 'SHIPPED': return base + "bg-emerald-100 text-emerald-800";
      default: return base + "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-corporate-accent" />
            Printhouse Production Queue
          </h2>
          <p className="text-sm text-slate-500">Manage manufacturing lifecycle for marketplace orders.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-corporate-accent outline-none appearance-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="QUEUED">Queued</option>
              <option value="REVIEWING">Reviewing</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="IN_PREPRESS">In Pre-Press</option>
              <option value="IN_PRODUCTION">In Production</option>
              <option value="COMPLETED">Completed</option>
              <option value="SHIPPED">Shipped</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <button 
            onClick={fetchQueue}
            className="p-2 text-slate-500 hover:text-corporate-accent hover:bg-corporate-accent/10 rounded-lg transition-colors"
            title="Refresh Queue"
          >
            <Clock className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <th className="px-6 py-4 border-b border-slate-100">Reference</th>
              <th className="px-6 py-4 border-b border-slate-100">Customer</th>
              <th className="px-6 py-4 border-b border-slate-100">Job Specs</th>
              <th className="px-6 py-4 border-b border-slate-100">Preflight / Pay</th>
              <th className="px-6 py-4 border-b border-slate-100">Status</th>
              <th className="px-6 py-4 border-b border-slate-100">Created</th>
              <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && jobs.length === 0 ? (
              Array(3).fill(0).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={7} className="px-6 py-8">
                    <div className="h-4 bg-slate-100 rounded w-full"></div>
                  </td>
                </tr>
              ))
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="w-12 h-12 text-slate-200" />
                    <p>No production jobs found in the queue.</p>
                  </div>
                </td>
              </tr>
            ) : (
              jobs.map(job => (
                <tr key={job.package_id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{job.public_ref}</span>
                      <span className="text-[10px] text-slate-400 font-technical">{job.package_id}</span>
                      {job.control_plane_order_ref && (
                        <span className="text-[10px] text-corporate-accent font-medium">CP: {job.control_plane_order_ref}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-700">{job.customer_summary?.name || 'Anonymous'}</span>
                      <span className="text-xs text-slate-400">{job.customer_summary?.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-slate-600 font-medium">
                        {job.production_specs_summary?.copies} copies • {job.production_specs_summary?.interior_pages}p
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase">
                        {job.production_specs_summary?.book_size} • {job.production_specs_summary?.binding_method?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${job.preflight_status === 'PASSED' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-[10px] font-bold text-slate-600">PREFLIGHT: {job.preflight_status}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${job.payment_status === 'PAID' ? 'bg-green-500' : 'bg-corporate-accent'}`}></div>
                        <span className="text-[10px] font-bold text-slate-600">PAY: {job.payment_status}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={getStatusBadgeClass(job.production_queue_status)}>
                      {getStatusIcon(job.production_queue_status)}
                      {job.production_queue_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setSelectedJobId(job.package_id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-corporate-accent/10 text-corporate-accent hover:bg-corporate-accent hover:text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Job
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Showing {jobs.length} industrial production jobs. {statusFilter ? `Filtered by ${statusFilter}.` : ''}
        </p>
        <div className="flex items-center gap-2">
          <button disabled className="p-1.5 text-slate-300 cursor-not-allowed">
            <Clipboard className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Detail Overlay / Modal could be added here */}
      {selectedJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
             <PrinthouseJobDetail 
                packageId={selectedJobId} 
                onClose={() => setSelectedJobId(null)}
                onStatusUpdated={fetchQueue}
             />
          </div>
        </div>
      )}
    </div>
  );
};

// Internal Import or placeholder to prevent circularity if in same file
const PrinthouseJobDetailPlaceholder = () => null;
import { PrinthouseJobDetail } from './PrinthouseJobDetail';

import React, { useEffect, useState } from 'react';
import {
  XMarkIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  ClipboardDocumentListIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import OrderIntentDetails from './OrderIntentDetails';
import { CustomerOrderTracking } from './CustomerOrderTracking';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface OrderSpecs {
  copies: number;
  interior_pages: number;
  book_size: string;
  binding_method: string;
  [key: string]: unknown;
}

interface Order {
  id: string | number;
  order_ref: string;
  user_id: string | number;
  specs?: OrderSpecs;
  offer_print_house: string;
  offer_price: number;
  currency?: string;
  status: string;
  lifecycle?: any;
  created_at: string;
  is_intent?: boolean;
}

interface UserOrdersProps {
  userId?: string | number;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  confirmed:  'bg-corporate-accent/10 text-corporate-accent border-corporate-accent/30',
  processing: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  shipped:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  delivered:  'bg-green-500/10 text-green-400 border-green-500/30',
  cancelled:  'bg-red-500/10 text-red-400 border-red-500/30',
};

const StatusBadge: React.FC<{ status: string; variant?: 'default' | 'success' | 'warning' | 'error' | 'info' }> = ({ status, variant = 'default' }) => {
  const baseColors = STATUS_COLORS[status] ?? 'bg-corporate-elevated text-corporate-muted border-corporate-border';
  let colors = baseColors;
  
  if (variant === 'success') colors = 'bg-green-500/10 text-green-400 border-green-500/30';
  if (variant === 'warning') colors = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
  if (variant === 'error') colors = 'bg-red-500/10 text-red-400 border-red-500/30';
  if (variant === 'info') colors = 'bg-white/10 text-corporate-text border-corporate-border-strong';

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[0.55rem] font-black uppercase tracking-widest border ${colors}`}>
      {status}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
const PAGE_SIZE = 8;

// ---------------------------------------------------------------------------
// UserOrders modal
// ---------------------------------------------------------------------------
const UserOrders: React.FC<UserOrdersProps> = ({ userId, onClose }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      try {
        const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
        const res = await fetch(`/api/order-intents${query}`, {
          credentials: 'include'
        });
        
        if (res.status === 403) {
            setError("ACCESS_DENIED: You are not authorized to view these orders.");
            return;
        }
        if (res.status === 401) {
            setError("AUTH_REQUIRED: Please log in to see your orders.");
            return;
        }
        if (res.status === 429) {
            setError("TOO_MANY_REQUESTS: Please wait a moment before trying again.");
            return;
        }

        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || data?.message || 'Failed to load orders.');
          return;
        }
        
        // Handle both 'orders' and 'order_intents' keys for robustness
        const list = data.orders || data.order_intents || [];
        setOrders(list.map((o: any) => ({
          ...o,
          id: o.order_intent_id || o.id,
          order_ref: o.public_ref || o.order_ref
        })));
        setCurrentPage(1);
      } catch {
        setError('Connection error. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [userId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const totalPages = Math.ceil(orders.length / PAGE_SIZE);
  const pagedOrders = orders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const getPaginationRange = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | 'ellipsis')[] = [1];
    if (currentPage > 3) pages.push('ellipsis');
    for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) {
      pages.push(p);
    }
    if (currentPage < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  };

  const handleRowClick = (order: Order) => {
    setSelectedOrderId(String(order.id));
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-[900px] max-h-[85vh] flex flex-col border border-corporate-border bg-corporate-secondary shadow-[0_0_120px_rgba(220,0,0,0.1)] overflow-hidden">
        {/* Top accent bar */}
        <div className="h-[2px] w-full shrink-0 bg-corporate-accent shadow-[0_0_15px_#dc0000]" />

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-corporate-border shrink-0">
          <div className="flex items-center gap-3">
            <ClipboardDocumentListIcon className="w-5 h-5 text-corporate-accent" />
            <h2 className="text-[0.85rem] font-black uppercase tracking-[0.2em] text-corporate-text">
              My Orders
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 text-corporate-muted hover:text-corporate-accent transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-4">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-corporate-muted">
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              <span className="text-[0.75rem] font-technical uppercase tracking-widest">Loading orders…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center gap-4 bg-corporate-accent/5 border border-corporate-accent/30 px-5 py-4">
              <ExclamationCircleIcon className="w-5 h-5 text-corporate-accent shrink-0" />
              <span className="text-[0.75rem] font-bold text-corporate-accent uppercase tracking-wider">{error}</span>
            </div>
          )}

          {!loading && !error && orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 border border-corporate-border bg-corporate-primary/30">
              <ClipboardDocumentListIcon className="w-12 h-12 text-corporate-muted opacity-20" />
              <div className="text-center space-y-1">
                <p className="text-[0.7rem] font-technical font-black text-corporate-muted uppercase tracking-monolith">
                  No orders yet
                </p>
                <p className="text-[0.6rem] text-corporate-muted uppercase tracking-[0.2em] font-technical">
                  Your order history will appear here.
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-2 bg-corporate-accent hover:bg-corporate-accent-hover text-white text-[10px] font-black uppercase tracking-monolith transition-colors shadow-lg shadow-corporate-accent/20"
              >
                Back to Marketplace
              </button>
            </div>
          )}

          {!loading && !error && orders.length > 0 && (
            <div className="border border-corporate-border">
              {/* Column headers */}
              <div
                className="grid items-center gap-x-4 px-5 py-1.5 border-b border-corporate-border bg-corporate-primary/30"
                style={{ gridTemplateColumns: '1.5fr 0.6fr 0.8fr 1.5fr 1fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr' }}
              >
                {['Order ref', 'Copies', 'Int. pages', 'Print house', 'Total', 'Date', 'Status', 'Preflight', 'Invoice', 'Payment', 'CP Order', 'Track'].map((label) => (
                  <span key={label} className="text-[0.55rem] font-black uppercase tracking-[0.15em] text-corporate-muted">
                    {label}
                  </span>
                ))}
              </div>

              {/* Data rows */}
              {pagedOrders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => handleRowClick(order)}
                  className="grid items-center gap-x-4 px-5 py-2 border-b border-corporate-border last:border-b-0 hover:bg-corporate-elevated/40 transition-colors cursor-pointer group"
                  style={{ gridTemplateColumns: '1.5fr 0.6fr 0.8fr 1.5fr 1fr 1fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr' }}
                >
                  <div className="flex flex-col truncate">
                    <span className="font-technical font-bold text-[0.7rem] text-corporate-text tracking-tight truncate flex items-center gap-2">
                        {order.order_ref}
                        <MagnifyingGlassIcon className="w-3 h-3 text-corporate-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                    {(order as any).control_plane?.order_ref && (
                        <span className="text-[0.5rem] font-technical text-corporate-accent truncate">CP: {(order as any).control_plane.order_ref}</span>
                    )}
                  </div>
                  <span className="font-technical text-[0.65rem] text-corporate-text-secondary tabular-nums">
                    {order.specs?.copies || '-'}
                  </span>
                  <span className="font-technical text-[0.65rem] text-corporate-text-secondary tabular-nums">
                    {order.specs?.interior_pages || '-'}
                  </span>
                  <span className="font-technical text-[0.65rem] text-corporate-muted truncate">
                    {order.offer_print_house}
                  </span>
                  <span className="font-technical font-bold text-[0.7rem] text-corporate-text tabular-nums text-right">
                    {order.currency || '$'} {Number(order.offer_price).toFixed(2)}
                  </span>
                  <span className="font-technical text-[0.65rem] text-corporate-muted tabular-nums">
                    {new Date(order.created_at).toLocaleDateString()}
                  </span>
                  
                  <div className="flex justify-start">
                    <StatusBadge 
                        status={order.status === 'CONTROL_PLANE_ORDER_CREATED' ? 'PROCESSING' : order.status} 
                        variant={order.status === 'COMPLETED' ? 'success' : 'info'}
                    />
                  </div>
                  <div className="flex justify-start">
                    <StatusBadge 
                        status={order.lifecycle?.preflight_status || 'NOT_STARTED'} 
                        variant={order.lifecycle?.preflight_status === 'PASSED' ? 'success' : order.lifecycle?.preflight_status === 'FAILED' ? 'error' : 'default'}
                    />
                  </div>
                  <div className="flex justify-start">
                    <StatusBadge 
                        status={order.lifecycle?.invoice_status || 'NOT_CREATED'} 
                        variant={order.lifecycle?.invoice_status === 'CREATED' ? 'info' : 'default'}
                    />
                  </div>
                  <div className="flex justify-start">
                    <StatusBadge 
                        status={order.lifecycle?.payment_status || 'NOT_STARTED'} 
                        variant={order.lifecycle?.payment_status === 'PAID' ? 'success' : order.lifecycle?.payment_status === 'PENDING' ? 'warning' : 'default'}
                    />
                  </div>
                  <div className="flex justify-start">
                    <StatusBadge 
                        status={order.lifecycle?.control_plane_order_status || 'NOT_CREATED'} 
                        variant={order.lifecycle?.control_plane_order_status === 'CREATED' ? 'success' : 'default'}
                    />
                  </div>
                  <div className="flex justify-start">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setTrackingOrderId(String(order.id));
                        }}
                        className="text-[0.55rem] font-black uppercase tracking-widest text-corporate-accent hover:text-corporate-text border border-corporate-accent/30 hover:border-corporate-accent px-2 py-0.5 transition-all"
                    >
                        Track
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedOrderId && (
            <OrderIntentDetails 
                orderIntentId={selectedOrderId} 
                onClose={() => setSelectedOrderId(null)} 
            />
        )}

        {trackingOrderId && (
            <CustomerOrderTracking 
                orderIntentId={trackingOrderId}
                onClose={() => setTrackingOrderId(null)}
            />
        )}

        {/* Footer */}
        <div className="shrink-0 px-8 py-4 border-t border-corporate-border bg-corporate-primary flex items-center justify-between gap-4">
          {/* Left: record count */}
          <span className="text-[0.6rem] font-technical text-corporate-muted uppercase tracking-widest w-20 shrink-0">
            {!loading && !error && orders.length > 0
              ? `${orders.length} order${orders.length !== 1 ? 's' : ''}`
              : ''}
          </span>

          {/* Center: pagination controls */}
          {!loading && !error && totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center justify-center w-6 h-6 border border-corporate-border text-corporate-muted hover:text-corporate-text hover:border-corporate-border-strong disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeftIcon className="w-3 h-3" />
              </button>

              {getPaginationRange().map((page, idx) =>
                page === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="text-[0.55rem] text-corporate-muted px-0.5">…</span>
                ) : (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`w-5 h-5 text-[0.55rem] font-technical font-bold transition-colors ${
                      page === currentPage
                        ? 'bg-corporate-accent text-white'
                        : 'text-corporate-muted hover:text-corporate-text'
                    }`}
                    aria-label={`Page ${page}`}
                    aria-current={page === currentPage ? 'page' : undefined}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center justify-center w-6 h-6 border border-corporate-border text-corporate-muted hover:text-corporate-text hover:border-corporate-border-strong disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <ChevronRightIcon className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Right: close */}
          <button
            type="button"
            onClick={onClose}
            className="text-[0.7rem] font-black uppercase tracking-widest text-corporate-muted hover:text-corporate-text transition-colors w-20 text-right shrink-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserOrders;

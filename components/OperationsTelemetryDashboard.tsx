import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowPathIcon,
  ShieldCheckIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ServerStackIcon,
  BanknotesIcon,
  CpuChipIcon,
  DocumentCheckIcon,
} from '@heroicons/react/24/outline';

export interface FunnelStageMetric {
  stageCode: string;
  stageNumber: number;
  shortLabel: string;
  label: string;
  description: string;
  count: number;
  percentage: number;
  copiesTotal: number;
  valueEur: number;
  sampleOrderIds?: string[];
}

export interface IncidentMetricItem {
  code: string;
  label: string;
  standardRef: string;
  severity: 'WARNING' | 'CRITICAL' | string;
  count: number;
  autoFixable: boolean;
}

export interface OperationalTelemetryData {
  ok: boolean;
  generatedAt: string;
  tenantId: string;
  kpis: {
    custodiedEscrowEur: number;
    releasedEscrowEur: number;
    platformFeeMorEur: number;
    activePlantOrdersCount: number;
    totalOrdersCount: number;
    preflightSuccessRatePct: number;
    diskUsageBytes: number;
    diskUsageMb: number;
    diskUsageGb: number;
    totalBinaryAssetsCount: number;
  };
  funnel: {
    totalOrders: number;
    activeInPlant: number;
    completedDelivered: number;
    stages: FunnelStageMetric[];
  };
  escrow: {
    currency: string;
    totalCustodiedEur: number;
    totalReleasedEur: number;
    totalPlatformFeeMorEur: number;
    totalNetPrinthousePayoutEur: number;
    totalNetCarrierPayoutEur: number;
    states: {
      UNFUNDED: { count: number; volumeEur: number; platformFeeEur: number };
      FUNDS_LOCKED_ON_PROOF_APPROVAL: { count: number; volumeEur: number; platformFeeEur: number };
      RELEASED_ON_SIGNED_POD: { count: number; volumeEur: number; platformFeeEur: number };
    };
  };
  prepressHealth: {
    totalFilesEvaluated: number;
    directPassCount: number;
    warningsCount: number;
    failedCount: number;
    firstPassSuccessRatioPct: number;
    incidentMatrix: IncidentMetricItem[];
  };
  storageIo: {
    storageRoot?: string;
    storageDirExists: boolean;
    totalBytes: number;
    totalMb: number;
    totalGb: number;
    totalAssetsCount: number;
    byRole: {
      INTERIOR_PDF: { count: number; bytes: number; megabytes: number };
      COVER_PDF: { count: number; bytes: number; megabytes: number };
      WIRE_PROOF: { count: number; bytes: number; megabytes: number };
    };
  };
}

interface OperationsTelemetryDashboardProps {
  userEmail?: string;
  userId?: string | number;
  onSelectOrderForTracking?: (orderId: string) => void;
}

export interface StorageBackupStatusData {
  ok: boolean;
  generatedAt: string;
  policy: {
    retentionColdDays: number;
    backupRetentionCount: number;
    archiveDir: string;
    backupDir: string;
    schedulerActive: boolean;
  };
  retentionMetrics: {
    archivedOrdersCount: number;
    totalColdArchiveBytes: number;
    totalColdArchiveMb: number;
    totalReclaimedBytes: number;
    totalReclaimedMb: number;
    totalRestoredOrdersCount: number;
    lastRetentionRunAt?: string | null;
    coldArchives: Array<{
      orderId: string;
      filename: string;
      sizeBytes: number;
      sizeKb: number;
      archivedAt: string;
      reclaimedBytes: number;
    }>;
  };
  backupMetrics: {
    availableSnapshotsCount: number;
    maxRetainedSnapshots: number;
    totalSnapshotsBytes: number;
    totalSnapshotsMb: number;
    lastBackupRunAt?: string | null;
    latestSnapshot?: {
      filename: string;
      sizeBytes: number;
      sizeKb: number;
      createdAt: string;
    } | null;
    snapshots: Array<{
      filename: string;
      sizeBytes: number;
      sizeKb: number;
      createdAt: string;
    }>;
  };
}

export const OperationsTelemetryDashboard: React.FC<OperationsTelemetryDashboardProps> = ({
  userEmail,
  userId,
  onSelectOrderForTracking,
}) => {
  const [telemetry, setTelemetry] = useState<OperationalTelemetryData | null>(null);
  const [backupStatus, setBackupStatus] = useState<StorageBackupStatusData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [runningBackupAction, setRunningBackupAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTelemetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (userEmail) headers['x-customer-email'] = userEmail;
      if (userId) headers['x-customer-id'] = String(userId);

      const [res, backupRes] = await Promise.all([
        fetch('/api/customer/operations/summary', { headers }),
        fetch('/api/admin/storage/backup/status', { headers }).catch(() => null),
      ]);
      if (!res.ok) {
        throw new Error(`Telemetry HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data && data.ok) {
        setTelemetry(data);
      } else {
        throw new Error(data?.message || 'Invalid telemetry payload');
      }
      if (backupRes && backupRes.ok) {
        const bData = await backupRes.json();
        if (bData && bData.ok) {
          setBackupStatus(bData);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to synchronize real-time operational telemetry.');
    } finally {
      setLoading(false);
    }
  }, [userEmail, userId]);

  const triggerStorageAction = async (action: 'BACKUP' | 'RETENTION') => {
    setRunningBackupAction(action);
    try {
      const endpoint =
        action === 'BACKUP'
          ? '/api/admin/storage/backup/run'
          : '/api/admin/storage/retention/run';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await fetchTelemetry();
    } catch (_) {
    } finally {
      setRunningBackupAction(null);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  if (loading && !telemetry) {
    return (
      <div className="p-12 rounded-2xl border border-zinc-200 dark:border-[#1f2228] bg-white dark:bg-[#12141a] flex flex-col items-center justify-center gap-3 text-center">
        <ArrowPathIcon className="w-7 h-7 text-[#dc2626] animate-spin" />
        <p className="text-xs font-technical uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          SYNCHRONIZING INDUSTRIAL PLANT, ESCROW LEDGER &amp; PRE-PRESS TELEMETRY...
        </p>
      </div>
    );
  }

  if (!telemetry) {
    return (
      <div className="p-6 rounded-2xl border border-[#dc2626]/40 bg-[#dc2626]/10 text-xs font-technical text-red-600 dark:text-red-300 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ExclamationTriangleIcon className="w-5 h-5 text-[#dc2626]" />
          <span>{error || 'Operational telemetry unavailable.'}</span>
        </div>
        <button
          type="button"
          onClick={fetchTelemetry}
          className="px-3 py-1.5 rounded-lg bg-[#dc2626] text-white font-bold uppercase text-[10px]"
        >
          Retry
        </button>
      </div>
    );
  }

  const { kpis, funnel, escrow, prepressHealth, storageIo } = telemetry;
  const maxStageCount = Math.max(1, ...funnel.stages.map((s) => s.count));
  const maxIncidentCount = Math.max(1, ...prepressHealth.incidentMatrix.map((i) => i.count));

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl border border-zinc-200 dark:border-[#1f2228] bg-white dark:bg-[#12141a] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm dark:shadow-none">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-technical font-black uppercase tracking-[0.22em] text-[#dc2626]">
              EXECUTIVE OBSERVABILITY // CONTROL PLANE TELEMETRY
            </span>
            <span className="px-2 py-0.5 rounded text-[9px] font-technical font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/60">
              LIVE SYNC
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-black text-zinc-900 dark:text-zinc-100 mt-1">
            Industrial Plant Funnel, Escrow Custodial Ledger &amp; Pre-Press Health
          </h2>
          <p className="text-xs font-technical text-zinc-500 dark:text-zinc-400 mt-0.5">
            Snapshot UTC: {new Date(telemetry.generatedAt).toLocaleString()} • Tenant Scope: {telemetry.tenantId}
          </p>
        </div>

        <button
          type="button"
          onClick={fetchTelemetry}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-300 dark:border-[#2d323b] bg-zinc-50 dark:bg-[#0a0b0d] hover:border-[#dc2626] text-xs font-technical font-bold uppercase text-zinc-800 dark:text-zinc-200 transition-all self-start sm:self-auto"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin text-[#dc2626]' : 'text-[#dc2626]'}`} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* 4 Primary Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Escrow Custodiado (€) */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-[#1f2228] bg-white dark:bg-[#12141a] space-y-2 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-technical font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              01 // ESCROW CUSTODIADO
            </span>
            <BanknotesIcon className="w-5 h-5 text-[#10b981]" />
          </div>
          <div className="text-2xl font-black font-technical text-zinc-900 dark:text-zinc-100">
            €{kpis.custodiedEscrowEur.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between text-[11px] font-technical pt-1 border-t border-zinc-100 dark:border-[#1f2228]">
            <span className="text-zinc-500 dark:text-zinc-400">MoR Fees Accrued:</span>
            <span className="font-bold text-[#10b981]">
              €{kpis.platformFeeMorEur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* KPI 2: Pedidos Activos en Planta */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-[#1f2228] bg-white dark:bg-[#12141a] space-y-2 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-technical font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              02 // PEDIDOS ACTIVOS PLANTA
            </span>
            <CubeIcon className="w-5 h-5 text-[#dc2626]" />
          </div>
          <div className="text-2xl font-black font-technical text-zinc-900 dark:text-zinc-100">
            {kpis.activePlantOrdersCount}{' '}
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
              / {kpis.totalOrdersCount} Total Orders
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-technical pt-1 border-t border-zinc-100 dark:border-[#1f2228]">
            <span className="text-zinc-500 dark:text-zinc-400">Delivered &amp; POD Signed:</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">{funnel.completedDelivered} Editions</span>
          </div>
        </div>

        {/* KPI 3: Ratio de Éxito de Preflight (%) */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-[#1f2228] bg-white dark:bg-[#12141a] space-y-2 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-technical font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              03 // RATIO ÉXITO PREFLIGHT
            </span>
            <DocumentCheckIcon className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-black font-technical text-emerald-600 dark:text-emerald-400">
            {kpis.preflightSuccessRatePct.toFixed(1)}%
          </div>
          <div className="flex items-center justify-between text-[11px] font-technical pt-1 border-t border-zinc-100 dark:border-[#1f2228]">
            <span className="text-zinc-500 dark:text-zinc-400">Direct Pass / Evaluated:</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">
              {prepressHealth.directPassCount} / {prepressHealth.totalFilesEvaluated} PDFs
            </span>
          </div>
        </div>

        {/* KPI 4: Uso de Disco (MB / GB) */}
        <div className="p-5 rounded-2xl border border-zinc-200 dark:border-[#1f2228] bg-white dark:bg-[#12141a] space-y-2 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-technical font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              04 // STORAGE &amp; I/O DISCO
            </span>
            <ServerStackIcon className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-black font-technical text-zinc-900 dark:text-zinc-100">
            {kpis.diskUsageMb.toLocaleString('en-US', { minimumFractionDigits: 2 })} MB{' '}
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
              ({kpis.diskUsageGb.toFixed(2)} GB)
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-technical pt-1 border-t border-zinc-100 dark:border-[#1f2228]">
            <span className="text-zinc-500 dark:text-zinc-400">Managed Binary Assets:</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {kpis.totalBinaryAssetsCount} Files
            </span>
          </div>
        </div>
      </div>

      {/* CAD/Industrial 5-Stage Workload Funnel Diagram */}
      <div className="p-6 rounded-2xl border border-zinc-200 dark:border-[#1f2228] bg-white dark:bg-[#12141a] space-y-5 shadow-sm dark:shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-200 dark:border-[#1f2228] pb-4">
          <div>
            <span className="text-[10px] font-technical font-black uppercase tracking-widest text-[#dc2626]">
              CAD WORKFLOW SCHEMATIC // 5-STAGE INDUSTRIAL MANUFACTURING FUNNEL
            </span>
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 mt-0.5">
              Workload Distribution from Pre-Press Intake (Stage 01) to Signed CMR/POD (Stage 05)
            </h3>
          </div>
          <span className="text-[11px] font-technical text-zinc-500 dark:text-zinc-400">
            Active Floor Load: <strong className="text-zinc-900 dark:text-zinc-100">{funnel.activeInPlant} Orders</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
          {funnel.stages.map((stage) => {
            const barHeightPct = Math.max(18, Math.round((stage.count / maxStageCount) * 100));
            const isDelivered = stage.stageCode === 'STAGE_05_DELIVERED_POD';
            return (
              <div
                key={stage.stageCode}
                className="p-4 rounded-xl border border-zinc-200 dark:border-[#1f2228] bg-zinc-50/70 dark:bg-[#0a0b0d] flex flex-col justify-between space-y-3 relative overflow-hidden"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-technical font-black uppercase ${
                        isDelivered
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/60'
                          : 'bg-red-50 text-[#dc2626] border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50'
                      }`}
                    >
                      STAGE 0{stage.stageNumber}
                    </span>
                    <span className="text-[10px] font-technical font-bold text-zinc-500 dark:text-zinc-400">
                      {stage.percentage}%
                    </span>
                  </div>
                  <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-100 leading-snug">
                    {stage.shortLabel.replace(/^Stage 0\d:\s*/i, '')}
                  </h4>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {stage.description}
                  </p>
                </div>

                {/* CAD Bar Indicator */}
                <div className="space-y-2 pt-2">
                  <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-[#1f2228] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isDelivered ? 'bg-[#10b981]' : 'bg-[#dc2626]'
                      }`}
                      style={{ width: `${barHeightPct}%` }}
                    />
                  </div>

                  <div className="flex items-baseline justify-between pt-1">
                    <div>
                      <span className="text-lg font-black font-technical text-zinc-900 dark:text-zinc-100">
                        {stage.count}
                      </span>
                      <span className="ml-1 text-[10px] font-technical uppercase text-zinc-500 dark:text-zinc-400">
                        Orders
                      </span>
                    </div>
                    <div className="text-right font-technical">
                      <span className="block text-[10px] font-bold text-zinc-800 dark:text-zinc-200">
                        {stage.copiesTotal.toLocaleString('en-US')} cps
                      </span>
                      <span className="block text-[9px] text-zinc-500 dark:text-zinc-400">
                        €{stage.valueEur.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Split Grid: Preflight Incident Matrix + Escrow & Storage Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 cols: Matriz de Incidencias de Preflight */}
        <div className="lg:col-span-7 p-6 rounded-2xl border border-zinc-200 dark:border-[#1f2228] bg-white dark:bg-[#12141a] space-y-4 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-[#1f2228] pb-3">
            <div>
              <span className="text-[10px] font-technical font-black uppercase tracking-widest text-[#dc2626]">
                PRE-PRESS QUALITY ASSURANCE // INCIDENT MATRIX
              </span>
              <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 mt-0.5">
                Desglose de Alertas Técnicas de Preflight (DPI, TAC &gt; 300%, Sangrado, Fuentes y Lomo)
              </h3>
            </div>
            <CpuChipIcon className="w-5 h-5 text-[#dc2626]" />
          </div>

          <div className="space-y-3">
            {prepressHealth.incidentMatrix.map((inc) => {
              const widthPct = inc.count > 0 ? Math.max(12, Math.round((inc.count / maxIncidentCount) * 100)) : 4;
              const isCritical = inc.severity === 'CRITICAL';
              return (
                <div
                  key={inc.code}
                  className="p-3.5 rounded-xl border border-zinc-200 dark:border-[#1f2228] bg-zinc-50/70 dark:bg-[#0a0b0d] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-technical font-black uppercase shrink-0 ${
                          isCritical
                            ? 'bg-red-50 text-[#dc2626] border border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800/60'
                            : 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
                        }`}
                      >
                        {inc.code}
                      </span>
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {inc.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-technical">
                      {inc.autoFixable && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50">
                          FIX-IT AUTO
                        </span>
                      )}
                      <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                        {inc.count} {inc.count === 1 ? 'case' : 'cases'}
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-[#1f2228] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        inc.count === 0
                          ? 'bg-emerald-500'
                          : isCritical
                          ? 'bg-[#dc2626]'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-technical text-zinc-500 dark:text-zinc-400">
                    <span>Normative Rule: {inc.standardRef}</span>
                    <span>Severity: {inc.severity}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 5 cols: Consolidación Escrow + Desglose Binario en Disco */}
        <div className="lg:col-span-5 space-y-6">
          {/* Escrow Ledger Consolidation Card */}
          <div className="p-6 rounded-2xl border border-zinc-200 dark:border-[#1f2228] bg-white dark:bg-[#12141a] space-y-4 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-[#1f2228] pb-3">
              <div>
                <span className="text-[10px] font-technical font-black uppercase tracking-widest text-[#10b981]">
                  ESCROW &amp; MOR FINANCIAL LEDGER
                </span>
                <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 mt-0.5">
                  Consolidación por Estado de Fondos (EUR)
                </h3>
              </div>
              <ShieldCheckIcon className="w-5 h-5 text-[#10b981]" />
            </div>

            <div className="space-y-2.5 text-xs font-technical">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#0a0b0d] border border-zinc-200 dark:border-[#1f2228] flex items-center justify-between">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                    UNFUNDED (AWAITING WIRE / CHECKOUT)
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {escrow.states.UNFUNDED.count} Orders pending settlement
                  </span>
                </div>
                <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                  €{escrow.states.UNFUNDED.volumeEur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#0a0b0d] border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-[#10b981]">
                    FUNDS_LOCKED_ON_PROOF_APPROVAL
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {escrow.states.FUNDS_LOCKED_ON_PROOF_APPROVAL.count} Orders in active Escrow hold
                  </span>
                </div>
                <span className="text-sm font-black text-[#10b981]">
                  €{escrow.states.FUNDS_LOCKED_ON_PROOF_APPROVAL.volumeEur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#0a0b0d] border border-zinc-200 dark:border-[#1f2228] flex items-center justify-between">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-zinc-700 dark:text-zinc-300">
                    RELEASED_ON_SIGNED_POD
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {escrow.states.RELEASED_ON_SIGNED_POD.count} Orders settled post-CMR signature
                  </span>
                </div>
                <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                  €{escrow.states.RELEASED_ON_SIGNED_POD.volumeEur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Storage & I/O Role Breakdown Card */}
          <div className="p-6 rounded-2xl border border-zinc-200 dark:border-[#1f2228] bg-white dark:bg-[#12141a] space-y-4 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-[#1f2228] pb-3">
              <div>
                <span className="text-[10px] font-technical font-black uppercase tracking-widest text-amber-500">
                  STORAGE &amp; BINARY I/O TELEMETRY
                </span>
                <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 mt-0.5">
                  Activos Binarios por Rol (`storage/marketplace_orders/`)
                </h3>
              </div>
              <ServerStackIcon className="w-5 h-5 text-amber-500" />
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center font-technical">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#0a0b0d] border border-zinc-200 dark:border-[#1f2228]">
                <span className="block text-[9px] font-bold uppercase text-[#dc2626]">INTERIOR_PDF</span>
                <span className="block text-base font-black text-zinc-900 dark:text-zinc-100 mt-1">
                  {storageIo.byRole.INTERIOR_PDF.count}
                </span>
                <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
                  {storageIo.byRole.INTERIOR_PDF.megabytes.toFixed(2)} MB
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#0a0b0d] border border-zinc-200 dark:border-[#1f2228]">
                <span className="block text-[9px] font-bold uppercase text-emerald-500">COVER_PDF</span>
                <span className="block text-base font-black text-zinc-900 dark:text-zinc-100 mt-1">
                  {storageIo.byRole.COVER_PDF.count}
                </span>
                <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
                  {storageIo.byRole.COVER_PDF.megabytes.toFixed(2)} MB
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#0a0b0d] border border-zinc-200 dark:border-[#1f2228]">
                <span className="block text-[9px] font-bold uppercase text-amber-500">WIRE_PROOF</span>
                <span className="block text-base font-black text-zinc-900 dark:text-zinc-100 mt-1">
                  {storageIo.byRole.WIRE_PROOF.count}
                </span>
                <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
                  {storageIo.byRole.WIRE_PROOF.megabytes.toFixed(2)} MB
                </span>
              </div>
            </div>

            {/* Cold Storage Retention & MySQL Snapshot Monitor (Option 2) */}
            {backupStatus && (
              <div className="pt-4 border-t border-zinc-200 dark:border-[#1f2228] space-y-3 text-xs font-technical">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-[10px] font-black uppercase tracking-widest text-[#10b981]">
                      COLD ARCHIVE &amp; MYSQL SNAPSHOTS (OPCIÓN 2)
                    </span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Cold Policy: &gt;{backupStatus.policy.retentionColdDays}d • Max Snapshots: {backupStatus.policy.backupRetentionCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={runningBackupAction !== null}
                      onClick={() => triggerStorageAction('RETENTION')}
                      className="px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-[#2d323b] bg-zinc-50 dark:bg-[#0a0b0d] hover:border-[#dc2626] text-[10px] font-bold uppercase text-zinc-800 dark:text-zinc-200"
                    >
                      {runningBackupAction === 'RETENTION' ? 'Archiving...' : 'Run Cold Archive'}
                    </button>
                    <button
                      type="button"
                      disabled={runningBackupAction !== null}
                      onClick={() => triggerStorageAction('BACKUP')}
                      className="px-2.5 py-1 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-[10px] font-bold uppercase text-white"
                    >
                      {runningBackupAction === 'BACKUP' ? 'Dumping...' : 'Snapshot DB'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-[#0a0b0d] border border-zinc-200 dark:border-[#1f2228]">
                    <span className="block text-[9px] uppercase text-zinc-500 dark:text-zinc-400">
                      COLD ARCHIVES (.TAR.GZ)
                    </span>
                    <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                      {backupStatus.retentionMetrics.archivedOrdersCount} Orders
                    </span>
                    <span className="block text-[10px] text-[#10b981]">
                      Reclaimed: {backupStatus.retentionMetrics.totalReclaimedMb.toFixed(2)} MB
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-[#0a0b0d] border border-zinc-200 dark:border-[#1f2228]">
                    <span className="block text-[9px] uppercase text-zinc-500 dark:text-zinc-400">
                      MYSQL SNAPSHOTS (.SQL.GZ)
                    </span>
                    <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                      {backupStatus.backupMetrics.availableSnapshotsCount} / {backupStatus.policy.backupRetentionCount}
                    </span>
                    <span className="block text-[10px] text-amber-500 truncate">
                      {backupStatus.backupMetrics.latestSnapshot
                        ? backupStatus.backupMetrics.latestSnapshot.filename
                        : 'Ready for snapshot'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationsTelemetryDashboard;


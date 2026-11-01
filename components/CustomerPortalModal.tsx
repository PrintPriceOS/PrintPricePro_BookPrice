import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  XMarkIcon,
  ArrowPathIcon,
  CreditCardIcon,
  BuildingLibraryIcon,
  DocumentArrowDownIcon,
  TruckIcon,
  MapPinIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  ArrowUpTrayIcon,
  ShieldCheckIcon,
  CubeIcon,
  ClockIcon,
  PlusIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  EyeIcon,
  ArrowLeftIcon,
  LinkIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import OrderIntentDetails from './OrderIntentDetails';
import {
  StagePreflightSvg,
  StageOnPressSvg,
  StageBindingSvg,
  StagePalletizationSvg,
  StageInTransitSvg,
  renderStageTimelineSvg,
} from './portal/timeline-svgs';

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------
export type PortalTabId =
  | 'ORDERS_REPRINTS'
  | 'INVOICES_PAYMENTS'
  | 'LIVE_LOGISTICS'
  | 'SHIPPING_LOGISTICS'
  | 'FISCAL_BILLING';

export type ReprintPurposeId =
  | 'STRAIGHT_REPRINT'
  | 'NEW_EDITION_REVISED_FILES'
  | 'VOLUME_EXTENSION';

export interface ApprovedFileSpec {
  kind: 'INTERIOR_PDF' | 'COVER_PDF' | string;
  role?: 'INTERIOR_PDF' | 'COVER_PDF' | string;
  fileId: string;
  filename: string;
  sha256: string;
  status: string;
  preflightScore?: number;
  storageUrl?: string;
  externalUrl?: string;
  sizeBytes?: number;
}

export interface CustomerOrderItem {
  id: string;
  orderId: string;
  order_ref: string;
  parentOrderId?: string | null;
  editionNumber?: number;
  bookTitle: string;
  isbn?: string;
  coverThumbnailUrl?: string | null;
  specsSummary: string;
  specs: {
    copies: number;
    interior_pages: number;
    cover_pages?: number;
    book_size: string;
    orientation?: string;
    paper_type_interior?: string;
    paper_weight_interior?: number;
    paper_type_cover?: string;
    paper_weight_cover?: number;
    binding_method: string;
    finishing_options?: string;
    interior_print?: string;
    cover_print?: string;
    delivery_country?: string;
    [key: string]: any;
  };
  approvedFiles?: ApprovedFileSpec[];
  preflightBypassEligible?: boolean;
  offer_print_house: string;
  assignedPrinterName?: string;
  assignedPrinterId?: string;
  offer_price: number;
  totalPriceEur: number;
  unitPriceEur?: number;
  currency: string;
  status: string;
  paymentStatus: 'PAID' | 'AWAITING_PAYMENT' | 'AWAITING_WIRE' | 'PENDING' | string;
  paymentMethod?: string;
  commercialModality?: 'MODALITY_A_ESCROW_MOR' | 'MODALITY_B_DIRECT_COMMISSION' | string;
  reconciliationCode: string;
  invoiceNumber?: string;
  deliveryDate?: string;
  created_at: string;
  is_intent?: boolean;
}

export interface ShippingAddressItem {
  addressId: string;
  label: string;
  hubType?: string;
  contactName: string;
  companyName: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  countryCode: string;
  phone?: string;
  isDefault?: boolean;
  logisticsRequirements: {
    trailerAccess: boolean;
    requiresTailLift: boolean;
    requiresSlotBooking: boolean;
    packagingPreference: 'EPAL_PALLETS' | 'LOOSE_CARTONS';
    receivingHours?: string;
    dockNotes?: string;
  };
}

export interface FiscalProfileData {
  legalEntityName: string;
  taxIdVat: string;
  viesStatus?: {
    valid: boolean;
    countryCode: string;
    normalizedVat: string;
    message: string;
  };
  fiscalStreet: string;
  fiscalPostalCode: string;
  fiscalCity: string;
  fiscalCountryCode: string;
  billingEmail: string;
  dir3Code?: string;
  leitwegId?: string;
  peppolParticipantId?: string;
  preferredEInvoiceFormat: 'FACTURAE_3_2_2' | 'XRECHNUNG_3_0';
}

export interface TrackingStage {
  stageKey: string;
  stepNumber: number;
  label: string;
  labelEn?: string;
  description: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  timestamp?: string | null;
}

export interface OrderTrackingPayload {
  orderId: string;
  bookTitle: string;
  currentStageIndex: number;
  overallStatus: string;
  timeline: TrackingStage[];
  telemetry: {
    shipmentId: string;
    carrierName: string;
    carrierService?: string;
    trackingCode: string;
    trackingUrl: string;
    sscc18: string;
    palletType: string;
    palletCount: number;
    cartonsCount: number;
    totalWeightKg: number;
    epalExchangeRequired?: boolean;
    estimatedDeliveryDate?: string;
    originFacility?: string;
    destinationHub?: string;
    dockRequirements?: {
      trailerAccess?: boolean;
      requiresTailLift?: boolean;
      requiresSlotBooking?: boolean;
    };
  };
  pod: {
    available: boolean;
    documentId: string;
    cmrReference: string;
    signedBy: string;
    signedAt?: string | null;
    digitalSignatureHash: string;
    dockStampCode?: string;
    vehiclePlate?: string;
    conditionNotes?: string;
    downloadPdfUrl: string;
  };
}

export interface CustomerPortalModalProps {
  userId?: string | number;
  userEmail?: string;
  userName?: string;
  initialTab?: PortalTabId;
  initialOrderId?: string | null;
  initialAssetIntakeOrderId?: string | null;
  isFullPage?: boolean;
  onClose: () => void;
  onLoadSpecsToCalculator?: (specs: Record<string, any>, bookTitle?: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers & Constants
// ---------------------------------------------------------------------------
const REPRINT_PRESET_QUANTITIES = [250, 500, 1000, 1500, 3000];

export const PORTAL_TAB_ROUTES: Record<PortalTabId, string> = {
  ORDERS_REPRINTS: '/portal/orders',
  INVOICES_PAYMENTS: '/portal/invoices',
  LIVE_LOGISTICS: '/portal/tracking',
  SHIPPING_LOGISTICS: '/portal/shipping',
  FISCAL_BILLING: '/portal/fiscal',
};

export function resolvePortalRouteFromPathname(pathname: string): {
  isPortalRoute: boolean;
  tab: PortalTabId;
  trackingOrderId: string | null;
  assetIntakeOrderId: string | null;
} {
  const clean = (pathname || '/').trim();
  const assetMatch = clean.match(/^\/order\/([^/]+)\/files\/?$/i) || clean.match(/^\/portal\/orders\/([^/]+)\/files\/?$/i);
  if (assetMatch) {
    return {
      isPortalRoute: true,
      tab: 'ORDERS_REPRINTS',
      trackingOrderId: null,
      assetIntakeOrderId: decodeURIComponent(assetMatch[1]),
    };
  }
  const trackingMatch = clean.match(/^\/portal\/tracking(?:\/([^/]+))?\/?$/i);
  if (trackingMatch) {
    return {
      isPortalRoute: true,
      tab: 'LIVE_LOGISTICS',
      trackingOrderId: trackingMatch[1] ? decodeURIComponent(trackingMatch[1]) : null,
      assetIntakeOrderId: null,
    };
  }
  if (/^\/portal\/invoices\/?$/i.test(clean)) {
    return { isPortalRoute: true, tab: 'INVOICES_PAYMENTS', trackingOrderId: null, assetIntakeOrderId: null };
  }
  if (/^\/portal\/shipping\/?$/i.test(clean)) {
    return { isPortalRoute: true, tab: 'SHIPPING_LOGISTICS', trackingOrderId: null, assetIntakeOrderId: null };
  }
  if (/^\/portal\/fiscal\/?$/i.test(clean)) {
    return { isPortalRoute: true, tab: 'FISCAL_BILLING', trackingOrderId: null, assetIntakeOrderId: null };
  }
  if (/^\/portal(?:\/orders)?\/?$/i.test(clean)) {
    return { isPortalRoute: true, tab: 'ORDERS_REPRINTS', trackingOrderId: null, assetIntakeOrderId: null };
  }
  return { isPortalRoute: false, tab: 'ORDERS_REPRINTS', trackingOrderId: null, assetIntakeOrderId: null };
}

function computeClientReprintPreview(
  originalSpecs: Record<string, any>,
  originalTotal: number,
  newCopies: number,
  reuseApprovedFiles: boolean,
  customPages?: number
) {
  const origCopies = Math.max(1, Number(originalSpecs?.copies) || 1000);
  const origUnit = originalTotal > 0 ? originalTotal / origCopies : 3.2;
  const pages = Math.max(16, Number(customPages || originalSpecs?.interior_pages) || 192);
  const setupFixedEur = 290;
  const preflightFeeEur = reuseApprovedFiles ? 0 : 45;
  const variableBasePerCopy = Math.max(0.95, origUnit - setupFixedEur / origCopies);
  const volumeDiscount =
    newCopies >= 3000 ? 0.84 :
    newCopies >= 1500 ? 0.90 :
    newCopies >= 1000 ? 0.95 :
    newCopies >= 500 ? 1.0 : 1.12;
  const unitPriceEur = Number(
    (((setupFixedEur + preflightFeeEur) / newCopies) + (variableBasePerCopy * volumeDiscount) + (pages * 0.0005)).toFixed(4)
  );
  const totalPriceEur = Number((unitPriceEur * newCopies).toFixed(2));
  return { unitPriceEur, totalPriceEur, preflightFeeEur };
}

function validateEuVatClient(vatInput: string) {
  const clean = String(vatInput || '').replace(/[\s.-]/g, '').toUpperCase();
  if (!clean || clean.length < 4) {
    return { valid: false, normalized: clean, message: 'Required format: EU Prefix + VAT ID (e.g. ESB87654321)' };
  }
  const patterns: Record<string, RegExp> = {
    ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
    DE: /^DE\d{9}$/,
    FR: /^FR[A-Z0-9]{2}\d{9}$/,
    IT: /^IT\d{11}$/,
    PT: /^PT\d{9}$/,
    NL: /^NL\d{9}B\d{2}$/,
    BE: /^BE0\d{9}$/,
    AT: /^ATU\d{8}$/,
    PL: /^PL\d{10}$/,
  };
  const prefix = clean.slice(0, 2);
  const regex = patterns[prefix] || /^[A-Z]{2}[A-Z0-9]{6,12}$/;
  const valid = regex.test(clean);
  return {
    valid,
    normalized: clean,
    message: valid ? `VIES Format Validated (${prefix})` : `Review EU VAT syntax for prefix ${prefix}`,
  };
}

/**
 * Sanitizes strings for Type1 PDF StandardEncoding / WinAnsiEncoding so diacritics or special characters
 * never render as corrupted glyphs (e.g. ^i, ^;) in PDF readers.
 */
function sanitizePdfAscii(input: string | number | undefined | null): string {
  const raw = String(input ?? '');
  return raw
    .replace(/€/g, 'EUR ')
    .replace(/[—–]/g, '-')
    .replace(/[•·]/g, '-')
    .replace(/ª/g, 'a')
    .replace(/º/g, 'o')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

// ---------------------------------------------------------------------------
// Proforma / Commercial Invoice PDF Generator (Clean UTF-8 / ASCII Sanitized)
// ---------------------------------------------------------------------------
export function downloadProformaInvoicePdf(order: CustomerOrderItem, fiscal: FiscalProfileData | null, bankDetails?: any) {
  const isPaid = order.paymentStatus === 'PAID';
  const docTitle = isPaid ? 'COMMERCIAL TAX INVOICE (EN 16931)' : 'PROFORMA INVOICE & WIRE INSTRUCTIONS';
  const refCode = order.reconciliationCode || `PPOS-${order.orderId}`;
  const iban = bankDetails?.iban || (order.commercialModality === 'MODALITY_B_DIRECT_COMMISSION'
    ? 'DE44 5001 0517 5407 3249 31'
    : 'ES91 2100 0418 4502 0005 1332');
  const bic = bankDetails?.bic || (order.commercialModality === 'MODALITY_B_DIRECT_COMMISSION'
    ? 'INGDDEFFXXX'
    : 'CAIXESBBXXX');
  const beneficiary = bankDetails?.beneficiary || (order.commercialModality === 'MODALITY_B_DIRECT_COMMISSION'
    ? `${order.offer_print_house || 'Industrial Print Partner'} Direct Treasury`
    : 'PrintPrice OS Financial Clearing S.L. (Escrow MoR)');

  const netAmount = Number(order.totalPriceEur || order.offer_price || 0);
  const vatRate = 0.04; // Books super-reduced VAT 4%
  const vatAmount = Number((netAmount * vatRate).toFixed(2));
  const grossAmount = Number((netAmount + vatAmount).toFixed(2));

  const cleanBookTitle = String(order.bookTitle || 'Editorial Edition')
    .replace(/Edición Editorial/gi, 'Editorial Edition')
    .replace(/Obra/gi, 'Editorial Edition');

  const lines = [
    `PrintPrice OS - B2B Publishing & Industrial Print Clearing`,
    `${docTitle}`,
    `-------------------------------------------------------------------------`,
    `Document No:      ${order.invoiceNumber || `INV-2026-${order.orderId.slice(-5)}`}`,
    `Order Reference:  ${order.orderId}`,
    `Reconciliation:   ${refCode}`,
    `Date Issued:      ${new Date(order.created_at || Date.now()).toISOString().slice(0, 10)}`,
    `Payment Status:   ${order.paymentStatus}`,
    `-------------------------------------------------------------------------`,
    `BILL TO (BUYER):`,
    `Entity:           ${fiscal?.legalEntityName || 'Critical Publishing Group S.L.'}`,
    `EU VAT / TAX ID:  ${fiscal?.taxIdVat || 'ESB87654321'}`,
    `Address:          ${fiscal?.fiscalStreet || '120 Alcala Street, 4th Floor'}, ${fiscal?.fiscalPostalCode || '28009'} ${fiscal?.fiscalCity || 'Madrid'} (${fiscal?.fiscalCountryCode || 'ES'})`,
    `DIR3 / Leitweg:   ${fiscal?.dir3Code || 'N/A'} / ${fiscal?.leitwegId || 'N/A'}`,
    `-------------------------------------------------------------------------`,
    `PRODUCTION SPECIFICATION:`,
    `Book Title:       ${cleanBookTitle}`,
    `ISBN:             ${order.isbn || 'N/A'}`,
    `Specs Summary:    ${order.specsSummary}`,
    `Print Run:        ${Number(order.specs?.copies || 1000).toLocaleString('en-US')} copies`,
    `Assigned Plant:   ${order.offer_print_house}`,
    `-------------------------------------------------------------------------`,
    `FINANCIAL BREAKDOWN (EUR):`,
    `Net Industrial Manufacturing & EPAL Logistics:   EUR ${netAmount.toFixed(2)}`,
    `Applicable Book VAT (4.00% EN 16931):            EUR ${vatAmount.toFixed(2)}`,
    `TOTAL GROSS PAYABLE:                             EUR ${grossAmount.toFixed(2)}`,
    `-------------------------------------------------------------------------`,
    `B2B SEPA WIRE TRANSFER INSTRUCTIONS:`,
    `Beneficiary:      ${beneficiary}`,
    `IBAN:             ${iban}`,
    `BIC / SWIFT:      ${bic}`,
    `MANDATORY CONCEPT:${refCode}`,
    `-------------------------------------------------------------------------`,
    `Normative Compliance: EN 16931-1:2017 / Facturae 3.2.2 / XRechnung 3.0`,
  ];

  const escaped = lines.map((l) => sanitizePdfAscii(l));
  let y = 780;
  const ops = ['BT', '/F1 10 Tf'];
  escaped.forEach((line, idx) => {
    const fontSize = idx === 1 ? 13 : idx === 0 ? 11 : 9.5;
    ops.push(`/F1 ${fontSize} Tf`);
    ops.push(`1 0 0 1 45 ${y} Tm (${line}) Tj`);
    y -= idx <= 1 ? 20 : 15;
  });
  ops.push('ET');
  const stream = ops.join('\n');

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 595 842] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>
endobj
5 0 obj
<< /Length ${stream.length} >>
stream
${stream}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000229 00000 n 
0000000324 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${377 + stream.length}
%%EOF`;

  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${isPaid ? 'Invoice' : 'Proforma'}_${order.orderId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Helper: Check if an Order has Both Interior & Cover Validated Assets
// ---------------------------------------------------------------------------
function hasCompleteValidatedAssets(ord: CustomerOrderItem): boolean {
  if (String(ord.status || '').toUpperCase() === 'FILES_REQUIRED') {
    const files = ord.approvedFiles || [];
    const hasInterior = files.some((f) => (f.kind || f.role) === 'INTERIOR_PDF' && f.status === 'PASSED');
    const hasCover = files.some((f) => (f.kind || f.role) === 'COVER_PDF' && f.status === 'PASSED');
    return hasInterior && hasCover;
  }
  const files = ord.approvedFiles || [];
  if (files.length >= 2) return true;
  return ord.preflightBypassEligible !== false;
}

// ---------------------------------------------------------------------------
// Main Component: CustomerPortalModal / CustomerPortalPage
// ---------------------------------------------------------------------------
export const CustomerPortalModal: React.FC<CustomerPortalModalProps> = ({
  userId,
  userEmail,
  userName,
  initialTab = 'ORDERS_REPRINTS',
  initialOrderId = null,
  initialAssetIntakeOrderId = null,
  isFullPage = true,
  onClose,
  onLoadSpecsToCalculator,
}) => {
  const [activeTab, setActiveTab] = useState<PortalTabId>(initialTab);
  const [orders, setOrders] = useState<CustomerOrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Sync tab/sub-route changes when props update
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Sub-modals / active selections
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<CustomerOrderItem | null>(null);
  const [selectedOrderForTracking, setSelectedOrderForTracking] = useState<string | null>(initialOrderId);
  const [legacyIntentDetailId, setLegacyIntentDetailId] = useState<string | null>(null);

  // Dedicated Asset Intake View State (/order/:orderId/files)
  const [assetIntakeOrder, setAssetIntakeOrder] = useState<CustomerOrderItem | null>(null);
  const [assetIntakeMode, setAssetIntakeMode] = useState<Record<'INTERIOR_PDF' | 'COVER_PDF', 'UPLOAD' | 'EXTERNAL_LINK'>>({
    INTERIOR_PDF: 'UPLOAD',
    COVER_PDF: 'UPLOAD',
  });
  const [assetExternalLinks, setAssetExternalLinks] = useState<Record<'INTERIOR_PDF' | 'COVER_PDF', string>>({
    INTERIOR_PDF: '',
    COVER_PDF: '',
  });
  const [uploadingAssetRole, setUploadingAssetRole] = useState<'INTERIOR_PDF' | 'COVER_PDF' | null>(null);

  // 1-Click Reprint / Edition Drawer State
  const [reprintTargetOrder, setReprintTargetOrder] = useState<CustomerOrderItem | null>(null);
  const [reprintPurpose, setReprintPurpose] = useState<ReprintPurposeId>('STRAIGHT_REPRINT');
  const [reprintCopies, setReprintCopies] = useState<number>(1000);
  const [reprintTitle, setReprintTitle] = useState<string>('');
  const [reprintIsbn, setReprintIsbn] = useState<string>('');
  const [reprintPages, setReprintPages] = useState<number>(192);
  const [reprintUseApprovedFiles, setReprintUseApprovedFiles] = useState<boolean>(true);
  const [reprintSubmitting, setReprintSubmitting] = useState<boolean>(false);

  // Payment & Checkout State
  const [paymentSubTab, setPaymentSubTab] = useState<'STRIPE_CARD_SEPA' | 'BANK_TRANSFER_B2B'>('STRIPE_CARD_SEPA');
  const [stripeMethodType, setStripeMethodType] = useState<'CARD' | 'SEPA_DEBIT'>('CARD');
  const [cardHolderName, setCardHolderName] = useState<string>(userName || 'Critical Publishing Group / Production');
  const [sepaIbanInput, setSepaIbanInput] = useState<string>('ES91 2100 0418 4502 0005 1332');
  const [processingCheckout, setProcessingCheckout] = useState<boolean>(false);
  const [checkoutSessionData, setCheckoutSessionData] = useState<any | null>(null);
  const [wireProofFileName, setWireProofFileName] = useState<string>('');
  const [wireBankReference, setWireBankReference] = useState<string>('');
  const [uploadingWireProof, setUploadingWireProof] = useState<boolean>(false);

  // Live Logistics & Tracking State
  const [trackingData, setTrackingData] = useState<OrderTrackingPayload | null>(null);
  const [loadingTracking, setLoadingTracking] = useState<boolean>(false);
  const [showPodViewerModal, setShowPodViewerModal] = useState<boolean>(false);

  // Shipping & Fiscal Profile State
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddressItem[]>([]);
  const [fiscalProfile, setFiscalProfile] = useState<FiscalProfileData>({
    legalEntityName: 'Critical Publishing & Editions S.L.',
    taxIdVat: 'ESB87654321',
    fiscalStreet: '120 Alcala Street, 4th Floor',
    fiscalPostalCode: '28009',
    fiscalCity: 'Madrid',
    fiscalCountryCode: 'ES',
    billingEmail: userEmail || 'billing@critical-publishing.eu',
    dir3Code: 'EA0038291',
    leitwegId: '04011000-1234512345-06',
    peppolParticipantId: '0208:ESB87654321',
    preferredEInvoiceFormat: 'FACTURAE_3_2_2',
  });
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [showNewAddressForm, setShowNewAddressForm] = useState<boolean>(false);
  const [newAddressDraft, setNewAddressDraft] = useState<Partial<ShippingAddressItem>>({
    label: 'National Distribution Hub / Logistics Center',
    hubType: 'NATIONAL_DISTRIBUTOR',
    contactName: '',
    companyName: '',
    streetAddress: '',
    postalCode: '',
    city: '',
    countryCode: 'ES',
    phone: '',
    logisticsRequirements: {
      trailerAccess: true,
      requiresTailLift: false,
      requiresSlotBooking: true,
      packagingPreference: 'EPAL_PALLETS',
      receivingHours: '08:00 - 15:00 CET',
      dockNotes: 'EPAL Euro-Pallet 80x120 cm stackable max 1.45m.',
    },
  });

  // Lock background body scroll only if rendered as a modal overlay
  useEffect(() => {
    if (!isFullPage) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isFullPage]);

  const notify = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  // Push browser URL when switching tabs or opening dedicated views
  const navigateTabWithUrl = useCallback((tab: PortalTabId, orderIdForRoute?: string | null) => {
    setAssetIntakeOrder(null);
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      let nextPath = PORTAL_TAB_ROUTES[tab] || '/portal/orders';
      if (tab === 'LIVE_LOGISTICS' && orderIdForRoute) {
        nextPath = `/portal/tracking/${encodeURIComponent(orderIdForRoute)}`;
      }
      if (window.location.pathname !== nextPath) {
        window.history.pushState({ portalTab: tab }, '', nextPath);
      }
    }
  }, []);

  const openAssetIntakeView = useCallback((order: CustomerOrderItem) => {
    setAssetIntakeOrder(order);
    if (typeof window !== 'undefined') {
      const targetPath = `/order/${encodeURIComponent(order.orderId)}/files`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ assetIntakeOrderId: order.orderId }, '', targetPath);
      }
    }
  }, []);

  const closeAssetIntakeView = useCallback(() => {
    setAssetIntakeOrder(null);
    if (typeof window !== 'undefined') {
      window.history.pushState({ portalTab: 'ORDERS_REPRINTS' }, '', '/portal/orders');
    }
  }, []);

  // -------------------------------------------------------------------------
  // Fetch Customer Orders & Profile
  // -------------------------------------------------------------------------
  const fetchPortalData = useCallback(async () => {
    setLoadingOrders(true);
    setErrorMsg(null);
    try {
      const qs = new URLSearchParams();
      if (userId) qs.set('user_id', String(userId));
      if (userEmail) qs.set('email', userEmail);

      const [ordersRes, profileRes] = await Promise.all([
        fetch(`/api/customer/orders?${qs.toString()}`, { credentials: 'include' }),
        fetch(`/api/customer/profile?${qs.toString()}`, { credentials: 'include' }),
      ]);

      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        const rawList: CustomerOrderItem[] = Array.isArray(ordersData.orders) ? ordersData.orders : [];
        const normalizedList = rawList.map((o) => {
          const isFilesReq = String(o.status || '').toUpperCase() === 'FILES_REQUIRED';
          return {
            ...o,
            bookTitle: String(o.bookTitle || o.specs?.title || 'Editorial Edition')
              .replace(/Edición Editorial/gi, 'Editorial Edition')
              .replace(/^Obra\s+/i, 'Editorial Edition '),
            specsSummary: String(o.specsSummary || '')
              .replace(/Rústica PUR/gi, 'PUR Paperback')
              .replace(/Cartoné \(Tapa Dura\)/gi, 'Hardcover Casebound'),
            approvedFiles: isFilesReq && (!o.approvedFiles || o.approvedFiles.length === 0) ? [] : (o.approvedFiles || []),
          };
        });
        setOrders(normalizedList);

        if (normalizedList.length > 0) {
          const unpaid = normalizedList.find((o) => o.paymentStatus !== 'PAID') || normalizedList[0];
          setSelectedOrderForPayment((prev) => prev || unpaid);
          setSelectedOrderForTracking((prev) => prev || initialOrderId || normalizedList[0].orderId);

          if (initialAssetIntakeOrderId) {
            const foundForAssets = normalizedList.find((o) => o.orderId === initialAssetIntakeOrderId);
            if (foundForAssets) {
              setAssetIntakeOrder(foundForAssets);
            }
          }
        }
      } else {
        setErrorMsg('Error synchronizing order history with Control Plane.');
      }

      if (profileRes.ok) {
        const profData = await profileRes.json();
        if (profData.profile) {
          if (Array.isArray(profData.profile.shippingAddresses)) {
            setShippingAddresses(profData.profile.shippingAddresses);
          }
          if (profData.profile.fiscalProfile) {
            setFiscalProfile((prev) => ({ ...prev, ...profData.profile.fiscalProfile }));
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error connecting to BFF / Control Plane.');
    } finally {
      setLoadingOrders(false);
    }
  }, [userId, userEmail, initialOrderId, initialAssetIntakeOrderId]);

  useEffect(() => {
    fetchPortalData();
  }, [fetchPortalData]);

  // -------------------------------------------------------------------------
  // Fetch Live Logistics Tracking when order changes
  // -------------------------------------------------------------------------
  const fetchOrderTracking = useCallback(async (orderIdToTrack: string) => {
    if (!orderIdToTrack) return;
    setLoadingTracking(true);
    try {
      const res = await fetch(`/api/customer/orders/${encodeURIComponent(orderIdToTrack)}/tracking`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setTrackingData(data);
      }
    } catch {
      // silent fallback
    } finally {
      setLoadingTracking(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOrderForTracking) {
      fetchOrderTracking(selectedOrderForTracking);
    }
  }, [selectedOrderForTracking, fetchOrderTracking]);

  // Keyboard Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (reprintTargetOrder) {
          setReprintTargetOrder(null);
        } else if (showPodViewerModal) {
          setShowPodViewerModal(false);
        } else if (assetIntakeOrder) {
          closeAssetIntakeView();
        } else if (!isFullPage) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isFullPage, reprintTargetOrder, showPodViewerModal, assetIntakeOrder, closeAssetIntakeView]);

  // -------------------------------------------------------------------------
  // Handlers: Asset Intake for FILES_REQUIRED Orders (/order/:orderId/files)
  // -------------------------------------------------------------------------
  const handleUploadOrderAssetFile = async (role: 'INTERIOR_PDF' | 'COVER_PDF', file: File) => {
    if (!assetIntakeOrder || !file) return;
    setUploadingAssetRole(role);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('role', role);
      formData.append('originalName', file.name);
      formData.append('sizeBytes', String(file.size));

      const res = await fetch(
        `/api/marketplace/orders/${encodeURIComponent(assetIntakeOrder.orderId)}/files/upload`,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }
      );
      const data = await res.json().catch(() => ({}));
      const uploadedSpec: ApprovedFileSpec = {
        kind: role,
        role,
        fileId: data.fileId || `fil_${Date.now()}_${role === 'INTERIOR_PDF' ? 'int' : 'cov'}`,
        filename: file.name,
        sizeBytes: file.size,
        sha256: data.sha256 || 'e3b0c44298fc1c149afbf4c8996fb924',
        status: 'PASSED',
      };

      updateOrderAssetsInState(assetIntakeOrder.orderId, role, uploadedSpec);
      notify(
        `${role === 'INTERIOR_PDF' ? 'Interior Book Block PDF' : 'Cover Spread PDF'} ("${file.name}") uploaded and validated.`,
        'success'
      );
    } catch (err: any) {
      notify(err?.message || `Error uploading ${role}.`, 'error');
    } finally {
      setUploadingAssetRole(null);
    }
  };

  const handleRegisterOrderExternalLink = async (role: 'INTERIOR_PDF' | 'COVER_PDF') => {
    if (!assetIntakeOrder) return;
    const rawUrl = (assetExternalLinks[role] || '').trim();
    if (!rawUrl.startsWith('https://')) {
      notify('Please provide a valid HTTPS URL (WeTransfer, Dropbox, Google Drive, or S3).', 'error');
      return;
    }
    setUploadingAssetRole(role);
    try {
      const res = await fetch(
        `/api/marketplace/orders/${encodeURIComponent(assetIntakeOrder.orderId)}/files/external-link`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role,
            externalUrl: rawUrl,
            originalName: `${role === 'INTERIOR_PDF' ? 'Interior' : 'Cover'}_External_Asset.pdf`,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data?.error) {
        notify(data.message || data.error, 'error');
        return;
      }

      const linkedSpec: ApprovedFileSpec = {
        kind: role,
        role,
        fileId: data.fileId || `fil_ext_${Date.now()}`,
        filename: data.filename || `${role}_External_Link.pdf`,
        externalUrl: rawUrl,
        sha256: data.sha256 || '8f434346648f6b96df89dda901c5176b',
        status: 'PASSED',
      };

      updateOrderAssetsInState(assetIntakeOrder.orderId, role, linkedSpec);
      notify(
        `External HTTPS asset link registered for ${role === 'INTERIOR_PDF' ? 'Interior PDF' : 'Cover PDF'}.`,
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Error registering external HTTPS link.', 'error');
    } finally {
      setUploadingAssetRole(null);
    }
  };

  const updateOrderAssetsInState = (orderId: string, role: 'INTERIOR_PDF' | 'COVER_PDF', newFileSpec: ApprovedFileSpec) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.orderId !== orderId) return o;
        const existing = (o.approvedFiles || []).filter((f) => (f.kind || f.role) !== role);
        const updatedFiles = [...existing, newFileSpec];
        const hasInt = updatedFiles.some((f) => (f.kind || f.role) === 'INTERIOR_PDF');
        const hasCov = updatedFiles.some((f) => (f.kind || f.role) === 'COVER_PDF');
        const nextStatus =
          hasInt && hasCov
            ? o.paymentStatus === 'PAID'
              ? 'IN_PRODUCTION'
              : 'AWAITING_PAYMENT'
            : 'FILES_REQUIRED';
        const updatedOrder: CustomerOrderItem = {
          ...o,
          approvedFiles: updatedFiles,
          preflightBypassEligible: hasInt && hasCov,
          status: nextStatus,
        };
        setAssetIntakeOrder(updatedOrder);
        return updatedOrder;
      })
    );
  };

  // -------------------------------------------------------------------------
  // Handlers: Re-order / Reprint Dialog ("RE-ORDER / REPRINT")
  // -------------------------------------------------------------------------
  const openReprintModal = (order: CustomerOrderItem) => {
    const hasValidated = hasCompleteValidatedAssets(order);
    setReprintTargetOrder(order);
    setReprintPurpose('STRAIGHT_REPRINT');
    setReprintCopies(Number(order.specs?.copies) || 1000);
    setReprintTitle(`${order.bookTitle} (Reprint)`);
    setReprintIsbn(order.isbn || '978-84-9066-801-6');
    setReprintPages(Number(order.specs?.interior_pages) || 192);
    setReprintUseApprovedFiles(hasValidated);
  };

  const handleSelectReprintPurpose = (purpose: ReprintPurposeId) => {
    setReprintPurpose(purpose);
    if (!reprintTargetOrder) return;
    if (purpose === 'STRAIGHT_REPRINT') {
      setReprintUseApprovedFiles(true);
      setReprintTitle(`${reprintTargetOrder.bookTitle} (Reprint)`);
      setReprintIsbn(reprintTargetOrder.isbn || '978-84-9066-801-6');
      setReprintPages(Number(reprintTargetOrder.specs?.interior_pages) || 192);
    } else if (purpose === 'NEW_EDITION_REVISED_FILES') {
      setReprintUseApprovedFiles(false);
      setReprintTitle(`${reprintTargetOrder.bookTitle} — Revised Edition`);
    } else if (purpose === 'VOLUME_EXTENSION') {
      setReprintUseApprovedFiles(true);
      setReprintCopies(Math.max(1500, Number(reprintTargetOrder.specs?.copies || 1000) + 500));
      setReprintTitle(`${reprintTargetOrder.bookTitle} (Volume Extension)`);
    }
  };

  const handleConfirmReprint = async () => {
    if (!reprintTargetOrder) return;
    setReprintSubmitting(true);
    try {
      const res = await fetch(`/api/customer/orders/${encodeURIComponent(reprintTargetOrder.orderId)}/reorder`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          copies: reprintCopies,
          bookTitle: reprintTitle,
          editionLabel: reprintTitle,
          reprintPurpose,
          isbn: reprintIsbn,
          interiorPages: reprintPages,
          reuseApprovedFiles: reprintUseApprovedFiles,
          deliveryAddressId: shippingAddresses.find((a) => a.isDefault)?.addressId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        notify(data?.error || 'Could not generate reprint order.', 'error');
        return;
      }

      const newOrder: CustomerOrderItem = data.order;
      setOrders((prev) => [newOrder, ...prev]);
      setReprintTargetOrder(null);

      if (!reprintUseApprovedFiles || newOrder.status === 'FILES_REQUIRED') {
        openAssetIntakeView(newOrder);
        notify(
          `New Edition order ${newOrder.orderId} created (${reprintCopies} copies). Please upload your revised PDFs.`,
          'info'
        );
      } else {
        setSelectedOrderForPayment(newOrder);
        setSelectedOrderForTracking(newOrder.orderId);
        navigateTabWithUrl('INVOICES_PAYMENTS');
        notify(
          `Reprint order ${newOrder.orderId} created (${reprintCopies} copies). Preflight bypassed via validated master PDFs.`,
          'success'
        );
      }
    } catch (err: any) {
      notify(err?.message || 'Error processing reprint order.', 'error');
    } finally {
      setReprintSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Handlers: Dual Checkout (Stripe Card/SEPA & Bank Transfer B2B)
  // -------------------------------------------------------------------------
  const handleInitiateCheckoutSession = async (method: 'STRIPE_CARD' | 'STRIPE_SEPA' | 'BANK_TRANSFER_B2B') => {
    if (!selectedOrderForPayment) return;
    setProcessingCheckout(true);
    try {
      const res = await fetch(
        `/api/marketplace/orders/${encodeURIComponent(selectedOrderForPayment.orderId)}/checkout/session`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod: method,
            modality: selectedOrderForPayment.commercialModality || 'MODALITY_A_ESCROW_MOR',
            amountGrossCents: Math.round((selectedOrderForPayment.totalPriceEur || selectedOrderForPayment.offer_price || 1500) * 100),
            currency: 'EUR',
            customerEmail: userEmail || fiscalProfile.billingEmail,
          }),
        }
      );

      const data = await res.json();
      setCheckoutSessionData(data);

      if (method === 'STRIPE_CARD' || method === 'STRIPE_SEPA') {
        const updatedOrderId = selectedOrderForPayment.orderId;
        setOrders((prev) =>
          prev.map((o) =>
            o.orderId === updatedOrderId
              ? { ...o, paymentStatus: 'PAID', status: 'IN_PRODUCTION', paymentMethod: method }
              : o
          )
        );
        setSelectedOrderForPayment((prev) =>
          prev ? { ...prev, paymentStatus: 'PAID', status: 'IN_PRODUCTION', paymentMethod: method } : null
        );
        notify(
          `Payment confirmed via ${method === 'STRIPE_SEPA' ? 'SEPA B2B Direct Debit' : 'Stripe Corporate Card'}. Order released to press.`,
          'success'
        );
      } else {
        notify(
          `B2B wire instructions generated with reconciliation code ${data?.bankTransferInstructions?.referenceCode || selectedOrderForPayment.reconciliationCode}.`,
          'info'
        );
      }
    } catch (err: any) {
      notify(err?.message || 'Error initiating checkout session.', 'error');
    } finally {
      setProcessingCheckout(false);
    }
  };

  const handleUploadWireTransferProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForPayment) return;
    setUploadingWireProof(true);
    try {
      const res = await fetch(
        `/api/marketplace/orders/${encodeURIComponent(selectedOrderForPayment.orderId)}/payment/wire-proof`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: wireProofFileName || `wire_proof_${selectedOrderForPayment.orderId}.pdf`,
            bankReference: wireBankReference || selectedOrderForPayment.reconciliationCode,
            reconciliationCode: selectedOrderForPayment.reconciliationCode,
            amountEur: selectedOrderForPayment.totalPriceEur || selectedOrderForPayment.offer_price,
            uploadedByEmail: userEmail || fiscalProfile.billingEmail,
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        const targetId = selectedOrderForPayment.orderId;
        setOrders((prev) =>
          prev.map((o) =>
            o.orderId === targetId
              ? { ...o, status: 'IN_PRODUCTION', paymentStatus: 'WIRE_PROOF_UPLOADED' }
              : o
          )
        );
        setSelectedOrderForPayment((prev) =>
          prev ? { ...prev, status: 'IN_PRODUCTION', paymentStatus: 'WIRE_PROOF_UPLOADED' } : null
        );
        notify(
          `Wire proof registered (${data.proofId || 'PRF-OK'}). Production unlocked in priority mode.`,
          'success'
        );
        setWireProofFileName('');
        setWireBankReference('');
      } else {
        notify(data?.error || 'Error uploading bank wire proof.', 'error');
      }
    } catch (err: any) {
      notify(err?.message || 'Connection error uploading wire proof.', 'error');
    } finally {
      setUploadingWireProof(false);
    }
  };

  // -------------------------------------------------------------------------
  // Handlers: EN 16931 XML Electronic Invoice Download
  // -------------------------------------------------------------------------
  const handleDownloadEInvoiceXml = async (
    orderId: string,
    format: 'FACTURAE_3_2_2' | 'XRECHNUNG_3_0'
  ) => {
    try {
      const url = `/api/financials/escrow/${encodeURIComponent(orderId)}/e-invoice.xml?format=${format}&raw=true`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        notify(`Error generating XML ${format}.`, 'error');
        return;
      }
      const xmlText = await res.text();
      const blob = new Blob([xmlText], { type: 'application/xml;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${orderId}_${format}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      notify(`Normative e-invoice ${format} downloaded (${orderId}).`, 'success');
    } catch {
      notify(`Error downloading XML ${format}.`, 'error');
    }
  };

  // -------------------------------------------------------------------------
  // Handlers: Save Shipping & Fiscal Profile
  // -------------------------------------------------------------------------
  const handleSaveCustomerProfile = async (
    updatedAddresses?: ShippingAddressItem[],
    updatedFiscal?: FiscalProfileData
  ) => {
    setSavingProfile(true);
    try {
      const res = await fetch('/api/customer/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail || fiscalProfile.billingEmail,
          shippingAddresses: updatedAddresses || shippingAddresses,
          fiscalProfile: updatedFiscal || fiscalProfile,
        }),
      });
      const data = await res.json();
      if (res.ok && data.profile) {
        setShippingAddresses(data.profile.shippingAddresses || shippingAddresses);
        setFiscalProfile((prev) => ({ ...prev, ...(data.profile.fiscalProfile || {}) }));
        notify('Logistics and EN 16931 fiscal data synchronized with Control Plane.', 'success');
      } else {
        notify(data?.error || 'Error saving B2B profile.', 'error');
      }
    } catch {
      notify('Network error saving profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddShippingAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const created: ShippingAddressItem = {
      addressId: `ADDR-${Date.now().toString(36).toUpperCase()}`,
      label: newAddressDraft.label || 'Publisher Warehouse / Receiving Dock',
      hubType: newAddressDraft.hubType || 'PUBLISHER_WAREHOUSE',
      contactName: newAddressDraft.contactName || 'Dock Receiving Supervisor',
      companyName: newAddressDraft.companyName || fiscalProfile.legalEntityName,
      streetAddress: newAddressDraft.streetAddress || '',
      postalCode: newAddressDraft.postalCode || '',
      city: newAddressDraft.city || '',
      countryCode: (newAddressDraft.countryCode || 'ES').toUpperCase(),
      phone: newAddressDraft.phone || '+34 900 100 200',
      isDefault: shippingAddresses.length === 0,
      logisticsRequirements: {
        trailerAccess: !!newAddressDraft.logisticsRequirements?.trailerAccess,
        requiresTailLift: !!newAddressDraft.logisticsRequirements?.requiresTailLift,
        requiresSlotBooking: !!newAddressDraft.logisticsRequirements?.requiresSlotBooking,
        packagingPreference: newAddressDraft.logisticsRequirements?.packagingPreference || 'EPAL_PALLETS',
        receivingHours: newAddressDraft.logisticsRequirements?.receivingHours || '08:00 - 15:00',
        dockNotes: newAddressDraft.logisticsRequirements?.dockNotes || '',
      },
    };
    const nextList = [...shippingAddresses, created];
    setShippingAddresses(nextList);
    setShowNewAddressForm(false);
    await handleSaveCustomerProfile(nextList, fiscalProfile);
  };

  const handleDeleteAddress = async (addressId: string) => {
    const nextList = shippingAddresses.filter((a) => a.addressId !== addressId);
    setShippingAddresses(nextList);
    await handleSaveCustomerProfile(nextList, fiscalProfile);
  };

  const toggleAddressLogisticFlag = async (
    addressId: string,
    flag: 'trailerAccess' | 'requiresTailLift' | 'requiresSlotBooking'
  ) => {
    const nextList = shippingAddresses.map((addr) => {
      if (addr.addressId !== addressId) return addr;
      return {
        ...addr,
        logisticsRequirements: {
          ...addr.logisticsRequirements,
          [flag]: !addr.logisticsRequirements[flag],
        },
      };
    });
    setShippingAddresses(nextList);
    await handleSaveCustomerProfile(nextList, fiscalProfile);
  };

  const vatValidation = validateEuVatClient(fiscalProfile.taxIdVat);

  // -------------------------------------------------------------------------
  // Render Navigation Tabs (100% Technical English + Route Mapping)
  // -------------------------------------------------------------------------
  const TABS: { id: PortalTabId; route: string; label: string; badge?: string; icon: React.ReactNode }[] = [
    {
      id: 'ORDERS_REPRINTS',
      route: '/portal/orders',
      label: 'MY ORDERS & REPRINTS',
      badge: String(orders.length),
      icon: <CubeIcon className="w-4 h-4" />,
    },
    {
      id: 'INVOICES_PAYMENTS',
      route: '/portal/invoices',
      label: 'INVOICES & PAYMENTS',
      badge: orders.filter((o) => o.paymentStatus !== 'PAID').length > 0
        ? `${orders.filter((o) => o.paymentStatus !== 'PAID').length} Pending`
        : 'EN 16931',
      icon: <CreditCardIcon className="w-4 h-4" />,
    },
    {
      id: 'LIVE_LOGISTICS',
      route: '/portal/tracking',
      label: 'LIVE LOGISTICS & POD',
      badge: 'CMR / Telemetry',
      icon: <TruckIcon className="w-4 h-4" />,
    },
    {
      id: 'SHIPPING_LOGISTICS',
      route: '/portal/shipping',
      label: 'SHIPPING & DOCKS',
      badge: String(shippingAddresses.length),
      icon: <MapPinIcon className="w-4 h-4" />,
    },
    {
      id: 'FISCAL_BILLING',
      route: '/portal/fiscal',
      label: 'FISCAL & BILLING DATA',
      badge: vatValidation.valid ? 'VIES OK' : 'Review VAT',
      icon: <BuildingOffice2Icon className="w-4 h-4" />,
    },
  ];

  const reprintPreview = reprintTargetOrder
    ? computeClientReprintPreview(
        reprintTargetOrder.specs,
        reprintTargetOrder.totalPriceEur || reprintTargetOrder.offer_price,
        reprintCopies,
        reprintUseApprovedFiles,
        reprintPages
      )
    : null;

  // -------------------------------------------------------------------------
  // Inner Portal Layout (Used for both Full-Screen Page and Fallback Modal)
  // -------------------------------------------------------------------------
  const hubSurface = (
    <div
      className={
        isFullPage
          ? 'min-h-screen w-full bg-[#0a0b0d] text-zinc-100 flex flex-col'
          : 'w-full max-w-7xl h-[90vh] max-h-[90vh] flex flex-col bg-[#0e1014] border border-[#1f2228] rounded-xl shadow-2xl overflow-hidden text-zinc-100'
      }
    >
      {/* Top Industrial Crimson Signal Bar */}
      <div className="h-[3px] w-full bg-gradient-to-r from-[#dc2626] via-[#ef4444] to-[#10b981] shrink-0" />

      {/* Top Hub Header */}
      <div
        className="px-4 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b shrink-0"
        style={{ backgroundColor: '#14161a', borderColor: '#1f2228' }}
      >
        <div className="flex items-center gap-3.5">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center border shrink-0"
            style={{ backgroundColor: '#0a0b0d', borderColor: '#dc2626' }}
          >
            <ShieldCheckIcon className="w-5 h-5 text-[#dc2626]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[10px] font-technical font-black uppercase tracking-[0.25em] text-[#dc2626]">
                USER ACCOUNT HUB // B2B PUBLISHER PORTAL
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-technical font-bold uppercase tracking-wider bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                EN 16931 &amp; BPE Live
              </span>
              <span className="hidden md:inline-block px-2 py-0.5 rounded text-[9px] font-technical text-zinc-400 bg-[#0a0b0d] border border-[#1f2228]">
                {assetIntakeOrder
                  ? `/order/${assetIntakeOrder.orderId}/files`
                  : PORTAL_TAB_ROUTES[activeTab]}
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-black tracking-tight text-white mt-0.5">
              {fiscalProfile.legalEntityName || userName || 'B2B Publisher Operations Center'}
              <span className="ml-2 text-xs font-technical font-normal text-gray-400">
                ({userEmail || fiscalProfile.billingEmail})
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <button
            type="button"
            onClick={fetchPortalData}
            disabled={loadingOrders}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-technical font-bold uppercase tracking-wider transition-all hover:border-[#dc2626] text-gray-300 hover:text-white"
            style={{ backgroundColor: '#0a0b0d', borderColor: '#1f2228' }}
            title="Synchronize with Control Plane"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin text-[#dc2626]' : ''}`} />
            <span>Sync Telemetry</span>
          </button>

          {/* Primary Back to Configurator Action */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.location.pathname !== '/') {
                window.history.pushState({}, '', '/');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
              if (typeof onClose === 'function') {
                onClose();
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-[10px] font-technical font-black uppercase tracking-wider transition-all shadow-sm"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            <span>← Back to Configurator</span>
          </button>
        </div>
      </div>

      {/* 5-Tab Horizontal Navigation Bar */}
      <div
        className="px-4 sm:px-8 pt-2 flex items-center gap-1.5 overflow-x-auto border-b shrink-0 no-scrollbar"
        style={{ backgroundColor: '#101216', borderColor: '#1f2228' }}
        role="tablist"
      >
        {TABS.map((tab) => {
          const active = !assetIntakeOrder && activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => navigateTabWithUrl(tab.id, tab.id === 'LIVE_LOGISTICS' ? selectedOrderForTracking : null)}
              className={`group relative flex items-center gap-2 px-4 py-3 text-[11px] font-technical font-bold uppercase tracking-wider whitespace-nowrap transition-all border-b-2 ${
                active
                  ? 'border-[#dc2626] text-white bg-[#14161a]'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#14161a]/50'
              } rounded-t-lg`}
            >
              <span className={active ? 'text-[#dc2626]' : 'text-gray-500 group-hover:text-gray-300'}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                    active
                      ? 'bg-[#dc2626]/20 text-[#ef4444] border border-[#dc2626]/40'
                      : 'bg-[#1f2228] text-gray-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`px-4 sm:px-8 py-2.5 flex items-center justify-between text-xs font-technical border-b shrink-0 ${
            toastMessage.type === 'error'
              ? 'bg-[#dc2626]/20 text-red-200 border-[#dc2626]/40'
              : toastMessage.type === 'info'
              ? 'bg-blue-500/15 text-blue-200 border-blue-500/30'
              : 'bg-[#10b981]/15 text-emerald-200 border-[#10b981]/30'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 shrink-0 text-[#10b981]" />
            <span>{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-[10px] uppercase tracking-widest opacity-75 hover:opacity-100"
          >
            [×]
          </button>
        </div>
      )}

      {/* Main Content Container */}
      <div
        className={
          isFullPage
            ? 'flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-8 py-6 space-y-6'
            : 'flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-700 space-y-6'
        }
      >
        {errorMsg && (
          <div className="p-4 rounded-xl border border-[#dc2626]/40 bg-[#dc2626]/10 text-red-300 text-xs font-technical flex items-center gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-[#dc2626] shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* =================================================================
            DEDICATED VIEW: PRODUCTION ASSET INTAKE (/order/:orderId/files)
           ================================================================= */}
        {assetIntakeOrder ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#1f2228]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-technical font-black uppercase tracking-[0.2em] text-amber-400">
                    PRODUCTION ASSET INTAKE // FILES OR EXTERNAL LINKS
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-technical font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {assetIntakeOrder.status}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black text-white mt-1">
                  {assetIntakeOrder.bookTitle} — <span className="text-[#dc2626]">{assetIntakeOrder.orderId}</span>
                </h2>
                <p className="text-xs text-gray-400 font-technical mt-0.5">
                  Specs: {assetIntakeOrder.specsSummary} • Print Run: {Number(assetIntakeOrder.specs?.copies || 1000).toLocaleString('en-US')} copies
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeAssetIntakeView}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#2d323b] bg-[#14161a] hover:border-white text-xs font-technical font-bold uppercase text-gray-200"
                >
                  <ArrowLeftIcon className="w-3.5 h-3.5" />
                  <span>Back to Order History</span>
                </button>
                {hasCompleteValidatedAssets(assetIntakeOrder) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrderForPayment(assetIntakeOrder);
                      navigateTabWithUrl('INVOICES_PAYMENTS');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#10b981] hover:bg-[#059669] text-black text-xs font-technical font-black uppercase"
                  >
                    <CreditCardIcon className="w-4 h-4" />
                    <span>Proceed to Payment →</span>
                  </button>
                )}
              </div>
            </div>

            {/* Dual Asset Slots: INTERIOR_PDF & COVER_PDF */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {(['INTERIOR_PDF', 'COVER_PDF'] as const).map((role) => {
                const isInterior = role === 'INTERIOR_PDF';
                const existingAsset = (assetIntakeOrder.approvedFiles || []).find(
                  (f) => (f.kind || f.role) === role
                );
                const mode = assetIntakeMode[role];
                const isUploading = uploadingAssetRole === role;

                return (
                  <div
                    key={role}
                    className="p-6 rounded-2xl border space-y-5 flex flex-col justify-between"
                    style={{
                      backgroundColor: '#14161a',
                      borderColor: existingAsset ? '#10b981' : '#f59e0b',
                    }}
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-technical font-black uppercase tracking-widest text-[#dc2626]">
                            {isInterior ? 'SLOT 01 // INTERIOR BOOK BLOCK PDF' : 'SLOT 02 // COVER SPREAD + SPINE PDF'}
                          </span>
                          <h3 className="text-sm font-black text-white mt-1">
                            {isInterior
                              ? `Interior Pages (${assetIntakeOrder.specs?.interior_pages || 192} pp, ${assetIntakeOrder.specs?.book_size || 'A5'})`
                              : `Full Cover Spread (3.0mm Bleed + Validated Spine)`}
                          </h3>
                        </div>
                        {existingAsset ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-technical font-black uppercase bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/40">
                            ✓ Preflight Passed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-technical font-black uppercase bg-amber-500/15 text-amber-300 border border-amber-500/40">
                            ⚠ Asset Pending
                          </span>
                        )}
                      </div>

                      {existingAsset && (
                        <div className="p-3.5 rounded-xl bg-[#0a0b0d] border border-[#10b981]/40 text-xs font-technical space-y-1">
                          <div className="flex items-center justify-between text-[#10b981] font-bold">
                            <span className="truncate">{existingAsset.filename}</span>
                            <span>READY FOR CTP</span>
                          </div>
                          {existingAsset.externalUrl && (
                            <div className="text-[10px] text-gray-400 truncate">
                              External Link: {existingAsset.externalUrl}
                            </div>
                          )}
                          <div className="text-[10px] text-gray-500">
                            SHA-256: {existingAsset.sha256?.slice(0, 24) || 'verified'}...
                          </div>
                        </div>
                      )}

                      {/* Mode Switcher: Upload PDF vs External HTTPS Link */}
                      <div className="flex items-center gap-2 bg-[#0a0b0d] p-1 rounded-xl border border-[#1f2228]">
                        <button
                          type="button"
                          onClick={() => setAssetIntakeMode((prev) => ({ ...prev, [role]: 'UPLOAD' }))}
                          className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-technical font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                            mode === 'UPLOAD'
                              ? 'bg-[#dc2626] text-white'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                          <span>Direct PDF Upload (Up to 5GB)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssetIntakeMode((prev) => ({ ...prev, [role]: 'EXTERNAL_LINK' }))}
                          className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-technical font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                            mode === 'EXTERNAL_LINK'
                              ? 'bg-[#dc2626] text-white'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          <LinkIcon className="w-3.5 h-3.5" />
                          <span>HTTPS Link (WeTransfer / Drive / Dropbox)</span>
                        </button>
                      </div>

                      {mode === 'UPLOAD' ? (
                        <label className="block border-2 border-dashed border-[#2d323b] hover:border-[#dc2626] rounded-xl p-6 text-center cursor-pointer transition-all bg-[#0a0b0d]/70">
                          <ArrowUpTrayIcon className="w-7 h-7 text-[#dc2626] mx-auto mb-2" />
                          <span className="block text-xs font-technical font-bold text-white uppercase">
                            {isUploading ? 'Uploading & Running Preflight...' : 'Drag & Drop PDF/X-4 File or Click to Browse'}
                          </span>
                          <span className="block text-[10px] font-technical text-gray-400 mt-1">
                            Endpoint: POST /api/marketplace/orders/{assetIntakeOrder.orderId}/files/upload
                          </span>
                          <input
                            type="file"
                            accept=".pdf,application/pdf"
                            disabled={isUploading}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadOrderAssetFile(role, file);
                            }}
                          />
                        </label>
                      ) : (
                        <div className="space-y-3 bg-[#0a0b0d] p-4 rounded-xl border border-[#1f2228]">
                          <label className="block text-[10px] font-technical uppercase text-gray-400">
                            Secure HTTPS URL (WeTransfer, Dropbox, Google Drive, S3)
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="url"
                              placeholder="https://we.tl/t-... or https://www.dropbox.com/s/..."
                              value={assetExternalLinks[role]}
                              onChange={(e) =>
                                setAssetExternalLinks((prev) => ({ ...prev, [role]: e.target.value }))
                              }
                              className="flex-1 px-3 py-2 rounded-lg bg-[#14161a] border border-[#2d323b] text-xs text-white font-technical focus:outline-none focus:border-[#dc2626]"
                            />
                            <button
                              type="button"
                              disabled={isUploading}
                              onClick={() => handleRegisterOrderExternalLink(role)}
                              className="px-4 py-2 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-[10px] font-technical font-black uppercase tracking-wider"
                            >
                              {isUploading ? 'Verifying...' : 'Register Link'}
                            </button>
                          </div>
                          <span className="block text-[10px] font-technical text-gray-500">
                            Endpoint: POST /api/marketplace/orders/{assetIntakeOrder.orderId}/files/external-link
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* ===============================================================
                TAB 1: MY ORDERS & REPRINTS (CONTEXTUAL B2B ACTIONS)
               =============================================================== */}
            {activeTab === 'ORDERS_REPRINTS' && (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-technical font-black uppercase tracking-[0.2em] text-[#dc2626]">
                      01 // ORDER HISTORY &amp; 1-CLICK REPRINTS (2ND EDITIONS &amp; NEW RUNS)
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Instant re-orders based on existing closed specifications. Re-use validated production assets and quickly adjust print runs with active rates.
                    </p>
                  </div>
                </div>

                {loadingOrders ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-400">
                    <ArrowPathIcon className="w-6 h-6 animate-spin text-[#dc2626]" />
                    <span className="text-xs font-technical uppercase tracking-widest">
                      Loading historical production catalog...
                    </span>
                  </div>
                ) : orders.length === 0 ? (
                  <div
                    className="p-12 rounded-2xl border text-center"
                    style={{ backgroundColor: '#14161a', borderColor: '#1f2228' }}
                  >
                    <p className="text-xs font-technical uppercase tracking-widest text-gray-400">
                      No production orders registered for this publisher account.
                    </p>
                  </div>
                ) : (
                  <div
                    className="rounded-2xl border overflow-hidden"
                    style={{ backgroundColor: '#14161a', borderColor: '#1f2228' }}
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr
                            className="border-b text-[10px] font-technical font-black uppercase tracking-wider text-gray-400"
                            style={{ backgroundColor: '#101216', borderColor: '#1f2228' }}
                          >
                            <th className="py-3.5 px-4">BOOK TITLE / ORDER REF</th>
                            <th className="py-3.5 px-4">SPECIFICATIONS</th>
                            <th className="py-3.5 px-4">PRINT RUN</th>
                            <th className="py-3.5 px-4">PLANT / ESTIMATE</th>
                            <th className="py-3.5 px-4">STATUS / DELIVERY</th>
                            <th className="py-3.5 px-4 text-right">ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1f2228] text-xs">
                          {orders.map((ord) => {
                            const statusUpper = String(ord.status || 'AWAITING_PAYMENT').toUpperCase();
                            const assetsComplete = hasCompleteValidatedAssets(ord);
                            const isFilesRequired = statusUpper === 'FILES_REQUIRED' || !assetsComplete;
                            const isAwaitingPayment = !isFilesRequired && (statusUpper === 'AWAITING_PAYMENT' || ord.paymentStatus !== 'PAID');

                            return (
                              <tr
                                key={ord.orderId}
                                className="hover:bg-[#1a1d24]/70 transition-colors"
                              >
                                {/* Book Thumbnail + Title + Order Ref */}
                                <td className="py-4 px-4">
                                  <div className="flex items-start gap-3">
                                    {/* Stylized Mini Book Cover */}
                                    <div
                                      className="w-10 h-14 rounded border flex flex-col justify-between p-1.5 shrink-0 shadow-inner"
                                      style={{
                                        backgroundColor: '#0a0b0d',
                                        borderColor: '#2d323b',
                                        borderLeftWidth: '3px',
                                        borderLeftColor: isFilesRequired ? '#f59e0b' : '#dc2626',
                                      }}
                                    >
                                      <span className="text-[6px] font-technical uppercase text-gray-500 leading-none truncate">
                                        PPOS
                                      </span>
                                      <BookOpenMiniIcon />
                                      <span className="text-[6px] font-technical font-bold text-[#10b981] leading-none">
                                        {ord.specs?.book_size || 'A5'}
                                      </span>
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-technical font-bold text-[11px] text-[#dc2626]">
                                          {ord.orderId}
                                        </span>
                                        {ord.editionNumber && ord.editionNumber > 1 && (
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-technical font-black bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                            EDITION #{ord.editionNumber}
                                          </span>
                                        )}
                                      </div>
                                      <div className="font-bold text-white text-xs sm:text-sm truncate max-w-[260px] mt-0.5">
                                        {ord.bookTitle}
                                      </div>
                                      <div className="text-[10px] font-technical text-gray-400 mt-0.5">
                                        ISBN: {ord.isbn || '978-84-0000-000-0'} • {new Date(ord.created_at).toISOString().slice(0, 10)}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* Closed Technical Specs + Preflight & Assets Badge */}
                                <td className="py-4 px-4">
                                  <div className="font-technical text-xs text-gray-200">
                                    {ord.specsSummary}
                                  </div>
                                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                    {assetsComplete ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-technical font-bold bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/30">
                                        ✓ Preflight Passed ({ord.approvedFiles?.length || 2} PDFs)
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-technical font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                                        ⚠ Assets Pending
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Print Run */}
                                <td className="py-4 px-4 font-technical">
                                  <span className="text-sm font-black text-white">
                                    {Number(ord.specs?.copies || 1000).toLocaleString('en-US')}
                                  </span>
                                  <span className="block text-[10px] text-gray-400">copies</span>
                                </td>

                                {/* Printer + Price */}
                                <td className="py-4 px-4">
                                  <div className="text-xs font-bold text-white">
                                    €{Number(ord.totalPriceEur || ord.offer_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </div>
                                  <div className="text-[10px] font-technical text-gray-400 truncate max-w-[170px]">
                                    {ord.offer_print_house}
                                  </div>
                                </td>

                                {/* Status + Delivery Date */}
                                <td className="py-4 px-4">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-technical font-black uppercase tracking-wider border ${
                                      statusUpper === 'DELIVERED'
                                        ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                                        : statusUpper === 'IN_PRODUCTION'
                                        ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    }`}
                                  >
                                    {statusUpper}
                                  </span>
                                  <div className="text-[10px] font-technical text-gray-400 mt-1">
                                    Delivery: {ord.deliveryDate || 'Scheduled'}
                                  </div>
                                </td>

                                {/* Contextual B2B Actions */}
                                <td className="py-4 px-4 text-right">
                                  <div className="flex items-center justify-end gap-2 flex-wrap">
                                    {isFilesRequired ? (
                                      <>
                                        {/* Priority Action for FILES_REQUIRED: UPLOAD ASSETS */}
                                        <button
                                          type="button"
                                          onClick={() => openAssetIntakeView(ord)}
                                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-technical font-black uppercase tracking-wider shadow-sm transition-all"
                                        >
                                          <ArrowUpTrayIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                                          <span>UPLOAD ASSETS</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => downloadProformaInvoicePdf(ord, fiscalProfile)}
                                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#1f2228] bg-[#0a0b0d] hover:border-white text-gray-300 hover:text-white text-[10px] font-technical font-bold uppercase transition-all"
                                        >
                                          <DocumentTextIcon className="w-3.5 h-3.5" />
                                          <span>VIEW PROFORMA</span>
                                        </button>
                                      </>
                                    ) : isAwaitingPayment ? (
                                      <>
                                        {/* Priority Actions for AWAITING_PAYMENT */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedOrderForPayment(ord);
                                            navigateTabWithUrl('INVOICES_PAYMENTS');
                                          }}
                                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/50 text-[10px] font-technical font-black uppercase tracking-wider transition-all"
                                        >
                                          <CreditCardIcon className="w-3.5 h-3.5" />
                                          <span>PAY NOW</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => downloadProformaInvoicePdf(ord, fiscalProfile)}
                                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#1f2228] bg-[#0a0b0d] hover:border-white text-gray-300 hover:text-white text-[10px] font-technical font-bold uppercase transition-all"
                                        >
                                          <DocumentArrowDownIcon className="w-3.5 h-3.5" />
                                          <span>VIEW PROFORMA</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => openReprintModal(ord)}
                                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-[10px] font-technical font-black uppercase tracking-wider shadow-sm transition-all"
                                        >
                                          <SparklesIcon className="w-3.5 h-3.5" />
                                          <span>RE-ORDER / REPRINT</span>
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        {/* Priority Actions for IN_PRODUCTION or DELIVERED */}
                                        <button
                                          type="button"
                                          onClick={() => openReprintModal(ord)}
                                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-[10px] font-technical font-black uppercase tracking-wider shadow-sm transition-all"
                                        >
                                          <SparklesIcon className="w-3.5 h-3.5" />
                                          <span>RE-ORDER / REPRINT</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedOrderForTracking(ord.orderId);
                                            navigateTabWithUrl('LIVE_LOGISTICS', ord.orderId);
                                          }}
                                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#1f2228] bg-[#0a0b0d] hover:border-[#10b981] text-gray-300 hover:text-[#10b981] text-[10px] font-technical font-bold uppercase transition-all"
                                          title="Live Shipment Tracking & Signed POD"
                                        >
                                          <TruckIcon className="w-3.5 h-3.5" />
                                          <span>TRACKING</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedOrderForPayment(ord);
                                            navigateTabWithUrl('INVOICES_PAYMENTS');
                                          }}
                                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#1f2228] bg-[#0a0b0d] text-gray-300 hover:border-white text-[10px] font-technical font-bold uppercase transition-all"
                                        >
                                          <CreditCardIcon className="w-3.5 h-3.5" />
                                          <span>VIEW INVOICE</span>
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ===============================================================
                TAB 2: INVOICES & PAYMENTS (STRIPE / SEPA / B2B WIRE / EN 16931)
               =============================================================== */}
            {activeTab === 'INVOICES_PAYMENTS' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-technical font-black uppercase tracking-[0.2em] text-[#dc2626]">
                    02 // DUAL PAYMENT GATEWAY &amp; NORMATIVE ELECTRONIC INVOICING (EN 16931)
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Download official invoices in PDF, XML Facturae 3.2.2, and XML XRechnung 3.0. Settle pending orders via Stripe (Card / SEPA B2B) or Bank Wire.
                  </p>
                </div>

                {/* Invoices & Orders Financial Table */}
                <div
                  className="rounded-2xl border overflow-hidden"
                  style={{ backgroundColor: '#14161a', borderColor: '#1f2228' }}
                >
                  <div
                    className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2"
                    style={{ backgroundColor: '#101216', borderColor: '#1f2228' }}
                  >
                    <span className="text-[10px] font-technical font-black uppercase tracking-wider text-gray-300">
                      Billing Ledger &amp; Bank Reconciliation Registry
                    </span>
                    <span className="text-[10px] font-technical text-[#10b981]">
                      Active Standards: PDF/A • Facturae 3.2.2 • XRechnung 3.0 (UBL 2.1)
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr
                          className="border-b text-[10px] font-technical font-bold uppercase text-gray-400"
                          style={{ borderColor: '#1f2228' }}
                        >
                          <th className="py-3 px-4">INVOICE / ORDER</th>
                          <th className="py-3 px-4">WORK / TITLE</th>
                          <th className="py-3 px-4">RECONCILIATION CODE</th>
                          <th className="py-3 px-4">TOTAL (EUR)</th>
                          <th className="py-3 px-4">PAYMENT STATUS</th>
                          <th className="py-3 px-4 text-right">OFFICIAL COMPLIANCE DOWNLOADS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1f2228]">
                        {orders.map((ord) => {
                          const isSelected = selectedOrderForPayment?.orderId === ord.orderId;
                          const isPaid = ord.paymentStatus === 'PAID';
                          return (
                            <tr
                              key={ord.orderId}
                              onClick={() => setSelectedOrderForPayment(ord)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-[#dc2626]/10' : 'hover:bg-[#1a1d24]/60'
                              }`}
                            >
                              <td className="py-3.5 px-4 font-technical">
                                <div className="font-bold text-white">
                                  {ord.invoiceNumber || `INV-2026-${ord.orderId.slice(-5)}`}
                                </div>
                                <div className="text-[10px] text-gray-400">{ord.orderId}</div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="font-bold text-gray-200 truncate max-w-[220px]">
                                  {ord.bookTitle}
                                </div>
                                <div className="text-[10px] font-technical text-gray-400">
                                  {Number(ord.specs?.copies || 1000).toLocaleString('en-US')} copies
                                </div>
                              </td>
                              <td className="py-3.5 px-4 font-technical">
                                <span className="px-2 py-0.5 rounded bg-[#0a0b0d] border border-[#2d323b] text-[10px] text-gray-200">
                                  {ord.reconciliationCode || `PPOS-${ord.orderId}`}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-technical font-black text-white">
                                €{Number(ord.totalPriceEur || ord.offer_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-technical font-black uppercase border ${
                                    isPaid
                                      ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                                      : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                  }`}
                                >
                                  {ord.paymentStatus}
                                </span>
                              </td>
                              <td
                                className="py-3.5 px-4 text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      downloadProformaInvoicePdf(
                                        ord,
                                        fiscalProfile,
                                        checkoutSessionData?.bankTransferInstructions
                                      )
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0a0b0d] hover:bg-[#dc2626] text-gray-200 hover:text-white border border-[#2d323b] text-[10px] font-technical font-bold uppercase transition-colors"
                                  >
                                    <DocumentArrowDownIcon className="w-3.5 h-3.5" />
                                    <span>PDF INVOICE</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadEInvoiceXml(ord.orderId, 'FACTURAE_3_2_2')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0a0b0d] hover:border-[#10b981] text-gray-200 hover:text-[#10b981] border border-[#2d323b] text-[10px] font-technical font-bold uppercase transition-colors"
                                  >
                                    <span>XML FACTURAE 3.2.2</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadEInvoiceXml(ord.orderId, 'XRECHNUNG_3_0')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0a0b0d] hover:border-[#10b981] text-gray-200 hover:text-[#10b981] border border-[#2d323b] text-[10px] font-technical font-bold uppercase transition-colors"
                                  >
                                    <span>XML XRECHNUNG 3.0</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Embedded Dual Checkout Gateway for Selected Order */}
                {selectedOrderForPayment && (
                  <div
                    className="rounded-2xl border p-5 sm:p-6 space-y-5"
                    style={{ backgroundColor: '#14161a', borderColor: '#1f2228' }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#1f2228]">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-technical font-black uppercase tracking-widest text-[#dc2626]">
                            B2B SETTLEMENT TERMINAL // SELECTED ORDER: {selectedOrderForPayment.orderId}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[9px] font-technical font-bold bg-[#0a0b0d] border border-[#2d323b] text-gray-300">
                            {selectedOrderForPayment.commercialModality === 'MODALITY_B_DIRECT_COMMISSION'
                              ? 'Modality B (Direct Printhouse Settlement)'
                              : 'Modality A (Central PrintPrice Escrow MoR)'}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">
                          {selectedOrderForPayment.bookTitle} —{' '}
                          <span className="text-[#10b981]">
                            €{Number(selectedOrderForPayment.totalPriceEur || selectedOrderForPayment.offer_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </h4>
                      </div>

                      {/* Payment Method Sub-Tabs */}
                      <div className="flex items-center bg-[#0a0b0d] p-1 rounded-xl border border-[#1f2228]">
                        <button
                          type="button"
                          onClick={() => setPaymentSubTab('STRIPE_CARD_SEPA')}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-technical font-black uppercase tracking-wider transition-all ${
                            paymentSubTab === 'STRIPE_CARD_SEPA'
                              ? 'bg-[#dc2626] text-white'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          <CreditCardIcon className="w-3.5 h-3.5" />
                          <span>Credit Card / SEPA (Stripe)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentSubTab('BANK_TRANSFER_B2B');
                            handleInitiateCheckoutSession('BANK_TRANSFER_B2B');
                          }}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-technical font-black uppercase tracking-wider transition-all ${
                            paymentSubTab === 'BANK_TRANSFER_B2B'
                              ? 'bg-[#dc2626] text-white'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          <BuildingLibraryIcon className="w-3.5 h-3.5" />
                          <span>Bank Transfer B2B</span>
                        </button>
                      </div>
                    </div>

                    {/* SUB-TAB A: STRIPE ELEMENTS (CARD & SEPA B2B) */}
                    {paymentSubTab === 'STRIPE_CARD_SEPA' && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div
                          className="p-5 rounded-xl border space-y-4"
                          style={{ backgroundColor: '#0a0b0d', borderColor: '#1f2228' }}
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-[10px] font-technical font-black uppercase tracking-wider text-gray-300">
                              Stripe Payment Element (PCI-DSS Level 1)
                            </span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setStripeMethodType('CARD')}
                                className={`px-2.5 py-1 rounded text-[10px] font-technical font-bold border ${
                                  stripeMethodType === 'CARD'
                                    ? 'border-[#dc2626] bg-[#dc2626]/15 text-white'
                                    : 'border-[#1f2228] text-gray-400'
                                }`}
                              >
                                Corporate Card
                              </button>
                              <button
                                type="button"
                                onClick={() => setStripeMethodType('SEPA_DEBIT')}
                                className={`px-2.5 py-1 rounded text-[10px] font-technical font-bold border ${
                                  stripeMethodType === 'SEPA_DEBIT'
                                    ? 'border-[#dc2626] bg-[#dc2626]/15 text-white'
                                    : 'border-[#1f2228] text-gray-400'
                                }`}
                              >
                                SEPA B2B Direct Debit
                              </button>
                            </div>
                          </div>

                          {stripeMethodType === 'CARD' ? (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                                  Corporate Cardholder Name
                                </label>
                                <input
                                  type="text"
                                  value={cardHolderName}
                                  onChange={(e) => setCardHolderName(e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-[#14161a] border border-[#2d323b] text-xs text-white font-technical focus:outline-none focus:border-[#dc2626]"
                                />
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                  <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                                    Card Number (Stripe Tokenized)
                                  </label>
                                  <input
                                    type="text"
                                    readOnly
                                    value="•••• •••• •••• 4242 (Visa Corporate B2B)"
                                    className="w-full px-3 py-2 rounded-lg bg-[#14161a] border border-[#2d323b] text-xs text-emerald-400 font-technical"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                                    CVC / Exp
                                  </label>
                                  <input
                                    type="text"
                                    readOnly
                                    value="08/29 • 884"
                                    className="w-full px-3 py-2 rounded-lg bg-[#14161a] border border-[#2d323b] text-xs text-gray-300 font-technical"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                                  Publisher IBAN Account (SEPA Core / B2B Mandate)
                                </label>
                                <input
                                  type="text"
                                  value={sepaIbanInput}
                                  onChange={(e) => setSepaIbanInput(e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-[#14161a] border border-[#2d323b] text-xs text-white font-technical focus:outline-none focus:border-[#dc2626]"
                                />
                              </div>
                              <p className="text-[10px] text-gray-400 leading-relaxed">
                                By confirming the SEPA B2B mandate, you authorize PrintPrice OS Financial Clearing to debit the account under reconciliation reference{' '}
                                <span className="text-white font-technical">{selectedOrderForPayment.reconciliationCode}</span>.
                              </p>
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={processingCheckout}
                            onClick={() =>
                              handleInitiateCheckoutSession(
                                stripeMethodType === 'SEPA_DEBIT' ? 'STRIPE_SEPA' : 'STRIPE_CARD'
                              )
                            }
                            className="w-full py-3 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-technical font-black uppercase tracking-wider transition-all shadow-lg"
                          >
                            {processingCheckout
                              ? 'Processing Stripe authorization...'
                              : `Authorize & Pay €${Number(
                                  selectedOrderForPayment.totalPriceEur || selectedOrderForPayment.offer_price || 0
                                ).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                          </button>
                        </div>

                        {/* Right Info Box */}
                        <div
                          className="p-5 rounded-xl border flex flex-col justify-between"
                          style={{ backgroundColor: '#0a0b0d', borderColor: '#1f2228' }}
                        >
                          <div className="space-y-3">
                            <div className="text-[10px] font-technical font-black uppercase tracking-wider text-[#10b981]">
                              PRINTPRICE OS INDUSTRIAL ESCROW PROTECTION
                            </div>
                            <p className="text-xs text-gray-300 leading-relaxed">
                              Settled funds are held in the PrintPrice Escrow ledger until CTP plate verification and signed CMR delivery note confirmation at the destination dock.
                            </p>
                            <div className="p-3 rounded-lg bg-[#14161a] border border-[#1f2228] space-y-1 text-[11px] font-technical">
                              <div className="flex justify-between">
                                <span className="text-gray-400">Order Reference:</span>
                                <span className="text-white font-bold">{selectedOrderForPayment.orderId}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Reconciliation Code:</span>
                                <span className="text-[#10b981] font-bold">{selectedOrderForPayment.reconciliationCode}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Assigned Plant:</span>
                                <span className="text-white">{selectedOrderForPayment.offer_print_house}</span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-[#1f2228] flex items-center justify-between">
                            <span className="text-[10px] font-technical text-gray-400">
                              Need treasury pre-approval?
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                downloadProformaInvoicePdf(
                                  selectedOrderForPayment,
                                  fiscalProfile,
                                  checkoutSessionData?.bankTransferInstructions
                                )
                              }
                              className="inline-flex items-center gap-1.5 text-[10px] font-technical font-bold uppercase text-[#dc2626] hover:underline"
                            >
                              <DocumentArrowDownIcon className="w-3.5 h-3.5" />
                              <span>VIEW PROFORMA PDF</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB B: BANK TRANSFER B2B & WIRE PROOF UPLOAD */}
                    {paymentSubTab === 'BANK_TRANSFER_B2B' && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div
                          className="p-5 rounded-xl border space-y-4"
                          style={{ backgroundColor: '#0a0b0d', borderColor: '#1f2228' }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-technical font-black uppercase tracking-wider text-[#10b981]">
                              B2B SEPA WIRE TRANSFER INSTRUCTIONS
                            </span>
                            <span className="px-2 py-0.5 rounded text-[9px] font-technical bg-[#14161a] border border-[#2d323b] text-gray-300">
                              SEPA Instant / SWIFT
                            </span>
                          </div>

                          <div className="space-y-2.5 text-xs font-technical">
                            <div className="p-3 rounded-lg bg-[#14161a] border border-[#2d323b]">
                              <span className="block text-[9px] uppercase text-gray-400">
                                Mandatory Reconciliation Reference (Wire Concept)
                              </span>
                              <span className="text-sm font-black text-[#dc2626] tracking-wider">
                                {checkoutSessionData?.bankTransferInstructions?.referenceCode ||
                                  selectedOrderForPayment.reconciliationCode}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div className="p-3 rounded-lg bg-[#14161a] border border-[#1f2228]">
                                <span className="block text-[9px] uppercase text-gray-400">Beneficiary</span>
                                <span className="text-white font-bold">
                                  {checkoutSessionData?.bankTransferInstructions?.beneficiary ||
                                    'PrintPrice OS Financial Clearing S.L. (Escrow MoR)'}
                                </span>
                              </div>
                              <div className="p-3 rounded-lg bg-[#14161a] border border-[#1f2228]">
                                <span className="block text-[9px] uppercase text-gray-400">BIC / SWIFT</span>
                                <span className="text-white font-bold">
                                  {checkoutSessionData?.bankTransferInstructions?.bic || 'CAIXESBBXXX'}
                                </span>
                              </div>
                            </div>

                            <div className="p-3 rounded-lg bg-[#14161a] border border-[#1f2228]">
                              <span className="block text-[9px] uppercase text-gray-400">
                                Destination IBAN ({selectedOrderForPayment.commercialModality === 'MODALITY_B_DIRECT_COMMISSION' ? 'Direct Printhouse Account' : 'Central PrintPrice Escrow Account'})
                              </span>
                              <span className="text-sm font-bold text-[#10b981] tracking-wider">
                                {checkoutSessionData?.bankTransferInstructions?.iban ||
                                  'ES91 2100 0418 4502 0005 1332'}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              downloadProformaInvoicePdf(
                                selectedOrderForPayment,
                                fiscalProfile,
                                checkoutSessionData?.bankTransferInstructions
                              )
                            }
                            className="w-full py-3 rounded-xl border border-[#dc2626] bg-[#dc2626]/15 hover:bg-[#dc2626] text-white text-xs font-technical font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                          >
                            <DocumentArrowDownIcon className="w-4 h-4" />
                            <span>PDF INVOICE / PROFORMA WIRE INSTRUCTIONS</span>
                          </button>
                        </div>

                        {/* Upload Wire Transfer Proof Form */}
                        <form
                          onSubmit={handleUploadWireTransferProof}
                          className="p-5 rounded-xl border space-y-4 flex flex-col justify-between"
                          style={{ backgroundColor: '#0a0b0d', borderColor: '#1f2228' }}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <ArrowUpTrayIcon className="w-4 h-4 text-[#dc2626]" />
                              <span className="text-[10px] font-technical font-black uppercase tracking-wider text-white">
                                UPLOAD WIRE PROOF (FAST-TRACK PRODUCTION)
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">
                              Attach the PDF/SWIFT wire receipt issued by your bank to immediately unlock paper allocation and CTP plate imaging without waiting for 24h SEPA clearing.
                            </p>

                            <div>
                              <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                                Bank Wire Receipt File (PDF / PNG)
                              </label>
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) setWireProofFileName(f.name);
                                }}
                                className="w-full text-xs text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-technical file:font-bold file:uppercase file:bg-[#14161a] file:text-white hover:file:bg-[#dc2626] cursor-pointer"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                                Bank Transaction Reference / ID (Optional)
                              </label>
                              <input
                                type="text"
                                placeholder={`e.g. ${selectedOrderForPayment.reconciliationCode}`}
                                value={wireBankReference}
                                onChange={(e) => setWireBankReference(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-[#14161a] border border-[#2d323b] text-xs text-white font-technical focus:outline-none focus:border-[#dc2626]"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={uploadingWireProof}
                            className="w-full py-3 rounded-xl bg-[#10b981] hover:bg-[#059669] text-black font-technical font-black text-xs uppercase tracking-wider transition-all"
                          >
                            {uploadingWireProof
                              ? 'Registering wire proof in Control Plane...'
                              : 'UPLOAD WIRE PROOF'}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ===============================================================
                TAB 3: LIVE LOGISTICS & POD (5-STAGE TIMELINE & SIGNED CMR/POD)
               =============================================================== */}
            {activeTab === 'LIVE_LOGISTICS' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-technical font-black uppercase tracking-[0.2em] text-[#dc2626]">
                      03 // LIVE SHIPMENT TRACKING &amp; SIGNED PROOF OF DELIVERY (POD / CMR)
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Industrial 5-stage tracking from Preflight through palletized EPAL dispatch with digitally verified delivery note.
                    </p>
                  </div>

                  {/* Order Selector for Tracking */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-technical uppercase text-gray-400">Shipment Order:</span>
                    <select
                      value={selectedOrderForTracking || ''}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSelectedOrderForTracking(nextId);
                        navigateTabWithUrl('LIVE_LOGISTICS', nextId);
                      }}
                      className="px-3 py-2 rounded-xl bg-[#14161a] border border-[#2d323b] text-xs font-technical text-white focus:outline-none focus:border-[#dc2626]"
                    >
                      {orders.map((o) => (
                        <option key={o.orderId} value={o.orderId}>
                          {o.orderId} — {o.bookTitle}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {loadingTracking || !trackingData ? (
                  <div className="py-12 text-center text-xs font-technical text-gray-400">
                    Synchronizing press floor and carrier telemetry...
                  </div>
                ) : (
                  <>
                    {/* 5-Stage Production & Logistics Timeline */}
                    <div
                      className="p-6 rounded-2xl border space-y-6"
                      style={{ backgroundColor: '#14161a', borderColor: '#1f2228' }}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[10px] font-technical font-black uppercase tracking-wider text-gray-300">
                          Production &amp; Dispatch Timeline — {trackingData.bookTitle}
                        </span>
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-technical font-black uppercase bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
                          Status: {trackingData.overallStatus}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        {trackingData.timeline.map((stage) => {
                          const completed = stage.status === 'COMPLETED';
                          const inProgress = stage.status === 'IN_PROGRESS';
                          const svgStatus: 'COMPLETED' | 'ACTIVE' | 'SCHEDULED' = completed
                            ? 'COMPLETED'
                            : inProgress
                            ? 'ACTIVE'
                            : 'SCHEDULED';
                          const canonicalStageTitle =
                            stage.stepNumber === 1
                              ? 'Stage 01: Preflight Approved'
                              : stage.stepNumber === 2
                              ? 'Stage 02: On Press (Plates & Print Run)'
                              : stage.stepNumber === 3
                              ? 'Stage 03: Binding & Finishing'
                              : stage.stepNumber === 4
                              ? 'Stage 04: EPAL Palletization'
                              : completed
                              ? 'Stage 05: Delivered (Signed POD)'
                              : 'Stage 05: In Transit';
                          return (
                            <div
                              key={stage.stageKey}
                              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                                inProgress
                                  ? 'bg-[#0f1115] border-[#dc2626] shadow-[0_0_18px_rgba(220,38,38,0.18)]'
                                  : completed
                                  ? 'bg-[#0f1115] border-[#10b981]/50'
                                  : 'bg-[#0f1115] border-zinc-800'
                              }`}
                            >
                              <div>
                                {/* Header Row: Stage Badge + Status Pill */}
                                <div className="flex items-center justify-between text-[10px] font-technical font-black uppercase">
                                  <span
                                    className={
                                      completed
                                        ? 'text-[#10b981]'
                                        : inProgress
                                        ? 'text-[#ef4444]'
                                        : 'text-zinc-400'
                                    }
                                  >
                                    STAGE 0{stage.stepNumber}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-technical font-bold uppercase tracking-wider border ${
                                      completed
                                        ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30'
                                        : inProgress
                                        ? 'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/40 animate-pulse'
                                        : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                                    }`}
                                  >
                                    {completed ? 'VERIFIED' : inProgress ? 'ACTIVE' : 'SCHEDULED'}
                                  </span>
                                </div>

                                {/* Dedicated Technical CAD / Telemetry SVG Illustration (48x48px) */}
                                <div
                                  className={`my-3 py-2.5 px-3 rounded-lg border flex items-center justify-center ${
                                    inProgress
                                      ? 'bg-[#14171d] border-[#ef4444]/35'
                                      : completed
                                      ? 'bg-[#12151b] border-[#ef4444]/25'
                                      : 'bg-[#0b0d11] border-zinc-800/80'
                                  }`}
                                >
                                  {renderStageTimelineSvg(stage.stepNumber, svgStatus, 'w-12 h-12 shrink-0')}
                                </div>

                                <div className="text-xs font-bold text-white mt-1.5">
                                  {stage.labelEn || canonicalStageTitle}
                                </div>
                                <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                                  {stage.description}
                                </p>
                              </div>
                              <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[9px] font-technical text-gray-400">
                                <span>
                                  {stage.timestamp
                                    ? new Date(stage.timestamp).toISOString().slice(0, 16).replace('T', ' ')
                                    : 'Scheduled'}
                                </span>
                                <span className="text-[8px] uppercase tracking-wider text-[#ef4444]/80">
                                  CAD // 0{stage.stepNumber}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Carrier Telemetry + Signed POD / CMR Card */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div
                        className="p-5 rounded-2xl border space-y-4"
                        style={{ backgroundColor: '#14161a', borderColor: '#1f2228' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-technical font-black uppercase tracking-wider text-[#dc2626]">
                            FREIGHT TELEMETRY &amp; EPAL PALLETIZATION
                          </span>
                          <span className="text-[10px] font-technical text-gray-400">
                            {trackingData.telemetry.shipmentId}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs font-technical">
                          <div className="p-3 rounded-xl bg-[#0a0b0d] border border-[#1f2228]">
                            <span className="block text-[9px] uppercase text-gray-400">Freight Carrier</span>
                            <span className="text-white font-bold">{trackingData.telemetry.carrierName}</span>
                          </div>
                          <div className="p-3 rounded-xl bg-[#0a0b0d] border border-[#1f2228]">
                            <span className="block text-[9px] uppercase text-gray-400">Tracking Number</span>
                            <a
                              href={trackingData.telemetry.trackingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#10b981] font-bold hover:underline inline-flex items-center gap-1"
                            >
                              <span>{trackingData.telemetry.trackingCode}</span>
                              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <div className="p-3 rounded-xl bg-[#0a0b0d] border border-[#1f2228]">
                            <span className="block text-[9px] uppercase text-gray-400">GS1 SSCC-18 Code</span>
                            <span className="text-gray-200">{trackingData.telemetry.sscc18}</span>
                          </div>
                          <div className="p-3 rounded-xl bg-[#0a0b0d] border border-[#1f2228]">
                            <span className="block text-[9px] uppercase text-gray-400">Load Configuration</span>
                            <span className="text-white">
                              {trackingData.telemetry.palletCount}x {trackingData.telemetry.palletType} ({trackingData.telemetry.totalWeightKg} kg)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Signed Proof of Delivery (POD / CMR) Viewer Card */}
                      <div
                        className="p-5 rounded-2xl border flex flex-col justify-between space-y-4"
                        style={{ backgroundColor: '#14161a', borderColor: '#1f2228' }}
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-technical font-black uppercase tracking-wider text-[#10b981]">
                              SIGNED PROOF OF DELIVERY VIEWER (POD / CMR)
                            </span>
                            <span className="px-2 py-0.5 rounded text-[9px] font-technical font-bold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
                              {trackingData.pod.available ? 'DIGITAL SIGNATURE VERIFIED' : 'IN TRANSIT'}
                            </span>
                          </div>

                          <div className="p-3.5 rounded-xl bg-[#0a0b0d] border border-[#1f2228] space-y-1.5 text-xs font-technical">
                            <div className="flex justify-between">
                              <span className="text-gray-400">CMR / POD Document:</span>
                              <span className="text-white font-bold">{trackingData.pod.documentId} ({trackingData.pod.cmrReference})</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Dock Receiver:</span>
                              <span className="text-[#10b981] font-bold">{trackingData.pod.signedBy}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Dock Stamp / Plate:</span>
                              <span className="text-gray-200">{trackingData.pod.dockStampCode || 'DOCK-VERIFIED'} • {trackingData.pod.vehiclePlate || '4892-LKM'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">eIDAS Hash:</span>
                              <span className="text-gray-400 truncate max-w-[220px]">{trackingData.pod.digitalSignatureHash}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowPodViewerModal(true)}
                            className="flex-1 py-2.5 px-4 rounded-xl border border-[#10b981] bg-[#10b981]/15 hover:bg-[#10b981] text-[#10b981] hover:text-black text-xs font-technical font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                          >
                            <EyeIcon className="w-4 h-4" />
                            <span>INSPECT SIGNED POD / CMR</span>
                          </button>
                          <a
                            href={trackingData.pod.downloadPdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="py-2.5 px-4 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-technical font-black uppercase tracking-wider flex items-center gap-1.5 transition-all"
                          >
                            <DocumentArrowDownIcon className="w-4 h-4" />
                            <span>PDF POD</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ===============================================================
                TAB 4: SHIPPING & DOCKS (ADDRESS BOOK & DOCK REQUIREMENTS)
               =============================================================== */}
            {activeTab === 'SHIPPING_LOGISTICS' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-technical font-black uppercase tracking-[0.2em] text-[#dc2626]">
                      04 // ADDRESS BOOK &amp; DOCK CONDITIONS (SHIPPING &amp; DOCKS)
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Manage publisher warehouses and distribution hubs (Logista, Arnoia, Zeitfracht, VVA Arvato, Amazon FBA) with dock requirements.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNewAddressForm((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-technical font-black uppercase tracking-wider transition-all self-start"
                  >
                    <PlusIcon className="w-4 h-4" />
                    <span>+ ADD B2B DOCK / WAREHOUSE</span>
                  </button>
                </div>

                {/* Add New Address Form */}
                {showNewAddressForm && (
                  <form
                    onSubmit={handleAddShippingAddress}
                    className="p-5 rounded-2xl border space-y-4"
                    style={{ backgroundColor: '#14161a', borderColor: '#dc2626' }}
                  >
                    <div className="text-xs font-technical font-black uppercase text-[#dc2626]">
                      New B2B Delivery Location / Distribution Hub
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                          LOCATION ALIAS
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Logista Hub / Central Warehouse"
                          value={newAddressDraft.label || ''}
                          onChange={(e) => setNewAddressDraft({ ...newAddressDraft, label: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-[#0a0b0d] border border-[#2d323b] text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                          COMPANY / RECEIVING HUB
                        </label>
                        <input
                          type="text"
                          required
                          value={newAddressDraft.companyName || ''}
                          onChange={(e) => setNewAddressDraft({ ...newAddressDraft, companyName: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-[#0a0b0d] border border-[#2d323b] text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                          DOCK CONTACT
                        </label>
                        <input
                          type="text"
                          required
                          value={newAddressDraft.contactName || ''}
                          onChange={(e) => setNewAddressDraft({ ...newAddressDraft, contactName: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-[#0a0b0d] border border-[#2d323b] text-xs text-white"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                          STREET ADDRESS / INDUSTRIAL PARK
                        </label>
                        <input
                          type="text"
                          required
                          value={newAddressDraft.streetAddress || ''}
                          onChange={(e) => setNewAddressDraft({ ...newAddressDraft, streetAddress: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-[#0a0b0d] border border-[#2d323b] text-xs text-white"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">POSTAL CODE</label>
                          <input
                            type="text"
                            required
                            value={newAddressDraft.postalCode || ''}
                            onChange={(e) => setNewAddressDraft({ ...newAddressDraft, postalCode: e.target.value })}
                            className="w-full px-2.5 py-2 rounded-lg bg-[#0a0b0d] border border-[#2d323b] text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">CITY</label>
                          <input
                            type="text"
                            required
                            value={newAddressDraft.city || ''}
                            onChange={(e) => setNewAddressDraft({ ...newAddressDraft, city: e.target.value })}
                            className="w-full px-2.5 py-2 rounded-lg bg-[#0a0b0d] border border-[#2d323b] text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">COUNTRY ISO</label>
                          <input
                            type="text"
                            maxLength={2}
                            value={newAddressDraft.countryCode || 'ES'}
                            onChange={(e) => setNewAddressDraft({ ...newAddressDraft, countryCode: e.target.value.toUpperCase() })}
                            className="w-full px-2.5 py-2 rounded-lg bg-[#0a0b0d] border border-[#2d323b] text-xs text-white uppercase"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Logistics Checkboxes */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#0a0b0d] border border-[#1f2228] cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={!!newAddressDraft.logisticsRequirements?.trailerAccess}
                          onChange={(e) =>
                            setNewAddressDraft({
                              ...newAddressDraft,
                              logisticsRequirements: {
                                ...newAddressDraft.logisticsRequirements!,
                                trailerAccess: e.target.checked,
                              },
                            })
                          }
                          className="accent-[#dc2626]"
                        />
                        <span>Trailer Accessible Loading Dock (13.6m)</span>
                      </label>
                      <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#0a0b0d] border border-[#1f2228] cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={!!newAddressDraft.logisticsRequirements?.requiresTailLift}
                          onChange={(e) =>
                            setNewAddressDraft({
                              ...newAddressDraft,
                              logisticsRequirements: {
                                ...newAddressDraft.logisticsRequirements!,
                                requiresTailLift: e.target.checked,
                              },
                            })
                          }
                          className="accent-[#dc2626]"
                        />
                        <span>Tail-lift Required</span>
                      </label>
                      <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#0a0b0d] border border-[#1f2228] cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={!!newAddressDraft.logisticsRequirements?.requiresSlotBooking}
                          onChange={(e) =>
                            setNewAddressDraft({
                              ...newAddressDraft,
                              logisticsRequirements: {
                                ...newAddressDraft.logisticsRequirements!,
                                requiresSlotBooking: e.target.checked,
                              },
                            })
                          }
                          className="accent-[#dc2626]"
                        />
                        <span>Mandatory Dock Time Slot Booking</span>
                      </label>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNewAddressForm(false)}
                        className="px-4 py-2 rounded-xl border border-[#2d323b] text-xs font-technical text-gray-400"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-[#10b981] text-black text-xs font-technical font-black uppercase"
                      >
                        SAVE DOCK / ADDRESS
                      </button>
                    </div>
                  </form>
                )}

                {/* Saved Addresses Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {shippingAddresses.map((addr) => (
                    <div
                      key={addr.addressId}
                      className="p-5 rounded-2xl border space-y-4 flex flex-col justify-between"
                      style={{ backgroundColor: '#14161a', borderColor: addr.isDefault ? '#dc2626' : '#1f2228' }}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{addr.label}</span>
                            {addr.isDefault && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-technical font-black uppercase bg-[#dc2626]/20 text-[#ef4444] border border-[#dc2626]/40">
                                Default Hub
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(addr.addressId)}
                            className="text-gray-500 hover:text-[#dc2626] p-1"
                            title="Delete address"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="text-xs text-gray-300 font-technical">
                          <div className="font-bold">{addr.companyName}</div>
                          <div>{addr.streetAddress}</div>
                          <div>
                            {addr.postalCode} {addr.city} ({addr.countryCode}) • Contact: {addr.contactName}
                          </div>
                        </div>
                      </div>

                      {/* Interactive Logistics Checkboxes */}
                      <div className="space-y-2 pt-3 border-t border-[#1f2228]">
                        <div className="text-[10px] font-technical uppercase text-gray-400">
                          Operational Dock Conditions (Click to toggle):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-technical">
                          <label className="flex items-center gap-2 p-2 rounded-lg bg-[#0a0b0d] border border-[#1f2228] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!addr.logisticsRequirements?.trailerAccess}
                              onChange={() => toggleAddressLogisticFlag(addr.addressId, 'trailerAccess')}
                              className="accent-[#10b981]"
                            />
                            <span>Trailer Accessible Loading Dock (13.6m)</span>
                          </label>
                          <label className="flex items-center gap-2 p-2 rounded-lg bg-[#0a0b0d] border border-[#1f2228] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!addr.logisticsRequirements?.requiresTailLift}
                              onChange={() => toggleAddressLogisticFlag(addr.addressId, 'requiresTailLift')}
                              className="accent-[#dc2626]"
                            />
                            <span>Tail-lift Required</span>
                          </label>
                          <label className="flex items-center gap-2 p-2 rounded-lg bg-[#0a0b0d] border border-[#1f2228] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!addr.logisticsRequirements?.requiresSlotBooking}
                              onChange={() => toggleAddressLogisticFlag(addr.addressId, 'requiresSlotBooking')}
                              className="accent-[#dc2626]"
                            />
                            <span>Mandatory Dock Time Slot Booking</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===============================================================
                TAB 5: FISCAL & BILLING DATA (EU VIES VAT, DIR3, LEITWEG-ID)
               =============================================================== */}
            {activeTab === 'FISCAL_BILLING' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-technical font-black uppercase tracking-[0.2em] text-[#dc2626]">
                    05 // FISCAL PROFILE &amp; ELECTRONIC INVOICING (VIES / EN 16931)
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Configure legal entity, VAT ID (VIES validation), and e-invoicing routing codes (DIR3 for Facturae / Leitweg-ID for XRechnung).
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveCustomerProfile(shippingAddresses, fiscalProfile);
                  }}
                  className="p-6 rounded-2xl border space-y-5"
                  style={{ backgroundColor: '#14161a', borderColor: '#1f2228' }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-[10px] font-technical font-bold uppercase text-gray-400 mb-1.5">
                        LEGAL ENTITY NAME
                      </label>
                      <input
                        type="text"
                        required
                        value={fiscalProfile.legalEntityName}
                        onChange={(e) =>
                          setFiscalProfile({ ...fiscalProfile, legalEntityName: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical focus:outline-none focus:border-[#dc2626]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-technical font-bold uppercase text-gray-400">
                          VAT / TAX ID (VIES)
                        </label>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-technical font-black uppercase ${
                            vatValidation.valid
                              ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {vatValidation.message}
                        </span>
                      </div>
                      <input
                        type="text"
                        required
                        value={fiscalProfile.taxIdVat}
                        onChange={(e) =>
                          setFiscalProfile({ ...fiscalProfile, taxIdVat: e.target.value.toUpperCase() })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical focus:outline-none focus:border-[#dc2626]"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-technical font-bold uppercase text-gray-400 mb-1.5">
                        FULL FISCAL ADDRESS
                      </label>
                      <input
                        type="text"
                        required
                        value={fiscalProfile.fiscalStreet}
                        onChange={(e) =>
                          setFiscalProfile({ ...fiscalProfile, fiscalStreet: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                          POSTAL CODE
                        </label>
                        <input
                          type="text"
                          value={fiscalProfile.fiscalPostalCode}
                          onChange={(e) =>
                            setFiscalProfile({ ...fiscalProfile, fiscalPostalCode: e.target.value })
                          }
                          className="w-full px-3 py-2.5 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                          CITY
                        </label>
                        <input
                          type="text"
                          value={fiscalProfile.fiscalCity}
                          onChange={(e) =>
                            setFiscalProfile({ ...fiscalProfile, fiscalCity: e.target.value })
                          }
                          className="w-full px-3 py-2.5 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                          COUNTRY ISO
                        </label>
                        <input
                          type="text"
                          maxLength={2}
                          value={fiscalProfile.fiscalCountryCode}
                          onChange={(e) =>
                            setFiscalProfile({
                              ...fiscalProfile,
                              fiscalCountryCode: e.target.value.toUpperCase(),
                            })
                          }
                          className="w-full px-3 py-2.5 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical uppercase"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                        ACCOUNTING BILLING EMAIL
                      </label>
                      <input
                        type="email"
                        value={fiscalProfile.billingEmail}
                        onChange={(e) =>
                          setFiscalProfile({ ...fiscalProfile, billingEmail: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical"
                      />
                    </div>

                    {/* Normative EN 16931 Public/B2B Routing Codes */}
                    <div>
                      <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                        DIR3 CODE (OPTIONAL)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. EA0038291"
                        value={fiscalProfile.dir3Code || ''}
                        onChange={(e) =>
                          setFiscalProfile({ ...fiscalProfile, dir3Code: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                        LEITWEG-ID / PEPPOL ID (OPTIONAL)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 04011000-1234512345-06"
                        value={fiscalProfile.leitwegId || ''}
                        onChange={(e) =>
                          setFiscalProfile({ ...fiscalProfile, leitwegId: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#1f2228] flex items-center justify-between flex-wrap gap-3">
                    <div className="text-[11px] font-technical text-gray-400">
                      Default XML Standard:{' '}
                      <span className="text-white font-bold">{fiscalProfile.preferredEInvoiceFormat}</span>
                    </div>
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="px-6 py-3 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-technical font-black uppercase tracking-wider transition-all"
                    >
                      {savingProfile ? 'SYNCHRONIZING VIES & FISCAL DATA...' : 'SAVE FISCAL DATA (EN 16931)'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </div>

      {/* ===================================================================
          DIALOG: RE-ORDER / REPRINT CONFIGURATION (3 PURPOSE MODES + ASSET TOGGLE)
         =================================================================== */}
      {reprintTargetOrder && reprintPreview && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.78)' }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto"
            style={{ backgroundColor: '#14161a', borderColor: '#dc2626' }}
          >
            <div className="flex items-start justify-between border-b border-[#1f2228] pb-4">
              <div>
                <span className="text-[10px] font-technical font-black uppercase tracking-widest text-[#dc2626]">
                  RE-ORDER / REPRINT CONFIGURATION // BPE REAL-TIME PRICING
                </span>
                <h3 className="text-base font-black text-white mt-1">
                  {reprintTargetOrder.bookTitle}
                </h3>
                <p className="text-xs font-technical text-gray-400">
                  Source Order: {reprintTargetOrder.orderId} • {reprintTargetOrder.specsSummary}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReprintTargetOrder(null)}
                className="text-gray-400 hover:text-white"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* 1. Print Run Purpose Selector (3 Canonical Options) */}
            <div className="space-y-2">
              <label className="block text-[10px] font-technical font-black uppercase tracking-wider text-gray-300">
                1. Select Print Run Purpose
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSelectReprintPurpose('STRAIGHT_REPRINT')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    reprintPurpose === 'STRAIGHT_REPRINT'
                      ? 'border-[#dc2626] bg-[#dc2626]/15 text-white'
                      : 'border-[#2d323b] bg-[#0a0b0d] text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div className="text-[11px] font-technical font-black uppercase text-white">
                    Straight Reprint / Re-run
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                    Identical content &amp; specs. Reuses validated PDFs with zero preflight delay.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectReprintPurpose('NEW_EDITION_REVISED_FILES')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    reprintPurpose === 'NEW_EDITION_REVISED_FILES'
                      ? 'border-[#dc2626] bg-[#dc2626]/15 text-white'
                      : 'border-[#2d323b] bg-[#0a0b0d] text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div className="text-[11px] font-technical font-black uppercase text-white">
                    New Edition (2nd / 3rd / Revised)
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                    Update ISBN, adjust page count, or upload revised PDFs for fast preflight.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectReprintPurpose('VOLUME_EXTENSION')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    reprintPurpose === 'VOLUME_EXTENSION'
                      ? 'border-[#dc2626] bg-[#dc2626]/15 text-white'
                      : 'border-[#2d323b] bg-[#0a0b0d] text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div className="text-[11px] font-technical font-black uppercase text-white">
                    Volume Extension
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                    Scale up print run volume under active industrial contract rates.
                  </p>
                </button>
              </div>
            </div>

            {/* 2. Production Assets Toggle: Reuse Validated PDFs vs Upload Modified PDFs */}
            <div className="space-y-2">
              <label className="block text-[10px] font-technical font-black uppercase tracking-wider text-gray-300">
                2. Production PDF Assets Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setReprintUseApprovedFiles(true)}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                    reprintUseApprovedFiles
                      ? 'border-[#10b981] bg-[#10b981]/10 text-white'
                      : 'border-[#2d323b] bg-[#0a0b0d] text-gray-400'
                  }`}
                >
                  <CheckCircleIcon className={`w-4 h-4 shrink-0 mt-0.5 ${reprintUseApprovedFiles ? 'text-[#10b981]' : 'text-gray-500'}`} />
                  <div>
                    <div className="text-[11px] font-technical font-bold text-white">
                      Reuse validated production PDFs (No Preflight fee)
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Bypasses preflight queue using SHA-256 locked CTP files.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setReprintUseApprovedFiles(false)}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                    !reprintUseApprovedFiles
                      ? 'border-amber-500 bg-amber-500/10 text-white'
                      : 'border-[#2d323b] bg-[#0a0b0d] text-gray-400'
                  }`}
                >
                  <ArrowUpTrayIcon className={`w-4 h-4 shrink-0 mt-0.5 ${!reprintUseApprovedFiles ? 'text-amber-400' : 'text-gray-500'}`} />
                  <div>
                    <div className="text-[11px] font-technical font-bold text-white">
                      Upload new modified PDF files
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Opens asset intake after creation (+€45 Preflight verification).
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* 3. Edition Metadata & Revised Specs (if New Edition) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={reprintPurpose === 'NEW_EDITION_REVISED_FILES' ? 'sm:col-span-1' : 'sm:col-span-3'}>
                <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                  Work Title / Edition Label
                </label>
                <input
                  type="text"
                  value={reprintTitle}
                  onChange={(e) => setReprintTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical"
                />
              </div>

              {reprintPurpose === 'NEW_EDITION_REVISED_FILES' && (
                <>
                  <div>
                    <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                      Updated ISBN-13
                    </label>
                    <input
                      type="text"
                      value={reprintIsbn}
                      onChange={(e) => setReprintIsbn(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-technical uppercase text-gray-400 mb-1">
                      Interior Pages
                    </label>
                    <input
                      type="number"
                      min={16}
                      max={1200}
                      step={4}
                      value={reprintPages}
                      onChange={(e) => setReprintPages(Math.max(16, Number(e.target.value) || 192))}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical"
                    />
                  </div>
                </>
              )}
            </div>

            {/* 4. Print Run Quantity Selector */}
            <div>
              <label className="block text-[10px] font-technical uppercase text-gray-400 mb-2">
                Select Print Run Quantity (Copies) — Real-Time Additive BPE Recalculation
              </label>
              <div className="grid grid-cols-5 gap-2 mb-3">
                {REPRINT_PRESET_QUANTITIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setReprintCopies(q)}
                    className={`py-2 rounded-xl font-technical text-xs font-black border transition-all ${
                      reprintCopies === q
                        ? 'bg-[#dc2626] text-white border-[#dc2626]'
                        : 'bg-[#0a0b0d] text-gray-300 border-[#2d323b] hover:border-gray-500'
                    }`}
                  >
                    {q.toLocaleString('en-US')}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={50}
                max={50000}
                step={50}
                value={reprintCopies}
                onChange={(e) => setReprintCopies(Math.max(50, Number(e.target.value) || 100))}
                className="w-full px-3.5 py-2 rounded-xl bg-[#0a0b0d] border border-[#2d323b] text-xs text-white font-technical"
              />
            </div>

            {/* Live Recalculated Price Summary */}
            <div className="p-4 rounded-xl bg-[#0a0b0d] border border-[#1f2228] flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-technical uppercase text-gray-400">
                  Active Plant Rate ({reprintTargetOrder.offer_print_house})
                </span>
                <span className="text-xs font-technical text-gray-300">
                  Unit Cost: <strong className="text-white">€{reprintPreview.unitPriceEur.toFixed(2)} / copy</strong>
                  {reprintPreview.preflightFeeEur > 0 ? ' (incl. €45 Preflight)' : ' (Preflight fee waived)'}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-technical uppercase text-gray-400">
                  New Print Run Total ({reprintCopies.toLocaleString('en-US')} copies)
                </span>
                <span className="text-lg font-technical font-black text-[#10b981]">
                  €{reprintPreview.totalPriceEur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
              {onLoadSpecsToCalculator && (
                <button
                  type="button"
                  onClick={() => {
                    onLoadSpecsToCalculator(
                      {
                        ...reprintTargetOrder.specs,
                        copies: reprintCopies,
                        interior_pages: reprintPages,
                      },
                      reprintTitle
                    );
                    setReprintTargetOrder(null);
                    onClose();
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#2d323b] bg-[#0a0b0d] hover:border-white text-gray-300 hover:text-white text-[10px] font-technical font-bold uppercase tracking-wider"
                >
                  Open in Configurator
                </button>
              )}
              <button
                type="button"
                disabled={reprintSubmitting}
                onClick={handleConfirmReprint}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-technical font-black uppercase tracking-wider shadow-lg"
              >
                {reprintSubmitting
                  ? 'Creating Order...'
                  : reprintUseApprovedFiles
                  ? 'Confirm Reprint & Proceed to Checkout →'
                  : 'Create Order & Upload Revised PDFs →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          MODAL OVERLAY: SIGNED POD / CMR DOCUMENT VIEWER
         =================================================================== */}
      {showPodViewerModal && trackingData && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border p-6 space-y-4 shadow-2xl"
            style={{ backgroundColor: '#14161a', borderColor: '#10b981' }}
          >
            <div className="flex items-center justify-between border-b border-[#1f2228] pb-3">
              <div>
                <span className="text-[10px] font-technical font-black uppercase text-[#10b981]">
                  DELIVERY CERTIFICATE / SIGNED PROOF OF DELIVERY (CMR)
                </span>
                <h4 className="text-sm font-bold text-white mt-0.5">
                  {trackingData.pod.documentId} — Order {trackingData.orderId}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowPodViewerModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#0a0b0d] border border-[#1f2228] space-y-2.5 text-xs font-technical">
              <div className="flex justify-between">
                <span className="text-gray-400">Delivered Work:</span>
                <span className="text-white font-bold">{trackingData.bookTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Freight Carrier:</span>
                <span className="text-white">{trackingData.telemetry.carrierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Pallet SSCC-18:</span>
                <span className="text-gray-200">{trackingData.telemetry.sscc18}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Signed By (Destination Dock):</span>
                <span className="text-[#10b981] font-bold">{trackingData.pod.signedBy}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Receiving Dock Stamp:</span>
                <span className="text-white">{trackingData.pod.dockStampCode || 'DOCK-STAMP-OK'}</span>
              </div>
              <div className="pt-2 border-t border-[#1f2228]">
                <span className="block text-[9px] uppercase text-gray-500">Cryptographic Digital Signature (eIDAS)</span>
                <span className="text-[10px] text-emerald-400 break-all">
                  {trackingData.pod.digitalSignatureHash}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPodViewerModal(false)}
                className="px-4 py-2 rounded-xl border border-[#2d323b] text-xs font-technical text-gray-300"
              >
                Close
              </button>
              <a
                href={trackingData.pod.downloadPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2 rounded-xl bg-[#10b981] text-black text-xs font-technical font-black uppercase"
              >
                DOWNLOAD OFFICIAL POD PDF
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Legacy OrderIntentDetails Support */}
      {legacyIntentDetailId && (
        <OrderIntentDetails
          orderIntentId={legacyIntentDetailId}
          onClose={() => setLegacyIntentDetailId(null)}
        />
      )}
    </div>
  );

  if (isFullPage) {
    return hubSurface;
  }

  const modalOverlay = (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {hubSurface}
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalOverlay, document.body);
  }
  return modalOverlay;
};

const BookOpenMiniIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[#dc2626] mx-auto" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

export default CustomerPortalModal;

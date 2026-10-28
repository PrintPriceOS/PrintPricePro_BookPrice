import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';

import {
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

// PDF.js (legacy build)
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
const { getDocument, GlobalWorkerOptions } = pdfjsLib;

// Worker from the same pdfjs-dist version, bundled by Vite
// @ts-ignore
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import {
  BOOK_PRICE_API_ENDPOINT,
} from './constants';

import {
  BookSize,
  InitialBookPricePayload,
  BookPricePayload,
  BookPriceResponse,
  BookPriceOffer,
  CartItem,
  ProductionFileKind,
  ProductionFileDraft,
  ProductionFilesState,
  ProductionFileStatus,
  ProductionFilesWorkflowStatus,
  ProductionFileMetadata,
  SpineCalculationResult,
} from './types';

import { normaliseApiResponse } from './lib/normaliseApiResponse';

import AssistantChat from './components/AssistantChat';
import PdfUploadDropzone from './components/PdfUploadDropzone';
import BookPriceForm from './components/BookPriceForm';
import PrintOffersPanel from './components/PrintOffersPanel';
import CartPanel from './components/CartPanel';
import Header from './components/Header';
import ConfigurationSummary from './components/ConfigurationSummary';
import BookSpineGeometryPanel, { SpinePanelStatus } from './components/BookSpineGeometryPanel';
import { AuthModal } from './components/UserMenu';
import type { AuthUser } from './components/UserMenu';
import Toast from './components/Toast';
import type { ToastMessage } from './components/Toast';
import ProductionFilesPanel from './components/ProductionFilesPanel';
import CheckoutStepper from './components/CheckoutStepper';
import {
  validateProductionFile,
  validateProductionFileUrl,
  uploadProductionFile,
  listProductionFiles
} from './lib/productionFilesApi';

import { t } from './i18n/en';
import OrderIntentDetails from './components/OrderIntentDetails';
import { PrinthouseQueue } from './components/PrinthouseQueue';
import UserOrders from './components/UserOrders';
import { CustomerRemediationPage } from './components/CustomerRemediationPage';
import { QuoteRevisionReview } from './components/QuoteRevisionReview';

// ==== Helpers para extraer info del PDF ====

const PT_TO_MM = 25.4 / 72; // 1 punto PDF = 1/72 inch

// Tabla sencilla de tamaños que reconoce tu app (BookSize)
const KNOWN_SIZES = [
  { code: 'A4', width: 210, height: 297 },
  { code: 'A5', width: 148, height: 210 },
  { code: 'A6', width: 105, height: 148 },
  { code: '170 x 240 mm', width: 170, height: 240 },
  { code: '200 x 200 mm', width: 200, height: 200 },
  { code: '220 x 220 mm', width: 220, height: 220 },
] as const;

function inferSizeAndOrientationFromPage(page: any) {
  const viewport = page.getViewport({ scale: 1 });

  const widthPt = viewport.width;
  const heightPt = viewport.height;

  const widthMm = widthPt * PT_TO_MM;
  const heightMm = heightPt * PT_TO_MM;

  const orientation = widthMm >= heightMm ? 'landscape' : 'portrait';

  const shortSide = Math.min(widthMm, heightMm);
  const longSide = Math.max(widthMm, heightMm);

  let bestMatch: string = 'A5'; // Default to A5

  let bestDiff = Infinity;

  for (const size of KNOWN_SIZES) {
    const sShort = Math.min(size.width, size.height);
    const sLong = Math.max(size.width, size.height);
    const diff =
      Math.abs(shortSide - sShort) + Math.abs(longSide - sLong);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMatch = size.code;
    }
  }

  return {
    widthMm,
    heightMm,
    orientation, // "portrait" | "landscape" (lowercase)
    book_size: bestMatch,
  };
}

async function detectPageIsColor(page: any): Promise<boolean> {
  const viewport = page.getViewport({ scale: 0.5 }); // bajar un poco para no matar la CPU
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return true; // si no podemos analizar, asumimos color

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const step = 16; // muestreo → cada 16 píxeles
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Si R,G,B no son iguales → hay color
    if (!(r === g && g === b)) {
      return true;
    }
  }
  return false;
}

// Security Layer 2: Challenge Context Helper (v5.2)
async function getPayloadContext(data: any) {
  // Use core fields that define the pricing model to bind the token
  const coreFields = [data.copies, data.interior_pages, data.book_size];
  const msgUint8 = new TextEncoder().encode(JSON.stringify(coreFields));
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const initialFileDraft = (kind: ProductionFileKind): ProductionFileDraft => ({
  kind,
  status: 'PENDING',
});

const toProductionFileMetadata = (
  draft: ProductionFileDraft,
  kind: ProductionFileKind
): ProductionFileMetadata => ({
  kind,
  source_type: draft.source_type,
  filename: draft.filename,
  size_bytes: draft.size_bytes,
  mime_type: draft.mime_type,
  status: draft.status,
  download_url: draft.download_url,
  download_url_host: draft.download_url_host,
  ingestion_status: draft.ingestion_status,
  checksum: draft.checksum,
  validation: draft.validation,
  file_id: draft.file_id,
  storage_url: draft.storage_url,
  created_at: draft.created_at,
  error: draft.error,
});

const SESSION_ID_KEY = 'ppp_marketplace_session_id';

const getOrCreateSessionId = () => {
  let sid = localStorage.getItem(SESSION_ID_KEY);
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem(SESSION_ID_KEY, sid);
  }
  return sid;
};

// ==== Defensive Guard: Public Console Access ====
const ENABLE_PUBLIC_CONSOLE = (import.meta as any).env.VITE_ENABLE_PUBLIC_CONSOLE === 'true';

const INITIAL_BOOK_PRICE_PAYLOAD: InitialBookPricePayload = {
  // Basic info
  copies: 1000,
  interior_pages: 120,
  cover_pages: 4,
  book_size: 'A5',
  orientation: 'portrait',
  delivery_country: 'ES',

  // Print options
  interior_print: '4/4',
  cover_print: '4/0',
  cover_print_rev: 0,

  // Paper types
  paper_type_interior: 'offset',
  paper_type_cover: 'mc',
  paper_type_endpaper: 'offset',

  // Paper weights (gsm)
  paper_weight_interior: 100,
  paper_weight_cover: 240,
  paper_weight_endpapers: 140,

  // PMS colors
  pms_interior: 0,
  pms_cover: 0,

  // Binding & finishing
  binding_method: 'flexibound',
  finishing_options: 'matt_lam_scratch',
  uv_varnish: false,

  // Endpapers
  endpapers: 'none',
  endpapers_print: '',

  // Extra costs
  extra_book: 0,
  extra_section: 0,
  extra_fixed: 0,
  extra_variable: 0,
};

const App: React.FC = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentView, setCurrentView] = useState<'marketplace' | 'printhouse'>('marketplace');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [payloadVersion, setPayloadVersion] = useState(0);

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('ppos-theme') || localStorage.getItem('theme');
        if (stored === 'light' || stored === 'dark') {
          return stored === 'dark';
        }
      } catch {
        // ignore storage errors
      }
    }
    return true; // Default to PrintPrice OS Dark Theme (matches printprice.pro & control.printprice.pro)
  });

  // Sync theme with DOM & Control Plane ppos-theme key
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      try {
        localStorage.setItem('theme', 'dark');
        localStorage.setItem('ppos-theme', 'dark');
      } catch {}
    } else {
      document.documentElement.classList.remove('dark');
      try {
        localStorage.setItem('theme', 'light');
        localStorage.setItem('ppos-theme', 'light');
      } catch {}
    }
  }, [isDark]);

  const [bookPricePayload, setBookPricePayload] =
    useState<InitialBookPricePayload>(INITIAL_BOOK_PRICE_PAYLOAD);

  const [offers, setOffers] = useState<BookPriceResponse | null>(null);
  const [isSpecsStale, setIsSpecsStale] = useState<boolean>(false);
  const [spineResult, setSpineResult] = useState<SpineCalculationResult | null>(null);
  const [spineStatus, setSpineStatus] = useState<SpinePanelStatus>('CALIPER_VERIFICATION_REQUIRED');
  const [loadingPdf, setLoadingPdf] = useState<boolean>(false);
  const [loadingOffers, setLoadingOffers] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const calculationSeqRef = useRef<number>(0);
  const [quoteRevisionToken, setQuoteRevisionToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/^\/(?:quote-)?revision\/([^/]+)/);
    if (match) return match[1];
    return new URLSearchParams(window.location.search).get('revision_token');
  });

  const [creatingOrder, setCreatingOrder] = useState(false);
  const [controlPlaneOrderId, setControlPlaneOrderId] = useState<string | null>(null);
  const [controlPlaneOrderStatus, setControlPlaneOrderStatus] = useState<any | null>(null);
  const [orderCreationError, setOrderCreationError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [showMyOrders, setShowMyOrders] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);

  // ---- Production Files State (v5.3) ----
  const [productionFiles, setProductionFiles] = useState<ProductionFilesState>({
    interior_pdf: initialFileDraft('INTERIOR_PDF'),
    cover_spine_back_pdf: initialFileDraft('COVER_SPINE_BACK_PDF')
  });

  const sessionId = useRef<string>(getOrCreateSessionId());

  const addToast = useCallback((msg: Omit<ToastMessage, 'id'>) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { ...msg, id }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // SPINE-06R F01: Restore authenticated user & tenant session on mount
  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { method: 'GET', credentials: 'include' })
      .then(res => res.json().catch(() => null))
      .then(data => {
        if (!active) return;
        if (data?.ok && data?.authenticated && data?.user) {
          setUser({
            email: data.user.email,
            name: data.user.name || undefined,
            user_id: data.user.user_id,
            role: data.user.role,
            tenant_id: data.user.tenant_id || null,
          });
        }
      })
      .catch(() => {
        // Ignore network errors during initial session probe
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore logout network error
    }
    setUser(null);
  }, []);

  // v5.3 Phase 3: Hydrate files from server registry
  useEffect(() => {
    const hydrate = async () => {
      try {
        const files = await listProductionFiles({ session_id: sessionId.current });
        if (files.length > 0) {
          const interior = files.find(f => f.role === 'INTERIOR_PDF');
          const cover = files.find(f => f.role === 'COVER_PDF');

          setProductionFiles(prev => ({
            interior_pdf: interior ? { ...prev.interior_pdf, ...interior, status: interior.status } : prev.interior_pdf,
            cover_spine_back_pdf: cover ? { ...prev.cover_spine_back_pdf, ...cover, status: cover.status } : prev.cover_spine_back_pdf,
          }));

          const restoredCpOrderId = interior?.controlPlaneOrderId || cover?.controlPlaneOrderId;
          if (restoredCpOrderId) {
            setControlPlaneOrderId(restoredCpOrderId);
          }
          
          if (interior || cover) {
            addToast({
              variant: 'info',
              title: 'Session restored',
              body: 'Your previously uploaded production files have been recovered.',
            });
          }
        }
      } catch (err) {
        console.error('Failed to hydrate production files:', err);
      }
    };
    hydrate();
  }, [addToast]);

  const offersRef = useRef<HTMLDivElement>(null);
  const productionFilesRef = useRef<HTMLDivElement>(null);

  // Warmup Security Bridge (v5.2)
  useEffect(() => {
    const warmup = async () => {
      try {
        await fetch('/api/security/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload_context: 'warmup' })
        });
        console.log("🛡️ Infrastructure Safeguard Active. Assistant Bridge ready.");
      } catch (e) {
        console.warn('Fail-closed safeguard warmup delay.', e);
      }
    };
    warmup();
  }, []);

  // Configurar worker de PDF.js con la URL generada por Vite (misma versión que la API)
  useEffect(() => {
    try {
      (GlobalWorkerOptions as any).workerSrc = pdfWorkerSrc;
    } catch (e) {
      console.warn('Failed to configure PDF.js worker source', e);
    }

    // Check for admin param (Only if explicitly enabled via environment guard)
    if (ENABLE_PUBLIC_CONSOLE) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('admin') === 'true') {
        setIsAdmin(true);
      }
    }
  }, []);

  // Drag & drop / selección de PDF
  const handleFileSelect = useCallback(async (file: File | null) => {
    if (!file) {
      setPdfFile(null);
      setPageCount(0);
      setOffers(null);
      setError(null);
      setBookPricePayload((prev) => ({
        ...prev,
        total_page_count: 0,
        interior_pages: 0,
      }));
      return;
    }

    setPdfFile(file);
    setLoadingPdf(true);
    setOffers(null);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf: any = await getDocument({ data: arrayBuffer }).promise;

      const numPages = pdf.numPages || 0;
      setPageCount(numPages);

      // Primera página para inferir tamaño, orientación y color
      const firstPage = await pdf.getPage(1);
      const sizeInfo = inferSizeAndOrientationFromPage(firstPage);
      const isColor = await detectPageIsColor(firstPage);

      setBookPricePayload((prev) => ({
        ...prev,
        total_page_count: numPages,
        interior_pages: Math.max(numPages - 4, 0),
        book_size: sizeInfo.book_size as BookSize,           // "A4", "A5", "Custom", etc.
        orientation: sizeInfo.orientation as any,       // "Portrait" | "Landscape"
        interior_print: (isColor ? '4/4' : '1/1') as any, // color vs B/N
        // La cubierta la dejamos como está (4/0) de momento
      }));
      setPayloadVersion(v => v + 1);
    } catch (err) {
      console.error('Error loading PDF:', err);
      setError(t('pdf_load_error_message'));
      setPageCount(0);
    } finally {
      setLoadingPdf(false);
    }
  }, []);

  const handleSwitchInteriorToAdvancedCatalog = useCallback(() => {
    setBookPricePayload((prev) => ({
      ...prev,
      paper_mode_interior: 'advanced',
    }));
    setPayloadVersion((v) => v + 1);
    setIsSpecsStale(true);
  }, []);

  const handlePayloadChange = useCallback(
    (payload: InitialBookPricePayload) => {
      setBookPricePayload(payload);
    },
    []
  );


  // Construir payload para BPE / create-order
  const buildBookPricePayload = useCallback((): BookPricePayload => {
    const interiorPagesRaw = Number(bookPricePayload.interior_pages);
    const interiorPages = Number.isFinite(interiorPagesRaw)
      ? interiorPagesRaw
      : 0;

    // Validate PMS colors (must be 0 or 1, default to 0 if invalid)
    const validatePMS = (value: number): number => {
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0 || num > 3) {
        return 0; // Default to 0 if invalid
      }
      return Math.floor(num); // Ensure integer
    };

    // Validate paper types (ensure never null or empty)
    const validatePaperType = <T extends string>(value: string | null | undefined, defaultValue: T): T => {
      if (!value || value.trim() === '') {
        return defaultValue;
      }
      return value as T;
    };

    // Validate finishing options (ensure never empty, default to empty string which backend normalizes to 'none')
    const validateFinishing = (value: string | null | undefined): '' | 'gloss_lam' | 'matt_lam' | 'soft_touch' | 'matt_lam_scratch' => {
      if (!value) {
        return '';
      }
      return value as '' | 'gloss_lam' | 'matt_lam' | 'soft_touch' | 'matt_lam_scratch';
    };

    return {
      // Basic info
      copies: bookPricePayload.copies,
      interior_pages: interiorPages,
      cover_pages: bookPricePayload.cover_pages,
      book_size: bookPricePayload.book_size,
      orientation: bookPricePayload.orientation,
      delivery_country: bookPricePayload.delivery_country.trim().toUpperCase(),

      // Print options
      interior_print: bookPricePayload.interior_print,
      cover_print: bookPricePayload.cover_print,
      cover_print_rev: bookPricePayload.cover_print_rev,

      // Paper types (validated to ensure never null/empty)
      paper_type_interior: validatePaperType(bookPricePayload.paper_type_interior, 'offset'),
      paper_type_cover: validatePaperType(bookPricePayload.paper_type_cover, 'mc'),
      paper_type_endpaper: validatePaperType(bookPricePayload.paper_type_endpaper, 'offset'),

      // Paper weights
      paper_weight_interior: bookPricePayload.paper_weight_interior,
      paper_weight_cover: bookPricePayload.paper_weight_cover,
      paper_weight_endpapers: bookPricePayload.paper_weight_endpapers,

      // PMS colors (validated to ensure 1-3)
      pms_interior: validatePMS(bookPricePayload.pms_interior),
      pms_cover: validatePMS(bookPricePayload.pms_cover),

      // Binding & finishing (validated + mapped)
      binding_method: bookPricePayload.binding_method,
      finishing_options: validateFinishing(bookPricePayload.finishing_options),
      uv_varnish: bookPricePayload.uv_varnish,

      // Endpapers
      endpapers: bookPricePayload.endpapers,
      endpapers_print: bookPricePayload.endpapers_print || '',

      // Extra costs
      extra_book: bookPricePayload.extra_book,
      extra_section: bookPricePayload.extra_section,
      extra_fixed: bookPricePayload.extra_fixed,
      extra_variable: bookPricePayload.extra_variable,

      // App metadata
      ...(bookPricePayload.total_page_count !== undefined
        ? { total_page_count: bookPricePayload.total_page_count }
        : {}),

      // Debug (optional)
      ...(bookPricePayload.debug ? { debug: 1 as const } : {}),

      // Custom dimensions (if book_size is "Custom")
      ...(bookPricePayload.book_size === 'Custom' && bookPricePayload.custom_width && bookPricePayload.custom_height
        ? {
          custom_width: bookPricePayload.custom_width,
          custom_height: bookPricePayload.custom_height,
        }
        : {}),

      // Advanced Paper Catalog selection (Control Plane Paper Supplier Hub)
      ...(bookPricePayload.paper_mode_interior ? { paper_mode_interior: bookPricePayload.paper_mode_interior } : {}),
      ...(bookPricePayload.interior_paper_material ? { interior_paper_material: bookPricePayload.interior_paper_material } : {}),
      ...(bookPricePayload.paper_mode_cover ? { paper_mode_cover: bookPricePayload.paper_mode_cover } : {}),
      ...(bookPricePayload.cover_paper_material ? { cover_paper_material: bookPricePayload.cover_paper_material } : {}),
      ...(bookPricePayload.paper_mode_endpaper ? { paper_mode_endpaper: bookPricePayload.paper_mode_endpaper } : {}),
      ...(bookPricePayload.endpaper_material ? { endpaper_material: bookPricePayload.endpaper_material } : {}),
    };
  }, [bookPricePayload]);

  // Botón manual "Calculate Price" (Protected against out-of-order race conditions)
  const handleCalculatePrice = useCallback(async () => {
    setError(null);
    setOffers(null);

    // Guardia: interior_pages válido antes de llamar al BPE
    const interiorPages = Number(bookPricePayload.interior_pages);
    if (!Number.isFinite(interiorPages) || interiorPages <= 0) {
      setError(
        'Please enter a valid number of interior pages before calculating.'
      );
      return;
    }

    const currentSeq = ++calculationSeqRef.current;
    setLoadingOffers(true);

    try {
      // 1. Prepare Payload Context for Binding (v5.2)
      const payloadBase = buildBookPricePayload();
      const payloadCtx = await getPayloadContext(payloadBase);

      // 2. Obtain Bound Server Challenge
      const challengeRes = await fetch('/api/security/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload_context: payloadCtx })
      });
      if (!challengeRes.ok) throw new Error('Infrastructure safeguard triggered. Refreshing security context.');
      const { token, nonce, timestamp } = await challengeRes.json();

      // 3. Prepare Final Sealed Payload
      const payloadForApi = {
        ...payloadBase,
        hp_field: (document.getElementById('hp_node') as HTMLInputElement)?.value || '',
        security_token: token,
        nonce,
        timestamp
      };

      // 3. Request Final Calculation
      const response = await fetch(BOOK_PRICE_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadForApi),
      });

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData?.message) message = errorData.message;
          if (errorData?.error) message = errorData.error;
        } catch {
          // ignore JSON parse error
        }
        throw new Error(message || t('api_error_message'));
      }

      const data = await response.json();
      
      // Guard against race conditions: if a newer calculation was triggered, discard this result
      if (currentSeq !== calculationSeqRef.current) {
        console.log(`[BPE_RACE_CONDITION_PREVENTED] Discarding response from calculation #${currentSeq}`);
        return;
      }

      // v5.3 Phase 4: Handle ok property and session data
      if (data.ok && !data.success) {
          data.success = true;
      }

      const normalised = normaliseApiResponse(data);
      
      // Inject offer_session_id and signature into normalized offers if missing
      if (data.offer_session_id) {
          normalised.offer_session_id = data.offer_session_id;
          normalised.expires_at = data.expires_at;
          normalised.offers = normalised.offers.map(o => ({
              ...o,
              offer_session_id: data.offer_session_id,
              expires_at: data.expires_at
          }));
      }

      if (!normalised.offers.length && normalised.message) {
        setError(normalised.message);
      }

      setOffers(normalised);
      setIsSpecsStale(false);
      setTimeout(() => offersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (err: any) {
      if (currentSeq !== calculationSeqRef.current) return;
      console.error('Error calculating price:', err);
      setError(err?.message || t('api_error_message'));
      setOffers(null);
    } finally {
      if (currentSeq === calculationSeqRef.current) {
        setLoadingOffers(false);
      }
    }
  }, [bookPricePayload, buildBookPricePayload]);

  const handleProductionFileSelect = useCallback(async (kind: ProductionFileKind, file: File) => {
    try {
      const { valid, error, metadata } = await validateProductionFile(file, kind);

      if (!valid) {
        addToast({
          variant: 'error',
          title: 'Invalid file',
          body: error === 'INVALID_TYPE_REQUIRED_PDF' ? 'Please select a valid PDF file.' : error,
        });
        setProductionFiles(prev => ({
          ...prev,
          [kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf']: {
            ...prev[kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf'],
            status: 'ERROR',
            error
          }
        }));
        return;
      }

      setProductionFiles(prev => ({
        ...prev,
        [kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf']: {
          kind,
          source_type: 'UPLOAD',
          file,
          filename: metadata?.filename,
          size_bytes: metadata?.size_bytes,
          mime_type: metadata?.mime_type,
          status: 'SELECTED'
        }
      }));

      // v5.3: Immediate upload after selection
      setProductionFiles(prev => ({
        ...prev,
        [kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf']: {
          ...prev[kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf'],
          status: 'UPLOADING'
        }
      }));

      try {
        const cartItem = cart[0];
        const uploadedMetadata = await uploadProductionFile(file, kind, { 
          session_id: cartItem?.offer_session_id || sessionId.current,
          cart_id: cartItem?.id,
          controlPlaneOrderId: controlPlaneOrderId || cartItem?.metadata?.controlPlaneOrderId
        });
        
        setProductionFiles(prev => ({
          ...prev,
          [kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf']: {
            ...uploadedMetadata,
            controlPlaneRegistration: uploadedMetadata.controlPlaneRegistration,
            controlPlaneFileId: uploadedMetadata.controlPlaneFileId,
            controlPlaneOrderId: uploadedMetadata.controlPlaneOrderId,
            status: 'UPLOADED' // Force UPLOADED status on success
          }
        }));

        if (uploadedMetadata.controlPlaneRegistration && uploadedMetadata.controlPlaneRegistration.ok === false) {
          addToast({
            variant: 'info',
            title: 'Registration Warning',
            body: 'File uploaded, but ControlPlane registration failed. Please retry or contact support.',
          });
        } else {
          addToast({
            variant: 'success',
            title: 'Upload complete',
            body: `${kind === 'INTERIOR_PDF' ? 'Interior' : 'Cover'} PDF uploaded successfully.`,
          });
        }
      } catch (uploadErr: any) {
        console.error('Upload failed:', uploadErr);
        setProductionFiles(prev => ({
          ...prev,
          [kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf']: {
            ...prev[kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf'],
            status: 'ERROR',
            error: uploadErr.message || 'UPLOAD_FAILED'
          }
        }));
        addToast({
          variant: 'error',
          title: 'Upload failed',
          body: uploadErr.message || 'Failed to upload file to server.',
        });
      }
    } catch (err) {
      console.error('File validation error:', err);
    }
  }, [addToast, cart, controlPlaneOrderId]);

  const handleProductionFileUrlSelect = useCallback(async (kind: ProductionFileKind, url: string) => {
    try {
      const { valid, error, metadata } = await validateProductionFileUrl(url, kind);

      if (!valid) {
        addToast({
          variant: 'error',
          title: 'Invalid link',
          body: error === 'SECURE_HTTPS_REQUIRED' ? 'Only secure HTTPS links are allowed.' : 'Please provide a valid download URL.',
        });
        setProductionFiles(prev => ({
          ...prev,
          [kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf']: {
            ...prev[kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf'],
            status: 'ERROR',
            error
          }
        }));
        return;
      }

      setProductionFiles(prev => ({
        ...prev,
        [kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf']: {
          kind,
          source_type: 'DOWNLOAD_URL',
          download_url: metadata?.download_url,
          download_url_host: metadata?.download_url_host,
          status: 'LINK_PROVIDED',
          ingestion_status: 'NOT_STARTED'
        }
      }));

      addToast({
        variant: 'success',
        title: 'Link ready',
        body: `${kind === 'INTERIOR_PDF' ? 'Interior' : 'Cover'} download link declared.`,
      });
    } catch (err) {
      console.error('URL validation error:', err);
    }
  }, [addToast]);

  const handleProductionFileRemove = useCallback((kind: ProductionFileKind) => {
    setProductionFiles(prev => ({
      ...prev,
      [kind === 'INTERIOR_PDF' ? 'interior_pdf' : 'cover_spine_back_pdf']: initialFileDraft(kind)
    }));
  }, []);

  const handleGoToUpload = useCallback(() => {
    setIsCartOpen(false);
    setTimeout(() => {
      productionFilesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }, []);

  const handleChooseOffer = useCallback(async (offer: BookPriceOffer) => {
    if (creatingOrder) return;

    if (offer.checkout_allowed === false) {
      const msg = 'This quote is not precise enough for checkout. Please recalculate or contact support.';
      setOrderError(msg);
      addToast({
        variant: 'error',
        title: 'Quote unavailable',
        body: msg,
      });
      return;
    }

    try {
      setCreatingOrder(true);
      setOrderError(null);

      // Clear current backend cart before adding the new selected offer
      await Promise.all(
        cart.map(item =>
          fetch(`/api/cart/items/${item.id}`, {
            method: 'DELETE',
            credentials: 'include',
          }).catch(() => null)
        )
      );

      const specs = buildBookPricePayload();
      const allOffers = offers?.offers || [];

      const recommendedOffer =
        allOffers.find(o =>
          o.recommended ||
          o.id === offers?.recommended_offer_id ||
          o.offer_id === offers?.recommended_offer_id ||
          o.offer_id === offers?.raw_recommended_offer_id
        ) || null;

      const recommendedOfferId =
        offers?.recommended_offer_id ||
        offers?.raw_recommended_offer_id ||
        recommendedOffer?.offer_id ||
        recommendedOffer?.id ||
        null;

      const pricing = {
        total_price: Number(offer.total_price || offer.total_cost || 0),
        total_cost: Number(offer.total_cost || offer.total_price || 0),
        currency: offer.currency || 'EUR',
        margin: offer.margin || 0,
        margin_percent: offer.margin_percent || 0,
      };

      const offer_session_id = offer.offer_session_id || offers?.offer_session_id;
      const offer_id = offer.offer_id || offer.id;

      if (!offer_session_id || !offer_id) {
          throw new Error('Missing offer session or offer id. Please recalculate.');
      }

      const idempotencyKey = `${sessionId.current}:${offer_id}:${offer_session_id}`;

      // 1. Create ControlPlane Order
      const cpResponse = await fetch('/api/orders/create-from-offer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pricingSessionId: offer_session_id,
          selectedOfferId: offer_id,
          sessionId: sessionId.current,
          customerId: user?.user_id || undefined,
          customer: user ? { name: user.name, email: user.email } : { name: "Anonymous", email: null },
          bookSpec: specs,
          idempotencyKey,
          metadata: {
            source: "bpe-marketplace-app",
            uiStep: currentStep,
            cartFlow: true
          }
        }),
      });

      let cpData: any = {};
      try {
        cpData = await cpResponse.json();
      } catch {
        // ignore
      }

      if (!cpResponse.ok || !cpData.ok) {
        setOrderCreationError(cpData.error || cpData.message || 'Failed to create production order');
        throw new Error(cpData.error || cpData.message || 'We could not create your production order yet. Please try again.');
      }

      setControlPlaneOrderId(cpData.orderId);
      setControlPlaneOrderStatus(cpData.status);

      // 2. Add to local cart for UI state transition

      const response = await fetch('/api/cart/add', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer_session_id,
          offer_id,
          // Legacy fields preserved for dev-mode logging but backend should ignore in prod
          specs,
          offer: {
            ...offer,
            selected_by_customer: true,
          }
        }),
      });

      let data: any = {};
      try {
        data = await response.json();
      } catch {
        // ignore non-json response
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to add to cart');
      }

      setCart([{
        id: data.item_id,
        offer_session_id: offer.offer_session_id || offers?.offer_session_id,
        offer_id: offer.offer_id || offer.id,
        specs,
        offer: {
          ...offer,
          selected_by_customer: true,
        },
        pricing,
        allOffers,
        recommendedOffer,
        recommendedOfferId,
        selectedBy: 'CUSTOMER',
        addedAt: new Date().toISOString(),
        metadata: {
          contract: 'BPE_MARKETPLACE_NATIVE',
          source: 'PRINTPRICE_APP',
          bpe_endpoint: '/api/marketplace/offers',
          payment_status: 'PENDING',
          controlPlaneOrderId: cpData.orderId,
          controlPlaneOrderStatus: cpData.status,
          idempotencyKey,
        },
      }]);

      setProductionFiles({
        interior_pdf: initialFileDraft('INTERIOR_PDF'),
        cover_spine_back_pdf: initialFileDraft('COVER_SPINE_BACK_PDF'),
      });

      setIsCartOpen(true);
    } catch (err: any) {
      console.error('Error adding to cart:', err);
      const isExpired = err?.message?.includes('OFFER_SESSION_EXPIRED');
      const msg = isExpired 
        ? 'This offer has expired. Please recalculate pricing before continuing.'
        : (err?.message || 'Failed to add offer to cart.');
      
      addToast({
        variant: 'error',
        title: isExpired ? 'Offer Expired' : 'Order Error',
        body: msg,
      });
      if (isExpired) {
          setOffers(null);
          setTimeout(() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
          }, 100);
      }
    } finally {
      setCreatingOrder(false);
    }
  }, [offers, cart, addToast, creatingOrder, buildBookPricePayload]);

  const areProductionFilesReady = useCallback(() => {
    // v5.3: SELECTED is no longer enough. Must be UPLOADED or VALIDATED (or LINK_...)
    const readyStatuses: ProductionFileStatus[] = [
      'UPLOADED', 'VALIDATED',
      'LINK_PROVIDED', 'LINK_PENDING_FETCH'
    ];

    return (
      readyStatuses.includes(productionFiles.interior_pdf.status) &&
      readyStatuses.includes(productionFiles.cover_spine_back_pdf.status)
    );
  }, [productionFiles]);

  const buildProductionFilesMetadata = useCallback(() => {
    const filesReady = areProductionFilesReady();
    const interior = productionFiles.interior_pdf;
    const cover = productionFiles.cover_spine_back_pdf;

    let workflowStatus: ProductionFilesWorkflowStatus = 'FILES_PENDING';
    if (filesReady) {
      const hasDownloadUrl =
        interior.source_type === 'DOWNLOAD_URL' ||
        cover.source_type === 'DOWNLOAD_URL';

      const hasUpload =
        interior.source_type === 'UPLOAD' ||
        cover.source_type === 'UPLOAD';

      if (interior.status === 'VALIDATED' && cover.status === 'VALIDATED') {
        workflowStatus = 'FILES_VALIDATED';
      } else if (interior.status === 'UPLOADED_WITH_WARNINGS' || cover.status === 'UPLOADED_WITH_WARNINGS') {
        workflowStatus = 'FILES_UPLOADED_WITH_WARNINGS';
      } else if (hasDownloadUrl && hasUpload) {
        workflowStatus = 'FILES_MIXED_DECLARED';
      } else if (hasDownloadUrl) {
        workflowStatus = 'FILES_FETCH_REQUIRED';
      } else {
        workflowStatus = 'FILES_SELECTED';
      }
    }

    return {
      required: true as const,
      status: workflowStatus,
      required_files: ['INTERIOR_PDF', 'COVER_SPINE_BACK_PDF'] as ProductionFileKind[],
      interior_pdf: toProductionFileMetadata(interior, 'INTERIOR_PDF'),
      cover_spine_back_pdf: toProductionFileMetadata(cover, 'COVER_SPINE_BACK_PDF'),
    };
  }, [productionFiles, areProductionFilesReady]);

  const handleCheckout = useCallback(async () => {
    try {
      if (!areProductionFilesReady()) {
        const msg = 'Production files are required before creating the order request.';
        setOrderError(msg);
        addToast({
          variant: 'error',
          title: 'Production files required',
          body: msg,
        });
        return;
      }

      if (!productionFiles.interior_pdf.file_id || !productionFiles.cover_spine_back_pdf.file_id) {
        const msg = 'One or more production files are missing their server identity. Please re-upload.';
        setOrderError(msg);
        addToast({
          variant: 'error',
          title: 'Files identity missing',
          body: msg,
        });
        return;
      }

      if (!user) {
        setAuthModalOpen(true);
        return;
      }
      setCreatingOrder(true);
      setOrderError(null);
      const cartItem = cart[0]; // Assuming single item cart for this app context
      const res = await fetch('/api/order-intents', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId.current,
          cart_id: cartItem?.id,
          offer_session_id: cartItem?.offer_session_id,
          offer_id: cartItem?.offer_id,
          production_files: {
            interior_pdf_file_id: productionFiles.interior_pdf.file_id,
            cover_pdf_file_id: productionFiles.cover_spine_back_pdf.file_id
          },
          customer: {
            email: user?.email,
            name: user?.name,
            role: user?.role
          },
          user_id: user?.user_id,
          control_plane_order_id: controlPlaneOrderId || undefined,
          customer_paper_preferences: (bookPricePayload?.paper_mode_interior === 'standard' && bookPricePayload?.paper_mode_cover === 'standard' && !bookPricePayload?.interior_paper_material && !bookPricePayload?.cover_paper_material)
            ? null
            : (bookPricePayload?.interior_paper_material || bookPricePayload?.cover_paper_material)
              ? {
                  interior: bookPricePayload.interior_paper_material || null,
                  cover: bookPricePayload.cover_paper_material || null,
                }
              : (cartItem?.specs?.customer_paper_preferences ?? undefined)
        }),
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const e = await res.json();
          message = e?.error || e?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const data = await res.json();
      if (data.ok) {
        setOrderSuccess(data.public_ref);
        setSelectedIntentId(data.order_intent_id);
        setCart([]);
      }
      setIsCartOpen(false);
      setProductionFiles({
        interior_pdf: initialFileDraft('INTERIOR_PDF'),
        cover_spine_back_pdf: initialFileDraft('COVER_SPINE_BACK_PDF'),
      });

      addToast({
        variant: 'success',
        title: `Intent created — ${data.public_ref || data.order_intent_id || '—'}`,
        body: 'Order Intent created successfully. Final order creation is deferred until preflight validation and payment.',
      });
    } catch (err: any) {
      console.error('Error creating order:', err);
      const isExpired = err?.message?.includes('OFFER_SESSION_EXPIRED');
      const msg = isExpired 
        ? 'This offer has expired. Please recalculate pricing before continuing.'
        : (err?.message || 'Checkout error.');
      
      setOrderError(msg);
      addToast({
        variant: 'error',
        title: isExpired ? 'Offer Expired' : 'Order Error',
        body: msg,
      });

      if (isExpired) {
          setCart([]);
          setOffers(null);
          setTimeout(() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
          }, 100);
      }
    } finally {
      setCreatingOrder(false);
    }
  }, [user, addToast, areProductionFilesReady, buildProductionFilesMetadata]);

  const handleRemoveFromCart = useCallback(async (itemId: string) => {
    try {
      await fetch(`/api/cart/items/${itemId}`, { method: 'DELETE', credentials: 'include' });
      setCart(prev => {
        const next = prev.filter(i => i.id !== itemId);

        if (next.length === 0) {
          setProductionFiles({
            interior_pdf: initialFileDraft('INTERIOR_PDF'),
            cover_spine_back_pdf: initialFileDraft('COVER_SPINE_BACK_PDF'),
          });
        }

        return next;
      });
    } catch {
      // silent
    }
  }, []);

  const selectedOfferId = React.useMemo(() => {
    const currentOfferIds = new Set(offers?.offers?.map(o => o.id) ?? []);
    return cart.find(i => currentOfferIds.has(i.offer.id))?.offer.id ?? null;
  }, [offers, cart]);

  const currentStep = React.useMemo(() => {
    if (orderSuccess) return 'checkout';
    if (cart.length > 0) return 'upload';
    if (offers) return 'offer';
    return 'specs';
  }, [cart, offers, orderSuccess]);

  const combinedOffersError = orderError || null;

  const remediationMatch = window.location.pathname.match(/^\/remediation\/([^/]+)\/([^/]+)/);

  return (
    <div className="flex flex-col min-h-screen bg-corporate-primary tactical-grid text-corporate-text selection:bg-corporate-accent selection:text-white">
      {/* Honeypot Node - Anti-Bot */}
      <input type="text" id="hp_node" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

      <Header
        cartCount={cart.length}
        onCartClick={() => setIsCartOpen(prev => !prev)}
        onMyOrdersClick={() => {
          setShowMyOrders(true);
          setIsCartOpen(false);
        }}
        isDark={isDark}
        onThemeToggle={() => setIsDark(prev => !prev)}
        user={user}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        currentView={currentView}
        onViewChange={ENABLE_PUBLIC_CONSOLE ? setCurrentView : undefined}
      />

      <main className="flex-1 w-full mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6 md:py-8 max-w-[1400px] pb-24 lg:pb-12">
        {remediationMatch ? (
          <CustomerRemediationPage
            orderId={remediationMatch[1]}
            token={remediationMatch[2]}
          />
        ) : quoteRevisionToken ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-2">
              <button
                type="button"
                onClick={() => {
                  setQuoteRevisionToken(null);
                  window.history.pushState({}, '', '/');
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-corporate-border hover:border-corporate-accent bg-corporate-secondary text-corporate-text-secondary hover:text-corporate-accent text-[10px] font-technical uppercase font-bold tracking-wider sm:tracking-monolith transition-all shadow-sm"
              >
                ← Return to Calculator
              </button>
            </div>
            <QuoteRevisionReview
              token={quoteRevisionToken}
              onClose={() => {
                setQuoteRevisionToken(null);
                window.history.pushState({}, '', '/');
              }}
            />
          </div>
        ) : currentView === 'marketplace' ? (
          <>
            {/* Visual Workflow Guidance */}
            <CheckoutStepper currentStep={currentStep} />

            {/* Asistente IA arriba, a ancho completo */}
            <AssistantChat
              specs={bookPricePayload}
              offers={offers}
              onSpecsPatch={(patch) => {
                console.log("BEFORE PATCH specs:", bookPricePayload);
                console.log("PATCH RECEIVED:", patch);
                setBookPricePayload((prev) => {
                  const nextPayload = { ...prev, ...patch, book_size: patch.book_size as BookSize };
                  console.log("AFTER PATCH next:", nextPayload);
                  return nextPayload;
                });
                setPayloadVersion(v => v + 1);
              }}
              onOffersUpdate={(newOffers) => setOffers(newOffers)}
              onChooseOffer={handleChooseOffer}
              selectedOfferId={selectedOfferId}
            />

            <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] gap-6 items-start">
              {/* Left: PDF + form */}
              <div className="space-y-6 min-w-0">
                <div className="bg-corporate-secondary p-4 sm:p-6 md:p-8 rounded-2xl shadow-sm border border-corporate-border border-l-4 border-l-corporate-accent transition-all">
                  <h2 className="text-[0.7rem] font-technical font-black tracking-wider sm:tracking-monolith text-corporate-accent mb-6 uppercase break-words">
                    {t('upload_pdf_instructions')}
                  </h2>
                  <PdfUploadDropzone
                    onFileSelect={handleFileSelect}
                    loading={loadingPdf}
                    fileName={pdfFile ? pdfFile.name : null}
                    error={error}
                  />
                  {pageCount > 0 && (
                    <p className="mt-4 text-[0.6rem] font-technical tracking-wider text-corporate-text-secondary uppercase">
                      Detected{' '}
                      <span className="text-corporate-accent font-black">{pageCount}</span>{' '}
                      pages in the source_node.
                    </p>
                  )}
                </div>

                <BookPriceForm
                  initialPayload={bookPricePayload}
                  payloadVersion={payloadVersion}
                  onPayloadChange={handlePayloadChange}
                  onCalculatePrice={handleCalculatePrice}
                  loading={loadingOffers}
                  hasPdf={!!pdfFile}
                  isAdmin={isAdmin}
                  onSpecsInvalidated={() => setIsSpecsStale(true)}
                />
              </div>

              {/* Right: Configuration Snapshot & Offers */}
              <div className="flex flex-col gap-6 min-w-0">
                <ConfigurationSummary
                  payload={bookPricePayload}
                  offers={offers}
                  isSpecsStale={isSpecsStale}
                  onRecalculate={handleCalculatePrice}
                  loading={loadingOffers}
                  spineResult={spineResult}
                  spineStatus={spineStatus}
                />

                <BookSpineGeometryPanel
                  formData={bookPricePayload}
                  authContextKey={`${user?.user_id || 'anon'}:${user?.tenant_id || 'no-tenant'}`}
                  onSwitchInteriorToAdvancedCatalog={handleSwitchInteriorToAdvancedCatalog}
                  onSpineResultChange={(result, status) => {
                    setSpineResult(result);
                    setSpineStatus(status);
                  }}
                />

                <div ref={offersRef} className="min-w-0">
                  <PrintOffersPanel
                    offers={offers}
                    loading={loadingOffers}
                    error={combinedOffersError}
                    onChooseOffer={handleChooseOffer}
                    selectedOfferId={selectedOfferId}
                  />
                </div>

                {orderSuccess && (
                  <div className="bg-corporate-secondary rounded-2xl shadow-sm border border-corporate-accent/30 p-6 sm:p-8 flex items-start gap-6">
                    <div className="w-2 h-2 mt-1 bg-corporate-accent shrink-0" />
                    <div>
                      <p className="text-[0.7rem] font-technical font-black tracking-monolith text-corporate-accent uppercase mb-2">
                        Order confirmed — {orderSuccess}
                      </p>
                      <p className="text-sm text-corporate-text-secondary">
                        Order request created. Production assets are recorded. Payment remains pending until ingestion, validation and invoice generation.
                      </p>
                      <div className="mt-4 flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => selectedIntentId && setSelectedIntentId(selectedIntentId)}
                          className="bg-corporate-accent hover:bg-corporate-accent-hover px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-monolith text-white transition-colors"
                        >
                          View Details & Preflight
                        </button>
                        <button
                          type="button"
                          onClick={() => { setOrderSuccess(null); setSelectedIntentId(null); }}
                          className="text-[10px] font-technical font-black tracking-monolith text-corporate-muted hover:text-corporate-accent uppercase transition-colors"
                        >
                          [×] Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {!pdfFile &&
                  !bookPricePayload.total_page_count &&
                  !loadingPdf &&
                  !loadingOffers &&
                  !offers && (
                    <div className="flex-1 flex items-center justify-center rounded-2xl shadow-sm border border-corporate-border bg-corporate-secondary p-6 sm:p-10">
                      <div className="text-center text-corporate-muted font-technical text-xs tracking-widest uppercase">
                        {t('enter_specs_or_upload_pdf')}
                      </div>
                    </div>
                  )}
              </div>
            </section>

            {/* Production Files Step (v5.3) */}
            {cart.length > 0 && (
              <div ref={productionFilesRef} className="mt-8 border-t border-corporate-border pt-10">
                <ProductionFilesPanel
                  cartItem={cart[0]}
                  filesState={productionFiles}
                  onFileSelect={handleProductionFileSelect}
                  onUrlSelect={handleProductionFileUrlSelect}
                  onFileRemove={handleProductionFileRemove}
                  onContinue={handleCheckout}
                  disabled={creatingOrder}
                  orderId={controlPlaneOrderId || undefined}
                />
              </div>
            )}
          </>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             {ENABLE_PUBLIC_CONSOLE ? <PrinthouseQueue /> : <div className="p-12 text-center text-corporate-muted uppercase font-technical text-xs tracking-widest">Access Denied</div>}
          </div>
        )}
      </main>

      {/* Cart slide-over */}
      <CartPanel
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        checkingOut={creatingOrder}
        onRemove={handleRemoveFromCart}
        onCheckout={handleCheckout}
        onGoToUpload={handleGoToUpload}
        isLoggedIn={!!user}
        onSignInClick={() => setAuthModalOpen(true)}
      />

      {authModalOpen && (
        <AuthModal
          onClose={() => setAuthModalOpen(false)}
          onLoginSuccess={(loggedInUser) => {
            setUser(loggedInUser);
            setAuthModalOpen(false);
          }}
        />
      )}

      {selectedIntentId && (
        <OrderIntentDetails 
          orderIntentId={selectedIntentId} 
          onClose={() => setSelectedIntentId(null)} 
          onReset={() => {
            setSelectedIntentId(null);
            setOrderSuccess(null);
            setOffers(null);
            setPdfFile(null);
            setPageCount(0);
            setBookPricePayload(INITIAL_BOOK_PRICE_PAYLOAD);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />

      {showMyOrders && (
        <UserOrders 
          userId={user?.user_id} 
          onClose={() => setShowMyOrders(false)} 
        />
      )}
    </div>
  );
};

export default App;

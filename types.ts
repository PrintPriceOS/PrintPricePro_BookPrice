// ---- BPE Marketplace Native Contract (v5.2) ----

export type BookSize = 
  | 'A4' | 'A5' | 'A6' 
  | '170 x 240 mm' | '200 x 200 mm' | '220 x 220 mm' 
  | 'Custom';

export type Orientation = 'portrait' | 'landscape';

export type InteriorPrint = '4/4' | '2/2' | '1/1';

export type CoverPrint = '4/0' | '4/4' | '1/0';

export type BindingMethod = 
  | 'perfect_bound' 
  | 'thread_sewn_sc' 
  | 'thread_sewn_hc' 
  | 'saddle_stitch' 
  | 'wire_o' 
  | 'flexibound';

export type FinishingOption = 
  | 'gloss_lam' 
  | 'matt_lam' 
  | 'matt_lam_scratch' 
  | 'soft_touch' 
  | '';

export type EndpapersOption = 'none' | 'standard';

export type EndpapersPrint = '' | '1/0' | '4/0' | '1/1' | '4/4' | 'none';

export type PaperTypeInterior = 'offset' | 'mc' | 'lux' | 'munken' | 'other';

export type PaperTypeCover = 'mc' | 'artboard' | 'offset' | 'wfmc' | 'other' | 'none';

export type PaperTypeEndpaper = 'offset' | 'mc' | 'other' | 'none';

// ---- Advanced Paper Catalog Contract (Control Plane Paper Hub) ----
export type PaperCategory =
  | 'OFFSET'
  | 'COATED'
  | 'CARTON'
  | 'DESIGN'
  | 'DIGITAL'
  | 'OTHER';

export interface CatalogPaperVariant {
  variantId: string;
  productId: string;
  productName: string;
  brand?: string | null;
  manufacturer?: string | null;
  category: PaperCategory | string;
  finishSummary?: string | null;
  description?: string | null;
  gsm: number;
  widthMm: number;
  heightMm: number;
  caliperUm?: number | null;
  caliperMm?: number | null;
  finish?: string | null;
  grainDirection?: 'LONG_GRAIN' | 'SHORT_GRAIN' | 'UNKNOWN';
  certifications?: string[];
  supplierName?: string | null;
  isAvailable?: boolean;
}

export interface CatalogPaperProduct {
  productId: string;
  productName: string;
  brand?: string | null;
  manufacturer?: string | null;
  category: PaperCategory | string;
  finishSummary?: string | null;
  description?: string | null;
  certifications?: string[];
  variants: CatalogPaperVariant[];
}

export interface SelectedPaperMaterial {
  variantId: string;
  productId: string;
  productName: string;
  brand?: string | null;
  category: PaperCategory | string;
  gsm: number;
  finish?: string | null;
  sheetWidthMm?: number;
  sheetHeightMm?: number;
  caliperUm?: number | null;
  certifications?: string[];
  supplierName?: string | null;
  isAvailable?: boolean;

  // Compatibility aliases
  variant_id?: string;
  product_id?: string;
  product_name?: string;
  caliper_um?: number | null;
  availability?: string;
  raw_sheet_format?: string;
  source_catalog?: string;
}

/**
 * The core specification payload for the Book Price Engine.
 * Must match the BPE contract exactly.
 */
export interface BookPricePayload {
  copies: number;
  interior_pages: number;
  cover_pages: number;
  book_size: BookSize;
  orientation: Orientation;
  delivery_country: string;
  total_page_count?: number;
  interior_print: InteriorPrint;
  cover_print: CoverPrint;
  cover_print_rev: number;
  paper_type_interior: PaperTypeInterior;
  paper_weight_interior: number;
  paper_type_cover: PaperTypeCover;
  paper_weight_cover: number;
  paper_type_endpaper: PaperTypeEndpaper;
  paper_weight_endpapers: number;
  pms_interior: number;
  pms_cover: number;
  binding_method: BindingMethod;
  finishing_options: FinishingOption;
  uv_varnish: boolean;
  endpapers: EndpapersOption;
  endpapers_print: EndpapersPrint;
  custom_width?: number;
  custom_height?: number;
  extra_book?: number;
  extra_section?: number;
  extra_fixed?: number;
  extra_variable?: number;
  interior_pdf_url?: string;
  cover_pdf_url?: string;

  // Advanced Paper Catalog selection (Control Plane Paper Hub)
  paper_mode_interior?: 'standard' | 'advanced';
  interior_paper_material?: SelectedPaperMaterial | null;
  paper_mode_cover?: 'standard' | 'advanced';
  cover_paper_material?: SelectedPaperMaterial | null;
  paper_mode_endpaper?: 'standard' | 'advanced';
  endpaper_material?: SelectedPaperMaterial | null;
  customer_paper_preferences?: any;

  // Security / debug
  hp_field?: string;
  submission_token?: string;
  debug?: 1;
}

/**
 * Initial payload used for form defaults and reset.
 */
export interface InitialBookPricePayload extends BookPricePayload {}

export interface BreakdownLine {
  label: string;
  amount: number;
}

export type CostBreakdown = BreakdownLine[];

export type OfferSource =
  | 'BPE_MARKETPLACE_NATIVE'
  | 'BPE_LEGACY'
  | 'APP'
  | 'UNKNOWN'
  | (string & {});

export interface BookPriceOffer {
  id: string;
  offer_id?: string;

  // Marketplace / printhouse identity
  house_id?: string;
  printer_id?: string;
  print_house_id?: string;
  print_house: string;
  print_house_name?: string;

  // Pricing
  total_price: number;
  total_cost: number;
  currency: string;
  margin?: number;
  margin_percent?: number;

  // Delivery
  lead_time_days: number;
  estimated_delivery_time: string;

  // Details
  breakdown: CostBreakdown;

  // Semantics
  checkout_allowed?: boolean;
  recommended?: boolean;
  selected_by_customer?: boolean;

  // Source / status
  source?: OfferSource;
  range?: string;
  message?: string;
  status?: string;

  // Preserve original BPE offer for Control Plane metadata
  raw_offer?: any;

  // v5.3 Phase 4: Signed Offer Sessions
  offer_session_id?: string;
  printer_name?: string;
  signature?: string;
  expires_at?: string;
  raw_offer_snapshot?: any;
}

export interface BookPriceResponse {
  success: boolean;
  ok?: boolean; // v5.3 server-side calculate endpoint uses 'ok'
  offer_session_id?: string;
  expires_at?: string;
  offers: BookPriceOffer[];
  recommended_offer_id?: string | null;
  raw_recommended_offer_id?: string | null;
  message?: string;
  raw_response?: any;
}

// ---- Production Files System (v5.3) ----

export type ProductionFileKind = 'INTERIOR_PDF' | 'COVER_SPINE_BACK_PDF';

export type ProductionFileSourceType = 'UPLOAD' | 'DOWNLOAD_URL';

export type ProductionFileStatus = 
  | 'PENDING'
  | 'SELECTED' 
  | 'LINK_PROVIDED'
  | 'LINK_PENDING_FETCH'
  | 'FETCHING'
  | 'UPLOADING' 
  | 'UPLOADED' 
  | 'UPLOADED_WITH_WARNINGS'
  | 'VALIDATING'
  | 'VALIDATED' 
  | 'REJECTED'
  | 'ERROR'
  | 'MISSING';

export interface ProductionFileMetadata {
  kind: ProductionFileKind;
  role?: string; // v5.3 server-side role (e.g. INTERIOR_PDF)
  source_type: ProductionFileSourceType;
  filename?: string;
  size_bytes?: number;
  mime_type?: string;
  status: ProductionFileStatus;
  checksum?: {
    algorithm: string;
    value: string;
  };
  validation?: {
    pdf_signature_valid: boolean;
    eof_marker_found: boolean;
    warnings: string[];
  };
  storage_url?: string;
  file_id?: string;
  repository_id?: string;
  repository_path?: string;
  download_url?: string;
  download_url_host?: string;
  ingestion_status?: 'NOT_STARTED' | 'QUEUED' | 'FETCHED' | 'FAILED';
  fetched_at?: string;
  validated_at?: string;
  created_at?: string;
  error?: string;
  controlPlaneOrderId?: string;
  controlPlaneFileId?: string;
  controlPlaneRegistration?: {
    ok: boolean;
    orderId?: string;
    role?: string;
    response?: any;
    error?: string;
    statusCode?: number;
  };
}

export interface ProductionFileDraft {
  kind: ProductionFileKind;
  status: ProductionFileStatus;
  source_type?: ProductionFileSourceType;
  file?: File;
  filename?: string;
  size_bytes?: number;
  mime_type?: string;
  download_url?: string;
  download_url_host?: string;
  ingestion_status?: 'NOT_STARTED' | 'QUEUED' | 'FETCHED' | 'FAILED';
  fetched_at?: string;
  checksum?: {
    algorithm: string;
    value: string;
  };
  validation?: {
    pdf_signature_valid: boolean;
    eof_marker_found: boolean;
    warnings: string[];
  };
  file_id?: string;
  storage_url?: string;
  created_at?: string;
  error?: string;
  controlPlaneOrderId?: string;
  controlPlaneFileId?: string;
  controlPlaneRegistration?: {
    ok: boolean;
    orderId?: string;
    role?: string;
    response?: any;
    error?: string;
    statusCode?: number;
  };
}

export interface ProductionFilesState {
  interior_pdf: ProductionFileDraft;
  cover_spine_back_pdf: ProductionFileDraft;
}

export type ProductionFilesWorkflowStatus =
  | 'FILES_PENDING'
  | 'FILES_SELECTED'
  | 'FILES_FETCH_REQUIRED'
  | 'FILES_MIXED_DECLARED'
  | 'FILES_UPLOADING'
  | 'FILES_UPLOADED'
  | 'FILES_UPLOADED_WITH_WARNINGS'
  | 'FILES_VALIDATING'
  | 'FILES_VALIDATED'
  | 'FILES_REJECTED'
  | 'FILES_ERROR';

/**
 * Reusable metadata structure for production files status.
 */
export interface ProductionFilesOrderMetadata {
  required: boolean;
  status: ProductionFilesWorkflowStatus;
  required_files: ProductionFileKind[];
  interior_pdf?: ProductionFileMetadata;
  cover_spine_back_pdf?: ProductionFileMetadata;
  storage_status?: string;
  server_upload_required?: boolean;
  server_fetch_required?: boolean;
  validation_scope?: string;
  invoice_blocked_until?: string;
}

export type PaymentStatus = 
  | 'PENDING' 
  | 'PAID' 
  | 'FAILED' 
  | 'CANCELLED' 
  | 'REFUNDED';

export type InvoiceStatus =
  | 'PENDING_FILES'
  | 'READY_TO_GENERATE'
  | 'GENERATING'
  | 'GENERATED'
  | 'SENT'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'VOID';

export interface InvoicePaymentState {
  invoice_id?: string;
  invoice_url?: string;
  invoice_status: InvoiceStatus;
  payment_status: PaymentStatus;
  payment_method?: string;
  payment_reference?: string;
  currency?: string;
  amount?: number;
  paid_at?: string;
}

export interface CartItem {
  id: string;
  offer_session_id?: string;
  offer_id?: string;
  specs: BookPricePayload;
  offer: BookPriceOffer;
  pricing: {
    total_price: number;
    total_cost: number;
    currency: string;
    margin?: number;
    margin_percent?: number;
  };
  allOffers: BookPriceOffer[];
  recommendedOffer?: BookPriceOffer | null;
  recommendedOfferId?: string | null;
  selectedBy: 'CUSTOMER';
  addedAt?: string;
  metadata?: {
    contract?: 'BPE_MARKETPLACE_NATIVE';
    source?: 'PRINTPRICE_APP' | 'PRINTPRICE_CHAT';
    bpe_endpoint?: string;
    payment_status?: PaymentStatus;
    chat_context?: any;
    ui_context?: any;
    production_files?: ProductionFilesOrderMetadata;
    invoice_payment?: InvoicePaymentState;
    controlPlaneOrderId?: string;
    controlPlaneOrderStatus?: string;
    idempotencyKey?: string;
  };
}

export type ControlPlaneOrderStatus =
  | 'DRAFT'
  | 'QUOTE_ACCEPTED'
  | 'FILES_PENDING'
  | 'FILES_VALIDATED'
  | 'INVOICE_PENDING'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'CANCELLED'
  | 'READY_FOR_PRINTHOUSE'
  | 'PRODUCTION'
  | 'SHIPPED'
  | 'DELIVERED';

// ---- Control Plane Ordering (v5.3 Hardened) ----

export type OrderSource = 'PRINTPRICE_APP' | 'BPE' | 'CHAT' | 'BOOK_CONFIGURATOR';

export interface ControlPlaneCustomer {
  id: string;
  email?: string;
  name?: string;
  role?: 'AUTHOR' | 'PUBLISHER' | 'AGENCY' | 'PRINTHOUSE' | 'UNKNOWN';
  billing?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
}

export interface ControlPlaneOrderPayload {
  source: OrderSource;
  source_ref: string;
  order_ref: string;
  user_id: string;

  customer: ControlPlaneCustomer;

  specs: BookPricePayload;

  pricing: {
    currency: string;
    selected_by: 'CUSTOMER';
    customer_selected_offer_id?: string;
    recommended_offer_id?: string | null;
    total_price: number;
    total_cost?: number;
    margin?: number;
    margin_percent?: number;
  };

  delivery: {
    country: string;
    lead_time_days?: number;
    estimated_delivery_time?: string;
  };

  metadata_json: {
    contract: 'BPE_MARKETPLACE_NATIVE';
    app: 'PrintPricePro_BookPrice';
    bpe_endpoint: '/api/marketplace/offers';
    payment_status: PaymentStatus;
    customer_selected_offer: BookPriceOffer;
    pricing?: any;
    production_files?: any;
    invoice_payment?: any;
  };
  status: ControlPlaneOrderStatus;
}

// ---- Order Intent System (v5.3 Phase 5) ----

export type OrderIntentStatus =
  | 'DRAFT'
  | 'FILES_UPLOADED'
  | 'PREFLIGHT_PENDING'
  | 'PREFLIGHT_VALIDATED'
  | 'PREFLIGHT_FAILED'
  | 'INVOICE_PENDING'
  | 'INVOICE_CREATED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'CONTROL_PLANE_ORDER_CREATED'
  | 'SENT_TO_PRINTHOUSE'
  | 'CANCELLED';

export interface OrderIntentLifecycle {
  quote_status: 'DRAFT' | 'SIGNED' | 'EXPIRED';
  files_status: 'PENDING' | 'UPLOADED' | 'VALIDATED' | 'FAILED';
  preflight_status: 'NOT_STARTED' | 'PENDING' | 'RUNNING' | 'PARTIAL' | 'PASSED' | 'FAILED' | 'ERROR' | 'NOT_CONFIGURED';
  invoice_status: 'NOT_CREATED' | 'CREATED' | 'SENT' | 'CANCELLED' | 'ERROR';
  payment_status: 'NOT_STARTED' | 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'NOT_CONFIGURED';
  control_plane_order_status: 'NOT_CREATED' | 'READY' | 'CREATING' | 'CREATED' | 'FAILED' | 'NOT_CONFIGURED';
  final_order_status: 'NOT_CREATED' | 'SUBMITTED' | 'ACCEPTED' | 'FAILED';
  printhouse_handoff_status: 'NOT_STARTED' | 'READY' | 'QUEUED' | 'SENT' | 'FAILED' | 'DISABLED';
}

// v5.3 Phase 7: Billing & Payment Gate
export interface OrderIntentInvoice {
  invoice_id: string;
  invoice_number: string;
  status: 'NOT_CREATED' | 'CREATED' | 'SENT' | 'CANCELLED' | 'ERROR';
  amount: number;
  currency: string;
  url?: string;
  created_at: string;
  updated_at: string;
  error?: string;
}

export interface OrderIntentPayment {
  provider: 'stripe' | 'bank_transfer' | null;
  status: 'NOT_STARTED' | 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'NOT_CONFIGURED';
  currency?: string;
  checkout_url?: string;
  payment_intent_id?: string;
  bank_transfer_reference?: string;
  instructions?: {
    account_name?: string;
    iban?: string;
    swift?: string;
    amount: number;
    currency: string;
    reference: string;
  };
  created_at: string;
  updated_at: string;
  error?: string;
}

// v5.3 Phase 8: Finalization & Handoff
export interface OrderIntentControlPlane {
  status: 'NOT_CREATED' | 'READY' | 'CREATING' | 'CREATED' | 'FAILED' | 'NOT_CONFIGURED';
  order_ref: string | null;
  order_id: string | null;
  endpoint: string | null;
  response?: any;
  error?: any;
  created_at: string | null;
  updated_at: string | null;
}

export interface OrderIntentPrinthouseHandoff {
  status: 'NOT_READY' | 'READY' | 'QUEUED' | 'SENT' | 'FAILED' | 'DISABLED';
  printhouse_id: string;
  printhouse_name: string;
  package_id?: string;
  files?: Array<{ role: string; file_id: string; checksum: string }>;
  created_at: string;
  updated_at: string;
  error?: string;
}

export interface PreflightJob {
  role: 'INTERIOR_PDF' | 'COVER_PDF';
  file_id: string;
  job_id?: string;
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR' | 'NOT_STARTED';
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_score?: number;
  issue_count?: number;
  critical_count?: number;
  findings?: any[];
  artifacts?: Record<string, string>;
  created_at: string;
  updated_at: string;
  error?: string;
}

export interface OrderIntentPreflight {
  status: 'NOT_STARTED' | 'PENDING' | 'RUNNING' | 'PARTIAL' | 'PASSED' | 'FAILED' | 'ERROR' | 'NOT_CONFIGURED';
  jobs: PreflightJob[];
  started_at?: string;
  completed_at?: string;
  last_checked_at?: string;
}

export interface OrderIntent {
  order_intent_id: string;
  public_ref: string;
  session_id: string;
  cart_id?: string | null;
  user_id?: string | null;
  status: OrderIntentStatus;
  lifecycle: OrderIntentLifecycle;
  offer: {
    offer_session_id: string;
    offer_id: string;
    selected_offer_snapshot: BookPriceOffer;
    signature_validated_at: string;
  };
  production_files: {
    interior_pdf_file_id: string;
    cover_pdf_file_id: string;
    files: Array<{ role: string; file_id: string; filename: string }>;
  };
  preflight?: OrderIntentPreflight;
  customer: {
    email?: string;
    name?: string;
    company?: string;
    country?: string;
    role?: string;
  };
  totals: {
    currency: string;
    total_price: number;
    tax_amount: number;
    shipping_amount: number;
    grand_total: number;
  };
  control_plane?: OrderIntentControlPlane;
  printhouse_handoff?: OrderIntentPrinthouseHandoff;
  dispatch_package_id?: string;
  invoice?: OrderIntentInvoice;
  payment?: OrderIntentPayment;
  payload?: {
    order_snapshot?: any;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
  is_intent?: boolean; // UI helper
}

export interface ControlPlaneOrderResponse {
  ok: boolean;
  orderId: string;
  status: string;
  requiredFiles?: string[];
  readiness?: {
    ready?: boolean;
    blockers?: string[];
    [key: string]: any;
  };
}

export interface CreateControlPlaneOrderRequest {
  pricingSessionId?: string;
  selectedOfferId?: string;
  sessionId?: string;
  customerId?: string;
  tenantId?: string;
  printhouseId?: string;
  currency?: string;
  estimatedPrice?: number;
  customer?: any;
  bookSpec: any;
  selectedOffer: any;
  metadata?: any;
  idempotencyKey?: string;
}

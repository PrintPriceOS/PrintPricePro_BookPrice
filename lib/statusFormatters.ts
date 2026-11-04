/**
 * statusFormatters.ts
 * Centralized formatting helpers for technical backend enums, state codes, and raw status strings.
 * Formats SCREAMING_SNAKE_CASE and raw backend states into clean, professional title-cased English.
 */

const STATUS_DICTIONARY: Record<string, string> = {
  // Configurator / Quotation states
  'WAITING_FOR_INPUT': 'Awaiting Input',
  'WAITING_FOR_SPECS': 'Awaiting Specifications',
  'WAITING_FOR_FILES': 'Awaiting Files',
  'WAITING_FOR_UPLOAD': 'Awaiting Upload',
  'WAITING_FOR_PREFLIGHT': 'Awaiting Preflight',
  'WAITING_FOR_APPROVAL': 'Awaiting Approval',
  'PENDING_CALCULATION': 'Pending Calculation',
  'CALCULATING_PRICE': 'Calculating Offers...',
  'CALCULATING_OFFERS': 'Calculating Offers...',
  'PRECISION_QUOTE_REQUIRED': 'Precision Quote Required',

  // Order & Payment Lifecycle
  'DRAFT': 'Draft',
  'UNFUNDED': 'Unfunded',
  'AWAITING_PAYMENT': 'Awaiting Payment',
  'ISSUED_AWAITING_PAYMENT': 'Issued · Awaiting Payment',
  'AWAITING_WIRE': 'Awaiting Bank Transfer',
  'AWAITING_BANK_TRANSFER': 'Awaiting Bank Transfer',
  'WIRE_PROOF_UPLOADED': 'Wire Receipt Uploaded',
  'PAID': 'Paid & Secured',
  'CONFIRMED': 'Confirmed',
  'FUNDS_LOCKED_ON_PROOF_APPROVAL': 'Escrow Secured',
  'IN_MANUFACTURING_HOLD': 'Manufacturing Hold',
  'RELEASED_ON_SIGNED_POD': 'Released on Delivery',

  // Preflight & Prepress
  'PASSED': 'Passed',
  'FAILED': 'Failed',
  'NOT_STARTED': 'Not Started',
  'NOT STARTED': 'Not Started',
  'PROCESSING': 'Validating...',
  'IN_PREPRESS': 'In Prepress',
  'APPROVED_FOR_PRESS': 'Approved for Press',
  'CORRECTION_REQUESTED': 'Correction Requested',
  'REUPLOAD_REQUIRED': 'Re-upload Required',
  'APPROVED_WITH_WARNINGS': 'Approved with Warnings',
  'PREFLIGHT_REQUIRED': 'Preflight Required',
  'PREFLIGHT_REVIEW_REQUIRED': 'Review Required',
  'CALIPER_VERIFICATION_REQUIRED': 'Caliper Verification Required',
  'PROVISIONAL_ESTIMATE': 'Provisional Estimate',
  'PROVISIONAL_ESTIMATED': 'Provisional Estimate',
  'REQUIRES_TECH_APPROVAL': 'Technical Approval Required',
  'EXPERIMENTAL_DISABLED': 'Under Engineering Review',
  'MATH_VALIDATED_ACTIVE': 'Verified Valid',

  // Manufacturing & Shopfloor Queue
  'QUEUED': 'Queued',
  'REVIEWING': 'Reviewing',
  'ACCEPTED': 'Accepted',
  'REJECTED': 'Rejected',
  'IN_PRODUCTION': 'In Production',
  'BINDING': 'Binding & Finishing',
  'PALLETIZATION': 'Palletization & Packaging',
  'COMPLETED': 'Completed',
  'SHIPPED': 'Shipped',
  'DELIVERED': 'Delivered',
  'CANCELLED': 'Cancelled',
  'CANCELED': 'Cancelled',
  'AWAITING_DISPATCH': 'Awaiting Dispatch',

  // B2B Organization & Members
  'ACTIVE': 'Active',
  'INVITED': 'Invited',
  'SUSPENDED': 'Suspended',
  'ORG_ADMIN': 'Organization Admin',
  'PRODUCTION_MANAGER': 'Production Manager',
  'FINANCE_APPROVER': 'Finance Approver',
  'PREPRESS_DESIGNER': 'Prepress & Layout',

  // System, Auth & Geometry Error Codes
  'TENANT_CONTEXT_REQUIRED': 'Session Required',
  'UNAUTHORIZED': 'Authentication Required',
  'INVALID_BOOK_DIMENSIONS': 'Invalid Dimensions',
  'HARDCOVER_PROFILE_PARAMETERS_REQUIRED': 'Hardcover Setup Required',
  'PROFILE_REQUIRES_PRINTHOUSE_TECH_APPROVAL': 'Technical Approval Required',
  'SPINE_NOT_AVAILABLE': 'Spine Calculation Unavailable',
  'UNSUPPORTED_BINDING': 'No Spine Block Required',
  'NO_SPINE_BLOCK_REQUIRED': 'No Spine Block Required',
  'PRODUCTION_CERTIFIED': 'Production Certified',
  'PRINTHOUSE_TECHNICALLY_VALIDATED': 'Printhouse Validated',
  'MATH_VALIDATED_PENDING_INDUSTRIAL': 'Reference Parity',
  'EXCEL_EXAMPLE_PARITY_ONLY': 'Reference Model Parity',
  'ACTION_REQUIRED': 'Action Required'
};

/**
 * Transforms any technical enum or status string into clean human-readable English.
 * Falls back to Title Case conversion if not found in the explicit dictionary.
 */
export function formatStatusLabel(rawStatus?: string | null): string {
  if (!rawStatus) return '—';

  const trimmed = String(rawStatus).trim();
  const upper = trimmed.toUpperCase();

  if (STATUS_DICTIONARY[upper]) {
    return STATUS_DICTIONARY[upper];
  }

  // Handle strings like "STATUS: WAITING_FOR_INPUT"
  if (upper.startsWith('STATUS:')) {
    const sub = upper.replace(/^STATUS:\s*/, '').trim();
    if (STATUS_DICTIONARY[sub]) {
      return `Status: ${STATUS_DICTIONARY[sub]}`;
    }
  }

  // Generic fallback: convert SNAKE_CASE / kebab-case to Title Case
  return trimmed
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Returns consistent badge color styles for a given status.
 */
export function getStatusBadgeVariant(rawStatus?: string | null): {
  bg: string;
  text: string;
  border: string;
} {
  const upper = String(rawStatus || '').toUpperCase().trim();

  if (
    upper.includes('PASS') ||
    upper.includes('PAID') ||
    upper.includes('CONFIRM') ||
    upper.includes('APPROV') ||
    upper.includes('ACTIVE') ||
    upper.includes('COMPLET') ||
    upper.includes('DELIVER')
  ) {
    return {
      bg: 'bg-emerald-500/10 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-500/30 dark:border-emerald-800/60'
    };
  }

  if (
    upper.includes('FAIL') ||
    upper.includes('REJECT') ||
    upper.includes('CANCEL') ||
    upper.includes('SUSPEND') ||
    upper.includes('ERROR')
  ) {
    return {
      bg: 'bg-red-500/10 dark:bg-red-950/40',
      text: 'text-red-700 dark:text-red-400',
      border: 'border-red-500/30 dark:border-red-800/60'
    };
  }

  if (
    upper.includes('PROD') ||
    upper.includes('PRESS') ||
    upper.includes('BIND') ||
    upper.includes('PALLET') ||
    upper.includes('SHIP')
  ) {
    return {
      bg: 'bg-blue-500/10 dark:bg-blue-950/40',
      text: 'text-blue-700 dark:text-blue-400',
      border: 'border-blue-500/30 dark:border-blue-800/60'
    };
  }

  // Default / Awaiting / Pending
  return {
    bg: 'bg-amber-500/10 dark:bg-amber-950/40',
    text: 'text-amber-800 dark:text-amber-400',
    border: 'border-amber-500/30 dark:border-amber-800/60'
  };
}

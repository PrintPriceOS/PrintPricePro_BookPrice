require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const crypto = require('crypto');
const helmet = require('helmet');
const expressRateLimit = require('express-rate-limit');
const rateLimit = expressRateLimit.rateLimit || expressRateLimit;
const nativeIpKeyGenerator = expressRateLimit.ipKeyGenerator;
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// ---- Persistence & Repositories (v5.3 - Phase 10A Hardening) ----
const repositories = require('./repositories');

// Initialize persistence (ensure schema, etc)
(async () => {
    try {
        await repositories.initialize();

        if (process.env.NODE_ENV === 'production' && repositories.adapter === 'json') {
            console.warn('[CONFIG_WARNING] JSON persistence is not recommended for production. Use PERSISTENCE_ADAPTER=mysql');
        }
    } catch (err) {
        console.error(`[PERSISTENCE_INIT_FAILED] ${err.message}`);
        if (process.env.NODE_ENV === 'production' && process.env.PERSISTENCE_ADAPTER === 'mysql') {
            console.error('[FATAL] MySQL initialization failed in production. Exiting.');
            process.exit(1);
        }
    }
})();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:3001,https://budget.printprice.pro,https://printprice.pro')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

// SECRETS
if (!process.env.SESSION_SECRET || !process.env.SIGNING_SECRET) {
    console.error('[FATAL] SESSION_SECRET and SIGNING_SECRET are required.');
    process.exit(1);
}
const SESSION_SECRET = process.env.SESSION_SECRET;
const SIGNING_SECRET = process.env.SIGNING_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// CONTROL PLANE / BPE CONFIG
const CONTROL_PLANE_BASE_URL = 
    process.env.CONTROL_PLANE_BASE_URL || 
    process.env.CONTROL_PLANE_URL || 
    "http://127.0.0.1:8081";
const CONTROL_PLANE_API_KEY =
    process.env.CONTROL_PLANE_API_KEY ||
    process.env.CONTROL_PLANE_TOKEN ||
    process.env.PPOS_CONTROL_TOKEN ||
    '';

if (process.env.NODE_ENV === 'production' && !CONTROL_PLANE_API_KEY) {
    console.error('[CONFIG_ERROR] CONTROL_PLANE_API_KEY / CONTROL_PLANE_TOKEN / PPOS_CONTROL_TOKEN is required in production.');
}

const IDENTITY_API_URL =
    process.env.CONTROL_PLANE_AUTH_URL ||
    process.env.IDENTITY_API_URL ||
    CONTROL_PLANE_BASE_URL;

const authLoginUrl = `${IDENTITY_API_URL}/api/auth/login`;
const authRegisterUrl = `${IDENTITY_API_URL}/api/auth/register`;

function resolveBpeMarketplaceOffersUrl(rawUrl) {
    const fallbackUrl = "https://bpe.printprice.pro/api/marketplace/offers";
    const candidate = rawUrl || fallbackUrl;
    return candidate.includes("127.0.0.1:8081") ? fallbackUrl : candidate;
}

const RAW_BPE_MARKETPLACE_OFFERS_URL =
    process.env.BPE_MARKETPLACE_OFFERS_URL ||
    `${CONTROL_PLANE_BASE_URL}/api/marketplace/offers`;

const BPE_MARKETPLACE_OFFERS_URL = resolveBpeMarketplaceOffersUrl(RAW_BPE_MARKETPLACE_OFFERS_URL);

console.log("[BPE_MARKETPLACE_OFFERS_URL_SELECTED]", {
    raw: RAW_BPE_MARKETPLACE_OFFERS_URL,
    selected: BPE_MARKETPLACE_OFFERS_URL,
    legacyOverrideDetected: RAW_BPE_MARKETPLACE_OFFERS_URL.includes("127.0.0.1:8081")
});

// BPE JWT Auth configuration
const BPE_JWT_SECRET = process.env.BPE_JWT_SECRET;
const BPE_JWT_ISSUER = process.env.BPE_JWT_ISSUER || 'https://auth.printprice.pro';
const BPE_JWT_AUDIENCE = process.env.BPE_JWT_AUDIENCE || 'ppos:control';
const BPE_SYSTEM_USER_ID = process.env.PPOS_BPE_SYSTEM_USER_ID || 'bpe-system-user';

const buildControlPlaneHeaders = () => {
    if (!BPE_JWT_SECRET) {
        throw new Error('[CONFIG_ERROR] BPE_JWT_SECRET is required');
    }

    const token = jwt.sign(
        { sub: BPE_SYSTEM_USER_ID },
        BPE_JWT_SECRET,
        {
            issuer: BPE_JWT_ISSUER,
            audience: BPE_JWT_AUDIENCE,
            expiresIn: 60
        }
    );

    return {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-source-app": "PrintPricePro_BookPrice"
    };
};

// ---- Production File Storage Configuration (v5.3) ----
const PRODUCTION_FILES_DIR = process.env.PRODUCTION_FILES_DIR || path.join(__dirname, 'storage', 'production-files');
const PRODUCTION_FILES_INDEX = path.join(PRODUCTION_FILES_DIR, 'index.json');
const MAX_FILE_SIZE_MB = parseInt(process.env.PRODUCTION_FILE_MAX_MB || '500', 10);

// ---- Offer Sessions Configuration (v5.3 - Phase 4) ----
const OFFER_SESSIONS_DIR = process.env.OFFER_SESSIONS_DIR || path.join(__dirname, 'storage', 'offer-sessions');
const OFFER_SESSIONS_INDEX = path.join(OFFER_SESSIONS_DIR, 'index.json');
const OFFER_SESSION_TTL_MINUTES = parseInt(process.env.OFFER_SESSION_TTL_MINUTES || '60', 10);
const OFFER_SIGNING_SECRET = process.env.OFFER_SIGNING_SECRET || 'dev_secret_offer_signing_2026';

// ---- Order Intent Configuration (v5.3 - Phase 5) ----
const ORDER_INTENTS_DIR = process.env.ORDER_INTENTS_DIR || path.join(__dirname, 'storage', 'order-intents');
const ORDER_INTENTS_INDEX = path.join(ORDER_INTENTS_DIR, 'index.json');

// ---- Preflight Configuration (v5.3 - Phase 6) ----
const PREFLIGHT_BASE_URL = process.env.PREFLIGHT_BASE_URL || 'http://127.0.0.1:3000';
const PREFLIGHT_API_TOKEN = process.env.PREFLIGHT_API_TOKEN || '';
const PREFLIGHT_ENABLED = process.env.PREFLIGHT_ENABLED === 'true';

console.log(`[PREFLIGHT_CONFIG] enabled=${PREFLIGHT_ENABLED} base_url=${PREFLIGHT_BASE_URL}`);

// ---- Billing & Payments Configuration (v5.3 - Phase 7) ----
const PAYMENTS_ENABLED = process.env.PAYMENTS_ENABLED === 'true';
const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER || 'bank_transfer';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PUBLIC_APP_BASE_URL = process.env.PUBLIC_APP_BASE_URL || 'http://localhost:5173';

// ---- Dispatch Package Configuration (v5.3 - Phase 11) ----
const DISPATCH_PACKAGE_TOKEN_SECRET = process.env.DISPATCH_PACKAGE_TOKEN_SECRET || SIGNING_SECRET;
const DISPATCH_PACKAGE_TTL_HOURS = parseInt(process.env.DISPATCH_PACKAGE_TTL_HOURS || '168', 10);
const CONTROL_PLANE_DISPATCH_PACKAGE_UPDATE_ENABLED = process.env.CONTROL_PLANE_DISPATCH_PACKAGE_UPDATE_ENABLED === 'true';

// ---- Printhouse Production Queue Configuration (v5.3 - Phase 12) ----
const CONTROL_PLANE_PRODUCTION_STATUS_SYNC_ENABLED = process.env.CONTROL_PLANE_PRODUCTION_STATUS_SYNC_ENABLED === 'true';
const CONTROL_PLANE_PRODUCTION_STATUS_ENDPOINT = process.env.CONTROL_PLANE_PRODUCTION_STATUS_ENDPOINT || '/api/admin/orders/:orderRef/status';

// ---- Customer Notification Configuration (v5.3 - Phase 13) ----
const NOTIFICATIONS_ENABLED = process.env.NOTIFICATIONS_ENABLED === 'true';
const NOTIFICATION_PROVIDER = process.env.NOTIFICATION_PROVIDER || 'console'; // 'console' | 'smtp'
const NOTIFICATION_FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL || 'noreply@printpricepro.com';


const SMTP_CONFIG = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    secure: process.env.SMTP_SECURE === 'true'
};

if (process.env.NODE_ENV === 'production' && !process.env.DISPATCH_PACKAGE_TOKEN_SECRET) {
    console.warn('[SECURITY_WARNING] DISPATCH_PACKAGE_TOKEN_SECRET missing. Falling back to SIGNING_SECRET.');
}

const BANK_TRANSFER_ENABLED = process.env.BANK_TRANSFER_ENABLED === 'true';
const BANK_TRANSFER_ACCOUNT_NAME = process.env.BANK_TRANSFER_ACCOUNT_NAME || 'PrintPricePro Marketplace';
const BANK_TRANSFER_IBAN = process.env.BANK_TRANSFER_IBAN || 'ES00 0000 0000 0000 0000 0000';
const BANK_TRANSFER_SWIFT = process.env.BANK_TRANSFER_SWIFT || 'PPOSESMM';
const BANK_TRANSFER_REFERENCE_PREFIX = process.env.BANK_TRANSFER_REFERENCE_PREFIX || 'PPOS';

console.log(`[PAYMENT_CONFIG] enabled=${PAYMENTS_ENABLED} provider=${PAYMENT_PROVIDER}`);

const stripe = (PAYMENTS_ENABLED && PAYMENT_PROVIDER === 'stripe' && STRIPE_SECRET_KEY)
    ? require('stripe')(STRIPE_SECRET_KEY)
    : null;

// ---- Control Plane Handoff Configuration (v5.3 - Phase 8) ----
const CONTROL_PLANE_ORDER_HANDOFF_ENABLED = process.env.CONTROL_PLANE_ORDER_HANDOFF_ENABLED === 'true';
const CONTROL_PLANE_ORDER_ENDPOINT = process.env.CONTROL_PLANE_ORDER_ENDPOINT || '/api/admin/orders';
const AUTO_HANDOFF_TO_PRINTHOUSE = process.env.AUTO_HANDOFF_TO_PRINTHOUSE === 'true';
const AUTO_FINALIZE_AFTER_PAYMENT = process.env.AUTO_FINALIZE_AFTER_PAYMENT === 'true';

console.log(`[HANDOFF_CONFIG] enabled=${CONTROL_PLANE_ORDER_HANDOFF_ENABLED} auto_finalize=${AUTO_FINALIZE_AFTER_PAYMENT}`);

// ---- Production Hardening Configuration (v5.3 - Phase 9) ----
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || '';
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED === 'true';
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60', 10);
const UPLOAD_RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.UPLOAD_RATE_LIMIT_MAX_REQUESTS || '10', 10);
const AUTH_RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '10', 10);

const CLEANUP_ENABLED = process.env.CLEANUP_ENABLED === 'true';
const PRODUCTION_FILE_RETENTION_HOURS = parseInt(process.env.PRODUCTION_FILE_RETENTION_HOURS || '24', 10);
const ORDER_INTENT_RETENTION_DAYS = parseInt(process.env.ORDER_INTENT_RETENTION_DAYS || '30', 10);

const APP_START_TIME = Date.now();

// ---- selected_offer_snapshot Null-Safety Helpers (v5.3 - Phase 37.3 Server Helpers) ----
function getSelectedOfferSnapshotSafe(obj) {
    if (!obj) return null;
    return (
        obj?.offer?.selected_offer_snapshot ||
        obj?.offer?.selectedOfferSnapshot ||
        obj?.selected_offer_snapshot ||
        obj?.selectedOfferSnapshot ||
        obj?.snapshot?.offer?.selected_offer_snapshot ||
        obj?.payload?.order_snapshot?.offer?.selected_offer_snapshot ||
        null
    );
}

function getPrinterIdentitySafe(obj) {
    const snapshot = getSelectedOfferSnapshotSafe(obj);
    return {
        printerId: snapshot?.printer_id || 'unknown-printer',
        printerName: snapshot?.printer_name || 'Unknown Printer',
        specs: snapshot?.specs || {},
        raw_offer_snapshot: snapshot?.raw_offer_snapshot || {}
    };
}

console.log(`[SECURITY_CONFIG] rate_limit=${RATE_LIMIT_ENABLED} cleanup=${CLEANUP_ENABLED} retention_hours=${PRODUCTION_FILE_RETENTION_HOURS}`);

if (process.env.NODE_ENV === 'production' && !ADMIN_API_TOKEN) {
    console.error('[CONFIG_ERROR] ADMIN_API_TOKEN is MANDATORY in production.');
    // In a strict prod, we'd exit(1). Here we follow the hardening guidelines to warn loudly.
}

if (process.env.NODE_ENV === 'production' && (!process.env.OFFER_SIGNING_SECRET || process.env.OFFER_SIGNING_SECRET === 'dev_secret_offer_signing_2026')) {
    console.error('[OFFER_SIGNING_SECRET_MISSING] Mandatory secret missing in production!');
    // In a real prod environment we might exit(1), but here we follow user requirements to log warning.
}

// Ensure storage directories exist (v5.3: Defensive check for production permissions)
const ensureDirSync = (dirPath, required = false) => {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`[STORAGE] Created directory: ${dirPath}`);
        }
    } catch (err) {
        if (required) {
            console.error(`[STORAGE_ERROR] Failed to create REQUIRED directory ${dirPath}: ${err.message}`);
        } else {
            console.warn(`[STORAGE_WARNING] Could not create optional directory ${dirPath}: ${err.message}`);
        }
    }
};

// Always ensure production files directory exists (needed for physical PDF storage)
ensureDirSync(PRODUCTION_FILES_DIR, true);

// Only create JSON registry directories if not using MySQL persistence
if (process.env.PERSISTENCE_ADAPTER !== 'mysql') {
    ensureDirSync(OFFER_SESSIONS_DIR);
    ensureDirSync(ORDER_INTENTS_DIR);
} else {
    console.log('[STORAGE] Skipping JSON registry directory creation (MySQL mode active)');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, PRODUCTION_FILES_DIR);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
        const safeName = `pf_${timestamp}_${random}${ext}`;
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const isPdf = file.mimetype === 'application/pdf' || path.extname(file.originalname).toLowerCase() === '.pdf';
        if (isPdf) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// ADAPTIVE VAULT (In-memory for v5.2 hardening)
const carts = new Map();
const sessionVault = new Map();

// SECURITY MIDDLEWARE
app.use(helmet());
app.use(cookieParser(SESSION_SECRET));
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('CORS_NOT_ALLOWED'));
    },
    credentials: true
}));

app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
        if (req.originalUrl === '/api/payments/stripe/webhook') {
            req.rawBody = buf;
        }
    }
})); // v5.3: Increased limit for rich payloads

// Rate limiting (Phase 9 Hardening)
const createLimiter = (max, windowMs = RATE_LIMIT_WINDOW_MS) => {
    if (!RATE_LIMIT_ENABLED) {
        return (req, res, next) => next();
    }

    const options = {
        windowMs,
        max,
        message: { error: "RATE_LIMITED", message: "Too many requests. Please try again shortly." },
        standardHeaders: true,
        legacyHeaders: false
    };

    if (typeof nativeIpKeyGenerator === 'function') {
        options.keyGenerator = (req) => {
            const sessionId =
                req.signedCookies?.['pp_session_id'] ||
                req.headers['x-session-id'] ||
                req.body?.session_id ||
                req.query?.session_id ||
                'anon';

            return `${nativeIpKeyGenerator(req.ip)}_${sessionId}`;
        };
    }

    return rateLimit(options);
};

const apiLimiter = createLimiter(RATE_LIMIT_MAX_REQUESTS);
const uploadLimiter = createLimiter(UPLOAD_RATE_LIMIT_MAX_REQUESTS);
const authLimiter = createLimiter(AUTH_RATE_LIMIT_MAX_REQUESTS);

app.use('/api/', apiLimiter);
app.use('/api/production-files/upload', uploadLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/budget/calculate', authLimiter); // Protect pricing engine from abuse

// 🔴 UTILS: ADAPTIVE HELPERS
const generateHmac = (data) => {
    return crypto.createHmac('sha256', SIGNING_SECRET).update(JSON.stringify(data)).digest('hex');
};

const getOrCreateSessionId = (req, res) => {
    let sessionId = req.signedCookies['pp_session_id'];
    if (!sessionId) {
        sessionId = crypto.randomBytes(24).toString('hex');
        const isProd = process.env.NODE_ENV === 'production';
        res.cookie('pp_session_id', sessionId, {
            httpOnly: true,
            signed: true,
            secure: isProd,
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        console.log(`[SESSION_CREATED] new_session=${sessionId} ip=${req.ip}`);
    }
    return sessionId;
};

// ---- BUDGET-01: Canonical Paper Preferences Validation & Resolution ----
const CANONICAL_PAPER_CATEGORIES = ['OFFSET', 'COATED', 'CARTON', 'DESIGN', 'DIGITAL', 'OTHER'];
const PAPER_ID_REGEX = /^[a-zA-Z0-9_-]{1,100}$/;

/**
 * Validates and sanitizes a single paper section preference (interior, cover, endpaper).
 * - Validates allowed fields, data types, string lengths, and ID patterns.
 * - Forces status and availability to CUSTOMER_PREFERENCE_PENDING_CONFIRMATION on the server.
 * Returns sanitized object, or null if invalid.
 */
function sanitizePaperSectionPreference(sectionPref) {
    if (!sectionPref || typeof sectionPref !== 'object' || Array.isArray(sectionPref)) {
        return null;
    }

    const productId = sectionPref.productId || sectionPref.product_id;
    const variantId = sectionPref.variantId || sectionPref.variant_id;
    const productName = sectionPref.productName || sectionPref.product_name;

    if (typeof productId !== 'string' || !PAPER_ID_REGEX.test(productId)) {
        return null;
    }
    if (typeof variantId !== 'string' || !PAPER_ID_REGEX.test(variantId)) {
        return null;
    }
    if (typeof productName !== 'string' || productName.trim().length === 0 || productName.length > 150) {
        return null;
    }

    const gsmNum = Number(sectionPref.gsm);
    if (!Number.isInteger(gsmNum) || gsmNum < 30 || gsmNum > 1000) {
        return null;
    }

    const rawCategory = typeof sectionPref.category === 'string' ? sectionPref.category.toUpperCase().trim() : 'OTHER';
    const category = CANONICAL_PAPER_CATEGORIES.includes(rawCategory) ? rawCategory : 'OTHER';

    const brand = typeof sectionPref.brand === 'string' && sectionPref.brand.trim().length > 0 && sectionPref.brand.length <= 100
        ? sectionPref.brand.trim()
        : null;

    const finish = typeof sectionPref.finish === 'string' && sectionPref.finish.trim().length > 0 && sectionPref.finish.length <= 100
        ? sectionPref.finish.trim()
        : null;

    const rawSheet = sectionPref.rawSheetFormat || sectionPref.raw_sheet_format || sectionPref.sheetFormat || sectionPref.sheet_format;
    const rawSheetFormat = typeof rawSheet === 'string' && rawSheet.trim().length > 0 && rawSheet.length <= 100
        ? rawSheet.trim()
        : null;

    return {
        productId,
        variantId,
        productName: productName.trim(),
        brand,
        category,
        gsm: gsmNum,
        finish,
        rawSheetFormat,
        // Server-governed: stock is strictly subject to printhouse confirmation
        availability: 'CUSTOMER_PREFERENCE_PENDING_CONFIRMATION',
        status: 'CUSTOMER_PREFERENCE_PENDING_CONFIRMATION'
    };
}

/**
 * Resolves updated customer paper preferences against existing baseline preferences.
 * Adheres strictly to the 3-state protocol:
 * 1. Campo omitido (undefined): conservar preferencia anterior.
 * 2. Null explícito (null): eliminar preferencia (retorna null).
 * 3. Objeto válido: sustituir secciones o eliminar secciones si son null.
 */
function resolveCustomerPaperPreferences(incoming, previous) {
    // 1. Campo omitido (undefined): conservar preferencia anterior
    if (incoming === undefined) {
        return previous !== undefined ? previous : null;
    }

    // 2. Null explícito: eliminar preferencia por completo
    if (incoming === null) {
        return null;
    }

    // Si viene un valor no válido (ej. string, boolean o array), conservar anterior o null
    if (typeof incoming !== 'object' || Array.isArray(incoming)) {
        return previous || null;
    }

    const prev = (previous && typeof previous === 'object') ? previous : {};
    const result = {};
    const sections = ['interior', 'cover', 'endpaper'];

    for (const sec of sections) {
        if (incoming[sec] === undefined) {
            // Omitido: conservar valor previo
            if (prev[sec]) {
                result[sec] = prev[sec];
            }
        } else if (incoming[sec] === null) {
            // Null explícito para la sección: eliminar sección
        } else {
            // Objeto para la sección: validar y sustituir
            const sanitized = sanitizePaperSectionPreference(incoming[sec]);
            if (sanitized) {
                result[sec] = sanitized;
            }
        }
    }

    return Object.keys(result).length > 0 ? result : null;
}

/**
 * Resolves the authenticated or anonymous identity of the requester.
 * (v5.3 - Phase 9 Hardening)
 */
const resolveRequestIdentity = (req) => {
    const sessionId = req.signedCookies['pp_session_id'];

    // In a real app, we would verify JWT from Authorization header here
    const authHeader = req.headers.authorization;
    let authenticatedUser = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        // TODO: Full JWT verification against Control Plane / Identity service
        // For now, we trust the session cookie for anonymous or use session vault for local auth
    }

    return {
        sessionId,
        user: authenticatedUser,
        isAdmin: authHeader === `Bearer ${ADMIN_API_TOKEN}` && ADMIN_API_TOKEN.length > 0
    };
};

/**
 * Enforces ownership and access control for Order Intents.
 */
const assertOrderIntentAccess = (req, intent) => {
    if (!intent) return false;
    const identity = resolveRequestIdentity(req);

    if (identity.isAdmin) return true;

    // Anonymous ownership check
    if (intent.session_id === identity.sessionId) {
        console.log(`[ACCESS_GRANTED] intent=${intent.order_intent_id} type=anonymous_session`);
        return true;
    }

    // Authenticated ownership check (if user_id present)
    if (identity.user && String(intent.user_id) === String(identity.user.id)) {
        console.log(`[ACCESS_GRANTED] intent=${intent.order_intent_id} type=authenticated_user`);
        return true;
    }

    console.warn(`[ACCESS_DENIED] intent=${intent.order_intent_id} session=${identity.sessionId} ip=${req.ip}`);
    return false;
};

/**
 * Enforces ownership and access control for Production Files.
 */
const assertProductionFileAccess = async (req, file) => {
    if (!file) return false;
    const identity = resolveRequestIdentity(req);

    if (identity.isAdmin) return true;

    // Check associations
    const associations = file.associations || {};
    if (associations.session_id === identity.sessionId) {
        return true;
    }

    // If linked to an intent, check intent access
    if (associations.order_intent_id) {
        const intent = await repositories.orderIntents.getById(associations.order_intent_id);
        if (assertOrderIntentAccess(req, intent)) return true;
    }

    console.warn(`[ACCESS_DENIED] file=${file.file_id} session=${identity.sessionId} ip=${req.ip}`);
    return false;
};

/**
 * Protects administrative endpoints.
 */
const adminOnly = (req, res, next) => {
    const identity = resolveRequestIdentity(req);
    if (!identity.isAdmin) {
        console.warn(`[ADMIN_ACTION_REJECTED] ip=${req.ip} auth_header=${!!req.headers.authorization}`);
        return res.status(401).json({ ok: false, error: "UNAUTHORIZED_ADMIN_ACTION" });
    }
    console.log(`[ADMIN_ACTION_ACCEPTED] ip=${req.ip}`);
    next();
};

/**
 * Signs a dispatch package access token.
 */
const signDispatchToken = (packageId, intentId, printhouseId, expiresAt) => {
    const payload = JSON.stringify({ packageId, intentId, printhouseId, expiresAt });
    const hmac = crypto.createHmac('sha256', DISPATCH_PACKAGE_TOKEN_SECRET);
    hmac.update(payload);
    const signature = hmac.digest('hex');
    return Buffer.from(JSON.stringify({ p: payload, s: signature })).toString('base64');
};

/**
 * Verifies a dispatch package access token.
 */
const verifyDispatchToken = (token) => {
    try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
        const { p: payload, s: signature } = decoded;

        const hmac = crypto.createHmac('sha256', DISPATCH_PACKAGE_TOKEN_SECRET);
        hmac.update(payload);
        if (hmac.digest('hex') !== signature) return null;

        const data = JSON.parse(payload);
        if (new Date(data.expiresAt) < new Date()) {
            console.warn(`[DISPATCH_TOKEN_EXPIRED] package=${data.packageId} expired_at=${data.expiresAt}`);
            return null;
        }
        return data;
    } catch (err) {
        console.warn(`[DISPATCH_TOKEN_INVALID] error=${err.message}`);
        return null;
    }
};

/**
 * Validates dispatch package access from request.
 */
const assertDispatchPackageAccess = async (req, pkg) => {
    if (!pkg) return false;

    // 1. Admin/Operator bypass
    const identity = resolveRequestIdentity(req);
    if (identity.isAdmin) return true;

    // 2. Token access
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const verified = verifyDispatchToken(token);
        if (verified && verified.packageId === pkg.package_id) {
            return true;
        }
    }

    // 3. Status check
    if (pkg.status === 'REVOKED' || pkg.status === 'EXPIRED') {
        return false;
    }

    return false;
};

const validateUrlAgainstSsrf = (urlString) => {
    if (!urlString) return false;
    try {
        const url = new URL(urlString);
        if (url.protocol !== 'https:') return false;

        const hostname = url.hostname.toLowerCase();

        // 1. Reject localhost and loopback
        const localHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
        if (localHosts.includes(hostname)) return false;

        // 2. Reject private IPv4 ranges
        // 10.x.x.x
        if (hostname.startsWith('10.')) return false;
        // 172.16.x.x - 172.31.x.x
        if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return false;
        // 192.168.x.x
        if (hostname.startsWith('192.168.')) return false;

        // 3. Reject link-local (169.254.x.x)
        if (hostname.startsWith('169.254.')) return false;

        // 4. Reject .local hosts
        if (hostname.endsWith('.local')) return false;

        return true;
    } catch (e) {
        return false;
    }
};

// ---- Production File Helpers (v5.3) ----

const isServerBackedProductionFile = (file) => {
    return Boolean(
        ['UPLOADED', 'VALIDATED'].includes(file?.status) &&
        file?.filename &&
        Number(file?.size_bytes) > 0 &&
        file?.file_id &&
        file?.storage_url
    );
};

const isServerWarningProductionFile = (file) => {
    return file?.status === 'UPLOADED_WITH_WARNINGS';
};

const isClientDeclaredProductionFile = (file) => {
    // v5.3: SELECTED is no longer enough for checkout
    return Boolean(
        file?.status === 'SELECTED' &&
        file?.filename &&
        Number(file?.size_bytes) > 0
    );
};

const isExternalLinkDeclared = (file) => {
    return Boolean(
        file?.source_type === 'DOWNLOAD_URL' &&
        ['LINK_PROVIDED', 'LINK_PENDING_FETCH'].includes(file?.status) &&
        validateUrlAgainstSsrf(file?.download_url)
    );
};

const hasRequiredProductionFiles = (productionFiles) => {
    const interior = productionFiles?.interior_pdf;
    const cover = productionFiles?.cover_spine_back_pdf;

    // v5.3: Checkout requires UPLOADED or VALIDATED.
    // status SELECTED is REJECTED.
    // status UPLOADED_WITH_WARNINGS is BLOCKED in Phase 2.
    const isInteriorValid = isServerBackedProductionFile(interior) && !isServerWarningProductionFile(interior) ||
        isExternalLinkDeclared(interior);

    const isCoverValid = isServerBackedProductionFile(cover) && !isServerWarningProductionFile(cover) ||
        isExternalLinkDeclared(cover);

    return Boolean(
        productionFiles?.required === true &&
        Array.isArray(productionFiles?.required_files) &&
        productionFiles.required_files.includes('INTERIOR_PDF') &&
        productionFiles.required_files.includes('COVER_SPINE_BACK_PDF') &&
        isInteriorValid &&
        isCoverValid
    );
};

const normalizeProductionFilesWorkflowStatus = (productionFiles) => {
    const interiorStatus = productionFiles?.interior_pdf?.status;
    const coverStatus = productionFiles?.cover_spine_back_pdf?.status;
    const interiorSource = productionFiles?.interior_pdf?.source_type;
    const coverSource = productionFiles?.cover_spine_back_pdf?.source_type;

    if (interiorStatus === 'VALIDATED' && coverStatus === 'VALIDATED') {
        return 'FILES_VALIDATED';
    }

    if (
        interiorStatus === 'ERROR' ||
        coverStatus === 'ERROR' ||
        interiorStatus === 'REJECTED' ||
        coverStatus === 'REJECTED'
    ) {
        return 'FILES_REJECTED';
    }

    const hasDownloadUrl = interiorSource === 'DOWNLOAD_URL' || coverSource === 'DOWNLOAD_URL';
    const hasUpload = interiorSource === 'UPLOAD' || coverSource === 'UPLOAD';

    if (hasDownloadUrl && hasUpload) {
        return 'FILES_MIXED_DECLARED';
    }

    if (hasDownloadUrl) {
        return 'FILES_FETCH_REQUIRED';
    }

    return 'FILES_SELECTED';
};

const enrichProductionFilesMetadata = (productionFiles) => {
    const interior = productionFiles?.interior_pdf;
    const cover = productionFiles?.cover_spine_back_pdf;

    const hasAnyLink = interior?.source_type === 'DOWNLOAD_URL' || cover?.source_type === 'DOWNLOAD_URL';
    const hasAnyUpload = interior?.source_type === 'UPLOAD' || cover?.source_type === 'UPLOAD';

    let storageStatus = 'CLIENT_DECLARED_ONLY';
    if (hasAnyLink && hasAnyUpload) {
        storageStatus = 'MIXED_CLIENT_DECLARED';
    } else if (hasAnyLink) {
        storageStatus = 'EXTERNAL_LINK_DECLARED';
    }

    return {
        required: true,
        status: normalizeProductionFilesWorkflowStatus(productionFiles),
        required_files: ['INTERIOR_PDF', 'COVER_SPINE_BACK_PDF'],
        interior_pdf: interior,
        cover_spine_back_pdf: cover,
        storage_status: storageStatus,
        server_upload_required: hasAnyUpload,
        server_fetch_required: hasAnyLink,
        validation_scope: 'CLIENT_DECLARED_ONLY',
        invoice_blocked_until: 'FILES_INGESTED_AND_VALIDATED'
    };
};

const mapProductionFilesToOrderStatus = (productionFiles) => {
    const workflowStatus = normalizeProductionFilesWorkflowStatus(productionFiles);
    if (workflowStatus === 'FILES_VALIDATED') return 'FILES_VALIDATED';
    return 'FILES_PENDING';
};

// ---- Offer Session Signing Helpers (v5.3 - Phase 4 Business Logic) ----

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }

  return '{' + Object.keys(value)
    .sort()
    .map((key) => JSON.stringify(key) + ':' + stableStringify(value[key]))
    .join(',') + '}';
}

function stableHash(value) {
  return crypto
    .createHash('sha256')
    .update(stableStringify(value || {}))
    .digest('hex');
}

function normalizeSignatureDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();

  const s = String(value);

  // already ISO-like
  if (s.includes('T') && s.endsWith('Z')) return s;

  // MySQL DATETIME fallback: "YYYY-MM-DD HH:mm:ss"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    return new Date(s.replace(' ', 'T') + 'Z').toISOString();
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();

  return s;
}

function normalizeMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function buildOfferSignaturePayload(payload) {
  const specs =
    payload.specs ||
    payload.normalized_specs ||
    payload.normalizedSpecs ||
    {};

  const specsHash =
    payload.specs_hash ||
    payload.specsHash ||
    stableHash(specs);

  return {
    offer_session_id: String(payload.offer_session_id || payload.offerSessionId || ''),
    offer_id: String(payload.offer_id || payload.id || ''),
    printer_id: String(payload.printer_id || payload.printerId || payload.print_house_id || payload.printHouseId || ''),
    total_price: normalizeMoney(payload.total_price ?? payload.price ?? payload.total ?? 0),
    currency: String(payload.currency || 'EUR'),
    expires_at: normalizeSignatureDate(payload.expires_at),
    specs_hash: String(specsHash || '')
  };
}

function signOfferPayload(payload) {
  const canonicalPayload = buildOfferSignaturePayload(payload);
  const baseString = JSON.stringify(canonicalPayload);
  return crypto
    .createHmac('sha256', OFFER_SIGNING_SECRET)
    .update(baseString)
    .digest('hex');
}

function verifyOfferSignature(payload, signature) {
  if (!signature) return false;

  const expected = signOfferPayload(payload);

  try {
    const a = Buffer.from(String(expected), 'hex');
    const b = Buffer.from(String(signature), 'hex');

    if (a.length !== b.length) {
      return false;
    }

    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    return expected === signature;
  }
}

const isOfferSessionExpired = (session) => {
    if (!session || !session.expires_at) return true;
    const expired = new Date() > new Date(session.expires_at);
    if (expired) console.warn(`[OFFER_SESSION_EXPIRED] offer_session_id=${session.offer_session_id}`);
    return expired;
};

const getOfferFromSession = async (offer_session_id, offer_id) => {
    const session = await repositories.offerSessions.getById(offer_session_id);
    if (!session) {
        console.warn(`[OFFER_RESOLVE_FAILED] session_not_found id=${offer_session_id}`);
        return null;
    }
    
    if (isOfferSessionExpired(session)) {
        console.warn(`[OFFER_RESOLVE_FAILED] session_expired id=${offer_session_id} expires_at=${session.expires_at}`);
        return null;
    }

    const offer = session.offers.find(o => String(o.offer_id || o.id) === String(offer_id));
    if (!offer) {
        console.warn(`[OFFER_RESOLVE_FAILED] offer_not_in_session offer_id=${offer_id} session_id=${offer_session_id} available=${session.offers?.map(o => o.offer_id || o.id).join(',')}`);
        return null;
    }

    // Verify internal integrity of the registry record
    const verificationPayload = {
      ...offer,
      offer_session_id: offer.offer_session_id || session.offer_session_id,
      offer_id: offer.offer_id || offer.id || offer_id,
      printer_id: offer.printer_id || offer.printerId || offer.print_house_id || offer.printHouseId,
      total_price: offer.total_price ?? offer.price ?? offer.total,
      currency: offer.currency || 'EUR',
      expires_at: offer.expires_at || session.expires_at,
      specs: offer.specs || session.normalized_specs || session.specs || {},
      specs_hash: offer.specs_hash || stableHash(offer.specs || session.normalized_specs || session.specs || {})
    };

    if (!verifyOfferSignature(verificationPayload, offer.signature)) {
        console.error('[OFFER_RESOLVE_FAILED] INVALID_SIGNATURE', {
          offer_session_id,
          offer_id,
          available_offer_ids: session.offers?.map(o => o.offer_id || o.id),
          canonical_payload: buildOfferSignaturePayload(verificationPayload),
          received_signature_prefix: String(offer.signature || '').slice(0, 12),
          expected_signature_prefix: String(signOfferPayload(verificationPayload) || '').slice(0, 12),
          has_offer_specs: Boolean(offer.specs),
          has_offer_specs_hash: Boolean(offer.specs_hash),
          has_session_normalized_specs: Boolean(session.normalized_specs),
          offer_expires_at: offer.expires_at,
          session_expires_at: session.expires_at
        });
        return null;
    }

    return offer;
};

// 🔐 SECURITY: Challenge Context
app.post('/api/security/challenge', async (req, res) => {
    const context = req.body?.payload_context || req.body?.context;

    if (!context) {
        return res.status(400).json({ error: "Challenge payload_context required." });
    }

    const sessionId = getOrCreateSessionId(req, res);

    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const token = crypto
        .createHmac('sha256', SIGNING_SECRET)
        .update(`${sessionId}${nonce}${timestamp}${context}`)
        .digest('hex');

    res.json({ success: true, token, nonce, timestamp });
});

// ---- Production File Validation Helpers (v5.3 - Phase 2) ----

const validatePdfSignature = (filePath) => {
    try {
        const buffer = Buffer.alloc(5);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, 5, 0);
        fs.closeSync(fd);
        return buffer.toString() === '%PDF-';
    } catch (err) {
        console.error(`[VALIDATION_ERROR] Failed to read PDF signature: ${err.message}`);
        return false;
    }
};

const checkPdfEof = (filePath) => {
    try {
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;
        if (fileSize === 0) return false;

        const readSize = Math.min(fileSize, 4096);
        const buffer = Buffer.alloc(readSize);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, readSize, fileSize - readSize);
        fs.closeSync(fd);

        return buffer.toString().includes('%%EOF');
    } catch (err) {
        console.error(`[VALIDATION_ERROR] Failed to check PDF EOF: ${err.message}`);
        return false;
    }
};

const computeSha256 = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', err => reject(err));
    });
};

const performHardenedPDFValidation = async (filePath, role) => {
    if (!fs.existsSync(filePath)) {
        return { ok: false, error: 'UPLOAD_FILE_MISSING' };
    }

    const stats = fs.statSync(filePath);
    if (!stats.size) {
        return { ok: false, error: 'EMPTY_FILE' };
    }

    if (!validatePdfSignature(filePath)) {
        return { ok: false, error: 'INVALID_PDF_SIGNATURE' };
    }

    const eofMarkerFound = checkPdfEof(filePath);
    const checksum = await computeSha256(filePath);
    const warnings = eofMarkerFound ? [] : ['PDF_EOF_MARKER_NOT_FOUND'];

    return {
        ok: true,
        role,
        warnings,
        forensics: {
            checksum,
            pdf_signature_valid: true,
            eof_marker_found: eofMarkerFound
        }
    };
};

const buildCanonicalOrderSnapshot = (orderIntent, session, resolvedOffer, interior, cover) => {
    const specs = session.normalized_specs || session.input_specs || resolvedOffer.specs || {};
    
    // Defensive normalization
    const normalizeNum = (v, fallback = 0) => {
        const n = Number(v);
        return isNaN(n) ? fallback : n;
    };

    // Canonical customer paper preferences: orderIntent already holds the authoritative resolved preference.
    // Fall back to resolving raw specs ONLY if orderIntent.customer_paper_preferences is undefined.
    const canonicalPaperPreferences = orderIntent.customer_paper_preferences !== undefined
        ? orderIntent.customer_paper_preferences
        : resolveCustomerPaperPreferences(specs.customer_paper_preferences, session.normalized_specs?.customer_paper_preferences);

    const snapshot = {
        order_intent_id: orderIntent.order_intent_id,
        public_ref: orderIntent.public_ref,
        status: orderIntent.status,
        created_at: orderIntent.created_at,

        offer: {
            offer_session_id: orderIntent.offer.offer_session_id,
            offer_id: orderIntent.offer.offer_id,
            signature: resolvedOffer.signature || null,
            printer_id: resolvedOffer.printer_id || null,
            printer_name: resolvedOffer.printer_name || resolvedOffer.print_house || 'Unknown Printer',
            print_house_id: resolvedOffer.print_house_id || resolvedOffer.printer_id || null,
            print_house_name: resolvedOffer.print_house_name || resolvedOffer.print_house || 'Unknown Print House',
            production_site: resolvedOffer.production_site || resolvedOffer.production_location || null,
            currency: resolvedOffer.currency,
            total_price: resolvedOffer.total_price,
            subtotal: resolvedOffer.pricing_breakdown?.subtotal || resolvedOffer.total_price,
            shipping: resolvedOffer.pricing_breakdown?.shipping || 0,
            tax: resolvedOffer.pricing_breakdown?.tax || 0,
            expires_at: session.expires_at
        },

        specs: {
            copies: normalizeNum(specs.copies),
            interior_pages: normalizeNum(specs.interior_pages),
            cover_pages: normalizeNum(specs.cover_pages, 4),
            total_pages: normalizeNum(specs.total_page_count || specs.interior_pages || 0) + normalizeNum(specs.cover_pages, 4),
            book_size: specs.book_size || 'Custom',
            format: specs.book_size || specs.format || 'Custom',
            orientation: specs.orientation || 'portrait',
            binding_method: specs.binding_method || 'N/A',
            interior_print: specs.interior_print || '1/1',
            cover_print: specs.cover_print || '4/0',
            paper_type_interior: specs.paper_type_interior || 'offset',
            paper_weight_interior: normalizeNum(specs.paper_weight_interior),
            paper_type_cover: specs.paper_type_cover || 'mc',
            paper_weight_cover: normalizeNum(specs.paper_weight_cover),
            finishing_options: specs.finishing_options || '',
            delivery_country: specs.delivery_country || '',
            customer_paper_preferences: canonicalPaperPreferences
        },

        customer_paper_preferences: canonicalPaperPreferences,

        production_files: {
            interior_pdf_file_id: interior.file_id,
            cover_pdf_file_id: cover.file_id,
            interior_pdf_status: interior.status,
            cover_pdf_status: cover.status,
            interior_pdf_filename: interior.filename,
            cover_pdf_filename: cover.filename
        },

        lifecycle: {
            marketplace: "SIGNED",
            files: "UPLOADED",
            preflight: "NOT_STARTED",
            payment: "NOT_STARTED",
            handoff: "NOT_READY"
        },

        preflight: {
            enabled: PREFLIGHT_ENABLED,
            mode: PREFLIGHT_ENABLED ? "external" : "disabled",
            status: "NOT_STARTED",
            blocking_payment: true,
            jobs: []
        },

        payment: {
            enabled: PAYMENTS_ENABLED,
            provider: PAYMENT_PROVIDER,
            status: "NOT_STARTED",
            invoice_status: "NOT_CREATED"
        },

        control_plane: {
            handoff_ready: false,
            handoff_status: "PENDING_PREFLIGHT_AND_PAYMENT",
            target: process.env.CONTROL_PLANE_URL || "control.printprice.pro",
            payload_version: "budget-order-intent-v1"
        }
    };

    console.log(`[ORDER_INTENT_SNAPSHOT_BUILT] id=${snapshot.order_intent_id} ref=${snapshot.public_ref} copies=${snapshot.specs.copies} pages=${snapshot.specs.total_pages} printer=${snapshot.offer.printer_name}`);
    return snapshot;
};

const buildControlPlaneHandoffPayload = (orderIntent) => {
    return {
        version: "budget-order-intent-v1",
        source: "budget.printprice.pro",
        order_intent_id: orderIntent.order_intent_id,
        public_ref: orderIntent.public_ref,
        status: orderIntent.status,
        lifecycle: orderIntent.lifecycle,
        offer: orderIntent.offer,
        specs: orderIntent.payload?.order_snapshot?.specs || {},
        customer_paper_preferences: orderIntent.customer_paper_preferences !== undefined
            ? orderIntent.customer_paper_preferences
            : (orderIntent.payload?.order_snapshot?.customer_paper_preferences ?? null),
        production_files: orderIntent.production_files,
        customer: orderIntent.customer,
        totals: orderIntent.totals,
        preflight: orderIntent.preflight,
        payment: orderIntent.payment,
        created_at: orderIntent.created_at
    };
};

/**
 * Registers an uploaded production file with the ControlPlane marketplace order.
 * (v5.3 - Phase 36.3 Hardening)
 */
async function registerProductionFileWithControlPlane(controlPlaneOrderId, record) {
    if (!controlPlaneOrderId) {
        return null;
    }

    const mappedRole = record.role === 'COVER_SPINE_BACK_PDF' ? 'COVER_PDF' : record.role;

    if (!process.env.PPOS_MARKETPLACE_INTAKE_TOKEN) {
        console.warn(`[CONTROL_PLANE_FILE_REGISTER_WARN] PPOS_MARKETPLACE_INTAKE_TOKEN is missing`);
        return {
            ok: false,
            orderId: controlPlaneOrderId,
            role: mappedRole,
            error: "PPOS_MARKETPLACE_INTAKE_TOKEN is missing",
            statusCode: null
        };
    }

    const registerUrl = `${CONTROL_PLANE_BASE_URL}/api/marketplace/orders/${controlPlaneOrderId}/files/register`;
    const registerPayload = {
        role: mappedRole,
        originalName: record.filename,
        mimeType: record.mime_type,
        sizeBytes: record.size_bytes,
        checksumSha256: record.checksum?.value,
        storagePath: `/api/production-files/download/${record.file_id}`,
        metadata: {
            source: "bpe-marketplace-app",
            phase: "36.3",
            localFileId: record.file_id,
            storageProvider: record.storage?.provider,
            storageKey: record.storage?.key,
            uploadWarnings: record.validation?.warnings || [],
            sessionId: record.associations?.session_id || null,
            cartId: record.associations?.cart_id || null
        }
    };

    try {
        console.log(`[CONTROL_PLANE_FILE_REGISTER_START] URL=${registerUrl} role=${mappedRole}`);
        const cpRes = await axios.post(registerUrl, registerPayload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Marketplace-Token': process.env.PPOS_MARKETPLACE_INTAKE_TOKEN
            },
            timeout: 10000
        });

        if (cpRes.status >= 200 && cpRes.status < 300) {
            const registeredFileId =
                cpRes.data?.fileId ||
                cpRes.data?.file?.fileId ||
                cpRes.data?.file?.file_id ||
                cpRes.data?.id ||
                null;

            console.log(`[CONTROL_PLANE_FILE_REGISTER_SUCCESS] cpFileId=${registeredFileId}`);
            return {
                ok: true,
                orderId: controlPlaneOrderId,
                role: mappedRole,
                fileId: registeredFileId,
                response: cpRes.data
            };
        } else {
            throw new Error(`Non-2xx status: ${cpRes.status}`);
        }
    } catch (cpErr) {
        console.error(`[CONTROL_PLANE_FILE_REGISTER_ERROR] orderId=${controlPlaneOrderId}: ${cpErr.message}`);
        return {
            ok: false,
            orderId: controlPlaneOrderId,
            role: mappedRole,
            error: cpErr.message,
            statusCode: cpErr.response?.status || null
        };
    }
}

// 🚀 PRODUCTION FILES: Upload Endpoint (v5.3 - Phase 3)
app.post('/api/production-files/upload', async (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            console.error("[PRODUCTION_FILE_UPLOAD_REJECTED]", {
                reason: err.code,
                message: err.message,
                body_keys: Object.keys(req.body || {}),
                has_file: Boolean(req.file),
                file: req.file ? {
                    fieldname: req.file.fieldname,
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size
                } : null
            });

            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    error: "FILE_TOO_LARGE",
                    reason: "LIMIT_FILE_SIZE",
                    message: `File too large. Max size is ${MAX_FILE_SIZE_MB}MB.`
                });
            }

            return res.status(400).json({
                error: "UPLOAD_ERROR",
                reason: err.code || "MULTER_ERROR",
                message: err.message
            });
        } else if (err) {
            console.error("[PRODUCTION_FILE_UPLOAD_REJECTED]", {
                reason: "FILE_FILTER_REJECTED",
                message: err.message,
                body_keys: Object.keys(req.body || {}),
                has_file: Boolean(req.file),
                file: req.file ? {
                    fieldname: req.file.fieldname,
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size
                } : null
            });

            return res.status(400).json({
                error: "INVALID_FILE",
                reason: "FILE_FILTER_REJECTED",
                message: err.message
            });
        }

        const hasControlPlaneOrderId = Boolean(
            req.body?.control_plane_order_id || 
            req.body?.marketplace_order_id || 
            req.body?.controlPlaneOrderId || 
            req.body?.marketplaceOrderId
        );

        console.log("[PRODUCTION_FILE_UPLOAD_DEBUG]", {
            has_file: Boolean(req.file),
            file: req.file ? {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : null,
            body_keys: Object.keys(req.body || {}),
            hasControlPlaneOrderId
        });

        if (!req.file) {
            return res.status(400).json({ error: "EMPTY_FILE", message: "No file uploaded or file is empty." });
        }

        const filePath = req.file.path;

        // 0. Hygiene check
        if (!fs.existsSync(filePath)) {
            return res.status(400).json({ error: "UPLOAD_FILE_MISSING", message: "File was not found on server after upload." });
        }

        const { role, cart_id, session_id, order_intent_id, user_id } = req.body;
        const controlPlaneOrderId = req.body.control_plane_order_id || 
                                    req.body.marketplace_order_id || 
                                    req.body.controlPlaneOrderId || 
                                    req.body.marketplaceOrderId || 
                                    null;
        const identity = resolveRequestIdentity(req);
        if (!['INTERIOR_PDF', 'COVER_PDF', 'COVER_SPINE_BACK_PDF'].includes(role)) {
            console.error("[PRODUCTION_FILE_UPLOAD_REJECTED]", {
                reason: "INVALID_ROLE",
                received_role: role,
                body_keys: Object.keys(req.body || {}),
                has_file: Boolean(req.file),
                file: req.file ? {
                    fieldname: req.file.fieldname,
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size
                } : null
            });

            fs.unlinkSync(filePath);
            return res.status(400).json({
                error: "INVALID_ROLE",
                reason: "INVALID_ROLE",
                message: "Invalid role. Must be INTERIOR_PDF, COVER_PDF, or COVER_SPINE_BACK_PDF."
            });
        }

        try {
            // 1. Magic-Byte Validation
            const hasValidSignature = validatePdfSignature(filePath);
            if (!hasValidSignature) {
                console.warn(`[UPLOAD_REJECTED] INVALID_PDF_SIGNATURE file=${req.file.originalname}`);
                fs.unlinkSync(filePath);
                return res.status(400).json({
                    ok: false,
                    error: "INVALID_PDF_SIGNATURE",
                    message: "Uploaded file is not a valid PDF document."
                });
            }

            // 2. EOF Sanity Check
            const hasEof = checkPdfEof(filePath);
            const warnings = [];
            if (!hasEof) {
                console.warn(`[UPLOAD_WARNING] PDF_EOF_MARKER_NOT_FOUND file=${req.file.originalname}`);
                warnings.push("PDF_EOF_MARKER_NOT_FOUND");
            }

            // 3. Compute SHA-256
            const checksumValue = await computeSha256(filePath);

            const file_id = path.basename(req.file.filename, path.extname(req.file.filename));
            const createdAt = new Date().toISOString();
            const finalStatus = warnings.length > 0 ? "UPLOADED_WITH_WARNINGS" : "UPLOADED";

            // 4. Create Registry Record (v5.3 Phase 3 Persistence)
            const record = {
                file_id,
                role,
                filename: req.file.originalname,
                safe_filename: req.file.filename,
                size_bytes: req.file.size,
                mime_type: req.file.mimetype,
                status: finalStatus,
                source_type: "UPLOAD",
                checksum: {
                    algorithm: "sha256",
                    value: checksumValue
                },
                validation: {
                    pdf_signature_valid: true,
                    eof_marker_found: hasEof,
                    warnings: warnings
                },
                storage: {
                    provider: "local",
                    key: req.file.filename
                },
                associations: {
                    cart_id: cart_id || null,
                    session_id: session_id || null,
                    order_intent_id: order_intent_id || null,
                    order_ref: null,
                    user_id: user_id || null
                },
                created_at: createdAt,
                controlPlaneOrderId: controlPlaneOrderId || null,
                controlPlaneFileId: null,
                controlPlaneRegistration: null,
                metadata: {
                    controlPlaneOrderId: controlPlaneOrderId || null,
                    controlPlaneFileId: null,
                    controlPlaneRegistration: null
                }
            };

            let registrationOk = false;

            if (controlPlaneOrderId) {
                const regResult = await registerProductionFileWithControlPlane(controlPlaneOrderId, record);
                if (regResult) {
                    registrationOk = regResult.ok;
                    
                    if (registrationOk) {
                        record.controlPlaneFileId = regResult.fileId;
                    } else {
                        warnings.push("CONTROL_PLANE_FILE_REGISTER_FAILED");
                    }

                    const cpRegistrationObj = registrationOk ? {
                        ok: true,
                        orderId: controlPlaneOrderId,
                        role: regResult.role,
                        fileId: regResult.fileId,
                        response: regResult.response
                    } : regResult;

                    record.controlPlaneRegistration = cpRegistrationObj;
                    record.metadata = {
                        ...record.metadata,
                        controlPlaneOrderId,
                        controlPlaneFileId: record.controlPlaneFileId,
                        controlPlaneRegistration: cpRegistrationObj
                    };
                }
            }

            try {
                await repositories.productionFiles.create(record);

                if (controlPlaneOrderId && !registrationOk) {
                    await repositories.productionFiles.updateStatus(file_id, record.status, {
                        validation: record.validation
                    });
                }

                await repositories.auditEvents.append({
                    entity_type: 'PRODUCTION_FILE',
                    entity_id: record.file_id,
                    event_type: 'UPLOAD_SUCCESS',
                    actor_id: identity.user?.id || null,
                    session_id: identity.sessionId || session_id || null,
                    ip: req.ip,
                    payload: { role: record.role, filename: record.filename }
                });
            } catch (dbErr) {
                console.error(`[UPLOAD_DB_SAVE_FAILED] ${dbErr.message}`);
                return res.status(500).json({ error: "UPLOAD_COMMIT_FAILED" });
            }

            res.json({
                ok: true,
                ...record,
                storage: { provider: "local", key: record.storage.key }, // Filter paths
                storage_url: `/api/production-files/download/${file_id}`
            });

        } catch (processErr) {
            console.error(`[UPLOAD_PROCESS_ERROR] ${processErr.message}`);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) { console.error(`[CLEANUP_FAILED] ${e.message}`); }
            }
            res.status(500).json({ error: "INTERNAL_VALIDATION_ERROR", message: "Failed to process production file." });
        }
    });
});

// 🚀 PRODUCTION FILES: Discovery Endpoints (v5.3 - Phase 3)

app.get('/api/production-files', async (req, res) => {
    const { cart_id, session_id, order_ref, user_id } = req.query;
    if (!cart_id && !session_id && !order_ref && !user_id) {
        return res.status(400).json({ error: "MISSING_FILTER", message: "At least one association filter is required." });
    }

    const files = await repositories.productionFiles.listByAssociation({ cart_id, session_id, order_ref, user_id });

    // Ownership Filter
    const allowedFiles = [];
    for (const f of files) {
        if (await assertProductionFileAccess(req, f)) {
            allowedFiles.push(f);
        }
    }

    // Sanitize output (don't expose absolute paths)
    const sanitizedFiles = allowedFiles.map(f => ({
        ...f,
        storage: { provider: f.storage.provider, key: f.storage.key },
        storage_url: `/api/production-files/download/${f.file_id}`,
        controlPlaneOrderId: f.controlPlaneOrderId || f.metadata?.controlPlaneOrderId || null,
        controlPlaneFileId: f.controlPlaneFileId || f.metadata?.controlPlaneFileId || null,
        controlPlaneRegistration: f.controlPlaneRegistration || f.metadata?.controlPlaneRegistration || null
    }));

    res.json({ ok: true, files: sanitizedFiles });
});

app.get('/api/production-files/:fileId', async (req, res) => {
    const file = await repositories.productionFiles.getById(req.params.fileId);
    if (!file) {
        return res.status(404).json({ ok: false, error: "PRODUCTION_FILE_NOT_FOUND" });
    }

    if (!await assertProductionFileAccess(req, file)) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_FILE_ACCESS" });
    }

    res.json({
        ok: true,
        file: {
            ...file,
            storage: { provider: file.storage.provider, key: file.storage.key },
            storage_url: `/api/production-files/download/${file.file_id}`,
            controlPlaneOrderId: file.controlPlaneOrderId || file.metadata?.controlPlaneOrderId || null,
            controlPlaneFileId: file.controlPlaneFileId || file.metadata?.controlPlaneFileId || null,
            controlPlaneRegistration: file.controlPlaneRegistration || file.metadata?.controlPlaneRegistration || null
        }
    });
});

// ==========================================
// 🚀 CUSTOMER PORTAL / REMEDIATION PIPELINE (Phase 36.8)
// ==========================================

const CONTROL_PLANE_INTERNAL_URL = process.env.CONTROL_PLANE_INTERNAL_URL || CONTROL_PLANE_BASE_URL;

// CONTROL PLANE AUTH HEADERS HELPER
function controlPlaneAuthHeaders(extra = {}) {
    const token = process.env.PPOS_CONTROL_TOKEN || CONTROL_PLANE_API_KEY;
    if (!token) {
        throw new Error('PPOS_CONTROL_TOKEN_MISSING');
    }
    return {
        'Authorization': `Bearer ${token}`,
        ...extra
    };
}

// EXTRACT REQUIREDFILES UTILITY FROM VARIOUS SHAPES
function extractRequiredFiles(payload) {
    if (!payload || typeof payload !== 'object') return [];
    
    const getArr = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (Array.isArray(obj.requiredFiles)) return obj.requiredFiles;
        if (Array.isArray(obj.required_files)) return obj.required_files;
        return null;
    };

    // Check direct
    let arr = getArr(payload);
    if (arr) return arr;

    // Check action / customerAction
    arr = getArr(payload.action) || getArr(payload.customerAction) || getArr(payload.customer_action);
    if (arr) return arr;

    // Check data
    if (payload.data && typeof payload.data === 'object') {
        arr = getArr(payload.data);
        if (arr) return arr;

        arr = getArr(payload.data.action) || getArr(payload.data.customerAction) || getArr(payload.data.customer_action);
        if (arr) return arr;
    }

    return [];
}

// NORMALIZE CUSTOMER ACTION RESPONSE UTILITY
function normalizeCustomerActionResponse(payload) {
    if (!payload || typeof payload !== 'object') return {};

    const requiredFiles = extractRequiredFiles(payload);

    const findField = (keyName) => {
        if (payload[keyName] !== undefined) return payload[keyName];
        
        const subKeys = ['action', 'customerAction', 'customer_action'];
        for (const k of subKeys) {
            if (payload[k] && typeof payload[k] === 'object' && payload[k][keyName] !== undefined) {
                return payload[k][keyName];
            }
        }
        if (payload.data && typeof payload.data === 'object') {
            if (payload.data[keyName] !== undefined) return payload.data[keyName];
            for (const k of subKeys) {
                if (payload.data[k] && typeof payload.data[k] === 'object' && payload.data[k][keyName] !== undefined) {
                    return payload.data[k][keyName];
                }
            }
        }
        return undefined;
    };

    const orderId = findField('orderId') || findField('order_id') || '';
    const blockers = findField('blockers') || findField('required_files_blockers') || [];
    const message = findField('message') || '';
    const expiresAt = findField('expiresAt') || findField('expires_at') || '';
    const status = findField('status') || 'PENDING';

    return {
        orderId,
        requiredFiles,
        blockers: Array.isArray(blockers) ? blockers : [],
        message,
        expiresAt,
        status
    };
}

// SANITIZE CONTROL PLANE RESPONSE UTILITY
function sanitizeControlPlaneResponse(data) {
    if (!data || typeof data !== 'object') return data;
    const clean = Array.isArray(data) ? [] : {};
    for (const key in data) {
        const keyLower = key.toLowerCase();
        if (
            keyLower.includes('tokenhash') ||
            keyLower.includes('token_hash') ||
            keyLower.includes('token') ||
            keyLower.includes('metadata') ||
            keyLower.includes('storageroot') ||
            keyLower.includes('storage_root') ||
            keyLower.includes('filepath') ||
            keyLower.includes('file_path') ||
            keyLower.includes('path') ||
            keyLower.includes('debug') ||
            keyLower.includes('raw') ||
            keyLower.includes('secret') ||
            keyLower.includes('password')
        ) {
            continue;
        }
        
        const val = data[key];
        if (val && typeof val === 'object') {
            clean[key] = sanitizeControlPlaneResponse(val);
        } else if (typeof val === 'string') {
            let cleanStr = val;
            cleanStr = cleanStr.replace(/[a-zA-Z]:\\[\\\w\s.-]+/g, '[REDACTED_PATH]');
            cleanStr = cleanStr.replace(/\/var\/www\/[^\s]*/g, '[REDACTED_PATH]');
            clean[key] = cleanStr;
        } else {
            clean[key] = val;
        }
    }
    return clean;
}

// Memory-based Multer config for customer reupload
const customerReuploadMemoryStorage = multer.memoryStorage();
const getCustomerReuploadLimit = () => {
    if (process.env.CUSTOMER_REUPLOAD_MAX_BYTES) {
        return parseInt(process.env.CUSTOMER_REUPLOAD_MAX_BYTES, 10);
    }
    return 500 * 1024 * 1024; // 500MB
};

const customerReuploadUpload = multer({
    storage: customerReuploadMemoryStorage,
    limits: { fileSize: getCustomerReuploadLimit() }
});

// GET /api/customer-action/:orderId/:token
app.get('/api/customer-action/:orderId/:token', async (req, res) => {
    try {
        const { orderId, token } = req.params;
        const cpUrl = `${CONTROL_PLANE_INTERNAL_URL}/api/marketplace/orders/${orderId}/customer-action/${token}`;
        
        const cpRes = await axios.get(cpUrl, { 
            headers: controlPlaneAuthHeaders(),
            timeout: 10000 
        });
        const normalized = normalizeCustomerActionResponse(cpRes.data);
        if (!normalized.orderId) {
            normalized.orderId = orderId;
        }
        const sanitized = sanitizeControlPlaneResponse(normalized);
        return res.status(200).json(sanitized);
    } catch (err) {
        console.error(`[CUSTOMER_ACTION_GET_ERROR] orderId=${req.params.orderId} token=${req.params.token} message=${err.message}`);
        const status = err.response?.status || 500;
        const errorMsg = err.response?.data?.error || err.response?.data?.message || "Failed to retrieve customer action";
        return res.status(status).json({ error: errorMsg });
    }
});

// POST /api/customer-action/:orderId/:token/upload
app.post('/api/customer-action/:orderId/:token/upload', (req, res) => {
    customerReuploadUpload.single('file')(req, res, async (err) => {
        if (err) {
            console.error(`[CUSTOMER_ACTION_UPLOAD_FAILED] Multer error: ${err.message}`);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: "FILE_TOO_LARGE", message: "File exceeds the maximum upload size limit." });
            }
            return res.status(400).json({ error: "UPLOAD_ERROR", message: err.message });
        }

        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: "EMPTY_FILE", message: "No file uploaded or file is empty." });
        }

        try {
            // Validate magic bytes start with %PDF
            if (file.buffer.length < 4 || file.buffer.toString('utf8', 0, 4) !== '%PDF') {
                return res.status(400).json({ error: "INVALID_PDF_SIGNATURE", message: "File does not start with %PDF magic bytes." });
            }

            // Validate token first with ControlPlane public endpoint
            let requiredFiles = [];
            try {
                const cpUrl = `${CONTROL_PLANE_INTERNAL_URL}/api/marketplace/orders/${req.params.orderId}/customer-action/${req.params.token}`;
                const cpRes = await axios.get(cpUrl, { 
                    headers: controlPlaneAuthHeaders(),
                    timeout: 10000 
                });
                requiredFiles = extractRequiredFiles(cpRes.data);
            } catch (cpErr) {
                const status = cpErr.response?.status || 401;
                return res.status(status).json({ error: "INVALID_TOKEN", message: "Invalid or expired token." });
            }

            // Validate role is included in customerAction.requiredFiles and only allow allowed roles
            const role = req.body.role;
            const allowedRoles = ['INTERIOR_PDF', 'COVER_PDF'];
            if (!role || !allowedRoles.includes(role)) {
                return res.status(400).json({ 
                    error: "INVALID_ROLE", 
                    message: `Role '${role}' is not supported.`,
                    requiredFiles: requiredFiles
                });
            }

            if (!requiredFiles.includes(role)) {
                return res.status(400).json({ 
                    error: "ROLE_NOT_REQUIRED", 
                    message: `Role '${role}' is not required for this action.`,
                    requiredFiles: requiredFiles 
                });
            }

            // Generate storage ID: pf_<timestamp>_<random>
            const timestamp = Date.now();
            const random = crypto.randomBytes(4).toString('hex');
            const storageId = `pf_${timestamp}_${random}`;
            
            // Store file to PRODUCTION_FILES_DIR/{storageId}.pdf
            const filePath = path.join(PRODUCTION_FILES_DIR, `${storageId}.pdf`);
            fs.writeFileSync(filePath, file.buffer);

            // Compute sha256 checksum
            const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
            const storagePath = `/api/production-files/download/${storageId}`;

            // Call ControlPlane reupload endpoint
            const reuploadUrl = `${CONTROL_PLANE_INTERNAL_URL}/api/admin/marketplace/orders/${req.params.orderId}/remediation/reupload`;
            const payload = {
                role,
                originalName: file.originalname,
                mimeType: 'application/pdf',
                sizeBytes: file.size,
                checksumSha256: checksum,
                storagePath,
                autoBindPreflight: false,
                autoEvaluateInvoiceGate: false
            };

            const cpReuploadRes = await axios.post(reuploadUrl, payload, {
                headers: controlPlaneAuthHeaders({
                    'Content-Type': 'application/json'
                }),
                timeout: 15000
            });

            // Return sanitized ControlPlane response plus upload metadata
            const sanitizedCpRes = sanitizeControlPlaneResponse(cpReuploadRes.data);
            return res.status(200).json({
                ok: true,
                controlPlaneResponse: sanitizedCpRes,
                metadata: {
                    storageId,
                    role,
                    originalName: file.originalname,
                    mimeType: 'application/pdf',
                    sizeBytes: file.size,
                    checksumSha256: checksum,
                    storagePath
                }
            });

        } catch (processErr) {
            console.error(`[CUSTOMER_ACTION_UPLOAD_PROCESS_ERROR] ${processErr.message}`);
            const status = processErr.response?.status || 500;
            const errorMsg = processErr.response?.data?.error || processErr.response?.data?.message || processErr.message;
            return res.status(status).json({ error: "INTERNAL_ERROR", message: errorMsg });
        }
    });
});

// POST /api/customer-action/:orderId/:token/run
app.post('/api/customer-action/:orderId/:token/run', async (req, res) => {
    try {
        // Validate token first
        try {
            const cpUrl = `${CONTROL_PLANE_INTERNAL_URL}/api/marketplace/orders/${req.params.orderId}/customer-action/${req.params.token}`;
            await axios.get(cpUrl, { 
                headers: controlPlaneAuthHeaders(),
                timeout: 10000 
            });
        } catch (cpErr) {
            const status = cpErr.response?.status || 401;
            return res.status(status).json({ error: "INVALID_TOKEN", message: "Invalid or expired token." });
        }

        // Call ControlPlane remediation/run
        const runUrl = `${CONTROL_PLANE_INTERNAL_URL}/api/admin/marketplace/orders/${req.params.orderId}/remediation/run`;
        const cpRunRes = await axios.post(runUrl, {}, {
            headers: controlPlaneAuthHeaders(),
            timeout: 30000
        });

        const sanitizedCpRes = sanitizeControlPlaneResponse(cpRunRes.data);
        return res.status(200).json(sanitizedCpRes);
    } catch (err) {
        console.error(`[CUSTOMER_ACTION_RUN_ERROR] orderId=${req.params.orderId} token=${req.params.token} message=${err.message}`);
        const status = err.response?.status || 500;
        const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
        return res.status(status).json({ error: "RUN_FAILED", message: errorMsg });
    }
});

// SANITIZE INVOICE / PAYMENT RESPONSE FOR PHASE 37.2
function sanitizeInvoicePaymentResponse(data) {
    if (!data || typeof data !== 'object') return data;
    const clean = Array.isArray(data) ? [] : {};
    for (const key in data) {
        const keyLower = key.toLowerCase();
        
        // Do NOT strip bank transfer instruction keys
        const isBankInstruction = ['iban', 'bic', 'beneficiary', 'reference', 'amount', 'currency'].includes(keyLower);
        
        if (!isBankInstruction && (
            keyLower.includes('token') ||
            keyLower.includes('secret') ||
            keyLower.includes('metadata') ||
            keyLower.includes('raw') ||
            keyLower.includes('debug') ||
            keyLower.includes('path')
        )) {
            continue;
        }
        
        const val = data[key];
        if (val && typeof val === 'object') {
            clean[key] = sanitizeInvoicePaymentResponse(val);
        } else if (typeof val === 'string') {
            let cleanStr = val;
            // Redact physical filesystem paths
            cleanStr = cleanStr.replace(/[a-zA-Z]:\\[\\\w\s.-]+/g, '[REDACTED_PATH]');
            cleanStr = cleanStr.replace(/\/var\/www\/[^\s]*/g, '[REDACTED_PATH]');
            clean[key] = cleanStr;
        } else {
            clean[key] = val;
        }
    }
    return clean;
}

async function syncCPOrderPaymentStatus(cpOrderId, sanitized) {
    const paymentStatus = sanitized?.payment?.status;
    if (paymentStatus === 'PAYMENT_CONFIRMED') {
        const intent = await repositories.orderIntents.getByControlPlaneOrderId(cpOrderId);
        if (intent) {
            let changed = false;
            if (!intent.payment) {
                intent.payment = { provider: 'bank_transfer', status: 'PAID' };
                changed = true;
            } else if (intent.payment.status !== 'PAID') {
                intent.payment.status = 'PAID';
                changed = true;
            }
            if (!intent.lifecycle) {
                intent.lifecycle = { payment_status: 'PAID' };
                changed = true;
            } else if (intent.lifecycle.payment_status !== 'PAID') {
                intent.lifecycle.payment_status = 'PAID';
                changed = true;
            }
            
            if (changed) {
                intent.updated_at = new Date().toISOString();
                await repositories.orderIntents.update(intent.order_intent_id, intent);
                console.log(`[CP_PAYMENT_STATUS_SYNCED] cpOrderId=${cpOrderId} intent=${intent.order_intent_id} status=PAYMENT_CONFIRMED`);
                
                if (AUTO_FINALIZE_AFTER_PAYMENT) {
                    console.log(`[AUTO_FINALIZE_AFTER_PAYMENT_TRIGGERED_SYNC] id=${intent.order_intent_id}`);
                    try {
                        await finalizeOrderIntent(intent.order_intent_id);
                    } catch (e) {
                        console.error(`[AUTO_FINALIZE_FAILED_SYNC] id=${intent.order_intent_id} error=${e.message}`);
                    }
                }
            }
        }
    }
}

// VERIFY CONTROL PLANE ORDER ACCESS
async function verifyCPOrderAccess(req, res, cpOrderId) {
    const intent = await repositories.orderIntents.getByControlPlaneOrderId(cpOrderId);
    
    const smokeHeader = req.header('X-PPOS-Smoke-Access');
    if (smokeHeader !== undefined) {
        const isEnabled = process.env.PPOS_ENABLE_PHASE37_SMOKE_ACCESS === 'true';
        
        let tokenMatches = false;
        const authHeader = req.header('Authorization') || '';
        if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7).trim();
            const allowedTokens = [
                process.env.PPOS_CONTROL_TOKEN,
                process.env.ADMIN_API_TOKEN,
                process.env.CONTROL_PLANE_API_KEY
            ].filter(Boolean);
            
            if (token && allowedTokens.includes(token)) {
                tokenMatches = true;
            }
        }
        
        if (smokeHeader === 'phase37' && isEnabled && tokenMatches) {
            console.log(`[PHASE37_SMOKE_ACCESS_GRANTED] cpOrderId=${cpOrderId} intent=${intent ? intent.order_intent_id : 'null'}`);
            return true;
        } else {
            res.status(403).json({
                ok: false,
                error: 'ACCESS_DENIED',
                message: 'You do not have access to this marketplace order.'
            });
            return false;
        }
    }

    if (!intent) {
        const identity = resolveRequestIdentity(req);
        if (!identity.isAdmin) {
            res.status(404).json({
                ok: false,
                error: 'ORDER_INTENT_NOT_FOUND_FOR_CP_ORDER',
                message: 'No matching order intent found for this ControlPlane order.'
            });
            return false;
        }
        return true;
    }
    if (!assertOrderIntentAccess(req, intent)) {
        res.status(403).json({
            ok: false,
            error: 'ACCESS_DENIED',
            message: 'You do not have access to this marketplace order.'
        });
        return false;
    }
    return true;
}

// GET /api/marketplace-order/:cpOrderId/invoice/status
app.get('/api/marketplace-order/:cpOrderId/invoice/status', async (req, res) => {
    const { cpOrderId } = req.params;
    const hasAccess = await verifyCPOrderAccess(req, res, cpOrderId);
    if (!hasAccess) return;

    try {
        const cpUrl = `${CONTROL_PLANE_BASE_URL}/api/admin/marketplace/orders/${cpOrderId}/invoice/status`;
        const cpRes = await axios.get(cpUrl, {
            headers: controlPlaneAuthHeaders(),
            timeout: 10000
        });

        const data = cpRes.data || {};
        const sanitized = sanitizeInvoicePaymentResponse(data);
        await syncCPOrderPaymentStatus(cpOrderId, sanitized);
        
        // Returns sanitized: ok, orderId, orderStatus, invoiceReady, blockers, invoice, payment, readiness
        const responseData = {
            ok: sanitized.ok !== undefined ? sanitized.ok : true,
            orderId: sanitized.orderId,
            orderStatus: sanitized.orderStatus,
            invoiceReady: sanitized.invoiceReady,
            blockers: sanitized.blockers,
            invoice: sanitized.invoice,
            payment: sanitized.payment,
            readiness: sanitized.readiness
        };
        
        return res.status(200).json(responseData);
    } catch (err) {
        console.error(`[INVOICE_STATUS_PROXY_ERROR] cpOrderId=${cpOrderId} message=${err.message}`);
        if (err.response) {
            const status = err.response.status;
            const sanitized = sanitizeInvoicePaymentResponse(err.response.data);
            return res.status(status).json(sanitized);
        }
        return res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: err.message });
    }
});

// POST /api/marketplace-order/:cpOrderId/invoice/generate
app.post('/api/marketplace-order/:cpOrderId/invoice/generate', async (req, res) => {
    const { cpOrderId } = req.params;
    const hasAccess = await verifyCPOrderAccess(req, res, cpOrderId);
    if (!hasAccess) return;

    try {
        const cpUrl = `${CONTROL_PLANE_BASE_URL}/api/admin/marketplace/orders/${cpOrderId}/invoice/generate`;
        const cpRes = await axios.post(cpUrl, {}, {
            headers: controlPlaneAuthHeaders(),
            timeout: 15000
        });

        const data = cpRes.data || {};
        const sanitized = sanitizeInvoicePaymentResponse(data);
        return res.status(cpRes.status || 200).json(sanitized);
    } catch (err) {
        console.error(`[INVOICE_GENERATE_PROXY_ERROR] cpOrderId=${cpOrderId} message=${err.message}`);
        if (err.response) {
            const status = err.response.status;
            const sanitized = sanitizeInvoicePaymentResponse(err.response.data);
            return res.status(status).json(sanitized);
        }
        return res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: err.message });
    }
});

// GET /api/marketplace-order/:cpOrderId/payment/status
app.get('/api/marketplace-order/:cpOrderId/payment/status', async (req, res) => {
    const { cpOrderId } = req.params;
    const hasAccess = await verifyCPOrderAccess(req, res, cpOrderId);
    if (!hasAccess) return;

    try {
        const cpUrl = `${CONTROL_PLANE_BASE_URL}/api/admin/marketplace/orders/${cpOrderId}/invoice/status`;
        const cpRes = await axios.get(cpUrl, {
            headers: controlPlaneAuthHeaders(),
            timeout: 10000
        });

        const data = cpRes.data || {};
        const sanitized = sanitizeInvoicePaymentResponse(data);
        await syncCPOrderPaymentStatus(cpOrderId, sanitized);

        // Returns reduced shape: ok, orderId, orderStatus, invoiceReady, payment, invoiceNumber, amount, currency
        const invoiceNumber = sanitized.invoice?.invoiceNumber || 
                              sanitized.invoice?.invoice_number || 
                              sanitized.invoiceNumber || 
                              sanitized.invoice_number || 
                              null;
                              
        const amount = sanitized.payment?.amount || 
                       sanitized.invoice?.amount || 
                       sanitized.amount || 
                       null;
                       
        const currency = sanitized.payment?.currency || 
                         sanitized.invoice?.currency || 
                         sanitized.currency || 
                         null;

        const responseData = {
            ok: sanitized.ok !== undefined ? sanitized.ok : true,
            orderId: sanitized.orderId,
            orderStatus: sanitized.orderStatus,
            invoiceReady: sanitized.invoiceReady,
            payment: sanitized.payment,
            invoiceNumber,
            amount,
            currency
        };

        return res.status(200).json(responseData);
    } catch (err) {
        console.error(`[PAYMENT_STATUS_PROXY_ERROR] cpOrderId=${cpOrderId} message=${err.message}`);
        if (err.response) {
            const status = err.response.status;
            const sanitized = sanitizeInvoicePaymentResponse(err.response.data);
            return res.status(status).json(sanitized);
        }
        return res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: err.message });
    }
});

// SPA FALLBACK ROUTE FOR REMEDIATION PAGES
app.get('/remediation/:orderId/:token', (req, res) => {
    const indexPath = path.join(__dirname, '../dist/index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    return res.status(404).send("Frontend build dist/index.html not found. Please run npm run build.");
});

app.get('/api/production-files/metadata/:fileId', async (req, res) => {
    const file = await repositories.productionFiles.getById(req.params.fileId);
    if (!file) {
        return res.status(404).json({ ok: false, error: "PRODUCTION_FILE_NOT_FOUND" });
    }

    if (!await assertProductionFileAccess(req, file)) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_FILE_ACCESS" });
    }

    res.json({
        ok: true,
        file_id: file.file_id,
        role: file.role,
        filename: file.filename,
        safe_filename: file.safe_filename,
        size_bytes: file.size_bytes,
        mime_type: file.mime_type,
        status: file.status,
        source_type: file.source_type,
        checksum: file.checksum,
        validation: file.validation,
        associations: file.associations,
        created_at: file.created_at,
        storage_url: `/api/production-files/download/${file.file_id}`,
        controlPlaneOrderId: file.controlPlaneOrderId || file.metadata?.controlPlaneOrderId || null,
        controlPlaneFileId: file.controlPlaneFileId || file.metadata?.controlPlaneFileId || null,
        controlPlaneRegistration: file.controlPlaneRegistration || file.metadata?.controlPlaneRegistration || null
    });
});

// 🧠 AI CHAT PROXY — frontend contract -> Gemini contract
app.post('/api/ai/chat', async (req, res) => {
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "AI Service not configured." });
    }

    const { system_prompt, messages, ui_state } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array required." });
    }

    const systemText = `${system_prompt || ''}

Current UI State (read-only context):
${JSON.stringify(ui_state || {})}`;

    const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content || '') }]
    }));

    const geminiPayload = {
        system_instruction: {
            parts: [{ text: systemText }]
        },
        contents,
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
        }
    };

    try {
        const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

        console.log(`[PPP_AI_CHAT] session=${req.signedCookies?.pp_session_id || 'anonymous'} model=${model}`);
        const response = await axios.post(geminiUrl, geminiPayload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        const text =
            response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            response.data?.response ||
            '';

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = { reply: text };
        }

        const normalized = {
            ...parsed,
            reply:
                parsed.reply ||
                parsed.response ||
                parsed.text ||
                parsed.message ||
                ''
        };

        res.json(normalized);
    } catch (err) {
        console.error("[AI_PROXY_ERROR]", err.response?.data || err.message);
        res.status(err.response?.status || 502).json({
            error: "AI service unavailable.",
            details: err.response?.data || err.message
        });
    }
});

// 🔐 AUTH LOGIN PROXY
app.post('/api/auth/login',
    rateLimit({ windowMs: 60000, max: 10 }),
    [
        body('email').isEmail(),
        body('password').isLength({ min: 1 }),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('[AUTH_LOGIN_VALIDATION_ERROR]', errors.array());
            return res.status(400).json({ error: 'Invalid credentials format.', details: errors.array() });
        }

        const { email, password } = req.body;

        try {
            const response = await axios.post(authLoginUrl, { email, password }, {
                headers: buildControlPlaneHeaders(),
                timeout: 10000,
            });

            res.status(response.status).json(response.data);
        } catch (err) {
            console.error('[AUTH_LOGIN_PROXY_ERROR]', {
                url: authLoginUrl,
                status: err.response?.status,
                data: err.response?.data,
                message: err.message
            });
            res.status(err.response?.status || 502).json(
                err.response?.data || { error: 'Auth service unavailable.' }
            );
        }
    }
);

// 🔐 AUTH REGISTER PROXY
app.post('/api/auth/register',
    rateLimit({ windowMs: 60000, max: 5 }),
    [
        body('email').isEmail(),
        body('password').isLength({ min: 1 }),
        body('role').optional().isIn(['AUTHOR', 'PUBLISHER', 'PRINT_HOUSE', 'PRINTHOUSE', 'DEVELOPER']),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('[AUTH_REGISTER_VALIDATION_ERROR]', errors.array());
            return res.status(400).json({ error: 'Invalid registration data.', details: errors.array() });
        }

        const { email, password, role } = req.body;

        try {
            const response = await axios.post(authRegisterUrl, { email, password, role }, {
                headers: buildControlPlaneHeaders(),
                timeout: 10000,
            });

            res.status(response.status).json(response.data);
        } catch (err) {
            console.error('[AUTH_REGISTER_PROXY_ERROR]', {
                url: authRegisterUrl,
                status: err.response?.status,
                data: err.response?.data,
                message: err.message
            });
            res.status(err.response?.status || 502).json(
                err.response?.data || { error: 'Auth service unavailable.' }
            );
        }
    }
);

// 📜 Paper Catalog Gateway (Control Plane Paper Supplier Hub)
app.get('/api/budget/paper/catalog', async (req, res) => {
    try {
        const cpUrl = `${CONTROL_PLANE_BASE_URL}/api/marketplace/paper-catalog`;
        let response;
        try {
            const headers = buildControlPlaneHeaders();
            response = await axios.get(cpUrl, { headers, timeout: 8000 });
        } catch (cpErr) {
            if (cpErr.response?.status === 401 || cpErr.response?.status === 403 || !process.env.BPE_JWT_SECRET) {
                response = await axios.get(cpUrl, { timeout: 8000 });
            } else {
                throw cpErr;
            }
        }

        if (response.data && response.data.ok) {
            return res.json({
                ok: true,
                data: response.data.data
            });
        }
        return res.status(502).json({
            ok: false,
            error: 'CONTROL_PLANE_CATALOG_UNAVAILABLE',
            message: 'Failed to retrieve paper catalog from Control Plane.'
        });
    } catch (err) {
        console.error('[BUDGET_PAPER_CATALOG_ERROR]', err.message);
        return res.status(502).json({
            ok: false,
            error: 'CONTROL_PLANE_CATALOG_UNAVAILABLE',
            message: 'Paper catalog service is temporarily unreachable.'
        });
    }
});

app.get('/api/budget/paper/search', async (req, res) => {
    try {
        const params = new URLSearchParams();
        if (req.query.q) params.set('q', req.query.q);
        if (req.query.query) params.set('query', req.query.query);
        if (req.query.category) params.set('category', req.query.category);
        if (req.query.finish) params.set('finish', req.query.finish);
        if (req.query.gsm) params.set('gsm', req.query.gsm);
        if (req.query.limit) params.set('limit', req.query.limit);
        if (req.query.offset) params.set('offset', req.query.offset);

        const cpUrl = `${CONTROL_PLANE_BASE_URL}/api/marketplace/paper-catalog?${params.toString()}`;
        let response;
        try {
            const headers = buildControlPlaneHeaders();
            response = await axios.get(cpUrl, { headers, timeout: 8000 });
        } catch (cpErr) {
            if (cpErr.response?.status === 401 || cpErr.response?.status === 403 || !process.env.BPE_JWT_SECRET) {
                response = await axios.get(cpUrl, { timeout: 8000 });
            } else {
                throw cpErr;
            }
        }

        if (response.data && response.data.ok) {
            return res.json({
                ok: true,
                data: response.data.data
            });
        }
        return res.status(502).json({
            ok: false,
            error: 'CONTROL_PLANE_SEARCH_FAILED',
            message: 'Failed to search paper materials in Control Plane.'
        });
    } catch (err) {
        console.error('[BUDGET_PAPER_SEARCH_ERROR]', err.message);
        return res.status(502).json({
            ok: false,
            error: 'CONTROL_PLANE_SEARCH_UNAVAILABLE',
            message: 'Paper material search is temporarily unreachable.'
        });
    }
});

// 📊 BPE PROXY: Budget Calculation
app.post('/api/budget/calculate', [
    body('copies').isInt({ min: 1 }),
    body('interior_pages').isInt({ min: 0 }),
    body('delivery_country').isString().isLength({ min: 2, max: 2 })
], async (req, res) => {
    console.log('[BUDGET_CALCULATE_INCOMING_BODY]', JSON.stringify(req.body, null, 2));

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const sessionId = getOrCreateSessionId(req, res);

    try {
        const bpeUrl = BPE_MARKETPLACE_OFFERS_URL;
        const headers = buildControlPlaneHeaders();

        // 1. Resolve Paper Specifications (Simple Presets vs Advanced Catalog Material)
        let resolvedInteriorType = req.body.paper_type_interior || 'offset';
        let resolvedInteriorWeight = Number(req.body.paper_weight_interior ?? 135);
        let resolvedCoverType = req.body.paper_type_cover || 'mc';
        let resolvedCoverWeight = Number(req.body.paper_weight_cover ?? 250);
        let resolvedEndpaperType = req.body.paper_type_endpaper || 'offset';
        let resolvedEndpaperWeight = Number(req.body.paper_weight_endpapers ?? 115);

        // Helper to map technical catalog category to canonical BPE generic paper category
        const mapCategoryToBpeType = (category, brand, finish) => {
            const cat = String(category || '').toUpperCase();
            const b = String(brand || '').toUpperCase();
            if (b.includes('MUNKEN')) return 'munken';
            if (cat === 'OFFSET' || cat === 'UNCOATED') return 'offset';
            if (cat === 'COATED') return 'mc';
            if (cat === 'CARTON') return 'artboard';
            if (cat === 'DESIGN') return 'lux';
            return 'other';
        };

        // BUDGET-01 Scope Clarification:
        // The advanced paper selector is strictly an informative customer paper preference.
        // It does NOT overwrite BPE pricing parameters. Standard parameters remain intact.
        const rawCalcPreferences = req.body.customer_paper_preferences !== undefined
            ? req.body.customer_paper_preferences
            : ((req.body.paper_mode_interior === 'advanced' && req.body.interior_paper_material) ||
               (req.body.paper_mode_cover === 'advanced' && req.body.cover_paper_material) ||
               (req.body.paper_mode_endpaper === 'advanced' && req.body.endpaper_material)
                ? {
                    interior: req.body.interior_paper_material || null,
                    cover: req.body.cover_paper_material || null,
                    endpaper: req.body.endpaper_material || null
                  }
                : undefined);

        const customerPaperPreferences = resolveCustomerPaperPreferences(rawCalcPreferences, null);

        const bpePayload = {
            copies: Number(req.body.copies),
            interior_pages: Number(req.body.interior_pages),
            delivery_country: String(req.body.delivery_country).toUpperCase().trim(),
            book_size: req.body.book_size || 'A5',
            cover_pages: Number(req.body.cover_pages ?? 4),
            orientation: req.body.orientation || 'portrait',
            interior_print: req.body.interior_print || '1/1',
            cover_print: req.body.cover_print || '4/0',
            paper_type_interior: resolvedInteriorType,
            paper_weight_interior: resolvedInteriorWeight,
            paper_type_cover: resolvedCoverType,
            paper_weight_cover: resolvedCoverWeight,
            paper_type_endpaper: resolvedEndpaperType,
            paper_weight_endpapers: resolvedEndpaperWeight,
            binding_method: req.body.binding_method || 'perfect_bound',
            finishing_options: req.body.finishing_options || '',
            uv_varnish: req.body.uv_varnish === true,
            endpapers: req.body.endpapers || 'none',
            endpapers_print: req.body.endpapers_print || '',
            custom_width: req.body.custom_width ? Number(req.body.custom_width) : undefined,
            custom_height: req.body.custom_height ? Number(req.body.custom_height) : undefined
        };

        // Extra alias mapping as requested by contract
        const payloadToBpe = {
            ...bpePayload,
            color_or_bw: req.body.color_or_bw || (bpePayload.interior_print === '4/4' ? 'color' : 'bw'),
            binding_type: req.body.binding_type || bpePayload.binding_method,
            paper_type: req.body.paper_type || bpePayload.paper_type_interior,
            paper_weight: req.body.paper_weight || bpePayload.paper_weight_interior,
            cover_paper_type: req.body.cover_paper_type || bpePayload.paper_type_cover,
            cover_paper_weight: req.body.cover_paper_weight || bpePayload.paper_weight_cover,
            laminate: req.body.laminate || bpePayload.finishing_options,
            hardcover: req.body.hardcover !== undefined ? req.body.hardcover : (bpePayload.binding_method === 'thread_sewn_hc'),
            production_country: req.body.production_country || '',
            delivery_method: req.body.delivery_method || 'standard'
        };

        console.log('[BUDGET_CALCULATE_BPE_PAYLOAD]', JSON.stringify(bpePayload, null, 2));
        console.log(`[BPE_PROXY_REQUEST] session=${sessionId} country=${bpePayload.delivery_country}`);
        
        const response = await axios.post(bpeUrl, payloadToBpe, { headers, timeout: 10000 });

        const bpeData = response.data;
        const offers = Array.isArray(bpeData.offers) ? bpeData.offers : [];

        console.log('[BUDGET_CALCULATE_BPE_RESPONSE_SUMMARY]', {
          offersCount: offers?.length,
          prices: offers?.map(o => ({
            printer_id: o.printer_id,
            printer_name: o.printer_name || o.print_house || 'Print House',
            total_price: o.suggested_price || o.production_cost || o.total_price || o.total_cost || o.price,
            currency: o.currency
          }))
        });

        // Detect BPE fallback pricing
        const bpeParams = bpeData.params || {};
        const isFallback = (bpeParams.copies && Number(bpeParams.copies) !== Number(bpePayload.copies)) ||
                           (bpeParams.interior_pages && Number(bpeParams.interior_pages) !== Number(bpePayload.interior_pages)) ||
                           offers.some(o => {
                               const p = Number(o.suggested_price ?? o.production_cost ?? o.total_price ?? o.total_cost ?? o.price ?? o.total ?? 0);
                               return [2607.2429, 2718.3, 2752.1571].some(fp => Math.abs(p - fp) < 0.01);
                           });

        const offer_session_id = `ofs_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const expires_at = new Date(Date.now() + OFFER_SESSION_TTL_MINUTES * 60 * 1000).toISOString();
        const effectiveCustomerPaperPreferences = (customerPaperPreferences && typeof customerPaperPreferences === 'object' && Object.keys(customerPaperPreferences).length > 0)
            ? customerPaperPreferences
            : null;

        const normalizedSpecs = {
            ...req.body,
            customer_paper_preferences: effectiveCustomerPaperPreferences
        };

        const normalizedOffers = offers.map(o => {
            const offer_id = `offer_${crypto.randomBytes(6).toString('hex')}`;
            const finalPrice = Number(o.suggested_price ?? o.production_cost ?? o.total_price ?? o.total_cost ?? o.price ?? o.total ?? 0);
            
            const offerForSigning = {
              offer_session_id,
              offer_id,
              printer_id: o.printer_id || o.printer || o.print_house || 'BPE_Engine',
              printer_name: o.printer_name || o.print_house || o.print_house_name || 'Print House',
              print_house_name: o.print_house_name || o.printer_name || o.print_house || 'Print House',
              total_price: finalPrice,
              currency: o.currency || 'EUR',
              production_days: o.production_lead_days || o.production_days || 0,
              delivery_days: o.shipping_days || o.delivery_days || 0,
              estimated_delivery_time: o.estimated_delivery_time || o.delivery_time || '',
              pricing_breakdown: o.breakdown || {},
              raw_offer_snapshot: o,
              expires_at,
              specs: normalizedSpecs,
              specs_hash: stableHash(normalizedSpecs),
              source: isFallback ? "fallback" : (o.source || "BPE_MARKETPLACE_NATIVE")
            };

            offerForSigning.signature = signOfferPayload(offerForSigning);
            return offerForSigning;
        });

        // Persist session (v5.3 Phase 4)
        await repositories.offerSessions.create({
            offer_session_id,
            session_id: sessionId,
            input_specs: normalizedSpecs,
            normalized_specs: normalizedSpecs,
            offers: normalizedOffers,
            expires_at,
            created_at: new Date().toISOString()
        });

        res.json({
            ok: true,
            success: true,
            offer_session_id,
            expires_at,
            offers: normalizedOffers.map(({ raw_offer_snapshot, signature, ...rest }) => ({
                ...rest,
                signature
            })),
            recommended_offer_id: bpeData.recommended_offer_id
        });
    } catch (err) {
        console.error("[BPE_PROXY_ERROR_DETAILED]", {
            message: err.message,
            stack: err.stack,
            upstream_status: err.response?.status,
            upstream_data: err.response?.data,
            url: BPE_MARKETPLACE_OFFERS_URL
        });

        res.status(502).json({
            error: "Failed to fetch quotes from Book Price Engine.",
            detail: err.message,
            upstream_status: err.response?.status || null,
            upstream_error: err.response?.data || null
        });
    }
});

// 🌐 MARKETPLACE ORDER INTAKE PROXY (v5.3 Phase 36.2)
app.post('/api/orders/create-from-offer', async (req, res) => {
    const {
        pricingSessionId,
        selectedOfferId,
        sessionId,
        customerId,
        tenantId,
        customer,
        bookSpec,
        metadata,
        idempotencyKey
    } = req.body;

    const actualSessionId = sessionId || req.signedCookies['pp_session_id'];

    if (!actualSessionId && !customerId) {
        return res.status(400).json({ error: "MISSING_IDENTITY", message: "sessionId or customerId is required." });
    }
    if (!pricingSessionId || !selectedOfferId) {
        return res.status(400).json({ error: "MISSING_OFFER_IDS", message: "pricingSessionId and selectedOfferId are required." });
    }

    if (!process.env.PPOS_MARKETPLACE_INTAKE_TOKEN) {
        return res.status(500).json({ error: "MARKETPLACE_INTAKE_TOKEN_MISSING", message: "PPOS_MARKETPLACE_INTAKE_TOKEN is not configured." });
    }

    // 1. Resolve Session and Offer Server-Side
    const session = await repositories.offerSessions.getById(pricingSessionId);
    if (!session) {
        return res.status(400).json({ error: "OFFER_SESSION_NOT_FOUND", message: "The pricing session was not found." });
    }

    const resolvedOffer = await getOfferFromSession(pricingSessionId, selectedOfferId);
    if (!resolvedOffer) {
        return res.status(400).json({ error: "OFFER_VERIFICATION_FAILED", message: "The selected offer is invalid or could not be verified." });
    }

    // 2. Extract Trusted Data
    const resolvedPrinthouseId = resolvedOffer.print_house_id || resolvedOffer.printer_id || resolvedOffer.printerId;
    const resolvedEstimatedPrice = Number(resolvedOffer.total_price || resolvedOffer.total_cost || resolvedOffer.price || 0);

    if (!Number.isFinite(resolvedEstimatedPrice) || resolvedEstimatedPrice <= 0) {
        return res.status(400).json({ error: "INVALID_RESOLVED_PRICE", message: "The verified offer has an invalid or zero price." });
    }

    // 3. Build Trusted DTO
    const dto = {
        pricingSessionId: pricingSessionId,
        selectedOfferId: selectedOfferId,
        sessionId: actualSessionId,
        customerId: customerId,
        tenantId: tenantId,
        printhouseId: resolvedPrinthouseId,
        currency: resolvedOffer.currency || 'EUR',
        estimatedPrice: resolvedEstimatedPrice,
        customer: customer || (customerId ? { name: "Logged In", email: null } : { name: "Anonymous", email: null }),
        bookSpec: session.normalized_specs || session.input_specs || {},
        selectedOffer: resolvedOffer.raw_offer_snapshot || resolvedOffer,
        metadata: {
            ...metadata,
            source: "bpe-marketplace-app",
            phase: "36.2",
            idempotencyKey,
            offerVerified: true,
            offerSessionExpiresAt: session.expires_at,
            clientBookSpec: bookSpec || null
        }
    };

    console.log(`[CONTROL_PLANE_INTAKE_REQ] pricingSessionId=${dto.pricingSessionId} selectedOfferId=${dto.selectedOfferId} hasSessionId=${!!dto.sessionId} hasCustomerId=${!!dto.customerId} resolvedPrinthouseId=${dto.printhouseId} resolvedEstimatedPrice=${dto.estimatedPrice}`);

    try {
        const headers = {
            'Content-Type': 'application/json',
            'X-Marketplace-Token': process.env.PPOS_MARKETPLACE_INTAKE_TOKEN
        };
        if (idempotencyKey) {
            headers['X-Idempotency-Key'] = idempotencyKey;
        }

        const cpResponse = await axios.post(`${CONTROL_PLANE_BASE_URL}/api/marketplace/orders`, dto, {
            headers,
            timeout: 15000
        });

        console.log(`[CONTROL_PLANE_INTAKE_RES] statusCode=${cpResponse.status} orderId=${cpResponse.data?.orderId}`);
        res.status(200).json(cpResponse.data);

    } catch (err) {
        if (err.response) {
            const status = err.response.status;
            console.error(`[CONTROL_PLANE_INTAKE_ERROR] statusCode=${status}`);
            
            if (status === 401 || status === 403) {
                return res.status(502).json({ error: "CONTROL_PLANE_AUTH_FAILED", message: "Failed to authenticate with ControlPlane." });
            }
            if (status >= 400 && status < 500) {
                return res.status(status).json({
                    ok: false,
                    error: "CONTROL_PLANE_REJECTED_ORDER",
                    statusCode: status,
                    details: err.response.data
                });
            }
        } else {
            console.error(`[CONTROL_PLANE_INTAKE_ERROR] network/timeout: ${err.message}`);
        }
        
        return res.status(502).json({ error: "CONTROL_PLANE_UNAVAILABLE", message: "ControlPlane service is unavailable." });
    }
});

// 🛒 CART API (Session-bound)
app.get('/api/cart', async (req, res) => {
    const sessionId = getOrCreateSessionId(req, res);
    res.json({ success: true, cart: carts.get(sessionId) || [] });
});

app.post('/api/cart/add', async (req, res) => {
    const sessionId = getOrCreateSessionId(req, res);
    const { offer_session_id, offer_id, specs: legacySpecs, offer: legacyOffer } = req.body;

    // v5.3 Phase 4: Preferred payload uses server-authoritative IDs
    if (offer_session_id && offer_id) {
        const session = await repositories.offerSessions.getById(offer_session_id);
        if (!session) {
            return res.status(404).json({ error: "OFFER_SESSION_NOT_FOUND", message: "The pricing session was not found." });
        }
        if (isOfferSessionExpired(session)) {
            return res.status(400).json({
                error: "OFFER_SESSION_EXPIRED",
                message: "This pricing offer has expired. Please recalculate your book price."
            });
        }

        const resolvedOffer = await getOfferFromSession(offer_session_id, offer_id);
        if (!resolvedOffer) {
            return res.status(400).json({ error: "INVALID_OFFER", message: "The selected offer is invalid or has been tampered with." });
        }

        const cart = carts.get(sessionId) || [];
        if (cart.length >= 5) return res.status(400).json({ error: "Cart limit reached." });

        const newItem = {
            id: `item_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            offer_session_id,
            offer_id,
            specs: session.normalized_specs,
            offer: resolvedOffer.raw_offer_snapshot || resolvedOffer,
            pricing: {
                total_price: resolvedOffer.total_price,
                total_cost: resolvedOffer.total_price, // Assuming cost=price for simplicity in app
                currency: resolvedOffer.currency,
                breakdown: resolvedOffer.pricing_breakdown
            },
            addedAt: new Date().toISOString(),
            metadata: {
                offer_session_id,
                offer_id,
                signature: resolvedOffer.signature,
                contract: 'BPE_MARKETPLACE_NATIVE',
                source: 'PRINTPRICE_APP'
            }
        };

        cart.push(newItem);
        carts.set(sessionId, cart);
        console.log(`[CART_ADD_OFFER_RESOLVED] session=${sessionId} offer_id=${offer_id}`);
        return res.json({ success: true, item_id: newItem.id, cart_count: cart.length });
    }

    // Backward compatibility (Dev only)
    if (process.env.NODE_ENV !== 'production') {
        console.warn(`[CART_ADD_LEGACY_PAYLOAD_ACCEPTED_DEV] session=${sessionId}`);
        // ... (preserving some legacy logic if needed, but requirements say reject in prod)
        if (!legacySpecs || !legacyOffer) {
            return res.status(400).json({ error: 'offer_session_id and offer_id are required.' });
        }
    } else {
        console.error(`[CART_ADD_LEGACY_PAYLOAD_REJECTED] session=${sessionId}`);
        return res.status(400).json({ error: 'MISSING_OFFER_SESSION', message: 'Offer session ID and offer ID are required.' });
    }

    res.status(400).json({ error: 'Invalid request.' });
});

app.delete('/api/cart/items/:id', (req, res) => {
    const sessionId = req.signedCookies['pp_session_id'];
    if (!sessionId) return res.status(401).json({ error: 'No session.' });

    let cart = carts.get(sessionId) || [];
    cart = cart.filter(i => i.id !== req.params.id);
    carts.set(sessionId, cart);
    res.json({ success: true, cart_count: cart.length });
});

// 🚀 CHECKOUT API (v5.3 Hardened)
app.post('/api/cart/checkout', async (req, res) => {
    const sessionId = req.signedCookies['pp_session_id'];
    if (!sessionId) return res.status(401).json({ error: 'No session.' });

    const cart = carts.get(sessionId) || [];
    if (!cart.length) return res.status(400).json({ error: 'Cart is empty.' });

    const { user, user_id, metadata } = req.body;
    const targetUserId = user?.user_id || user_id;
    if (!targetUserId) {
        return res.status(401).json({ error: 'Checkout requires a logged-in user.' });
    }

    const productionFiles = metadata?.production_files;

    // v5.3 Phase 3: Production Files Verification from Server-Side Registry
    const interiorId = productionFiles?.interior_pdf_file_id || productionFiles?.interior_pdf?.file_id;
    const coverId = productionFiles?.cover_pdf_file_id || productionFiles?.cover_spine_back_pdf?.file_id;

    if (!interiorId || !coverId) {
        return res.status(400).json({
            error: "Production files not found in server repository",
            missing: !interiorId && !coverId ? ["INTERIOR_PDF", "COVER_PDF"] : (!interiorId ? ["INTERIOR_PDF"] : ["COVER_PDF"])
        });
    }

    const interiorRecord = await repositories.productionFiles.getById(interiorId);
    const coverRecord = await repositories.productionFiles.getById(coverId);

    if (!interiorRecord || !coverRecord) {
        console.warn(`[CHECKOUT_FILE_REGISTRY_REJECTED] Records missing. interior=${interiorId} cover=${coverId}`);
        return res.status(400).json({
            error: "Production files not found in server repository",
            missing: !interiorRecord && !coverRecord ? ["INTERIOR_PDF", "COVER_PDF"] : (!interiorRecord ? ["INTERIOR_PDF"] : ["COVER_PDF"])
        });
    }

    // Role Verification
    if (interiorRecord.role !== 'INTERIOR_PDF') {
        return res.status(400).json({
            error: "Production file role mismatch",
            file_id: interiorId,
            expected_role: "INTERIOR_PDF",
            actual_role: interiorRecord.role
        });
    }
    if (coverRecord.role !== 'COVER_PDF') {
        return res.status(400).json({
            error: "Production file role mismatch",
            file_id: coverId,
            expected_role: "COVER_PDF",
            actual_role: coverRecord.role
        });
    }

    // Status Verification (Allowed: UPLOADED, VALIDATED)
    const allowedStatuses = ['UPLOADED', 'VALIDATED'];
    if (!allowedStatuses.includes(interiorRecord.status)) {
        return res.status(400).json({ error: `Production file '${interiorId}' is in invalid status: ${interiorRecord.status}` });
    }
    if (!allowedStatuses.includes(coverRecord.status)) {
        return res.status(400).json({ error: `Production file '${coverId}' is in invalid status: ${coverRecord.status}` });
    }

    console.log(`[CHECKOUT_FILE_REGISTRY_VALIDATED] interior=${interiorId} cover=${coverId}`);

    // Map registry records to final metadata (Sanitized)
    const mapToPublic = (rec) => ({
        file_id: rec.file_id,
        role: rec.role,
        filename: rec.filename,
        size_bytes: rec.size_bytes,
        checksum: rec.checksum,
        status: rec.status,
        validation: rec.validation,
        storage: { provider: rec.storage.provider, key: rec.storage.key }
    });

    const finalProductionFiles = {
        required: true,
        status: interiorRecord.status === 'VALIDATED' && coverRecord.status === 'VALIDATED' ? 'FILES_VALIDATED' : 'FILES_PENDING',
        required_files: ['INTERIOR_PDF', 'COVER_SPINE_BACK_PDF'],
        interior_pdf: mapToPublic(interiorRecord),
        cover_spine_back_pdf: mapToPublic(coverRecord)
    };

    const controlPlaneOrdersUrl = `${CONTROL_PLANE_BASE_URL}/api/admin/orders`;
    const headers = buildControlPlaneHeaders();

    const createdOrders = [];
    try {
        for (const item of cart) {
            // v5.3 Phase 4: Server-authoritative offer resolution
            const { offer_session_id, offer_id } = item;
            if (!offer_session_id || !offer_id) {
                console.error(`[CHECKOUT_OFFER_REJECTED] Missing offer session IDs in cart item=${item.id}`);
                return res.status(400).json({ error: "ITEM_INTEGRITY_FAILED", message: "Cart item is missing server-authoritative offer IDs." });
            }

            const session = await repositories.offerSessions.getById(offer_session_id);
            if (!session || isOfferSessionExpired(session)) {
                console.warn(`[CHECKOUT_OFFER_REJECTED] Session expired or missing. ofs=${offer_session_id}`);
                return res.status(400).json({
                    error: "OFFER_SESSION_EXPIRED",
                    message: "One or more offers in your cart have expired. Please recalculate pricing."
                });
            }

            const resolvedOffer = await getOfferFromSession(offer_session_id, offer_id);
            if (!resolvedOffer) {
                console.error(`[CHECKOUT_OFFER_REJECTED] Offer resolution failed or signature invalid. ofs=${offer_session_id} off=${offer_id}`);
                return res.status(400).json({ error: "OFFER_VERIFICATION_FAILED", message: "One or more offers in your cart could not be verified." });
            }

            console.log(`[CHECKOUT_OFFER_RESOLVED] ofs=${offer_session_id} off=${offer_id} price=${resolvedOffer.total_price}`);

            const order_ref = `app_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
            const source_ref = `ppp_app_checkout_${Date.now()}`;

            /** @type {import('../types').ControlPlaneOrderPayload} */
            const payload = {
                source: "PRINTPRICE_APP",
                source_ref: source_ref,
                order_ref: order_ref,
                user_id: process.env.PPOS_BPE_SYSTEM_USER_ID || 'bpe-system-user',
                offer_print_house: resolvedOffer.printer_id || resolvedOffer.printer_name || 'BPE_Engine',
                offer_price: resolvedOffer.total_price,
                customer: {
                    id: targetUserId,
                    email: user?.email || 'customer@example.com',
                    name: user?.name || 'Customer',
                    role: user?.role || 'AUTHOR',
                    billing: user?.billing || {},
                    delivery: user?.delivery || { country: item.specs.delivery_country }
                },
                specs: session.normalized_specs,
                pricing: {
                    currency: resolvedOffer.currency,
                    selected_by: "CUSTOMER",
                    customer_selected_offer_id: offer_id,
                    recommended_offer_id: null, // We could pull this from session if needed
                    total_price: resolvedOffer.total_price,
                    total_cost: resolvedOffer.total_price,
                    margin: 0, // Calculations happen in Control Plane usually
                    margin_percent: 0
                },
                delivery: {
                    country: session.normalized_specs.delivery_country,
                    lead_time_days: (resolvedOffer.production_days || 0) + (resolvedOffer.delivery_days || 0),
                    estimated_delivery_time: resolvedOffer.estimated_delivery_time || ''
                },
                metadata_json: {
                    contract: "BPE_MARKETPLACE_NATIVE",
                    app: "PrintPricePro_BookPrice",
                    bpe_endpoint: "/api/marketplace/offers",
                    payment_status: "PENDING",
                    customer_selected_offer: resolvedOffer.raw_offer_snapshot || resolvedOffer,
                    // v5.3 Phase 4 audit metadata
                    pricing: {
                        offer_session_id,
                        offer_id,
                        input_specs: session.input_specs,
                        expires_at: session.expires_at,
                        signature_validated_at: new Date().toISOString()
                    },
                    production_files: finalProductionFiles,
                    invoice_payment: {
                        payment_status: "PENDING"
                    }
                },
                status: finalProductionFiles.status === 'FILES_VALIDATED' ? 'FILES_VALIDATED' : 'FILES_PENDING'
            };

            const response = await axios.post(controlPlaneOrdersUrl, payload, { headers, timeout: 15000 });
            createdOrders.push(response.data.order || response.data);

            // Mark as selected in session registry
            await repositories.offerSessions.markSelectedOffer(offer_session_id, offer_id);
        }

        // Clear cart after successful checkout
        carts.set(sessionId, []);

        const firstOrder = createdOrders[0] || {};
        const firstRef = firstOrder.order_ref || firstOrder.orderRef || null;

        // Update associations with the real order ID
        await repositories.productionFiles.updateAssociation(interiorId, { order_ref: firstRef });
        await repositories.productionFiles.updateAssociation(coverId, { order_ref: firstRef });

        res.json({
            success: true,
            order_ref: firstRef,
            orders: createdOrders,
            payment_url: null, // v5.3: Blocked until validation
            checkout_url: null,
            message: "Order request created. Payment pending until production files are ingested and validated."
        });
    } catch (err) {
        console.error("[CHECKOUT_ERROR]", err.message);
        res.status(502).json({ error: "Failed to submit order to Control Plane." });
    }
});

// 📂 ORDER INTENT API (v5.3 Phase 5)

app.post('/api/order-intents', async (req, res) => {
    console.log(`[ORDER_INTENT_CREATE_REQUEST]`);
    const sessionId = getOrCreateSessionId(req, res);
    const identity = resolveRequestIdentity(req);
    const {
        offer_session_id,
        offer_id,
        production_files,
        customer,
        cart_id
    } = req.body;

    // 1. Resolve & Verify Offer
    if (!offer_session_id || !offer_id) {
        return res.status(400).json({ error: "MISSING_OFFER_IDS", message: "Offer session ID and offer ID are required." });
    }

    const resolvedOffer = await getOfferFromSession(offer_session_id, offer_id);
    if (!resolvedOffer) {
        console.error(`[ORDER_INTENT_REJECTED] Offer validation failed for ofs=${offer_session_id} off=${offer_id}`);
        return res.status(400).json({ error: "OFFER_VERIFICATION_FAILED", message: "The selected offer is invalid, expired, or tampered." });
    }

    // 2. Resolve & Verify Production Files
    if (!production_files || !production_files.interior_pdf_file_id || !production_files.cover_pdf_file_id) {
        return res.status(400).json({ error: "MISSING_FILES", message: "Both Interior and Cover PDF file IDs are required." });
    }

    const interior = await repositories.productionFiles.getById(production_files.interior_pdf_file_id);
    const cover = await repositories.productionFiles.getById(production_files.cover_pdf_file_id);

    if (!interior || !cover) {
        return res.status(400).json({ error: "FILES_NOT_FOUND", message: "One or both production files were not found in the registry." });
    }

    // Strict role validation
    if (interior.role !== 'INTERIOR_PDF' || cover.role !== 'COVER_PDF') {
        return res.status(400).json({ error: "ROLE_MISMATCH", message: "File roles do not match registry expectations." });
    }

    // Strict status validation
    const allowedStatuses = ['UPLOADED', 'VALIDATED'];
    if (!allowedStatuses.includes(interior.status) || !allowedStatuses.includes(cover.status)) {
        console.error(`[ORDER_INTENT_REJECTED] File status not allowed. Int=${interior.status} Cov=${cover.status}`);
        return res.status(400).json({ error: "FILE_STATUS_NOT_READY", message: "Production files must be fully uploaded and validated before creating intent." });
    }

    // 3. Create Order Intent
    const order_intent_id = `oi_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const public_ref = `PPOS-OI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const session = await repositories.offerSessions.getById(offer_session_id);

    const intentRecord = {
        order_intent_id,
        public_ref,
        session_id: sessionId,
        cart_id: cart_id || null,
        user_id: req.body.user_id || null,
        status: "FILES_UPLOADED",
        lifecycle: {
            quote_status: "SIGNED",
            files_status: "UPLOADED",
            preflight_status: "NOT_STARTED",
            invoice_status: "NOT_CREATED",
            payment_status: "NOT_STARTED",
            control_plane_order_status: "NOT_CREATED",
            printhouse_handoff_status: "NOT_STARTED"
        },
        offer: {
            offer_session_id,
            offer_id,
            selected_offer_snapshot: resolvedOffer.raw_offer_snapshot || resolvedOffer,
            signature_validated_at: new Date().toISOString()
        },
        production_files: {
            interior_pdf_file_id: production_files.interior_pdf_file_id,
            cover_pdf_file_id: production_files.cover_pdf_file_id,
            files: [
                { role: 'INTERIOR_PDF', file_id: production_files.interior_pdf_file_id, filename: interior.filename },
                { role: 'COVER_PDF', file_id: production_files.cover_pdf_file_id, filename: cover.filename }
            ]
        },
        customer: customer || {},
        totals: {
            currency: resolvedOffer.currency,
            total_price: resolvedOffer.total_price,
            tax_amount: 0,
            shipping_amount: 0,
            grand_total: resolvedOffer.total_price
        },
        created_at: new Date().toISOString(),
        customer_paper_preferences: resolveCustomerPaperPreferences(
            req.body.customer_paper_preferences,
            session.normalized_specs?.customer_paper_preferences || session.input_specs?.customer_paper_preferences
        )
    };

    // Build Canonical Snapshot
    const snapshot = buildCanonicalOrderSnapshot(intentRecord, session, resolvedOffer, interior, cover);
    intentRecord.payload = { order_snapshot: snapshot };
    intentRecord.customer_paper_preferences = snapshot.customer_paper_preferences !== undefined
        ? snapshot.customer_paper_preferences
        : intentRecord.customer_paper_preferences;

    // Prepare Preflight
    intentRecord.preflight = snapshot.preflight;
    
    // Prepare Payment
    intentRecord.payment = snapshot.payment;

    // Prepare Control Plane Handoff
    const handoffPayload = buildControlPlaneHandoffPayload(intentRecord);
    intentRecord.control_plane = {
        ...snapshot.control_plane,
        payload: handoffPayload
    };

    const cpOrderId = req.body.control_plane_order_id || 
                      req.body.controlPlaneOrderId || 
                      interior.controlPlaneOrderId || 
                      cover.controlPlaneOrderId || 
                      (interior.metadata && interior.metadata.controlPlaneOrderId) || 
                      (cover.metadata && cover.metadata.controlPlaneOrderId) || 
                      null;

    if (cpOrderId) {
        intentRecord.control_plane_order_id = cpOrderId;
        intentRecord.control_plane.order_id = cpOrderId;
        if (intentRecord.payload && intentRecord.payload.order_snapshot) {
            if (!intentRecord.payload.order_snapshot.control_plane) {
                intentRecord.payload.order_snapshot.control_plane = {};
            }
            intentRecord.payload.order_snapshot.control_plane.order_id = cpOrderId;
        }
    }

    await repositories.orderIntents.create(intentRecord);
    console.log(`[ORDER_INTENT_PERSISTED] id=${order_intent_id} status=${intentRecord.status} lifecycle=${intentRecord.lifecycle.quote_status}`);

    // 4. Update Registry Associations
    await repositories.productionFiles.updateAssociation(production_files.interior_pdf_file_id, { order_intent_id });
    await repositories.productionFiles.updateAssociation(production_files.cover_pdf_file_id, { order_intent_id });
    await repositories.offerSessions.markSelectedOffer(offer_session_id, offer_id);

    await repositories.auditEvents.append({
        entity_type: 'ORDER_INTENT',
        entity_id: order_intent_id,
        event_type: 'INTENT_CREATED',
        actor_id: identity.user?.id || null,
        session_id: identity.sessionId || null,
        ip: req.ip,
        payload: { public_ref, offer_id }
    });

    console.log(`[ORDER_INTENT_CREATED] id=${order_intent_id} ref=${public_ref}`);

    // v5.3: Trigger Notification (Phase 13)
    // Non-blocking
    sendOrderNotification(intentRecord, 'ORDER_INTENT_CREATED').catch(e => console.error(`[NOTIFICATION_CRASH_PROTECT] ${e.message}`));

    res.json({
        ok: true,
        order_intent_id,
        public_ref,
        status: intentRecord.status,
        lifecycle: intentRecord.lifecycle,
        next_required_action: "PREFLIGHT_VALIDATION_PENDING"
    });
});

app.get('/api/order-intents/:id', async (req, res) => {
    const intent = await repositories.orderIntents.getById(req.params.id);
    if (!intent) return res.status(404).json({ error: "NOT_FOUND" });

    if (!assertOrderIntentAccess(req, intent)) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_ORDER_INTENT_ACCESS" });
    }

    // Sanitize
    const { ...sanitized } = intent;
    res.json({ ok: true, order_intent: sanitized });
});

app.get('/api/order-intents', async (req, res) => {
    const identity = resolveRequestIdentity(req);
    console.log(`[MY_ORDERS_LIST_REQUEST] session=${identity.sessionId} user_id=${identity.user?.id || 'none'}`);

    const { session_id, user_id } = req.query;
    const targetSessionId = session_id || identity.sessionId;

    let intents = [];
    try {
        if (user_id) {
            intents = await repositories.orderIntents.listByUser(user_id);
        } else if (targetSessionId) {
            intents = await repositories.orderIntents.listBySession(targetSessionId);
        } else {
            console.warn(`[MY_ORDERS_LIST_DENIED] reason=MISSING_IDENTITY ip=${req.ip}`);
            return res.status(400).json({ error: "MISSING_QUERY", message: "session_id or user_id is required." });
        }

        // Ownership check (double-safe filter)
        const allowedIntents = intents.filter(i => assertOrderIntentAccess(req, i));
        
        console.log(`[MY_ORDERS_LIST_RESULT] count=${allowedIntents.length} session=${identity.sessionId}`);

        res.json({
            ok: true,
            orders: allowedIntents.map(i => ({
                order_intent_id: i.order_intent_id,
                public_ref: i.public_ref,
                status: i.status,
                lifecycle: i.lifecycle,
                totals: i.totals,
                created_at: i.created_at,
                // v5.3: Include metadata for rich listing
                specs: i.payload?.order_snapshot?.specs || getPrinterIdentitySafe(i).raw_offer_snapshot?.specs || {},
                offer: getSelectedOfferSnapshotSafe(i) || {},
                production_files: i.production_files || {}
            })),
            // Maintain backward compatibility for any existing consumers
            order_intents: allowedIntents.map(i => ({
                order_intent_id: i.order_intent_id,
                public_ref: i.public_ref,
                status: i.status,
                created_at: i.created_at
            }))
        });
    } catch (err) {
        console.error(`[MY_ORDERS_LIST_FAILED] error=${err.message}`);
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: "Unable to load orders. Please try again." });
    }
});

// Compatibility endpoint for "My Orders" panel
app.get('/api/orders', async (req, res) => {
    const identity = resolveRequestIdentity(req);
    const sessionId = identity.sessionId || getOrCreateSessionId(req, res);

    const intents = await repositories.orderIntents.listBySession(sessionId);

    // Ownership check (redundant but safe)
    const allowedIntents = intents.filter(i => assertOrderIntentAccess(req, i));

    res.json({
        success: true,
        orders: allowedIntents.map(i => ({
            id: i.order_intent_id,
            order_ref: i.public_ref,
            status: i.status,
            lifecycle: i.lifecycle,
            offer_price: i.totals.total_price,
            currency: i.totals.currency,
            offer_print_house: getSelectedOfferSnapshotSafe(i)?.printer_name || 'BPE Engine',
            created_at: i.created_at,
            is_intent: true,
            specs: getPrinterIdentitySafe(i).raw_offer_snapshot?.specs || {}
        }))
    });
});

// ✈️ PREFLIGHT ORCHESTRATION (v5.3 Phase 6)

/**
 * Creates a Preflight job for a specific production file.
 */
const createPreflightJobForFile = async (orderIntent, fileRecord) => {
    const { order_intent_id, public_ref } = orderIntent;
    const { file_id, role, storage } = fileRecord;

    console.log(`[PREFLIGHT_JOB_CREATE_REQUEST] intent=${order_intent_id} role=${role} file=${file_id}`);

    if (!PREFLIGHT_ENABLED) {
        return { status: 'NOT_CONFIGURED', error: 'Preflight not enabled' };
    }

    try {
        const filePath = path.join(PRODUCTION_FILES_DIR, storage.key);
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found on disk: ${storage.key}`);
        }

        const formData = new FormData();
        const fileData = fs.readFileSync(filePath);
        const blob = new Blob([fileData], { type: 'application/pdf' });
        formData.append('file', blob, fileRecord.filename);
        formData.append('metadata', JSON.stringify({
            order_intent_id,
            public_ref,
            file_id,
            role,
            source: "MARKETPLACE_ORDER_INTENT",
            checksum: fileRecord.checksum?.value
        }));

        const response = await axios.post(`${PREFLIGHT_BASE_URL}/api/v2/jobs`, formData, {
            headers: {
                'Authorization': `Bearer ${PREFLIGHT_API_TOKEN}`,
                'Content-Type': 'multipart/form-data'
            },
            timeout: 30000
        });

        const jobData = response.data.job || response.data;
        console.log(`[PREFLIGHT_JOB_CREATED] intent=${order_intent_id} role=${role} job_id=${jobData.jobId || jobData.id}`);

        return {
            role,
            file_id,
            job_id: jobData.jobId || jobData.id,
            status: 'PENDING',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    } catch (err) {
        console.error(`[PREFLIGHT_JOB_CREATE_FAILED] intent=${order_intent_id} role=${role} error=${err.message}`);
        return {
            role,
            file_id,
            status: 'ERROR',
            error: err.message,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }
};

/**
 * Polls the status of a specific Preflight job.
 */
const pollPreflightJobStatus = async (jobId) => {
    if (!PREFLIGHT_ENABLED || !jobId) return null;

    try {
        const response = await axios.get(`${PREFLIGHT_BASE_URL}/api/v2/jobs/${jobId}`, {
            headers: { 'Authorization': `Bearer ${PREFLIGHT_API_TOKEN}` },
            timeout: 10000
        });

        const data = response.data.job || response.data;
        return {
            status: data.status, // PENDING, RUNNING, PASSED, FAILED, ERROR
            risk_level: data.riskLevel || data.risk_level,
            risk_score: data.riskScore || data.risk_score,
            issue_count: data.issueCount || data.issue_count,
            critical_count: data.criticalCount || data.critical_count,
            findings: data.findings || [],
            artifacts: data.artifacts || {},
            updated_at: new Date().toISOString()
        };
    } catch (err) {
        console.error(`[PREFLIGHT_POLL_FAILED] job=${jobId} error=${err.message}`);
        return null;
    }
};

app.post('/api/order-intents/:id/preflight/start', async (req, res) => {
    const orderIntentId = req.params.id;
    const intent = await repositories.orderIntents.getById(orderIntentId);

    if (!intent) {
        return res.status(404).json({ error: "ORDER_INTENT_NOT_FOUND", message: "The order intent was not found." });
    }

    if (!assertOrderIntentAccess(req, intent)) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_ORDER_INTENT_ACCESS" });
    }

    console.log(`[PREFLIGHT_START_REQUEST] intent=${orderIntentId}`);

    if (!PREFLIGHT_ENABLED) {
        await repositories.orderIntents.updateStatus(orderIntentId, intent.status, { preflight_status: "NOT_CONFIGURED" });
        await repositories.orderIntents.update(orderIntentId, { preflight: { status: "NOT_CONFIGURED", jobs: [] } });
        console.warn(`[PREFLIGHT_NOT_CONFIGURED] intent=${orderIntentId}`);
        return res.status(400).json({
            error: "PREFLIGHT_NOT_CONFIGURED",
            message: "Preflight validation is not enabled in this environment."
        });
    }

    // Verify files exist and are ready
    const interior = await repositories.productionFiles.getById(intent.production_files.interior_pdf_file_id);
    const cover = await repositories.productionFiles.getById(intent.production_files.cover_pdf_file_id);

    if (!interior || !cover) {
        return res.status(400).json({ error: "PRODUCTION_FILE_NOT_FOUND", message: "Associated production files missing in registry." });
    }

    const readyStatuses = ['UPLOADED', 'VALIDATED'];
    if (!readyStatuses.includes(interior.status) || !readyStatuses.includes(cover.status)) {
        return res.status(400).json({ error: "PRODUCTION_FILE_NOT_READY", message: "Files must be fully uploaded before preflight." });
    }

    // Initialize preflight tracking
    const preflightState = {
        status: 'PENDING',
        jobs: [],
        started_at: new Date().toISOString()
    };

    await repositories.orderIntents.update(orderIntentId, { preflight: preflightState });
    await repositories.orderIntents.updateStatus(orderIntentId, "PREFLIGHT_PENDING", { preflight_status: "PENDING" });

    // Start jobs asynchronously
    const interiorJobPromise = createPreflightJobForFile(intent, interior);
    const coverJobPromise = createPreflightJobForFile(intent, cover);

    const [iJob, cJob] = await Promise.all([interiorJobPromise, coverJobPromise]);

    preflightState.jobs = [iJob, cJob];

    // Determine overall status
    if (iJob.status === 'ERROR' || cJob.status === 'ERROR') {
        preflightState.status = (iJob.status === 'ERROR' && cJob.status === 'ERROR') ? 'ERROR' : 'PARTIAL';
    } else {
        preflightState.status = 'RUNNING';
    }

    await repositories.orderIntents.update(orderIntentId, { preflight: preflightState });

    res.json({
        ok: true,
        order_intent_id: orderIntentId,
        preflight_status: preflightState.status,
        jobs: preflightState.jobs
    });
});

app.get('/api/order-intents/:id/preflight', async (req, res) => {
    const orderIntentId = req.params.id;
    const intent = await repositories.orderIntents.getById(orderIntentId);

    if (!intent || !intent.preflight) {
        return res.status(404).json({ error: "PREFLIGHT_NOT_STARTED" });
    }

    if (!assertOrderIntentAccess(req, intent)) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_ORDER_INTENT_ACCESS" });
    }

    console.log(`[PREFLIGHT_POLL_REQUEST] intent=${orderIntentId}`);

    const currentPreflight = intent.preflight;
    let anyChanged = false;

    for (let i = 0; i < currentPreflight.jobs.length; i++) {
        const job = currentPreflight.jobs[i];
        if (job.job_id && !['PASSED', 'FAILED', 'ERROR'].includes(job.status)) {
            const freshStatus = await pollPreflightJobStatus(job.job_id);
            if (freshStatus) {
                currentPreflight.jobs[i] = { ...job, ...freshStatus };
                anyChanged = true;
                console.log(`[PREFLIGHT_JOB_STATUS_UPDATED] job=${job.job_id} status=${freshStatus.status}`);

                // If passed, update production file registry
                if (freshStatus.status === 'PASSED') {
                    await repositories.productionFiles.updateStatus(job.file_id, 'VALIDATED', { preflight_job_id: job.job_id });
                }
            }
        }
    }

    if (anyChanged) {
        currentPreflight.last_checked_at = new Date().toISOString();

        // Compute overall status
        const allStatuses = currentPreflight.jobs.map(j => j.status);
        if (allStatuses.every(s => s === 'PASSED')) {
            currentPreflight.status = 'PASSED';
            currentPreflight.completed_at = new Date().toISOString();
            await repositories.orderIntents.updateStatus(orderIntentId, "PREFLIGHT_VALIDATED", { preflight_status: "SUCCESS" });
            console.log(`[PREFLIGHT_ORDER_INTENT_PASSED] intent=${orderIntentId}`);
            sendOrderNotification(intent, 'PREFLIGHT_PASSED').catch(e => console.error(`[NOTIFICATION_CRASH_PROTECT] ${e.message}`));
        } else if (allStatuses.some(s => s === 'FAILED')) {
            currentPreflight.status = 'FAILED';
            currentPreflight.completed_at = new Date().toISOString();
            await repositories.orderIntents.updateStatus(orderIntentId, "PREFLIGHT_FAILED", { preflight_status: "FAILED" });
            console.log(`[PREFLIGHT_ORDER_INTENT_FAILED] intent=${orderIntentId}`);

            // v5.3: Trigger Exception (Phase 14)
            await openOrderIntentException(intent, {
                status: "CUSTOMER_REUPLOAD_REQUIRED",
                reason_code: "PREFLIGHT_FAILED",
                reason_message: "One or more production files failed preflight validation.",
                customer_message: "Your print files need attention before production can continue. Please upload corrected files.",
                source: "PREFLIGHT",
                blocking: true
            });

            sendOrderNotification(intent, 'PREFLIGHT_FAILED').catch(e => console.error(`[NOTIFICATION_CRASH_PROTECT] ${e.message}`));
        } else if (allStatuses.some(s => s === 'ERROR')) {
            currentPreflight.status = 'ERROR';
            await repositories.orderIntents.updateStatus(orderIntentId, intent.status, { preflight_status: "FAILED" });
        } else if (allStatuses.some(s => ['RUNNING', 'PENDING'].includes(s))) {
            currentPreflight.status = 'RUNNING';
        }

        await repositories.orderIntents.update(orderIntentId, { preflight: currentPreflight });
    }

    res.json({
        ok: true,
        preflight: currentPreflight
    });
});

// ---- Billing & Payment Gate (v5.3 - Phase 7) ----

/**
 * Creates a Stripe Checkout Session for an Order Intent.
 */
async function createStripeCheckoutSession(orderIntent) {
    if (!STRIPE_SECRET_KEY) {
        throw new Error("STRIPE_NOT_CONFIGURED");
    }

    let stripe;
    try {
        stripe = require('stripe')(STRIPE_SECRET_KEY);
    } catch (e) {
        console.error("[BILLING_STRIPE_LOAD_FAILED] Could not load stripe package.");
        throw new Error("STRIPE_PACKAGE_MISSING");
    }

    const printerIdentity = getPrinterIdentitySafe(orderIntent);
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                price_data: {
                    currency: orderIntent.totals.currency.toLowerCase(),
                    product_data: {
                        name: `Order Reference: ${orderIntent.public_ref}`,
                        description: `PrintPricePro BookPrice Marketplace Order (${printerIdentity.printerName})`,
                    },
                    unit_amount: Math.round(orderIntent.totals.grand_total * 100), // Stripe uses cents
                },
                quantity: 1,
            },
        ],
        mode: 'payment',
        metadata: {
            order_intent_id: orderIntent.order_intent_id,
            public_ref: orderIntent.public_ref,
            offer_session_id: orderIntent.offer?.offer_session_id || null,
            offer_id: orderIntent.offer?.offer_id || null,
        },
        success_url: `${PUBLIC_APP_BASE_URL}/?payment=success&order_intent_id=${orderIntent.order_intent_id}`,
        cancel_url: `${PUBLIC_APP_BASE_URL}/?payment=cancelled&order_intent_id=${orderIntent.order_intent_id}`,
    });

    return session;
}

/**
 * POST /api/order-intents/:id/billing/create
 * Orchestrates invoice and payment creation.
 */
app.post('/api/order-intents/:id/billing/create', async (req, res) => {
    const order_intent_id = req.params.id;
    const intent = await repositories.orderIntents.getById(order_intent_id);

    if (!intent) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    if (!assertOrderIntentAccess(req, intent)) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_ORDER_INTENT_ACCESS" });
    }

    // Guardrail: if intent has control_plane.order_id or control_plane_order_id, return 409
    const cpOrderId = intent.control_plane?.order_id || intent.control_plane_order_id;
    if (cpOrderId) {
        return res.status(409).json({
            ok: false,
            error: "USE_CP_INVOICE_PROXY",
            cpOrderId,
            message: "This order is governed by ControlPlane invoice/payment flow."
        });
    }

    console.log(`[BILLING_CREATE_REQUEST] id=${order_intent_id} provider=${PAYMENT_PROVIDER}`);

    // 1. Preflight Gate
    if (!intent.preflight || intent.preflight.status !== 'PASSED') {
        console.warn(`[BILLING_REJECTED_PREFLIGHT_NOT_PASSED] id=${order_intent_id} status=${intent.preflight?.status}`);
        return res.status(409).json({
            ok: false,
            error: "PREFLIGHT_NOT_PASSED",
            message: "Invoice and payment can only be created after files pass Preflight validation."
        });
    }

    // 2. Billing Integrity Check
    if (!PAYMENTS_ENABLED) {
        console.warn(`[PAYMENT_PROVIDER_NOT_CONFIGURED] id=${order_intent_id} PAYMENTS_ENABLED=false`);
        return res.status(501).json({
            ok: false,
            error: "BILLING_NOT_CONFIGURED",
            message: "Billing is not enabled in this environment."
        });
    }

    // 3. Idempotency Check
    if (intent.invoice && intent.invoice.status !== 'ERROR' && intent.payment && intent.payment.status !== 'NOT_STARTED') {
        console.log(`[BILLING_IDEMPOTENT_RETURN] id=${order_intent_id}`);
        return res.json({
            ok: true,
            provider: intent.payment.provider,
            invoice: intent.invoice,
            payment: intent.payment,
            next_required_action: intent.payment.status === 'PENDING' ? "PAYMENT_PENDING" : "PAYMENT_COMPLETED"
        });
    }

    // 4. Resource Verification
    // Ensure files still exist and are valid in registry
    // (In a real DB we'd check associations, here we assume registry is consistent)

    // 5. Create Billing Objects
    const timestamp = new Date().toISOString();
    const shortDate = timestamp.split('T')[0].replace(/-/g, '');
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();

    const invoice_id = `inv_${crypto.randomUUID()}`;
    const invoice_number = `${BANK_TRANSFER_REFERENCE_PREFIX}-INV-${shortDate}-${randomSuffix}`;

    const newInvoice = {
        invoice_id,
        invoice_number,
        status: 'CREATED',
        amount: intent.totals.grand_total,
        currency: intent.totals.currency,
        created_at: timestamp,
        updated_at: timestamp
    };

    const newPayment = {
        provider: PAYMENT_PROVIDER,
        status: 'PENDING',
        created_at: timestamp,
        updated_at: timestamp
    };

    // Refactor to async flow
    (async () => {
        try {
            if (PAYMENT_PROVIDER === 'stripe') {
                const session = await createStripeCheckoutSession(intent);
                newPayment.checkout_url = session.url;
                newPayment.payment_intent_id = session.id;
                console.log(`[PAYMENT_STRIPE_SESSION_CREATED] id=${order_intent_id} session=${session.id}`);
            } else if (PAYMENT_PROVIDER === 'bank_transfer') {
                if (!BANK_TRANSFER_ENABLED) {
                    throw new Error("BANK_TRANSFER_DISABLED");
                }
                newPayment.bank_transfer_reference = `${BANK_TRANSFER_REFERENCE_PREFIX}-${intent.public_ref}`;
                newPayment.instructions = {
                    account_name: BANK_TRANSFER_ACCOUNT_NAME,
                    iban: BANK_TRANSFER_IBAN,
                    swift: BANK_TRANSFER_SWIFT,
                    amount: intent.totals.grand_total,
                    currency: intent.totals.currency,
                    reference: newPayment.bank_transfer_reference
                };
                console.log(`[PAYMENT_BANK_TRANSFER_CREATED] id=${order_intent_id} ref=${newPayment.bank_transfer_reference}`);
            } else {
                throw new Error("UNKNOWN_PROVIDER");
            }

            // Update Intent
            intent.invoice = newInvoice;
            intent.payment = newPayment;
            intent.lifecycle.invoice_status = 'CREATED';
            intent.lifecycle.payment_status = 'PENDING';
            intent.updated_at = timestamp;

            await repositories.orderIntents.update(intent.order_intent_id, intent);
            console.log(`[BILLING_INVOICE_CREATED] id=${order_intent_id} inv=${invoice_number}`);

            // v5.3: Trigger Notification (Phase 13)
            sendOrderNotification(intent, 'BILLING_CREATED').catch(e => console.error(`[NOTIFICATION_CRASH_PROTECT] ${e.message}`));

            res.json({
                ok: true,
                provider: PAYMENT_PROVIDER,
                invoice: newInvoice,
                payment: newPayment,
                next_required_action: PAYMENT_PROVIDER === 'stripe' ? "STRIPE_CHECKOUT_REQUIRED" : "BANK_TRANSFER_PAYMENT_PENDING"
            });

        } catch (err) {
            console.error(`[BILLING_CREATE_FAILED] id=${order_intent_id} error=${err.message}`);
            res.status(500).json({
                ok: false,
                error: err.message === "STRIPE_NOT_CONFIGURED" ? "STRIPE_NOT_CONFIGURED" : "BILLING_GENERATION_FAILED",
                message: err.message
            });
        }
    })();
});

/**
 * GET /api/order-intents/:id/payment
 * Returns the current payment status and instructions.
 */
app.get('/api/order-intents/:id/payment', async (req, res) => {
    const intent = await repositories.orderIntents.getById(req.params.id);
    if (!intent) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    if (!assertOrderIntentAccess(req, intent)) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_ORDER_INTENT_ACCESS" });
    }

    res.json({
        ok: true,
        invoice: intent.invoice,
        payment: intent.payment,
        lifecycle: intent.lifecycle
    });
});

/**
 * POST /api/payments/stripe/webhook
 * Industrial Stripe webhook handler with Phase 9 signature verification.
 */
app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;

    try {
        if (!STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET_MISSING");
        if (!stripe) throw new Error("STRIPE_NOT_CONFIGURED");
        event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`[STRIPE_WEBHOOK_REJECTED] error=${err.message} ip=${req.ip}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[STRIPE_WEBHOOK_VERIFIED] type=${event.type} id=${event.id}`);

    try {
        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const orderIntentId = session.metadata?.order_intent_id;

                if (!orderIntentId) {
                    console.warn(`[STRIPE_WEBHOOK_WARNING] No order_intent_id in session metadata: ${session.id}`);
                    break;
                }

                const intent = await repositories.orderIntents.getById(orderIntentId);
                if (!intent) {
                    console.error(`[STRIPE_WEBHOOK_ERROR] Intent not found for session metadata: ${orderIntentId}`);
                    break;
                }

                console.log(`[STRIPE_PAYMENT_SUCCESS] intent=${orderIntentId} session=${session.id}`);

                intent.payment.status = 'PAID';
                intent.payment.stripe_event_id = event.id;
                intent.lifecycle.payment_status = 'PAID';
                intent.updated_at = new Date().toISOString();

                await repositories.orderIntents.update(orderIntentId, intent);

                // v5.3: Trigger Notification (Phase 13)
                sendOrderNotification(intent, 'PAYMENT_CONFIRMED').catch(e => console.error(`[NOTIFICATION_CRASH_PROTECT] ${e.message}`));

                if (AUTO_FINALIZE_AFTER_PAYMENT) {
                    console.log(`[AUTO_FINALIZE_TRIGGERED] intent=${orderIntentId}`);
                    await finalizeOrderIntent(orderIntentId).catch(err => {
                        console.error(`[AUTO_FINALIZE_FAILED] intent=${orderIntentId} error=${err.message}`);
                    });
                }
                break;
            }
            case 'payment_intent.payment_failed': {
                const intent = event.data.object;
                console.warn(`[STRIPE_PAYMENT_FAILED] id=${intent.id} message=${intent.last_payment_error?.message}`);
                break;
            }
            default:
                console.log(`[STRIPE_WEBHOOK_UNHANDLED_EVENT] type=${event.type}`);
        }
    } catch (err) {
        console.error(`[STRIPE_WEBHOOK_ORCHESTRATION_FAILED] event=${event.id} error=${err.message}`);
        return res.status(500).json({ error: "INTERNAL_WEBHOOK_ERROR" });
    }

    res.json({ received: true });
});

// ---- Finalization & Handoff (v5.3 - Phase 8) ----

/**
 * Builds the comprehensive payload for Control Plane order creation.
 */
async function buildControlPlaneOrderPayload(orderIntent) {
    const files = await Promise.all(orderIntent.production_files.files.map(async f => {
        const registryFile = await repositories.productionFiles.getById(f.file_id);
        const preflightJob = orderIntent.preflight?.jobs.find(j => j.file_id === f.file_id);
        return {
            file_id: f.file_id,
            role: f.role,
            filename: f.filename,
            size_bytes: registryFile?.size_bytes,
            checksum: registryFile?.checksum,
            status: registryFile?.status,
            storage: { provider: registryFile?.storage?.provider, key: registryFile?.storage?.key },
            preflight_job_id: preflightJob?.job_id,
            preflight_summary: preflightJob ? {
                status: preflightJob.status,
                risk_level: preflightJob.risk_level,
                issue_count: preflightJob.issue_count
            } : null
        };
    }));

    return {
        source: "PPOS_MARKETPLACE",
        order_intent_id: orderIntent.order_intent_id,
        public_ref: orderIntent.public_ref,
        customer: orderIntent.customer,
        pricing: {
            offer_session_id: orderIntent.offer?.offer_session_id || null,
            offer_id: orderIntent.offer?.offer_id || null,
            selected_offer_snapshot: getSelectedOfferSnapshotSafe(orderIntent),
            totals: orderIntent.totals
        },
        production_files: files,
        preflight: {
            status: orderIntent.preflight?.status,
            jobs: orderIntent.preflight?.jobs || [],
            artifacts: {} // artifacts would be linked here
        },
        billing: {
            invoice: orderIntent.invoice,
            payment: orderIntent.payment
        },
        printhouse: {
            printhouse_id: getPrinterIdentitySafe(orderIntent).printerId,
            printhouse_name: getPrinterIdentitySafe(orderIntent).printerName
        },
        metadata_json: {
            marketplace_phase: "PAYMENT_CONFIRMED_HANDOFF",
            created_from_order_intent: true,
            trace: {
                order_intent_id: orderIntent.order_intent_id,
                public_ref: orderIntent.public_ref,
                session_id: orderIntent.session_id,
                created_at: orderIntent.created_at
            }
        }
    };
}

/**
 * Orchestrates the finalization and handoff of an Order Intent.
 */
async function finalizeOrderIntent(orderIntentId) {
    const intent = await repositories.orderIntents.getById(orderIntentId);
    if (!intent) throw new Error("NOT_FOUND");

    console.log(`[FINALIZE_REQUEST] id=${orderIntentId} current_cp_status=${intent.control_plane?.status}`);

    // 1. Idempotency Check
    if (intent.control_plane?.status === 'CREATED') {
        console.log(`[FINALIZE_IDEMPOTENT_RETURN] id=${orderIntentId} ref=${intent.control_plane.order_ref}`);
        return { ok: true, already_finalized: true, order_ref: intent.control_plane.order_ref };
    }

    // 2. State Validation
    if (intent.preflight?.status !== 'PASSED') {
        throw new Error("PREFLIGHT_NOT_PASSED");
    }
    if (intent.payment?.status !== 'PAID') {
        throw new Error("PAYMENT_NOT_CONFIRMED");
    }

    // Initialize Control Plane state if missing
    if (!intent.control_plane) {
        intent.control_plane = {
            status: 'READY',
            order_ref: null,
            order_id: null,
            endpoint: CONTROL_PLANE_ORDER_ENDPOINT,
            created_at: null,
            updated_at: null
        };
    }

    if (!CONTROL_PLANE_ORDER_HANDOFF_ENABLED) {
        console.warn(`[CONTROL_PLANE_HANDOFF_NOT_CONFIGURED] id=${orderIntentId}`);
        intent.control_plane.status = 'NOT_CONFIGURED';
        intent.lifecycle.control_plane_order_status = 'NOT_CONFIGURED';
        await repositories.orderIntents.update(orderIntentId, intent);
        throw new Error("CONTROL_PLANE_HANDOFF_NOT_CONFIGURED");
    }

    // 3. Prepare Printhouse Handoff Package
    const printerIdentity = getPrinterIdentitySafe(intent);
    intent.printhouse_handoff = {
        status: 'READY',
        printhouse_id: printerIdentity.printerId,
        printhouse_name: printerIdentity.printerName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    intent.lifecycle.printhouse_handoff_status = 'READY';

    // 4. Submit to Control Plane
    console.log(`[CONTROL_PLANE_ORDER_CREATE_REQUEST] id=${orderIntentId} url=${CONTROL_PLANE_BASE_URL}${CONTROL_PLANE_ORDER_ENDPOINT}`);

    const payload = await buildControlPlaneOrderPayload(intent);
    const headers = {
        ...buildControlPlaneHeaders(),
        "X-Idempotency-Key": orderIntentId
    };

    intent.control_plane.status = 'CREATING';
    intent.lifecycle.control_plane_order_status = 'CREATING';
    await repositories.orderIntents.update(orderIntentId, intent);

    try {
        const response = await axios.post(`${CONTROL_PLANE_BASE_URL}${CONTROL_PLANE_ORDER_ENDPOINT}`, payload, { headers, timeout: 20000 });
        const cpOrder = response.data.order || response.data;

        intent.control_plane.status = 'CREATED';
        intent.control_plane.order_ref = cpOrder.order_ref || cpOrder.orderRef || null;
        intent.control_plane.order_id = cpOrder.order_id || cpOrder.id || null;
        intent.control_plane.response = response.data;
        intent.control_plane.created_at = new Date().toISOString();
        intent.control_plane.updated_at = new Date().toISOString();

        intent.lifecycle.control_plane_order_status = 'CREATED';
        intent.status = 'CONTROL_PLANE_ORDER_CREATED';

        if (AUTO_HANDOFF_TO_PRINTHOUSE) {
            console.log(`[PRINTHOUSE_HANDOFF_QUEUED] id=${orderIntentId} auto=true`);
            intent.printhouse_handoff.status = 'QUEUED';
            intent.lifecycle.printhouse_handoff_status = 'QUEUED';
        }

        await repositories.orderIntents.update(orderIntentId, intent);
        console.log(`[CONTROL_PLANE_ORDER_CREATED] id=${orderIntentId} ref=${intent.control_plane.order_ref}`);

        // v5.3: Trigger Notification (Phase 13)
        sendOrderNotification(intent, 'CONTROL_PLANE_ORDER_CREATED').catch(e => console.error(`[NOTIFICATION_CRASH_PROTECT] ${e.message}`));

        return { ok: true, order_ref: intent.control_plane.order_ref };
    } catch (err) {
        console.error(`[CONTROL_PLANE_ORDER_CREATE_FAILED] id=${orderIntentId} error=${err.message}`);
        intent.control_plane.status = 'FAILED';
        intent.control_plane.error = { message: err.message, response: err.response?.data };
        intent.control_plane.updated_at = new Date().toISOString();
        intent.lifecycle.control_plane_order_status = 'FAILED';
        await repositories.orderIntents.update(orderIntentId, intent);
        throw err;
    }
}

/**
 * POST /api/order-intents/:id/finalize
 * Manually triggers order finalization after payment is confirmed.
 */
app.post('/api/order-intents/:id/finalize', async (req, res) => {
    try {
        const intent = await repositories.orderIntents.getById(req.params.id);
        if (!intent) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        if (!assertOrderIntentAccess(req, intent)) {
            return res.status(403).json({ ok: false, error: "FORBIDDEN_ORDER_INTENT_ACCESS" });
        }

        const result = await finalizeOrderIntent(req.params.id);
        res.json(result);
    } catch (err) {
        const status = err.message === 'NOT_FOUND' ? 404 : (['PAYMENT_NOT_CONFIRMED', 'PREFLIGHT_NOT_PASSED'].includes(err.message) ? 409 : 500);
        res.status(status).json({
            ok: false,
            error: err.message,
            message: err.message === 'CONTROL_PLANE_HANDOFF_NOT_CONFIGURED' ? "Control Plane order handoff is disabled." : err.message
        });
    }
});

// ---- Printhouse Dispatch & Package Layer (v5.3 - Phase 11) ----

/**
 * Builds a secure dispatch package from a paid/validated Order Intent.
 */
async function buildDispatchPackage(intent) {
    const packageId = `dp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + DISPATCH_PACKAGE_TTL_HOURS * 3600000).toISOString();

    // Resolve all files from registry
    const files = await Promise.all(intent.production_files.files.map(async f => {
        const regFile = await repositories.productionFiles.getById(f.file_id);
        const preflightJob = intent.preflight?.jobs.find(j => j.file_id === f.file_id);
        return {
            file_id: f.file_id,
            role: f.role,
            filename: f.filename,
            checksum: regFile?.checksum,
            size_bytes: regFile?.size_bytes,
            storage_provider: regFile?.storage?.provider,
            storage_key: regFile?.storage?.key,
            preflight_job_id: preflightJob?.job_id,
            access_status: 'READY'
        };
    }));

    const printerIdentity = getPrinterIdentitySafe(intent);
    const resolvedPaperPreferences = intent.customer_paper_preferences !== undefined
        ? intent.customer_paper_preferences
        : (intent.payload?.order_snapshot?.customer_paper_preferences ?? null);
    const pkg = {
        package_id: packageId,
        order_intent_id: intent.order_intent_id,
        public_ref: intent.public_ref,
        printhouse_id: printerIdentity.printerId,
        printhouse_name: printerIdentity.printerName,
        status: 'CREATED',
        control_plane_order_ref: intent.control_plane?.order_ref,
        files: files,
        preflight_summary: {
            status: intent.preflight?.status,
            risk_level: intent.preflight?.jobs[0]?.risk_level, // Simple aggregation
            issue_count: intent.preflight?.jobs.reduce((sum, j) => sum + (j.issue_count || 0), 0),
            jobs: intent.preflight?.jobs || []
        },
        production_specs: {
            ...(intent.payload?.order_snapshot?.specs || {}),
            ...printerIdentity.specs,
            customer_paper_preferences: resolvedPaperPreferences
        },
        customer_paper_preferences: resolvedPaperPreferences,
        customer_summary: {
            name: intent.customer?.name,
            email: intent.customer?.email,
            shipping: intent.customer?.shipping_address
        },
        billing_summary: {
            total_price: intent.totals?.total_price,
            currency: intent.totals?.currency,
            payment_status: intent.payment?.status,
            payment_method: intent.payment?.method
        },
        production_queue: {
            status: 'QUEUED',
            printhouse_id: printerIdentity.printerId,
            printhouse_name: printerIdentity.printerName,
            assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            operator_notes: '',
            production_notes: '',
            shipment: null
        },
        access: {
            token_id: signDispatchToken(packageId, intent.order_intent_id, printerIdentity.printerId, expiresAt),
            expires_at: expiresAt,
            last_accessed_at: null,
            access_count: 0
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    return pkg;
}

// ---- Customer Tracking & Notification Helpers (v5.3 - Phase 13) ----

/**
 * Maps internal production_queue status to customer-friendly status.
 */
function mapProductionToCustomerStatus(prodStatus) {
    switch (prodStatus) {
        case 'QUEUED':
        case 'REVIEWING': return 'SENT_TO_PRINTHOUSE';
        case 'ACCEPTED': return 'ACCEPTED_BY_PRINTHOUSE';
        case 'IN_PREPRESS': return 'IN_PREPRESS';
        case 'IN_PRODUCTION': return 'IN_PRODUCTION';
        case 'COMPLETED': return 'COMPLETED';
        case 'SHIPPED': return 'SHIPPED';
        case 'REJECTED': return 'REJECTED';
        case 'CANCELLED': return 'CANCELLED';
        default: return null;
    }
}

/**
 * Builds a safe, derived view of an order for customer tracking.
 */
async function buildCustomerTrackingView(intent, dispatchPkg = null) {
    const queue = dispatchPkg?.production_queue || {};
    const prodStatus = queue.status;
    const customerStatusFromProd = mapProductionToCustomerStatus(prodStatus);

    // Determine overall customer-friendly status
    let status = 'ORDER_CREATED';
    let headline = 'Order Received';
    let description = 'We have received your order request and are preparing for validation.';
    let next_action = 'Awaiting file validation.';

    // ---- Exception & Issue Handling (v5.3 - Phase 14) ----
    if (intent.exception && intent.exception.status !== 'RESOLVED' && intent.exception.blocking) {
        status = 'ACTION_REQUIRED';
        headline = 'Attention Required';
        description = intent.exception.customer_message || "We encountered an issue processing your order.";

        if (intent.exception.status === 'CUSTOMER_REUPLOAD_REQUIRED') {
            next_action = 'Please re-upload your production files to resolve technical issues.';
        } else if (intent.exception.status === 'PRINTHOUSE_REJECTED') {
            next_action = 'Our production team is reviewing a manufacturing constraint.';
        } else {
            next_action = 'Our team is reviewing your order details.';
        }
    }
    // ---- Standard Status Flow ----
    else if (intent.status === 'CANCELLED') {
        status = 'CANCELLED';
        headline = 'Order Cancelled';
        description = 'This order has been cancelled.';
        next_action = 'Contact support if you believe this is an error.';
    } else if (prodStatus === 'REJECTED') {
        status = 'REJECTED';
        headline = 'Order Rejected';
        description = queue.rejection_reason || 'The printhouse was unable to accept this order.';
        next_action = 'Contact support for details or to resubmit.';
    } else if (customerStatusFromProd === 'SHIPPED') {
        status = 'SHIPPED';
        headline = 'Order Shipped';
        description = 'Your books are on their way!';
        next_action = 'Track your package using the tracking number provided.';
    } else if (customerStatusFromProd === 'COMPLETED') {
        status = 'COMPLETED';
        headline = 'Production Complete';
        description = 'Manufacturing is finished. Preparing for shipment.';
        next_action = 'Awaiting carrier pickup.';
    } else if (customerStatusFromProd === 'IN_PRODUCTION') {
        status = 'IN_PRODUCTION';
        headline = 'In Production';
        description = 'Your books are currently being printed and bound.';
        next_action = 'Stay tuned for shipment updates.';
    } else if (customerStatusFromProd === 'IN_PREPRESS') {
        status = 'IN_PREPRESS';
        headline = 'In Pre-Press';
        description = 'Plates are being made and files are being prepared for the press.';
        next_action = 'Manufacturing starting soon.';
    } else if (customerStatusFromProd === 'ACCEPTED_BY_PRINTHOUSE') {
        status = 'ACCEPTED_BY_PRINTHOUSE';
        headline = 'Accepted by Printhouse';
        description = 'The manufacturing facility has reviewed and accepted your job.';
        next_action = 'Awaiting production slot.';
    } else if (customerStatusFromProd === 'SENT_TO_PRINTHOUSE') {
        status = 'SENT_TO_PRINTHOUSE';
        headline = 'Sent to Production';
        description = 'Order has been dispatched to the selected printhouse for final review.';
        next_action = 'Awaiting printer acceptance.';
    } else if (intent.payment?.status === 'PAID') {
        status = 'PAYMENT_CONFIRMED';
        headline = 'Payment Confirmed';
        description = 'Payment received. Order is being sent to the production queue.';
        next_action = 'Awaiting printhouse dispatch.';
    } else if (intent.invoice?.invoice_number) {
        status = 'PAYMENT_PENDING';
        headline = 'Awaiting Payment';
        description = 'Invoice generated. Please complete payment to start production.';
        next_action = 'Complete payment via the provided link.';
    } else if (intent.preflight?.status === 'PASSED') {
        status = 'FILES_APPROVED';
        headline = 'Files Approved';
        description = 'Your production files have passed automated preflight validation.';
        next_action = 'Awaiting invoice generation.';
    } else if (intent.lifecycle?.preflight_status === 'FAILED') {
        // Fallback for pre-exception orders or direct preflight fails
        status = 'ACTION_REQUIRED';
        headline = 'File Issues Detected';
        description = 'Automated preflight found issues that may affect print quality.';
        next_action = 'Review preflight report and re-upload files.';
    } else if (intent.lifecycle?.preflight_status === 'PROCESSING') {
        status = 'FILES_VALIDATING';
        headline = 'Validating Files';
        description = 'Our engines are analyzing your PDFs for production readiness.';
        next_action = 'Please wait while we check your assets.';
    } else if (intent.production_files?.interior_pdf_file_id) {
        status = 'FILES_RECEIVED';
        headline = 'Files Received';
        description = 'We have received your PDF assets.';
        next_action = 'Awaiting preflight analysis.';
    }

    // Build timeline
    const timeline = [];
    const addStep = (key, label, stepStatus, ts, desc) => {
        timeline.push({ key, label, status: stepStatus, timestamp: ts, description: desc });
    };

    addStep('CREATED', 'Order Created', 'DONE', intent.created_at, 'Marketplace intent recorded.');

    const filesStatus = (intent.lifecycle?.preflight_status === 'PASSED') ? 'DONE' : (intent.production_files?.interior_pdf_file_id ? 'CURRENT' : 'PENDING');
    addStep('FILES', 'Files Validated', filesStatus, intent.preflight?.completed_at, 'PDF production readiness check.');

    const payStatus = (intent.payment?.status === 'PAID') ? 'DONE' : (intent.invoice?.invoice_number ? 'CURRENT' : 'PENDING');
    addStep('PAYMENT', 'Payment', payStatus, intent.payment?.paid_at, 'Financial settlement.');

    const prodStatusTimeline = customerStatusFromProd === 'SHIPPED' || customerStatusFromProd === 'COMPLETED' ? 'DONE' : (customerStatusFromProd ? 'CURRENT' : 'PENDING');
    addStep('PRODUCTION', 'Production', prodStatusTimeline, queue.accepted_at, 'Manufacturing lifecycle.');

    const shipStatus = customerStatusFromProd === 'SHIPPED' ? 'DONE' : 'PENDING';
    addStep('SHIPPING', 'Shipping', shipStatus, queue.shipped_at, 'Logistics and delivery.');

    return {
        public_ref: intent.public_ref,
        order_intent_id: intent.order_intent_id,
        customer_status: status,
        headline,
        description,
        next_action,
        customer_message: queue.customer_message || intent.customer_message || null,
        timeline,
        payment: {
            status: intent.payment?.status || 'PENDING',
            provider: intent.payment?.method,
            invoice_number: intent.invoice?.invoice_number,
            amount: intent.totals?.total_price,
            currency: intent.totals?.currency
        },
        production: {
            status: customerStatusFromProd || 'PENDING',
            printhouse_name: queue.printhouse_name,
            accepted_at: queue.accepted_at,
            started_production_at: queue.started_production_at,
            completed_at: queue.completed_at
        },
        shipping: {
            carrier: queue.shipment?.carrier,
            tracking_number: queue.shipment?.tracking_number,
            shipped_at: queue.shipped_at,
            delivery_estimate: queue.shipment?.delivery_estimate
        },
        files: {
            interior_status: intent.lifecycle?.preflight_status,
            cover_status: intent.lifecycle?.preflight_status,
            preflight_status: intent.preflight?.status
        },
        created_at: intent.created_at,
        updated_at: intent.updated_at
    };
}

/**
 * Orchestrates sending customer notifications.
 */
async function sendOrderNotification(intent, eventType, context = {}) {
    if (!NOTIFICATIONS_ENABLED) {
        console.log(`[NOTIFICATION_SKIPPED_DISABLED] intent=${intent.order_intent_id} event=${eventType}`);
        await repositories.notifications.create({
            notification_id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
            order_intent_id: intent.order_intent_id,
            public_ref: intent.public_ref,
            recipient_email: intent.customer?.email,
            event_type: eventType,
            provider: NOTIFICATION_PROVIDER,
            status: 'SKIPPED_DISABLED',
            subject: `[DISABLED] ${eventType}`,
            payload: context,
            created_at: new Date().toISOString()
        });
        return;
    }

    const recipient = intent.customer?.email;
    if (!recipient) {
        console.warn(`[NOTIFICATION_FAILED_NO_RECIPIENT] intent=${intent.order_intent_id} event=${eventType}`);
        return;
    }

    // Idempotency Check
    const existing = await repositories.notifications.findDuplicate(intent.order_intent_id, eventType);
    if (existing) {
        console.log(`[NOTIFICATION_DUPLICATE_SKIPPED] intent=${intent.order_intent_id} event=${eventType}`);
        return;
    }

    const trackingUrl = `${PUBLIC_APP_BASE_URL}/?order=${intent.order_intent_id}`;
    let subject = `Order Update: ${intent.public_ref}`;
    let body = `Hello ${intent.customer?.name || 'Customer'},\n\nYour order ${intent.public_ref} has a new update: ${eventType}.\n\nTrack your order here: ${trackingUrl}\n\nThank you for choosing PrintPricePro.`;

    // Specialized content based on event type
    switch (eventType) {
        case 'ORDER_INTENT_CREATED':
            subject = `Order Received: ${intent.public_ref}`;
            body = `Thank you for your order! We have received your request and production files. We are now validating the assets.\n\nRef: ${intent.public_ref}\nTracking: ${trackingUrl}`;
            break;
        case 'PAYMENT_CONFIRMED':
            subject = `Payment Confirmed: ${intent.public_ref}`;
            body = `Your payment has been successfully processed. Your order is now being dispatched to the production facility.\n\nRef: ${intent.public_ref}\nTracking: ${trackingUrl}`;
            break;
        case 'ORDER_SHIPPED':
            subject = `Order Shipped! ${intent.public_ref}`;
            body = `Great news! Your books have been shipped.\n\nRef: ${intent.public_ref}\nTracking: ${trackingUrl}`;
            break;
        case 'PRINTHOUSE_REJECTED':
            subject = `Action Required: Order Issue ${intent.public_ref}`;
            body = `We encountered an issue with your order at the production facility. Please check the tracking page for details.\n\nRef: ${intent.public_ref}\nTracking: ${trackingUrl}`;
            break;
    }

    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    await repositories.notifications.create({
        notification_id: notificationId,
        order_intent_id: intent.order_intent_id,
        public_ref: intent.public_ref,
        recipient_email: recipient,
        event_type: eventType,
        provider: NOTIFICATION_PROVIDER,
        status: 'PENDING',
        subject,
        payload: { ...context, trackingUrl, body },
        created_at: new Date().toISOString()
    });

    try {
        if (NOTIFICATION_PROVIDER === 'console') {
            console.log(`\n--- [OUTGOING_NOTIFICATION] ---\nTO: ${recipient}\nSUBJECT: ${subject}\nBODY:\n${body}\n-------------------------------\n`);
            await repositories.notifications.updateStatus(notificationId, 'SENT');
        } else if (NOTIFICATION_PROVIDER === 'smtp') {
            // Placeholder for real SMTP logic
            if (!SMTP_CONFIG.host) {
                throw new Error("SMTP_HOST_NOT_CONFIGURED");
            }
            console.log(`[SMTP_NOT_IMPLEMENTED_YET] Simulated send to ${recipient}`);
            await repositories.notifications.updateStatus(notificationId, 'SENT');
        } else {
            throw new Error("UNKNOWN_PROVIDER");
        }

        console.log(`[NOTIFICATION_SENT] id=${notificationId} event=${eventType}`);

        await repositories.auditEvents.append({
            entity_type: 'NOTIFICATION',
            entity_id: notificationId,
            event_type: 'NOTIFICATION_SENT',
            payload: { order_intent_id: intent.order_intent_id, event_type: eventType }
        });

    } catch (err) {
        console.error(`[NOTIFICATION_FAILED] id=${notificationId} error=${err.message}`);
        await repositories.notifications.updateStatus(notificationId, 'FAILED', { error: { message: err.message } });
    }
}

/**
 * POST /api/order-intents/:id/dispatch-package/create
 * Creates a printhouse handoff package for a paid/validated order.
 */
app.post('/api/order-intents/:id/dispatch-package/create', async (req, res) => {
    try {
        const intent = await repositories.orderIntents.getById(req.params.id);
        if (!intent) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        // 1. Authorization
        const identity = resolveRequestIdentity(req);
        if (!identity.isAdmin && !assertOrderIntentAccess(req, intent)) {
            return res.status(403).json({ ok: false, error: "FORBIDDEN_DISPATCH_CREATION" });
        }

        // 2. Gating
        if (intent.payment?.status !== 'PAID') {
            console.warn(`[DISPATCH_PACKAGE_REJECTED_PAYMENT_NOT_CONFIRMED] id=${intent.order_intent_id}`);
            return res.status(409).json({ ok: false, error: "PAYMENT_NOT_CONFIRMED" });
        }
        if (intent.preflight?.status !== 'PASSED') {
            console.warn(`[DISPATCH_PACKAGE_REJECTED_PREFLIGHT_NOT_PASSED] id=${intent.order_intent_id}`);
            return res.status(409).json({ ok: false, error: "PREFLIGHT_NOT_PASSED" });
        }
        if (intent.control_plane?.status !== 'CREATED') {
            console.warn(`[DISPATCH_PACKAGE_REJECTED_CONTROL_PLANE_NOT_CREATED] id=${intent.order_intent_id}`);
            return res.status(409).json({ ok: false, error: "CONTROL_PLANE_ORDER_NOT_CREATED" });
        }

        // 3. Idempotency
        const existing = await repositories.dispatchPackages.getByOrderIntentId(intent.order_intent_id);
        if (existing && existing.status !== 'REVOKED') {
            console.log(`[DISPATCH_PACKAGE_IDEMPOTENT_RETURN] id=${existing.package_id}`);
            return res.json({ ok: true, already_exists: true, package: existing });
        }

        // 4. Create Package
        console.log(`[DISPATCH_PACKAGE_CREATE_REQUEST] intent=${intent.order_intent_id}`);
        const pkg = await buildDispatchPackage(intent);
        await repositories.dispatchPackages.create(pkg);

        // 5. Update Intent
        if (!intent.printhouse_handoff) intent.printhouse_handoff = {};
        intent.printhouse_handoff.status = 'READY_FOR_PRINTHOUSE';
        intent.lifecycle.printhouse_handoff_status = 'READY_FOR_PRINTHOUSE';
        intent.dispatch_package_id = pkg.package_id;
        await repositories.orderIntents.update(intent.order_intent_id, intent);

        // 6. Optional Control Plane Update
        if (CONTROL_PLANE_DISPATCH_PACKAGE_UPDATE_ENABLED) {
            try {
                const cpUrl = `${CONTROL_PLANE_BASE_URL}/api/admin/orders/${intent.control_plane.order_ref}/dispatch-package`;
                await axios.post(cpUrl, {
                    package_id: pkg.package_id,
                    status: pkg.status,
                    expires_at: pkg.access.expires_at,
                    files: pkg.files.map(f => ({ file_id: f.file_id, role: f.role, checksum: f.checksum }))
                }, { headers: buildControlPlaneHeaders() });
                console.log(`[DISPATCH_PACKAGE_CP_SYNC_SUCCESS] id=${pkg.package_id}`);
            } catch (e) {
                console.warn(`[DISPATCH_PACKAGE_CP_SYNC_FAILED] id=${pkg.package_id} error=${e.message}`);
            }
        }

        await repositories.auditEvents.append({
            entity_type: 'ORDER_INTENT',
            entity_id: intent.order_intent_id,
            event_type: 'DISPATCH_PACKAGE_CREATED',
            actor_type: identity.isAdmin ? 'ADMIN' : 'SYSTEM',
            payload: { package_id: pkg.package_id }
        });

        console.log(`[DISPATCH_PACKAGE_CREATED] id=${pkg.package_id}`);
        res.json({ ok: true, package: pkg });

    } catch (err) {
        console.error(`[DISPATCH_PACKAGE_FAILED] error=${err.message}`);
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: err.message });
    }
});

/**
 * GET /api/dispatch-packages/:packageId
 * Retrieves sanitized dispatch package metadata for printhouses.
 */
app.get('/api/dispatch-packages/:packageId', async (req, res) => {
    try {
        const pkg = await repositories.dispatchPackages.getById(req.params.packageId);
        if (!pkg) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        if (!await assertDispatchPackageAccess(req, pkg)) {
            console.warn(`[DISPATCH_PACKAGE_ACCESS_DENIED] id=${pkg.package_id} ip=${req.ip}`);
            await repositories.auditEvents.append({
                entity_type: 'DISPATCH_PACKAGE',
                entity_id: pkg.package_id,
                event_type: 'DISPATCH_PACKAGE_ACCESS_DENIED',
                actor_type: 'ANONYMOUS',
                payload: { ip: req.ip }
            });
            return res.status(403).json({ ok: false, error: "FORBIDDEN_DISPATCH_PACKAGE_ACCESS" });
        }

        // Check expiration
        if (new Date(pkg.access.expires_at) < new Date()) {
            await repositories.dispatchPackages.updateStatus(pkg.package_id, 'EXPIRED');
            return res.status(403).json({ ok: false, error: "DISPATCH_PACKAGE_EXPIRED" });
        }

        await repositories.dispatchPackages.incrementAccess(pkg.package_id);
        console.log(`[DISPATCH_PACKAGE_ACCESS_GRANTED] id=${pkg.package_id}`);

        // Sanitize for return
        const { access, ...sanitized } = pkg;
        res.json({ ok: true, package: sanitized });

    } catch (err) {
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});

/**
 * GET /api/dispatch-packages/:packageId/files/:fileId
 * Streams a production file from a dispatch package.
 */
app.get('/api/dispatch-packages/:packageId/files/:fileId', async (req, res) => {
    try {
        const pkg = await repositories.dispatchPackages.getById(req.params.packageId);
        if (!pkg) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        if (!await assertDispatchPackageAccess(req, pkg)) {
            return res.status(403).json({ ok: false, error: "FORBIDDEN_DISPATCH_PACKAGE_ACCESS" });
        }

        const fileMeta = pkg.files.find(f => f.file_id === req.params.fileId);
        if (!fileMeta) return res.status(404).json({ ok: false, error: "FILE_NOT_FOUND_IN_PACKAGE" });

        const filePath = path.join(PRODUCTION_FILES_DIR, fileMeta.storage_key);
        if (!fs.existsSync(filePath)) {
            console.error(`[DISPATCH_FILE_MISSING_ON_DISK] id=${fileMeta.file_id} path=${filePath}`);
            return res.status(404).json({ ok: false, error: "DISPATCH_FILE_NOT_FOUND" });
        }

        await repositories.auditEvents.append({
            entity_type: 'DISPATCH_PACKAGE',
            entity_id: pkg.package_id,
            event_type: 'DISPATCH_FILE_ACCESSED',
            actor_type: 'PRINTHOUSE',
            payload: { file_id: fileMeta.file_id, role: fileMeta.role }
        });

        console.log(`[DISPATCH_FILE_STREAMED] package=${pkg.package_id} file=${fileMeta.file_id}`);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileMeta.filename}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');

        fs.createReadStream(filePath).pipe(res);

    } catch (err) {
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});

/**
 * POST /api/dispatch-packages/:packageId/revoke
 * Administrative endpoint to revoke a dispatch package.
 */
app.post('/api/dispatch-packages/:packageId/revoke', adminOnly, async (req, res) => {
    try {
        const pkg = await repositories.dispatchPackages.getById(req.params.packageId);
        if (!pkg) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        await repositories.dispatchPackages.updateStatus(pkg.package_id, 'REVOKED');

        await repositories.auditEvents.append({
            entity_type: 'DISPATCH_PACKAGE',
            entity_id: pkg.package_id,
            event_type: 'DISPATCH_PACKAGE_REVOKED',
            actor_type: 'ADMIN',
            payload: { package_id: pkg.package_id }
        });

        console.log(`[DISPATCH_PACKAGE_REVOKED] id=${pkg.package_id}`);
        res.json({ ok: true, status: 'REVOKED' });
    } catch (err) {
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});

// ---- Printhouse Production Queue Endpoints (v5.3 - Phase 12) ----

/**
 * GET /api/printhouse/queue
 * Lists jobs assigned to a printhouse.
 */
app.get('/api/printhouse/queue', async (req, res) => {
    try {
        const { printhouse_id, status, limit = 50, offset = 0 } = req.query;
        const identity = resolveRequestIdentity(req);

        // Access Control: Admin can see all, Printhouse can only see its own
        // If printhouse auth existed, we'd extract its ID from token.
        // For now, we enforce that a printhouse_id must be provided or it's admin.
        if (!identity.isAdmin && !printhouse_id) {
            return res.status(403).json({ ok: false, error: "PRINTHOUSE_ID_REQUIRED" });
        }

        // If not admin, verify printhouse_id matches (once full auth is implemented)
        // For now, we allow filtering if identity.isAdmin or if a token is used.

        const jobs = await repositories.dispatchPackages.listByPrinthouse(printhouse_id, { status, limit, offset });

        // Map to summary format
        const summary = jobs.map(j => ({
            package_id: j.package_id,
            order_intent_id: j.order_intent_id,
            public_ref: j.public_ref,
            control_plane_order_ref: j.control_plane_order_ref,
            printhouse_id: j.printhouse_id,
            printhouse_name: j.printhouse_name,
            production_queue_status: j.production_queue?.status,
            payment_status: j.billing_summary?.payment_status,
            preflight_status: j.preflight_summary?.status,
            dispatch_package_status: j.status,
            created_at: j.created_at,
            updated_at: j.updated_at,
            customer_summary: j.customer_summary,
            production_specs_summary: j.production_specs,
            customer_paper_preferences: j.customer_paper_preferences !== undefined
                ? j.customer_paper_preferences
                : (j.production_specs?.customer_paper_preferences ?? null),
            files_summary: j.files.map(f => ({ role: f.role, filename: f.filename }))
        }));

        await repositories.auditEvents.append({
            entity_type: 'PRINTHOUSE',
            entity_id: printhouse_id || 'ALL',
            event_type: 'PRINTHOUSE_QUEUE_LISTED',
            actor_type: identity.isAdmin ? 'ADMIN' : 'PRINTHOUSE',
            payload: { status_filter: status }
        });

        console.log(`[PRINTHOUSE_QUEUE_LIST] printhouse=${printhouse_id || 'ALL'} count=${summary.length}`);
        res.json({ ok: true, jobs: summary });

    } catch (err) {
        console.error(`[PRINTHOUSE_QUEUE_LIST_FAILED] ${err.message}`);
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});

/**
 * GET /api/printhouse/queue/:packageId
 * Detailed job view for a printhouse.
 */
app.get('/api/printhouse/queue/:packageId', async (req, res) => {
    try {
        const pkg = await repositories.dispatchPackages.getById(req.params.packageId);
        if (!pkg) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        // Access Control
        if (!await assertDispatchPackageAccess(req, pkg)) {
            return res.status(403).json({ ok: false, error: "FORBIDDEN_QUEUE_ACCESS" });
        }

        await repositories.auditEvents.append({
            entity_type: 'DISPATCH_PACKAGE',
            entity_id: pkg.package_id,
            event_type: 'PRINTHOUSE_JOB_VIEWED',
            actor_type: 'PRINTHOUSE'
        });

        console.log(`[PRINTHOUSE_JOB_DETAIL] id=${pkg.package_id}`);

        // Return full metadata but exclude secrets
        const { access, ...job } = pkg;
        res.json({ ok: true, job });

    } catch (err) {
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});

/**
 * POST /api/printhouse/queue/:packageId/status
 * Updates production queue status for a job.
 */
app.post('/api/printhouse/queue/:packageId/status', async (req, res) => {
    try {
        const pkg = await repositories.dispatchPackages.getById(req.params.packageId);
        if (!pkg) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        // Access Control
        const identity = resolveRequestIdentity(req);
        if (!await assertDispatchPackageAccess(req, pkg)) {
            return res.status(403).json({ ok: false, error: "FORBIDDEN_STATUS_UPDATE" });
        }

        const { status: requestedStatus, operator_notes, rejection_reason, production_notes, shipment } = req.body;
        const currentStatus = pkg.production_queue?.status || 'QUEUED';

        // 1. Transition Validation
        const validTransitions = {
            'QUEUED': ['REVIEWING', 'REJECTED'],
            'REVIEWING': ['ACCEPTED', 'REJECTED'],
            'REJECTED': [],
            'ACCEPTED': ['IN_PREPRESS', 'CANCELLED'],
            'IN_PREPRESS': ['IN_PRODUCTION', 'CANCELLED'],
            'IN_PRODUCTION': ['COMPLETED', 'CANCELLED'],
            'COMPLETED': ['SHIPPED'],
            'SHIPPED': [],
            'CANCELLED': []
        };

        const allowed = validTransitions[currentStatus] || [];

        // Admin can override some things, but mostly we follow the rules
        if (!allowed.includes(requestedStatus) && !identity.isAdmin) {
            console.warn(`[PRINTHOUSE_STATUS_REJECTED_INVALID_TRANSITION] id=${pkg.package_id} from=${currentStatus} to=${requestedStatus}`);
            return res.status(400).json({
                ok: false,
                error: "INVALID_PRODUCTION_STATUS_TRANSITION",
                current_status: currentStatus,
                requested_status: requestedStatus
            });
        }

        // 2. Data Validation
        if (requestedStatus === 'REJECTED' && !rejection_reason) {
            return res.status(400).json({ ok: false, error: "REJECTION_REASON_REQUIRED" });
        }

        // 3. Prepare Update
        const now = new Date().toISOString();
        const updatedQueue = {
            ...pkg.production_queue,
            status: requestedStatus,
            updated_at: now,
            operator_notes: operator_notes !== undefined ? operator_notes : pkg.production_queue?.operator_notes,
            production_notes: production_notes !== undefined ? production_notes : pkg.production_queue?.production_notes,
            shipment: shipment !== undefined ? shipment : pkg.production_queue?.shipment
        };

        if (requestedStatus === 'REVIEWING') updatedQueue.reviewed_at = now;
        if (requestedStatus === 'ACCEPTED') updatedQueue.accepted_at = now;
        if (requestedStatus === 'REJECTED') updatedQueue.rejected_at = now;
        if (requestedStatus === 'IN_PREPRESS') updatedQueue.started_prepress_at = now;
        if (requestedStatus === 'IN_PRODUCTION') updatedQueue.started_production_at = now;
        if (requestedStatus === 'COMPLETED') updatedQueue.completed_at = now;
        if (requestedStatus === 'SHIPPED') updatedQueue.shipped_at = now;

        if (rejection_reason) updatedQueue.rejection_reason = rejection_reason;

        // 4. Persistence
        await repositories.dispatchPackages.updateProductionQueue(pkg.package_id, updatedQueue);

        // 5. Downstream Updates (Intent & Control Plane)
        const intent = await repositories.orderIntents.getById(pkg.order_intent_id);
        if (intent) {
            let intentChanged = false;

            if (requestedStatus === 'ACCEPTED') {
                intent.printhouse_handoff.status = 'ACCEPTED';
                intent.lifecycle.printhouse_handoff_status = 'READY'; // Or SENT
                intentChanged = true;
            } else if (requestedStatus === 'REJECTED') {
                intent.printhouse_handoff.status = 'REJECTED';
                intent.printhouse_handoff.error = rejection_reason;
                intent.lifecycle.printhouse_handoff_status = 'REJECTED';
                intentChanged = true;
            } else if (requestedStatus === 'SHIPPED') {
                intent.status = 'COMPLETED'; // Or SHIPPED if model supports it
                intentChanged = true;
            }

            if (intentChanged) {
                await repositories.orderIntents.update(intent.order_intent_id, intent);
            }

            // 6. Control Plane Sync
            if (CONTROL_PLANE_PRODUCTION_STATUS_SYNC_ENABLED) {
                try {
                    const cpUrl = CONTROL_PLANE_PRODUCTION_STATUS_ENDPOINT.replace(':orderRef', intent.control_plane?.order_ref || intent.public_ref);
                    await axios.post(`${CONTROL_PLANE_BASE_URL}${cpUrl}`, {
                        package_id: pkg.package_id,
                        order_intent_id: intent.order_intent_id,
                        public_ref: intent.public_ref,
                        status: requestedStatus,
                        operator_notes,
                        rejection_reason,
                        shipment,
                        updated_at: now
                    }, { headers: buildControlPlaneHeaders() });
                    console.log(`[PRINTHOUSE_STATUS_SYNCED] id=${pkg.package_id} status=${requestedStatus}`);
                } catch (e) {
                    console.warn(`[PRINTHOUSE_STATUS_SYNC_FAILED] id=${pkg.package_id} error=${e.message}`);
                    updatedQueue.last_sync_error = e.message;
                    await repositories.dispatchPackages.updateProductionQueue(pkg.package_id, updatedQueue);
                }
            }
        }

        await repositories.auditEvents.append({
            entity_type: 'DISPATCH_PACKAGE',
            entity_id: pkg.package_id,
            event_type: `PRINTHOUSE_JOB_${requestedStatus}`,
            actor_type: identity.isAdmin ? 'ADMIN' : 'PRINTHOUSE',
            payload: { from: currentStatus, to: requestedStatus, rejection_reason }
        });

        console.log(`[PRINTHOUSE_STATUS_UPDATED] id=${pkg.package_id} from=${currentStatus} to=${requestedStatus}`);

        // v5.3: Trigger Notification (Phase 13)
        if (intent) {
            let eventToNotify = null;
            if (requestedStatus === 'ACCEPTED') eventToNotify = 'PRINTHOUSE_ACCEPTED';
            if (requestedStatus === 'IN_PRODUCTION') eventToNotify = 'PRODUCTION_STARTED';
            if (requestedStatus === 'COMPLETED') eventToNotify = 'PRODUCTION_COMPLETED';
            if (requestedStatus === 'SHIPPED') eventToNotify = 'ORDER_SHIPPED';
            if (requestedStatus === 'REJECTED') eventToNotify = 'PRINTHOUSE_REJECTED';

            if (eventToNotify) {
                sendOrderNotification(intent, eventToNotify, { status: requestedStatus }).catch(e => console.error(`[NOTIFICATION_CRASH_PROTECT] ${e.message}`));
            }

            // v5.3: Trigger Exception (Phase 14)
            if (requestedStatus === 'REJECTED') {
                await openOrderIntentException(intent, {
                    status: "PRINTHOUSE_REJECTED",
                    reason_code: "PRINTHOUSE_REJECTION",
                    reason_message: rejection_reason || "No reason provided by printhouse.",
                    customer_message: "The selected production partner cannot produce this order as submitted. Our team is reviewing next steps.",
                    source: "PRINTHOUSE",
                    blocking: true
                });
            }
        }

        res.json({ ok: true, status: requestedStatus, production_queue: updatedQueue });

    } catch (err) {
        console.error(`[PRINTHOUSE_STATUS_UPDATE_FAILED] ${err.message}`);
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});

/**
 * POST /api/order-intents/:id/payment/mark-paid
 * Administrative endpoint to manually confirm bank transfer payments.
 */
app.post('/api/order-intents/:id/payment/mark-paid', adminOnly, async (req, res) => {
    const intent = await repositories.orderIntents.getById(req.params.id);
    if (!intent) return res.status(404).json({ error: "NOT_FOUND" });

    console.log(`[PAYMENT_MARK_PAID_REQUEST] id=${intent.order_intent_id}`);

    intent.payment.status = 'PAID';
    intent.lifecycle.payment_status = 'PAID';
    intent.updated_at = new Date().toISOString();
    await repositories.orderIntents.update(intent.order_intent_id, intent);

    console.log(`[PAYMENT_MARK_PAID_ACCEPTED] id=${intent.order_intent_id}`);

    if (AUTO_FINALIZE_AFTER_PAYMENT) {
        console.log(`[AUTO_FINALIZE_AFTER_PAYMENT_TRIGGERED] id=${intent.order_intent_id}`);
        try {
            await finalizeOrderIntent(intent.order_intent_id);
        } catch (e) {
            console.error(`[AUTO_FINALIZE_FAILED] id=${intent.order_intent_id} error=${e.message}`);
        }
    }

    res.json({ ok: true, payment_status: "PAID", auto_finalize_triggered: AUTO_FINALIZE_AFTER_PAYMENT });
});

// ---- Operational Health & Cleanup (v5.3 - Phase 9 Hardening) ----

/**
 * Identifies and cleans up orphaned production files.
 */
/**
 * Identifies and cleans up orphaned production files.
 */
async function cleanupOrphanProductionFiles() {
    console.log(`[CLEANUP_ORPHAN_FILES_STARTED] retention=${PRODUCTION_FILE_RETENTION_HOURS}h`);
    const cutoff = new Date(Date.now() - (PRODUCTION_FILE_RETENTION_HOURS * 60 * 60 * 1000));

    const orphans = await repositories.productionFiles.findOrphans(cutoff);
    let count = 0;

    for (const file of orphans) {
        console.log(`[CLEANUP_ORPHAN_FILE] id=${file.file_id}`);

        // Delete local file if it exists and is on disk
        if (file.storage?.key) {
            const filePath = path.join(PRODUCTION_FILES_DIR, file.storage.key);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (e) {
                    console.error(`[CLEANUP_DISK_FAILED] file=${file.storage.key} error=${e.message}`);
                }
            }
        }

        await repositories.productionFiles.markDeleted(file.file_id, 'ORPHAN_RETENTION_EXPIRED');

        await repositories.auditEvents.append({
            entity_type: 'PRODUCTION_FILE',
            entity_id: file.file_id,
            event_type: 'CLEANUP_DELETED',
            actor_type: 'SYSTEM',
            payload: { reason: 'ORPHAN_RETENTION_EXPIRED' }
        });

        count++;
    }

    console.log(`[CLEANUP_ORPHAN_FILES_COMPLETED] removed=${count}`);
    return count;
}

/**
 * Identifies and cleans up abandoned order intents.
 */
async function cleanupAbandonedOrderIntents() {
    console.log(`[CLEANUP_ORDER_INTENTS_STARTED] retention=${ORDER_INTENT_RETENTION_DAYS}d`);
    const cutoff = new Date(Date.now() - (ORDER_INTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000));

    const abandoned = await repositories.orderIntents.findAbandoned(cutoff);
    let count = 0;

    for (const intent of abandoned) {
        console.log(`[CLEANUP_ABANDONED_INTENT] id=${intent.order_intent_id}`);

        await repositories.orderIntents.updateStatus(intent.order_intent_id, 'CANCELLED', {
            final_order_status: 'FAILED',
            cancellation_reason: 'ABANDONED_RETENTION_EXPIRED'
        });

        await repositories.auditEvents.append({
            entity_type: 'ORDER_INTENT',
            entity_id: intent.order_intent_id,
            event_type: 'CLEANUP_CANCELLED',
            actor_type: 'SYSTEM',
            payload: { reason: 'ABANDONED_RETENTION_EXPIRED' }
        });

        count++;
    }

    console.log(`[CLEANUP_ORDER_INTENTS_COMPLETED] cancelled=${count}`);
    return count;
}

/**
 * GET /api/health
 * Public health check.
 */
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        service: "printpricepro-bookprice",
        uptime: Math.floor((Date.now() - APP_START_TIME) / 1000),
        env: process.env.NODE_ENV || 'development',
        features: {
            preflight_enabled: PREFLIGHT_ENABLED,
            payments_enabled: PAYMENTS_ENABLED,
            payment_provider: PAYMENT_PROVIDER,
            control_plane_handoff_enabled: CONTROL_PLANE_ORDER_HANDOFF_ENABLED,
            cleanup_enabled: CLEANUP_ENABLED
        }
    });
});

/**
 * GET /api/admin/health/registries
 * Integrity check for registries.
 */
app.get('/api/admin/health/registries', adminOnly, async (req, res) => {
    const filesHealth = await repositories.productionFiles.health();
    const intentsHealth = await repositories.orderIntents.health();
    const sessionsHealth = await repositories.offerSessions.health();

    const health = {
        timestamp: new Date().toISOString(),
        adapter: repositories.adapter,
        registries: {
            production_files: filesHealth,
            order_intents: intentsHealth,
            offer_sessions: sessionsHealth
        }
    };

    console.log(`[REGISTRY_HEALTH_CHECK] ip=${req.ip} adapter=${repositories.adapter}`);
    res.json({ ok: true, health });
});

/**
 * GET /api/admin/health/persistence
 * Detailed persistence layer health check.
 */
app.get('/api/admin/health/persistence', adminOnly, async (req, res) => {
    try {
        const prodFiles = await repositories.productionFiles.health();
        const offerSessions = await repositories.offerSessions.health();
        const orderIntents = await repositories.orderIntents.health();
        const dispatchPackages = await repositories.dispatchPackages.health();
        const auditEvents = await repositories.auditEvents.health();

        res.json({
            ok: true,
            adapter: repositories.adapter,
            repositories: {
                production_files: prodFiles,
                offer_sessions: offerSessions,
                order_intents: orderIntents,
                dispatch_packages: dispatchPackages,
                audit_events: auditEvents
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---- Exception Orchestration (v5.3 - Phase 14 partial / pending certification) ----

/**
 * Opens or updates an exception for an Order Intent.
 */
async function openOrderIntentException(orderIntent, params) {
    const {
        status, reason_code, reason_message, customer_message,
        operator_notes, source, blocking = true, actor_id = 'SYSTEM'
    } = params;

    const timestamp = new Date().toISOString();
    const exception = {
        status,
        reason_code,
        reason_message,
        customer_message,
        operator_notes: operator_notes || orderIntent.exception?.operator_notes,
        source,
        blocking,
        created_at: orderIntent.exception?.created_at || timestamp,
        updated_at: timestamp,
        actor_id
    };

    console.log(`[EXCEPTION_OPENED] intent=${orderIntent.order_intent_id} status=${status} source=${source} blocking=${blocking}`);

    await repositories.orderIntents.update(orderIntent.order_intent_id, { exception });

    await repositories.auditEvents.append({
        entity_type: 'ORDER_INTENT',
        entity_id: orderIntent.order_intent_id,
        event_type: 'EXCEPTION_OPENED',
        actor_id,
        payload: { status, reason_code, source, blocking }
    });

    return exception;
}

/**
 * Resolves an exception for an Order Intent.
 */
async function resolveOrderIntentException(orderIntent, resolution) {
    const { type, notes, resolved_by = 'SYSTEM' } = resolution;
    const timestamp = new Date().toISOString();

    const exception = {
        ...orderIntent.exception,
        status: 'RESOLVED',
        blocking: false,
        updated_at: timestamp,
        resolved_at: timestamp,
        resolution: {
            type,
            notes,
            resolved_by,
            resolved_at: timestamp
        }
    };

    console.log(`[EXCEPTION_RESOLVED] intent=${orderIntent.order_intent_id} type=${type} by=${resolved_by}`);

    await repositories.orderIntents.update(orderIntent.order_intent_id, { exception });

    await repositories.auditEvents.append({
        entity_type: 'ORDER_INTENT',
        entity_id: orderIntent.order_intent_id,
        event_type: 'EXCEPTION_RESOLVED',
        actor_id: resolved_by,
        payload: { resolution_type: type }
    });

    return exception;
}

/**
 * POST /api/order-intents/:id/files/:role/replace
 * Replaces a production file in an order intent.
 */
app.post('/api/order-intents/:id/files/:role/replace', upload.single('file'), async (req, res) => {
    try {
        const orderIntentId = req.params.id;
        const role = req.params.role;
        const replacement_reason = req.body.replacement_reason || "Customer reupload";

        if (!['INTERIOR_PDF', 'COVER_PDF'].includes(role)) {
            return res.status(400).json({ ok: false, error: "INVALID_ROLE" });
        }

        const intent = await repositories.orderIntents.getById(orderIntentId);
        if (!intent) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        // Security & Status Check
        const identity = resolveRequestIdentity(req);
        const isOwner = assertOrderIntentAccess(req, intent);
        const isAdmin = identity.isAdmin;

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ ok: false, error: "FORBIDDEN" });
        }

        // Only allowed if in action required or operator review
        const allowedStatuses = ['CUSTOMER_REUPLOAD_REQUIRED', 'ACTION_REQUIRED', 'OPERATOR_REVIEW_REQUIRED'];
        if (!intent.exception || !allowedStatuses.includes(intent.exception.status)) {
            if (!isAdmin) {
                return res.status(400).json({ ok: false, error: "REPLACEMENT_NOT_ALLOWED_NOW" });
            }
        }

        // Prevent replacement after production starts
        const blockingStatuses = ['IN_PRODUCTION', 'COMPLETED', 'SHIPPED', 'CANCELLED'];
        if (blockingStatuses.includes(intent.status)) {
            return res.status(400).json({ ok: false, error: "ORDER_STATE_BLOCKS_REPLACEMENT" });
        }

        if (!req.file) {
            return res.status(400).json({ ok: false, error: "MISSING_FILE" });
        }

        // 1. Validate Upload (Existing logic)
        const validationResult = await performHardenedPDFValidation(req.file.path, role);
        if (!validationResult.ok) {
            // Cleanup failed upload
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(400).json({ ok: false, error: "VALIDATION_FAILED", details: validationResult });
        }

        // 2. Register New Production File
        const oldFileId = intent.production_files?.[role === 'INTERIOR_PDF' ? 'interior_pdf_file_id' : 'cover_pdf_file_id'];
        const newFileId = `pf_repl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        const newFile = {
            file_id: newFileId,
            role,
            filename: req.file.originalname,
            safe_filename: req.file.filename,
            size_bytes: req.file.size,
            mime_type: req.file.mimetype,
            status: 'VALIDATED',
            source_type: 'UPLOAD',
            checksum: { algorithm: 'SHA256', value: validationResult.forensics.checksum },
            storage: { provider: 'LOCAL', key: req.file.filename },
            associations: { order_intent_id: orderIntentId, user_id: intent.user_id },
            validation: validationResult,
            replacement: {
                replaces_file_id: oldFileId,
                replacement_reason
            }
        };

        await repositories.productionFiles.create(newFile);

        // 3. Update Order Intent
        const historyEntry = {
            role,
            old_file_id: oldFileId,
            new_file_id: newFileId,
            reason: replacement_reason,
            created_at: new Date().toISOString(),
            actor_type: isAdmin ? 'ADMIN' : 'CUSTOMER'
        };

        const updatedHistory = [...(intent.production_files_history || []), historyEntry];
        const updatedFiles = { ...intent.production_files };
        if (role === 'INTERIOR_PDF') {
            updatedFiles.interior_pdf_file_id = newFileId;
            updatedFiles.files = updatedFiles.files.map(f => f.role === 'INTERIOR_PDF' ? { ...f, file_id: newFileId, filename: req.file.originalname } : f);
        } else {
            updatedFiles.cover_pdf_file_id = newFileId;
            updatedFiles.files = updatedFiles.files.map(f => f.role === 'COVER_PDF' ? { ...f, file_id: newFileId, filename: req.file.originalname } : f);
        }

        await repositories.orderIntents.update(orderIntentId, {
            production_files: updatedFiles,
            production_files_history: updatedHistory,
            lifecycle: {
                ...intent.lifecycle,
                preflight_status: 'PENDING_REVALIDATION'
            },
            exception: {
                ...intent.exception,
                status: 'OPERATOR_REVIEW_REQUIRED',
                reason_message: "Files reuploaded. Revalidation required.",
                updated_at: new Date().toISOString()
            }
        });

        console.log(`[FILE_REPLACED] intent=${orderIntentId} role=${role} new=${newFileId} old=${oldFileId}`);

        await repositories.auditEvents.append({
            entity_type: 'ORDER_INTENT',
            entity_id: orderIntentId,
            event_type: 'PRODUCTION_FILE_REPLACED',
            actor_id: identity.user?.id || null,
            payload: { role, old_file_id: oldFileId, new_file_id: newFileId }
        });

        res.json({ ok: true, file_id: newFileId, status: 'REPLACED' });

    } catch (err) {
        console.error(`[FILE_REPLACEMENT_FAILED] ${err.message}`);
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});

/**
 * POST /api/order-intents/:id/exception/review
 * Administrative exception review endpoint.
 */
app.post('/api/order-intents/:id/exception/review', adminOnly, async (req, res) => {
    try {
        const intent = await repositories.orderIntents.getById(req.params.id);
        if (!intent) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        const { action, customer_message, operator_notes } = req.body;
        const identity = resolveRequestIdentity(req);

        if (action === 'REQUEST_REUPLOAD') {
            await openOrderIntentException(intent, {
                status: "CUSTOMER_REUPLOAD_REQUIRED",
                reason_code: "OPERATOR_REQUESTED_REUPLOAD",
                reason_message: "Operator requested manual reupload.",
                customer_message: customer_message || "Please reupload your production files.",
                operator_notes,
                source: "OPERATOR",
                actor_id: identity.user?.id || null
            });
        } else if (action === 'MARK_RESOLVED') {
            // Safety: cannot resolve if preflight is still failed
            if (intent.lifecycle.preflight_status === 'FAILED') {
                return res.status(400).json({ ok: false, error: "CANNOT_RESOLVE_WHILE_PREFLIGHT_FAILED" });
            }
            await resolveOrderIntentException(intent, {
                type: "MANUAL_OVERRIDE",
                notes: operator_notes,
                resolved_by: identity.user?.id || null
            });
        } else if (action === 'SEND_TO_REFUND_REVIEW') {
            await openOrderIntentException(intent, {
                status: "REFUND_REVIEW_REQUIRED",
                reason_code: "REFUND_REQUESTED",
                reason_message: "Order queued for refund review.",
                customer_message: "Our team is reviewing payment resolution.",
                operator_notes,
                source: "OPERATOR",
                actor_id: identity.user?.id || null
            });
        } else if (action === 'CANCEL_ORDER') {
            if (intent.status === 'SHIPPED') {
                return res.status(400).json({ ok: false, error: "CANNOT_CANCEL_SHIPPED_ORDER" });
            }
            await repositories.orderIntents.update(intent.order_intent_id, {
                status: 'CANCELLED',
                cancelled_at: new Date().toISOString(),
                cancellation_reason: operator_notes
            });
            await resolveOrderIntentException(intent, {
                type: "CANCELLED",
                notes: operator_notes,
                resolved_by: identity.user?.id || null
            });
        } else if (action === 'REQUEST_ALTERNATE_PRINTER') {
            await openOrderIntentException(intent, {
                status: "ALTERNATE_PRINTER_REQUIRED",
                reason_code: "PRINTHOUSE_REJECTION_RECOVERY",
                reason_message: "Operator initiated alternate printer search.",
                customer_message: "Our production team is reviewing your order.",
                operator_notes,
                source: "OPERATOR",
                actor_id: identity.user?.id || null
            });
        } else {
            return res.status(400).json({ ok: false, error: "INVALID_ACTION" });
        }

        res.json({ ok: true, action });
    } catch (err) {
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});

/**
 * POST /api/order-intents/:id/exception/alternate-printer/prepare
 * Placeholder for alternate printer search.
 */
app.post('/api/order-intents/:id/exception/alternate-printer/prepare', adminOnly, async (req, res) => {
    try {
        const intent = await repositories.orderIntents.getById(req.params.id);
        if (!intent) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        // TODO: Re-calculate offers or use original specs to find candidates
        console.log(`[ALTERNATE_PRINTER_PREPARE_REQUEST] intent=${intent.order_intent_id}`);

        res.json({
            ok: true,
            original_printer_id: getPrinterIdentitySafe(intent).printerId,
            candidates: [
                // In a real flow, we'd query the Pricing Engine or BPE list
                { printer_id: "ALT_001", printer_name: "Mock Alternate Partner A", lead_time: 5, price: intent.totals.total_price },
                { printer_id: "ALT_002", printer_name: "Mock Alternate Partner B", lead_time: 7, price: intent.totals.total_price * 1.05 }
            ],
            note: "TODO: Implement Pricing Engine alternate lookup and delta handling."
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});

// ---- Customer Order Tracking (v5.3 - Phase 13) ----

/**
 * GET /api/orders/:id/tracking
 * Provides a customer-safe view of order progress.
 */
app.get('/api/orders/:id/tracking', async (req, res) => {
    try {
        const intent = await repositories.orderIntents.getById(req.params.id);
        if (!intent) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        // Security: Ownership check
        if (!assertOrderIntentAccess(req, intent)) {
            console.log(`[TRACKING_VIEW_ACCESS_DENIED] id=${req.params.id} session=${req.sessionID}`);
            return res.status(403).json({ ok: false, error: "FORBIDDEN_TRACKING_ACCESS" });
        }

        // Fetch dispatch package if exists for production status
        let dispatchPkg = null;
        if (intent.status === 'CONTROL_PLANE_ORDER_CREATED' || intent.status === 'SHIPPED') {
            const list = await repositories.dispatchPackages.listByOrderIntent(intent.order_intent_id);
            dispatchPkg = list[0]; // Get the latest one
        }

        const tracking = await buildCustomerTrackingView(intent, dispatchPkg);
        console.log(`[TRACKING_VIEW_CREATED] id=${intent.order_intent_id} ref=${intent.public_ref} status=${tracking.customer_status}`);

        res.json({ ok: true, tracking });
    } catch (err) {
        console.error(`[TRACKING_VIEW_FAILED] id=${req.params.id} error=${err.message}`);
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});

/**
 * GET /api/orders/ref/:publicRef/tracking
 * Provides a customer-safe view of order progress by public reference.
 */
app.get('/api/orders/ref/:publicRef/tracking', async (req, res) => {
    try {
        const intent = await repositories.orderIntents.getByPublicRef(req.params.publicRef);
        if (!intent) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

        // Security: Require session or auth context (no unauthenticated guessing)
        if (!assertOrderIntentAccess(req, intent)) {
            console.log(`[TRACKING_VIEW_ACCESS_DENIED] ref=${req.params.publicRef} session=${req.sessionID}`);
            return res.status(403).json({ ok: false, error: "FORBIDDEN_TRACKING_ACCESS" });
        }

        let dispatchPkg = null;
        if (intent.status === 'CONTROL_PLANE_ORDER_CREATED' || intent.status === 'SHIPPED') {
            const list = await repositories.dispatchPackages.listByOrderIntent(intent.order_intent_id);
            dispatchPkg = list[0];
        }

        const tracking = await buildCustomerTrackingView(intent, dispatchPkg);
        res.json({ ok: true, tracking });
    } catch (err) {
        console.error(`[TRACKING_VIEW_FAILED] ref=${req.params.publicRef} error=${err.message}`);
        res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});

/**
 * GET /api/admin/health/notifications
 * Provides forensic telemetry for the notification subsystem.
 */
app.get('/api/admin/health/notifications', adminOnly, async (req, res) => {
    try {
        const stats = await repositories.notifications.health();
        res.json({
            ok: true,
            enabled: NOTIFICATIONS_ENABLED,
            provider: NOTIFICATION_PROVIDER,
            smtp_configured: !!SMTP_CONFIG.host,
            stats
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/admin/cleanup/orphan-production-files
 */
app.post('/api/admin/cleanup/orphan-production-files', adminOnly, async (req, res) => {
    const removed = await cleanupOrphanProductionFiles();
    res.json({ ok: true, removed });
});

/**
 * POST /api/admin/cleanup/abandoned-order-intents
 */
app.post('/api/admin/cleanup/abandoned-order-intents', adminOnly, async (req, res) => {
    const cancelled = await cleanupAbandonedOrderIntents();
    res.json({ ok: true, cancelled });
});

app.listen(PORT, () => {
    console.log(`v5.2 Adversarial Node Server running on port ${PORT}`);
});

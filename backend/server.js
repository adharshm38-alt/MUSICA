/**
 * MUSICA Proton Mail Authentication & Cloud Storage Backend
 *
 * Implements:
 * - Proton Mail email OTP verification via Resend API
 * - Secure OTP generation, hashing, cooldown, rate-limiting & expiry
 * - Cryptographic session token issuance and verification
 * - User data separation (unique MUSICA user ID)
 * - Cloud data persistence (MongoDB Atlas with durable fallback)
 * - Health check endpoint for Render deployment
 */

import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------------------------------------------------------
// Environment Configuration
// --------------------------------------------------------------------------

// Simple .env reader if file exists
function loadEnvFile(envPath) {
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx !== -1) {
                const key = trimmed.slice(0, eqIdx).trim();
                const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
                if (!process.env[key]) {
                    process.env[key] = val;
                }
            }
        }
    }
}
loadEnvFile(path.join(__dirname, '.env'));

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'MUSICA <onboarding@resend.dev>';
const JWT_SECRET = process.env.JWT_SECRET || 'musica-proton-auth-session-secret-default-key-change-in-prod';
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'musica';
const ALLOW_DEV_CONSOLE_OTP = process.env.ALLOW_DEV_CONSOLE_OTP === 'true';

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_COOLDOWN_MS = 60 * 1000;    // 60 seconds
const MAX_VERIFY_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SEND_PER_WINDOW = 5;

console.log('[MUSICA Backend] Initializing...');
console.log(`[MUSICA Backend] Node.js ${process.version}`);
console.log(`[MUSICA Backend] Resend configured: ${RESEND_API_KEY ? 'YES' : 'NO (will simulate or fail)'}`);
console.log(`[MUSICA Backend] MongoDB URI configured: ${MONGODB_URI ? 'YES' : 'NO (using durable local datastore)'}`);

// --------------------------------------------------------------------------
// Durable Cloud / Local Storage Layer
// --------------------------------------------------------------------------

const DATA_DIR = path.join(__dirname, '.data');
const DATA_FILE = path.join(DATA_DIR, 'musica_cloud_store.json');

class StorageManager {
    constructor() {
        this.data = {
            users: {},       // userId -> { id, email, name, avatarUrl, createdAt, updatedAt }
            otps: {},        // email -> { hash, expiresAt, lastSentAt, attempts }
            libraries: {},   // userId -> { playlists: [], likedSongs: [], history: [], preferences: {} }
        };
        this.mongoClient = null;
        this.db = null;
        this.initFileStore();
        this.initMongo();
    }

    initFileStore() {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }
            if (fs.existsSync(DATA_FILE)) {
                const raw = fs.readFileSync(DATA_FILE, 'utf8');
                this.data = JSON.parse(raw);
            } else {
                this.saveFileStore();
            }
        } catch (e) {
            console.error('[Storage] Error initializing file store:', e.message);
        }
    }

    saveFileStore() {
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (e) {
            console.error('[Storage] Error saving file store:', e.message);
        }
    }

    async initMongo() {
        if (!MONGODB_URI) return;
        try {
            // Dynamically import mongodb if installed
            const { MongoClient } = await import('mongodb');
            this.mongoClient = new MongoClient(MONGODB_URI);
            await this.mongoClient.connect();
            this.db = this.mongoClient.db(MONGODB_DB_NAME);
            console.log('[Storage] Connected to MongoDB Atlas successfully.');
        } catch (e) {
            console.warn('[Storage] MongoDB connection not available, continuing with durable file store:', e.message);
        }
    }

    async getOtp(email) {
        const key = email.toLowerCase();
        if (this.db) {
            try {
                return await this.db.collection('otps').findOne({ email: key });
            } catch (err) {
                console.warn('[Storage] MongoDB getOtp error:', err.message);
            }
        }
        return this.data.otps[key] || null;
    }

    async saveOtp(email, otpRecord) {
        const key = email.toLowerCase();
        const record = { email: key, ...otpRecord };
        if (this.db) {
            try {
                await this.db.collection('otps').updateOne(
                    { email: key },
                    { $set: record },
                    { upsert: true }
                );
            } catch (err) {
                console.warn('[Storage] MongoDB saveOtp error:', err.message);
            }
        }
        this.data.otps[key] = record;
        this.saveFileStore();
    }

    async deleteOtp(email) {
        const key = email.toLowerCase();
        if (this.db) {
            try {
                await this.db.collection('otps').deleteOne({ email: key });
            } catch (err) {
                console.warn('[Storage] MongoDB deleteOtp error:', err.message);
            }
        }
        delete this.data.otps[key];
        this.saveFileStore();
    }

    async getUser(userId) {
        if (this.db) {
            try {
                return await this.db.collection('users').findOne({ id: userId });
            } catch (err) {
                console.warn('[Storage] MongoDB getUser error:', err.message);
            }
        }
        return this.data.users[userId] || null;
    }

    async getUserByEmail(email) {
        const key = email.toLowerCase();
        if (this.db) {
            try {
                return await this.db.collection('users').findOne({ email: key });
            } catch (err) {
                console.warn('[Storage] MongoDB getUserByEmail error:', err.message);
            }
        }
        for (const user of Object.values(this.data.users)) {
            if (user.email && user.email.toLowerCase() === key) {
                return user;
            }
        }
        return null;
    }

    async saveUser(user) {
        if (this.db) {
            try {
                await this.db.collection('users').updateOne(
                    { id: user.id },
                    { $set: user },
                    { upsert: true }
                );
            } catch (err) {
                console.warn('[Storage] MongoDB saveUser error:', err.message);
            }
        }
        this.data.users[user.id] = user;
        this.saveFileStore();
    }

    async getLibrary(userId) {
        if (this.db) {
            try {
                const lib = await this.db.collection('libraries').findOne({ userId });
                if (lib) return lib;
            } catch (err) {
                console.warn('[Storage] MongoDB getLibrary error:', err.message);
            }
        }
        return this.data.libraries[userId] || {
            userId,
            playlists: [],
            likedSongs: [],
            history: [],
            preferences: {},
            updatedAt: Date.now()
        };
    }

    async saveLibrary(userId, libraryData) {
        const record = { userId, ...libraryData, updatedAt: Date.now() };
        if (this.db) {
            try {
                await this.db.collection('libraries').updateOne(
                    { userId },
                    { $set: record },
                    { upsert: true }
                );
            } catch (err) {
                console.warn('[Storage] MongoDB saveLibrary error:', err.message);
            }
        }
        this.data.libraries[userId] = record;
        this.saveFileStore();
    }
}

const storage = new StorageManager();

// --------------------------------------------------------------------------
// Security Helpers: Hashing, JWT, and Rate Limiter
// --------------------------------------------------------------------------

function hashOtp(code, salt) {
    return crypto.createHmac('sha256', salt).update(code.toString()).digest('hex');
}

function generateUserId(email) {
    const hash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
    return `musica_proton_${hash}`;
}

function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str) {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return Buffer.from(b64, 'base64').toString('utf8');
}

function createSessionToken(user) {
    const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
    const payload = JSON.stringify({
        sub: user.id,
        email: user.email,
        name: user.name,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    });

    const encHeader = base64UrlEncode(header);
    const encPayload = base64UrlEncode(payload);
    const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${encHeader}.${encPayload}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    return `${encHeader}.${encPayload}.${signature}`;
}

function verifySessionToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encHeader, encPayload, signature] = parts;
    const expectedSig = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${encHeader}.${encPayload}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    if (signature !== expectedSig) return null;

    try {
        const payload = JSON.parse(base64UrlDecode(encPayload));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return null; // Expired
        }
        return payload;
    } catch {
        return null;
    }
}

// In-memory send rate limiter per IP/email
const rateLimitMap = new Map();

function checkRateLimit(key) {
    const now = Date.now();
    const entry = rateLimitMap.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
    }
    if (entry.count >= MAX_SEND_PER_WINDOW) {
        const waitSec = Math.ceil((entry.resetAt - now) / 1000);
        return { allowed: false, waitSec };
    }
    entry.count += 1;
    rateLimitMap.set(key, entry);
    return { allowed: true };
}

// --------------------------------------------------------------------------
// Proton Mail Validation
// --------------------------------------------------------------------------

const PROTON_DOMAINS = [
    'proton.me',
    'protonmail.com',
    'pm.me',
    'protonmail.ch'
];

function isValidProtonEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const parts = email.trim().toLowerCase().split('@');
    if (parts.length !== 2) return false;
    const [user, domain] = parts;
    if (!user || !domain) return false;
    return PROTON_DOMAINS.includes(domain);
}

// --------------------------------------------------------------------------
// Resend Email Dispatcher
// --------------------------------------------------------------------------

async function sendOtpEmail(email, code) {
    if (!RESEND_API_KEY) {
        console.warn(`[Resend] RESEND_API_KEY not configured. OTP for ${email} is: ${code}`);
        if (ALLOW_DEV_CONSOLE_OTP || process.env.NODE_ENV !== 'production') {
            return { success: true, simulated: true };
        }
        throw new Error('Email delivery service is not configured (RESEND_API_KEY missing).');
    }

    const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MUSICA Verification Code</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0b0f; color: #ffffff; margin: 0; padding: 24px; }
        .card { max-width: 440px; margin: 0 auto; background: #181824; border-radius: 20px; padding: 36px 28px; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 12px 36px rgba(0,0,0,0.4); text-align: center; }
        .logo { font-size: 26px; font-weight: 800; letter-spacing: 2px; color: #a78bfa; margin-bottom: 8px; }
        .subtitle { font-size: 14px; color: #9ca3af; margin-bottom: 28px; }
        .code-box { background: #262438; border-radius: 12px; padding: 18px 24px; margin: 24px 0; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #6d4aff; border: 1px solid #6d4aff88; }
        .footer { font-size: 12px; color: #6b7280; line-height: 1.5; margin-top: 28px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">MUSICA</div>
        <div class="subtitle">Proton Mail Authentication</div>
        <p style="font-size: 15px; color: #e5e7eb; margin: 0 0 16px 0;">Use the verification code below to sign in to your MUSICA account:</p>
        <div class="code-box">${code}</div>
        <p style="font-size: 13px; color: #9ca3af; margin: 0;">This code expires in 10 minutes. If you did not request this code, you can safely ignore this email.</p>
        <div class="footer">
          MUSICA • High-Fidelity Music Streaming<br/>
          Protected with Proton End-to-End Privacy
        </div>
      </div>
    </body>
    </html>
    `;

    const payload = JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [email],
        subject: `Your MUSICA verification code: ${code}`,
        html: htmlBody,
    });

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: payload,
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error(`[Resend] Failed to send email via Resend (${res.status}): ${errorText}`);
        throw new Error(`Resend email delivery failed: ${res.statusText}`);
    }

    const data = await res.json();
    console.log(`[Resend] Verification code sent successfully to ${email}. ID:`, data.id);
    return { success: true, id: data.id };
}

// --------------------------------------------------------------------------
// HTTP Request / Response Handling
// --------------------------------------------------------------------------

function jsonResponse(res, statusCode, body) {
    const data = JSON.stringify(body);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    });
    res.end(data);
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 2 * 1024 * 1024) { // 2MB limit
                reject(new Error('Request body too large'));
            }
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

function authenticateRequest(req) {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    return verifySessionToken(token);
}

// --------------------------------------------------------------------------
// Server Implementation
// --------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
    // Enable CORS
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        });
        return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

    try {
        // Health check (used by Render and uptime checks)
        if (req.method === 'GET' && (pathname === '/healthz' || pathname === '/health' || pathname === '/')) {
            return jsonResponse(res, 200, {
                status: 'ok',
                service: 'musica-backend',
                timestamp: Date.now(),
                resendConfigured: Boolean(RESEND_API_KEY),
                mongoConnected: Boolean(storage.db),
            });
        }

        // ------------------------------------------------------------------
        // POST /api/auth/proton/send-otp
        // ------------------------------------------------------------------
        if (req.method === 'POST' && pathname === '/api/auth/proton/send-otp') {
            const body = await parseBody(req);
            const email = (body.email || '').trim().toLowerCase();

            if (!isValidProtonEmail(email)) {
                return jsonResponse(res, 400, {
                    error: 'invalid_email',
                    message: 'Please provide a valid Proton email address (@proton.me, @protonmail.com, @pm.me)',
                });
            }

            // Check IP & email rate limiting
            const rateCheck = checkRateLimit(`${clientIp}:${email}`);
            if (!rateCheck.allowed) {
                return jsonResponse(res, 429, {
                    error: 'rate_limited',
                    message: `Too many requests. Please wait ${rateCheck.waitSec} seconds before trying again.`,
                    retryAfter: rateCheck.waitSec,
                });
            }

            // Check existing OTP cooldown
            const existing = await storage.getOtp(email);
            const now = Date.now();
            if (existing && existing.lastSentAt && (now - existing.lastSentAt < OTP_COOLDOWN_MS)) {
                const waitSec = Math.ceil((OTP_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
                return jsonResponse(res, 429, {
                    error: 'cooldown_active',
                    message: `Please wait ${waitSec} seconds before requesting a new code.`,
                    retryAfter: waitSec,
                });
            }

            // Generate 6-digit cryptographically secure code
            const code = crypto.randomInt(100000, 1000000).toString();
            const salt = crypto.randomBytes(16).toString('hex');
            const hashed = hashOtp(code, salt);

            await storage.saveOtp(email, {
                hash: hashed,
                salt: salt,
                expiresAt: now + OTP_EXPIRY_MS,
                lastSentAt: now,
                attempts: 0,
            });

            // Send via Resend
            try {
                const delivery = await sendOtpEmail(email, code);
                return jsonResponse(res, 200, {
                    success: true,
                    message: 'Verification code sent to your Proton email.',
                    cooldownSeconds: 60,
                    expiresInSeconds: 600,
                    simulated: delivery.simulated || false,
                });
            } catch (sendErr) {
                console.error('[SendOTP Error]', sendErr.message);
                return jsonResponse(res, 502, {
                    error: 'email_delivery_failed',
                    message: sendErr.message || 'Failed to dispatch verification code via email provider.',
                });
            }
        }

        // ------------------------------------------------------------------
        // POST /api/auth/proton/verify-otp
        // ------------------------------------------------------------------
        if (req.method === 'POST' && pathname === '/api/auth/proton/verify-otp') {
            const body = await parseBody(req);
            const email = (body.email || '').trim().toLowerCase();
            const code = (body.code || '').trim();

            if (!isValidProtonEmail(email)) {
                return jsonResponse(res, 400, {
                    error: 'invalid_email',
                    message: 'Invalid Proton email address format.',
                });
            }

            if (!/^\d{6}$/.test(code)) {
                return jsonResponse(res, 400, {
                    error: 'invalid_code',
                    message: 'Verification code must be exactly 6 digits.',
                });
            }

            const otpRecord = await storage.getOtp(email);
            const now = Date.now();

            if (!otpRecord) {
                return jsonResponse(res, 400, {
                    error: 'code_not_found',
                    message: 'No active verification code found for this email. Please request a new one.',
                });
            }

            if (now > otpRecord.expiresAt) {
                await storage.deleteOtp(email);
                return jsonResponse(res, 400, {
                    error: 'code_expired',
                    message: 'Verification code has expired. Please request a new one.',
                });
            }

            if (otpRecord.attempts >= MAX_VERIFY_ATTEMPTS) {
                await storage.deleteOtp(email);
                return jsonResponse(res, 429, {
                    error: 'max_attempts_exceeded',
                    message: 'Too many incorrect attempts. This code has been invalidated. Please request a new code.',
                });
            }

            // Verify code hash
            const expectedHash = hashOtp(code, otpRecord.salt);
            if (expectedHash !== otpRecord.hash) {
                otpRecord.attempts = (otpRecord.attempts || 0) + 1;
                await storage.saveOtp(email, otpRecord);
                const remaining = MAX_VERIFY_ATTEMPTS - otpRecord.attempts;
                return jsonResponse(res, 400, {
                    error: 'incorrect_code',
                    message: `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
                    remainingAttempts: remaining,
                });
            }

            // Verification successful! Invalidate OTP
            await storage.deleteOtp(email);

            // Fetch or create MUSICA user
            let user = await storage.getUserByEmail(email);
            const isNewUser = !user;
            if (!user) {
                const userId = generateUserId(email);
                const defaultName = email.split('@')[0];
                user = {
                    id: userId,
                    email: email,
                    name: defaultName,
                    avatarUrl: '',
                    provider: 'proton',
                    createdAt: now,
                    updatedAt: now,
                };
                await storage.saveUser(user);
            }

            const token = createSessionToken(user);

            return jsonResponse(res, 200, {
                success: true,
                token: token,
                isNewUser: isNewUser,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    avatarUrl: user.avatarUrl,
                    provider: 'proton',
                },
            });
        }

        // ------------------------------------------------------------------
        // Protected: GET /api/user/profile
        // ------------------------------------------------------------------
        if (req.method === 'GET' && pathname === '/api/user/profile') {
            const auth = authenticateRequest(req);
            if (!auth) {
                return jsonResponse(res, 401, { error: 'unauthorized', message: 'Invalid or expired session token.' });
            }
            const user = await storage.getUser(auth.sub);
            if (!user) {
                return jsonResponse(res, 404, { error: 'user_not_found', message: 'User not found.' });
            }
            return jsonResponse(res, 200, { success: true, user });
        }

        // ------------------------------------------------------------------
        // Protected: PUT /api/user/profile
        // ------------------------------------------------------------------
        if (req.method === 'PUT' && pathname === '/api/user/profile') {
            const auth = authenticateRequest(req);
            if (!auth) {
                return jsonResponse(res, 401, { error: 'unauthorized', message: 'Invalid or expired session token.' });
            }
            const body = await parseBody(req);
            const user = await storage.getUser(auth.sub);
            if (!user) {
                return jsonResponse(res, 404, { error: 'user_not_found', message: 'User not found.' });
            }

            if (body.name !== undefined) user.name = String(body.name).trim();
            if (body.avatarUrl !== undefined) user.avatarUrl = String(body.avatarUrl);
            user.updatedAt = Date.now();

            await storage.saveUser(user);
            return jsonResponse(res, 200, { success: true, user });
        }

        // ------------------------------------------------------------------
        // Protected: GET /api/user/library
        // ------------------------------------------------------------------
        if (req.method === 'GET' && pathname === '/api/user/library') {
            const auth = authenticateRequest(req);
            if (!auth) {
                return jsonResponse(res, 401, { error: 'unauthorized', message: 'Invalid or expired session token.' });
            }
            const lib = await storage.getLibrary(auth.sub);
            return jsonResponse(res, 200, { success: true, library: lib });
        }

        // ------------------------------------------------------------------
        // Protected: POST /api/user/library/sync
        // ------------------------------------------------------------------
        if (req.method === 'POST' && pathname === '/api/user/library/sync') {
            const auth = authenticateRequest(req);
            if (!auth) {
                return jsonResponse(res, 401, { error: 'unauthorized', message: 'Invalid or expired session token.' });
            }
            const body = await parseBody(req);
            const existingLib = await storage.getLibrary(auth.sub);

            const updatedLib = {
                userId: auth.sub,
                playlists: Array.isArray(body.playlists) ? body.playlists : existingLib.playlists || [],
                likedSongs: Array.isArray(body.likedSongs) ? body.likedSongs : existingLib.likedSongs || [],
                history: Array.isArray(body.history) ? body.history : existingLib.history || [],
                preferences: body.preferences && typeof body.preferences === 'object' ? body.preferences : existingLib.preferences || {},
                updatedAt: Date.now(),
            };

            await storage.saveLibrary(auth.sub, updatedLib);
            return jsonResponse(res, 200, { success: true, library: updatedLib });
        }

        // Unknown route
        return jsonResponse(res, 404, { error: 'not_found', message: `Cannot ${req.method} ${pathname}` });
    } catch (err) {
        console.error('[Server Error]', err);
        return jsonResponse(res, 500, { error: 'internal_error', message: err.message || 'Server error' });
    }
});

server.on('error', (err) => {
    console.error('[Server Listen Error]', err);
});

if (import.meta.url === `file://${process.argv[1]}` || !process.env.MUSICA_TEST_MODE) {
    server.listen(PORT, HOST, () => {
        console.log(`[MUSICA Backend] Listening on http://${HOST}:${PORT}`);
    });
}

export { server, storage };
export default server;

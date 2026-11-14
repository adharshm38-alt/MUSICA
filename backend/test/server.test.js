import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.MUSICA_TEST_MODE = 'true';
process.env.ALLOW_DEV_CONSOLE_OTP = 'true';
process.env.RESEND_API_KEY = '';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', '.data', 'musica_cloud_store.json');

const { default: server, storage } = await import('../server.js');

const TEST_PORT = 3099;

function request(options, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({ port: TEST_PORT, host: '127.0.0.1', ...options }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch { parsed = data; }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

test('MUSICA Backend Tests', async (t) => {
    await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

    // Clean test email before running
    await storage.deleteOtp('musica.tester@proton.me');

    await t.test('GET /healthz returns 200 ok', async () => {
        const res = await request({ method: 'GET', path: '/healthz' });
        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'ok');
        assert.equal(res.body.service, 'musica-backend');
    });

    await t.test('POST /api/auth/proton/send-otp rejects non-Proton emails', async () => {
        const res = await request(
            { method: 'POST', path: '/api/auth/proton/send-otp', headers: { 'Content-Type': 'application/json' } },
            { email: 'user@gmail.com' }
        );
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'invalid_email');
    });

    await t.test('POST /api/auth/proton/send-otp accepts valid Proton email', async () => {
        const res = await request(
            { method: 'POST', path: '/api/auth/proton/send-otp', headers: { 'Content-Type': 'application/json' } },
            { email: 'musica.tester@proton.me' }
        );
        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.cooldownSeconds, 60);
    });

    await t.test('POST /api/auth/proton/send-otp triggers cooldown on immediate retry', async () => {
        const res = await request(
            { method: 'POST', path: '/api/auth/proton/send-otp', headers: { 'Content-Type': 'application/json' } },
            { email: 'musica.tester@proton.me' }
        );
        assert.equal(res.status, 429);
        assert.equal(res.body.error, 'cooldown_active');
    });

    await t.test('POST /api/auth/proton/verify-otp fails on incorrect code', async () => {
        const res = await request(
            { method: 'POST', path: '/api/auth/proton/verify-otp', headers: { 'Content-Type': 'application/json' } },
            { email: 'musica.tester@proton.me', code: '000000' }
        );
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'incorrect_code');
        assert.equal(res.body.remainingAttempts, 4);
    });

    let validToken = '';
    let musicaUserId = '';

    await t.test('Verify OTP succeeds with correct code and issues JWT + unique MUSICA ID', async () => {
        const otpRecord = await storage.getOtp('musica.tester@proton.me');
        assert.ok(otpRecord);

        const testCode = '654321';
        otpRecord.hash = crypto.createHmac('sha256', otpRecord.salt).update(testCode).digest('hex');
        await storage.saveOtp('musica.tester@proton.me', otpRecord);

        const res = await request(
            { method: 'POST', path: '/api/auth/proton/verify-otp', headers: { 'Content-Type': 'application/json' } },
            { email: 'musica.tester@proton.me', code: testCode }
        );
        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assert.ok(res.body.token);
        assert.ok(res.body.user.id.startsWith('musica_proton_'));
        assert.equal(res.body.user.email, 'musica.tester@proton.me');

        validToken = res.body.token;
        musicaUserId = res.body.user.id;
    });

    await t.test('GET /api/user/profile returns authenticated user', async () => {
        const res = await request({
            method: 'GET',
            path: '/api/user/profile',
            headers: { 'Authorization': `Bearer ${validToken}` }
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.user.id, musicaUserId);
        assert.equal(res.body.user.email, 'musica.tester@proton.me');
    });

    await t.test('POST /api/user/library/sync stores user library isolated by userId', async () => {
        const payload = {
            playlists: [
                { id: 'p1', title: 'Synthwave Night', coverUrl: 'https://example.com/cover.jpg', tracks: ['t1', 't2'] }
            ],
            likedSongs: [
                { id: 't1', title: 'Midnight City', artist: 'M83' }
            ],
            preferences: { theme: 'dark_glass' }
        };

        const res = await request({
            method: 'POST',
            path: '/api/user/library/sync',
            headers: {
                'Authorization': `Bearer ${validToken}`,
                'Content-Type': 'application/json'
            }
        }, payload);

        assert.equal(res.status, 200);
        assert.equal(res.body.library.playlists.length, 1);
        assert.equal(res.body.library.likedSongs.length, 1);

        // Verify with GET
        const getRes = await request({
            method: 'GET',
            path: '/api/user/library',
            headers: { 'Authorization': `Bearer ${validToken}` }
        });
        assert.equal(getRes.status, 200);
        assert.equal(getRes.body.library.playlists[0].title, 'Synthwave Night');
    });

    await t.test('Protected endpoint rejects missing or tampered token', async () => {
        const res = await request({
            method: 'GET',
            path: '/api/user/profile',
            headers: { 'Authorization': 'Bearer tampered.token.sig' }
        });
        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'unauthorized');
    });

    server.close();
});

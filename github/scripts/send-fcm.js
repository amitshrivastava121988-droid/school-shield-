// ============================================================
// SchoolShield — FCM Push Sender
// Polls Firebase Realtime Database for unprocessed fcmTriggers
// and sends real push notifications via FCM HTTP v1 API.
// ============================================================
const https = require('https');

const DB_URL = 'https://school-shield-df230-default-rtdb.firebaseio.com';
const PROJECT_ID = 'school-shield-df230';

function httpRequest(method, url, headers, body) {
return new Promise((resolve, reject) => {
const data = body ? JSON.stringify(body) : null;
const u = new URL(url);
const opts = {
method,
hostname: u.hostname,
path: u.pathname + u.search,
headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}, data ? { 'Content-Length': Buffer.byteLength(data) } : {})
};
const req = https.request(opts, (res) => {
let chunks = '';
res.on('data', (c) => chunks += c);
res.on('end', () => {
let parsed = null;
try { parsed = chunks ? JSON.parse(chunks) : null; } catch (e) { parsed = chunks; }
if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
else reject(new Error('HTTP ' + res.statusCode + ': ' + chunks));
});
});
req.on('error', reject);
if (data) req.write(data);
req.end();
});
}

// Get OAuth2 access token using the service account (JWT bearer flow, no extra npm deps)
async function getAccessToken(serviceAccount) {
const crypto = require('crypto');
const nowSec = Math.floor(Date.now() / 1000);
const header = { alg: 'RS256', typ: 'JWT' };
const claim = {
iss: serviceAccount.client_email,
scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
aud: 'https://oauth2.googleapis.com/token',
exp: nowSec + 3600,
iat: nowSec
};
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const toSign = b64(header) + '.' + b64(claim);
const signer = crypto.createSign('RSA-SHA256');
signer.update(toSign);
signer.end();
const signature = signer.sign(serviceAccount.private_key).toString('base64url');
const jwt = toSign + '.' + signature;

const resp = await httpRequest('POST', 'https://oauth2.googleapis.com/token', { 'Content-Type': 'application/x-www-form-urlencoded' },
null);
// Manual form body since httpRequest json-encodes by default
return new Promise((resolve, reject) => {
const bodyStr = 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt);
const req = https.request({
method: 'POST',
hostname: 'oauth2.googleapis.com',
path: '/token',
headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(bodyStr) }
}, (res) => {
let chunks = '';
res.on('data', (c) => chunks += c);
res.on('end', () => {
try {
const parsed = JSON.parse(chunks);
if (parsed.access_token) resolve(parsed.access_token);
else reject(new Error('No access_token in response: ' + chunks));
} catch (e) { reject(e); }
});
});
req.on('error', reject);
req.write(bodyStr);
req.end();
});
}

async function getUnprocessedTriggers(dbAuthToken) {
const url = DB_URL + '/schoolshield/fcmTriggers.json' + (dbAuthToken ? ('?auth=' + dbAuthToken) : '');
const data = await httpRequest('GET', url, {}, null);
if (!data) return [];
return Object.keys(data).map((key) => Object.assign({ _key: key }, data[key])).filter((t) => !t.processed);
}

async function markProcessed(key, dbAuthToken) {
const url = DB_URL + '/schoolshield/fcmTriggers/' + key + '.json' + (dbAuthToken ? ('?auth=' + dbAuthToken) : '');
await httpRequest('PATCH', url, {}, { processed: true });
}

async function getTokensForTrigger(trigger, dbAuthToken) {
const schoolId = trigger.schoolId;
if (!schoolId) return [];
const isAll = trigger.studentId === 'ALL' || trigger.isAll;
if (isAll) {
const url = DB_URL + '/schoolshield/fcmTokens/' + schoolId + '.json' + (dbAuthToken ? ('?auth=' + dbAuthToken) : '');
const data = await httpRequest('GET', url, {}, null);
if (!data) return [];
return Object.values(data).map((v) => v.token).filter(Boolean);
}
const safePhone = (trigger.parentPhone || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
const url = DB_URL + '/schoolshield/fcmTokens/' + schoolId + '/' + safePhone + '.json' + (dbAuthToken ? ('?auth=' + dbAuthToken) : '');
const data = await httpRequest('GET', url, {}, null);
return data && data.token ? [data.token] : [];
}

async function sendFcmMessage(accessToken, token, title, body, dataPayload) {
const url = 'https://fcm.googleapis.com/v1/projects/' + PROJECT_ID + '/messages:send';
const message = {
message: {
token: token,
notification: { title: title, body: body },
webpush: {
notification: { icon: '/icon-192.png', badge: '/icon-192.png' },
fcm_options: { link: '/' }
},
data: dataPayload || {}
}
};
try {
await httpRequest('POST', url, { Authorization: 'Bearer ' + accessToken }, message);
return true;
} catch (e) {
console.log('Send failed for a token:', e.message);
return false;
}
}

async function processOnce(accessToken, dbAuthToken) {
const triggers = await getUnprocessedTriggers(dbAuthToken);
if (triggers.length === 0) return 0;
console.log('Found', triggers.length, 'unprocessed trigger(s)');
for (const t of triggers) {
const tokens = await getTokensForTrigger(t, dbAuthToken);
console.log('Trigger', t._key, '-> sending to', tokens.length, 'device(s)');
const title = (t.type === 'PANIC' || t.isPanic) ? '🚨 SchoolShield Alert' : 'SchoolShield';
const body = t.message || 'You have a new alert';
for (const tok of tokens) {
await sendFcmMessage(accessToken, tok, title, body, { alertId: String(t.id || ''), type: String(t.type || '') });
}
await markProcessed(t._key, dbAuthToken);
}
return triggers.length;
}

async function main() {
const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saJson) { console.error('Missing FIREBASE_SERVICE_ACCOUNT env var'); process.exit(1); }
const serviceAccount = JSON.parse(saJson);
const dbAuthToken = process.env.FIREBASE_DB_SECRET || null;

const accessToken = await getAccessToken(serviceAccount);
console.log('Got FCM access token');

// Poll for ~4.5 minutes, checking every 15 seconds, to stay under GitHub's
// minimum ~5 minute cron interval while still feeling near-instant.
const endTime = Date.now() + (4.5 * 60 * 1000);
while (Date.now() < endTime) {
try {
await processOnce(accessToken, dbAuthToken);
} catch (e) {
console.log('Poll error:', e.message);
}
await new Promise((r) => setTimeout(r, 15000));
}
console.log('Polling window ended.');
}

main().catch((e) => { console.error(e); process.exit(1); });

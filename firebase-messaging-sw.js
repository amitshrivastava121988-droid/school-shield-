// ============================================================
// SchoolShield Service Worker
// - Firebase Cloud Messaging (push notifications)
// - Offline app-shell caching (so app opens even without internet)
// ============================================================

importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

firebase.initializeApp({
apiKey: "AIzaSyBZ-l1Mp-B4m024DLD-e2yRuXu49gld1Lg",
authDomain: "school-shield-df230.firebaseapp.com",
databaseURL: "https://school-shield-df230-default-rtdb.firebaseio.com",
projectId: "school-shield-df230",
storageBucket: "school-shield-df230.firebasestorage.app",
messagingSenderId: "721192911180",
appId: "1:721192911180:web:9ca9bda66514e2815f8fe9"
});

var messaging = null;
try { messaging = firebase.messaging(); } catch (e) { messaging = null; }

if (messaging) {
messaging.onBackgroundMessage(function (payload) {
var title = (payload.notification && payload.notification.title) || "SchoolShield";
var options = {
body: (payload.notification && payload.notification.body) || "",
icon: "/icon-192.png",
badge: "/icon-192.png",
data: payload.data || {}
};
self.registration.showNotification(title, options);
});
}

self.addEventListener("notificationclick", function (event) {
event.notification.close();
event.waitUntil(
clients.matchAll({ type: "window" }).then(function (clientList) {
for (var i = 0; i < clientList.length; i++) {
var client = clientList[i];
if ("focus" in client) return client.focus();
}
if (clients.openWindow) return clients.openWindow("/");
})
);
});

// ============================================================
// OFFLINE APP-SHELL CACHING
// ============================================================
var CACHE_VERSION = "schoolshield-shell-v1";

var APP_SHELL = [
"/",
"https://unpkg.com/react@18/umd/react.production.min.js",
"https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
"https://unpkg.com/@babel/standalone@7.23.9/babel.min.js",
"https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
"https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js",
"https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js",
"https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js",
"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", function (event) {
self.skipWaiting();
event.waitUntil(
caches.open(CACHE_VERSION).then(function (cache) {
return Promise.all(
APP_SHELL.map(function (url) {
return fetch(url, { mode: "no-cors" })
.then(function (resp) { return cache.put(url, resp); })
.catch(function () {});
})
);
})
);
});

self.addEventListener("activate", function (event) {
event.waitUntil(
caches.keys().then(function (names) {
return Promise.all(
names.map(function (name) {
if (name !== CACHE_VERSION) return caches.delete(name);
})
);
}).then(function () { return self.clients.claim(); })
);
});

self.addEventListener("fetch", function (event) {
var req = event.request;
if (req.method !== "GET") return;

// Never intercept Firebase Realtime Database / API traffic - always go live
if (
req.url.indexOf("firebaseio.com") !== -1 ||
req.url.indexOf("googleapis.com") !== -1 ||
req.url.indexOf("firebasedatabase.app") !== -1
) {
return;
}

event.respondWith(
caches.match(req).then(function (cached) {
if (cached) {
// Serve instantly from cache, then silently refresh in background
fetch(req)
.then(function (resp) {
if (resp) {
caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, resp); });
}
})
.catch(function () {});
return cached;
}
return fetch(req)
.then(function (resp) {
if (resp && resp.status === 200) {
var respClone = resp.clone();
caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, respClone); });
}
return resp;
})
.catch(function () {
// Offline and nothing cached yet - fall back to the app shell for page loads
if (req.mode === "navigate") return caches.match("/");
});
})
);
});

// firebase-messaging-sw.js
// IMPORTANT: This file must be deployed at the ROOT of schoolshield.pro
// (same folder as app.html) — i.e. https://schoolshield.pro/firebase-messaging-sw.js
// It must NOT be renamed or placed inside a subfolder, otherwise push
// notifications and the "Service worker registration failed" console
// error will keep appearing.

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

var messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var notificationTitle = (payload.notification && payload.notification.title) || "SchoolShield";
  var notificationOptions = {
    body: (payload.notification && payload.notification.body) || "",
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛡️</text></svg>"
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

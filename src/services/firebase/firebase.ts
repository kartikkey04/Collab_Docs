/**
 * src/services/firebase/firebase.ts
 *
 * Initializes the Firebase Admin SDK.
 * Used for verifying ID tokens from the frontend (Phone Auth).
 */

import admin from "firebase-admin";
import { config } from "../../config/env.js";

// Only initialize if it hasn't been already (prevents errors in dev hot-reloads)
if (!admin.apps.length) {
  // We only initialize if we have the credentials.
  // This allows the server to start even if Firebase isn't configured yet.
  if (config.firebaseProjectId && config.firebaseClientEmail && config.firebasePrivateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebaseProjectId,
        clientEmail: config.firebaseClientEmail,
        // Private key often contains newlines which get escaped in .env
        privateKey: config.firebasePrivateKey.replace(/\\n/g, "\n"),
      }),
    });
    console.log("Firebase Admin initialized");
  } else {
    console.warn("Firebase Admin NOT initialized: Missing credentials in .env");
  }
}

export const firebaseAdmin = admin;

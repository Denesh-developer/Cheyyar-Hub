// File location: api/send-push.js  (Vercel auto-detects anything in
// /api as a serverless function — no extra config needed)
//
// This replaces the Firebase Cloud Function. It runs on Vercel's own
// free tier (independent of Firebase billing), so the Firebase project
// can stay on the free Spark plan.
//
// NOTE: uses ES module syntax (import/export default) because Vite
// projects set "type": "module" in package.json.
//
// SETUP:
//   1. npm install firebase-admin  (in your project root, same
//      package.json as the React app)
//   2. Firebase Console → Project settings → Service accounts →
//      "Generate new private key" → downloads a JSON file.
//   3. In Vercel dashboard → your project → Settings → Environment
//      Variables, add THREE variables from that JSON file:
//        FIREBASE_PROJECT_ID     = the "project_id" value
//        FIREBASE_CLIENT_EMAIL   = the "client_email" value
//        FIREBASE_PRIVATE_KEY    = the "private_key" value, paste
//                                   exactly as-is (keep the \n's)
//      Never commit the JSON file itself to git.
//   4. Redeploy on Vercel so the new env vars take effect.

import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel env vars store literal "\n" as two characters —
      // turn them back into real newlines for the PEM key to parse.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(
        /\\n/g,
        "\n"
      ),
    }),
  });
}

const db = admin.firestore();
const messaging = admin.messaging();

const TITLES = {
  like: "New like ❤️",
  comment: "New comment 💬",
  follow: "New follower 👤",
  message: "New message 💬",
  share: "Post shared ↗️",
  verified: "You're verified! ✅",
};

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify the request really came from a signed-in user of THIS app —
  // without this, anyone could POST here and spam any receiverId.
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.replace("Bearer ", "");

  if (!idToken) {
    return res.status(401).json({ error: "Missing ID token" });
  }

  let senderUid;

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    senderUid = decoded.uid;
  } catch (err) {
    return res.status(401).json({ error: "Invalid ID token" });
  }

  const { receiverId, type, message } = req.body || {};

  if (!receiverId || receiverId === senderUid) {
    // Don't push someone a notification about their own action.
    return res.status(200).json({ skipped: true });
  }

  try {

    const userSnap = await db.collection("users").doc(receiverId).get();

    if (!userSnap.exists) {
      return res.status(200).json({ skipped: true });
    }

    const tokens = userSnap.data().fcmTokens || [];

    if (tokens.length === 0) {
      return res.status(200).json({ skipped: true });
    }

    const response = await messaging.sendEachForMulticast({
      notification: {
        title: TITLES[type] || "Cheyyar Hub",
        body: message || "You have a new notification.",
      },
      android: {
        priority: "high",
        notification: { channelId: "cheyyar_default" },
      },
      tokens,
    });

    // Prune tokens FCM says are dead (app uninstalled, permission
    // revoked, browser data cleared) so the array doesn't grow forever.
    const deadTokens = [];

    response.responses.forEach((r, i) => {
      if (
        !r.success &&
        (
          r.error?.code === "messaging/invalid-registration-token" ||
          r.error?.code === "messaging/registration-token-not-registered"
        )
      ) {
        deadTokens.push(tokens[i]);
      }
    });

    if (deadTokens.length > 0) {
      await db.collection("users").doc(receiverId).update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens),
      });
    }

    return res.status(200).json({ sent: response.successCount });

  } catch (err) {

    console.error("send-push error:", err);
    return res.status(500).json({ error: "Failed to send push" });

  }
}
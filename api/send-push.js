import * as admin from "firebase-admin";

function getFirebaseAdmin() {
  const apps = admin.apps || admin.default?.apps || [];
  if (apps.length > 0) {
    return admin.apps ? admin : admin.default;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.error("Missing Firebase Admin Environment Variables in Vercel.");
    return null;
  }

  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  const firebaseApp = admin.initializeApp ? admin : admin.default;

  try {
    firebaseApp.initializeApp({
      credential: firebaseApp.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    return firebaseApp;
  } catch (err) {
    console.error("Firebase admin init failure:", err);
    return null;
  }
}

const TITLES = {
  like: "New like ❤️",
  comment: "New comment 💬",
  follow: "New follower 👤",
  follow_request: "New follow request 🔒",
  message: "New message 💬",
  share: "Post shared ↗️",
  verified: "You're verified! ✅",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fbAdmin = getFirebaseAdmin();
  if (!fbAdmin) {
    return res.status(500).json({
      error: "Firebase Admin configuration error. Check Vercel Environment Variables.",
    });
  }

  const db = fbAdmin.firestore();
  const messaging = fbAdmin.messaging();

  try {
    let body = req.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const { receiverId, type, message, postId = "" } = body;

    const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
    const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!idToken) {
      return res.status(401).json({ error: "Missing ID token" });
    }

    let senderUid;
    try {
      const decoded = await fbAdmin.auth().verifyIdToken(idToken);
      senderUid = decoded.uid;
    } catch (authErr) {
      console.error("Verify ID Token Error:", authErr.message);
      return res.status(401).json({ error: "Invalid ID token" });
    }

    if (!receiverId || receiverId === senderUid) {
      return res.status(200).json({ skipped: true, reason: "Self-action or missing receiver" });
    }

    const userSnap = await db.collection("users").doc(receiverId).get();
    if (!userSnap.exists) {
      return res.status(200).json({ skipped: true, reason: "Receiver profile not found" });
    }

    const userData = userSnap.data() || {};
    let tokens = userData.fcmTokens || [];

    if (!Array.isArray(tokens) || tokens.length === 0) {
      if (userData.fcmToken && typeof userData.fcmToken === "string") {
        tokens = [userData.fcmToken];
      }
    }

    tokens = tokens.filter((t) => typeof t === "string" && t.trim().length > 0);

    if (tokens.length === 0) {
      return res.status(200).json({ skipped: true, reason: "No FCM tokens registered" });
    }

    const response = await messaging.sendEachForMulticast({
      notification: {
        title: TITLES[type] || "Cheyyar Hub",
        body: message || "You have a new update.",
      },
      data: {
        type: String(type || ""),
        postId: String(postId || ""),
        senderId: String(senderUid || ""),
      },
      android: {
        priority: "high",
        notification: {
          channelId: "cheyyar_alerts_v1",
          sound: "default",
        },
      },
      tokens,
    });

    console.log(`Push multicast result — Sent: ${response.successCount}, Failed: ${response.failureCount}`);

    const deadTokens = [];
    response.responses.forEach((r, idx) => {
      if (
        !r.success &&
        (r.error?.code === "messaging/invalid-registration-token" ||
          r.error?.code === "messaging/registration-token-not-registered")
      ) {
        deadTokens.push(tokens[idx]);
      }
    });

    if (deadTokens.length > 0) {
      const FieldValue = fbAdmin.firestore.FieldValue;
      await db.collection("users").doc(receiverId).update({
        fcmTokens: FieldValue.arrayRemove(...deadTokens),
      });
    }

    return res.status(200).json({ sent: response.successCount });
  } catch (err) {
    console.error("send-push handler failure:", err);
    return res.status(500).json({ error: err.message || "Failed to process push request" });
  }
}
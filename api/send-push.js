import admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    const rawKey = process.env.FIREBASE_PRIVATE_KEY || "";
    // Handle both escaped and unescaped newlines
    const formattedKey = rawKey.includes("\\n")
      ? rawKey.replace(/\\n/g, "\n")
      : rawKey;

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedKey,
      }),
    });
  } catch (initErr) {
    console.error("Firebase admin init error:", initErr);
  }
}

const db = admin.firestore();
const messaging = admin.messaging();

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

  try {
    // 1. Safe Body Parser (Vercel edge/node support)
    let body = req.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (pErr) {
        body = {};
      }
    }

    const { receiverId, type, message, postId = "" } = body;

    // 2. Auth Header Check
    const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;

    if (!idToken) {
      return res.status(401).json({ error: "Missing ID token" });
    }

    let senderUid;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      senderUid = decoded.uid;
    } catch (authErr) {
      console.error("Verify ID Token Error:", authErr.message);
      return res.status(401).json({ error: "Invalid ID token" });
    }

    if (!receiverId || receiverId === senderUid) {
      return res.status(200).json({ skipped: true, reason: "self-action or missing receiver" });
    }

    // 3. Get Receiver's FCM Tokens
    const userSnap = await db.collection("users").doc(receiverId).get();
    if (!userSnap.exists) {
      return res.status(200).json({ skipped: true, reason: "receiver not found" });
    }

    const userData = userSnap.data() || {};
    let tokens = userData.fcmTokens || [];

    if (!Array.isArray(tokens) || tokens.length === 0) {
      if (userData.fcmToken && typeof userData.fcmToken === "string") {
        tokens = [userData.fcmToken];
      }
    }

    // Filter valid strings only
    tokens = tokens.filter((t) => typeof t === "string" && t.trim().length > 0);

    if (tokens.length === 0) {
      return res.status(200).json({ skipped: true, reason: "no fcm tokens registered" });
    }

    // 4. Send Multicast Push
    const response = await messaging.sendEachForMulticast({
      notification: {
        title: TITLES[type] || "Cheyyar Hub",
        body: message || "You have a new notification.",
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

    console.log(`Push sent successfully. Success: ${response.successCount}, Failures: ${response.failureCount}`);

    // Clean up expired/invalid tokens
    const deadTokens = [];
    response.responses.forEach((r, i) => {
      if (
        !r.success &&
        (r.error?.code === "messaging/invalid-registration-token" ||
          r.error?.code === "messaging/registration-token-not-registered")
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
    console.error("send-push unhandled exception:", err);
    return res.status(500).json({ error: err.message || "Failed to send push" });
  }
}
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
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
  follow_request: "New follow request 🔒", // 👈 Added for private accounts
  message: "New message 💬",
  share: "Post shared ↗️",
  verified: "You're verified! ✅",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

  const { receiverId, type, message, postId = "" } = req.body || {};

  if (!receiverId || receiverId === senderUid) {
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
      // App background-la irunthu click panna handle seiyya data payload:
      data: {
        type: String(type || ""),
        postId: String(postId || ""),
        senderId: String(senderUid || ""),
      },
      android: {
        priority: "high",
        notification: {
          channelId: "cheyyar_default",
          sound: "default",
        },
      },
      tokens,
    });

    // Dead token cleanup
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
    console.error("send-push error:", err);
    return res.status(500).json({ error: "Failed to send push" });
  }
}
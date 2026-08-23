
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { Resend } = require("resend");

admin.initializeApp();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const OTP_FROM = defineSecret("OTP_FROM");

const OTP_COLLECTION = "emailOtpChallenges";
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashOtp(email, otp) {
  return crypto
    .createHash("sha256")
    .update(`${email}:${otp}:${process.env.GCLOUD_PROJECT || ""}`)
    .digest("hex");
}

function randomOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

exports.sendEmailOtp = onCall(
  {
    secrets: [RESEND_API_KEY, OTP_FROM],
    region: "asia-south1",
    enforceAppCheck: false,
  },
  async (request) => {
    const email = normalizeEmail(request.data?.email);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "Enter a valid email address.");
    }

    const db = admin.firestore();
    const ref = db.collection(OTP_COLLECTION).doc(email);
    const snap = await ref.get();

    if (snap.exists) {
      const data = snap.data();
      const lastSent = data.lastSentAt?.toMillis?.() || 0;
      if (Date.now() - lastSent < RESEND_COOLDOWN_MS) {
        throw new HttpsError(
          "resource-exhausted",
          "Please wait 60 seconds before requesting another OTP."
        );
      }
    }

    const otp = randomOtp();

    await ref.set(
      {
        email,
        otpHash: hashOtp(email, otp),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
        lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
        attempts: 0,
        verified: false,
      },
      { merge: true }
    );

    const resend = new Resend(RESEND_API_KEY.value());
    const from = OTP_FROM.value();

    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: "Your Cheyyar Hub verification code",
      text: `Your Cheyyar Hub OTP is ${otp}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
          <h2 style="margin-bottom:8px">Cheyyar Hub</h2>
          <p>Your verification code is:</p>
          <div style="font-size:34px;font-weight:700;letter-spacing:8px;margin:24px 0">${otp}</div>
          <p>This code expires in 10 minutes.</p>
          <p style="color:#777;font-size:13px">If you did not request this code, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      await ref.delete().catch(() => {});
      console.error("Resend error:", error);
      throw new HttpsError("internal", "Could not send the verification email.");
    }

    return { ok: true };
  }
);

exports.verifyEmailOtp = onCall(
  {
    region: "asia-south1",
    enforceAppCheck: false,
  },
  async (request) => {
    const email = normalizeEmail(request.data?.email);
    const otp = String(request.data?.otp || "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "Invalid email address.");
    }

    if (!/^\d{6}$/.test(otp)) {
      throw new HttpsError("invalid-argument", "Enter the 6-digit OTP.");
    }

    const db = admin.firestore();
    const ref = db.collection(OTP_COLLECTION).doc(email);
    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "OTP not found. Request a new code.");
    }

    const data = snap.data();
    const expiresAt = data.expiresAt?.toMillis?.() || 0;
    const attempts = Number(data.attempts || 0);

    if (expiresAt < Date.now()) {
      await ref.delete().catch(() => {});
      throw new HttpsError("deadline-exceeded", "OTP expired. Request a new code.");
    }

    if (attempts >= MAX_ATTEMPTS) {
      await ref.delete().catch(() => {});
      throw new HttpsError("resource-exhausted", "Too many attempts. Request a new OTP.");
    }

    const incomingHash = hashOtp(email, otp);

    if (incomingHash !== data.otpHash) {
      await ref.update({ attempts: attempts + 1 });
      throw new HttpsError("permission-denied", "Invalid OTP.");
    }

    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        user = await admin.auth().createUser({
          email,
          emailVerified: true,
        });
      } else {
        console.error(err);
        throw new HttpsError("internal", "Could not load your account.");
      }
    }

    await ref.delete().catch(() => {});

    const token = await admin.auth().createCustomToken(user.uid, {
      emailVerified: true,
    });

    return {
      ok: true,
      token,
      uid: user.uid,
      isNewUser: Boolean(user.metadata?.creationTime === user.metadata?.lastSignInTime),
    };
  }
);

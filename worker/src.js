const OTP_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 30;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function json(data, status, request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || '';
  const allowedOrigins = new Set([
    allowed,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ].filter(Boolean));

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Vary': 'Origin',
  };

  if (allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return new Response(JSON.stringify(data), { status, headers });
}

function base64UrlFromBytes(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlFromString(value) {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function createFirebaseCustomToken(uid, serviceAccount, projectId) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid: String(uid).slice(0, 128),
  };

  const encodedHeader = base64UrlFromString(JSON.stringify(header));
  const encodedPayload = base64UrlFromString(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );

  return `${unsigned}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

async function sendEmailOtp(email, otp, env) {
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.OTP_FROM || 'Cheyyar Hub <onboarding@resend.dev>',
        to: [email],
        subject: 'Your Cheyyar Hub verification code',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;background:#111;color:#fff;border-radius:16px">
            <h2 style="margin:0 0 12px">Cheyyar<span style="color:#ff5b2e">hub</span></h2>
            <p>Your verification code is:</p>
            <div style="font-size:34px;font-weight:800;letter-spacing:10px;margin:22px 0">${otp}</div>
            <p style="color:#aaa">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
          </div>
        `,
      }),
    });
  } catch (fetchErr) {
    throw new Error(`STAGE=resend_fetch :: ${fetchErr?.message || fetchErr}`);
  }

  let data = {};
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new Error(`STAGE=resend_parse :: status=${response.status} :: ${parseErr?.message || parseErr}`);
  }

  if (!response.ok) {
    const msg =
      (data && (data.message || data.error || (data.error && data.error.message))) ||
      `Resend failed with status ${response.status}`;
    throw new Error(`STAGE=resend_response :: status=${response.status} :: ${JSON.stringify(msg)}`);
  }

  return data;
}

async function handleSendOtp(request, env) {
  if (!env.RESEND_API_KEY) throw new Error('STAGE=config :: RESEND_API_KEY is not configured on the Worker.');
  if (!env.OTP_STORE) throw new Error('STAGE=config :: OTP_STORE is not configured.');

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return { status: 400, data: { error: 'STAGE=body_parse :: Invalid JSON body.' } };
  }

  const email = normalizeEmail(body?.email);
  if (!isValidEmail(email)) {
    return { status: 400, data: { error: 'Enter a valid email address.' } };
  }

  const key = `otp:${email}`;

  let existing = null;
  try {
    existing = await env.OTP_STORE.get(key, { type: 'json' });
  } catch (kvErr) {
    throw new Error(`STAGE=kv_get :: ${kvErr?.message || kvErr}`);
  }

  if (existing?.sentAt) {
    const elapsed = Math.floor((Date.now() - existing.sentAt) / 1000);
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      return {
        status: 429,
        data: { error: `Please wait ${RESEND_COOLDOWN_SECONDS - elapsed}s before requesting another OTP.` },
      };
    }
  }

  const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

  try {
    await sendEmailOtp(email, otp, env);
  } catch (sendErr) {
    throw sendErr;
  }

  try {
    await env.OTP_STORE.put(
      key,
      JSON.stringify({ otp, sentAt: Date.now() }),
      { expirationTtl: OTP_TTL_SECONDS }
    );
  } catch (kvPutErr) {
    throw new Error(`STAGE=kv_put :: ${kvPutErr?.message || kvPutErr}`);
  }

  return { status: 200, data: { ok: true, message: 'OTP sent successfully.' } };
}

async function handleVerifyOtp(request, env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new Error('STAGE=config :: FIREBASE_SERVICE_ACCOUNT is not configured on the Worker.');
  if (!env.FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID.startsWith('REPLACE_')) {
    throw new Error('STAGE=config :: FIREBASE_PROJECT_ID is not configured correctly.');
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return { status: 400, data: { error: 'STAGE=body_parse :: Invalid JSON body.' } };
  }

  const email = normalizeEmail(body?.email);
  const otp = String(body?.otp || '').replace(/\D/g, '').slice(0, 6);

  if (!isValidEmail(email) || otp.length !== 6) {
    return { status: 400, data: { error: 'Invalid email or OTP.' } };
  }

  const key = `otp:${email}`;

  let record;
  try {
    record = await env.OTP_STORE.get(key, { type: 'json' });
  } catch (kvErr) {
    throw new Error(`STAGE=kv_get :: ${kvErr?.message || kvErr}`);
  }

  if (!record) {
    return { status: 400, data: { error: 'OTP expired or not found. Please request a new OTP.' } };
  }

  if (record.otp !== otp) {
    return { status: 400, data: { error: 'Incorrect OTP. Please try again.' } };
  }

  try {
    await env.OTP_STORE.delete(key);
  } catch (kvDelErr) {
    throw new Error(`STAGE=kv_delete :: ${kvDelErr?.message || kvDelErr}`);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  } catch (parseErr) {
    throw new Error(`STAGE=service_account_parse :: ${parseErr?.message || parseErr}`);
  }

  let customToken;
  try {
    customToken = await createFirebaseCustomToken(email, serviceAccount, env.FIREBASE_PROJECT_ID);
  } catch (tokenErr) {
    throw new Error(`STAGE=custom_token :: ${tokenErr?.message || tokenErr}`);
  }

  return { status: 200, data: { ok: true, customToken } };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return json({ ok: true }, 204, request, env);
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/') {
        return json({ ok: true, service: 'cheyyar-hub-email-otp' }, 200, request, env);
      }

      if (request.method === 'POST' && url.pathname === '/send-otp') {
        const result = await handleSendOtp(request, env);
        return json(result.data, result.status, request, env);
      }

      if (request.method === 'POST' && url.pathname === '/verify-otp') {
        const result = await handleVerifyOtp(request, env);
        return json(result.data, result.status, request, env);
      }

      return json({ error: 'Not found.' }, 404, request, env);
    } catch (error) {
      console.error(error);
      return json(
        { error: error?.message || `Internal server error: ${String(error)}` },
        500,
        request,
        env
      );
    }
  },
};

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase"; // unga firebase config file path (e.g. ./firebaseConfig)

// Unga current app version - puthu build podumbodhu idhai mathikonga
const CURRENT_VERSION = "1.0.0";

// Version check panra function
const isNewerVersion = (latest, current) => {
  if (!latest || !current) return false;
  const lParts = latest.split(".").map(Number);
  const cParts = current.split(".").map(Number);

  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] || 0;
    const c = cParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
};

export default function UpdateModal() {
  const [updateData, setUpdateData] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  // Firestore version check
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const docRef = doc(db, "app_config", "version_control");
        const snap = await getDoc(docRef);

        if (snap.exists()) {
          const config = snap.data();
          const { latestVersion, minRequiredVersion, updateUrl, releaseNotes } = config;

          if (latestVersion && isNewerVersion(latestVersion, CURRENT_VERSION)) {
            const isForce = isNewerVersion(minRequiredVersion || "1.0.0", CURRENT_VERSION);

            setUpdateData({
              latestVersion,
              minRequiredVersion: minRequiredVersion || "1.0.0",
              updateUrl: updateUrl || "https://cheyyar-hub.vercel.app",
              releaseNotes: releaseNotes || "Bug fixes and improvements.",
              isForceUpdate: isForce
            });
          }
        }
      } catch (err) {
        console.error("Update check failed:", err);
      }
    };

    checkVersion();
  }, []);

  // Force update aana background scroll lock
  useEffect(() => {
    if (updateData?.isForceUpdate) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [updateData]);

  if (!updateData || (dismissed && !updateData.isForceUpdate)) {
    return null;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={{ fontSize: "36px", marginBottom: "8px" }}>
          {updateData.isForceUpdate ? "⚠️" : "🚀"}
        </div>
        
        <h3 style={styles.title}>
          {updateData.isForceUpdate ? "Mandatory Update!" : "Update Available!"}
        </h3>

        <p style={styles.text}>
          {updateData.isForceUpdate ? (
            <>App use panna kandippa <b>v{updateData.latestVersion}</b>-ku update pannanum.</>
          ) : (
            <>Puthu version <b>v{updateData.latestVersion}</b> ready-ah irukku.</>
          )}
        </p>

        <div style={styles.notes}>
          <small style={{ fontWeight: "bold", color: "#374151" }}>What's New:</small>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#4b5563" }}>
            {updateData.releaseNotes}
          </p>
        </div>

        <div style={styles.btnRow}>
          {!updateData.isForceUpdate && (
            <button onClick={() => setDismissed(true)} style={styles.laterBtn}>
              Later
            </button>
          )}
          <a
            href={updateData.updateUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={updateData.isForceUpdate ? styles.forceBtn : styles.updateBtn}
          >
            {updateData.isForceUpdate ? "Update to Continue" : "Update Now"}
          </a>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
    padding: "16px"
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    maxWidth: "340px",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
  },
  title: { margin: "0 0 8px", color: "#111827", fontSize: "18px", fontWeight: "700" },
  text: { margin: "0 0 16px", color: "#4b5563", fontSize: "14px" },
  notes: {
    backgroundColor: "#f3f4f6",
    borderRadius: "8px",
    padding: "10px",
    textAlign: "left",
    marginBottom: "20px"
  },
  btnRow: { display: "flex", gap: "10px" },
  laterBtn: {
    flex: 1,
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    backgroundColor: "#fff",
    color: "#374151",
    cursor: "pointer",
    fontWeight: "600"
  },
  updateBtn: {
    flex: 1,
    padding: "10px",
    borderRadius: "8px",
    backgroundColor: "#2563eb",
    color: "#fff",
    textDecoration: "none",
    fontWeight: "600",
    textAlign: "center"
  },
  forceBtn: {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    backgroundColor: "#dc2626",
    color: "#fff",
    textDecoration: "none",
    fontWeight: "700",
    textAlign: "center"
  }
};

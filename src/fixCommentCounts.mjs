/**
 * ONE-TIME SCRIPT — fixes stale `commentCount` on existing posts.
 *
 * Uses the SAME client Firebase SDK your app already uses (no
 * firebase-admin, no service account key needed). It signs in with
 * your own account, so it works within your existing Firestore rules
 * (which already allow commentCount updates).
 *
 * SETUP:
 * 1. Put this file in your `src` folder, next to firebase.js.
 * 2. Fill in your login email + password below (lines marked TODO).
 * 3. Run from the project root:  node src/fixCommentCounts.mjs
 * 4. Delete this file afterwards (it has your password in it).
 */

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";

// TODO: paste the SAME firebaseConfig object from your src/firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyB7RKnVdMze1LzPTkmu81U6xsL0RPSmNTk",
  authDomain: "cheyyar-hub.firebaseapp.com",
  projectId: "cheyyar-hub",
  messagingSenderId: "788287014995",
  appId: "1:788287014995:web:d0a3c03d2c5f87a5781ea6",
};

// TODO: your Cheyyar Hub login
const EMAIL = "denesh143@gmail.com";
const PASSWORD = "123456";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function fixCommentCounts() {
  await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  console.log("Logged in. Checking posts...");

  const postsSnap = await getDocs(collection(db, "posts"));
  console.log(`Checking ${postsSnap.size} posts...`);

  let fixed = 0;

  for (const postDoc of postsSnap.docs) {
    const commentsSnap = await getDocs(
      collection(db, "posts", postDoc.id, "comments")
    );

    const realCount = commentsSnap.size;
    const storedCount = postDoc.data().commentCount || 0;

    if (realCount !== storedCount) {
      await updateDoc(doc(db, "posts", postDoc.id), {
        commentCount: realCount,
      });
      console.log(`Fixed post ${postDoc.id}: ${storedCount} -> ${realCount}`);
      fixed++;
    }
  }

  console.log(`Done. Fixed ${fixed} post(s) out of ${postsSnap.size}.`);
  process.exit(0);
}

fixCommentCounts().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

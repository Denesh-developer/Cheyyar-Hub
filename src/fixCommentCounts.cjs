/**
 * ONE-TIME SCRIPT — fixes stale `commentCount` on existing posts.
 *
 * Why: some posts' commentCount field went out of sync with the real
 * number of docs in their /comments subcollection (e.g. comments added
 * before the Firestore rules allowed non-owners to increment
 * commentCount). This walks every post once, recounts its real
 * comments, and corrects the field if it's wrong. Safe to run more
 * than once — it only writes when the count actually differs.
 *
 * SETUP (5 min, one time):
 * 1. Firebase Console → Project settings (gear icon) → Service accounts
 * 2. Click "Generate new private key" → downloads a JSON file
 * 3. Rename it to serviceAccountKey.json and put it in this same folder
 * 4. npm install firebase-admin --save-dev   (run once)
 * 5. node fixCommentCounts.js
 *
 * IMPORTANT: serviceAccountKey.json is a secret — don't commit it to
 * git or share it. Delete it after running this script if you want.
 */

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixCommentCounts() {
  const postsSnap = await db.collection("posts").get();

  console.log(`Checking ${postsSnap.size} posts...`);

  let fixed = 0;

  for (const postDoc of postsSnap.docs) {
    const commentsSnap = await db
      .collection("posts")
      .doc(postDoc.id)
      .collection("comments")
      .get();

    const realCount = commentsSnap.size;
    const storedCount = postDoc.data().commentCount || 0;

    if (realCount !== storedCount) {
      await postDoc.ref.update({ commentCount: realCount });
      console.log(
        `Fixed post ${postDoc.id}: ${storedCount} -> ${realCount}`
      );
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

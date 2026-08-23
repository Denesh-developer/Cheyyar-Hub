# What changed

1. **Splash screen** — now shows your temple/pin logo with a fade-in + a
   soft bouncing loader instead of plain "Loading Cheyyar Hub..." text.
   - Copy `src/assets/logo.png` (included here) into your project at
     `src/assets/logo.png`.
   - `App.jsx` now has `import logo from "./assets/logo.png";` at the top.

2. **Duplicate verified badge fixed** — the badge was rendering next to
   *both* the name and the username. Now it only shows once, next to the
   name.

3. **"Name+username joined together" bug fixed** — this was happening
   because `<UserName />` and `<UserHandle />` sat next to each other in
   JSX with no space, so they rendered as one run-on string
   ("PriyaKumar@priyak"). Fixed with CSS so they stack cleanly wherever
   they appear together (user cards, chat header, developer panel,
   notifications).

4. **Search → profile is now a real page, not a popup** — `UserProfileModal`
   is gone. Clicking "View Profile" (from Explore/search) now opens a full
   `UserProfileView` page (same layout as your own profile: cover, avatar,
   stats, badges, their posts) with a Back button, instead of a modal.

5. **Chat header is now clickable** — tapping the avatar/name at the top
   of a conversation opens that person's profile page.

6. **Developer panel polish** — added hover elevation on user rows, a
   nicer gradient/shadow on the panel card, and hover feedback on the
   Verify/Unverify buttons, so it reads a bit more premium.

# About the deleted Firebase collections

From your screenshot, the `users` collection (profiles, badges, followers)
is intact. If you deleted the `posts` collection (and one other) —
Firestore doesn't need collections to be "recreated" manually: the moment
your app writes a new post, `addDoc(collection(db, "posts"), ...)` will
recreate that collection automatically. So once posting works code-side
again, it should self-heal. The only real loss is old documents that were
inside the deleted collections — those aren't recoverable unless you have
a backup/export.

If posts still aren't working after this, tell me exactly which two
collections you deleted and I'll check the code paths that read/write them.

# Still worth a look (not done in this pass)

- A full design pass on any specific screen/component you feel is still
  "not premium" — tell me which one and I'll focus there next.

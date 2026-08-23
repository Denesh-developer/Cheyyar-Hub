import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import logo from "./assets/logo.png";

import { auth, db } from "./firebase";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  deleteUser,
} from "firebase/auth";

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
  getDocs,
} from "firebase/firestore";


/* =========================================================
   CLOUDINARY
   ========================================================= */

const CLOUDINARY_CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;


/* =========================================================
   DEFAULT PROFILE
   ========================================================= */

const DEVELOPER_UID = import.meta.env.VITE_DEVELOPER_UID || "TtgTvNZ0XXRdem1B2bn1hXA4tzs2";

const DEFAULT_PROFILE = {
  name: "Cheyyar User",
  username: "cheyyaruser",
  bio: "Proudly connected with Cheyyar ❤️",
  area: "Cheyyar",
  profession: "",
  photoURL: "",
  followers: [],
  following: [],
  badges: ["🌱 New Member"],
  verified: false,
};


function VerifiedBadge({ developer = false, large = false }) {
  if (developer) {
    return (
      <span
        className={`developer-badge ${large ? "large" : ""}`.trim()}
        title="Cheyyar Hub Developer"
        aria-label="Cheyyar Hub Developer"
      >
        🛡️
      </span>
    );
  }

  return (
    <span
      className={`verified-badge ${large ? "large" : ""}`.trim()}
      title="Verified account"
      aria-label="Verified account"
    >
      ✓
    </span>
  );
}

function UserName({ profile, children, className = "" }) {
  const isDeveloper = profile?.id === DEVELOPER_UID;
  const isVerified = !isDeveloper && profile?.verified === true;

  return (
    <span className={`identity-name ${className}`.trim()}>
      <span>{children ?? profile?.name ?? "Cheyyar Member"}</span>
      {isDeveloper ? <VerifiedBadge developer /> : isVerified ? <VerifiedBadge /> : null}
    </span>
  );
}

function UserHandle({ profile, className = "" }) {
  return (
    <span className={`identity-handle ${className}`.trim()}>
      @{profile?.username || "member"}
    </span>
  );
}

/* =========================================================
   NAVIGATION
   ========================================================= */

const menu = [
  ["home", "🏠", "Home"],
  ["trending", "🔥", "Trending"],
  ["explore", "📍", "Explore Cheyyar"],
  ["notifications", "🔔", "Notifications"],
  ["messages", "💬", "Messages"],
  ["profile", "👤", "Profile"],
];


/* =========================================================
   HELPERS
   ========================================================= */

function timeAgo(ts) {
  if (!ts) return "just now";

  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);

  if (sec < 60) return `${Math.max(sec, 1)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;

  return `${Math.floor(sec / 86400)}d`;
}


function Avatar({ profile, size = "normal" }) {
  const letter = (
    profile?.name ||
    profile?.username ||
    "C"
  )[0].toUpperCase();

  if (profile?.photoURL) {
    return (
      <img
        className={`avatar ${size}`}
        src={profile.photoURL}
        alt=""
        loading="lazy"
      />
    );
  }

  return (
    <div className={`avatar ${size}`}>
      {letter}
    </div>
  );
}


/* =========================================================
   IMAGE COMPRESSION
   ========================================================= */

async function compressImage(file, maxWidth = 1600, quality = 0.82) {
  if (!file) return null;

  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file.");
  }

  const image = new Image();

  const objectURL = URL.createObjectURL(file);

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = objectURL;
  });

  let width = image.width;
  let height = image.height;

  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  ctx.drawImage(
    image,
    0,
    0,
    width,
    height
  );

  const blob = await new Promise((resolve) => {
    canvas.toBlob(
      resolve,
      "image/jpeg",
      quality
    );
  });

  URL.revokeObjectURL(objectURL);

  if (!blob) {
    throw new Error("Image compression failed.");
  }

  return new File(
    [blob],
    `${Date.now()}.jpg`,
    {
      type: "image/jpeg",
      lastModified: Date.now(),
    }
  );
}


/* =========================================================
   CLOUDINARY UPLOAD
   ========================================================= */

async function uploadToCloudinary(file) {
  if (!file) return "";

  if (!CLOUDINARY_CLOUD_NAME) {
    throw new Error(
      "Cloudinary cloud name is missing."
    );
  }

  if (!CLOUDINARY_UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary upload preset is missing."
    );
  }

  const compressed = await compressImage(
    file,
    1600,
    0.82
  );

  const formData = new FormData();

  formData.append(
    "file",
    compressed
  );

  formData.append(
    "upload_preset",
    CLOUDINARY_UPLOAD_PRESET
  );

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Cloudinary upload failed."
    );
  }

  return data.secure_url;
}


/* =========================================================
   APP
   ========================================================= */

function App() {

  /* AUTH */

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] =
    useState("login");

  const [authError, setAuthError] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [name, setName] =
    useState("");

  const [authSubmitting, setAuthSubmitting] =
    useState(false);

  const [showPassword, setShowPassword] =
    useState(false);

  /* PAGE */

  const [page, setPage] =
    useState("home");

  const isDeveloper = Boolean(user?.uid && DEVELOPER_UID && user.uid === DEVELOPER_UID);
  const [developerSearch, setDeveloperSearch] = useState("");
  const [developerSavingUid, setDeveloperSavingUid] = useState("");


  /* PROFILE */

  const [profile, setProfile] =
    useState(DEFAULT_PROFILE);

  const [profileLoading, setProfileLoading] =
    useState(true);

  const [users, setUsers] =
    useState([]);


  /* POSTS */

  const [posts, setPosts] =
    useState([]);

  const [postText, setPostText] =
    useState("");

  const [postImage, setPostImage] =
    useState(null);

  const [postLocation, setPostLocation] =
    useState("Cheyyar");

  const [posting, setPosting] =
    useState(false);


  /* COMMENTS */

  const [commentsOpen, setCommentsOpen] =
    useState(null);

  const [commentText, setCommentText] =
    useState("");

  const [comments, setComments] =
    useState({});

  const commentUnsubsRef = useRef({});
  const [editingPost, setEditingPost] = useState(null);
  const [editPostText, setEditPostText] = useState("");
  const [editPostLocation, setEditPostLocation] = useState("Cheyyar");
  const [founderOpen, setFounderOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);
  const [highlightedPostId, setHighlightedPostId] = useState(null);

  useEffect(() => {
    return () => {
      Object.values(commentUnsubsRef.current).forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch {}
      });
      commentUnsubsRef.current = {};
    };
  }, []);


  /* SEARCH */

  const [search, setSearch] =
    useState("");


  /* PROFILE MODAL */

  const [editMode, setEditMode] =
    useState(false);

  const [edit, setEdit] =
    useState(DEFAULT_PROFILE);

  const [profileImage, setProfileImage] =
    useState(null);

  const [profileSaving, setProfileSaving] =
    useState(false);


  /* NOTIFICATIONS */

  const [notifications, setNotifications] =
    useState([]);


  /* CHAT */

  const [selectedChatUser, setSelectedChatUser] =
    useState(null);

  const [messages, setMessages] =
    useState([]);

  const [messageText, setMessageText] =
    useState("");

  const [chatLoading, setChatLoading] =
    useState(false);


  /* UI */

  const [toast, setToast] =
    useState("");

  const messageEndRef =
    useRef(null);


  /* =======================================================
     AUTH STATE
     ======================================================= */

  useEffect(() => {

    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        setUser(u);
        setAuthLoading(false);
      }
    );

    return unsub;

  }, []);


  /* =======================================================
     USER PROFILE
     ======================================================= */

  useEffect(() => {

    if (!user) return;

    setProfileLoading(true);

    const userRef =
      doc(db, "users", user.uid);

    const unsub = onSnapshot(
      userRef,
      async (snap) => {

        if (snap.exists()) {

          const p = {
            id: user.uid,
            ...DEFAULT_PROFILE,
            ...snap.data(),
          };

          setProfile(p);
          setEdit(p);

        } else {

          const newProfile = {
            id: user.uid,
            ...DEFAULT_PROFILE,
            name:
              user.displayName ||
              "Cheyyar User",
            username:
              (
                user.displayName ||
                "cheyyaruser"
              )
                .toLowerCase()
                .replace(/[^a-z0-9]/g, ""),
            email:
              user.email || "",
            createdAt:
              serverTimestamp(),
          };

          await setDoc(
            userRef,
            newProfile,
            { merge: true }
          );

          setProfile(newProfile);
          setEdit(newProfile);
        }

        setProfileLoading(false);
      }
    );

    return unsub;

  }, [user]);


  /* =======================================================
     POSTS
     ======================================================= */

  useEffect(() => {

    if (!user) return;

    const q = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    let cancelled = false;

    const unsub = onSnapshot(
      q,
      (snap) => {
        // commentCount is kept accurate directly on the post doc (see
        // addComment's batch increment), so we read it straight from the
        // snapshot instead of re-fetching every post's comments
        // subcollection on every single change. Fetching all comment
        // subcollections on every snapshot was an N+1 read pattern that
        // made the feed slow on every like/comment/new post anywhere in
        // the app.
        const basePosts = snap.docs.map((d) => ({
          id: d.id,
          commentCount: 0,
          ...d.data(),
        }));

        if (!cancelled) {
          setPosts(basePosts);
        }
      },
      (error) => {
        console.error("Posts listener:", error);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };

  }, [user]);


  /* =======================================================
     USERS
     ======================================================= */

  useEffect(() => {

    if (!user) return;

    const q = query(
      collection(db, "users"),
      limit(100)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {

        setUsers(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );

      }
    );

    return unsub;

  }, [user]);


  /* =======================================================
     NOTIFICATIONS
     ======================================================= */

  useEffect(() => {

    if (!user) return;

    const q = query(
      collection(db, "notifications"),
      where(
        "receiverId",
        "==",
        user.uid
      ),
      orderBy(
        "createdAt",
        "desc"
      ),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {

        setNotifications(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );

      },
      (error) => {

        console.error(
          "Notifications:",
          error
        );

      }
    );

    return unsub;

  }, [user]);


  /* =======================================================
     CHAT USERS
     ======================================================= */

  // Derived from the "users" listener above instead of running a second,
  // identical onSnapshot listener on the same collection/query. That was
  // doubling Firestore reads and re-renders every time any profile changed
  // — extra battery/data cost, worse on mobile.
  const chatUsers = useMemo(
    () => users.filter((u) => u.id !== user?.uid),
    [users, user]
  );


  /* =======================================================
     CHAT MESSAGES
     ======================================================= */

  useEffect(() => {

    if (
      !user ||
      !selectedChatUser
    ) {
      setMessages([]);
      return;
    }

    const chatId =
      getChatId(
        user.uid,
        selectedChatUser.id
      );

    const q = query(
      collection(
        db,
        "chats",
        chatId,
        "messages"
      ),
      orderBy(
        "createdAt",
        "asc"
      ),
      limit(100)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {

        const nextMessages = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setMessages(nextMessages);

        const unread = snap.docs.filter(
          (d) =>
            d.data()?.receiverId === user.uid &&
            d.data()?.read === false
        );

        if (unread.length) {
          Promise.all(
            unread.map((d) =>
              updateDoc(
                doc(
                  db,
                  "chats",
                  chatId,
                  "messages",
                  d.id
                ),
                { read: true }
              )
            )
          ).catch((error) =>
            console.error("Mark messages read:", error)
          );
        }

        setTimeout(() => {
          messageEndRef.current?.scrollIntoView({
            behavior: "smooth",
          });
        }, 50);

      },
      (error) => {

        console.error(
          "Chat messages:",
          error
        );

      }
    );

    return unsub;

  }, [user, selectedChatUser]);


  useEffect(() => {
    if (!highlightedPostId) return;

    const timer = setTimeout(() => {
      const el = document.querySelector(
        `[data-post-id="${highlightedPostId}"]`
      );

      el?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      setHighlightedPostId(null);
    }, 120);

    return () => clearTimeout(timer);
  }, [highlightedPostId]);


  /* =======================================================
     TOAST
     ======================================================= */

  useEffect(() => {

    if (!toast) return;

    const timer =
      setTimeout(
        () => setToast(""),
        2500
      );

    return () =>
      clearTimeout(timer);

  }, [toast]);


  /* =======================================================
     COMPUTED
     ======================================================= */

  const myPosts = useMemo(
    () =>
      posts.filter(
        (p) =>
          p.authorId === user?.uid
      ),
    [posts, user]
  );

  const filteredUsers = useMemo(() => {

    const q =
      search
        .trim()
        .toLowerCase();

    if (!q) {
      return users
        .filter(
          (u) =>
            u.id !== user?.uid
        )
        .slice(0, 20);
    }

    return users.filter(
      (u) =>
        u.id !== user?.uid &&
        `${u.name || ""} ${
          u.username || ""
        }`
          .toLowerCase()
          .includes(q)
    );

  }, [users, search, user]);


  const filteredPosts = useMemo(() => {

    const q =
      search
        .trim()
        .toLowerCase();

    if (!q) return posts;

    return posts.filter(
      (p) =>
        `${p.text || ""} ${
          p.location || ""
        } ${
          p.authorName || ""
        } ${
          p.authorUsername || ""
        }`
          .toLowerCase()
          .includes(q)
    );

  }, [posts, search]);


  /* =======================================================
     AUTH
     ======================================================= */

  async function handleAuth(e) {
    e.preventDefault();

    setAuthError("");
    setAuthSubmitting(true);

    try {
      /* =====================================================
         LOGIN
         ===================================================== */

      if (authMode === "login") {
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        return;
      }


      /* =====================================================
         SIGNUP
         ===================================================== */

      const displayName =
        name.trim() || "Cheyyar User";

      const username =
        displayName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "") ||
        "cheyyaruser";


      /* =====================================================
         CREATE FIREBASE AUTH ACCOUNT FIRST

         This is important because Firestore rules require
         request.auth to exist before reading /users.
         ===================================================== */

      const cred =
        await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );


      /* =====================================================
         UPDATE AUTH PROFILE
         ===================================================== */

      await updateProfile(
        cred.user,
        {
          displayName,
        }
      );


      /* =====================================================
         CHECK USERNAME AFTER AUTHENTICATION
         ===================================================== */

      const usernameSnap =
        await getDocs(
          query(
            collection(db, "users"),
            where("username", "==", username),
            limit(1)
          )
        );


      /* =====================================================
         USERNAME ALREADY EXISTS

         Remove the newly-created Auth account so the user
         can try again with another name.
         ===================================================== */

      if (!usernameSnap.empty) {
        try {
          await deleteUser(cred.user);
        } catch (deleteError) {
          console.error(
            "Failed to remove temporary account:",
            deleteError
          );
        }

        throw new Error(
          "That username is already taken. Please use a different name."
        );
      }


      /* =====================================================
         CREATE FIRESTORE PROFILE
         ===================================================== */

      await setDoc(
        doc(
          db,
          "users",
          cred.user.uid
        ),
        {
          ...DEFAULT_PROFILE,
          name: displayName,
          username,
          email: email.trim(),
          createdAt: serverTimestamp(),
        }
      );


      /* =====================================================
         SUCCESS
         ===================================================== */

      setAuthError("");

    } catch (err) {
      console.error(
        "Authentication error:",
        err
      );

      let message =
        err?.message ||
        "Authentication failed";


      /* =====================================================
         FRIENDLY FIREBASE AUTH ERRORS
         ===================================================== */

      if (
        err?.code ===
        "auth/email-already-in-use"
      ) {
        message =
          "This email is already registered. Please login.";
      }

      else if (
        err?.code ===
        "auth/invalid-email"
      ) {
        message =
          "Please enter a valid email address.";
      }

      else if (
        err?.code ===
        "auth/weak-password"
      ) {
        message =
          "Password must be at least 6 characters.";
      }

      else if (
        err?.code ===
        "auth/invalid-credential"
      ) {
        message =
          "Invalid email or password.";
      }

      else if (
        err?.code ===
        "auth/user-not-found"
      ) {
        message =
          "No account found with this email.";
      }

      else if (
        err?.code ===
        "auth/wrong-password"
      ) {
        message =
          "Incorrect password.";
      }

      else if (
        err?.code ===
        "permission-denied"
      ) {
        message =
          "Firestore permission denied. Please check Firestore rules.";
      }


      setAuthError(
        message.replace(
          "Firebase: ",
          ""
        )
      );

    } finally {
      setAuthSubmitting(false);
    }
  }


  /* =======================================================
     NOTIFICATION CREATOR
     ======================================================= */

  async function createNotification({
    receiverId,
    type,
    message,
    postId = "",
  }) {

    if (
      !receiverId ||
      receiverId === user.uid
    ) {
      return;
    }

    try {

      await addDoc(
        collection(
          db,
          "notifications"
        ),
        {
          receiverId,
          senderId: user.uid,

          senderName:
            profile.name,

          senderUsername:
            profile.username,

          senderPhotoURL:
            profile.photoURL || "",

          type,
          message,
          postId,

          read: false,

          createdAt:
            serverTimestamp(),
        }
      );

    } catch (error) {

      console.error(
        "Notification error:",
        error
      );

    }
  }


  /* =======================================================
     CREATE POST
     ======================================================= */

  async function createPost(e) {

    e?.preventDefault();

    if (
      !postText.trim() &&
      !postImage
    ) {
      return;
    }

    setPosting(true);

    try {

      let imageURL = "";

      if (postImage) {

        setToast(
          "Compressing image..."
        );

        imageURL =
          await uploadToCloudinary(
            postImage
          );
      }

      await addDoc(
        collection(db, "posts"),
        {
          text:
            postText.trim(),

          imageURL,

          location:
            postLocation.trim() ||
            "Cheyyar",

          authorId:
            user.uid,

          authorName:
            profile.name,

          authorUsername:
            profile.username,

          authorPhotoURL:
            profile.photoURL || "",

          likes: 0,
          likedBy: [],

          saves: 0,
          savedBy: [],

          shares: 0,
          commentCount: 0,

          createdAt:
            serverTimestamp(),
        }
      );

      setPostText("");
      setPostImage(null);

      setToast(
        "Post shared with Cheyyar ❤️"
      );

      setPage("home");

    } catch (err) {

      console.error(err);

      setToast(
        err.message ||
        "Could not create post"
      );

    } finally {

      setPosting(false);

    }
  }


  function closeCreatePost() {
    if (posting) return;
    setPostText("");
    setPostImage(null);
    setPostLocation("Cheyyar");
    setPage("home");
  }


  /* =======================================================
     LIKE
     ======================================================= */

  async function toggleLike(post) {

    const liked =
      (post.likedBy || [])
        .includes(user.uid);

    await updateDoc(
      doc(
        db,
        "posts",
        post.id
      ),
      {
        likes:
          increment(
            liked ? -1 : 1
          ),

        likedBy:
          liked
            ? arrayRemove(user.uid)
            : arrayUnion(user.uid),
      }
    );

    if (!liked) {

      await createNotification({
        receiverId:
          post.authorId,

        type: "like",

        message:
          `${profile.name} liked your post.`,

        postId:
          post.id,
      });

    }
  }


  /* =======================================================
     SAVE
     ======================================================= */

  async function toggleSave(post) {

    const isSaved =
      (post.savedBy || [])
        .includes(user.uid);

    await updateDoc(
      doc(
        db,
        "posts",
        post.id
      ),
      {
        saves:
          increment(
            isSaved ? -1 : 1
          ),

        savedBy:
          isSaved
            ? arrayRemove(user.uid)
            : arrayUnion(user.uid),
      }
    );

    setToast(
      isSaved
        ? "Removed from saved"
        : "Saved"
    );
  }


  /* =======================================================
     SHARE
     ======================================================= */

  async function sharePost(post) {

    const text =
      `${post.authorName}: ${
        post.text ||
        "Check this post on Cheyyar Hub"
      }\n📍 ${
        post.location ||
        "Cheyyar"
      }`;

    try {

      if (
        navigator.share
      ) {

        await navigator.share({
          title:
            "Cheyyar Hub",
          text,
        });

      } else {

        await navigator.clipboard.writeText(
          text
        );

      }

      await updateDoc(
        doc(
          db,
          "posts",
          post.id
        ),
        {
          shares:
            increment(1),
        }
      );

      await createNotification({
        receiverId:
          post.authorId,

        type: "share",

        message:
          `${profile.name} shared your post.`,

        postId:
          post.id,
      });

      setToast(
        "Post shared"
      );

    } catch (error) {

      console.log(error);

    }
  }


  /* =======================================================
     COMMENTS
     ======================================================= */

  function loadComments(postId) {
    if (!postId) return;

    if (commentsOpen === postId) {
      setCommentsOpen(null);
      commentUnsubsRef.current[postId]?.();
      delete commentUnsubsRef.current[postId];
      return;
    }

    Object.entries(commentUnsubsRef.current).forEach(([id, unsubscribe]) => {
      try {
        unsubscribe?.();
      } catch {}
      delete commentUnsubsRef.current[id];
    });

    setCommentsOpen(postId);

    const q = query(
      collection(db, "posts", postId, "comments"),
      orderBy("createdAt", "asc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setComments((current) => ({
          ...current,
          [postId]: snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })),
        }));

        // Keep the visible count in sync with the real subcollection size.
        // This corrects stale/drifted commentCount values (e.g. older
        // posts) using the listener that's already open for this post —
        // no extra reads, unlike re-fetching every post's comments on
        // every feed change.
        setPosts((currentPosts) =>
          currentPosts.map((item) =>
            item.id === postId
              ? { ...item, commentCount: snap.size }
              : item
          )
        );
      },
      (error) => {
        console.error("Comments listener:", error);
        setToast("Could not load comments");
      }
    );

    commentUnsubsRef.current[postId] = unsubscribe;
  }


  async function addComment(post) {
    const text = commentText.trim();

    if (!text || !post?.id) return;

    try {
      const commentRef = doc(
        collection(db, "posts", post.id, "comments")
      );

      const batch = writeBatch(db);

      batch.set(commentRef, {
        userId: user.uid,
        name: profile.name,
        username: profile.username,
        photoURL: profile.photoURL || "",
        text,
        createdAt: serverTimestamp(),
      });

      batch.update(
        doc(db, "posts", post.id),
        {
          commentCount: increment(1),
        }
      );

      await batch.commit();

      // Update the visible count immediately after posting a comment.
      setPosts((currentPosts) =>
        currentPosts.map((item) =>
          item.id === post.id
            ? {
                ...item,
                commentCount:
                  (typeof item.commentCount === "number"
                    ? item.commentCount
                    : 0) + 1,
              }
            : item
        )
      );

      await createNotification({
        receiverId: post.authorId,
        type: "comment",
        message: `${profile.name} commented on your post.`,
        postId: post.id,
      });

      setCommentText("");
    } catch (error) {
      console.error("Add comment:", error);
      setToast(error.message || "Could not add comment");
    }
  }


  /* =======================================================
     FOLLOW
     ======================================================= */

  async function follow(target) {
    if (!target?.id || target.id === user.uid) return;

    const following = profile.following || [];
    const isFollowing = following.includes(target.id);

    try {
      const batch = writeBatch(db);

      batch.update(doc(db, "users", user.uid), {
        following: isFollowing
          ? arrayRemove(target.id)
          : arrayUnion(target.id),
      });

      batch.update(doc(db, "users", target.id), {
        followers: isFollowing
          ? arrayRemove(user.uid)
          : arrayUnion(user.uid),
      });

      await batch.commit();

      if (!isFollowing) {
        await createNotification({
          receiverId: target.id,
          type: "follow",
          message: `${profile.name} started following you.`,
        });
        setToast(`Following @${target.username}`);
      } else {
        setToast(`Unfollowed @${target.username}`);
      }
    } catch (error) {
      console.error("Follow:", error);
      setToast(error.message || "Could not update follow");
    }
  }


  function closeEditProfile() {
    setProfileImage(null);
    setEdit(profile);
    setEditMode(false);
  }


  /* =======================================================
     PROFILE SAVE
     ======================================================= */

  async function saveProfile() {

    setProfileSaving(true);

    try {

      let photoURL =
        edit.photoURL || "";

      if (profileImage) {

        setToast(
          "Compressing profile image..."
        );

        photoURL =
          await uploadToCloudinary(
            profileImage
          );
      }

      const { verified: _ignoredVerified, ...safeEdit } = edit || {};

      const updatedProfile = {
        id: user.uid,
        ...safeEdit,
        verified: profile.verified === true,
        name:
          edit.name?.trim() ||
          "Cheyyar User",

        username:
          edit.username
            ?.replace(/\s/g, "")
            .toLowerCase() ||
          "cheyyaruser",

        photoURL,

        updatedAt:
          serverTimestamp(),
      };

      const usernameSnap = await getDocs(
        query(
          collection(db, "users"),
          where("username", "==", updatedProfile.username),
          limit(2)
        )
      );

      const usernameTaken = usernameSnap.docs.some(
        (d) => d.id !== user.uid
      );

      if (usernameTaken) {
        throw new Error("That username is already taken.");
      }

      await setDoc(
        doc(
          db,
          "users",
          user.uid
        ),
        updatedProfile,
        {
          merge: true,
        }
      );

      await updateProfile(
        user,
        {
          displayName:
            updatedProfile.name,

          photoURL,
        }
      );

      setProfile({
        ...updatedProfile,
      });

      setEdit({
        ...updatedProfile,
      });

      setProfileImage(null);

      setEditMode(false);

      setToast(
        "Profile updated successfully"
      );

    } catch (error) {

      console.error(error);

      setToast(
        error.message ||
        "Profile update failed"
      );

    } finally {

      setProfileSaving(false);

    }
  }


  /* =======================================================
     DEVELOPER VERIFICATION
     ======================================================= */

  async function setUserVerification(target, nextVerified) {
    if (!isDeveloper) {
      setToast("Developer access required");
      return;
    }

    if (!target?.id || target.id === user.uid) {
      setToast("Invalid user");
      return;
    }

    setDeveloperSavingUid(target.id);

    try {
      await updateDoc(doc(db, "users", target.id), {
        verified: Boolean(nextVerified),
        verifiedBy: nextVerified ? user.uid : "",
        verifiedAt: nextVerified ? serverTimestamp() : null,
      });

      setToast(
        nextVerified
          ? `@${target.username || "user"} is now verified ✓`
          : `@${target.username || "user"} verification removed`
      );
    } catch (error) {
      console.error("Verification update:", error);
      setToast(error.message || "Could not update verification");
    } finally {
      setDeveloperSavingUid("");
    }
  }

  const developerUsers = useMemo(() => {
    const q = developerSearch.trim().toLowerCase();
    if (!q) return users;

    return users.filter((u) =>
      `${u.name || ""} ${u.username || ""} ${u.email || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [users, developerSearch]);

  /* =======================================================
     POST EDIT / DELETE
     ======================================================= */

  function startEditPost(post) {
    if (!post || post.authorId !== user.uid) return;

    setEditingPost(post);
    setEditPostText(post.text || "");
    setEditPostLocation(post.location || "Cheyyar");
  }

  async function savePostEdit() {
    if (!editingPost || editingPost.authorId !== user.uid) return;

    const text = editPostText.trim();

    if (!text && !editingPost.imageURL) {
      setToast("Post cannot be empty");
      return;
    }

    try {
      await updateDoc(
        doc(db, "posts", editingPost.id),
        {
          text,
          location: editPostLocation.trim() || "Cheyyar",
          updatedAt: serverTimestamp(),
        }
      );

      setEditingPost(null);
      setToast("Post updated successfully");
    } catch (error) {
      console.error("Edit post:", error);
      setToast(error.message || "Edit failed");
    }
  }

  async function deletePost(post) {
    if (!post || post.authorId !== user.uid) {
      setToast("You can only manage your own posts");
      return;
    }

    if (!window.confirm("Delete this post? This cannot be undone.")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "posts", post.id));

      if (commentsOpen === post.id) {
        commentUnsubsRef.current[post.id]?.();
        delete commentUnsubsRef.current[post.id];
        setCommentsOpen(null);
      }

      setToast("Post deleted");
    } catch (error) {
      console.error("Delete post:", error);
      setToast(error.message || "Delete failed");
    }
  }


  /* =======================================================
     CHAT ID
     ======================================================= */

  function getChatId(uid1, uid2) {

    return [uid1, uid2]
      .sort()
      .join("_");
  }


  /* =======================================================
     OPEN CHAT
     ======================================================= */

  async function openChat(target) {
    if (!target) {
      setSelectedChatUser(null);
      setMessages([]);
      return;
    }

    setSelectedChatUser(target);

    const chatId =
      getChatId(
        user.uid,
        target.id
      );

    try {

      await setDoc(
        doc(
          db,
          "chats",
          chatId
        ),
        {
          users: [
            user.uid,
            target.id,
          ],

          userDetails: {
            [user.uid]: {
              name:
                profile.name,
              username:
                profile.username,
              photoURL:
                profile.photoURL ||
                "",
            },

            [target.id]: {
              name:
                target.name ||
                "Cheyyar Member",

              username:
                target.username ||
                "member",

              photoURL:
                target.photoURL ||
                "",
            },
          },

          updatedAt:
            serverTimestamp(),

          updatedBy:
            user.uid,
        },
        {
          merge: true,
        }
      );

    } catch (error) {

      console.error(
        "Create chat:",
        error
      );

      setToast(
        "Could not open chat"
      );
    }
  }


  /* =======================================================
     SEND MESSAGE
     ======================================================= */

  async function sendMessage(e) {

    e?.preventDefault();

    const text =
      messageText.trim();

    if (
      !text ||
      !selectedChatUser
    ) {
      return;
    }

    setChatLoading(true);

    const chatId =
      getChatId(
        user.uid,
        selectedChatUser.id
      );

    try {

      await setDoc(
        doc(
          db,
          "chats",
          chatId
        ),
        {
          users: [
            user.uid,
            selectedChatUser.id,
          ],

          updatedAt:
            serverTimestamp(),

          lastMessage:
            text,

          lastSenderId:
            user.uid,
        },
        {
          merge: true,
        }
      );

      await addDoc(
        collection(
          db,
          "chats",
          chatId,
          "messages"
        ),
        {
          senderId: user.uid,
          receiverId: selectedChatUser.id,
          text,
          createdAt: serverTimestamp(),
          read: false,
        }
      );

      await createNotification({
        receiverId: selectedChatUser.id,
        type: "message",
        message: `${profile.name} sent you a message.`,
      });

      setMessageText("");

    } catch (error) {

      console.error(
        "Send message:",
        error
      );

      setToast(
        error.message ||
        "Message failed"
      );

    } finally {

      setChatLoading(false);

    }
  }


  /* =======================================================
     MARK NOTIFICATION READ
     ======================================================= */

  async function markNotificationRead(
    notification
  ) {

    if (notification.read) {
      return;
    }

    try {

      await updateDoc(
        doc(
          db,
          "notifications",
          notification.id
        ),
        {
          read: true,
        }
      );

    } catch (error) {

      console.error(error);

    }
  }


  /* =======================================================
     LOGOUT
     ======================================================= */

  async function logout() {

    await signOut(auth);

    setSelectedChatUser(null);
    setMessages([]);
    setPage("home");
  }


  /* =======================================================
     LOADING
     ======================================================= */

  if (authLoading) {

    return (
      <div className="loading-screen">

        <div className="splash-glow" />

        <div className="splash-logo-wrap">
          <img
            src={logo}
            alt="Cheyyar Hub"
            className="splash-logo"
          />
        </div>

        <div className="splash-brand">
          cheyyar<span>hub</span>
        </div>

        <p className="splash-tagline">
          Our town. Our people. Our stories.
        </p>

        <div className="splash-loader">
          <span />
          <span />
          <span />
        </div>

      </div>
    );
  }


  /* =======================================================
     LOGIN
     ======================================================= */

  if (!user) {

    return (
      <div className="auth-screen">

        <div className="auth-glow auth-glow-1" />
        <div className="auth-glow auth-glow-2" />

        <div className="auth-wrap">

          {/* VISUAL / BRAND SIDE */}

          <div className="auth-visual">

            <div className="brand big">
              cheyyar<span>hub</span>
            </div>

            <p className="auth-visual-tagline">
              Our town. Our people. Our stories.
            </p>

            <div className="auth-feature-list">

              <div className="auth-feature">
                <span className="auth-feature-icon">📍</span>
                <div>
                  <strong>Stay local</strong>
                  <p>Everything happening around Cheyyar, in one feed.</p>
                </div>
              </div>

              <div className="auth-feature">
                <span className="auth-feature-icon">💬</span>
                <div>
                  <strong>Stay connected</strong>
                  <p>Chat, follow, and support people in your town.</p>
                </div>
              </div>

              <div className="auth-feature">
                <span className="auth-feature-icon">🎉</span>
                <div>
                  <strong>Never miss out</strong>
                  <p>Events, jobs, and local help — updated live.</p>
                </div>
              </div>

            </div>

          </div>


          {/* FORM SIDE */}

          <form
            className="auth-card"
            onSubmit={handleAuth}
          >

            <div className="brand auth-card-brand">
              cheyyar<span>hub</span>
            </div>

            <div className="auth-tabs">

              <button
                type="button"
                className={
                  authMode === "login"
                    ? "auth-tab active"
                    : "auth-tab"
                }
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                }}
              >
                Login
              </button>

              <button
                type="button"
                className={
                  authMode === "signup"
                    ? "auth-tab active"
                    : "auth-tab"
                }
                onClick={() => {
                  setAuthMode("signup");
                  setAuthError("");
                }}
              >
                Sign up
              </button>

            </div>

            <h2>
              {authMode === "login"
                ? "Welcome back 👋"
                : "Join Cheyyar Hub"}
            </h2>

            <p className="tagline">
              {authMode === "login"
                ? "Login to continue to your feed."
                : "Create your account, it only takes a minute."}
            </p>

            {authMode === "signup" && (
              <div className="input-group">
                <span className="input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M4 20.5c1.4-3.6 4.6-5.5 8-5.5s6.6 1.9 8 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value)
                  }
                  placeholder="Your name"
                  required
                />
              </div>
            )}

            <div className="input-group">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
                  <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                placeholder="Email address"
                required
              />
            </div>

            <div className="input-group">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M7.5 10.5V7.8a4.5 4.5 0 0 1 9 0v2.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="Password"
                minLength={6}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>

            {authError && (
              <div className="error">
                {authError}
              </div>
            )}

            <button
              className="primary full auth-submit"
              type="submit"
              disabled={authSubmitting}
            >
              {authSubmitting ? (
                <span className="auth-spinner" aria-hidden="true" />
              ) : authMode === "login" ? (
                "Login"
              ) : (
                "Create account"
              )}
            </button>

            <button
              type="button"
              className="text-btn"
              onClick={() =>
                setAuthMode(
                  authMode === "login"
                    ? "signup"
                    : "login"
                )
              }
            >
              {authMode === "login"
                ? "New here? Create account"
                : "Already have an account? Login"}
            </button>

          </form>

        </div>
      </div>
    );
  }


  /* =======================================================
     NAV
     ======================================================= */

  const nav = (p) =>
    setPage(p);


  /* =======================================================
     MAIN APP
     ======================================================= */

  return (
    <div className="app">

      {/* TOP BAR */}

      <header className="topbar">

        <div className="brand">
          cheyyar<span>hub</span>
        </div>


        <div className="top-actions">

        {isDeveloper && (
  <button
    className="developer-panel-btn"
    type="button"
    onClick={() => nav("developer")}
  >
    👨‍💻 Developer Panel
  </button>
)}

          <button
            className="founder-btn"
            type="button"
            onClick={() => setFounderOpen(true)}
            aria-label="Open Founder and Developer"
            title="Founder & Developer"
          >
            <span className="founder-btn-icon">👨‍💻</span>
            <span>Founder & Developer</span>
          </button>

          <button
            onClick={() => nav("notifications")}
            className="icon-btn"
            aria-label="Notifications"
          >
            🔔
            {notifications.some((n) => !n.read) && (
              <i className="notification-dot" />
            )}
          </button>

          <button
            onClick={() => nav("messages")}
            className="top-message-btn"
            aria-label="Messages"
          >
            💬
          </button>

          <button
            onClick={() => nav("profile")}
            className="user-chip"
          >
            <Avatar profile={profile} size="small" />
            <UserHandle profile={profile} />
          </button>

        </div>

      </header>


      {/* MOBILE NAV */}

      <nav className="mobile-nav" aria-label="Main navigation">
  <button
    aria-label="Home"
    className={page === "home" ? "active" : ""}
    onClick={() => nav("home")}
  >
    🏠
  </button>

  <button
    aria-label="Explore"
    className={page === "explore" ? "active" : ""}
    onClick={() => nav("explore")}
  >
    🔎
  </button>

  <button
    aria-label="Create post"
    className="create-mobile"
    onClick={() => nav("create")}
  >
    ＋
  </button>

  {/* Notifications */}
  <button
    aria-label="Notifications"
    className={page === "notifications" ? "active" : ""}
    onClick={() => nav("notifications")}
  >
    🔔
  </button>

  <button
    aria-label="Profile"
    className={page === "profile" ? "active" : ""}
    onClick={() => nav("profile")}
  >
    👤
  </button>
</nav>


      <main className="layout">
        {/* SIDEBAR */}

        <aside className="sidebar">

          <div
            className="side-profile"
            onClick={() =>
              nav("profile")
            }
          >

            <Avatar
              profile={profile}
            />

            <div className="side-profile-identity">
              <UserName profile={profile} />
              <UserHandle profile={profile} />
            </div>

          </div>


          {menu.map(
            ([id, icon, label]) => (
              <button
                key={id}
                className={
                  page === id
                    ? "nav active"
                    : "nav"
                }
                onClick={() =>
                  nav(id)
                }
              >
                <span>{icon}</span>
                {label}

                {id ===
                  "notifications" &&
                  notifications.some(
                    (n) => !n.read
                  ) && (
                    <b className="nav-notification-dot" />
                  )}
              </button>
            )
          )}


          <button
            className="create-btn"
            onClick={() =>
              nav("create")
            }
          >
            ＋ Create Post
          </button>

          {isDeveloper && (
            <button
              className={`nav developer-nav ${page === "developer" ? "active" : ""}`}
              onClick={() => nav("developer")}
            >
              <span>🛡️</span>
              Developer Panel
            </button>
          )}

        </aside>


        {/* CONTENT */}

        <section className="content">

          {viewingUser ? (

            <UserProfileView
              target={viewingUser}
              currentUser={user}
              currentProfile={profile}
              targetPosts={posts.filter(
                (p) => p.authorId === viewingUser.id
              )}
              isFollowing={(profile.following || []).includes(viewingUser.id)}
              onFollow={follow}
              onMessage={(target) => {
                setViewingUser(null);
                openChat(target);
                nav("messages");
              }}
              onBack={() => setViewingUser(null)}
              onLike={toggleLike}
              onComment={addComment}
              onOpenComments={loadComments}
              commentsOpen={commentsOpen}
              comments={comments}
              commentText={commentText}
              setCommentText={setCommentText}
              users={users}
            />

          ) : (
            <>

          {/* HOME */}

          {page === "home" && (
            <>

              <Hero
                profile={profile}
                onCreate={() =>
                  nav("create")
                }
              />

              <CreateBox
                profile={profile}
                onClick={() =>
                  nav("create")
                }
              />

              <div className="section-title">

                <div>
                  <span>
                    YOUR TOWN
                  </span>

                  <h1>
                    Cheyyar Feed
                  </h1>
                </div>

                <button
                  onClick={() =>
                    nav("trending")
                  }
                >
                  🔥 Trending
                </button>

              </div>


              {filteredPosts.map(
                (post) => (
                  <Post
                    key={post.id}
                    post={post}
                    user={user}
                    profile={profile}
                    users={users}
                    onLike={toggleLike}
                    onComment={addComment}
                    onOpenComments={
                      loadComments
                    }
                    open={
                      commentsOpen ===
                      post.id
                    }
                    comments={
                      comments[
                        post.id
                      ] || []
                    }
                    commentText={
                      commentText
                    }
                    setCommentText={
                      setCommentText
                    }
                    onDelete={deletePost}
                    onEdit={startEditPost}
                  />
                )
              )}


              {!filteredPosts.length && (
                <Empty
                  icon="📸"
                  title="No stories yet"
                  text="Be the first person to share something from Cheyyar."
                />
              )}

            </>
          )}


          {/* TRENDING */}

          {page === "trending" && (
            <FeedPage
              title="🔥 Trending in Cheyyar"
              subtitle="What your hometown is talking about"
              posts={[
                ...filteredPosts,
              ].sort(
                (a, b) =>
                  (b.likes || 0) -
                  (a.likes || 0)
              )}
              user={user}
              profile={profile}
              users={users}
              onLike={toggleLike}
              onComment={addComment}
              onOpenComments={
                loadComments
              }
              commentsOpen={
                commentsOpen
              }
              comments={comments}
              commentText={
                commentText
              }
              setCommentText={
                setCommentText
              }
              onDelete={deletePost}
              onEdit={startEditPost}
            />
          )}


          {/* EXPLORE */}

          {page === "explore" && (
            <Explore
              users={
                filteredUsers
              }
              profile={profile}
              onFollow={follow}
              onViewProfile={(target) => setViewingUser(target)}
              onMessage={(target) => {
                openChat(target);
                nav("messages");
              }}
              search={search}
              setSearch={setSearch}
            />
          )}


          {/* EVENTS */}

          {page === "events" && (
            <FeaturePage
              icon="🎉"
              title="Cheyyar Events"
              subtitle="Discover what is happening around our town"
              items={[
                "Temple festivals",
                "School & college events",
                "Sports tournaments",
                "Cultural programs",
                "Community meetings",
              ]}
            />
          )}


          {/* JOBS */}

          {page === "jobs" && (
            <FeaturePage
              icon="💼"
              title="Local Jobs"
              subtitle="Jobs and opportunities from Cheyyar"
              items={[
                "Local business hiring",
                "Part-time jobs",
                "Internships",
                "Freelance work",
                "Skilled workers",
              ]}
            />
          )}


          {/* MARKETPLACE */}

          {page === "marketplace" && (
            <FeaturePage
              icon="🛍️"
              title="Cheyyar Marketplace"
              subtitle="Buy, sell and exchange locally"
              items={[
                "Sell used products",
                "Local shops",
                "Home businesses",
                "Services",
                "Exchange items",
              ]}
            />
          )}


          {/* HELP */}

          {page === "help" && (
            <FeaturePage
              icon="🆘"
              title="Community Help"
              subtitle="People helping people"
              items={[
                "Lost & Found",
                "Emergency help",
                "Blood requirement",
                "Missing items",
                "Local assistance",
              ]}
            />
          )}


          {/* NOTIFICATIONS */}

          {page === "notifications" && (
            <NotificationsPage
              notifications={
                notifications
              }
              users={
                users
              }
              onRead={
                markNotificationRead
              }
              onNavigatePost={(postId) => {

                const exists =
                  posts.some(
                    (p) =>
                      p.id === postId
                  );

                if (exists) {
                  setHighlightedPostId(postId);
                  nav("home");
                }

              }}
            />
          )}


          {/* MESSAGES */}

          {page === "messages" && (
            <Messages
              users={chatUsers}
              profile={profile}
              selectedUser={
                selectedChatUser
              }
              setSelectedUser={
                openChat
              }
              messages={messages}
              messageText={
                messageText
              }
              setMessageText={
                setMessageText
              }
              sendMessage={
                sendMessage
              }
              loading={
                chatLoading
              }
              messageEndRef={
                messageEndRef
              }
              currentUser={
                user
              }
              onViewProfile={(target) => setViewingUser(target)}
            />
          )}


          {/* CREATE */}

          {page === "create" && (
            <CreatePage
              profile={profile}
              postText={postText}
              setPostText={
                setPostText
              }
              postImage={
                postImage
              }
              setPostImage={
                setPostImage
              }
              postLocation={
                postLocation
              }
              setPostLocation={
                setPostLocation
              }
              onSubmit={createPost}
              onClose={closeCreatePost}
              posting={posting}
            />
          )}


          {/* DEVELOPER */}

          {page === "developer" && isDeveloper && (
            <DeveloperPanel
              users={developerUsers}
              search={developerSearch}
              setSearch={setDeveloperSearch}
              savingUid={developerSavingUid}
              onVerify={setUserVerification}
            />
          )}


          {/* PROFILE */}

          {page === "profile" && (
            <ProfilePage
              profile={profile}
              editMode={editMode}
              onEditProfile={() => {
                setEdit(profile);
                setProfileImage(null);
                setEditMode(true);
              }}
              myPosts={
                myPosts
              }
              user={user}
              onLike={toggleLike}
              onComment={addComment}
              onOpenComments={loadComments}
              commentsOpen={commentsOpen}
              comments={comments}
              commentText={commentText}
              setCommentText={setCommentText}
              onDelete={deletePost}
              onEdit={startEditPost}
              onLogout={logout}
              users={users}
            />
          )}

            </>
          )}

        </section>


        {/* RIGHT BAR */}

        <aside className="rightbar">

          <div className="panel">

            <div className="panel-title">
              📍 Cheyyar Today
            </div>

            <div className="local-stat">
              <strong>
                {posts.length}
              </strong>

              <span>
                community posts
              </span>
            </div>

            <div className="local-stat">
              <strong>
                {users.length}
              </strong>

              <span>
                members
              </span>
            </div>

          </div>


          <div className="panel quote">

            <div>
              “
            </div>

            <p>
              Our town becomes stronger
              when our people connect.
            </p>

            <small>
              — Cheyyar Hub
            </small>

          </div>

        </aside>

      </main>


      {founderOpen && (
        <FounderModal onClose={() => setFounderOpen(false)} />
      )}

      {editingPost && (
        <EditPostModal
          post={editingPost}
          text={editPostText}
          setText={setEditPostText}
          location={editPostLocation}
          setLocation={setEditPostLocation}
          onClose={() => setEditingPost(null)}
          onSave={savePostEdit}
        />
      )}

      {/* PROFILE EDIT MODAL */}

      {editMode && (
        <ProfileEditModal
          edit={edit}
          setEdit={setEdit}
          profileImage={
            profileImage
          }
          setProfileImage={
            setProfileImage
          }
          onClose={closeEditProfile}
          onSave={
            saveProfile
          }
          saving={
            profileSaving
          }
        />
      )}


      {/* TOAST */}

      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}

    </div>
  );
}


/* =========================================================
   VERIFIED BADGE
   ========================================================= */



/* =========================================================
   DEVELOPER PANEL
   ========================================================= */

function DeveloperPanel({ users, search, setSearch, savingUid, onVerify }) {
  return (
    <div className="developer-page">
      <div className="page-heading developer-heading">
        <div>
          <span><VerifiedBadge developer /> Developer Panel</span>
          <p>Manage the official Cheyyar Hub verified badge.</p>
        </div>
        <div className="developer-secure-pill">Founder access only</div>
      </div>

      <div className="developer-card">
        <div className="developer-card-head">
          <div>
            <strong>Verified Accounts</strong>
            <span>Choose exactly who receives the official badge.</span>
          </div>
          <div className="developer-count">{users.length} users</div>
        </div>

        <div className="developer-search">
          <span>🔎</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, username or email..."
          />
        </div>

        <div className="developer-user-list">
          {users.filter((u) => u.id !== DEVELOPER_UID).map((u) => {
            const verified = u.verified === true;
            const saving = savingUid === u.id;

            return (
              <div className="developer-user" key={u.id}>
                <Avatar profile={u} />
                <div className="developer-user-info">
                  <UserName profile={u} />
                  <UserHandle profile={u} />
                  {u.email && <small>{u.email}</small>}
                </div>

                <button
                  className={verified ? "developer-unverify" : "developer-verify"}
                  disabled={saving}
                  onClick={() => onVerify(u, !verified)}
                >
                  {saving ? "Saving..." : verified ? "✓ Verified" : "Verify"}
                </button>
              </div>
            );
          })}

          {!users.length && (
            <div className="developer-empty">No users found.</div>
          )}
        </div>
      </div>
    </div>
  );
}


/* =========================================================
   HERO
   ========================================================= */

function Hero({
  profile,
  onCreate,
}) {

  return (
    <div className="hero">

      <div className="hero-content">

        <span className="eyebrow">
          WELCOME TO YOUR HOMETOWN
        </span>

        <h1>
          Vanakkam,{" "}
          {
            profile.name
              .split(" ")[0]
          }{" "}
          👋
        </h1>

        <p>
          Share moments, discover people
          and stay connected with Cheyyar.
        </p>

        <button
          className="primary"
          onClick={onCreate}
        >
          ＋ Share something
        </button>

      </div>

      <div className="hero-orb">
        📍
      </div>

    </div>
  );
}


/* =========================================================
   CREATE BOX
   ========================================================= */

function CreateBox({
  profile,
  onClick,
}) {

  return (
    <div
      className="create-box"
      onClick={onClick}
    >

      <Avatar
        profile={profile}
      />

      <div className="fake-input">
        What is happening in Cheyyar?
      </div>

      <span>📸</span>
      <span>📍</span>

    </div>
  );
}


/* =========================================================
   POST
   ========================================================= */

function Post({
  post,
  user,
  profile,
  users = [],
  onLike,
  onComment,
  onOpenComments,
  open,
  comments = [],
  commentText,
  setCommentText,
  onDelete,
  onEdit,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const liked = (post.likedBy || []).includes(user.uid);
  const isOwner = post.authorId === user.uid;
  const authorProfile = users.find((u) => u.id === post.authorId);
  const authorVerified = authorProfile?.verified === true || post.authorVerified === true;
  const commentCount =
    typeof post.commentCount === "number"
      ? post.commentCount
      : comments.length;

  return (
    <article className="post-card" data-post-id={post.id}>
      <div className="post-head">
        <Avatar
          profile={{
            name: post.authorName,
            username: post.authorUsername,
            photoURL: post.authorPhotoURL,
          }}
        />

        <div className="post-author">
          <UserName profile={authorProfile || { id: post.authorId, name: post.authorName, verified: authorVerified }}>
            {post.authorName}
          </UserName>
          <UserHandle profile={authorProfile || { id: post.authorId, username: post.authorUsername, verified: authorVerified }} />
          <span className="post-time">· {timeAgo(post.createdAt)}</span>
        </div>

        {isOwner && (
          <div className="post-menu-wrap">
            <button
              className="more"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Post options"
              aria-expanded={menuOpen}
            >
              •••
            </button>

            {menuOpen && (
              <div className="post-menu">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(post);
                  }}
                >
                  ✏️ Edit post
                </button>

                <button
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(post);
                  }}
                >
                  🗑️ Delete post
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {post.text && <p className="post-text">{post.text}</p>}

      {post.imageURL && (
        <img
          className="post-image"
          src={post.imageURL}
          alt="post"
          loading="lazy"
        />
      )}

      <div className="location">
        📍 {post.location || "Cheyyar"}
      </div>

      <div className="post-stats">
        <span>{post.likes || 0} likes</span>
        <span>{commentCount} comments</span>
      </div>

      <div className="post-actions">
        <button
          className={liked ? "liked" : ""}
          onClick={() => onLike(post)}
        >
          ❤️ <span>Like</span>
        </button>

        <button onClick={() => onOpenComments(post.id)}>
          💬 <span>Comment</span>
        </button>
      </div>

      {open && (
        <div className="comments">
          <div className="comment-compose">
            <Avatar profile={profile} size="small" />

            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onComment(post);
                }
              }}
              placeholder="Write a comment..."
            />

            <button onClick={() => onComment(post)}>
              Send
            </button>
          </div>

          {comments.map((c) => (
            <div className="comment" key={c.id}>
              <Avatar
                profile={{
                  name: c.name,
                  username: c.username,
                  photoURL: c.photoURL,
                }}
                size="small"
              />

              <div>
                <UserName profile={users.find((u) => u.id === c.userId) || { id: c.userId, name: c.name }}>
                  {c.name}
                </UserName>
                <UserHandle profile={users.find((u) => u.id === c.userId) || { id: c.userId, username: c.username }} />
                <p>{c.text}</p>
              </div>
            </div>
          ))}

          {!comments.length && (
            <div className="empty-small">
              Be the first to comment.
            </div>
          )}
        </div>
      )}
    </article>
  );
}


/* =========================================================
   FEED PAGE
   ========================================================= */

function FeedPage({
  title,
  subtitle,
  posts,
  ...props
}) {

  return (
    <>
      <div className="page-heading">

        <span>
          {title}
        </span>

        <p>
          {subtitle}
        </p>

      </div>


      {posts.map(
        (p) => (
          <Post
            key={p.id}
            post={p}
            {...props}
          />
        )
      )}


      {!posts.length && (
        <Empty
          icon="🔥"
          title="Nothing trending yet"
          text="Start the conversation."
        />
      )}

    </>
  );
}


/* =========================================================
   EXPLORE
   ========================================================= */

function Explore({
  users,
  profile,
  onFollow,
  onViewProfile,
  onMessage,
  search,
  setSearch,
}) {
  return (
    <>
      <div className="page-heading">
        <span>📍 Explore Cheyyar</span>
        <p>Find people from your town.</p>
      </div>

      <div className="explore-search">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Cheyyar people..."
        />
      </div>

      <div className="user-grid">
        {users.map((u) => {
          const following = (profile.following || []).includes(u.id);

          return (
            <div className="user-card" key={u.id}>
              <Avatar profile={u} size="large" />

              <UserName profile={u} />
              <UserHandle profile={u} />

              <small>
                📍 {u.area || "Cheyyar"}
              </small>

              <div className="user-card-actions">
                <button
                  className="outline"
                  onClick={() => onViewProfile(u)}
                >
                  View Profile
                </button>

                <button
                  className="outline"
                  onClick={() => onMessage(u)}
                >
                  💬 Message
                </button>

                <button
                  className={following ? "following" : "primary"}
                  onClick={() => onFollow(u)}
                >
                  {following ? "Following" : "Follow"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!users.length && (
        <Empty
          icon="👥"
          title="No people found"
          text="Try another name or username."
        />
      )}
    </>
  );
}


/* =========================================================
   FEATURE PAGE
   ========================================================= */

function UserProfileView({
  target,
  currentUser,
  currentProfile,
  targetPosts = [],
  isFollowing,
  onFollow,
  onMessage,
  onBack,
  onLike,
  onComment,
  onOpenComments,
  commentsOpen,
  comments,
  commentText,
  setCommentText,
  users = [],
}) {
  const isSelf = target.id === currentUser.uid;

  return (
    <div className="profile-page user-profile-view">

      <button
        type="button"
        className="profile-view-back"
        onClick={onBack}
        aria-label="Back"
      >
        ← Back
      </button>

      <div className="cover">
        <div className="cover-pattern">
          CHEYYAR • CHEYYAR • CHEYYAR
        </div>
      </div>

      <div className="profile-main">

        <div className="profile-photo-wrap">
          <Avatar profile={target} size="profile" />
        </div>

        {!isSelf && (
          <div className="profile-actions">
            <button
              className={isFollowing ? "following" : "primary"}
              onClick={() => onFollow(target)}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>

            <button
              className="outline"
              onClick={() => onMessage(target)}
            >
              💬 Message
            </button>
          </div>
        )}

        <h1 className="profile-display-name">
          <UserName profile={target} />
        </h1>

        <UserHandle profile={target} className="handle" />

        <p>{target.bio || "Connected with Cheyyar Hub."}</p>

        <div className="profile-location">
          📍 {target.area || "Cheyyar"}
          {target.profession ? ` · ${target.profession}` : ""}
        </div>

        <div className="stats">
          <div>
            <strong>{targetPosts.length}</strong>
            <span>Posts</span>
          </div>
          <div>
            <strong>{(target.followers || []).length}</strong>
            <span>Followers</span>
          </div>
          <div>
            <strong>{(target.following || []).length}</strong>
            <span>Following</span>
          </div>
        </div>

        <div className="badges">
          {(target.badges || []).map((b) => (
            <span key={b}>{b}</span>
          ))}
        </div>

      </div>

      <div className="profile-posts">

        <h2>
          {isSelf ? "Your Cheyyar Stories" : `${target.name || "Their"} Cheyyar Stories`}
        </h2>

        {targetPosts.map((p) => (
          <Post
            key={p.id}
            post={p}
            user={currentUser}
            profile={currentProfile}
            users={users}
            onLike={onLike}
            onComment={onComment}
            onOpenComments={onOpenComments}
            open={commentsOpen === p.id}
            comments={comments[p.id] || []}
            commentText={commentText}
            setCommentText={setCommentText}
          />
        ))}

        {!targetPosts.length && (
          <Empty
            icon="📝"
            title="No stories yet"
            text="Nothing shared with Cheyyar so far."
          />
        )}

      </div>

    </div>
  );
}


function FounderModal({ onClose }) {
  const developerPhoto = "data:image/png;base64,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";

  return (
    <div
      className="modal-backdrop founder-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Founder and Developer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="founder-modal">
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close developer popup"
        >
          ×
        </button>

        <div className="founder-icon">🚀</div>

        <span className="eyebrow">CHEYYAR HUB</span>
        <h2>Founder & Developer</h2>

        <div className="founder-person">
          <img
            className="developer-photo"
            src={developerPhoto}
            alt="Denesh"
          />

          <div className="founder-person-info">
            <strong>Denesh</strong>
            <span>Founder & Developer</span>

            <a
              className="developer-instagram"
              href="https://www.instagram.com/devilcoderx_/"
              target="_blank"
              rel="noreferrer"
              aria-label="Open Denesh Instagram"
            >
              <span className="instagram-icon">◎</span>
              @devilcoderx_
            </a>
          </div>
        </div>

        <p>
          Built with a simple goal: bring the people of Cheyyar
          together in one local community platform.
        </p>

        <div className="founder-details">
          <div>
            <span>Developer</span>
            <strong>Denesh</strong>
          </div>

          <div>
            <span>Instagram</span>
            <strong>@devilcoderx_</strong>
          </div>

          <div>
            <span>Product</span>
            <strong>Cheyyar Hub</strong>
          </div>
        </div>

        <button className="primary full" onClick={onClose}>
          Continue to Cheyyar Hub
        </button>
      </div>
    </div>
  );
}

function EditPostModal({
  post,
  text,
  setText,
  location,
  setLocation,
  onClose,
  onSave,
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="edit-post-modal">
        <div className="modal-header">
          <div>
            <h2>Edit Post</h2>
            <p>Update your Cheyyar story.</p>
          </div>

          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {post.imageURL && (
          <img
            className="edit-post-preview"
            src={post.imageURL}
            alt="Current post"
          />
        )}

        <label>
          Post
          <textarea
            rows="6"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your post..."
          />
        </label>

        <label>
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Cheyyar"
          />
        </label>

        <div className="modal-actions">
          <button className="outline" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" onClick={onSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}


function FeaturePage({
  icon,
  title,
  subtitle,
  items,
}) {

  return (
    <>

      <div className="feature-hero">

        <div className="feature-icon">
          {icon}
        </div>

        <div>

          <span>
            {title}
          </span>

          <p>
            {subtitle}
          </p>

        </div>

      </div>


      <div className="feature-grid">

        {items.map(
          (x, i) => (

            <div
              className="feature-card"
              key={x}
            >

              <div className="feature-number">
                0{i + 1}
              </div>

              <h3>
                {x}
              </h3>

              <p>
                Connect with the
                Cheyyar community
                around this category.
              </p>

              <button className="outline">
                Explore →
              </button>

            </div>

          )
        )}

      </div>

    </>
  );
}


/* =========================================================
   CREATE PAGE
   ========================================================= */

function CreatePage({
  profile,
  postText,
  setPostText,
  postImage,
  setPostImage,
  postLocation,
  setPostLocation,
  onSubmit,
  onClose,
  posting,
}) {

  return (
    <div className="create-page">

      <div className="page-heading create-heading">

        <div>
          <span>＋ Create a Post</span>
          <p>Tell Cheyyar what is happening.</p>
        </div>

        <button
          type="button"
          className="modal-close create-close"
          onClick={onClose}
          aria-label="Close create post"
        >
          ×
        </button>

      </div>


      <form
        className="composer"
        onSubmit={onSubmit}
      >

        <div className="composer-head">

          <Avatar
            profile={profile}
          />

          <div>

          <strong className="name-with-badge">
  {profile.name}

  {profile?.id === DEVELOPER_UID ? (
    <VerifiedBadge developer />
  ) : profile.verified ? (
    <VerifiedBadge />
  ) : null}
</strong>

            <span>
              Public · Cheyyar
            </span>

          </div>

        </div>


        <textarea
          value={postText}
          onChange={(e) =>
            setPostText(
              e.target.value
            )
          }
          placeholder="Share a moment, local update, photo, recommendation..."
          rows="7"
        />


        <div className="composer-tools">

          <label>

            📸 Add photo

            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                setPostImage(
                  e.target.files?.[0] ||
                  null
                )
              }
            />

          </label>


          <label>

            📍 Location

            <input
              value={
                postLocation
              }
              onChange={(e) =>
                setPostLocation(
                  e.target.value
                )
              }
            />

          </label>

        </div>


        {postImage && (
          <div className="file-pill">
            📷{" "}
            {postImage.name}
          </div>
        )}


        <button
          className="primary full"
          disabled={posting}
        >
          {posting
            ? "Compressing & sharing..."
            : "Share with Cheyyar 🚀"}
        </button>

      </form>

    </div>
  );
}


/* =========================================================
   PROFILE PAGE
   ========================================================= */

function ProfilePage({
  profile,
  onEditProfile,
  myPosts,
  user,
  onLike,
  onComment,
  onOpenComments,
  commentsOpen,
  comments,
  commentText,
  setCommentText,
  onDelete,
  onEdit,
  onLogout,
  users = [],
}) {

  return (
    <div className="profile-page">

      <div className="cover">

        <div className="cover-pattern">
          CHEYYAR • CHEYYAR • CHEYYAR
        </div>

      </div>


      <div className="profile-main">

        <div className="profile-photo-wrap">

          <Avatar
            profile={profile}
            size="profile"
          />

        </div>


        <div className="profile-actions">

          <button
            className="profile-edit-trigger"
            type="button"
            onClick={onEditProfile}
          >
            <span className="profile-edit-trigger-icon">✦</span>
            <span>Edit Profile</span>
          </button>

        </div>


        <h1 className="profile-display-name">
          <UserName profile={profile} />
        </h1>

        <UserHandle profile={profile} className="handle" />

        <p>
          {profile.bio}
        </p>

        <div className="profile-location">
          📍{" "}
          {profile.area ||
            "Cheyyar"}

          {profile.profession &&
            ` · ${profile.profession}`}
        </div>


        <div className="stats">

          <div>
            <strong>
              {myPosts.length}
            </strong>

            <span>
              Posts
            </span>
          </div>

          <div>
            <strong>
              {
                (
                  profile.followers ||
                  []
                ).length
              }
            </strong>

            <span>
              Followers
            </span>
          </div>

          <div>
            <strong>
              {
                (
                  profile.following ||
                  []
                ).length
              }
            </strong>

            <span>
              Following
            </span>
          </div>

        </div>


        <div className="badges">

          {(
            profile.badges ||
            []
          ).map(
            (b) => (
              <span key={b}>
                {b}
              </span>
            )
          )}

        </div>

      </div>


      <div className="profile-account-actions">

        <button
          className="logout profile-logout"
          onClick={onLogout}
        >
          🚪 Logout
        </button>

      </div>


      <div className="profile-posts">

        <h2>
          Your Cheyyar Stories
        </h2>


        {myPosts.map(
          (p) => (
            <Post
              key={p.id}
              post={p}
              user={user}
              profile={profile}
              users={users}
              onLike={onLike}
              onComment={onComment}
              onOpenComments={onOpenComments}
              open={commentsOpen === p.id}
              comments={comments[p.id] || []}
              commentText={commentText}
              setCommentText={setCommentText}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          )
        )}

      </div>

    </div>
  );
}


/* =========================================================
   PROFILE EDIT MODAL
   ========================================================= */

function ProfileEditModal({
  edit,
  setEdit,
  profileImage,
  setProfileImage,
  onClose,
  onSave,
  saving,
}) {
  const previewURL = profileImage
    ? URL.createObjectURL(profileImage)
    : edit.photoURL;

  return (
    <div
      className="modal-backdrop premium-profile-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Edit Profile"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="premium-profile-modal">
        <div className="premium-profile-glow" />

        <div className="premium-profile-header">
          <div className="premium-profile-title">
            <div className="premium-profile-badge">✦</div>
            <div>
              <span className="premium-profile-kicker">
                CHEYYAR HUB • PROFILE
              </span>
              <h2>Edit Profile</h2>
              <p>Make your profile feel like you.</p>
            </div>
          </div>

          <button
            className="modal-close premium-profile-close"
            onClick={onClose}
            aria-label="Close edit profile"
            type="button"
          >
            ×
          </button>
        </div>

        <div className="premium-profile-hero">
          <div className="premium-profile-avatar-ring">
            {previewURL ? (
              <img
                className="premium-profile-avatar"
                src={previewURL}
                alt=""
              />
            ) : (
              <Avatar profile={edit} size="profile" />
            )}

            <label
              className="premium-camera-button"
              title="Change profile photo"
              aria-label="Change profile photo"
            >
              📷
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setProfileImage(e.target.files?.[0] || null)
                }
              />
            </label>
          </div>

          <div className="premium-profile-identity">
            <strong>{edit.name || "Cheyyar User"}</strong>
            <span>@{edit.username || "cheyyaruser"}</span>
            <label className="premium-photo-link">
              Change profile photo
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setProfileImage(e.target.files?.[0] || null)
                }
              />
            </label>
          </div>
        </div>

        <div className="premium-profile-form">
          <div className="premium-field full">
            <label>Name</label>
            <div className="premium-input-wrap">
              <span>◉</span>
              <input
                value={edit.name || ""}
                placeholder="Your name"
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    name: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="premium-field full">
            <label>Username</label>
            <div className="premium-input-wrap">
              <span>@</span>
              <input
                value={edit.username || ""}
                placeholder="username"
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    username: e.target.value
                      .replace(/\s/g, "")
                      .toLowerCase(),
                  })
                }
              />
            </div>
          </div>

          <div className="premium-field full">
            <label>Bio</label>
            <div className="premium-input-wrap textarea-wrap">
              <span>✎</span>
              <textarea
                value={edit.bio || ""}
                placeholder="Tell Cheyyar something about you..."
                rows="3"
                maxLength={160}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    bio: e.target.value,
                  })
                }
              />
            </div>
            <small>{(edit.bio || "").length}/160</small>
          </div>

          <div className="premium-field">
            <label>Area</label>
            <div className="premium-input-wrap">
              <span>⌖</span>
              <input
                value={edit.area || ""}
                placeholder="Cheyyar"
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    area: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="premium-field">
            <label>Profession</label>
            <div className="premium-input-wrap">
              <span>✦</span>
              <input
                value={edit.profession || ""}
                placeholder="What do you do?"
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    profession: e.target.value,
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="premium-profile-footer">
          <div className="premium-profile-note">
            <span>✓</span>
            <div>
              <strong>Your profile, your identity</strong>
              <small>Changes are saved securely to your account.</small>
            </div>
          </div>

          <div className="premium-profile-actions">
            <button
              className="premium-cancel-btn"
              onClick={onClose}
              disabled={saving}
              type="button"
            >
              Cancel
            </button>

            <button
              className="premium-save-btn"
              onClick={onSave}
              disabled={saving}
              type="button"
            >
              <span>{saving ? "Saving..." : "Save Changes"}</span>
              {!saving && <span>→</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PREMIUM MESSAGES
   ========================================================= */

function Messages({
  users,
  profile,
  selectedUser,
  setSelectedUser,
  messages,
  messageText,
  setMessageText,
  sendMessage,
  loading,
  messageEndRef,
  currentUser,
  onViewProfile,
}) {

  const [chatSearch, setChatSearch] =
    useState("");

  const visibleUsers =
    users.filter((u) =>
      `${u.name || ""} ${
        u.username || ""
      }`
        .toLowerCase()
        .includes(
          chatSearch
            .toLowerCase()
        )
    );


  return (
    <div className="messages-page">

      <div className="page-heading">

        <span>
          💬 Messages
        </span>

        <p>
          Private conversations with your town.
        </p>

      </div>


      <div className={`chat-shell ${selectedUser ? "chat-open" : ""}`}>

        {/* CHAT SIDEBAR */}

        <div className="chat-sidebar">

          <div className="chat-sidebar-header">

            <h2>
              Messages
            </h2>

            <div className="chat-search">

              <input
                value={
                  chatSearch
                }
                onChange={(e) =>
                  setChatSearch(
                    e.target.value
                  )
                }
                placeholder="Search people..."
              />

            </div>

          </div>


          <div className="chat-users">

            {visibleUsers.map(
              (u) => (

                <button
                  className={
                    selectedUser?.id ===
                    u.id
                      ? "chat-user active"
                      : "chat-user"
                  }
                  key={u.id}
                  onClick={() =>
                    setSelectedUser(u)
                  }
                >

                  <Avatar
                    profile={u}
                    size="small"
                  />

                  <div className="chat-user-info">

                    <UserName profile={u} />
                    <UserHandle profile={u} />

                  </div>

                </button>

              )
            )}

          </div>

        </div>


        {/* CHAT WINDOW */}

        <div className="chat-window">

          {!selectedUser ? (

            <div className="chat-empty">

              <div>

                <div className="chat-empty-icon">
                  💬
                </div>

                <h3>
                  Start a conversation
                </h3>

                <p>
                  Choose someone from Cheyyar
                  to start chatting.
                </p>

              </div>

            </div>

          ) : (

            <>

              {/* HEADER */}

              <div className="chat-header">

                <button
                  type="button"
                  className="chat-back"
                  onClick={() => setSelectedUser(null)}
                  aria-label="Back to messages"
                >
                  ←
                </button>

                <button
                  type="button"
                  className="chat-header-identity"
                  onClick={() => onViewProfile?.(selectedUser)}
                >

                  <Avatar
                    profile={selectedUser}
                    size="small"
                  />

                  <div className="chat-header-info">

                    <UserName profile={selectedUser} />
                    <UserHandle profile={selectedUser} />

                  </div>

                </button>

                <div className="chat-header-actions">

                  <button>
                    📞
                  </button>

                  <button>
                    ⋯
                  </button>

                </div>

              </div>


              {/* MESSAGES */}

              <div className="chat-messages">

                <div className="chat-date">
                  Today
                </div>


                {messages.map(
                  (message) => {

                    const mine =
                      message.senderId ===
                      currentUser.uid;

                    return (
                      <div
                        key={
                          message.id
                        }
                        className={
                          mine
                            ? "message-bubble-row mine"
                            : "message-bubble-row"
                        }
                      >

                        {!mine && (
                          <div className="message-mini-avatar">

                            <Avatar
                              profile={
                                selectedUser
                              }
                              size="small"
                            />

                          </div>
                        )}


                        <div className="message-bubble">

                          {message.text}

                          <span className="message-time">

                            {timeAgo(
                              message.createdAt
                            )}

                            {mine &&
                              message.read &&
                              " · Seen"}

                          </span>

                        </div>

                      </div>
                    );

                  }
                )}


                <div
                  ref={
                    messageEndRef
                  }
                />

              </div>


              {/* COMPOSER */}

              <form
                className="chat-composer"
                onSubmit={
                  sendMessage
                }
              >

                <button
                  type="button"
                  className="chat-attach"
                >
                  ＋
                </button>


                <div className="chat-input-wrap">

                  <input
                    className="chat-input"
                    value={
                      messageText
                    }
                    onChange={(e) =>
                      setMessageText(
                        e.target.value
                      )
                    }
                    placeholder="Write a message..."
                  />

                  <button
                    type="button"
                    className="chat-emoji"
                    onClick={() =>
                      setMessageText(
                        (v) =>
                          v + " ❤️"
                      )
                    }
                  >
                    😊
                  </button>

                </div>


                <button
                  className="chat-send"
                  type="submit"
                  disabled={
                    loading ||
                    !messageText.trim()
                  }
                >
                  ➤
                </button>

              </form>

            </>

          )}

        </div>

      </div>

    </div>
  );
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function NotificationsPage({
  notifications,
  onRead,
  onNavigatePost,
  users,
}) {

  return (
    <div className="notifications-page">

      <div className="page-heading">

        <span>
          🔔 Notifications
        </span>

        <p>
          See what is happening around your profile.
        </p>

      </div>


      <div className="notification-list">

        {notifications.map(
          (notification) => (

            <button
              key={
                notification.id
              }
              className={
                notification.read
                  ? "notification-item"
                  : "notification-item unread"
              }
              onClick={() => {

                onRead(
                  notification
                );

                if (
                  notification.postId
                ) {
                  onNavigatePost(
                    notification.postId
                  );
                }

              }}
            >

              <Avatar
                profile={{
                  name:
                    notification.senderName,

                  username:
                    notification.senderUsername,

                  photoURL:
                    notification.senderPhotoURL,
                }}
                size="small"
              />


              <div className="notification-content">

                <UserName
                  profile={{
                    id: notification.senderId,
                    name: notification.senderName,
                    username: notification.senderUsername,
                    photoURL: notification.senderPhotoURL,
                    verified: (users || []).find((u) => u.id === notification.senderId)?.verified === true,
                  }}
                />

                <p>
                  {notification.message}
                </p>

                <span>
                  {timeAgo(
                    notification.createdAt
                  )}
                </span>

              </div>


              <div className="notification-icon">

                {notification.type ===
                  "like" && "❤️"}

                {notification.type ===
                  "comment" && "💬"}

                {notification.type ===
                  "follow" && "👤"}

                {notification.type ===
                  "share" && "↗️"}

              </div>

            </button>

          )
        )}


        {!notifications.length && (

          <Empty
            icon="🔔"
            title="No notifications"
            text="When people interact with you, they will appear here."
          />

        )}

      </div>

    </div>
  );
}


/* =========================================================
   EMPTY
   ========================================================= */

function Empty({
  icon,
  title,
  text,
}) {

  return (
    <div className="empty">

      <div>
        {icon}
      </div>

      <h2>
        {title}
      </h2>

      <p>
        {text}
      </p>

    </div>
  );
}


export default App;
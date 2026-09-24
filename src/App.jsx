import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import logo from "./assets/logo.png";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { auth, db } from "./firebase";

import {
  onAuthStateChanged,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,   // 👈 ithai sethukonga
  getRedirectResult,    // 👈 ithaiyum sethukonga
  signInWithCredential,
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
  Timestamp,
} from "firebase/firestore";


/* =========================================================
   CLOUDINARY
   ========================================================= */

const CLOUDINARY_CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;


const googleProvider = new GoogleAuthProvider();
// Always shows the account chooser instead of silently reusing whichever
// Google account the browser last used.
googleProvider.setCustomParameters({ prompt: "select_account" });


/* =========================================================
   DEFAULT PROFILE
   ========================================================= */

const DEVELOPER_UID = import.meta.env.VITE_DEVELOPER_UID || "vEIdznPIjVQiu70TwRjVKz8Dq0q2";

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
  ["reels", "🎬", "Reels"],
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
   STORIES & REELS - SETTINGS AND MEDIA HELPERS
   ========================================================= */

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // stories live for 24 hours
const STORY_IMAGE_MS = 5000; // how long a photo story stays on screen
const MAX_STORY_VIDEO_SEC = 30;
const MAX_REEL_SEC = 60;
const MAX_VIDEO_MB = 50;

// true  = show stories from everyone in Cheyyar (good while the town is small)
// false = only you + people you follow (Instagram style)
const STORIES_FROM_EVERYONE = true;

// Cloudinary delivery transformation for videos: smaller files + plays on
// every phone (H.264 MP4). Set to "" to serve the original upload untouched.
const CLD_VIDEO_TX = "q_auto,f_mp4,vc_h264";

function uploadVideoToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      reject(new Error("Cloudinary is not configured."));
      return;
    }

    const xhr = new XMLHttpRequest();

    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`
    );

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };

    xhr.onload = () => {
      let data = {};

      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // ignore
      }

      if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
        resolve(data);
      } else {
        reject(new Error(data?.error?.message || "Video upload failed."));
      }
    };

    xhr.onerror = () =>
      reject(new Error("Network error while uploading the video."));

    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    xhr.send(form);
  });
}

function cldVideoURL(url) {
  if (!url || !CLD_VIDEO_TX || !url.includes("/video/upload/")) return url;
  return url.replace("/video/upload/", `/video/upload/${CLD_VIDEO_TX}/`);
}

// First frame of a Cloudinary video as a small JPG.
function cldPosterURL(url) {
  if (!url || !url.includes("/video/upload/")) return "";

  return url
    .replace("/video/upload/", "/video/upload/so_0,w_540,f_jpg/")
    .replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
}

function readVideoMeta(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    let finished = false;

    const done = (value) => {
      if (finished) return;
      finished = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };

    video.preload = "metadata";
    video.muted = true;

    video.onloadedmetadata = () =>
      done({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });

    video.onerror = () => done(null);

    setTimeout(() => done(null), 8000);

    video.src = url;
  });
}

function formatCount(n = 0) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

// Stops the page behind an overlay from scrolling.
function useBodyLock() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}


/* =========================================================
   APP
   ========================================================= */

function App() {

  /* AUTH */

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [authError, setAuthError] =
    useState("");

  const [googleSubmitting, setGoogleSubmitting] =
    useState(false);

  // True once a signed-in Google user has no /users profile doc yet, so we
  // show the one-time "pick a username" screen before letting them into
  // the app. Google already supplies name + photo; only username is asked.
  const [needsOnboarding, setNeedsOnboarding] =
    useState(false);

  const [onboardingName, setOnboardingName] =
    useState("");

  const [onboardingUsername, setOnboardingUsername] =
    useState("");

  const [onboardingSubmitting, setOnboardingSubmitting] =
    useState(false);

  const [onboardingError, setOnboardingError] =
    useState("");

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

  /* STORIES & REELS */

  const [stories, setStories] = useState([]);
  const [storyClock, setStoryClock] = useState(() => Date.now());
  const [storyViewer, setStoryViewer] = useState(null);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [reelComposerOpen, setReelComposerOpen] = useState(false);
  const [reelCommentsFor, setReelCommentsFor] = useState(null);
  const [createChooserOpen, setCreateChooserOpen] = useState(false);
  const viewedStoriesRef = useRef(new Set());

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

  // Every chat doc the current user is part of, kept live so the Messages
  // sidebar can show real conversations (with a last-message preview) and
  // split them into "Messages" vs "Requests" like Instagram, instead of
  // just listing every user in the app.
  const [myChats, setMyChats] =
    useState([]);


  /* UI */

  const [toast, setToast] =
    useState("");

  const messageEndRef =
    useRef(null);


/* =======================================================
     AUTH STATE
     ======================================================= */

     useEffect(() => {
      // 1. Android redirect login-ஆக இருந்தால் result-ஐ handle பண்ணும்
      getRedirectResult(auth)
        .then((result) => {
          if (result?.user) {
            setUser(result.user);
          }
        })
        .catch((err) => {
          console.error("Redirect login error:", err);
          if (err.code !== "auth/credential-already-in-use") {
            setAuthError(err.message?.replace("Firebase: ", "") || "Google sign-in failed.");
          }
        })
        .finally(() => {
          // Redirect check முடிந்தவுடன் loading-ஐ false பண்ணும்
          setAuthLoading(false);
        });
  
      // 2. Normal auth listener (Auto login / already logged in check)
      const unsub = onAuthStateChanged(
        auth,
        (u) => {
          setUser(u);
          setAuthLoading(false);
        }
      );
  
      return () => unsub();
    }, []);


  /* =======================================================
     USER PROFILE

     A signed-in Google user with no /users doc yet is a first-time
     signer-in: we don't auto-create their profile here anymore, we
     flag needsOnboarding and let the onboarding screen (further down)
     collect their username before writing the doc.
     ======================================================= */

  useEffect(() => {

    if (!user) return;

    setProfileLoading(true);

    const userRef =
      doc(db, "users", user.uid);

    const unsub = onSnapshot(
      userRef,
      (snap) => {

        if (snap.exists()) {

          const p = {
            id: user.uid,
            ...DEFAULT_PROFILE,
            ...snap.data(),
          };

          setProfile(p);
          setEdit(p);
          setNeedsOnboarding(false);

        } else {

          setNeedsOnboarding(true);

          setOnboardingName(
            (prev) => prev || user.displayName || ""
          );
        }

        setProfileLoading(false);
      }
    );

    return unsub;

  }, [user]);


  /* =======================================================
     ONBOARDING (first-time Google sign-in)
     ======================================================= */

  async function completeOnboarding(e) {

    e.preventDefault();

    setOnboardingError("");

    const displayName =
      onboardingName.trim() || "Cheyyar User";

    const username =
      onboardingUsername
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.]/g, "");

    if (!username) {
      setOnboardingError(
        "Pick a username using letters and numbers."
      );
      return;
    }

    setOnboardingSubmitting(true);

    try {

      const usernameSnap = await getDocs(
        query(
          collection(db, "users"),
          where("username", "==", username),
          limit(1)
        )
      );

      if (!usernameSnap.empty) {
        throw new Error(
          "That username is already taken. Please pick another."
        );
      }

      await updateProfile(
        user,
        { displayName }
      );

      const newProfile = {
        ...DEFAULT_PROFILE,
        name: displayName,
        username,
        email: user.email || "",
        photoURL: user.photoURL || "",
        createdAt: serverTimestamp(),
      };

      await setDoc(
        doc(db, "users", user.uid),
        newProfile
      );

      setNeedsOnboarding(false);

    } catch (err) {

      console.error(err);

      setOnboardingError(
        err.message?.replace("Firebase: ", "") ||
        "Could not save your profile. Try again."
      );

    } finally {

      setOnboardingSubmitting(false);

    }
  }


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
     STORIES (24 hour)
     ======================================================= */

  useEffect(() => {

    if (!user) return;

    // Single-field filter, so no composite index is needed.
    const q = query(
      collection(db, "stories"),
      where("expiresAt", ">", Timestamp.fromMillis(Date.now())),
      limit(150)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setStories(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      },
      (error) => {
        console.error("Stories listener:", error);
      }
    );

    return unsub;

  }, [user]);

  // Tick once a minute so expired stories vanish without a refresh.
  useEffect(() => {

    const timer = setInterval(
      () => setStoryClock(Date.now()),
      60000
    );

    return () => clearInterval(timer);

  }, []);

  const storyGroups = useMemo(() => {

    if (!user) return [];

    const followingSet = new Set(profile.following || []);

    const byAuthor = new Map();

    stories.forEach((story) => {

      const expires = story.expiresAt?.toMillis?.() ?? 0;

      if (expires <= storyClock) return;

      if (
        !STORIES_FROM_EVERYONE &&
        story.authorId !== user.uid &&
        !followingSet.has(story.authorId)
      ) {
        return;
      }

      if (!byAuthor.has(story.authorId)) {
        byAuthor.set(story.authorId, []);
      }

      byAuthor.get(story.authorId).push(story);
    });

    const millis = (s) =>
      s.createdAt?.toMillis?.() ?? Date.now();

    const groups = [];

    byAuthor.forEach((list, authorId) => {

      list.sort((a, b) => millis(a) - millis(b));

      const author = users.find((u) => u.id === authorId);

      groups.push({
        authorId,
        isOwn: authorId === user.uid,
        isFollowing: followingSet.has(authorId),
        author: {
          id: authorId,
          name: author?.name || list[0].authorName,
          username: author?.username || list[0].authorUsername,
          photoURL: author?.photoURL || list[0].authorPhotoURL || "",
          verified: author?.verified === true,
        },
        stories: list,
        latest: millis(list[list.length - 1]),
        hasUnseen: list.some(
          (s) => !(s.viewedBy || []).includes(user.uid)
        ),
      });
    });

    const rank = (g) => {
      if (g.isOwn) return 0;
      return (g.hasUnseen ? 1 : 3) + (g.isFollowing ? 0 : 1);
    };

    groups.sort(
      (a, b) => rank(a) - rank(b) || b.latest - a.latest
    );

    return groups;

  }, [stories, storyClock, users, profile.following, user]);


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
     MY CHATS (for the Messages / Requests split)
     ======================================================= */

  useEffect(() => {

    if (!user) {
      setMyChats([]);
      return;
    }

    const q = query(
      collection(db, "chats"),
      where("users", "array-contains", user.uid),
      orderBy("updatedAt", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setMyChats(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      },
      (error) => {
        console.error("My chats:", error);
      }
    );

    return unsub;

  }, [user]);


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
     ANDROID-STYLE BACK NAVIGATION

     The app never changed the URL, so the phone's back gesture had
     nothing to pop and closed the whole site. Every open layer now
     gets its own history entry, and back closes the topmost layer
     instead. At the home feed, back twice within 2s exits.
     ======================================================= */

  // Closable layers, innermost first.
  const backLayers = useMemo(() => {

    const layers = [];

    if (storyViewer)
      layers.push(() => setStoryViewer(null));

    if (storyComposerOpen)
      layers.push(() => setStoryComposerOpen(false));

    if (reelComposerOpen)
      layers.push(() => setReelComposerOpen(false));

    if (reelCommentsFor)
      layers.push(() => setReelCommentsFor(null));

    if (createChooserOpen)
      layers.push(() => setCreateChooserOpen(false));

    if (editMode)
      layers.push(() => setEditMode(false));

    if (editingPost)
      layers.push(() => setEditingPost(null));

    if (commentsOpen)
      layers.push(() => setCommentsOpen(null));

    if (founderOpen)
      layers.push(() => setFounderOpen(false));

    if (viewingUser)
      layers.push(() => setViewingUser(null));

    if (selectedChatUser)
      layers.push(() => setSelectedChatUser(null));

    if (page !== "home")
      layers.push(() => setPage("home"));

    return layers;

  }, [
    storyViewer,
    storyComposerOpen,
    reelComposerOpen,
    reelCommentsFor,
    createChooserOpen,
    editMode,
    editingPost,
    commentsOpen,
    founderOpen,
    viewingUser,
    selectedChatUser,
    page,
  ]);

  const backLayersRef = useRef(backLayers);
  backLayersRef.current = backLayers;

  const depthRef = useRef(0);
  const ignorePopRef = useRef(0);
  const lastBackRef = useRef(0);

  // Push a root guard entry once, so the very first back press is ours.
  useEffect(() => {

    if (!user) return;

    window.history.pushState(
      { hub: "root" },
      ""
    );

  }, [user]);

  // Keep history depth in sync with how many layers are open.
  useEffect(() => {

    if (!user) return;

    const depth = backLayers.length;

    if (depth > depthRef.current) {

      for (let i = depthRef.current; i < depth; i++) {
        window.history.pushState(
          { hub: "layer", level: i + 1 },
          ""
        );
      }

    } else if (depth < depthRef.current) {

      // Layer was closed with an on-screen button, so drop the matching
      // history entries without letting popstate re-close anything.
      const diff = depthRef.current - depth;

      ignorePopRef.current += diff;

      window.history.go(-diff);
    }

    depthRef.current = depth;

  }, [backLayers.length, user]);

  // Handle the actual back gesture / hardware button.
  useEffect(() => {

    if (!user) return;

    const onPop = () => {

      if (ignorePopRef.current > 0) {
        ignorePopRef.current -= 1;
        return;
      }

      const layers = backLayersRef.current;

      if (layers.length > 0) {

        // Closing from here means the history entry is already gone,
        // so update our depth first and skip the sync effect's go().
        depthRef.current = layers.length - 1;

        layers[0]();

        return;
      }

      // At the home feed: ask once before leaving.
      const now = Date.now();

      if (now - lastBackRef.current < 2000) {
        window.history.back();
        return;
      }

      lastBackRef.current = now;

      setToast("Press back again to exit");

      window.history.pushState(
        { hub: "root" },
        ""
      );
    };

    window.addEventListener("popstate", onPop);

    return () =>
      window.removeEventListener("popstate", onPop);

  }, [user]);


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

  // Native Android app (WebView) sends the Google ID token back here.
  useEffect(() => {

    window.onNativeGoogleToken = async (idToken) => {
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } catch (err) {
        console.error(err);
        setAuthError(
          err.message?.replace("Firebase: ", "") ||
          "Google sign-in failed."
        );
      } finally {
        setGoogleSubmitting(false);
      }
    };

    window.onNativeGoogleError = (code) => {
      setGoogleSubmitting(false);
      // 12501 = user closed the account chooser
      if (String(code) !== "12501") {
        setAuthError("Google sign-in failed. Code: " + code);
      }
    };

    return () => {
      delete window.onNativeGoogleToken;
      delete window.onNativeGoogleError;
    };

  }, []);


  // Native Android app: save this device's FCM token on the user's doc so
  // api/send-push can find it. The token comes from the Java side via
  // AndroidBridge.getFcmToken() (already stored) or window.onFcmToken (when
  // Firebase hands it over a moment later).
  useEffect(() => {
    if (!user?.uid) return;
    if (!Capacitor.isNativePlatform()) return;

    const initPush = async () => {
      try {
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === "prompt") {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== "granted") {
          console.warn("Push notification permission denied");
          return;
        }

        await PushNotifications.register();

        // 1. FCM Token பதிவு செய்தல்
        await PushNotifications.addListener("registration", async (token) => {
          try {
            await updateDoc(doc(db, "users", user.uid), {
              fcmTokens: arrayUnion(token.value),
            });
          } catch (err) {
            console.error("FCM Token save error:", err);
          }
        });

        await PushNotifications.addListener("registrationError", (err) => {
          console.error("Push registration error:", err);
        });

        // 2. App open-ல் (Foreground) இருக்கும் போது Notification வந்தால்
        await PushNotifications.addListener("pushNotificationReceived", (notification) => {
          setToast(`${notification.title || "Notification"}: ${notification.body || ""}`);
        });

        // 3. Notification-ஐ tap செய்யும் போது அந்த பக்கத்திற்கு navigate செய்தல்
        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const data = action.notification.data;
          if (data?.postId) {
            setHighlightedPostId(data.postId);
            setPage("home");
          } else if (data?.type === "message") {
            setPage("messages");
          }
        });
      } catch (err) {
        console.error("Failed to setup push notifications:", err);
      }
    };

    initPush();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, [user?.uid]);


  async function signInWithGoogle() {
    setAuthError("");

    if (window.AndroidBridge && window.AndroidBridge.googleLogin) {
      setGoogleSubmitting(true);
      window.AndroidBridge.googleLogin();
      return;
    }

    setGoogleSubmitting(true);

    try {
      if (Capacitor.isNativePlatform()) {
        const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");

        aawait GoogleAuth.initialize({
          clientId: "788287014995-jhf9qav3qhbllpe7a7udevorlt0jpi31.apps.googleusercontent.com",
          scopes: ["profile", "email"],
        });

        try {
          await GoogleAuth.signOut();
        } catch (_) {}

        // 1. Native Google Sign-in
        const googleUser = await GoogleAuth.signIn();
        
        const idToken = googleUser?.authentication?.idToken || googleUser?.idToken;
        
        if (!idToken) {
          alert("Step 1 Fail - No idToken: " + JSON.stringify(googleUser));
          return;
        }

        // 2. Firebase Exchange
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err) {
      console.error("Google sign-in detailed error:", err);

      // எல்லா properties-ஐயும் பிரித்து எடுக்கிறோம்
      const deepError = {
        message: err?.message,
        code: err?.code,
        name: err?.name,
        stack: err?.stack,
        raw: String(err)
      };

      alert("DETAILED ERROR:\n" + JSON.stringify(deepError, null, 2));
      setAuthError(err?.message || "Google sign-in failed.");
    } finally {
      setGoogleSubmitting(false);
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

      // Fire-and-forget: ask the Vercel function to send the phone push.
      // Failure here must never break the like/comment/message itself.
      try {
        const idToken = await auth.currentUser.getIdToken();

        fetch("/api/send-push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ receiverId, type, message }),
        }).catch(() => {});
      } catch {
        // ignore
      }

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
     STORIES
     ======================================================= */

  async function createStory({ file, kind, meta, caption }, onProgress) {

    let mediaURL = "";
    let poster = "";
    let duration = 0;

    if (kind === "video") {

      const data = await uploadVideoToCloudinary(file, onProgress);

      mediaURL = data.secure_url;
      poster = cldPosterURL(mediaURL);
      duration = Math.round(data.duration || meta?.duration || 0);

    } else {

      mediaURL = await uploadToCloudinary(file);

    }

    await addDoc(
      collection(db, "stories"),
      {
        mediaURL,
        mediaType: kind,
        poster,
        duration,
        caption,

        authorId: user.uid,
        authorName: profile.name,
        authorUsername: profile.username,
        authorPhotoURL: profile.photoURL || "",

        viewedBy: [],

        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + STORY_TTL_MS),
      }
    );

    setToast("Added to your story");
  }


  function markStoryViewed(story) {

    if (!story?.id || story.authorId === user.uid) return;

    if (viewedStoriesRef.current.has(story.id)) return;

    viewedStoriesRef.current.add(story.id);

    if ((story.viewedBy || []).includes(user.uid)) return;

    updateDoc(
      doc(db, "stories", story.id),
      { viewedBy: arrayUnion(user.uid) }
    ).catch((error) => {
      console.error("Story view:", error);
    });
  }


  async function deleteStory(story) {

    if (!story || story.authorId !== user.uid) return;

    try {
      await deleteDoc(doc(db, "stories", story.id));
      setToast("Story deleted");
    } catch (error) {
      console.error("Delete story:", error);
      setToast(error.message || "Could not delete story");
    }
  }


  /* =======================================================
     REELS
     ======================================================= */

  async function createReel({ file, meta, caption }, onProgress) {

    const data = await uploadVideoToCloudinary(file, onProgress);

    const width = data.width || meta?.width || 0;
    const height = data.height || meta?.height || 0;

    await addDoc(
      collection(db, "reels"),
      {
        videoURL: data.secure_url,
        poster: cldPosterURL(data.secure_url),
        duration: Math.round(data.duration || meta?.duration || 0),
        landscape: width > height,
        caption,

        authorId: user.uid,
        authorName: profile.name,
        authorUsername: profile.username,
        authorPhotoURL: profile.photoURL || "",

        likes: 0,
        likedBy: [],
        shares: 0,
        commentCount: 0,

        createdAt: serverTimestamp(),
      }
    );

    setToast("Reel shared with Cheyyar 🎬");
    setPage("reels");
  }


  async function toggleReelLike(reel) {

    const liked = (reel.likedBy || []).includes(user.uid);

    try {

      await updateDoc(
        doc(db, "reels", reel.id),
        {
          likes: increment(liked ? -1 : 1),
          likedBy: liked
            ? arrayRemove(user.uid)
            : arrayUnion(user.uid),
        }
      );

      if (!liked) {
        await createNotification({
          receiverId: reel.authorId,
          type: "like",
          message: `${profile.name} liked your reel.`,
        });
      }

    } catch (error) {
      console.error("Reel like:", error);
      setToast(error.message || "Could not like reel");
    }
  }


  async function addReelComment(reel, text) {

    try {

      const commentRef = doc(
        collection(db, "reels", reel.id, "comments")
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
        doc(db, "reels", reel.id),
        { commentCount: increment(1) }
      );

      await batch.commit();

      await createNotification({
        receiverId: reel.authorId,
        type: "comment",
        message: `${profile.name} commented on your reel.`,
      });

    } catch (error) {
      console.error("Reel comment:", error);
      setToast(error.message || "Could not add comment");
      throw error;
    }
  }


  async function shareReel(reel) {

    const text =
      `${reel.authorName} on Cheyyar Hub: ${
        reel.caption || "Watch this reel"
      }`;

    try {

      if (navigator.share) {
        await navigator.share({
          title: "Cheyyar Hub",
          text,
          url: window.location.origin,
        });
      } else {
        await navigator.clipboard.writeText(
          `${text} ${window.location.origin}`
        );
        setToast("Link copied");
      }

      await updateDoc(
        doc(db, "reels", reel.id),
        { shares: increment(1) }
      );

    } catch (error) {
      // Cancelling the share sheet throws; that is not an error.
      if (error?.name !== "AbortError") {
        console.log(error);
      }
    }
  }


  async function deleteReel(reel) {

    if (!reel || reel.authorId !== user.uid) {
      setToast("You can only manage your own reels");
      return;
    }

    if (!window.confirm("Delete this reel? This cannot be undone.")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "reels", reel.id));
      setToast("Reel deleted");
    } catch (error) {
      console.error("Delete reel:", error);
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
          ].sort(),

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
          ].sort(),

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

    // Stop pushes for this account going to this phone after logout.
    try {
      const token = window.AndroidBridge?.getFcmToken?.();

      if (token && user?.uid) {
        await updateDoc(doc(db, "users", user.uid), {
          fcmTokens: arrayRemove(token),
        });
      }
    } catch {
      // ignore
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
        await GoogleAuth.signOut();
      } catch (e) {
        console.log("Google session clear error:", e);
      }
    }
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

          <div className="auth-card">

            <div className="brand auth-card-brand">
              cheyyar<span>hub</span>
            </div>

            <h2>
              Welcome 👋
            </h2>

            <p className="tagline">
              Sign in with Google to continue to your feed.
            </p>

            <button
              type="button"
              className="google-btn"
              onClick={signInWithGoogle}
              disabled={googleSubmitting}
            >
              {googleSubmitting ? (
                <span className="auth-spinner dark" aria-hidden="true" />
              ) : (
                <>
                  <svg viewBox="0 0 48 48" className="google-icon" aria-hidden="true">
                    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
                    <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 34.9 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
                    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C41.4 36.5 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            {authError && (
              <div className="error">
                {authError}
              </div>
            )}

          </div>

        </div>
      </div>
    );
  }


  /* =======================================================
     ONBOARDING — first-time Google sign-in, pick a username
     ======================================================= */

  if (needsOnboarding) {

    return (
      <div className="auth-screen">

        <div className="auth-glow auth-glow-1" />
        <div className="auth-glow auth-glow-2" />

        <div className="auth-wrap">

          <div className="auth-visual">

            <div className="brand big">
              cheyyar<span>hub</span>
            </div>

            <p className="auth-visual-tagline">
              Just one more step before you are in.
            </p>

          </div>

          <form
            className="auth-card"
            onSubmit={completeOnboarding}
          >

            <div className="brand auth-card-brand">
              cheyyar<span>hub</span>
            </div>

            <h2>
              Complete your profile
            </h2>

            <p className="tagline">
              We pulled your name and photo from Google — just pick a
              username to finish.
            </p>

            <div className="onboarding-avatar-row">
              <Avatar
                profile={{
                  name: onboardingName,
                  photoURL: user.photoURL || "",
                }}
                size="large"
              />
            </div>

            <div className="input-group">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M4 20.5c1.4-3.6 4.6-5.5 8-5.5s6.6 1.9 8 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <input
                value={onboardingName}
                onChange={(e) =>
                  setOnboardingName(e.target.value)
                }
                placeholder="Your name"
                required
              />
            </div>

            <div className="input-group">
              <span className="input-icon" aria-hidden="true">@</span>
              <input
                value={onboardingUsername}
                onChange={(e) =>
                  setOnboardingUsername(e.target.value)
                }
                placeholder="Choose a username"
                required
              />
            </div>

            {onboardingError && (
              <div className="error">
                {onboardingError}
              </div>
            )}

            <button
              className="primary full auth-submit"
              type="submit"
              disabled={onboardingSubmitting}
            >
              {onboardingSubmitting ? (
                <span className="auth-spinner" aria-hidden="true" />
              ) : (
                "Continue"
              )}
            </button>

            <button
              type="button"
              className="text-btn"
              onClick={() => signOut(auth)}
            >
              Not you? Sign out
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
    <span className="dp-icon">👨‍💻</span>
    <span className="dp-full"> Developer Panel</span>
    <span className="dp-short">Dev</span>
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
    aria-label="Create"
    className="create-mobile"
    onClick={() => setCreateChooserOpen(true)}
  >
    ＋
  </button>

  {/* Reels (notifications live in the top bar on mobile) */}
  <button
    aria-label="Reels"
    className={page === "reels" ? "active" : ""}
    onClick={() => nav("reels")}
  >
    🎬
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

              <StoriesBar
                profile={profile}
                groups={storyGroups}
                onOpen={(index) =>
                  setStoryViewer({
                    groups: storyGroups,
                    groupIndex: index,
                  })
                }
                onAdd={() => setStoryComposerOpen(true)}
              />

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


          {/* REELS */}

          {page === "reels" && (
            <ReelsPage
              user={user}
              profile={profile}
              users={users}
              onLike={toggleReelLike}
              onOpenComments={setReelCommentsFor}
              onFollow={follow}
              onShare={shareReel}
              onDelete={deleteReel}
              onCompose={() => setReelComposerOpen(true)}
              onViewProfile={(target) => setViewingUser(target)}
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
              myChats={myChats}
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
              onDeleteReel={deleteReel}
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


      {/* STORIES & REELS OVERLAYS */}

      {storyViewer && (
        <StoryViewer
          groups={storyViewer.groups}
          startIndex={storyViewer.groupIndex}
          user={user}
          users={users}
          liveStories={stories}
          onClose={() => setStoryViewer(null)}
          onView={markStoryViewed}
          onDelete={deleteStory}
        />
      )}

      {storyComposerOpen && (
        <MediaComposer
          mode="story"
          onClose={() => setStoryComposerOpen(false)}
          onSubmit={createStory}
        />
      )}

      {reelComposerOpen && (
        <MediaComposer
          mode="reel"
          onClose={() => setReelComposerOpen(false)}
          onSubmit={createReel}
        />
      )}

      {reelCommentsFor && (
        <ReelCommentsSheet
          reel={reelCommentsFor}
          user={user}
          profile={profile}
          users={users}
          onClose={() => setReelCommentsFor(null)}
          onSubmit={addReelComment}
        />
      )}

      {createChooserOpen && (
        <CreateChooser
          onClose={() => setCreateChooserOpen(false)}
          onPost={() => {
            setCreateChooserOpen(false);
            nav("create");
          }}
          onStory={() => {
            setCreateChooserOpen(false);
            setStoryComposerOpen(true);
          }}
          onReel={() => {
            setCreateChooserOpen(false);
            setReelComposerOpen(true);
          }}
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
            name: authorProfile?.name || post.authorName,
            username: authorProfile?.username || post.authorUsername,
            photoURL: authorProfile?.photoURL || post.authorPhotoURL,
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

          {comments.map((c) => {
            const commentAuthor = users.find((u) => u.id === c.userId);
            return (
            <div className="comment" key={c.id}>
              <Avatar
                profile={{
                  name: commentAuthor?.name || c.name,
                  username: commentAuthor?.username || c.username,
                  photoURL: commentAuthor?.photoURL || c.photoURL,
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
            );
          })}

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

      <ProfileReels uid={target.id} isOwner={false} />

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
   PROFILE REELS (grid + viewer)
   ========================================================= */

function ProfileReels({ uid, isOwner, onDelete }) {
  const [reels, setReels] = useState([]);
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    if (!uid) return undefined;

    // Single equality filter -> no composite index needed.
    const q = query(
      collection(db, "reels"),
      where("authorId", "==", uid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        // Newest first (a just-created reel has no server time yet).
        const time = (r) =>
          r.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER;

        list.sort((a, b) => time(b) - time(a));
        setReels(list);
      },
      (error) => {
        console.error("Profile reels:", error);
      }
    );

    return unsub;
  }, [uid]);

  const current = activeId
    ? reels.find((r) => r.id === activeId)
    : null;

  if (!reels.length) return null;

  return (
    <div className="profile-reels">

      <h2>
        🎬 {isOwner ? "Your Reels" : "Reels"}{" "}
        <span className="profile-reels-count">{reels.length}</span>
      </h2>

      <div className="profile-reels-grid">
        {reels.map((r) => (
          <button
            key={r.id}
            type="button"
            className="profile-reel-tile"
            onClick={() => setActiveId(r.id)}
            aria-label="Play reel"
          >
            {r.poster ? (
              <img src={r.poster} alt="" loading="lazy" />
            ) : (
              <video
                src={cldVideoURL(r.videoURL)}
                muted
                playsInline
                preload="metadata"
              />
            )}

            <span className="profile-reel-play">▶</span>
          </button>
        ))}
      </div>

      {current && (
        <div
          className="profile-reel-viewer"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveId(null);
          }}
        >
          <button
            type="button"
            className="profile-reel-close"
            onClick={() => setActiveId(null)}
            aria-label="Close reel"
          >
            ✕
          </button>

          <video
            src={cldVideoURL(current.videoURL)}
            poster={current.poster || undefined}
            controls
            autoPlay
            loop
            playsInline
          />

          {current.caption && (
            <p className="profile-reel-caption">{current.caption}</p>
          )}

          {isOwner && onDelete && (
            <button
              type="button"
              className="profile-reel-delete"
              onClick={() => onDelete(current)}
            >
              🗑 Delete reel
            </button>
          )}
        </div>
      )}

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
  onDeleteReel,
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


      <ProfileReels
        uid={user?.uid}
        isOwner
        onDelete={onDeleteReel}
      />


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
  myChats = [],
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

  // "primary" = people you're connected to (you follow them or they follow
  // you), "requests" = everyone else who's messaged you — same split as
  // Instagram's Primary / Requests inbox, so strangers don't clutter the
  // main list.
  const [inboxTab, setInboxTab] =
    useState("primary");

  const myUid = currentUser?.uid;

  const following = useMemo(
    () => new Set(profile?.following || []),
    [profile?.following]
  );

  const followers = useMemo(
    () => new Set(profile?.followers || []),
    [profile?.followers]
  );

  // Only people you actually have a chat thread with — not every member of
  // Cheyyar Hub — enriched with the thread's last message so the sidebar
  // can show a real inbox instead of a plain member directory.
  const conversations = useMemo(() => {

    const byPartner = new Map();

    myChats.forEach((chat) => {

      const partnerId =
        (chat.users || []).find((id) => id !== myUid);

      if (!partnerId) return;

      const partner =
        users.find((u) => u.id === partnerId);

      if (!partner) return;

      byPartner.set(partnerId, {
        ...partner,
        lastMessage: chat.lastMessage || "",
        lastSenderId: chat.lastSenderId || "",
        updatedAt: chat.updatedAt || null,
      });

    });

    return Array.from(byPartner.values());

  }, [myChats, users, myUid]);

  const primaryConversations = useMemo(
    () =>
      conversations.filter(
        (u) => following.has(u.id) || followers.has(u.id)
      ),
    [conversations, following, followers]
  );

  const requestConversations = useMemo(
    () =>
      conversations.filter(
        (u) => !following.has(u.id) && !followers.has(u.id)
      ),
    [conversations, following, followers]
  );

  const searching = chatSearch.trim().length > 0;

  // Searching looks across everyone in Cheyyar Hub, so you can still start
  // a brand-new conversation. Otherwise the list is just the active tab's
  // real conversations.
  const baseList = searching
    ? users
    : inboxTab === "requests"
      ? requestConversations
      : primaryConversations;

  const visibleUsers =
    baseList.filter((u) =>
      `${u.name || ""} ${
        u.username || ""
      }`
        .toLowerCase()
        .includes(
          chatSearch
            .toLowerCase()
        )
    );

  // selectedUser is the object captured when the chat was opened. Resolve
  // it again from the live users listener so the header and mini avatars
  // update immediately when that person's profile changes.
  const liveSelectedUser =
    selectedUser
      ? users.find((u) => u.id === selectedUser.id) || selectedUser
      : null;


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


      <div className={`chat-shell ${liveSelectedUser ? "chat-open" : ""}`}>

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

            {!searching && (

              <div className="chat-tabs">

                <button
                  type="button"
                  className={
                    inboxTab === "primary"
                      ? "chat-tab active"
                      : "chat-tab"
                  }
                  onClick={() => setInboxTab("primary")}
                >
                  Messages
                </button>

                <button
                  type="button"
                  className={
                    inboxTab === "requests"
                      ? "chat-tab active"
                      : "chat-tab"
                  }
                  onClick={() => setInboxTab("requests")}
                >
                  Requests
                  {requestConversations.length > 0 && (
                    <span className="chat-tab-badge">
                      {requestConversations.length}
                    </span>
                  )}
                </button>

              </div>

            )}

          </div>


          <div className="chat-users">

            {visibleUsers.map(
              (u) => (

                <button
                  className={
                    liveSelectedUser?.id ===
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

                    {u.lastMessage ? (
                      <span className="chat-user-preview">
                        {u.lastSenderId === myUid ? "You: " : ""}
                        {u.lastMessage}
                      </span>
                    ) : (
                      <UserHandle profile={u} />
                    )}

                  </div>

                  {u.updatedAt && (
                    <span className="chat-user-time">
                      {timeAgo(u.updatedAt)}
                    </span>
                  )}

                </button>

              )
            )}

            {!visibleUsers.length && searching && (
              <div className="chat-empty-list">
                No one matches “{chatSearch}”.
              </div>
            )}

            {!visibleUsers.length && !searching && inboxTab === "primary" && (
              <div className="chat-empty-list">
                No conversations yet. Search someone to say hi.
              </div>
            )}

            {!visibleUsers.length && !searching && inboxTab === "requests" && (
              <div className="chat-empty-list">
                No message requests right now.
              </div>
            )}

          </div>

        </div>


        {/* CHAT WINDOW */}

        <div className="chat-window">

          {!liveSelectedUser ? (

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
                  onClick={() => onViewProfile?.(liveSelectedUser)}
                >

                  <Avatar
                    profile={liveSelectedUser}
                    size="small"
                  />

                  <div className="chat-header-info">

                    <UserName profile={liveSelectedUser} />
                    <UserHandle profile={liveSelectedUser} />

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

  // Notification documents keep sender snapshots for history, but the UI
  // resolves the sender from the live users collection so profile changes
  // appear immediately in existing notifications.
  const liveUsers = users || [];

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
                  ...notification,
                  ...(liveUsers.find(
                    (u) => u.id === notification.senderId
                  ) || {}),
                  name:
                    liveUsers.find(
                      (u) => u.id === notification.senderId
                    )?.name ||
                    notification.senderName,

                  username:
                    liveUsers.find(
                      (u) => u.id === notification.senderId
                    )?.username ||
                    notification.senderUsername,

                  photoURL:
                    liveUsers.find(
                      (u) => u.id === notification.senderId
                    )?.photoURL ||
                    notification.senderPhotoURL ||
                    "",
                }}
                size="small"
              />


              <div className="notification-content">

                <UserName
                  profile={{
                    id: notification.senderId,
                    name:
                      liveUsers.find(
                        (u) => u.id === notification.senderId
                      )?.name ||
                      notification.senderName,

                    username:
                      liveUsers.find(
                        (u) => u.id === notification.senderId
                      )?.username ||
                      notification.senderUsername,

                    photoURL:
                      liveUsers.find(
                        (u) => u.id === notification.senderId
                      )?.photoURL ||
                      notification.senderPhotoURL ||
                      "",

                    verified:
                      liveUsers.find(
                        (u) => u.id === notification.senderId
                      )?.verified === true,
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


/* =========================================================
   STORIES BAR
   ========================================================= */

function StoriesBar({ profile, groups, onOpen, onAdd }) {

  const ownGroup = groups.find((g) => g.isOwn);

  const ownState = !ownGroup
    ? "none"
    : ownGroup.hasUnseen
      ? "unseen"
      : "seen";

  return (
    <div className="sr-stories" aria-label="Stories">

      <div className="sr-tile">

        <button
          type="button"
          className="sr-tile-btn"
          onClick={() =>
            ownGroup ? onOpen(groups.indexOf(ownGroup)) : onAdd()
          }
        >
          <span className={`sr-ring ${ownState}`}>
            <Avatar profile={profile} />
          </span>

          <span className="sr-tile-name">Your story</span>
        </button>

        <button
          type="button"
          className="sr-plus"
          onClick={onAdd}
          aria-label="Add to your story"
        >
          ＋
        </button>

      </div>

      {groups
        .filter((g) => !g.isOwn)
        .map((g) => (
          <button
            type="button"
            key={g.authorId}
            className="sr-tile sr-tile-btn"
            onClick={() => onOpen(groups.indexOf(g))}
          >
            <span className={`sr-ring ${g.hasUnseen ? "unseen" : "seen"}`}>
              <Avatar profile={g.author} />
            </span>

            <span className="sr-tile-name">
              {g.author.username || g.author.name}
            </span>
          </button>
        ))}

    </div>
  );
}


/* =========================================================
   STORY VIEWER
   ========================================================= */

function firstUnseenIndex(group, uid) {
  const i = (group?.stories || []).findIndex(
    (s) => !(s.viewedBy || []).includes(uid)
  );
  return i === -1 ? 0 : i;
}

function StoryViewer({
  groups,
  startIndex,
  user,
  users,
  liveStories,
  onClose,
  onView,
  onDelete,
}) {

  const [gi, setGi] = useState(startIndex);

  const [si, setSi] = useState(() =>
    firstUnseenIndex(groups[startIndex], user.uid)
  );

  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [readyId, setReadyId] = useState(null);
  const [muted, setMuted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [viewersOpen, setViewersOpen] = useState(false);

  const videoRef = useRef(null);
  const progressRef = useRef(0);
  const holdTimer = useRef(null);
  const holdActive = useRef(false);
  const pointer = useRef(null);
  const nextRef = useRef(() => {});

  useBodyLock();

  const group = groups[gi];
  const story = group?.stories[si];

  const isOwn = group?.isOwn;
  const isVideo = story?.mediaType === "video";

  // Ready is tracked per story id, so a cached photo that loads before
  // effects run can never leave the viewer stuck on the loading spinner.
  const ready = Boolean(story) && readyId === story.id;

  const liveStory =
    liveStories.find((s) => s.id === story?.id) || story;


  function goNext() {

    if (!group) return;

    if (si < group.stories.length - 1) {

      setSi(si + 1);

    } else if (gi < groups.length - 1) {

      setGi(gi + 1);
      setSi(firstUnseenIndex(groups[gi + 1], user.uid));

    } else {

      onClose();

    }
  }

  function goPrev() {

    if (si > 0) {

      setSi(si - 1);

    } else if (gi > 0) {

      setGi(gi - 1);
      setSi(0);

    } else {

      // First story of the first person: just restart it.
      progressRef.current = 0;
      setProgress(0);

      if (videoRef.current) videoRef.current.currentTime = 0;
    }
  }

  nextRef.current = goNext;


  // A new story became current.
  useEffect(() => {

    if (!story) return;

    progressRef.current = 0;
    setProgress(0);
    setViewersOpen(false);

    onView(story);

    // Warm up the next photo so it appears instantly.
    const upcoming = group.stories[si + 1];

    if (upcoming?.mediaType === "image") {
      const img = new Image();
      img.src = upcoming.mediaURL;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, si]);


  // Progress bar. Photos run on a timer, videos follow the video clock.
  useEffect(() => {

    if (!story || paused || viewersOpen || !ready) return;

    let raf;
    let last = performance.now();

    const tick = (now) => {

      const dt = now - last;
      last = now;

      let p;

      if (isVideo) {
        const v = videoRef.current;
        p = v && v.duration ? v.currentTime / v.duration : 0;
      } else {
        p = Math.min(1, progressRef.current + dt / STORY_IMAGE_MS);
      }

      if (Math.abs(p - progressRef.current) > 0.004 || p >= 1) {
        progressRef.current = p;
        setProgress(p);
      }

      if (!isVideo && p >= 1) {
        nextRef.current();
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, si, paused, viewersOpen, ready]);


  // Video play / pause / mute.
  useEffect(() => {

    const v = videoRef.current;

    if (!v || !ready) return;

    if (paused || viewersOpen) {
      v.pause();
      return;
    }

    v.muted = muted;

    const attempt = v.play();

    if (attempt?.catch) {
      attempt.catch(() => {
        // Autoplay with sound was blocked: fall back to muted playback.
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      });
    }

  }, [ready, paused, viewersOpen, muted, gi, si]);


  // Keyboard (desktop).
  useEffect(() => {

    const onKey = (e) => {
      if (e.key === "ArrowRight") nextRef.current();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, si]);


  useEffect(() => () => clearTimeout(holdTimer.current), []);

  useEffect(() => {
    if (!story) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story]);


  function onPointerDown(e) {

    if (e.target.closest("[data-sr-ui]")) return;

    e.currentTarget.setPointerCapture?.(e.pointerId);

    pointer.current = { x: e.clientX, y: e.clientY };
    holdActive.current = false;

    holdTimer.current = setTimeout(() => {
      holdActive.current = true;
      setPaused(true);
    }, 180);
  }

  function onPointerMove(e) {

    const start = pointer.current;

    if (!start) return;

    const dy = e.clientY - start.y;

    if (dy > 8) {
      clearTimeout(holdTimer.current);
      setPaused(true);
      setDragY(dy);
    }
  }

  function onPointerUp(e) {

    clearTimeout(holdTimer.current);

    const start = pointer.current;

    pointer.current = null;

    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    setDragY(0);

    if (dy > 110 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
      return;
    }

    const wasHold = holdActive.current;

    holdActive.current = false;

    setPaused(false);

    if (wasHold) return;

    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {

      const rect = e.currentTarget.getBoundingClientRect();

      if (e.clientX - rect.left < rect.width * 0.33) {
        goPrev();
      } else {
        goNext();
      }
    }
  }

  function onPointerCancel() {

    clearTimeout(holdTimer.current);

    pointer.current = null;
    holdActive.current = false;

    setDragY(0);
    setPaused(false);
  }

  async function removeStory() {

    if (!window.confirm("Delete this story?")) return;

    await onDelete(story);

    onClose();
  }


  if (!story) return null;

  const viewers = (liveStory.viewedBy || [])
    .filter((id) => id !== user.uid)
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean);

  const viewCount = (liveStory.viewedBy || []).filter(
    (id) => id !== user.uid
  ).length;

  const dragScale = 1 - Math.min(dragY, 300) / 1500;

  return (
    <div
      className="sr-overlay sr-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Story viewer"
    >

      <div
        className="sr-frame"
        style={
          dragY
            ? {
                transform: `translateY(${dragY}px) scale(${dragScale})`,
                opacity: 1 - Math.min(dragY, 300) / 600,
                transition: "none",
              }
            : undefined
        }
      >

        <div
          className="sr-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >

          {isVideo ? (
            <video
              key={story.id}
              ref={videoRef}
              className="sr-media"
              src={cldVideoURL(story.mediaURL)}
              poster={story.poster || undefined}
              playsInline
              preload="auto"
              onLoadedData={() => setReadyId(story.id)}
              onEnded={() => nextRef.current()}
              onError={() => nextRef.current()}
            />
          ) : (
            <img
              key={story.id}
              className="sr-media"
              src={story.mediaURL}
              alt=""
              draggable={false}
              onLoad={() => setReadyId(story.id)}
              onError={() => nextRef.current()}
            />
          )}

          <div className="sr-scrim" />

          <div className="sr-bars">
            {group.stories.map((s, i) => (
              <span className="sr-bar" key={s.id}>
                <i
                  style={{
                    transform: `scaleX(${
                      i < si ? 1 : i === si ? progress : 0
                    })`,
                  }}
                />
              </span>
            ))}
          </div>

          <div className="sr-head" data-sr-ui>

            <Avatar profile={group.author} size="small" />

            <div className="sr-head-text">
              <UserName profile={group.author} />
              <span>{timeAgo(story.createdAt)}</span>
            </div>

            {isVideo && (
              <button
                type="button"
                className="sr-icon-btn"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? "🔇" : "🔊"}
              </button>
            )}

            <button
              type="button"
              className="sr-icon-btn"
              onClick={onClose}
              aria-label="Close stories"
            >
              ✕
            </button>

          </div>

          {story.caption && (
            <div className="sr-caption">{story.caption}</div>
          )}

          {isOwn && (
            <div className="sr-foot" data-sr-ui>

              <button
                type="button"
                className="sr-foot-btn"
                onClick={() => setViewersOpen(true)}
              >
                👁 {viewCount} {viewCount === 1 ? "view" : "views"}
              </button>

              <button
                type="button"
                className="sr-foot-btn danger"
                onClick={removeStory}
                aria-label="Delete story"
              >
                🗑️ Delete
              </button>

            </div>
          )}

          {!ready && (
            <div className="sr-loading">
              <span className="auth-spinner" aria-hidden="true" />
            </div>
          )}

          {viewersOpen && (
            <div className="sr-viewers" data-sr-ui>

              <div className="sr-viewers-head">
                <strong>Viewed by {viewCount}</strong>

                <button
                  type="button"
                  className="sr-icon-btn"
                  onClick={() => setViewersOpen(false)}
                  aria-label="Close viewers"
                >
                  ✕
                </button>
              </div>

              <div className="sr-viewers-list">
                {viewers.map((v) => (
                  <div className="sr-viewer-row" key={v.id}>
                    <Avatar profile={v} size="small" />

                    <div>
                      <UserName profile={v} />
                      <UserHandle profile={v} />
                    </div>
                  </div>
                ))}

                {!viewers.length && (
                  <div className="sr-empty">
                    No views yet. Check back soon.
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        <button
          type="button"
          className="sr-arrow left"
          onClick={goPrev}
          aria-label="Previous story"
        >
          ‹
        </button>

        <button
          type="button"
          className="sr-arrow right"
          onClick={goNext}
          aria-label="Next story"
        >
          ›
        </button>

      </div>

    </div>
  );
}


/* =========================================================
   MEDIA COMPOSER (story + reel)
   ========================================================= */

function MediaComposer({ mode, onClose, onSubmit }) {

  const isReel = mode === "reel";

  const [file, setFile] = useState(null);
  const [kind, setKind] = useState("");
  const [meta, setMeta] = useState(null);
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const inputRef = useRef(null);

  useBodyLock();

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const maxSeconds = isReel ? MAX_REEL_SEC : MAX_STORY_VIDEO_SEC;

  async function pickFile(e) {

    const picked = e.target.files?.[0];

    e.target.value = "";

    if (!picked) return;

    setError("");

    const isVideo = picked.type.startsWith("video/");
    const isImage = picked.type.startsWith("image/");

    if (isReel && !isVideo) {
      setError("Reels must be a video.");
      return;
    }

    if (!isVideo && !isImage) {
      setError("Choose a photo or a video.");
      return;
    }

    if (isVideo && picked.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`That video is too big. Keep it under ${MAX_VIDEO_MB} MB.`);
      return;
    }

    let info = null;

    if (isVideo) {

      info = await readVideoMeta(picked);

      if (info && info.duration > maxSeconds + 0.5) {
        setError(
          `That video is ${Math.round(info.duration)}s. The limit is ${maxSeconds}s.`
        );
        return;
      }
    }

    setFile(picked);
    setKind(isVideo ? "video" : "image");
    setMeta(info);
    setPreview(URL.createObjectURL(picked));
  }

  async function submit() {

    if (!file || busy) return;

    setBusy(true);
    setError("");
    setProgress(0);

    try {

      await onSubmit(
        { file, kind, meta, caption: caption.trim() },
        setProgress
      );

      onClose();

    } catch (err) {

      console.error(err);

      setError(err.message || "Upload failed. Try again.");
      setBusy(false);

    }
  }

  const pct = Math.round(progress * 100);

  return (
    <div className="sr-overlay sr-composer" role="dialog" aria-modal="true">

      <div className="sr-sheet">

        <div className="sr-sheet-head">

          <button
            type="button"
            className="sr-icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ✕
          </button>

          <strong>{isReel ? "New reel" : "New story"}</strong>

          <button
            type="button"
            className="sr-share-btn"
            onClick={submit}
            disabled={!file || busy}
          >
            {busy ? (pct > 0 && pct < 100 ? `${pct}%` : "Sharing…") : "Share"}
          </button>

        </div>

        <div className="sr-preview">

          {!file ? (
            <button
              type="button"
              className="sr-pick"
              onClick={() => inputRef.current?.click()}
            >
              <span>{isReel ? "🎬" : "📸"}</span>
              <b>{isReel ? "Choose a video" : "Choose a photo or video"}</b>
              <small>
                {isReel
                  ? `Up to ${MAX_REEL_SEC} seconds. Vertical videos look best.`
                  : `Disappears after 24 hours. Videos up to ${MAX_STORY_VIDEO_SEC} seconds.`}
              </small>
            </button>
          ) : kind === "video" ? (
            <video
              src={preview}
              className="sr-media"
              autoPlay
              muted
              loop
              playsInline
              controls={false}
            />
          ) : (
            <img src={preview} className="sr-media" alt="Story preview" />
          )}

          {file && !isReel && caption && (
            <div className="sr-caption">{caption}</div>
          )}

          {busy && (
            <div className="sr-upload">
              <div className="sr-upload-bar">
                <i style={{ width: `${Math.max(pct, 6)}%` }} />
              </div>
              <span>Please keep this screen open</span>
            </div>
          )}

        </div>

        <div className="sr-fields">

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={isReel ? 200 : 120}
            rows={2}
            placeholder={isReel ? "Write a caption…" : "Add a caption…"}
            disabled={busy}
          />

          {file && !busy && (
            <button
              type="button"
              className="sr-link"
              onClick={() => inputRef.current?.click()}
            >
              Choose a different {isReel ? "video" : "file"}
            </button>
          )}

          {error && <div className="error">{error}</div>}

        </div>

        <input
          ref={inputRef}
          type="file"
          hidden
          accept={isReel ? "video/*" : "image/*,video/*"}
          onChange={pickFile}
        />

      </div>

    </div>
  );
}


/* =========================================================
   CREATE CHOOSER (mobile + button)
   ========================================================= */

function CreateChooser({ onClose, onPost, onStory, onReel }) {

  return (
    <div className="sr-overlay sr-chooser" onClick={onClose}>

      <div
        className="sr-chooser-sheet"
        role="dialog"
        aria-label="Create"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="sr-grabber" />

        <button type="button" onClick={onPost}>
          <span>📝</span>
          <div>
            <b>Post</b>
            <small>Share text or a photo with the feed</small>
          </div>
        </button>

        <button type="button" onClick={onStory}>
          <span>⭕</span>
          <div>
            <b>Story</b>
            <small>A photo or video that disappears in 24 hours</small>
          </div>
        </button>

        <button type="button" onClick={onReel}>
          <span>🎬</span>
          <div>
            <b>Reel</b>
            <small>A short video up to {MAX_REEL_SEC} seconds</small>
          </div>
        </button>

      </div>

    </div>
  );
}


/* =========================================================
   REELS
   ========================================================= */

function ReelsPage({
  user,
  profile,
  users,
  onLike,
  onOpenComments,
  onFollow,
  onShare,
  onDelete,
  onCompose,
  onViewProfile,
}) {

  const [reels, setReels] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);

  const scrollerRef = useRef(null);

  // Only listen while the Reels tab is open, to save Firestore reads.
  useEffect(() => {

    const q = query(
      collection(db, "reels"),
      orderBy("createdAt", "desc"),
      limit(40)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setReels(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
        setLoaded(true);
      },
      (error) => {
        console.error("Reels listener:", error);
        setLoaded(true);
      }
    );

    return unsub;

  }, []);


  // Whichever reel fills the screen becomes the active one.
  useEffect(() => {

    const root = scrollerRef.current;

    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActive(Number(entry.target.dataset.index));
          }
        });
      },
      { root, threshold: [0.6] }
    );

    root
      .querySelectorAll("[data-index]")
      .forEach((el) => observer.observe(el));

    return () => observer.disconnect();

  }, [reels.length]);


  // Arrow keys on desktop.
  useEffect(() => {

    const onKey = (e) => {

      const root = scrollerRef.current;

      if (!root) return;

      const tag = document.activeElement?.tagName;

      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        root.scrollBy({
          top: e.key === "ArrowDown" ? root.clientHeight : -root.clientHeight,
          behavior: "smooth",
        });
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

  }, []);


  return (
    <div className="reels-page">

      <button
        type="button"
        className="rl-compose"
        onClick={onCompose}
        aria-label="Create a reel"
      >
        ＋
      </button>

      {!loaded && (
        <div className="rl-state">
          <span className="auth-spinner" aria-hidden="true" />
        </div>
      )}

      {loaded && !reels.length && (
        <div className="rl-state">
          <Empty
            icon="🎬"
            title="No reels yet"
            text="Be the first to share a short video from Cheyyar."
          />

          <button
            type="button"
            className="primary"
            onClick={onCompose}
          >
            Create a reel
          </button>
        </div>
      )}

      <div className="rl-scroller" ref={scrollerRef}>

        {reels.map((reel, index) => (
          <ReelCard
            key={reel.id}
            reel={reel}
            index={index}
            active={index === active}
            near={Math.abs(index - active) <= 1}
            muted={muted}
            setMuted={setMuted}
            user={user}
            profile={profile}
            users={users}
            onLike={onLike}
            onOpenComments={onOpenComments}
            onFollow={onFollow}
            onShare={onShare}
            onDelete={onDelete}
            onViewProfile={onViewProfile}
          />
        ))}

      </div>

    </div>
  );
}


function ReelCard({
  reel,
  index,
  active,
  near,
  muted,
  setMuted,
  user,
  profile,
  users,
  onLike,
  onOpenComments,
  onFollow,
  onShare,
  onDelete,
  onViewProfile,
}) {

  const videoRef = useRef(null);
  const barRef = useRef(null);
  const lastTap = useRef(0);
  const tapTimer = useRef(null);

  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [failed, setFailed] = useState(false);
  const [burst, setBurst] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const liked = (reel.likedBy || []).includes(user.uid);
  const isOwner = reel.authorId === user.uid;
  const following = (profile.following || []).includes(reel.authorId);
  const author = users.find((u) => u.id === reel.authorId);

  const authorView = {
    id: reel.authorId,
    name: author?.name || reel.authorName,
    username: author?.username || reel.authorUsername,
    photoURL: author?.photoURL || reel.authorPhotoURL || "",
    verified: author?.verified === true,
  };


  // Play only the reel on screen.
  useEffect(() => {

    const v = videoRef.current;

    if (!v) return;

    if (active && !paused) {

      v.muted = muted;

      const attempt = v.play();

      if (attempt?.catch) {
        attempt.catch(() => {
          // Sound was blocked by the browser: play muted instead.
          if (!v.muted) {
            v.muted = true;
            setMuted(true);
            v.play().catch(() => {});
          }
        });
      }

    } else {

      v.pause();

    }

  }, [active, paused, muted, near, failed]);


  // Restart when you scroll away.
  useEffect(() => {

    if (active) return;

    setPaused(false);
    setMenuOpen(false);

    const v = videoRef.current;

    if (v) v.currentTime = 0;

  }, [active]);


  useEffect(() => {

    if (!burst) return;

    const timer = setTimeout(() => setBurst(0), 800);

    return () => clearTimeout(timer);

  }, [burst]);


  useEffect(() => () => clearTimeout(tapTimer.current), []);


  function onSurfaceClick() {

    if (menuOpen) {
      setMenuOpen(false);
      return;
    }

    const now = Date.now();

    if (now - lastTap.current < 300) {

      // Double tap = like.
      clearTimeout(tapTimer.current);
      lastTap.current = 0;

      if (!liked) onLike(reel);

      setBurst(now);

    } else {

      lastTap.current = now;

      tapTimer.current = setTimeout(
        () => setPaused((p) => !p),
        260
      );

    }
  }

  function onTimeUpdate() {

    const v = videoRef.current;

    if (v?.duration && barRef.current) {
      barRef.current.style.width =
        `${(v.currentTime / v.duration) * 100}%`;
    }
  }

  function retry() {
    setFailed(false);
    setBuffering(true);
  }


  return (
    <article
      className="rl-card"
      data-index={index}
    >

      {near && !failed ? (
        <video
          ref={videoRef}
          className={`rl-video ${reel.landscape ? "contain" : ""}`}
          src={cldVideoURL(reel.videoURL)}
          poster={reel.poster || undefined}
          loop
          playsInline
          muted
          preload={active ? "auto" : "metadata"}
          onTimeUpdate={onTimeUpdate}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onError={() => setFailed(true)}
        />
      ) : (
        reel.poster && (
          <img className="rl-video" src={reel.poster} alt="" />
        )
      )}

      <div className="rl-scrim" />

      <div
        className="rl-surface"
        onClick={onSurfaceClick}
        role="button"
        tabIndex={0}
        aria-label={paused ? "Play reel" : "Pause reel"}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            setPaused((p) => !p);
          }
        }}
      />

      {paused && active && <div className="rl-paused">▶</div>}

      {buffering && active && !failed && !paused && (
        <div className="rl-buffer">
          <span className="auth-spinner" aria-hidden="true" />
        </div>
      )}

      {failed && (
        <div className="rl-failed">
          <p>Couldn't play this reel.</p>
          <button type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {burst ? (
        <span key={burst} className="rl-burst" aria-hidden="true">
          ❤️
        </span>
      ) : null}

      <button
        type="button"
        className="rl-mute"
        onClick={() => setMuted(!muted)}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      <div className="rl-rail">

        <button
          type="button"
          className={`rl-act ${liked ? "liked" : ""}`}
          onClick={() => onLike(reel)}
          aria-label={liked ? "Unlike" : "Like"}
          aria-pressed={liked}
        >
          <span>{liked ? "❤️" : "🤍"}</span>
          <b>{formatCount(reel.likes || 0)}</b>
        </button>

        <button
          type="button"
          className="rl-act"
          onClick={() => onOpenComments(reel)}
          aria-label="Open comments"
        >
          <span>💬</span>
          <b>{formatCount(reel.commentCount || 0)}</b>
        </button>

        <button
          type="button"
          className="rl-act"
          onClick={() => onShare(reel)}
          aria-label="Share reel"
        >
          <span>↗️</span>
          <b>Share</b>
        </button>

        {isOwner && (
          <div className="rl-menu-wrap">

            <button
              type="button"
              className="rl-act"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Reel options"
              aria-expanded={menuOpen}
            >
              <span>⋯</span>
            </button>

            {menuOpen && (
              <div className="rl-menu">
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(reel);
                  }}
                >
                  🗑️ Delete reel
                </button>
              </div>
            )}

          </div>
        )}

      </div>

      <div className="rl-info">

        <div className="rl-author">

          <button
            type="button"
            className="rl-author-btn"
            onClick={() => author && onViewProfile(author)}
          >
            <Avatar profile={authorView} size="small" />
            <UserName profile={authorView} />
          </button>

          {!isOwner && !following && (
            <button
              type="button"
              className="rl-follow"
              onClick={() =>
                onFollow(author || { id: reel.authorId, username: reel.authorUsername })
              }
            >
              Follow
            </button>
          )}

        </div>

        {reel.caption && (
          <p
            className={`rl-caption ${expanded ? "open" : ""}`}
            onClick={() => setExpanded((v) => !v)}
          >
            {reel.caption}
          </p>
        )}

      </div>

      <div className="rl-progress" aria-hidden="true">
        <i ref={barRef} />
      </div>

    </article>
  );
}


function ReelCommentsSheet({ reel, user, profile, users, onClose, onSubmit }) {

  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useBodyLock();

  useEffect(() => {

    const q = query(
      collection(db, "reels", reel.id, "comments"),
      orderBy("createdAt", "asc"),
      limit(100)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setComments(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      },
      (error) => {
        console.error("Reel comments:", error);
      }
    );

    return unsub;

  }, [reel.id]);

  async function send() {

    const value = text.trim();

    if (!value || sending) return;

    setSending(true);

    try {
      await onSubmit(reel, value);
      setText("");
    } catch {
      // onSubmit already showed the error toast
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sr-overlay sr-comments" onClick={onClose}>

      <div
        className="sr-comments-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Comments"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="sr-grabber" />

        <div className="sr-comments-head">
          <strong>Comments</strong>

          <button
            type="button"
            className="sr-icon-btn"
            onClick={onClose}
            aria-label="Close comments"
          >
            ✕
          </button>
        </div>

        <div className="sr-comments-list">

          {comments.map((c) => {

            const commenter = users.find((u) => u.id === c.userId);

            const view = {
              id: c.userId,
              name: commenter?.name || c.name,
              username: commenter?.username || c.username,
              photoURL: commenter?.photoURL || c.photoURL || "",
              verified: commenter?.verified === true,
            };

            return (
              <div className="sr-comment" key={c.id}>

                <Avatar profile={view} size="small" />

                <div>
                  <div className="sr-comment-meta">
                    <UserName profile={view} />
                    <span>{timeAgo(c.createdAt)}</span>
                  </div>

                  <p>{c.text}</p>
                </div>

              </div>
            );
          })}

          {!comments.length && (
            <div className="sr-empty">
              No comments yet. Start the conversation.
            </div>
          )}

        </div>

        <div className="sr-comment-compose">

          <Avatar profile={profile} size="small" />

          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Add a comment…"
            maxLength={300}
          />

          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || sending}
          >
            Post
          </button>

        </div>

      </div>

    </div>
  );
}


export default App;
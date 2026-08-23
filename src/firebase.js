import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB7RKnVdMze1LzPTkmu81U6xsL0RPSmNTk",
  authDomain: "cheyyar-hub.firebaseapp.com",
  projectId: "cheyyar-hub",
  messagingSenderId: "788287014995",
  appId: "1:788287014995:web:d0a3c03d2c5f87a5781ea6",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
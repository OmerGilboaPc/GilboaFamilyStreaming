import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCPDS6U9LokVN-f4uQj9rdaWuCnut72bts",
  authDomain: "netflixfamilystreaming-b0ca4.firebaseapp.com",
  databaseURL: "https://netflixfamilystreaming-b0ca4-default-rtdb.firebaseio.com/",
  projectId: "netflixfamilystreaming-b0ca4",
  storageBucket: "netflixfamilystreaming-b0ca4.firebasestorage.app",
  messagingSenderId: "116100612969",
  appId: "1:116100612969:web:29387c89e455e36d8373f8"
};

export const ADMIN_EMAIL = "omergilboapc@gmail.com";
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

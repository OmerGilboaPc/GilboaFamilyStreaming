// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCPDS6U9LokVN-f4uQj9rdaWuCnut72bts",
  authDomain: "netflixfamilystreaming-b0ca4.firebaseapp.com",
  databaseURL: "https://netflixfamilystreaming-b0ca4-default-rtdb.firebaseio.com",
  projectId: "netflixfamilystreaming-b0ca4",
  storageBucket: "netflixfamilystreaming-b0ca4.firebasestorage.app",
  messagingSenderId: "116100612969",
  appId: "1:116100612969:web:29387c89e455e36d8373f8"
};


// אתחול האפליקציה
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const ADMIN_EMAIL = "omergilboapc@gmail.com";

// Firebase is disabled for now - using demo mode
export const auth = null;
export const provider = null;
export const signInWithPopup = async () => { alert("Firebase not configured"); };
export const signOut = async () => {};
export const onAuthStateChanged = (_callback: any) => () => {};
export type User = any;

// Two known, well-documented gaps between Metro's runtime module resolution
// and plain `tsc`'s — both work fine when actually running the app, but
// `tsc --noEmit` needs a hand-written declaration for each. The `export {}`
// below makes this a module (not a global script) so the augmentation below
// MERGES with firebase/auth's real types instead of replacing them.
export {};

// 1. NativeWind's own ambient types (nativewind-env.d.ts) don't declare a
//    fallback for importing a raw ".css" file (only Tailwind class names).
declare module "*.css";

// 2. `getReactNativePersistence` lives in firebase/auth's React Native build,
//    which Metro resolves via the (legacy, non-"exports") "react-native"
//    package.json field — a resolution mechanism `tsc` doesn't follow, so it
//    only sees the browser build's types. The function exists at runtime;
//    this just tells `tsc` about it too.
declare module "firebase/auth" {
  import type { Persistence } from "firebase/auth";
  export function getReactNativePersistence(storage: unknown): Persistence;
}

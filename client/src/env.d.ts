/** CSS imports are handled by the bundler (esbuild). */
declare module '*.css';

/** true only in the browser-only demo build (scripts/build-demo.mjs). */
declare const __DEMO__: boolean;

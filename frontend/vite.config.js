/*
  npm i react@18 react-dom@18 react-router-dom@6 socket.io-client maplibre-gl framer-motion lucide-react sonner && npm i -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite vite-plugin-pwa
*/
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

import { fileURLToPath, URL } from "node:url";

const OPENFREEMAP = /^https:\/\/tiles\.openfreemap\.org\/.*/i;

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["logo.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"],
      manifest: {
        name: "NeverQ",
        short_name: "NeverQ",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#0077b6",
        background_color: "#f4fbff",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/socket\.io/, /^\/api/],
        runtimeCaching: [
          // Socket.IO is never cached.
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/socket.io"),
            handler: "NetworkOnly",
          },
          // OpenFreeMap vector tiles, fonts, sprites, style JSON.
          {
            urlPattern: OPENFREEMAP,
            handler: "CacheFirst",
            options: {
              cacheName: "nq-openfreemap",
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 14, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api"),
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "nq-api",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "nq-google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { host: true },
  build: { chunkSizeWarningLimit: 1200 },
});

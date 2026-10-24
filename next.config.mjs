/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep native/legacy-CJS addons out of the Next bundle. The pure-JS Turso web
  // client has no native addon; sql.js is a WASM CJS package whose internal
  // 'exports' shim breaks if bundled. Loading both from node_modules avoids
  // SIGBUS crashes on some build hosts and the "setting exports" error.
  serverExternalPackages: ["@libsql/client", "sql.js"],
};

export default nextConfig;

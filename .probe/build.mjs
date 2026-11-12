import esbuild from "esbuild";
import path from "node:path";
await esbuild.build({
  entryPoints: [".probe/graph.jsx"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: ".probe/graph.cjs",
  jsx: "automatic",
  external: ["recharts", "react", "react-dom", "@tanstack/react-query"],
  alias: { "@": path.resolve("src") },
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.env.VITE_BASE44_APP_ID": '"x"',
    "import.meta.env.VITE_BASE44_FUNCTIONS_VERSION": '"1"',
    "import.meta.env.VITE_BASE44_APP_BASE_URL": '"http://localhost"',
  },
  plugins: [
    {
      name: "stub-sdk",
      setup(b) {
        b.onResolve({ filter: /base44Client$/ }, () => ({ path: path.resolve(".probe/stub.js") }));
      },
    },
  ],
});
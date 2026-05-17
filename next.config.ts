import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          // COEP disabled until we enable pthreads/SharedArrayBuffer
          // {
          //   key: "Cross-Origin-Embedder-Policy",
          //   value: "require-corp",
          // },
        ],
      },
    ];
  },
};

export default nextConfig;

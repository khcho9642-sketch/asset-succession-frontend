/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/diagnosis": ["./CHAT_GUIDE.md"]
  },
  async redirects() {
    return [{
      source: "/downloads/asset-succession-forms-v1/index.html",
      destination: "/forms",
      permanent: false
    }];
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          { key: "X-Robots-Tag", value: "index, follow" }
        ]
      },
      {
        source: "/og/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "index, follow" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      }
    ];
  }
};

export default nextConfig;

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
  }
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/diagnosis": ["./CHAT_GUIDE.md"]
  }
};

export default nextConfig;

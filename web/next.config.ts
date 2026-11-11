import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @curtainly/shared ships TypeScript source; let Next compile it.
  transpilePackages: ['@curtainly/shared'],
};

export default nextConfig;

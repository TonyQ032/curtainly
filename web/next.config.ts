import { existsSync } from 'node:fs';
import type { NextConfig } from 'next';

// Local dev reads the single repo-root .env (Vercel sets env vars itself).
const rootEnv = new URL('../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // @curtainly/shared ships TypeScript source; let Next compile it.
  transpilePackages: ['@curtainly/shared'],
};

export default nextConfig;

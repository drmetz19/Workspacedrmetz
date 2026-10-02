import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // postgres.js & bcryptjs only run on the server
  serverExternalPackages: ['postgres', 'bcryptjs'],
}

export default nextConfig

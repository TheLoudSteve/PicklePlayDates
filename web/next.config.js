const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://9vduzksk81.execute-api.us-west-2.amazonaws.com/dev/',
    NEXT_PUBLIC_USER_POOL_ID: process.env.NEXT_PUBLIC_USER_POOL_ID || 'us-west-2_nxJAslgC2',
    NEXT_PUBLIC_USER_POOL_CLIENT_ID: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID || 'it72qbeabqlqmqkr3c06mhshi',
    NEXT_PUBLIC_USER_POOL_DOMAIN: process.env.NEXT_PUBLIC_USER_POOL_DOMAIN || 'pickle-play-dates-dev-916259710192.auth.us-west-2.amazoncognito.com',
  },
};

module.exports = withPWA(nextConfig); 
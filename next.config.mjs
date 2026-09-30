/** @type {import('next').NextConfig} */
const nextConfig = {
  // Note: upload size limits for the /api/upload Route Handler are
  // enforced in app/api/upload/route.js itself (MAX_UPLOAD_BYTES), not
  // here -- Next's `experimental.serverActions.bodySizeLimit` only
  // applies to Server Actions, which this app doesn't use for uploads.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com'
      }
    ]
  }
};

export default nextConfig;

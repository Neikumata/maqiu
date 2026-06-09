/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // 明确指定根目录，避免检测到父目录的 package.json 造成混淆
    root: __dirname,
  },
};

export default nextConfig;

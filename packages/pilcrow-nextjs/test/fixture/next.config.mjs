import createMDX from '@next/mdx';
import pilcrowNext from '../../dist/index.js';

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [[pilcrowNext, {}]],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  output: 'export',
};

export default withMDX(nextConfig);

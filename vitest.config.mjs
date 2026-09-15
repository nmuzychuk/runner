import { defineConfig } from 'vitest/config';

// Unit tests target the framework-free `js/core` layer (pure logic, no three.js),
// so they run fast in plain Node. three.js resolution (via the root node_modules
// symlink -> .toolchain/node_modules) is available if any test needs it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    watch: false,
  },
});

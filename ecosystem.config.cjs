/**
 * PM2 keeps the Vite dev server running across crashes and terminal closes while your machine is on.
 * Port 5175 comes from `vite.config.ts` (server.port); this file does not duplicate it.
 *
 * For persistence across macOS reboots, run once after you are happy with this process list:
 * `pm2 save` then `pm2 startup` and execute the command it prints (user-level launchd hook).
 * Docs: https://pm2.keymetrics.io/docs/usage/startup/
 */

const path = require('node:path')

module.exports = {
  apps: [
    {
      name: 'ui-dashboard-x-vite',
      cwd: __dirname,
      // Relative path so PM2 does not split an absolute path on spaces in __dirname.
      script: path.join('node_modules', 'vite', 'bin', 'vite.js'),
      interpreter: 'node',
      autorestart: true,
      max_restarts: 15,
      min_uptime: '5s',
      restart_delay: 4000,
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
}

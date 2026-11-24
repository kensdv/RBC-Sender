module.exports = {
  apps: [
    {
      name: 'rbc-api',
      script: 'server/index.js',
      watch: ['server'],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'data', '*.log'],
      max_restarts: 10,
      restart_delay: 2000,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'rbc-web',
      script: 'npm',
      args: 'run build:watch',
      watch: false,
    },
  ],
};

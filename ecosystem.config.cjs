const fs = require("fs");

function readEnv(path) {
  const out = {};
  try {
    for (const line of fs.readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      let v = t.slice(i + 1);
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[t.slice(0, i)] = v;
    }
  } catch {
    // .env is created on the host; missing file is a start error via DATABASE_URL.
  }
  return out;
}

const fileEnv = readEnv("/opt/zenze-fun/.env");

module.exports = {
  apps: [
    {
      name: "zenze-web",
      cwd: "/opt/zenze-fun",
      script: ".output/server/index.mjs",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOST: "127.0.0.1",
        NITRO_PORT: "3000",
        NITRO_HOST: "127.0.0.1",
        NITRO_PRESET: "node-server",
        ...fileEnv,
      },
      error_file: "/var/log/zenze/web-error.log",
      out_file: "/var/log/zenze/web-out.log",
      time: true,
      autorestart: true,
      max_memory_restart: "800M",
      max_restarts: 20,
      min_uptime: "10s",
    },
  ],
};

// Entry point for cPanel's "Setup Node.js App" (Phusion Passenger), which
// cannot run `next start` and hands the app its port through PORT.
/* eslint-disable @typescript-eslint/no-require-imports */

// The host caps processes and threads per account, and libraries size their thread pools by the
// server's CPUs (88 here), not by that cap. Past it, new processes fail and the site answers 503.
// These must be set before anything that starts a pool is loaded. V8's own pool can only be set
// when node starts: NODE_OPTIONS=--v8-pool-size=2 in Setup Node.js App (deploy/README.md).
process.env.VIPS_CONCURRENCY ??= "1"; // photo resizing
process.env.UV_THREADPOOL_SIZE ??= "2";

const { createServer } = require("http");
const next = require("next");

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(process.env.PORT || 3100);
});

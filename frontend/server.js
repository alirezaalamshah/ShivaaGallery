// Entry point for cPanel's "Setup Node.js App" (Phusion Passenger), which
// cannot run `next start` and hands the app its port through PORT.
/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("http");
const next = require("next");

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(process.env.PORT || 3100);
});

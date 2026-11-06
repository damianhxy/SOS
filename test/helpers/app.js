// Starts the real app (app.js) in a throwaway copy of the repo, so tests never touch ./database
// or ./data in the working tree. node_modules and public/ are symlinked.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const repoRoot = path.resolve(__dirname, "..", "..");
const skip = new Set([".git", "node_modules", "public", "test", "database", "data"]);

exports.PASSWORD = "test-password-123";
exports.SECRET = "s".repeat(48);

function freePort() {
  return new Promise(function (resolve, reject) {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", function () {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sos-test-"));
  for (const entry of fs.readdirSync(repoRoot)) {
    if (skip.has(entry) || entry.startsWith(".env")) continue;
    fs.cpSync(path.join(repoRoot, entry), path.join(dir, entry), { recursive: true });
  }
  fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(dir, "node_modules"), "dir");
  fs.symlinkSync(path.join(repoRoot, "public"), path.join(dir, "public"), "dir");
  return dir;
}

// app.js logs "Listening on port" from the listen callback, but waiting for the port itself
// needs no log parsing. A TCP connect, not an HTTP request, so readiness never touches the app.
async function waitForPort(port, child, output) {
  const deadline = Date.now() + 15000;
  for (;;) {
    if (child.exitCode !== null)
      throw Error("App exited with code " + child.exitCode + ":\n" + output());
    const open = await new Promise(function (resolve) {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => resolve(socket.end() && true));
      socket.once("error", () => resolve(false));
    });
    if (open) return;
    if (Date.now() > deadline) throw Error("App did not start:\n" + output());
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function launch(dir, env) {
  // cwd must be the (copied) repo root: express.static("public") and the views directory are
  // resolved against the working directory.
  return spawn(process.execPath, ["app.js"], {
    cwd: dir,
    env: {
      PATH: process.env.PATH,
      SESSION_SECRET: exports.SECRET,
      DB_PATH: path.join(dir, "database", "test.db"),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function run(dir, port, env) {
  const child = launch(dir, { PORT: String(port), ...env });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  try {
    await waitForPort(port, child, () => output);
  } catch (err) {
    child.kill();
    throw err;
  }
  return { child, output: () => output };
}

function kill(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise(function (resolve) {
    child.once("exit", resolve);
    child.kill();
  });
}

// Resolves once the server accepts connections. `env` adds or overrides variables.
// `app.db` is a connection to the app's SQLite file (WAL mode, so both sides can use it).
exports.start = async function (env = {}) {
  const dir = makeSandbox();
  const port = await freePort();
  let proc = await run(dir, port, env);
  const db = new Database(path.join(dir, "database", "test.db"));
  return {
    dir,
    db,
    baseUrl: "http://127.0.0.1:" + port,
    output: () => proc.output(),
    // Files in the upload directory (plaintext uploads and the .dat ciphertexts).
    uploads: () => fs.readdirSync(path.join(dir, "data", "uploads")).sort(),
    // Stops the app and starts it again on the same port, database and upload directory.
    restart: async function () {
      await kill(proc.child);
      proc = await run(dir, port, env);
    },
    stop: async function () {
      db.close();
      await kill(proc.child);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
};

// Runs the app until it exits or `ms` passes; resolves to { code, output } (code null if it
// was still running).
exports.boot = async function (env, ms = 3000) {
  const dir = makeSandbox();
  const child = launch(dir, { PORT: String(await freePort()), ...env });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const code = await new Promise(function (resolve) {
    const timer = setTimeout(() => resolve(null), ms);
    child.once("exit", (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  await kill(child);
  fs.rmSync(dir, { recursive: true, force: true });
  return { code, output };
};

function decode(s) {
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&#x3D;/g, "=")
    .replace(/&#x60;/g, "`")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// What a rendered page shows: the flash messages, the signed-in user (the nav links to
// /users with the username; absent when signed out) and the files it links to.
exports.page = function (text) {
  const alert = (type) => {
    const m = text.match(new RegExp(`<div class="alert alert-${type}[^"]*" role="alert">([^<]*)<`));
    return m ? decode(m[1].trim()) : undefined;
  };
  const user = text.match(/<a class="nav-link" href="\/users">([^<]*)<\/a>/);
  return {
    error: alert("danger"),
    success: alert("success"),
    username: user ? decode(user[1]) : undefined,
    signedIn: Boolean(user),
    fileIds: [...text.matchAll(/<a href="\/files\/(\d+)"/g)].map((m) => Number(m[1])),
  };
};

// A tiny browser stand-in: keeps cookies and reads the CSRF token from the pages'
// <meta name="csrf-token" content="..." /> tag, which every page renders.
exports.Client = class Client {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = {};
    this.csrfToken = null;
  }

  get cookieHeader() {
    return Object.entries(this.cookies)
      .map(([k, v]) => k + "=" + v)
      .join("; ");
  }

  async request(method, url, { form, multipart, body, headers = {} } = {}) {
    const init = {
      method,
      redirect: "manual",
      headers: { cookie: this.cookieHeader, ...headers },
    };
    if (form) {
      init.body = new URLSearchParams(form).toString();
      init.headers["content-type"] = "application/x-www-form-urlencoded";
    } else if (multipart) {
      init.body = multipart; // a FormData; fetch sets the multipart content-type and boundary
    } else if (body !== undefined) {
      init.body = body;
    }
    const res = await fetch(this.baseUrl + url, init);
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const name = pair.slice(0, pair.indexOf("="));
      if (/expires=thu, 01 jan 1970/i.test(cookie)) delete this.cookies[name];
      else this.cookies[name] = pair.slice(pair.indexOf("=") + 1);
    }
    const isText = /^text\//.test(res.headers.get("content-type") || "");
    const data = Buffer.from(await res.arrayBuffer());
    const text = isText ? data.toString("utf8") : "";
    const token = text.match(/<meta name="csrf-token" content="([^"]+)" \/>/);
    if (token) this.csrfToken = token[1];
    return {
      status: res.status,
      headers: res.headers,
      text,
      data,
      location: res.headers.get("location"),
    };
  }

  get(url, headers) {
    return this.request("GET", url, { headers });
  }

  // A POST the way the HTML forms send one: urlencoded, with the token in the _csrf field.
  post(url, fields = {}, headers) {
    return this.request("POST", url, { form: { _csrf: this.csrfToken, ...fields }, headers });
  }

  // The file page's jQuery calls (regenerate, delete) send the token in X-CSRF-Token.
  ajax(method, url, fields) {
    return this.request(method, url, {
      form: fields,
      headers: { "x-csrf-token": this.csrfToken },
    });
  }

  // Posts, then loads the redirect target and returns what it shows.
  async postAndFollow(url, fields, headers) {
    const res = await this.post(url, fields, headers);
    if (res.status !== 302) throw Error(`POST ${url}: expected a redirect, got ${res.status}`);
    const next = await this.get(res.location);
    return {
      location: res.location,
      status: next.status,
      text: next.text,
      ...exports.page(next.text),
    };
  }

  // The landing page's forms. Each POST counts toward the auth rate limit (20 per 15 minutes
  // per address, shared by sign-in and sign-up).
  async signUp(username, password = exports.PASSWORD) {
    await this.get("/");
    return this.postAndFollow("/users/signup", { username, password });
  }

  async signIn(username, password = exports.PASSWORD) {
    await this.get("/");
    return this.postAndFollow("/users/signin", { username, password });
  }

  // The upload form (multipart, the token in its _csrf field). `fields` overrides the form's
  // defaults; `file` is { name, content } or null for no file. Returns the response, plus the
  // file id and the shares the redirect target shows when the upload succeeded.
  async upload(fields = {}, file = { name: "notes.txt", content: "secret notes\n" }) {
    await this.get("/files");
    const form = new FormData();
    const values = {
      _csrf: this.csrfToken,
      name: "Notes",
      description: "",
      totalShares: "3",
      minimumShares: "2",
      expiration: "N",
      ...fields,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) form.append(key, value);
    }
    if (file) form.append("file", new Blob([file.content]), file.name);
    const res = await this.request("POST", "/files", { multipart: form });
    const match = res.status === 302 && res.location.match(/^\/files\/(\d+)$/);
    if (!match) return res;
    const next = await this.get(res.location);
    const shown = exports.page(next.text);
    return { ...res, id: Number(match[1]), shares: shown.success.split(/\s+/), page: shown };
  }

  // The file page's decryption form. A success is the file itself (an attachment).
  async decrypt(id, shares) {
    await this.get("/files/" + id);
    return this.post("/files/decrypt/" + id, { shares: shares.join("\n") });
  }

  async regenerate(id, shares) {
    await this.get("/files/" + id);
    return this.ajax("PUT", "/files/regenerate/" + id, { shares: shares.join("\n") });
  }

  async delete(id) {
    await this.get("/files/" + id);
    return this.ajax("DELETE", "/files/" + id);
  }
};

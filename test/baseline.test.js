const assert = require("node:assert/strict");
const { describe, test, before, after } = require("node:test");
const { start, boot, page, Client, SECRET } = require("./helpers/app.js");

describe("CSRF", () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.stop());

  async function visitor() {
    const client = new Client(app.baseUrl);
    await client.get("/");
    return client;
  }

  test("a POST without a token is refused with 403", async () => {
    const client = await visitor();
    const res = await client.request("POST", "/users/signin", {
      form: { username: "x", password: "y" },
    });
    assert.equal(res.status, 403);
  });

  test("a wrong token is refused with 403", async () => {
    const client = await visitor();
    const res = await client.request("POST", "/users/signin", {
      form: { _csrf: "not-the-token", username: "x", password: "y" },
    });
    assert.equal(res.status, 403);
  });

  test("the token in the form's _csrf field is accepted", async () => {
    const client = await visitor();
    const res = await client.post("/users/signin", { username: "x", password: "y" });
    assert.equal(res.status, 302);
  });

  test("the token in the X-CSRF-Token header is accepted", async () => {
    const client = await visitor();
    const res = await client.request("POST", "/users/signin", {
      form: { username: "x", password: "y" },
      headers: { "x-csrf-token": client.csrfToken },
    });
    assert.equal(res.status, 302);
  });

  test("a bodyless POST with the header token is neither 403 nor 500", async () => {
    const client = await visitor();
    const res = await client.request("POST", "/users/signin", {
      headers: { "x-csrf-token": client.csrfToken },
    });
    assert.notEqual(res.status, 403);
    assert.ok(res.status < 500, `status ${res.status}`);
  });

  test("a multipart upload without a token is refused with 403", async () => {
    const client = await visitor();
    await client.signUp("csrfup");
    const form = new FormData();
    for (const [k, v] of Object.entries({
      name: "x",
      totalShares: "3",
      minimumShares: "2",
      expiration: "N",
    }))
      form.append(k, v);
    form.append("file", new Blob(["plain"]), "x.txt");
    const res = await client.request("POST", "/files", { multipart: form });
    assert.equal(res.status, 403);
  });

  test.todo(
    "3.5 no query-string CSRF token: a POST with the token only in ?_csrf= is refused with 403",
  );
  test.todo(
    "3.5 multipart CSRF correct: a multipart POST /files/:id?_method=DELETE without a token is refused, not a deletion (open PR #3)",
  );
  test.todo(
    "3.7 app-level 4-arg error handler: a CSRF failure shows a short message, no stack trace",
  );
});

describe("secrets", () => {
  test("a missing SESSION_SECRET stops startup with exit 1", async () => {
    const { code, output } = await boot({ SESSION_SECRET: "" });
    assert.equal(code, 1);
    assert.match(output, /SESSION_SECRET is not set/);
  });

  test("the app boots with a random SESSION_SECRET", async () => {
    const { code } = await boot({ SESSION_SECRET: SECRET });
    assert.equal(code, null);
  });

  test.todo(
    "3.3 placeholder/short secret refused: the .env.example SESSION_SECRET placeholder stops startup with exit 1 (settings.js checks a different string)",
  );
  test.todo(
    "3.3 placeholder/short secret refused: a short SESSION_SECRET stops startup with exit 1",
  );
});

describe("rate limits", () => {
  test("the 21st sign-in attempt within 15 minutes gets 429", async () => {
    const app = await start();
    try {
      const client = new Client(app.baseUrl);
      await client.get("/");
      for (let i = 1; i <= 20; i++) {
        const res = await client.post("/users/signin", { username: "x", password: "y" });
        assert.equal(res.status, 302, `attempt ${i}`);
      }
      const res = await client.post("/users/signin", { username: "x", password: "y" });
      assert.equal(res.status, 429);
      assert.match(res.text, /Too many authentication attempts/);
    } finally {
      await app.stop();
    }
  });

  test("sign-up shares the sign-in limit", async () => {
    const app = await start();
    try {
      const client = new Client(app.baseUrl);
      await client.get("/");
      for (let i = 1; i <= 20; i++) await client.post("/users/signin", { username: "x" });
      const res = await client.post("/users/signup", { username: "late", password: "y" });
      assert.equal(res.status, 429);
    } finally {
      await app.stop();
    }
  });

  test("page loads don't count toward the limit", async () => {
    const app = await start();
    try {
      const client = new Client(app.baseUrl);
      for (let i = 1; i <= 25; i++) assert.equal((await client.get("/")).status, 200);
      const res = await client.post("/users/signin", { username: "x", password: "y" });
      assert.equal(res.status, 302);
    } finally {
      await app.stop();
    }
  });

  test("the 21st decryption attempt within 15 minutes gets 429", async () => {
    const app = await start();
    try {
      const client = new Client(app.baseUrl);
      await client.signUp("limits");
      const { id } = await client.upload();
      for (let i = 1; i <= 20; i++) {
        const res = await client.post("/files/decrypt/" + id, { shares: "AAAA\nBBBB" });
        assert.equal(res.status, 302, `attempt ${i}`);
      }
      const res = await client.post("/files/decrypt/" + id, { shares: "AAAA\nBBBB" });
      assert.equal(res.status, 429);
      assert.match(res.text, /Too many decryption attempts/);
    } finally {
      await app.stop();
    }
  });

  test.todo(
    "3.4 TRUST_PROXY: with TRUST_PROXY=1, 21 failed sign-ins from forwarded address A don't rate-limit address B",
  );
});

describe("sessions and production mode", () => {
  test("a session survives a restart (SQLite session store)", async () => {
    const app = await start();
    try {
      const client = new Client(app.baseUrl);
      assert.equal((await client.signUp("restart")).signedIn, true);
      await app.restart();
      const res = await client.get("/home");
      assert.equal(res.status, 200);
      assert.equal(page(res.text).username, "restart");
    } finally {
      await app.stop();
    }
  });

  test("NODE_ENV=production boots and serves the landing page", async () => {
    const app = await start({ NODE_ENV: "production" });
    try {
      assert.equal((await fetch(app.baseUrl + "/")).status, 200);
    } finally {
      await app.stop();
    }
  });

  test.todo(
    "3.4 TRUST_PROXY for the Secure cookie: with NODE_ENV=production and TRUST_PROXY=1 behind an HTTPS proxy the session cookie is issued, Secure (no cookie at all today)",
  );
});

describe("responses", () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.stop());

  test("the landing page is served to visitors", async () => {
    const res = await fetch(app.baseUrl + "/");
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /<form action="\/users\/signin"/);
    assert.match(text, /<form action="\/users\/signup"/);
  });

  test("an unknown path is a 404", async () => {
    const res = await fetch(app.baseUrl + "/no-such-page");
    assert.equal(res.status, 404);
    assert.equal(await res.text(), "Not Found");
  });

  test("static files are served", async () => {
    const res = await fetch(app.baseUrl + "/css/main.css");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/css/);
  });

  test("responses carry helmet's headers and no X-Powered-By", async () => {
    const res = await fetch(app.baseUrl + "/");
    assert.equal(res.headers.get("x-powered-by"), null);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
  });

  test("the session cookie is HttpOnly and SameSite=Lax", async () => {
    const res = await fetch(app.baseUrl + "/");
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("connect.sid="));
    assert.ok(cookie);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
  });

  test("a malformed JSON body is a 400", async () => {
    const client = new Client(app.baseUrl);
    await client.get("/");
    const res = await client.request("POST", "/users/signin", {
      body: "{bad",
      headers: { "content-type": "application/json", "x-csrf-token": client.csrfToken },
    });
    assert.equal(res.status, 400);
  });

  test.todo(
    "3.7 app-level 4-arg error handler: a malformed JSON body shows a short message, no stack trace",
  );
});

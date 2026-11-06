const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test, before, after } = require("node:test");
const { start, page, Client } = require("./helpers/app.js");

const CONTENT = "line one\nline two: the secret part\n";

describe("upload", () => {
  let app, owner;
  before(async () => {
    app = await start();
    owner = new Client(app.baseUrl);
    await owner.signUp("uploader");
  });
  after(() => app.stop());

  test("an upload shows its shares once and lists the file on the home page", async () => {
    const res = await owner.upload(
      { name: "Plans", description: "Q3", totalShares: "5", minimumShares: "3" },
      { name: "plans.txt", content: CONTENT },
    );
    assert.equal(res.status, 302);
    assert.equal(res.shares.length, 5);
    assert.equal(new Set(res.shares).size, 5);

    const again = await owner.get("/files/" + res.id);
    assert.equal(page(again.text).success, undefined);
    assert.match(again.text, /<h4 class="mb-2">Plans/);
    assert.match(again.text, /<h5 class="mb-2 font-weight-normal">Q3<\/h5>/);
    assert.match(again.text, /0 out of 3/);
    assert.ok(page((await owner.get("/home")).text).fileIds.includes(res.id));
  });

  test("only the ciphertext is kept on disk", async () => {
    const before = app.uploads();
    const { id } = await owner.upload({}, { name: "c.txt", content: CONTENT });
    const added = app.uploads().filter((f) => !before.includes(f));
    assert.equal(added.length, 1);
    assert.match(added[0], /^[0-9a-f-]{36}\.txt\.dat$/);
    const stored = fs.readFileSync(path.join(app.dir, "data", "uploads", added[0]));
    assert.equal(stored.includes(Buffer.from("the secret part")), false);
    assert.ok(app.db.prepare("SELECT 1 FROM files WHERE id = ?").get(id));
  });

  test("an upload refused for its CSRF token leaves nothing on disk", async () => {
    const before = app.uploads();
    await owner.get("/files");
    const form = new FormData();
    for (const [k, v] of Object.entries({
      _csrf: "not-the-token",
      name: "x",
      totalShares: "3",
      minimumShares: "2",
      expiration: "N",
    }))
      form.append(k, v);
    form.append("file", new Blob([CONTENT]), "x.txt");
    const res = await owner.request("POST", "/files", { multipart: form });
    assert.equal(res.status, 403);
    assert.deepEqual(app.uploads(), before);
  });

  test("an upload that fails after encryption leaves nothing on disk", async () => {
    const before = app.uploads();
    const res = await owner.upload({ expiration: "999999999 y" });
    assert.equal(res.status, 302);
    assert.equal(res.location, "/files");
    assert.ok(page((await owner.get("/files")).text).error);
    assert.deepEqual(app.uploads(), before);
  });

  test("visitors cannot upload", async () => {
    const visitor = new Client(app.baseUrl);
    await visitor.get("/");
    const form = new FormData();
    form.append("_csrf", visitor.csrfToken);
    form.append("file", new Blob([CONTENT]), "x.txt");
    const res = await visitor.request("POST", "/files", { multipart: form });
    assert.equal(res.status, 302);
    assert.equal(res.location, "/");
  });

  test.todo(
    "3.8 same-origin 'back' redirect: an invalid upload (more shares needed than issued) returns to the form with the error (Location: back today; open PR #4)",
  );
  test.todo(
    "one-repo finding: an upload without a file shows a form error, not a TypeError message (open PR #5)",
  );
  test.todo(
    "one-repo finding: an upload over 25 MiB shows a form error instead of a bare 500 (open PR #5)",
  );
});

describe("download", () => {
  let app, owner, file;
  before(async () => {
    app = await start();
    owner = new Client(app.baseUrl);
    await owner.signUp("sharer");
    file = await owner.upload(
      { name: "Report", totalShares: "4", minimumShares: "3" },
      { name: "report.txt", content: CONTENT },
    );
  });
  after(() => app.stop());

  test("any threshold of shares decrypts the file, an attachment named after the file", async () => {
    for (const shares of [file.shares.slice(0, 3), file.shares.slice(1), file.shares]) {
      const res = await owner.decrypt(file.id, shares);
      assert.equal(res.status, 200);
      assert.equal(res.data.toString(), CONTENT);
      assert.match(res.headers.get("content-disposition"), /attachment; filename="Report"/);
    }
  });

  test("a visitor without an account can view the file page and decrypt with shares", async () => {
    const visitor = new Client(app.baseUrl);
    const view = await visitor.get("/files/" + file.id);
    assert.equal(view.status, 200);
    assert.doesNotMatch(view.text, /id="regenerate"/);
    const res = await visitor.decrypt(file.id, file.shares.slice(0, 3));
    assert.equal(res.status, 200);
    assert.equal(res.data.toString(), CONTENT);
  });

  test("too few shares return to the file page with an error", async () => {
    const res = await owner.decrypt(file.id, file.shares.slice(0, 2));
    assert.equal(res.status, 302);
    assert.equal(res.location, "/files/" + file.id);
    const shown = page((await owner.get(res.location)).text);
    assert.match(shown.error, /error decoding/);
  });

  test("concurrent downloads each get the whole file", async () => {
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map(() => owner.decrypt(file.id, file.shares.slice(0, 3))),
    );
    for (const res of results) {
      assert.equal(res.status, 200);
      assert.equal(res.data.toString(), CONTENT);
    }
  });

  test("an unknown file id shows the not-found page", async () => {
    const res = await owner.get("/files/999");
    assert.equal(res.status, 404);
    assert.match(res.text, /The file has expired/);
  });
});

describe("expiry", () => {
  let app, owner, file;
  before(async () => {
    app = await start();
    owner = new Client(app.baseUrl);
    await owner.signUp("expirer");
    file = await owner.upload({ expiration: "10 m" }, { name: "e.txt", content: CONTENT });
    app.db
      .prepare("UPDATE files SET expiration = ? WHERE id = ?")
      .run(new Date(Date.now() - 60000).toISOString(), file.id);
  });
  after(() => app.stop());

  test("an expired file is hidden from others and cannot be decrypted by them", async () => {
    const other = new Client(app.baseUrl);
    await other.signUp("someone");
    assert.match((await other.get("/files/" + file.id)).text, /The file has expired/);
    const res = await other.decrypt(file.id, file.shares);
    assert.equal(res.status, 302);
    assert.equal(res.location, "/files/" + file.id);
  });

  test("the owner still sees, decrypts and regenerates an expired file", async () => {
    assert.doesNotMatch((await owner.get("/files/" + file.id)).text, /The file has expired/);
    assert.equal((await owner.decrypt(file.id, file.shares)).data.toString(), CONTENT);
    assert.equal((await owner.regenerate(file.id, file.shares)).status, 200);
  });
});

describe("regenerate and delete", () => {
  let app, owner, other;
  before(async () => {
    app = await start();
    owner = new Client(app.baseUrl);
    await owner.signUp("keeper");
    other = new Client(app.baseUrl);
    await other.signUp("stranger");
  });
  after(() => app.stop());

  test("regenerating issues new shares and retires the old ones", async () => {
    const file = await owner.upload({}, { name: "r.txt", content: CONTENT });
    const res = await owner.regenerate(file.id, file.shares);
    assert.equal(res.status, 200);
    const shown = page((await owner.get("/files/" + file.id)).text);
    const fresh = shown.success.split(/\s+/);
    assert.equal(fresh.length, 3);
    assert.equal((await owner.decrypt(file.id, fresh.slice(0, 2))).data.toString(), CONTENT);
    assert.equal((await owner.decrypt(file.id, file.shares)).status, 302);
  });

  test("only the owner can regenerate", async () => {
    const file = await owner.upload();
    const res = await other.regenerate(file.id, file.shares);
    assert.equal(res.status, 400);
    assert.equal((await owner.decrypt(file.id, file.shares)).status, 200);
  });

  test("concurrent regenerations leave the file decryptable with the winner's shares", async () => {
    const file = await owner.upload({}, { name: "race.txt", content: CONTENT });
    await owner.get("/files/" + file.id);
    const results = await Promise.all(
      [0, 1, 2].map(() =>
        owner.ajax("PUT", "/files/regenerate/" + file.id, { shares: file.shares.join("\n") }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400, 400]);
    const fresh = page((await owner.get("/files/" + file.id)).text).success.split(/\s+/);
    assert.equal((await owner.decrypt(file.id, fresh)).data.toString(), CONTENT);
  });

  test("only the owner can delete", async () => {
    const file = await owner.upload();
    const res = await other.delete(file.id);
    assert.equal(res.status, 400);
    assert.equal((await owner.get("/files/" + file.id)).status, 200);
  });

  test("the owner deletes the file and its ciphertext", async () => {
    const before = app.uploads();
    const file = await owner.upload();
    const stored = app.uploads().filter((f) => !before.includes(f));
    assert.equal(stored.length, 1);
    const res = await owner.delete(file.id);
    assert.equal(res.status, 200);
    assert.equal((await owner.get("/files/" + file.id)).status, 404);
    assert.deepEqual(app.uploads(), before);
    assert.equal(page((await owner.get("/home")).text).fileIds.includes(file.id), false);
  });

  test.todo(
    "one-repo finding: visitors cannot enumerate files' names and descriptions (GET /files/:id needs no sign-in and ids are sequential)",
  );
});

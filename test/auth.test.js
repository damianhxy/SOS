const assert = require("node:assert/strict");
const { describe, test, before, after } = require("node:test");
const { start, page, Client, PASSWORD } = require("./helpers/app.js");

describe("sign-up", () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.stop());

  test("signs the new user in and lands on an empty home page", async () => {
    const client = new Client(app.baseUrl);
    const res = await client.signUp("alice");
    assert.equal(res.location, "/home");
    assert.equal(res.username, "alice");
    assert.match(res.text, /You haven't uploaded any files yet/);
  });

  test("stores a bcrypt hash, not the password", async () => {
    const row = app.db.prepare("SELECT hash FROM users WHERE username = ?").get("alice");
    assert.match(row.hash, /^\$2[aby]\$10\$/);
  });

  test("a taken username returns to the landing page with an error", async () => {
    const client = new Client(app.baseUrl);
    const res = await client.signUp("alice", "another-password");
    assert.equal(res.location, "/");
    assert.equal(res.signedIn, false);
    assert.equal(res.error, "User already exists");
  });

  test.todo(
    "3.8 same-origin 'back' redirect: an invalid sign-up (short password, non-alphanumeric username) returns to the form with the error (Express 5 sends Location: back, a 404; open PR #4)",
  );
});

describe("sign-in and sign-out", () => {
  let app;
  before(async () => {
    app = await start();
    await new Client(app.baseUrl).signUp("bob");
  });
  after(() => app.stop());

  test("the right password signs in", async () => {
    const client = new Client(app.baseUrl);
    const res = await client.signIn("bob");
    assert.equal(res.location, "/home");
    assert.equal(res.username, "bob");
  });

  test("a wrong password returns to the landing page with an error", async () => {
    const client = new Client(app.baseUrl);
    const res = await client.signIn("bob", "wrong-password");
    assert.equal(res.location, "/");
    assert.equal(res.signedIn, false);
    assert.ok(res.error);
  });

  test("an unknown user returns to the landing page with an error", async () => {
    const client = new Client(app.baseUrl);
    const res = await client.signIn("nobody");
    assert.equal(res.location, "/");
    assert.equal(res.signedIn, false);
    assert.ok(res.error);
  });

  test("a signed-in visitor to / goes to /home", async () => {
    const client = new Client(app.baseUrl);
    await client.signIn("bob");
    const res = await client.get("/");
    assert.equal(res.status, 302);
    assert.equal(res.location, "/home");
  });

  test("the nav's sign-out link signs the user out", async () => {
    const client = new Client(app.baseUrl);
    await client.signIn("bob");
    const res = await client.get("/users/signout");
    assert.equal(res.status, 302);
    assert.equal(res.location, "/");
    assert.equal((await client.get("/files")).status, 302);
  });

  test.todo(
    "3.9 generic sign-in failure message: an unknown user and a wrong password get the same message ('User does not exist' vs 'Wrong password' today)",
  );
  test.todo(
    "3.6 POST sign-out + destroy: GET /users/signout is 404; POST with a token signs out and the old cookie is dead (open PR #2)",
  );
  test.todo(
    "3.8 same-origin 'back' redirect: a sign-in with an empty field returns to the form with the error (Location: back today; open PR #4)",
  );
});

describe("password change", () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.stop());

  test("the profile form changes the password", async () => {
    const client = new Client(app.baseUrl);
    await client.signUp("carol");
    await client.get("/users");
    const res = await client.postAndFollow("/users/editPassword", {
      currentPassword: PASSWORD,
      newPass: "new-password-456",
      newPass2: "new-password-456",
    });
    assert.equal(res.location, "/home");
    assert.equal(res.success, "Password updated successfully.");

    assert.equal((await new Client(app.baseUrl).signIn("carol")).signedIn, false);
    assert.equal(
      (await new Client(app.baseUrl).signIn("carol", "new-password-456")).signedIn,
      true,
    );
  });

  test("a wrong current password returns to the profile with an error", async () => {
    const client = new Client(app.baseUrl);
    await client.signUp("dave");
    await client.get("/users");
    const res = await client.postAndFollow("/users/editPassword", {
      currentPassword: "not-my-password",
      newPass: "new-password-456",
      newPass2: "new-password-456",
    });
    assert.equal(res.location, "/users");
    assert.equal(res.error, "Wrong password");
    assert.equal((await new Client(app.baseUrl).signIn("dave")).signedIn, true);
  });

  test("the password form needs a signed-in user", async () => {
    const client = new Client(app.baseUrl);
    await client.get("/");
    const res = await client.post("/users/editPassword", {
      currentPassword: PASSWORD,
      newPass: "new-password-456",
      newPass2: "new-password-456",
    });
    assert.equal(res.status, 302);
    assert.equal(res.location, "/");
  });

  test.todo(
    "3.8 same-origin 'back' redirect: mismatched new passwords return to the profile with the error (Location: back today; open PR #4)",
  );
});

describe("access control", () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.stop());

  test("visitors are sent from the upload form to the landing page", async () => {
    const res = await new Client(app.baseUrl).get("/files");
    assert.equal(res.status, 302);
    assert.equal(res.location, "/");
  });

  test("a signed-in user's home lists only their own files", async () => {
    const erin = new Client(app.baseUrl);
    await erin.signUp("erin");
    const { id } = await erin.upload({ name: "Erin's file" });
    const frank = new Client(app.baseUrl);
    await frank.signUp("frank");
    assert.deepEqual(page((await frank.get("/home")).text).fileIds, []);
    assert.deepEqual(page((await erin.get("/home")).text).fileIds, [id]);
  });

  test.todo(
    "one-repo finding: visitors are sent from /home and /users to the landing page (both render today; open PR #2)",
  );
});

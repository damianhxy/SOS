"use strict";

const bcryptjs = require("bcryptjs");
const db = require("./db.js");
const settings = require("../controllers/settings.js");

const stmts = {
  findByUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
  findById: db.prepare("SELECT * FROM users WHERE id = ?"),
  insert: db.prepare("INSERT INTO users (username, hash) VALUES (?, ?)"),
  updateHash: db.prepare("UPDATE users SET hash = ? WHERE id = ?"),
};

exports.add = function (username, password) {
  const existing = stmts.findByUsername.get(username);
  if (existing) throw new Error("User already exists");

  const hash = bcryptjs.hashSync(password, settings.HASH_ROUNDS);
  const result = stmts.insert.run(username, hash);
  return stmts.findById.get(result.lastInsertRowid);
};

exports.authenticate = function (username, password) {
  const user = stmts.findByUsername.get(username);
  if (!user) throw new Error("User does not exist");

  const match = bcryptjs.compareSync(password, user.hash);
  if (!match) throw new Error("Wrong password");

  return user;
};

exports.editPassword = function (req) {
  const match = bcryptjs.compareSync(req.body.currentPassword, req.user.hash);
  if (!match) throw new Error("Wrong password");

  const hash = bcryptjs.hashSync(req.body.newPass, settings.HASH_ROUNDS);
  stmts.updateHash.run(hash, req.user.id);
};

exports.get = function (id) {
  return stmts.findById.get(id);
};

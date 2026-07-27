"use strict";

const crypto = require("crypto");
const path = require("path");
const fs = require("fs/promises");
const dayjs = require("dayjs");
const sssa = require("sssa-js");
const db = require("./db.js");
const settings = require("../controllers/settings.js");

const stmts = {
  findById: db.prepare("SELECT * FROM files WHERE id = ?"),
  findByOwner: db.prepare("SELECT * FROM files WHERE owner = ? ORDER BY time ASC"),
  insert: db.prepare(
    "INSERT INTO files (name, path, owner, total, minimum, time, expiration, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ),
  remove: db.prepare("DELETE FROM files WHERE id = ?"),
};

function generateKey() {
  return crypto.randomBytes(32).toString("hex");
}

async function encryptFile(inputPath, outputPath, password) {
  const key = crypto.scryptSync(password, "sos-salt", settings.KEY_LENGTH);
  const iv = crypto.randomBytes(settings.IV_LENGTH);
  const cipher = crypto.createCipheriv(settings.ALGORITHM, key, iv);

  const input = await fs.readFile(inputPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const output = Buffer.concat([iv, authTag, encrypted]);
  await fs.writeFile(outputPath, output);
}

async function decryptFile(inputPath, outputPath, password) {
  const key = crypto.scryptSync(password, "sos-salt", settings.KEY_LENGTH);
  const data = await fs.readFile(inputPath);

  const iv = data.subarray(0, settings.IV_LENGTH);
  const authTag = data.subarray(settings.IV_LENGTH, settings.IV_LENGTH + 16);
  const encrypted = data.subarray(settings.IV_LENGTH + 16);

  const decipher = crypto.createDecipheriv(settings.ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  await fs.writeFile(outputPath, decrypted);
}

exports.add = async function (req) {
  const minimum = parseInt(req.body.minimumShares, 10);
  const total = parseInt(req.body.totalShares, 10);
  const name = req.body.name;
  const description = req.body.description || "";
  const filePath = path.resolve(req.file.path);
  const exp = req.body.expiration;

  const password = generateKey();
  const shares = sssa.create(minimum, total, password);

  await encryptFile(filePath, filePath + ".dat", password);
  await fs.unlink(filePath);

  const curTime = dayjs().toISOString();
  let expiration = null;
  if (exp !== "N") {
    const parts = exp.split(" ");
    const amount = parseInt(parts[0], 10);
    const unit = parts[1];
    expiration = dayjs().add(amount, unit).toISOString();
  }

  const result = stmts.insert.run(
    name,
    filePath,
    req.user.username,
    total,
    minimum,
    curTime,
    expiration,
    description,
  );

  return { id: result.lastInsertRowid, shares: shares };
};

exports.regenerate = async function (user, shares, id) {
  const file = stmts.findById.get(id);
  if (!file) throw new Error("File not found");
  if (file.owner !== user) throw new Error("Not owner");

  await exports.decrypt(user, shares, id);

  const password = generateKey();
  const newShares = sssa.create(file.minimum, file.total, password);

  await encryptFile(file.path, file.path + ".dat", password);
  await fs.unlink(file.path);

  return newShares;
};

exports.decrypt = async function (user, shares, id) {
  let secret;
  try {
    secret = sssa.combine(shares);
  } catch (err) {
    throw new Error("Invalid shares: " + err.message, { cause: err });
  }

  const file = stmts.findById.get(id);
  if (!file) throw new Error("File not found");

  if (file.expiration) {
    const expTime = dayjs(file.expiration);
    const curTime = dayjs();
    const isOwner = user ? user.username === file.owner : false;
    if (curTime.isAfter(expTime) && !isOwner) {
      throw new Error("File Expired");
    }
  }

  await decryptFile(file.path + ".dat", file.path, secret);
  return file;
};

exports.delete = async function (user, id) {
  const file = stmts.findById.get(id);
  if (!file) throw new Error("File not found");
  if (file.owner !== user) throw new Error("Not owner");

  await fs.unlink(file.path + ".dat").catch(() => {});
  stmts.remove.run(id);
};

exports.get = function (id) {
  return stmts.findById.get(id) || null;
};

exports.getUserFiles = function (user) {
  return stmts.findByOwner.all(user);
};

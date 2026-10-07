"use strict";

const crypto = require("crypto");
const path = require("path");
const fs = require("fs/promises");
const dayjs = require("dayjs");
const shamir = require("shamirs-secret-sharing");
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

const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

async function encryptFile(inputPath, outputPath, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.scryptSync(password, salt, settings.KEY_LENGTH);
  const iv = crypto.randomBytes(settings.IV_LENGTH);
  const cipher = crypto.createCipheriv(settings.ALGORITHM, key, iv);

  const input = await fs.readFile(inputPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const output = Buffer.concat([salt, iv, authTag, encrypted]);
  await fs.writeFile(outputPath, output);
}

function tryDecrypt(data, password, salt) {
  const key = crypto.scryptSync(password, salt, settings.KEY_LENGTH);
  const iv = data.subarray(0, settings.IV_LENGTH);
  const authTag = data.subarray(settings.IV_LENGTH, settings.IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(settings.IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(settings.ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

async function decryptFile(inputPath, outputPath, password) {
  const data = await fs.readFile(inputPath);

  let decrypted;
  try {
    decrypted = tryDecrypt(data.subarray(SALT_LENGTH), password, data.subarray(0, SALT_LENGTH));
  } catch {
    decrypted = tryDecrypt(data, password, "sos-salt");
  }

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
  const shares = shamir
    .split(Buffer.from(password, "utf8"), { shares: total, threshold: minimum })
    .map((share) => Buffer.from(share).toString("base64"));

  const encryptedPath = filePath + ".dat";
  let inserted = false;
  try {
    await encryptFile(filePath, encryptedPath, password);
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
    inserted = true;
    return { id: result.lastInsertRowid, shares: shares };
  } finally {
    await fs.unlink(filePath).catch(() => {});
    if (!inserted) await fs.unlink(encryptedPath).catch(() => {});
  }
};

exports.regenerate = async function (user, shares, id) {
  const file = stmts.findById.get(id);
  if (!file) throw new Error("File not found");
  if (file.owner !== user) throw new Error("Not owner");

  await exports.decrypt(user, shares, id);

  const password = generateKey();
  const newShares = shamir
    .split(Buffer.from(password, "utf8"), { shares: file.total, threshold: file.minimum })
    .map((share) => Buffer.from(share).toString("base64"));

  await encryptFile(file.path, file.path + ".dat", password);
  await fs.unlink(file.path);

  return newShares;
};

exports.decrypt = async function (user, shares, id) {
  let secret;
  try {
    secret = Buffer.from(
      shamir.combine(shares.map((share) => Buffer.from(share, "base64"))),
    ).toString("utf8");
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

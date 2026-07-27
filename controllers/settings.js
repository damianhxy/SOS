"use strict";

exports.PORT = process.env.PORT || 5000;
exports.SECRET = process.env.SESSION_SECRET;
exports.FILE_SIZE_LIMIT = 25 * 1024 * 1024;
exports.HASH_ROUNDS = 10;
exports.BASE_URL = process.env.BASE_URL || `http://localhost:${exports.PORT}`;
exports.ALGORITHM = "aes-256-gcm";
exports.KEY_LENGTH = 32;
exports.IV_LENGTH = 16;

if (!exports.SECRET || exports.SECRET === "change-me-to-a-random-64-char-string") {
  console.error("FATAL: SESSION_SECRET is not set or is using the default value.");
  console.error(
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
  );
  process.exit(1);
}

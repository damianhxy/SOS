"use strict";

const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const settings = require("../controllers/settings.js");

const UPLOAD_DIR = path.join(__dirname, "..", "data", "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

module.exports = multer({
  limits: {
    files: 1,
    fields: 6,
    fileSize: settings.FILE_SIZE_LIMIT,
  },
  fileFilter: (req, file, cb) => {
    const safeName = path.basename(file.originalname);
    if (safeName !== file.originalname) {
      return cb(new Error("Invalid filename"));
    }
    cb(null, true);
  },
  storage: multer.diskStorage({
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, crypto.randomUUID() + ext);
    },
    destination: (req, file, cb) => {
      cb(null, UPLOAD_DIR);
    },
  }),
}).single("file");

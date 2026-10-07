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

const parse = multer({
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

// Report rejected or missing uploads on the upload form instead of the generic
// 500 handler or an internal error message.
module.exports = function (req, res, next) {
  parse(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        req.session.error = "Upload rejected: " + err.message;
      } else {
        console.error(err.message);
        req.session.error = "Upload failed.";
      }
      return res.redirect("/files");
    }
    if (!req.file) {
      req.session.error = "Please choose a file to upload.";
      return res.redirect("/files");
    }
    next();
  });
};

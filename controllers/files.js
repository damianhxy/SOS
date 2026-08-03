"use strict";

const express = require("express");
const fs = require("fs/promises");
const dayjs = require("dayjs");
const { validateUpload, validateDecrypt } = require("../middlewares/validate.js");
const router = express.Router();
const file = require("../models/file.js");
const auth = require("../middlewares/auth.js");
const upload = require("../middlewares/upload.js");
const rateLimit = require("express-rate-limit");

const decryptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many decryption attempts, please try again later.",
});

router.get("/", auth, (req, res) => {
  res.render("upload", {
    user: req.user,
    title: "Upload",
  });
});

router.post("/", auth, upload, validateUpload, async (req, res) => {
  try {
    const result = await file.add(req);
    req.session.success = result.shares.join("\n");
    res.redirect("/files/" + result.id);
  } catch (err) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    console.error(err.message);
    req.session.error = err.message;
    res.redirect("/files");
  }
});

router.post("/decrypt/:id", decryptLimiter, validateDecrypt, async (req, res) => {
  try {
    const shares = req.body.shares.split(/\s+/).filter((s) => s.length > 0);
    const fileData = await file.decrypt(req.user, shares, req.params.id);
    const stream = require("fs").createReadStream(fileData.path);

    const cleanup = () => {
      fs.unlink(fileData.path).catch(() => {});
    };

    stream.on("error", async (err) => {
      console.error("Stream error:", err.message);
      cleanup();
      if (!res.headersSent) {
        req.session.error = "Error streaming file.";
        res.status(500).redirect("/files/" + req.params.id);
      } else {
        res.destroy(err);
      }
    });

    const fileName = String(fileData.name || "").replace(/"/g, "");
    res.attachment(fileName);
    stream.pipe(res);

    stream.on("end", cleanup);
    stream.on("close", cleanup);
  } catch (err) {
    console.error(err.message);
    req.session.error =
      "There was an error decoding. Ensure that you entered sufficient valid shares.";
    res.status(400).redirect("/files/" + req.params.id);
  }
});

router.put("/regenerate/:id", auth, validateDecrypt, async (req, res) => {
  try {
    const shares = req.body.shares.split(/\s+/).filter((s) => s.length > 0);
    const newShares = await file.regenerate(req.user.username, shares, req.params.id);
    req.session.success = newShares.join("\n");
    res.end();
  } catch (err) {
    console.error(err.message);
    res.status(400).send("Regeneration failed: " + err.message);
  }
});

router.get("/:id", async (req, res) => {
  try {
    const ret = await file.get(req.params.id);
    if (!ret) {
      return res.status(404).render("fileExpired", {
        user: req.user,
        title: "File Not Found",
      });
    }

    let isExpired = false;
    if (ret.expiration) {
      const expTime = dayjs(ret.expiration);
      const curTime = dayjs();
      const isOwner = req.user ? req.user.username === ret.owner : false;
      if (curTime.isAfter(expTime) && !isOwner) {
        isExpired = true;
      }
    }

    if (isExpired) {
      res.render("fileExpired", {
        user: req.user,
        title: "File Expired",
      });
    } else {
      res.render("file", {
        user: req.user,
        title: ret.name,
        file: ret,
        isOwner: req.user ? req.user.username === ret.owner : false,
      });
    }
  } catch (err) {
    console.error(err.message);
    res.status(404).render("fileExpired", {
      user: req.user,
      title: "File Not Found",
    });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    await file.delete(req.user.username, req.params.id);
    res.end();
  } catch (err) {
    console.error(err.message);
    res.status(400).send("Delete failed: " + err.message);
  }
});

module.exports = router;

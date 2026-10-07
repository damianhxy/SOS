"use strict";

const express = require("express");
const file = require("../models/file.js");
const notification = require("../middlewares/notification.js");
const auth = require("../middlewares/auth.js");

const router = express.Router();
router.use(notification);

router.get("/", (req, res) => {
  if (req.user) {
    res.redirect("/home");
  } else {
    res.render("landing", {
      title: "SOS",
      layout: false,
    });
  }
});

router.get("/home", auth, async (req, res) => {
  try {
    const files = await file.getUserFiles(req.user.username);
    res.render("home", {
      title: "Home",
      user: req.user,
      files: files,
    });
  } catch (err) {
    console.error(err.message);
    res.render("home", {
      title: "Home",
      user: req.user,
      files: [],
    });
  }
});

router.use("/users", require("./users.js"));
router.use("/files", require("./files.js"));

router.use((req, res) => {
  res.status(404).send("Not Found");
});

router.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).send("Internal Server Error");
});

module.exports = router;

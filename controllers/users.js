"use strict";

const express = require("express");
const passport = require("passport");
const rateLimit = require("express-rate-limit");
const {
  validateSignup,
  validateSignin,
  validateEditPassword,
} = require("../middlewares/validate.js");
const router = express.Router();
const userModel = require("../models/user.js");
const auth = require("../middlewares/auth.js");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts, please try again later.",
});

router.get("/", (req, res) => {
  res.render("profile", {
    title: "Profile",
    user: req.user,
  });
});

router.post("/editPassword", auth, validateEditPassword, async (req, res) => {
  try {
    await userModel.editPassword(req);
    req.session.success = "Password updated successfully.";
    res.redirect("/home");
  } catch (err) {
    console.error(err.message);
    req.session.error = err.message;
    res.status(400).redirect("/users");
  }
});

router.post("/signin", authLimiter, validateSignin, (req, res, next) => {
  passport.authenticate("local-signin", (err, user) => {
    if (err) return next(err);
    if (!user) return res.status(400).redirect("/");
    req.login(user, (err) => {
      if (err) return next(err);
      res.redirect("/home");
    });
  })(req, res, next);
});

router.post("/signup", authLimiter, validateSignup, (req, res, next) => {
  passport.authenticate("local-signup", (err, user) => {
    if (err) return next(err);
    if (!user) return res.status(400).redirect("/");
    req.login(user, (err) => {
      if (err) return next(err);
      res.redirect("/home");
    });
  })(req, res, next);
});

router.get("/signout", auth, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

module.exports = router;

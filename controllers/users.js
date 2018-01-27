var express = require("express");
var passport = require("passport");
var router = express.Router();
var user = require("../models/user.js");
var auth = require("../middlewares/auth.js");

router.post("/signin", function(req, res, next) {
    passport.authenticate("local-signin", function(err, user) {
        if (err) return next(err);
        if (!user)
            return res.status(400).redirect("/");
        return req.login(user, function(err) {
            if (err) return next(err);
            res.redirect("/home");
        });
    })(req, res, next);
});

router.post("/signup", function(req, res, next) {
    passport.authenticate("local-signup", function(err, user, info) {
        if (err) return next(err);
        return req.login(user, function(err) {
            if (err) return next(err);
            res.redirect("/home");
        });
    })(req, res, next);
});

router.get("/signout", auth, function(req, res) {
   req.logout();
   res.redirect("/");
});

module.exports = router;
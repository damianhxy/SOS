var express = require("express");
var passport = require("passport");
var router = express.Router();
var user = require("../models/user.js");
var auth = require("../middlewares/auth.js");

router.get("/", function(req, res) {
    res.render("profile", {
        title: "Profile",
        user: req.user
    }) 
});

router.post("/editPassword", auth, function(req, res) {
    user.editPassword(req)
    .then(function() {
        res.redirect("/home");
    })
    .catch(function(err) {
        console.error(err);
        res.status(400).redirect("/users");
    });
});

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
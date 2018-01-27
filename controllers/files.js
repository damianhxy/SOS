var express = require("express");
var fs = require("fs");
var passport = require("passport");
var router = express.Router();
var file = require("../models/file.js");
var auth = require("../middlewares/auth.js");
var upload = require("../middlewares/upload.js");

router.get("/", auth, function(req, res) {
    res.render("upload", {
        user: req.user,
        title: "Upload"
    });
});

router.post("/", auth, upload, function(req, res) { // Upload
    file.add(req)
    .then(function(ret) {
        req.session.success = ret[1].join("\n");
        res.redirect("/files/" + ret[0]);
    });
});

router.post("/decrypt/:id", function(req, res) { // Decrypt
    var shares = req.body.shares.split(/\s+/);
    file.decrypt(shares, req.params.id)
    .then(function(file) {
        res.download(file.path, file.name, function(err) {
            if (err) console.error(err);
            else fs.unlinkAsync(file.path);
        });
    })
    .catch(function(err) {
       req.session.error = err.message;
       res.status(400).redirect("/files/" + req.params.id);
    });
});

router.put("/regenerate/:id", auth, function(req, res) {
    var shares = req.body.shares.split(/\s+/);
    file.regenerate(req.user.username, shares, req.params.id)
    .then(function(shares) {
       req.session.success = shares.join("\n");
       res.redirect("/files/" + req.params.id);
    });
});

router.get("/:id", function(req, res) {
    file.get(req.params.id)
    .then(function(ret) {
        res.render("file", {
            user: req.user,
            title: ret.name,
            file: ret,
            isOwner: req.user ? req.user.username === ret.owner : false
        });
    });
});


router.delete("/:id", auth, function(req, res) { // Delete
    file.delete(req.user.username, req.params.id)
    .then(function() {
        res.end();
    })
    .catch(function(err) {
        console.error(err);
        res.status(400).send("Delete failed");
    });
});

module.exports = router;
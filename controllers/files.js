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
    .then(function(shares) {
        var successMessage = "Success! Hashes:\n";
        successMessage += shares.join("\n");
        req.session.success = successMessage;
        res.redirect("/files");
    });
});

router.get("/:id", function(req, res) {
    file.get(req.params.id)
    .then(function(ret) {
        res.render("file", {
            user: req.user,
            title: ret.name,
            file: ret,
            isOwner: req.user.username === ret.owner
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

router.post("/decrypt/:id", auth, function(req, res) { // Decrypt
    file.decrypt(req.body.shares, req.params.id)
    .then(function(file) {
        var stream = fs.createReadStream(file.path);
        stream.pipe(res).once("close", function() {
            stream.destroy();
            fs.unlinkAsync(file.path);
        });
    });
});

router.put("/regenerate/:id", auth, function(req, res) {
   file.regenerate(req.user.username, req.body.shares, req.params.id)
   .then(function(shares) {
      res.json(shares); 
   });
});

module.exports = router;
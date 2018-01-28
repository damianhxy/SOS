var express = require("express");
var fs = require("fs");
var passport = require("passport");
var moment = require("moment-timezone");
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
    file.decrypt(req.user, shares, req.params.id)
    .then(function(file) {
        var stream = fs.createReadStream(file.path);
        stream.pipe(res);
        stream.on("close", function() {
            console.log("Deleting file");
            fs.unlinkAsync(file.path)
        });
    })
    .catch(function(err) {
        var errMsg = "There was an error decoding. "
        errMsg += "Ensure that you entered sufficient shares, ";
        errMsg += "and that the shares are valid.";
        req.session.error = errMsg;
        res.status(400).redirect("/files/" + req.params.id);
    });
});

router.put("/regenerate/:id", auth, function(req, res) {
    var shares = req.body.shares.split(/\s+/);
    file.regenerate(req.user.username, shares, req.params.id)
    .then(function(shares) {
        res.send(shares.join("\n"));
    });
});

router.get("/:id", function(req, res) {
    file.get(req.params.id)
    .then(function(ret) {
        var expTime = ret.expiration ? moment(ret.expiration).tz("Asia/Singapore") : false;
        var curTime = moment().tz("Asia/Singapore");
        var isOwner = req.user ? req.user.username === ret.owner : false
        if (expTime && curTime.isAfter(expTime) && !isOwner) {
            res.render("fileExpired", {
               user: req.user,
               title: "File Expired"
            });
        } else {
            res.render("file", {
                user: req.user,
                title: ret.name,
                file: ret,
                isOwner: isOwner
            });
        }
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
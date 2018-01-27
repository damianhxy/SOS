var express = require("express");
var fs = require("fs");
var passport = require("passport");
var router = express.Router();
var file = require("../models/file.js");
var auth = require("../middlewares/auth.js");
var upload = require("../middlewares/upload.js");

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

router.post("/regen/:id", auth, function(req, res) {
   file.regen(req.body.shares, req.params.id)
   .then(function(shares) {
      res.json(shares); 
   });
});

router.post("/", auth, function(req, res) { // Upload
    upload(req, res, function(err) {
        if (err) {
            console.error(err);
            res.status(400).send("Upload Failed");
        } else {
            file.add(req)
            .then(function(shares) {
                res.json(shares);
            })
            .catch(function(err) {
               console.error(err);
               res.status(400).send("File uploaded but failed");
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
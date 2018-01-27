var express = require("express");
var settings = require("./settings.js");
var file = require("../models/file.js");
var router = express.Router();

/* Pages */

router.get("/", function(req, res) {
    if (req.user) {
        res.redirect("/home");
    } else {
        res.render("landing", {
           title: "SOS",
           layout: false
        });   
    }
});

router.get("/home", function(req, res) {
    file.getUserFiles(req.user.username)
    .then(function(files) {
        res.render("home", {
           title: "Home",
           user: req.user,
           files: files
        }); 
    });
});

/* Users */
router.use("/users", require("./users.js"));

/* Files */
router.use("/files", require("./files.js"));

/* 404 & 500 */
router.use(function(req, res) {
    res.send("Not Found");
    /*
    res.status(404).render("404", {
        title: "Page Not Found",
        user: req.user
    });
    */
});

router.use(function(err, req, res, next) {
    console.error(err.stack);
    res.send("Internal Server Error")
    /*
    res.status(500).render("500", {
        title: "Internal Server Error",
        user: req.user
    });
    */
});

module.exports = router;
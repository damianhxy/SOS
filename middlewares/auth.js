module.exports = function(req, res, next) {
    if (req.isAuthenticated())
        return next();
    console.error("User is not authenticated");
    res.status(401).redirect("/");
};

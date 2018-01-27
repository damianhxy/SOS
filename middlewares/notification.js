module.exports = function(req, res, next) {
    ["success", "error"].forEach(function(e) {
        if (req.session[e]) {
            res.locals[e] = req.session[e];
            delete req.session[e];
        }
    });
    next();
};
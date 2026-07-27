"use strict";

module.exports = function (req, res, next) {
  for (const type of ["success", "error"]) {
    if (req.session[type]) {
      res.locals[type] = req.session[type];
      delete req.session[type];
    }
  }
  next();
};

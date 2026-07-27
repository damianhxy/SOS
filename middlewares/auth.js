"use strict";

module.exports = function (req, res, next) {
  if (req.isAuthenticated()) return next();
  console.error("Unauthorized access attempt");
  res.status(401).redirect("/");
};

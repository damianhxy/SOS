"use strict";

const fs = require("fs");
const { body, validationResult } = require("express-validator");

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    const message = errors
      .array()
      .map((e) => e.msg)
      .join("; ");
    req.session.error = message;
    // Express 5 no longer treats "back" specially; this is what it used to mean.
    return res.status(400).redirect(req.get("Referrer") || "/");
  }
  next();
}

const validateSignup = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Username must be between 3 and 50 characters")
    .isAlphanumeric()
    .withMessage("Username must contain only letters and numbers"),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  handleValidationErrors,
];

const validateSignin = [
  body("username").trim().notEmpty().withMessage("Username is required"),
  body("password").notEmpty().withMessage("Password is required"),
  handleValidationErrors,
];

const validateEditPassword = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPass").isLength({ min: 8 }).withMessage("New password must be at least 8 characters"),
  body("newPass2").custom((value, { req }) => {
    if (value !== req.body.newPass) {
      throw new Error("New passwords do not match");
    }
    return true;
  }),
  handleValidationErrors,
];

const validateUpload = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("File name is required and must be under 200 characters"),
  body("description")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("Description must be under 1000 characters"),
  body("totalShares")
    .isInt({ min: 2, max: 100 })
    .withMessage("Total shares must be between 2 and 100"),
  body("minimumShares")
    .isInt({ min: 2 })
    .withMessage("Minimum shares must be at least 2")
    .custom((value, { req }) => {
      if (parseInt(value, 10) > parseInt(req.body.totalShares, 10)) {
        throw new Error("Minimum shares cannot exceed total shares");
      }
      return true;
    }),
  body("expiration")
    .matches(/^(\d+ [smhdwy]|N)$/)
    .withMessage("Invalid expiration value"),
  handleValidationErrors,
];

const validateDecrypt = [
  body("shares")
    .trim()
    .notEmpty()
    .withMessage("Shares are required")
    .custom((value) => {
      const shares = value.split(/\s+/).filter((s) => s.length > 0);
      if (shares.length < 2) {
        throw new Error("At least 2 shares are required");
      }
      return true;
    }),
  handleValidationErrors,
];

module.exports = {
  validateSignup,
  validateSignin,
  validateEditPassword,
  validateUpload,
  validateDecrypt,
};

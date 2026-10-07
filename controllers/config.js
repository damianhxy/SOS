"use strict";

const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const passport = require("passport");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const exphbs = require("express-handlebars");
const { csrfSync } = require("csrf-sync");
const LocalStrategy = require("passport-local");
const SQLiteStore = require("better-sqlite3-session-store")(session);
const methodOverride = require("method-override");
const db = require("../models/db.js");
const settings = require("./settings.js");
const userModel = require("../models/user.js");

module.exports = function (app) {
  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(compression());
  app.use(express.static("public"));
  app.use(morgan("short"));
  app.use(cookieParser(settings.SECRET));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(
    session({
      secret: settings.SECRET,
      resave: false,
      saveUninitialized: false,
      store: new SQLiteStore({
        client: db,
        expired: {
          clear: true,
          intervalMs: 900000,
        },
      }),
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );
  app.use(methodOverride("_method"));
  app.use(passport.initialize());
  app.use(passport.session());

  // CSRF protection. Multipart bodies are only parsed by multer inside the upload
  // route (POST /files), which checks the token itself; every other request,
  // multipart or not, is checked here.
  const csrfProtection = csrfSync({
    getTokenFromRequest: function (req) {
      return (
        (req.body && req.body._csrf) ||
        (req.query && req.query._csrf) ||
        req.headers["x-csrf-token"]
      );
    },
  });
  app.use(function (req, res, next) {
    if (req.method === "POST" && req.path === "/files" && req.is("multipart/form-data")) {
      return next();
    }
    return csrfProtection.csrfSynchronisedProtection(req, res, next);
  });
  app.use(function (req, res, next) {
    res.locals.csrfToken = csrfProtection.generateToken(req);
    next();
  });

  // Make base URL available to all views
  app.use((req, res, next) => {
    res.locals.baseUrl = settings.BASE_URL;
    next();
  });

  // Passport strategies
  passport.use(
    "local-signin",
    new LocalStrategy({ passReqToCallback: true }, (req, username, password, done) => {
      try {
        const user = userModel.authenticate(username, password);
        console.log("Signed in user", user.username);
        done(null, user);
      } catch (err) {
        console.error(err.message);
        req.session.error = err.message;
        done(null, false);
      }
    }),
  );

  passport.use(
    "local-signup",
    new LocalStrategy({ passReqToCallback: true }, (req, username, password, done) => {
      try {
        const user = userModel.add(username, password);
        console.log("Signed up user", user.username);
        done(null, user);
      } catch (err) {
        console.error(err.message);
        req.session.error = err.message;
        done(null, false);
      }
    }),
  );

  // Serialization
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((id, done) => {
    try {
      const user = userModel.get(id);
      done(null, user);
    } catch (err) {
      done(err, false);
    }
  });

  // View engine
  const hbs = exphbs.create({
    defaultLayout: "default",
  });

  app.enable("case sensitive routing");
  app.enable("strict routing");
  app.disable("x-powered-by");
  app.engine("handlebars", hbs.engine);
  app.set("view engine", "handlebars");
};

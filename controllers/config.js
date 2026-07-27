"use strict";

const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const passport = require("passport");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const exphbs = require("express-handlebars");
const LocalStrategy = require("passport-local");
const SQLiteStore = require("better-sqlite3-session-store")(session);
const methodOverride = require("method-override");
const crypto = require("crypto");
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

  // CSRF protection - generate token on GET, validate on POST/PUT/DELETE
  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
      res.locals.csrfToken = req.session.csrfToken;
      return next();
    }

    const token = req.headers["x-csrf-token"] || req.body?._csrf || req.query?._csrf;
    if (!token || !req.session.csrfToken || token !== req.session.csrfToken) {
      return res.status(403).send("Invalid or missing CSRF token.");
    }

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

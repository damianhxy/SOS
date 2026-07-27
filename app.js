"use strict";

const fs = require("fs");
const path = require("path");
require("dotenv").config();

const express = require("express");
const app = express();
const settings = require("./controllers/settings.js");

const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

require("./controllers/config.js")(app, express);
app.use(require("./controllers/routes.js"));

app.listen(settings.PORT, () => {
  console.info(`Listening on port ${settings.PORT} in ${app.get("env")} mode.`);
});

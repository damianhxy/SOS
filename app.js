"use strict";

require("dotenv").config();

const express = require("express");
const app = express();
const settings = require("./controllers/settings.js");

require("./controllers/config.js")(app, express);
app.use(require("./controllers/routes.js"));

app.listen(settings.PORT, () => {
  console.info(`Listening on port ${settings.PORT} in ${app.get("env")} mode.`);
});

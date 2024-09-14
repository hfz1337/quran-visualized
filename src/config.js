const sqlite3 = require("sqlite3").verbose();

const config = {
  db: new sqlite3.Database("./data/text.sqlite3.db"),
  fontDir: "./data/fonts",
  audioDir: "./data/audio",
  width: 1080,
  height: 1920,
  fontSize: 90,
  textFgColor: "rgba(0, 0, 0, 1)",
  textBgColor: "rgba(255, 255, 255, 0.75)",
  textHeight: 150,
  maxTextWidth: 1000,
  smallGlyphMaxSize: 5,
};

module.exports = { config };

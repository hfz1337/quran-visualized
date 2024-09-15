const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

const config = {
  db: new sqlite3.Database("./data/text.sqlite3.db"),
  chapters: JSON.parse(fs.readFileSync("./data/chapters.json")),
  fontDir: "./data/fonts",
  audioDir: "./data/audio",
  width: 1080,
  height: 1920,
  fontSize: 90,
  textFgColor: "rgba(255, 255, 255, 1)",
  textBgColor: "rgba(255, 255, 255, 0)",
  textHeight: 150,
  maxTextWidth: 1000,
  smallGlyphMaxSize: 5,
};

module.exports = { config };

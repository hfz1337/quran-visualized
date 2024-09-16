const {
  trimAudio,
  makeVideo,
  createWaterMark,
  getAyahChunks,
} = require("./utils");
const yargs = require("yargs");
const fs = require("fs");
const tmp = require("tmp");
const path = require("path");
const { config } = require("./config");

const generateVideo = async (reciter, sura, ayahRange, background, output) => {
  let chunks = [];

  for (var ayah = ayahRange.start; ayah <= ayahRange.end; ayah++) {
    let segments = JSON.parse(
      fs.readFileSync(`${config.audioDir}/${reciter}/${sura}.json`),
    );
    let verseTimings = segments.audio_files[0].verse_timings;
    chunks = chunks.concat(await getAyahChunks(sura, ayah, verseTimings));
  }

  // Prepare the audio
  let trimmedAudio = tmp.tmpNameSync().concat(".mp3");
  await trimAudio(
    `${config.audioDir}/${reciter}/${sura}.mp3`,
    trimmedAudio,
    chunks[0].timeStart,
    chunks[chunks.length - 1].timeEnd,
  );

  // Create watermark
  let watermarkPath = createWaterMark(sura, ayahRange);

  // Create the video
  await makeVideo(trimmedAudio, background, watermarkPath, chunks, output);

  // Cleanup audio
  fs.unlinkSync(trimmedAudio);
};

const argv = yargs
  .version("1.0.0")
  .option("reciter", {
    alias: "r",
    description: "Reciter ID (integer)",
    type: "number",
    demandOption: true,
  })
  .option("sura", {
    alias: "s",
    description: "Sura number (integer)",
    type: "number",
    demandOption: true,
  })
  .option("ayah", {
    alias: "a",
    description: "Ayah number (single or range)",
    type: "string",
    demandOption: true,
  })
  .option("background", {
    alias: "b",
    description: "Path to the background image or video",
    type: "string",
    demandOption: true,
  })
  .option("output", {
    alias: "o",
    description: "Path to the output mp4 file",
    type: "string",
    demandOption: true,
  })
  .help()
  .alias("help", "h").argv;

let ayahRange;
if (argv.ayah.includes("-")) {
  const [start, end] = argv.ayah.split("-").map(Number);
  ayahRange = { start, end };
} else {
  ayahRange = { start: Number(argv.ayah), end: Number(argv.ayah) };
}

if (!fs.existsSync(argv.background)) {
  console.error(`Background file not found: ${argv.background}`);
  process.exit(1);
}

const outputDir = path.dirname(argv.output);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

generateVideo(
  argv.reciter,
  argv.sura,
  ayahRange,
  argv.background,
  argv.output,
).then(() => {
  console.log(`Video saved to ${argv.output}`);
});

const fs = require("fs");
const he = require("he");
const mktemp = require("mktemp");
const { registerFont, createCanvas } = require("canvas");
const ffmpeg = require("fluent-ffmpeg");
const { config } = require("./config");

/**
 * Register fonts.
 */
const registerQuranFonts = async (page) => {
  const fontPath = `${config.fontDir}/QCF_P${String(page).padStart(3, "0")}.TTF`;
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family: `QuranFont_${page}` });
  }
};

/**
 * Trims the audio from the specified start and end times.
 */
const trimAudio = async (audioPath, outFile, timeStart, timeEnd) => {
  return new Promise((resolve, reject) => {
    let command = ffmpeg();
    command
      .input(audioPath)
      .setStartTime(timeStart / 1000)
      .setDuration((timeEnd - timeStart) / 1000)
      .output(outFile)
      .audioCodec("copy")
      .on("end", () => {
        resolve();
      })
      .on("error", (err) => {
        console.error("Error:", err.message);
        reject(err);
      })
      .run();
  });
};

/**
 * Split the text into chunks based on width.
 */
const wrapText = (ctx, text, maxWidth) => {
  const tmp = Array.from(text); // Separate the characters into an array
  let words = [];
  let idx = 0;

  // Break down text into words based on spaces and other small elements
  while (idx < tmp.length) {
    let word = tmp[idx];
    idx++;
    // Merge characters into words until encountering a space or an element smaller
    // than a certain width
    while (
      idx < tmp.length &&
      (tmp[idx] === " " ||
        ctx.measureText(tmp[idx]).width < config.smallGlyphMaxSize)
    ) {
      word += tmp[idx];
      idx++;
    }
    words.push(word);
  }

  // Now, handle line breaking based on the max width
  let lines = [];
  let line = [];

  words.forEach((word) => {
    line.push(word);
    let joinedLine = line.join("");
    let width = ctx.measureText(joinedLine).width;

    // Handle cases with small-width characters at the end of the line
    if (
      ctx.measureText(joinedLine.trim().slice(-1)).width <
      config.smallGlyphMaxSize
    ) {
      lines.push(line);
      line = [];
    } else if (width > maxWidth) {
      // If the line exceeds max width, push the previous line and start a new one
      line.pop(); // Remove the last word from the current line
      lines.push([...line]); // Push the current line
      line = [word]; // Start a new line with the current word
    }
  });

  if (line.length > 0) lines.push([...line]); // Push the last line if there is one

  // Convert lines into objects with the word indices and joined text
  let wordEnd = -1;
  lines = lines.map((line) => {
    let wordStart = wordEnd + 1;
    wordEnd = wordStart + line.length - 1;
    return {
      wordStart,
      wordEnd,
      text: line.join(""),
    };
  });

  // Move the end of Ayah marker if it is on its own
  if (lines[lines.length - 1].text.length == 1) {
    let lastLine = lines.pop();
    lines[lines.length - 1].text += lastLine.text;
  }
  return lines;
};

/**
 * Create the watermark overlay containing the Sura name in Uthmani script.
 */
const createWaterMark = (sura, ayahRange) => {
  let canvas = createCanvas(config.width, config.height, "svg");
  let ctx = canvas.getContext("2d");

  registerFont(`${config.fontDir}/sura_names.ttf`, { family: "sura_names" });
  registerFont(`${config.fontDir}/Fondamento-Regular.ttf`, {
    family: "Fondamento",
  });

  canvas = createCanvas(config.width, config.height, "svg");
  ctx = canvas.getContext("2d");
  ctx.font = "100px sura_names";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(
    he.decode(`&#xE${sura.toString().padStart(3, "0")};&#xE000;`),
    config.width / 2 - 14,
    config.height / 5,
  );

  ctx.font = "36px Fondamento";
  ctx.fillText(
    config.chapters[sura]
      .concat("  ")
      .concat(
        ayahRange.start === ayahRange.end
          ? ayahRange.start.toString()
          : `${ayahRange.start}-${ayahRange.end}`,
      ),
    config.width / 2,
    config.height / 5 + 120,
  );

  const imagePath = mktemp.createFileSync("/tmp/XXXXXXXX.svg", { dryRun: true });
  const svgData = canvas.toBuffer();
  fs.writeFileSync(imagePath, svgData);
  return imagePath;
};

/**
 * Create translation overlay with text wrapping.
 */
const createTranslationOverlay = (sura, ayah) => {
  let canvas = createCanvas(config.width, config.height, "svg");
  let ctx = canvas.getContext("2d");

  registerFont(`${config.fontDir}/Fondamento-Regular.ttf`, {
    family: "Fondamento",
  });

  canvas = createCanvas(config.width, config.height, "svg");
  ctx = canvas.getContext("2d");
  ctx.font = "40px Fondamento";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = config.textFgColor;

  let text = config.translation[sura][ayah];
  let maxWidth = 1000;
  let lineHeight = 40;

  // Function to split text into lines based on the max width
  const getLines = (ctx, text, maxWidth) => {
    let words = text.split(" ");
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      let word = words[i];
      let width = ctx.measureText(currentLine + " " + word).width;
      if (width < maxWidth) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  };

  // Get the lines to fit the text within the 900px width
  let lines = getLines(ctx, text, maxWidth);

  // Calculate the starting y-coordinate to center the block of text
  let startY = config.height / 2 + 360 - ((lines.length - 1) * lineHeight) / 2;

  // Render each line of text
  lines.forEach((line, index) => {
    ctx.fillText(line, config.width / 2, startY + index * lineHeight);
  });

  const imagePath = `/tmp/sura_${sura}_ayah_${ayah}_translation.svg`;
  const svgData = canvas.toBuffer();
  fs.writeFileSync(imagePath, svgData);
  return imagePath;
};

/**
 * Get the Ayah chunks (an SVG will be written for each chunk).
 */
const getAyahChunks = async (sura, ayah, verseTimings) => {
  return new Promise((resolve, reject) => {
    config.db.get(
      "SELECT page, text FROM sura_ayah_page_text WHERE sura = ? AND ayah = ?",
      [sura, ayah],
      async (err, row) => {
        if (err) reject(err);

        // Handle extra spaces based on madani_page_text
        let { page, text } = row;
        text = he.decode(text);

        // Get extra spaces from madani_page_text
        config.db.all(
          "SELECT text FROM madani_page_text WHERE sura = ? AND ayah = ?",
          [sura, ayah],
          async (err, rows) => {
            if (err) reject(err);

            rows.slice(0, -1).forEach(({ text: line }) => {
              line = he.decode(line);
              text = text.replace(line.slice(-1), line.slice(-1) + "  ");
            });

            await registerQuranFonts(page);

            let canvas = createCanvas(config.width, config.height, "svg");
            let ctx = canvas.getContext("2d");

            // Register font
            ctx.font = `${config.fontSize}px QuranFont_${page}`;

            // Split the text into lines
            const lines = wrapText(ctx, text, config.maxTextWidth);
            const segments = verseTimings[ayah - 1].segments;
            const chunks = [];

            // Merge segments where the reciter repeats words
            let mergedSegments = [];
            segments.forEach((segment) => {
              if (
                mergedSegments.length > 0 &&
                mergedSegments[mergedSegments.length - 1][0] >= segment[0]
              ) {
                mergedSegments[mergedSegments.length - 1][2] = segment[2];
              } else {
                mergedSegments.push(segment);
              }
            });

            lines.forEach((line) => {
              const timeStart = mergedSegments[line.wordStart][1];
              const timeEnd =
                line.wordEnd < mergedSegments.length
                  ? mergedSegments[line.wordEnd][2]
                  : mergedSegments[mergedSegments.length - 1][2];
              const imagePath = `/tmp/sura_${sura}_ayah_${ayah}_from_${timeStart}_to_${timeEnd}.svg`;

              canvas = createCanvas(config.width, config.height, "svg");
              ctx = canvas.getContext("2d");
              ctx.font = `${config.fontSize}px QuranFont_${page}`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";

              // Draw rectangle with padding around the text
              ctx.fillStyle = config.textBgColor;
              ctx.fillRect(
                0,
                (config.height - config.textHeight) / 2,
                config.width,
                config.textHeight,
              );

              // Draw text onto canvas
              ctx.fillStyle = config.textFgColor;
              ctx.fillText(line.text, config.width / 2, config.height / 2);

              // Save the image as SVG
              const svgData = canvas.toBuffer();
              fs.writeFileSync(imagePath, svgData);

              chunks.push({ imagePath, timeStart, timeEnd });
            });

            // Create translation overlays
            const translationOverlayPath = createTranslationOverlay(sura, ayah);
            const { timestamp_from, timestamp_to } = verseTimings[ayah - 1];
            chunks.push({
              imagePath: translationOverlayPath,
              timeStart: timestamp_from,
              timeEnd: timestamp_to,
            });

            resolve(chunks);
          },
        );
      },
    );
  });
};

/**
 * Assemble the video.
 */
const makeVideo = async (
  audioPath,
  backgroundPath,
  watermarkPath,
  chunks,
  outFile,
) => {
  return new Promise((resolve, reject) => {
    let translations = [];
    for (var i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i].imagePath.includes("translation")) {
        translations.push(chunks.pop());
      }
    }
    chunks.push(...translations);

    const videoDuration = Math.ceil(
      (chunks[chunks.length - 1].timeEnd - chunks[0].timeStart) / 1000,
    );
    let command = ffmpeg();
    let complexFilter = [];
    let index = 3;
    let videoStream = "[tmp1]";

    command = command
      .input(audioPath)
      .input(backgroundPath)
      .inputOptions(["-stream_loop -1", `-t ${videoDuration}`])
      .input(watermarkPath)
      .inputOptions(["-loop 1", `-t ${videoDuration}`]);
    complexFilter.push("[2:v]scale=1080:1920[watermark]");
    complexFilter.push("[tmp0][watermark]overlay=0:0[tmp1]");

    chunks.forEach((chunk) => {
      command = command
        .input(chunk.imagePath)
        .inputOptions(["-loop 1", `-t ${videoDuration}`]);
      complexFilter.push(
        `[${index}:v]scale=1080:1920,fade=t=in:st=${(chunk.timeStart - chunks[0].timeStart) / 1000}:d=0.5:alpha=1,fade=t=out:st=${(chunk.timeEnd - chunks[0].timeStart) / 1000 - 0.5}:d=0.5:alpha=1[ov${index - 1}]`,
      );
      complexFilter.push(
        `${videoStream}[ov${index - 1}]overlay=0:0:enable='between(t,${(chunk.timeStart - chunks[0].timeStart) / 1000},${(chunk.timeEnd - chunks[0].timeStart) / 1000})'[tmp${index - 1}]`,
      );
      videoStream = `[tmp${index - 1}]`;
      index++;
    });
    complexFilter = complexFilter
      .filter((_, i) => i % 2 === 0)
      .concat(complexFilter.filter((_, i) => i % 2 !== 0));
    complexFilter = ["[1:v]scale=1080:1920[tmp0]"].concat(complexFilter);

    command
      .complexFilter(complexFilter)
      .outputOptions("-map", videoStream)
      .outputOptions("-map", "0:a?")
      .outputOptions("-c:v", "libx264")
      .outputOptions("-crf", "18")
      .outputOptions("-preset", "slow")
      .outputOptions("-c:a", "copy")
      .output(outFile)
      .on("end", () => {
        chunks.forEach((chunk) => {
          fs.unlinkSync(chunk.imagePath);
        });
        fs.unlinkSync(watermarkPath);
        resolve();
      })
      .on("error", (err) => {
        console.error("Error:", err.message);
        reject(err);
      })
      .run();
  });
};

module.exports = {
  trimAudio,
  wrapText,
  makeVideo,
  createWaterMark,
  getAyahChunks,
};

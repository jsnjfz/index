import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";

const workdir = resolve(".");
const rendersDir = resolve(workdir, "renders");
const mp4Path = resolve(rendersDir, "homepage-preview-source.mp4");
const gifPath = resolve(workdir, "..", "homepage-preview.gif");
const palettePath = resolve(rendersDir, "homepage-preview-palette.png");
const ffmpegDir = dirname(ffmpegPath);
const ffprobeDir = dirname(ffprobePath.path);
const mergedPath = `${ffprobeDir};${ffmpegDir};${process.env.Path ?? process.env.PATH ?? ""}`;

mkdirSync(rendersDir, { recursive: true });

const run = (command, args, label) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: workdir,
    shell: process.platform === "win32",
    env: {
      ...process.env,
      FFMPEG_PATH: ffmpegPath,
      FFPROBE_PATH: ffprobePath.path,
      PATH: mergedPath,
      Path: mergedPath,
    },
  });

  if (result.status !== 0) {
    throw new Error(`${label} 失败，退出码 ${result.status ?? "unknown"}`);
  }
};

run("node", [
  resolve(workdir, "node_modules", "hyperframes", "dist", "cli.js"),
  "render",
  "-f",
  "30",
  "-q",
  "high",
  "-o",
  mp4Path,
], "HyperFrames 渲染 MP4");

run(ffmpegPath, [
  "-y",
  "-i",
  mp4Path,
  "-vf",
  "fps=12,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff",
  "-frames:v",
  "1",
  "-update",
  "1",
  palettePath,
], "生成 GIF 调色板");

run(ffmpegPath, [
  "-y",
  "-i",
  mp4Path,
  "-i",
  palettePath,
  "-lavfi",
  "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a",
  "-loop",
  "0",
  gifPath,
], "输出 README GIF");

console.log(`已输出中间 MP4: ${mp4Path}`);
console.log(`已输出 GIF: ${gifPath}`);

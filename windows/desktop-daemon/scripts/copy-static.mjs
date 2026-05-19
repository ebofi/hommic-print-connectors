import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import pngToIco from "png-to-ico";

const root = process.cwd();
const copies = [
  {
    source: join(root, "src", "renderer", "index.html"),
    destination: join(root, "dist", "renderer", "index.html"),
  },
  {
    source: join(root, "src", "renderer", "styles", "globals.css"),
    destination: join(root, "dist", "renderer", "globals.css"),
  },
  {
    source: join(root, "..", "frontend", "public", "hommic", "logo.png"),
    destination: join(root, "dist", "renderer", "assets", "hommic-logo.png"),
  },
  {
    source: join(root, "..", "frontend", "logo", "softwarelogo.png"),
    destination: join(root, "dist", "renderer", "assets", "softwarelogo.png"),
  },
];

for (const entry of copies) {
  const targetDirectory = dirname(entry.destination);
  if (!existsSync(targetDirectory)) {
    mkdirSync(targetDirectory, { recursive: true });
  }
  writeFileSync(entry.destination, readFileSync(entry.source));
}

const buildDirectory = join(root, "build");
if (!existsSync(buildDirectory)) {
  mkdirSync(buildDirectory, { recursive: true });
}

const generatedIconDirectory = join(buildDirectory, "generated-icons");
if (!existsSync(generatedIconDirectory)) {
  mkdirSync(generatedIconDirectory, { recursive: true });
}

const iconSizes = [16, 24, 32, 48, 64, 128, 256];

for (const size of iconSizes) {
  const iconPng = join(generatedIconDirectory, `icon-${size}.png`);
  const drawingCommand = [
    "Add-Type -AssemblyName System.Drawing",
    `$bitmap = New-Object System.Drawing.Bitmap(${size}, ${size})`,
    "$graphics = [System.Drawing.Graphics]::FromImage($bitmap)",
    "$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias",
    "$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit",
    `$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#ee1846'))`,
    "$fontSize = [Math]::Round(" + size + " * 0.62)",
    "$font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)",
    "$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)",
    "$stringFormat = New-Object System.Drawing.StringFormat",
    "$stringFormat.Alignment = [System.Drawing.StringAlignment]::Center",
    "$stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center",
    `$layout = New-Object System.Drawing.RectangleF(0, ${Math.round(size * 0.04)}, ${size}, ${size})`,
    "$graphics.DrawString('h', $font, $brush, $layout, $stringFormat)",
    `$bitmap.Save('${iconPng.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`,
    "$brush.Dispose()",
    "$font.Dispose()",
    "$graphics.Dispose()",
    "$bitmap.Dispose()",
  ].join("; ");

  execFileSync("powershell.exe", ["-NoProfile", "-Command", drawingCommand], {
    stdio: "inherit",
  });
}

const iconDestination = join(buildDirectory, "icon.ico");
const iconBuffers = iconSizes.map((size) => readFileSync(join(generatedIconDirectory, `icon-${size}.png`)));
const iconBytes = await pngToIco(iconBuffers);
writeFileSync(iconDestination, iconBytes);

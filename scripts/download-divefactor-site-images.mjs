import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const PACKAGE_DIR = join(
  REPO_ROOT,
  "docs",
  "clients",
  "dive-factor-underwater-services",
  "07_WEBSITE_SEO",
  "STATIC_SITE_PACKAGE",
);
const OUTPUTS = [
  {
    title: "File:Scuba Diver - Ahmad Faiz Mustafa.jpg",
    out: "images/site/home-hero.jpg",
    width: 2200,
    alt: "Scuba diver preparing gear beside the water",
    creditLabel: "Homepage hero / brand hero",
  },
  {
    title: "File:Lake of the Woods boat dock, Klamath County, Oregon.jpg",
    out: "images/site/underwater-services.jpg",
    width: 2200,
    alt: "Boat dock extending into a mountain lake",
    creditLabel: "Underwater services hero",
  },
  {
    title: "File:Retired Marine Teaches Scuba Diving Lessons DVIDS187529.jpg",
    out: "images/site/dive-training.jpg",
    width: 2200,
    alt: "Instructor leading scuba training in the water",
    creditLabel: "Dive training hero",
  },
  {
    title: "File:Bubbles made by divers.jpg",
    out: "images/site/aquatic-programs.jpg",
    width: 2200,
    alt: "Divers underwater with rising bubbles and blue light",
    creditLabel: "Aquatic programs hero",
  },
  {
    title: "File:374 AW leadership, front office personnel attend CPR-AED course (9053932).jpg",
    out: "images/site/safety-training.jpg",
    width: 2200,
    alt: "CPR and AED training in progress on a mannequin",
    creditLabel: "Safety training hero",
  },
  {
    title: "File:Lifeguard Training.jpg",
    out: "images/site/aquatic-staff-training.jpg",
    width: 2200,
    alt: "Lifeguard training session at the water",
    creditLabel: "Aquatic staff training hero",
  },
  {
    title: "File:Lake Chabot marina 6.jpg",
    out: "images/resources/below-waterline-guide.jpg",
    width: 1800,
    alt: "Lake marina and dock area viewed from shore",
    creditLabel: "Below-waterline inspection article",
  },
  {
    title: "File:Bubbles made by divers.jpg",
    out: "images/resources/camp-scuba-experience-guide.jpg",
    width: 1800,
    alt: "Blue underwater bubbles rising through the water",
    creditLabel: "Camp scuba experience article",
  },
  {
    title: "File:374 AW leadership, front office personnel attend CPR-AED course (9053932).jpg",
    out: "images/resources/aquatic-staff-cpr-guide.jpg",
    width: 1800,
    alt: "Hands demonstrating CPR and AED training on a mannequin",
    creditLabel: "Aquatic staff CPR / first aid / oxygen article",
  },
  {
    title: "File:Retired Marine Teaches Scuba Diving Lessons DVIDS187529.jpg",
    out: "images/resources/scuba-training-options.jpg",
    width: 1800,
    alt: "Scuba instruction taking place in clear water",
    creditLabel: "Scuba training options article",
  },
];

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function download(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }
    if (response.status !== 429 || attempt === 4) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    await sleep(1500 * attempt);
  }
}

function plain(metaField) {
  return String(metaField?.value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveImage(title, width) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&titles=" +
    encodeURIComponent(title) +
    `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${width}&format=json&origin=*`;
  const data = await fetchJson(url);
  const page = Object.values(data.query.pages)[0];
  const info = page.imageinfo[0];
  return {
    title,
    imageUrl: info.thumburl || info.url,
    sourceUrl: info.descriptionurl,
    author: plain(info.extmetadata.Artist),
    credit: plain(info.extmetadata.Credit),
    license: plain(info.extmetadata.LicenseShortName),
    licenseUrl: plain(info.extmetadata.LicenseUrl),
    description: plain(info.extmetadata.ImageDescription),
  };
}

async function main() {
  const credits = [];

  for (const item of OUTPUTS) {
    const target = join(PACKAGE_DIR, item.out);
    mkdirSync(dirname(target), { recursive: true });
    const resolved = await resolveImage(item.title, item.width);
    if (!existsSync(target)) {
      const imageBytes = await download(resolved.imageUrl);
      writeFileSync(target, imageBytes);
      await sleep(600);
    }
    credits.push({
      ...item,
      ...resolved,
    });
  }

  const creditsPath = join(
    REPO_ROOT,
    "docs",
    "clients",
    "dive-factor-underwater-services",
    "07_WEBSITE_SEO",
    "IMAGE_CREDITS.md",
  );

  const lines = [
    "# Image Credits",
    "",
    "All site images were downloaded locally and are not hotlinked.",
    "",
  ];

  for (const item of credits) {
    lines.push(`## ${item.creditLabel}`);
    lines.push("");
    lines.push(`- Local file: \`${item.out}\``);
    lines.push(`- Source page: ${item.sourceUrl}`);
    lines.push(`- Original file: ${item.title}`);
    lines.push(`- Author / credit: ${item.author || item.credit || "Not stated"}`);
    lines.push(`- License: ${item.license || "Not stated"}`);
    if (item.licenseUrl) {
      lines.push(`- License URL: ${item.licenseUrl}`);
    }
    lines.push(`- Description: ${item.description || "No description provided."}`);
    lines.push(`- Alt text used: ${item.alt}`);
    lines.push("");
  }

  writeFileSync(creditsPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`downloaded images: ${credits.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

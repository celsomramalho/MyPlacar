import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@400;600;700;800;900&display=swap';
const FONTS_DIR = path.resolve(__dirname, '../public/fonts');

async function downloadFonts() {
  console.log('Fetching CSS from Google Fonts...');
  
  // A modern User-Agent is required to get WOFF2 files from Google Fonts
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  
  const response = await fetch(GOOGLE_FONTS_URL, {
    headers: {
      'User-Agent': userAgent
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Google Fonts CSS: ${response.statusText}`);
  }
  
  let cssText = await response.text();
  console.log('CSS fetched successfully.');
  
  if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
    console.log(`Created fonts directory: ${FONTS_DIR}`);
  }
  
  // Find all font URLs and local definitions
  // Format: src: url(https://fonts.gstatic.com/s/outfit/v11/O7gfFz0vToQ...woff2) format('woff2');
  const urlRegex = /url\((https:\/\/fonts\.gstatic\.com\/s\/[^\)]+)\)/g;
  const urls = [];
  let match;
  while ((match = urlRegex.exec(cssText)) !== null) {
    urls.push(match[1]);
  }
  
  console.log(`Found ${urls.length} font files to download.`);
  
  const urlToFilenameMap = new Map();
  
  for (const url of urls) {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split('/');
    const fontSubdir = pathParts[2]; // e.g. 'inter' or 'outfit'
    const fontVersion = pathParts[3]; // e.g. 'v20'
    const originalFilename = pathParts[4]; // e.g. UcC73...woff2
    
    // Create a clean filename: e.g. inter-v20-UcC73...woff2
    const localFilename = `${fontSubdir}-${fontVersion}-${originalFilename}`;
    const destinationPath = path.join(FONTS_DIR, localFilename);
    
    urlToFilenameMap.set(url, `/fonts/${localFilename}`);
    
    if (fs.existsSync(destinationPath)) {
      console.log(`File already exists: ${localFilename}`);
      continue;
    }
    
    console.log(`Downloading ${url} -> ${localFilename}...`);
    const fileResponse = await fetch(url);
    if (!fileResponse.ok) {
      console.error(`Failed to download ${url}`);
      continue;
    }
    
    const arrayBuffer = await fileResponse.arrayBuffer();
    fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer));
  }
  
  // Rewrite CSS to point to local files
  let localCssText = cssText;
  for (const [remoteUrl, localUrl] of urlToFilenameMap.entries()) {
    localCssText = localCssText.split(remoteUrl).join(localUrl);
  }
  
  const cssOutputPath = path.resolve(__dirname, '../public/fonts.css');
  fs.writeFileSync(cssOutputPath, localCssText);
  console.log(`Saved local fonts CSS to: ${cssOutputPath}`);
  
  console.log('\nDone! Add this link to your index.html:');
  console.log('<link rel="stylesheet" href="/fonts.css">');
}

downloadFonts().catch(err => {
  console.error('Error downloading fonts:', err);
});

import fs from 'fs';
import path from 'path';
import https from 'https';

const bgmUrl = 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Kai_Engel/Satin/Kai_Engel_-_04_-_Sentinel.mp3';
const destPath = path.join(process.cwd(), 'assets', 'bgm', 'sentinel.mp3');

if (!fs.existsSync(path.dirname(destPath))) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
}

const file = fs.createWriteStream(destPath);
https.get(bgmUrl, (response) => {
  response.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('BGM downloaded successfully to', destPath);
  });
}).on('error', (err) => {
  fs.unlink(destPath, () => {});
  console.error('Error downloading BGM:', err.message);
});

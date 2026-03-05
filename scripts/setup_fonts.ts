import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

const fontsDir = path.join(process.cwd(), 'fonts');

if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
}

const fonts = [
    // Chinese
    // Noto Sans TC (Variable Font)
    { name: 'NotoSansTC-Bold.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf' },
    // Noto Serif TC (Variable Font)
    { name: 'NotoSerifTC-Bold.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf' },
    { name: 'ZCOOLKuaiLe-Regular.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf' },
    // English
    // Roboto (Variable Font)
    { name: 'Roboto-Bold.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Bold.ttf' },
    { name: 'Anton-Regular.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf' },
    { name: 'Bangers-Regular.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/bangers/Bangers-Regular.ttf' }
];

async function downloadFile(url: string, dest: string) {
    if (fs.existsSync(dest)) {
        console.log(`Font already exists: ${path.basename(dest)}`);
        return;
    }
    console.log(`Downloading ${path.basename(dest)}...`);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to download ${url}: ${res.statusText}`);
        // @ts-ignore
        const fileStream = fs.createWriteStream(dest);
        // @ts-ignore
        await finished(Readable.fromWeb(res.body).pipe(fileStream));
        console.log(`Downloaded ${path.basename(dest)}`);
    } catch (error) {
        console.error(`Error downloading ${path.basename(dest)}:`, error);
    }
}

async function main() {
    console.log('Starting font setup...');
    for (const font of fonts) {
        await downloadFile(font.url, path.join(fontsDir, font.name));
    }
    console.log('All fonts setup complete.');
}

main().catch(console.error);

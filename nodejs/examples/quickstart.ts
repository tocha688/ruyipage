import { launch } from '../src/index';

async function main() {
  const page = await launch({ headless: false });
  try {
    await page.get('https://example.com');
    await page.wait(1);
    console.log('Title:', await page.title);

    const h1 = await page.ele('tag:h1');
    console.log('H1 text:', await h1.text);
  } finally {
    await page.wait(1);
    await page.quit();
  }
}

main().catch(console.error);

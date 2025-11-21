import { extractIPFromFilename } from './imageUtils';

/**
 * Test IP extraction with sample filenames
 */
export function testIPExtraction() {
  const testCases = [
    "(_Bathalapalli_Road)_Kadapa_-_Anantapur_Border_10_251_14_7_20251120_212726.jpg",
    "SRI_RAMA_COLONY_10_241_4_39_20251120_221459.jpg",
    "RTC_COMPLEX_10_241_4_20_20251120_221458.jpg"
  ];

  console.log('=== IP Extraction Test ===');
  testCases.forEach(filename => {
    const ip = extractIPFromFilename(filename);
    console.log(`Filename: ${filename}`);
    console.log(`Extracted IP: ${ip || 'FAILED'}`);
    console.log('---');
  });
}


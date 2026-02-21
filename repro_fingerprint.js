
import { plugin } from 'playwright-with-fingerprints';
import fs from 'fs-extra';
import path from 'path';

async function run() {
    const serviceKey = 'dLeV7LSYY387fh9bVhxxxZcQVVQ4kR6eXSzOdnNJRfDj9eQ48be5ljPBzyBvPxfr';
    plugin.setServiceKey(serviceKey);

    const testProfile = './profiles/test_repro';
    await fs.ensureDir(testProfile);
    const fpPath = path.join(testProfile, 'fingerprint.json');

    console.log('1. Fetching NEW fingerprint...');
    let fingerprint = await plugin.fetch({ tags: ['Microsoft Windows', 'Chrome'] });
    console.log('Fetched fingerprint type:', typeof fingerprint);
    
    console.log('2. Saving fingerprint...');
    await fs.outputFile(fpPath, JSON.stringify(fingerprint, null, 2));

    console.log('3. Loading fingerprint back...');
    const loadedData = await fs.readFile(fpPath, 'utf8');
    const loadedFp = JSON.parse(loadedData);


    // FIX CLI: If loadedFp is a string (double-encoded), parse it again?
    // Or if it's just the raw string from fetch, try parsing it to object
    
    console.log('Type of loadedFp:', typeof loadedFp);
    
    if (typeof loadedFp === 'string') {
        try {
            const parsed = JSON.parse(loadedFp);
            console.log('Parsed loadedFp to object. Type:', typeof parsed);
            plugin.useFingerprint(parsed);
             console.log('✅ Success: plugin.useFingerprint accepted the PARSED object.');
             return;
        } catch (e) {
             console.log('Could not parse loadedFp as JSON:', e.message);
        }
    }

    try {
        plugin.useFingerprint(loadedFp);
        console.log('✅ Success: plugin.useFingerprint accepted the loaded JSON (as ' + typeof loadedFp + ').');
    } catch (e) {
        console.error('❌ Failed: plugin.useFingerprint rejected the loaded JSON.');
        console.error('Error:', e.message);
    }
}

run().catch(console.error);

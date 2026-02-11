
import { plugin } from 'playwright-with-fingerprints';
import fs from 'fs-extra';
import path from 'path';

export class BrowserManager {
    constructor(config = {}) {
        this.serviceKey = config.serviceKey || 'dLeV7LSYY387fh9bVhxxxZcQVVQ4kR6eXSzOdnNJRfDj9eQ48be5ljPBzyBvPxfr';
        this.baseDir = config.baseDir || './profiles';
        
        // Configure plugin globally
        plugin.setServiceKey(this.serviceKey);
    }

    async ensureProfile(profileName) {
        const profilePath = path.resolve(this.baseDir, profileName);
        await fs.ensureDir(profilePath);
        return profilePath;
    }

    async cleanProfile(profileName) {
        const profilePath = path.resolve(this.baseDir, profileName);
        if (await fs.pathExists(profilePath)) {
            console.log(`Cleaning up profile at ${profilePath}...`);
            try {
                // Preserve config.json if it exists
                const configPath = path.join(profilePath, 'config.json');
                if (await fs.pathExists(configPath)) {
                    await fs.copy(configPath, `${configPath}.bak`);
                }
                
                await fs.emptyDir(profilePath);
                
                if (await fs.pathExists(`${configPath}.bak`)) {
                    await fs.move(`${configPath}.bak`, configPath);
                }
            } catch (e) {
                console.warn(`Could not remove/restore profile directory: ${e.message}`);
            }
        }
    }

    async getFingerprint(profileName, options = {}) {
        const profilePath = await this.ensureProfile(profileName);
        const fingerprintPath = path.join(profilePath, 'fingerprint.json');
        const configPath = path.join(profilePath, 'config.json');

        // 1. Try to load existing
        if (await fs.pathExists(fingerprintPath)) {
            console.log('Loading saved fingerprint...');
            try {
                const data = await fs.readFile(fingerprintPath, 'utf8');
                if (data && data.length > 20) {
                     // Check if it's a token or JSON
                     console.log(`Fingerprint loaded successfully (Size: ${Math.round(data.length / 1024)} KB)`);
                     return data; // Return raw string (could be token or JSON)
                }
            } catch (e) {
                console.warn('Failed to load saved fingerprint, fetching new one:', e.message);
            }
        }

        // 2. Fetch new
        let tags = options.tags || ['Microsoft Windows', 'Chrome'];
        if (!options.tags && await fs.pathExists(configPath)) {
             try {
                 const config = await fs.readJson(configPath);
                 if (config.tags && Array.isArray(config.tags)) tags = config.tags;
             } catch (e) {}
        }

        console.log(`Fetching NEW Fingerprint with tags: ${JSON.stringify(tags)}`);
        
        let attempts = 0;
        while (attempts < 3) {
            try {
                const fingerprint = await plugin.fetch({ tags });
                
                // Inspect result
                console.log(`[DEBUG] Fetched fingerprint type: ${typeof fingerprint}`);
                if (fingerprint && typeof fingerprint === 'object') {
                    console.log(`[DEBUG] Fingerprint keys: ${Object.keys(fingerprint).join(', ')}`);
                    if (fingerprint.id) {
                        console.log(`[DEBUG] Fingerprint has ID: ${fingerprint.id}`);
                        // Prioritize the ID (token) for saving as it's more stable
                        await fs.outputFile(fingerprintPath, fingerprint.id, 'utf8');
                        return fingerprint.id;
                    }
                }

                // Fallback: stringify the whole thing if no ID
                const fpStr = typeof fingerprint === 'string' ? fingerprint : JSON.stringify(fingerprint);
                console.log(`[DEBUG] Saving full fingerprint data (${Math.round(fpStr.length/1024)} KB)`);
                await fs.outputFile(fingerprintPath, fpStr, 'utf8');
                return fpStr;
            } catch (e) {
                console.error(`Fingerprint fetch attempt ${attempts + 1} failed: ${e.message}`);
                attempts++;
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        throw new Error('Failed to fetch fingerprint after 3 attempts');
    }

    normalizeProxy(proxy) {
        if (!proxy) return null;
        
        // Handle socks5://user:pass:host:port format (common in some providers)
        // Convert to socks5://user:pass@host:port
        const simpleFormatRegex = /^(socks5|http|https):\/\/([^:@]+):([^:@]+):([^:@]+):(\d+)$/i;
        const match = proxy.match(simpleFormatRegex);
        
        if (match) {
            const [_, protocol, user, pass, host, port] = match;
            const normalized = `${protocol.toLowerCase()}://${user}:${pass}@${host}:${port}`;
            console.log(`[BrowserManager] Normalized proxy: ${proxy} -> ${normalized}`);
            return normalized;
        }
        
        return proxy;
    }

    applyProxy(proxyString) {
        const normalized = this.normalizeProxy(proxyString);
        if (normalized) {
            console.log(`Applying proxy: ${normalized}`);
            plugin.useProxy(normalized, {
                changeTimezone: true,
                changeGeolocation: true
            });
        } else {
            console.log('No proxy configured. Clearing proxy settings.');
            plugin.useProxy(null);
        }
    }

    safeParseFingerprint(fpData) {
        if (!fpData) return null;
        
        // If it's already an object, return it (but log for debug)
        if (typeof fpData === 'object') {
            console.log(`[SafeParse] Already an object. Keys: ${Object.keys(fpData).slice(0, 5).join(', ')}...`);
            return fpData;
        }
        
        const trimmed = String(fpData).trim();
        
        // If it starts with '{' it's likely JSON
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                console.log(`[SafeParse] Successfully parsed JSON string. Keys: ${Object.keys(parsed).slice(0, 5).join(', ')}...`);
                return parsed;
            } catch (e) {
                console.warn(`[SafeParse] String starts with '{' but JSON.parse failed: ${e.message}`);
                // Fall through to return raw string
            }
        } else {
            console.log(`[SafeParse] Data does not look like JSON (starts with ${trimmed.substring(0, 5)}). Treating as Token.`);
        }
        
        return fpData;
    }

    async launch(profileName, options = {}) {
        const profilePath = await this.ensureProfile(profileName);
        let {
            headless = false,
            proxy = null,
            fingerprint = null,
            args = []
        } = options;

        const configPath = path.join(profilePath, 'config.json');
        
        // Proxy Persistence Logic
        if (proxy) {
            // New proxy provided -> Normalize and Save it
            const normalizedProxy = this.normalizeProxy(proxy);
            if (normalizedProxy) {
                proxy = normalizedProxy; // Use normalized version
                console.log(`Saving new proxy configuration to profile: ${proxy}`);
                try {
                    const currentConfig = await fs.pathExists(configPath) ? await fs.readJson(configPath) : {};
                    currentConfig.proxy = proxy;
                    await fs.writeJson(configPath, currentConfig, { spaces: 2 });
                } catch (e) {
                    console.warn('Failed to save proxy config:', e.message);
                }
            }
        } else {
            // No proxy provided -> Try to load from config
            try {
                if (await fs.pathExists(configPath)) {
                    const savedConfig = await fs.readJson(configPath);
                    if (savedConfig.proxy) {
                        console.log(`Loaded saved proxy: ${savedConfig.proxy}`);
                        proxy = savedConfig.proxy;
                    }
                }
            } catch (e) {
                console.warn('Failed to load proxy config:', e.message);
            }
        }

        // Apply fingerprint with retry logic
        if (fingerprint) {
             let fpAttempts = 0;
             while (fpAttempts < 2) {
                 try {
                    let fpToUse = fingerprint;
                    
                    // DEBUG: Inspect the fingerprint
                    if (typeof fingerprint === 'string') {
                        console.log(`[DEBUG] Fingerprint is STRING. First 100 chars: ${fingerprint.substring(0, 100)}`);
                    } else if (typeof fingerprint === 'object') {
                        console.log(`[DEBUG] Fingerprint is OBJECT. Keys: ${Object.keys(fingerprint).slice(0, 10).join(', ')}`);
                        if (fingerprint.id) console.log(`[DEBUG] Found ID: ${fingerprint.id}`);
                        if (fingerprint.token) console.log(`[DEBUG] Found Token: ${fingerprint.token}`);
                        if (fingerprint.fingerprint) console.log(`[DEBUG] Has nested 'fingerprint' property (Size of nested: ${JSON.stringify(fingerprint.fingerprint).length})`);
                    }

                    // Attempt 1: Try as-is (but ensure it's processed if object)
                    if (typeof fingerprint === 'object') {
                        if (fingerprint.id) {
                            fpToUse = fingerprint.id;
                        } else if (fingerprint.token) {
                            fpToUse = fingerprint.token;
                        } else if (!fingerprint.fingerprint) {
                            // If it's raw data without a wrapper, try wrapping it
                            console.log('[DEBUG] Raw fingerprint data detected. Wrapping in { fingerprint: ... }');
                            fpToUse = { fingerprint: fingerprint };
                        }
                    }
                    
                    console.log(`[DEBUG] useFingerprint: type=${typeof fpToUse}, length=${(typeof fpToUse === 'string' ? fpToUse.length : JSON.stringify(fpToUse).length)}`);
                    
                    try {
                        plugin.useFingerprint(fpToUse);
                        console.log('[DEBUG] useFingerprint: SUCCESS');
                    } catch (innerError) {
                        console.warn(`[DEBUG] useFingerprint failed with ${typeof fpToUse}: ${innerError.message}. Trying stringified fallback...`);
                        const stringified = typeof fpToUse === 'string' ? fpToUse : JSON.stringify(fpToUse);
                        plugin.useFingerprint(stringified);
                        console.log('[DEBUG] useFingerprint (stringified fallback): SUCCESS');
                    }
                    
                    break; // Success
                } catch (e) {
                    console.error(`Error applying fingerprint (Attempt ${fpAttempts + 1}/2):`, e.message);
                    if (fpAttempts === 0) {
                        console.warn('Fingerprint might be corrupted. Deleting and re-fetching...');
                        try {
                            const fingerprintPath = path.join(profilePath, 'fingerprint.json');
                            await fs.remove(fingerprintPath);
                            // Fetch new one
                            fingerprint = await this.getFingerprint(profileName, { tags: ['Microsoft Windows', 'Chrome'] });
                        } catch (err) {
                            console.error('Failed to refresh fingerprint:', err.message);
                        }
                    } else {
                        throw e; // Fail on second attempt
                    }
                    fpAttempts++;
                }
             }
        }

        // Apply proxy (already normalized if it came from args, or loaded from config)
        console.log(`[DEBUG] applyProxy: proxy=${proxy}`);
        try {
            this.applyProxy(proxy);
            console.log('[DEBUG] applyProxy: SUCCESS');
        } catch (e) {
            console.error(`[DEBUG] applyProxy FAILED: ${e.message}`);
            throw e;
        }

        // Default args
        const launchArgs = [
            '--start-maximized',
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            ...args
        ];

        console.log(`Launching browser [Profile: ${profileName}]...`);
        
        // Explicitly configure profile to NOT load proxy from storage
        // This ensures that if we provided a proxy, it's used. If we didn't, NO proxy is used.
        // We also handle fingerprint manually, so loadFingerprint: false is safer too.
        plugin.useProfile(profilePath, { loadProxy: false, loadFingerprint: false });

        // LAUNCH RETRY LOGIC (Specifically for "Failed to get proxy ip")
        let launchAttempt = 1;
        const maxLaunchAttempts = 3;
        let lastError = null;

        while (launchAttempt <= maxLaunchAttempts) {
            try {
                console.log(`[DEBUG] launchPersistentContext attempt ${launchAttempt}...`);
                const context = await plugin.launchPersistentContext(profilePath, {
                    headless,
                    args: launchArgs,
                    userDataDir: profilePath,
                    ignoreHTTPSErrors: true
                });
                console.log('[DEBUG] launchPersistentContext: SUCCESS');
                return context;
            } catch (e) {
                lastError = e;
                console.error(`[DEBUG] launchPersistentContext FAILED: ${e.message}`);
                if (e.message.toLowerCase().includes('failed to get proxy ip') || 
                    e.message.toLowerCase().includes('proxy') ||
                    e.message.toLowerCase().includes('timeout')) {
                    console.warn(`[Launch] Attempt ${launchAttempt} failed: ${e.message}. Retrying in 5 seconds...`);
                    launchAttempt++;
                    await new Promise(r => setTimeout(r, 5000));
                } else {
                    throw e; // Non-proxy error, fail immediately
                }
            }
        }
        
        throw new Error(`Failed to launch browser after ${maxLaunchAttempts} attempts. Last error: ${lastError?.message}`);
    }

    async getStats(profileName) {
        const profilePath = await this.ensureProfile(profileName);
        const statsPath = path.join(profilePath, 'stats.json');
        
        if (await fs.pathExists(statsPath)) {
            try {
                return await fs.readJson(statsPath);
            } catch (e) {
                console.warn(`Failed to read stats for ${profileName}, resetting...`);
            }
        }
        
        // Default Stats
        return {
            level: 1,
            class: 'Novice',
            exp: 0,
            impact: 0,
            assist: 0,
            mistake: 0,
            int: 0, // Intelligence
            apm: 0, // Actions Per Minute (tracked loosely)
            kda: 0.0
        };
    }

    async updateStats(profileName, actionType, context = {}) {
        const stats = await this.getStats(profileName);
        const profilePath = path.resolve(this.baseDir, profileName);
        
        // 1. Update Core Stats based on Action
        switch (actionType) {
            case 'search':
            case 'browse':
            case 'navigate':
                // Check for INT growth (tech keywords)
                const techKeywords = ['code', 'python', 'javascript', 'ai', 'data', 'algorithm', 'server', 'linux'];
                const content = (context.keyword || context.url || '').toLowerCase();
                if (techKeywords.some(k => content.includes(k))) {
                    stats.int += 1;
                }
                break;
                
            case 'comment':
            case 'type':
                // Impact growth
                stats.impact += 5; 
                stats.int += 0.5;
                break;
                
            case 'watch':
            case 'click':
            case 'like':
                // Assist/Support growth
                stats.assist += 1;
                break;

            case 'error':
                stats.mistake += 1;
                break;
        }

        // 2. Calculate KDA
        // KDA = (Impact + Assist) / (Mistake || 1)
        stats.kda = parseFloat(((stats.impact + stats.assist) / (stats.mistake || 1)).toFixed(2));

        // 3. Level Up Logic (Simple EXP based on total actions)
        stats.exp += 1;
        stats.level = Math.floor(Math.sqrt(stats.exp) * 0.5) + 1;

        // 4. Class Evolution
        if (stats.level >= 5) {
            if (stats.int > stats.impact && stats.int > stats.assist) stats.class = 'Scholar'; 
            else if (stats.impact > stats.assist) stats.class = 'Builder'; 
            else if (stats.assist > stats.impact) stats.class = 'Supporter';
            else stats.class = 'Novice';
        }
        
        // Save
        await fs.writeJson(path.join(profilePath, 'stats.json'), stats, { spaces: 2 });
        return stats;
    }
}

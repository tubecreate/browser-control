
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

        let fingerprint;

        // 1. Try to load existing
        if (await fs.pathExists(fingerprintPath)) {
            console.log('Loading saved fingerprint...');
            try {
                const data = await fs.readFile(fingerprintPath, 'utf8');
                fingerprint = JSON.parse(data);
                if (!fingerprint || typeof fingerprint !== 'object' || Object.keys(fingerprint).length < 10) {
                     throw new Error('Invalid fingerprint');
                }
                console.log(`Fingerprint loaded successfully.`);
                return fingerprint;
            } catch (e) {
                console.warn('Failed to parse saved fingerprint, fetching new one:', e.message);
                // Fall through to fetch
            }
        }

        // 2. Fetch new
        let tags = options.tags || ['Microsoft Windows', 'Chrome'];
        
        // Try to read tags from config if not provided in options
        if (!options.tags && await fs.pathExists(configPath)) {
             try {
                 const config = await fs.readJson(configPath);
                 if (config.tags && Array.isArray(config.tags)) {
                     tags = config.tags;
                 }
             } catch (e) {}
        }

        console.log(`Fetching NEW Fingerprint with tags: ${JSON.stringify(tags)}`);
        // Retry logic for fetching
        let attempts = 0;
        while (attempts < 3) {
            try {
                fingerprint = await plugin.fetch({ tags });
                // Save it
                await fs.outputFile(fingerprintPath, JSON.stringify(fingerprint), 'utf8');
                return fingerprint;
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
        }
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
                    plugin.useFingerprint(fingerprint);
                    break; // Success
                 } catch (e) {
                     console.error(`Error applying fingerprint (Attempt ${fpAttempts + 1}/2):`, e.message);
                     if (fpAttempts === 0) {
                         console.warn('Fingerprint might be corrupted. Deleting and re-fetching...');
                         try {
                             const fingerprintPath = path.join(profilePath, 'fingerprint.json');
                             await fs.remove(fingerprintPath);
                             // Fetch new one
                             fingerprint = await this.getFingerprint(profileName);
                             // Recursive call logic or just retry useFingerprint if we got a new one
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
        this.applyProxy(proxy);

        // Default args
        const launchArgs = [
            '--start-maximized',
            '--remote-debugging-port=0', // Random port
            ...args
        ];

        console.log(`Launching browser [Profile: ${profileName}]...`);
        const context = await plugin.launchPersistentContext(profilePath, {
            headless,
            args: launchArgs,
            userDataDir: profilePath // Explicitly set it, though launchPersistentContext does this
        });

        return context;
    }
}

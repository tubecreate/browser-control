import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Path Config
const PROJECT_ROOT = path.join(__dirname, '..');
const PROFILES_DIR = path.join(PROJECT_ROOT, 'profiles');
const OPEN_SCRIPT = path.join(PROJECT_ROOT, 'open.js');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Security Middleware
const args = process.argv.slice(2);
const isSecureMode = args.includes('--secure');

if (isSecureMode) {
    console.log('🔒 Secure Mode Enabled: Restricting sensitive endpoints to localhost');
}

const checkLocalhost = (req, res, next) => {
    if (!isSecureMode) return next();

    const hostname = req.hostname;
    // Allow localhost and 127.0.0.1
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return next();
    }
    
    console.warn(`[Security] Blocked external access to ${req.path} from ${hostname}`);
    res.status(403).send('Forbidden: Access restricted to localhost');
};

// Apply security to sensitive pages
app.use('/profiles.html', checkLocalhost);
app.use('/api/profiles', checkLocalhost);
app.use('/api/profile-config', checkLocalhost);
app.use('/api/cookies', checkLocalhost);

// Root Health Check
app.get('/', (req, res) => {
    res.send('Browser Launcher is Running');
});

// Profile Start Page — antidetect style new tab showing profile info
// URL: http://localhost:3000/profile-start/PROFILE_NAME
app.get('/profile-start/:name', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile-start.html'));
});

// API: List Profiles
app.get('/api/profiles', async (req, res) => {
    try {
        if (!await fs.pathExists(PROFILES_DIR)) {
            await fs.mkdir(PROFILES_DIR);
        }
        const entries = await fs.readdir(PROFILES_DIR, { withFileTypes: true });
        const profiles = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const profilePath = path.join(PROFILES_DIR, entry.name);
                const configPath = path.join(profilePath, 'config.json');
                const stats = await fs.stat(profilePath);
                
                let createdAt = stats.birthtime; // Default to directory creation time

                // Try to read created_at from config
                if (await fs.pathExists(configPath)) {
                    try {
                        const config = await fs.readJson(configPath);
                        if (config.created_at) {
                            createdAt = new Date(config.created_at);
                        } else {
                            // Migration: Save birthtime as created_at if missing
                            // Use stats.birthtime if available, otherwise just use current time or file time
                            // To avoid modifying file time on every read, we act lazily or just read it.
                            // For sorting purposes, stats.birthtime is okay but might be unreliable on some systems copy/paste.
                            // Ideally we write it once. Let's just use it for now.
                        }
                    } catch (e) {
                        // ignore error
                    }
                }

                profiles.push({
                    name: entry.name,
                    lastModified: stats.mtime,
                    createdAt: createdAt
                });
            }
        }
        
        // Sort by createdAt descending (newest first)
        profiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(profiles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Create Profile
app.post('/api/profiles', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
        const profilePath = path.join(PROFILES_DIR, safeName);
        
        if (await fs.pathExists(profilePath)) {
            return res.status(409).json({ error: 'Profile exists' });
        }
        
        await fs.mkdir(profilePath);
        
        // Create initial config with created_at
        const configPath = path.join(profilePath, 'config.json');
        await fs.writeJson(configPath, {
            created_at: new Date().toISOString(),
            tags: ['Microsoft Windows', 'Chrome'],
            notes: '',
            blacklist: []
        }, { spaces: 2 });

        res.json({ success: true, name: safeName });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Bulk Delete Profiles
app.post('/api/profiles/bulk-delete', async (req, res) => {
    try {
        const { profiles } = req.body;
        if (!profiles || !Array.isArray(profiles)) {
            return res.status(400).json({ error: 'Profiles array required' });
        }

        const results = [];
        for (const name of profiles) {
            const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
            const profilePath = path.join(PROFILES_DIR, safeName);
            if (await fs.pathExists(profilePath)) {
                await fs.remove(profilePath);
                results.push({ name, status: 'deleted' });
            } else {
                results.push({ name, status: 'not_found' });
            }
        }
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Bulk Set Proxy
app.post('/api/profiles/bulk-proxy', async (req, res) => {
    try {
        const { profiles, proxy } = req.body;
        if (!profiles || !Array.isArray(profiles)) {
            return res.status(400).json({ error: 'Profiles array required' });
        }

        const results = [];
        for (const name of profiles) {
            const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
            const profilePath = path.join(PROFILES_DIR, safeName);
            const configPath = path.join(profilePath, 'config.json');

            if (await fs.pathExists(profilePath)) {
                let config = {};
                if (await fs.pathExists(configPath)) {
                    config = await fs.readJson(configPath);
                }
                config.proxy = proxy || '';
                
                // Preserve other fields if config didn't exist (unlikely but safe)
                if (!config.tags) config.tags = ['Microsoft Windows', 'Chrome'];
                if (!config.blacklist) config.blacklist = [];
                
                await fs.writeJson(configPath, config, { spaces: 2 });
                results.push({ name, status: 'updated' });
            } else {
                results.push({ name, status: 'not_found' });
            }
        }
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LOG STREAMING (SSE) ---
let logClients = [];

app.get('/api/stream-logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res
    };
    logClients.push(newClient);

    res.write(`data: ${JSON.stringify({ type: 'connected', id: clientId })}\n\n`);

    req.on('close', () => {
        logClients = logClients.filter(client => client.id !== clientId);
    });
});

function maskSensitiveData(text) {
    if (!text) return text;
    let masked = text;

    // 1. Mask Proxy URLs (socks5://user:pass@host:port -> socks5://***:***@host:port)
    masked = masked.replace(/((?:socks5|socks4|http|https):\/\/)([^:]+):([^@]+)@/g, '$1***:***@');

    // 2. Mask Emails (e.g. example@gmail.com -> e***@gmail.com)
    // Be careful not to mask too aggressively, requiring @ and dot
    masked = masked.replace(/\b([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, '$1***@$2');

    // 3. Mask API Keys (simple heuristic: "api_key": "..." or similar)
    // Look for 20+ alphanumeric chars
    masked = masked.replace(/("api_key"|"apiKey"|'api_key'|'apiKey')\s*[:=]\s*["']([a-zA-Z0-9]{20,})["']/g, '$1: "***"');

    // 4. Mask Passwords (password: "...")
    masked = masked.replace(/("password"|"pass"|'password'|'pass')\s*[:=]\s*["']([^"']+)["']/g, '$1: "***"');

    return masked;
}

function broadcastLog(message, type = 'log', instanceId = null) {
    // Basic filter to ignore boring logs
    if (!message || message.length < 2) return;
    
    const cleanMessage = maskSensitiveData(message);

    const packet = JSON.stringify({ type, message: cleanMessage, instanceId });
    logClients.forEach(client => {
        client.res.write(`data: ${packet}\n\n`);
    });
}

// --- PROCESS TRACKING ---
const activeProcesses = new Map(); // profileName -> { process, instanceId }

// --- PROXY CHECK HELPER ---
function checkProxy(proxyUrl) {
    return new Promise((resolve, reject) => {
        let targetProxy = proxyUrl;
        let proxyUser = '';
        let proxyPass = '';
        let proxyType = 'HTTP';
        
        // Handle ip:port:user:pass (non-standard but common)
        if (proxyUrl.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+:[^:]+:[^:]+$/)) {
            const parts = proxyUrl.split(':');
            if (parts.length === 4) {
                targetProxy = `http://${parts[0]}:${parts[1]}`; // Default to http
                proxyUser = parts[2];
                proxyPass = parts[3];
                proxyType = 'HTTP (Inferred)';
            }
        } else {
            // Standard URL parsing
            try {
                // Fix for curl: use socks5h for remote DNS if socks5 is specified
                if (proxyUrl.startsWith('socks5://')) {
                    proxyType = 'SOCKS5';
                    // proxyUrl = proxyUrl.replace('socks5://', 'socks5h://'); // Reverted based on user request
                } else if (proxyUrl.startsWith('socks4://')) {
                    proxyType = 'SOCKS4';
                } else if (proxyUrl.startsWith('http')) {
                    proxyType = 'HTTP';
                }

                const u = new URL(proxyUrl);
                if (u.username) {
                    proxyUser = decodeURIComponent(u.username);
                    proxyPass = decodeURIComponent(u.password);
                    // Use full URL with auth for curl to avoid flag issues
                    // But we must encode used/pass back if we put them in URL
                    const safeUser = encodeURIComponent(proxyUser);
                    const safePass = encodeURIComponent(proxyPass);
                    targetProxy = `${u.protocol}//${safeUser}:${safePass}@${u.host}`;
                } else {
                    targetProxy = proxyUrl;
                }
            } catch (e) {
                // Fallback
                console.warn('Proxy URL parse error:', e.message);
            }
        }

        const args = [
            '-I', 
            '-x', targetProxy,
            'https://www.google.com',
            '--connect-timeout', '20',
            '--max-time', '30',
            '-k',
            '-L'
        ];

        // removed --proxy-user since we embedded it in URL

        console.log(`[ProxyCheck] Type: ${proxyType} | URL: ${targetProxy} | User: ${proxyUser ? '***' : 'None'}`);
        // console.log(`[ProxyCheck] Command: curl ${args.join(' ')}`);

        const child = spawn('curl', args);

        let errorOutput = '';

        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                const msg = errorOutput.split('\n').find(l => l.includes('curl:')) || errorOutput || 'Connection timeout or invalid proxy';
                const cleanMsg = msg.replace(/\n/g, ' ').trim();
                reject(new Error(cleanMsg));
            }
        });

        child.on('error', (err) => {
            reject(new Error(`Failed to run curl: ${err.message}`));
        });
    });
}

// API: Browser Status Updates
app.post('/api/browser-status', (req, res) => {
    const statusData = req.body;
    // Broadcast as special 'status' type message
    const packet = JSON.stringify({ type: 'status', ...statusData });
    logClients.forEach(client => {
        client.res.write(`data: ${packet}\n\n`);
    });
    res.json({ success: true });
});

// API: Get Running Profiles
app.get('/api/status', (req, res) => {
    const running = Array.from(activeProcesses.keys());
    res.json({ running });
});

// API: Stop Profile
app.post('/api/stop', async (req, res) => {
    const { profile } = req.body;
    if (!profile) return res.status(400).json({ error: 'Profile required' });

    const procData = activeProcesses.get(profile);
    if (procData) {
        console.log(`Stopping profile: ${profile} (PID: ${procData.process.pid})`);
        try {
            process.kill(procData.process.pid);
            // On Windows, sometimes we need to be more aggressive or kill tree
            // But usually node child process kill is okay. 
            // Better: use tree-kill if needed, but start simple.
            activeProcesses.delete(profile);
            res.json({ success: true });
        } catch (e) {
            console.error(`Error stopping profile ${profile}:`, e);
            res.status(500).json({ error: e.message });
        }
    } else {
        res.status(404).json({ error: 'Profile not running' });
    }
});

// API: Launch Profile
app.post('/api/launch', async (req, res) => {
    console.log('>>> Received /api/launch request:', req.body);
    const { profile, url, prompt, headless, sessionMode, proxy } = req.body;
    if (!profile) return res.status(400).json({ error: 'Profile required' });

    // Check if already running
    if (activeProcesses.has(profile)) {
        return res.status(409).json({ error: 'Profile is already running' });
    }

    console.log(`Launching profile: ${profile}...`);
    console.log(`[Debug] skipProxyCheck: ${req.body.skipProxyCheck} (Type: ${typeof req.body.skipProxyCheck})`);
    broadcastLog(`Launching profile: ${profile}...`, 'log');

    // --- PROXY CHECK START ---
    // Determine effective proxy
    let effectiveProxy = proxy;
    if (!effectiveProxy) {
        // Check profile config if not in request
        try {
            const profilePath = path.join(PROFILES_DIR, profile);
            const configPath = path.join(profilePath, 'config.json');
            if (await fs.pathExists(configPath)) {
                const config = await fs.readJson(configPath);
                if (config.proxy) effectiveProxy = config.proxy;
            }
        } catch (e) {}
    }

    if (effectiveProxy && !req.body.skipProxyCheck) {
        broadcastLog(`Verifying proxy: ${effectiveProxy}...`, 'log');
        try {
            await checkProxy(effectiveProxy);
            broadcastLog(`Proxy connection successful.`, 'success');
        } catch (err) {
            console.error(`Proxy check failed for ${profile}:`, err);
            broadcastLog(`Proxy check failed: ${err.message}`, 'error');
            return res.status(502).json({ 
                error: `Proxy Error: ${err.message}`,
                canBypass: true 
            });
        }
    } else if (req.body.skipProxyCheck) {
        broadcastLog(`Skipping proxy check by user request.`, 'warning');
    }
    // --- PROXY CHECK END ---
    
    // Command: node open.js --profile <name>
    const args = ['open.js', '--profile', profile];  
    
    // Add proxy if provided (overrides profile config)
    if (proxy) {
        args.push('--proxy', proxy);
    }
    
    if (prompt) {
        args.push('--prompt', prompt);
        // Enable session mode by default for prompts (continuous actions)
        if (sessionMode !== false) {
            args.push('--session');
            args.push('--session-duration', '10');
        }
    } else if (url) {
        args.push('--prompt', `into "${url}"`);
    } else {
        args.push('--manual'); // Generic launch -> Manual Mode
    }
    
    // Add headless flag if requested
    if (headless) {
        args.push('--headless');
    }

    // Handle Context Object (Write to temp file)
    if (req.body.context) {
        try {
            const contextDir = path.join(PROJECT_ROOT, 'data', 'contexts');
            await fs.ensureDir(contextDir);
            const contextFile = path.join(contextDir, `${req.body.context.agent_name || 'agent'}_${Date.now()}.json`);
            await fs.writeJson(contextFile, req.body.context, { spaces: 2 });
            console.log(`[Launch] Context saved to: ${contextFile}`);
            args.push('--context-file', contextFile);
        } catch (e) {
            console.error('[Launch] Failed to save context file:', e.message);
        }
    }

    // Add AI model flag if provided
    if (req.body.model) {
        args.push('--ai-model', req.body.model);
    }
    
    // Generate unique instance ID for tracking
    const instanceId = `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    args.push('--instance-id', instanceId);
    
    console.log(`[Launch] Instance ID: ${instanceId}`);

    // Use pipe for stdio so we can capture it
    const subprocess = spawn(process.execPath, args, {
        cwd: PROJECT_ROOT,
        detached: false, // Don't detach so we can capture output easily
        shell: false
    });

    // Track process
    activeProcesses.set(profile, { process: subprocess, instanceId });
    
    subprocess.stdout.on('data', (data) => {
        const line = data.toString().trim();
        console.log(`[BROWSER ${instanceId}] ${line}`);
        broadcastLog(line, 'log', instanceId);
    });

    subprocess.stderr.on('data', (data) => {
        const line = data.toString().trim();
        console.error(`[BROWSER ERR ${instanceId}] ${line}`);
        broadcastLog(line, 'error', instanceId);
    });
    
    subprocess.on('error', (err) => {
        console.error('FAILED to spawn open.js:', err);
        broadcastLog(`Failed to spawn: ${err.message}`, 'error', instanceId);
        activeProcesses.delete(profile);
    });

    subprocess.on('close', (code) => {
        console.log(`[Browser Process ${instanceId}] Exited with code ${code}`);
        broadcastLog(`Browser closed (Code: ${code})`, 'error', instanceId);
        
        // Remove from tracking
        activeProcesses.delete(profile);

        // Send final status update to mark as disconnected
        const packet = JSON.stringify({ 
            type: 'status', 
            instanceId, 
            status: 'disconnected',
            profile: profile, // Ensure profile is sent so UI can find it
            url: '',
            actionCount: 0,
            lastAction: 'Session Ended'
        });
        logClients.forEach(client => {
            client.res.write(`data: ${packet}\n\n`);
        });
    });

    res.json({ success: true, message: 'Browser launched', pid: subprocess.pid, instanceId });
});

// API: Export Cookies (Calls open_fix.js --export-cookies)
app.get('/api/cookies/:profile', (req, res) => {
    const { profile } = req.params;
    if (!profile) return res.status(400).json({ error: 'Profile required' });

    console.log(`Exporting cookies for: ${profile}...`);
    
    const child = spawn(process.execPath, ['open.js', '--profile', profile, '--export-cookies'], {
        cwd: PROJECT_ROOT,
        shell: false
    });

    let output = '';
    
    child.stdout.on('data', (data) => {
        output += data.toString();
    });

    child.on('close', (code) => {
        if (code !== 0) {
            return res.status(500).json({ error: 'Process execution failed' });
        }
        
        try {
            // Parse custom markers
            const startMarker = '__COOKIES_START__';
            const endMarker = '__COOKIES_END__';
            
            const startIndex = output.indexOf(startMarker);
            const endIndex = output.indexOf(endMarker);
            
            if (startIndex === -1 || endIndex === -1) {
                return res.status(500).json({ error: 'No cookie data pattern found in output' });
            }
            
            const jsonStr = output.substring(startIndex + startMarker.length, endIndex).trim();
            const cookies = JSON.parse(jsonStr);
            res.json(cookies);
            
        } catch (e) {
            console.error('Parse error:', e);
            res.status(500).json({ error: 'Failed to parse cookie data' });
        }
    });
});

// API: Get Profile Config
app.get('/api/profile-config/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const profilePath = path.join(PROFILES_DIR, name);
        const configPath = path.join(profilePath, 'config.json');
        
        if (!await fs.pathExists(profilePath)) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        let config = { tags: ['Microsoft Windows', 'Chrome'], notes: '', blacklist: [] };
        if (await fs.pathExists(configPath)) {
            config = await fs.readJson(configPath);
            // Ensure blacklist exists in old configs
            if (!config.blacklist) config.blacklist = [];
        }
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Save Profile Config
app.post('/api/profile-config/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const { tags, notes, proxy, resetFingerprint, blacklist } = req.body;
        
        const profilePath = path.join(PROFILES_DIR, name);
        const configPath = path.join(profilePath, 'config.json');
        
        if (!await fs.pathExists(profilePath)) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const config = { 
            tags: tags || ['Microsoft Windows', 'Chrome'], 
            notes: notes || '',
            proxy: proxy || '',
            blacklist: blacklist || []
        };
        
        await fs.writeJson(configPath, config, { spaces: 2 });
        
        if (resetFingerprint) {
            const fingerprintPath = path.join(profilePath, 'fingerprint.json');
            if (await fs.pathExists(fingerprintPath)) {
                await fs.remove(fingerprintPath);
            }
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// API: Get Global Settings
app.get('/api/global-settings', async (req, res) => {
    try {
        const settingsPath = path.join(PROJECT_ROOT, 'data', 'global_settings.json');
        
        let settings = { blacklist: [], maxVisitsPerWeek: 3 };
        if (await fs.pathExists(settingsPath)) {
            settings = await fs.readJson(settingsPath);
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Save Global Settings
app.post('/api/global-settings', async (req, res) => {
    try {
        const { blacklist, maxVisitsPerWeek } = req.body;
        const settingsPath = path.join(PROJECT_ROOT, 'data', 'global_settings.json');
        
        await fs.ensureDir(path.join(PROJECT_ROOT, 'data'));
        await fs.writeJson(settingsPath, { 
            blacklist: blacklist || [], 
            maxVisitsPerWeek: maxVisitsPerWeek || 3 
        }, { spaces: 2 });
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Web Manager running at http://localhost:${PORT}`);
});

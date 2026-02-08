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
                const stats = await fs.stat(profilePath);
                profiles.push({
                    name: entry.name,
                    lastModified: stats.mtime
                });
            }
        }
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
        res.json({ success: true, name: safeName });
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

function broadcastLog(message, type = 'log', instanceId = null) {
    // Basic filter to ignore boring logs
    if (!message || message.length < 2) return;
    
    const packet = JSON.stringify({ type, message, instanceId });
    logClients.forEach(client => {
        client.res.write(`data: ${packet}\n\n`);
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

// API: Launch Profile
app.post('/api/launch', (req, res) => {
    console.log('>>> Received /api/launch request:', req.body);
    const { profile, url, prompt, headless, sessionMode } = req.body;
    if (!profile) return res.status(400).json({ error: 'Profile required' });

    console.log(`Launching profile: ${profile}...`);
    broadcastLog(`Launching profile: ${profile}...`, 'log');
    
    // Command: node open.js --profile <name>
    const args = ['open.js', '--profile', profile];  
    
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

    // Add model flag if provided
    if (req.body.model) {
        args.push('--model', req.body.model);
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
    });

    subprocess.on('close', (code) => {
        console.log(`[Browser Process ${instanceId}] Exited with code ${code}`);
        broadcastLog(`Browser closed (Code: ${code})`, 'error', instanceId);
        
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

        let config = { tags: ['Microsoft Windows', 'Chrome'], notes: '' };
        if (await fs.pathExists(configPath)) {
            config = await fs.readJson(configPath);
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
        const { tags, notes, resetFingerprint } = req.body;
        
        const profilePath = path.join(PROFILES_DIR, name);
        const configPath = path.join(profilePath, 'config.json');
        
        if (!await fs.pathExists(profilePath)) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const config = { 
            tags: tags || ['Microsoft Windows', 'Chrome'], 
            notes: notes || '' 
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

// Start Server
app.listen(PORT, () => {
    console.log(`Web Manager running at http://localhost:${PORT}`);
});

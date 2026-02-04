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
const OPEN_SCRIPT = path.join(PROJECT_ROOT, 'open_fix.js');

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

// API: Launch Profile
app.post('/api/launch', (req, res) => {
    console.log('>>> Received /api/launch request:', req.body);
    const { profile, url } = req.body;
    if (!profile) return res.status(400).json({ error: 'Profile required' });

    console.log(`Launching profile: ${profile}...`);
    
    // Command: node open_fix.js --profile <name>
    const args = ['open_fix.js', '--profile', profile]; 
    if (url) {
        args.push('--prompt', `vào "${url}"`);
    } else {
        args.push('--manual'); // Generic launch -> Manual Mode
    }

    const logPath = path.join(PROJECT_ROOT, 'launcher.log');
    const out = fs.openSync(logPath, 'a');

    const subprocess = spawn(process.execPath, args, {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: ['ignore', out, out], // Use file descriptor
        shell: false
    });
    
    subprocess.on('error', (err) => {
        console.error('FAILED to spawn open_fix.js:', err);
    });

    if (subprocess.pid) {
        console.log(`Spawned process with PID: ${subprocess.pid}`);
    } else {
        console.error('Spawned process has NO PID!');
    }

    subprocess.unref();
    
    res.json({ success: true, message: 'Browser launched in background' });
});

// API: Export Cookies (Calls open_fix.js --export-cookies)
app.get('/api/cookies/:profile', (req, res) => {
    const { profile } = req.params;
    if (!profile) return res.status(400).json({ error: 'Profile required' });

    console.log(`Exporting cookies for: ${profile}...`);
    
    const child = spawn(process.execPath, ['open_fix.js', '--profile', profile, '--export-cookies'], {
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

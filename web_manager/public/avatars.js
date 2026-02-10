/**
 * 12x12 Bit Arrays for Pixel Art
 * 1 = Ink (Color), 0 = Transparent, 2 = Secondary (e.g. tongue)
 */

const AVATAR_PATTERNS = {
    "bot": [
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,0,0,1,1,0,0,1,1,0],
        [0,1,1,0,0,1,1,0,0,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,0,1,1,1,1,1,1,0,1,0],
        [0,1,0,0,1,1,1,1,0,0,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,0,0,1,1,1,0,0],
        [0,0,1,1,1,0,0,1,1,1,0,0],
        [0,0,0,1,1,0,0,1,1,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0]
    ],
    "dog": [
        [0,0,0,0,0,0,0,0,0,0,0,0],
        [0,1,0,0,0,0,0,0,0,0,1,0],
        [1,1,1,0,0,0,0,0,0,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,0,0,1,1,0,0,1,1,1],
        [1,1,1,0,0,1,1,0,0,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [0,1,1,1,0,0,0,0,1,1,1,0],
        [0,0,1,1,0,1,1,0,1,1,0,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,0,0,1,1,0,0,1,1,0,0,0]
    ],
    "cat": [
        [0,0,1,0,0,0,0,0,0,1,0,0],
        [0,1,1,1,0,0,0,0,1,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,0,1,1,1,1,0,1,1,0],
        [0,1,1,0,1,1,1,1,0,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,0,1,0,0,0,0,1,0,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,0,0,1,1,0,0,1,1,0,0,0]
    ],
    "bird": [
        [0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,1,1,1,1,0,0,0,0],
        [0,0,0,1,1,1,1,1,1,0,0,0],
        [0,0,1,1,0,1,1,1,1,1,0,0],
        [0,0,1,1,0,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,1,1,1,1,0],
        [0,0,0,1,1,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,1,1,1,1,0,0,0,0,0],
        [0,0,1,1,1,1,0,0,0,0,0,0],
        [0,0,0,1,1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0]
    ],
    "turtle": [
        [0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,1,1,1,1,0,0,0,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,0,0,1,1,1,1,1,1,1,1,0],
        [0,0,0,1,1,1,1,1,1,1,1,1],
        [0,0,1,1,0,0,0,0,1,1,0,0],
        [0,1,1,0,0,0,0,0,0,1,1,0],
        [0,0,0,0,0,0,0,0,0,0,0,0]
    ],
    "bear": [
        [0,1,1,0,0,0,0,0,0,1,1,0],
        [1,1,1,1,0,0,0,0,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,0,0,1,1,0,0,1,1,1],
        [1,1,1,0,0,1,1,0,0,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [0,1,1,1,0,1,1,0,1,1,1,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,0,1,1,1,0,0,1,1,1,0,0],
        [0,0,1,1,1,0,0,1,1,1,0,0]
    ],
    "penguin": [
        [0,0,0,0,1,1,1,1,0,0,0,0],
        [0,0,0,1,1,1,1,1,1,0,0,0],
        [0,0,1,1,0,1,1,0,1,1,0,0],
        [0,0,1,1,0,1,1,0,1,1,0,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,0,0,1,1,1,1,1,1,0,0,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,0,1,1,0,0,0,0,1,1,0,0],
        [0,1,1,0,0,0,0,0,0,1,1,0]
    ],
    "shrimp": [
        [0,0,0,0,0,0,0,1,1,0,1,0],
        [0,0,0,0,0,0,1,1,1,1,1,1],
        [0,0,0,0,0,1,1,1,0,1,1,0],
        [0,0,0,1,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,1,0,0,0,0],
        [0,1,1,1,1,1,1,0,0,0,0,0],
        [0,1,1,1,1,1,0,0,1,0,1,0],
        [1,1,1,1,0,0,0,1,1,1,0,0],
        [1,1,1,0,0,0,1,1,1,0,0,0],
        [0,1,1,1,1,1,1,0,0,0,0,0],
        [0,0,1,1,1,1,0,0,0,0,0,0],
        [0,0,0,1,1,0,0,0,0,0,0,0]
    ]
};

const COLOR_MAP = {
    "blue": "#2196F3", "red": "#F44336", "green": "#4CAF50", "orange": "#FF9800",
    "purple": "#9C27B0", "teal": "#009688", "pink": "#E91E63", "black": "#333333",
    "handle": "#795548", "lens": "#81D4FA", "paper": "#EEEEEE"
};

class PixelAvatar {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.type = options.type || "bot";
        this.color = options.color || "blue";
        this.scale = options.scale || 5;
        
        this.currentAction = "idle";
        this.mood = "neutral"; 
        this.frameCounter = 0;
        this.isWalking = false;
        
        this.lastFlairTime = 0;
        this.currentFlair = null;
        this.flairFrame = 0;
        
        this.startAnimation();
    }
    
    setAvatar(type, color) {
        if (AVATAR_PATTERNS[type]) {
            this.type = type;
            this.currentFlair = null;
        }
        if (color) this.color = color;
    }
    
    setAction(action) {
        if (this.currentAction !== action) {
            this.currentAction = action;
            this.isWalking = (action === "walk" || action === "search" || action === "moving");
        }
    }

    setMood(mood) {
        this.mood = mood;
    }
    
    startAnimation() {
        const loop = () => {
            this.frameCounter++;
            this.update();
            this.draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    update() {
        const now = Date.now();
        // Trigger random flair every 5-10 seconds
        if (!this.currentFlair && this.currentAction === "idle" && now - this.lastFlairTime > 5000) {
            if (Math.random() < 0.01) { 
                const anims = window.AVATAR_ANIMATIONS && window.AVATAR_ANIMATIONS[this.type];
                if (anims) {
                    const keys = Object.keys(anims);
                    this.currentFlair = keys[Math.floor(Math.random() * keys.length)];
                    this.flairFrame = 0;
                }
            }
        }

        if (this.currentFlair) {
            if (this.frameCounter % 8 === 0) {
                this.flairFrame++;
                const frames = window.AVATAR_ANIMATIONS[this.type][this.currentFlair];
                if (this.flairFrame >= frames.length * 4) { 
                    this.currentFlair = null;
                    this.lastFlairTime = Date.now();
                }
            }
        }
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        let pattern = AVATAR_PATTERNS[this.type] || AVATAR_PATTERNS["bot"];
        if (this.currentFlair && window.AVATAR_ANIMATIONS && window.AVATAR_ANIMATIONS[this.type]) {
            const frames = window.AVATAR_ANIMATIONS[this.type][this.currentFlair];
            pattern = frames[Math.floor(this.flairFrame) % frames.length];
        }

        const mainColor = this.mood === "angry" ? "#D32F2F" : (COLOR_MAP[this.color] || COLOR_MAP["blue"]);
        
        let yBounce = 0;
        if (this.mood === "happy") yBounce = Math.sin(this.frameCounter / 5) * 2;
        
        const xOffset = this.isWalking ? Math.sin(this.frameCounter / 4) * 3 : 0;
        const tilt = this.isWalking ? Math.sin(this.frameCounter / 4) * 0.1 : 0;

        this.ctx.save();
        this.ctx.translate(this.canvas.width/2, this.canvas.height/2);
        this.ctx.rotate(tilt);
        this.ctx.translate(-this.canvas.width/2 + xOffset, -this.canvas.height/2 + yBounce);

        for (let y = 0; y < 12; y++) {
            for (let x = 0; x < 12; x++) {
                if (pattern[y][x] === 1) {
                    this.ctx.fillStyle = mainColor;
                    this.ctx.fillRect(x * this.scale, y * this.scale, this.scale, this.scale);
                } else if (pattern[y][x] === 2) {
                    this.ctx.fillStyle = "#FF80AB"; 
                    this.ctx.fillRect(x * this.scale, y * this.scale, this.scale, this.scale);
                }
            }
        }
        this.ctx.restore();
        
        if (this.currentAction === "search") this.drawMagnifyingGlass();
        else if (this.currentAction === "read") this.drawNewspaper();
        else if (this.currentAction === "watch") this.drawTV();
        
        if (this.mood === "happy") this.drawHappyOverlay();
        else if (this.mood === "angry") this.drawAngryOverlay();
        else if (this.mood === "bored") this.drawZZZ();
    }
    
    drawHappyOverlay() {
        if (this.frameCounter % 40 < 20) {
             this.ctx.fillStyle = "#FFEB3B";
             this.ctx.font = "12px sans-serif";
             this.ctx.fillText("✨", 45, 15);
             this.ctx.fillText("✨", 5, 20);
        }
    }

    drawAngryOverlay() {
        if (this.frameCounter % 20 < 10) {
            this.ctx.fillStyle = "#FF5252";
            this.ctx.font = "bold 10px sans-serif";
            this.ctx.fillText("💢", 45, 15);
        }
    }

    drawZZZ() {
        const step = Math.floor(this.frameCounter / 30) % 3;
        this.ctx.fillStyle = "#81D4FA";
        this.ctx.font = "bold 10px sans-serif";
        if (step >= 0) this.ctx.fillText("z", 48, 15);
        if (step >= 1) this.ctx.fillText("Z", 52, 10);
    }
    
    drawMagnifyingGlass() {
        const offset = Math.sin(this.frameCounter / 10) * 3;
        const cx = 40 + offset;
        const cy = 25;
        this.ctx.fillStyle = COLOR_MAP["handle"];
        this.ctx.fillRect(cx-2, cy+10, 3, 10);
        this.ctx.fillStyle = "#333";
        this.ctx.beginPath(); this.ctx.arc(cx, cy, 8, 0, Math.PI*2); this.ctx.fill();
        this.ctx.fillStyle = COLOR_MAP["lens"];
        this.ctx.beginPath(); this.ctx.arc(cx, cy, 6, 0, Math.PI*2); this.ctx.fill();
    }
    
    drawNewspaper() {
        this.ctx.fillStyle = COLOR_MAP["paper"];
        this.ctx.fillRect(10, 35, 40, 25);
        this.ctx.fillStyle = "#999";
        for(let i=0; i<3; i++) this.ctx.fillRect(15, 40 + i*6, 30, 2);
    }
    
    drawTV() {
        this.ctx.fillStyle = "#444";
        this.ctx.fillRect(10, 30, 44, 30);
        const colors = ["#81C784", "#64B5F6", "#E57373"];
        this.ctx.fillStyle = colors[Math.floor(this.frameCounter/10)%3];
        this.ctx.fillRect(14, 34, 36, 22);
    }
}

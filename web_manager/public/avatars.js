/**
 * 12x12 Bit Arrays for Pixel Art
 * 1 = Ink (Color), 0 = Transparent
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
    "capybara": [
        [0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,0,1,1,1,1,1,1,1,0],
        [0,1,1,0,1,1,1,1,1,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,1,0,0,0,0,0,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,1,1,1,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,1,1,1,0,0]
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

// Colors mapping
const COLOR_MAP = {
    "blue": "#2196F3",
    "red": "#F44336",
    "green": "#4CAF50",
    "orange": "#FF9800",
    "purple": "#9C27B0",
    "teal": "#009688",
    "pink": "#E91E63",
    "black": "#333333",
    "white": "#FFFFFF",
    "paper": "#EEEEEE",
    "lens": "#81D4FA",
    "handle": "#795548",
    "screen": "#81C784"
};

class PixelAvatar {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.type = options.type || "bot";
        this.color = options.color || "blue";
        this.scale = options.scale || 10;
        
        this.currentAction = "idle";
        this.mood = "neutral"; // neutral, happy, bored
        this.frameCounter = 0;
        
        // Setup simple loop
        this.startAnimation();
    }
    
    setAvatar(type, color) {
        if (AVATAR_PATTERNS[type]) this.type = type;
        if (color) this.color = color;
    }
    
    setAction(action) {
        // Actions: idle, search, read, watch
        if (this.currentAction !== action) {
            this.currentAction = action;
            this.mood = "neutral"; // Reset mood on new action usually
            console.log(`[Avatar] Switching to action: ${action}`);
        }
    }

    setMood(mood) {
        // Moods: neutral, happy, bored
        if (this.mood !== mood) {
            this.mood = mood;
        }
    }
    
    startAnimation() {
        const loop = () => {
            this.frameCounter++;
            this.draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
    
    draw() {
        // Clear transparency
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const pattern = AVATAR_PATTERNS[this.type] || AVATAR_PATTERNS["bot"];
        const mainColor = COLOR_MAP[this.color] || COLOR_MAP["blue"];
        
        // Bounce effect for 'happy'
        let yOffset = 0;
        if (this.mood === "happy") {
            if (this.frameCounter % 20 < 10) yOffset = -1;
        }

        // 1. Draw Base Avatar
        for (let y = 0; y < 12; y++) {
            for (let x = 0; x < 12; x++) {
                if (pattern[y][x] === 1) {
                    this.ctx.fillStyle = mainColor;
                    this.ctx.fillRect(x * this.scale, (y + yOffset) * this.scale, this.scale, this.scale);
                }
            }
        }
        
        // 2. Draw Props based on Action
        if (this.currentAction === "search") {
            this.drawMagnifyingGlass();
        } else if (this.currentAction === "read") {
            this.drawNewspaper();
        } else if (this.currentAction === "watch") {
            this.drawTV();
        }
        
        // 3. Draw Emotions / Moods
        if (this.mood === "happy") {
            this.drawHappyFace(yOffset);
        } else if (this.mood === "bored") {
            this.drawZZZ();
        }
    }
    
    drawHappyFace(yOffset) {
        // Draw simple smile overlay
        // Only makes sense if we know where the face is. 
        // For generic bots/animals, usually center-ish.
        // Let's add "sparkles" or hearts instead of changing face pixels directly to be generic
        
        if (this.frameCounter % 30 < 15) {
            this.ctx.fillStyle = "#FFEB3B"; // Gold/Yellow
            // Top right sparkle
            this.ctx.fillRect(10 * this.scale, (1 + yOffset) * this.scale, 1 * this.scale, 1 * this.scale);
            // Top left
            this.ctx.fillRect(1 * this.scale, (2 + yOffset) * this.scale, 1 * this.scale, 1 * this.scale);
        }
    }

    drawZZZ() {
        // Drifting Z's
        this.ctx.fillStyle = "#fff";
        const step = Math.floor(this.frameCounter / 30) % 3;
        
        if (step >= 0) this.drawZ(10, 2);
        if (step >= 1) this.drawZ(11, 0);
        if (step >= 2) this.drawZ(12, -2); // Might go out of bounds?
    }

    drawZ(x, y) {
        // Tiny 3x3 Z
        // 111
        // 010
        // 111
        // Actually fit in 1 pixel style if logical, but let's just draw simpler
        this.ctx.fillRect(x * this.scale, y * this.scale, 2 * this.scale, 1 * this.scale); // Top
    }
    
    drawMagnifyingGlass() {
        // Moving glass
        const offset = Math.sin(this.frameCounter / 10) * 2; 
        const cx = 8 + offset; 
        const cy = 4;
        
        this.ctx.fillStyle = COLOR_MAP["handle"]; 
        this.ctx.fillRect((cx-2)*this.scale, (cy+3)*this.scale, 1*this.scale, 3*this.scale);
        
        this.ctx.fillStyle = "#333"; 
        this.ctx.fillRect((cx-2)*this.scale, (cy-2)*this.scale, 4*this.scale, 4*this.scale);
        
        this.ctx.fillStyle = COLOR_MAP["lens"]; 
        this.ctx.fillRect((cx-1)*this.scale, (cy-1)*this.scale, 2*this.scale, 2*this.scale);
    }
    
    drawNewspaper() {
        const top = 7;
        const left = 2;
        this.ctx.fillStyle = COLOR_MAP["paper"];
        this.ctx.fillRect(left*this.scale, top*this.scale, 8*this.scale, 5*this.scale);
        this.ctx.fillStyle = "#999";
        if (Math.floor(this.frameCounter / 20) % 2 === 0) {
             this.ctx.fillRect((left+1)*this.scale, (top+1)*this.scale, 6*this.scale, 1*this.scale);
             this.ctx.fillRect((left+1)*this.scale, (top+3)*this.scale, 6*this.scale, 1*this.scale);
        } else {
             this.ctx.fillRect((left+1)*this.scale, (top+1)*this.scale, 4*this.scale, 1*this.scale);
             this.ctx.fillRect((left+1)*this.scale, (top+3)*this.scale, 5*this.scale, 1*this.scale);
        }
    }
    
    drawTV() {
        const top = 6;
        const left = 2;
        this.ctx.fillStyle = "#444";
        this.ctx.fillRect(left*this.scale, top*this.scale, 8*this.scale, 6*this.scale);
        const colors = ["#81C784", "#64B5F6", "#E57373", "#FFF176"];
        const colorIdx = Math.floor(this.frameCounter / 10) % colors.length;
        this.ctx.fillStyle = colors[colorIdx];
        this.ctx.fillRect((left+1)*this.scale, (top+1)*this.scale, 6*this.scale, 4*this.scale);
    }
}

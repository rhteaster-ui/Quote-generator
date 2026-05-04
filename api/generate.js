import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import axios from 'axios';

// Constants (matching original design)
const FONT_URL = 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/CrimsonText-Regular.ttf';
const BG_URL = 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Image/_20260425155846190.jpeg';
const PADDING_RATIO = 0.15;
const FOOTER_RATIO = 0.12;
const QUOTE_COLOR = '#1a1a1a';
const FONT_SIZE_MAX = 60;
const FONT_SIZE_MIN = 20;

// Helper: calculate optimal font size based on text and bounding box
function calcFontSize(ctx, text, maxWidth, maxHeight, fontName) {
    const words = text.split(' ');
    for (let size = FONT_SIZE_MAX; size >= FONT_SIZE_MIN; size -= 1) {
        ctx.font = `${size}px ${fontName}`;
        const lineHeight = size * 1.35;
        let lines = 0;
        let currentLine = [];
        for (const word of words) {
            const testLine = [...currentLine, word].join(' ').replace(/[\[\]]/g, '');
            if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
                lines++;
                currentLine = [word];
            } else {
                currentLine.push(word);
            }
        }
        lines++;
        if (lines * lineHeight <= maxHeight) return size;
    }
    return FONT_SIZE_MIN;
}

// Draw justified text with highlight detection & custom background for [word]
function drawTextJustified(ctx, text, centerX, centerY, maxWidth, fontSize) {
    const lineHeight = fontSize * 1.35;
    const words = text.split(' ');
    
    // Build lines of word arrays
    let lines = [];
    let currentLine = [];
    for (const word of words) {
        const testLine = [...currentLine, word].join(' ').replace(/[\[\]]/g, '');
        if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
            lines.push([...currentLine]);
            currentLine = [word];
        } else {
            currentLine.push(word);
        }
    }
    if (currentLine.length) lines.push([...currentLine]);

    // Starting Y (centered vertically)
    let startY = centerY - ((lines.length - 1) * lineHeight) / 2;

    for (let idx = 0; idx < lines.length; idx++) {
        const lineWords = lines[idx];
        const isLastLine = idx === lines.length - 1;

        // Process each word into parts (highlight detection)
        const lineParts = lineWords.map(word => {
            // Pattern: captures [content] and optional trailing punctuation
            const match = word.match(/^\[(.+?)\]([^\w]*)$/);
            if (match) {
                const highlighted = match[1];
                const trailing = match[2];
                const hlWidth = ctx.measureText(highlighted).width;
                const trailWidth = ctx.measureText(trailing).width;
                return {
                    content: highlighted,
                    trailing,
                    isHighlight: true,
                    width: hlWidth + trailWidth,
                    hlWidth
                };
            }
            return {
                content: word,
                trailing: '',
                isHighlight: false,
                width: ctx.measureText(word).width,
                hlWidth: 0
            };
        });

        const totalWordsWidth = lineParts.reduce((sum, p) => sum + p.width, 0);
        let currentX, spaceWidth;

        if (!isLastLine && lineWords.length > 1) {
            // Justify: distribute spaces
            spaceWidth = (maxWidth - totalWordsWidth) / (lineWords.length - 1);
            currentX = centerX - maxWidth / 2;
        } else {
            // Left align / center for last line
            const standardSpace = ctx.measureText(' ').width;
            spaceWidth = standardSpace;
            const lineTotalWidth = totalWordsWidth + standardSpace * (lineWords.length - 1);
            currentX = centerX - lineTotalWidth / 2;
        }

        // Draw each part with optional highlight background
        for (const part of lineParts) {
            if (part.isHighlight) {
                ctx.fillStyle = 'rgba(212, 225, 87, 0.85)';
                ctx.fillRect(currentX, startY - fontSize * 0.45, part.hlWidth, fontSize * 0.95);
            }
            ctx.fillStyle = QUOTE_COLOR;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(part.content, currentX, startY);
            if (part.trailing) {
                ctx.fillText(part.trailing, currentX + part.hlWidth, startY);
            }
            currentX += part.width + spaceWidth;
        }
        startY += lineHeight;
    }
}

// Main handler for Vercel
export default async function handler(req, res) {
    // Only POST allowed
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    try {
        const { text, author = 'Someone' } = req.body;
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text parameter is required and cannot be empty.' });
        }

        // Fetch background image & font simultaneously
        const [bgBuffer, fontBuffer] = await Promise.all([
            axios.get(BG_URL, { responseType: 'arraybuffer' }).then(r => r.data),
            axios.get(FONT_URL, { responseType: 'arraybuffer' }).then(r => r.data),
        ]);

        // Register custom font globally
        GlobalFonts.register(Buffer.from(fontBuffer), 'CrimsonText');
        const bgImage = await loadImage(Buffer.from(bgBuffer));
        
        // Create canvas with background dimensions
        const canvas = createCanvas(bgImage.width, bgImage.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

        // Dimensions and quote area calculation
        const padding = canvas.width * PADDING_RATIO;
        const footerHeight = canvas.height * FOOTER_RATIO;
        const centerX = canvas.width / 2;
        const maxWidth = canvas.width - padding * 2;
        const quoteAreaTop = padding;
        const quoteAreaHeight = canvas.height - footerHeight - quoteAreaTop;
        const quoteAreaCenterY = quoteAreaTop + quoteAreaHeight / 2;

        const processedText = text.trim();
        // Compute best font size to fit within quote area
        const fontSize = calcFontSize(ctx, processedText, maxWidth, quoteAreaHeight, 'CrimsonText');
        ctx.font = `${fontSize}px CrimsonText`;
        
        // Draw justified & highlighted text
        drawTextJustified(ctx, processedText, centerX, quoteAreaCenterY, maxWidth, fontSize);
        
        // Draw author name at footer
        ctx.font = '26px CrimsonText';
        ctx.fillStyle = QUOTE_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const authorY = canvas.height - footerHeight / 2;
        ctx.fillText(author.slice(0, 35), centerX, authorY); // limit author length
        
        // Convert to JPEG buffer
        const buffer = canvas.toBuffer('image/jpeg', { quality: 0.92 });
        
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.status(200).send(buffer);
    } catch (error) {
        console.error('Canvas generation error:', error);
        res.status(500).json({ error: `Internal server error: ${error.message || 'Unknown error'}` });
    }
}
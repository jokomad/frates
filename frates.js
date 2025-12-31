const https = require('https');

// Telegram Configuration
const TELEGRAM_BOT_TOKEN = '8531770574:AAFaigDKYYIE_QGbr_LIGwWzT-jpEJ1STBc';
const TELEGRAM_CHAT_ID = '-1003583931439';

// Store positive funding rates: symbol -> rate
let positiveFundingRates = new Map();

// Function to send Telegram message
function sendTelegramMessage(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    const postData = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
    });

    const options = {
        hostname: 'api.telegram.org',
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    };

    const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
            console.error(`Telegram API Error: ${res.statusCode}`);
        }
    });

    req.on('error', (error) => {
        console.error('Error sending Telegram message:', error.message);
    });

    req.write(postData);
    req.end();
}

// Function to fetch funding rates for all symbols
async function fetchFundingRates() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'fapi.binance.com',
            path: '/fapi/v1/premiumIndex',
            method: 'GET',
            headers: { 'User-Agent': 'Node.js' }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', error => reject(error));
        req.end();
    });
}

// Function to run scan and list results
async function runScan() {
    const runTime = new Date();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 STARTING SCAN AT ${runTime.toLocaleTimeString()}`);
    console.log(`${'='.repeat(60)}`);

    try {
        console.log('Fetching funding rates...');
        const fundingData = await fetchFundingRates();

        // Filter only USDT pairs
        const usdtPairs = fundingData
            .filter(item => item.symbol.endsWith('USDT'))
            .map(item => ({
                symbol: item.symbol,
                fundingRate: parseFloat(item.lastFundingRate || 0)
            }));

        // 1. Process Logic: Check for flips and update storage
        let flippedPairs = [];

        usdtPairs.forEach(p => {
            // Check if it WAS positive and IS NOW negative
            if (p.fundingRate < 0) {
                if (positiveFundingRates.has(p.symbol)) {
                    // FLIP DETECTED!
                    const previousRate = positiveFundingRates.get(p.symbol);
                    // Calculate flip magnitude (percentage points moved)
                    const flipMagnitude = previousRate - p.fundingRate;

                    flippedPairs.push({
                        symbol: p.symbol,
                        previousRate: previousRate,
                        newRate: p.fundingRate,
                        magnitude: flipMagnitude
                    });

                    console.log(`⚠️ ALERT: ${p.symbol} flipped from Positive to Negative!`);

                    // Remove from positive map since it's no longer positive
                    positiveFundingRates.delete(p.symbol);
                }
            }
            // Check if it IS positive
            else if (p.fundingRate > 0) {
                // Update or Add to map
                positiveFundingRates.set(p.symbol, p.fundingRate);
            }
        });

        // Sort flipped pairs by magnitude (highest flip percentage first)
        flippedPairs.sort((a, b) => b.magnitude - a.magnitude);

        // Construct Telegram message from sorted flips
        let telegramAlerts = '';
        flippedPairs.forEach(flip => {
            const msg = `🔴 ${flip.symbol} FLIPPED to Negative!\nPrev: ${flip.previousRate.toFixed(6)}% | New: ${flip.newRate.toFixed(6)}%`;
            telegramAlerts += `${msg}\n\n`;
        });

        // Send batched Telegram alerts if any
        if (telegramAlerts) {
            sendTelegramMessage(telegramAlerts);
            console.log('📨 Telegram alerts sent.');
        }

        // Sort for display (descending by absolute value)
        usdtPairs.sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));

        console.log(`Tracking ${positiveFundingRates.size} positive funding rates.`);
        console.log(`Listing all ${usdtPairs.length} USDT funding rates:`);
        console.log(`${'-'.repeat(45)}`);
        console.log(`Symbol\t\tFunding Rate\t\tStatus`);
        console.log(`${'-'.repeat(45)}`);

        usdtPairs.forEach(p => {
            let status = '';
            if (p.fundingRate > 0) status = 'POSITIVE (Tracked)';
            else status = 'NEGATIVE';

            console.log(`${p.symbol.padEnd(15)} ${p.fundingRate.toFixed(8).padEnd(20)} ${status}`);
        });

        console.log(`${'-'.repeat(45)}`);
        console.log(`✅ SCAN COMPLETED AT ${new Date().toLocaleTimeString()}`);
        console.log(`${'='.repeat(60)}\n`);

    } catch (error) {
        console.error('Error during scan:', error.message);
    }
}

// Function to schedule scans at 3 seconds after every hour
function scheduleHourlyScans() {
    console.log('Starting funding rate monitor with Telegram Alerts');
    console.log('Runs at 3 seconds past every hour (XX:00:03).');
    console.log('Clears cache at midnight (00:00:03).');
    console.log('Checking time every second...\n');

    let lastRunHour = -1;

    setInterval(() => {
        const now = new Date();
        const currentMinute = now.getMinutes();
        const currentSecond = now.getSeconds();
        const currentHour = now.getHours();

        // Run at 3 seconds past the hour, and only once per hour
        if (currentMinute === 0 && currentSecond === 3 && currentHour !== lastRunHour) {
            lastRunHour = currentHour;

            // Midnight Clear Logic (runs at 00:00:03)
            if (currentHour === 0) {
                console.log('🕛 MIDNIGHT DETECTED: Clearing positive funding rate cache...');
                positiveFundingRates.clear();
                sendTelegramMessage('🕛 Midnight: Funding rate cache cleared.');
            }

            runScan();
        }

    }, 1000);
}

// Start the scheduler
// Start the scheduler
scheduleHourlyScans();

// Health Check Server for Koyeb
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Health check server listening on port ${PORT}`);
});

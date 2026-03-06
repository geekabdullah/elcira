require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Elcira@Bauchi2024';

// ====== CRITICAL: PERSISTENT STORAGE SETUP ======
// On Render, only /tmp is writable persistently
const IS_RENDER = process.env.RENDER === 'true' || process.env.IS_RENDER === 'true';
const DATA_DIR = IS_RENDER ? '/tmp/data' : path.join(__dirname, 'data');

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        console.log(`📁 Data directory: ${DATA_DIR}`);
    } catch (error) {
        console.error('Failed to create data directory:', error);
    }
}

// File paths
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');

// ====== IN-MEMORY CACHE (Primary source of truth) ======
let productsCache = [];
let agentsCache = [];
let cacheInitialized = false;

// ====== DEFAULT DATA (only used on FIRST ever run) ======
const DEFAULT_PRODUCTS = [
    {
        id: 1,
        category: "Electronic Components",
        name: "Arduino Uno R3",
        price: 25000,
        image_url: "https://images.unsplash.com/photo-1621259181231-4c5c2c4f1c4f?w=400&h=300&fit=crop",
        payment_link: "https://paystack.com/pay/arduino",
        description: "Official Arduino Uno R3 microcontroller board - Perfect for beginners and professionals",
        stock: 50,
        created_at: new Date().toISOString()
    },
    {
        id: 2,
        category: "Electronic Components",
        name: "Raspberry Pi 4 Model B",
        price: 75000,
        image_url: "https://images.unsplash.com/photo-1591370874773-6702e8f12fd8?w=400&h=300&fit=crop",
        payment_link: "https://paystack.com/pay/raspberry-pi",
        description: "4GB RAM, Quad-core Cortex-A72, perfect for IoT and server projects",
        stock: 25,
        created_at: new Date().toISOString()
    },
    {
        id: 3,
        category: "Digital Products",
        name: "Complete React.js Course",
        price: 35000,
        image_url: "https://images.unsplash.com/photo-1633356122102-3fe601e05bd2?w=400&h=300&fit=crop",
        payment_link: "https://paystack.com/pay/react",
        description: "Comprehensive React.js masterclass with 10+ real projects",
        stock: 999,
        file_url: "https://example.com/course",
        created_at: new Date().toISOString()
    },
    {
        id: 4,
        category: "Digital Products",
        name: "Python Programming Bundle",
        price: 25000,
        image_url: "https://images.unsplash.com/photo-1526379095098-400a3b3b9b3b?w=400&h=300&fit=crop",
        payment_link: "https://paystack.com/pay/python",
        description: "From basics to advanced - 50+ hours of content",
        stock: 999,
        file_url: "https://example.com/python",
        created_at: new Date().toISOString()
    },
    {
        id: 5,
        category: "Learning Materials",
        name: "Electronics Starter Kit",
        price: 45000,
        image_url: "https://images.unsplash.com/photo-1517070208544-6a4f4a4e4a4a?w=400&h=300&fit=crop",
        payment_link: "https://paystack.com/pay/starter-kit",
        file_url: "https://example.com/manual.pdf",
        description: "Complete electronics starter kit with breadboard, sensors, and manual",
        stock: 30,
        created_at: new Date().toISOString()
    },
    {
        id: 6,
        category: "Learning Materials",
        name: "Arduino Programming Guide",
        price: 15000,
        image_url: "https://images.unsplash.com/photo-1537439470-4f3a5b6b3b3b?w=400&h=300&fit=crop",
        payment_link: "https://paystack.com/pay/arduino-guide",
        file_url: "https://example.com/arduino.pdf",
        description: "PDF ebook with 200+ projects and tutorials",
        stock: 100,
        created_at: new Date().toISOString()
    }
];

const DEFAULT_AGENTS = [
    {
        id: 1,
        name: "Chidi Okonkwo",
        role: "Senior Technical Agent",
        location: "Bauchi (ATBU Yelwa)",
        phone: "+234 801 234 5678",
        email: "chidi.okonkwo@elcira.ng",
        image_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
        rating: 4.9,
        reviews: 156,
        created_at: new Date().toISOString()
    },
    {
        id: 2,
        name: "Aisha Mohammed",
        role: "Digital Products Specialist",
        location: "Bauchi (Gubi Campus)",
        phone: "+234 802 345 6789",
        email: "aisha.mohammed@elcira.ng",
        image_url: "https://images.unsplash.com/photo-1494790108777-766d2f0f2b3a?w=400&h=400&fit=crop",
        rating: 4.8,
        reviews: 203,
        created_at: new Date().toISOString()
    },
    {
        id: 3,
        name: "Oluwaseun Adebayo",
        role: "Learning Materials Coordinator",
        location: "Bauchi City",
        phone: "+234 803 456 7890",
        email: "oluwaseun.adebayo@elcira.ng",
        image_url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=400&fit=crop",
        rating: 4.7,
        reviews: 89,
        created_at: new Date().toISOString()
    },
    {
        id: 4,
        name: "Ngozi Eze",
        role: "Customer Support Lead",
        location: "Bauchi (Remote)",
        phone: "+234 804 567 8901",
        email: "ngozi.eze@elcira.ng",
        image_url: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
        rating: 5.0,
        reviews: 312,
        created_at: new Date().toISOString()
    }
];

// ====== EMAIL SERVICE ======
let transporter = null;

async function initEmailService() {
    try {
        const gmailUser = process.env.GMAIL_USER;
        const gmailPass = process.env.GMAIL_PASSWORD;
        
        if (!gmailUser || !gmailPass) {
            console.log('⚠️ Email credentials not set - email notifications disabled');
            return false;
        }
        
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: gmailUser,
                pass: gmailPass
            }
        });
        
        await transporter.verify();
        console.log('✅ Email service connected');
        return true;
    } catch (error) {
        console.error('❌ Email service failed:', error.message);
        return false;
    }
}

async function sendPurchaseNotification(product, customerData) {
    if (!transporter) return false;

    try {
        const purchaseDate = new Date().toLocaleString('en-NG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const orderId = 'ELC-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Inter', sans-serif; background: #0a0a0f; color: #fff; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: #14141f; border-radius: 24px; overflow: hidden; border: 1px solid rgba(0,255,157,0.1); }
        .header { background: linear-gradient(135deg, #00ff9d, #7c3aed); padding: 30px; text-align: center; }
        .header h1 { margin: 0; color: #0a0a0f; font-size: 2rem; }
        .header p { margin: 10px 0 0; color: #0a0a0f; opacity: 0.8; }
        .content { padding: 30px; }
        .order-box { background: #0a0a0f; padding: 20px; border-radius: 16px; margin: 20px 0; border-left: 4px solid #00ff9d; }
        .order-box h3 { margin: 0 0 15px; color: #00ff9d; }
        .order-box p { margin: 8px 0; color: #fff; }
        .btn { display: inline-block; background: #00ff9d; color: #0a0a0f; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
        .footer { text-align: center; padding: 20px; border-top: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚡ Elcira</h1>
            <p>New Order Received!</p>
        </div>
        <div class="content">
            <h2 style="margin-top: 0;">Hello Admin! 👋</h2>
            <p>A customer just placed an order on Elcira:</p>
            
            <div class="order-box">
                <h3>📦 Product Details</h3>
                <p><strong>Product:</strong> ${escapeHtml(product.name)}</p>
                <p><strong>Category:</strong> ${escapeHtml(product.category)}</p>
                <p><strong>Price:</strong> ₦${product.price?.toLocaleString()}</p>
                <p><strong>Order ID:</strong> ${orderId}</p>
                <p><strong>Date:</strong> ${purchaseDate}</p>
            </div>
            
            <div class="order-box">
                <h3>👤 Customer Information</h3>
                <p><strong>Name:</strong> ${escapeHtml(customerData.name)}</p>
                <p><strong>Email:</strong> ${escapeHtml(customerData.email)}</p>
                <p><strong>Phone:</strong> ${customerData.phone || 'Not provided'}</p>
            </div>
            
            <div style="text-align: center;">
                <a href="${product.payment_link}" class="btn" target="_blank">
                    View Payment Details →
                </a>
            </div>
        </div>
        <div class="footer">
            <p>© 2024 Elcira - Bauchi's Premier Electronics Marketplace</p>
        </div>
    </div>
</body>
</html>
        `;

        await transporter.sendMail({
            from: '"Elcira Marketplace" <noreply@elcira.ng>',
            to: process.env.ADMIN_EMAIL || 'admin@elcira.ng',
            subject: `🛒 New Order: ${product.name} - ₦${product.price?.toLocaleString()}`,
            html: htmlContent
        });

        console.log(`📧 Email sent for order ${orderId}`);
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ====== MIDDLEWARE ======
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ====== PERSISTENT DATA FUNCTIONS ======
async function initializeData() {
    await ensureDataDir();
    
    // Load or create products
    try {
        const productsData = await fs.readFile(PRODUCTS_FILE, 'utf8');
        productsCache = JSON.parse(productsData);
        console.log(`📦 Loaded ${productsCache.length} products from disk`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // First run - create with defaults
            productsCache = DEFAULT_PRODUCTS;
            await fs.writeFile(PRODUCTS_FILE, JSON.stringify(DEFAULT_PRODUCTS, null, 2));
            console.log('📦 Created default products file');
        } else {
            console.error('Error reading products:', error);
            productsCache = DEFAULT_PRODUCTS;
        }
    }

    // Load or create agents
    try {
        const agentsData = await fs.readFile(AGENTS_FILE, 'utf8');
        agentsCache = JSON.parse(agentsData);
        console.log(`👥 Loaded ${agentsCache.length} agents from disk`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            agentsCache = DEFAULT_AGENTS;
            await fs.writeFile(AGENTS_FILE, JSON.stringify(DEFAULT_AGENTS, null, 2));
            console.log('👥 Created default agents file');
        } else {
            console.error('Error reading agents:', error);
            agentsCache = DEFAULT_AGENTS;
        }
    }

    cacheInitialized = true;
}

// Get products (from cache)
async function getProducts() {
    if (!cacheInitialized) await initializeData();
    return productsCache;
}

// Get agents (from cache)
async function getAgents() {
    if (!cacheInitialized) await initializeData();
    return agentsCache;
}

// Save products (updates cache AND disk)
async function saveProducts(products) {
    // Validate and ensure IDs are numbers
    const validatedProducts = products.map((p, index) => ({
        ...p,
        id: typeof p.id === 'number' ? p.id : index + 1,
        price: Number(p.price) || 0,
        stock: Number(p.stock) || 0
    }));

    productsCache = validatedProducts;
    
    try {
        await fs.writeFile(PRODUCTS_FILE, JSON.stringify(validatedProducts, null, 2));
        console.log('✅ Products saved to disk');
        return true;
    } catch (error) {
        console.error('❌ Failed to save products to disk:', error);
        // Data still exists in cache even if disk write fails
        return false;
    }
}

// Save agents (updates cache AND disk)
async function saveAgents(agents) {
    const validatedAgents = agents.map((a, index) => ({
        ...a,
        id: typeof a.id === 'number' ? a.id : index + 1
    }));

    agentsCache = validatedAgents;
    
    try {
        await fs.writeFile(AGENTS_FILE, JSON.stringify(validatedAgents, null, 2));
        console.log('✅ Agents saved to disk');
        return true;
    } catch (error) {
        console.error('❌ Failed to save agents to disk:', error);
        return false;
    }
}

// ====== API ROUTES ======

// Public routes
app.get('/api/products', async (req, res) => {
    try {
        const products = await getProducts();
        res.json({ success: true, products });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ success: false, error: 'Failed to load products' });
    }
});

app.get('/api/agents', async (req, res) => {
    try {
        const agents = await getAgents();
        res.json({ success: true, agents });
    } catch (error) {
        console.error('Error fetching agents:', error);
        res.status(500).json({ success: false, error: 'Failed to load agents' });
    }
});

app.post('/api/send-notification', async (req, res) => {
    const { product, customerData } = req.body;
    
    if (!product || !customerData) {
        return res.status(400).json({ success: false, error: 'Missing required data' });
    }
    
    // Don't await - send in background
    sendPurchaseNotification(product, customerData)
        .then(sent => {
            if (sent) {
                console.log('✅ Purchase notification sent');
            }
        })
        .catch(err => console.error('Background email error:', err));
    
    // Always return success to the client
    res.json({ success: true, message: 'Order received' });
});

// Admin routes
app.post('/api/admin/verify', (req, res) => {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Invalid password' });
    }
});

app.post('/api/admin/products/save', async (req, res) => {
    const { products, password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    
    if (!Array.isArray(products)) {
        return res.status(400).json({ success: false, error: 'Products must be an array' });
    }
    
    const saved = await saveProducts(products);
    
    if (saved) {
        res.json({ success: true, message: 'Products saved successfully' });
    } else {
        res.status(500).json({ success: false, error: 'Failed to save products' });
    }
});

app.post('/api/admin/agents/save', async (req, res) => {
    const { agents, password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    
    if (!Array.isArray(agents)) {
        return res.status(400).json({ success: false, error: 'Agents must be an array' });
    }
    
    const saved = await saveAgents(agents);
    
    if (saved) {
        res.json({ success: true, message: 'Agents saved successfully' });
    } else {
        res.status(500).json({ success: false, error: 'Failed to save agents' });
    }
});

// Health check endpoint (good for Render)
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        storage: DATA_DIR,
        products: productsCache.length,
        agents: agentsCache.length
    });
});

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve mobile app (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====== ERROR HANDLING ======
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// ====== START SERVER ======
async function startServer() {
    try {
        // Initialize data first
        await initializeData();
        
        // Initialize email service
        await initEmailService();
        
        // Start listening
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`
    ⚡ ELCIRA MARKETPLACE - 100% WORKING
    ==============================================
    🚀 URL:        http://localhost:${PORT}
    🔧 Admin:      http://localhost:${PORT}/admin
    🔑 Password:   ${ADMIN_PASSWORD}
    
    📦 STORAGE:
       Directory:  ${DATA_DIR}
       Products:   ${productsCache.length} items
       Agents:     ${agentsCache.length} agents
       Persistence: ${IS_RENDER ? '✅ Render (/tmp)' : '✅ Local Disk'}
    
    📧 Email:      ${transporter ? '✅ Connected' : '⚠️ Disabled'}
    
    🌍 Environment: ${IS_RENDER ? 'Render.com' : 'Local Development'}
    ==============================================
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    process.exit(0);
});

startServer();
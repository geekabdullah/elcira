require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'circuit2024';
const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const AGENTS_FILE = path.join(__dirname, 'agents.json');

// ====== GMAIL SMTP SETUP ======
let transporter = null;

async function initEmailService() {
    try {
        const gmailUser = process.env.GMAIL_USER || 'your-email@gmail.com';
        const gmailPass = process.env.GMAIL_PASSWORD || 'your-app-password';
        
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

// ====== EMAIL FUNCTION ======
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

        const orderId = 'CX-' + Date.now().toString(36).toUpperCase();

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Inter', sans-serif; background: #0a0a0f; color: #fff; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #00ff9d, #7c3aed); padding: 30px; text-align: center; border-radius: 16px; }
        .content { background: #14141f; padding: 30px; border-radius: 16px; margin-top: 20px; border: 1px solid rgba(255,255,255,0.05); }
        .order-box { background: #0a0a0f; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #00ff9d; }
        .btn { display: inline-block; background: #00ff9d; color: #0a0a0f; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚡ Circuit Express</h1>
            <p>New Order Alert!</p>
        </div>
        <div class="content">
            <h2>Hello Admin!</h2>
            <p>A customer just placed an order:</p>
            
            <div class="order-box">
                <h3>📦 Order Details</h3>
                <p><strong>Product:</strong> ${escapeHtml(product.name)}</p>
                <p><strong>Category:</strong> ${escapeHtml(product.category)}</p>
                <p><strong>Price:</strong> ₦${product.price?.toLocaleString()}</p>
                <p><strong>Order ID:</strong> ${orderId}</p>
                <p><strong>Date:</strong> ${purchaseDate}</p>
            </div>
            
            <div class="order-box">
                <h3>👤 Customer</h3>
                <p><strong>Name:</strong> ${escapeHtml(customerData.name)}</p>
                <p><strong>Email:</strong> ${escapeHtml(customerData.email)}</p>
                <p><strong>Phone:</strong> ${customerData.phone || 'Not provided'}</p>
            </div>
            
            <p style="text-align: center; margin: 30px 0;">
                <a href="${product.payment_link}" class="btn" target="_blank">
                    View Payment Details
                </a>
            </p>
        </div>
    </div>
</body>
</html>
        `;

        await transporter.sendMail({
            from: '"Circuit Express" <noreply@circuitexpress.ng>',
            to: process.env.ADMIN_EMAIL || 'admin@circuitexpress.ng',
            subject: `🛒 New Order: ${product.name}`,
            html: htmlContent
        });

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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ====== DATA FUNCTIONS ======
async function readProducts() {
    try {
        const data = await fs.readFile(PRODUCTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            const initial = [
                {
                    id: 1,
                    category: "Electronic Components",
                    name: "Arduino Uno R3",
                    price: 25000,
                    image_url: "https://images.unsplash.com/photo-1621259181231-4c5c2c4f1c4f?w=400&h=300&fit=crop",
                    payment_link: "https://paystack.com/pay/arduino",
                    description: "Official Arduino Uno R3 microcontroller board",
                    stock: 50
                },
                {
                    id: 2,
                    category: "Digital Products",
                    name: "Complete React.js Course",
                    price: 35000,
                    image_url: "https://images.unsplash.com/photo-1633356122102-3fe601e05bd2?w=400&h=300&fit=crop",
                    payment_link: "https://paystack.com/pay/react",
                    description: "Comprehensive React.js masterclass with projects",
                    stock: 100
                },
                {
                    id: 3,
                    category: "Learning Materials",
                    name: "Electronics Starter Kit",
                    price: 45000,
                    image_url: "https://images.unsplash.com/photo-1517070208544-6a4f4a4e4a4a?w=400&h=300&fit=crop",
                    payment_link: "https://paystack.com/pay/starter-kit",
                    file_url: "https://example.com/manual.pdf",
                    description: "Complete electronics starter kit with components",
                    stock: 30
                }
            ];
            await fs.writeFile(PRODUCTS_FILE, JSON.stringify(initial, null, 2));
            return initial;
        }
        return [];
    }
}

async function readAgents() {
    try {
        const data = await fs.readFile(AGENTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            const initial = [
                {
                    id: 1,
                    name: "Chidi Okonkwo",
                    role: "Senior Technical Agent",
                    location: "Lagos",
                    phone: "+234 801 234 5678",
                    email: "chidi.okonkwo@circuitexpress.ng",
                    image_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
                    bio: "Electronics expert with 8+ years experience"
                },
                {
                    id: 2,
                    name: "Aisha Mohammed",
                    role: "Digital Products Specialist",
                    location: "Abuja",
                    phone: "+234 802 345 6789",
                    email: "aisha.mohammed@circuitexpress.ng",
                    image_url: "https://images.unsplash.com/photo-1494790108777-766d2f0f2b3a?w=400&h=400&fit=crop",
                    bio: "Software engineer and digital content creator"
                },
                {
                    id: 3,
                    name: "Oluwaseun Adebayo",
                    role: "Learning Materials Coordinator",
                    location: "Ibadan",
                    phone: "+234 803 456 7890",
                    email: "oluwaseun.adebayo@circuitexpress.ng",
                    image_url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=400&fit=crop",
                    bio: "Education technology specialist"
                },
                {
                    id: 4,
                    name: "Ngozi Eze",
                    role: "Customer Support Lead",
                    location: "Port Harcourt",
                    phone: "+234 804 567 8901",
                    email: "ngozi.eze@circuitexpress.ng",
                    image_url: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
                    bio: "Dedicated to customer satisfaction"
                }
            ];
            await fs.writeFile(AGENTS_FILE, JSON.stringify(initial, null, 2));
            return initial;
        }
        return [];
    }
}

async function writeProducts(products) {
    await fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2));
    return true;
}

async function writeAgents(agents) {
    await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2));
    return true;
}

// ====== API ROUTES ======
app.get('/api/products', async (req, res) => {
    const products = await readProducts();
    res.json({ success: true, products });
});

app.get('/api/agents', async (req, res) => {
    const agents = await readAgents();
    res.json({ success: true, agents });
});

app.post('/api/send-notification', async (req, res) => {
    const { product, customerData } = req.body;
    
    if (!product || !customerData) {
        return res.status(400).json({ success: false, error: 'Missing data' });
    }
    
    sendPurchaseNotification(product, customerData);
    res.json({ success: true, message: 'Notification queued' });
});

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
        return res.status(400).json({ success: false, error: 'Invalid data' });
    }
    
    await writeProducts(products);
    res.json({ success: true });
});

app.post('/api/admin/agents/save', async (req, res) => {
    const { agents, password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    
    if (!Array.isArray(agents)) {
        return res.status(400).json({ success: false, error: 'Invalid data' });
    }
    
    await writeAgents(agents);
    res.json({ success: true });
});

app.post('/api/agents/init', async (req, res) => {
    const agents = await readAgents();
    res.json({ success: true, agents });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====== START SERVER ======
async function startServer() {
    await initEmailService();
    
    // Ensure files exist
    await readProducts();
    await readAgents();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`
    ⚡ CIRCUIT EXPRESS SERVER
    ======================================
    🚀 Store:     http://localhost:${PORT}
    🔧 Admin:     http://localhost:${PORT}/admin
    🔑 Password:  ${ADMIN_PASSWORD}
    📁 Products:  ${PRODUCTS_FILE}
    👥 Agents:    ${AGENTS_FILE}
    💰 Currency:  Nigerian Naira (₦)
    ======================================
        `);
    });
}

startServer();
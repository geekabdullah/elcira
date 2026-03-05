require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const PRODUCTS_FILE = path.join(__dirname, 'products.json');

// ====== RATE LIMITING ======
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

// ====== GMAIL SMTP SETUP ======
let transporter = null;

async function initEmailService() {
    try {
        const gmailUser = process.env.GMAIL_USER;
        const gmailPass = process.env.GMAIL_PASSWORD;
        
        if (!gmailUser || !gmailPass) {
            console.log('⚠️ Gmail credentials not found in .env');
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
        console.log('✅ Gmail SMTP connected successfully');
        return true;
    } catch (error) {
        console.error('❌ Gmail SMTP connection failed:', error.message);
        return false;
    }
}

// ====== EMAIL SENDING FUNCTION ======
async function sendPurchaseNotification(product, customerData) {
    if (!transporter) {
        console.log('⚠️ Email service not initialized');
        return false;
    }

    try {
        const purchaseDate = new Date().toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; }
        .order-box { background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .product-image { max-width: 100px; border-radius: 8px; margin: 10px 0; }
        .btn { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; margin-top: 15px; }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(102,126,234,0.4); }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #666; font-size: 14px; text-align: center; }
        .badge { background: #4CAF50; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; display: inline-block; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎉 New Order Received!</h1>
        <p>TechMart Premium E-Commerce</p>
    </div>
    
    <div class="content">
        <h2>Hello Store Admin!</h2>
        <p>A customer has just placed an order. Here are the details:</p>
        
        <div class="order-box">
            <h3 style="margin-top:0;">📦 Order Summary</h3>
            <p><strong>Order ID:</strong> <span style="font-family: monospace; background: #f0f0f0; padding: 3px 8px; border-radius: 4px;">${orderId}</span></p>
            <p><strong>Product:</strong> ${escapeHtml(product.name)}</p>
            <p><strong>Category:</strong> <span class="badge">${escapeHtml(product.category)}</span></p>
            <p><strong>Price:</strong> $${product.price.toFixed(2)}</p>
            <p><strong>Order Date:</strong> ${purchaseDate}</p>
            ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" class="product-image">` : ''}
        </div>
        
        <div class="order-box">
            <h3 style="margin-top:0;">👤 Customer Details</h3>
            <p><strong>Name:</strong> ${escapeHtml(customerData.name)}</p>
            <p><strong>Email:</strong> <a href="mailto:${customerData.email}">${escapeHtml(customerData.email)}</a></p>
            <p><strong>Phone:</strong> ${customerData.phone || 'Not provided'}</p>
            ${customerData.notes ? `<p><strong>Notes:</strong> ${escapeHtml(customerData.notes)}</p>` : ''}
        </div>
        
        <div class="order-box" style="border-left-color: #4CAF50;">
            <h3 style="margin-top:0;">💰 Payment Link</h3>
            <p>Click the button below to process payment:</p>
            <a href="${product.payment_link}" class="btn" target="_blank">💳 Process Payment</a>
            <p style="margin-top: 10px; font-size: 12px; color: #999;">Link: <a href="${product.payment_link}">${product.payment_link}</a></p>
        </div>
        
        <div class="footer">
            <p>This email was sent automatically from your TechMart store.</p>
            <p>📧 Customer will be redirected to payment page after form submission.</p>
        </div>
    </div>
</body>
</html>
        `;

        const mailOptions = {
            from: `"TechMart Store" <${process.env.GMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL,
            subject: `🛍️ New Order: ${product.name} - ${orderId}`,
            html: htmlContent,
            replyTo: customerData.email
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Order notification sent: ${orderId}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to send email:', error.message);
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
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toLocaleString()} - ${req.method} ${req.url}`);
    next();
});

// ====== DATA FUNCTIONS ======
async function readProducts() {
    try {
        const data = await fs.readFile(PRODUCTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            const initialProducts = [
                {
                    id: 1,
                    category: "Electronic Components",
                    name: "Arduino Uno R3 - Official",
                    price: 24.99,
                    image_url: "https://images.unsplash.com/photo-1621259181231-4c5c2c4f1c4f?w=400&h=300&fit=crop",
                    payment_link: "https://buy.stripe.com/test_dR6aHr9U58jR8hO6oo",
                    description: "Official Arduino Uno R3 microcontroller board. Perfect for beginners and professionals.",
                    stock: 50,
                    sku: "ARD-001",
                    featured: true,
                    created_at: new Date().toISOString()
                },
                {
                    id: 2,
                    category: "Digital Products",
                    name: "React.js Mastery E-Book",
                    price: 29.99,
                    image_url: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&h=300&fit=crop",
                    payment_link: "https://buy.stripe.com/test_8wM4jz2zF0Gm0LSbII",
                    description: "Complete guide to modern React development with hooks, context, and advanced patterns.",
                    sku: "DIG-002",
                    featured: true,
                    created_at: new Date().toISOString()
                },
                {
                    id: 3,
                    category: "Learning Materials",
                    name: "JavaScript: The Definitive Guide 2024",
                    price: 19.99,
                    image_url: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=400&h=300&fit=crop",
                    payment_link: "https://buy.stripe.com/test_00g9Dfbj94blgqkfYZ",
                    file_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                    description: "Comprehensive JavaScript reference guide covering ES6+ features.",
                    stock: 100,
                    sku: "LRN-003",
                    featured: true,
                    created_at: new Date().toISOString()
                },
                {
                    id: 4,
                    category: "Electronic Components",
                    name: "Raspberry Pi 4 Starter Kit",
                    price: 89.99,
                    image_url: "https://images.unsplash.com/photo-1591378603223-c15b45a4b7b9?w=400&h=300&fit=crop",
                    payment_link: "https://buy.stripe.com/test_3cscPx5Gd4jRcEUdQR",
                    description: "Complete starter kit with Raspberry Pi 4, case, power supply, and heat sinks.",
                    stock: 25,
                    sku: "RPI-004",
                    featured: false,
                    created_at: new Date().toISOString()
                }
            ];
            await writeProducts(initialProducts);
            return initialProducts;
        }
        console.error('Error reading products:', error);
        return [];
    }
}

async function writeProducts(products) {
    try {
        await fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing products:', error);
        return false;
    }
}

// ====== API ROUTES ======
app.get('/api/products', async (req, res) => {
    try {
        const products = await readProducts();
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load products' });
    }
});

app.get('/api/products/category/:category', async (req, res) => {
    try {
        const products = await readProducts();
        const filtered = products.filter(p => 
            p.category.toLowerCase() === req.params.category.toLowerCase()
        );
        res.json({ success: true, products: filtered });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load products' });
    }
});

app.get('/api/products/featured', async (req, res) => {
    try {
        const products = await readProducts();
        const featured = products.filter(p => p.featured);
        res.json({ success: true, products: featured });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load products' });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const products = await readProducts();
        const product = products.find(p => p.id === parseInt(req.params.id));
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load product' });
    }
});

// Purchase endpoint - collects user info and redirects to payment
app.post('/api/purchase/:id', async (req, res) => {
    try {
        const products = await readProducts();
        const product = products.find(p => p.id === parseInt(req.params.id));
        
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        const { name, email, phone, notes } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name and email are required' 
            });
        }

        // Send email notification (async - don't wait for it)
        sendPurchaseNotification(product, { name, email, phone, notes })
            .then(sent => {
                if (sent) {
                    console.log(`📧 Notification sent for order: ${product.name}`);
                }
            })
            .catch(err => console.error('Background email error:', err));

        // Return success with payment link for redirect
        res.json({
            success: true,
            message: 'Purchase initiated successfully',
            redirect_url: product.payment_link,
            product: {
                name: product.name,
                price: product.price
            }
        });

    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to process purchase' 
        });
    }
});

// Admin: Get single product
app.get('/api/admin/product/:id', async (req, res) => {
    try {
        const products = await readProducts();
        const product = products.find(p => p.id === parseInt(req.params.id));
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load product' });
    }
});

// Admin: Create product
app.post('/api/admin/products', async (req, res) => {
    try {
        const { password, product } = req.body;
        
        if (password !== ADMIN_PASSWORD) {
            return res.status(403).json({ success: false, error: 'Invalid password' });
        }

        const products = await readProducts();
        
        // Generate new ID
        const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
        
        const newProduct = {
            id: newId,
            ...product,
            created_at: new Date().toISOString(),
            sku: product.sku || `PRD-${String(newId).padStart(3, '0')}`
        };
        
        products.push(newProduct);
        await writeProducts(products);
        
        res.json({ 
            success: true, 
            message: 'Product created successfully',
            product: newProduct
        });
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ success: false, error: 'Failed to create product' });
    }
});

// Admin: Update product
app.put('/api/admin/products/:id', async (req, res) => {
    try {
        const { password, product } = req.body;
        
        if (password !== ADMIN_PASSWORD) {
            return res.status(403).json({ success: false, error: 'Invalid password' });
        }

        const products = await readProducts();
        const index = products.findIndex(p => p.id === parseInt(req.params.id));
        
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        
        products[index] = {
            ...products[index],
            ...product,
            id: parseInt(req.params.id),
            updated_at: new Date().toISOString()
        };
        
        await writeProducts(products);
        
        res.json({ 
            success: true, 
            message: 'Product updated successfully',
            product: products[index]
        });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ success: false, error: 'Failed to update product' });
    }
});

// Admin: Delete product
app.delete('/api/admin/products/:id', async (req, res) => {
    try {
        const { password } = req.body;
        
        if (password !== ADMIN_PASSWORD) {
            return res.status(403).json({ success: false, error: 'Invalid password' });
        }

        let products = await readProducts();
        const initialLength = products.length;
        
        products = products.filter(p => p.id !== parseInt(req.params.id));
        
        if (products.length === initialLength) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        
        await writeProducts(products);
        
        res.json({ 
            success: true, 
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete product' });
    }
});

// Admin: Bulk update products
app.post('/api/admin/products/bulk', async (req, res) => {
    try {
        const { password, products } = req.body;
        
        if (password !== ADMIN_PASSWORD) {
            return res.status(403).json({ success: false, error: 'Invalid password' });
        }
        
        if (!Array.isArray(products)) {
            return res.status(400).json({ success: false, error: 'Products must be an array' });
        }
        
        await writeProducts(products);
        
        res.json({ 
            success: true, 
            message: `${products.length} products saved successfully`
        });
    } catch (error) {
        console.error('Bulk update error:', error);
        res.status(500).json({ success: false, error: 'Failed to save products' });
    }
});

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        const testProduct = {
            name: "Test Product",
            category: "Test Category",
            price: 99.99,
            payment_link: "https://example.com/test-payment"
        };
        
        const testCustomer = {
            name: "Test Customer",
            email: email || process.env.ADMIN_EMAIL,
            phone: "+1 (555) 123-4567",
            notes: "This is a test notification"
        };
        
        const success = await sendPurchaseNotification(testProduct, testCustomer);
        
        res.json({ 
            success, 
            message: success ? 'Test email sent' : 'Failed to send test email'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/api/health', async (req, res) => {
    const products = await readProducts();
    res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        services: {
            email: transporter ? 'connected' : 'disconnected',
            database: products.length > 0 ? 'online' : 'empty',
            api: 'healthy'
        },
        stats: {
            products: products.length,
            uptime: process.uptime()
        }
    });
});

// ====== FRONTEND ROUTES ======
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/product/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'product-detail.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// ====== START SERVER ======
async function startServer() {
    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ████████╗███████╗ ██████╗██╗  ██╗███╗   ███╗ █████╗ ██████╗ ████████╗
║   ╚══██╔══╝██╔════╝██╔════╝██║  ██║████╗ ████║██╔══██╗██╔══██╗╚══██╔══╝
║      ██║   █████╗  ██║     ███████║██╔████╔██║███████║██████╔╝   ██║   
║      ██║   ██╔══╝  ██║     ██╔══██║██║╚██╔╝██║██╔══██║██╔══██╗   ██║   
║      ██║   ███████╗╚██████╗██║  ██║██║ ╚═╝ ██║██║  ██║██║  ██║   ██║   
║      ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   
║                                                              ║
║                    E-COMMERCE SYSTEM                         ║
║                   ENTERPRISE EDITION                         ║
╚══════════════════════════════════════════════════════════════╝
    `);
    
    const emailStatus = await initEmailService();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n📡 SERVER STATUS:`);
        console.log(`   └─ Port: ${PORT}`);
        console.log(`   └─ Email: ${emailStatus ? '✅ CONNECTED' : '❌ DISCONNECTED'}`);
        console.log(`   └─ Admin Password: ${ADMIN_PASSWORD ? '✅ SET' : '❌ USING DEFAULT'}`);
        console.log(`\n🌐 ENDPOINTS:`);
        console.log(`   ├─ Store: http://localhost:${PORT}`);
        console.log(`   ├─ Admin: http://localhost:${PORT}/admin`);
        console.log(`   ├─ API: http://localhost:${PORT}/api/products`);
        console.log(`   └─ Health: http://localhost:${PORT}/api/health`);
        console.log(`\n✨ System ready for orders!\n`);
    });
}

process.on('uncaughtException', (error) => {
    console.error('🔥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
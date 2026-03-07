require('dotenv').config();
const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Elcira@Bauchi2024';

// ====== MONGODB CONNECTION ======
const uri = process.env.DATABASE_URL;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db = null;
let productsCollection = null;
let agentsCollection = null;

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas');
    
    db = client.db('elcira');
    productsCollection = db.collection('products');
    agentsCollection = db.collection('agents');
    
    console.log('✅ Database ready - no default data');
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
  }
}

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
      auth: { user: gmailUser, pass: gmailPass }
    });
    
    await transporter.verify();
    console.log('✅ Email service connected');
    return true;
  } catch (error) {
    console.error('❌ Email service failed:', error.message);
    return false;
  }
}

// ====== MIDDLEWARE ======
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased for base64 images
app.use(express.static(path.join(__dirname, 'public')));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ====== API ROUTES ======

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await productsCollection.find({}).toArray();
    res.json({ success: true, products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, error: 'Failed to load products' });
  }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = await productsCollection.findOne({ id });
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, error: 'Failed to load product' });
  }
});

// Get all agents
app.get('/api/agents', async (req, res) => {
  try {
    const agents = await agentsCollection.find({}).toArray();
    res.json({ success: true, agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ success: false, error: 'Failed to load agents' });
  }
});

// Admin: Save products (with images array)
app.post('/api/admin/products/save', async (req, res) => {
  const { products, password } = req.body;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }
  
  if (!Array.isArray(products)) {
    return res.status(400).json({ success: false, error: 'Products must be an array' });
  }
  
  try {
    await productsCollection.deleteMany({});
    
    if (products.length > 0) {
      // Ensure each product has images array and first image as image_url
      const formattedProducts = products.map(p => ({
        ...p,
        images: Array.isArray(p.images) ? p.images : (p.image_url ? [p.image_url] : []),
        image_url: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : (p.image_url || ''),
        created_at: p.created_at || new Date().toISOString()
      }));
      
      await productsCollection.insertMany(formattedProducts);
    }
    
    res.json({ success: true, message: 'Products saved successfully' });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Save agents
app.post('/api/admin/agents/save', async (req, res) => {
  const { agents, password } = req.body;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }
  
  if (!Array.isArray(agents)) {
    return res.status(400).json({ success: false, error: 'Agents must be an array' });
  }
  
  try {
    await agentsCollection.deleteMany({});
    if (agents.length > 0) {
      await agentsCollection.insertMany(agents);
    }
    res.json({ success: true, message: 'Agents saved successfully' });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin verification
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

// Send order notification
app.post('/api/send-notification', async (req, res) => {
  const { product, customerData } = req.body;
  
  if (!product || !customerData) {
    return res.status(400).json({ success: false, error: 'Missing required data' });
  }
  
  res.json({ success: true, message: 'Order received' });
  
  if (transporter) {
    try {
      await sendPurchaseNotification(product, customerData);
    } catch (error) {
      console.error('Background email error:', error);
    }
  }
});

// Email notification function
async function sendPurchaseNotification(product, customerData) {
  if (!transporter) return;

  const purchaseDate = new Date().toLocaleString('en-NG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const orderId = 'ELC-' + Date.now().toString(36).toUpperCase();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Inter', sans-serif; background: #0a0a0f; color: #fff; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: #14141f; border-radius: 16px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #00ff9d, #7c3aed); padding: 30px; text-align: center; }
        .header h1 { margin: 0; color: #0a0a0f; }
        .content { padding: 30px; }
        .order-box { background: #0a0a0f; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #00ff9d; }
        .footer { text-align: center; padding: 20px; border-top: 1px solid rgba(255,255,255,0.1); }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚡ Elcira</h1>
          <p>New Order Received!</p>
        </div>
        <div class="content">
          <h2>Order Details</h2>
          <div class="order-box">
            <p><strong>Product:</strong> ${product.name}</p>
            <p><strong>Category:</strong> ${product.category}</p>
            <p><strong>Price:</strong> ₦${product.price?.toLocaleString()}</p>
            <p><strong>Order ID:</strong> ${orderId}</p>
            <p><strong>Date:</strong> ${purchaseDate}</p>
          </div>
          
          <h3>Customer Information</h3>
          <div class="order-box">
            <p><strong>Name:</strong> ${customerData.name}</p>
            <p><strong>Email:</strong> ${customerData.email}</p>
            <p><strong>Phone:</strong> ${customerData.phone || 'Not provided'}</p>
          </div>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Elcira - Bauchi's Premier Electronics Marketplace</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: '"Elcira" <noreply@elcira.ng>',
    to: process.env.ADMIN_EMAIL || 'admin@elcira.ng',
    subject: `🛒 New Order: ${product.name} - ₦${product.price?.toLocaleString()}`,
    html: htmlContent
  });
}

// Agents init endpoint
app.post('/api/agents/init', async (req, res) => {
  try {
    const agents = await agentsCollection.find({}).toArray();
    res.json({ success: true, agents });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const productsCount = await productsCollection.countDocuments();
    const agentsCount = await agentsCollection.countDocuments();
    
    res.json({ 
      success: true,
      status: 'healthy', 
      database: 'connected',
      timestamp: new Date().toISOString(),
      stats: {
        products: productsCount,
        agents: agentsCount
      }
    });
  } catch (error) {
    res.json({ 
      success: false,
      status: 'degraded', 
      database: 'connected but query failed',
      error: error.message
    });
  }
});

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Catch-all route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ====== START SERVER ======
async function startServer() {
  try {
    await connectToMongoDB();
    await initEmailService();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`
    ⚡ ELCIRA - MULTIPLE IMAGES SUPPORT
    ============================================
    🚀 URL:        http://localhost:${PORT}
    🔧 Admin:      http://localhost:${PORT}/admin
    💾 Database:   MongoDB Atlas
    📸 Feature:    Up to 3 images per product (file upload)
    📝 Feature:    Full product descriptions
    📧 Email:      ${transporter ? '✅' : '⚠️'}
    ============================================
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  client.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  client.close();
  process.exit(0);
});

startServer();
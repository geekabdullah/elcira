/**
 * SMTP CONFIGURATION TESTER (Node.js)
 * * 1. Ensure Node.js is installed.
 * 2. Run: npm install nodemailer
 * 3. Run: node smtp_tester.js
 */

const nodemailer = require('nodemailer');

// Your Configuration
const config = {
    service: 'gmail',
    auth: {
        user: 'abdullahisalisusmalik@gmail.com',
        pass: 'sqlg mqgu aigx lgyg' // App Password
    }
};

const adminEmail = 'asalisusmalik6959@gmail.com';

async function testConnection() {
    console.log('🔄 Initializing SMTP Transporter...');
    
    // 1. Create Transporter
    const transporter = nodemailer.createTransport(config);

    // 2. Verify Connection Configuration
    try {
        console.log('Testing connection to Gmail...');
        await transporter.verify();
        console.log('✅ Connection Successful! Credentials are valid.');
    } catch (error) {
        console.error('❌ Connection Failed:', error.message);
        return;
    }

    // 3. Send Test Email
    try {
        console.log('📧 Sending test email...');
        const info = await transporter.sendMail({
            from: `"SMTP Tester" <${config.auth.user}>`,
            to: adminEmail,
            subject: 'SMTP Configuration Test 🚀',
            text: 'If you are reading this, your SMTP configuration is working perfectly!',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
                    <h2 style="color: #4CAF50;">Success!</h2>
                    <p>Your Gmail SMTP configuration is active and working.</p>
                    <p><strong>Authenticated as:</strong> ${config.auth.user}</p>
                    <p><strong>Sent to:</strong> ${adminEmail}</p>
                </div>
            `
        });

        console.log('✅ Email sent successfully!');
        console.log('Message ID:', info.messageId);
        console.log(`Check inbox of ${adminEmail}`);
    } catch (error) {
        console.error('❌ Failed to send email:', error);
    }
}

testConnection();
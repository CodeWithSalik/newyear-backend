require('dotenv').config(); // Load environment variables
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5500', // Allow requests from your frontend URL or localhost for testing
}));

const transporter = nodemailer.createTransport({
    service: 'gmail', // Or your email service
    auth: {
        user: process.env.EMAIL_USER, // Access from environment variables
        pass: process.env.EMAIL_PASS,
    },
});

app.post('/send-email', (req, res) => {
    const { name, wish } = req.body;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.RECIPIENT_EMAIL,
        subject: `New Year Wish from ${name}`,
        text: `Name: ${name}\nWish: ${wish}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Failed to send email' }); // Send error status
        } else {
            console.log('Email sent: ' + info.response);
            res.json({ success: true, message: 'Email sent successfully' });
        }
    });
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
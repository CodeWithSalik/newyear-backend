require('dotenv').config({ path: '.env.local' });

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const serviceAccount = require('./serviceAccountKey.json');
const { getFirestore } = require("firebase-admin/firestore");


const app = express();
const port = process.env.PORT || 4400;

// ✅ Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ✅ Initialize Resend
const resend = new Resend("re_VFFL2hqN_8A3k3mE6ycrbc4jZhNaryrha");

// ✅ Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// ✅ Gmail Transport (for legacy routes)
const transporter = nodemailer.createTransport({
   host: "smtp.gmail.com",
  port: 587,
  secure: false, // use TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // App password if 2FA is enabled
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000, // 10 seconds
});

app.get("/", (req, res) => {
  res.send("Backend is running");
});

// 📮 Route 1: New Year Wish
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
        <p>Language: ${deviceInfo.language}</p>` : ''
    }
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

// 📮 Route 2: Welcome Email
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

// 📮 Route 3: Broadcast
// 📮 Route 3: Broadcast to all users (via Gmail)
app.post("/send-broadcast", async (req, res) => {
  const { subject, message, testMode } = req.body;
  console.log("📦 Received broadcast payload:", req.body);

  try {
    // 🔍 Fetch all user emails from Firestore
    const usersSnapshot = await admin.firestore().collection("users").get();
    const allEmails = usersSnapshot.docs
      .map(doc => doc.data().email)
      .filter(email => typeof email === "string" && email.includes("@"));

    // 👤 If testMode is enabled, send only to yourself
    const recipients = testMode
      ? [process.env.RECIPIENT_EMAIL]
      : allEmails;

    console.log(`📤 Sending broadcast to ${recipients.length} users...`);

    // 📬 Send individual emails using nodemailer
    const results = await Promise.allSettled(
      recipients.map(email =>
        transporter.sendMail({
          from: `"Fragments of Me" <${process.env.EMAIL_USER}>`,
          to: email, //email
          subject,
          html: `
            <div style="font-family: Georgia, serif; color: #3c2f2f; line-height: 1.6;">
              <p>${message}</p>
              <br/>
              <p style="color:#999;">— Fragments of Me</p>
            </div>
          `,
        })
      )
    );

    const failed = results.filter(r => r.status === "rejected").length;
    const success = results.length - failed;

    console.log(`✅ Broadcast completed: ${success} sent, ${failed} failed.`);
    res.status(200).json({ success: true, sent: success, failed });
  } catch (error) {
    console.error("❌ Broadcast error:", error);
    res.status(500).json({ success: false, message: "Failed to send broadcast emails." });
  }
});

// 📮 Route 4: Reply to Comment (with Resend email)
app.post("/reply-to-comment", async (req, res) => {
  try {
    const { entryId, commentId, replyContent, replierName, authorId } = req.body;

    if (!entryId || !commentId || !replyContent || !replierName || !authorId) {
      console.warn("❌ Missing required fields:", req.body);
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    const commentRef = admin
      .firestore()
      .collection("entries")
      .doc(entryId)
      .collection("comments")
      .doc(commentId);

    const commentSnap = await commentRef.get();
    const commentData = commentSnap.data();

    if (!commentData) {
      return res.status(404).json({ success: false, message: "Comment not found." });
    }

    const replyPayload = {
      content: replyContent.trim(),
      authorId,
      authorName: replierName,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    await commentRef.collection("replies").add(replyPayload);
    console.log("✅ Reply added to Firestore");

    // Don't send email to self or missing email
    if (commentData.authorId === authorId || !commentData.authorEmail) {
      console.log("📭 No email sent (self-reply or missing email)");
      return res.json({ success: true, message: "Reply added (no email sent)." });
    }

    try {
      const emailRes = await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: commentData.authorEmail,
        subject: `💬 New reply from ${replierName}`,
        html: `
          <p><strong>${replierName}</strong> replied to your comment:</p>
          <blockquote>${replyContent}</blockquote>
          <p><a href="https://fragments-of-me.vercel.app/entry/${entryId}">View conversation</a></p>
        `,
      });
      console.log("✅ Email sent:", emailRes.response);
    } catch (emailErr) {
      console.error("❌ Email send failed:", emailErr);
    }

    return res.json({ success: true, message: "Reply saved and email sent." });
  } catch (error) {
    console.error("❌ Error in /reply-to-comment:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post("/send-newsletter", async (req, res) => {
  const { subject, message, testMode } = req.body;
  console.log("🗞️ Received newsletter request:", req.body);

  try {
    const db = admin.firestore();
    const usersSnap = await db.collection("users").get();
    const allEmails = usersSnap.docs
      .map(doc => doc.data().email)
      .filter(email => typeof email === "string" && email.includes("@"));

    if (!allEmails.length) {
      return res.status(400).json({ success: false, error: "No valid emails found." });
    }

    // Test mode: send only to yourself
    const recipients = testMode ? [process.env.RECIPIENT_EMAIL] : allEmails;
    console.log(`📤 Sending newsletter to ${recipients.length} users...`);

    let sentCount = 0;
    let failedEmails = [];

    // Send sequentially
    for (const email of recipients) {
      try {
        await transporter.sendMail({
          from: `"Fragments of Me" <${process.env.EMAIL_USER}>`,
          to: email,
          subject,
          html: `
            <div style="font-family: Georgia, serif; color: #3c2f2f; line-height: 1.6;">
              ${message}
              <br/><br/>
              <p style="font-size:13px; color:#8a4a1f;">— Fragments of Me - @CodeWithSalik</p>
            </div>
          `,
        });
        sentCount++;
        console.log(`✅ Email sent to ${email}`);
      } catch (err) {
        console.error(`❌ Failed to send to ${email}:`, err.message);
        failedEmails.push({ email, error: err.message });
      }
    }

    console.log(`✅ Sent: ${sentCount}, ❌ Failed: ${failedEmails.length}`);
    res.json({ success: true, sent: sentCount, failed: failedEmails.length, errors: failedEmails });

  } catch (err) {
    console.error("❌ Newsletter error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});



// ✅ Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

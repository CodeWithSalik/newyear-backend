require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const serviceAccount = require('./serviceAccountKey.json');

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
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 📮 Route 1: New Year Wish (still using Gmail)
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

// 📮 Route 2: Welcome Email (still using Gmail)
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

// 📮 Route 3: Broadcast to all users (via Resend)
app.post("/send-broadcast", async (req, res) => {
  const { subject, message, testMode } = req.body;

  try {
    const usersSnapshot = await admin.firestore().collection("users").get();
    const allEmails = usersSnapshot.docs
      .map(doc => doc.data().email)
      .filter(email => typeof email === "string" && email.includes("@"));

    const recipients = allEmails;                   // Production: All users

    await Promise.all(
      recipients.map(email =>
        resend.emails.send({
          from: 'Fragments of Me <onboarding@resend.dev>',
          to: email,
          subject,
          html: `<p>${message}</p>`,
        })
      )
    );

    console.log(`✅ Broadcast emails sent to ${recipients.length} recipient(s).`);

    res.status(200).json({ success: true, recipients: recipients.length });
  } catch (error) {
    console.error("❌ Broadcast error:", error);
    res.status(500).json({ error: "Failed to send email notifications." });
  }
});
app.post("/reply-to-comment", async (req, res) => {
  const { entryId, commentId, replyContent, authorId, replierName } = req.body;

  const commentRef = admin.firestore()
    .collection("entries")
    .doc(entryId)
    .collection("comments")
    .doc(commentId);

  const commentSnap = await commentRef.get();
  const commentData = commentSnap.data();

  if (!commentData || !commentData.authorEmail) {
    return res.status(400).json({ success: false, message: "Original comment author not found." });
  }

  // ✅ Add reply to Firestore
  await commentRef.collection("replies").add({
    content: replyContent,
    authorId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  // ✅ Send Email Notification
  await resend.emails.send({
    from: 'Fragments of Me <onboarding@resend.dev>',
    to: commentData.authorEmail,
    subject: `💬 New reply on your comment`,
    html: `
      <p>Hi there,</p>
      <p><strong>${replierName}</strong> replied to your comment:</p>
      <blockquote>${replyContent}</blockquote>
      <p><a href="https://fragmants-of-me.vercel.app/entry/${entryId}">View the discussion</a></p>
      <br/>
      <p>— Fragmants of Me</p>
    `
  });

  res.json({ success: true, message: "Reply posted and email sent." });
});


// ✅ Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

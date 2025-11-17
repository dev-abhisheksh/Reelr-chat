import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import connectDB from "./utils/db.js";
import Conversation from "./models/conversation.model.js";
import Message from "./models/message.model.js";
import verifyJWT from "./middleware/socketAuth.js";

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://reelr.onrender.com",
    methods: ["GET", "POST"],
    credentials: true
  },
});

// 🟢 Track online users (userId -> socketId)
const onlineUsers = new Map();

// 🔐 Authenticate sockets
io.use(verifyJWT);

io.on("connection", (socket) => {
  const userId = socket.user._id.toString();
  console.log(`✅ User connected: ${userId} | Socket: ${socket.id}`);

  // Add user to online map
  onlineUsers.set(userId, socket.id);

  // Join personal room
  socket.join(userId);

  // Broadcast online status to all users
  io.emit("user-online", { userId });

  // 📨 Send message - FIXED EVENT NAME to match frontend
  socket.on("send-message", async ({ to, message }) => {
    try {
      if (!to || !message) {
        console.log("❌ Missing recipient or message");
        return;
      }

      const recipientId = to;
      const text = message;

      console.log(`📤 Message from ${userId} to ${recipientId}: ${text}`);

      // Find or create conversation
      let conversation = await Conversation.findOne({
        participants: { $all: [userId, recipientId] },
      });

      if (!conversation) {
        conversation = await Conversation.create({
          participants: [userId, recipientId],
        });
        console.log(`✨ New conversation created: ${conversation._id}`);
      }

      // Create message
      const newMessage = await Message.create({
        conversationId: conversation._id,
        sender: userId,
        text,
      });

      conversation.lastMessage = newMessage._id;
      await conversation.save();

      console.log(`💾 Message saved: ${newMessage._id}`);

      // Emit to sender (confirmation)
      socket.emit("message-sent", {
        messageId: newMessage._id,
        conversationId: conversation._id,
        timestamp: newMessage.createdAt
      });

      // Find recipient's socket and emit - FIXED EVENT NAME
      const recipientSocketId = onlineUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("receive-message", {
          from: userId,
          message: text,
          messageId: newMessage._id,
          conversationId: conversation._id,
          timestamp: newMessage.createdAt
        });
        console.log(`✅ Message delivered to ${recipientId}`);
      } else {
        console.log(`⚠️ Recipient ${recipientId} is offline`);
        // Could implement push notification here
      }

    } catch (err) {
      console.error("❌ Message send error:", err);
      socket.emit("message-error", {
        error: "Failed to send message",
        details: err.message
      });
    }
  });

  // 📜 Load conversation history
  socket.on("load-messages", async ({ conversationId, recipientId }) => {
    try {
      let conversation;

      if (conversationId) {
        conversation = await Conversation.findById(conversationId);
      } else if (recipientId) {
        conversation = await Conversation.findOne({
          participants: { $all: [userId, recipientId] },
        });
      }

      if (!conversation) {
        socket.emit("messages-loaded", { messages: [] });
        return;
      }

      const messages = await Message.find({
        conversationId: conversation._id,
      })
        .sort({ createdAt: 1 })
        .limit(100)
        .lean();

      socket.emit("messages-loaded", {
        messages,
        conversationId: conversation._id
      });

      console.log(`📜 Loaded ${messages.length} messages for user ${userId}`);
    } catch (err) {
      console.error("❌ Load messages error:", err);
      socket.emit("messages-error", { error: "Failed to load messages" });
    }
  });

  // 📋 Get all conversations for user
  socket.on("get-conversations", async () => {
    try {
      const conversations = await Conversation.find({
        participants: userId,
      })
        .populate("participants", "username profileImage")
        .populate("lastMessage")
        .sort({ updatedAt: -1 })
        .lean();

      socket.emit("conversations-loaded", { conversations });
      console.log(`📋 Loaded ${conversations.length} conversations for user ${userId}`);
    } catch (err) {
      console.error("❌ Get conversations error:", err);
    }
  });

  // ✏️ Typing indicator
  socket.on("typing", ({ recipientId }) => {
    const recipientSocketId = onlineUsers.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("user-typing", { userId });
    }
  });

  socket.on("stop-typing", ({ recipientId }) => {
    const recipientSocketId = onlineUsers.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("user-stop-typing", { userId });
    }
  });

  // 🧹 Handle disconnection
  socket.on("disconnect", () => {
    console.log(`❌ User ${userId} disconnected`);
    onlineUsers.delete(userId);

    // Broadcast offline status
    io.emit("user-offline", { userId });
  });

  // 🔍 Get online status of users
  socket.on("check-online-status", ({ userIds }) => {
    const onlineStatuses = {};
    userIds.forEach(id => {
      onlineStatuses[id] = onlineUsers.has(id);
    });
    socket.emit("online-statuses", onlineStatuses);
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    onlineUsers: onlineUsers.size,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`💬 Chat service running on Port: ${PORT}`);
  console.log(`🌐 CORS enabled for: http://localhost:5173`);
});
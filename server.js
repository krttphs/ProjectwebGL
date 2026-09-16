const express = require("express");
const env = require("dotenv");
const path = require("path");
const cookieParser = require("cookie-parser");

env.config();

// const questRoutes = require("./routes/quests"); 
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const friendsRoutes = require("./routes/friends");
const chatRoutes = require("./routes/chat");
const lobbyRoutes = require("./routes/lobby");
const gameRoutes = require("./routes/game")
const profileRoutes = require("./routes/profile");


const { requireAuth, hasAuth } = require("./middleware/authMiddleware")

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware 
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Routes 
// app.use("/api", questRoutes); 
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/lobby", lobbyRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/profile", profileRoutes);
// Frontend Route 
// Frontend Route 
app.get("/", (req, res) => {
  res.sendFile("landing.html", {
    root: path.join(__dirname, "views")
  });
});

app.get("/landing", (req, res) => {
  res.sendFile("landing.html", {
    root: path.join(__dirname, "views")
  });
});

app.get("/login", hasAuth, (req, res) => {
  res.sendFile("login.html", {
    root: path.join(__dirname, "views")
  });
});

app.get("/mainmenu", requireAuth, (req, res) => {
  res.sendFile("mainMenu.html", {
    root: path.join(__dirname, "views")
    });
});

app.get("/profile", requireAuth, (req, res) => {
    res.sendFile("profile.html", {
        root: path.join(__dirname, "views")
    });
});

app.get("/lobby", requireAuth, (req, res) => {
  res.sendFile("lobby.html", {
    root: path.join(__dirname, "views")
  });
});

app.get("/gamemode1", requireAuth, (req, res) => {
  res.sendFile("gameMode1.html", {
    root: path.join(__dirname, "views")
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
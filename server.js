const express = require("express");
const env = require("dotenv");
const path = require("path");
const cookieParser = require("cookie-parser");

env.config();

const questRoutes = require("./routes/quests");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const friendsRoutes = require("./routes/friends");
const chatRoutes = require("./routes/chat");
const lobbyRoutes = require("./routes/lobby");
const gameRoutes = require("./routes/game")

const { requireAuth , hasAuth} = require("./middleware/authMiddleware")

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));



// Routes
app.use("/api", questRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/friends",friendsRoutes);
app.use("/api/chat",chatRoutes);
app.use("/api/lobby",lobbyRoutes);
app.use("/api/game",gameRoutes);

// Frontend Route
app.get("/", (req, res) => {
  const token = req.cookies.token;
  if (token) {
    res.sendFile("index.html", {root: path.join(__dirname, "loggingIn")}); 
  } else {
    res.sendFile("login.html", {root: path.join(__dirname, "views")});
  }
});

app.get("/login",hasAuth,(req,res)=>{
  res.sendFile("login.html", {root: path.join(__dirname,"views")});
})

app.get("/index",requireAuth,(req,res)=>{
  res.render("index", {
  userId: req.user.id,
});
})

app.get("/gamemode1",requireAuth,(req,res)=>{
  res.sendFile("gameMode1.html", {root: path.join(__dirname,"loggingIn")})
})

app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
  console.log("Successfully!")
});